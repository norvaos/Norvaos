import { z } from 'zod/v4'

// ---------------------------------------------------------------------------
// Step 1  -  Inviter Information
// ---------------------------------------------------------------------------

export const inviterSchema = z.object({
  full_name: z.string().min(1, 'Full name is required'),
  date_of_birth: z.string().min(1, 'Date of birth is required'),
  street_address: z.string().min(1, 'Street address is required'),
  city: z.string().min(1, 'City is required'),
  province: z.string().min(1, 'Province is required'),
  postal_code: z
    .string()
    .min(1, 'Postal code is required')
    .regex(/^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/, 'Enter a valid Canadian postal code (e.g. A1A 1A1)'),
  phone: z.string().min(1, 'Phone number is required'),
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  immigration_status: z.string().min(1, 'Immigration status is required'),
  permit_expiry_date: z.string().optional(),
  employer_school_name: z.string().optional(),
  occupation: z.string().min(1, 'Occupation is required'),
  employer_company: z.string().optional(),
  annual_income: z.string().optional(),
})

// ---------------------------------------------------------------------------
// Step 2  -  Visitor Information
// ---------------------------------------------------------------------------

export const visitorSchema = z.object({
  full_name: z.string().min(1, 'Full name is required'),
  date_of_birth: z.string().min(1, 'Date of birth is required'),
  gender: z.string().optional(),
  passport_number: z.string().min(1, 'Passport number is required'),
  passport_expiry_date: z.string().min(1, 'Passport expiry date is required'),
  country_of_citizenship: z.string().min(1, 'Country of citizenship is required'),
  country_of_residence: z.string().min(1, 'Country of residence is required'),
  address: z.string().min(1, 'Home address is required'),
  phone: z.string().optional(),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  relationship: z.string().min(1, 'Relationship is required'),
  relationship_other: z.string().optional(),
})

// ---------------------------------------------------------------------------
// Step 3  -  Visit Details
// ---------------------------------------------------------------------------

export const visitSchema = z.object({
  purpose: z.string().min(1, 'Purpose of visit is required'),
  // Business fields
  business_purpose: z.string().optional(),
  business_company: z.string().optional(),
  // Event fields
  event_name: z.string().optional(),
  event_dates: z.string().optional(),
  event_location: z.string().optional(),
  // Medical fields
  medical_facility: z.string().optional(),
  medical_treatment: z.string().optional(),
  // Wedding fields
  wedding_whose: z.string().optional(),
  wedding_date: z.string().optional(),
  wedding_venue: z.string().optional(),
  // Other
  other_description: z.string().optional(),
  // Dates
  arrival_date: z.string().min(1, 'Arrival date is required'),
  departure_date: z.string().min(1, 'Departure date is required'),
  places_to_visit: z.string().optional(),
})

// ---------------------------------------------------------------------------
// Step 4  -  Accommodation & Financial Support
// ---------------------------------------------------------------------------

export const accommodationSchema = z.object({
  staying_with: z.string().min(1, 'Accommodation type is required'),
  accommodation_name: z.string().optional(),
  accommodation_address: z.string().optional(),
  accommodation_other_details: z.string().optional(),
  expense_responsibility: z.string().min(1, 'Please select who covers expenses'),
  will_provide_accommodation: z.boolean().optional(),
  will_provide_food: z.boolean().optional(),
  will_provide_transportation: z.boolean().optional(),
  will_provide_spending_money: z.boolean().optional(),
  employment_status: z.string().optional(),
  inviter_annual_income: z.string().optional(),
  number_of_dependents: z.string().optional(),
})

// ---------------------------------------------------------------------------
// Step 5  -  Additional Visitors
// ---------------------------------------------------------------------------

export const additionalVisitorSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  date_of_birth: z.string().optional(),
  passport_number: z.string().optional(),
  relationship: z.string().min(1, 'Relationship is required'),
  country: z.string().optional(),
})

export const additionalVisitorsSchema = z.object({
  has_additional: z.boolean().default(false),
  visitors: z.array(additionalVisitorSchema).default([]),
})

// ---------------------------------------------------------------------------
// Combined form schema
// ---------------------------------------------------------------------------

export const visitorVisaFormSchema = z.object({
  inviter: inviterSchema,
  visitor: visitorSchema,
  visit: visitSchema,
  accommodation: accommodationSchema,
  additional_visitors: additionalVisitorsSchema,
})

export type VisitorVisaFormValues = z.infer<typeof visitorVisaFormSchema>
export type AdditionalVisitorValues = z.infer<typeof additionalVisitorSchema>

// ---------------------------------------------------------------------------
// Per-step field names (for partial validation via form.trigger)
// ---------------------------------------------------------------------------

/** Fields to validate per step. Nested keys use dot-notation. */
export const STEP_FIELDS: Record<number, string[]> = {
  0: [
    'inviter.full_name',
    'inviter.date_of_birth',
    'inviter.street_address',
    'inviter.city',
    'inviter.province',
    'inviter.postal_code',
    'inviter.phone',
    'inviter.email',
    'inviter.immigration_status',
    'inviter.occupation',
  ],
  1: [
    'visitor.full_name',
    'visitor.date_of_birth',
    'visitor.passport_number',
    'visitor.passport_expiry_date',
    'visitor.country_of_citizenship',
    'visitor.country_of_residence',
    'visitor.address',
    'visitor.relationship',
  ],
  2: [
    'visit.purpose',
    'visit.arrival_date',
    'visit.departure_date',
  ],
  3: [
    'accommodation.staying_with',
    'accommodation.expense_responsibility',
  ],
  4: [], // Additional visitors  -  validated inline
}
