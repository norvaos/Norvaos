/**
 * Supabase Realtime broadcast for document status changes.
 *
 * When a document's status changes (uploaded, classified, reviewed, etc.),
 * this service broadcasts the update on a matter-scoped Realtime channel.
 * The Client Portal subscribes to `documents:{matterId}` to receive
 * immediate updates without polling.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/utils/logger'

export interface DocumentStatusEvent {
  documentId: string
  matterId: string
  fileName: string
  status: string
  category?: string | null
  updatedAt: string
}

/**
 * Broadcasts a document status change via Supabase Realtime.
 *
 * The Client Portal listens on channel `documents:{matterId}` for
 * events of type `document_status_changed`.
 *
 * This uses Supabase's Realtime Broadcast (server-side) which does not
 * require RLS  -  the admin client sends directly.
 */
export async function broadcastDocumentStatus(
  event: DocumentStatusEvent
): Promise<void> {
  try {
    const admin = createAdminClient()
    const channelName = `documents:${event.matterId}`

    const channel = admin.channel(channelName)

    await channel.send({
      type: 'broadcast',
      event: 'document_status_changed',
      payload: {
        document_id: event.documentId,
        matter_id: event.matterId,
        file_name: event.fileName,
        status: event.status,
        category: event.category ?? null,
        updated_at: event.updatedAt,
      },
    })

    // Unsubscribe the server-side channel after sending
    admin.removeChannel(channel)

    log.info('[document-realtime] Broadcast sent', {
      matterId: event.matterId,
      documentId: event.documentId,
      status: event.status,
    })
  } catch (err) {
    // Non-fatal: log and continue. The portal will fall back to polling.
    log.warn('[document-realtime] Broadcast failed', {
      matterId: event.matterId,
      documentId: event.documentId,
      error: err instanceof Error ? err.message : 'Unknown',
    })
  }
}
