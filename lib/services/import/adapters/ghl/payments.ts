import type { EntityAdapter } from '../types'

function parseDate(val: string): string | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export const ghlPaymentsAdapter: EntityAdapter = {
  entityType: 'payments',
  targetTable: 'payments',
  displayName: 'Payments',
  sourceDisplayName: 'GHL Payments',
  description: 'Import payment transactions from Go High Level.',
  dependsOn: ['contacts', 'invoices'],
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
      sourceColumn: 'amount',
      targetColumn: 'amount',
      required: false,
      aliases: ['Amount', 'total', 'Total'],
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
        if (lower === 'succeeded' || lower === 'paid' || lower === 'completed') return 'completed'
        if (lower === 'failed') return 'failed'
        if (lower === 'refunded') return 'refunded'
        return 'pending'
      },
      defaultValue: 'completed',
    },
    {
      sourceColumn: 'paymentMethod',
      targetColumn: 'payment_method',
      required: false,
      aliases: ['payment_method', 'Payment Method', 'method'],
    },
    {
      sourceColumn: 'createdAt',
      targetColumn: 'paid_at',
      required: false,
      aliases: ['created_at', 'Created At', 'date_added'],
      transform: (val) => parseDate(val) ?? new Date().toISOString(),
    },
  ],
}
