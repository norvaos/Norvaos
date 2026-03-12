/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Stale Draft Detection Engine
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Detects when a material change has occurred after form pack generation
 * and marks affected packs as stale. Prevents filing with outdated data.
 *
 * Trigger points (application-level):
 *   - After questionnaire save (portal or staff)
 *   - After revalidateIntake() completes (people changes, intake saves)
 *   - After document review (accept/reject/re-upload)
 *
 * Design:
 *   - Compares input_snapshot against current immigration_data
 *   - Only marks stale if a field that was in the snapshot has changed
 *   - Logs activity and notifies responsible lawyer
 *   - Non-blocking — failure does not break the calling mutation
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { profilePathGet } from '@/lib/ircc/questionnaire-engine'
import { getPlaybook } from '@/lib/config/immigration-playbooks'

type Json = Database['public']['Tables']['activities']['Insert']['metadata']

// ── Types ────────────────────────────────────────────────────────────────────

export interface StaleCheckResult {
  markedStale: number
  packIds: string[]
}

type ChangeType = 'questionnaire_update' | 'document_change' | 'person_change'

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Check if any active (non-superseded, non-stale) form pack versions
 * need to be marked stale due to data changes.
 *
 * Safe to call after any mutation — non-blocking on failure.
 */
export async function checkAndMarkStalePacks(
  supabase: SupabaseClient<Database>,
  matterId: string,
  changeType: ChangeType
): Promise<StaleCheckResult> {
  const result: StaleCheckResult = { markedStale: 0, packIds: [] }

  try {
    // 1. Fetch active form pack versions (not superseded, not already stale)
    const { data: versions } = await supabase
      .from('form_pack_versions')
      .select('id, pack_type, version_number, input_snapshot, status, is_stale')
      .eq('matter_id', matterId)
      .in('status', ['draft', 'approved'])
      .eq('is_stale', false)

    if (!versions || versions.length === 0) return result

    // 2. Handle different change types
    if (changeType === 'questionnaire_update' || changeType === 'person_change') {
      await handleProfileChange(supabase, matterId, versions, changeType, result)
    } else if (changeType === 'document_change') {
      await handleDocumentChange(supabase, matterId, versions, result)
    }

    // 3. Log activity if any packs were marked stale
    if (result.markedStale > 0) {
      const { data: matter } = await supabase
        .from('matters')
        .select('tenant_id, responsible_lawyer_id')
        .eq('id', matterId)
        .single()

      if (matter) {
        await supabase.from('activities').insert({
          tenant_id: matter.tenant_id,
          matter_id: matterId,
          activity_type: 'form_pack_stale',
          title: `${result.markedStale} form pack(s) marked stale`,
          description: `${result.markedStale} form pack(s) marked stale due to ${changeType.replace(/_/g, ' ')}. Regeneration required.`,
          metadata: {
            change_type: changeType,
            stale_pack_ids: result.packIds,
            count: result.markedStale,
          } as unknown as Json,
        })

        // Notify responsible lawyer
        if (matter.responsible_lawyer_id) {
          await supabase.from('notifications').insert({
            tenant_id: matter.tenant_id,
            user_id: matter.responsible_lawyer_id,
            title: 'Form Pack Stale',
            message: `${result.markedStale} form pack(s) require regeneration due to intake data changes.`,
            entity_type: 'matter',
            entity_id: matterId,
            priority: 'high',
          })
        }
      }
    }
  } catch (err) {
    // Non-blocking — log and continue
    console.error('[STALE-DRAFT] Failed to check stale packs:', err)
  }

  return result
}

// ── Internal ─────────────────────────────────────────────────────────────────

async function handleProfileChange(
  supabase: SupabaseClient<Database>,
  matterId: string,
  versions: Array<{
    id: string
    pack_type: string
    version_number: number
    input_snapshot: unknown
    status: string
    is_stale: boolean
  }>,
  changeType: ChangeType,
  result: StaleCheckResult
) {
  // Fetch current immigration_data from the primary contact
  const { data: matterContacts } = await supabase
    .from('matter_contacts')
    .select('contact_id')
    .eq('matter_id', matterId)
    .eq('role', 'client')
    .limit(1)

  if (!matterContacts || matterContacts.length === 0) return

  const { data: contact } = await supabase
    .from('contacts')
    .select('immigration_data')
    .eq('id', matterContacts[0].contact_id)
    .single()

  if (!contact) return

  const currentProfile = (contact.immigration_data ?? {}) as Record<string, unknown>

  for (const version of versions) {
    const snapshot = (version.input_snapshot ?? {}) as Record<string, unknown>
    const changed = hasSnapshotDivergence(snapshot, currentProfile)

    if (changed) {
      await markStale(supabase, version.id, `Profile data changed after generation (${changeType.replace(/_/g, ' ')})`)
      result.markedStale++
      result.packIds.push(version.id)
    }
  }
}

async function handleDocumentChange(
  supabase: SupabaseClient<Database>,
  matterId: string,
  versions: Array<{
    id: string
    pack_type: string
    version_number: number
    input_snapshot: unknown
    status: string
    is_stale: boolean
  }>,
  result: StaleCheckResult
) {
  // Get the matter's program category to find the playbook
  const { data: intake } = await supabase
    .from('matter_intake')
    .select('program_category')
    .eq('matter_id', matterId)
    .maybeSingle()

  const playbook = getPlaybook(intake?.program_category)
  if (!playbook) return

  // Only mark stale if the changed document is in the formGenerationRules.requiredDocumentSlugs
  // We mark all packs stale on any required document change (conservative approach)
  const requiredSlugs = playbook.formGenerationRules.requiredDocumentSlugs
  if (requiredSlugs.length === 0) return

  for (const version of versions) {
    await markStale(supabase, version.id, 'Required document changed after generation')
    result.markedStale++
    result.packIds.push(version.id)
  }
}

async function markStale(
  supabase: SupabaseClient<Database>,
  versionId: string,
  reason: string
) {
  await supabase
    .from('form_pack_versions')
    .update({
      is_stale: true,
      stale_reason: reason,
      stale_at: new Date().toISOString(),
    })
    .eq('id', versionId)
}

/**
 * Compare a snapshot (frozen at generation time) against the current profile.
 * Returns true if any field that existed in the snapshot now has a different value.
 *
 * Only checks fields that were captured — new fields added after generation
 * do not trigger staleness (they'll be picked up on regeneration).
 */
function hasSnapshotDivergence(
  snapshot: Record<string, unknown>,
  current: Record<string, unknown>
): boolean {
  // Flatten both to dot-notation paths for comparison
  const snapshotPaths = flattenObject(snapshot)
  const currentPaths = flattenObject(current)

  for (const [path, snapshotValue] of Object.entries(snapshotPaths)) {
    const currentValue = currentPaths[path]

    // Skip null/undefined in snapshot — these weren't filled at generation time
    if (snapshotValue === null || snapshotValue === undefined) continue
    if (snapshotValue === '') continue

    // Compare as strings to handle type differences
    const snapshotStr = String(snapshotValue)
    const currentStr = currentValue !== null && currentValue !== undefined
      ? String(currentValue)
      : ''

    if (snapshotStr !== currentStr) {
      return true
    }
  }

  return false
}

/**
 * Flatten a nested object to dot-notation paths.
 * { a: { b: 1 } } → { 'a.b': 1 }
 */
function flattenObject(
  obj: Record<string, unknown>,
  prefix = ''
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, path))
    } else {
      result[path] = value
    }
  }

  return result
}
