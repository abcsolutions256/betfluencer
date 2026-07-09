// Reusable UI flows shared across specs.
import { expect, type Page } from '@playwright/test'
import { uniqueUsername, TEST_PASSWORD } from './helpers'

export interface TipsterCreds {
  name: string
  password: string
  username: string
  phone: string
}

// Drive the real tipster signup UI end-to-end (phone + password, no email).
// /api/tipster/auth sets the signed-cookie session and the page lands on the
// dashboard. Returns the creds for later login.
export async function signUpTipster(page: Page): Promise<TipsterCreds> {
  const creds: TipsterCreds = {
    name: 'E2E Tipster',
    password: TEST_PASSWORD,                 // 'e2ePass123!' — passes isStrongPassword
    username: uniqueUsername('enzo'),
    phone: '7' + String(Date.now()).slice(-8),  // unique +2567XXXXXXXX
  }

  await page.goto('/tipster/signup')
  await page.getByPlaceholder('Display name').fill(creds.name)
  await page.getByPlaceholder('Username (public, e.g. enzo)').fill(creds.username)
  await page.getByPlaceholder('Mobile Money number (your login + payout)').fill(creds.phone)
  await page.getByPlaceholder('Password (min 8, incl. a number)').fill(creds.password)
  await page.getByPlaceholder('Sport / leagues you cover').fill('Premier League')

  await page.getByRole('button', { name: 'Create tipster account' }).click()

  // Success → redirect to the dashboard (header shows the display name).
  await expect(page).toHaveURL(/\/tipster\/dashboard/, { timeout: 30_000 })
  await expect(page.getByText('Tipster dashboard')).toBeVisible()
  return creds
}

// Log in via the tipster login UI (phone + password); lands on the dashboard.
export async function loginTipster(page: Page, creds: TipsterCreds) {
  await page.goto('/tipster/login')
  await page.getByPlaceholder('Mobile Money number').fill(creds.phone)
  await page.getByPlaceholder('Password').fill(creds.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL(/\/tipster\/dashboard/, { timeout: 30_000 })
}

// Log in the admin via the /admin gate (single master password → admin session).
export async function loginAdmin(page: Page, password: string) {
  await page.goto('/admin')
  await page.getByPlaceholder('Admin password').fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
  // The admin panel header appears once the session is accepted.
  await expect(page.getByText('Betfluencer HQ')).toBeVisible({ timeout: 30_000 })
}

// Post a manual slip from the dashboard Post tab. Returns nothing; the caller
// asserts. `legCount` and `odds` are strings as the form stores them.
export async function postManualSlip(
  page: Page,
  opts: { price: number; odds: string; legCount: string; note?: string },
) {
  // Open the Post tab.
  await page.getByRole('button', { name: 'Post tip' }).click()
  // Manual mode is the default; make sure the manual form is visible.
  await expect(page.getByText('Post betslips')).toBeVisible()

  // Price (the gold-boxed input with placeholder "e.g. 1500").
  await page.getByPlaceholder('e.g. 1500').fill(String(opts.price))
  // Total odds + legs. Since the 2026-07-02 form change these are the two
  // optional "Auto from code" inputs (odds first, then leg count) — normally
  // left blank for a coded slip; manual specs still set them explicitly.
  const autoInputs = page.getByPlaceholder('Auto from code')
  await autoInputs.first().fill(opts.odds)
  await autoInputs.nth(1).fill(opts.legCount)
  if (opts.note) {
    // The note input is the last bare .inp; target by its row order via label.
    await page.getByPlaceholder('e.g. ABC123').first().waitFor()
  }

  // Submit. The button label is "Post 1 slip".
  await page.getByRole('button', { name: /Post \d+ slip/ }).click()
  // Wait for the POSTED slip's card to appear in "My slips" (rendered as
  // ×<odds>). This confirms postTip's POST actually resolved and the list
  // updated — NOT just the always-present "My Slips" nav button. Returning
  // before the POST resolves would race the DB commit (and a short test could
  // close the context mid-request, dropping the slip entirely).
  await expect(page.getByText(`×${opts.odds}`).first()).toBeVisible({ timeout: 30_000 })
}
