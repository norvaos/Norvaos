import type { EntityAdapter } from '../types'

function parseDate(val: string): string | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function parseCents(val: string): number | null {
  if (!val) return null
  const num = parseFloat(val.replace(/[$,]/g, ''))
  return isNaN(num) ? null : Math.round(num * 100)
}

export const ghlOpportunitiesAdapter: EntityAdapter = {
  entityType: 'leads',
  targetTable: 'leads',
  displayName: 'Opportunities',
  sourceDisplayName: 'GHL Opportunities',
  description: 'Import opportunities from Go High Level as leads in your pipeline.',
  dependsOn: ['contacts'],
  fieldMappings: [
    {
      sourceColumn: 'id',
      targetColumn: '__source_id',
      required: false,
    },
    {
      sourceColumn: 'contactId',
      targetColumn: '__contact_source_id',
      required: false,
      aliases: ['contact_id', 'Contact ID', 'contactID'],
    },
    {
      sourceColumn: 'name',
      targetColumn: '__lead_name',
      required: false,
      aliases: ['Name', 'opportunity_name', 'Opportunity Name', 'title', 'Title'],
    },
    {
      sourceColumn: 'monetaryValue',
      targetColumn: 'estimated_value',
      required: false,
      aliases: ['value', 'Value', 'amount', 'Amount', 'monetary_value'],
      transform: (val) => parseCents(val),
    },
    {
      sourceColumn: 'status',
      targetColumn: 'status',
      required: false,
      aliases: ['Status'],
      transform: (val) => {
        const lower = val.toLowerCase()
        if (lower === 'won' || lower === 'closed won') return 'converted'
        if (lower === 'lost' || lower === 'closed lost') return 'lost'
        if (lower === 'abandoned') return 'lost'
        return 'open'
      },
    },
    {
      sourceColumn: 'source',
      targetColumn: 'source',
      required: false,
      aliases: ['Source', 'lead_source'],
      defaultValue: 'GHL Import',
    },
    {
      sourceColumn: 'createdAt',
      targetColumn: 'created_at',
      required: false,
      aliases: ['Created At', 'date_added', 'dateAdded', 'Date Added'],
      transform: (val) => parseDate(val) ?? new Date().toISOString(),
    },
    {
      sourceColumn: 'notes',
      targetColumn: 'notes',
      required: false,
      aliases: ['Notes', 'description', 'Description'],
    },
  ],
  validate: (row) => {
    const errors: string[] = []
    if (!row.__lead_name && !row.__contact_source_id) {
      errors.push('Either a name or linked contact is required for an opportunity.')
    }
    return errors
  },
}
