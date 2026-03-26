// ============================================================================
// Form Instance Engine  -  Template → Instance Pipeline
// ============================================================================
// Core engine for IRCC form automation. Manages the lifecycle of form instances
// from published assignment templates, mirroring the Document Slot Engine.
//
// Public API:
//   generateFormInstances()       -  initial instance creation for a matter
//   regenerateFormInstances()     -  deterministic recomputation with change logging
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/types/database'
import {
  evaluateSlotCondition,
  type ConditionError,
} from '@/lib/services/document-slot-engine'
import { logAuditServer } from '@/lib/queries/audit-logs'
import type {
  GenerateFormInstancesParams,
  RegenerateFormInstancesResult,
} from '@/lib/types/form-instances'

// ─── Types ──────────────────────────────────────────────────────────────────────

// Tables not yet deployed to production DB  -  typed as any until migration lands
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AssignmentTemplateRow = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FormInstanceInsert = any

/**
 * Internal identity type for diffing expected vs. current instances.
 */
interface FormInstanceIdentity {
  templateId: string
  personId: string | null
  // Denormalized fields for insertion
  formId: string
  formCode: string
  formName: string
  formVersion: number
  formChecksum: string | null
  personRole: string | null
  sortOrder: number
  isRequired: boolean
}

// ─── Instance Identity Computation ──────────────────────────────────────────────

/**
 * Compute the expected form instance set from published templates + current
 * people + intake data. Same inputs always produce the same outputs.
 *
 * Condition errors are collected (not thrown) for the caller to log.
 */
function computeExpectedInstances(
  templates: AssignmentTemplateRow[],
  forms: Map<string, { form_code: string; form_name: string; current_version: number; checksum_sha256: string | null }>,
  people: Array<{ id: string; person_role: string; [key: string]: unknown }>,
  intakeData: Record<string, unknown>,
  conditionErrors: ConditionError[]
): FormInstanceIdentity[] {
  const result: FormInstanceIdentity[] = []

  for (const template of templates) {
    if (!template.is_active) continue

    const form = forms.get(template.form_id)
    if (!form) continue // form deleted or inactive

    // Error context for condition evaluation logging
    const errCtx = {
      templateId: template.id,
      slotSlug: form.form_code,
      slotName: form.form_name,
      errors: conditionErrors,
    }

    if (template.person_role_scope === null) {
      // Matter-level form  -  one per matter, no person association
      if (!evaluateSlotCondition(template.conditions, {}, intakeData, errCtx)) continue

      result.push({
        templateId: template.id,
        personId: null,
        formId: template.form_id,
        formCode: form.form_code,
        formName: form.form_name,
        formVersion: form.current_version,
        formChecksum: form.checksum_sha256,
        personRole: null,
        sortOrder: template.sort_order,
        isRequired: template.is_required,
      })
    } else if (template.person_role_scope === 'any') {
      // One instance per active person on the matter
      for (const person of people) {
        const personData = person as unknown as Record<string, unknown>
        if (!evaluateSlotCondition(template.conditions, personData, intakeData, errCtx)) continue

        result.push({
          templateId: template.id,
          personId: person.id,
          formId: template.form_id,
          formCode: form.form_code,
          formName: form.form_name,
          formVersion: form.current_version,
          formChecksum: form.checksum_sha256,
          personRole: person.person_role,
          sortOrder: template.sort_order,
          isRequired: template.is_required,
        })
      }
    } else {
      // Specific role scope  -  one instance per person with that role
      const matchingPeople = people.filter(
        (p) => p.person_role === template.person_role_scope
      )

      for (const person of matchingPeople) {
        const personData = person as unknown as Record<string, unknown>
        if (!evaluateSlotCondition(template.conditions, personData, intakeData, errCtx)) continue

        result.push({
          templateId: template.id,
          personId: person.id,
          formId: template.form_id,
          formCode: form.form_code,
          formName: form.form_name,
          formVersion: form.current_version,
          formChecksum: form.checksum_sha256,
          personRole: person.person_role,
          sortOrder: template.sort_order,
          isRequired: template.is_required,
        })
      }
    }
  }

  return result
}

/**
 * Unique key for an instance identity  -  used for diffing.
 */
function instanceKey(templateId: string, personId: string | null): string {
  return `${templateId}::${personId ?? 'NULL'}`
}

// ─── Condition Error Logging ────────────────────────────────────────────────────

/**
 * Log condition evaluation errors to the activity trail.
 * Non-blocking  -  callers wrap this in try/catch.
 */
async function logConditionErrors(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  matterId: string,
  errors: ConditionError[]
): Promise<void> {
  if (errors.length === 0) return

  const formSummary = errors.map((e) => `${e.slotName} (${e.slotSlug})`).join(', ')

  const description =
    `${errors.length} form assignment condition(s) failed evaluation and were skipped (fail-closed). ` +
    `Affected forms: ${formSummary}. ` +
    `Review template conditions in Settings → IRCC Form Library.`

  const metadata = {
    errors: errors.map((e) => ({
      template_id: e.templateId,
      form_code: e.slotSlug,
      form_name: e.slotName,
      error: e.error,
      conditions: e.conditions,
    })),
    policy: 'fail_closed_instance_not_generated',
  } as unknown as Json

  // Deduplicate within 24-hour window
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: existing } = await supabase
    .from('activities')
    .select('id')
    .eq('matter_id', matterId)
    .eq('activity_type', 'form_template_condition_error')
    .gte('created_at', twentyFourHoursAgo)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('activities')
      .update({ description, metadata, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
  } else {
    await supabase.from('activities').insert({
      tenant_id: tenantId,
      matter_id: matterId,
      activity_type: 'form_template_condition_error',
      title: 'Form template condition error',
      description,
      entity_type: 'matter',
      entity_id: matterId,
      metadata,
    })
  }
}

// ─── Shared: fetch templates + forms + people + intake ──────────────────────────

async function fetchEngineData(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  matterId: string,
  matterTypeId?: string | null,
  caseTypeId?: string | null
) {
  // 1. Fetch published assignment templates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let templateQuery = (supabase as any)
    .from('ircc_form_assignment_templates')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'published')
    .eq('is_active', true)
    .order('sort_order')

  if (matterTypeId) {
    templateQuery = templateQuery.eq('matter_type_id', matterTypeId)
  } else if (caseTypeId) {
    templateQuery = templateQuery.eq('case_type_id', caseTypeId)
  }

  const { data: templates } = await templateQuery

  if (!templates || templates.length === 0) {
    return { templates: [], forms: new Map(), people: [], intakeData: {} as Record<string, unknown> }
  }

  // 2. Fetch referenced forms for snapshot data
  const formIds = [...new Set(templates.map((t: { form_id: string }) => t.form_id))]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: formRows } = await (supabase as any)
    .from('ircc_forms')
    .select('id, form_code, form_name, current_version, checksum_sha256')
    .in('id', formIds)
    .eq('is_active', true)

  const forms = new Map<string, { form_code: string; form_name: string; current_version: number; checksum_sha256: string | null }>()
  if (formRows) {
    for (const f of formRows) {
      forms.set(f.id, f)
    }
  }

  // 3. Fetch active matter_people
  const { data: people } = await supabase
    .from('matter_people')
    .select('*')
    .eq('matter_id', matterId)
    .eq('is_active', true)
    .order('sort_order')

  // 4. Fetch matter_intake for condition evaluation
  const { data: intake } = await supabase
    .from('matter_intake')
    .select('*')
    .eq('matter_id', matterId)
    .maybeSingle()

  return {
    templates,
    forms,
    people: (people ?? []) as Array<{ id: string; person_role: string; [key: string]: unknown }>,
    intakeData: (intake ?? {}) as Record<string, unknown>,
  }
}

// ─── Public API: generateFormInstances ──────────────────────────────────────────

/**
 * Generate form instances for a matter based on published assignment templates.
 * Idempotent  -  uses ON CONFLICT DO NOTHING so safe to call multiple times.
 *
 * Called from kit activation (workflow and immigration kits).
 */
export async function generateFormInstances(params: GenerateFormInstancesParams): Promise<void> {
  const { supabase, tenantId, matterId, matterTypeId, caseTypeId } = params

  if (!matterTypeId && !caseTypeId) return

  const { templates, forms, people, intakeData } = await fetchEngineData(
    supabase, tenantId, matterId, matterTypeId, caseTypeId
  )

  if (templates.length === 0) return

  // Compute expected instances
  const conditionErrors: ConditionError[] = []
  const expectedInstances = computeExpectedInstances(
    templates, forms, people, intakeData, conditionErrors
  )

  // Log any condition evaluation errors
  if (conditionErrors.length > 0) {
    try {
      await logConditionErrors(supabase, tenantId, matterId, conditionErrors)
    } catch {
      // Non-blocking
    }
  }

  if (expectedInstances.length === 0) return

  // Insert with ON CONFLICT DO NOTHING  -  idempotent
  const inserts: FormInstanceInsert[] = expectedInstances.map((inst) => ({
    tenant_id: tenantId,
    matter_id: matterId,
    person_id: inst.personId,
    assignment_template_id: inst.templateId,
    form_id: inst.formId,
    form_code: inst.formCode,
    form_name: inst.formName,
    form_version_at_creation: inst.formVersion,
    form_checksum_at_creation: inst.formChecksum,
    person_role: inst.personRole,
    sort_order: inst.sortOrder,
    is_required: inst.isRequired,
    status: 'pending' as const,
    is_active: true,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('matter_form_instances')
    .upsert(inserts, {
      onConflict: 'matter_id,assignment_template_id,person_id',
      ignoreDuplicates: true,
    })

  // Log activity
  await supabase.from('activities').insert({
    tenant_id: tenantId,
    matter_id: matterId,
    activity_type: 'form_instances_generated',
    title: 'Form instances generated',
    description: `${inserts.length} form instance(s) created from published templates`,
    entity_type: 'matter',
    entity_id: matterId,
    metadata: {
      count: inserts.length,
      form_codes: inserts.map((i) => i.form_code),
      source: 'kit_activation',
    } as unknown as Json,
  })

  // Audit log
  await logAuditServer({
    supabase,
    tenantId,
    userId: 'system',
    entityType: 'matter',
    entityId: matterId,
    action: 'form_instances_generated',
    changes: {
      count: inserts.length,
      form_codes: inserts.map((i) => i.form_code),
    },
  })
}

// ─── Public API: regenerateFormInstances ─────────────────────────────────────────

/**
 * Deterministically recompute the full form instance set from current data.
 * Produces zero changes on repeated calls with the same inputs.
 *
 * Called after any mutation that touches intake or people data.
 */
export async function regenerateFormInstances(
  params: GenerateFormInstancesParams
): Promise<RegenerateFormInstancesResult> {
  const { supabase, tenantId, matterId, matterTypeId, caseTypeId } = params

  const result: RegenerateFormInstancesResult = {
    added: [],
    removed: [],
    reactivated: [],
    unchanged: 0,
  }

  if (!matterTypeId && !caseTypeId) return result

  const { templates, forms, people, intakeData } = await fetchEngineData(
    supabase, tenantId, matterId, matterTypeId, caseTypeId
  )

  if (!templates) return result

  // Compute expected instance set
  const conditionErrors: ConditionError[] = []
  const expectedInstances = computeExpectedInstances(
    templates, forms, people, intakeData, conditionErrors
  )

  // Log any condition evaluation errors
  if (conditionErrors.length > 0) {
    try {
      await logConditionErrors(supabase, tenantId, matterId, conditionErrors)
    } catch {
      // Non-blocking
    }
  }

  // Fetch current instance set (both active and inactive for reactivation check)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: currentInstances } = await (supabase as any)
    .from('matter_form_instances')
    .select('*')
    .eq('matter_id', matterId)

  const currentList = currentInstances ?? []

  // Build lookup maps
  const expectedMap = new Map<string, FormInstanceIdentity>()
  for (const inst of expectedInstances) {
    expectedMap.set(instanceKey(inst.templateId, inst.personId), inst)
  }

  const currentActiveMap = new Map<string, (typeof currentList)[number]>()
  const currentInactiveMap = new Map<string, (typeof currentList)[number]>()
  for (const inst of currentList) {
    const key = instanceKey(inst.assignment_template_id ?? '', inst.person_id)
    if (inst.is_active) {
      currentActiveMap.set(key, inst)
    } else {
      currentInactiveMap.set(key, inst)
    }
  }

  // Diff: find added, obsolete, reactivated, unchanged
  for (const [key, expected] of expectedMap) {
    if (currentActiveMap.has(key)) {
      result.unchanged++
    } else if (currentInactiveMap.has(key)) {
      // Exists but inactive  -  reactivate
      const existing = currentInactiveMap.get(key)!
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('matter_form_instances')
        .update({ is_active: true, deactivated_at: null })
        .eq('id', existing.id)

      result.reactivated.push({
        formCode: expected.formCode,
        personRole: expected.personRole,
      })
    } else {
      // New  -  insert
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('matter_form_instances').insert({
        tenant_id: tenantId,
        matter_id: matterId,
        person_id: expected.personId,
        assignment_template_id: expected.templateId,
        form_id: expected.formId,
        form_code: expected.formCode,
        form_name: expected.formName,
        form_version_at_creation: expected.formVersion,
        form_checksum_at_creation: expected.formChecksum,
        person_role: expected.personRole,
        sort_order: expected.sortOrder,
        is_required: expected.isRequired,
        status: 'pending',
        is_active: true,
      })

      result.added.push({
        formCode: expected.formCode,
        personRole: expected.personRole,
      })
    }
  }

  // Current active instances not in expected set → soft-deactivate
  for (const [key, existing] of currentActiveMap) {
    if (!expectedMap.has(key)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('matter_form_instances')
        .update({
          is_active: false,
          deactivated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)

      result.removed.push({
        formCode: existing.form_code,
        personRole: existing.person_role,
      })
    }
  }

  // Log changes to activity trail (only if something changed)
  const hasChanges = result.added.length > 0 || result.removed.length > 0 || result.reactivated.length > 0
  if (hasChanges) {
    const parts: string[] = []
    if (result.added.length > 0) parts.push(`${result.added.length} added`)
    if (result.removed.length > 0) parts.push(`${result.removed.length} deactivated`)
    if (result.reactivated.length > 0) parts.push(`${result.reactivated.length} reactivated`)

    await supabase.from('activities').insert({
      tenant_id: tenantId,
      matter_id: matterId,
      activity_type: 'form_instances_regenerated',
      title: 'Form instances updated',
      description: `Form instances recomputed: ${parts.join(', ')}. ${result.unchanged} unchanged.`,
      entity_type: 'matter',
      entity_id: matterId,
      metadata: {
        added: result.added,
        removed: result.removed,
        reactivated: result.reactivated,
        unchanged: result.unchanged,
      } as unknown as Json,
    })

    // Audit log
    await logAuditServer({
      supabase,
      tenantId,
      userId: 'system',
      entityType: 'matter',
      entityId: matterId,
      action: 'form_instances_regenerated',
      changes: {
        added: result.added,
        removed: result.removed,
        reactivated: result.reactivated,
        unchanged: result.unchanged,
      },
    })
  }

  return result
}
