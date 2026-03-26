// ============================================================================
// Invoice Audit Service  -  append-only audit log writer (Billing Module)
// ============================================================================
// The invoice_audit_log table has DB-level triggers that block UPDATE and
// DELETE, making this an append-only ledger.  All mutations in the billing
// module must call appendAuditEvent so the log stays complete.
//
// Schema (live): id, tenant_id, invoice_id, matter_id (NOT NULL),
//   event_type (CHECK), event_description (NOT NULL), changed_fields (JSONB),
//   performed_by (NOT NULL FK users), performed_at, ip_address, user_agent
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, InvoiceAuditEventType } from '@/lib/types/database'

/* eslint-disable @typescript-eslint/no-explicit-any */
const fromAuditLog = (c: SupabaseClient<Database>) =>
  (c as SupabaseClient<any>).from('invoice_audit_log')
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface AppendAuditEventInput {
  supabase: SupabaseClient<Database>
  tenantId: string
  invoiceId: string
  /** Required by DB schema (NOT NULL FK to matters). */
  matterId: string
  /**
   * The authenticated user performing the action.
   * Pass null for system-driven events (e.g. portal-view with no auth user).
   * When null the audit row is silently skipped  -  performed_by is NOT NULL.
   */
  performedBy: string | null
  eventType: InvoiceAuditEventType
  /** Human-readable description of what happened. Required (NOT NULL in DB). */
  eventDescription: string
  /** Optional structured diff: { field: { before, after } } */
  changedFields?: Record<string, unknown>
}

/**
 * Append a single event to invoice_audit_log.
 *
 * This function never throws  -  audit log failures are logged to console.error
 * so they never block the primary billing operation.
 *
 * If performedBy is null the insert is skipped entirely because performed_by
 * is a NOT NULL column and a null FK would be rejected by the DB.
 */
export async function appendAuditEvent(input: AppendAuditEventInput): Promise<void> {
  const {
    supabase,
    tenantId,
    invoiceId,
    matterId,
    performedBy,
    eventType,
    eventDescription,
    changedFields,
  } = input

  // performed_by is NOT NULL in the DB  -  skip rather than fail on null
  if (!performedBy) {
    return
  }

  try {
    const { error } = await fromAuditLog(supabase).insert({
      tenant_id: tenantId,
      invoice_id: invoiceId,
      matter_id: matterId,
      event_type: eventType,
      event_description: eventDescription,
      changed_fields: changedFields ?? null,
      performed_by: performedBy,
    })

    if (error) {
      console.error('[billing:audit] Failed to append audit event', {
        invoiceId,
        eventType,
        error: error.message,
      })
    }
  } catch (err) {
    console.error('[billing:audit] Unexpected error appending audit event', {
      invoiceId,
      eventType,
      err,
    })
  }
}
