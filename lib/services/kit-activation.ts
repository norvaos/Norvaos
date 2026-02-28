import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { processAutomationTrigger } from './automation-engine'

type Json = Database['public']['Tables']['activities']['Insert']['metadata']

interface WorkflowKitParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  matterId: string
  matterTypeId: string
  userId: string
}

interface ImmigrationKitParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  matterId: string
  caseTypeId: string
  userId: string
}

/**
 * Activate a workflow kit for a generic (non-immigration) matter.
 * Looks up the default workflow_template for the matter type, then:
 * - Sets the initial stage from the default pipeline
 * - Applies task template if configured
 * - Triggers matter_created automations
 */
export async function activateWorkflowKit(params: WorkflowKitParams): Promise<void> {
  const { supabase, tenantId, matterId, matterTypeId, userId } = params

  // 1. Look up default workflow template
  const { data: workflow } = await supabase
    .from('workflow_templates')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('matter_type_id', matterTypeId)
    .eq('is_default', true)
    .eq('is_active', true)
    .maybeSingle()

  // 2. If no workflow, try to find the default pipeline directly
  let pipelineId: string | null = workflow?.stage_pipeline_id ?? null

  if (!pipelineId) {
    const { data: defaultPipeline } = await supabase
      .from('matter_stage_pipelines')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('matter_type_id', matterTypeId)
      .eq('is_default', true)
      .eq('is_active', true)
      .maybeSingle()

    pipelineId = defaultPipeline?.id ?? null
  }

  // 3. Set initial stage if pipeline found
  if (pipelineId) {
    const { data: firstStage } = await supabase
      .from('matter_stages')
      .select('id')
      .eq('pipeline_id', pipelineId)
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (firstStage) {
      await supabase.from('matter_stage_state').insert({
        tenant_id: tenantId,
        matter_id: matterId,
        pipeline_id: pipelineId,
        current_stage_id: firstStage.id,
        entered_at: new Date().toISOString(),
        stage_history: [
          {
            stage_id: firstStage.id,
            stage_name: 'Initial Stage',
            entered_at: new Date().toISOString(),
            user_id: userId,
          },
        ] as unknown as Database['public']['Tables']['matter_stage_state']['Insert']['stage_history'],
      })
    }
  }

  // 4. Apply task template if configured
  if (workflow?.task_template_id) {
    const { data: templateItems } = await supabase
      .from('task_template_items')
      .select('*')
      .eq('template_id', workflow.task_template_id)
      .order('sort_order')

    if (templateItems && templateItems.length > 0) {
      const taskInserts = templateItems.map((item) => {
        const dueDate = new Date()
        if (item.due_days_offset) {
          dueDate.setDate(dueDate.getDate() + item.due_days_offset)
        }

        return {
          tenant_id: tenantId,
          matter_id: matterId,
          title: item.title,
          description: item.description ?? null,
          priority: item.priority ?? 'medium',
          due_date: dueDate.toISOString().split('T')[0],
          created_by: userId,
          created_via: 'template' as const,
          status: 'not_started',
        }
      })

      await supabase.from('tasks').insert(taskInserts)
    }
  }

  // 5. Trigger matter_created automations
  await processAutomationTrigger({
    supabase,
    tenantId,
    matterId,
    triggerType: 'matter_created',
    triggerContext: { matter_type_id: matterTypeId },
    userId,
  })

  // 6. Log activity
  await supabase.from('activities').insert({
    tenant_id: tenantId,
    matter_id: matterId,
    activity_type: 'kit_activated',
    title: 'Workflow kit activated',
    description: 'Stage pipeline and task templates applied',
    entity_type: 'matter',
    entity_id: matterId,
    user_id: userId,
    metadata: { matter_type_id: matterTypeId, pipeline_id: pipelineId } as Json,
  })
}

/**
 * Activate the immigration kit for a new immigration matter.
 * Initializes checklist items from templates, sets initial stage, and creates deadlines.
 */
export async function activateImmigrationKit(params: ImmigrationKitParams): Promise<void> {
  const { supabase, tenantId, matterId, caseTypeId, userId } = params

  // 1. Initialize checklist items from templates
  const { data: templates } = await supabase
    .from('checklist_templates')
    .select('*')
    .eq('case_type_id', caseTypeId)
    .order('sort_order')

  if (templates && templates.length > 0) {
    // Check if checklist already initialized
    const { data: existing } = await supabase
      .from('matter_checklist_items')
      .select('id')
      .eq('matter_id', matterId)
      .limit(1)

    if (!existing || existing.length === 0) {
      const checklistInserts = templates.map((t) => ({
        tenant_id: tenantId,
        matter_id: matterId,
        checklist_template_id: t.id,
        document_name: t.document_name,
        description: t.description,
        category: t.category,
        is_required: t.is_required,
        status: 'missing',
        sort_order: t.sort_order,
      }))

      await supabase.from('matter_checklist_items').insert(checklistInserts)
    }
  }

  // 2. Set initial stage
  const { data: firstStage } = await supabase
    .from('case_stage_definitions')
    .select('id, name')
    .eq('case_type_id', caseTypeId)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (firstStage) {
    // Check if matter_immigration already has a stage set
    const { data: matterImm } = await supabase
      .from('matter_immigration')
      .select('current_stage_id')
      .eq('matter_id', matterId)
      .maybeSingle()

    if (matterImm && !matterImm.current_stage_id) {
      await supabase
        .from('matter_immigration')
        .update({
          current_stage_id: firstStage.id,
          stage_entered_at: new Date().toISOString(),
          stage_history: [
            {
              stage_id: firstStage.id,
              stage_name: firstStage.name,
              entered_at: new Date().toISOString(),
              entered_by: userId,
            },
          ] as unknown as Database['public']['Tables']['matter_immigration']['Update']['stage_history'],
        })
        .eq('matter_id', matterId)
    }
  }

  // 3. Trigger matter_created automations
  await processAutomationTrigger({
    supabase,
    tenantId,
    matterId,
    triggerType: 'matter_created',
    triggerContext: { case_type_id: caseTypeId },
    userId,
  })

  // 4. Log activity
  await supabase.from('activities').insert({
    tenant_id: tenantId,
    matter_id: matterId,
    activity_type: 'kit_activated',
    title: 'Immigration kit activated',
    description: 'Checklist templates and initial stage applied',
    entity_type: 'matter',
    entity_id: matterId,
    user_id: userId,
    metadata: { case_type_id: caseTypeId } as Json,
  })
}
