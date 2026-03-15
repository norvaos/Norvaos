import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { processAutomationTrigger } from './automation-engine'

type Json = Database['public']['Tables']['activities']['Insert']['metadata']

// ─── Types ──────────────────────────────────────────────────────────────────

interface PostSubmissionDocType {
  id: string
  key: string
  label: string
  stage_change_target: string | null
  creates_deadline: boolean
  deadline_days: number | null
  creates_task: boolean
  task_template_id: string | null
  triggers_communication: boolean
  communication_template_id: string | null
  is_active: boolean
  sort_order: number
}

interface ClassifyResult {
  success: boolean
  error?: string
  outcomeEventId?: string
  actionsTriggered?: string[]
}

// ─── Get Post-Submission Document Types ─────────────────────────────────────

/**
 * Returns the available post-submission document types for a tenant.
 * Seeds defaults if none exist yet.
 */
export async function getPostSubmissionDocTypes(
  supabase: SupabaseClient<Database>,
  tenantId: string
): Promise<PostSubmissionDocType[]> {
  // Check if types exist for this tenant
  const { data: existing } = await supabase
    .from('post_submission_document_types')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('sort_order')

  if (existing && existing.length > 0) {
    return existing as unknown as PostSubmissionDocType[]
  }

  // Seed defaults via DB function
  await supabase.rpc('seed_post_submission_doc_types', { p_tenant_id: tenantId })

  // Re-fetch after seeding
  const { data: seeded } = await supabase
    .from('post_submission_document_types')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('sort_order')

  return (seeded ?? []) as unknown as PostSubmissionDocType[]
}

// ─── Classify Post-Submission Document ──────────────────────────────────────

/**
 * Classify a document received after application submission.
 * Looks up the document type config and triggers configured actions:
 *   - Stage change (if stage_change_target is set)
 *   - Deadline creation (if creates_deadline with deadline_days)
 *   - Task creation (if creates_task)
 *   - Communication draft (if triggers_communication)
 *   - Creates a matter_outcome_events record
 */
export async function classifyPostSubmissionDocument(
  supabase: SupabaseClient<Database>,
  matterId: string,
  documentId: string | null,
  typeKey: string,
  userId: string
): Promise<ClassifyResult> {
  // 1. Fetch the matter to get tenant context
  const { data: matter, error: matterErr } = await supabase
    .from('matters')
    .select('id, tenant_id, title')
    .eq('id', matterId)
    .single()

  if (matterErr || !matter) {
    return { success: false, error: 'Matter not found' }
  }

  const tenantId = matter.tenant_id

  // 2. Fetch the document type config
  const { data: docType, error: docTypeErr } = await supabase
    .from('post_submission_document_types')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('key', typeKey)
    .eq('is_active', true)
    .single()

  if (docTypeErr || !docType) {
    return { success: false, error: `Unknown document type: ${typeKey}` }
  }

  const config = docType as unknown as PostSubmissionDocType
  const actionsTriggered: string[] = []

  // 3. Create outcome event record
  const { data: outcomeEvent, error: outcomeErr } = await supabase
    .from('matter_outcome_events')
    .insert({
      tenant_id: tenantId,
      matter_id: matterId,
      event_type: mapKeyToEventType(typeKey),
      document_id: documentId,
      outcome_data: { type_key: typeKey, classified_at: new Date().toISOString() },
      created_by: userId,
    })
    .select('id')
    .single()

  if (outcomeErr) {
    return { success: false, error: `Failed to create outcome event: ${outcomeErr.message}` }
  }

  actionsTriggered.push('outcome_event_created')

  // 4. Stage change (if configured)
  if (config.stage_change_target) {
    try {
      // Find the target stage by name in the matter's pipeline
      const { data: immRecord } = await supabase
        .from('matter_immigration')
        .select('case_type_id')
        .eq('matter_id', matterId)
        .maybeSingle()

      if (immRecord?.case_type_id) {
        const { data: targetStage } = await supabase
          .from('case_stage_definitions')
          .select('id')
          .eq('case_type_id', immRecord.case_type_id)
          .eq('name', config.stage_change_target)
          .maybeSingle()

        if (targetStage) {
          // Delegate to the stage engine via automation trigger
          await processAutomationTrigger({
            supabase,
            tenantId,
            matterId,
            triggerType: 'stage_change',
            triggerContext: {
              to_stage_name: config.stage_change_target,
              triggered_by: 'post_submission_classification',
              document_type: typeKey,
            },
            userId,
          })
          actionsTriggered.push(`stage_change:${config.stage_change_target}`)
        }
      }
    } catch {
      // Stage change failure is non-blocking
    }
  }

  // 5. Deadline creation (if configured)
  if (config.creates_deadline && config.deadline_days) {
    try {
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + config.deadline_days)

      await supabase.from('matter_deadlines').insert({
        tenant_id: tenantId,
        matter_id: matterId,
        deadline_type: 'post_submission',
        title: `${config.label} — Deadline`,
        due_date: dueDate.toISOString().split('T')[0],
        status: 'upcoming',
        priority: config.deadline_days <= 14 ? 'high' : 'medium',
        auto_generated: true,
        source_field: `lifecycle:${typeKey}`,
      })
      actionsTriggered.push(`deadline_created:${config.deadline_days}d`)
    } catch {
      // Deadline creation failure is non-blocking
    }
  }

  // 6. Task creation (if configured)
  if (config.creates_task) {
    try {
      const taskTitle = `Follow up: ${config.label}`

      // Idempotency check
      const { data: existingTask } = await supabase
        .from('tasks')
        .select('id')
        .eq('matter_id', matterId)
        .eq('title', taskTitle)
        .eq('created_via', 'automation')
        .limit(1)

      if (!existingTask || existingTask.length === 0) {
        const dueDate = new Date()
        dueDate.setDate(dueDate.getDate() + (config.deadline_days ?? 7))

        await supabase.from('tasks').insert({
          tenant_id: tenantId,
          matter_id: matterId,
          title: taskTitle,
          description: `Auto-created from post-submission document classification: ${config.label}`,
          priority: 'high',
          due_date: dueDate.toISOString().split('T')[0],
          created_by: userId,
          created_via: 'automation',
          status: 'not_started',
        })
        actionsTriggered.push('task_created')
      }
    } catch {
      // Task creation failure is non-blocking
    }
  }

  // 7. Communication trigger (if configured)
  if (config.triggers_communication) {
    actionsTriggered.push('communication_draft_triggered')
    // Communication drafting is handled by the communication engine
    // We just log the intent here for the UI to pick up
  }

  // 8. Log activity
  await supabase.from('activities').insert({
    tenant_id: tenantId,
    matter_id: matterId,
    activity_type: 'post_submission_classified',
    title: `Document classified: ${config.label}`,
    description: `Post-submission document classified as "${config.label}". Actions: ${actionsTriggered.join(', ')}`,
    entity_type: 'matter',
    entity_id: matterId,
    user_id: userId,
    metadata: {
      document_type_key: typeKey,
      document_id: documentId,
      outcome_event_id: outcomeEvent.id,
      actions_triggered: actionsTriggered,
    } as Json,
  })

  return {
    success: true,
    outcomeEventId: outcomeEvent.id,
    actionsTriggered,
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Maps a document type key to the outcome event_type enum.
 */
function mapKeyToEventType(key: string): string {
  const mapping: Record<string, string> = {
    acknowledgement: 'acknowledgement',
    biometric_instruction: 'biometric',
    medical_request: 'medical',
    passport_request: 'passport_request',
    adr: 'pfl', // ADR is a form of procedural fairness
    pfl: 'pfl',
    generic_ircc: 'acknowledgement',
    approval: 'approval',
    refusal: 'refusal',
    withdrawal: 'withdrawal',
    return_notice: 'return',
    hearing_notice: 'pfl',
  }
  return mapping[key] ?? 'acknowledgement'
}
