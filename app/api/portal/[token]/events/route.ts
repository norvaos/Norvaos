import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRateLimiter } from '@/lib/middleware/rate-limit'
import { withTiming } from '@/lib/middleware/request-timing'
import type { PortalEventType } from '@/lib/types/portal'
import { validatePortalToken, PortalAuthError } from '@/lib/services/portal-auth'

const rateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 60 })

// ── Locked event type taxonomy (20 events) ───────────────────────────────────

const VALID_EVENT_TYPES = new Set<PortalEventType>([
  'portal_opened',
  'device_context',
  'section_expanded',
  'section_collapsed',
  'document_upload_started',
  'document_upload_completed',
  'document_upload_failed',
  'questionnaire_step_completed',
  'questionnaire_completed',
  'questionnaire_edit_requested',
  'payment_mark_sent_clicked',
  'payment_credit_card_clicked',
  'payment_instructions_copied',
  'message_section_opened',
  'message_sent',
  'next_action_displayed',
  'next_action_go_clicked',
  'portal_help_contact_clicked',
  'support_email_clicked',
  'support_phone_clicked',
])

const MAX_EVENTS_PER_BATCH = 20
const MAX_EVENT_DATA_SIZE = 2048 // 2KB per event

// ── POST /api/portal/[token]/events ──────────────────────────────────────────

async function handlePost(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const { allowed, retryAfterMs } = await rateLimiter.check(ip)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
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

    // Parse body
    const body = await request.json().catch(() => null)
    if (!body || !Array.isArray(body.events)) {
      return NextResponse.json({ error: 'events array is required' }, { status: 400 })
    }

    const events = body.events as Array<{ event_type?: string; event_data?: unknown }>

    if (events.length === 0) {
      return NextResponse.json({ accepted: 0 })
    }

    if (events.length > MAX_EVENTS_PER_BATCH) {
      return NextResponse.json(
        { error: `Maximum ${MAX_EVENTS_PER_BATCH} events per batch` },
        { status: 400 },
      )
    }

    // Validate each event strictly
    for (const event of events) {
      if (!event.event_type || !VALID_EVENT_TYPES.has(event.event_type as PortalEventType)) {
        return NextResponse.json(
          { error: `Invalid event_type: ${event.event_type}` },
          { status: 400 },
        )
      }

      if (event.event_data !== undefined && event.event_data !== null) {
        if (typeof event.event_data !== 'object' || Array.isArray(event.event_data)) {
          return NextResponse.json(
            { error: 'event_data must be an object' },
            { status: 400 },
          )
        }
        // Check payload size
        const dataStr = JSON.stringify(event.event_data)
        if (dataStr.length > MAX_EVENT_DATA_SIZE) {
          return NextResponse.json(
            { error: `event_data exceeds ${MAX_EVENT_DATA_SIZE} byte limit` },
            { status: 400 },
          )
        }
      }
    }

    // Insert all events
    const rows = events.map((event) => ({
      tenant_id: link.tenant_id,
      portal_link_id: link.id,
      matter_id: link.matter_id,
      contact_id: link.contact_id,
      event_type: event.event_type,
      event_data: event.event_data ?? {},
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (admin as any)
      .from('portal_events')
      .insert(rows)

    if (insertError) {
      console.error('[portal/events] Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to record events' }, { status: 500 })
    }

    return NextResponse.json({ accepted: rows.length })
  } catch (err) {
    console.error('[portal/events] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/portal/[token]/events')
