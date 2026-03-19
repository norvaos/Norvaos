import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

interface PipelineResolution {
  pipelineId: string
  stageId: string
}

/**
 * Resolve the default pipeline and its first stage for a tenant.
 *
 * Resolution order:
 * 1. Try default pipeline (is_default=true)
 * 2. Fallback to any active pipeline
 * 3. Auto-create "Default Pipeline" with 5 stages if none exists
 * 4. Get first stage by sort_order
 *
 * Throws if pipeline setup fails entirely.
 */
export async function resolveDefaultPipelineAndStage(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<PipelineResolution> {
  let pipelineId: string | null = null
  let stageId: string | null = null

  // 1. Try default pipeline
  const { data: defaultPipeline } = await supabase
    .from('pipelines')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('is_default', true)
    .limit(1)
    .maybeSingle()

  if (defaultPipeline) {
    pipelineId = defaultPipeline.id
  } else {
    // 2. Fallback: any active pipeline
    const { data: anyPipeline } = await supabase
      .from('pipelines')
      .select('id')
      .eq('tenant_id', tenantId)
      .limit(1)
      .maybeSingle()

    if (anyPipeline) {
      pipelineId = anyPipeline.id
    }
  }

  // 3. Auto-create if none exists — full 14-stage Core Intake & Retainer Pipeline
  if (!pipelineId) {
    const { data: newPipeline } = await supabase
      .from('pipelines')
      .insert({
        tenant_id: tenantId,
        name: 'Core Intake & Retainer Pipeline',
        is_default: true,
      })
      .select('id')
      .single()

    if (newPipeline) {
      pipelineId = newPipeline.id
      const defaultStages = [
        { name: 'New Inquiry',                         sort_order: 1,  win_probability: 5,   color: '#94a3b8', rotting_days: 1,    is_win_stage: false, is_lost_stage: false },
        { name: 'Contacted',                           sort_order: 2,  win_probability: 15,  color: '#60a5fa', rotting_days: 3,    is_win_stage: false, is_lost_stage: false },
        { name: 'Appointment Booked',                  sort_order: 3,  win_probability: 32,  color: '#818cf8', rotting_days: 5,    is_win_stage: false, is_lost_stage: false },
        { name: 'No-Show',                             sort_order: 4,  win_probability: 10,  color: '#fb923c', rotting_days: 2,    is_win_stage: false, is_lost_stage: false },
        { name: 'Appointment Completed',               sort_order: 5,  win_probability: 52,  color: '#3b82f6', rotting_days: 5,    is_win_stage: false, is_lost_stage: false },
        { name: 'Retainer Sent',                       sort_order: 6,  win_probability: 70,  color: '#f59e0b', rotting_days: 4,    is_win_stage: false, is_lost_stage: false },
        { name: 'Follow-Up Active',                    sort_order: 7,  win_probability: 42,  color: '#eab308', rotting_days: 7,    is_win_stage: false, is_lost_stage: false },
        { name: 'Retainer Signed – Payment Pending',   sort_order: 8,  win_probability: 88,  color: '#7c3aed', rotting_days: 3,    is_win_stage: false, is_lost_stage: false },
        { name: 'Retained – Active Matter',            sort_order: 9,  win_probability: 100, color: '#22c55e', rotting_days: null, is_win_stage: true,  is_lost_stage: false },
        { name: 'Closed – No Response',                sort_order: 10, win_probability: 0,   color: '#9ca3af', rotting_days: null, is_win_stage: false, is_lost_stage: true  },
        { name: 'Closed – Retainer Not Signed',        sort_order: 11, win_probability: 0,   color: '#f87171', rotting_days: null, is_win_stage: false, is_lost_stage: true  },
        { name: 'Closed – Client Declined',            sort_order: 12, win_probability: 0,   color: '#ef4444', rotting_days: null, is_win_stage: false, is_lost_stage: true  },
        { name: 'Closed – Not a Fit',                  sort_order: 13, win_probability: 0,   color: '#dc2626', rotting_days: null, is_win_stage: false, is_lost_stage: true  },
        { name: 'Closed – Matter Completed – Small',   sort_order: 14, win_probability: 100, color: '#10b981', rotting_days: null, is_win_stage: true,  is_lost_stage: false },
      ]
      for (const stage of defaultStages) {
        const { data: createdStage } = await supabase
          .from('pipeline_stages')
          .insert({ ...stage, pipeline_id: pipelineId, tenant_id: tenantId })
          .select('id')
          .single()

        if (stage.sort_order === 1 && createdStage) {
          stageId = createdStage.id
        }
      }
    }
  }

  // 4. Get first stage if not already resolved
  if (!stageId && pipelineId) {
    const { data: firstStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('pipeline_id', pipelineId)
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle()

    stageId = firstStage?.id ?? null
  }

  if (!pipelineId || !stageId) {
    throw new Error('Could not resolve default pipeline. Please contact admin to configure pipelines.')
  }

  return { pipelineId, stageId }
}
