/**
 * Sovereign Audit Engine  -  Directive 052
 *
 * Write-only, immutable audit trail for all business-critical events.
 * Once an event is logged it can never be edited or deleted.
 *
 * Uses the admin client (service_role) to bypass RLS, ensuring audit
 * writes succeed regardless of the caller's permissions.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { headers } from 'next/headers'

// ── Event Types ──────────────────────────────────────────────────────────────

export const SOVEREIGN_EVENT_TYPES = [
  'MATTER_CREATED',
  'MATTER_IGNITED',
  'DOCUMENT_UPLOADED',
  'DOCUMENT_REPLACED',
  'DOCUMENT_DELETED',
  'MATTER_STATUS_CHANGED',
  'READINESS_100',
  'CLIENT_PORTAL_ACCESS',
  'RETAINER_SIGNED',
  'STAGE_ADVANCED',
  'CONFLICT_CLEARED',
  'CONFLICT_DETECTED',
] as const

export type SovereignEventType = (typeof SOVEREIGN_EVENT_TYPES)[number]

export type SovereignSeverity = 'info' | 'warning' | 'critical' | 'breach'

// ── Before / After Diff Snapshot ─────────────────────────────────────────────

export interface DiffSnapshot {
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
}

// ── Input Parameters ─────────────────────────────────────────────────────────

export interface SovereignAuditInput {
  tenantId: string
  userId: string
  eventType: SovereignEventType
  severity?: SovereignSeverity
  tableName?: string | null
  recordId?: string | null
  metadata?: DiffSnapshot & Record<string, unknown>
  ipAddress?: string | null
}

// ── Row shape returned from queries ──────────────────────────────────────────

export interface SovereignAuditEntry {
  id: string
  event_type: string
  severity: string
  tenant_id: string | null
  user_id: string | null
  auth_user_id: string | null
  table_name: string | null
  record_id: string | null
  ip_address: string | null
  user_agent: string | null
  request_path: string | null
  details: DiffSnapshot & Record<string, unknown>
  created_at: string
  /** Joined user fields (populated by the stream API) */
  user_first_name?: string | null
  user_last_name?: string | null
  user_avatar_url?: string | null
  user_email?: string | null
}

// ── Logger (write-only, fire-and-forget safe) ────────────────────────────────

/**
 * Log a business-critical audit event to the immutable sentinel_audit_log.
 *
 * This is the sole write entry-point for the Sovereign Audit Log. The function
 * captures request metadata (IP, user-agent, path) automatically when invoked
 * within a Next.js request context.
 *
 * Errors are caught and logged to console  -  audit writes must never crash
 * the calling operation.
 */
export async function logAuditEvent(input: SovereignAuditInput): Promise<void> {
  try {
    const admin = createAdminClient()

    // Capture request metadata when available
    let resolvedIp: string | null = input.ipAddress ?? null
    let userAgent: string | null = null
    let requestPath: string | null = null

    try {
      const h = await headers()
      if (!resolvedIp) {
        resolvedIp = h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? null
      }
      userAgent = h.get('user-agent') ?? null
      requestPath = h.get('x-invoke-path') ?? null
    } catch {
      // headers() may not be available outside request context
    }

    await (admin.from('sentinel_audit_log' as never) as any).insert({
      event_type: input.eventType,
      severity: input.severity ?? 'info',
      tenant_id: input.tenantId,
      user_id: input.userId,
      table_name: input.tableName ?? null,
      record_id: input.recordId ?? null,
      ip_address: resolvedIp,
      user_agent: userAgent,
      request_path: requestPath,
      details: input.metadata ?? {},
    })
  } catch (err) {
    console.error('[SOVEREIGN-AUDIT] Failed to write audit event:', err)
  }
}

// ── Convenience Wrappers ─────────────────────────────────────────────────────

/** Log a matter creation event. */
export async function logMatterCreated(params: {
  tenantId: string
  userId: string
  matterId: string
  matterTitle: string
  practiceArea?: string
}): Promise<void> {
  await logAuditEvent({
    tenantId: params.tenantId,
    userId: params.userId,
    eventType: 'MATTER_CREATED',
    severity: 'info',
    tableName: 'matters',
    recordId: params.matterId,
    metadata: {
      after: {
        id: params.matterId,
        title: params.matterTitle,
        practice_area: params.practiceArea,
      },
    },
  })
}

/** Log a matter IGNITE event (readiness gate passed, matter activated). */
export async function logMatterIgnited(params: {
  tenantId: string
  userId: string
  matterId: string
  readinessScore?: number
}): Promise<void> {
  await logAuditEvent({
    tenantId: params.tenantId,
    userId: params.userId,
    eventType: 'MATTER_IGNITED',
    severity: 'info',
    tableName: 'matters',
    recordId: params.matterId,
    metadata: {
      after: {
        ignited: true,
        readiness_score: params.readinessScore,
      },
    },
  })
}

/** Log a document upload event. */
export async function logDocumentUploaded(params: {
  tenantId: string
  userId: string
  documentId: string
  fileName: string
  matterId?: string
}): Promise<void> {
  await logAuditEvent({
    tenantId: params.tenantId,
    userId: params.userId,
    eventType: 'DOCUMENT_UPLOADED',
    severity: 'info',
    tableName: 'documents',
    recordId: params.documentId,
    metadata: {
      after: {
        file_name: params.fileName,
        matter_id: params.matterId,
      },
    },
  })
}

/** Log a document replacement (before / after diff). */
export async function logDocumentReplaced(params: {
  tenantId: string
  userId: string
  documentId: string
  before: Record<string, unknown>
  after: Record<string, unknown>
}): Promise<void> {
  await logAuditEvent({
    tenantId: params.tenantId,
    userId: params.userId,
    eventType: 'DOCUMENT_REPLACED',
    severity: 'warning',
    tableName: 'documents',
    recordId: params.documentId,
    metadata: {
      before: params.before,
      after: params.after,
    },
  })
}

/** Log a document deletion event. */
export async function logDocumentDeleted(params: {
  tenantId: string
  userId: string
  documentId: string
  fileName: string
}): Promise<void> {
  await logAuditEvent({
    tenantId: params.tenantId,
    userId: params.userId,
    eventType: 'DOCUMENT_DELETED',
    severity: 'warning',
    tableName: 'documents',
    recordId: params.documentId,
    metadata: {
      before: {
        file_name: params.fileName,
      },
    },
  })
}

/** Log a matter status change with before/after snapshot. */
export async function logMatterStatusChanged(params: {
  tenantId: string
  userId: string
  matterId: string
  previousStatus: string
  newStatus: string
}): Promise<void> {
  await logAuditEvent({
    tenantId: params.tenantId,
    userId: params.userId,
    eventType: 'MATTER_STATUS_CHANGED',
    severity: 'info',
    tableName: 'matters',
    recordId: params.matterId,
    metadata: {
      before: { status: params.previousStatus },
      after: { status: params.newStatus },
    },
  })
}

/** Log a stage advancement event. */
export async function logStageAdvanced(params: {
  tenantId: string
  userId: string
  matterId: string
  previousStage: string | null
  newStage: string
}): Promise<void> {
  await logAuditEvent({
    tenantId: params.tenantId,
    userId: params.userId,
    eventType: 'STAGE_ADVANCED',
    severity: 'info',
    tableName: 'matter_stage_state',
    recordId: params.matterId,
    metadata: {
      before: { stage: params.previousStage },
      after: { stage: params.newStage },
    },
  })
}

/** Log readiness reaching 100%. */
export async function logReadiness100(params: {
  tenantId: string
  userId: string
  matterId: string
}): Promise<void> {
  await logAuditEvent({
    tenantId: params.tenantId,
    userId: params.userId,
    eventType: 'READINESS_100',
    severity: 'info',
    tableName: 'matters',
    recordId: params.matterId,
    metadata: {
      after: { readiness_score: 100 },
    },
  })
}

/** Log a retainer signing event. */
export async function logRetainerSigned(params: {
  tenantId: string
  userId: string
  matterId: string
  retainerAgreementId: string
}): Promise<void> {
  await logAuditEvent({
    tenantId: params.tenantId,
    userId: params.userId,
    eventType: 'RETAINER_SIGNED',
    severity: 'info',
    tableName: 'retainer_agreements',
    recordId: params.retainerAgreementId,
    metadata: {
      after: {
        matter_id: params.matterId,
        signed: true,
      },
    },
  })
}

/** Log a client portal access event. */
export async function logClientPortalAccess(params: {
  tenantId: string
  userId: string
  matterId: string
  ipAddress?: string
}): Promise<void> {
  await logAuditEvent({
    tenantId: params.tenantId,
    userId: params.userId,
    eventType: 'CLIENT_PORTAL_ACCESS',
    severity: 'info',
    tableName: 'portal_links',
    recordId: params.matterId,
    ipAddress: params.ipAddress,
    metadata: {
      after: {
        matter_id: params.matterId,
        accessed_at: new Date().toISOString(),
      },
    },
  })
}

/** Log a conflict-of-interest clearance (Directive 066). */
export async function logConflictCleared(params: {
  tenantId: string
  userId: string
  matterId: string
  matterTitle: string
  certifiedBy: string
}): Promise<void> {
  await logAuditEvent({
    tenantId: params.tenantId,
    userId: params.userId,
    eventType: 'CONFLICT_CLEARED',
    severity: 'info',
    tableName: 'matters',
    recordId: params.matterId,
    metadata: {
      after: {
        conflict_status: 'cleared',
        matter_title: params.matterTitle,
        certified_by: params.certifiedBy,
        certified_at: new Date().toISOString(),
      },
    },
  })
}

/** Log a conflict-of-interest detection (Directive 066). */
export async function logConflictDetected(params: {
  tenantId: string
  userId: string
  matterId: string
  matterTitle: string
  notes?: string
}): Promise<void> {
  await logAuditEvent({
    tenantId: params.tenantId,
    userId: params.userId,
    eventType: 'CONFLICT_DETECTED',
    severity: 'warning',
    tableName: 'matters',
    recordId: params.matterId,
    metadata: {
      after: {
        conflict_status: 'conflict_found',
        matter_title: params.matterTitle,
        notes: params.notes,
      },
    },
  })
}
