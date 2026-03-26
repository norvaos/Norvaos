/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Document Engine  -  Audit Service
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Fire-and-forget event logging to append-only audit tables.
 * All writes use the admin client (bypasses RLS) since these are
 * system-level events, not user-facing mutations.
 *
 * Tables:
 *   - document_template_audit_log   (template changes)
 *   - document_status_events        (instance status transitions)
 *   - document_signer_events        (signer status changes)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// ─── Template Audit Log ──────────────────────────────────────────────────────

export async function logTemplateAudit(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    templateId: string
    templateVersionId?: string | null
    eventType: string
    eventPayload?: Record<string, unknown>
    performedBy: string
  }
): Promise<void> {
  const { error } = await supabase.from('document_template_audit_log').insert({
    tenant_id: params.tenantId,
    template_id: params.templateId,
    template_version_id: params.templateVersionId ?? null,
    event_type: params.eventType,
    event_payload_json: params.eventPayload ?? null,
    performed_by: params.performedBy,
  } as never)

  if (error) {
    console.error('[doc-engine] Failed to log template audit:', error.message)
  }
}

// ─── Instance Status Event ───────────────────────────────────────────────────

export async function logInstanceEvent(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    instanceId: string
    eventType: string
    fromStatus?: string | null
    toStatus?: string | null
    eventPayload?: Record<string, unknown>
    performedBy: string
  }
): Promise<void> {
  const { error } = await supabase.from('document_status_events').insert({
    tenant_id: params.tenantId,
    document_instance_id: params.instanceId,
    event_type: params.eventType,
    from_status: params.fromStatus ?? null,
    to_status: params.toStatus ?? null,
    event_payload_json: params.eventPayload ?? null,
    performed_by: params.performedBy,
  } as never)

  if (error) {
    console.error('[doc-engine] Failed to log instance event:', error.message)
  }
}

// ─── Signer Event ────────────────────────────────────────────────────────────

export async function logSignerEvent(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    signerId: string
    requestId: string
    eventType: 'status_changed' | 'reminder_sent' | 'note_added'
    fromStatus?: string | null
    toStatus?: string | null
    note?: string | null
    performedBy: string
  }
): Promise<void> {
  const { error } = await supabase.from('document_signer_events').insert({
    tenant_id: params.tenantId,
    signer_id: params.signerId,
    request_id: params.requestId,
    event_type: params.eventType,
    from_status: params.fromStatus ?? null,
    to_status: params.toStatus ?? null,
    note: params.note ?? null,
    performed_by: params.performedBy,
  } as never)

  if (error) {
    console.error('[doc-engine] Failed to log signer event:', error.message)
  }
}
