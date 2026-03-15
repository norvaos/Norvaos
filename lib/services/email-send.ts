import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { graphFetch } from '@/lib/services/microsoft-graph'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SendEmailOptions {
  cc?: string[]
  bcc?: string[]
  replyToMessageId?: string
  matterId?: string
  importance?: 'low' | 'normal' | 'high'
  bodyType?: 'text' | 'html'
}

export interface SendEmailResult {
  success: boolean
  messageId: string | null
  error: string | null
}

// ─── Microsoft Connection ID Lookup ──────────────────────────────────────────

async function getConnectionIdForUser(
  admin: SupabaseClient<Database>,
  userId: string
): Promise<string | null> {
  const { data } = await admin
    .from('microsoft_connections')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single()
  return data?.id ?? null
}

// ─── Send Email via Provider ────────────────────────────────────────────────

/**
 * Send an email via Microsoft Graph sendMail API.
 * Creates an email_send_events record for audit trail.
 * Handles reply-to for thread continuity via In-Reply-To header.
 */
export async function sendEmailViaProvider(
  admin: SupabaseClient<Database>,
  accountId: string,
  userId: string,
  to: string[],
  subject: string,
  body: string,
  options: SendEmailOptions = {}
): Promise<SendEmailResult> {
  // Fetch the email account
  const { data: account } = await admin
    .from('email_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('is_active', true)
    .single()

  if (!account) {
    return { success: false, messageId: null, error: 'Email account not found or inactive' }
  }

  // Resolve the microsoft_connections.id for graphFetch
  const connectionId = await getConnectionIdForUser(admin, account.user_id)
  if (!connectionId) {
    return { success: false, messageId: null, error: 'No active Microsoft connection for this user' }
  }

  try {
    // Build the Graph API message object
    const message: Record<string, unknown> = {
      subject,
      body: {
        contentType: options.bodyType === 'html' ? 'HTML' : 'Text',
        content: body,
      },
      toRecipients: to.map((addr) => ({
        emailAddress: { address: addr },
      })),
      importance: options.importance ?? 'normal',
    }

    if (options.cc && options.cc.length > 0) {
      message.ccRecipients = options.cc.map((addr) => ({
        emailAddress: { address: addr },
      }))
    }

    if (options.bcc && options.bcc.length > 0) {
      message.bccRecipients = options.bcc.map((addr) => ({
        emailAddress: { address: addr },
      }))
    }

    // If replying to a thread, use the reply endpoint for thread continuity
    if (options.replyToMessageId) {
      // Reply to existing message — preserves conversation threading
      await graphFetch(connectionId, admin, `me/messages/${options.replyToMessageId}/reply`, {
        method: 'POST',
        body: {
          message: {
            toRecipients: message.toRecipients,
            ccRecipients: message.ccRecipients,
            bccRecipients: message.bccRecipients,
          },
          comment: body,
        },
      })
    } else {
      // New message
      await graphFetch(connectionId, admin, 'me/sendMail', {
        method: 'POST',
        body: {
          message,
          saveToSentItems: true,
        },
      })
    }

    // Create email_send_events record for audit trail
    if (options.matterId) {
      await admin.from('email_send_events').insert({
        tenant_id: account.tenant_id,
        // We don't have the synced message_id yet — it will appear on next sync
        // For now, use a placeholder that references the send event
        message_id: null as unknown as string, // Will be linked on next sync
        email_account_id: accountId,
        matter_id: options.matterId,
        sent_by: userId,
        sent_at: new Date().toISOString(),
      })
    }

    return { success: true, messageId: null, error: null }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to send email'
    console.error('[email-send] Error sending email:', errorMessage)
    return { success: false, messageId: null, error: errorMessage }
  }
}
