import { z } from 'zod'

export const timeEntrySchema = z.object({
  matterId: z.string().min(1, 'Matter is required'),
  description: z.string().min(1, 'Description is required'),
  durationMinutes: z.number().min(1, 'Duration must be at least 1 minute'),
  entryDate: z.string().min(1, 'Date is required'),
  hourlyRate: z.number().nullable().optional(),
  isBillable: z.boolean(),
})

export type TimeEntryFormValues = z.infer<typeof timeEntrySchema>
