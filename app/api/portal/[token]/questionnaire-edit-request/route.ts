import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/middleware/rate-limit'

const rateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 10 })

// ── Token Validation ─────────────────────────────────────────────────────────

async function validateToken(admin: ReturnType<typeof createAdminClient>, token: string) {
  const { data: link, error } = await admin
    .from('portal_links')
    .select('id, matter_id, tenant_id, contact_id, expires_at, is_active')
    .eq('token', token)
    .eq('is_active', true)
    .single()

  if (error || !link) {
    return { error: NextResponse.json({ error: 'Invalid token' }, { status: 404 }) }
  }
  if (new Date(link.expires_at) < new Date()) {
    return { error: NextResponse.json({ error: 'Link expired' }, { status: 410 }) }
  }
  return { link }
}

// ── GET — Check if pending edit request exists ───────────────────────────────

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params
    const admin = createAdminClient()

    const result = await validateToken(admin, token)
    if (result.error) return result.error
    const { link } = result

    // Find the completed session for this portal link
    const { data: session } = await admin
      .from('ircc_questionnaire_sessions')
      .select('id')
      .eq('portal_link_id', link.id)
      .eq('status', 'completed')
      .limit(1)
      .maybeSingle()

    if (!session) {
      return NextResponse.json({ hasPendingRequest: false })
    }

    // Check for pending edit request
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pending } = await (admin as any)
      .from('questionnaire_edit_requests')
      .select('id')
      .eq('session_id', session.id)
      .eq('status', 'pending')
      .limit(1)

    return NextResponse.json({
      hasPendingRequest: !!(pending && pending.length > 0),
    })
  } catch (err) {
    console.error('[portal/questionnaire-edit-request] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── POST — Submit edit request ───────────────────────────────────────────────

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const { allowed, retryAfterMs } = rateLimiter.check(ip)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } },
      )
    }

    const { token } = await params
    const admin = createAdminClient()

    const result = await validateToken(admin, token)
    if (result.error) return result.error
    const { link } = result

    // Parse body
    const body = await request.json().catch(() => ({}))
    const reason = (body.reason as string ?? '').trim()

    if (!reason) {
      return NextResponse.json({ error: 'reason is required' }, { status: 400 })
    }
    if (reason.length > 500) {
      return NextResponse.json({ error: 'reason must be 500 characters or less' }, { status: 400 })
    }

    // Find completed session for this portal link
    const { data: session } = await admin
      .from('ircc_questionnaire_sessions')
      .select('id')
      .eq('portal_link_id', link.id)
      .eq('status', 'completed')
      .limit(1)
      .maybeSingle()

    if (!session) {
      return NextResponse.json(
        { error: 'No completed questionnaire found' },
        { status: 404 },
      )
    }

    // Dedup: check for existing pending request
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingPending } = await (admin as any)
      .from('questionnaire_edit_requests')
      .select('id')
      .eq('session_id', session.id)
      .eq('status', 'pending')
      .limit(1)

    if (existingPending && existingPending.length > 0) {
      return NextResponse.json({ success: true, alreadyRequested: true })
    }

    // Insert edit request
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (admin as any)
      .from('questionnaire_edit_requests')
      .insert({
        tenant_id: link.tenant_id,
        matter_id: link.matter_id,
        portal_link_id: link.id,
        session_id: session.id,
        contact_id: link.contact_id,
        reason,
      })

    if (insertError) {
      console.error('[portal/questionnaire-edit-request] Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to submit request' }, { status: 500 })
    }

    // Log to activities (visible to staff in matter activity feed)
    admin
      .from('activities')
      .insert({
        tenant_id: link.tenant_id,
        matter_id: link.matter_id,
        contact_id: link.contact_id,
        activity_type: 'portal_questionnaire_edit_requested',
        title: 'Client requested questionnaire edit via portal',
        description: `Client reason: "${reason}"`,
        created_by: link.contact_id,
      })
      .then(() => {})

    // Track to portal_events analytics
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(admin as any)
      .from('portal_events')
      .insert({
        tenant_id: link.tenant_id,
        portal_link_id: link.id,
        matter_id: link.matter_id,
        contact_id: link.contact_id,
        event_type: 'questionnaire_edit_requested',
        event_data: { session_id: session.id, reason_length: reason.length },
      })
      .then(() => {})

    return NextResponse.json({ success: true, alreadyRequested: false })
  } catch (err) {
    console.error('[portal/questionnaire-edit-request] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
