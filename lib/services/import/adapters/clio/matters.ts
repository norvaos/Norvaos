import type { EntityAdapter } from '../types'

function parseDate(val: string): string | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export const clioMattersAdapter: EntityAdapter = {
  entityType: 'matters',
  targetTable: 'matters',
  displayName: 'Matters',
  sourceDisplayName: 'Clio Matters',
  description: 'Import matters from Clio including case details and billing information.',
  dependsOn: ['contacts'],
  fieldMappings: [
    {
      sourceColumn: 'Id',
      targetColumn: '__source_id',
      required: false,
      aliases: ['id', 'ID', 'Matter ID'],
    },
    {
      sourceColumn: 'Display Number',
      targetColumn: 'matter_number',
      required: false,
      aliases: ['display_number', 'Matter Number', 'File Number', 'file_number'],
      transform: (val) => val ? val.slice(0, 100) : null,
    },
    {
      sourceColumn: 'Description',
      targetColumn: 'title',
      required: true,
      aliases: ['description', 'Title', 'title', 'Matter Name', 'name', 'Name', 'Subject'],
      transform: (val) => val ? val.slice(0, 500) : val,
    },
    {
      sourceColumn: 'Client',
      targetColumn: '__contact_source_id',
      required: false,
      aliases: ['client', 'Client Name', 'client_id', 'Client ID', 'Contact', 'contact_id'],
    },
    {
      sourceColumn: 'Practice Area',
      targetColumn: '__practice_area_name',
      required: false,
      aliases: ['practice_area', 'Area of Law', 'Practice Area Name'],
    },
    {
      sourceColumn: 'Status',
      targetColumn: 'status',
      required: false,
      aliases: ['status'],
      transform: (val) => {
        const lower = val.toLowerCase().trim()
        if (lower === 'open' || lower === 'active' || lower === 'pending') return 'active'
        if (lower === 'closed' || lower === 'closed_won') return 'closed_won'
        if (lower === 'closed_lost' || lower === 'lost' || lower === 'cancelled') return 'closed_lost'
        if (lower === 'on_hold' || lower === 'hold' || lower === 'suspended') return 'on_hold'
        return 'active'
      },
      defaultValue: 'active',
    },
    {
      sourceColumn: 'Billing Method',
      targetColumn: 'billing_type',
      required: false,
      aliases: ['billing_method', 'Billing Type', 'billing_type'],
      transform: (val) => {
        const lower = val.toLowerCase()
        if (lower.includes('hourly')) return 'hourly'
        if (lower.includes('flat') || lower.includes('fixed')) return 'flat_fee'
        if (lower.includes('contingent') || lower.includes('contingency')) return 'contingency'
        return 'hourly'
      },
      defaultValue: 'hourly',
    },
    {
      sourceColumn: 'Open Date',
      targetColumn: 'date_opened',
      required: false,
      aliases: ['open_date', 'Date Opened', 'date_opened', 'Created'],
      transform: (val) => {
        const d = parseDate(val)
        return d ? d.split('T')[0] : new Date().toISOString().split('T')[0]
      },
    },
    {
      sourceColumn: 'Close Date',
      targetColumn: 'date_closed',
      required: false,
      aliases: ['close_date', 'Date Closed', 'date_closed', 'Closed'],
      transform: (val) => {
        const d = parseDate(val)
        return d ? d.split('T')[0] : null
      },
    },
    {
      sourceColumn: 'Responsible Attorney',
      targetColumn: '__responsible_lawyer_name',
      required: false,
      aliases: ['responsible_attorney', 'Lawyer', 'Attorney', 'Assigned To'],
    },
    {
      sourceColumn: 'Description',
      targetColumn: 'description',
      required: false,
      aliases: ['matter_description', 'Details', 'Notes'],
    },
  ],
  validate: (row) => {
    const errors: string[] = []
    if (!row.title) {
      errors.push('Matter title/description is required.')
    }
    return errors
  },
}
