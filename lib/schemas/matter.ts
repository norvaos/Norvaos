import { z } from 'zod/v4'

export const additionalContactSchema = z.object({
  contact_id: z.string().uuid(),
  role: z.string().min(1),
})

export const matterSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().optional(),
  contact_id: z.string().uuid().optional().nullable(),
  additional_contacts: z.array(additionalContactSchema).optional().default([]),
  practice_area_id: z.string().uuid('Please select a practice area'),
  // Legacy lead-pipeline fields (still used for non-matter-type matters)
  pipeline_id: z.string().uuid().optional().nullable(),
  stage_id: z.string().uuid().optional().nullable(),
  // Matter-type pipeline: sourced from matter_stage_pipelines (command centre)
  matter_stage_pipeline_id: z.string().uuid().optional().nullable(),
  // Initial stage within the matter type pipeline
  initial_matter_stage_id: z.string().uuid().optional().nullable(),
  responsible_lawyer_id: z.string().uuid('Please assign a responsible lawyer'),
  originating_lawyer_id: z.string().uuid().optional().nullable(),
  // Follow-up lawyer / staff (distinct from responsible and originating)
  followup_lawyer_id: z.string().uuid().optional().nullable(),
  billing_type: z.enum(['hourly', 'flat_fee', 'contingency', 'retainer', 'hybrid']).default('flat_fee'),
  hourly_rate: z.number().min(0).optional().nullable(),
  estimated_value: z.number().min(0).optional().nullable(),
  // Fee template from command centre (retainer_fee_templates)
  fee_template_id: z.string().uuid().optional().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  status: z.enum(['intake', 'active', 'on_hold', 'closed_won', 'closed_lost', 'archived']).default('active'),
  visibility: z.enum(['all', 'owner', 'team', 'group']).default('all'),
  statute_of_limitations: z.string().optional().nullable(),
  next_deadline: z.string().optional().nullable(),
  case_type_id: z.string().uuid().optional().nullable(),
  matter_type_id: z.string().uuid().optional().nullable(),
})

export type MatterFormValues = z.infer<typeof matterSchema>
