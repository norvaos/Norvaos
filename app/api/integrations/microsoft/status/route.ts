import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/integrations/microsoft/status
 *
 * Returns the current user's Microsoft connection status.
 */
async function handleGet() {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'view')
    const admin = createAdminClient()

    const { data: connection } = await admin
      .from('microsoft_connections')
      .select(
        'id, microsoft_email, microsoft_display_name, calendar_sync_enabled, tasks_sync_enabled, onedrive_enabled, last_calendar_sync_at, last_tasks_sync_at, is_active, error_count, last_error, created_at'
      )
      .eq('user_id', auth.userId)
      .eq('is_active', true)
      .single()

    return NextResponse.json({ data: connection || null })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[microsoft/status] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/integrations/microsoft/status')
