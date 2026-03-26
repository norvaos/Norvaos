import { test, expect } from '@playwright/test';

/**
 * Golden Path: Document Upload & AI Classification
 *
 * Validates the end-to-end flow for uploading a document to an existing
 * matter and verifying that NorvaOS AI classification is applied.
 */

// Minimal valid PDF generated inline — no external fixture file required.
const testPdf = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\n' +
    'xref\n0 4\n' +
    '0000000000 65535 f \n' +
    '0000000009 00000 n \n' +
    '0000000058 00000 n \n' +
    '0000000115 00000 n \n' +
    'trailer<</Size 4/Root 1 0 R>>\n' +
    'startxref\n190\n%%EOF',
);

// Use a known matter ID; override via MATTER_ID env var if needed.
const MATTER_ID = process.env.MATTER_ID ?? '1';

test.describe('Golden Path: Document Upload & Classification', () => {
  test.use({ storageState: './e2e/.auth/admin.json' });

  test('upload a PDF and verify AI classification', async ({ page }) => {
    // ── Step 1: Navigate to the matter detail page ──────────────────
    await page.goto(`/matters/${MATTER_ID}`);
    await expect(page).toHaveURL(new RegExp(`/matters/${MATTER_ID}`));

    // ── Step 2: Open the Documents tab ──────────────────────────────
    const documentsTab = page.getByRole('tab', { name: /documents/i });
    await documentsTab.click();
    await expect(documentsTab).toHaveAttribute('aria-selected', 'true');

    // ── Step 3: Upload a test PDF ───────────────────────────────────
    // Locate the file input (hidden inputs are common for styled uploaders).
    const fileInput = page.locator('input[type="file"]');

    // If the input is hidden behind a button, we still need to set files on
    // the actual <input>. Using data-testid as fallback.
    const uploadInput = (await fileInput.count()) > 0
      ? fileInput.first()
      : page.locator('[data-testid="document-upload-input"]');

    await uploadInput.setInputFiles({
      name: 'test-document.pdf',
      mimeType: 'application/pdf',
      buffer: testPdf,
    });

    // ── Step 4: Wait for the upload to complete ─────────────────────
    // Look for a success indicator — toast, status badge, or row entry.
    await expect(
      page.getByText(/upload(ed|complete|success)/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    // ── Step 5: Verify document appears in the list ─────────────────
    const documentRow = page
      .locator('[data-testid="document-row"]', {
        hasText: 'test-document.pdf',
      })
      .or(page.getByRole('row', { name: /test-document\.pdf/i }))
      .first();

    await expect(documentRow).toBeVisible({ timeout: 10_000 });

    // ── Step 6: Verify AI classification was applied ────────────────
    // AI classification may be async; retry with a generous timeout.
    await expect(async () => {
      // Re-query inside the retry block so Playwright re-evaluates the DOM.
      const categoryCell = documentRow
        .locator('[data-testid="document-category"]')
        .or(documentRow.getByRole('cell', { name: /./i }).nth(1));

      const categoryText = await categoryCell.innerText();
      // The category should be a non-empty string set by the classifier.
      expect(categoryText.trim().length).toBeGreaterThan(0);
    }).toPass({ intervals: [1_000, 2_000, 5_000], timeout: 30_000 });

    // ── Step 7: Verify document status ──────────────────────────────
    const statusBadge = documentRow
      .locator('[data-testid="document-status"]')
      .or(documentRow.getByText(/uploaded|classified/i))
      .first();

    await expect(statusBadge).toBeVisible({ timeout: 10_000 });
    const statusText = await statusBadge.innerText();
    expect(statusText.toLowerCase()).toMatch(/uploaded|classified/);
  });
});
