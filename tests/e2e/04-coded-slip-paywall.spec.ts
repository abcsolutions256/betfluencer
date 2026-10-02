import { test, expect } from '@playwright/test'
import { signUpTipster } from './fixtures'
import { admin } from './helpers'

// Feature 4 — Booking-code slip posting + proof-only feed.
//
// In the open-beta free model (payments_enabled=false, migration 0014) a
// booking-code slip is shared as-is and shown immediately, so it posts
// 'verified' and the bet-code worker is not in the loop. What the APP must
// guarantee here:
//   • the slip is created with verification_status 'verified' (free mode) and
//     result 'pending' (games not settled yet);
//   • the booking code/site are stored in betslip_secrets (service-role only);
//   • the LIST feed NEVER carries the booking code (proof-only) — codes are
//     served only by the per-slip reveal endpoint (public while payments are
//     paused, see spec 05), never dumped into the marketplace list payload.
// When payments are turned back on for a market, this re-gates automatically:
// the slip posts 'pending' and the worker verifies it (the paid-product gate).
test.describe('booking-code slip + proof-only feed', () => {
  test('coded slip posts verified (free mode), secret stored, code never leaks to the feed', async ({ page }) => {
    await signUpTipster(page)

    const code = 'E2ECODE1'
    const site = '1xBet'

    // Post through the authenticated session so getMyTipster() resolves the
    // poster (the Supabase auth cookies ride along on page.request).
    const postRes = await page.request.post('/api/tips', {
      data: {
        slips: [
          { booking_code: code, betting_site: site, total_odds: '4.20', leg_count: '2', slip_price: 2000, note: 'e2e coded' },
        ],
      },
    })
    expect(postRes.ok(), await postRes.text()).toBeTruthy()
    const posted = await postRes.json()
    const betslipId: string = posted.slips?.[0]?.id
    expect(betslipId, 'tips POST should return the new betslip id').toBeTruthy()
    expect(posted.slips[0].verification_status).toBe('verified')

    const db = admin()

    // DB: the slip is 'verified' (free mode, shown as-is) with result still
    // 'pending' (its games have not been settled)…
    {
      const { data } = await db
        .from('betslips')
        .select('verification_status, result')
        .eq('id', betslipId)
        .single()
      expect(data?.verification_status).toBe('verified')
      expect(data?.result).toBe('pending')
    }

    // …and the booking code/site live in betslip_secrets (never on betslips).
    {
      const { data } = await db
        .from('betslip_secrets')
        .select('booking_code, betting_site')
        .eq('betslip_id', betslipId)
        .single()
      expect(data?.booking_code).toBe(code)
      expect(data?.betting_site).toBe(site)
    }

    // The public feed must NOT contain the booking code anywhere in its
    // payload — pending coded slips are the paid product.
    const feed = await page.request.get('/api/slips')
    expect(feed.ok()).toBeTruthy()
    const body = await feed.text()
    expect(body).not.toContain(code)
  })
})
