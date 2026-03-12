import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'
import { log } from '@/lib/utils/logger'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/front-desk/events
 *
 * Logs non-action events to front_desk_events for KPI computation.
 * These are lightweight telemetry events (queue views, searches, idle gaps,
 * heartbeats) — NOT action state changes.
 *
 * All state-changing actions still go through /api/actions/[actionType].
 * This endpoint is ONLY for passive observation events.
 */

const eventBodySchema = z.object({
  eventType: z.enum([
    'queue_viewed',
    'search_submitted',
    'contact_opened',
    'idle_gap',
    'panel_opened',
    'panel_closed',
    'heartbeat',
  ]),
  eventData: z.record(z.string(), z.unknown()).default({}),
})

async function handlePost(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'front_desk', 'create')

    const body = await request.json()
    const parsed = eventBodySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: `Invalid event payload: ${parsed.error.message}` },
        { status: 400 }
      )
    }

    const { eventType, eventData } = parsed.data
    const admin = createAdminClient()

    // Resolve the user's active shift (if any)
    let shiftId: string | null = null
    try {
      const { data: activeShift } = await (admin
        .from('front_desk_shifts' as any)
        .select('id') as any)
        .eq('user_id', auth.userId)
        .is('ended_at', null)
        .limit(1)
        .maybeSingle()

      if (activeShift) {
        shiftId = (activeShift as { id: string }).id
      }
    } catch {
      // Non-fatal: event still logs without shift linkage
      log.warn('[front-desk/events] Failed to resolve shift_id', {
        user_id: auth.userId,
      })
    }

    // Insert the event
    const { error: insertErr } = await (admin
      .from('front_desk_events' as any)
      .insert({
        tenant_id: auth.tenantId,
        user_id: auth.userId,
        shift_id: shiftId,
        event_type: eventType,
        event_data: eventData,
      }) as any)

    if (insertErr) {
      log.error('[front-desk/events] Insert failed', {
        tenant_id: auth.tenantId,
        user_id: auth.userId,
        event_type: eventType,
        error_message: insertErr.message,
      })
      return NextResponse.json(
        { error: 'Failed to log event' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }

    log.error('[front-desk/events] Unexpected error', {
      error_message: err instanceof Error ? err.message : 'Unknown',
    })

    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/front-desk/events')
