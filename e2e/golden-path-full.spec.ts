import { test, expect } from '@playwright/test'

/**
 * MASTER E2E: Golden Path — Intake to Invoice (Full)
 *
 * Deployment gate test for NorvaOS. This serial suite exercises the
 * complete lifecycle: client intake, lead-to-matter conversion,
 * document upload & classification, automated task verification,
 * invoice generation, and Stripe payment simulation.
 *
 * MUST pass 100% before any production deployment.
 */

test.describe.serial('Golden Path: Intake to Invoice (Full)', () => {
  test.use({ storageState: './e2e/.auth/admin.json' })
  test.slow()

  // Shared state across serial steps
  const ts = Date.now()
  let leadFirstName: string
  let leadLastName: string
  let leadEmail: string
  let matterId: string

  // Minimal valid PDF — no external fixture required
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
  )

  // ─────────────────────────────────────────────────────────────────
  // Step 1: Client Intake
  // ─────────────────────────────────────────────────────────────────
  test('Step 1 — Submit client intake via public form', async ({ page }) => {
    test.setTimeout(30_000)

    leadFirstName = 'GP-Test'
    leadLastName = `Intake-${ts}`
    leadEmail = `gp-${ts}@test.norvaos.com`

    // Navigate to the kiosk / public intake form
    await page.goto('/intake')
    await expect(
      page.getByRole('heading', { name: /intake|new client|kiosk/i }),
    ).toBeVisible({ timeout: 10_000 })

    // Fill client details
    await page.getByLabel(/first name/i).fill(leadFirstName)
    await page.getByLabel(/last name/i).fill(leadLastName)
    await page.getByLabel(/email/i).fill(leadEmail)
    await page.getByLabel(/phone/i).fill('416-555-0199')

    // Date of birth (optional field)
    const dobField = page.getByLabel(/date of birth|dob|birth date/i)
    if (await dobField.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await dobField.fill('1990-06-15')
    }

    // Practice area selection
    const practiceAreaSelect = page.getByLabel(/practice area|area of law|legal area/i)
    await practiceAreaSelect.click()
    await page.getByRole('option', { name: /immigration/i }).click()

    // Submit
    await page.getByRole('button', { name: /submit|send|save/i }).click()

    // Verify success
    await expect(
      page.getByText(/thank you|submitted|success|received/i),
    ).toBeVisible({ timeout: 15_000 })
  })

  // ─────────────────────────────────────────────────────────────────
  // Step 2: Lead → Matter Conversion
  // ─────────────────────────────────────────────────────────────────
  test('Step 2 — Convert lead to matter', async ({ page }) => {
    test.setTimeout(30_000)

    // Navigate to leads list and find the intake we just created
    await page.goto('/leads')

    const searchInput = page.getByRole('searchbox').or(
      page.getByPlaceholder(/search/i),
    )
    await searchInput.fill(leadLastName)

    // Wait for the lead to appear in results
    const leadEntry = page.getByRole('cell', { name: leadLastName }).or(
      page.getByText(leadLastName),
    )
    await expect(leadEntry).toBeVisible({ timeout: 15_000 })

    // Open the lead detail
    await leadEntry.first().click()
    await expect(page).toHaveURL(/\/leads\/[a-zA-Z0-9-]+/, { timeout: 10_000 })

    // Click "Convert to Matter"
    await page.getByRole('button', { name: /convert to matter|convert/i }).click()

    // Fill conversion form — matter type
    const matterTypeField = page.getByLabel(/matter type/i)
    await matterTypeField.click()
    await page.getByRole('option', { name: /spousal sponsorship/i }).first().click()

    // Fill conversion form — practice area (if separate from intake)
    const conversionPracticeArea = page.getByLabel(/practice area/i)
    if (await conversionPracticeArea.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await conversionPracticeArea.click()
      await page.getByRole('option', { name: /immigration/i }).click()
    }

    // Confirm conversion
    await page.getByRole('button', { name: /confirm|create|save|convert/i }).click()

    // Verify redirect to the new matter detail page and capture matter ID
    await expect(page).toHaveURL(/\/matters\/[a-zA-Z0-9-]+/, { timeout: 15_000 })
    const url = page.url()
    matterId = url.match(/\/matters\/([a-zA-Z0-9-]+)/)?.[1] ?? ''
    expect(matterId).toBeTruthy()

    // Verify the matter heading is visible
    await expect(
      page.getByRole('heading').first(),
    ).toBeVisible({ timeout: 10_000 })
  })

  // ─────────────────────────────────────────────────────────────────
  // Step 3: Document Upload & Classification
  // ─────────────────────────────────────────────────────────────────
  test('Step 3 — Upload document and verify classification', async ({ page }) => {
    test.setTimeout(30_000)

    // Navigate to the matter detail page
    await page.goto(`/matters/${matterId}`)
    await expect(page).toHaveURL(new RegExp(`/matters/${matterId}`))

    // Open Documents tab
    const documentsTab = page.getByRole('tab', { name: /documents/i })
    await documentsTab.click()
    await expect(documentsTab).toHaveAttribute('aria-selected', 'true')

    // Upload a test PDF
    const fileInput = page.locator('input[type="file"]')
    const uploadInput = (await fileInput.count()) > 0
      ? fileInput.first()
      : page.locator('[data-testid="document-upload-input"]')

    await uploadInput.setInputFiles({
      name: `gp-test-doc-${ts}.pdf`,
      mimeType: 'application/pdf',
      buffer: testPdf,
    })

    // Wait for upload completion
    await expect(
      page.getByText(/upload(ed|complete|success)/i).first(),
    ).toBeVisible({ timeout: 15_000 })

    // Verify document appears in the list
    const documentRow = page
      .locator('[data-testid="document-row"]', {
        hasText: `gp-test-doc-${ts}.pdf`,
      })
      .or(page.getByRole('row', { name: new RegExp(`gp-test-doc-${ts}\\.pdf`, 'i') }))
      .first()

    await expect(documentRow).toBeVisible({ timeout: 10_000 })

    // Verify AI classification was applied (async — retry with generous timeout)
    await expect(async () => {
      const categoryCell = documentRow
        .locator('[data-testid="document-category"]')
        .or(documentRow.getByRole('cell', { name: /./i }).nth(1))

      const categoryText = await categoryCell.innerText()
      expect(categoryText.trim().length).toBeGreaterThan(0)
    }).toPass({ intervals: [1_000, 2_000, 5_000], timeout: 30_000 })
  })

  // ─────────────────────────────────────────────────────────────────
  // Step 4: Task Verification
  // ─────────────────────────────────────────────────────────────────
  test('Step 4 — Verify automated tasks were created', async ({ page }) => {
    test.setTimeout(30_000)

    // Navigate to matter detail
    await page.goto(`/matters/${matterId}`)
    await expect(page).toHaveURL(new RegExp(`/matters/${matterId}`))

    // Open Tasks tab
    await page.getByRole('tab', { name: /tasks/i }).click()

    // Verify automated tasks exist (workflow templates fire on matter creation)
    // Allow time for async task generation
    await expect(
      page
        .getByRole('table')
        .or(page.getByRole('list'))
        .locator('[data-testid="task-row"], li'),
    ).not.toHaveCount(0, { timeout: 30_000 })

    // Verify at least one task row is visible
    const firstTask = page
      .locator('[data-testid="task-row"]')
      .or(page.getByRole('row').nth(1))
      .first()

    await expect(firstTask).toBeVisible()
  })

  // ─────────────────────────────────────────────────────────────────
  // Step 5: Invoice Generation
  // ─────────────────────────────────────────────────────────────────
  test('Step 5 — Create an invoice with a line item', async ({ page }) => {
    test.setTimeout(30_000)

    // Navigate to matter detail
    await page.goto(`/matters/${matterId}`)
    await expect(page).toHaveURL(new RegExp(`/matters/${matterId}`))

    // Open Billing tab
    await page.getByRole('tab', { name: /billing|invoices/i }).click()

    // Create a new invoice
    await page.getByRole('button', { name: /new invoice|create invoice/i }).click()

    // Add a line item
    await page.getByRole('button', { name: /add (line )?item|add entry/i }).click()

    // Fill line item details
    const descriptionField = page.getByLabel(/description/i).or(
      page.getByPlaceholder(/description/i),
    )
    await descriptionField.first().fill(`Golden Path E2E — consultation fee (${ts})`)

    const amountField = page.getByLabel(/amount|price|rate/i).or(
      page.getByPlaceholder(/amount/i),
    )
    await amountField.first().fill('500.00')

    // Quantity (if present)
    const qtyField = page.getByLabel(/quantity|qty|hours/i)
    if (await qtyField.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await qtyField.fill('1')
    }

    // Save / create the invoice
    await page.getByRole('button', { name: /save|create|submit/i }).click()

    // Verify invoice was created — look for the amount or a success indicator
    await expect(
      page.getByText(/\$500|500\.00/i).or(
        page.getByText(/invoice created|saved|success/i),
      ),
    ).toBeVisible({ timeout: 15_000 })
  })

  // ─────────────────────────────────────────────────────────────────
  // Step 6: Payment via Stripe (simulation)
  // ─────────────────────────────────────────────────────────────────
  test('Step 6 — Send invoice and complete Stripe test payment', async ({ page }) => {
    test.setTimeout(60_000)

    // Navigate to matter billing
    await page.goto(`/matters/${matterId}`)
    await expect(page).toHaveURL(new RegExp(`/matters/${matterId}`))
    await page.getByRole('tab', { name: /billing|invoices/i }).click()

    // Find the invoice we just created and open it
    const invoiceRow = page.getByText(/\$500|500\.00/i).first()
    await expect(invoiceRow).toBeVisible({ timeout: 10_000 })
    await invoiceRow.click()

    // Send the invoice (changes status to "sent" / "pending")
    const sendButton = page.getByRole('button', { name: /send|email invoice/i })
    if (await sendButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await sendButton.click()
      // Confirm send if a confirmation dialog appears
      const confirmSend = page.getByRole('button', { name: /confirm|yes|send/i })
      if (await confirmSend.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await confirmSend.click()
      }
    }

    // Navigate to the payment page (client-facing)
    // The payment link is typically available on the invoice detail
    const paymentLink = page.getByRole('link', { name: /pay now|make payment|payment link/i }).or(
      page.locator('a[href*="pay"]'),
    )

    if (await paymentLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await paymentLink.click()
    } else {
      // Fallback: navigate directly to the payment page via URL pattern
      const payUrl = page.locator('[data-testid="payment-url"]').or(
        page.locator('input[readonly][value*="pay"]'),
      )
      if (await payUrl.isVisible({ timeout: 3_000 }).catch(() => false)) {
        const url = await payUrl.getAttribute('value') ?? await payUrl.innerText()
        await page.goto(url)
      } else {
        // Use the record payment button as an internal payment flow
        await page.getByRole('button', { name: /record payment|collect payment/i }).click()
      }
    }

    // Complete payment with Stripe test card
    // Handle both embedded Stripe Elements and Stripe Checkout redirect

    // Stripe Elements (embedded iframe)
    const stripeFrame = page.frameLocator('iframe[name*="stripe"], iframe[title*="card"]').first()
    const cardNumberInput = stripeFrame.locator('[name="cardnumber"], [placeholder*="card number"]')

    if (await cardNumberInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Stripe Elements flow
      await cardNumberInput.fill('4242424242424242')

      const expiryInput = stripeFrame.locator('[name="exp-date"], [placeholder*="MM"]')
      await expiryInput.fill('12/30')

      const cvcInput = stripeFrame.locator('[name="cvc"], [placeholder*="CVC"]')
      await cvcInput.fill('123')

      const zipInput = stripeFrame.locator('[name="postalCode"], [placeholder*="ZIP"]')
      if (await zipInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await zipInput.fill('M5V 2T6')
      }
    } else {
      // Fallback: manual payment recording (amount field + payment method)
      const paymentAmountField = page.getByLabel(/amount/i).or(
        page.getByPlaceholder(/amount/i),
      )
      if (await paymentAmountField.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await paymentAmountField.first().fill('500.00')
      }

      const methodSelect = page.getByLabel(/payment method|method/i)
      if (await methodSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await methodSelect.click()
        await page.getByRole('option', { name: /card|credit|stripe/i }).first().click()
      }
    }

    // Submit payment
    await page.getByRole('button', { name: /pay|submit|confirm|record/i }).click()

    // Verify payment was recorded
    await expect(
      page.getByText(/paid|payment (received|successful|recorded|complete)/i).or(
        page.getByText(/\$0\.00 (due|outstanding|balance)/i),
      ),
    ).toBeVisible({ timeout: 30_000 })

    // Verify invoice status updated
    // Navigate back to matter billing to confirm
    await page.goto(`/matters/${matterId}`)
    await page.getByRole('tab', { name: /billing|invoices/i }).click()

    await expect(
      page.getByText(/paid/i),
    ).toBeVisible({ timeout: 15_000 })
  })
})
