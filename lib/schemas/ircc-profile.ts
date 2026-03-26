import { z } from 'zod'

// ── Sub-schemas ─────────────────────────────────────────────────────────────

export const irccAddressSchema = z.object({
  apt_unit: z.string().optional(),
  street_number: z.string().optional(),
  street_name: z.string().optional(),
  city: z.string().optional(),
  province_state: z.string().optional(),
  postal_code: z.string().optional(),
  country: z.string().optional(),
})

export const irccFamilyMemberSchema = z.object({
  family_name: z.string().optional(),
  given_name: z.string().optional(),
  date_of_birth: z.string().optional(),
  country_of_birth: z.string().optional(),
  address: z.string().optional(),
  marital_status: z.string().optional(),
  occupation: z.string().optional(),
  relationship: z.string().optional(),
})

export const irccPreviousCountrySchema = z.object({
  country: z.string(),
  from_date: z.string(),
  to_date: z.string(),
  immigration_status: z.string(),
})

export const irccPreviousMarriageSchema = z.object({
  spouse_family_name: z.string(),
  spouse_given_name: z.string(),
  type: z.string(),
  from_date: z.string(),
  to_date: z.string(),
})

export const irccOtherNameSchema = z.object({
  family_name: z.string(),
  given_name: z.string(),
  name_type: z.string(),
})

export const irccEducationEntrySchema = z.object({
  from_date: z.string(),
  to_date: z.string(),
  institution: z.string(),
  city: z.string(),
  country: z.string(),
  field_of_study: z.string(),
  diploma_degree: z.string(),
})

export const irccEmploymentEntrySchema = z.object({
  from_date: z.string(),
  to_date: z.string(),
  employer: z.string(),
  title: z.string(),
  city: z.string(),
  country: z.string(),
  activity_type: z.string(),
})

export const irccContactInCanadaSchema = z.object({
  name: z.string(),
  relationship: z.string(),
  address: z.string(),
  invitation_obtained: z.boolean(),
})

// ── Main Profile Schema ─────────────────────────────────────────────────────

export const irccProfileSchema = z.object({
  personal: z.object({
    family_name: z.string(),
    given_name: z.string(),
    other_names: z.array(irccOtherNameSchema).optional(),
    sex: z.string(),
    date_of_birth: z.string(),
    place_of_birth_city: z.string(),
    place_of_birth_country: z.string(),
    eye_colour: z.string().optional(),
    height_cm: z.number().optional(),
    citizenship: z.string(),
    second_citizenship: z.string().optional(),
    current_country_of_residence: z.string(),
    residence_status: z.string().optional(),
    residence_from_date: z.string().optional(),
    previous_countries: z.array(irccPreviousCountrySchema).optional(),
    last_entry_canada_date: z.string().optional(),
    last_entry_canada_place: z.string().optional(),
  }),
  language: z.object({
    native_language: z.string(),
    english_ability: z.string(),
    french_ability: z.string(),
    preferred_language: z.string(),
  }),
  marital: z.object({
    status: z.string(),
    date_of_current_relationship: z.string().optional(),
    spouse_family_name: z.string().optional(),
    spouse_given_name: z.string().optional(),
    spouse_date_of_birth: z.string().optional(),
    previous_marriages: z.array(irccPreviousMarriageSchema).optional(),
  }),
  passport: z.object({
    number: z.string(),
    country_of_issue: z.string(),
    issue_date: z.string(),
    expiry_date: z.string(),
  }),
  contact_info: z.object({
    mailing_address: irccAddressSchema,
    residential_address: irccAddressSchema.optional(),
    same_as_mailing: z.boolean().optional(),
    telephone: z.string(),
    alt_telephone: z.string().optional(),
    fax: z.string().optional(),
    email: z.string().email(),
  }),
  family: z.object({
    spouse: irccFamilyMemberSchema.optional(),
    children: z.array(irccFamilyMemberSchema).optional(),
    mother: irccFamilyMemberSchema.optional(),
    father: irccFamilyMemberSchema.optional(),
    siblings: z.array(irccFamilyMemberSchema).optional(),
  }),
  visit: z.object({
    visa_type: z.string(),
    purpose: z.string(),
    purpose_details: z.string().optional(),
    from_date: z.string(),
    to_date: z.string(),
    funds_available_cad: z.number().nullable(),
    contacts_in_canada: z.array(irccContactInCanadaSchema).optional(),
  }),
  education: z.object({
    has_post_secondary: z.boolean(),
    highest_level: z.string(),
    total_years: z.number().nullable(),
    history: z.array(irccEducationEntrySchema).optional(),
  }),
  employment: z.object({
    current_occupation: z.string().optional(),
    history: z.array(irccEmploymentEntrySchema).optional(),
  }),
  background: z.object({
    tuberculosis_contact: z.boolean().nullable(),
    tuberculosis_contact_details: z.string().optional(),
    physical_mental_disorder: z.boolean().nullable(),
    physical_mental_disorder_details: z.string().optional(),
    overstayed_visa: z.boolean().nullable(),
    overstayed_visa_details: z.string().optional(),
    refused_visa: z.boolean().nullable(),
    refused_visa_details: z.string().optional(),
    criminal_record: z.boolean().nullable(),
    criminal_record_details: z.string().optional(),
    deported: z.boolean().nullable(),
    deported_details: z.string().optional(),
    military_service: z.boolean().nullable(),
    military_service_details: z.string().optional(),
    war_crimes: z.boolean().nullable(),
    war_crimes_details: z.string().optional(),
  }),
})

export type IRCCProfileSchema = z.infer<typeof irccProfileSchema>

// ── Partial schema for incremental saves ────────────────────────────────────
// Zod v4 removed deepPartial(). Use top-level partial + each section is already
// tolerant via optional() fields. For incremental saves we just make every
// top-level section optional  -  the individual fields within each section can
// still validate whatever the user has provided so far.

export const irccProfilePartialSchema = irccProfileSchema.partial()

export type IRCCProfilePartial = z.infer<typeof irccProfilePartialSchema>
