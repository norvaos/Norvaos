import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { graphFetch } from '@/lib/services/microsoft-graph'
import { log } from '@/lib/utils/logger'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EmailSyncResult {
  success: boolean
  created: number
  updated: number
  errors: Array<{ messageId: string; message: string }>
}

interface MsEmailMessage {
  id: string
  conversationId: string
  subject: string | null
  bodyPreview?: string
  body?: { content: string; contentType: string }
  from?: { emailAddress: { address: string; name?: string } }
  toRecipients?: Array<{ emailAddress: { address: string; name?: string } }>
  ccRecipients?: Array<{ emailAddress: { address: string; name?: string } }>
  bccRecipients?: Array<{ emailAddress: { address: string; name?: string } }>
  hasAttachments?: boolean
  isRead?: boolean
  importance?: string
  receivedDateTime?: string
  sentDateTime?: string
  lastModifiedDateTime: string
  '@removed'?: { reason: string }
}

interface MsEmailResponse {
  value: MsEmailMessage[]
  '@odata.deltaLink'?: string
  '@odata.nextLink'?: string
}

const MAX_CONSECUTIVE_ERRORS = 10

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getEmailAccount(emailAccountId: string, admin: SupabaseClient<Database>) {
  return admin
    .from('email_accounts')
    .select('*')
    .eq('id', emailAccountId)
    .eq('is_active', true)
    .single()
}

/**
 * Map MS Graph recipient array to JSONB-friendly format.
 */
function mapRecipients(
  recipients?: Array<{ emailAddress: { address: string; name?: string } }>
): Array<{ address: string; name: string }> {
  if (!recipients) return []
  return recipients.map((r) => ({
    address: r.emailAddress.address,
    name: r.emailAddress.name ?? '',
  }))
}

/**
 * Collect all participant email addresses from an MS message.
 */
function collectParticipantEmails(msg: MsEmailMessage): string[] {
  const emails = new Set<string>()
  if (msg.from?.emailAddress?.address) {
    emails.add(msg.from.emailAddress.address.toLowerCase())
  }
  for (const r of msg.toRecipients ?? []) {
    if (r.emailAddress?.address) emails.add(r.emailAddress.address.toLowerCase())
  }
  for (const r of msg.ccRecipients ?? []) {
    if (r.emailAddress?.address) emails.add(r.emailAddress.address.toLowerCase())
  }
  return Array.from(emails)
}

/**
 * Determine direction based on whether the from address matches the account.
 */
function determineDirection(msg: MsEmailMessage, accountEmail: string): 'inbound' | 'outbound' {
  const fromAddr = msg.from?.emailAddress?.address?.toLowerCase()
  return fromAddr === accountEmail.toLowerCase() ? 'outbound' : 'inbound'
}

// ─── Microsoft Connection ID Lookup ──────────────────────────────────────────
// Email accounts use their own token storage, but graphFetch needs a
// microsoft_connections.id. We create a helper that resolves the connection
// for the same user, or falls back to using email_accounts tokens directly.

async function getConnectionIdForAccount(
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

// ─── Sync Inbound Emails ────────────────────────────────────────────────────

/**
 * Sync inbound emails for a given email account using Microsoft Graph
 * delta queries. Upserts messages into email_messages, groups into
 * email_threads by conversationId, and updates the delta_link.
 */
export async function syncInboundEmails(
  admin: SupabaseClient<Database>,
  emailAccountId: string
): Promise<EmailSyncResult> {
  const result: EmailSyncResult = { success: true, created: 0, updated: 0, errors: [] }

  const { data: account } = await getEmailAccount(emailAccountId, admin)
  if (!account) throw new Error('Email account not found or inactive')

  // Resolve the microsoft_connections.id for graphFetch
  const connectionId = await getConnectionIdForAccount(admin, account.user_id)
  if (!connectionId) {
    throw new Error('No active Microsoft connection found for this user')
  }

  try {
    let url: string
    if (account.delta_link) {
      url = account.delta_link
    } else {
      // Initial sync: fetch messages from last 90 days
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - 90)
      url = `me/mailFolders/inbox/messages/delta?$filter=receivedDateTime ge ${startDate.toISOString()}&$select=id,conversationId,subject,body,bodyPreview,from,toRecipients,ccRecipients,bccRecipients,hasAttachments,isRead,importance,receivedDateTime,sentDateTime,lastModifiedDateTime&$top=100`
    }

    let hasMore = true
    while (hasMore) {
      const response = await graphFetch<MsEmailResponse>(connectionId, admin, url)

      for (const msMsg of response.value) {
        try {
          if (msMsg['@removed']) {
            // Message deleted  -  we don't hard-delete, just skip
            continue
          }

          // 1. Upsert thread by conversationId
          const threadData = {
            tenant_id: account.tenant_id,
            conversation_id: msMsg.conversationId,
            subject: msMsg.subject,
            last_message_at: msMsg.receivedDateTime ?? new Date().toISOString(),
            participant_emails: collectParticipantEmails(msMsg),
            updated_at: new Date().toISOString(),
          }

          const { data: thread } = await admin
            .from('email_threads')
            .upsert(
              {
                ...threadData,
                message_count: 1,
              },
              { onConflict: 'tenant_id,conversation_id' }
            )
            .select('id, message_count, participant_emails')
            .single()

          if (!thread) {
            result.errors.push({ messageId: msMsg.id, message: 'Failed to upsert thread' })
            continue
          }

          // Update thread participant emails (merge)
          const existingEmails = new Set(thread.participant_emails ?? [])
          const newEmails = collectParticipantEmails(msMsg)
          let emailsChanged = false
          for (const e of newEmails) {
            if (!existingEmails.has(e)) {
              existingEmails.add(e)
              emailsChanged = true
            }
          }

          if (emailsChanged) {
            await admin
              .from('email_threads')
              .update({
                participant_emails: Array.from(existingEmails),
                updated_at: new Date().toISOString(),
              })
              .eq('id', thread.id)
          }

          // 2. Upsert message
          const direction = determineDirection(msMsg, account.email_address)
          const messageData = {
            tenant_id: account.tenant_id,
            thread_id: thread.id,
            message_id: msMsg.id,
            email_account_id: emailAccountId,
            direction,
            from_address: msMsg.from?.emailAddress?.address ?? null,
            from_name: msMsg.from?.emailAddress?.name ?? null,
            to_addresses: mapRecipients(msMsg.toRecipients),
            cc_addresses: mapRecipients(msMsg.ccRecipients),
            bcc_addresses: mapRecipients(msMsg.bccRecipients),
            subject: msMsg.subject,
            body_text: msMsg.bodyPreview ?? null,
            body_html: msMsg.body?.contentType === 'html' ? msMsg.body.content : null,
            has_attachments: msMsg.hasAttachments ?? false,
            is_read: msMsg.isRead ?? true,
            importance: msMsg.importance ?? 'normal',
            received_at: msMsg.receivedDateTime ?? null,
            sent_at: msMsg.sentDateTime ?? null,
            synced_at: new Date().toISOString(),
          }

          // Check if exists
          const { data: existing } = await admin
            .from('email_messages')
            .select('id')
            .eq('tenant_id', account.tenant_id)
            .eq('message_id', msMsg.id)
            .maybeSingle()

          if (existing) {
            await admin
              .from('email_messages')
              .update({
                is_read: messageData.is_read,
                synced_at: messageData.synced_at,
              })
              .eq('id', existing.id)
            result.updated++
          } else {
            await admin
              .from('email_messages')
              .insert(messageData)
            result.created++
          }

          // 3. Update thread message count and last_message_at
          const { count } = await admin
            .from('email_messages')
            .select('id', { count: 'exact', head: true })
            .eq('thread_id', thread.id)

          await admin
            .from('email_threads')
            .update({
              message_count: count ?? 1,
              last_message_at: msMsg.receivedDateTime ?? new Date().toISOString(),
              last_sender_account_id: direction === 'outbound' ? emailAccountId : thread.id ? undefined : null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', thread.id)
        } catch (msgErr) {
          const errMessage = msgErr instanceof Error ? msgErr.message : 'Unknown error'
          result.errors.push({ messageId: msMsg.id, message: errMessage })
        }
      }

      // Pagination
      if (response['@odata.nextLink']) {
        url = response['@odata.nextLink']
      } else {
        hasMore = false
        // Save delta link for next incremental sync
        if (response['@odata.deltaLink']) {
          await admin
            .from('email_accounts')
            .update({
              delta_link: response['@odata.deltaLink'],
              last_sync_at: new Date().toISOString(),
              error_count: 0,
              last_error: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', emailAccountId)
        }
      }
    }
  } catch (err) {
    result.success = false
    const errorMessage = err instanceof Error ? err.message : 'Unknown sync error'

    // Increment error count, disable after MAX_CONSECUTIVE_ERRORS
    const newErrorCount = (account.error_count ?? 0) + 1
    await admin
      .from('email_accounts')
      .update({
        error_count: newErrorCount,
        last_error: errorMessage,
        sync_enabled: newErrorCount < MAX_CONSECUTIVE_ERRORS,
        updated_at: new Date().toISOString(),
      })
      .eq('id', emailAccountId)

    if (newErrorCount >= MAX_CONSECUTIVE_ERRORS) {
      log.error('email.sync.account_disabled', {
        email_account_id: emailAccountId,
        error_count: newErrorCount,
      })
    }

    result.errors.push({ messageId: 'sync', message: errorMessage })
  }

  return result
}

// ─── Full Resync ────────────────────────────────────────────────────────────

/**
 * Clear the delta link and perform a full resync of the email account.
 * Use when data appears stale or after resolving sync errors.
 */
export async function fullResync(
  admin: SupabaseClient<Database>,
  emailAccountId: string
): Promise<EmailSyncResult> {
  // Clear the delta link to force a full sync
  await admin
    .from('email_accounts')
    .update({
      delta_link: null,
      error_count: 0,
      last_error: null,
      sync_enabled: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', emailAccountId)

  return syncInboundEmails(admin, emailAccountId)
}
