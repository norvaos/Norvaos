import type { EntityAdapter } from '../types'

function parseDate(val: string): string | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export const clioCommunicationsAdapter: EntityAdapter = {
  entityType: 'conversations',
  targetTable: 'email_logs',
  displayName: 'Communications',
  sourceDisplayName: 'Clio Communications',
  description: 'Import email and call logs from Clio.',
  dependsOn: ['contacts', 'matters'],
  fieldMappings: [
    {
      sourceColumn: '__source_id',
      targetColumn: '__source_id',
      required: false,
    },
    {
      sourceColumn: 'subject',
      targetColumn: 'subject',
      required: false,
      aliases: ['Subject', 'title', 'Title'],
    },
    {
      sourceColumn: 'body',
      targetColumn: 'body',
      required: false,
      aliases: ['Body', 'content', 'Content', 'detail'],
    },
    {
      sourceColumn: 'type',
      targetColumn: 'message_type',
      required: false,
      aliases: ['Type', 'communication_type'],
    },
    {
      sourceColumn: 'senders',
      targetColumn: 'from_address',
      required: false,
      aliases: ['Senders', 'from', 'From'],
    },
    {
      sourceColumn: 'receivers',
      targetColumn: 'to_address',
      required: false,
      aliases: ['Receivers', 'to', 'To'],
    },
    {
      sourceColumn: 'date',
      targetColumn: 'sent_at',
      required: false,
      aliases: ['Date', 'received_at', 'Received At'],
      transform: (val) => parseDate(val) ?? new Date().toISOString(),
    },
    {
      sourceColumn: 'matterId',
      targetColumn: '__matter_source_id',
      required: false,
      aliases: ['matter_id', 'Matter ID'],
    },
  ],
}
