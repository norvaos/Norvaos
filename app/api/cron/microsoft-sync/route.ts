import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import {
  syncCalendarPull,
  syncCalendarPush,
  syncTasksPull,
  syncTasksPush,
} from '@/lib/services/microsoft-sync'

const MAX_ERROR_COUNT = 10

/**
 * POST /api/cron/microsoft-sync
 *
 * Background worker for syncing all active Microsoft connections.
 * Designed to be called by Vercel Cron (every 15 minutes) or manually.
 */
async function handlePost(request: Request) {
  // Auth check for production
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const admin = createAdminClient()
  const stats = {
    processed: 0,
    calendarSynced: 0,
    tasksSynced: 0,
    errors: 0,
  }

  try {
    // Fetch all active connections that need syncing
    const { data: connections } = await admin
      .from('microsoft_connections')
      .select('id, user_id, tenant_id, calendar_sync_enabled, tasks_sync_enabled, error_count')
      .eq('is_active', true)
      .lt('error_count', MAX_ERROR_COUNT)
      .or('calendar_sync_enabled.eq.true,tasks_sync_enabled.eq.true')

    if (!connections || connections.length === 0) {
      return NextResponse.json({ message: 'No connections to sync', stats })
    }

    for (const conn of connections) {
      try {
        stats.processed++

        if (conn.calendar_sync_enabled) {
          await syncCalendarPull(conn.id, admin)
          await syncCalendarPush(conn.id, admin)
          stats.calendarSynced++
        }

        if (conn.tasks_sync_enabled) {
          await syncTasksPull(conn.id, admin)
          await syncTasksPush(conn.id, admin)
          stats.tasksSynced++
        }

        // Reset error count on success
        await admin
          .from('microsoft_connections')
          .update({ error_count: 0, updated_at: new Date().toISOString() })
          .eq('id', conn.id)
      } catch (err) {
        stats.errors++
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        console.error(`[cron/microsoft-sync] Error for connection ${conn.id}:`, errorMessage)

        // Increment error count
        await admin
          .from('microsoft_connections')
          .update({
            error_count: conn.error_count + 1,
            last_error: errorMessage,
            last_error_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', conn.id)
      }
    }

    return NextResponse.json({ message: 'Sync complete', stats })
  } catch (error) {
    console.error('[cron/microsoft-sync] Fatal error:', error)
    return NextResponse.json({ error: 'Sync cron failed', stats }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/cron/microsoft-sync')
