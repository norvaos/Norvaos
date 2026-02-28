import { z } from 'zod/v4'

export const immigrationDetailsSchema = z.object({
  case_type_id: z.string().uuid().optional().nullable(),
  country_of_citizenship: z.string().optional().nullable(),
  country_of_residence: z.string().optional().nullable(),
  date_of_birth: z.string().optional().nullable(),
  passport_number: z.string().optional().nullable(),
  passport_expiry: z.string().optional().nullable(),
  current_visa_status: z.string().optional().nullable(),
  current_visa_expiry: z.string().optional().nullable(),
  uci_number: z.string().optional().nullable(),
  application_number: z.string().optional().nullable(),
  date_filed: z.string().optional().nullable(),
  date_biometrics: z.string().optional().nullable(),
  date_medical: z.string().optional().nullable(),
  date_interview: z.string().optional().nullable(),
  date_decision: z.string().optional().nullable(),
  date_landing: z.string().optional().nullable(),
  prior_refusals: z.boolean().default(false),
  prior_refusal_details: z.string().optional().nullable(),
  has_criminal_record: z.boolean().default(false),
  criminal_record_details: z.string().optional().nullable(),
  has_medical_issues: z.boolean().default(false),
  medical_issue_details: z.string().optional().nullable(),
  language_test_type: z.string().optional().nullable(),
  language_test_scores: z
    .object({
      listening: z.number().optional(),
      reading: z.number().optional(),
      writing: z.number().optional(),
      speaking: z.number().optional(),
    })
    .optional()
    .nullable(),
  education_credential: z.string().optional().nullable(),
  eca_status: z.string().optional().nullable(),
  crs_score: z.number().min(0).max(1200).optional().nullable(),
  work_experience_years: z.number().min(0).optional().nullable(),
  canadian_work_experience_years: z.number().min(0).optional().nullable(),
  spouse_included: z.boolean().default(false),
  dependents_count: z.number().min(0).default(0),
  employer_name: z.string().optional().nullable(),
  lmia_number: z.string().optional().nullable(),
  job_offer_noc: z.string().optional().nullable(),
  provincial_nominee_program: z.string().optional().nullable(),
  retainer_signed: z.boolean().default(false),
  retainer_signed_at: z.string().optional().nullable(),
  retainer_amount: z.number().min(0).optional().nullable(),
  government_fees: z.number().min(0).optional().nullable(),
  internal_notes: z.string().optional().nullable(),
})

export type ImmigrationDetailsFormValues = z.infer<typeof immigrationDetailsSchema>

export const deadlineSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  due_date: z.string().min(1, 'Due date is required'),
  deadline_type: z.string().min(1, 'Type is required'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  description: z.string().optional().nullable(),
})

export type DeadlineFormValues = z.infer<typeof deadlineSchema>
