import { test, expect } from '@playwright/test';

test.describe('Golden Path: Invoice & Payment', () => {
  test.use({ storageState: './e2e/.auth/admin.json' });
  test.slow(); // Mark entire suite as slow due to Stripe interactions

  const MATTER_ID = 'matter-001'; // Replace with a seeded/known matter ID
  const STRIPE_TEST_CARD = '4242424242424242';
  const STRIPE_EXPIRY = '12/30';
  const STRIPE_CVC = '123';
  const STRIPE_ZIP = '90210';

  test('create invoice, send to client, and complete Stripe payment', async ({ page }) => {
    // ── Step A: Navigate to an existing matter's detail page ──
    await page.goto(`/matters/${MATTER_ID}`);
    await expect(page.locator('h1, [data-testid="matter-title"]')).toBeVisible();

    // ── Step B: Click on the Billing / Invoices tab ──
    const billingTab = page.getByRole('tab', { name: /billing|invoices/i });
    await billingTab.click();
    await expect(page.getByRole('tabpanel')).toBeVisible();

    // ── Step C: Click "Create Invoice" / "Generate Invoice" ──
    const createInvoiceBtn = page.getByRole('button', {
      name: /create invoice|generate invoice/i,
    });
    await createInvoiceBtn.click();

    // ── Step D: Fill invoice details ──
    // Add a line item
    const descriptionInput = page.getByLabel(/description|item|service/i).first();
    await descriptionInput.fill('Legal Consultation');

    const quantityInput = page.getByLabel(/quantity|qty/i).first();
    await quantityInput.fill('1');

    const rateInput = page.getByLabel(/rate|price|amount/i).first();
    await rateInput.fill('500.00');

    // Verify subtotal calculation
    await expect(page.getByText(/\$?500\.00/)).toBeVisible();

    // ── Step E: Save / generate the invoice ──
    const saveBtn = page.getByRole('button', {
      name: /save|generate|create/i,
    });
    await saveBtn.click();

    // ── Step F: Verify invoice appears in billing tab with status "draft" or "sent" ──
    await expect(
      page.getByText(/draft|sent/i).first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Legal Consultation')).toBeVisible();

    // ── Step G: Send to client ──
    const sendBtn = page.getByRole('button', {
      name: /send to client|mark as sent|send invoice/i,
    });
    await sendBtn.click();

    // Confirm the send action if a confirmation dialog appears
    const confirmBtn = page.getByRole('button', { name: /confirm|yes|send/i });
    if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    await expect(page.getByText(/sent/i).first()).toBeVisible({ timeout: 10_000 });

    // ── Step H: Simulate Stripe payment ──
    // Click the payment link or navigate to the client portal payment page
    const paymentLink = page.getByRole('link', {
      name: /pay now|pay invoice|payment link|view payment/i,
    });

    // Capture the payment URL (may redirect to Stripe Checkout)
    const [paymentPage] = await Promise.all([
      page.waitForEvent('popup').catch(() => null), // Handle new-tab scenario
      paymentLink.click(),
    ]);

    // Use the popup page if opened in a new tab, otherwise stay on current page
    const stripePage = paymentPage ?? page;

    // Wait for Stripe Checkout or embedded payment form to load
    await stripePage.waitForURL(
      /stripe\.com\/.*checkout|\/pay|\/invoice\/pay/i,
      { timeout: 30_000 },
    );

    // Fill Stripe test card details
    // Stripe Checkout uses iframes; locate the card input fields
    const cardFrame =
      stripePage.frameLocator('iframe[name*="privateStripe"]').first() ??
      stripePage;

    // Card number
    const cardNumberInput =
      stripePage.getByLabel(/card number/i).or(
        stripePage.locator('[data-testid="card-number-input"], #cardNumber, [name="cardnumber"]'),
      );
    await cardNumberInput.fill(STRIPE_TEST_CARD, { timeout: 30_000 });

    // Expiry
    const expiryInput =
      stripePage.getByLabel(/expir/i).or(
        stripePage.locator('[data-testid="card-expiry-input"], #cardExpiry, [name="exp-date"]'),
      );
    await expiryInput.fill(STRIPE_EXPIRY);

    // CVC
    const cvcInput =
      stripePage.getByLabel(/cvc|cvv|security/i).or(
        stripePage.locator('[data-testid="card-cvc-input"], #cardCvc, [name="cvc"]'),
      );
    await cvcInput.fill(STRIPE_CVC);

    // ZIP / Postal code (if present)
    const zipInput = stripePage.getByLabel(/zip|postal/i).or(
      stripePage.locator('[name="postalCode"], [autocomplete="postal-code"]'),
    );
    if (await zipInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await zipInput.fill(STRIPE_ZIP);
    }

    // Submit payment
    const payBtn = stripePage.getByRole('button', {
      name: /pay|submit|complete/i,
    });
    await payBtn.click();

    // Wait for redirect back to the app after successful payment
    await stripePage.waitForURL(/\/matters|\/invoices|\/billing|\/payment.*success/i, {
      timeout: 30_000,
    });

    // ── Step I: Verify invoice status changes to "paid" ──
    // Navigate back to the matter billing tab if needed
    await page.goto(`/matters/${MATTER_ID}`);
    const billingTabAfterPay = page.getByRole('tab', { name: /billing|invoices/i });
    await billingTabAfterPay.click();

    await expect(
      page.getByText(/paid/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    // ── Step J: Verify payment appears in transaction history ──
    const transactionTab = page.getByRole('tab', {
      name: /transactions|payments|history/i,
    });
    if (await transactionTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await transactionTab.click();
    }

    await expect(page.getByText(/\$?500\.00/)).toBeVisible();
    await expect(page.getByText(/Legal Consultation/i)).toBeVisible();
  });
});
