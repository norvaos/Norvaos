import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendInternalEmail } from '@/lib/services/email-service'
import { withTiming } from '@/lib/middleware/request-timing'
import { log } from '@/lib/utils/logger'
import { z } from 'zod'

const ROLE_NAME_MAP: Record<string, string> = {
  lawyer:          'Lawyer',
  legal_assistant: 'Legal Assistant',
  front_desk:      'Receptionist',
  billing:         'Billing',
  admin:           'Admin',
}

const schema = z.object({
  email: z.string().email('Invalid email address'),
  role:  z.enum(['lawyer', 'legal_assistant', 'front_desk', 'billing', 'admin']),
})

/**
 * POST /api/onboarding/invite-team
 *
 * Sends a team invite during the 7-step onboarding wizard (Step 6).
 * Writes to user_invites and sends an email via Resend.
 *
 * Differences from /api/settings/users/invite:
 *   • No seat-limit check (onboarding bypass)
 *   • No permission guard (the onboarding user always has implicit admin rights)
 *   • Resolves role by name rather than by UUID
 */
async function handlePost(request: Request) {
  try {
    const auth  = await authenticateRequest()
    const admin = createAdminClient()

    const body   = await request.json() as unknown
    const parsed = schema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      )
    }

    const { email, role: roleKey } = parsed.data
    const roleName = ROLE_NAME_MAP[roleKey] ?? 'Lawyer'

    // Resolve role_id by name within this tenant
    const { data: roleRow } = await admin
      .from('roles')
      .select('id, name')
      .eq('tenant_id', auth.tenantId)
      .ilike('name', roleName)
      .limit(1)
      .maybeSingle()

    // Fall back to first available role if named role not found
    let resolvedRoleId: string | null = roleRow?.id ?? null
    if (!resolvedRoleId) {
      const { data: firstRole } = await admin
        .from('roles')
        .select('id')
        .eq('tenant_id', auth.tenantId)
        .order('created_at')
        .limit(1)
        .maybeSingle()
      resolvedRoleId = firstRole?.id ?? null
    }

    // Check for duplicate
    const [{ data: existingUser }, { data: existingInvite }] = await Promise.all([
      admin
        .from('users')
        .select('id')
        .eq('tenant_id', auth.tenantId)
        .eq('email', email)
        .maybeSingle(),
      admin
        .from('user_invites')
        .select('id')
        .eq('tenant_id', auth.tenantId)
        .eq('email', email)
        .eq('status', 'pending')
        .maybeSingle(),
    ])

    if (existingUser || existingInvite) {
      // Not an error during onboarding — silently succeed
      return NextResponse.json({ success: true, skipped: true })
    }

    // Generate invite token
    const token = `${crypto.randomUUID()}-${crypto.randomUUID()}`

    const { data: invite, error: inviteErr } = await admin
      .from('user_invites')
      .insert({
        tenant_id:  auth.tenantId,
        email,
        first_name: '',
        last_name:  '',
        role_id:    resolvedRoleId,
        token,
        invited_by: auth.userId,
      } as never)
      .select('id')
      .single()

    if (inviteErr) {
      log.error('[onboarding-invite] Failed to create invite', { tenant_id: auth.tenantId, error_code: inviteErr.code })
      return NextResponse.json({ error: inviteErr.message }, { status: 500 })
    }

    // Fetch tenant name for email
    const { data: tenantData } = await admin
      .from('tenants')
      .select('name')
      .eq('id', auth.tenantId)
      .single()

    const baseUrl    = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const acceptUrl  = `${baseUrl}/invite/${token}`

    // Send invite email (non-blocking)
    sendInternalEmail({
      supabase:      admin,
      tenantId:      auth.tenantId,
      recipientEmail: email,
      recipientName:  email,
      title: `You've been invited to ${tenantData?.name ?? 'a firm'}`,
      message: `You have been invited to join ${tenantData?.name ?? 'the firm'} as ${roleName}. Click the link below to set up your account. This invitation expires in 7 days.`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- entityType is a string union but we pass a literal
      entityType: 'invite' as any,
      entityId:   acceptUrl,
    }).catch((err: unknown) => {
      log.error('[onboarding-invite] Failed to send email', { tenant_id: auth.tenantId, error_code: String(err) })
    })

    log.info('[onboarding-invite] Invite created', { tenant_id: auth.tenantId, invite_id: invite?.id })

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/onboarding/invite-team')
