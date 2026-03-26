/**
 * API import engine  -  fetches data from connected platform APIs and
 * converges with the existing import pipeline (validate → deduplicate → insert).
 *
 * Unlike the CSV engine, rows come pre-structured from platform fetchers.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/types/database'
import type {
  SourcePlatform,
  ImportEntityType,
  DuplicateStrategy,
  ImportError,
  EntityAdapter,
} from './types'
import { validateRows } from './validation-engine'
import { detectDuplicates } from './duplicate-detector'
import { resolveSourceIds, recordIdMapping } from './relationship-resolver'
import { getAdapter } from './adapters'
import { log } from '@/lib/utils/logger'

// ─── Fetcher Registry ──────────────────────────────────────────────────────

import { fetchGhlContacts } from '../ghl/fetchers/contacts'
import { fetchGhlOpportunities } from '../ghl/fetchers/opportunities'
import { fetchGhlConversations } from '../ghl/fetchers/conversations'
import { fetchGhlCalendarEvents } from '../ghl/fetchers/calendar'
import { fetchGhlTags } from '../ghl/fetchers/tags'
import { fetchGhlCustomFields } from '../ghl/fetchers/custom-fields'
import { fetchGhlInvoices } from '../ghl/fetchers/invoices'
import { fetchGhlCompanies } from '../ghl/fetchers/companies'
import { fetchGhlDocuments } from '../ghl/fetchers/documents'
import { fetchGhlForms } from '../ghl/fetchers/forms'
import { fetchGhlUsers } from '../ghl/fetchers/users'
import { fetchGhlPayments } from '../ghl/fetchers/payments'
import { fetchGhlSurveys } from '../ghl/fetchers/surveys'
import { fetchGhlPipelines } from '../ghl/fetchers/pipelines'
import { fetchGhlTasks } from '../ghl/fetchers/tasks'
import { fetchGhlNotes } from '../ghl/fetchers/notes'

import { fetchClioContacts } from '../clio/fetchers/contacts'
import { fetchClioMatters } from '../clio/fetchers/matters'
import { fetchClioTasks } from '../clio/fetchers/tasks'
import { fetchClioNotes } from '../clio/fetchers/notes'
import { fetchClioTimeEntries } from '../clio/fetchers/time-entries'
import { fetchClioDocuments } from '../clio/fetchers/documents'
import { fetchClioCalendar } from '../clio/fetchers/calendar'
import { fetchClioCommunications } from '../clio/fetchers/communications'
import { fetchClioBills } from '../clio/fetchers/bills'
import { fetchClioCustomFields } from '../clio/fetchers/custom-fields'
import { fetchClioPracticeAreas } from '../clio/fetchers/practice-areas'
import { fetchClioRelationships } from '../clio/fetchers/relationships'

type FetcherFn = (
  connectionId: string,
  admin: SupabaseClient<Database>,
  locationIdOrUnused: string,
  onProgress?: (fetched: number) => Promise<void>,
) => Promise<{ rows: Record<string, string>[]; totalRows: number }>

const GHL_FETCHERS: Partial<Record<ImportEntityType, FetcherFn>> = {
  contacts: fetchGhlContacts,
  leads: fetchGhlOpportunities,
  conversations: fetchGhlConversations,
  calendar_events: fetchGhlCalendarEvents,
  tags: fetchGhlTags,
  custom_fields: fetchGhlCustomFields,
  invoices: fetchGhlInvoices,
  companies: fetchGhlCompanies,
  documents: fetchGhlDocuments,
  forms: fetchGhlForms,
  users: fetchGhlUsers,
  payments: fetchGhlPayments,
  surveys: fetchGhlSurveys,
  pipeline_stages: fetchGhlPipelines,
  tasks: fetchGhlTasks,
  notes: fetchGhlNotes,
}

const CLIO_FETCHERS: Partial<Record<ImportEntityType, FetcherFn>> = {
  contacts: fetchClioContacts,
  matters: fetchClioMatters,
  tasks: fetchClioTasks,
  notes: fetchClioNotes,
  time_entries: fetchClioTimeEntries,
  documents: fetchClioDocuments,
  calendar_events: fetchClioCalendar,
  conversations: fetchClioCommunications,
  invoices: fetchClioBills,
  custom_fields: fetchClioCustomFields,
  tags: fetchClioPracticeAreas,
  companies: fetchClioRelationships,
}

function getFetcher(platform: SourcePlatform, entityType: ImportEntityType): FetcherFn | undefined {
  if (platform === 'ghl') return GHL_FETCHERS[entityType]
  if (platform === 'clio') return CLIO_FETCHERS[entityType]
  return undefined
}

/**
 * List entity types available for API import from a connected platform.
 */
export function getApiEntities(platform: SourcePlatform): ImportEntityType[] {
  const fetchers = platform === 'ghl' ? GHL_FETCHERS : platform === 'clio' ? CLIO_FETCHERS : {}
  return Object.keys(fetchers) as ImportEntityType[]
}

// ─── Fetch Data from API ────────────────────────────────────────────────────

interface ApiFetchParams {
  admin: SupabaseClient<Database>
  tenantId: string
  userId: string
  platform: 'ghl' | 'clio'
  entityType: ImportEntityType
  onProgress?: (fetched: number) => Promise<void>
}

/**
 * Fetch data from a connected platform API.
 * Returns rows + creates a batch record for the import wizard to continue from.
 */
export async function apiFetchData(params: ApiFetchParams): Promise<{
  batchId: string
  totalRows: number
  previewRows: Record<string, string>[]
  suggestedMapping: Record<string, string>
  detectedHeaders: string[]
}> {
  const { admin, tenantId, userId, platform, entityType, onProgress } = params

  // Get connection
  const { data: connection } = await admin
    .from('platform_connections')
    .select('id, location_id')
    .eq('tenant_id', tenantId)
    .eq('platform', platform)
    .eq('is_active', true)
    .single()

  if (!connection) {
    throw new Error(`No active ${platform.toUpperCase()} connection found. Please connect first.`)
  }

  // Get fetcher
  const fetcher = getFetcher(platform, entityType)
  if (!fetcher) {
    throw new Error(`Entity type "${entityType}" is not available for API import from ${platform.toUpperCase()}.`)
  }

  // Fetch data from API
  const { rows, totalRows } = await fetcher(connection.id, admin, connection.location_id ?? '', onProgress)

  if (rows.length === 0) {
    throw new Error(`No ${entityType} data found in your ${platform.toUpperCase()} account.`)
  }

  // Auto-map columns
  const platformAdapter = getAdapter(platform)
  const entityAdapter = platformAdapter.getEntityAdapter(entityType)
  if (!entityAdapter) {
    throw new Error(`No adapter for ${entityType}`)
  }

  const headers = rows.length > 0 ? Object.keys(rows[0]) : []
  const mapped: Record<string, string> = {}
  const unmapped: string[] = []

  for (const header of headers) {
    if (header.startsWith('__')) continue // Internal fields auto-resolved
    const fieldMapping = entityAdapter.fieldMappings.find(
      (fm) => fm.sourceColumn === header || fm.aliases?.some((a) => a.toLowerCase() === header.toLowerCase()),
    )
    if (fieldMapping) {
      mapped[header] = fieldMapping.targetColumn
    } else {
      unmapped.push(header)
    }
  }

  // Create batch record
  const { data: batch, error: batchError } = await admin
    .from('import_batches')
    .insert({
      tenant_id: tenantId,
      source_platform: platform,
      entity_type: entityType,
      file_name: `api-${platform}-${entityType}`,
      file_size_bytes: 0,
      storage_path: null,
      total_rows: totalRows,
      column_mapping: mapped as unknown as Json,
      import_mode: 'api',
      connection_id: connection.id,
      created_by: userId,
    })
    .select('id')
    .single()

  if (batchError || !batch) {
    throw new Error('Failed to create import batch.')
  }

  // Store rows as JSON in a storage file for later execution
  const storagePath = `imports/${tenantId}/${batch.id}.json`
  await admin.storage
    .from('import-files')
    .upload(storagePath, JSON.stringify(rows), {
      contentType: 'application/json',
      upsert: false,
    })

  await admin
    .from('import_batches')
    .update({ storage_path: storagePath, updated_at: new Date().toISOString() })
    .eq('id', batch.id)

  return {
    batchId: batch.id,
    totalRows,
    previewRows: rows.slice(0, 5),
    suggestedMapping: mapped,
    detectedHeaders: headers,
  }
}

// ─── Execute API Import ─────────────────────────────────────────────────────

const BATCH_SIZE = 50

interface ExecuteApiImportParams {
  admin: SupabaseClient<Database>
  tenantId: string
  userId: string
  batchId: string
  platform: SourcePlatform
  entityType: ImportEntityType
  columnMapping: Record<string, string>
  duplicateStrategy: DuplicateStrategy
}

/**
 * Execute the API import pipeline for a batch.
 * Loads pre-fetched rows from storage, then validates → deduplicates → inserts.
 */
export async function executeApiImport(params: ExecuteApiImportParams): Promise<void> {
  const { admin, tenantId, userId, batchId, platform, entityType, columnMapping, duplicateStrategy } = params

  const platformAdapter = getAdapter(platform)
  const entityAdapter = platformAdapter.getEntityAdapter(entityType)
  if (!entityAdapter) {
    await updateBatchStatus(admin, batchId, tenantId, 'failed', { message: `No adapter for ${entityType}` })
    return
  }

  await admin
    .from('import_batches')
    .update({ status: 'importing', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', batchId)

  try {
    // Load rows from storage
    const { data: batch } = await admin
      .from('import_batches')
      .select('storage_path')
      .eq('id', batchId)
      .single()

    if (!batch?.storage_path) {
      await updateBatchStatus(admin, batchId, tenantId, 'failed', { message: 'No data found in storage.' })
      return
    }

    const { data: fileData } = await admin.storage
      .from('import-files')
      .download(batch.storage_path)

    if (!fileData) {
      await updateBatchStatus(admin, batchId, tenantId, 'failed', { message: 'Failed to download data from storage.' })
      return
    }

    const apiRows: Record<string, string>[] = JSON.parse(await fileData.text())
    if (apiRows.length === 0) {
      await updateBatchStatus(admin, batchId, tenantId, 'completed', undefined)
      return
    }

    // Update total count
    await admin
      .from('import_batches')
      .update({ total_rows: apiRows.length, updated_at: new Date().toISOString() })
      .eq('id', batchId)

    // Validate
    const { validRows, invalidRows, allErrors } = validateRows(apiRows, columnMapping, entityAdapter)

    // Detect duplicates
    const duplicates = await detectDuplicates(
      admin,
      tenantId,
      entityType,
      validRows.map((r) => ({ rowNumber: r.rowNumber, data: r.data })),
    )
    const duplicateRowNumbers = new Set(duplicates.map((d) => d.rowNumber))

    // On resume: load already-processed row numbers from import_records so we skip them
    const { data: existingRecords } = await admin
      .from('import_records')
      .select('row_number')
      .eq('batch_id', batchId)
    const alreadyProcessed = new Set((existingRecords ?? []).map((r) => r.row_number))
    const isResume = alreadyProcessed.size > 0

    // Seed counters from existing DB state when resuming
    const { data: batchCounters } = await admin
      .from('import_batches')
      .select('processed_rows, succeeded_rows, failed_rows, skipped_rows')
      .eq('id', batchId)
      .single()

    let processedRows = isResume ? (batchCounters?.processed_rows ?? 0) : 0
    let succeededRows = isResume ? (batchCounters?.succeeded_rows ?? 0) : 0
    let failedRows = isResume ? (batchCounters?.failed_rows ?? 0) : invalidRows.length
    let skippedRows = isResume ? (batchCounters?.skipped_rows ?? 0) : 0
    const importErrors: ImportError[] = [...allErrors]

    // Record invalid rows (skip if already recorded on a previous run)
    if (!isResume) {
      for (const invalid of invalidRows) {
        await recordImportRow(admin, tenantId, batchId, entityType, invalid.rowNumber, invalid.data, null, 'failed', invalid.errors[0]?.message ?? 'Validation failed')
      }
    }

    // Process valid rows in batches
    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batchSlice = validRows.slice(i, i + BATCH_SIZE)

      for (const row of batchSlice) {
        // Skip rows already handled in a previous run
        if (alreadyProcessed.has(row.rowNumber)) continue

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
              await updateExistingRecord(admin, tenantId, entityAdapter, duplicateMatch.matchedEntityId, row.data)
              succeededRows++
              await recordImportRow(admin, tenantId, batchId, entityType, row.rowNumber, row.data, duplicateMatch.matchedEntityId, 'succeeded', null)

              if (row.sourceId) {
                await recordIdMapping(admin, tenantId, batchId, platform, entityType, row.sourceId, entityType, duplicateMatch.matchedEntityId)
              }
              processedRows++
              continue
            }
          }

          // Resolve relationships
          const resolvedData = await resolveRelationships(admin, tenantId, platform, entityType, row.data, entityAdapter)

          // Insert
          const omit = new Set(entityAdapter.omitEngineFields ?? [])
          const insertData: Record<string, unknown> = { tenant_id: tenantId }
          if (!omit.has('created_by')) insertData.created_by = userId
          for (const [key, value] of Object.entries(resolvedData)) {
            if (!key.startsWith('__')) {
              insertData[key] = value
            }
          }

          const { data: inserted, error: insertError } = await admin
            .from(entityAdapter.targetTable as 'contacts')
            .insert(insertData as never)
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

      // Update progress after each batch of 50
      await admin
        .from('import_batches')
        .update({
          processed_rows: processedRows,
          succeeded_rows: succeededRows,
          failed_rows: failedRows,
          skipped_rows: skippedRows,
          updated_at: new Date().toISOString(),
        })
        .eq('id', batchId)

      // Check pause flag  -  stop cleanly between batches
      const { data: pauseCheck } = await admin
        .from('import_batches')
        .select('pause_requested')
        .eq('id', batchId)
        .single()

      if (pauseCheck?.pause_requested) {
        await admin
          .from('import_batches')
          .update({ status: 'paused', pause_requested: false, updated_at: new Date().toISOString() })
          .eq('id', batchId)
        log.info('[api-import-engine] Import paused', { tenant_id: tenantId, batch_id: batchId, processed_rows: processedRows })
        return
      }
    }

    // Finalise
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

    log.info('[api-import-engine] Import completed', { tenant_id: tenantId, batch_id: batchId, status: finalStatus })
  } catch (err) {
    log.error('[api-import-engine] Import failed', {
      tenant_id: tenantId,
      batch_id: batchId,
      error_message: err instanceof Error ? err.message : 'Unknown',
    })
    await updateBatchStatus(admin, batchId, tenantId, 'failed', {
      message: err instanceof Error ? err.message : 'Unexpected error during import',
    })
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

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

async function resolveRelationships(
  admin: SupabaseClient<Database>,
  tenantId: string,
  platform: SourcePlatform,
  entityType: ImportEntityType,
  data: Record<string, unknown>,
  _adapter: EntityAdapter, // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<Record<string, unknown>> {
  const resolved = { ...data }

  const contactSourceId = data.__contact_source_id as string | undefined
  if (contactSourceId) {
    const idMap = await resolveSourceIds(admin, tenantId, platform, 'contacts', [contactSourceId])
    const contactId = idMap.get(contactSourceId)
    if (contactId) {
      resolved.contact_id = contactId
    }
  }

  const matterSourceId = data.__matter_source_id as string | undefined
  if (matterSourceId) {
    const idMap = await resolveSourceIds(admin, tenantId, platform, 'matters', [matterSourceId])
    const matterId = idMap.get(matterSourceId)
    if (matterId) {
      resolved.matter_id = matterId
    }
  }

  // Resolve practice area by name  -  auto-create if not found (for matters import)
  const practiceAreaName = data.__practice_area_name as string | undefined
  if (practiceAreaName?.trim()) {
    const name = practiceAreaName.trim()
    const { data: existing } = await admin
      .from('practice_areas')
      .select('id')
      .eq('tenant_id', tenantId)
      .ilike('name', name)
      .maybeSingle()
    if (existing) {
      resolved.practice_area_id = existing.id
    } else {
      const { data: created } = await admin
        .from('practice_areas')
        .insert({ tenant_id: tenantId, name, is_active: true, is_enabled: true })
        .select('id')
        .single()
      if (created) resolved.practice_area_id = created.id
    }
  }

  // Resolve responsible lawyer by name (for matters import)
  const lawyerName = data.__responsible_lawyer_name as string | undefined
  if (lawyerName) {
    const nameParts = lawyerName.trim().split(/\s+/)
    const firstName = nameParts[0] ?? ''
    const lastName = nameParts.slice(1).join(' ')
    const { data: lawyer } = await admin
      .from('users')
      .select('id')
      .eq('tenant_id', tenantId)
      .ilike('first_name', firstName)
      .ilike('last_name', lastName || '%')
      .maybeSingle()
    if (lawyer) {
      resolved.assigned_to = lawyer.id
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
