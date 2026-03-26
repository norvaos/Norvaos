/**
 * Atomic Shadow Engine  -  Session B: Performance & Execution
 *
 * Sub-100ms Lead-to-Matter conversion via single PostgreSQL transaction.
 * Clones address_history + personal_history + scrubs Lead PII atomically.
 * No "soft data" window  -  the Lead is scrubbed in the same transaction.
 */

import { createAdminClient } from '@/lib/supabase/admin'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AtomicShadowResult {
  success: boolean
  matter_id?: string
  matter_number?: string
  contact_id?: string
  cloned_addresses?: number
  cloned_personal?: number
  pii_fields_scrubbed?: number
  elapsed_ms?: number
  atomic?: boolean
  error?: string
}

// ─── Execute Atomic Lead-to-Matter Conversion ───────────────────────────────

export async function executeAtomicShadowTransfer(params: {
  leadId: string
  tenantId: string
  userId: string
  title?: string
  practiceAreaId?: string
  matterTypeId?: string
  description?: string
}): Promise<AtomicShadowResult> {
  const admin = createAdminClient()

  const { data, error } = await (admin as any).rpc('fn_atomic_lead_to_matter', {
    p_lead_id: params.leadId,
    p_tenant_id: params.tenantId,
    p_user_id: params.userId,
    p_title: params.title ?? null,
    p_practice_area_id: params.practiceAreaId ?? null,
    p_matter_type_id: params.matterTypeId ?? null,
    p_description: params.description ?? null,
  })

  if (error) {
    console.error('[atomic-shadow] RPC error:', error)
    return { success: false, error: error.message }
  }

  const result = data as Record<string, unknown>

  if (!result.success) {
    return { success: false, error: result.error as string }
  }

  return {
    success: true,
    matter_id: result.matter_id as string,
    matter_number: result.matter_number as string,
    contact_id: result.contact_id as string | undefined,
    cloned_addresses: result.cloned_addresses as number,
    cloned_personal: result.cloned_personal as number,
    pii_fields_scrubbed: result.pii_fields_scrubbed as number,
    elapsed_ms: result.elapsed_ms as number,
    atomic: result.atomic as boolean,
  }
}
