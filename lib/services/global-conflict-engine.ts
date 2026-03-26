/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Global Conflict Engine  -  Directive 005.2
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Cross-entity fuzzy-match conflict detection across contacts, leads, and matters.
 * Wraps the database RPCs created in migration 204 for application-layer use.
 *
 * All operations enforce tenant isolation via RPC parameters and admin client.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/types/database'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GlobalConflictMatch {
  entity_id: string
  entity_type: 'contact' | 'lead' | 'matter'
  entity_name: string
  match_fields: string[] // e.g. ['fuzzy_name', 'email', 'dob']
  similarity: number // 0-100
  category: string // possible_duplicate, adverse_party, related_matter, former_client
  role?: string // for matter matches
  matter_number?: string
  matter_title?: string
  contact_id?: string // for matter matches  -  the matched contact on the matter
}

export interface GlobalConflictResult {
  contacts: GlobalConflictMatch[]
  leads: GlobalConflictMatch[]
  matters: GlobalConflictMatch[]
  score: number
  status: 'clear' | 'review_suggested' | 'review_required' | 'blocked'
  total_matches: number
}

export interface GlobalScanParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
  dateOfBirth?: string
  passportNumber?: string
  excludeContactId?: string
  sourceEntityType?: 'contact' | 'lead' | 'intake'
  sourceEntityId?: string
  scannedBy?: string
}

export interface FuzzyContactMatch {
  id: string
  first_name: string
  last_name: string
  similarity: number
}

export interface FuzzyLeadMatch {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  similarity: number
}

export interface MatterPartyMatch {
  matter_id: string
  matter_number: string | null
  matter_title: string
  contact_id: string
  contact_name: string
  role: string
  similarity: number
}

// ─── 1. runGlobalConflictScan ────────────────────────────────────────────────

/**
 * Run a comprehensive global conflict scan across contacts, leads, and matters.
 * Calls fn_global_conflict_scan RPC and persists the result for audit trail.
 */
export async function runGlobalConflictScan(
  params: GlobalScanParams
): Promise<GlobalConflictResult> {
  const {
    tenantId,
    firstName,
    lastName,
    email,
    phone,
    dateOfBirth,
    passportNumber,
    excludeContactId,
    sourceEntityType,
    sourceEntityId,
    scannedBy,
  } = params

  const admin = createAdminClient()

  // Call the comprehensive RPC
  const { data, error } = await (admin as any).rpc(
    'fn_global_conflict_scan' as never,
    {
      p_tenant_id: tenantId,
      p_first_name: firstName,
      p_last_name: lastName,
      p_email: email || null,
      p_phone: phone || null,
      p_dob: dateOfBirth || null,
      p_passport: passportNumber || null,
      p_exclude_contact_id: excludeContactId || null,
    } as never
  )

  if (error) {
    throw new Error(`Global conflict scan failed: ${error.message}`)
  }

  // Parse the JSONB result
  const raw = data as unknown as Record<string, unknown>
  const result: GlobalConflictResult = {
    contacts: (raw.contacts as GlobalConflictMatch[]) ?? [],
    leads: (raw.leads as GlobalConflictMatch[]) ?? [],
    matters: (raw.matters as GlobalConflictMatch[]) ?? [],
    score: (raw.score as number) ?? 0,
    status: (raw.status as GlobalConflictResult['status']) ?? 'clear',
    total_matches: (raw.total_matches as number) ?? 0,
  }

  // Persist the result for audit trail
  const searchInputs = {
    first_name: firstName,
    last_name: lastName,
    email: email || null,
    phone: phone || null,
    date_of_birth: dateOfBirth || null,
    passport_number: passportNumber || null,
    exclude_contact_id: excludeContactId || null,
  }

  const { error: insertError } = await (admin as any)
    .from('global_conflict_results')
    .insert({
      tenant_id: tenantId,
      source_entity_type: sourceEntityType ?? 'contact',
      source_entity_id: sourceEntityId ?? null,
      search_inputs: searchInputs as unknown as Json,
      result_data: raw as unknown as Json,
      score: result.score,
      status: result.status,
      scanned_by: scannedBy ?? null,
    })

  if (insertError) {
    // Log but don't fail the scan  -  the scan result is still valid
    console.error('[GlobalConflictEngine] Failed to persist scan result:', insertError.message)
  }

  return result
}

// ─── 2. searchContactsFuzzy ─────────────────────────────────────────────────

/**
 * Fuzzy search contacts by name using pg_trgm similarity.
 * Wraps the search_contacts_fuzzy RPC.
 */
export async function searchContactsFuzzy(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  searchName: string,
  excludeId?: string,
  threshold: number = 0.3
): Promise<FuzzyContactMatch[]> {
  const admin = createAdminClient()

  const { data, error } = await (admin as any).rpc(
    'search_contacts_fuzzy' as never,
    {
      p_tenant_id: tenantId,
      p_exclude_id: excludeId ?? '00000000-0000-0000-0000-000000000000',
      p_search_name: searchName,
      p_threshold: threshold,
    } as never
  )

  if (error) {
    console.error('[GlobalConflictEngine] searchContactsFuzzy error:', error.message)
    return []
  }

  return (data as unknown as FuzzyContactMatch[]) ?? []
}

// ─── 3. searchLeadsFuzzy ────────────────────────────────────────────────────

/**
 * Fuzzy search leads by name (via linked contact) using pg_trgm similarity.
 * Wraps the search_leads_fuzzy RPC.
 */
export async function searchLeadsFuzzy(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  searchName: string,
  threshold: number = 0.3
): Promise<FuzzyLeadMatch[]> {
  const admin = createAdminClient()

  const { data, error } = await (admin as any).rpc(
    'search_leads_fuzzy' as never,
    {
      p_tenant_id: tenantId,
      p_search_name: searchName,
      p_threshold: threshold,
    } as never
  )

  if (error) {
    console.error('[GlobalConflictEngine] searchLeadsFuzzy error:', error.message)
    return []
  }

  return (data as unknown as FuzzyLeadMatch[]) ?? []
}

// ─── 4. searchMattersByParty ────────────────────────────────────────────────

/**
 * Search matters by party name across matter_contacts using pg_trgm similarity.
 * Wraps the search_matters_by_party RPC.
 */
export async function searchMattersByParty(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  searchName: string,
  threshold: number = 0.3
): Promise<MatterPartyMatch[]> {
  const admin = createAdminClient()

  const { data, error } = await (admin as any).rpc(
    'search_matters_by_party' as never,
    {
      p_tenant_id: tenantId,
      p_search_name: searchName,
      p_threshold: threshold,
    } as never
  )

  if (error) {
    console.error('[GlobalConflictEngine] searchMattersByParty error:', error.message)
    return []
  }

  return (data as unknown as MatterPartyMatch[]) ?? []
}

// ─── 5. getGlobalConflictHistory ────────────────────────────────────────────

/**
 * Fetch past global conflict scan results for a given entity.
 * Uses the caller's supabase client (RLS-aware) for read access.
 */
export async function getGlobalConflictHistory(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  entityType: 'contact' | 'lead' | 'intake',
  entityId: string,
  limit: number = 20
): Promise<{
  id: string
  search_inputs: Record<string, unknown>
  result_data: GlobalConflictResult
  score: number
  status: string
  scanned_by: string | null
  created_at: string
}[]> {
  const { data, error } = await (supabase as any)
    .from('global_conflict_results')
    .select('id, search_inputs, result_data, score, status, scanned_by, created_at')
    .eq('tenant_id', tenantId)
    .eq('source_entity_type', entityType)
    .eq('source_entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[GlobalConflictEngine] getGlobalConflictHistory error:', error.message)
    return []
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    search_inputs: row.search_inputs as Record<string, unknown>,
    result_data: row.result_data as unknown as GlobalConflictResult,
    score: row.score,
    status: row.status,
    scanned_by: row.scanned_by,
    created_at: row.created_at,
  }))
}
