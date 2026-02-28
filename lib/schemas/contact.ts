import { z } from 'zod/v4'

export const contactSchema = z.object({
  contact_type: z.enum(['individual', 'organization']),
  first_name: z.string().min(1, 'First name is required').max(100).optional(),
  last_name: z.string().min(1, 'Last name is required').max(100).optional(),
  middle_name: z.string().max(100).optional(),
  preferred_name: z.string().max(100).optional(),
  date_of_birth: z.string().optional(),
  organization_name: z.string().max(255).optional(),
  organization_id: z.string().uuid().optional().nullable(),
  job_title: z.string().max(255).optional(),
  email_primary: z.email('Invalid email address').optional().or(z.literal('')),
  email_secondary: z.email('Invalid email address').optional().or(z.literal('')),
  phone_primary: z.string().max(30).optional(),
  phone_secondary: z.string().max(30).optional(),
  phone_type_primary: z.string().default('mobile'),
  phone_type_secondary: z.string().optional(),
  website: z.url('Invalid URL').optional().or(z.literal('')),
  address_line1: z.string().max(255).optional(),
  address_line2: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  province_state: z.string().max(100).optional(),
  postal_code: z.string().max(20).optional(),
  country: z.string().max(100).default('Canada'),
  source: z.string().max(100).optional(),
  source_detail: z.string().optional(),
  email_opt_in: z.boolean().default(true),
  sms_opt_in: z.boolean().default(false),
  notes: z.string().optional(),
}).refine(
  (data) => {
    if (data.contact_type === 'individual') {
      return data.first_name && data.last_name
    }
    return !!data.organization_name
  },
  {
    message: 'Individual contacts require first and last name. Organisations require an organisation name.',
  }
)

export type ContactFormValues = z.infer<typeof contactSchema>
