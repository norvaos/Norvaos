import { test, expect } from '@playwright/test';

test.describe('Golden Path: Matter Creation & Task Automation', () => {
  test.use({ storageState: './e2e/.auth/admin.json' });

  const matterTitle = `E2E Test Matter ${Date.now()}`;

  test('create matter and verify automated task triggering', async ({ page }) => {
    // Step 1  -  Navigate to Matters list
    await page.goto('/matters');
    await expect(page).toHaveURL(/\/matters/);

    // Step 2  -  Open "New Matter" form
    await page.getByRole('button', { name: /new matter/i }).click();

    // Step 3  -  Fill out the matter form

    // 3a. Select a contact (search-based combobox)
    const contactField = page.getByLabel(/contact/i);
    await contactField.click();
    await contactField.fill('Test');
    // Wait for search results, then pick the first matching option
    await page.getByRole('option').first().click();

    // 3b. Select practice area
    await page.getByLabel(/practice area/i).click();
    await page.getByRole('option', { name: /immigration/i }).click();

    // 3c. Select matter type
    await page.getByLabel(/matter type/i).click();
    await page.getByRole('option', { name: /spousal sponsorship/i }).click();

    // 3d. Enter matter title
    await page.getByLabel(/matter title/i).fill(matterTitle);

    // Step 4  -  Submit the form
    await page.getByRole('button', { name: /create|save|submit/i }).click();

    // Step 5  -  Verify redirect to the new matter detail page
    await expect(page).toHaveURL(/\/matters\/[a-zA-Z0-9-]+/, { timeout: 15_000 });

    // Verify the matter title is visible on the detail page
    await expect(page.getByRole('heading', { name: matterTitle })).toBeVisible();

    // Step 6  -  Verify matter appears in the matters list
    await page.goto('/matters');
    await expect(page.getByText(matterTitle)).toBeVisible({ timeout: 10_000 });

    // Step 7  -  Navigate back to the matter and open the Tasks tab
    await page.getByText(matterTitle).click();
    await expect(page).toHaveURL(/\/matters\/[a-zA-Z0-9-]+/);
    await page.getByRole('tab', { name: /tasks/i }).click();

    // Step 8  -  Verify automated tasks were created (workflow templates fire server-side)
    // Allow time for async task generation
    await expect(
      page.getByRole('table').or(page.getByRole('list')).locator('[data-testid="task-row"], li'),
    ).not.toHaveCount(0, { timeout: 30_000 });

    // Step 9  -  Verify matter stage pipeline bar is visible and shows initial stage
    const pipelineBar = page.getByTestId('matter-stage-pipeline');
    await expect(pipelineBar).toBeVisible();
    // The first stage marker should carry an active/current indicator
    await expect(
      pipelineBar.locator('[data-active="true"], [aria-current="step"]').first(),
    ).toBeVisible();
  });
});
