import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { withTiming } from '@/lib/middleware/request-timing'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/sentinel/lockdown
 *
 * Emergency Kill-Switch  -  Directive 2.4
 *
 * Invokes sentinel_emergency_lockdown() RPC which:
 * 1. Counts recent DOCUMENT_TAMPER (or other) events from a user within a window
 * 2. If threshold exceeded: creates lockdown record, locks affected matters,
 *    logs EMERGENCY_LOCKDOWN breach event
 *
 * Body: {
 *   userId: string          -  Target user to evaluate
 *   eventType?: string      -  Event type to check (default: 'DOCUMENT_TAMPER')
 *   threshold?: number      -  Event count threshold (default: 3)
 *   windowMinutes?: number  -  Lookback window in minutes (default: 60)
 * }
 *
 * GET /api/sentinel/lockdown
 *
 * List active lockdowns for the tenant (admin only).
 */
async function handlePost(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit') // Admin-only

    const body = await request.json()
    const {
      userId,
      eventType = 'DOCUMENT_TAMPER',
      threshold = 3,
      windowMinutes = 60,
    } = body as {
      userId: string
      eventType?: string
      threshold?: number
      windowMinutes?: number
    }

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('sentinel_emergency_lockdown', {
      p_user_id: userId,
      p_tenant_id: auth.tenantId,
      p_event_type: eventType,
      p_threshold: threshold,
      p_window_minutes: windowMinutes,
    })

    if (error) {
      console.error('[SENTINEL] Lockdown RPC error:', error)
      return NextResponse.json({ error: 'Lockdown evaluation failed' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[SENTINEL] Lockdown error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function handleGet() {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit') // Admin-only

    const supabase = createAdminClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lockdowns, error } = await (supabase as any)
      .from('sentinel_lockdowns')
      .select(`
        id, user_id, matter_id, lockdown_type, trigger_event,
        trigger_count, is_active, locked_at, unlocked_at, unlocked_by, details
      `)
      .eq('tenant_id', auth.tenantId)
      .order('locked_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('[SENTINEL] List lockdowns error:', error)
      return NextResponse.json({ error: 'Failed to fetch lockdowns' }, { status: 500 })
    }

    const activeLockdowns = (lockdowns ?? []).filter((l: { is_active: boolean }) => l.is_active)

    return NextResponse.json({
      lockdowns: lockdowns ?? [],
      activeLockdownCount: activeLockdowns.length,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[SENTINEL] List lockdowns error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/sentinel/lockdown')
export const GET = withTiming(handleGet, 'GET /api/sentinel/lockdown')
