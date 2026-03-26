import { z } from 'zod/v4'

export const profileSchema = z.object({
  first_name: z.string().min(1, 'First name is required').max(100),
  last_name: z.string().min(1, 'Last name is required').max(100),
  email: z.email('Invalid email address'),
  phone: z.string().max(30).optional(),
})

export type ProfileFormValues = z.infer<typeof profileSchema>

export const credentialsSchema = z.object({
  display_name: z.string().max(200).optional(),
  title: z.string().max(200).optional(),
  lso_number: z.string().max(50).optional(),
  rcic_number: z.string().max(50).optional(),
  rep_phone: z.string().max(30).optional(),
  rep_email: z.string().max(255).optional(),
})

export type CredentialsFormValues = z.infer<typeof credentialsSchema>

export const firmSchema = z.object({
  name: z.string().min(1, 'Firm name is required').max(255),
  home_province: z.string().max(10).optional(),
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid colour'),
  secondary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid colour'),
  accent_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid colour'),
  timezone: z.string(),
  currency: z.string().length(3),
  date_format: z.string(),
})

export type FirmFormValues = z.infer<typeof firmSchema>

/** ISO 3166-2:CA province/territory codes */
const PROVINCE_CODES = [
  'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT',
] as const

export const firmAddressSchema = z.object({
  address_line1: z.string().max(255).optional(),
  address_line2: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  province: z.enum(PROVINCE_CODES).optional().or(z.literal('')),
  postal_code: z.string().max(20).optional(),
  country: z.string().max(100).optional(),
  office_phone: z.string().max(30).optional(),
  office_fax: z.string().max(30).optional(),
})

export type FirmAddressFormValues = z.infer<typeof firmAddressSchema>

export const repContactSchema = z.object({
  rep_phone: z.string().max(30).optional(),
  rep_email: z.email('Invalid email address').optional().or(z.literal('')),
})

export type RepContactFormValues = z.infer<typeof repContactSchema>

export const inviteUserSchema = z.object({
  email: z.email('Invalid email address'),
  first_name: z.string().min(1, 'First name is required').max(100),
  last_name: z.string().min(1, 'Last name is required').max(100),
  role_id: z.string().uuid('Please select a role').optional(),
})

export type InviteUserFormValues = z.infer<typeof inviteUserSchema>

export const roleSchema = z.object({
  name: z.string().min(1, 'Role name is required').max(100),
  description: z.string().optional(),
  permissions: z.record(z.string(), z.record(z.string(), z.boolean())),
})

export type RoleFormValues = z.infer<typeof roleSchema>

export const practiceAreaSchema = z.object({
  name: z.string().min(1, 'Practice area name is required').max(100),
  color: z.string().default('#6366f1'),
  default_pipeline_id: z.string().uuid().optional().nullable(),
})

export type PracticeAreaFormValues = z.infer<typeof practiceAreaSchema>

export const customFieldSchema = z.object({
  entity_type: z.enum(['contact', 'matter', 'lead']),
  field_key: z.string().min(1).max(100).regex(/^[a-z_][a-z0-9_]*$/, 'Must be lowercase with underscores'),
  field_label: z.string().min(1, 'Label is required').max(255),
  field_type: z.enum([
    'text', 'number', 'decimal', 'date', 'datetime', 'boolean',
    'select', 'multi_select', 'email', 'phone', 'url', 'textarea', 'currency', 'file'
  ]),
  options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  is_required: z.boolean().default(false),
  default_value: z.string().optional(),
  practice_area_id: z.string().uuid().optional().nullable(),
  show_on_card: z.boolean().default(false),
  show_in_table: z.boolean().default(false),
})

export type CustomFieldFormValues = z.infer<typeof customFieldSchema>
