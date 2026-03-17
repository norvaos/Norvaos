// ============================================================================
// Document Slot Engine — Slot Generation, Condition Evaluation, Auto-Rename
// ============================================================================
// Core engine for the Document Engine (Phase B.2). Manages the lifecycle of
// document slots: generation from templates, deterministic recomputation on
// Core Data changes, structured condition evaluation, and auto-renaming.
//
// Public API:
//   generateDocumentSlots()     — initial slot creation for a matter
//   regenerateDocumentSlots()   — deterministic recomputation with change logging
//   buildAutoRenamedPath()      — naming convention for versioned uploads
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/types/database'
import { sendClientEmail } from '@/lib/services/email-service'
import { sendDocumentRequest } from '@/lib/services/document-request-service'

// ─── Types ──────────────────────────────────────────────────────────────────────

type SlotTemplateRow = Database['public']['Tables']['document_slot_templates']['Row']
type DocumentSlotInsert = Database['public']['Tables']['document_slots']['Insert']

export interface GenerateSlotsParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  matterId: string
  matterTypeId?: string | null
  caseTypeId?: string | null
  jurisdiction?: string
}

export interface RegenerateResult {
  added: { slotName: string; personRole: string | null }[]
  removed: { slotName: string; personRole: string | null }[]
  reactivated: { slotName: string; personRole: string | null }[]
  unchanged: number
}

// Condition operator model — stored as JSONB in document_slot_templates.conditions
export type SlotConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'in'
  | 'not_in'
  | 'exists'
  | 'not_exists'
  | 'gt'
  | 'lt'
  | 'gte'
  | 'lte'

export interface SlotCondition {
  field: string
  operator: SlotConditionOperator
  value?: unknown
  source?: 'person' | 'intake'
}

export type SlotConditions = SlotCondition | SlotCondition[]

// Internal: a computed slot identity used for diffing
interface SlotIdentity {
  templateId: string
  personId: string | null
  // Denormalized fields for insertion
  slotName: string
  slotSlug: string
  description: string | null
  category: string
  personRole: string | null
  isRequired: boolean
  acceptedFileTypes: string[]
  maxFileSizeBytes: number
  sortOrder: number
}

// ─── Condition Evaluation ───────────────────────────────────────────────────────

/**
 * Resolve a dot-path field from a data object.
 * Supports simple keys like "marital_status" and nested paths like "intake.processing_stream".
 */
function resolveField(data: Record<string, unknown>, field: string): unknown {
  const parts = field.split('.')
  let current: unknown = data
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

/**
 * Evaluate a single condition against a data source.
 * Unknown operators are treated as INVALID → returns false (fail-closed).
 */
function evaluateSingleCondition(
  condition: SlotCondition,
  personData: Record<string, unknown>,
  intakeData: Record<string, unknown>
): boolean {
  const source = condition.source === 'intake' ? intakeData : personData
  const fieldValue = resolveField(source, condition.field)

  switch (condition.operator) {
    case 'equals':
      return fieldValue === condition.value

    case 'not_equals':
      return fieldValue !== condition.value

    case 'in':
      if (!Array.isArray(condition.value)) return false
      return condition.value.includes(fieldValue)

    case 'not_in':
      if (!Array.isArray(condition.value)) return false // invalid value shape → fail-closed
      return !condition.value.includes(fieldValue)

    case 'exists':
      return fieldValue !== null && fieldValue !== undefined

    case 'not_exists':
      return fieldValue === null || fieldValue === undefined

    case 'gt':
      if (typeof fieldValue === 'number' && typeof condition.value === 'number') {
        return fieldValue > condition.value
      }
      if (typeof fieldValue === 'string' && typeof condition.value === 'string') {
        return fieldValue > condition.value
      }
      return false

    case 'lt':
      if (typeof fieldValue === 'number' && typeof condition.value === 'number') {
        return fieldValue < condition.value
      }
      if (typeof fieldValue === 'string' && typeof condition.value === 'string') {
        return fieldValue < condition.value
      }
      return false

    case 'gte':
      if (typeof fieldValue === 'number' && typeof condition.value === 'number') {
        return fieldValue >= condition.value
      }
      if (typeof fieldValue === 'string' && typeof condition.value === 'string') {
        return fieldValue >= condition.value
      }
      return false

    case 'lte':
      if (typeof fieldValue === 'number' && typeof condition.value === 'number') {
        return fieldValue <= condition.value
      }
      if (typeof fieldValue === 'string' && typeof condition.value === 'string') {
        return fieldValue <= condition.value
      }
      return false

    default:
      // Unknown operator → FAIL-CLOSED (slot not generated)
      return false
  }
}

// ─── Condition Error Collector ──────────────────────────────────────────────────

/** Error detail collected during condition evaluation, surfaced to callers for logging. */
export interface ConditionError {
  templateId: string
  slotSlug: string
  slotName: string
  error: string
  conditions: string // JSON stringified
}

/**
 * Evaluate slot conditions (single or array, all must pass = AND logic).
 * Returns true if no conditions are set (unconditional slot).
 *
 * FAIL-CLOSED: on any malformed condition, unknown operator, missing required
 * field, or runtime exception, returns false so the conditional slot is NOT
 * generated. Errors are collected into the optional `errors` array for the
 * caller to log as activity entries and notify staff.
 */
export function evaluateSlotCondition(
  conditions: Json,
  personData: Record<string, unknown>,
  intakeData: Record<string, unknown>,
  errorContext?: { templateId: string; slotSlug: string; slotName: string; errors: ConditionError[] }
): boolean {
  if (!conditions) return true

  try {
    const conditionList: SlotCondition[] = Array.isArray(conditions)
      ? (conditions as unknown as SlotCondition[])
      : [conditions as unknown as SlotCondition]

    // Guard: entries that lack the minimum shape → fail-closed
    for (const c of conditionList) {
      if (!c || typeof c !== 'object' || !('field' in c) || !('operator' in c)) {
        const errMsg = `Malformed condition — missing field/operator: ${JSON.stringify(c)}`
        if (errorContext) {
          errorContext.errors.push({
            templateId: errorContext.templateId,
            slotSlug: errorContext.slotSlug,
            slotName: errorContext.slotName,
            error: errMsg,
            conditions: JSON.stringify(conditions),
          })
        }
        return false // fail-closed: slot NOT generated
      }
    }

    // All conditions must pass (AND logic)
    const result = conditionList.every((c) =>
      evaluateSingleCondition(c, personData, intakeData)
    )

    return result
  } catch (err) {
    const errMsg = `Condition evaluation runtime error: ${err instanceof Error ? err.message : String(err)}`
    if (errorContext) {
      errorContext.errors.push({
        templateId: errorContext.templateId,
        slotSlug: errorContext.slotSlug,
        slotName: errorContext.slotName,
        error: errMsg,
        conditions: JSON.stringify(conditions),
      })
    }
    return false // fail-closed: slot NOT generated
  }
}

// ─── Slot Identity Computation ──────────────────────────────────────────────────

/**
 * Compute the expected slot set from templates + current people + intake data.
 * This is the core deterministic function — same inputs always produce same outputs.
 *
 * Condition errors are collected into the `conditionErrors` array for the caller
 * to log as activity entries and notify staff. Invalid conditions → slot NOT generated.
 */
function computeExpectedSlots(
  templates: SlotTemplateRow[],
  people: Array<{ id: string; person_role: string; [key: string]: unknown }>,
  intakeData: Record<string, unknown>,
  conditionErrors: ConditionError[]
): SlotIdentity[] {
  const result: SlotIdentity[] = []

  for (const template of templates) {
    if (!template.is_active) continue

    const errCtx = {
      templateId: template.id,
      slotSlug: template.slot_slug,
      slotName: template.slot_name,
      errors: conditionErrors,
    }

    if (template.person_role_scope === null) {
      // Matter-level slot — one per matter, no person association
      if (!evaluateSlotCondition(template.conditions, {}, intakeData, errCtx)) continue

      result.push({
        templateId: template.id,
        personId: null,
        slotName: template.slot_name,
        slotSlug: template.slot_slug,
        description: template.description,
        category: template.category,
        personRole: null,
        isRequired: template.is_required,
        acceptedFileTypes: template.accepted_file_types ?? [],
        maxFileSizeBytes: template.max_file_size_bytes ?? 0,
        sortOrder: template.sort_order,
      })
    } else if (template.person_role_scope === 'any') {
      // One slot per active person on the matter
      for (const person of people) {
        const personData = person as unknown as Record<string, unknown>
        if (!evaluateSlotCondition(template.conditions, personData, intakeData, errCtx)) continue

        result.push({
          templateId: template.id,
          personId: person.id,
          slotName: template.slot_name,
          slotSlug: template.slot_slug,
          description: template.description,
          category: template.category,
          personRole: person.person_role,
          isRequired: template.is_required,
          acceptedFileTypes: template.accepted_file_types ?? [],
          maxFileSizeBytes: template.max_file_size_bytes ?? 0,
          sortOrder: template.sort_order,
        })
      }
    } else {
      // Specific role scope — one slot per person with that role
      const matchingPeople = people.filter(
        (p) => p.person_role === template.person_role_scope
      )

      for (const person of matchingPeople) {
        const personData = person as unknown as Record<string, unknown>
        if (!evaluateSlotCondition(template.conditions, personData, intakeData, errCtx)) continue

        result.push({
          templateId: template.id,
          personId: person.id,
          slotName: template.slot_name,
          slotSlug: template.slot_slug,
          description: template.description,
          category: template.category,
          personRole: person.person_role,
          isRequired: template.is_required,
          acceptedFileTypes: template.accepted_file_types ?? [],
          maxFileSizeBytes: template.max_file_size_bytes ?? 0,
          sortOrder: template.sort_order,
        })
      }
    }
  }

  return result
}

/**
 * Unique key for a slot identity — used for diffing.
 */
function slotKey(templateId: string, personId: string | null): string {
  return `${templateId}::${personId ?? 'NULL'}`
}

// ─── Condition Error Logging ─────────────────────────────────────────────────

/**
 * Log condition evaluation errors to the activity trail and notify the
 * responsible lawyer so the misconfigured template is visible and fixable.
 *
 * **Deduplication (24-hour window):** If a `template_condition_error` activity
 * already exists for this matter within the last 24 hours, the existing row is
 * UPDATED (metadata replaced, timestamp refreshed) instead of inserting a new
 * row. Same for notifications. This prevents spam when regeneration fires
 * repeatedly (e.g. multiple intake edits) for the same broken template.
 *
 * Non-blocking: callers wrap this in try/catch so logging failure never
 * blocks slot generation or regeneration.
 */
async function logConditionErrors(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  matterId: string,
  errors: ConditionError[]
): Promise<void> {
  if (errors.length === 0) return

  const slotSummary = errors.map((e) => `${e.slotName} (${e.slotSlug})`).join(', ')
  const errorDetails = errors.map((e) => ({
    template_id: e.templateId,
    slot_slug: e.slotSlug,
    slot_name: e.slotName,
    error: e.error,
    conditions: e.conditions,
  }))

  const description =
    `${errors.length} template condition(s) failed evaluation and were skipped (fail-closed). ` +
    `Affected slots: ${slotSummary}. ` +
    `Review template conditions and correct the configuration so required documents are generated.`

  const metadata = {
    errors: errorDetails,
    policy: 'fail_closed_slot_not_generated',
  } as unknown as Json

  // ── 1. Activity log entry — deduplicated within 24-hour window ──
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: existingActivity } = await supabase
    .from('activities')
    .select('id')
    .eq('matter_id', matterId)
    .eq('activity_type', 'template_condition_error')
    .gte('created_at', twentyFourHoursAgo)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingActivity) {
    // Update existing — refresh description, metadata, and timestamp
    await supabase
      .from('activities')
      .update({
        description,
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingActivity.id)
  } else {
    // No recent entry — insert new
    await supabase.from('activities').insert({
      tenant_id: tenantId,
      matter_id: matterId,
      activity_type: 'template_condition_error',
      title: 'Document template condition error',
      description,
      entity_type: 'matter',
      entity_id: matterId,
      metadata,
    })
  }

  // ── 2. Notify responsible lawyer — deduplicated within 24-hour window ──
  const { data: matter } = await supabase
    .from('matters')
    .select('responsible_lawyer_id, title')
    .eq('id', matterId)
    .single()

  if (matter?.responsible_lawyer_id) {
    const notifMessage =
      `${errors.length} document template condition(s) on "${matter.title}" failed evaluation ` +
      `and the affected slots were NOT generated (fail-closed). ` +
      `Affected: ${slotSummary}. ` +
      `Please review the template conditions in Settings \u2192 Document Slot Templates.`

    const { data: existingNotif } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', matter.responsible_lawyer_id)
      .eq('notification_type', 'template_condition_error')
      .eq('entity_id', matterId)
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingNotif) {
      // Update existing notification — refresh message, mark unread again
      await supabase
        .from('notifications')
        .update({
          message: notifMessage,
          is_read: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingNotif.id)
    } else {
      await supabase.from('notifications').insert({
        tenant_id: tenantId,
        user_id: matter.responsible_lawyer_id,
        title: `Template condition error: ${matter.title}`,
        message: notifMessage,
        notification_type: 'template_condition_error',
        entity_type: 'matter',
        entity_id: matterId,
        channels: ['in_app'],
        priority: 'high',
      })
    }
  }
}

// ─── Public API: generateDocumentSlots ──────────────────────────────────────────

/**
 * Generate document slots for a matter based on templates.
 * Idempotent — uses ON CONFLICT DO NOTHING so safe to call multiple times.
 *
 * Called from kit activation (workflow and immigration kits).
 */
export async function generateDocumentSlots(params: GenerateSlotsParams): Promise<void> {
  const { supabase, tenantId, matterId, matterTypeId, caseTypeId } = params

  if (!matterTypeId && !caseTypeId) return

  // 1. Fetch active templates
  let templateQuery = supabase
    .from('document_slot_templates')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('sort_order')

  if (matterTypeId) {
    templateQuery = templateQuery.eq('matter_type_id', matterTypeId)
  } else if (caseTypeId) {
    templateQuery = templateQuery.eq('case_type_id', caseTypeId)
  }

  const { data: templates, error: templateErr } = await templateQuery

  if (templateErr || !templates || templates.length === 0) return

  // 2. Fetch active matter_people
  const { data: people } = await supabase
    .from('matter_people')
    .select('*')
    .eq('matter_id', matterId)
    .eq('is_active', true)
    .order('sort_order')

  const peopleList = people ?? []

  // 3. Fetch matter_intake for condition evaluation
  const { data: intake } = await supabase
    .from('matter_intake')
    .select('*')
    .eq('matter_id', matterId)
    .maybeSingle()

  const intakeData = (intake ?? {}) as Record<string, unknown>

  // 4. Compute expected slots
  const conditionErrors: ConditionError[] = []
  const expectedSlots = computeExpectedSlots(
    templates,
    peopleList as Array<{ id: string; person_role: string; [key: string]: unknown }>,
    intakeData,
    conditionErrors
  )

  // 4b. Log any condition evaluation errors
  if (conditionErrors.length > 0) {
    try {
      await logConditionErrors(supabase, tenantId, matterId, conditionErrors)
    } catch {
      // Non-blocking — logging failure should not fail slot generation
    }
  }

  if (expectedSlots.length === 0) return

  // 5. Insert with ON CONFLICT DO NOTHING — idempotent
  const inserts: DocumentSlotInsert[] = expectedSlots.map((slot) => ({
    tenant_id: tenantId,
    matter_id: matterId,
    person_id: slot.personId,
    slot_template_id: slot.templateId,
    slot_name: slot.slotName,
    slot_slug: slot.slotSlug,
    description: slot.description,
    category: slot.category,
    person_role: slot.personRole,
    is_required: slot.isRequired,
    accepted_file_types: slot.acceptedFileTypes,
    max_file_size_bytes: slot.maxFileSizeBytes,
    sort_order: slot.sortOrder,
    status: 'empty',
    current_version: 0,
    is_active: true,
  }))

  // Supabase JS doesn't support ON CONFLICT DO NOTHING natively for
  // compound constraints, so we use upsert with ignoreDuplicates
  await supabase
    .from('document_slots')
    .upsert(inserts, { onConflict: 'matter_id,slot_template_id,person_id', ignoreDuplicates: true })
}

// ─── Public API: regenerateDocumentSlots ────────────────────────────────────────

/**
 * Deterministically recompute the full slot set from current Core Data.
 * Produces zero changes on repeated calls with the same inputs.
 *
 * Changes are logged to `activities` and client-notified via existing email
 * infrastructure. Called after any mutation that touches intake or people data.
 */
export async function regenerateDocumentSlots(
  params: GenerateSlotsParams
): Promise<RegenerateResult> {
  const { supabase, tenantId, matterId, matterTypeId, caseTypeId } = params

  const result: RegenerateResult = {
    added: [],
    removed: [],
    reactivated: [],
    unchanged: 0,
  }

  if (!matterTypeId && !caseTypeId) return result

  // 1. Fetch active templates
  let templateQuery = supabase
    .from('document_slot_templates')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('sort_order')

  if (matterTypeId) {
    templateQuery = templateQuery.eq('matter_type_id', matterTypeId)
  } else if (caseTypeId) {
    templateQuery = templateQuery.eq('case_type_id', caseTypeId)
  }

  const { data: templates } = await templateQuery

  if (!templates) return result

  // 2. Fetch active matter_people
  const { data: people } = await supabase
    .from('matter_people')
    .select('*')
    .eq('matter_id', matterId)
    .eq('is_active', true)
    .order('sort_order')

  const peopleList = people ?? []

  // 3. Fetch matter_intake for condition evaluation
  const { data: intake } = await supabase
    .from('matter_intake')
    .select('*')
    .eq('matter_id', matterId)
    .maybeSingle()

  const intakeData = (intake ?? {}) as Record<string, unknown>

  // 4. Compute expected slot set
  const conditionErrors: ConditionError[] = []
  const expectedSlots = computeExpectedSlots(
    templates,
    peopleList as Array<{ id: string; person_role: string; [key: string]: unknown }>,
    intakeData,
    conditionErrors
  )

  // 4b. Log any condition evaluation errors
  if (conditionErrors.length > 0) {
    try {
      await logConditionErrors(supabase, tenantId, matterId, conditionErrors)
    } catch {
      // Non-blocking — logging failure should not fail regeneration
    }
  }

  // 5. Fetch current slot set (both active and inactive for reactivation check)
  const { data: currentSlots } = await supabase
    .from('document_slots')
    .select('*')
    .eq('matter_id', matterId)

  const currentSlotList = currentSlots ?? []

  // 6. Build lookup maps
  const expectedMap = new Map<string, SlotIdentity>()
  for (const slot of expectedSlots) {
    expectedMap.set(slotKey(slot.templateId, slot.personId), slot)
  }

  const currentActiveMap = new Map<string, (typeof currentSlotList)[number]>()
  const currentInactiveMap = new Map<string, (typeof currentSlotList)[number]>()
  for (const slot of currentSlotList) {
    // Custom slots (no template) are not managed by regeneration — skip them
    if (!slot.slot_template_id) continue
    const key = slotKey(slot.slot_template_id, slot.person_id)
    if (slot.is_active) {
      currentActiveMap.set(key, slot)
    } else {
      currentInactiveMap.set(key, slot)
    }
  }

  // 7. Diff: find added, obsolete, reactivated, unchanged
  //    Track new REQUIRED slot names separately for gating-impact detection (step 10).
  const newRequiredSlotNames: string[] = []

  // 7a. Expected slots not in current active set → INSERT or REACTIVATE
  for (const [key, expected] of expectedMap) {
    if (currentActiveMap.has(key)) {
      // Already active — unchanged
      result.unchanged++
    } else if (currentInactiveMap.has(key)) {
      // Exists but inactive — reactivate
      const existing = currentInactiveMap.get(key)!
      await supabase
        .from('document_slots')
        .update({ is_active: true, deactivated_at: null })
        .eq('id', existing.id)

      result.reactivated.push({
        slotName: expected.slotName,
        personRole: expected.personRole,
      })
      if (expected.isRequired) newRequiredSlotNames.push(expected.slotName)
    } else {
      // New — insert
      await supabase.from('document_slots').insert({
        tenant_id: tenantId,
        matter_id: matterId,
        person_id: expected.personId,
        slot_template_id: expected.templateId,
        slot_name: expected.slotName,
        slot_slug: expected.slotSlug,
        description: expected.description,
        category: expected.category,
        person_role: expected.personRole,
        is_required: expected.isRequired,
        accepted_file_types: expected.acceptedFileTypes,
        max_file_size_bytes: expected.maxFileSizeBytes,
        sort_order: expected.sortOrder,
        status: 'empty',
        current_version: 0,
        is_active: true,
      })

      result.added.push({
        slotName: expected.slotName,
        personRole: expected.personRole,
      })
      if (expected.isRequired) newRequiredSlotNames.push(expected.slotName)
    }
  }

  // 7b. Current active slots not in expected set → soft-deactivate
  for (const [key, existing] of currentActiveMap) {
    if (!expectedMap.has(key)) {
      await supabase
        .from('document_slots')
        .update({
          is_active: false,
          deactivated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)

      result.removed.push({
        slotName: existing.slot_name,
        personRole: existing.person_role,
      })
    }
  }

  // 8. Log changes to activities table (only if something changed)
  const hasChanges =
    result.added.length > 0 ||
    result.removed.length > 0 ||
    result.reactivated.length > 0

  if (hasChanges) {
    const addedCount = result.added.length + result.reactivated.length
    const removedCount = result.removed.length

    const descriptionParts: string[] = []
    if (addedCount > 0) {
      descriptionParts.push(`${addedCount} new document(s) required`)
    }
    if (removedCount > 0) {
      descriptionParts.push(`${removedCount} requirement(s) removed`)
    }

    await supabase.from('activities').insert({
      tenant_id: tenantId,
      matter_id: matterId,
      activity_type: 'document_slots_changed',
      title: 'Document requirements updated',
      description: descriptionParts.join(', '),
      entity_type: 'matter',
      entity_id: matterId,
      metadata: {
        added: result.added,
        removed: result.removed,
        reactivated: result.reactivated,
        unchanged: result.unchanged,
      } as unknown as Json,
    })
  }

  // 9. Client notification for new requirements
  //    If auto_send_document_request is enabled on the matter type, use the
  //    formal document request service (creates audit trail + starts reminder
  //    clock). Otherwise, send the generic email notification as before.
  const newSlots = [...result.added, ...result.reactivated]
  if (newSlots.length > 0) {
    try {
      // Check auto_send_document_request setting
      let autoSend = false
      const mtId = matterTypeId ?? caseTypeId
      if (mtId) {
        const { data: mt } = await supabase
          .from('matter_types')
          .select('auto_send_document_request')
          .eq('id', mtId)
          .single()
        autoSend = mt?.auto_send_document_request ?? false
      }

      if (autoSend) {
        // Use formal document request service (creates document_requests row,
        // ensures portal link, sends structured email, logs activity)
        // Look up the actual slot IDs for newly added/reactivated slots
        const newSlotNames = newSlots.map((s) => s.slotName)
        const { data: resolvedSlots } = await supabase
          .from('document_slots')
          .select('id')
          .eq('matter_id', matterId)
          .eq('is_active', true)
          .eq('is_required', true)
          .in('slot_name', newSlotNames)

        const newSlotIds = (resolvedSlots ?? []).map((s) => s.id)
        if (newSlotIds.length > 0) {
          await sendDocumentRequest({
            supabase,
            tenantId,
            matterId,
            slotIds: newSlotIds,
            requestedBy: 'system',
            message: 'Your case requirements have been updated. Please upload the following documents.',
          })
        }
      } else {
        // Fallback: generic email notification (no audit trail / no reminder clock)
        const { data: primaryClient } = await supabase
          .from('matter_contacts')
          .select('contact_id')
          .eq('matter_id', matterId)
          .eq('role', 'client')
          .limit(1)
          .maybeSingle()

        if (primaryClient?.contact_id) {
          await sendClientEmail({
            supabase,
            tenantId,
            matterId,
            contactId: primaryClient.contact_id,
            notificationType: 'document_request',
            templateData: {
              document_names: newSlots.map((s) => s.slotName),
              message:
                'Your case requirements have been updated. Please upload the following documents.',
            },
          })
        }
      }
    } catch (err) {
      // Non-blocking — notification failure should not fail regeneration
      console.error('[document-slot-engine] Failed to send notification:', err)
    }
  }

  // 10. Gating-impact detection: when new required slots appear on a matter
  //     that is already past early stages, log an explicit "advancement blocked"
  //     activity and notify the responsible lawyer. This implements the policy:
  //     new required slots → block forward advancement until accepted (option A).
  //     No auto-regression. No override without a new upload + acceptance cycle.
  if (newRequiredSlotNames.length > 0) {
    try {
      // Determine if matter is past early stages (sort_order >= 2)
      // Check generic pipeline first, then immigration
      let isPastEarlyStage = false
      let currentStageName: string | null = null

      const { data: stageState } = await supabase
        .from('matter_stage_state')
        .select('current_stage_id')
        .eq('matter_id', matterId)
        .limit(1)
        .maybeSingle()

      if (stageState?.current_stage_id) {
        const { data: stage } = await supabase
          .from('matter_stages')
          .select('sort_order, name')
          .eq('id', stageState.current_stage_id)
          .single()

        if (stage && stage.sort_order >= 2) {
          isPastEarlyStage = true
          currentStageName = stage.name
        }
      } else {
        // Check immigration stages
        const { data: immState } = await supabase
          .from('matter_immigration')
          .select('current_stage_id')
          .eq('matter_id', matterId)
          .maybeSingle()

        if (immState?.current_stage_id) {
          const { data: immStage } = await supabase
            .from('case_stage_definitions')
            .select('sort_order, name')
            .eq('id', immState.current_stage_id)
            .single()

          if (immStage && immStage.sort_order >= 2) {
            isPastEarlyStage = true
            currentStageName = immStage.name
          }
        }
      }

      if (isPastEarlyStage) {
        const slotNames = newRequiredSlotNames

        // 10a. Log explicit gating-impact activity
        await supabase.from('activities').insert({
          tenant_id: tenantId,
          matter_id: matterId,
          activity_type: 'document_slots_advancement_blocked',
          title: 'Stage advancement blocked — new documents required',
          description: `${slotNames.length} new required document(s) added while matter is in "${currentStageName}". ` +
            `Forward advancement is blocked until all required documents are accepted. ` +
            `New requirements: ${slotNames.join(', ')}`,
          entity_type: 'matter',
          entity_id: matterId,
          metadata: {
            current_stage: currentStageName,
            new_required_slots: slotNames,
            policy: 'block_advancement_until_accepted',
          } as unknown as Json,
        })

        // 10b. Notify responsible lawyer via in-app notification
        const { data: matter } = await supabase
          .from('matters')
          .select('responsible_lawyer_id, title')
          .eq('id', matterId)
          .single()

        if (matter?.responsible_lawyer_id) {
          await supabase.from('notifications').insert({
            tenant_id: tenantId,
            user_id: matter.responsible_lawyer_id,
            title: `New documents required: ${matter.title}`,
            message: `${slotNames.length} new required document(s) have been added to "${matter.title}" ` +
              `while in stage "${currentStageName}". Stage advancement is blocked until these documents are accepted: ` +
              `${slotNames.join(', ')}`,
            notification_type: 'document_slots_advancement_blocked',
            entity_type: 'matter',
            entity_id: matterId,
            channels: ['in_app'],
            priority: 'high',
          })
        }
      }
    } catch (err) {
      // Non-blocking — gating impact detection failure should not fail regeneration
      console.error('[document-slot-engine] Gating impact detection error:', err)
    }
  }

  return result
}

// ─── Public API: buildAutoRenamedPath ───────────────────────────────────────────

/**
 * Build an auto-renamed file path and display name for a versioned upload.
 *
 * Convention: {matter_number}_{slot_slug}_{person_role}_{YYYY-MM-DD}_v{N}.{ext}
 * Example:    MAT-001_passport_principal_applicant_2026-03-01_v1.pdf
 *
 * Storage path: {tenantId}/{fileName} (maintains existing bucket folder structure)
 */
export function buildAutoRenamedPath(params: {
  tenantId: string
  matterNumber: string | null
  slotSlug: string
  personRole: string | null
  versionNumber: number
  originalExtension: string
}): { storagePath: string; fileName: string } {
  const { tenantId, matterNumber, slotSlug, personRole, versionNumber, originalExtension } = params

  const parts: string[] = []

  // Matter number (fallback to 'MATTER' if not set)
  parts.push(matterNumber ?? 'MATTER')

  // Slot slug
  parts.push(slotSlug)

  // Person role (omit if null / matter-level)
  if (personRole) {
    parts.push(personRole)
  }

  // Date (YYYY-MM-DD)
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  parts.push(`${yyyy}-${mm}-${dd}`)

  // Version
  parts.push(`v${versionNumber}`)

  const ext = originalExtension.startsWith('.') ? originalExtension.slice(1) : originalExtension
  const fileName = `${parts.join('_')}.${ext}`
  const storagePath = `${tenantId}/${fileName}`

  return { storagePath, fileName }
}
