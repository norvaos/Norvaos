/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Bulk Lead Import — Commit Engine
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Processes approved staging rows into real leads + contacts.
 * Runs in 25-row chunks to avoid timeouts. Tracks progress.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { withLeadPIIEncrypted, withContactPIIEncrypted } from '@/lib/services/pii-dual-write'

const COMMIT_CHUNK = 25

interface CommitParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  batchId: string
  userId: string
  pipelineId: string
  stageId: string
  defaultMatterTypeId?: string
}

interface CommitResult {
  created: number
  skipped: number
  errors: number
}

/**
 * Commit approved staging rows to the leads + contacts tables.
 * Only processes rows where committed = false AND
 * (validation_status = 'valid' OR user has overridden conflicts).
 */
export async function commitStagingToLeads(params: CommitParams): Promise<CommitResult> {
  const { supabase, tenantId, batchId, userId, pipelineId, stageId, defaultMatterTypeId } = params

  // Update batch to committing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('import_batches')
    .update({ status: 'committing' })
    .eq('id', batchId)

  // Fetch committable rows (lean columns for insert)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error } = await (supabase as any)
    .from('lead_import_staging')
    .select('id, row_number, first_name, last_name, email, phone, date_of_birth, nationality, country_of_birth, passport_number, matched_jurisdiction_id, user_jurisdiction_override, temperature, estimated_value, notes, source_tag, campaign_tag, utm_source, utm_medium, utm_campaign, matter_type_name, validation_status, user_conflict_override')
    .eq('batch_id', batchId)
    .eq('committed', false)
    .in('validation_status', ['valid', 'needs_review', 'conflict'])
    .order('row_number', { ascending: true })

  if (error || !rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('import_batches').update({ status: 'ready' }).eq('id', batchId)
    return { created: 0, skipped: 0, errors: 0 }
  }

  let created = 0
  let skipped = 0
  let errors = 0

  for (let i = 0; i < rows.length; i += COMMIT_CHUNK) {
    const chunk = rows.slice(i, i + COMMIT_CHUNK)

    for (const row of chunk) {
      // Skip rows where user chose to skip conflicts
      if (row.user_conflict_override === 'skip') {
        skipped++
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('lead_import_staging')
          .update({ committed: true })
          .eq('id', row.id)
        continue
      }

      // Skip conflict rows without an override
      if (row.validation_status === 'conflict' && !row.user_conflict_override) {
        skipped++
        continue
      }

      try {
        // 1. Find or create contact
        const contactId = await findOrCreateContact(supabase, tenantId, userId, row)

        // 2. Resolve jurisdiction
        const jurisdictionId = row.user_jurisdiction_override ?? row.matched_jurisdiction_id ?? null

        // 3. Create lead
        const leadPayload = {
            tenant_id: tenantId,
            contact_id: contactId,
            pipeline_id: pipelineId,
            stage_id: stageId,
            status: 'open',
            temperature: row.temperature ?? 'warm',
            estimated_value: row.estimated_value ?? null,
            notes: row.notes ?? null,
            source: row.source_tag ?? 'csv_import',
            source_campaign: row.campaign_tag ?? null,
            utm_source: row.utm_source ?? null,
            utm_medium: row.utm_medium ?? null,
            utm_campaign: row.utm_campaign ?? null,
            lead_source: 'bulk_import',
            jurisdiction_id: jurisdictionId,
            matter_type_id: defaultMatterTypeId ?? null,
            created_by: userId,
          }
        const { data: lead, error: leadErr } = await supabase
          .from('leads')
          .insert({
            ...leadPayload,
            ...withLeadPIIEncrypted(leadPayload),
          })
          .select('id')
          .single()

        if (leadErr || !lead) {
          errors++
          continue
        }

        // 4. Mark staging row as committed
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('lead_import_staging')
          .update({
            committed: true,
            created_lead_id: lead.id,
            created_contact_id: contactId,
          })
          .eq('id', row.id)

        created++
      } catch {
        errors++
      }
    }

    // Update progress
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('import_batches')
      .update({
        gatekeeper_summary: {
          phase: 'committing',
          total: rows.length,
          processed: i + chunk.length,
          created,
          skipped,
          errors,
        },
      })
      .eq('id', batchId)
  }

  // Final status
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('import_batches')
    .update({
      status: 'committed',
      gatekeeper_summary: { phase: 'committed', total: rows.length, processed: rows.length, created, skipped, errors },
    })
    .eq('id', batchId)

  return { created, skipped, errors }
}

// ─── Contact Resolution ─────────────────────────────────────────────────────

async function findOrCreateContact(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  row: any
): Promise<string> {
  // Try to find existing contact by email (lean: 1 column)
  if (row.email) {
    const { data: existing } = await supabase
      .from('contacts')
      .select('id')
      .eq('tenant_id', tenantId)
      .ilike('email_primary', row.email)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (existing) return existing.id
  }

  // Create new contact
  const contactPayload = {
      tenant_id: tenantId,
      first_name: row.first_name ?? null,
      last_name: row.last_name ?? null,
      email_primary: row.email ?? null,
      phone_primary: row.phone ?? null,
      date_of_birth: row.date_of_birth ?? null,
      nationality: row.nationality ?? null,
      country_of_birth: row.country_of_birth ?? null,
      immigration_data: row.passport_number
        ? { passport_number: row.passport_number }
        : null,
      contact_type: 'individual',
      source: 'bulk_import',
      created_by: userId,
    }
  const { data: contact, error } = await supabase
    .from('contacts')
    .insert({
      ...contactPayload,
      ...withContactPIIEncrypted(contactPayload),
    })
    .select('id')
    .single()

  if (error || !contact) {
    throw new Error(`Contact creation failed: ${error?.message}`)
  }

  return contact.id
}
