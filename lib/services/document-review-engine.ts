// ============================================================================
// Document Review Engine  -  Acceptance Workflow + Client Notifications
// ============================================================================
// Manages the document acceptance workflow: accept / needs_re_upload / reject.
// Uses the review_document_version() RPC for atomic state transitions.
//
// Public API:
//   reviewDocumentSlot()  -  atomic review via RPC + optional client notification
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/types/database'
import { sendClientEmail } from '@/lib/services/email-service'
import { checkAndMarkStalePacks } from '@/lib/services/stale-draft-engine'
import { syncImmigrationIntakeStatus } from '@/lib/services/immigration-status-engine'

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface ReviewParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  userId: string
  slotId: string
  action: 'accept' | 'needs_re_upload' | 'reject'
  reason?: string
  rejectionReasonCode?: string
  notifyClient?: boolean
}

export interface ReviewResult {
  success: boolean
  slotId?: string
  versionNumber?: number
  newStatus?: string
  error?: string
}

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Review a document slot: accept, request re-upload, or reject.
 *
 * Uses the `review_document_version` RPC for atomic state transitions:
 * - Locks slot row
 * - Updates document_versions.review_status, reviewed_by, reviewed_at, review_reason
 * - Updates document_slots.status
 * - Inserts audit_logs entry
 * All in a single transaction  -  no partial state possible.
 *
 * Client notification (if requested) happens AFTER the RPC succeeds.
 * Email failure never rolls back the review.
 */
export async function reviewDocumentSlot(params: ReviewParams): Promise<ReviewResult> {
  const { supabase, tenantId, userId, slotId, action, reason, rejectionReasonCode, notifyClient } = params

  // 1. Call the review RPC (single atomic transaction)
  const { data, error } = await supabase.rpc('review_document_version', {
    p_tenant_id: tenantId,
    p_slot_id: slotId,
    p_user_id: userId,
    p_action: action,
    p_reason: reason ?? undefined,
  })

  if (error) {
    console.error('[document-review-engine] RPC error:', error)
    return { success: false, error: error.message }
  }

  const rpcResult = data as unknown as {
    success: boolean
    slot_id?: string
    version_number?: number
    new_status?: string
    error?: string
  }

  if (!rpcResult?.success) {
    return {
      success: false,
      error: rpcResult?.error ?? 'Review failed',
    }
  }

  // 1b. Store structured rejection_reason_code if provided (non-blocking, best-effort)
  if (rejectionReasonCode && rpcResult.version_number) {
    try {
      await supabase
        .from('document_versions')
        .update({ rejection_reason_code: rejectionReasonCode } as never)
        .eq('slot_id', slotId)
        .eq('version_number', rpcResult.version_number)
    } catch (err) {
      console.error('[document-review-engine] Failed to store rejection_reason_code:', err)
    }
  }

  // 2. Client notification (non-blocking, outside transaction)
  if (notifyClient && (action === 'needs_re_upload' || action === 'reject')) {
    try {
      // Fetch slot details for notification
      const { data: slot } = await supabase
        .from('document_slots')
        .select('slot_name, matter_id')
        .eq('id', slotId)
        .single()

      if (slot?.matter_id) {
        // Fetch matter's primary client contact
        const { data: primaryClient } = await supabase
          .from('matter_contacts')
          .select('contact_id')
          .eq('matter_id', slot.matter_id)
          .eq('role', 'client')
          .limit(1)
          .maybeSingle()

        if (primaryClient?.contact_id) {
          const actionLabel =
            action === 'needs_re_upload'
              ? 'needs to be re-uploaded'
              : 'has been rejected'

          await sendClientEmail({
            supabase,
            tenantId,
            matterId: slot.matter_id,
            contactId: primaryClient.contact_id,
            notificationType: 'document_request',
            templateData: {
              document_names: [slot.slot_name],
              message: `Your document "${slot.slot_name}" ${actionLabel}.${
                reason ? ` Reason: ${reason}` : ''
              } Please upload an updated version.`,
            },
          })
        }
      }
    } catch (err) {
      // Non-blocking  -  email failure should not affect the review result
      console.error('[document-review-engine] Notification error:', err)
    }
  }

  // 3. Immigration sequence control: stale draft check + status sync (non-blocking)
  try {
    // Fetch the matter_id from the slot if not already known
    const { data: slotRow } = await supabase
      .from('document_slots')
      .select('matter_id')
      .eq('id', slotId)
      .single()

    if (slotRow?.matter_id) {
      // Check if any form packs should be marked stale due to document change
      await checkAndMarkStalePacks(supabase, slotRow.matter_id, 'document_change')

      // Re-sync immigration intake status
      await syncImmigrationIntakeStatus(supabase, slotRow.matter_id, userId)
    }
  } catch (err) {
    // Non-blocking  -  sequence control failure should not affect the review result
    console.error('[document-review-engine] Immigration sequence control error:', err)
  }

  return {
    success: true,
    slotId: rpcResult.slot_id,
    versionNumber: rpcResult.version_number,
    newStatus: rpcResult.new_status,
  }
}
