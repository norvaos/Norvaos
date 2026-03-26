/**
 * Structured IRCC client profile stored in contacts.immigration_data (JSONB).
 *
 * This is the single source of truth for all immigration data collected
 * from IRCC form questionnaires. Fields map 1:1 to IRCC form fields via
 * the form-field-registry.
 *
 * Profile paths use dot notation (e.g. "personal.family_name", "family.spouse.given_name")
 * for dynamic access in the questionnaire engine.
 */

// ── Address ─────────────────────────────────────────────────────────────────

export interface IRCCAddress {
  apt_unit?: string
  po_box?: string
  street_number: string
  street_name: string
  city: string
  province_state?: string
  postal_code?: string
  district?: string
  country: string
}

// ── Family Member ───────────────────────────────────────────────────────────

export interface IRCCFamilyMember {
  family_name: string
  given_name: string
  date_of_birth: string  // YYYY-MM-DD
  country_of_birth?: string
  address?: string
  marital_status?: string
  occupation?: string
  relationship?: string  // e.g. "son", "daughter", "brother"
}

// ── Previous Country of Residence ────────────────────────────────────────────

export interface IRCCPreviousCountry {
  country: string
  from_date: string
  to_date: string
  immigration_status: string
}

// ── Previous Marriage ────────────────────────────────────────────────────────

export interface IRCCPreviousMarriage {
  spouse_family_name: string
  spouse_given_name: string
  spouse_date_of_birth?: string  // YYYY-MM-DD
  type: string // marriage, common_law
  from_date: string
  to_date: string
}

// ── Other Name Used ──────────────────────────────────────────────────────────

export interface IRCCOtherName {
  family_name: string
  given_name: string
  name_type: string  // maiden, alias, nickname
}

// ── Education History Entry ──────────────────────────────────────────────────

export interface IRCCEducationEntry {
  from_date: string
  to_date: string
  institution: string
  city: string
  province_state?: string
  country: string
  field_of_study: string
  diploma_degree: string
}

// ── Employment History Entry ─────────────────────────────────────────────────

export interface IRCCEmploymentEntry {
  from_date: string
  to_date: string
  employer: string
  title: string
  city: string
  province_state?: string
  country: string
  activity_type: string  // employed, self_employed, unemployed, retired, student
}

// ── Contact in Canada ────────────────────────────────────────────────────────

export interface IRCCContactInCanada {
  name: string
  relationship: string
  address: string
  invitation_obtained: boolean
}

// ── Main Profile ─────────────────────────────────────────────────────────────

export interface IRCCProfile {
  /** Section: Personal Details (IMM 5257 §2, IMM 5406 §A) */
  personal: {
    family_name: string
    given_name: string
    has_alias?: boolean
    alias_family_name?: string
    alias_given_name?: string
    other_names?: IRCCOtherName[]
    uci_number?: string
    sex: 'male' | 'female' | 'other' | ''
    date_of_birth: string  // YYYY-MM-DD
    place_of_birth_city: string
    place_of_birth_country: string
    eye_colour?: string
    height_cm?: number
    citizenship: string
    second_citizenship?: string
    current_country_of_residence: string
    residence_status?: string
    residence_from_date?: string
    cor_from_date?: string       // YYYY-MM-DD, date since in current COR
    cor_to_date?: string         // YYYY-MM-DD
    same_as_cor?: boolean        // is country where applying same as COR
    country_where_applying?: string
    cwa_status?: string
    cwa_from_date?: string       // YYYY-MM-DD
    cwa_to_date?: string         // YYYY-MM-DD
    service_in?: string          // 'english' | 'french'
    previous_countries?: IRCCPreviousCountry[]
    last_entry_canada_date?: string
    last_entry_canada_place?: string
  }

  /** Section: Language (IMM 5257 §4) */
  language: {
    native_language: string
    english_ability: 'none' | 'basic' | 'moderate' | 'fluent' | ''
    french_ability: 'none' | 'basic' | 'moderate' | 'fluent' | ''
    preferred_language: 'english' | 'french' | ''
    language_of_interview?: string  // 'english' | 'french' | 'both'
  }

  /** Section: Marital Status (IMM 5257 §3) */
  marital: {
    status: string // single, married, common_law, divorced, widowed, separated, annulled
    date_of_current_relationship?: string
    spouse_family_name?: string
    spouse_given_name?: string
    spouse_date_of_birth?: string
    was_previously_married?: boolean
    previous_spouse_family_name?: string
    previous_spouse_given_name?: string
    previous_spouse_dob?: string            // YYYY-MM-DD
    previous_relationship_type?: string     // marriage, common_law
    previous_relationship_from_date?: string
    previous_relationship_to_date?: string
    previous_marriages?: IRCCPreviousMarriage[]
  }

  /** Section: Passport / Travel Document (IMM 5257 §5) */
  passport: {
    number: string
    country_of_issue: string
    issue_date: string
    expiry_date: string
    national_id_indicator?: boolean
    national_id_number?: string
    national_id_country?: string
    national_id_issue_date?: string
    national_id_expiry_date?: string
    us_pr_card_indicator?: boolean
    us_pr_card_number?: string
    us_pr_card_expiry_date?: string
  }

  /** Section: Contact Information (IMM 5257 §6) */
  contact_info: {
    mailing_address: Partial<IRCCAddress>
    residential_address?: Partial<IRCCAddress>
    same_as_mailing?: boolean
    telephone: string
    alt_telephone?: string
    fax?: string
    email: string
  }

  /** Section: Family Information (IMM 5257 §7, IMM 5406 §B-E) */
  family: {
    spouse?: Partial<IRCCFamilyMember>
    children?: Partial<IRCCFamilyMember>[]
    mother?: Partial<IRCCFamilyMember>
    father?: Partial<IRCCFamilyMember>
    siblings?: Partial<IRCCFamilyMember>[]
  }

  /** Section: Details of Visit (IMM 5257 §8) */
  visit: {
    visa_type: 'single' | 'multiple' | ''
    purpose: string
    purpose_details?: string
    other_purpose?: string
    from_date: string
    to_date: string
    funds_available_cad: number | null
    contacts_in_canada?: IRCCContactInCanada[]
  }

  /** Section: Education (IMM 5257 §9) */
  education: {
    has_post_secondary: boolean
    highest_level: string
    total_years: number | null
    history?: IRCCEducationEntry[]
  }

  /** Section: Employment (IMM 5257 §10  -  past 10 years) */
  employment: {
    current_occupation?: string
    history?: IRCCEmploymentEntry[]
  }

  /** Section: Sponsor Information (IMM 1295E) */
  sponsor?: {
    family_name?: string
    given_name?: string
    date_of_birth?: string
    sex?: 'male' | 'female' | 'other' | ''
    citizenship?: string
    is_citizen_or_pr?: 'citizen' | 'permanent_resident' | ''
    date_became_citizen_or_pr?: string
    address?: Partial<IRCCAddress>
    telephone?: string
    email?: string
    employer?: string
    occupation?: string
    annual_income?: number | null
    previous_sponsorships?: boolean | null
    previous_sponsorship_details?: string
    defaulted_on_sponsorship?: boolean | null
    subject_of_removal_order?: boolean | null
    convicted_of_offence?: boolean | null
    convicted_of_offence_details?: string
    receiving_social_assistance?: boolean | null
    social_assistance_reason?: string
    bankruptcy?: boolean | null
    bankruptcy_details?: string
    sponsor_declaration?: boolean | null
  }

  /** Section: Relationship Information (IMM 5532E) */
  relationship?: {
    type?: 'married' | 'common_law' | 'conjugal' | ''
    date_of_marriage_or_start?: string
    how_met?: string
    how_met_details?: string
    where_met_city?: string
    where_met_country?: string
    date_first_met?: string
    in_person_meeting?: boolean | null
    in_person_meeting_details?: string
    communicate_language?: string
    communicate_method?: string
    lived_together?: boolean | null
    lived_together_from?: string
    lived_together_to?: string
    currently_living_together?: boolean | null
    not_living_together_reason?: string
    children_together?: boolean | null
    number_of_children?: number | null
    previous_sponsorship_relationship?: boolean | null
    relationship_genuine_declaration?: boolean | null
  }

  /** Section: Financial Evaluation (IMM 1283) */
  financial?: {
    income_year1?: number | null
    income_year1_label?: string  // e.g. "2025"
    income_year2?: number | null
    income_year2_label?: string
    income_year3?: number | null
    income_year3_label?: string
    total_assets?: number | null
    total_liabilities?: number | null
    net_worth?: number | null
    current_sponsorship_obligations?: number | null
    number_of_dependants?: number | null
    receiving_government_assistance?: boolean | null
    government_assistance_details?: string
  }

  /** Section: Representative Information (IMM 5476E) */
  representative?: {
    has_representative?: boolean | null
    rep_type?: 'paid' | 'unpaid' | ''
    rep_family_name?: string
    rep_given_name?: string
    rep_organization?: string
    rep_membership_id?: string  // RCIC / law society number
    rep_telephone?: string
    rep_fax?: string
    rep_email?: string
    rep_address?: Partial<IRCCAddress>
    rep_postal_code?: string
    rep_declaration?: boolean | null
  }

  /** Section: Supplementary Information (IMM 5562) */
  supplementary?: {
    additional_info?: string
    additional_info_details?: string
  }

  /** Section: Background Information (IMM 5257 §11) */
  background: {
    tuberculosis_contact: boolean | null
    tuberculosis_contact_details?: string
    physical_mental_disorder: boolean | null
    physical_mental_disorder_details?: string
    overstayed_visa: boolean | null
    overstayed_visa_details?: string
    refused_visa: boolean | null
    refused_visa_details?: string
    criminal_record: boolean | null
    criminal_record_details?: string
    deported: boolean | null
    deported_details?: string
    military_service: boolean | null
    military_service_details?: string
    war_crimes: boolean | null
    war_crimes_details?: string
    government_position?: boolean | null
    government_position_details?: string
    organization_involvement?: boolean | null
    organization_involvement_details?: string
  }
}

// ── Utility: Empty Profile ──────────────────────────────────────────────────

export function createEmptyProfile(): IRCCProfile {
  return {
    personal: {
      family_name: '',
      given_name: '',
      sex: '',
      date_of_birth: '',
      place_of_birth_city: '',
      place_of_birth_country: '',
      citizenship: '',
      current_country_of_residence: '',
    },
    language: {
      native_language: '',
      english_ability: '',
      french_ability: '',
      preferred_language: '',
    },
    marital: {
      status: '',
    },
    passport: {
      number: '',
      country_of_issue: '',
      issue_date: '',
      expiry_date: '',
    },
    contact_info: {
      mailing_address: {},
      telephone: '',
      email: '',
    },
    family: {},
    visit: {
      visa_type: '',
      purpose: '',
      from_date: '',
      to_date: '',
      funds_available_cad: null,
    },
    education: {
      has_post_secondary: false,
      highest_level: '',
      total_years: null,
    },
    employment: {},
    sponsor: {},
    relationship: {},
    financial: {},
    representative: {},
    supplementary: {},
    background: {
      tuberculosis_contact: null,
      physical_mental_disorder: null,
      overstayed_visa: null,
      refused_visa: null,
      criminal_record: null,
      deported: null,
      military_service: null,
      war_crimes: null,
      government_position: null,
      organization_involvement: null,
    },
  }
}

// ── Field Mapping (used in form templates) ──────────────────────────────────

export interface IRCCFieldMapping {
  /** Dot-notation path into IRCCProfile (e.g. "personal.family_name") */
  profile_path: string
  /** IRCC PDF form field name for PDF filling */
  ircc_field_name: string
  /** Display label */
  label: string
  /** Field type for rendering */
  field_type: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'multi_select' |
              'number' | 'date' | 'boolean' | 'country' | 'repeater'
  /** Options for select fields */
  options?: { label: string; value: string }[]
  /** Whether this field is required */
  is_required: boolean
  /** Placeholder text */
  placeholder?: string
  /** Help text / description */
  description?: string
  /** Sort order within section */
  sort_order: number
  /** Which IRCC form this field originates from */
  form_source: string
  /** Maximum character length (enforced in validation and as HTML maxLength) */
  max_length?: number
  /** Condition for showing this field */
  show_when?: {
    profile_path: string
    operator: 'equals' | 'not_equals' | 'is_truthy' | 'is_falsy'
    value?: string
  }
}

export interface IRCCFormSection {
  id: string
  title: string
  description?: string
  sort_order: number
  fields: IRCCFieldMapping[]
}
