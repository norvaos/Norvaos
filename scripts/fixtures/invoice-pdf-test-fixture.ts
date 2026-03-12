/**
 * Invoice PDF Test Fixture
 *
 * Creates a deterministic test invoice with:
 * - 32 line items (forces pagination across 2+ pages)
 * - Long descriptions with quotes, commas, newlines, and non-ASCII characters
 * - Partial payment applied
 * - Currency: CAD
 * - Tax amount: $0.00 (verifies zero-tax display)
 *
 * Usage:
 *   npx tsx scripts/fixtures/invoice-pdf-test-fixture.ts
 *
 * Outputs:
 *   - test-invoice.pdf in the project root
 *   - Fixture ID logged to console
 */

import { writeFileSync } from 'fs'
import { join } from 'path'
import { generateInvoicePdf, type InvoicePdfData } from '../../lib/utils/invoice-pdf'

const FIXTURE_ID = 'fixture-inv-pdf-20260301-pagination-test'

// ── 32 Line Items ────────────────────────────────────────────────────────────

const lineItems = [
  // Standard entries
  { description: 'Initial consultation and case review', quantity: 2, unit_price: 35000, amount: 70000 },
  { description: 'Preparation of Form IMM 1344 — Application for PR', quantity: 1, unit_price: 50000, amount: 50000 },
  { description: 'Document review: passport, birth certificate, diplomas', quantity: 3, unit_price: 15000, amount: 45000 },
  { description: 'Translation coordination — Mandarin to English (certified)', quantity: 5, unit_price: 12000, amount: 60000 },

  // Entries with special characters: quotes, commas
  { description: 'Review of "Confirmation of Permanent Residence" letter, including addendum', quantity: 1, unit_price: 25000, amount: 25000 },
  { description: 'Filing fee disbursement (Gov\'t of Canada, IRCC)', quantity: 1, unit_price: 108500, amount: 108500 },
  { description: 'Courier service: Toronto, ON -> Ottawa, ON (tracked)', quantity: 2, unit_price: 4500, amount: 9000 },
  { description: 'Legal research: "inadmissibility grounds" under IRPA s.34–42', quantity: 4, unit_price: 30000, amount: 120000 },

  // Non-ASCII characters
  { description: 'Client meeting — café discussion re: Résumé & Déclaration', quantity: 1.5, unit_price: 35000, amount: 52500 },
  { description: 'Überprüfung der Dokumente für Einwanderungsantrag', quantity: 1, unit_price: 28000, amount: 28000 },
  { description: 'Préparation du dossier — programme fédéral des travailleurs qualifiés', quantity: 2, unit_price: 40000, amount: 80000 },
  { description: 'Análisis de elegibilidad — Express Entry CRS cálculo', quantity: 1, unit_price: 22000, amount: 22000 },

  // Long descriptions that test truncation
  { description: 'Comprehensive review of all supporting documentation submitted by the principal applicant and accompanying family members including educational credentials assessment reports and employment reference letters from previous employers', quantity: 1, unit_price: 75000, amount: 75000 },
  { description: 'Preparation and submission of additional documents requested by IRCC processing office in response to procedural fairness letter dated 2025-11-15', quantity: 1, unit_price: 45000, amount: 45000 },

  // Regular entries to fill up
  { description: 'Phone conference with IRCC call centre', quantity: 0.5, unit_price: 35000, amount: 17500 },
  { description: 'Drafting submission letter', quantity: 3, unit_price: 35000, amount: 105000 },
  { description: 'Police certificate coordination — RCMP', quantity: 1, unit_price: 8500, amount: 8500 },
  { description: 'Medical exam follow-up correspondence', quantity: 2, unit_price: 15000, amount: 30000 },
  { description: 'Provincial nomination program review', quantity: 1.5, unit_price: 35000, amount: 52500 },
  { description: 'Labour market impact assessment analysis', quantity: 2, unit_price: 35000, amount: 70000 },
  { description: 'Work permit extension application', quantity: 1, unit_price: 60000, amount: 60000 },
  { description: 'Study permit to PGWP transition advice', quantity: 1, unit_price: 35000, amount: 35000 },
  { description: 'Spousal sponsorship eligibility review', quantity: 2, unit_price: 35000, amount: 70000 },
  { description: 'Common-law partnership documentation prep', quantity: 1, unit_price: 25000, amount: 25000 },
  { description: 'Biometrics appointment scheduling assistance', quantity: 0.5, unit_price: 15000, amount: 7500 },
  { description: 'Express Entry profile creation & submission', quantity: 1, unit_price: 45000, amount: 45000 },
  { description: 'CRS score optimization — education & language', quantity: 2, unit_price: 35000, amount: 70000 },
  { description: 'IRCC webform submission & correspondence', quantity: 3, unit_price: 15000, amount: 45000 },
  { description: 'Judicial review assessment (Federal Court)', quantity: 1, unit_price: 85000, amount: 85000 },
  { description: 'Humanitarian & compassionate grounds memo', quantity: 4, unit_price: 35000, amount: 140000 },
  { description: 'Pre-removal risk assessment (PRRA) prep', quantity: 2, unit_price: 50000, amount: 100000 },
  { description: 'Final invoice reconciliation & account closing', quantity: 0.5, unit_price: 15000, amount: 7500 },
]

// ── Totals ───────────────────────────────────────────────────────────────────

const subtotal = lineItems.reduce((sum, li) => sum + li.amount, 0)
const taxAmount = 0 // Zero tax — must still display
const totalAmount = subtotal + taxAmount
const amountPaid = 75000 // $750.00 partial payment

// ── Fixture Data ─────────────────────────────────────────────────────────────

const fixtureData: InvoicePdfData = {
  firmName: 'Northstar Immigration Law Professional Corporation',
  firmAddress: '200 Bay Street, Suite 3200\nToronto, ON M5J 2J3\nCanada',
  invoiceNumber: 'TEST-20260301-PAGED',
  issueDate: '2026-03-01',
  dueDate: '2026-03-31',
  status: 'sent',
  billTo: {
    name: 'María José García-López',
    email: 'maria.garcia@example.com',
    phone: '+1 (416) 555-0199',
    address: '45 Spadina Avenue, Unit 12\nToronto, ON M5V 2H1',
  },
  matterTitle: 'García-López — Federal Skilled Worker PR Application',
  matterNumber: 'MAT-2026-0042',
  lineItems,
  subtotal,
  taxAmount,
  totalAmount,
  amountPaid,
  payments: [
    {
      payment_date: '2026-02-15',
      payment_method: 'bank_transfer',
      amount: 50000,
      reference: 'E-Transfer #TRX-9281-ABC',
    },
    {
      payment_date: '2026-02-28',
      payment_method: 'credit_card',
      amount: 25000,
      reference: 'Visa ****6411',
    },
  ],
  notes: 'Thank you for choosing Northstar Immigration Law.\n\nPayment is due within 30 days of the issue date. Interest of 1.5% per month will be charged on overdue balances.\n\nPlease reference invoice number TEST-20260301-PAGED when making payment.\n\nFor questions about this invoice, contact billing@northstarlaw.ca or call (416) 555-0100.',
  currency: 'CAD',
}

// ── Generate & Write ─────────────────────────────────────────────────────────

async function main() {
  console.log(`Fixture ID: ${FIXTURE_ID}`)
  console.log(`Line items: ${lineItems.length}`)
  console.log(`Subtotal: $${(subtotal / 100).toFixed(2)} CAD`)
  console.log(`Tax: $${(taxAmount / 100).toFixed(2)} CAD`)
  console.log(`Total: $${(totalAmount / 100).toFixed(2)} CAD`)
  console.log(`Amount Paid: $${(amountPaid / 100).toFixed(2)} CAD`)
  console.log(`Amount Due: $${((totalAmount - amountPaid) / 100).toFixed(2)} CAD`)
  console.log('')

  const pdfBytes = await generateInvoicePdf(fixtureData)
  const outPath = join(process.cwd(), 'test-invoice.pdf')
  writeFileSync(outPath, pdfBytes)

  console.log(`PDF written to: ${outPath}`)
  console.log(`PDF size: ${(pdfBytes.byteLength / 1024).toFixed(1)} KB`)
  console.log('')
  console.log('── Verification Checklist ──')
  console.log(`[ ] Subtotal matches $${(subtotal / 100).toFixed(2)}`)
  console.log('[ ] Tax section shows $0.00')
  console.log(`[ ] Total matches $${(totalAmount / 100).toFixed(2)}`)
  console.log(`[ ] Amount Paid shows ($${(amountPaid / 100).toFixed(2)})`)
  console.log(`[ ] Amount Due shows $${((totalAmount - amountPaid) / 100).toFixed(2)}`)
  console.log('[ ] Invoice # is TEST-20260301-PAGED')
  console.log('[ ] Issue date is March 1, 2026')
  console.log('[ ] Bill-to shows "María José García-López"')
  console.log('[ ] Page breaks exist (2+ pages)')
  console.log('[ ] Non-ASCII chars render (é, ü, ñ, etc.)')
  console.log('[ ] Payments section shows 2 entries')
  console.log('[ ] Notes section present with multi-line text')
  console.log(`\nFixture ID for dev note: ${FIXTURE_ID}`)
}

main().catch((err) => {
  console.error('Failed to generate test invoice PDF:', err)
  process.exit(1)
})
