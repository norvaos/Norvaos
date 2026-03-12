import type { EntityAdapter } from '../types'

function parseDate(val: string): string | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export const ghlInvoicesAdapter: EntityAdapter = {
  entityType: 'invoices',
  targetTable: 'invoices',
  displayName: 'Invoices',
  sourceDisplayName: 'GHL Invoices',
  description: 'Import invoices and billing records from Go High Level.',
  dependsOn: ['contacts'],
  fieldMappings: [
    {
      sourceColumn: '__source_id',
      targetColumn: '__source_id',
      required: false,
    },
    {
      sourceColumn: 'contactId',
      targetColumn: '__contact_source_id',
      required: false,
      aliases: ['contact_id', 'Contact ID'],
    },
    {
      sourceColumn: 'invoiceNumber',
      targetColumn: 'invoice_number',
      required: false,
      aliases: ['invoice_number', 'Invoice Number', 'number'],
    },
    {
      sourceColumn: 'name',
      targetColumn: 'description',
      required: false,
      aliases: ['Name', 'title', 'Title', 'subject'],
    },
    {
      sourceColumn: 'totalAmount',
      targetColumn: 'total_amount',
      required: false,
      aliases: ['total_amount', 'Total Amount', 'amount', 'Amount'],
      transform: (val) => {
        const num = parseFloat(val)
        return isNaN(num) ? null : num
      },
    },
    {
      sourceColumn: 'amountDue',
      targetColumn: 'amount_due',
      required: false,
      aliases: ['amount_due', 'Amount Due', 'balance'],
      transform: (val) => {
        const num = parseFloat(val)
        return isNaN(num) ? null : num
      },
    },
    {
      sourceColumn: 'currency',
      targetColumn: 'currency',
      required: false,
      aliases: ['Currency'],
      defaultValue: 'CAD',
    },
    {
      sourceColumn: 'status',
      targetColumn: 'status',
      required: false,
      aliases: ['Status'],
      transform: (val) => {
        const lower = val.toLowerCase()
        if (lower === 'paid') return 'paid'
        if (lower === 'void' || lower === 'voided') return 'void'
        if (lower === 'draft') return 'draft'
        return 'sent'
      },
      defaultValue: 'draft',
    },
    {
      sourceColumn: 'issueDate',
      targetColumn: 'issue_date',
      required: false,
      aliases: ['issue_date', 'Issue Date', 'date'],
      transform: (val) => {
        const d = parseDate(val)
        return d ? d.split('T')[0] : null
      },
    },
    {
      sourceColumn: 'dueDate',
      targetColumn: 'due_date',
      required: false,
      aliases: ['due_date', 'Due Date'],
      transform: (val) => {
        const d = parseDate(val)
        return d ? d.split('T')[0] : null
      },
    },
    {
      sourceColumn: 'createdAt',
      targetColumn: 'created_at',
      required: false,
      aliases: ['created_at', 'Created At', 'date_added'],
      transform: (val) => parseDate(val) ?? new Date().toISOString(),
    },
  ],
}
