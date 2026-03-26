/**
 * GET /api/cron/clio-delta-sync  -  Cron-triggered delta-sync polling
 *
 * Called every 2 minutes by Vercel Cron (or external scheduler).
 * Iterates all active delta-sync sessions and executes a poll cycle for each.
 *
 * Security: Protected by CRON_SECRET header check.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { executePollCycle, stopDeltaSyncSession } from '@/lib/services/clio/delta-sync'
import { log } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Fetch all active sessions that are due for polling
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sessions, error } = await (admin as any)
    .from('delta_sync_sessions')
    .select('id, tenant_id, connection_id, platform, status, poll_interval_seconds, entity_types, watermarks, expires_at, total_synced, total_errors, last_poll_at')
    .eq('status', 'active')

  if (error || !sessions || sessions.length === 0) {
    return NextResponse.json({ success: true, message: 'No active sessions', sessionsProcessed: 0 })
  }

  const now = new Date()
  let sessionsProcessed = 0
  let totalItemsSynced = 0

  for (const session of sessions) {
    // Check if expired
    if (new Date(session.expires_at) < now) {
      await stopDeltaSyncSession(admin, session.id, session.tenant_id)
      log.info('cron.delta_sync.session_expired', { session_id: session.id })
      continue
    }

    // Check if enough time has passed since last poll
    if (session.last_poll_at) {
      const lastPoll = new Date(session.last_poll_at)
      const elapsedSeconds = (now.getTime() - lastPoll.getTime()) / 1000
      if (elapsedSeconds < session.poll_interval_seconds) {
        continue // Not due yet
      }
    }

    try {
      const results = await executePollCycle(admin, session)
      sessionsProcessed++

      for (const r of results) {
        totalItemsSynced += r.itemsCreated + r.itemsUpdated
      }

      log.info('cron.delta_sync.poll_complete', {
        session_id: session.id,
        tenant_id: session.tenant_id,
        results: results.map((r) => ({
          entity: r.entityType,
          fetched: r.itemsFetched,
          created: r.itemsCreated,
          skipped: r.itemsSkipped,
        })),
      })
    } catch (err) {
      log.error('cron.delta_sync.poll_failed', {
        session_id: session.id,
        error: err instanceof Error ? err.message : 'Unknown',
      })
    }
  }

  return NextResponse.json({
    success: true,
    sessionsProcessed,
    totalItemsSynced,
  })
}
