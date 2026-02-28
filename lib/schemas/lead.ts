import { z } from 'zod/v4'

export const leadSchema = z.object({
  contact_id: z.string().uuid('Please select or create a contact'),
  pipeline_id: z.string().uuid(),
  stage_id: z.string().uuid(),
  source: z.string().max(100).optional(),
  source_detail: z.string().optional(),
  practice_area_id: z.string().uuid().optional().nullable(),
  estimated_value: z.number().min(0).optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
  temperature: z.enum(['cold', 'warm', 'hot']).default('warm'),
  notes: z.string().optional(),
  next_follow_up: z.string().optional().nullable(),
})

export type LeadFormValues = z.infer<typeof leadSchema>
