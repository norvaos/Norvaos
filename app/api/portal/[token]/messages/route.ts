import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/middleware/rate-limit'
import { withTiming } from '@/lib/middleware/request-timing'
import { validatePortalToken, PortalAuthError } from '@/lib/services/portal-auth'

// 30 requests per minute per IP  -  prevents brute-force token enumeration
const tokenLookupLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30 })

// ── GET /api/portal/[token]/messages ─────────────────────────────────────────

/**
 * Fetch all client-visible comments for the matter associated with this portal link.
 * Returns messages with resolved author names, ordered chronologically.
 */
async function handleGet(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    // Rate limit by IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const { allowed, retryAfterMs } = tokenLookupLimiter.check(ip)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
      )
    }

    const { token } = await params

    let link: Awaited<ReturnType<typeof validatePortalToken>>
    try {
      link = await validatePortalToken(token)
    } catch (error) {
      if (error instanceof PortalAuthError) {
        return NextResponse.json({ error: error.message }, { status: error.status })
      }
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    const admin = createAdminClient()

    // Fetch all client-visible, active comments for this matter
    const { data: comments, error: commentsError } = await admin
      .from('matter_comments')
      .select('id, content, author_type, author_user_id, author_contact_id, created_at, parent_id')
      .eq('matter_id', link.matter_id)
      .eq('is_internal', false)
      .eq('is_active', true)
      .order('created_at', { ascending: true })

    if (commentsError) {
      console.error('[portal-messages] Comments fetch error:', commentsError)
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
    }

    if (!comments || comments.length === 0) {
      return NextResponse.json({ messages: [] })
    }

    // Collect unique author IDs by type (no FK joins available)
    const userIds = [
      ...new Set(
        comments
          .filter((c) => c.author_type === 'user' && c.author_user_id)
          .map((c) => c.author_user_id!),
      ),
    ]
    const contactIds = [
      ...new Set(
        comments
          .filter((c) => c.author_type === 'client' && c.author_contact_id)
          .map((c) => c.author_contact_id!),
      ),
    ]

    // Resolve user + contact names in parallel
    const userMap = new Map<string, string>()
    const contactMap = new Map<string, string>()

    const [usersResult, contactsResult] = await Promise.all([
      userIds.length > 0
        ? admin.from('users').select('id, first_name, last_name').in('id', userIds)
        : Promise.resolve({ data: null }),
      contactIds.length > 0
        ? admin.from('contacts').select('id, first_name, last_name').in('id', contactIds)
        : Promise.resolve({ data: null }),
    ])

    if (usersResult.data) {
      for (const u of usersResult.data) {
        const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Staff'
        userMap.set(u.id, name)
      }
    }
    if (contactsResult.data) {
      for (const c of contactsResult.data) {
        const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Client'
        contactMap.set(c.id, name)
      }
    }

    // Build response with resolved author names
    const messages = comments.map((c) => {
      let author_name = 'Unknown'
      if (c.author_type === 'user' && c.author_user_id) {
        author_name = userMap.get(c.author_user_id) ?? 'Staff'
      } else if (c.author_type === 'client' && c.author_contact_id) {
        author_name = contactMap.get(c.author_contact_id) ?? 'Client'
      }

      return {
        id: c.id,
        content: c.content,
        author_name,
        author_type: c.author_type,
        created_at: c.created_at,
        parent_id: c.parent_id,
      }
    })

    return NextResponse.json({ messages })
  } catch (error) {
    console.error('[portal-messages] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── POST /api/portal/[token]/messages ────────────────────────────────────────

/**
 * Create a new client-visible comment from the portal.
 *
 * Body: { content: string, parent_id?: string }
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    // Rate limit by IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const { allowed, retryAfterMs } = tokenLookupLimiter.check(ip)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
      )
    }

    const { token } = await params

    let link: Awaited<ReturnType<typeof validatePortalToken>>
    try {
      link = await validatePortalToken(token)
    } catch (error) {
      if (error instanceof PortalAuthError) {
        return NextResponse.json({ error: error.message }, { status: error.status })
      }
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    const admin = createAdminClient()

    // Parse body
    const body = await request.json()
    const { content, parent_id } = body as {
      content: string
      parent_id?: string
    }

    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json(
        { error: 'content is required' },
        { status: 400 },
      )
    }

    // Resolve contact_id: prefer portal link's contact_id, fall back to matter_people
    let contactId: string | null = link.contact_id ?? null

    if (!contactId) {
      const { data: primaryPerson } = await admin
        .from('matter_people')
        .select('contact_id')
        .eq('matter_id', link.matter_id)
        .eq('person_role', 'client')
        .limit(1)
        .maybeSingle()

      contactId = primaryPerson?.contact_id ?? null
    }

    if (!contactId) {
      return NextResponse.json(
        { error: 'No contact found for this portal link' },
        { status: 404 },
      )
    }

    // Insert the new comment
    const { data: newComment, error: insertError } = await admin
      .from('matter_comments')
      .insert({
        tenant_id: link.tenant_id,
        matter_id: link.matter_id,
        author_type: 'client',
        author_contact_id: contactId,
        content: content.trim(),
        is_internal: false,
        parent_id: parent_id ?? null,
      })
      .select('id, content, author_type, author_contact_id, created_at, parent_id')
      .single()

    if (insertError || !newComment) {
      console.error('[portal-messages] Insert error:', insertError)
      return NextResponse.json(
        { error: 'Failed to send message' },
        { status: 500 },
      )
    }

    // Resolve the contact name for the response
    let author_name = 'Client'
    const { data: contact } = await admin
      .from('contacts')
      .select('first_name, last_name')
      .eq('id', contactId)
      .single()

    if (contact) {
      author_name = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Client'
    }

    return NextResponse.json({
      message: {
        id: newComment.id,
        content: newComment.content,
        author_name,
        author_type: newComment.author_type,
        created_at: newComment.created_at,
        parent_id: newComment.parent_id,
      },
    })
  } catch (error) {
    console.error('[portal-messages] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── PATCH /api/portal/[token]/messages ────────────────────────────────────────

/**
 * Update client_read_at on the portal link when the client views messages.
 * Used for unread message tracking in the portal summary.
 */
async function handlePatch(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const { allowed, retryAfterMs } = tokenLookupLimiter.check(ip)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } },
      )
    }

    const { token } = await params

    let link: Awaited<ReturnType<typeof validatePortalToken>>
    try {
      link = await validatePortalToken(token)
    } catch (error) {
      if (error instanceof PortalAuthError) {
        return NextResponse.json({ error: error.message }, { status: error.status })
      }
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    const admin = createAdminClient()

    // Update client_read_at to now
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from('portal_links')
      .update({ client_read_at: new Date().toISOString() })
      .eq('id', link.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[portal-messages] PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/portal/[token]/messages')
export const POST = withTiming(handlePost, 'POST /api/portal/[token]/messages')
export const PATCH = withTiming(handlePatch, 'PATCH /api/portal/[token]/messages')
