import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/utils/logger'
import type { Json } from '@/lib/types/database'
import {
  checkPlatformAdmin,
  checkAdminRateLimit,
  extractRequestMeta,
  PlatformAdminError,
} from '@/lib/services/platform-admin'
import { logPlatformAdminAudit } from '@/lib/services/platform-admin-audit'
import { getRequestId } from '@/lib/utils/request-id'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * PATCH /api/admin/tenants/[id]/max-users
 *
 * Update a tenant's max_users value.
 * Rate-limited: 30 req/min per IP.
 *
 * Two auth paths:
 *   1. Platform-admin: Bearer token via PLATFORM_ADMIN_SECRET  -  can update any tenant.
 *   2. Tenant-admin: authenticateRequest() + settings:edit  -  own tenant only.
 *
 * Body: { max_users: number, reason: string }
 *   - max_users: integer 1–1000
 *   - reason: mandatory string, min 5 characters
 *
 * Audited: every change is logged to audit_logs (with IP/UA/reason/request_id)
 * and activities (for operational visibility).
 */
async function handlePatch(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // ── Rate limit ──
  const rateLimitResponse = checkAdminRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  try {
    const { id: tenantId } = await params
    const { isPlatformAdmin } = checkPlatformAdmin(request)
    const { ip, userAgent } = extractRequestMeta(request)
    const requestId = getRequestId()

    let actorId: string
    let actorLabel: string

    if (isPlatformAdmin) {
      // ── Platform-admin path: skip authenticateRequest, skip permission gate ──
      actorId = 'platform-admin'
      actorLabel = 'platform-admin'
    } else {
      // ── Tenant-admin path: full auth + permission + scope checks ──
      const auth = await authenticateRequest()
      actorId = auth.userId

      // Permission gate: must be Admin with settings:edit
      const adminCheck = createAdminClient()
      const { data: callerUser } = await adminCheck
        .from('users')
        .select('role_id')
        .eq('id', auth.userId)
        .eq('tenant_id', auth.tenantId)
        .single()

      if (!callerUser?.role_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const { data: callerRole } = await adminCheck
        .from('roles')
        .select('name, permissions')
        .eq('id', callerUser.role_id)
        .single()

      const isAdmin = callerRole?.name === 'Admin'
      const hasSettingsEdit =
        isAdmin ||
        (callerRole?.permissions as Record<string, Record<string, boolean>> | null)?.settings?.edit === true

      if (!hasSettingsEdit) {
        log.warn('[admin/max-users] Unauthorized attempt to update max_users', {
          tenant_id: auth.tenantId,
          user_id: auth.userId,
          role_name: callerRole?.name ?? 'unknown',
        })
        return NextResponse.json(
          { error: 'Forbidden: requires settings:edit permission.' },
          { status: 403 }
        )
      }

      // Scope check: tenant-admin can only modify their own tenant
      if (tenantId !== auth.tenantId) {
        return NextResponse.json(
          { error: 'Forbidden: you can only manage your own tenant.' },
          { status: 403 }
        )
      }

      actorLabel = callerRole?.name ?? 'unknown'
    }

    // ── Validate body ──
    const body = await request.json()
    const newMax = body.max_users
    const reason = body.reason

    if (typeof newMax !== 'number' || !Number.isInteger(newMax) || newMax < 1 || newMax > 1000) {
      return NextResponse.json(
        { error: 'max_users must be an integer between 1 and 1000.' },
        { status: 400 }
      )
    }

    if (typeof reason !== 'string' || reason.trim().length < 5) {
      return NextResponse.json(
        { error: 'reason is required and must be at least 5 characters.' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    // ── Read current value for audit delta ──
    const { data: tenant, error: readErr } = await admin
      .from('tenants')
      .select('max_users')
      .eq('id', tenantId)
      .single()

    if (readErr || !tenant) {
      return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 })
    }

    const previousMax = tenant.max_users

    // ── Validate: new limit must not be below current active user count ──
    const { count: activeCount } = await admin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_active', true)

    if (activeCount !== null && newMax < activeCount) {
      return NextResponse.json(
        {
          error: `Cannot set max_users to ${newMax}: tenant currently has ${activeCount} active users. Deactivate users first or choose a higher limit.`,
        },
        { status: 409 }
      )
    }

    // ── Update ──
    const { error: updateErr } = await admin
      .from('tenants')
      .update({ max_users: newMax })
      .eq('id', tenantId)

    if (updateErr) {
      return NextResponse.json(
        { error: `Failed to update max_users: ${updateErr.message}` },
        { status: 500 }
      )
    }

    // ── Audit log + activities ──
    if (isPlatformAdmin) {
      // Use consolidated platform-admin audit logger (writes to all 3 destinations)
      logPlatformAdminAudit({
        admin_id: null, // Bearer token auth has no admin_id
        action: 'max_users_updated',
        target_type: 'tenant',
        target_id: tenantId,
        tenant_id: tenantId,
        changes: { previous: previousMax, new: newMax },
        reason: reason.trim(),
        ip,
        user_agent: userAgent,
        request_id: requestId,
      })
    } else {
      // Tenant-admin audit
      await Promise.allSettled([
        admin.from('audit_logs').insert({
          tenant_id: tenantId,
          user_id: actorId,
          action: 'max_users_updated',
          entity_type: 'tenant',
          entity_id: tenantId,
          changes: { previous: previousMax, new: newMax } as Json,
          metadata: {
            reason: reason.trim(),
            actor: actorLabel,
            ip,
            user_agent: userAgent,
            request_id: requestId,
          } as Json,
        }),

        admin.from('activities').insert({
          tenant_id: tenantId,
          activity_type: 'max_users_updated',
          title: 'Seat limit updated',
          description: `max_users changed from ${previousMax} to ${newMax}. Reason: ${reason.trim()}`,
          entity_type: 'tenant',
          entity_id: tenantId,
          user_id: actorId,
          metadata: {
            previous: previousMax,
            new: newMax,
            reason: reason.trim(),
            actor: actorLabel,
            ip,
            user_agent: userAgent,
            request_id: requestId,
          } as Json,
        }),
      ])
    }

    log.info('[admin/max-users] max_users updated', {
      tenant_id: tenantId,
      user_id: actorId,
      role_name: actorLabel,
      request_id: requestId,
    })

    return NextResponse.json({
      data: { tenant_id: tenantId, max_users: newMax, previous_max_users: previousMax },
      error: null,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    if (err instanceof PlatformAdminError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    )
  }
}

export const PATCH = withTiming(handlePatch, 'PATCH /api/admin/tenants/[id]/max-users')
