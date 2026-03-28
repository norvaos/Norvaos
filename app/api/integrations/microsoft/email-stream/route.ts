import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { graphFetch, GraphError } from '@/lib/services/microsoft-graph'
import { withTiming } from '@/lib/middleware/request-timing'

// ── Email validation ────────────────────────────────────────────────────────

const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value) && value.length <= 254
}

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
 * GET /api/integrations/microsoft/email-stream
 *
 * Streams emails from Microsoft Graph for a specific contact email address.
 * Does not store anything in the database -- reads directly from Graph API.
 *
 * Query params:
 *   contactEmail (required) -- the contact's email to filter on
 *   limit         (optional, default 50, max 100)
 *   skip          (optional, default 0)
 */
async function handleGet(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'contacts', 'view')

    // ── Parse & validate query params ─────────────────────────────────────
    const { searchParams } = request.nextUrl
    const contactEmail = searchParams.get('contactEmail')?.trim()

    if (!contactEmail) {
      return NextResponse.json(
        { error: 'contactEmail query parameter is required' },
        { status: 400 }
      )
    }

    if (!isValidEmail(contactEmail)) {
      return NextResponse.json(
        { error: 'contactEmail is not a valid email address' },
        { status: 400 }
      )
    }

    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 100)
    const skip = Math.max(parseInt(searchParams.get('skip') || '0', 10) || 0, 0)

    // ── Fetch user's Microsoft connection ─────────────────────────────────
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
        { status: 404 }
      )
    }

    // ── Build OData filter ────────────────────────────────────────────────
    // Escape single quotes in the email for OData filter safety
    const safeEmail = contactEmail.replace(/'/g, "''")
    const filter = `contains(from/emailAddress/address,'${safeEmail}') or contains(toRecipients/emailAddress/address,'${safeEmail}')`

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
      'me/messages',
      {
        params: {
          $filter: filter,
          $top: String(limit),
          $skip: String(skip),
          $orderby: 'receivedDateTime desc',
          $select: selectFields,
        },
      }
    )

    // ── Map response ─────────────────────────────────────────────────────
    const messages = (result.value ?? []).map((msg) => ({
      id: msg.id,
      subject: msg.subject,
      bodyPreview: msg.bodyPreview,
      bodyContent: msg.body?.content ?? null,
      from: msg.from
        ? { name: msg.from.emailAddress.name, address: msg.from.emailAddress.address }
        : null,
      to: msg.toRecipients.map((r) => ({
        name: r.emailAddress.name,
        address: r.emailAddress.address,
      })),
      cc: msg.ccRecipients.map((r) => ({
        name: r.emailAddress.name,
        address: r.emailAddress.address,
      })),
      receivedDateTime: msg.receivedDateTime,
      hasAttachments: msg.hasAttachments,
      isRead: msg.isRead,
      importance: msg.importance,
      conversationId: msg.conversationId,
    }))

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
      // Token refresh failures or consent revoked
      if (error.status === 401) {
        return NextResponse.json(
          { error: 'Microsoft authentication expired. Please reconnect your account.' },
          { status: 401 }
        )
      }
      return NextResponse.json(
        { error: `Microsoft Graph error: ${error.message}` },
        { status: error.status >= 400 ? error.status : 502 }
      )
    }

    console.error('[microsoft/email-stream] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch emails from Microsoft' },
      { status: 500 }
    )
  }
}

export const GET = withTiming(handleGet, 'GET /api/integrations/microsoft/email-stream')
