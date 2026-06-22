// ── Scraper ───────────────────────────────────────────────────────
// Loads a booking code on a bookie via headless Chrome and extracts the
// selected matches. Reuses a single browser across requests; the server
// limits concurrency. Always returns the section's raw text as a
// fallback even when structured row parsing finds nothing.

import puppeteer from 'puppeteer-core'
import fs from 'node:fs/promises'
import path from 'node:path'
import { getAdapter } from './adapters.js'

const EXECUTABLE  = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium'
const NAV_TIMEOUT = Number(process.env.NAV_TIMEOUT_MS || 45000)
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// Where debug screenshots are written (served by the API at /shots).
export const SHOT_DIR = process.env.SCREENSHOT_DIR || path.join(process.cwd(), 'screenshots')
const SHOT_TTL_MS = Number(process.env.SCREENSHOT_TTL_HOURS || 48) * 3600 * 1000

let browserPromise = null

async function getBrowser() {
  if (browserPromise) {
    try {
      const b = await browserPromise
      if (b.connected) return b
    } catch { /* fall through and relaunch */ }
  }
  browserPromise = puppeteer.launch({
    executablePath: EXECUTABLE,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--disable-extensions',
    ],
  })
  return browserPromise
}

// Public: scrape one code. Throws on unsupported site / missing code;
// otherwise resolves to { site, code, matches, raw_text, count }.
export async function scrapeCode({ site, code }) {
  const adapter = getAdapter(site)
  if (!adapter) throw new Error(`Unsupported betting site: ${site}`)
  if (!code) throw new Error('Missing booking code')

  const browser = await getBrowser()
  // Fresh, isolated context per scrape. Bookies persist the betslip in
  // localStorage; a reused profile would carry the previous code's
  // selections into the next request — hiding the empty-state booking-code
  // input (it only renders when the slip is empty) and failing every
  // subsequent scrape. An incognito context has its own storage, so each
  // code starts from a clean slate.
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  try {
    await page.setUserAgent(UA)
    await page.setViewport({ width: 1280, height: 900 })

    // Block heavy resources — we only need the DOM text, not pixels.
    // await page.setRequestInterception(true)
    // page.on('request', (r) => {
    //   const t = r.resourceType()
    //   if (t === 'image' || t === 'media' || t === 'font') r.abort()
    //   else r.continue()
    // })

    // Load the code: direct URL when the bookie supports it, else
    // type-and-submit into the booking-code field.
    if (adapter.codeUrl) {
      await page.goto(adapter.codeUrl(code), { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT })
    } else {
      await page.goto(adapter.url, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT })
      // Some bookies hide the booking-code field behind a toggle that must be
      // clicked first (e.g. 1xBet/22Bet "Save/load events" reveals the
      // coupon-code input). Click it before waiting for the input.
      if (adapter.expandSelector) {
        await page.waitForSelector(adapter.expandSelector, { timeout: NAV_TIMEOUT }).catch(() => {})
        const toggle = await page.$(adapter.expandSelector)
        if (toggle) { await toggle.click().catch(() => {}); await new Promise(r => setTimeout(r, 700)) }
      }
      // Selector strings may be comma-separated lists — valid CSS that
      // querySelector / waitForSelector accept (first match wins).
      await page.waitForSelector(adapter.inputSelector, { timeout: NAV_TIMEOUT })
      const input = await page.$(adapter.inputSelector)
      await input.type(code, { delay: 40 })
      if (adapter.submitSelector) {
        const btn = await page.$(adapter.submitSelector)
        if (btn) await btn.click()
        else await page.keyboard.press('Enter')
      } else {
        await page.keyboard.press('Enter')
      }
      // Some bookies navigate/reload when applying the code (1xBet/22Bet Load
      // reloads to render the coupon). Absorb that navigation so the later
      // page.evaluate doesn't throw "Execution context was destroyed".
      if (adapter.navigatesOnSubmit) {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: NAV_TIMEOUT }).catch(() => {})
      }
    }

    // Wait for the results section to render (don't hard-fail if missing —
    // we still return whatever text is on the page for manual review).
    if (adapter.waitFor) await page.waitForSelector(adapter.waitFor, { timeout: NAV_TIMEOUT }).catch(() => {})

    const data = await page.evaluate((a) => {
      // Skip empty selector parts — querySelector('') throws a SyntaxError
      // and would drop the whole row mapping (e.g. empty league/kickoff).
      const firstEl = (sel) => sel.split(',').map(s => s.trim()).filter(Boolean).map(s => document.querySelector(s)).find(Boolean) || null
      const cellText = (root, sel) => {
        for (const s of sel.split(',')) {
          const t = s.trim()
          if (!t) continue
          const el = root.querySelector(t)
          if (el && el.innerText.trim()) return el.innerText.trim()
        }
        return ''
      }
      const container = firstEl(a.resultSelector)
      const rawText = (container ? container.innerText : document.body.innerText).trim().slice(0, 8000)

      const rows = Array.from(document.querySelectorAll(a.rowSelector))
      const matches = rows.map(r => ({
        teams:   cellText(r, a.fields.teams),
        league:  cellText(r, a.fields.league),
        market:  cellText(r, a.fields.market),
        pick:    cellText(r, a.fields.pick),
        kickoff: cellText(r, a.fields.kickoff),
      })).filter(m => m.teams || m.pick)

      return { rawText, matches }
    }, adapter)

    // Screenshot what the scraper sees just before the page closes.
    const shot = await capture(page, site, code)
    return {
      site:     adapter.name,
      code,
      found:    data.matches.length > 0,   // did entering the code return selections?
      matches:  data.matches,
      raw_text: data.rawText,
      count:    data.matches.length,
      screenshot: shot,
    }
  } catch (err) {
    // On failure, still capture the page — this is the most useful shot
    // for debugging (shows the anti-bot wall, wrong selector, empty slip…).
    err.screenshot = await capture(page, site, code)
    throw err
  } finally {
    await page.close().catch(() => {})
    await context.close().catch(() => {})
  }
}

// Full-page screenshot into SHOT_DIR. Returns the filename (served at
// /shots/<file>) or null. Never throws — a screenshot failure must not
// break the scrape result.
async function capture(page, site, code) {
  try {
    await fs.mkdir(SHOT_DIR, { recursive: true })
    pruneOldShots()
    const safe = `${site}-${code}`.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 60)
    const file = `${safe}-${Date.now()}.png`
    await page.screenshot({ path: path.join(SHOT_DIR, file), fullPage: true })
    return file
  } catch (e) {
    console.error('[screenshot] failed:', e?.message)
    return null
  }
}

// Delete screenshots older than the TTL so the disk doesn't fill up.
async function pruneOldShots() {
  try {
    const now = Date.now()
    const files = await fs.readdir(SHOT_DIR)
    await Promise.all(files.filter(f => f.endsWith('.png')).map(async (f) => {
      const p = path.join(SHOT_DIR, f)
      const st = await fs.stat(p).catch(() => null)
      if (st && now - st.mtimeMs > SHOT_TTL_MS) await fs.unlink(p).catch(() => {})
    }))
  } catch { /* ignore */ }
}

export async function shutdown() {
  if (browserPromise) {
    try { (await browserPromise).close() } catch { /* ignore */ }
    browserPromise = null
  }
}
