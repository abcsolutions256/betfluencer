import { test, expect } from '@playwright/test'
import { signUpTipster, postManualSlip, loginUser } from './fixtures'
import { admin } from './helpers'

// Feature 6 — Admin hide. The admin (seeded with role='admin' in
// global-setup) logs in, hides a slip; it disappears from the public feed
// but stays on the tipster's own dashboard (tagged "Hidden by admin").
test.describe('admin hide', () => {
  test('hiding a slip removes it from the public feed but keeps it on the tipster dashboard', async ({ page, browser, request }) => {
    // ── A tipster posts a verified slip ──
    const tipster = await signUpTipster(page)
    const odds = '9.15'
    await postManualSlip(page, { price: 1200, odds, legCount: '4' })

    // Resolve its id from the feed. Cache-bust the URL — Playwright's
    // APIRequestContext caches GET responses, which would return a stale feed.
    const feed1 = await request.get(`/api/slips?_=${Date.now()}-${Math.random()}`)
    const rows1: any[] = (await feed1.json()).slips ?? []
    const target = rows1.find((r) => Number(r.slip?.total_odds) === Number(odds))
    expect(target, 'slip should be in the feed before hiding').toBeTruthy()
    const slipId: string = target.slip.id

    // ── Admin logs in (separate context) and hides the slip ──
    const adminCtx = await browser.newContext()
    const ap = await adminCtx.newPage()
    await loginUser(ap, process.env.E2E_ADMIN_EMAIL!, process.env.E2E_ADMIN_PASSWORD!)

    // Confirm the admin panel recognises the session (role gate).
    const meRes = await ap.request.get('/api/admin/me')
    expect(meRes.ok(), 'admin/me should accept the seeded admin').toBeTruthy()

    // Hide it via the admin API (uses the admin session cookies).
    const hideRes = await ap.request.post('/api/admin/slips', {
      data: { betslip_id: slipId, hidden: true },
    })
    expect(hideRes.ok(), await hideRes.text()).toBeTruthy()

    // Verify the DB flag.
    {
      const { data } = await admin().from('betslips').select('hidden').eq('id', slipId).single()
      expect(data?.hidden).toBe(true)
    }

    // ── Public feed no longer contains it ──
    const feed2 = await ap.request.get(`/api/slips?_=${Date.now()}-${Math.random()}`)
    const rows2: any[] = (await feed2.json()).slips ?? []
    expect(rows2.find((r) => r.slip?.id === slipId), 'hidden slip must be gone from the feed').toBeFalsy()

    // ── But the tipster still sees it on their dashboard, tagged Hidden ──
    await page.goto('/tipster/dashboard')
    await expect(page.getByText('Tipster dashboard')).toBeVisible()
    await page.getByRole('button', { name: 'My Slips' }).click()
    await expect(page.getByText('Hidden by admin').first()).toBeVisible({ timeout: 30_000 })
    // The slip card (its odds) is still on the dashboard.
    await expect(page.getByText(`×${odds}`).first()).toBeVisible()

    await adminCtx.close()
  })
})
