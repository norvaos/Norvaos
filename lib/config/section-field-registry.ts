/**
 * Section Field Registry
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Maps each section_key to its known fields. Used by the settings UI to
 * allow per-field visibility toggles per matter type.
 *
 * field.key matches the column name in the database (matter_immigration,
 * matter_core_data_people, etc.) so the toggle can be wired directly.
 */

export interface FieldDefinition {
  key: string
  label: string
  group?: string
}

export const SECTION_FIELD_REGISTRY: Record<string, FieldDefinition[]> = {
  // ── Core Data: Processing Info ──────────────────────────────────────────
  processing_info: [
    { key: 'processing_stream', label: 'Processing Stream' },
    { key: 'jurisdiction', label: 'Jurisdiction' },
    { key: 'intake_delegation', label: 'Intake Delegation Mode' },
    { key: 'program_category', label: 'Program Category' },
  ],

  // ── Core Data: People & Dependents ─────────────────────────────────────
  people_dependents: [
    { key: 'first_name', label: 'First Name', group: 'Person' },
    { key: 'middle_name', label: 'Middle Name', group: 'Person' },
    { key: 'last_name', label: 'Last Name', group: 'Person' },
    { key: 'date_of_birth', label: 'Date of Birth', group: 'Person' },
    { key: 'gender', label: 'Gender', group: 'Person' },
    { key: 'marital_status', label: 'Marital Status', group: 'Person' },
    { key: 'nationality', label: 'Nationality', group: 'Person' },
    { key: 'email', label: 'Email', group: 'Contact' },
    { key: 'phone', label: 'Phone', group: 'Contact' },
    { key: 'immigration_status', label: 'Immigration Status', group: 'Immigration' },
    { key: 'status_expiry_date', label: 'Status Expiry Date', group: 'Immigration' },
    { key: 'country_of_residence', label: 'Country of Residence', group: 'Immigration' },
    { key: 'criminal_charges', label: 'Criminal Charges', group: 'Background' },
    { key: 'inadmissibility_flag', label: 'Inadmissibility Flag', group: 'Background' },
    { key: 'employer_name', label: 'Employer Name', group: 'Employment' },
    { key: 'occupation', label: 'Occupation', group: 'Employment' },
    { key: 'noc_code', label: 'NOC Code', group: 'Employment' },
    { key: 'work_permit_type', label: 'Work Permit Type', group: 'Employment' },
    { key: 'relationship_to_pa', label: 'Relationship to PA', group: 'Family' },
    { key: 'number_of_dependents', label: 'Number of Dependents', group: 'Family' },
  ],

  // ── Core Data: Risk Assessment ─────────────────────────────────────────
  risk_assessment: [
    { key: 'risk_override_level', label: 'Risk Override Level' },
    { key: 'risk_override_reason', label: 'Risk Override Reason' },
  ],

  // ── Immigration: Visa & Status ─────────────────────────────────────────
  visa_details: [
    { key: 'case_type_id', label: 'Case Type', group: 'Case Info' },
    { key: 'program_category', label: 'Program Category', group: 'Case Info' },
    { key: 'application_number', label: 'Application Number', group: 'Case Info' },
    { key: 'uci_number', label: 'UCI Number', group: 'Case Info' },
    { key: 'country_of_citizenship', label: 'Country of Citizenship', group: 'Profile' },
    { key: 'country_of_residence', label: 'Country of Residence', group: 'Profile' },
    { key: 'current_visa_status', label: 'Current Visa Status', group: 'Profile' },
    { key: 'current_visa_expiry', label: 'Visa Expiry Date', group: 'Profile' },
    { key: 'passport_number', label: 'Passport Number', group: 'Profile' },
    { key: 'passport_expiry', label: 'Passport Expiry', group: 'Profile' },
  ],

  // ── Immigration: Application Dates ─────────────────────────────────────
  application_dates: [
    { key: 'date_filed', label: 'Date Filed' },
    { key: 'date_biometrics', label: 'Biometrics Date' },
    { key: 'date_medical', label: 'Medical Exam Date' },
    { key: 'date_interview', label: 'Interview Date' },
    { key: 'date_decision', label: 'Decision Date' },
    { key: 'date_landing', label: 'Landing Date' },
  ],

  // ── Immigration: Language & Education ──────────────────────────────────
  language_education: [
    { key: 'language_test_type', label: 'Language Test Type', group: 'Language' },
    { key: 'language_test_scores', label: 'Language Test Scores', group: 'Language' },
    { key: 'second_language_test_type', label: 'Second Language Test', group: 'Language' },
    { key: 'second_language_test_scores', label: 'Second Language Scores', group: 'Language' },
    { key: 'education_credential', label: 'Education Credential', group: 'Education' },
    { key: 'eca_status', label: 'ECA Status', group: 'Education' },
  ],

  // ── Immigration: Employment & Work ─────────────────────────────────────
  employment_work: [
    { key: 'work_permit_type', label: 'Work Permit Type' },
    { key: 'employer_name', label: 'Employer Name' },
    { key: 'job_title', label: 'Job Title' },
    { key: 'lmia_number', label: 'LMIA Number' },
    { key: 'job_offer_noc', label: 'Job Offer NOC' },
    { key: 'work_experience_years', label: 'Work Experience (Years)' },
    { key: 'canadian_work_experience_years', label: 'Canadian Work Experience (Years)' },
    { key: 'provincial_nominee_program', label: 'Provincial Nominee Program' },
  ],

  // ── Immigration: Family & Sponsorship ──────────────────────────────────
  family_sponsorship: [
    { key: 'sponsor_name', label: 'Sponsor Name' },
    { key: 'sponsor_relationship', label: 'Sponsor Relationship' },
    { key: 'sponsor_status', label: 'Sponsor Status' },
    { key: 'relationship_start_date', label: 'Relationship Start Date' },
    { key: 'spouse_included', label: 'Spouse Included' },
    { key: 'dependents_count', label: 'Dependents Count' },
    { key: 'prior_refusals', label: 'Prior Refusals', group: 'Background' },
    { key: 'has_criminal_record', label: 'Criminal Record', group: 'Background' },
    { key: 'has_medical_issues', label: 'Medical Issues', group: 'Background' },
    { key: 'retainer_signed', label: 'Retainer Signed', group: 'Retainer' },
    { key: 'retainer_amount', label: 'Retainer Amount', group: 'Retainer' },
    { key: 'government_fees', label: 'Government Fees', group: 'Retainer' },
  ],
}

/**
 * Returns the field definitions for a given section key.
 * Returns an empty array if the section key is not in the registry.
 */
export function getSectionFields(sectionKey: string): FieldDefinition[] {
  return SECTION_FIELD_REGISTRY[sectionKey] ?? []
}
