import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { graphFetch, GraphError } from '@/lib/services/microsoft-graph'
import { withTiming } from '@/lib/middleware/request-timing'

// ── Graph response shape ────────────────────────────────────────────────────

interface GraphEmailAddress {
  emailAddress: { name: string; address: string }
}

interface GraphMessage {
  id: string
  subject: string | null
  bodyPreview: string | null
  body: { contentType: string; content: string } | null
  from: GraphEmailAddress | null
  toRecipients: GraphEmailAddress[]
  ccRecipients: GraphEmailAddress[]
  receivedDateTime: string
  hasAttachments: boolean
  isRead: boolean
  importance: string
  conversationId: string | null
}

interface GraphMessagesResponse {
  value: GraphMessage[]
  '@odata.count'?: number
  '@odata.nextLink'?: string
}

// ── Handler ─────────────────────────────────────────────────────────────────

/**
 * GET /api/integrations/microsoft/global-inbox
 *
 * Streams ALL recent emails from the authenticated user's Microsoft mailbox.
 * No contact filter — this is the global view for Tier 2 Comm-Center.
 *
 * Also cross-references sender/recipient addresses against the tenant's
 * contacts table to auto-tag emails to their NorvaOS contact record.
 *
 * Query params:
 *   limit  (optional, default 50, max 100)
 *   skip   (optional, default 0)
 *   folder (optional, default 'inbox' — 'inbox' | 'sentitems' | 'all')
 */
async function handleGet(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'contacts', 'view')

    // ── Parse query params ────────────────────────────────────────────────
    const { searchParams } = request.nextUrl
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 100)
    const skip = Math.max(parseInt(searchParams.get('skip') || '0', 10) || 0, 0)
    const folder = searchParams.get('folder') || 'inbox'

    // ── Fetch Microsoft connection ────────────────────────────────────────
    const admin = createAdminClient()

    const { data: connection } = await admin
      .from('microsoft_connections')
      .select('id')
      .eq('user_id', auth.userId)
      .eq('is_active', true)
      .single()

    if (!connection) {
      return NextResponse.json(
        { error: 'No active Microsoft connection found. Please connect your Microsoft account first.' },
        { status: 404 },
      )
    }

    // ── Determine Graph endpoint ──────────────────────────────────────────
    let endpoint = 'me/messages'
    if (folder === 'inbox') {
      endpoint = 'me/mailFolders/inbox/messages'
    } else if (folder === 'sentitems') {
      endpoint = 'me/mailFolders/sentitems/messages'
    }

    const selectFields = [
      'id',
      'subject',
      'bodyPreview',
      'from',
      'toRecipients',
      'ccRecipients',
      'receivedDateTime',
      'hasAttachments',
      'isRead',
      'importance',
      'conversationId',
      'body',
    ].join(',')

    // ── Call Microsoft Graph ──────────────────────────────────────────────
    const result = await graphFetch<GraphMessagesResponse>(
      connection.id,
      admin,
      endpoint,
      {
        params: {
          $top: String(limit),
          $skip: String(skip),
          $orderby: 'receivedDateTime desc',
          $select: selectFields,
        },
      },
    )

    // ── Collect all unique email addresses from this batch ────────────────
    const emailSet = new Set<string>()
    for (const msg of result.value ?? []) {
      if (msg.from?.emailAddress?.address) {
        emailSet.add(msg.from.emailAddress.address.toLowerCase())
      }
      for (const r of msg.toRecipients ?? []) {
        if (r.emailAddress?.address) {
          emailSet.add(r.emailAddress.address.toLowerCase())
        }
      }
    }

    // ── Cross-reference against contacts table for auto-tagging ──────────
    const emailArr = Array.from(emailSet)
    let contactMap: Record<string, { id: string; name: string; client_status: string | null }> = {}

    if (emailArr.length > 0) {
      const { data: contacts } = await admin
        .from('contacts')
        .select('id, first_name, last_name, email_primary, client_status')
        .eq('tenant_id', auth.tenantId)
        .in('email_primary', emailArr)

      if (contacts) {
        for (const c of contacts) {
          if (c.email_primary) {
            contactMap[c.email_primary.toLowerCase()] = {
              id: c.id,
              name: [c.first_name, c.last_name].filter(Boolean).join(' '),
              client_status: c.client_status ?? null,
            }
          }
        }
      }
    }

    // ── Map response with contact tags ────────────────────────────────────
    const messages = (result.value ?? []).map((msg) => {
      const fromAddress = msg.from?.emailAddress?.address?.toLowerCase() ?? ''
      const toAddresses = (msg.toRecipients ?? []).map(r => r.emailAddress?.address?.toLowerCase()).filter(Boolean)

      // Find matching contact: check from address first, then to addresses
      let matchedContact: { id: string; name: string; client_status: string | null } | null = null
      if (contactMap[fromAddress]) {
        matchedContact = contactMap[fromAddress]
      } else {
        for (const addr of toAddresses) {
          if (contactMap[addr]) {
            matchedContact = contactMap[addr]
            break
          }
        }
      }

      return {
        id: msg.id,
        subject: msg.subject,
        bodyPreview: msg.bodyPreview,
        body: msg.body ? { content: msg.body.content } : { content: '' },
        from: msg.from
          ? { emailAddress: { name: msg.from.emailAddress.name, address: msg.from.emailAddress.address } }
          : { emailAddress: { name: 'Unknown', address: '' } },
        toRecipients: msg.toRecipients.map((r) => ({
          emailAddress: { name: r.emailAddress.name, address: r.emailAddress.address },
        })),
        ccRecipients: msg.ccRecipients.map((r) => ({
          emailAddress: { name: r.emailAddress.name, address: r.emailAddress.address },
        })),
        receivedDateTime: msg.receivedDateTime,
        hasAttachments: msg.hasAttachments,
        isRead: msg.isRead,
        importance: msg.importance,
        conversationId: msg.conversationId,
        // Auto-tag fields
        matchedContact,
        isUnknownSender: !matchedContact,
      }
    })

    return NextResponse.json({
      data: messages,
      pagination: {
        limit,
        skip,
        count: messages.length,
        hasMore: !!result['@odata.nextLink'],
      },
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    if (error instanceof GraphError) {
      if (error.status === 401) {
        return NextResponse.json(
          { error: 'Microsoft authentication expired. Please reconnect your account.' },
          { status: 401 },
        )
      }
      return NextResponse.json(
        { error: `Microsoft Graph error: ${error.message}` },
        { status: error.status >= 400 ? error.status : 502 },
      )
    }

    console.error('[microsoft/global-inbox] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch global inbox from Microsoft' },
      { status: 500 },
    )
  }
}

export const GET = withTiming(handleGet, 'GET /api/integrations/microsoft/global-inbox')
