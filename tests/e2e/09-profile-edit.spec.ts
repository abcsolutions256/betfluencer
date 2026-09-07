import { test, expect, type Page } from '@playwright/test'
import { signUpTipster } from './fixtures'

// Feature 9 — Tipster profile edit (dashboard → Profile tab → Save changes).
// The PATCH /api/tipster/me path: a tipster edits their own display name,
// username and description; the username is slugified server-side; the phone
// (login + payout identity) is read-only; a taken username is rejected.

// The profile form has no placeholders/associated labels, so scope to its card.
function profileCard(page: Page) {
  return page.locator('.card', { hasText: 'Your public profile' })
}
const nameInput = (page: Page) => profileCard(page).locator('input[type="text"]').nth(0)
const userInput = (page: Page) => profileCard(page).locator('input[type="text"]').nth(1)
const descInput = (page: Page) => profileCard(page).locator('textarea')

async function openProfile(page: Page) {
  await page.getByRole('button', { name: 'Profile' }).click()
  await expect(page.getByText('Your public profile')).toBeVisible()
}

test.describe('tipster profile edit', () => {
  test('edits name/username/description, slugifies the username, and persists', async ({ page }) => {
    await signUpTipster(page)
    await openProfile(page)

    // Phone is the login/payout identity — must be read-only.
    await expect(profileCard(page).locator('input[type="tel"]')).toBeDisabled()

    await nameInput(page).fill('Renamed Tipster')
    await userInput(page).fill('Cool Name 22')          // → slug "coolname22"
    await descInput(page).fill('Sharp calls on EPL and UCL.')

    await page.getByRole('button', { name: 'Save changes' }).click()

    // Success feedback, and the server-slugified username is echoed back.
    await expect(page.getByText('Profile saved.')).toBeVisible({ timeout: 30_000 })
    await expect(userInput(page)).toHaveValue('coolname22')
    // Dashboard header reflects the new display name.
    await expect(page.getByText('Renamed Tipster')).toBeVisible()

    // Reload → the values were persisted, not just held in local state.
    await page.reload()
    await openProfile(page)
    await expect(nameInput(page)).toHaveValue('Renamed Tipster')
    await expect(userInput(page)).toHaveValue('coolname22')
    await expect(descInput(page)).toHaveValue('Sharp calls on EPL and UCL.')
  })

  test('rejects a username already taken by another tipster', async ({ page }) => {
    // Tipster A claims a username, then signs out.
    const a = await signUpTipster(page)
    await page.getByRole('button', { name: 'Profile' }).click()
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/tipster\/login/, { timeout: 30_000 })

    // Tipster B tries to take A's username → 409 surfaced as a friendly message.
    await signUpTipster(page)
    await openProfile(page)
    const before = await userInput(page).inputValue()

    await userInput(page).fill(a.username)
    await page.getByRole('button', { name: 'Save changes' }).click()

    await expect(page.getByText('That username is already taken.')).toBeVisible({ timeout: 30_000 })

    // The failed save left B's stored username unchanged: a reload re-hydrates
    // the original, not the attempted collision.
    await page.reload()
    await openProfile(page)
    await expect(userInput(page)).toHaveValue(before)
  })
})
