/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Bulk Lead Import  -  Staging Engine (The Sandbox Builder)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Writes parsed rows to lead_import_staging, then runs the Intelligent
 * Gatekeeper (conflict check + jurisdiction matching) in 25-row chunks.
 *
 * Processing is async with progress tracked in import_batches.gatekeeper_summary.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { ParsedLeadRow } from './types'

const CHUNK_SIZE = 25

interface StagingEngineParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  batchId: string
  rows: ParsedLeadRow[]
  sourceTag?: string
  campaignTag?: string
}

// ─── Phase 1: Write to Staging ──────────────────────────────────────────────

/**
 * Write all parsed rows to lead_import_staging with validation_status = 'pending'.
 * Fast operation  -  no gatekeeper calls yet.
 */
export async function writeToStaging(params: StagingEngineParams): Promise<void> {
  const { supabase, tenantId, batchId, rows, sourceTag, campaignTag } = params

  // Insert in chunks to avoid payload limits
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE)
    const insertRows = chunk.map((row) => ({
      tenant_id: tenantId,
      batch_id: batchId,
      row_number: row.rowNumber,
      first_name: row.first_name ?? null,
      last_name: row.last_name ?? null,
      email: row.email ?? null,
      phone: row.phone ?? null,
      date_of_birth: row.date_of_birth ?? null,
      nationality: row.nationality ?? null,
      country_of_birth: row.country_of_birth ?? null,
      passport_number: row.passport_number ?? null,
      raw_jurisdiction: row.raw_jurisdiction ?? null,
      matter_type_name: row.matter_type_name ?? null,
      temperature: row.temperature ?? null,
      estimated_value: row.estimated_value ?? null,
      notes: row.notes ?? null,
      source_tag: row.source_tag ?? sourceTag ?? null,
      campaign_tag: row.campaign_tag ?? campaignTag ?? null,
      utm_source: row.utm_source ?? null,
      utm_medium: row.utm_medium ?? null,
      utm_campaign: row.utm_campaign ?? null,
      source_data: row.source_data,
      validation_status: 'pending',
      conflict_status: 'pending',
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('lead_import_staging')
      .insert(insertRows)

    if (error) throw new Error(`Staging insert failed at row ${i}: ${error.message}`)
  }

  // Update batch summary
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('import_batches')
    .update({
      gatekeeper_summary: { total: rows.length, processed: 0, clear: 0, conflicts: 0, needs_review: 0, invalid: 0, phase: 'validating' },
      status: 'validating',
    })
    .eq('id', batchId)
}

// ─── Phase 2: Run Gatekeeper (Async) ────────────────────────────────────────

/**
 * Run the full gatekeeper pipeline on all pending staging rows.
 * Call this in a fire-and-forget pattern from the API route.
 */
export async function runGatekeeperOnStaging(params: {
  supabase: SupabaseClient<Database>
  tenantId: string
  batchId: string
}): Promise<void> {
  const { supabase, tenantId, batchId } = params

  // 1. Fetch all staging rows for this batch (lean columns)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: stagingRows, error: fetchErr } = await (supabase as any)
    .from('lead_import_staging')
    .select('id, row_number, email, passport_number, raw_jurisdiction')
    .eq('batch_id', batchId)
    .order('row_number', { ascending: true })

  if (fetchErr || !stagingRows) {
    await updateBatchPhase(supabase, batchId, 'ready')
    return
  }

  const total = stagingRows.length

  // 2. Intra-file duplicate detection (O(n) in-memory)
  const emailIndex = new Map<string, string[]>() // lowercase email → staging row IDs
  for (const row of stagingRows) {
    if (row.email) {
      const key = row.email.toLowerCase()
      const existing = emailIndex.get(key) ?? []
      existing.push(row.id)
      emailIndex.set(key, existing)
    }
  }
  const intraFileDuplicateIds = new Set<string>()
  for (const ids of emailIndex.values()) {
    if (ids.length > 1) {
      // Flag all occurrences after the first
      for (let i = 1; i < ids.length; i++) {
        intraFileDuplicateIds.add(ids[i])
      }
    }
  }

  // Mark intra-file conflicts
  if (intraFileDuplicateIds.size > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('lead_import_staging')
      .update({
        conflict_status: 'intra_file_conflict',
        conflict_details: [{ match_field: 'email', match_value: 'Duplicate within import file' }],
      })
      .in('id', Array.from(intraFileDuplicateIds))
  }

  // 3. Cross-DB conflict check (batch RPC, single round trip)
  const emails = stagingRows
    .filter((r: { email: string | null }) => r.email)
    .map((r: { email: string }) => r.email.toLowerCase())
  const passports = stagingRows
    .filter((r: { passport_number: string | null }) => r.passport_number)
    .map((r: { passport_number: string }) => r.passport_number)

  let crossDbMatches: Array<{ match_field: string; match_value: string; contact_id: string; contact_name: string }> = []

  if (emails.length > 0 || passports.length > 0) {
    const { data: conflictData } = await supabase.rpc('fn_bulk_conflict_check', {
      p_emails: emails,
      p_passports: passports,
    })

    const result = conflictData as unknown as { matches: typeof crossDbMatches } | null
    crossDbMatches = result?.matches ?? []
  }

  // Build lookup: match_value → conflict details
  const conflictByValue = new Map<string, typeof crossDbMatches>()
  for (const m of crossDbMatches) {
    const key = m.match_value?.toLowerCase()
    if (key) {
      const existing = conflictByValue.get(key) ?? []
      existing.push(m)
      conflictByValue.set(key, existing)
    }
  }

  // 4. Jurisdiction matching (deduplicated  -  only unique raw values)
  const uniqueJurisdictions = new Set<string>()
  for (const row of stagingRows) {
    if (row.raw_jurisdiction) uniqueJurisdictions.add(row.raw_jurisdiction)
  }

  const jurisdictionResults = new Map<string, {
    match_type: string
    confidence: number
    jurisdiction: { id: string; code: string; name: string; type: string } | null
    needs_review?: boolean
  }>()

  for (const raw of uniqueJurisdictions) {
    const { data } = await supabase.rpc('fn_match_jurisdiction', { p_raw_input: raw })
    if (data) {
      jurisdictionResults.set(raw, data as unknown as {
        match_type: string
        confidence: number
        jurisdiction: { id: string; code: string; name: string; type: string } | null
        needs_review?: boolean
      })
    }
  }

  // 5. Update each staging row with results (chunked)
  let processed = 0
  let clear = 0
  let conflicts = 0
  let needsReview = 0
  let invalid = 0

  for (let i = 0; i < stagingRows.length; i += CHUNK_SIZE) {
    const chunk = stagingRows.slice(i, i + CHUNK_SIZE)

    for (const row of chunk) {
      const updates: Record<string, unknown> = {}
      const errors: string[] = []

      // Basic validation
      if (!row.email) errors.push('Email is required')

      // Cross-DB conflict
      const emailConflicts = conflictByValue.get(row.email?.toLowerCase()) ?? []
      const passportConflicts = row.passport_number ? (conflictByValue.get(row.passport_number) ?? []) : []
      const allConflicts = [...emailConflicts, ...passportConflicts]

      if (allConflicts.length > 0 && !intraFileDuplicateIds.has(row.id)) {
        updates.conflict_status = 'cross_db_conflict'
        updates.conflict_details = allConflicts
      } else if (!intraFileDuplicateIds.has(row.id)) {
        updates.conflict_status = 'clear'
      }

      // Jurisdiction
      if (row.raw_jurisdiction) {
        const jMatch = jurisdictionResults.get(row.raw_jurisdiction)
        if (jMatch) {
          updates.jurisdiction_match_type = jMatch.match_type
          updates.jurisdiction_match_confidence = jMatch.confidence
          updates.matched_jurisdiction_id = jMatch.jurisdiction?.id ?? null
          updates.jurisdiction_needs_review = jMatch.needs_review ?? false
        }
      }

      updates.validation_errors = errors

      // Determine overall status
      const hasConflict = updates.conflict_status === 'cross_db_conflict' || intraFileDuplicateIds.has(row.id)
      const hasJurisdictionReview = updates.jurisdiction_needs_review === true
      const hasErrors = errors.length > 0

      if (hasErrors) {
        updates.validation_status = 'invalid'
        invalid++
      } else if (hasConflict) {
        updates.validation_status = 'conflict'
        conflicts++
      } else if (hasJurisdictionReview) {
        updates.validation_status = 'needs_review'
        needsReview++
      } else {
        updates.validation_status = 'valid'
        clear++
      }

      processed++

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('lead_import_staging')
        .update(updates)
        .eq('id', row.id)
    }

    // Update progress after each chunk
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('import_batches')
      .update({
        gatekeeper_summary: { total, processed, clear, conflicts, needs_review: needsReview, invalid, phase: 'validating' },
      })
      .eq('id', batchId)
  }

  // Mark complete
  await updateBatchPhase(supabase, batchId, 'ready')

  // Final summary
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('import_batches')
    .update({
      gatekeeper_summary: { total, processed, clear, conflicts, needs_review: needsReview, invalid, phase: 'ready' },
    })
    .eq('id', batchId)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function updateBatchPhase(
  supabase: SupabaseClient<Database>,
  batchId: string,
  phase: string
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('import_batches')
    .update({ status: phase })
    .eq('id', batchId)
}
