/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Profile Path Catalog  -  Autocomplete data for IRCC field mapping
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Provides a catalog of all known profile paths that can be mapped to
 * XFA form fields. Used by the Form Library settings page for autocomplete.
 */

export interface ProfilePathEntry {
  path: string
  label: string
  section: string
  type: 'text' | 'select' | 'date' | 'boolean' | 'number' | 'country' | 'phone' | 'email' | 'repeater'
}

/**
 * All known profile paths organized by section.
 * Based on the IRCCProfile type and existing form field registry.
 */
export const PROFILE_PATH_CATALOG: ProfilePathEntry[] = [
  // ── Personal Details ────────────────────────────────────────────────────
  { path: 'personal.family_name', label: 'Family Name', section: 'Personal', type: 'text' },
  { path: 'personal.given_name', label: 'Given Name', section: 'Personal', type: 'text' },
  { path: 'personal.other_names', label: 'Other Names', section: 'Personal', type: 'text' },
  { path: 'personal.sex', label: 'Sex', section: 'Personal', type: 'select' },
  { path: 'personal.date_of_birth', label: 'Date of Birth', section: 'Personal', type: 'date' },
  { path: 'personal.place_of_birth_city', label: 'Place of Birth (City)', section: 'Personal', type: 'text' },
  { path: 'personal.place_of_birth_country', label: 'Place of Birth (Country)', section: 'Personal', type: 'country' },
  { path: 'personal.eye_colour', label: 'Eye Colour', section: 'Personal', type: 'select' },
  { path: 'personal.height_cm', label: 'Height (cm)', section: 'Personal', type: 'number' },
  { path: 'personal.citizenship', label: 'Citizenship', section: 'Personal', type: 'country' },
  { path: 'personal.second_citizenship', label: 'Second Citizenship', section: 'Personal', type: 'country' },
  { path: 'personal.current_country_of_residence', label: 'Current Country of Residence', section: 'Personal', type: 'country' },
  { path: 'personal.residence_status', label: 'Residence Status', section: 'Personal', type: 'select' },
  { path: 'personal.residence_from_date', label: 'Residence From Date', section: 'Personal', type: 'date' },
  { path: 'personal.previous_countries', label: 'Previous Countries of Residence', section: 'Personal', type: 'repeater' },

  // ── Marital Status ──────────────────────────────────────────────────────
  { path: 'marital.status', label: 'Marital Status', section: 'Marital', type: 'select' },
  { path: 'marital.date_of_current_relationship', label: 'Relationship Date', section: 'Marital', type: 'date' },
  { path: 'marital.spouse_family_name', label: 'Spouse Family Name', section: 'Marital', type: 'text' },
  { path: 'marital.spouse_given_name', label: 'Spouse Given Name', section: 'Marital', type: 'text' },
  { path: 'marital.spouse_date_of_birth', label: 'Spouse Date of Birth', section: 'Marital', type: 'date' },
  { path: 'marital.previous_marriages', label: 'Previously Married', section: 'Marital', type: 'boolean' },

  // ── Language ────────────────────────────────────────────────────────────
  { path: 'language.native_language', label: 'Native Language', section: 'Language', type: 'text' },
  { path: 'language.english_ability', label: 'English Ability', section: 'Language', type: 'select' },
  { path: 'language.french_ability', label: 'French Ability', section: 'Language', type: 'select' },
  { path: 'language.preferred_language', label: 'Preferred Language', section: 'Language', type: 'select' },

  // ── Passport / Travel Document ──────────────────────────────────────────
  { path: 'passport.number', label: 'Passport Number', section: 'Passport', type: 'text' },
  { path: 'passport.country_of_issue', label: 'Country of Issue', section: 'Passport', type: 'country' },
  { path: 'passport.issue_date', label: 'Issue Date', section: 'Passport', type: 'date' },
  { path: 'passport.expiry_date', label: 'Expiry Date', section: 'Passport', type: 'date' },

  // ── Contact Information ─────────────────────────────────────────────────
  { path: 'contact_info.mailing_address.street_number', label: 'Street Number', section: 'Contact', type: 'text' },
  { path: 'contact_info.mailing_address.street_name', label: 'Street Name', section: 'Contact', type: 'text' },
  { path: 'contact_info.mailing_address.apt_unit', label: 'Apt/Unit', section: 'Contact', type: 'text' },
  { path: 'contact_info.mailing_address.city', label: 'City', section: 'Contact', type: 'text' },
  { path: 'contact_info.mailing_address.province_state', label: 'Province/State', section: 'Contact', type: 'text' },
  { path: 'contact_info.mailing_address.postal_code', label: 'Postal Code', section: 'Contact', type: 'text' },
  { path: 'contact_info.mailing_address.country', label: 'Country', section: 'Contact', type: 'country' },
  { path: 'contact_info.residential_same_as_mailing', label: 'Residential Same as Mailing', section: 'Contact', type: 'boolean' },
  { path: 'contact_info.telephone', label: 'Telephone', section: 'Contact', type: 'phone' },
  { path: 'contact_info.alternate_telephone', label: 'Alternate Telephone', section: 'Contact', type: 'phone' },
  { path: 'contact_info.fax_number', label: 'Fax Number', section: 'Contact', type: 'phone' },
  { path: 'contact_info.email', label: 'Email', section: 'Contact', type: 'email' },

  // ── Visit Details ───────────────────────────────────────────────────────
  { path: 'visit.purpose', label: 'Purpose of Visit', section: 'Visit', type: 'select' },
  { path: 'visit.other_purpose_details', label: 'Other Purpose Details', section: 'Visit', type: 'text' },
  { path: 'visit.from_date', label: 'Visit From Date', section: 'Visit', type: 'date' },
  { path: 'visit.to_date', label: 'Visit To Date', section: 'Visit', type: 'date' },
  { path: 'visit.funds_available_cad', label: 'Funds Available (CAD)', section: 'Visit', type: 'number' },
  { path: 'visit.contacts_in_canada', label: 'Contacts in Canada', section: 'Visit', type: 'repeater' },

  // ── Education ───────────────────────────────────────────────────────────
  { path: 'education.highest_level', label: 'Highest Level of Education', section: 'Education', type: 'select' },
  { path: 'education.history', label: 'Education History', section: 'Education', type: 'repeater' },

  // ── Employment ──────────────────────────────────────────────────────────
  { path: 'occupation.current_title', label: 'Current Occupation/Title', section: 'Employment', type: 'text' },
  { path: 'occupation.current_employer', label: 'Current Employer', section: 'Employment', type: 'text' },
  { path: 'occupation.history', label: 'Employment History', section: 'Employment', type: 'repeater' },

  // ── Background Questions ────────────────────────────────────────────────
  { path: 'background.refused_visa', label: 'Refused Visa/Entry', section: 'Background', type: 'boolean' },
  { path: 'background.refused_visa_details', label: 'Refused Visa Details', section: 'Background', type: 'text' },
  { path: 'background.criminal_conviction', label: 'Criminal Conviction', section: 'Background', type: 'boolean' },
  { path: 'background.criminal_conviction_details', label: 'Criminal Conviction Details', section: 'Background', type: 'text' },
  { path: 'background.military_service', label: 'Military Service', section: 'Background', type: 'boolean' },
  { path: 'background.military_service_details', label: 'Military Service Details', section: 'Background', type: 'text' },
  { path: 'background.previous_visa_to_canada', label: 'Previous Visa to Canada', section: 'Background', type: 'boolean' },
  { path: 'background.previous_visa_details', label: 'Previous Visa Details', section: 'Background', type: 'text' },
  { path: 'background.medical_condition', label: 'Medical Condition', section: 'Background', type: 'boolean' },
  { path: 'background.medical_condition_details', label: 'Medical Condition Details', section: 'Background', type: 'text' },

  // ── Family ──────────────────────────────────────────────────────────────
  { path: 'family.mother_full_name', label: 'Mother Full Name', section: 'Family', type: 'text' },
  { path: 'family.mother_date_of_birth', label: 'Mother Date of Birth', section: 'Family', type: 'date' },
  { path: 'family.mother_place_of_birth', label: 'Mother Place of Birth', section: 'Family', type: 'text' },
  { path: 'family.father_full_name', label: 'Father Full Name', section: 'Family', type: 'text' },
  { path: 'family.father_date_of_birth', label: 'Father Date of Birth', section: 'Family', type: 'date' },
  { path: 'family.father_place_of_birth', label: 'Father Place of Birth', section: 'Family', type: 'text' },
  { path: 'family.children', label: 'Children', section: 'Family', type: 'repeater' },

  // ── Sponsor (IMM 1295E) ─────────────────────────────────────────────────
  { path: 'sponsor.family_name', label: 'Sponsor Family Name', section: 'Sponsor', type: 'text' },
  { path: 'sponsor.given_name', label: 'Sponsor Given Name', section: 'Sponsor', type: 'text' },
  { path: 'sponsor.date_of_birth', label: 'Sponsor Date of Birth', section: 'Sponsor', type: 'date' },
  { path: 'sponsor.sex', label: 'Sponsor Sex', section: 'Sponsor', type: 'select' },
  { path: 'sponsor.citizenship', label: 'Sponsor Citizenship', section: 'Sponsor', type: 'country' },
  { path: 'sponsor.is_citizen_or_pr', label: 'Citizen or PR Status', section: 'Sponsor', type: 'select' },
  { path: 'sponsor.date_became_citizen_or_pr', label: 'Date Became Citizen/PR', section: 'Sponsor', type: 'date' },
  { path: 'sponsor.address.street_name', label: 'Sponsor Street', section: 'Sponsor', type: 'text' },
  { path: 'sponsor.address.city', label: 'Sponsor City', section: 'Sponsor', type: 'text' },
  { path: 'sponsor.address.province_state', label: 'Sponsor Province', section: 'Sponsor', type: 'text' },
  { path: 'sponsor.address.postal_code', label: 'Sponsor Postal Code', section: 'Sponsor', type: 'text' },
  { path: 'sponsor.telephone', label: 'Sponsor Phone', section: 'Sponsor', type: 'phone' },
  { path: 'sponsor.email', label: 'Sponsor Email', section: 'Sponsor', type: 'email' },
  { path: 'sponsor.employer', label: 'Sponsor Employer', section: 'Sponsor', type: 'text' },
  { path: 'sponsor.annual_income', label: 'Sponsor Annual Income', section: 'Sponsor', type: 'number' },
  { path: 'sponsor.previous_sponsorships', label: 'Previous Sponsorships', section: 'Sponsor', type: 'boolean' },
  { path: 'sponsor.defaulted_on_sponsorship', label: 'Defaulted on Sponsorship', section: 'Sponsor', type: 'boolean' },
  { path: 'sponsor.subject_of_removal_order', label: 'Subject of Removal Order', section: 'Sponsor', type: 'boolean' },
  { path: 'sponsor.convicted_of_offence', label: 'Criminal Conviction', section: 'Sponsor', type: 'boolean' },
  { path: 'sponsor.receiving_social_assistance', label: 'Receiving Social Assistance', section: 'Sponsor', type: 'boolean' },
  { path: 'sponsor.bankruptcy', label: 'Undischarged Bankrupt', section: 'Sponsor', type: 'boolean' },

  // ── Relationship (IMM 5532E) ──────────────────────────────────────────
  { path: 'relationship.type', label: 'Relationship Type', section: 'Relationship', type: 'select' },
  { path: 'relationship.date_of_marriage_or_start', label: 'Date of Marriage/Start', section: 'Relationship', type: 'date' },
  { path: 'relationship.how_met', label: 'How You Met', section: 'Relationship', type: 'text' },
  { path: 'relationship.where_met_city', label: 'Where Met (City)', section: 'Relationship', type: 'text' },
  { path: 'relationship.where_met_country', label: 'Where Met (Country)', section: 'Relationship', type: 'country' },
  { path: 'relationship.date_first_met', label: 'Date First Met', section: 'Relationship', type: 'date' },
  { path: 'relationship.in_person_meeting', label: 'Met in Person', section: 'Relationship', type: 'boolean' },
  { path: 'relationship.communicate_language', label: 'Communication Language', section: 'Relationship', type: 'text' },
  { path: 'relationship.lived_together', label: 'Lived Together', section: 'Relationship', type: 'boolean' },
  { path: 'relationship.lived_together_from', label: 'Lived Together From', section: 'Relationship', type: 'date' },
  { path: 'relationship.lived_together_to', label: 'Lived Together To', section: 'Relationship', type: 'date' },
  { path: 'relationship.currently_living_together', label: 'Currently Living Together', section: 'Relationship', type: 'boolean' },
  { path: 'relationship.children_together', label: 'Children Together', section: 'Relationship', type: 'boolean' },

  // ── Financial (IMM 1283) ──────────────────────────────────────────────
  { path: 'financial.income_year1', label: 'Income Year 1', section: 'Financial', type: 'number' },
  { path: 'financial.income_year2', label: 'Income Year 2', section: 'Financial', type: 'number' },
  { path: 'financial.income_year3', label: 'Income Year 3', section: 'Financial', type: 'number' },
  { path: 'financial.total_assets', label: 'Total Assets', section: 'Financial', type: 'number' },
  { path: 'financial.total_liabilities', label: 'Total Liabilities', section: 'Financial', type: 'number' },
  { path: 'financial.current_sponsorship_obligations', label: 'Sponsorship Obligations', section: 'Financial', type: 'number' },
  { path: 'financial.number_of_dependants', label: 'Number of Dependants', section: 'Financial', type: 'number' },
  { path: 'financial.receiving_government_assistance', label: 'Receiving Gov Assistance', section: 'Financial', type: 'boolean' },

  // ── Representative (IMM 5476E) ────────────────────────────────────────
  { path: 'representative.has_representative', label: 'Has Representative', section: 'Representative', type: 'boolean' },
  { path: 'representative.rep_type', label: 'Representative Type', section: 'Representative', type: 'select' },
  { path: 'representative.rep_family_name', label: 'Rep Family Name', section: 'Representative', type: 'text' },
  { path: 'representative.rep_given_name', label: 'Rep Given Name', section: 'Representative', type: 'text' },
  { path: 'representative.rep_organization', label: 'Rep Organization', section: 'Representative', type: 'text' },
  { path: 'representative.rep_membership_id', label: 'RCIC/Law Society #', section: 'Representative', type: 'text' },
  { path: 'representative.rep_telephone', label: 'Rep Phone', section: 'Representative', type: 'phone' },
  { path: 'representative.rep_email', label: 'Rep Email', section: 'Representative', type: 'email' },

  // ── Work Permit (IMM 5710E) ───────────────────────────────────────────
  { path: 'work.applying_for_extend', label: 'Applying to Extend', section: 'Work', type: 'boolean' },
  { path: 'work.applying_for_new_employer', label: 'Applying for New Employer', section: 'Work', type: 'boolean' },
  { path: 'work.applying_for_restore_status', label: 'Applying to Restore Status', section: 'Work', type: 'boolean' },
  { path: 'work.applying_for_trp', label: 'Applying for TRP', section: 'Work', type: 'boolean' },
  { path: 'work.work_permit_type', label: 'Work Permit Type', section: 'Work', type: 'select' },
  { path: 'work.work_permit_type_other', label: 'Work Permit Type (Other)', section: 'Work', type: 'text' },
  { path: 'work.employer_name', label: 'Employer Name', section: 'Work', type: 'text' },
  { path: 'work.employer_address', label: 'Employer Address', section: 'Work', type: 'text' },
  { path: 'work.work_location_address', label: 'Work Location Address', section: 'Work', type: 'text' },
  { path: 'work.work_location_city', label: 'Work Location City', section: 'Work', type: 'text' },
  { path: 'work.work_location_province', label: 'Work Location Province', section: 'Work', type: 'text' },
  { path: 'work.occupation_title', label: 'Occupation Title', section: 'Work', type: 'text' },
  { path: 'work.occupation_description', label: 'Occupation Description', section: 'Work', type: 'text' },
  { path: 'work.work_from_date', label: 'Work Start Date', section: 'Work', type: 'date' },
  { path: 'work.work_to_date', label: 'Work End Date', section: 'Work', type: 'date' },
  { path: 'work.lmia_number', label: 'LMIA Number', section: 'Work', type: 'text' },
  { path: 'work.provincial_nominee', label: 'Provincial Nominee', section: 'Work', type: 'text' },
  { path: 'work.caq_number', label: 'CAQ Number', section: 'Work', type: 'text' },
  { path: 'work.caq_expiry_date', label: 'CAQ Expiry Date', section: 'Work', type: 'date' },
  { path: 'work.purpose_of_visit', label: 'Purpose of Visit', section: 'Work', type: 'select' },
  { path: 'work.purpose_of_visit_other', label: 'Purpose of Visit (Other)', section: 'Work', type: 'text' },
  { path: 'work.original_entry_date', label: 'Original Entry Date', section: 'Work', type: 'date' },
  { path: 'work.original_entry_place', label: 'Original Entry Place', section: 'Work', type: 'text' },
  { path: 'work.recent_entry_date', label: 'Most Recent Entry Date', section: 'Work', type: 'date' },
  { path: 'work.recent_entry_place', label: 'Most Recent Entry Place', section: 'Work', type: 'text' },
  { path: 'work.previous_document_number', label: 'Previous Document Number', section: 'Work', type: 'text' },

  // ── Supplementary (IMM 5562) ──────────────────────────────────────────
  { path: 'supplementary.additional_info', label: 'Additional Information', section: 'Supplementary', type: 'text' },

  // ── Meta Fields ───────────────────────────────────────────────────────
  { path: '__signature', label: 'Representative Signature', section: 'Meta', type: 'text' },
  { path: '__rep_name', label: 'Representative Name', section: 'Meta', type: 'text' },
  { path: '__rep_phone', label: 'Representative Phone', section: 'Meta', type: 'phone' },
  { path: '__rep_fax', label: 'Representative Fax', section: 'Meta', type: 'phone' },
  { path: '__rep_email', label: 'Representative Email', section: 'Meta', type: 'email' },
  { path: '__today_date', label: 'Today\'s Date', section: 'Meta', type: 'date' },
]

/**
 * Get all unique sections from the catalog.
 */
export function getProfilePathSections(): string[] {
  const sections = new Set(PROFILE_PATH_CATALOG.map((e) => e.section))
  return Array.from(sections)
}

/**
 * Search profile paths by query string (fuzzy match on path or label).
 */
export function searchProfilePaths(query: string): ProfilePathEntry[] {
  if (!query) return PROFILE_PATH_CATALOG
  const lower = query.toLowerCase()
  return PROFILE_PATH_CATALOG.filter(
    (e) => e.path.toLowerCase().includes(lower) || e.label.toLowerCase().includes(lower),
  )
}
