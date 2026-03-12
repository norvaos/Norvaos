import type { EntityAdapter } from '../types'

function parseDate(val: string): string | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export const ghlConversationsAdapter: EntityAdapter = {
  entityType: 'conversations',
  targetTable: 'email_logs',
  displayName: 'Conversations',
  sourceDisplayName: 'GHL Conversations',
  description: 'Import SMS, email, and chat messages from Go High Level conversations.',
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
      sourceColumn: 'body',
      targetColumn: 'body',
      required: false,
      aliases: ['Body', 'message', 'Message', 'content', 'Content'],
    },
    {
      sourceColumn: 'direction',
      targetColumn: 'direction',
      required: false,
      aliases: ['Direction'],
      transform: (val) => {
        const lower = val.toLowerCase()
        if (lower === 'inbound' || lower === 'incoming') return 'inbound'
        return 'outbound'
      },
      defaultValue: 'inbound',
    },
    {
      sourceColumn: 'messageType',
      targetColumn: 'message_type',
      required: false,
      aliases: ['message_type', 'type', 'Type'],
    },
    {
      sourceColumn: 'dateAdded',
      targetColumn: 'sent_at',
      required: false,
      aliases: ['date_added', 'Date Added', 'createdAt'],
      transform: (val) => parseDate(val) ?? new Date().toISOString(),
    },
    {
      sourceColumn: 'conversationId',
      targetColumn: 'thread_id',
      required: false,
      aliases: ['conversation_id', 'Conversation ID'],
    },
  ],
}
