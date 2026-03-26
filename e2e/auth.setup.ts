import { test as setup, expect } from '@playwright/test'

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL!
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD!
const AUTH_STATE_PATH = './e2e/.auth/admin.json'

setup('authenticate as admin', async ({ page }) => {
  setup.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, 'E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD must be set')

  await page.goto('/login')

  await page.getByLabel(/email/i).fill(ADMIN_EMAIL)
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: /sign in|log in/i }).click()

  // Wait for redirect to the dashboard after successful login
  await expect(page).toHaveURL(/\/(dashboard)?$/, { timeout: 15_000 })

  // Persist authenticated storage state for downstream tests
  await page.context().storageState({ path: AUTH_STATE_PATH })
})
