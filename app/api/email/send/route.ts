import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'
import { sendEmailViaProvider } from '@/lib/services/email-send'

/**
 * POST /api/email/send
 *
 * Send an email via a connected email account.
 * Body: { accountId, to[], subject, body, cc?[], bcc?[], replyToMessageId?, matterId?, bodyType? }
 */
async function handlePost(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'communications', 'edit')
    const {
      accountId,
      to,
      subject,
      body,
      cc,
      bcc,
      replyToMessageId,
      matterId,
      bodyType,
    } = await request.json()

    if (!accountId || !to || !Array.isArray(to) || to.length === 0 || !subject || !body) {
      return NextResponse.json(
        { error: 'Missing required fields: accountId, to (array), subject, body' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    // Verify the user has access to this account
    const { data: account } = await admin
      .from('email_accounts')
      .select('id, user_id, authorized_user_ids, tenant_id')
      .eq('id', accountId)
      .eq('tenant_id', auth.tenantId)
      .eq('is_active', true)
      .single()

    if (!account) {
      return NextResponse.json({ error: 'Email account not found' }, { status: 404 })
    }

    const authorizedIds = account.authorized_user_ids ?? []
    if (account.user_id !== auth.userId && !authorizedIds.includes(auth.userId)) {
      // Also check email_account_access for 'send' or 'admin' level
      const { data: access } = await admin
        .from('email_account_access')
        .select('access_level')
        .eq('email_account_id', accountId)
        .eq('user_id', auth.userId)
        .in('access_level', ['send', 'admin'])
        .maybeSingle()

      if (!access) {
        return NextResponse.json({ error: 'Not authorised to send from this account' }, { status: 403 })
      }
    }

    const result = await sendEmailViaProvider(admin, accountId, auth.userId, to, subject, body, {
      cc,
      bcc,
      replyToMessageId,
      matterId,
      bodyType,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[email/send] Error:', error)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/email/send')
