/**
 * SENTINEL Audit Service
 *
 * Logs security events to the immutable sentinel_audit_log table.
 * Used by tenant-guard middleware, RLS violation handlers, and
 * gating rule enforcement.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { headers } from 'next/headers'

// ── Types ─────────────────────────────────────────────────────────────────────

export type SentinelEventType =
  | 'TENANT_VIOLATION'
  | 'RLS_BYPASS_ATTEMPT'
  | 'UNAUTHORIZED_ACCESS'
  | 'RETAINER_GATE_BLOCKED'
  | 'STAGE_GATE_BLOCKED'
  | 'ROLE_VIOLATION'
  | 'DATA_MASKING_BYPASS'
  | 'PII_REVEAL'
  | 'FORM_GENERATION'
  | 'FORM_GENERATION_BLOCKED'
  | 'DATA_MISMATCH_WARNING'
  | 'PDF_VAULT_ACCESS'
  | 'DOCUMENT_TAMPER'
  | 'IDENTITY_VERIFICATION'
  | 'EMERGENCY_LOCKDOWN'

export type SentinelSeverity = 'info' | 'warning' | 'critical' | 'breach'

export interface SentinelLogInput {
  eventType: SentinelEventType
  severity?: SentinelSeverity
  tenantId?: string | null
  userId?: string | null
  authUserId?: string | null
  tableName?: string | null
  recordId?: string | null
  details?: Record<string, unknown>
}

// ── Logger ────────────────────────────────────────────────────────────────────

/**
 * Log a security event to the immutable sentinel_audit_log.
 * Uses admin client (service_role) to bypass RLS.
 * Fire-and-forget safe — errors are caught and logged to console.
 */
export async function logSentinelEvent(input: SentinelLogInput): Promise<void> {
  try {
    const admin = createAdminClient()

    // Try to capture request metadata
    let ipAddress: string | null = null
    let userAgent: string | null = null
    let requestPath: string | null = null

    try {
      const h = await headers()
      ipAddress = h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? null
      userAgent = h.get('user-agent') ?? null
      requestPath = h.get('x-invoke-path') ?? null
    } catch {
      // headers() may not be available outside request context
    }

    await (admin.from('sentinel_audit_log' as never) as any).insert({
      event_type: input.eventType,
      severity: input.severity ?? 'warning',
      tenant_id: input.tenantId ?? null,
      user_id: input.userId ?? null,
      auth_user_id: input.authUserId ?? null,
      table_name: input.tableName ?? null,
      record_id: input.recordId ?? null,
      ip_address: ipAddress,
      user_agent: userAgent,
      request_path: requestPath,
      details: input.details ?? {},
    })
  } catch (err) {
    console.error('[SENTINEL] Failed to write audit log:', err)
  }
}

/**
 * Log a tenant violation event (convenience wrapper).
 */
export async function logTenantViolation(params: {
  userTenantId: string
  attemptedTenantId: string
  userId: string
  authUserId?: string
  tableName: string
  recordId?: string
}): Promise<void> {
  await logSentinelEvent({
    eventType: 'TENANT_VIOLATION',
    severity: 'critical',
    tenantId: params.userTenantId,
    userId: params.userId,
    authUserId: params.authUserId,
    tableName: params.tableName,
    recordId: params.recordId,
    details: {
      attempted_tenant_id: params.attemptedTenantId,
      actual_tenant_id: params.userTenantId,
    },
  })
}

/**
 * Log a retainer gate blocked event.
 */
export async function logRetainerGateBlocked(params: {
  tenantId: string
  userId: string
  matterId: string
  retainerStatus: string | null
  requiredStatus: string
}): Promise<void> {
  await logSentinelEvent({
    eventType: 'RETAINER_GATE_BLOCKED',
    severity: 'info',
    tenantId: params.tenantId,
    userId: params.userId,
    tableName: 'retainer_agreements',
    recordId: params.matterId,
    details: {
      matter_id: params.matterId,
      current_retainer_status: params.retainerStatus,
      required_status: params.requiredStatus,
    },
  })
}

/**
 * Query recent sentinel events (admin only).
 */
export async function getRecentSentinelEvents(params: {
  limit?: number
  severity?: SentinelSeverity
  eventType?: SentinelEventType
  tenantId?: string
}): Promise<unknown[]> {
  const admin = createAdminClient()
  let query = admin
    .from('sentinel_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(params.limit ?? 50)

  if (params.severity) {
    query = query.eq('severity', params.severity)
  }
  if (params.eventType) {
    query = query.eq('event_type', params.eventType)
  }
  if (params.tenantId) {
    query = query.eq('tenant_id', params.tenantId)
  }

  const { data } = await query
  return data ?? []
}

/**
 * Log a form generation event (draft or final).
 */
export async function logFormGeneration(params: {
  tenantId: string
  userId: string
  matterId: string
  formCode: string
  versionNumber: number
  packType: 'draft' | 'final'
  readinessScore?: number
}): Promise<void> {
  await logSentinelEvent({
    eventType: 'FORM_GENERATION',
    severity: 'info',
    tenantId: params.tenantId,
    userId: params.userId,
    tableName: 'form_pack_versions',
    recordId: params.matterId,
    details: {
      matter_id: params.matterId,
      form_code: params.formCode,
      version_number: params.versionNumber,
      pack_type: params.packType,
      readiness_score: params.readinessScore,
    },
  })
}

/**
 * Log a form generation blocked event (readiness < 90%).
 */
export async function logFormGenerationBlocked(params: {
  tenantId: string
  userId: string
  matterId: string
  formCode: string
  readinessScore: number
  reason: string
}): Promise<void> {
  await logSentinelEvent({
    eventType: 'FORM_GENERATION_BLOCKED',
    severity: 'warning',
    tenantId: params.tenantId,
    userId: params.userId,
    tableName: 'form_pack_versions',
    recordId: params.matterId,
    details: {
      matter_id: params.matterId,
      form_code: params.formCode,
      readiness_score: params.readinessScore,
      reason: params.reason,
    },
  })
}

/**
 * Log a data mismatch warning between current data and last form snapshot.
 */
export async function logDataMismatchWarning(params: {
  tenantId: string
  userId: string
  matterId: string
  formCode: string
  mismatches: Array<{ field: string; current: string; snapshot: string }>
}): Promise<void> {
  await logSentinelEvent({
    eventType: 'DATA_MISMATCH_WARNING',
    severity: 'warning',
    tenantId: params.tenantId,
    userId: params.userId,
    tableName: 'form_pack_versions',
    recordId: params.matterId,
    details: {
      matter_id: params.matterId,
      form_code: params.formCode,
      mismatch_count: params.mismatches.length,
      mismatches: params.mismatches,
    },
  })
}

/**
 * Log a PDF vault access event (download/unlock of encrypted form).
 */
export async function logPdfVaultAccess(params: {
  tenantId: string
  userId: string
  matterId: string
  versionId: string
  action: 'download' | 'unlock'
}): Promise<void> {
  await logSentinelEvent({
    eventType: 'PDF_VAULT_ACCESS',
    severity: 'info',
    tenantId: params.tenantId,
    userId: params.userId,
    tableName: 'form_pack_artifacts',
    recordId: params.versionId,
    details: {
      matter_id: params.matterId,
      version_id: params.versionId,
      action: params.action,
    },
  })
}
