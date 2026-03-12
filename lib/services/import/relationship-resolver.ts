/**
 * Resolves source platform IDs to NorvaOS entity IDs.
 *
 * Uses the import_id_map table to look up previously imported entities,
 * enabling cross-entity relationships (e.g., linking a task to its contact).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { SourcePlatform } from './types'

/**
 * Resolve a single source ID to its NorvaOS target ID.
 */
export async function resolveSourceId(
  admin: SupabaseClient<Database>,
  tenantId: string,
  sourcePlatform: SourcePlatform,
  sourceEntityType: string,
  sourceId: string,
): Promise<string | null> {
  const { data } = await admin
    .from('import_id_map')
    .select('target_id')
    .eq('tenant_id', tenantId)
    .eq('source_platform', sourcePlatform)
    .eq('source_entity_type', sourceEntityType)
    .eq('source_id', sourceId)
    .single()

  return data?.target_id ?? null
}

/**
 * Batch-resolve multiple source IDs at once for efficiency.
 * Returns a map of sourceId → targetId.
 */
export async function resolveSourceIds(
  admin: SupabaseClient<Database>,
  tenantId: string,
  sourcePlatform: SourcePlatform,
  sourceEntityType: string,
  sourceIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (sourceIds.length === 0) return result

  // Deduplicate
  const uniqueIds = [...new Set(sourceIds)]

  // Query in batches of 100 to avoid URI length limits
  const BATCH_SIZE = 100
  for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
    const batch = uniqueIds.slice(i, i + BATCH_SIZE)
    const { data } = await admin
      .from('import_id_map')
      .select('source_id, target_id')
      .eq('tenant_id', tenantId)
      .eq('source_platform', sourcePlatform)
      .eq('source_entity_type', sourceEntityType)
      .in('source_id', batch)

    if (data) {
      for (const row of data) {
        result.set(row.source_id, row.target_id)
      }
    }
  }

  return result
}

/**
 * Record a new source → target ID mapping.
 */
export async function recordIdMapping(
  admin: SupabaseClient<Database>,
  tenantId: string,
  batchId: string,
  sourcePlatform: SourcePlatform,
  sourceEntityType: string,
  sourceId: string,
  targetEntityType: string,
  targetId: string,
): Promise<void> {
  await admin.from('import_id_map').upsert(
    {
      tenant_id: tenantId,
      batch_id: batchId,
      source_platform: sourcePlatform,
      source_entity_type: sourceEntityType,
      source_id: sourceId,
      target_entity_type: targetEntityType,
      target_id: targetId,
    },
    { onConflict: 'tenant_id,source_platform,source_entity_type,source_id' },
  )
}
