/**
 * Vault Sync Service  -  Bi-Directional Contact ↔ Matter Data Sync
 *
 * Ensures contacts.immigration_data and matter_custom_data act as a
 * single source of truth. Data entered once is accessible across all
 * future matters for that client.
 *
 * Sync directions:
 *   Contact → Matter: When contact profile is updated
 *   Matter → Contact: When matter custom data changes (immigration sections)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { withContactPIIEncrypted } from '@/lib/services/pii-dual-write'

// Fields that sync from contact → matter and vice versa
const SYNC_FIELDS = [
  'passport_number',
  'passport_expiry',
  'uci_number',
  'country_of_birth',
  'country_of_residence',
  'nationality',
  'immigration_status',
  'immigration_status_expiry',
  'marital_status',
  'currently_in_canada',
] as const

interface SyncResult {
  synced: boolean
  direction: 'contact_to_matters' | 'matter_to_contact'
  fieldsUpdated: string[]
  mattersAffected?: number
  skippedReason?: string
}

/**
 * Sync contact immigration data → all active matters for that contact.
 * Call this after updating contacts.immigration_data or contact profile fields.
 */
export async function syncContactToMatters(
  supabase: SupabaseClient,
  contactId: string,
  tenantId: string,
): Promise<SyncResult> {
  const fieldsUpdated: string[] = []

  // 1. Fetch current contact immigration data
  const { data: contact } = await supabase
    .from('contacts')
    .select('immigration_data, nationality, immigration_status, immigration_status_expiry, country_of_birth, country_of_residence, marital_status, currently_in_canada')
    .eq('id', contactId)
    .single()

  if (!contact) return { synced: false, direction: 'contact_to_matters', fieldsUpdated }

  // 2. Build sync payload from contact fields
  const syncPayload: Record<string, unknown> = {}
  const immigrationData = (contact.immigration_data ?? {}) as Record<string, unknown>

  // Merge top-level contact fields + nested immigration_data
  for (const field of SYNC_FIELDS) {
    const value = (contact as Record<string, unknown>)[field] ?? immigrationData[field]
    if (value !== undefined && value !== null) {
      syncPayload[field] = value
      fieldsUpdated.push(field)
    }
  }

  if (fieldsUpdated.length === 0) {
    return { synced: false, direction: 'contact_to_matters', fieldsUpdated }
  }

  // 3. Find all active matters for this contact
  const { data: matterLinks } = await supabase
    .from('matter_contacts')
    .select('matter_id, matters!inner(id, status)')
    .eq('contact_id', contactId)
    .eq('tenant_id', tenantId)

  const activeMatterIds = (matterLinks ?? [])
    .filter((ml: any) => {
      const matter = (ml as any).matters
      return matter?.status === 'active'
    })
    .map((ml: any) => ml.matter_id)

  if (activeMatterIds.length === 0) {
    return { synced: false, direction: 'contact_to_matters', fieldsUpdated, mattersAffected: 0 }
  }

  // 4. Upsert into matter_custom_data for each active matter
  const rows = activeMatterIds.map((matterId: string) => ({
    tenant_id: tenantId,
    matter_id: matterId,
    section_key: 'contact_immigration_sync',
    data: syncPayload,
  }))

  await supabase
    .from('matter_custom_data')
    .upsert(rows, { onConflict: 'matter_id,section_key' })

  return {
    synced: true,
    direction: 'contact_to_matters',
    fieldsUpdated,
    mattersAffected: activeMatterIds.length,
  }
}

/**
 * Sync matter custom data → master contact record.
 * Call this after updating matter_custom_data with immigration-related sections.
 */
export async function syncMatterToContact(
  supabase: SupabaseClient,
  matterId: string,
  tenantId: string,
): Promise<SyncResult> {
  const fieldsUpdated: string[] = []

  // 1. Find the primary contact for this matter
  const { data: primaryLink } = await supabase
    .from('matter_contacts')
    .select('contact_id')
    .eq('matter_id', matterId)
    .eq('is_primary', true)
    .single()

  if (!primaryLink?.contact_id) {
    return { synced: false, direction: 'matter_to_contact', fieldsUpdated }
  }

  // 2. Fetch matter custom data (immigration-relevant sections)
  const { data: customData } = await supabase
    .from('matter_custom_data')
    .select('section_key, data')
    .eq('matter_id', matterId)
    .in('section_key', ['immigration', 'personal_info', 'contact_immigration_sync', 'lead_intake_data'])

  if (!customData || customData.length === 0) {
    return { synced: false, direction: 'matter_to_contact', fieldsUpdated }
  }

  // 3. Merge all sections into a single update payload
  const mergedData: Record<string, unknown> = {}
  for (const row of customData) {
    const sectionData = (row.data ?? {}) as Record<string, unknown>
    for (const field of SYNC_FIELDS) {
      if (sectionData[field] !== undefined && sectionData[field] !== null) {
        mergedData[field] = sectionData[field]
        if (!fieldsUpdated.includes(field)) fieldsUpdated.push(field)
      }
    }
  }

  if (fieldsUpdated.length === 0) {
    return { synced: false, direction: 'matter_to_contact', fieldsUpdated }
  }

  // 4. Last-Modified-Wins guard ──────────────────────────────────
  // Fetch the contact's updated_at alongside immigration_data so we
  // can compare timestamps and avoid overwriting newer corrections.
  const { data: existingContact } = await supabase
    .from('contacts')
    .select('immigration_data, updated_at')
    .eq('id', primaryLink.contact_id)
    .single()

  // Determine the most recent matter_custom_data write
  const matterLastModified = customData.reduce((latest, row) => {
    const rowTs = (row as any).updated_at ? new Date((row as any).updated_at).getTime() : 0
    return rowTs > latest ? rowTs : latest
  }, 0)

  const contactLastModified = existingContact?.updated_at
    ? new Date(existingContact.updated_at).getTime()
    : 0

  // If the contact was modified MORE RECENTLY than the matter data,
  // skip the write  -  the contact record is the authoritative source.
  if (contactLastModified > matterLastModified && matterLastModified > 0) {
    return {
      synced: false,
      direction: 'matter_to_contact',
      fieldsUpdated: [],
      skippedReason: 'Contact record is newer than matter data (Last-Modified-Wins)',
    }
  }

  const existingImmData = (existingContact?.immigration_data ?? {}) as Record<string, unknown>
  const updatedImmData = { ...existingImmData, ...mergedData }

  // Update both the JSONB blob and any top-level columns that match
  const contactUpdate: Record<string, unknown> = {
    immigration_data: updatedImmData,
  }

  // Map sync fields to top-level contact columns where they exist
  const topLevelFields = ['nationality', 'immigration_status', 'immigration_status_expiry', 'country_of_birth', 'country_of_residence', 'marital_status', 'currently_in_canada']
  for (const field of topLevelFields) {
    if (mergedData[field] !== undefined) {
      contactUpdate[field] = mergedData[field]
    }
  }

  // Dual-write: encrypt any PII fields (e.g. passport_number) present in
  // the top-level contact update so the *_encrypted columns stay in sync.
  const piiEncrypted = withContactPIIEncrypted(contactUpdate)

  await supabase
    .from('contacts')
    .update({ ...contactUpdate, ...piiEncrypted })
    .eq('id', primaryLink.contact_id)

  return {
    synced: true,
    direction: 'matter_to_contact',
    fieldsUpdated,
  }
}
