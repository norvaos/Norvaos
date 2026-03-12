import { z } from 'zod/v4'

export const calendarEventSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(2000).optional().nullable(),
  location: z.string().max(500).optional().nullable(),
  start_at: z.string().min(1, 'Start date is required'),
  end_at: z.string().min(1, 'End date is required'),
  all_day: z.boolean().default(false),
  color: z.string().default('#3b82f6'),
  event_type: z.enum(['meeting', 'consultation', 'court_date', 'personal', 'other']).default('meeting'),
  matter_id: z.string().uuid().optional().nullable(),
  contact_id: z.string().uuid().optional().nullable(),
  status: z.enum(['confirmed', 'tentative', 'cancelled']).default('confirmed'),
  recurrence_rule: z.string().optional().nullable(),
})

export type CalendarEventFormValues = z.infer<typeof calendarEventSchema>

export const EVENT_TYPES = [
  { value: 'meeting', label: 'Meeting', color: '#3b82f6' },
  { value: 'consultation', label: 'Consultation', color: '#8b5cf6' },
  { value: 'court_date', label: 'Court Date', color: '#ef4444' },
  { value: 'personal', label: 'Personal', color: '#22c55e' },
  { value: 'other', label: 'Other', color: '#6b7280' },
] as const

export const EVENT_STATUSES = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'tentative', label: 'Tentative' },
  { value: 'cancelled', label: 'Cancelled' },
] as const

export const EVENT_COLORS = [
  '#3b82f6', '#8b5cf6', '#ef4444', '#f59e0b', '#22c55e',
  '#06b6d4', '#ec4899', '#6b7280',
] as const
