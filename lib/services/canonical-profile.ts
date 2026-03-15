/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Canonical Profile Service — Three-Layer IRCC Data Model
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Implements the three-layer canonical profile system:
 *   Layer 1: Contact-level canonical fields (shared across all matters)
 *   Layer 2: Matter-level snapshot/overrides (per-matter working data)
 *   Layer 3: Application form rendering (assembled at query time)
 *
 * Lookup order: matter override > canonical value > empty
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type {
  CanonicalProfileRow,
  CanonicalProfileFieldRow,
  CanonicalProfileFieldInsert,
  CanonicalProfileSnapshotRow,
  CanonicalProfileConflictRow,
} from '@/lib/types/database'

// ─── Types ───────────────────────────────────────────────────────────────────

export type CanonicalDomain =
  | 'identity'
  | 'address'
  | 'travel'
  | 'education'
  | 'employment'
  | 'immigration'
  | 'family'
  | 'sponsor'
  | 'declarations'

export type FieldSource = 'extraction' | 'client_portal' | 'staff' | 'import'

export type VerificationStatus = 'pending' | 'verified' | 'client_submitted' | 'conflict'

export type ConflictResolution = 'pending' | 'accept_new' | 'keep_existing' | 'manual'

export interface UpdateFieldOptions {
  effectiveFrom?: string  // YYYY-MM-DD
  sourceDocumentId?: string
  verificationStatus?: VerificationStatus
}

export interface CanonicalProfileWithFields extends CanonicalProfileRow {
  fields: CanonicalProfileFieldRow[]
}

export interface FieldLookupResult {
  value: unknown
  source: FieldSource | 'snapshot' | null
  isOverridden: boolean
  fieldRecord: CanonicalProfileFieldRow | null
}

// ─── Create Profile ──────────────────────────────────────────────────────────

/**
 * Create a canonical profile for a contact. Returns the profile ID.
 * Idempotent — returns existing profile if one already exists.
 */
export async function createCanonicalProfile(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  contactId: string,
): Promise<string> {
  // Check for existing profile first
  const { data: existing } = await supabase
    .from('canonical_profiles')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('contact_id', contactId)
    .maybeSingle()

  if (existing) return existing.id

  const { data, error } = await supabase
    .from('canonical_profiles')
    .insert({ tenant_id: tenantId, contact_id: contactId })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

// ─── Get Profile ─────────────────────────────────────────────────────────────

/**
 * Retrieve a canonical profile with all current (non-expired) fields.
 */
export async function getCanonicalProfile(
  supabase: SupabaseClient<Database>,
  contactId: string,
): Promise<CanonicalProfileWithFields | null> {
  const { data: profile, error: profileErr } = await supabase
    .from('canonical_profiles')
    .select('*')
    .eq('contact_id', contactId)
    .maybeSingle()

  if (profileErr) throw profileErr
  if (!profile) return null

  const { data: fields, error: fieldsErr } = await supabase
    .from('canonical_profile_fields')
    .select('*')
    .eq('profile_id', profile.id)
    .is('effective_to', null)
    .order('domain')
    .order('field_key')

  if (fieldsErr) throw fieldsErr

  return {
    ...profile,
    fields: fields ?? [],
  }
}

// ─── Update Field ────────────────────────────────────────────────────────────

/**
 * Update a canonical field. If the value differs from the existing value for
 * the same field_key, triggers conflict detection.
 *
 * When a conflict is detected:
 * - A conflict record is created
 * - The existing field's verification_status is set to 'conflict'
 * - The new value is NOT applied until the conflict is resolved
 *
 * When no conflict exists (or field is new):
 * - The previous effective field gets effective_to set to today
 * - The new field is inserted
 */
export async function updateCanonicalField(
  supabase: SupabaseClient<Database>,
  profileId: string,
  domain: CanonicalDomain,
  fieldKey: string,
  value: unknown,
  source: FieldSource,
  options?: UpdateFieldOptions,
): Promise<{ updated: boolean; conflictId?: string }> {
  const effectiveFrom = options?.effectiveFrom ?? new Date().toISOString().split('T')[0]

  // Check for existing current value
  const { data: existing } = await supabase
    .from('canonical_profile_fields')
    .select('*')
    .eq('profile_id', profileId)
    .eq('field_key', fieldKey)
    .is('effective_to', null)
    .maybeSingle()

  // If an existing value exists and differs, run conflict detection
  if (existing) {
    const existingValue = existing.value
    const valuesMatch = JSON.stringify(existingValue) === JSON.stringify(value)

    if (!valuesMatch) {
      const conflictId = await detectConflicts(
        supabase,
        profileId,
        fieldKey,
        value,
        source,
      )
      if (conflictId) {
        return { updated: false, conflictId }
      }
    }

    // Close out the old effective period
    await supabase
      .from('canonical_profile_fields')
      .update({ effective_to: effectiveFrom })
      .eq('id', existing.id)
  }

  // Insert new field value
  const insertData: CanonicalProfileFieldInsert = {
    profile_id: profileId,
    domain,
    field_key: fieldKey,
    value: value as Database['public']['Tables']['canonical_profile_fields']['Row']['value'],
    effective_from: effectiveFrom,
    source,
    source_document_id: options?.sourceDocumentId ?? null,
    verification_status: options?.verificationStatus ?? 'pending',
  }

  const { error } = await supabase
    .from('canonical_profile_fields')
    .insert(insertData)

  if (error) throw error

  // Touch the profile updated_at
  await supabase
    .from('canonical_profiles')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', profileId)

  return { updated: true }
}

// ─── Snapshots ───────────────────────────────────────────────────────────────

/**
 * Create a snapshot of the current canonical profile state for a matter.
 * This is the Layer 2 (matter-level working data) of the three-layer model.
 */
export async function createSnapshot(
  supabase: SupabaseClient<Database>,
  profileId: string,
  matterId: string,
): Promise<CanonicalProfileSnapshotRow> {
  // Gather all current (non-expired) fields
  const { data: fields, error: fieldsErr } = await supabase
    .from('canonical_profile_fields')
    .select('*')
    .eq('profile_id', profileId)
    .is('effective_to', null)

  if (fieldsErr) throw fieldsErr

  // Structure snapshot data by domain
  const snapshotData: Record<string, Record<string, unknown>> = {}
  for (const field of fields ?? []) {
    if (!snapshotData[field.domain]) {
      snapshotData[field.domain] = {}
    }
    snapshotData[field.domain][field.field_key] = {
      value: field.value,
      source: field.source,
      verification_status: field.verification_status,
      effective_from: field.effective_from,
    }
  }

  // Upsert — allows re-snapshotting the same matter
  const { data, error } = await supabase
    .from('canonical_profile_snapshots')
    .upsert(
      {
        profile_id: profileId,
        matter_id: matterId,
        snapshot_data: snapshotData as unknown as Database['public']['Tables']['canonical_profile_snapshots']['Row']['snapshot_data'],
      },
      { onConflict: 'profile_id,matter_id' },
    )
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Get the snapshot for a specific matter.
 */
export async function getSnapshot(
  supabase: SupabaseClient<Database>,
  profileId: string,
  matterId: string,
): Promise<CanonicalProfileSnapshotRow | null> {
  const { data, error } = await supabase
    .from('canonical_profile_snapshots')
    .select('*')
    .eq('profile_id', profileId)
    .eq('matter_id', matterId)
    .maybeSingle()

  if (error) throw error
  return data
}

// ─── Conflict Detection ──────────────────────────────────────────────────────

/**
 * Detect conflicts between an incoming value and the existing canonical value.
 * If a conflict is detected, creates a conflict record and returns the ID.
 * Returns null if no conflict (values match or no existing value).
 */
export async function detectConflicts(
  supabase: SupabaseClient<Database>,
  profileId: string,
  fieldKey: string,
  newValue: unknown,
  newSource: string,
): Promise<string | null> {
  // Get existing current value
  const { data: existing } = await supabase
    .from('canonical_profile_fields')
    .select('value, source, verification_status')
    .eq('profile_id', profileId)
    .eq('field_key', fieldKey)
    .is('effective_to', null)
    .maybeSingle()

  if (!existing) return null

  const existingValue = existing.value
  const valuesMatch = JSON.stringify(existingValue) === JSON.stringify(newValue)

  if (valuesMatch) return null

  // Create conflict record
  const { data: conflict, error } = await supabase
    .from('canonical_profile_conflicts')
    .insert({
      profile_id: profileId,
      field_key: fieldKey,
      existing_value: existingValue,
      new_value: newValue as Database['public']['Tables']['canonical_profile_conflicts']['Row']['new_value'],
      new_source: newSource,
    })
    .select('id')
    .single()

  if (error) throw error

  // Mark the existing field as in conflict
  await supabase
    .from('canonical_profile_fields')
    .update({ verification_status: 'conflict' })
    .eq('profile_id', profileId)
    .eq('field_key', fieldKey)
    .is('effective_to', null)

  return conflict.id
}

// ─── Conflict Resolution ─────────────────────────────────────────────────────

/**
 * Resolve a conflict. Depending on resolution:
 * - accept_new: closes old field, inserts new value
 * - keep_existing: discards the new value, clears conflict status
 * - manual: marks as manually resolved (no automatic field change)
 */
export async function resolveConflict(
  supabase: SupabaseClient<Database>,
  conflictId: string,
  resolution: ConflictResolution,
  resolvedBy: string,
): Promise<void> {
  // Get the conflict record
  const { data: conflict, error: fetchErr } = await supabase
    .from('canonical_profile_conflicts')
    .select('*')
    .eq('id', conflictId)
    .single()

  if (fetchErr) throw fetchErr

  // Update conflict record
  const { error: updateErr } = await supabase
    .from('canonical_profile_conflicts')
    .update({
      resolution,
      resolved_by: resolvedBy,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', conflictId)

  if (updateErr) throw updateErr

  if (resolution === 'accept_new') {
    // Close the existing field
    const today = new Date().toISOString().split('T')[0]
    await supabase
      .from('canonical_profile_fields')
      .update({ effective_to: today, verification_status: 'pending' })
      .eq('profile_id', conflict.profile_id)
      .eq('field_key', conflict.field_key)
      .is('effective_to', null)

    // Determine domain from existing field
    const { data: existingField } = await supabase
      .from('canonical_profile_fields')
      .select('domain')
      .eq('profile_id', conflict.profile_id)
      .eq('field_key', conflict.field_key)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle()

    const domain = existingField?.domain ?? 'identity'

    // Insert the new value
    await supabase
      .from('canonical_profile_fields')
      .insert({
        profile_id: conflict.profile_id,
        domain,
        field_key: conflict.field_key,
        value: conflict.new_value,
        effective_from: today,
        source: conflict.new_source as FieldSource,
        verification_status: 'verified',
      })
  } else if (resolution === 'keep_existing') {
    // Clear conflict status on the existing field
    await supabase
      .from('canonical_profile_fields')
      .update({ verification_status: 'verified' })
      .eq('profile_id', conflict.profile_id)
      .eq('field_key', conflict.field_key)
      .is('effective_to', null)
  }
  // 'manual' resolution — conflict is marked resolved but no field changes
}

// ─── Three-Layer Field Lookup ────────────────────────────────────────────────

/**
 * Three-layer field lookup: matter override > canonical > empty.
 *
 * 1. Check matter-level snapshot for an override
 * 2. Fall back to canonical profile field
 * 3. Return empty/null if nothing found
 */
export async function getFormFieldOverrides(
  supabase: SupabaseClient<Database>,
  matterId: string,
  fieldKey: string,
): Promise<FieldLookupResult> {
  // Layer 2: Check matter snapshot for override
  const { data: snapshot } = await supabase
    .from('canonical_profile_snapshots')
    .select('snapshot_data, profile_id')
    .eq('matter_id', matterId)
    .maybeSingle()

  if (snapshot?.snapshot_data) {
    const snapshotData = snapshot.snapshot_data as Record<string, Record<string, { value: unknown }>>
    for (const domain of Object.values(snapshotData)) {
      if (domain[fieldKey]) {
        return {
          value: domain[fieldKey].value,
          source: 'snapshot',
          isOverridden: true,
          fieldRecord: null,
        }
      }
    }
  }

  // Layer 1: Check canonical profile
  if (snapshot?.profile_id) {
    const { data: field } = await supabase
      .from('canonical_profile_fields')
      .select('*')
      .eq('profile_id', snapshot.profile_id)
      .eq('field_key', fieldKey)
      .is('effective_to', null)
      .maybeSingle()

    if (field) {
      return {
        value: field.value,
        source: field.source as FieldSource,
        isOverridden: false,
        fieldRecord: field,
      }
    }
  }

  // Layer 3: Empty — no value found
  return {
    value: null,
    source: null,
    isOverridden: false,
    fieldRecord: null,
  }
}
