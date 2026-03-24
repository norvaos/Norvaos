import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/integrations/microsoft/disconnect
 *
 * Disconnects the user's Microsoft account (soft-delete).
 */
async function handlePost() {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')
    const admin = createAdminClient()

    // Soft-delete the connection
    // Note: microsoft_connections is 1:1 with users (unique on user_id),
    // so filtering by user_id alone is sufficient and avoids tenant_id mismatches.
    const { error: updateError } = await admin
      .from('microsoft_connections')
      .update({
        is_active: false,
        calendar_sync_enabled: false,
        tasks_sync_enabled: false,
        onedrive_enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', auth.userId)

    if (updateError) {
      throw updateError
    }

    // Also deactivate email accounts for this user so email sync stops
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
