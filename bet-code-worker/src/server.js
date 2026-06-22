// ── Bet-code worker API ───────────────────────────────────────────
// POST /verify { betting_site, booking_code } → scrape the loaded slip
//   → { ok, site, code, matches:[{teams,league,market,pick,kickoff}], raw_text, count }
// GET  /health → { ok }
//
// Auth: send `x-worker-key: <WORKER_API_KEY>`. Keep this service private
// (internal network / firewall) — it drives a real browser and should
// never be exposed publicly without the key.

import express from 'express'
import { scrapeCode, shutdown, SHOT_DIR } from './scraper.js'
import { getAdapter, supportedSites } from './adapters.js'

const app     = express()
const API_KEY = process.env.WORKER_API_KEY || ''
const PORT    = Number(process.env.PORT || 8080)
const MAX     = Number(process.env.MAX_CONCURRENT || 2)

app.use(express.json({ limit: '128kb' }))

// Serve debug screenshots the scraper saves before closing each page.
app.use('/shots', express.static(SHOT_DIR))

// Absolute URL for a saved screenshot file (null when none).
function shotUrl(req, file) {
  if (!file) return null
  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`
  return `${base.replace(/\/$/, '')}/shots/${file}`
}

// ── tiny concurrency gate (Chrome is heavy) ──────────────────────
let active = 0
const waiters = []
const acquire = () => new Promise((resolve) => {
  const tryRun = () => { if (active < MAX) { active++; resolve() } else waiters.push(tryRun) }
  tryRun()
})
const release = () => { active = Math.max(0, active - 1); const next = waiters.shift(); if (next) next() }

function authed(req, res) {
  if (API_KEY && req.get('x-worker-key') !== API_KEY) {
    res.status(401).json({ ok: false, error: 'unauthorized' })
    return false
  }
  return true
}

app.get('/health', (_req, res) => res.json({ ok: true, active, sites: supportedSites() }))

app.post('/verify', async (req, res) => {
  if (!authed(req, res)) return

  const { betting_site, booking_code } = req.body || {}
  if (!betting_site || !booking_code) {
    return res.status(400).json({ ok: false, error: 'betting_site and booking_code are required' })
  }
  if (!getAdapter(betting_site)) {
    return res.status(400).json({ ok: false, error: `Unsupported site "${betting_site}". Supported: ${supportedSites().join(', ')}` })
  }

  await acquire()
  try {
    // Preserve the code's case — some bookies (e.g. Betika "KkxPBu") use
    // case-sensitive codes; lowercasing them would 404 the share URL. Only
    // the site key is normalised (getAdapter lowercases it again anyway).
    const result = await scrapeCode({ site: betting_site.toLowerCase(), code: String(booking_code).trim() })
    res.json({ ok: true, ...result, screenshot_url: shotUrl(req, result.screenshot) })
  } catch (e) {
    // Return 200 with ok:false so the caller can persist a 'failed' record.
    res.json({ ok: false, betting_site, booking_code, error: e?.message || 'scrape failed', matches: [], raw_text: '', count: 0, screenshot_url: shotUrl(req, e?.screenshot) })
  } finally {
    release()
  }
})

const server = app.listen(PORT, () => console.log(`bet-code-worker listening on :${PORT} (max ${MAX} concurrent)`))

// Graceful shutdown so Chrome doesn't leak on container stop.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    server.close()
    await shutdown()
    process.exit(0)
  })
}
