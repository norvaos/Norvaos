import { z } from 'zod/v4'

export const taskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().optional(),
  matter_id: z.string().uuid().optional().nullable(),
  contact_id: z.string().uuid().optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
  due_date: z.string().optional().nullable(),
  due_time: z.string().optional().nullable(),
  start_date: z.string().optional().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  estimated_minutes: z.number().min(0).optional().nullable(),
  follow_up_days: z.number().min(1).optional().nullable(),
  notes: z.string().optional().nullable(),
  timeline_end: z.string().optional().nullable(),
  custom_checkbox: z.boolean().optional(),
})

export type TaskFormValues = z.infer<typeof taskSchema>
