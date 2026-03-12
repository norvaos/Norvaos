import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { ghlFetch } from '../client'

interface GhlPipelineStage {
  id: string
  name?: string
  position?: number
}

interface GhlPipeline {
  id: string
  name?: string
  stages?: GhlPipelineStage[]
  locationId?: string
}

export async function fetchGhlPipelines(
  connectionId: string,
  admin: SupabaseClient<Database>,
  locationId: string,
): Promise<{ rows: Record<string, string>[]; totalRows: number }> {
  const data = await ghlFetch<{ pipelines: GhlPipeline[] }>(
    connectionId, admin, 'opportunities/pipelines',
    { params: { locationId } },
  )

  const rows: Record<string, string>[] = []

  for (const pipeline of data.pipelines ?? []) {
    for (const stage of pipeline.stages ?? []) {
      rows.push({
        __source_id: stage.id,
        pipelineId: pipeline.id,
        pipelineName: pipeline.name ?? '',
        stageName: stage.name ?? '',
        position: stage.position != null ? String(stage.position) : '',
      })
    }
  }

  return { rows, totalRows: rows.length }
}
