import { z } from 'zod'

export const emailLogSchema = z.object({
  direction: z.enum(['inbound', 'outbound']).default('outbound'),
  subject: z.string().min(1, 'Subject is required').max(500),
  body: z.string().max(10000).optional().nullable(),
  from_address: z.string().email('Invalid email address'),
  to_addresses: z.array(z.string().email()).min(1, 'At least one recipient is required'),
  cc_addresses: z.array(z.string().email()).optional().nullable(),
  bcc_addresses: z.array(z.string().email()).optional().nullable(),
  contact_id: z.string().uuid().optional().nullable(),
  matter_id: z.string().uuid().optional().nullable(),
  sent_at: z.string().optional(),
})

export type EmailLogFormValues = z.infer<typeof emailLogSchema>
