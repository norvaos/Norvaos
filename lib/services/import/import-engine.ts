/**
 * Import engine — orchestrates the full CSV → DB pipeline.
 *
 * Phases: parse CSV → map columns → validate → batch insert → track progress
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/types/database'
import type {
  SourcePlatform,
  ImportEntityType,
  ColumnMapping,
  DuplicateStrategy,
  ImportError,
  EntityAdapter,
} from './types'
import { parseCSV } from './csv-parser'
import { validateRows } from './validation-engine'
import { detectDuplicates } from './duplicate-detector'
import { resolveSourceIds, recordIdMapping } from './relationship-resolver'
import { getAdapter } from './adapters'
import { log } from '@/lib/utils/logger'

const BATCH_SIZE = 50

interface ExecuteImportParams {
  admin: SupabaseClient<Database>
  tenantId: string
  userId: string
  batchId: string
  csvContent: string
  platform: SourcePlatform
  entityType: ImportEntityType
  columnMapping: ColumnMapping
  duplicateStrategy: DuplicateStrategy
}

/**
 * Execute the full import pipeline for a batch.
 */
export async function executeImport(params: ExecuteImportParams): Promise<void> {
  const { admin, tenantId, userId, batchId, csvContent, platform, entityType, columnMapping, duplicateStrategy } = params

  const platformAdapter = getAdapter(platform)
  const entityAdapter = platformAdapter.getEntityAdapter(entityType)
  if (!entityAdapter) {
    await updateBatchStatus(admin, batchId, tenantId, 'failed', { message: `No adapter for ${entityType}` })
    return
  }

  // Update batch to importing
  await admin
    .from('import_batches')
    .update({ status: 'importing', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', batchId)

  try {
    // 1. Parse CSV
    const parsed = parseCSV(csvContent)
    if (parsed.rows.length === 0) {
      await updateBatchStatus(admin, batchId, tenantId, 'failed', { message: 'CSV file contains no data rows.' })
      return
    }

    // 2. Validate rows
    const { validRows, invalidRows, allErrors } = validateRows(parsed.rows, columnMapping, entityAdapter)

    // Update total count
    await admin
      .from('import_batches')
      .update({ total_rows: parsed.rows.length, updated_at: new Date().toISOString() })
      .eq('id', batchId)

    // 3. Detect duplicates for valid rows
    const duplicates = await detectDuplicates(
      admin,
      tenantId,
      entityType,
      validRows.map((r) => ({ rowNumber: r.rowNumber, data: r.data })),
    )
    const duplicateRowNumbers = new Set(duplicates.map((d) => d.rowNumber))

    // 4. Insert rows in batches
    let processedRows = 0
    let succeededRows = 0
    let failedRows = invalidRows.length
    let skippedRows = 0
    const importErrors: ImportError[] = [...allErrors]

    // Record invalid rows
    for (const invalid of invalidRows) {
      await recordImportRow(admin, tenantId, batchId, entityType, invalid.rowNumber, invalid.data, null, 'failed', invalid.errors[0]?.message ?? 'Validation failed')
    }

    // Process valid rows in batches
    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE)

      for (const row of batch) {
        try {
          const isDuplicate = duplicateRowNumbers.has(row.rowNumber)
          const duplicateMatch = duplicates.find((d) => d.rowNumber === row.rowNumber)

          if (isDuplicate) {
            if (duplicateStrategy === 'skip') {
              skippedRows++
              await recordImportRow(admin, tenantId, batchId, entityType, row.rowNumber, row.data, null, 'skipped', `Duplicate: matched on ${duplicateMatch?.matchedOn}`)
              processedRows++
              continue
            }
            if (duplicateStrategy === 'update' && duplicateMatch) {
              // Update existing record
              await updateExistingRecord(admin, tenantId, entityAdapter, duplicateMatch.matchedEntityId, row.data)
              succeededRows++
              await recordImportRow(admin, tenantId, batchId, entityType, row.rowNumber, row.data, duplicateMatch.matchedEntityId, 'succeeded', null)

              if (row.sourceId) {
                await recordIdMapping(admin, tenantId, batchId, platform, entityType, row.sourceId, entityType, duplicateMatch.matchedEntityId)
              }
              processedRows++
              continue
            }
            // create_new: fall through to insert
          }

          // Resolve relationship fields
          const resolvedData = await resolveRelationships(admin, tenantId, platform, entityType, row.data, entityAdapter)

          // Insert new record
          const insertData = {
            tenant_id: tenantId,
            created_by: userId,
            ...resolvedData,
          }

          // Remove internal fields (prefixed with __)
          const cleanData: Record<string, unknown> = {}
          for (const [key, value] of Object.entries(insertData)) {
            if (!key.startsWith('__')) {
              cleanData[key] = value
            }
          }

          const { data: inserted, error: insertError } = await admin
            .from(entityAdapter.targetTable as 'contacts')
            .insert(cleanData as never)
            .select('id')
            .single()

          if (insertError || !inserted) {
            failedRows++
            const errMsg = insertError?.message ?? 'Failed to insert record'
            importErrors.push({ rowNumber: row.rowNumber, message: errMsg, severity: 'error' })
            await recordImportRow(admin, tenantId, batchId, entityType, row.rowNumber, row.data, null, 'failed', errMsg)
          } else {
            succeededRows++
            await recordImportRow(admin, tenantId, batchId, entityType, row.rowNumber, row.data, inserted.id, 'succeeded', null)

            // Record ID mapping for cross-entity resolution
            if (row.sourceId) {
              await recordIdMapping(admin, tenantId, batchId, platform, entityType, row.sourceId, entityType, inserted.id)
            }
          }
        } catch (err) {
          failedRows++
          const errMsg = err instanceof Error ? err.message : 'Unexpected error'
          importErrors.push({ rowNumber: row.rowNumber, message: errMsg, severity: 'error' })
          await recordImportRow(admin, tenantId, batchId, entityType, row.rowNumber, row.data, null, 'failed', errMsg)
        }

        processedRows++
      }

      // Update progress after each batch
      await admin
        .from('import_batches')
        .update({
          processed_rows: processedRows + invalidRows.length,
          succeeded_rows: succeededRows,
          failed_rows: failedRows,
          skipped_rows: skippedRows,
          updated_at: new Date().toISOString(),
        })
        .eq('id', batchId)
    }

    // 5. Finalise batch
    const finalStatus = failedRows > 0 ? 'completed_with_errors' : 'completed'
    await admin
      .from('import_batches')
      .update({
        status: finalStatus,
        processed_rows: processedRows + invalidRows.length,
        succeeded_rows: succeededRows,
        failed_rows: failedRows,
        skipped_rows: skippedRows,
        import_errors: importErrors.slice(0, 200) as unknown as Json,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', batchId)

    log.info('[import-engine] Import completed', {
      tenant_id: tenantId,
      batch_id: batchId,
      status: finalStatus,
    })
  } catch (err) {
    log.error('[import-engine] Import failed', {
      tenant_id: tenantId,
      batch_id: batchId,
      error_message: err instanceof Error ? err.message : 'Unknown',
    })
    await updateBatchStatus(admin, batchId, tenantId, 'failed', {
      message: err instanceof Error ? err.message : 'Unexpected error during import',
    })
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function updateBatchStatus(
  admin: SupabaseClient<Database>,
  batchId: string,
  tenantId: string,
  status: string,
  error?: { message: string },
) {
  await admin
    .from('import_batches')
    .update({
      status,
      import_errors: error ? ([error] as unknown as Json) : ([] as unknown as Json),
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', batchId)
    .eq('tenant_id', tenantId)
}

async function recordImportRow(
  admin: SupabaseClient<Database>,
  tenantId: string,
  batchId: string,
  entityType: string,
  rowNumber: number,
  sourceData: Record<string, unknown>,
  targetEntityId: string | null,
  status: string,
  errorMessage: string | null,
) {
  await admin.from('import_records').insert({
    tenant_id: tenantId,
    batch_id: batchId,
    row_number: rowNumber,
    source_data: sourceData as unknown as Json,
    target_entity_type: entityType,
    target_entity_id: targetEntityId,
    status,
    error_message: errorMessage,
  })
}

/**
 * Resolve internal relationship fields (e.g., __contact_source_id → contact_id)
 */
async function resolveRelationships(
  admin: SupabaseClient<Database>,
  tenantId: string,
  platform: SourcePlatform,
  entityType: ImportEntityType,
  data: Record<string, unknown>,
  adapter: EntityAdapter,
): Promise<Record<string, unknown>> {
  const resolved = { ...data }

  // Resolve contact references
  const contactSourceId = data.__contact_source_id as string | undefined
  if (contactSourceId) {
    const idMap = await resolveSourceIds(admin, tenantId, platform, 'contacts', [contactSourceId])
    const contactId = idMap.get(contactSourceId)
    if (contactId) {
      if (entityType === 'leads') {
        resolved.contact_id = contactId
      } else if (entityType === 'tasks' || entityType === 'notes') {
        resolved.contact_id = contactId
      }
    }
  }

  // Resolve matter references
  const matterSourceId = data.__matter_source_id as string | undefined
  if (matterSourceId) {
    const idMap = await resolveSourceIds(admin, tenantId, platform, 'matters', [matterSourceId])
    const matterId = idMap.get(matterSourceId)
    if (matterId) {
      resolved.matter_id = matterId
    }
  }

  return resolved
}

async function updateExistingRecord(
  admin: SupabaseClient<Database>,
  tenantId: string,
  adapter: EntityAdapter,
  entityId: string,
  data: Record<string, unknown>,
) {
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith('__')) continue
    if (value !== null && value !== undefined && value !== '') {
      updateData[key] = value
    }
  }

  await admin
    .from(adapter.targetTable as 'contacts')
    .update(updateData as never)
    .eq('id', entityId)
    .eq('tenant_id', tenantId)
}
