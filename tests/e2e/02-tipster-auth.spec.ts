import { test, expect } from '@playwright/test'
import { signUpTipster, loginTipster } from './fixtures'

// Feature 2 — Tipster auth. Sign up a NEW tipster (unique email per run),
// then log out and log back in, reaching the dashboard both times.
test.describe('tipster auth', () => {
  test('sign up a new tipster, then log in to the dashboard', async ({ page }) => {
    const creds = await signUpTipster(page)
    // Dashboard header shows the tipster name.
    await expect(page.getByText('E2E Tipster')).toBeVisible()

    // Sign out via the Profile tab, then log back in fresh.
    await page.getByRole('button', { name: 'Profile' }).click()
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/tipster\/login/, { timeout: 30_000 })

    await loginTipster(page, creds)
    await expect(page.getByText('Tipster dashboard')).toBeVisible()
    await expect(page.getByText('E2E Tipster')).toBeVisible()
  })
})
