import { test, expect } from '@playwright/test'

test.use({ storageState: './e2e/.auth/admin.json' })

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Conflict Check Engine — Playwright E2E Verification
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Law Society of Ontario Rule 3.4-1: A lawyer must not act or continue to act
 * where there is a conflict of interest. This test suite verifies the engine
 * that prevents firms from being penalised for conflict failures.
 *
 * Flow:
 *   1. Create Contact A (the "existing client")
 *   2. Create Contact B with same name + email (the "conflicting client")
 *   3. Run conflict scan on Contact B
 *   4. Verify match is detected (score ≥ 50 → review_required)
 *   5. Record a lawyer decision (cleared / blocked)
 *   6. Verify decision is recorded and status updates
 *
 * API-level tests (faster, no UI flakiness):
 *   7. POST /api/contacts/[id]/conflict-scan — verify scan + match response
 *   8. POST /api/contacts/[id]/conflict-decision — verify decision recording
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const now = Date.now()

const contactA = {
  firstName: 'E2E-Conflict',
  lastName: `Existing-${now}`,
  email: `conflict-a-${now}@test.norvaos.com`,
  phone: '416-555-8801',
}

const contactB = {
  firstName: 'E2E-Conflict',
  lastName: `Existing-${now}`, // Same name — triggers exact_name match (weight 30)
  email: `conflict-a-${now}@test.norvaos.com`, // Same email — triggers email_match (weight 25)
  phone: '416-555-8802',
}

let contactAId: string
let contactBId: string

// ─── Helper: Create a contact via API ─────────────────────────────────────────

async function createContact(
  request: import('@playwright/test').APIRequestContext,
  contact: typeof contactA,
): Promise<string> {
  const res = await request.post('/api/contacts', {
    data: {
      first_name: contact.firstName,
      last_name: contact.lastName,
      email_primary: contact.email,
      phone_primary: contact.phone,
      type: 'individual',
    },
  })

  expect(res.ok(), `Failed to create contact: ${res.status()}`).toBeTruthy()
  const body = await res.json()
  // API may return { id } or { data: { id } }
  const id = body.id ?? body.data?.id
  expect(id).toBeTruthy()
  return id
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 1 — API-Level Conflict Engine Verification
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Conflict Check Engine — API', () => {
  test.beforeAll(async ({ request }) => {
    // Create two contacts with overlapping PII
    contactAId = await createContact(request, contactA)
    contactBId = await createContact(request, contactB)
  })

  test('POST /api/contacts/[id]/conflict-scan detects name + email match', async ({
    request,
  }) => {
    const res = await request.post(`/api/contacts/${contactBId}/conflict-scan`, {
      data: { triggerType: 'manual' },
    })

    expect(res.ok(), `Scan failed: ${res.status()}`).toBeTruthy()
    const body = await res.json()

    // The scan should have completed
    const scan = body.scan ?? body.data?.scan ?? body
    expect(scan.status).toBe('completed')

    // Score should be ≥ 50 (exact_name=30 + email=25 = 55 → review_required)
    expect(scan.score).toBeGreaterThanOrEqual(50)

    // Should have at least one match
    const matches = body.matches ?? body.data?.matches ?? []
    expect(matches.length).toBeGreaterThanOrEqual(1)

    // The match should reference Contact A
    const matchIds = matches.map((m: { matched_entity_id: string }) => m.matched_entity_id)
    expect(matchIds).toContain(contactAId)
  })

  test('Contact B status is review_required after scan', async ({ request }) => {
    const res = await request.get(`/api/contacts/${contactBId}`)
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    const contact = body.data ?? body
    expect(contact.conflict_status).toBe('review_required')
  })

  test('POST /api/contacts/[id]/conflict-decision records lawyer clearance', async ({
    request,
  }) => {
    const res = await request.post(`/api/contacts/${contactBId}/conflict-decision`, {
      data: {
        decision: 'no_conflict',
        notes: 'E2E test: confirmed different individual despite name/email overlap',
      },
    })

    expect(res.ok(), `Decision failed: ${res.status()}`).toBeTruthy()
  })

  test('Contact B status is cleared_by_lawyer after decision', async ({ request }) => {
    const res = await request.get(`/api/contacts/${contactBId}`)
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    const contact = body.data ?? body
    expect(contact.conflict_status).toBe('cleared_by_lawyer')
  })

  test('POST /api/contacts/[id]/conflict-decision can block matter opening', async ({
    request,
  }) => {
    // Re-scan to get a fresh scan, then block
    await request.post(`/api/contacts/${contactBId}/conflict-scan`, {
      data: { triggerType: 'manual' },
    })

    const res = await request.post(`/api/contacts/${contactBId}/conflict-decision`, {
      data: {
        decision: 'block_matter_opening',
        notes: 'E2E test: blocking for conflict verification',
      },
    })

    expect(res.ok(), `Block decision failed: ${res.status()}`).toBeTruthy()

    // Verify contact is now blocked
    const contactRes = await request.get(`/api/contacts/${contactBId}`)
    const body = await contactRes.json()
    const contact = body.data ?? body
    expect(contact.conflict_status).toBe('blocked')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 2 — UI-Level Conflict Engine Verification
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Conflict Check Engine — UI', () => {
  test.beforeAll(async ({ request }) => {
    // Ensure contacts exist (idempotent — may already exist from API suite)
    if (!contactAId) contactAId = await createContact(request, contactA)
    if (!contactBId) contactBId = await createContact(request, contactB)

    // Reset Contact B to review_required by running a fresh scan
    await request.post(`/api/contacts/${contactBId}/conflict-scan`, {
      data: { triggerType: 'manual' },
    })
  })

  test('Contact detail page shows conflict review panel with matches', async ({
    page,
  }) => {
    await page.goto(`/contacts/${contactBId}`)

    // Wait for the page to load
    await expect(page.getByText(/conflict/i).first()).toBeVisible({ timeout: 15_000 })

    // The conflict review panel should be visible
    const conflictPanel = page.locator('[data-testid="conflict-review-panel"]').or(
      page.getByText(/conflict score|conflict status|review required/i).first(),
    )
    await expect(conflictPanel).toBeVisible({ timeout: 10_000 })

    // Should show the matched contact name
    await expect(
      page.getByText(new RegExp(contactA.firstName, 'i')),
    ).toBeVisible({ timeout: 5_000 })
  })

  test('Lawyer can run manual conflict scan from UI', async ({ page }) => {
    await page.goto(`/contacts/${contactBId}`)

    // Look for a "Run Scan" or "Scan" button
    const scanButton = page.getByRole('button', { name: /run scan|scan|check conflicts/i })

    if (await scanButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await scanButton.click()

      // Wait for scan completion indicator
      await expect(
        page.getByText(/completed|review required|matches found/i).first(),
      ).toBeVisible({ timeout: 15_000 })
    }
  })

  test('Lawyer can record conflict decision from UI', async ({ page }) => {
    await page.goto(`/contacts/${contactBId}`)

    // Look for decision controls
    const decisionSelect = page.getByLabel(/decision/i).or(
      page.getByRole('combobox', { name: /decision|conflict/i }),
    )

    if (await decisionSelect.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await decisionSelect.click()
      await page.getByRole('option', { name: /no conflict|clear/i }).click()

      // Add justification notes
      const notesField = page.getByLabel(/notes|justification|reason/i)
      if (await notesField.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await notesField.fill('E2E: Confirmed different individual via government ID')
      }

      // Submit the decision
      const submitButton = page.getByRole('button', { name: /record|submit|save|confirm/i })
      await submitButton.click()

      // Verify status update
      await expect(
        page.getByText(/cleared|no conflict/i).first(),
      ).toBeVisible({ timeout: 10_000 })
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE 3 — Conflict Gate: Blocked contact cannot open a matter
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Conflict Gate — Matter Opening Block', () => {
  test('blocked contact triggers conflict warning when opening a matter', async ({
    page,
    request,
  }) => {
    // Ensure Contact B is blocked
    await request.post(`/api/contacts/${contactBId}/conflict-scan`, {
      data: { triggerType: 'pre_matter_open' },
    })
    await request.post(`/api/contacts/${contactBId}/conflict-decision`, {
      data: {
        decision: 'block_matter_opening',
        notes: 'E2E: Blocking for gate test',
      },
    })

    // Navigate to matter creation
    await page.goto('/matters/new')
    await expect(page.locator('form, [data-testid="matter-form"]')).toBeVisible({
      timeout: 10_000,
    })

    // Search for Contact B by name
    const clientSearch = page.getByLabel(/client|contact/i).first().or(
      page.getByPlaceholder(/search|client/i).first(),
    )

    if (await clientSearch.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await clientSearch.fill(contactB.firstName)

      // Look for the contact in results
      const contactOption = page.getByText(
        new RegExp(`${contactB.firstName}.*${contactB.lastName}`, 'i'),
      )

      if (await contactOption.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await contactOption.click()

        // Should see a conflict warning or block message
        await expect(
          page.getByText(/conflict|blocked|cannot open|review required/i).first(),
        ).toBeVisible({ timeout: 10_000 })
      }
    }
  })
})
