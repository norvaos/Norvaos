/**
 * Shadow Matter Service — Directive 021 / 023
 *
 * "Atomic Transfer" logic: clones a client's hardened PII, address history,
 * and personal history from a previous matter into a new "shadow" renewal matter.
 * When the lawyer opens the shadow matter, it is already 70% populated.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ShadowMatterResult {
  success: boolean
  matter_id?: string
  matter_number?: string
  cloned_addresses?: number
  cloned_personal?: number
  error?: string
}

export interface ProspectTrigger {
  id: string
  contact_id: string
  document_type: string
  expiry_date: string
  status: string
  shadow_matter_id: string | null
  source_matter_id: string | null
  last_triggered_at: string | null
  last_trigger_days: number | null
}

// ─── Initialize Shadow Matter ───────────────────────────────────────────────

export async function initializeShadowMatter(params: {
  contactId: string
  tenantId: string
  userId: string
  matterTypeId: string
  sourceMatterId?: string
  triggerId?: string
}): Promise<ShadowMatterResult> {
  const admin = createAdminClient()

  const { data, error } = await (admin as any).rpc('fn_initialize_shadow_matter', {
    p_contact_id: params.contactId,
    p_tenant_id: params.tenantId,
    p_user_id: params.userId,
    p_matter_type_id: params.matterTypeId,
    p_source_matter_id: params.sourceMatterId ?? undefined,
    p_trigger_id: params.triggerId ?? undefined,
  })

  if (error) {
    console.error('[shadow-matter] RPC error:', error)
    return { success: false, error: error.message }
  }

  const result = data as Record<string, unknown>
  return {
    success: result.success as boolean,
    matter_id: result.matter_id as string | undefined,
    matter_number: result.matter_number as string | undefined,
    cloned_addresses: result.cloned_addresses as number | undefined,
    cloned_personal: result.cloned_personal as number | undefined,
    error: result.error as string | undefined,
  }
}

// ─── Get Active Prospect Triggers ───────────────────────────────────────────

export async function getActiveProspectTriggers(
  supabase: SupabaseClient<any>,
  tenantId: string,
): Promise<ProspectTrigger[]> {
  const { data, error } = await (supabase as SupabaseClient<any>)
    .from('prospect_triggers')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('expiry_date', { ascending: true })

  if (error) {
    console.error('[shadow-matter] Failed to fetch triggers:', error)
    return []
  }

  return (data ?? []) as ProspectTrigger[]
}

// ─── Get Triggers for Contact ───────────────────────────────────────────────

export async function getContactTriggers(
  supabase: SupabaseClient<any>,
  contactId: string,
): Promise<ProspectTrigger[]> {
  const { data, error } = await (supabase as SupabaseClient<any>)
    .from('prospect_triggers')
    .select('*')
    .eq('contact_id', contactId)
    .order('expiry_date', { ascending: true })

  if (error) {
    console.error('[shadow-matter] Failed to fetch contact triggers:', error)
    return []
  }

  return (data ?? []) as ProspectTrigger[]
}

// ─── Upsert Prospect Trigger ────────────────────────────────────────────────
// Called by the sentinel cron when it detects an expiring document

export async function upsertProspectTrigger(params: {
  tenantId: string
  contactId: string
  documentType: string
  expiryDate: string
  sourceMatterId?: string
}): Promise<{ success: boolean; triggerId?: string; error?: string }> {
  const admin = createAdminClient()

  // Check if trigger already exists for this contact + document type
  const { data: existing } = await (admin as SupabaseClient<any>)
    .from('prospect_triggers')
    .select('id, status')
    .eq('contact_id', params.contactId)
    .eq('document_type', params.documentType)
    .eq('tenant_id', params.tenantId)
    .in('status', ['active', 'triggered'])
    .maybeSingle()

  if (existing) {
    // Update expiry date if changed
    await (admin as SupabaseClient<any>)
      .from('prospect_triggers')
      .update({ expiry_date: params.expiryDate, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    return { success: true, triggerId: existing.id }
  }

  // Create new trigger
  const { data, error } = await (admin as SupabaseClient<any>)
    .from('prospect_triggers')
    .insert({
      tenant_id: params.tenantId,
      contact_id: params.contactId,
      document_type: params.documentType,
      expiry_date: params.expiryDate,
      source_matter_id: params.sourceMatterId ?? null,
      status: 'active',
    })
    .select('id')
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, triggerId: data.id }
}
