// ============================================================================
// Document Request Service — Send structured document requests to clients
// ============================================================================
// Encapsulates the "Send Document Request" workflow:
//   1. Resolve outstanding slots
//   2. Find primary client contact
//   3. Ensure active portal link
//   4. Send email via existing email-service
//   5. Create document_requests audit record
//   6. Log activity
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/types/database'
import { sendClientEmail } from './email-service'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SendDocumentRequestParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  matterId: string
  slotIds: string[]
  requestedBy: string // user ID (or 'system' for auto-triggered)
  message?: string
  language?: string // PortalLocale code (en, fr, es, ar, zh, etc.)
}

export interface SendDocumentRequestResult {
  success: boolean
  requestId?: string
  error?: string
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Send a document request to the primary client contact on a matter.
 *
 * Creates a structured email listing outstanding document slots with a
 * portal link for upload. Logs the request with a snapshot of which
 * slots were included (audit trail for the reminder engine).
 */
export async function sendDocumentRequest(
  params: SendDocumentRequestParams
): Promise<SendDocumentRequestResult> {
  const { supabase, tenantId, matterId, slotIds, requestedBy, message, language } = params

  try {
    // 1. Fetch slot details
    const { data: slots, error: slotErr } = await supabase
      .from('document_slots')
      .select('id, slot_name')
      .in('id', slotIds)
      .eq('matter_id', matterId)
      .eq('is_active', true)

    if (slotErr || !slots || slots.length === 0) {
      return { success: false, error: 'No valid slots found' }
    }

    const slotNames = slots.map((s) => s.slot_name)
    const resolvedSlotIds = slots.map((s) => s.id)

    // 2. Find primary client contact
    const { data: primaryContact } = await supabase
      .from('matter_contacts')
      .select('contact_id')
      .eq('matter_id', matterId)
      .eq('role', 'client')
      .limit(1)
      .maybeSingle()

    if (!primaryContact?.contact_id) {
      return { success: false, error: 'No client contact found on this matter' }
    }

    // 3. Ensure active portal link exists
    const { data: existingLink } = await supabase
      .from('portal_links')
      .select('id, metadata')
      .eq('matter_id', matterId)
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .limit(1)
      .maybeSingle()

    let portalLinkId = existingLink?.id ?? null

    // Update existing portal link with preferred language if provided
    if (portalLinkId && language) {
      const existingMeta = (existingLink?.metadata && typeof existingLink.metadata === 'object' && !Array.isArray(existingLink.metadata))
        ? existingLink.metadata as Record<string, unknown>
        : {}
      await supabase
        .from('portal_links')
        .update({
          metadata: { ...existingMeta, preferred_language: language } as unknown as Json,
        })
        .eq('id', portalLinkId)
    }

    if (!portalLinkId) {
      // Auto-create a 30-day portal link
      const token = crypto.randomUUID() + '-' + crypto.randomUUID()
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 30)

      const portalMetadata: Record<string, unknown> = {}
      if (language) portalMetadata.preferred_language = language

      const { data: newLink } = await supabase
        .from('portal_links')
        .insert({
          tenant_id: tenantId,
          matter_id: matterId,
          contact_id: primaryContact.contact_id,
          token,
          expires_at: expiresAt.toISOString(),
          is_active: true,
          created_by: requestedBy === 'system' ? null : requestedBy,
          metadata: portalMetadata as Json,
        })
        .select('id')
        .single()

      portalLinkId = newLink?.id ?? null
    }

    // 4. Send email with document_request template
    await sendClientEmail({
      supabase,
      tenantId,
      matterId,
      contactId: primaryContact.contact_id,
      notificationType: 'document_request',
      templateData: {
        document_names: slotNames,
        message: message || (language === 'fr'
          ? 'Veuillez téléverser les documents suivants dès que possible.'
          : 'Please upload the following documents as soon as possible.'),
        language: language || 'en',
      },
    })

    // 5. Create document_requests audit record
    const { data: requestRecord } = await supabase
      .from('document_requests')
      .insert({
        tenant_id: tenantId,
        matter_id: matterId,
        contact_id: primaryContact.contact_id,
        requested_by: requestedBy === 'system' ? null : requestedBy,
        slot_ids: resolvedSlotIds,
        slot_names: slotNames,
        message: message ?? null,
        portal_link_id: portalLinkId,
        status: 'sent',
      })
      .select('id')
      .single()

    // 6. Log activity
    await supabase.from('activities').insert({
      tenant_id: tenantId,
      matter_id: matterId,
      activity_type: 'document_request_sent',
      title: `Document request sent (${slotNames.length} document${slotNames.length === 1 ? '' : 's'})`,
      description: `Requested: ${slotNames.join(', ')}`,
      entity_type: 'matter',
      entity_id: matterId,
      user_id: requestedBy === 'system' ? null : requestedBy,
      metadata: {
        slot_ids: resolvedSlotIds,
        slot_names: slotNames,
        request_id: requestRecord?.id,
        triggered_by: requestedBy === 'system' ? 'auto' : 'manual',
      } as unknown as Json,
    })

    return { success: true, requestId: requestRecord?.id }
  } catch (err) {
    console.error('[document-request-service] Error:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to send document request',
    }
  }
}
