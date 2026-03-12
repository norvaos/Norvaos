import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { ghlFetch, ghlPaginateAll } from '../client'

interface GhlConversation {
  id: string
  contactId?: string
  type?: string
  dateAdded?: string
  dateUpdated?: string
}

interface GhlMessage {
  id: string
  conversationId: string
  contactId?: string
  body?: string
  direction?: string
  messageType?: string
  dateAdded?: string
  attachments?: unknown[]
  userId?: string
}

export async function fetchGhlConversations(
  connectionId: string,
  admin: SupabaseClient<Database>,
  locationId: string,
): Promise<{ rows: Record<string, string>[]; totalRows: number }> {
  // Fetch all conversations
  const conversations = await ghlPaginateAll<GhlConversation>(
    connectionId, admin, 'conversations/search',
    'conversations', { locationId },
  )

  const rows: Record<string, string>[] = []

  // For each conversation, fetch messages (limit to first 100 per conversation for safety)
  for (const conv of conversations) {
    try {
      const msgData = await ghlFetch<{ messages: GhlMessage[] }>(
        connectionId, admin,
        `conversations/${conv.id}/messages`,
      )

      for (const msg of msgData.messages ?? []) {
        rows.push({
          __source_id: msg.id,
          conversationId: conv.id,
          contactId: msg.contactId ?? conv.contactId ?? '',
          body: msg.body ?? '',
          direction: msg.direction ?? '',
          messageType: msg.messageType ?? '',
          dateAdded: msg.dateAdded ?? '',
          userId: msg.userId ?? '',
          hasAttachments: (msg.attachments?.length ?? 0) > 0 ? 'true' : 'false',
        })
      }
    } catch {
      // Skip conversations with no messages or access issues
    }
  }

  return { rows, totalRows: rows.length }
}
