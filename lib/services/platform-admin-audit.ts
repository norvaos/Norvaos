/**
 * Platform-admin audit logging  -  immutable, append-only.
 *
 * Every platform-admin mutation MUST call `logPlatformAdminAudit()`.
 * Writes to three destinations:
 *   1. `platform_admin_audit_logs`  -  cross-tenant, immutable (no UPDATE/DELETE)
 *   2. `audit_logs`  -  tenant-scoped (for the affected tenant's own audit trail)
 *   3. `activities`  -  tenant-scoped (for the affected tenant's activity feed)
 *
 * Fire-and-forget via Promise.allSettled  -  never blocks the response.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/utils/logger'
import type { Json } from '@/lib/types/database'
import { checkAdminActionSpike } from '@/lib/utils/alerts'

export interface PlatformAdminAuditParams {
  admin_id: string | null
  action: string
  target_type: 'tenant' | 'user' | 'invite'
  target_id: string
  /** Tenant ID for writing to tenant-scoped audit_logs + activities */
  tenant_id: string
  changes: Record<string, unknown>
  reason: string
  ip: string | null
  user_agent: string | null
  request_id?: string
}

/**
 * Log a platform-admin action to all three audit destinations.
 *
 * 1. platform_admin_audit_logs (immutable, cross-tenant)
 * 2. audit_logs (tenant-scoped)
 * 3. activities (tenant-scoped)
 *
 * Fire-and-forget  -  never blocks the response.
 */
export async function logPlatformAdminAudit(params: PlatformAdminAuditParams): Promise<void> {
  const {
    admin_id,
    action,
    target_type,
    target_id,
    tenant_id,
    changes,
    reason,
    ip,
    user_agent,
    request_id,
  } = params

  // ── Directive 076 hardening: reason must never be empty (LSO paper trail) ──
  const sanitisedReason = reason?.trim()
  if (!sanitisedReason || sanitisedReason.length < 3) {
    log.error('[platform-admin] AUDIT VIOLATION: reason is missing or too short', {
      action,
      target_type,
      target_id,
      reason: reason ?? '(null)',
    })
    // Still log it but with a warning marker  -  never silently drop an audit entry
  }
  const finalReason = sanitisedReason || `[AUTO] ${action} - no reason provided`

  // Always emit structured log (streaming consumers see every action)
  log.info(`[platform-admin] ${action}`, {
    admin_id: admin_id ?? 'bearer-token',
    tenant_id,
    target_type,
    target_id,
    ip: ip ?? undefined,
    request_id: request_id ?? undefined,
  })

  const admin = createAdminClient()

  await Promise.allSettled([
    // 1. Immutable cross-tenant audit log  -  reason ALWAYS saved (Directive 076)
    admin.from('platform_admin_audit_logs').insert({
      admin_id,
      action,
      target_type,
      target_id,
      changes: changes as Json,
      reason: finalReason,
      ip,
      user_agent,
      request_id: request_id ?? null,
    }),

    // 2. Tenant-scoped audit_logs
    admin.from('audit_logs').insert({
      tenant_id,
      user_id: null,
      action,
      entity_type: target_type,
      entity_id: target_id,
      changes: changes as Json,
      metadata: {
        actor: 'platform-admin',
        admin_id: admin_id ?? 'bearer-token',
        reason: finalReason,
        ip,
        user_agent,
        request_id: request_id ?? null,
      } as Json,
    }),

    // 3. Tenant-scoped activities
    admin.from('activities').insert({
      tenant_id,
      activity_type: action,
      title: `Platform admin: ${action}`,
      description: `${action} by platform-admin. Reason: ${finalReason}`,
      entity_type: target_type,
      entity_id: target_id,
      user_id: null,
      metadata: {
        actor: 'platform-admin',
        admin_id: admin_id ?? 'bearer-token',
        reason: finalReason,
        ip,
        user_agent,
        request_id: request_id ?? null,
      } as Json,
    }),
  ])

  // Observability: fire-and-forget spike detection
  checkAdminActionSpike().catch(() => {})
}
