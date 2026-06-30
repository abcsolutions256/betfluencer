import { test, expect } from '@playwright/test'

// Feature 7 — Rankings page renders.
test.describe('rankings', () => {
  test('rankings page renders the leaderboard shell', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(String(e)))

    await page.goto('/rankings')

    await expect(page.getByText('Betfluencer rankings')).toBeVisible()
    await expect(page.getByText('Last 28 days')).toBeVisible()

    // After loading resolves, either the table header or an empty state is up.
    await expect(page.getByText('Loading rankings...')).toHaveCount(0, { timeout: 30_000 })
    await expect(page.getByRole('columnheader', { name: 'Tipster' })).toBeVisible()

    expect(pageErrors, `uncaught page errors: ${pageErrors.join('\n')}`).toEqual([])
  })
})
