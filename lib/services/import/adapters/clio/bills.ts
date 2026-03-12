import type { EntityAdapter } from '../types'

function parseDate(val: string): string | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export const clioBillsAdapter: EntityAdapter = {
  entityType: 'invoices',
  targetTable: 'invoices',
  displayName: 'Bills / Invoices',
  sourceDisplayName: 'Clio Bills',
  description: 'Import bills and invoices from Clio.',
  dependsOn: ['contacts', 'matters'],
  fieldMappings: [
    {
      sourceColumn: '__source_id',
      targetColumn: '__source_id',
      required: false,
    },
    {
      sourceColumn: 'number',
      targetColumn: 'invoice_number',
      required: false,
      aliases: ['Number', 'bill_number', 'Bill Number'],
    },
    {
      sourceColumn: 'subject',
      targetColumn: 'description',
      required: false,
      aliases: ['Subject', 'description', 'Description'],
    },
    {
      sourceColumn: 'clientId',
      targetColumn: '__contact_source_id',
      required: false,
      aliases: ['client_id', 'Client ID'],
    },
    {
      sourceColumn: 'matterId',
      targetColumn: '__matter_source_id',
      required: false,
      aliases: ['matter_id', 'Matter ID'],
    },
    {
      sourceColumn: 'total',
      targetColumn: 'total_amount',
      required: false,
      aliases: ['Total', 'amount', 'Amount'],
      transform: (val) => {
        const num = parseFloat(val)
        return isNaN(num) ? null : num
      },
    },
    {
      sourceColumn: 'balance',
      targetColumn: 'amount_due',
      required: false,
      aliases: ['Balance', 'amount_due'],
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
        if (lower === 'void' || lower === 'deleted') return 'void'
        if (lower === 'draft') return 'draft'
        return 'sent'
      },
      defaultValue: 'draft',
    },
    {
      sourceColumn: 'issuedAt',
      targetColumn: 'issue_date',
      required: false,
      aliases: ['issued_at', 'Issued At', 'date'],
      transform: (val) => {
        const d = parseDate(val)
        return d ? d.split('T')[0] : null
      },
    },
    {
      sourceColumn: 'dueAt',
      targetColumn: 'due_date',
      required: false,
      aliases: ['due_at', 'Due At', 'due_date'],
      transform: (val) => {
        const d = parseDate(val)
        return d ? d.split('T')[0] : null
      },
    },
    {
      sourceColumn: 'createdAt',
      targetColumn: 'created_at',
      required: false,
      aliases: ['created_at', 'Created At'],
      transform: (val) => parseDate(val) ?? new Date().toISOString(),
    },
  ],
}
