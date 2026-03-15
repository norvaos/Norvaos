import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import { syncInboundEmails, fullResync } from '@/lib/services/email-sync'

/**
 * POST /api/email/sync
 *
 * Trigger an email sync for a specific account.
 * Body: { email_account_id, full_resync? }
 */
async function handlePost(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')
    const { email_account_id, full_resync: isFullResync } = await request.json()

    if (!email_account_id) {
      return NextResponse.json({ error: 'Missing email_account_id' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Verify the user owns or has access to this account
    const { data: account } = await admin
      .from('email_accounts')
      .select('id, user_id, authorized_user_ids')
      .eq('id', email_account_id)
      .eq('tenant_id', auth.tenantId)
      .eq('is_active', true)
      .single()

    if (!account) {
      return NextResponse.json({ error: 'Email account not found' }, { status: 404 })
    }

    const authorizedIds = account.authorized_user_ids ?? []
    if (account.user_id !== auth.userId && !authorizedIds.includes(auth.userId)) {
      return NextResponse.json({ error: 'Not authorised for this email account' }, { status: 403 })
    }

    const result = isFullResync
      ? await fullResync(admin, email_account_id)
      : await syncInboundEmails(admin, email_account_id)

    return NextResponse.json({
      success: result.success,
      created: result.created,
      updated: result.updated,
      errors: result.errors.length,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[email/sync] Error:', error)
    return NextResponse.json({ error: 'Email sync failed' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/email/sync')
