import { test, expect, type APIRequestContext } from '@playwright/test'
import { signUpTipster, postManualSlip } from './fixtures'
import { admin } from './helpers'

// Helper: read the slip the tipster just posted (verified + pending) from the
// feed so we know its id and price. Use the standalone `request` fixture (not
// page.request) so the read is an independent, uncached API call.
async function findPendingSlip(request: APIRequestContext, odds: string) {
  // Cache-bust: Playwright's APIRequestContext caches GET responses across a
  // worker, so a plain /api/slips would return a stale feed from an earlier spec.
  const res = await request.get(`/api/slips?_=${Date.now()}-${Math.random()}`)
  const rows: any[] = (await res.json()).slips ?? []
  const row = rows.find((r) => Number(r.slip?.total_odds) === Number(odds) && r.slip?.result === 'pending')
  expect(row, 'a verified pending slip to buy').toBeTruthy()
  return row.slip as { id: string; slip_price: number }
}

// Feature 5 — Guest purchase + reveal, then a denial from a fresh context.
test.describe('guest purchase + reveal', () => {
  test('guest buys a pending slip via the PaymentSheet (demo) and reveals it; a fresh guest is denied', async ({ page, browser, request }) => {
    // ── Arrange: a tipster posts a verified, pending slip ──
    await signUpTipster(page)
    const odds = '7.45'
    await postManualSlip(page, { price: 1000, odds, legCount: '2' })
    const slip = await findPendingSlip(request, odds)

    // ── Act: become an anonymous guest and buy via the UI ──
    // A clean separate context = a fresh guest. The buyer is identified by the
    // phone they pay with (stored as bf_buyer_phone after a successful payment).
    const guest = await browser.newContext()
    const gp = await guest.newPage()
    await gp.goto('/')
    await expect(gp.getByText('Verified slips')).toBeVisible()

    // Find the card for our slip by its odds and click its Buy button.
    const card = gp.locator('div', { hasText: new RegExp(`^Betslip`) }).filter({ hasText: odds })
    // Fall back to the global Buy button if the scoped locator is ambiguous —
    // there is exactly one pending slip in a fresh DB run for this odds value.
    const buyBtn = gp.getByRole('button', { name: /Buy slip/ }).first()
    await expect(buyBtn).toBeVisible({ timeout: 30_000 })
    await buyBtn.click()

    // PaymentSheet opens.
    await expect(gp.getByText('Unlock slip')).toBeVisible()
    await gp.getByPlaceholder('771 234 567').fill('771234567')
    await gp.getByRole('button', { name: /^Pay UGX/ }).click()

    // Demo ioTec resolves to success on the first status poll, which fulfils
    // the purchase. Assert the DURABLE outcome — the active purchase row — not
    // the fleeting "Slip unlocked!" sheet state (it auto-closes within ~a
    // second, which races the assertion).
    const db = admin()
    await expect
      .poll(
        async () => {
          const { data } = await db
            .from('slip_purchases')
            .select('status')
            .eq('betslip_id', slip.id)
            .eq('status', 'active')
          return (data ?? []).length
        },
        { timeout: 30_000, intervals: [500, 1000, 1000] },
      )
      .toBeGreaterThanOrEqual(1)

    // The buyer's phone (stored as bf_buyer_phone after paying, sent as
    // x-buyer-phone) now unlocks the slip — reveal returns 200 with its content
    // (incl. the screenshot for a screenshot slip).
    const buyerPhone = await gp.evaluate(() => localStorage.getItem('bf_buyer_phone'))
    expect(buyerPhone, 'buyer phone should be stored after purchase').toBeTruthy()
    const revealed = await gp.request.get(`/api/slips/${slip.id}/reveal`, {
      headers: { 'x-buyer-phone': buyerPhone! },
    })
    expect(revealed.ok(), await revealed.text()).toBeTruthy()

    // ── Assert: a stranger (different phone, no purchase) is denied ──
    const denied = await gp.request.get(`/api/slips/${slip.id}/reveal`, {
      headers: { 'x-buyer-phone': '700000999' },
    })
    expect(denied.status()).toBe(403)

    await guest.close()
  })
})
