import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/integrations/microsoft/disconnect
 *
 * Fully disconnects the user's Microsoft account (hard-delete).
 * Removes the microsoft_connections row and deactivates email_accounts.
 */
async function handlePost() {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')
    const admin = createAdminClient()

    // Hard-delete the microsoft_connections row so reconnect starts fresh
    const { error: deleteError } = await admin
      .from('microsoft_connections')
      .delete()
      .eq('user_id', auth.userId)

    if (deleteError) {
      console.error('[microsoft/disconnect] delete error:', deleteError)
      // Fallback to soft-delete if hard-delete fails (e.g. FK constraints)
      await admin
        .from('microsoft_connections')
        .update({
          is_active: false,
          calendar_sync_enabled: false,
          tasks_sync_enabled: false,
          onedrive_enabled: false,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', auth.userId)
    }

    // Deactivate email accounts for this user so email sync stops
    await admin
      .from('email_accounts')
      .update({
        is_active: false,
        sync_enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', auth.userId)
      .eq('tenant_id', auth.tenantId)
      .eq('provider', 'microsoft')

    // Reset user calendar provider
    await admin
      .from('users')
      .update({
        calendar_provider: null,
        calendar_sync_enabled: false,
      })
      .eq('id', auth.userId)

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[microsoft/disconnect] Error:', error)
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/integrations/microsoft/disconnect')
