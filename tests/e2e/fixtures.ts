// Reusable UI flows shared across specs.
import { expect, type Page } from '@playwright/test'
import { uniqueEmail, uniqueUsername, TEST_PASSWORD } from './helpers'

export interface TipsterCreds {
  name: string
  email: string
  password: string
  username: string
  phone: string
}

// Drive the real tipster signup UI end-to-end. Local Supabase has email
// confirmation disabled (config.toml: enable_confirmations = false), so
// signUp returns a session immediately and the page registers the tipster
// and lands on the dashboard. Returns the creds for later login.
export async function signUpTipster(page: Page): Promise<TipsterCreds> {
  const creds: TipsterCreds = {
    name: 'E2E Tipster',
    email: uniqueEmail('tipster'),
    password: TEST_PASSWORD,
    username: uniqueUsername('enzo'),
    phone: '771' + Math.floor(100000 + Math.random() * 899999).toString(),
  }

  await page.goto('/tipster/signup')
  await page.getByPlaceholder('Display name').fill(creds.name)
  await page.getByPlaceholder('Email').fill(creds.email)
  await page.getByPlaceholder('Password (min 6)').fill(creds.password)
  await page.getByPlaceholder('Username (public, e.g. enzo)').fill(creds.username)
  await page.getByPlaceholder('Payout Mobile Money number').fill(creds.phone)
  await page.getByPlaceholder('Sport / leagues you cover').fill('Premier League')

  await page.getByRole('button', { name: 'Create tipster account' }).click()

  // Success → redirect to the dashboard (header shows the display name).
  await expect(page).toHaveURL(/\/tipster\/dashboard/, { timeout: 30_000 })
  await expect(page.getByText('Tipster dashboard')).toBeVisible()
  return creds
}

// Log in via the tipster login UI; lands on the dashboard.
export async function loginTipster(page: Page, creds: TipsterCreds) {
  await page.goto('/tipster/login')
  await page.getByPlaceholder('Email').fill(creds.email)
  await page.getByPlaceholder('Password').fill(creds.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL(/\/tipster\/dashboard/, { timeout: 30_000 })
}

// Log in a general Supabase-auth user via /login (used for the admin, whose
// role was promoted in global-setup). Lands on '/'.
export async function loginUser(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Password').fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
  // /login pushes to '/'; wait for the marketplace to confirm the session.
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 })
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
  // Total odds + legs.
  await page.getByPlaceholder('e.g. 12.40').fill(opts.odds)
  await page.getByPlaceholder('e.g. 4').fill(opts.legCount)
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
