import type { EntityAdapter } from '../types'

function parseDate(val: string): string | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function parseDuration(val: string): number | null {
  if (!val) return null
  // Try decimal hours first (e.g. "1.5")
  const decimal = parseFloat(val)
  if (!isNaN(decimal)) return Math.round(decimal * 60)
  // Try HH:MM format
  const match = val.match(/^(\d+):(\d+)$/)
  if (match) return parseInt(match[1], 10) * 60 + parseInt(match[2], 10)
  return null
}

export const clioTimeEntriesAdapter: EntityAdapter = {
  entityType: 'time_entries',
  targetTable: 'time_entries',
  displayName: 'Time Entries',
  sourceDisplayName: 'Clio Time Entries',
  description: 'Import time entries from Clio linked to matters.',
  dependsOn: ['matters'],
  fieldMappings: [
    {
      sourceColumn: 'Id',
      targetColumn: '__source_id',
      required: false,
      aliases: ['id', 'ID'],
    },
    {
      sourceColumn: 'Matter',
      targetColumn: '__matter_source_id',
      required: false,
      aliases: ['matter', 'Matter ID', 'matter_id', 'Matter Name'],
    },
    {
      sourceColumn: 'Description',
      targetColumn: 'description',
      required: false,
      aliases: ['description', 'Note', 'note', 'Activity', 'activity', 'Work Description'],
    },
    {
      sourceColumn: 'Quantity',
      targetColumn: 'duration_minutes',
      required: false,
      aliases: ['quantity', 'Hours', 'hours', 'Duration', 'duration', 'Time'],
      transform: (val) => parseDuration(val),
    },
    {
      sourceColumn: 'Rate',
      targetColumn: 'hourly_rate',
      required: false,
      aliases: ['rate', 'Hourly Rate', 'hourly_rate'],
      transform: (val) => {
        const n = parseFloat(val.replace(/[$,]/g, ''))
        return isNaN(n) ? null : Math.round(n * 100)
      },
    },
    {
      sourceColumn: 'Date',
      targetColumn: 'entry_date',
      required: false,
      aliases: ['date', 'Activity Date', 'Work Date'],
      transform: (val) => {
        const d = parseDate(val)
        return d ? d.split('T')[0] : new Date().toISOString().split('T')[0]
      },
    },
    {
      sourceColumn: 'User',
      targetColumn: '__user_name',
      required: false,
      aliases: ['user', 'Timekeeper', 'Lawyer', 'Attorney'],
    },
    {
      sourceColumn: 'Billable',
      targetColumn: 'is_billable',
      required: false,
      aliases: ['billable', 'Is Billable'],
      transform: (val) => {
        const lower = val.toLowerCase()
        return lower === 'true' || lower === 'yes' || lower === '1' || lower === 'billable'
      },
      defaultValue: true,
    },
  ],
}
