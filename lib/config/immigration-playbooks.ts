/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Immigration Playbooks — Sequence Control Configuration
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Code-defined playbook for each immigration matter type. Determines:
 *   - Which person roles are required
 *   - Which questionnaire sections are mandatory
 *   - Which document slugs must be accepted (not just uploaded)
 *   - Which IRCC form packs apply
 *   - Readiness rules for form generation and filing
 *   - Which contradiction checks to run
 *   - Reminder cadence and lawyer review requirements
 *
 * Keyed by `program_category_key` from `matter_types` table (migration 059).
 * Values: spousal, work_permit, study_permit, express_entry, refugee,
 *         visitor_visa, citizenship, lmia
 *
 * Design: Code-defined because these rules are complex, immigration-specific,
 * rarely change, and benefit from type safety over database configurability.
 */

import type { PackType } from '@/lib/types/form-packs'

// ── Types ────────────────────────────────────────────────────────────────────

export interface PersonRoleRequirement {
  /** Person role key from matter_people.person_role */
  role: 'principal_applicant' | 'spouse' | 'dependent' | 'co_sponsor' | 'other'
  /** If set, this person is only required when condition evaluates true */
  condition?: {
    /** Field on the PA or intake to check */
    field: string
    /** Comparison operator */
    operator: 'equals' | 'in' | 'gt'
    /** Expected value(s) */
    value: unknown
  }
  /** Minimum fields that must be filled on this person */
  minimumFields: string[]
}

export interface FormGenerationRule {
  /** Minimum questionnaire completion % before form generation allowed */
  minQuestionnairePct: number
  /** Document slugs that must have slot status = 'accepted' before generation */
  requiredDocumentSlugs: string[]
  /** Whether unresolved blocking contradictions prevent generation */
  requireNoUnresolvedContradictions: boolean
}

export interface FilingReadinessRule {
  /** All mandatory document slots must be accepted */
  requireAllMandatoryDocsAccepted: boolean
  /** All applicable form packs must be generated (at least draft) */
  requireAllFormPacksGenerated: boolean
  /** Lawyer must approve before filing */
  requireLawyerReview: boolean
  /** No active blocking contradictions */
  requireNoActiveContradictions: boolean
  /** No documents in pending_review status */
  requireNoPendingReviews: boolean
}

/** Keys matching contradiction rule functions in contradiction-engine.ts */
export type ContradictionRuleKey =
  | 'married_no_spouse'
  | 'dependent_declared_no_info'
  | 'prior_refusal_inconsistent'
  | 'passport_incomplete'
  | 'person_missing_required_docs'
  | 'spouse_no_relationship_docs'
  | 'expired_passport'
  | 'status_expiry_approaching'
  | 'criminal_no_details'
  | 'inadmissibility_no_details'

// ── Readiness Matrix Types ──────────────────────────────────────────────────

/** The 6 readiness domains evaluated by the matrix engine */
export type ReadinessDomain =
  | 'client_identity'
  | 'family_composition'
  | 'immigration_history'
  | 'program_eligibility'
  | 'evidence'
  | 'review_risk'

/** Which person role a rule applies to */
export type PersonRoleScope = 'pa' | 'spouse' | 'dependent' | 'co_sponsor' | 'all'

/** Per-field questionnaire rule for the readiness matrix */
export interface QuestionnaireFieldRule {
  /** Dot-notation path into contacts.immigration_data */
  profile_path: string
  /** Human-readable label for blocker display */
  label: string
  /** Which readiness domain this field belongs to */
  readiness_domain: ReadinessDomain
  /** Which person role this field applies to */
  person_role_scope: PersonRoleScope
  /** If true, missing value blocks form pack generation */
  blocks_drafting: boolean
  /** If true, missing value blocks filing */
  blocks_filing: boolean
  /** If non-null, who must review this field's value */
  review_role_required: string | null
}

/** Per-document rule for the readiness matrix */
export interface DocumentRule {
  /** Matches document_slot_templates.slot_slug */
  slot_slug: string
  /** Human-readable label */
  label: string
  /** Which readiness domain */
  readiness_domain: ReadinessDomain
  /** Which person role */
  person_role_scope: PersonRoleScope
  /** If true, document must be accepted before drafting */
  blocks_drafting: boolean
  /** If true, document must be accepted before filing */
  blocks_filing: boolean
  /** Whether a certified translation is required */
  translation_required: boolean
  /** Expiry rule for this document */
  expiry_rule: 'must_not_be_expired' | 'within_6_months' | 'within_1_year' | null
}

/** Condition that auto-triggers lawyer review */
export interface LawyerReviewTrigger {
  /** Unique key for programmatic handling */
  key: string
  /** Field path to evaluate */
  condition_field: string
  /** Source: 'people' checks PA row, 'immigration' checks matter_immigration */
  condition_source: 'people' | 'immigration'
  /** Comparison operator */
  condition_operator: 'truthy' | 'equals' | 'gt' | 'lt' | 'in'
  /** Expected value for equals/gt/in operators */
  condition_value?: unknown
  /** Human-readable reason displayed in the UI */
  message: string
}

export interface ImmigrationPlaybook {
  /** Matches matter_types.program_category_key */
  matterTypeKey: string
  /** Human-readable label */
  label: string
  /** Required person roles with conditions and minimum fields */
  personRoleRequirements: PersonRoleRequirement[]
  /** Questionnaire sections that must be completed */
  questionnaireSections: string[]
  /** Document slot slugs that must be accepted (not just uploaded) */
  mandatoryDocumentSlugs: string[]
  /** Whether lawyer must sign off before filing */
  lawyerReviewRequired: boolean
  /** Reminder schedule in days after request */
  reminderCadenceDays: number[]
  /** Which IRCC form packs apply to this matter type */
  formPackTypes: PackType[]
  /** Rules controlling when form generation is allowed */
  formGenerationRules: FormGenerationRule
  /** Rules controlling when matter can be marked ready for filing */
  filingReadinessRules: FilingReadinessRule
  /** Which contradiction checks to run */
  contradictionRules: ContradictionRuleKey[]

  // ── Readiness Matrix (optional — only defined for matrix-enabled streams) ──

  /** Per-field questionnaire rules for the readiness matrix */
  questionnaireFieldRules?: QuestionnaireFieldRule[]
  /** Per-document rules for the readiness matrix */
  documentRules?: DocumentRule[]
  /** Conditions that auto-trigger lawyer review */
  lawyerReviewTriggers?: LawyerReviewTrigger[]
  /** Minimum overall readiness % to consider filing-ready (default: 85) */
  readinessThreshold?: number
}

// ── Common field sets ────────────────────────────────────────────────────────

const PA_MINIMUM_FIELDS = [
  'first_name',
  'last_name',
  'date_of_birth',
  'nationality',
  'passport_number',
  'passport_expiry',
  'immigration_status',
  'country_of_residence',
  'marital_status',
  'email',
]

const SPOUSE_MINIMUM_FIELDS = [
  'first_name',
  'last_name',
  'date_of_birth',
  'nationality',
  'passport_number',
  'passport_expiry',
  'country_of_residence',
]

const DEPENDENT_MINIMUM_FIELDS = [
  'first_name',
  'last_name',
  'date_of_birth',
  'nationality',
  'relationship_to_pa',
]

const COMMON_CONTRADICTION_RULES: ContradictionRuleKey[] = [
  'married_no_spouse',
  'dependent_declared_no_info',
  'passport_incomplete',
  'expired_passport',
  'status_expiry_approaching',
  'criminal_no_details',
  'inadmissibility_no_details',
]

const DEFAULT_REMINDER_CADENCE = [2, 5, 10]

// ── Playbooks ────────────────────────────────────────────────────────────────

const SPOUSAL_SPONSORSHIP: ImmigrationPlaybook = {
  matterTypeKey: 'spousal',
  label: 'Spousal Sponsorship',
  personRoleRequirements: [
    {
      role: 'principal_applicant',
      minimumFields: PA_MINIMUM_FIELDS,
    },
    {
      role: 'spouse',
      minimumFields: SPOUSE_MINIMUM_FIELDS,
    },
    {
      role: 'dependent',
      condition: { field: 'number_of_dependents', operator: 'gt', value: 0 },
      minimumFields: DEPENDENT_MINIMUM_FIELDS,
    },
  ],
  questionnaireSections: [
    'personal',
    'contact_info',
    'marital',
    'family',
    'relationship',
    'financial',
    'background',
  ],
  mandatoryDocumentSlugs: [
    'sponsor_passport',
    'applicant_passport',
    'marriage_certificate',
    'sponsor_pr_card_citizenship',
    'digital_photos_ircc_specs',
    'relationship_photos_timeline',
    'chat_communication_history',
    'statutory_declarations_from_third_parties',
    'sponsor_tax_returns_noa_3_years',
    'sponsor_employment_letter',
    'police_clearance_sponsor',
    'police_clearance_applicant',
    'medical_exam_results_ime',
  ],
  lawyerReviewRequired: true,
  reminderCadenceDays: DEFAULT_REMINDER_CADENCE,
  formPackTypes: [],
  formGenerationRules: {
    minQuestionnairePct: 80,
    requiredDocumentSlugs: [
      'sponsor_passport',
      'applicant_passport',
      'marriage_certificate',
      'digital_photos_ircc_specs',
    ],
    requireNoUnresolvedContradictions: true,
  },
  filingReadinessRules: {
    requireAllMandatoryDocsAccepted: true,
    requireAllFormPacksGenerated: true,
    requireLawyerReview: true,
    requireNoActiveContradictions: true,
    requireNoPendingReviews: true,
  },
  contradictionRules: [
    ...COMMON_CONTRADICTION_RULES,
    'prior_refusal_inconsistent',
    'spouse_no_relationship_docs',
    'person_missing_required_docs',
  ],

  // ── Readiness Matrix ──────────────────────────────────────────────────────

  readinessThreshold: 90,

  questionnaireFieldRules: [
    // Domain: client_identity (sponsor)
    { profile_path: 'personal.family_name', label: 'Sponsor family name', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.given_name', label: 'Sponsor given name', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.date_of_birth', label: 'Sponsor date of birth', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.citizenship', label: 'Sponsor citizenship', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'passport.number', label: 'Sponsor passport number', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'passport.expiry_date', label: 'Sponsor passport expiry', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'contact_info.email', label: 'Sponsor e-mail', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    { profile_path: 'contact_info.mailing_address', label: 'Sponsor mailing address', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    // Domain: family_composition
    { profile_path: 'marital.status', label: 'Marital status', readiness_domain: 'family_composition', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'marital.date_of_current_relationship', label: 'Date of marriage / union', readiness_domain: 'family_composition', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: 'lawyer' },
    { profile_path: 'marital.spouse_family_name', label: 'Applicant (spouse) family name', readiness_domain: 'family_composition', person_role_scope: 'spouse', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'marital.spouse_given_name', label: 'Applicant (spouse) given name', readiness_domain: 'family_composition', person_role_scope: 'spouse', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'marital.spouse_date_of_birth', label: 'Applicant (spouse) date of birth', readiness_domain: 'family_composition', person_role_scope: 'spouse', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    // Domain: immigration_history
    { profile_path: 'personal.current_country_of_residence', label: 'Sponsor country of residence', readiness_domain: 'immigration_history', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    // Domain: program_eligibility (spousal-specific)
    { profile_path: 'sponsor.income_meets_lico', label: 'Income meets LICO (if applicable)', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: 'lawyer' },
    { profile_path: 'sponsor.pr_or_citizen_status', label: 'Sponsor PR/citizen status', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'relationship.cohabitation_history', label: 'Cohabitation history', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: 'lawyer' },
  ],

  documentRules: [
    { slot_slug: 'sponsor_passport', label: 'Sponsor passport', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, translation_required: false, expiry_rule: 'must_not_be_expired' },
    { slot_slug: 'applicant_passport', label: 'Applicant passport', readiness_domain: 'client_identity', person_role_scope: 'spouse', blocks_drafting: true, blocks_filing: true, translation_required: false, expiry_rule: 'must_not_be_expired' },
    { slot_slug: 'marriage_certificate', label: 'Marriage certificate', readiness_domain: 'family_composition', person_role_scope: 'all', blocks_drafting: true, blocks_filing: true, translation_required: true, expiry_rule: null },
    { slot_slug: 'sponsor_pr_card_citizenship', label: 'Sponsor PR card / citizenship cert', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'digital_photos_ircc_specs', label: 'Digital photos (IRCC specs)', readiness_domain: 'client_identity', person_role_scope: 'all', blocks_drafting: true, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'relationship_photos_timeline', label: 'Relationship photos (timeline)', readiness_domain: 'program_eligibility', person_role_scope: 'all', blocks_drafting: false, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'chat_communication_history', label: 'Chat / communication history', readiness_domain: 'program_eligibility', person_role_scope: 'all', blocks_drafting: false, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'joint_financial_documents', label: 'Joint financial documents', readiness_domain: 'evidence', person_role_scope: 'all', blocks_drafting: false, blocks_filing: false, translation_required: true, expiry_rule: null },
    { slot_slug: 'statutory_declarations_from_third_parties', label: 'Statutory declarations', readiness_domain: 'evidence', person_role_scope: 'all', blocks_drafting: false, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'sponsor_tax_returns_noa_3_years', label: 'Sponsor tax returns / NOA (3 years)', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'sponsor_employment_letter', label: 'Sponsor employment letter', readiness_domain: 'evidence', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: false, expiry_rule: 'within_6_months' },
    { slot_slug: 'police_clearance_sponsor', label: 'Police clearance (sponsor)', readiness_domain: 'review_risk', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: true, expiry_rule: 'within_1_year' },
    { slot_slug: 'police_clearance_applicant', label: 'Police clearance (applicant)', readiness_domain: 'review_risk', person_role_scope: 'spouse', blocks_drafting: false, blocks_filing: true, translation_required: true, expiry_rule: 'within_1_year' },
    { slot_slug: 'medical_exam_results_ime', label: 'Medical exam results (IME)', readiness_domain: 'review_risk', person_role_scope: 'spouse', blocks_drafting: false, blocks_filing: true, translation_required: false, expiry_rule: 'within_1_year' },
  ],

  lawyerReviewTriggers: [
    { key: 'prior_refusal_detected', condition_field: 'prior_refusals', condition_source: 'immigration', condition_operator: 'truthy', message: 'Prior refusal detected — lawyer review required' },
    { key: 'criminal_record_detected', condition_field: 'has_criminal_record', condition_source: 'immigration', condition_operator: 'truthy', message: 'Criminal record disclosed — lawyer review required' },
    { key: 'inadmissibility_flagged', condition_field: 'inadmissibility_flag', condition_source: 'people', condition_operator: 'truthy', message: 'Inadmissibility flagged — lawyer review required' },
    { key: 'previous_marriage_detected', condition_field: 'previous_marriage', condition_source: 'people', condition_operator: 'truthy', message: 'Previous marriage detected — lawyer review recommended for relationship timeline' },
    { key: 'age_gap_large', condition_field: 'marital.age_gap_years', condition_source: 'immigration', condition_operator: 'gt', condition_value: 15, message: 'Large age gap between sponsor and applicant — lawyer review recommended' },
  ],
}

const WORK_PERMIT: ImmigrationPlaybook = {
  matterTypeKey: 'work_permit',
  label: 'Work Permit',
  personRoleRequirements: [
    {
      role: 'principal_applicant',
      minimumFields: PA_MINIMUM_FIELDS,
    },
    {
      role: 'spouse',
      condition: { field: 'marital_status', operator: 'in', value: ['married', 'common_law'] },
      minimumFields: SPOUSE_MINIMUM_FIELDS,
    },
    {
      role: 'dependent',
      condition: { field: 'number_of_dependents', operator: 'gt', value: 0 },
      minimumFields: DEPENDENT_MINIMUM_FIELDS,
    },
  ],
  questionnaireSections: [
    'personal',
    'contact_info',
    'employment',
    'education',
    'background',
  ],
  mandatoryDocumentSlugs: [
    'passport_all_pages',
    'digital_photos_ircc_specs',
    'job_offer_letter',
    'employment_contract',
    'resume_cv',
    'education_credentials',
    'police_clearance_certificates',
  ],
  lawyerReviewRequired: true,
  reminderCadenceDays: DEFAULT_REMINDER_CADENCE,
  formPackTypes: [],
  formGenerationRules: {
    minQuestionnairePct: 80,
    requiredDocumentSlugs: [
      'passport_all_pages',
      'digital_photos_ircc_specs',
      'job_offer_letter',
    ],
    requireNoUnresolvedContradictions: true,
  },
  filingReadinessRules: {
    requireAllMandatoryDocsAccepted: true,
    requireAllFormPacksGenerated: true,
    requireLawyerReview: true,
    requireNoActiveContradictions: true,
    requireNoPendingReviews: true,
  },
  contradictionRules: [
    ...COMMON_CONTRADICTION_RULES,
    'prior_refusal_inconsistent',
    'person_missing_required_docs',
  ],

  // ── Readiness Matrix ──────────────────────────────────────────────────────

  readinessThreshold: 85,

  questionnaireFieldRules: [
    // Domain: client_identity
    { profile_path: 'personal.family_name', label: 'Family name', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.given_name', label: 'Given name', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.date_of_birth', label: 'Date of birth', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.citizenship', label: 'Citizenship', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.sex', label: 'Sex', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'passport.number', label: 'Passport number', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'passport.expiry_date', label: 'Passport expiry', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'passport.country_of_issue', label: 'Passport country of issue', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'contact_info.email', label: 'E-mail address', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    { profile_path: 'contact_info.mailing_address', label: 'Mailing address', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    // Domain: family_composition
    { profile_path: 'marital.status', label: 'Marital status', readiness_domain: 'family_composition', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    // Domain: immigration_history
    { profile_path: 'personal.current_country_of_residence', label: 'Country of residence', readiness_domain: 'immigration_history', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    // Domain: program_eligibility (work-specific)
    { profile_path: 'employer.name', label: 'Employer name', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'employment.occupation_noc', label: 'Occupation / NOC code', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'employment.job_title', label: 'Job title', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    { profile_path: 'employment.start_date', label: 'Employment start date', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    { profile_path: 'employment.wage_offered', label: 'Wage offered', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    { profile_path: 'employment.lmia_number', label: 'LMIA number', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    { profile_path: 'employment.work_permit_duration', label: 'Work permit duration', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
  ],

  documentRules: [
    { slot_slug: 'passport_all_pages', label: 'Passport (all pages)', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, translation_required: false, expiry_rule: 'must_not_be_expired' },
    { slot_slug: 'digital_photos_ircc_specs', label: 'Digital photos (IRCC specs)', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'job_offer_letter', label: 'Job offer letter', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'employment_contract', label: 'Employment contract', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'resume_cv', label: 'Resume / CV', readiness_domain: 'evidence', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'education_credentials', label: 'Education credentials', readiness_domain: 'evidence', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: true, expiry_rule: null },
    { slot_slug: 'police_clearance_certificates', label: 'Police clearance certificates', readiness_domain: 'review_risk', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: true, expiry_rule: 'within_1_year' },
    { slot_slug: 'language_test_results', label: 'Language test results', readiness_domain: 'evidence', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: false, translation_required: false, expiry_rule: 'within_1_year' },
  ],

  lawyerReviewTriggers: [
    { key: 'prior_refusal_detected', condition_field: 'prior_refusals', condition_source: 'immigration', condition_operator: 'truthy', message: 'Prior refusal detected — lawyer review recommended' },
    { key: 'criminal_record_detected', condition_field: 'has_criminal_record', condition_source: 'immigration', condition_operator: 'truthy', message: 'Criminal record disclosed — lawyer review required' },
    { key: 'inadmissibility_flagged', condition_field: 'inadmissibility_flag', condition_source: 'people', condition_operator: 'truthy', message: 'Inadmissibility flagged — lawyer review required' },
    { key: 'lmia_exempt_claimed', condition_field: 'lmia_exempt', condition_source: 'immigration', condition_operator: 'truthy', message: 'LMIA exemption claimed — lawyer review recommended' },
    { key: 'open_work_permit_requested', condition_field: 'open_work_permit', condition_source: 'immigration', condition_operator: 'truthy', message: 'Open work permit requested — lawyer review recommended' },
    { key: 'employer_compliance_issue', condition_field: 'employer_compliance_flag', condition_source: 'immigration', condition_operator: 'truthy', message: 'Employer compliance issue flagged — lawyer review required' },
  ],
}

const STUDY_PERMIT: ImmigrationPlaybook = {
  matterTypeKey: 'study_permit',
  label: 'Study Permit',
  personRoleRequirements: [
    {
      role: 'principal_applicant',
      minimumFields: PA_MINIMUM_FIELDS,
    },
  ],
  questionnaireSections: [
    'personal',
    'contact_info',
    'education',
    'financial',
    'background',
  ],
  mandatoryDocumentSlugs: [
    'passport_all_pages',
    'digital_photos_ircc_specs',
    'letter_of_acceptance_dli',
    'transcripts_diplomas',
    'proof_of_funds_tuition_living',
    'bank_statements_6_months',
    'study_plan_statement_of_purpose',
    'police_clearance_certificates',
  ],
  lawyerReviewRequired: true,
  reminderCadenceDays: DEFAULT_REMINDER_CADENCE,
  formPackTypes: [],
  formGenerationRules: {
    minQuestionnairePct: 80,
    requiredDocumentSlugs: [
      'passport_all_pages',
      'digital_photos_ircc_specs',
      'letter_of_acceptance_dli',
      'proof_of_funds_tuition_living',
    ],
    requireNoUnresolvedContradictions: true,
  },
  filingReadinessRules: {
    requireAllMandatoryDocsAccepted: true,
    requireAllFormPacksGenerated: true,
    requireLawyerReview: true,
    requireNoActiveContradictions: true,
    requireNoPendingReviews: true,
  },
  contradictionRules: [
    ...COMMON_CONTRADICTION_RULES,
    'prior_refusal_inconsistent',
    'person_missing_required_docs',
  ],

  // ── Readiness Matrix ──────────────────────────────────────────────────────

  readinessThreshold: 85,

  questionnaireFieldRules: [
    // Domain: client_identity
    { profile_path: 'personal.family_name', label: 'Family name', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.given_name', label: 'Given name', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.date_of_birth', label: 'Date of birth', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.citizenship', label: 'Citizenship', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.sex', label: 'Sex', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'passport.number', label: 'Passport number', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'passport.expiry_date', label: 'Passport expiry', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'passport.country_of_issue', label: 'Passport country of issue', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'contact_info.email', label: 'E-mail address', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    { profile_path: 'contact_info.mailing_address', label: 'Mailing address', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    // Domain: family_composition
    { profile_path: 'marital.status', label: 'Marital status', readiness_domain: 'family_composition', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    // Domain: immigration_history
    { profile_path: 'personal.current_country_of_residence', label: 'Country of residence', readiness_domain: 'immigration_history', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    // Domain: program_eligibility (study-specific)
    { profile_path: 'study.dli_number', label: 'Designated Learning Institution (DLI) number', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'study.program_name', label: 'Programme of study', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    { profile_path: 'study.program_start_date', label: 'Programme start date', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    { profile_path: 'study.program_duration_months', label: 'Programme duration', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    { profile_path: 'study.tuition_amount', label: 'Tuition amount', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
  ],

  documentRules: [
    { slot_slug: 'passport_all_pages', label: 'Passport (all pages)', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, translation_required: false, expiry_rule: 'must_not_be_expired' },
    { slot_slug: 'digital_photos_ircc_specs', label: 'Digital photos (IRCC specs)', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'letter_of_acceptance_dli', label: 'Letter of acceptance from DLI', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'transcripts_diplomas', label: 'Transcripts / diplomas', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: true, expiry_rule: null },
    { slot_slug: 'proof_of_funds_tuition_living', label: 'Proof of funds (tuition + living)', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, translation_required: false, expiry_rule: 'within_6_months' },
    { slot_slug: 'bank_statements_6_months', label: 'Bank statements (6 months)', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: true, expiry_rule: 'within_6_months' },
    { slot_slug: 'gic_certificate', label: 'GIC certificate', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: false, translation_required: false, expiry_rule: null },
    { slot_slug: 'study_plan_statement_of_purpose', label: 'Study plan / statement of purpose', readiness_domain: 'evidence', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'language_test_results', label: 'Language test results', readiness_domain: 'evidence', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: false, translation_required: false, expiry_rule: 'within_1_year' },
    { slot_slug: 'police_clearance_certificates', label: 'Police clearance certificates', readiness_domain: 'review_risk', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: true, expiry_rule: 'within_1_year' },
    { slot_slug: 'medical_exam_results', label: 'Medical exam results', readiness_domain: 'review_risk', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: false, expiry_rule: 'within_1_year' },
  ],

  lawyerReviewTriggers: [
    { key: 'prior_refusal_detected', condition_field: 'prior_refusals', condition_source: 'immigration', condition_operator: 'truthy', message: 'Prior refusal detected — lawyer review recommended' },
    { key: 'criminal_record_detected', condition_field: 'has_criminal_record', condition_source: 'immigration', condition_operator: 'truthy', message: 'Criminal record disclosed — lawyer review required' },
    { key: 'inadmissibility_flagged', condition_field: 'inadmissibility_flag', condition_source: 'people', condition_operator: 'truthy', message: 'Inadmissibility flagged — lawyer review required' },
    { key: 'study_gap_detected', condition_field: 'study.gap_in_studies', condition_source: 'immigration', condition_operator: 'truthy', message: 'Gap in studies detected — lawyer review recommended' },
  ],
}

const PR_EXPRESS_ENTRY: ImmigrationPlaybook = {
  matterTypeKey: 'express_entry',
  label: 'Permanent Residence / Express Entry',
  personRoleRequirements: [
    {
      role: 'principal_applicant',
      minimumFields: PA_MINIMUM_FIELDS,
    },
    {
      role: 'spouse',
      condition: { field: 'marital_status', operator: 'in', value: ['married', 'common_law'] },
      minimumFields: SPOUSE_MINIMUM_FIELDS,
    },
    {
      role: 'dependent',
      condition: { field: 'number_of_dependents', operator: 'gt', value: 0 },
      minimumFields: DEPENDENT_MINIMUM_FIELDS,
    },
  ],
  questionnaireSections: [
    'personal',
    'contact_info',
    'language_education',
    'employment_work',
    'financial',
    'family',
    'background',
  ],
  mandatoryDocumentSlugs: [
    'passport_all_pages',
    'birth_certificate',
    'digital_photos_ircc_specs',
    'ielts_celpip_results',
    'eca_report_wes_iqas',
    'university_transcripts',
    'degree_certificates',
    'employment_reference_letters',
    'bank_statements_6_months',
    'proof_of_settlement_funds',
    'police_clearance_certificates',
    'medical_exam_results_ime',
  ],
  lawyerReviewRequired: true,
  reminderCadenceDays: DEFAULT_REMINDER_CADENCE,
  formPackTypes: [],
  formGenerationRules: {
    minQuestionnairePct: 80,
    requiredDocumentSlugs: [
      'passport_all_pages',
      'digital_photos_ircc_specs',
      'ielts_celpip_results',
      'eca_report_wes_iqas',
    ],
    requireNoUnresolvedContradictions: true,
  },
  filingReadinessRules: {
    requireAllMandatoryDocsAccepted: true,
    requireAllFormPacksGenerated: true,
    requireLawyerReview: true,
    requireNoActiveContradictions: true,
    requireNoPendingReviews: true,
  },
  contradictionRules: [
    ...COMMON_CONTRADICTION_RULES,
    'prior_refusal_inconsistent',
    'person_missing_required_docs',
  ],

  // ── Readiness Matrix ──────────────────────────────────────────────────────

  readinessThreshold: 90,

  questionnaireFieldRules: [
    // Domain: client_identity
    { profile_path: 'personal.family_name', label: 'Family name', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.given_name', label: 'Given name', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.date_of_birth', label: 'Date of birth', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.citizenship', label: 'Citizenship', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.sex', label: 'Sex', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'passport.number', label: 'Passport number', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'passport.expiry_date', label: 'Passport expiry', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'passport.country_of_issue', label: 'Passport country of issue', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'contact_info.email', label: 'E-mail address', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    { profile_path: 'contact_info.mailing_address', label: 'Mailing address', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    // Domain: family_composition
    { profile_path: 'marital.status', label: 'Marital status', readiness_domain: 'family_composition', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.given_name', label: 'Spouse name', readiness_domain: 'family_composition', person_role_scope: 'spouse', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.number_of_dependents', label: 'Number of dependents', readiness_domain: 'family_composition', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    // Domain: immigration_history
    { profile_path: 'personal.current_country_of_residence', label: 'Country of residence', readiness_domain: 'immigration_history', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.current_immigration_status', label: 'Current immigration status', readiness_domain: 'immigration_history', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    // Domain: program_eligibility (Express Entry specific)
    { profile_path: 'pr_status.crs_score', label: 'CRS score', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'pr_status.ee_profile_number', label: 'Express Entry profile number', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    { profile_path: 'language.primary_official_language', label: 'Primary official language', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    { profile_path: 'language.clb_level', label: 'CLB level', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'education.highest_level', label: 'Highest education level', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    { profile_path: 'employment.total_work_experience_years', label: 'Total work experience (years)', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    { profile_path: 'employment.canadian_work_experience_years', label: 'Canadian work experience (years)', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    { profile_path: 'financial.settlement_funds', label: 'Settlement funds', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
  ],

  documentRules: [
    { slot_slug: 'passport_all_pages', label: 'Passport (all pages)', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, translation_required: false, expiry_rule: 'must_not_be_expired' },
    { slot_slug: 'birth_certificate', label: 'Birth certificate', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, translation_required: true, expiry_rule: null },
    { slot_slug: 'digital_photos_ircc_specs', label: 'Digital photos (IRCC specs)', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'ielts_celpip_results', label: 'IELTS / CELPIP results', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, translation_required: false, expiry_rule: 'within_1_year' },
    { slot_slug: 'eca_report_wes_iqas', label: 'ECA report (WES / IQAS)', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'university_transcripts', label: 'University transcripts', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: true, expiry_rule: null },
    { slot_slug: 'degree_certificates', label: 'Degree certificates', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: true, expiry_rule: null },
    { slot_slug: 'employment_reference_letters', label: 'Employment reference letters', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: true, expiry_rule: null },
    { slot_slug: 'bank_statements_6_months', label: 'Bank statements (6 months)', readiness_domain: 'evidence', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: true, expiry_rule: 'within_6_months' },
    { slot_slug: 'proof_of_settlement_funds', label: 'Proof of settlement funds', readiness_domain: 'evidence', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: false, expiry_rule: 'within_6_months' },
    { slot_slug: 'police_clearance_certificates', label: 'Police clearance certificates', readiness_domain: 'review_risk', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: true, expiry_rule: 'within_1_year' },
    { slot_slug: 'medical_exam_results_ime', label: 'Medical exam results (IME)', readiness_domain: 'review_risk', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: false, expiry_rule: 'within_1_year' },
    { slot_slug: 'spouse_credentials', label: 'Spouse credentials / ECA', readiness_domain: 'family_composition', person_role_scope: 'spouse', blocks_drafting: false, blocks_filing: false, translation_required: true, expiry_rule: null },
  ],

  lawyerReviewTriggers: [
    { key: 'prior_refusal_detected', condition_field: 'prior_refusals', condition_source: 'immigration', condition_operator: 'truthy', message: 'Prior refusal detected — lawyer review recommended' },
    { key: 'criminal_record_detected', condition_field: 'has_criminal_record', condition_source: 'immigration', condition_operator: 'truthy', message: 'Criminal record disclosed — lawyer review required' },
    { key: 'inadmissibility_flagged', condition_field: 'inadmissibility_flag', condition_source: 'people', condition_operator: 'truthy', message: 'Inadmissibility flagged — lawyer review required' },
    { key: 'low_crs_score', condition_field: 'crs_score', condition_source: 'immigration', condition_operator: 'lt', condition_value: 470, message: 'CRS score below 470 — lawyer review recommended to explore options' },
    { key: 'previous_pr_application', condition_field: 'previous_pr_application', condition_source: 'immigration', condition_operator: 'truthy', message: 'Previous PR application on file — lawyer review recommended' },
    { key: 'provincial_nominee', condition_field: 'pnp_nomination', condition_source: 'immigration', condition_operator: 'truthy', message: 'Provincial nominee program — lawyer review recommended' },
    { key: 'spousal_open_work_permit', condition_field: 'open_work_permit', condition_source: 'immigration', condition_operator: 'truthy', message: 'Spousal open work permit requested — lawyer review recommended' },
  ],
}

const REFUGEE_HC: ImmigrationPlaybook = {
  matterTypeKey: 'refugee',
  label: 'Refugee / H&C / PRRA / JR',
  personRoleRequirements: [
    {
      role: 'principal_applicant',
      minimumFields: [
        'first_name',
        'last_name',
        'date_of_birth',
        'nationality',
        'country_of_residence',
        'immigration_status',
        'email',
      ],
    },
    {
      role: 'dependent',
      condition: { field: 'number_of_dependents', operator: 'gt', value: 0 },
      minimumFields: DEPENDENT_MINIMUM_FIELDS,
    },
  ],
  questionnaireSections: [
    'personal',
    'contact_info',
    'background',
    'family',
  ],
  mandatoryDocumentSlugs: [
    'passport_travel_documents',
    'digital_photos_ircc_specs',
    'basis_of_claim_boc_form',
    'personal_narrative_declaration',
    'country_condition_evidence',
    'identity_documents_any_available',
  ],
  lawyerReviewRequired: true,
  reminderCadenceDays: [1, 3, 7],
  formPackTypes: [],
  formGenerationRules: {
    minQuestionnairePct: 70,
    requiredDocumentSlugs: [
      'passport_travel_documents',
      'basis_of_claim_boc_form',
      'personal_narrative_declaration',
    ],
    requireNoUnresolvedContradictions: true,
  },
  filingReadinessRules: {
    requireAllMandatoryDocsAccepted: true,
    requireAllFormPacksGenerated: false,
    requireLawyerReview: true,
    requireNoActiveContradictions: true,
    requireNoPendingReviews: true,
  },
  contradictionRules: [
    ...COMMON_CONTRADICTION_RULES,
    'prior_refusal_inconsistent',
    'person_missing_required_docs',
  ],

  // ── Readiness Matrix ──────────────────────────────────────────────────────

  readinessThreshold: 90,

  questionnaireFieldRules: [
    // Domain: client_identity
    { profile_path: 'personal.family_name', label: 'Family name', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.given_name', label: 'Given name', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.date_of_birth', label: 'Date of birth', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.citizenship', label: 'Citizenship / nationality', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.sex', label: 'Sex', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'passport.number', label: 'Passport / travel document number', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'passport.expiry_date', label: 'Document expiry date', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'passport.country_of_issue', label: 'Document country of issue', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'contact_info.email', label: 'E-mail address', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    // Domain: family_composition
    { profile_path: 'marital.status', label: 'Marital status', readiness_domain: 'family_composition', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.number_of_dependents', label: 'Number of dependents', readiness_domain: 'family_composition', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    // Domain: immigration_history
    { profile_path: 'personal.current_country_of_residence', label: 'Country of residence', readiness_domain: 'immigration_history', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.current_immigration_status', label: 'Immigration status in Canada', readiness_domain: 'immigration_history', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.date_of_entry_canada', label: 'Date of entry to Canada', readiness_domain: 'immigration_history', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    // Domain: program_eligibility (refugee-specific)
    { profile_path: 'claim.claim_type', label: 'Claim type (Refugee / H&C / PRRA / JR)', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'claim.country_of_persecution', label: 'Country of persecution', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'claim.basis_of_claim_summary', label: 'Basis of claim summary', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: 'lawyer' },
    { profile_path: 'claim.hearing_date', label: 'Hearing date', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
  ],

  documentRules: [
    { slot_slug: 'passport_travel_documents', label: 'Passport / travel documents', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'digital_photos_ircc_specs', label: 'Digital photos (IRCC specs)', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'basis_of_claim_boc_form', label: 'Basis of Claim (BOC) form', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'personal_narrative_declaration', label: 'Personal narrative / declaration', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'country_condition_evidence', label: 'Country condition evidence', readiness_domain: 'evidence', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: true, expiry_rule: null },
    { slot_slug: 'identity_documents_any_available', label: 'Identity documents (any available)', readiness_domain: 'evidence', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: true, expiry_rule: null },
    { slot_slug: 'medical_exam_results', label: 'Medical exam results', readiness_domain: 'review_risk', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: false, translation_required: false, expiry_rule: 'within_1_year' },
  ],

  lawyerReviewTriggers: [
    { key: 'prior_refusal_detected', condition_field: 'prior_refusals', condition_source: 'immigration', condition_operator: 'truthy', message: 'Prior refusal detected — lawyer review required' },
    { key: 'criminal_record_detected', condition_field: 'has_criminal_record', condition_source: 'immigration', condition_operator: 'truthy', message: 'Criminal record disclosed — lawyer review required' },
    { key: 'inadmissibility_flagged', condition_field: 'inadmissibility_flag', condition_source: 'people', condition_operator: 'truthy', message: 'Inadmissibility flagged — lawyer review required' },
    { key: 'separated_family_members', condition_field: 'separated_family_members', condition_source: 'immigration', condition_operator: 'truthy', message: 'Separated family members — lawyer review required' },
    { key: 'detention_history', condition_field: 'detention_history', condition_source: 'immigration', condition_operator: 'truthy', message: 'Detention history — lawyer review required' },
    { key: 'expedited_hearing', condition_field: 'expedited_hearing', condition_source: 'immigration', condition_operator: 'truthy', message: 'Expedited hearing scheduled — lawyer review required' },
  ],
}

const VISITOR_VISA: ImmigrationPlaybook = {
  matterTypeKey: 'visitor_visa',
  label: 'Visitor Visa',
  personRoleRequirements: [
    {
      role: 'principal_applicant',
      minimumFields: PA_MINIMUM_FIELDS,
    },
  ],
  questionnaireSections: [
    'personal',
    'contact_info',
    'travel',
    'financial',
    'background',
  ],
  mandatoryDocumentSlugs: [
    'passport_bio_page_stamps',
    'digital_photos_ircc_specs',
    'proof_of_funds',
    'bank_statements_3_months',
  ],
  lawyerReviewRequired: false,
  reminderCadenceDays: DEFAULT_REMINDER_CADENCE,
  formPackTypes: [],
  formGenerationRules: {
    minQuestionnairePct: 80,
    requiredDocumentSlugs: [
      'passport_bio_page_stamps',
      'digital_photos_ircc_specs',
    ],
    requireNoUnresolvedContradictions: true,
  },
  filingReadinessRules: {
    requireAllMandatoryDocsAccepted: true,
    requireAllFormPacksGenerated: true,
    requireLawyerReview: false,
    requireNoActiveContradictions: true,
    requireNoPendingReviews: true,
  },
  contradictionRules: [
    ...COMMON_CONTRADICTION_RULES,
    'prior_refusal_inconsistent',
    'person_missing_required_docs',
  ],

  // ── Readiness Matrix ──────────────────────────────────────────────────────

  readinessThreshold: 85,

  questionnaireFieldRules: [
    // Domain: client_identity
    { profile_path: 'personal.family_name', label: 'Family name', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.given_name', label: 'Given name', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.date_of_birth', label: 'Date of birth', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.citizenship', label: 'Citizenship / nationality', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.sex', label: 'Sex', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'passport.number', label: 'Passport number', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'passport.expiry_date', label: 'Passport expiry', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'passport.country_of_issue', label: 'Passport country of issue', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'contact_info.email', label: 'E-mail address', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    { profile_path: 'contact_info.telephone', label: 'Telephone', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    { profile_path: 'contact_info.mailing_address', label: 'Mailing address', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    // Domain: family_composition
    { profile_path: 'marital.status', label: 'Marital status', readiness_domain: 'family_composition', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    // Domain: immigration_history
    { profile_path: 'personal.current_country_of_residence', label: 'Country of residence', readiness_domain: 'immigration_history', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    // Domain: program_eligibility
    { profile_path: 'visit.purpose', label: 'Purpose of visit', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'visit.from_date', label: 'Intended date of entry', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    { profile_path: 'visit.funds_available_cad', label: 'Funds available for stay', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
  ],

  documentRules: [
    { slot_slug: 'passport_bio_page_stamps', label: 'Passport bio page + stamps', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, translation_required: false, expiry_rule: 'must_not_be_expired' },
    { slot_slug: 'digital_photos_ircc_specs', label: 'Digital photos (IRCC specs)', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'proof_of_funds', label: 'Proof of funds', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: false, expiry_rule: 'within_6_months' },
    { slot_slug: 'bank_statements_3_months', label: 'Bank statements (3 months)', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: true, expiry_rule: 'within_6_months' },
    { slot_slug: 'invitation_letter', label: 'Invitation letter', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: false, translation_required: false, expiry_rule: null },
    { slot_slug: 'travel_itinerary', label: 'Travel itinerary', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: false, translation_required: false, expiry_rule: null },
    { slot_slug: 'employment_letter_leave_approval', label: 'Employment letter / leave approval', readiness_domain: 'evidence', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: false, translation_required: true, expiry_rule: null },
    { slot_slug: 'travel_history', label: 'Travel history', readiness_domain: 'evidence', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: false, translation_required: false, expiry_rule: null },
  ],

  lawyerReviewTriggers: [
    { key: 'prior_refusal_detected', condition_field: 'prior_refusals', condition_source: 'immigration', condition_operator: 'truthy', message: 'Prior refusal detected — lawyer review recommended' },
    { key: 'criminal_record_detected', condition_field: 'has_criminal_record', condition_source: 'immigration', condition_operator: 'truthy', message: 'Criminal record disclosed — lawyer review required' },
    { key: 'inadmissibility_flagged', condition_field: 'inadmissibility_flag', condition_source: 'people', condition_operator: 'truthy', message: 'Inadmissibility flagged — lawyer review required' },
  ],
}

const CITIZENSHIP: ImmigrationPlaybook = {
  matterTypeKey: 'citizenship',
  label: 'Citizenship',
  personRoleRequirements: [
    {
      role: 'principal_applicant',
      minimumFields: PA_MINIMUM_FIELDS,
    },
  ],
  questionnaireSections: [
    'personal',
    'contact_info',
    'background',
  ],
  mandatoryDocumentSlugs: [
    'pr_card_front_and_back',
    'passport_all_pages',
    'digital_photos_ircc_specs',
    'tax_returns_noa_5_years',
    'physical_presence_calculator',
    'travel_history_5_years',
    'language_test_results_clb_4',
    'police_clearance_certificates',
  ],
  lawyerReviewRequired: true,
  reminderCadenceDays: DEFAULT_REMINDER_CADENCE,
  formPackTypes: [],
  formGenerationRules: {
    minQuestionnairePct: 80,
    requiredDocumentSlugs: [
      'pr_card_front_and_back',
      'passport_all_pages',
      'digital_photos_ircc_specs',
    ],
    requireNoUnresolvedContradictions: true,
  },
  filingReadinessRules: {
    requireAllMandatoryDocsAccepted: true,
    requireAllFormPacksGenerated: false,
    requireLawyerReview: true,
    requireNoActiveContradictions: true,
    requireNoPendingReviews: true,
  },
  contradictionRules: [
    ...COMMON_CONTRADICTION_RULES,
    'person_missing_required_docs',
  ],

  // ── Readiness Matrix ──────────────────────────────────────────────────────

  readinessThreshold: 85,

  questionnaireFieldRules: [
    // Domain: client_identity
    { profile_path: 'personal.family_name', label: 'Family name', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.given_name', label: 'Given name', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.date_of_birth', label: 'Date of birth', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.citizenship', label: 'Citizenship', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.sex', label: 'Sex', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'passport.number', label: 'Passport number', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'passport.expiry_date', label: 'Passport expiry', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'passport.country_of_issue', label: 'Passport country of issue', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'contact_info.email', label: 'E-mail address', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    { profile_path: 'contact_info.mailing_address', label: 'Mailing address', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    // Domain: family_composition
    { profile_path: 'marital.status', label: 'Marital status', readiness_domain: 'family_composition', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    // Domain: immigration_history
    { profile_path: 'pr_status.landing_date', label: 'PR landing date', readiness_domain: 'immigration_history', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'pr_status.pr_card_number', label: 'PR card number', readiness_domain: 'immigration_history', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.current_immigration_status', label: 'Current immigration status', readiness_domain: 'immigration_history', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    // Domain: program_eligibility (citizenship-specific)
    { profile_path: 'physical_presence.total_days', label: 'Physical presence days in Canada', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'financial.tax_filing_years_count', label: 'Tax filing years (3 of 5 required)', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    { profile_path: 'language.clb_level', label: 'Language test CLB level', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    { profile_path: 'personal.prohibitions_or_charges', label: 'Prohibitions / charges flag', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: 'lawyer' },
  ],

  documentRules: [
    { slot_slug: 'pr_card_front_and_back', label: 'PR card (front & back)', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'passport_all_pages', label: 'Passport (all pages)', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, translation_required: false, expiry_rule: 'must_not_be_expired' },
    { slot_slug: 'digital_photos_ircc_specs', label: 'Digital photos (IRCC specs)', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'tax_returns_noa_5_years', label: 'Tax returns / NOA (5 years)', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'physical_presence_calculator', label: 'Physical presence calculator', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'language_test_results_clb_4', label: 'Language test results (CLB 4+)', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: false, expiry_rule: 'within_1_year' },
    { slot_slug: 'travel_history_5_years', label: 'Travel history (5 years)', readiness_domain: 'evidence', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'police_clearance_certificates', label: 'Police clearance certificates', readiness_domain: 'review_risk', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: true, expiry_rule: 'within_1_year' },
  ],

  lawyerReviewTriggers: [
    { key: 'criminal_record_detected', condition_field: 'has_criminal_record', condition_source: 'immigration', condition_operator: 'truthy', message: 'Criminal record disclosed — lawyer review required' },
    { key: 'inadmissibility_flagged', condition_field: 'inadmissibility_flag', condition_source: 'people', condition_operator: 'truthy', message: 'Inadmissibility flagged — lawyer review required' },
    { key: 'insufficient_physical_presence', condition_field: 'physical_presence_days', condition_source: 'immigration', condition_operator: 'lt', condition_value: 1095, message: 'Physical presence below 1,095 days — lawyer review required' },
    { key: 'tax_non_compliance', condition_field: 'tax_filing_gaps', condition_source: 'immigration', condition_operator: 'truthy', message: 'Tax filing gaps detected — lawyer review recommended' },
    { key: 'residency_obligation_concern', condition_field: 'extended_absence', condition_source: 'immigration', condition_operator: 'truthy', message: 'Extended absence from Canada — lawyer review recommended' },
  ],
}

const LMIA: ImmigrationPlaybook = {
  matterTypeKey: 'lmia',
  label: 'LMIA',
  personRoleRequirements: [
    {
      role: 'principal_applicant',
      minimumFields: [
        'first_name',
        'last_name',
        'email',
        'employer_name',
        'occupation',
      ],
    },
  ],
  questionnaireSections: [
    'personal',
    'contact_info',
    'employment_work',
  ],
  mandatoryDocumentSlugs: [
    'employer_business_licence',
    'cra_business_number_confirmation',
    't4_summary_2_years',
    'job_description',
    'recruitment_ads_screenshots',
    'recruitment_results_log',
    'employment_contract_offer_letter',
    'transition_plan',
    'worker_resume_cv',
    'prevailing_wage_evidence',
  ],
  lawyerReviewRequired: true,
  reminderCadenceDays: DEFAULT_REMINDER_CADENCE,
  formPackTypes: [],
  formGenerationRules: {
    minQuestionnairePct: 70,
    requiredDocumentSlugs: [
      'employer_business_licence',
      'cra_business_number_confirmation',
      'job_description',
    ],
    requireNoUnresolvedContradictions: true,
  },
  filingReadinessRules: {
    requireAllMandatoryDocsAccepted: true,
    requireAllFormPacksGenerated: false,
    requireLawyerReview: true,
    requireNoActiveContradictions: true,
    requireNoPendingReviews: true,
  },
  contradictionRules: [
    'passport_incomplete',
    'criminal_no_details',
    'inadmissibility_no_details',
    'person_missing_required_docs',
  ],

  // ── Readiness Matrix ──────────────────────────────────────────────────────

  readinessThreshold: 90,

  questionnaireFieldRules: [
    // Domain: client_identity (employer-centric for LMIA)
    { profile_path: 'employer.name', label: 'Employer name', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'employer.business_number', label: 'Employer business number', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'employer.address', label: 'Employer address', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'employer.phone', label: 'Employer phone', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    { profile_path: 'employer.email', label: 'Employer e-mail', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    // Domain: immigration_history
    { profile_path: 'employer.previous_lmia_history', label: 'Previous LMIA history', readiness_domain: 'immigration_history', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    // Domain: program_eligibility (LMIA-specific)
    { profile_path: 'employment.occupation_noc', label: 'Occupation / NOC code', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'employment.job_title', label: 'Job title', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'employment.job_duties', label: 'Job duties', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    { profile_path: 'employment.wage_offered', label: 'Wage offered', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'employment.prevailing_wage', label: 'Prevailing wage', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, review_role_required: null },
    { profile_path: 'employment.hours_per_week', label: 'Hours per week', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    { profile_path: 'employment.employment_duration', label: 'Employment duration', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    { profile_path: 'employment.work_location', label: 'Work location', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    { profile_path: 'employment.number_of_positions', label: 'Number of positions', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    { profile_path: 'employment.recruitment_start_date', label: 'Recruitment start date', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
    { profile_path: 'employment.recruitment_end_date', label: 'Recruitment end date', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, review_role_required: null },
  ],

  documentRules: [
    { slot_slug: 'employer_business_licence', label: 'Employer business licence', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'cra_business_number_confirmation', label: 'CRA business number confirmation', readiness_domain: 'client_identity', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'job_description', label: 'Job description', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: true, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'employment_contract_offer_letter', label: 'Employment contract / offer letter', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'prevailing_wage_evidence', label: 'Prevailing wage evidence', readiness_domain: 'program_eligibility', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'recruitment_ads_screenshots', label: 'Recruitment ads / screenshots', readiness_domain: 'evidence', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'recruitment_results_log', label: 'Recruitment results log', readiness_domain: 'evidence', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 't4_summary_2_years', label: 'T4 summary (2 years)', readiness_domain: 'evidence', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'transition_plan', label: 'Transition plan', readiness_domain: 'evidence', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: false, expiry_rule: null },
    { slot_slug: 'worker_resume_cv', label: 'Worker resume / CV', readiness_domain: 'evidence', person_role_scope: 'pa', blocks_drafting: false, blocks_filing: true, translation_required: false, expiry_rule: null },
  ],

  lawyerReviewTriggers: [
    { key: 'previous_lmia_refusal', condition_field: 'previous_lmia_refusal', condition_source: 'immigration', condition_operator: 'truthy', message: 'Previous LMIA refusal — lawyer review required' },
    { key: 'wage_below_prevailing', condition_field: 'wage_below_prevailing', condition_source: 'immigration', condition_operator: 'truthy', message: 'Wage below prevailing rate — lawyer review required' },
    { key: 'employer_compliance_flag', condition_field: 'employer_compliance_flag', condition_source: 'immigration', condition_operator: 'truthy', message: 'Employer compliance issue — lawyer review required' },
    { key: 'high_volume_positions', condition_field: 'number_of_positions', condition_source: 'immigration', condition_operator: 'gt', condition_value: 5, message: 'High-volume positions (>5) — lawyer review recommended' },
    { key: 'prior_non_compliance', condition_field: 'prior_non_compliance', condition_source: 'immigration', condition_operator: 'truthy', message: 'Prior non-compliance history — lawyer review required' },
  ],
}

// ── Registry ─────────────────────────────────────────────────────────────────

/** All immigration playbooks keyed by program_category_key */
export const IMMIGRATION_PLAYBOOKS: Record<string, ImmigrationPlaybook> = {
  spousal: SPOUSAL_SPONSORSHIP,
  work_permit: WORK_PERMIT,
  study_permit: STUDY_PERMIT,
  express_entry: PR_EXPRESS_ENTRY,
  refugee: REFUGEE_HC,
  visitor_visa: VISITOR_VISA,
  citizenship: CITIZENSHIP,
  lmia: LMIA,
}

/**
 * Look up the playbook for a given matter type key.
 * Returns undefined if no playbook exists (non-immigration or unknown type).
 */
export function getPlaybook(programCategoryKey: string | null | undefined): ImmigrationPlaybook | undefined {
  if (!programCategoryKey) return undefined
  return IMMIGRATION_PLAYBOOKS[programCategoryKey]
}

/**
 * All valid immigration intake status values in progression order.
 * Index = progression rank (higher = further along).
 */
export const IMMIGRATION_INTAKE_STATUS_ORDER = [
  'not_issued',
  'issued',
  'client_in_progress',
  'review_required',
  'deficiency_outstanding',
  'intake_complete',
  'drafting_enabled',
  'lawyer_review',
  'ready_for_filing',
  'filed',
] as const

export type ImmigrationIntakeStatus = typeof IMMIGRATION_INTAKE_STATUS_ORDER[number]

/**
 * Compare two immigration intake statuses.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareImmIntakeStatus(a: string, b: string): number {
  const aIdx = IMMIGRATION_INTAKE_STATUS_ORDER.indexOf(a as ImmigrationIntakeStatus)
  const bIdx = IMMIGRATION_INTAKE_STATUS_ORDER.indexOf(b as ImmigrationIntakeStatus)
  return aIdx - bIdx
}
