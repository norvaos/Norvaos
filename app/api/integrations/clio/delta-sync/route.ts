/**
 * GET  /api/integrations/clio/delta-sync  -  Get active session status
 * POST /api/integrations/clio/delta-sync  -  Start a new delta-sync session
 * DELETE /api/integrations/clio/delta-sync  -  Stop the active session
 */

import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  startDeltaSyncSession,
  stopDeltaSyncSession,
  getActiveSyncSession,
} from '@/lib/services/clio/delta-sync'

export async function GET() {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()

    const session = await getActiveSyncSession(admin, auth.tenantId)

    if (!session) {
      return NextResponse.json({ success: true, session: null, active: false })
    }

    // Fetch recent runs for observability
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: recentRuns } = await (admin as any)
      .from('delta_sync_runs')
      .select('id, entity_type, status, items_fetched, items_created, items_updated, items_skipped, duration_ms, error_message, created_at')
      .eq('session_id', session.id)
      .order('created_at', { ascending: false })
      .limit(20)

    return NextResponse.json({
      success: true,
      active: true,
      session: {
        id: session.id,
        status: session.status,
        entityTypes: session.entity_types,
        watermarks: session.watermarks,
        expiresAt: session.expires_at,
        totalSynced: session.total_synced,
        totalErrors: session.total_errors,
        pollIntervalSeconds: session.poll_interval_seconds,
      },
      recentRuns: recentRuns ?? [],
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()

    const body = await request.json().catch(() => ({}))
    const { pollIntervalSeconds, entityTypes, durationDays } = body as {
      pollIntervalSeconds?: number
      entityTypes?: string[]
      durationDays?: number
    }

    // Get the active Clio connection
    const { data: connection } = await admin
      .from('platform_connections')
      .select('id')
      .eq('tenant_id', auth.tenantId)
      .eq('platform', 'clio')
      .eq('is_active', true)
      .maybeSingle()

    if (!connection) {
      return NextResponse.json(
        { success: false, error: 'No active Clio connection found. Connect to Clio first.' },
        { status: 400 },
      )
    }

    const { sessionId } = await startDeltaSyncSession(admin, {
      tenantId: auth.tenantId,
      connectionId: connection.id,
      userId: auth.userId,
      pollIntervalSeconds: pollIntervalSeconds ?? 120,
      entityTypes: (entityTypes as ('notes' | 'documents' | 'trust_line_items')[]) ?? undefined,
      durationDays: durationDays ?? 7,
    })

    return NextResponse.json({ success: true, sessionId }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()

    const session = await getActiveSyncSession(admin, auth.tenantId)

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'No active delta-sync session found.' },
        { status: 404 },
      )
    }

    await stopDeltaSyncSession(admin, session.id, auth.tenantId)

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
