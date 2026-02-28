import { z } from 'zod/v4'

export const pipelineSchema = z.object({
  name: z.string().min(1, 'Pipeline name is required').max(100),
  pipeline_type: z.enum(['lead', 'matter']),
  practice_area: z.string().max(100).optional().nullable(),
  is_default: z.boolean().default(false),
})

export type PipelineFormValues = z.infer<typeof pipelineSchema>

export const stageSchema = z.object({
  name: z.string().min(1, 'Stage name is required').max(100),
  color: z.string().default('#6366f1'),
  description: z.string().optional(),
  win_probability: z.number().min(0).max(100).default(0),
  rotting_days: z.number().min(1).optional().nullable(),
  is_win_stage: z.boolean().default(false),
  is_lost_stage: z.boolean().default(false),
  required_fields: z.array(z.string()).default([]),
})

export type StageFormValues = z.infer<typeof stageSchema>
