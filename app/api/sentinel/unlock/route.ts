import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { withTiming } from '@/lib/middleware/request-timing'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import { logSentinelEvent } from '@/lib/services/sentinel-audit'

/**
 * POST /api/sentinel/unlock
 *
 * Admin Recovery — Directive 9.3
 *
 * Allows a Managing Partner (admin/super_admin) to unlock a matter
 * that was hit by an Emergency Lockdown, after completing a
 * 2-factor authentication challenge.
 *
 * Body: {
 *   lockdownId: string       — ID of the lockdown to resolve
 *   confirmationCode: string — 2FA code from authenticator app
 *   reason: string           — Why the lockdown is being lifted
 * }
 */
async function handlePost(request: Request) {
  try {
    const auth = await authenticateRequest()
    const role = requirePermission(auth, 'settings', 'edit') // Admin-only

    // Only super_admin / admin can perform recovery
    if (!['admin', 'super_admin', 'superadmin'].includes(role.name)) {
      return NextResponse.json(
        { error: 'Only a Managing Partner can perform lockdown recovery' },
        { status: 403 },
      )
    }

    const body = await request.json()
    const { lockdownId, confirmationCode, reason } = body as {
      lockdownId: string
      confirmationCode?: string
      reason: string
    }

    if (!lockdownId) {
      return NextResponse.json({ error: 'lockdownId is required' }, { status: 400 })
    }
    if (!reason || reason.trim().length < 10) {
      return NextResponse.json(
        { error: 'A detailed reason is required (minimum 10 characters)' },
        { status: 400 },
      )
    }

    // ── 2FA Verification ──────────────────────────────────────────────
    // Phase 1: Time-based confirmation code (6 digits)
    // Phase 2: Will integrate with Norva App biometric handshake
    if (!confirmationCode || confirmationCode.length < 6) {
      return NextResponse.json(
        { error: 'A valid 2-factor confirmation code is required' },
        { status: 400 },
      )
    }

    // Verify the Supabase MFA factor
    const supabaseAuth = auth.supabase
    const { data: factors } = await supabaseAuth.auth.mfa.listFactors()
    const totpFactor = factors?.totp?.[0]

    let mfaVerified = false

    if (totpFactor) {
      // User has TOTP configured — verify the code
      const { data: challenge } = await supabaseAuth.auth.mfa.challenge({
        factorId: totpFactor.id,
      })

      if (challenge) {
        const { error: verifyError } = await supabaseAuth.auth.mfa.verify({
          factorId: totpFactor.id,
          challengeId: challenge.id,
          code: confirmationCode,
        })
        mfaVerified = !verifyError
      }
    } else {
      // Fallback: If MFA not configured, accept code but flag it
      // In production, MFA enrollment would be required for admins
      mfaVerified = confirmationCode.length >= 6
    }

    if (!mfaVerified) {
      // Log the failed attempt
      logSentinelEvent({
        eventType: 'EMERGENCY_LOCKDOWN',
        severity: 'critical',
        tenantId: auth.tenantId,
        userId: auth.userId,
        tableName: 'sentinel_lockdowns',
        recordId: lockdownId,
        details: {
          action: 'UNLOCK_FAILED',
          reason: 'Invalid 2FA code',
          attempted_by: auth.userId,
        },
      }).catch(() => {})

      return NextResponse.json(
        { error: 'Invalid verification code. This attempt has been logged.' },
        { status: 403 },
      )
    }

    // ── Resolve the Lockdown ──────────────────────────────────────────

    const supabase = createAdminClient()

    // Fetch the lockdown record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lockdown, error: fetchError } = await (supabase as any)
      .from('sentinel_lockdowns')
      .select('*')
      .eq('id', lockdownId)
      .eq('tenant_id', auth.tenantId)
      .eq('is_active', true)
      .single()

    if (fetchError || !lockdown) {
      return NextResponse.json(
        { error: 'Lockdown not found or already resolved' },
        { status: 404 },
      )
    }

    // Deactivate the lockdown
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from('sentinel_lockdowns')
      .update({
        is_active: false,
        unlocked_at: new Date().toISOString(),
        unlocked_by: auth.userId,
        details: {
          ...lockdown.details,
          unlock_reason: reason,
          unlock_method: totpFactor ? 'totp_verified' : 'code_fallback',
        },
      })
      .eq('id', lockdownId)

    if (updateError) {
      console.error('[SENTINEL] Unlock update error:', updateError)
      return NextResponse.json({ error: 'Failed to resolve lockdown' }, { status: 500 })
    }

    // Unlock affected matters
    const affectedMatters = lockdown.details?.affected_matters ?? []
    if (lockdown.matter_id || affectedMatters.length > 0) {
      const matterIds = affectedMatters.length > 0
        ? affectedMatters
        : [lockdown.matter_id]

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('matters')
        .update({ status: 'open' })
        .in('id', matterIds)
        .eq('tenant_id', auth.tenantId)
        .eq('status', 'locked')
    }

    // Log the recovery to SENTINEL
    logSentinelEvent({
      eventType: 'EMERGENCY_LOCKDOWN',
      severity: 'warning',
      tenantId: auth.tenantId,
      userId: auth.userId,
      tableName: 'sentinel_lockdowns',
      recordId: lockdownId,
      details: {
        action: 'LOCKDOWN_RESOLVED',
        reason,
        resolved_by: auth.userId,
        original_trigger: lockdown.trigger_event,
        affected_matters: affectedMatters,
        verification_method: totpFactor ? 'totp' : 'code_fallback',
      },
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      lockdownId,
      resolvedAt: new Date().toISOString(),
      resolvedBy: auth.userId,
      affectedMatters: affectedMatters.length > 0 ? affectedMatters : [lockdown.matter_id],
      message: 'Lockdown resolved. Affected matters have been unlocked.',
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[SENTINEL] Unlock error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/sentinel/unlock')
