/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Document Engine — Signature Service (Manual Tracking — Phase 1)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Manual signature status tracking. Users create signature requests and
 * manually update signer statuses. Provider integration deferred to Phase 2.
 *
 * Key rules:
 *   - All status changes validated against VALID_SIGNER_TRANSITIONS
 *   - Every status change logged to document_signer_events (append-only)
 *   - When all signers → signed, instance auto-transitions to "signed"
 *   - Provider field is set to 'manual' for Phase 1
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { CreateSignatureRequestParams, SignerInput } from '@/lib/types/document-engine'
import { VALID_SIGNATURE_REQUEST_TRANSITIONS, VALID_SIGNER_TRANSITIONS } from '@/lib/types/document-engine'
import { logSignerEvent, logInstanceEvent } from './audit-service'
import { transitionStatus } from './instance-service'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ServiceResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

// ─── Create Signature Request ────────────────────────────────────────────────

export async function createSignatureRequest(
  supabase: SupabaseClient<Database>,
  params: CreateSignatureRequestParams
): Promise<ServiceResult<{ requestId: string }>> {
  // Verify instance exists and is in a signable status
  const { data: instance } = await supabase
    .from('document_instances')
    .select('id, status, tenant_id')
    .eq('id', params.instanceId)
    .eq('tenant_id', params.tenantId)
    .single()

  if (!instance) {
    return { success: false, error: 'Instance not found' }
  }

  if (!['approved', 'sent'].includes(instance.status)) {
    return { success: false, error: `Cannot create signature request for instance in "${instance.status}" status` }
  }

  // Create signature request
  const { data: request, error: requestError } = await supabase
    .from('document_signature_requests')
    .insert({
      tenant_id: params.tenantId,
      document_instance_id: params.instanceId,
      provider: params.provider ?? 'manual',
      status: 'pending',
      created_by: params.createdBy,
    } as never)
    .select()
    .single()

  if (requestError || !request) {
    return { success: false, error: requestError?.message ?? 'Failed to create signature request' }
  }

  // Create signers
  const signerInserts = params.signers.map((s: SignerInput, index: number) => ({
    tenant_id: params.tenantId,
    signature_request_id: request.id,
    contact_id: s.contactId ?? null,
    role_key: s.roleKey,
    name: s.name,
    email: s.email,
    signing_order: s.signingOrder ?? index + 1,
    status: 'pending',
  }))

  const { error: signerError } = await supabase
    .from('document_signers')
    .insert(signerInserts as never)

  if (signerError) {
    return { success: false, error: `Failed to create signers: ${signerError.message}` }
  }

  // Update instance with latest signature request
  await supabase
    .from('document_instances')
    .update({ latest_signature_request_id: request.id } as never)
    .eq('id', params.instanceId)

  // Log events for each signer
  const { data: signers } = await supabase
    .from('document_signers')
    .select('id')
    .eq('signature_request_id', request.id)

  if (signers) {
    await Promise.allSettled(
      signers.map((signer) =>
        logSignerEvent(supabase, {
          tenantId: params.tenantId,
          signerId: signer.id,
          requestId: request.id,
          eventType: 'status_changed',
          toStatus: 'pending',
          performedBy: params.createdBy,
        })
      )
    )
  }

  return { success: true, data: { requestId: request.id } }
}

// ─── Update Signer Status ────────────────────────────────────────────────────

export async function updateSignerStatus(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    signerId: string
    newStatus: string
    note?: string
    declineReason?: string
    performedBy: string
  }
): Promise<ServiceResult> {
  // Fetch signer with request info
  const { data: signer } = await supabase
    .from('document_signers')
    .select('id, status, signature_request_id, tenant_id')
    .eq('id', params.signerId)
    .eq('tenant_id', params.tenantId)
    .single()

  if (!signer) {
    return { success: false, error: 'Signer not found' }
  }

  // Validate transition
  const allowed = VALID_SIGNER_TRANSITIONS[signer.status]
  if (!allowed || !allowed.includes(params.newStatus)) {
    return {
      success: false,
      error: `Invalid signer transition: "${signer.status}" → "${params.newStatus}"`,
    }
  }

  // Update signer status + timestamp fields
  const updateData: Record<string, unknown> = { status: params.newStatus }
  if (params.newStatus === 'viewed') updateData.viewed_at = new Date().toISOString()
  if (params.newStatus === 'signed') updateData.signed_at = new Date().toISOString()
  if (params.newStatus === 'declined') {
    updateData.declined_at = new Date().toISOString()
    updateData.decline_reason = params.declineReason ?? null
  }

  const { error: updateError } = await supabase
    .from('document_signers')
    .update(updateData as never)
    .eq('id', params.signerId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  // Log signer event
  await logSignerEvent(supabase, {
    tenantId: params.tenantId,
    signerId: params.signerId,
    requestId: signer.signature_request_id,
    eventType: 'status_changed',
    fromStatus: signer.status,
    toStatus: params.newStatus,
    note: params.note ?? null,
    performedBy: params.performedBy,
  })

  // Check if all signers are now signed → auto-complete
  if (params.newStatus === 'signed') {
    await checkSignatureCompletion(supabase, {
      tenantId: params.tenantId,
      requestId: signer.signature_request_id,
      performedBy: params.performedBy,
    })
  }

  // Check if any signer declined → transition instance
  if (params.newStatus === 'declined') {
    await handleSignerDeclined(supabase, {
      tenantId: params.tenantId,
      requestId: signer.signature_request_id,
      performedBy: params.performedBy,
    })
  }

  return { success: true }
}

// ─── Signature Completion Check ──────────────────────────────────────────────

async function checkSignatureCompletion(
  supabase: SupabaseClient<Database>,
  params: { tenantId: string; requestId: string; performedBy: string }
): Promise<void> {
  // Get all signers for this request
  const { data: signers } = await supabase
    .from('document_signers')
    .select('id, status')
    .eq('signature_request_id', params.requestId)

  if (!signers || signers.length === 0) return

  const allSigned = signers.every((s) => s.status === 'signed')
  const someSigned = signers.some((s) => s.status === 'signed')

  // Get the signature request to find the instance
  const { data: request } = await supabase
    .from('document_signature_requests')
    .select('id, document_instance_id, status')
    .eq('id', params.requestId)
    .single()

  if (!request) return

  if (allSigned) {
    // All signed → complete the request and transition instance
    await supabase
      .from('document_signature_requests')
      .update({ status: 'completed', completed_at: new Date().toISOString() } as never)
      .eq('id', params.requestId)

    await transitionStatus(supabase, {
      tenantId: params.tenantId,
      instanceId: request.document_instance_id,
      newStatus: 'signed',
      performedBy: params.performedBy,
      eventPayload: { completion_type: 'all_signers_signed' },
    })
  } else if (someSigned) {
    // Partial — update request and instance to partially_signed
    if (request.status !== 'partially_signed') {
      await supabase
        .from('document_signature_requests')
        .update({ status: 'partially_signed' } as never)
        .eq('id', params.requestId)
    }

    // Transition instance to partially_signed if it's currently "sent"
    const { data: instance } = await supabase
      .from('document_instances')
      .select('status')
      .eq('id', request.document_instance_id)
      .single()

    if (instance?.status === 'sent') {
      await transitionStatus(supabase, {
        tenantId: params.tenantId,
        instanceId: request.document_instance_id,
        newStatus: 'partially_signed',
        performedBy: params.performedBy,
      })
    }
  }
}

// ─── Handle Signer Declined ──────────────────────────────────────────────────

async function handleSignerDeclined(
  supabase: SupabaseClient<Database>,
  params: { tenantId: string; requestId: string; performedBy: string }
): Promise<void> {
  const { data: request } = await supabase
    .from('document_signature_requests')
    .select('id, document_instance_id')
    .eq('id', params.requestId)
    .single()

  if (!request) return

  // Mark request as declined
  await supabase
    .from('document_signature_requests')
    .update({ status: 'declined' } as never)
    .eq('id', params.requestId)

  // Transition instance to declined
  await transitionStatus(supabase, {
    tenantId: params.tenantId,
    instanceId: request.document_instance_id,
    newStatus: 'declined',
    performedBy: params.performedBy,
    eventPayload: { reason: 'signer_declined' },
  })
}

// ─── Send Reminder ───────────────────────────────────────────────────────────

export async function sendSignerReminder(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    signerId: string
    requestId: string
    note?: string
    performedBy: string
  }
): Promise<ServiceResult> {
  await logSignerEvent(supabase, {
    tenantId: params.tenantId,
    signerId: params.signerId,
    requestId: params.requestId,
    eventType: 'reminder_sent',
    note: params.note ?? 'Reminder sent',
    performedBy: params.performedBy,
  })

  return { success: true }
}
