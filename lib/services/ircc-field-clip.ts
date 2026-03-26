/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * IRCC Field-to-Clip Service
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Maps every validated IRCCProfile field into a "one-click copy" structure
 * formatted specifically for IRCC portal input fields.
 *
 * The goal: reduce context switching by 80% when completing IRCC online forms.
 */

import type { IRCCProfile, IRCCAddress, IRCCFamilyMember } from '@/lib/types/ircc-profile'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ClipField {
  /** Unique key for React rendering */
  key: string
  /** Human-readable label matching IRCC portal field labels */
  label: string
  /** The value to copy  -  formatted for IRCC portal */
  value: string
  /** Whether this field has a value */
  filled: boolean
  /** IRCC form reference (e.g. "IMM 5257 §2") */
  formRef?: string
}

export interface ClipSection {
  id: string
  title: string
  icon: string
  formRef: string
  fields: ClipField[]
  filledCount: number
  totalCount: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function f(key: string, label: string, value: string | number | boolean | null | undefined, formRef?: string): ClipField {
  const str = value === null || value === undefined || value === ''
    ? ''
    : typeof value === 'boolean'
      ? (value ? 'Yes' : 'No')
      : String(value)
  return { key, label, value: str, filled: str.length > 0, formRef }
}

function formatDate(d: string | undefined): string {
  if (!d) return ''
  // IRCC portal expects YYYY-MM-DD
  return d
}

function formatAddress(addr: Partial<IRCCAddress> | undefined): string {
  if (!addr) return ''
  const parts = [
    addr.apt_unit ? `Unit ${addr.apt_unit}` : '',
    addr.street_number,
    addr.street_name,
    addr.city,
    addr.province_state,
    addr.postal_code,
    addr.country,
  ].filter(Boolean)
  return parts.join(', ')
}

function formatAddressFields(prefix: string, label: string, addr: Partial<IRCCAddress> | undefined, formRef: string): ClipField[] {
  if (!addr) return [f(`${prefix}_full`, label, '', formRef)]
  return [
    f(`${prefix}_unit`, `${label}  -  Unit/Apt`, addr.apt_unit, formRef),
    f(`${prefix}_street_num`, `${label}  -  Street No.`, addr.street_number, formRef),
    f(`${prefix}_street_name`, `${label}  -  Street Name`, addr.street_name, formRef),
    f(`${prefix}_city`, `${label}  -  City/Town`, addr.city, formRef),
    f(`${prefix}_province`, `${label}  -  Province/State`, addr.province_state, formRef),
    f(`${prefix}_postal`, `${label}  -  Postal Code`, addr.postal_code, formRef),
    f(`${prefix}_country`, `${label}  -  Country`, addr.country, formRef),
  ]
}

function formatFamilyMember(prefix: string, label: string, member: Partial<IRCCFamilyMember> | undefined, formRef: string): ClipField[] {
  if (!member) return []
  return [
    f(`${prefix}_family_name`, `${label}  -  Family Name`, member.family_name, formRef),
    f(`${prefix}_given_name`, `${label}  -  Given Name`, member.given_name, formRef),
    f(`${prefix}_dob`, `${label}  -  Date of Birth`, formatDate(member.date_of_birth), formRef),
    f(`${prefix}_birth_country`, `${label}  -  Country of Birth`, member.country_of_birth, formRef),
    f(`${prefix}_marital`, `${label}  -  Marital Status`, member.marital_status, formRef),
    f(`${prefix}_occupation`, `${label}  -  Occupation`, member.occupation, formRef),
    f(`${prefix}_address`, `${label}  -  Address`, member.address, formRef),
  ].filter(fld => fld.value !== '')
}

// ─── Main Builder ────────────────────────────────────────────────────────────

/**
 * Build all clip sections from an IRCCProfile.
 * Returns sections organized to match IRCC portal form order.
 */
export function buildClipSections(profile: IRCCProfile): ClipSection[] {
  const sections: ClipSection[] = []

  // 1. Personal Details
  const personal: ClipField[] = [
    f('personal_family_name',     'Family Name',              profile.personal.family_name, 'IMM 5257 §2'),
    f('personal_given_name',      'Given Name(s)',            profile.personal.given_name, 'IMM 5257 §2'),
    f('personal_alias_family',    'Alias Family Name',        profile.personal.alias_family_name, 'IMM 5257 §2'),
    f('personal_alias_given',     'Alias Given Name',         profile.personal.alias_given_name, 'IMM 5257 §2'),
    f('personal_uci',             'UCI / Client ID',          profile.personal.uci_number, 'IMM 5257 §1'),
    f('personal_sex',             'Sex',                      profile.personal.sex, 'IMM 5257 §2'),
    f('personal_dob',             'Date of Birth',            formatDate(profile.personal.date_of_birth), 'IMM 5257 §2'),
    f('personal_birth_city',      'City/Town of Birth',       profile.personal.place_of_birth_city, 'IMM 5257 §2'),
    f('personal_birth_country',   'Country of Birth',         profile.personal.place_of_birth_country, 'IMM 5257 §2'),
    f('personal_citizenship',     'Citizenship',              profile.personal.citizenship, 'IMM 5257 §2'),
    f('personal_2nd_citizenship', 'Second Citizenship',       profile.personal.second_citizenship, 'IMM 5257 §2'),
    f('personal_cor',             'Current Country of Residence', profile.personal.current_country_of_residence, 'IMM 5257 §2'),
    f('personal_residence_status','Residence Status',         profile.personal.residence_status, 'IMM 5257 §2'),
    f('personal_cor_from',        'Residing Since',           formatDate(profile.personal.cor_from_date), 'IMM 5257 §2'),
    f('personal_eye_colour',      'Eye Colour',               profile.personal.eye_colour, 'IMM 5257 §2'),
    f('personal_height',          'Height (cm)',              profile.personal.height_cm, 'IMM 5257 §2'),
  ]
  sections.push(makeSection('personal', 'Personal Details', 'user', 'IMM 5257 §2', personal))

  // 2. Language
  const language: ClipField[] = [
    f('lang_native',     'Native Language',       profile.language.native_language, 'IMM 5257 §4'),
    f('lang_english',    'English Ability',       profile.language.english_ability, 'IMM 5257 §4'),
    f('lang_french',     'French Ability',        profile.language.french_ability, 'IMM 5257 §4'),
    f('lang_preferred',  'Preferred Language',     profile.language.preferred_language, 'IMM 5257 §4'),
    f('lang_interview',  'Language of Interview',  profile.language.language_of_interview, 'IMM 5257 §4'),
  ]
  sections.push(makeSection('language', 'Language', 'languages', 'IMM 5257 §4', language))

  // 3. Passport / Travel Document
  const passport: ClipField[] = [
    f('passport_number',        'Passport Number',      profile.passport.number, 'IMM 5257 §5'),
    f('passport_country',       'Country of Issue',     profile.passport.country_of_issue, 'IMM 5257 §5'),
    f('passport_issue_date',    'Issue Date',           formatDate(profile.passport.issue_date), 'IMM 5257 §5'),
    f('passport_expiry_date',   'Expiry Date',          formatDate(profile.passport.expiry_date), 'IMM 5257 §5'),
    f('passport_nat_id',        'National ID Number',   profile.passport.national_id_number, 'IMM 5257 §5'),
    f('passport_nat_id_country','National ID Country',  profile.passport.national_id_country, 'IMM 5257 §5'),
    f('passport_us_pr',         'US PR Card Number',    profile.passport.us_pr_card_number, 'IMM 5257 §5'),
  ]
  sections.push(makeSection('passport', 'Passport / Travel Document', 'credit-card', 'IMM 5257 §5', passport))

  // 4. Marital Status
  const marital: ClipField[] = [
    f('marital_status',          'Marital Status',              profile.marital.status, 'IMM 5257 §3'),
    f('marital_date',            'Date of Relationship',        formatDate(profile.marital.date_of_current_relationship), 'IMM 5257 §3'),
    f('marital_spouse_family',   'Spouse Family Name',          profile.marital.spouse_family_name, 'IMM 5257 §3'),
    f('marital_spouse_given',    'Spouse Given Name',           profile.marital.spouse_given_name, 'IMM 5257 §3'),
    f('marital_spouse_dob',      'Spouse Date of Birth',        formatDate(profile.marital.spouse_date_of_birth), 'IMM 5257 §3'),
    f('marital_prev_married',    'Previously Married',          profile.marital.was_previously_married, 'IMM 5257 §3'),
  ]
  sections.push(makeSection('marital', 'Marital Status', 'heart', 'IMM 5257 §3', marital))

  // 5. Contact Information
  const contact: ClipField[] = [
    ...formatAddressFields('mail', 'Mailing Address', profile.contact_info.mailing_address, 'IMM 5257 §6'),
    f('contact_same_as_mailing', 'Residential Same as Mailing', profile.contact_info.same_as_mailing, 'IMM 5257 §6'),
    ...formatAddressFields('res', 'Residential Address', profile.contact_info.residential_address, 'IMM 5257 §6'),
    f('contact_telephone',       'Telephone',                    profile.contact_info.telephone, 'IMM 5257 §6'),
    f('contact_alt_telephone',   'Alt Telephone',                profile.contact_info.alt_telephone, 'IMM 5257 §6'),
    f('contact_fax',             'Fax',                          profile.contact_info.fax, 'IMM 5257 §6'),
    f('contact_email',           'Email',                        profile.contact_info.email, 'IMM 5257 §6'),
  ]
  sections.push(makeSection('contact', 'Contact Information', 'phone', 'IMM 5257 §6', contact))

  // 6. Family Information
  const family: ClipField[] = [
    ...formatFamilyMember('spouse', 'Spouse/Partner', profile.family.spouse, 'IMM 5406 §B'),
    ...formatFamilyMember('mother', 'Mother', profile.family.mother, 'IMM 5406 §C'),
    ...formatFamilyMember('father', 'Father', profile.family.father, 'IMM 5406 §C'),
    ...(profile.family.children ?? []).flatMap((child, i) =>
      formatFamilyMember(`child_${i}`, `Child ${i + 1}`, child, 'IMM 5406 §D')
    ),
    ...(profile.family.siblings ?? []).flatMap((sib, i) =>
      formatFamilyMember(`sibling_${i}`, `Sibling ${i + 1}`, sib, 'IMM 5406 §E')
    ),
  ]
  if (family.length > 0) {
    sections.push(makeSection('family', 'Family Information', 'users', 'IMM 5406', family))
  }

  // 7. Details of Visit
  const visit: ClipField[] = [
    f('visit_type',     'Visa Type',         profile.visit.visa_type, 'IMM 5257 §8'),
    f('visit_purpose',  'Purpose of Visit',  profile.visit.purpose, 'IMM 5257 §8'),
    f('visit_details',  'Purpose Details',   profile.visit.purpose_details, 'IMM 5257 §8'),
    f('visit_from',     'From Date',         formatDate(profile.visit.from_date), 'IMM 5257 §8'),
    f('visit_to',       'To Date',           formatDate(profile.visit.to_date), 'IMM 5257 §8'),
    f('visit_funds',    'Funds Available (CAD)', profile.visit.funds_available_cad, 'IMM 5257 §8'),
  ]
  sections.push(makeSection('visit', 'Details of Visit', 'plane', 'IMM 5257 §8', visit))

  // 8. Education
  const education: ClipField[] = [
    f('edu_post_secondary', 'Has Post-Secondary', profile.education.has_post_secondary, 'IMM 5257 §9'),
    f('edu_highest_level',  'Highest Level',      profile.education.highest_level, 'IMM 5257 §9'),
    f('edu_total_years',    'Total Years',         profile.education.total_years, 'IMM 5257 §9'),
    ...(profile.education.history ?? []).flatMap((entry, i) => [
      f(`edu_${i}_institution`, `Education ${i + 1}  -  Institution`,   entry.institution, 'IMM 5257 §9'),
      f(`edu_${i}_field`,       `Education ${i + 1}  -  Field of Study`, entry.field_of_study, 'IMM 5257 §9'),
      f(`edu_${i}_diploma`,     `Education ${i + 1}  -  Diploma/Degree`, entry.diploma_degree, 'IMM 5257 §9'),
      f(`edu_${i}_from`,        `Education ${i + 1}  -  From`,          formatDate(entry.from_date), 'IMM 5257 §9'),
      f(`edu_${i}_to`,          `Education ${i + 1}  -  To`,            formatDate(entry.to_date), 'IMM 5257 §9'),
      f(`edu_${i}_city`,        `Education ${i + 1}  -  City`,          entry.city, 'IMM 5257 §9'),
      f(`edu_${i}_country`,     `Education ${i + 1}  -  Country`,       entry.country, 'IMM 5257 §9'),
    ]),
  ]
  sections.push(makeSection('education', 'Education', 'graduation-cap', 'IMM 5257 §9', education))

  // 9. Employment
  const employment: ClipField[] = [
    f('emp_current', 'Current Occupation', profile.employment.current_occupation, 'IMM 5257 §10'),
    ...(profile.employment.history ?? []).flatMap((entry, i) => [
      f(`emp_${i}_employer`, `Employment ${i + 1}  -  Employer`,  entry.employer, 'IMM 5257 §10'),
      f(`emp_${i}_title`,    `Employment ${i + 1}  -  Title`,     entry.title, 'IMM 5257 §10'),
      f(`emp_${i}_type`,     `Employment ${i + 1}  -  Type`,      entry.activity_type, 'IMM 5257 §10'),
      f(`emp_${i}_from`,     `Employment ${i + 1}  -  From`,      formatDate(entry.from_date), 'IMM 5257 §10'),
      f(`emp_${i}_to`,       `Employment ${i + 1}  -  To`,        formatDate(entry.to_date), 'IMM 5257 §10'),
      f(`emp_${i}_city`,     `Employment ${i + 1}  -  City`,      entry.city, 'IMM 5257 §10'),
      f(`emp_${i}_country`,  `Employment ${i + 1}  -  Country`,   entry.country, 'IMM 5257 §10'),
    ]),
  ]
  sections.push(makeSection('employment', 'Employment', 'briefcase', 'IMM 5257 §10', employment))

  // 10. Background
  const background: ClipField[] = [
    f('bg_tb',           'TB Contact',                profile.background.tuberculosis_contact, 'IMM 5257 §11'),
    f('bg_disorder',     'Physical/Mental Disorder',  profile.background.physical_mental_disorder, 'IMM 5257 §11'),
    f('bg_overstayed',   'Overstayed Visa',           profile.background.overstayed_visa, 'IMM 5257 §11'),
    f('bg_refused',      'Refused Visa/Entry',        profile.background.refused_visa, 'IMM 5257 §11'),
    f('bg_criminal',     'Criminal Record',           profile.background.criminal_record, 'IMM 5257 §11'),
    f('bg_deported',     'Deported/Excluded',         profile.background.deported, 'IMM 5257 §11'),
    f('bg_military',     'Military Service',          profile.background.military_service, 'IMM 5257 §11'),
    f('bg_war_crimes',   'War Crimes',                profile.background.war_crimes, 'IMM 5257 §11'),
  ]
  sections.push(makeSection('background', 'Background / Security', 'shield', 'IMM 5257 §11', background))

  // 11. Representative (if exists)
  if (profile.representative?.has_representative) {
    const rep: ClipField[] = [
      f('rep_type',       'Representative Type',  profile.representative.rep_type, 'IMM 5476E'),
      f('rep_family_name','Family Name',          profile.representative.rep_family_name, 'IMM 5476E'),
      f('rep_given_name', 'Given Name',           profile.representative.rep_given_name, 'IMM 5476E'),
      f('rep_org',        'Organisation',         profile.representative.rep_organization, 'IMM 5476E'),
      f('rep_membership', 'Membership ID',        profile.representative.rep_membership_id, 'IMM 5476E'),
      f('rep_telephone',  'Telephone',            profile.representative.rep_telephone, 'IMM 5476E'),
      f('rep_email',      'Email',                profile.representative.rep_email, 'IMM 5476E'),
    ]
    sections.push(makeSection('representative', 'Representative', 'scale', 'IMM 5476E', rep))
  }

  return sections
}

function makeSection(id: string, title: string, icon: string, formRef: string, fields: ClipField[]): ClipSection {
  const filledCount = fields.filter(f => f.filled).length
  return { id, title, icon, formRef, fields, filledCount, totalCount: fields.length }
}

// ─── Default Submission Checklist Items ──────────────────────────────────────

export interface DefaultChecklistItem {
  item_key: string
  label: string
  category: 'form' | 'document' | 'fee' | 'biometric' | 'other'
  sort_order: number
  is_required: boolean
}

/**
 * Standard IRCC submission checklist items.
 * Used to seed ircc_submission_checklist when a matter's SBS tab is first opened.
 */
export const DEFAULT_SUBMISSION_CHECKLIST: DefaultChecklistItem[] = [
  { item_key: 'imm5257_upload',      label: 'IMM 5257  -  Application Form',           category: 'form',       sort_order: 1,  is_required: true },
  { item_key: 'imm5645_upload',      label: 'IMM 5645  -  Family Information',          category: 'form',       sort_order: 2,  is_required: true },
  { item_key: 'imm5406_upload',      label: 'IMM 5406  -  Additional Family',           category: 'form',       sort_order: 3,  is_required: false },
  { item_key: 'imm5476_upload',      label: 'IMM 5476  -  Use of Representative',       category: 'form',       sort_order: 4,  is_required: true },
  { item_key: 'passport_copy',       label: 'Passport Bio Page Copy',                  category: 'document',   sort_order: 10, is_required: true },
  { item_key: 'photo_upload',        label: 'Digital Photo (35mm x 45mm)',              category: 'document',   sort_order: 11, is_required: true },
  { item_key: 'travel_history',      label: 'Travel History / Entry Stamps',           category: 'document',   sort_order: 12, is_required: false },
  { item_key: 'proof_of_funds',      label: 'Proof of Financial Support',              category: 'document',   sort_order: 13, is_required: true },
  { item_key: 'invitation_letter',   label: 'Letter of Invitation (if applicable)',    category: 'document',   sort_order: 14, is_required: false },
  { item_key: 'employment_letter',   label: 'Employment Letter',                       category: 'document',   sort_order: 15, is_required: false },
  { item_key: 'purpose_of_travel',   label: 'Purpose of Travel Document',              category: 'document',   sort_order: 16, is_required: false },
  { item_key: 'processing_fee',      label: 'Processing Fee Payment ($100 CAD)',        category: 'fee',        sort_order: 20, is_required: true },
  { item_key: 'biometric_fee',       label: 'Biometrics Fee Payment ($85 CAD)',         category: 'fee',        sort_order: 21, is_required: true },
  { item_key: 'biometric_collection', label: 'Biometrics Collection',                    category: 'biometric',  sort_order: 22, is_required: true },
  { item_key: 'consent_release',     label: 'Consent & Declaration Signed',            category: 'other',      sort_order: 30, is_required: true },
]
