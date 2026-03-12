import type { EntityAdapter } from '../types'

function parseDate(val: string): string | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export const ghlCalendarAdapter: EntityAdapter = {
  entityType: 'calendar_events',
  targetTable: 'calendar_events',
  displayName: 'Calendar Events',
  sourceDisplayName: 'GHL Calendar Events',
  description: 'Import calendar events and appointments from Go High Level.',
  dependsOn: ['contacts'],
  fieldMappings: [
    {
      sourceColumn: '__source_id',
      targetColumn: '__source_id',
      required: false,
    },
    {
      sourceColumn: 'calendarId',
      targetColumn: '__calendar_source_id',
      required: false,
    },
    {
      sourceColumn: 'contactId',
      targetColumn: '__contact_source_id',
      required: false,
      aliases: ['contact_id', 'Contact ID'],
    },
    {
      sourceColumn: 'title',
      targetColumn: 'title',
      required: true,
      aliases: ['Title', 'subject', 'Subject', 'name', 'Name'],
    },
    {
      sourceColumn: 'calendarName',
      targetColumn: 'description',
      required: false,
      aliases: ['Calendar Name', 'calendar_name'],
      transform: (val, row) => {
        const notes = row.notes ?? ''
        return notes ? `${val} — ${notes}` : val
      },
    },
    {
      sourceColumn: 'startTime',
      targetColumn: 'start_time',
      required: false,
      aliases: ['start_time', 'Start Time', 'startDate'],
      transform: (val) => parseDate(val),
    },
    {
      sourceColumn: 'endTime',
      targetColumn: 'end_time',
      required: false,
      aliases: ['end_time', 'End Time', 'endDate'],
      transform: (val) => parseDate(val),
    },
    {
      sourceColumn: 'status',
      targetColumn: 'status',
      required: false,
      aliases: ['Status', 'appointmentStatus'],
      transform: (val) => {
        const lower = val.toLowerCase()
        if (lower === 'confirmed' || lower === 'showed') return 'confirmed'
        if (lower === 'cancelled' || lower === 'no_show') return 'cancelled'
        return 'tentative'
      },
      defaultValue: 'confirmed',
    },
    {
      sourceColumn: 'address',
      targetColumn: 'location',
      required: false,
      aliases: ['Address', 'location', 'Location'],
    },
  ],
}
