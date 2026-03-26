/**
 * Rule Snapshot Engine
 *
 * Captures immutable snapshots of the 6 rule objects from a matter's
 * matter_type at the moment of matter creation. Stored in matter_rule_snapshots
 * for audit, drift detection, and compliance purposes.
 *
 * Called fire-and-forget after matter creation  -  never blocks the response.
 */

import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { RuleType, MatterRuleSnapshotInsert } from '@/lib/types/database'

type SupabaseDB = SupabaseClient<Database>

// ── Hash Helper ──────────────────────────────────────────────────────────────

/**
 * Compute a deterministic SHA-256 hex digest of a JSON-serialisable object.
 * Keys are sorted before serialisation to ensure stability.
 */
function sortedStringify(value: unknown): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return JSON.stringify(value)
  }
  const sorted = Object.keys(value as Record<string, unknown>).sort()
  const parts = sorted.map(
    (k) => `${JSON.stringify(k)}:${sortedStringify((value as Record<string, unknown>)[k])}`
  )
  return `{${parts.join(',')}}`
}

function hashObject(data: Record<string, unknown>): string {
  const stable = sortedStringify(data)
  return createHash('sha256').update(stable).digest('hex')
}

// ── Snapshot Fetchers ────────────────────────────────────────────────────────

async function fetchMatterTypeConfig(
  supabase: SupabaseDB,
  matterTypeId: string,
): Promise<Record<string, unknown>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('matter_types')
    .select('*')
    .eq('id', matterTypeId)
    .single()
  return (data ?? {}) as Record<string, unknown>
}

async function fetchSLAConfig(
  supabase: SupabaseDB,
  matterTypeId: string,
): Promise<Record<string, unknown>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('matter_types')
    .select('id, name, matter_type_config')
    .eq('id', matterTypeId)
    .single()

  if (!data) return {}

  // Extract SLA-related fields from matter_type_config JSONB or top-level columns
  const config = (data.matter_type_config ?? {}) as Record<string, unknown>
  return {
    matter_type_id: data.id,
    matter_type_name: data.name,
    sla: config.sla ?? null,
    sla_days: config.sla_days ?? null,
    sla_class: config.sla_class ?? null,
  }
}

async function fetchBillingConfig(
  supabase: SupabaseDB,
  matterTypeId: string,
): Promise<Record<string, unknown>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('matter_types')
    .select('id, name, matter_type_config')
    .eq('id', matterTypeId)
    .single()

  if (!data) return {}

  const config = (data.matter_type_config ?? {}) as Record<string, unknown>
  return {
    matter_type_id: data.id,
    billing_type: config.billing_type ?? null,
    default_flat_fee: config.default_flat_fee ?? null,
    default_hourly_rate: config.default_hourly_rate ?? null,
    billing: config.billing ?? null,
  }
}

async function fetchDocumentChecklist(
  supabase: SupabaseDB,
  matterTypeId: string,
  tenantId: string,
): Promise<Record<string, unknown>> {
  // document_slots are per-matter, not per-matter-type globally.
  // We snapshot the slot_templates for this matter_type instead,
  // querying document_slot_templates if they exist, else returning
  // the matter_types document config from matter_type_config.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: slots } = await (supabase as any)
    .from('document_slots')
    .select('id, slot_label, slot_category, required, sort_order')
    .eq('tenant_id', tenantId)
    .eq('matter_id', null)          // template slots have no matter_id
    .limit(200)

  // Fallback: read document config from matter_type_config
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: mtData } = await (supabase as any)
    .from('matter_types')
    .select('id, matter_type_config')
    .eq('id', matterTypeId)
    .single()

  const config = ((mtData?.matter_type_config ?? {}) as Record<string, unknown>)
  return {
    matter_type_id: matterTypeId,
    document_config: config.documents ?? config.document_checklist ?? null,
    global_slots_count: (slots ?? []).length,
  }
}

async function fetchTaskTemplatesConfig(
  supabase: SupabaseDB,
  matterTypeId: string,
  tenantId: string,
): Promise<Record<string, unknown>> {
  // task_templates table is keyed by practice_area_id, not matter_type_id.
  // Snapshot from matter_type_config or workflow_templates for this matter type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: workflows } = await (supabase as any)
    .from('workflow_templates')
    .select('id, name, description, matter_type_id, stage_pipeline_id, trigger_stage_id, is_default')
    .eq('tenant_id', tenantId)
    .eq('matter_type_id', matterTypeId)
    .eq('is_active', true)

  return {
    matter_type_id: matterTypeId,
    workflow_templates: (workflows ?? []) as Record<string, unknown>[],
    workflow_count: (workflows ?? []).length,
  }
}

async function fetchFormPackConfig(
  supabase: SupabaseDB,
  matterTypeId: string,
): Promise<Record<string, unknown>> {
  // Extract form pack config from matter_type_config JSONB
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('matter_types')
    .select('id, matter_type_config, ircc_question_set_codes')
    .eq('id', matterTypeId)
    .single()

  if (!data) return {}

  const config = (data.matter_type_config ?? {}) as Record<string, unknown>
  return {
    matter_type_id: matterTypeId,
    form_pack: config.form_pack ?? config.form_packs ?? null,
    ircc_question_set_codes: data.ircc_question_set_codes ?? null,
  }
}

// ── Main Capture Function ────────────────────────────────────────────────────

/**
 * Capture 6 rule snapshots for a newly created matter.
 *
 * Each snapshot:
 *   - Fetches the relevant config object from the DB
 *   - Computes a SHA-256 hash for drift detection
 *   - Inserts a row into matter_rule_snapshots
 *
 * Designed to be called fire-and-forget: non-blocking, non-fatal.
 * `captureRuleSnapshots(...).catch(console.error)`
 */
export async function captureRuleSnapshots(
  matterId: string,
  tenantId: string,
  supabase: SupabaseDB,
): Promise<void> {
  // Resolve matter_type_id for this matter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: matter } = await (supabase as any)
    .from('matters')
    .select('matter_type_id')
    .eq('id', matterId)
    .single()

  const matterTypeId: string | null = matter?.matter_type_id ?? null

  if (!matterTypeId) {
    // No matter type  -  nothing to snapshot
    return
  }

  // Fetch all 6 rule objects in parallel
  const [
    matterTypeConfig,
    slaConfig,
    billingConfig,
    documentChecklist,
    taskTemplatesConfig,
    formPackConfig,
  ] = await Promise.all([
    fetchMatterTypeConfig(supabase, matterTypeId),
    fetchSLAConfig(supabase, matterTypeId),
    fetchBillingConfig(supabase, matterTypeId),
    fetchDocumentChecklist(supabase, matterTypeId, tenantId),
    fetchTaskTemplatesConfig(supabase, matterTypeId, tenantId),
    fetchFormPackConfig(supabase, matterTypeId),
  ])

  const snapshots: { ruleType: RuleType; data: Record<string, unknown> }[] = [
    { ruleType: 'matter_type_config', data: matterTypeConfig },
    { ruleType: 'sla_config',         data: slaConfig },
    { ruleType: 'billing_config',     data: billingConfig },
    { ruleType: 'document_checklist', data: documentChecklist },
    { ruleType: 'task_templates',     data: taskTemplatesConfig },
    { ruleType: 'form_pack_config',   data: formPackConfig },
  ]

  const rows: MatterRuleSnapshotInsert[] = snapshots.map(({ ruleType, data }) => ({
    tenant_id:     tenantId,
    matter_id:     matterId,
    rule_type:     ruleType,
    snapshot_data: data,
    version_hash:  hashObject(data),
  }))

  // Batch insert all 6 rows
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('matter_rule_snapshots')
    .insert(rows)

  if (error) {
    throw new Error(`[rule-snapshot-engine] Insert failed: ${error.message}`)
  }
}
