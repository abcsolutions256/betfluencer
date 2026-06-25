import { test, expect } from '@playwright/test'
import { signUpTipster, postManualSlip } from './fixtures'

// Feature 3 — Post a manual slip → it is auto-`verified`, shows on the
// tipster dashboard, AND appears in the public home feed showing PROOF only
// (no booking code / picks leaked through the feed payload).
test.describe('manual slip', () => {
  test('manual slip is auto-verified, on the dashboard, and proof-only in the feed', async ({ page, request }) => {
    await signUpTipster(page)

    // Use an odds value with no trailing zero — the API stores it as a numeric
    // (parseFloat), so '6.50' would render as '×6.5' and miss a literal match.
    const odds = '6.55'
    await postManualSlip(page, { price: 1500, odds, legCount: '3' })

    // Dashboard "My slips": the new slip is listed with its odds.
    await expect(page.getByText(`×${odds}`).first()).toBeVisible({ timeout: 30_000 })

    // ── Public feed (API): the slip is present, VERIFIED, and PROOF-ONLY ──
    const res = await request.get('/api/slips')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    const rows: any[] = body.slips ?? []

    const mine = rows.find((r) => Number(r.slip?.total_odds) === Number(odds))
    expect(mine, 'posted slip should appear in the public feed').toBeTruthy()
    expect(mine.slip.verification_status).toBe('verified')

    // PROOF-ONLY guarantee: the feed row must NOT carry the secret content.
    // (Booking code / picks are served only post-purchase via /reveal.)
    expect(mine.slip.booking_code).toBeUndefined()
    expect(mine.slip.betting_site).toBeUndefined()
    expect(mine.slip.legs).toBeUndefined()
    expect(JSON.stringify(mine)).not.toContain('booking_code')

    // ── Public feed (UI): the card renders the "✓ Verified" proof badge ──
    await page.goto('/')
    await expect(page.getByText('Verified slips')).toBeVisible()
    await expect(page.getByText('✓ Verified').first()).toBeVisible({ timeout: 30_000 })
  })
})
