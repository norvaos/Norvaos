/**
 * Rollback engine for undoing an import batch.
 *
 * Soft-deletes records where possible (is_active/is_deleted),
 * hard-deletes for tables without soft-delete support.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { log } from '@/lib/utils/logger'
import { IMPORT_REVERTED_STATUS } from '@/lib/utils/matter-status'
import { logAuditServer } from '@/lib/queries/audit-logs'

const SOFT_DELETE_TABLES = new Set(['contacts', 'tasks'])
const HARD_DELETE_TABLES = new Set(['notes', 'leads', 'documents', 'time_entries', 'pipeline_stages'])

/**
 * Roll back all successfully imported records in a batch.
 * Returns the number of records rolled back.
 */
export async function rollbackBatch(
  admin: SupabaseClient<Database>,
  tenantId: string,
  batchId: string,
  userId: string,
): Promise<{ rolledBackCount: number }> {
  // Fetch all succeeded records grouped by entity type
  const { data: records, error } = await admin
    .from('import_records')
    .select('id, target_entity_type, target_entity_id')
    .eq('tenant_id', tenantId)
    .eq('batch_id', batchId)
    .eq('status', 'succeeded')
    .not('target_entity_id', 'is', null)

  if (error || !records || records.length === 0) {
    return { rolledBackCount: 0 }
  }

  // Group records by target table
  const grouped = new Map<string, string[]>()
  for (const record of records) {
    if (!record.target_entity_id) continue
    const existing = grouped.get(record.target_entity_type) ?? []
    existing.push(record.target_entity_id)
    grouped.set(record.target_entity_type, existing)
  }

  let rolledBackCount = 0

  // Process each entity type
  for (const [entityType, entityIds] of grouped) {
    try {
      // Process in batches of 100
      for (let i = 0; i < entityIds.length; i += 100) {
        const batch = entityIds.slice(i, i + 100)

        if (SOFT_DELETE_TABLES.has(entityType)) {
          // Soft delete
          if (entityType === 'tasks') {
            await admin
              .from('tasks')
              .update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: userId })
              .eq('tenant_id', tenantId)
              .in('id', batch)
          } else {
            await admin
              .from(entityType as 'contacts')
              .update({ is_active: false } as never)
              .eq('tenant_id', tenantId)
              .in('id', batch)
          }
        } else if (HARD_DELETE_TABLES.has(entityType)) {
          // Hard delete
          await admin
            .from(entityType as 'notes')
            .delete()
            .eq('tenant_id', tenantId)
            .in('id', batch)
        }

        // Mark rolled-back imported matters with 'import_reverted' so they are
        // distinguishable from legitimately closed matters (closed_won / closed_lost).
        // Only matters imported in this specific batch are affected — matched by id
        // from import_records where target_entity_type = 'matters'.
        if (entityType === 'matters') {
          const revertedAt = new Date().toISOString()

          // Fetch current status of each matter so the audit trail records
          // the exact before-state for every rolled-back record.
          const { data: currentMatters } = await admin
            .from('matters')
            .select('id, status')
            .eq('tenant_id', tenantId)
            .in('id', batch)

          const previousStatusMap: Record<string, string> = {}
          for (const m of currentMatters ?? []) {
            previousStatusMap[m.id] = m.status
          }

          const { error: revertErr } = await admin
            .from('matters')
            .update({
              status: IMPORT_REVERTED_STATUS,
              updated_at: revertedAt,
            } as never)
            .eq('tenant_id', tenantId)
            .in('id', batch)

          if (revertErr) {
            log.error('[import-rollback] Failed to set import_reverted status on matters', {
              error_message: revertErr.message,
              tenant_id: tenantId,
              batch_id: batchId,
            })
            throw new Error(`Failed to revert matter statuses: ${revertErr.message}`)
          }

          // Write one audit record per matter so the full event is traceable.
          for (const matterId of batch) {
            await logAuditServer({
              supabase: admin,
              tenantId,
              userId,
              entityType: 'matter',
              entityId: matterId,
              action: 'import_reverted',
              changes: {
                status: {
                  from: previousStatusMap[matterId] ?? 'unknown',
                  to: IMPORT_REVERTED_STATUS,
                },
              },
              metadata: {
                import_batch_id: batchId,
                reverted_by: userId,
                reverted_at: revertedAt,
              },
            })
          }
        }

        rolledBackCount += batch.length
      }
    } catch (err) {
      log.error(`[import-rollback] Failed to rollback ${entityType}`, {
        error_message: err instanceof Error ? err.message : 'Unknown',
        tenant_id: tenantId,
        batch_id: batchId,
      })
    }
  }

  // Clean up import_id_map entries for this batch
  await admin
    .from('import_id_map')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('batch_id', batchId)

  // Update batch status
  await admin
    .from('import_batches')
    .update({
      status: 'rolled_back',
      rolled_back_at: new Date().toISOString(),
      rolled_back_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', batchId)
    .eq('tenant_id', tenantId)

  return { rolledBackCount }
}
