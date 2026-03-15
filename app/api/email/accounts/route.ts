import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import { encryptToken } from '@/lib/services/microsoft-graph'

/**
 * GET /api/email/accounts
 *
 * List all email accounts the current user has access to.
 */
async function handleGet() {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()

    // Fetch accounts the user owns or has access to
    const { data: ownAccounts } = await admin
      .from('email_accounts')
      .select('id, tenant_id, user_id, account_type, provider, email_address, display_name, sync_enabled, last_sync_at, error_count, last_error, is_active, created_at, updated_at')
      .eq('tenant_id', auth.tenantId)
      .eq('is_active', true)
      .or(`user_id.eq.${auth.userId},authorized_user_ids.cs.{${auth.userId}}`)
      .order('created_at')

    return NextResponse.json({ data: ownAccounts ?? [] })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[email/accounts] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch email accounts' }, { status: 500 })
  }
}

/**
 * POST /api/email/accounts
 *
 * Create a new email account (personal or shared).
 * Body: { account_type, provider, email_address, display_name?, access_token, refresh_token, expires_in, practice_area_id? }
 */
async function handlePost(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')
    const body = await request.json()

    const {
      account_type,
      provider,
      email_address,
      display_name,
      access_token,
      refresh_token,
      expires_in,
      practice_area_id,
    } = body

    if (!account_type || !provider || !email_address || !access_token || !refresh_token) {
      return NextResponse.json(
        { error: 'Missing required fields: account_type, provider, email_address, access_token, refresh_token' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()
    const tokenExpiresAt = new Date(Date.now() + (expires_in ?? 3600) * 1000).toISOString()

    const { data, error } = await admin
      .from('email_accounts')
      .insert({
        tenant_id: auth.tenantId,
        user_id: auth.userId,
        account_type,
        provider,
        email_address,
        display_name: display_name ?? null,
        encrypted_access_token: encryptToken(access_token),
        encrypted_refresh_token: encryptToken(refresh_token),
        token_expires_at: tokenExpiresAt,
        practice_area_id: practice_area_id ?? null,
        authorized_user_ids: [auth.userId],
      })
      .select('id, email_address, account_type, provider, display_name')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'This email address is already connected for this tenant' },
          { status: 409 }
        )
      }
      throw error
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[email/accounts] POST error:', error)
    return NextResponse.json({ error: 'Failed to create email account' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/email/accounts')
export const POST = withTiming(handlePost, 'POST /api/email/accounts')
