import type { EntityAdapter } from '../types'

function parseDate(val: string): string | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * Maps Clio trust balance / payment data into Norva Ledger trust_transactions.
 *
 * Clio tracks trust balances per-matter. Each row becomes a trust deposit
 * transaction (type = 'opening_balance') so the Norva Ledger starts with the
 * correct balances from the migrated firm.
 *
 * Depends on: matters (need matter_id linkage), contacts (optional contact_id)
 */
export const clioTrustBalancesAdapter: EntityAdapter = {
  entityType: 'payments',
  targetTable: 'trust_transactions',
  displayName: 'Trust Balances',
  sourceDisplayName: 'Clio Trust Balances',
  description: 'Import trust account balances from Clio into the Norva Ledger as opening balances.',
  dependsOn: ['contacts', 'matters'],
  fieldMappings: [
    {
      sourceColumn: '__source_id',
      targetColumn: '__source_id',
      required: false,
    },
    {
      sourceColumn: 'matterId',
      targetColumn: '__matter_source_id',
      required: true,
      aliases: ['matter_id', 'Matter ID', 'Matter'],
    },
    {
      sourceColumn: 'contactId',
      targetColumn: '__contact_source_id',
      required: false,
      aliases: ['contact_id', 'Client ID', 'client_id'],
    },
    {
      sourceColumn: 'amount',
      targetColumn: 'amount_cents',
      required: true,
      aliases: ['Amount', 'balance', 'Balance', 'trust_balance', 'Trust Balance'],
      transform: (val) => {
        // Clio reports amounts in dollars  -  convert to cents for Norva Ledger
        const num = parseFloat(val)
        return isNaN(num) ? null : Math.round(num * 100)
      },
    },
    {
      sourceColumn: 'description',
      targetColumn: 'description',
      required: false,
      aliases: ['Description', 'memo', 'Memo', 'notes'],
      defaultValue: 'Opening balance  -  migrated from Clio',
    },
    {
      sourceColumn: 'date',
      targetColumn: 'effective_date',
      required: false,
      aliases: ['Date', 'effective_date', 'created_at', 'Created At'],
      transform: (val) => {
        const d = parseDate(val)
        return d ? d.split('T')[0] : new Date().toISOString().split('T')[0]
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
      sourceColumn: 'referenceNumber',
      targetColumn: 'reference_number',
      required: false,
      aliases: ['Reference', 'reference_number', 'Reference Number', 'ref'],
    },
    {
      sourceColumn: 'paymentMethod',
      targetColumn: 'payment_method',
      required: false,
      aliases: ['Payment Method', 'payment_method', 'Method'],
      defaultValue: 'migration',
    },
  ],
  validate: (row) => {
    const errors: string[] = []
    if (!row.__matter_source_id && !row.matter_id) {
      errors.push('Matter ID is required for trust balance import.')
    }
    if (row.amount_cents === null || row.amount_cents === undefined) {
      errors.push('Trust balance amount is required.')
    }
    if (typeof row.amount_cents === 'number' && row.amount_cents < 0) {
      errors.push('Trust balance cannot be negative  -  use a disbursement instead.')
    }
    return errors
  },
  postProcess: (rows) => {
    // Ensure all rows have transaction_type = 'opening_balance'
    return rows.map((row) => ({
      ...row,
      transaction_type: 'opening_balance',
      is_cleared: true,
    }))
  },
}
