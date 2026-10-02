import { test, expect } from '@playwright/test'
import { signUpTipster } from './fixtures'

// Feature 5 — Open beta: pending picks are FREE & PUBLIC (payments paused).
//
// With payments_enabled=false (migration 0014, the open-beta default), the
// reveal endpoint returns pending content — INCLUDING the booking code — to
// ANY visitor with no purchase and no session. This is the inverse of the old
// paywall behaviour: what used to require a purchase (and 403 a stranger) is
// now open to everyone while payments are paused.
//
// The list feed still never carries the secret — that proof-only invariant is
// unchanged and is covered by spec 04. When payments are turned back on for a
// market (`payments_enabled=true`), the reveal re-gates automatically via the
// unchanged `!freeMode` branch in the route.
test.describe('free public access (open beta)', () => {
  test('any anonymous visitor reveals a pending slip’s code with no purchase', async ({ page, request }) => {
    // A tipster posts a coded slip (verified in free mode; secret stored in
    // betslip_secrets — the reveal below serves it to anyone).
    await signUpTipster(page)
    const code = 'E2EOPEN1'
    const postRes = await page.request.post('/api/tips', {
      data: {
        slips: [
          { booking_code: code, betting_site: '1xBet', total_odds: '5.10', leg_count: '2', slip_price: 1500, note: 'e2e open beta' },
        ],
      },
    })
    expect(postRes.ok(), await postRes.text()).toBeTruthy()
    const betslipId: string = (await postRes.json()).slips?.[0]?.id
    expect(betslipId, 'tips POST should return the new betslip id').toBeTruthy()

    // A fresh, anonymous request — no x-buyer-phone, no session cookies — still
    // reveals the pending slip's content, including the booking code.
    const revealed = await request.get(`/api/slips/${betslipId}/reveal?_=${Date.now()}`)
    expect(revealed.ok(), await revealed.text()).toBeTruthy()
    const body = await revealed.json()
    expect(body.booking_code, 'booking code is public in open beta').toBe(code)
  })
})
