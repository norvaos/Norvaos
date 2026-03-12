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

  // 3. Auto-create if none exists
  if (!pipelineId) {
    const { data: newPipeline } = await supabase
      .from('pipelines')
      .insert({
        tenant_id: tenantId,
        name: 'Default Pipeline',
        is_default: true,
      })
      .select('id')
      .single()

    if (newPipeline) {
      pipelineId = newPipeline.id
      const defaultStages = ['New Lead', 'Contacted', 'Consultation', 'Retained', 'Closed']
      for (let i = 0; i < defaultStages.length; i++) {
        const { data: createdStage } = await supabase
          .from('pipeline_stages')
          .insert({
            pipeline_id: pipelineId,
            name: defaultStages[i],
            sort_order: i,
            tenant_id: tenantId,
          })
          .select('id')
          .single()

        if (i === 0 && createdStage) {
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
