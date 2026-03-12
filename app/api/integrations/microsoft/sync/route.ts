import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import {
  syncCalendarPull,
  syncCalendarPush,
  syncTasksPull,
  syncTasksPush,
} from '@/lib/services/microsoft-sync'

/**
 * POST /api/integrations/microsoft/sync
 *
 * Triggers a manual sync for the current user.
 * Body: { sync_type: 'calendar' | 'tasks' | 'all' }
 */
async function handlePost(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')
    const { sync_type = 'all' } = await request.json()
    const admin = createAdminClient()

    // Get the user's active connection
    const { data: conn } = await admin
      .from('microsoft_connections')
      .select('id, calendar_sync_enabled, tasks_sync_enabled')
      .eq('user_id', auth.userId)
      .eq('is_active', true)
      .single()

    if (!conn) {
      return NextResponse.json(
        { error: 'No active Microsoft connection' },
        { status: 404 }
      )
    }

    let totalCreated = 0
    let totalUpdated = 0
    let totalDeleted = 0
    const errors: string[] = []

    if ((sync_type === 'calendar' || sync_type === 'all') && conn.calendar_sync_enabled) {
      const pullResult = await syncCalendarPull(conn.id, admin)
      const pushResult = await syncCalendarPush(conn.id, admin)
      totalCreated += pullResult.created + pushResult.created
      totalUpdated += pullResult.updated + pushResult.updated
      totalDeleted += pullResult.deleted + pushResult.deleted
      if (!pullResult.success) errors.push('Calendar pull failed')
      if (!pushResult.success) errors.push('Calendar push failed')
    }

    if ((sync_type === 'tasks' || sync_type === 'all') && conn.tasks_sync_enabled) {
      const pullResult = await syncTasksPull(conn.id, admin)
      const pushResult = await syncTasksPush(conn.id, admin)
      totalCreated += pullResult.created + pushResult.created
      totalUpdated += pullResult.updated + pushResult.updated
      totalDeleted += pullResult.deleted + pushResult.deleted
      if (!pullResult.success) errors.push('Tasks pull failed')
      if (!pushResult.success) errors.push('Tasks push failed')
    }

    return NextResponse.json({
      success: errors.length === 0,
      created: totalCreated,
      updated: totalUpdated,
      deleted: totalDeleted,
      errors,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[microsoft/sync] Error:', error)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/integrations/microsoft/sync')
