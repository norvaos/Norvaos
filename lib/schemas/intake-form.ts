import { z } from 'zod/v4'

// ---------------------------------------------------------------------------
// Field options
// ---------------------------------------------------------------------------

export const fieldOptionSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
})

// ---------------------------------------------------------------------------
// Conditional visibility
// ---------------------------------------------------------------------------

export const fieldConditionSchema = z.object({
  field_id: z.string().min(1),
  operator: z.enum(['equals', 'not_equals', 'in', 'not_in', 'is_truthy', 'is_falsy']),
  value: z.union([z.string(), z.array(z.string())]).optional(),
})

// ---------------------------------------------------------------------------
// Form sections (multi-step)
// ---------------------------------------------------------------------------

export const formSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
  sort_order: z.number().int().min(0),
  condition: fieldConditionSchema.optional(),
})

// ---------------------------------------------------------------------------
// Intake field
// ---------------------------------------------------------------------------

export const intakeFieldSchema = z.object({
  id: z.string(),
  field_type: z.enum([
    'text', 'email', 'phone', 'textarea', 'select', 'multi_select',
    'number', 'date', 'boolean', 'url', 'file',
  ]),
  label: z.string().min(1, 'Label is required').max(255),
  placeholder: z.string().max(255).optional(),
  description: z.string().max(500).optional(),
  is_required: z.boolean().default(false),
  options: z.array(fieldOptionSchema).optional(),
  sort_order: z.number().int().min(0),
  mapping: z.string().optional(),
  allow_other: z.boolean().optional(),
  accept: z.string().optional(),
  section_id: z.string().optional(),
  condition: fieldConditionSchema.optional(),
})

// ---------------------------------------------------------------------------
// Intake form
// ---------------------------------------------------------------------------

export const intakeFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  slug: z.string().min(1, 'Slug is required').max(100).regex(/^[a-z0-9][a-z0-9-]*$/, 'Lowercase letters, numbers, and hyphens only'),
  description: z.string().max(2000).optional(),
  practice_area_id: z.string().uuid().optional().nullable(),
  pipeline_id: z.string().uuid().optional().nullable(),
  stage_id: z.string().uuid().optional().nullable(),
  settings: z.object({
    success_message: z.string().max(1000).optional(),
    redirect_url: z.string().url().optional().or(z.literal('')),
    sections: z.array(formSectionSchema).optional(),
  }).default({}),
})

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type IntakeFieldValues = z.infer<typeof intakeFieldSchema>
export type IntakeFormValues = z.infer<typeof intakeFormSchema>
export type FieldConditionValues = z.infer<typeof fieldConditionSchema>
export type FormSectionValues = z.infer<typeof formSectionSchema>
