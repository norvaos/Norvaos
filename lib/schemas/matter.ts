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
  pipeline_id: z.string().uuid().optional(),
  stage_id: z.string().uuid().optional(),
  responsible_lawyer_id: z.string().uuid('Please assign a responsible lawyer'),
  originating_lawyer_id: z.string().uuid().optional().nullable(),
  billing_type: z.enum(['hourly', 'flat_fee', 'contingency', 'retainer', 'hybrid']).default('flat_fee'),
  hourly_rate: z.number().min(0).optional().nullable(),
  estimated_value: z.number().min(0).optional().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  status: z.enum(['intake', 'active', 'on_hold', 'closed_won', 'closed_lost', 'archived']).default('active'),
  visibility: z.enum(['all', 'owner', 'team', 'group']).default('all'),
  statute_of_limitations: z.string().optional().nullable(),
  next_deadline: z.string().optional().nullable(),
  case_type_id: z.string().uuid().optional().nullable(),
  matter_type_id: z.string().uuid().optional().nullable(),
})

export type MatterFormValues = z.infer<typeof matterSchema>
