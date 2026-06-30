import { test, expect } from '@playwright/test'
import { signUpTipster } from './fixtures'
import { admin } from './helpers'

// Feature 4 — Booking-code slip posting + paywall (no worker in the loop).
//
// A booking-code slip is posted 'pending'. Verification against the bookie is
// done by the bet-code worker (a separate service, not run in CI), so in the
// test env the slip simply stays 'pending'. What the APP must guarantee here:
//   • the slip is created with verification_status 'pending';
//   • the booking code/site are stored in betslip_secrets (service-role only);
//   • the public feed NEVER leaks the booking code (proof-only paywall).
test.describe('booking-code slip + paywall', () => {
  test('coded slip posts pending, secret stored, code never leaks to the feed', async ({ page }) => {
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
    expect(posted.slips[0].verification_status).toBe('pending')

    const db = admin()

    // DB: the slip is genuinely 'pending'…
    {
      const { data } = await db
        .from('betslips')
        .select('verification_status, result')
        .eq('id', betslipId)
        .single()
      expect(data?.verification_status).toBe('pending')
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
