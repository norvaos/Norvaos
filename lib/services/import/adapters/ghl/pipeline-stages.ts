import type { EntityAdapter } from '../types'

export const ghlPipelineStagesAdapter: EntityAdapter = {
  entityType: 'pipeline_stages',
  targetTable: 'pipeline_stages',
  displayName: 'Pipeline Stages',
  sourceDisplayName: 'GHL Pipeline Stages',
  description: 'Import pipeline stage definitions from Go High Level.',
  fieldMappings: [
    {
      sourceColumn: 'id',
      targetColumn: '__source_id',
      required: false,
    },
    {
      sourceColumn: 'name',
      targetColumn: 'name',
      required: true,
      aliases: ['Name', 'stage_name', 'Stage Name', 'title', 'Title'],
    },
    {
      sourceColumn: 'pipelineId',
      targetColumn: '__pipeline_source_id',
      required: false,
      aliases: ['pipeline_id', 'Pipeline ID'],
    },
    {
      sourceColumn: 'position',
      targetColumn: 'sort_order',
      required: false,
      aliases: ['order', 'Order', 'sort_order', 'Sort Order', 'position'],
      transform: (val) => {
        const n = parseInt(val, 10)
        return isNaN(n) ? 0 : n
      },
      defaultValue: 0,
    },
  ],
}
