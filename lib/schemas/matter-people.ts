import { z } from 'zod/v4'
import { differenceInYears } from 'date-fns'

export const matterPersonSchema = z.object({
  person_role: z.enum(['principal_applicant', 'spouse', 'dependent', 'co_sponsor', 'other']),
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  middle_name: z.string().nullable().optional(),
  date_of_birth: z.string().nullable().optional(),
  gender: z.string().nullable().optional(),
  nationality: z.string().nullable().optional(),
  country_of_birth: z.string().nullable().optional(),
  passport_number: z.string().nullable().optional(),
  passport_expiry: z.string().nullable().optional(),
  email: z.union([z.string().email(), z.literal('')]).nullable().optional(),
  phone: z.string().nullable().optional(),
  address_line1: z.string().nullable().optional(),
  address_line2: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  province_state: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  country_of_residence: z.string().nullable().optional(),
  immigration_status: z.string().nullable().optional(),
  status_expiry_date: z.string().nullable().optional(),
  marital_status: z.string().nullable().optional(),
  previous_marriage: z.boolean(),
  number_of_dependents: z.number().int().min(0),
  criminal_charges: z.boolean(),
  criminal_details: z.string().nullable().optional(),
  inadmissibility_flag: z.boolean(),
  inadmissibility_details: z.string().nullable().optional(),
  travel_history_flag: z.boolean(),
  currently_in_canada: z.boolean().nullable().optional(),
  employer_name: z.string().nullable().optional(),
  occupation: z.string().nullable().optional(),
  work_permit_type: z.string().nullable().optional(),
  noc_code: z.string().nullable().optional(),
  relationship_to_pa: z.string().nullable().optional(),
  contact_id: z.string().uuid().nullable().optional(),
  role_label: z.string().nullable().optional(),
}).superRefine((data, ctx) => {
  // Principal applicant must be at least 18 years old
  if (
    data.person_role === 'principal_applicant' &&
    data.date_of_birth &&
    data.date_of_birth.trim() !== ''
  ) {
    const dob = new Date(data.date_of_birth)
    if (!isNaN(dob.getTime())) {
      const age = differenceInYears(new Date(), dob)
      if (age < 18) {
        ctx.addIssue({
          code: 'custom',
          message: 'Principal applicant must be at least 18 years old',
          path: ['date_of_birth'],
        })
      }
    }
  }
})

export type MatterPersonFormValues = z.infer<typeof matterPersonSchema>
