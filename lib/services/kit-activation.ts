import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { processAutomationTrigger } from './automation-engine'
import { generateDocumentSlots } from './document-slot-engine'
import { generateMatterFolders, assignSlotsToFolders } from './folder-engine'
import { generateFormInstances } from './form-instance-engine'

type Json = Database['public']['Tables']['activities']['Insert']['metadata']

interface WorkflowKitParams {
  supabase: SupabaseClient<Database>
  tenantId: string
  matterId: string
  matterTypeId: string
  userId: string
  // Optional: user's explicit pipeline/stage selection from the matter form.
  // If provided, these override the default pipeline / first-stage auto-selection.
  initialPipelineId?: string
  initialStageId?: string
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
  const { supabase, tenantId, matterId, matterTypeId, userId, initialPipelineId, initialStageId } = params

  // 1. Determine pipeline — prefer the user's explicit selection, then workflow default, then matter type default
  let pipelineId: string | null = initialPipelineId ?? null
  let workflowTemplate: { task_template_id?: string | null; stage_pipeline_id?: string | null } | null = null

  if (!pipelineId) {
    // Check workflow template for a pipeline
    const { data: workflow } = await supabase
      .from('workflow_templates')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('matter_type_id', matterTypeId)
      .eq('is_default', true)
      .eq('is_active', true)
      .maybeSingle()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    workflowTemplate = workflow as any
    pipelineId = (workflow as any)?.stage_pipeline_id ?? null
  }

  if (!pipelineId) {
    // Fall back to the matter type's default pipeline
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

  // 2. Determine initial stage — prefer user's explicit selection, then first stage in pipeline
  if (pipelineId) {
    let stageId: string | null = initialStageId ?? null

    if (!stageId) {
      const { data: firstStage } = await supabase
        .from('matter_stages')
        .select('id')
        .eq('pipeline_id', pipelineId)
        .order('sort_order', { ascending: true })
        .limit(1)
        .maybeSingle()

      stageId = firstStage?.id ?? null
    }

    if (stageId) {
      // Fetch stage name for history record
      const { data: stageRow } = await supabase
        .from('matter_stages')
        .select('name')
        .eq('id', stageId)
        .maybeSingle()

      await supabase.from('matter_stage_state').insert({
        tenant_id: tenantId,
        matter_id: matterId,
        pipeline_id: pipelineId,
        current_stage_id: stageId,
        entered_at: new Date().toISOString(),
        stage_history: [
          {
            stage_id: stageId,
            stage_name: stageRow?.name ?? 'Initial Stage',
            entered_at: new Date().toISOString(),
            user_id: userId,
          },
        ] as unknown as Database['public']['Tables']['matter_stage_state']['Insert']['stage_history'],
      })
    }
  }

  // 4. Apply task template if configured
  if (workflowTemplate?.task_template_id) {
    const { data: templateItems } = await supabase
      .from('task_template_items')
      .select('*')
      .eq('template_id', workflowTemplate.task_template_id)
      .order('sort_order')

    if (templateItems && templateItems.length > 0) {
      const taskInserts = templateItems.map((item) => {
        const dueDate = new Date()
        if (item.days_offset) {
          dueDate.setDate(dueDate.getDate() + item.days_offset)
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

  // 5. Run independent generation engines in parallel (document slots, forms, folders)
  const [docSlotsResult] = await Promise.allSettled([
    generateDocumentSlots({ supabase, tenantId, matterId, matterTypeId }).catch((err) => {
      console.error('[kit-activation] Failed to generate document slots:', err)
    }),
    generateFormInstances({ supabase, tenantId, matterId, matterTypeId }).catch((err) => {
      console.error('[kit-activation] Failed to generate form instances:', err)
    }),
  ])

  // 5b. Folders depend on document slots being created first (for assignment)
  try {
    await generateMatterFolders({ supabase, tenantId, matterId, matterTypeId })
    await assignSlotsToFolders({ supabase, tenantId, matterId, matterTypeId })
  } catch (err) {
    console.error('[kit-activation] Failed to generate folders:', err)
  }

  // 6. Fire-and-forget: OneDrive sync + intake task + automations + activity log (all non-fatal)
  const fireAndForget = async () => {
    // OneDrive sync
    try {
      const { createServiceRoleClient } = await import('@/lib/supabase/server')
      const adminClient = createServiceRoleClient()
      const { data: conn } = await adminClient
        .from('microsoft_connections')
        .select('id, onedrive_enabled')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle()

      if (conn?.onedrive_enabled) {
        const { data: matterInfo } = await supabase
          .from('matters')
          .select('matter_number, title')
          .eq('id', matterId)
          .single()

        if (matterInfo) {
          const { ensureMatterSubfolder, syncMatterFoldersToOneDrive } =
            await import('./microsoft-onedrive')
          const matterFolder = await ensureMatterSubfolder(conn.id, adminClient, {
            matterId,
            matterNumber: matterInfo.matter_number,
            matterTitle: matterInfo.title,
          })
          await syncMatterFoldersToOneDrive(conn.id, adminClient, {
            matterId,
            matterOneDriveFolderId: matterFolder.folderId,
          })
        }
      }
    } catch (err) {
      console.warn('[kit-activation] OneDrive folder sync failed (non-fatal):', err)
    }

    // Intake task creation
    try {
      const { data: streamForms } = await supabase
        .from('ircc_stream_forms')
        .select('form_id')
        .eq('matter_type_id', matterTypeId)

      if (streamForms && streamForms.length > 0) {
        const formIds = (streamForms as Array<{ form_id: string }>).map((sf) => sf.form_id)
        const { count: mappedFieldCount } = await supabase
          .from('ircc_form_fields')
          .select('id', { count: 'exact', head: true })
          .eq('is_mapped', true)
          .in('form_id', formIds)

        if (mappedFieldCount && mappedFieldCount > 0) {
          const dueDate = new Date()
          dueDate.setDate(dueDate.getDate() + 7)
          await supabase.from('tasks').insert({
            tenant_id: tenantId,
            matter_id: matterId,
            title: 'Complete client intake questionnaire',
            description: 'Open the IRCC Intake sheet on this matter and complete all required intake questions with the client.',
            priority: 'high',
            due_date: dueDate.toISOString().split('T')[0],
            status: 'not_started',
            created_by: userId,
            created_via: 'template' as any,
          })
        }
      }
    } catch (err) {
      console.error('[kit-activation] Failed to create intake task:', err)
    }

    // Automations + activity log
    await processAutomationTrigger({
      supabase, tenantId, matterId,
      triggerType: 'matter_created',
      triggerContext: { matter_type_id: matterTypeId },
      userId,
    })

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

  // Don't await — let it run after response is sent
  fireAndForget().catch((err) => console.error('[kit-activation] Background tasks error:', err))
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

  // 3. Run independent generation engines in parallel
  // Resolve matter_type_id for folder generation (immigration uses caseTypeId)
  const { data: matterData } = await supabase
    .from('matters')
    .select('matter_type_id')
    .eq('id', matterId)
    .single()
  const resolvedMatterTypeId = matterData?.matter_type_id ?? null

  await Promise.allSettled([
    generateDocumentSlots({ supabase, tenantId, matterId, caseTypeId }).catch((err) => {
      console.error('[kit-activation] Failed to generate document slots:', err)
    }),
    generateFormInstances({ supabase, tenantId, matterId, caseTypeId }).catch((err) => {
      console.error('[kit-activation] Failed to generate form instances:', err)
    }),
  ])

  // 3b. Folders depend on doc slots (for assignment)
  if (resolvedMatterTypeId) {
    try {
      await generateMatterFolders({ supabase, tenantId, matterId, matterTypeId: resolvedMatterTypeId })
      await assignSlotsToFolders({ supabase, tenantId, matterId, matterTypeId: resolvedMatterTypeId })
    } catch (err) {
      console.error('[kit-activation] Failed to generate folders:', err)
    }
  }

  // 4. Fire-and-forget: OneDrive sync + intake task + automations + activity log
  const fireAndForget = async () => {
    // OneDrive sync
    try {
      const { createServiceRoleClient } = await import('@/lib/supabase/server')
      const adminClient = createServiceRoleClient()
      const { data: conn } = await adminClient
        .from('microsoft_connections')
        .select('id, onedrive_enabled')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle()

      if (conn?.onedrive_enabled) {
        const { data: matterInfo } = await supabase
          .from('matters')
          .select('matter_number, title')
          .eq('id', matterId)
          .single()

        if (matterInfo) {
          const { ensureMatterSubfolder, syncMatterFoldersToOneDrive } =
            await import('./microsoft-onedrive')
          const matterFolder = await ensureMatterSubfolder(conn.id, adminClient, {
            matterId,
            matterNumber: matterInfo.matter_number,
            matterTitle: matterInfo.title,
          })
          await syncMatterFoldersToOneDrive(conn.id, adminClient, {
            matterId,
            matterOneDriveFolderId: matterFolder.folderId,
          })
        }
      }
    } catch (err) {
      console.warn('[kit-activation] OneDrive folder sync failed (non-fatal):', err)
    }

    // Intake task
    try {
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + 7)
      await supabase.from('tasks').insert({
        tenant_id: tenantId,
        matter_id: matterId,
        title: 'Complete client intake questionnaire',
        description: 'Open the IRCC Intake sheet on this matter and complete all required immigration intake questions with the client.',
        priority: 'high',
        due_date: dueDate.toISOString().split('T')[0],
        status: 'not_started',
        created_by: userId,
        created_via: 'template' as any,
      })
    } catch (err) {
      console.error('[kit-activation] Failed to create intake task:', err)
    }

    // Automations + activity log
    await processAutomationTrigger({
      supabase, tenantId, matterId,
      triggerType: 'matter_created',
      triggerContext: { case_type_id: caseTypeId },
      userId,
    })

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

  // Don't await — let it run after response is sent
  fireAndForget().catch((err) => console.error('[kit-activation] Background tasks error:', err))
}
