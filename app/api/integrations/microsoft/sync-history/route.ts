import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/integrations/microsoft/sync-history
 *
 * Returns recent sync log entries for the current user.
 */
async function handleGet() {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'view')
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('sync_log')
      .select(
        'id, sync_type, direction, status, items_created, items_updated, items_deleted, error_message, started_at, completed_at'
      )
      .eq('user_id', auth.userId)
      .order('started_at', { ascending: false })
      .limit(20)

    if (error) throw error

    return NextResponse.json({ data: data || [] })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[microsoft/sync-history] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch sync history' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/integrations/microsoft/sync-history')
