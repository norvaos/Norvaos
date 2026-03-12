/**
 * Duplicate detection for imported rows.
 *
 * Checks against existing records in the target table to identify
 * potential duplicates before inserting.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { DuplicateResult, ImportEntityType } from './types'

/**
 * Detect duplicate contacts by email or phone + last name.
 */
export async function detectContactDuplicates(
  admin: SupabaseClient<Database>,
  tenantId: string,
  rows: { rowNumber: number; data: Record<string, unknown> }[],
): Promise<DuplicateResult[]> {
  const results: DuplicateResult[] = []

  // Collect emails and phones for batch lookup
  const emails = rows
    .map((r) => r.data.email_primary as string | null)
    .filter((e): e is string => !!e && e.length > 0)
  const phones = rows
    .map((r) => r.data.phone_primary as string | null)
    .filter((p): p is string => !!p && p.length > 0)

  if (emails.length === 0 && phones.length === 0) return results

  // Build query for email matches
  let existingContacts: { id: string; email_primary: string | null; phone_primary: string | null; last_name: string | null }[] = []

  if (emails.length > 0) {
    const { data } = await admin
      .from('contacts')
      .select('id, email_primary, phone_primary, last_name')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .in('email_primary', emails)
    if (data) existingContacts.push(...data)
  }

  if (phones.length > 0) {
    const { data } = await admin
      .from('contacts')
      .select('id, email_primary, phone_primary, last_name')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .in('phone_primary', phones)
    if (data) existingContacts.push(...data)
  }

  // Deduplicate existing contacts by ID
  const seen = new Set<string>()
  existingContacts = existingContacts.filter((c) => {
    if (seen.has(c.id)) return false
    seen.add(c.id)
    return true
  })

  // Match each row against existing contacts
  for (const row of rows) {
    const email = (row.data.email_primary as string | null)?.toLowerCase()
    const phone = row.data.phone_primary as string | null
    const lastName = (row.data.last_name as string | null)?.toLowerCase()

    for (const existing of existingContacts) {
      // Exact email match
      if (email && existing.email_primary?.toLowerCase() === email) {
        results.push({
          rowNumber: row.rowNumber,
          matchedEntityId: existing.id,
          matchedOn: 'email_primary',
          confidence: 'exact',
        })
        break
      }

      // Phone + last name match
      if (
        phone &&
        lastName &&
        existing.phone_primary === phone &&
        existing.last_name?.toLowerCase() === lastName
      ) {
        results.push({
          rowNumber: row.rowNumber,
          matchedEntityId: existing.id,
          matchedOn: 'phone_primary + last_name',
          confidence: 'likely',
        })
        break
      }
    }
  }

  return results
}

/**
 * Detect duplicate matters by title within the same tenant.
 */
export async function detectMatterDuplicates(
  admin: SupabaseClient<Database>,
  tenantId: string,
  rows: { rowNumber: number; data: Record<string, unknown> }[],
): Promise<DuplicateResult[]> {
  const results: DuplicateResult[] = []

  const titles = rows
    .map((r) => r.data.title as string | null)
    .filter((t): t is string => !!t && t.length > 0)

  if (titles.length === 0) return results

  const { data: existing } = await admin
    .from('matters')
    .select('id, title')
    .eq('tenant_id', tenantId)
    .in('title', titles)

  if (!existing || existing.length === 0) return results

  const titleMap = new Map(existing.map((m) => [m.title.toLowerCase(), m.id]))

  for (const row of rows) {
    const title = (row.data.title as string | null)?.toLowerCase()
    if (title && titleMap.has(title)) {
      results.push({
        rowNumber: row.rowNumber,
        matchedEntityId: titleMap.get(title)!,
        matchedOn: 'title',
        confidence: 'exact',
      })
    }
  }

  return results
}

/**
 * Entry point: detect duplicates for any entity type.
 */
export async function detectDuplicates(
  admin: SupabaseClient<Database>,
  tenantId: string,
  entityType: ImportEntityType,
  rows: { rowNumber: number; data: Record<string, unknown> }[],
): Promise<DuplicateResult[]> {
  switch (entityType) {
    case 'contacts':
      return detectContactDuplicates(admin, tenantId, rows)
    case 'matters':
      return detectMatterDuplicates(admin, tenantId, rows)
    default:
      // No duplicate detection for other entity types
      return []
  }
}
