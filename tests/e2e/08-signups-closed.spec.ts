import { test, expect } from '@playwright/test'
import { admin, uniqueUsername } from './helpers'

// Feature 8 — Tipster self-signup gate. When the admin "Public signups" flag is
// OFF (the production default), POST /api/tipster/auth { action: 'signup' } must
// be rejected and the /tipster/signup page must show the closed panel instead of
// the form. Restores the flag to open afterwards so the rest of the suite (which
// drives the real signup UI) is unaffected.
async function setSignups(open: boolean) {
  await admin()
    .from('platform_settings')
    .upsert({ key: 'public_signups_enabled', value: String(open) }, { onConflict: 'key' })
}

test.describe('tipster signups closed', () => {
  test('signup is rejected and the page shows the closed panel when disabled', async ({ page, request }) => {
    await setSignups(false)
    try {
      // API: the signup action is refused with 403 even with a valid payload.
      const res = await request.post('/api/tipster/auth', {
        data: {
          action: 'signup',
          name: 'Blocked Tipster',
          username: uniqueUsername('blocked'),
          phone: '7' + String(Date.now()).slice(-8),
          password: 'e2ePass123!',
        },
      })
      expect(res.status()).toBe(403)

      // UI: the form is replaced by the "Signups are closed" panel.
      await page.goto('/tipster/signup')
      await expect(page.getByText('Signups are closed')).toBeVisible({ timeout: 30_000 })
      await expect(page.getByPlaceholder('Display name')).toHaveCount(0)

      // The login page hides the "Sign up" link while signups are closed.
      await page.goto('/tipster/login')
      await expect(page.getByText('Tipster log in')).toBeVisible()
      await expect(page.getByRole('link', { name: 'Sign up' })).toHaveCount(0)
    } finally {
      await setSignups(true)
    }
  })
})
