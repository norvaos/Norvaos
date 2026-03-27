import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/integrations/google/disconnect
 *
 * Disconnects the user's Google/Gmail integration.
 * Soft-deletes by setting is_active = false and clearing tokens.
 */
async function handleGet() {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')

    const admin = createAdminClient()

    // Deactivate all Google email accounts for this user
    const { error } = await admin
      .from('email_accounts')
      .update({
        is_active: false,
        sync_enabled: false,
        encrypted_access_token: undefined,
        encrypted_refresh_token: undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', auth.userId)
      .eq('tenant_id', auth.tenantId)
      .eq('provider', 'google')

    if (error) {
      console.error('[google/disconnect] Error:', error)
      throw new Error('Failed to disconnect Google account')
    }

    console.log('[google/disconnect] Gmail disconnected for user:', auth.userId)

    return NextResponse.redirect(
      new URL('/settings/integrations?disconnected=google', process.env.NEXT_PUBLIC_APP_URL!),
    )
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.redirect(
        new URL('/login', process.env.NEXT_PUBLIC_APP_URL!),
      )
    }
    console.error('[google/disconnect] Error:', error)
    return NextResponse.redirect(
      new URL('/settings/integrations?error=google_disconnect_failed', process.env.NEXT_PUBLIC_APP_URL!),
    )
  }
}

export const GET = withTiming(handleGet, 'GET /api/integrations/google/disconnect')
