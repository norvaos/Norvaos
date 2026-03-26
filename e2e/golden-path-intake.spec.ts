import { test, expect } from '@playwright/test'

test.use({ storageState: './e2e/.auth/admin.json' })

const testClient = {
  firstName: 'E2E-Test',
  lastName: `Client-${Date.now()}`,
  email: `e2e-${Date.now()}@test.norvaos.com`,
  phone: '416-555-0199',
  dob: '1990-06-15',
}

test.describe('Golden Path: Client Intake', () => {
  test('complete intake via kiosk creates a lead visible in the system', async ({ page }) => {
    // -------------------------------------------------------
    // Step 1  -  Navigate to the kiosk / intake page
    // -------------------------------------------------------
    await page.goto('/intake')

    await expect(
      page.getByRole('heading', { name: /intake|new client|kiosk/i }),
    ).toBeVisible({ timeout: 10_000 })

    // -------------------------------------------------------
    // Step 2  -  Fill out client information
    // -------------------------------------------------------
    await page.getByLabel(/first name/i).fill(testClient.firstName)
    await page.getByLabel(/last name/i).fill(testClient.lastName)
    await page.getByLabel(/email/i).fill(testClient.email)
    await page.getByLabel(/phone/i).fill(testClient.phone)

    // Date of birth  -  try the dedicated field first, fall back to a text input
    const dobField = page.getByLabel(/date of birth|dob|birth date/i)
    if (await dobField.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await dobField.fill(testClient.dob)
    }

    // -------------------------------------------------------
    // Step 3  -  Select practice area
    // -------------------------------------------------------
    const practiceAreaSelect = page.getByLabel(/practice area|area of law|legal area/i)
    await practiceAreaSelect.click()
    await page.getByRole('option', { name: /immigration/i }).click()

    // -------------------------------------------------------
    // Step 4  -  Submit the intake form
    // -------------------------------------------------------
    await page.getByRole('button', { name: /submit|send|save/i }).click()

    // -------------------------------------------------------
    // Step 5  -  Verify success confirmation
    // -------------------------------------------------------
    await expect(
      page.getByText(/thank you|submitted|success|received/i),
    ).toBeVisible({ timeout: 15_000 })

    // -------------------------------------------------------
    // Step 6  -  Verify the lead appears in the system
    // -------------------------------------------------------
    await page.goto('/leads')

    // Use the search / filter input to locate the newly created lead
    const searchInput = page.getByRole('searchbox').or(
      page.getByPlaceholder(/search/i),
    )
    await searchInput.fill(testClient.lastName)

    // Wait for the table / list to reflect the search
    await expect(
      page.getByRole('cell', { name: testClient.lastName }).or(
        page.getByText(testClient.lastName),
      ),
    ).toBeVisible({ timeout: 15_000 })

    // Confirm the email is associated with the lead row
    await expect(page.getByText(testClient.email)).toBeVisible()
  })
})
