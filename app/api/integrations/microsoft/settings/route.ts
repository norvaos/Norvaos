import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * PATCH /api/integrations/microsoft/settings
 *
 * Updates sync preferences for the user's Microsoft connection.
 */
async function handlePatch(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')
    const body = await request.json()

    const allowedFields = ['calendar_sync_enabled', 'tasks_sync_enabled', 'onedrive_enabled'] as const
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

    for (const field of allowedFields) {
      if (typeof body[field] === 'boolean') {
        updates[field] = body[field]
      }
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('microsoft_connections')
      .update(updates)
      .eq('user_id', auth.userId)
      .eq('is_active', true)
      .select(
        'id, calendar_sync_enabled, tasks_sync_enabled, onedrive_enabled'
      )
      .single()

    if (error) {
      throw error
    }

    if (!data) {
      return NextResponse.json(
        { error: 'No active Microsoft connection found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ data })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[microsoft/settings] Error:', error)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}

export const PATCH = withTiming(handlePatch, 'PATCH /api/integrations/microsoft/settings')
