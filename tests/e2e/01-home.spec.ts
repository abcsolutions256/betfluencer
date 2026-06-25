import { test, expect } from '@playwright/test'

// Feature 1 — Home loads. The marketplace ('/') renders, the bottom nav is
// present, and there are no uncaught page errors / failed app requests.
test.describe('home', () => {
  test('renders the marketplace with nav and no uncaught errors', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(String(e)))

    await page.goto('/')

    // The marketplace heading is the load signal (it renders after the feed
    // fetch resolves; an empty feed still shows the header + "No slips found").
    await expect(page.getByText('Verified slips')).toBeVisible()
    await expect(page.getByText('Marketplace')).toBeVisible()

    // Bottom nav is the global shell — assert its tabs are present.
    await expect(page.getByRole('link', { name: 'Channels' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Rankings' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Mine' })).toBeVisible()

    // The feed container settled into one of its two valid states.
    const slipCount = page.getByText(/\d+ slips?/)
    const empty = page.getByText('No slips found')
    await expect(slipCount.or(empty).first()).toBeVisible()

    expect(pageErrors, `uncaught page errors: ${pageErrors.join('\n')}`).toEqual([])
  })
})
