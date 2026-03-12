import type { EntityAdapter } from '../types'

function parseDate(val: string): string | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export const clioCalendarAdapter: EntityAdapter = {
  entityType: 'calendar_events',
  targetTable: 'calendar_events',
  displayName: 'Calendar Events',
  sourceDisplayName: 'Clio Calendar Events',
  description: 'Import calendar entries, court dates, and deadlines from Clio.',
  dependsOn: ['contacts', 'matters'],
  fieldMappings: [
    {
      sourceColumn: '__source_id',
      targetColumn: '__source_id',
      required: false,
    },
    {
      sourceColumn: 'summary',
      targetColumn: 'title',
      required: true,
      aliases: ['Summary', 'title', 'Title', 'subject', 'Subject'],
    },
    {
      sourceColumn: 'description',
      targetColumn: 'description',
      required: false,
      aliases: ['Description', 'notes', 'Notes'],
    },
    {
      sourceColumn: 'location',
      targetColumn: 'location',
      required: false,
      aliases: ['Location', 'address'],
    },
    {
      sourceColumn: 'startAt',
      targetColumn: 'start_time',
      required: false,
      aliases: ['start_at', 'Start At', 'start_time'],
      transform: (val) => parseDate(val),
    },
    {
      sourceColumn: 'endAt',
      targetColumn: 'end_time',
      required: false,
      aliases: ['end_at', 'End At', 'end_time'],
      transform: (val) => parseDate(val),
    },
    {
      sourceColumn: 'allDay',
      targetColumn: 'all_day',
      required: false,
      aliases: ['all_day', 'All Day'],
      transform: (val) => val === 'true',
      defaultValue: false,
    },
    {
      sourceColumn: 'matterId',
      targetColumn: '__matter_source_id',
      required: false,
      aliases: ['matter_id', 'Matter ID'],
    },
  ],
}
