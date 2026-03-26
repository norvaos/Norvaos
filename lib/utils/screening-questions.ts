/**
 * Shared Immigration Screening Questions
 *
 * Single source of truth for all screening questions used in:
 *   1. Front Desk Quick Create wizard (Step 3)
 *   2. Main platform Lead detail page (read-only display)
 *
 * Rules:
 *   - All substantive questions are mandatory (is_required: true)
 *   - Conditional questions appear only when their parent condition is met
 *   - No family law or real estate questions
 *   - Document upload is the final optional step
 */

// ─── Types (mirrors TenantKioskQuestion from front-desk-queries) ─────────────

export type ScreeningFieldType =
  | 'boolean'
  | 'select'
  | 'multi_select'
  | 'text'
  | 'textarea'
  | 'date'
  | 'country'

export interface ScreeningOption {
  value: string
  label: string
}

export type ScreeningOperator =
  | 'equals'
  | 'not_equals'
  | 'in'
  | 'not_in'
  | 'is_truthy'
  | 'is_falsy'

export interface ScreeningCondition {
  field_id: string
  operator: ScreeningOperator
  value?: string | string[]
}

export interface ScreeningQuestion {
  id: string
  label: string
  description?: string
  field_type: ScreeningFieldType
  options: ScreeningOption[]
  is_required: boolean
  sort_order: number
  condition: ScreeningCondition | undefined
}

// ─── Default Immigration Screening Questions ─────────────────────────────────

export const DEFAULT_SCREENING_QUESTIONS: ScreeningQuestion[] = [
  // ── 1. Type of matter ──────────────────────────────────────────────────────
  {
    id: 'sq_matter_type',
    label: 'What type of immigration matter are you seeking help with?',
    description: 'Select the option that best describes your situation.',
    field_type: 'select',
    options: [
      { value: 'work_permit', label: 'Work Permit (new or extension)' },
      { value: 'study_permit', label: 'Study Permit (new or extension)' },
      { value: 'visitor_visa', label: 'Visitor Visa / TRV' },
      { value: 'pr_cec', label: 'Permanent Residence – Canadian Experience Class' },
      { value: 'pr_fsw', label: 'Permanent Residence – Federal Skilled Worker' },
      { value: 'pr_fstp', label: 'Permanent Residence – Federal Skilled Trades' },
      { value: 'pr_pnp', label: 'Permanent Residence – Provincial Nominee Program' },
      { value: 'spousal_sponsorship', label: 'Spousal / Partner Sponsorship' },
      { value: 'parent_grandparent', label: 'Parent & Grandparent Sponsorship' },
      { value: 'citizenship', label: 'Citizenship Application' },
      { value: 'refugee_claim', label: 'Refugee Claim / Asylum' },
      { value: 'prra', label: 'Pre-Removal Risk Assessment (PRRA)' },
      { value: 'hc', label: 'Humanitarian & Compassionate (H&C)' },
      { value: 'judicial_review', label: 'Judicial Review / Appeal' },
      { value: 'lmia', label: 'Labour Market Impact Assessment (LMIA)' },
      { value: 'reconsideration', label: 'Reconsideration / Restoration' },
      { value: 'other', label: 'Other / Not Sure' },
    ],
    is_required: true,
    sort_order: 1,
    condition: undefined,
  },

  // ── 1a. If "Other" → describe ──────────────────────────────────────────────
  {
    id: 'sq_matter_type_other',
    label: 'Please describe your situation',
    description: 'Briefly explain what immigration help you need.',
    field_type: 'textarea',
    options: [],
    is_required: true,
    sort_order: 2,
    condition: { field_id: 'sq_matter_type', operator: 'equals', value: 'other' },
  },

  // ── 2. Current status in Canada ───────────────────────────────────────────
  {
    id: 'sq_status_canada',
    label: 'What is your current immigration status in Canada?',
    field_type: 'select',
    options: [
      { value: 'citizen', label: 'Canadian Citizen' },
      { value: 'pr', label: 'Permanent Resident' },
      { value: 'work_permit', label: 'Work Permit Holder' },
      { value: 'study_permit', label: 'Study Permit Holder' },
      { value: 'visitor', label: 'Visitor / TRV' },
      { value: 'refugee_claimant', label: 'Refugee Claimant' },
      { value: 'implied_status', label: 'Implied Status (applied to extend)' },
      { value: 'no_status', label: 'No Status / Undocumented' },
      { value: 'outside_canada', label: 'Currently Outside Canada' },
      { value: 'na', label: 'Not Applicable' },
    ],
    is_required: true,
    sort_order: 3,
    condition: undefined,
  },

  // ── 3. Country of citizenship ─────────────────────────────────────────────
  {
    id: 'sq_country_citizenship',
    label: 'What is your country of citizenship?',
    field_type: 'country',
    options: [],
    is_required: true,
    sort_order: 4,
    condition: undefined,
  },

  // ── 4. Number of people / family members included ────────────────────────
  {
    id: 'sq_family_members',
    label: 'Will this application include a spouse or dependent children?',
    field_type: 'boolean',
    options: [],
    is_required: true,
    sort_order: 5,
    condition: undefined,
  },

  // ── 5. Prior refusals or rejections ──────────────────────────────────────
  {
    id: 'sq_prior_refusal',
    label: 'Have you ever had an immigration application refused or rejected?',
    field_type: 'boolean',
    options: [],
    is_required: true,
    sort_order: 6,
    condition: undefined,
  },

  // ── 5a. Refusal details ───────────────────────────────────────────────────
  {
    id: 'sq_prior_refusal_detail',
    label: 'Please describe the refusal(s)',
    description: 'Which application was refused, when, and the reason given (if known).',
    field_type: 'textarea',
    options: [],
    is_required: true,
    sort_order: 7,
    condition: { field_id: 'sq_prior_refusal', operator: 'equals', value: 'yes' },
  },

  // ── 6. Currently represented ─────────────────────────────────────────────
  {
    id: 'sq_has_lawyer',
    label: 'Are you currently represented by another immigration consultant or lawyer?',
    field_type: 'boolean',
    options: [],
    is_required: true,
    sort_order: 8,
    condition: undefined,
  },

  // ── 7. Deadline / urgent situation ───────────────────────────────────────
  {
    id: 'sq_has_deadline',
    label: 'Is there an upcoming deadline or urgent situation with your application?',
    description: 'e.g. status expiring, removal order, hearing date.',
    field_type: 'boolean',
    options: [],
    is_required: true,
    sort_order: 9,
    condition: undefined,
  },

  // ── 7a. Deadline date (required if urgent) ────────────────────────────────
  {
    id: 'sq_deadline_date',
    label: 'What is the deadline date?',
    field_type: 'date',
    options: [],
    is_required: true,
    sort_order: 10,
    condition: { field_id: 'sq_has_deadline', operator: 'equals', value: 'yes' },
  },

  // ── 7b. Deadline description ─────────────────────────────────────────────
  {
    id: 'sq_deadline_detail',
    label: 'Please describe the urgent situation or deadline',
    field_type: 'textarea',
    options: [],
    is_required: true,
    sort_order: 11,
    condition: { field_id: 'sq_has_deadline', operator: 'equals', value: 'yes' },
  },

  // ── 8. Employment situation ───────────────────────────────────────────────
  {
    id: 'sq_employment',
    label: 'What is your current employment situation in Canada?',
    field_type: 'select',
    options: [
      { value: 'employed_full_time', label: 'Employed Full-Time' },
      { value: 'employed_part_time', label: 'Employed Part-Time' },
      { value: 'self_employed', label: 'Self-Employed' },
      { value: 'student', label: 'Student' },
      { value: 'unemployed', label: 'Not Currently Working' },
      { value: 'na', label: 'Not Applicable' },
    ],
    is_required: true,
    sort_order: 12,
    condition: undefined,
  },

  // ── 9. Express Entry / CRS (only relevant for some apps  -  optional) ────────
  {
    id: 'sq_express_entry',
    label: 'Do you have an active Express Entry profile?',
    field_type: 'boolean',
    options: [],
    is_required: true,
    sort_order: 13,
    condition: undefined,
  },

  // ── 10. Language tests ────────────────────────────────────────────────────
  {
    id: 'sq_language_test',
    label: 'Have you taken a Canadian language test (IELTS, CELPIP, TEF Canada)?',
    field_type: 'boolean',
    options: [],
    is_required: true,
    sort_order: 14,
    condition: undefined,
  },

  // ── 10a. Which test ───────────────────────────────────────────────────────
  {
    id: 'sq_language_test_type',
    label: 'Which language test did you take?',
    field_type: 'select',
    options: [
      { value: 'ielts_general', label: 'IELTS General Training' },
      { value: 'ielts_academic', label: 'IELTS Academic' },
      { value: 'celpip', label: 'CELPIP General' },
      { value: 'tef', label: 'TEF Canada (French)' },
      { value: 'tcf', label: 'TCF Canada (French)' },
    ],
    is_required: true,
    sort_order: 15,
    condition: { field_id: 'sq_language_test', operator: 'equals', value: 'yes' },
  },

  // ── 10b. Overall score ────────────────────────────────────────────────────
  {
    id: 'sq_lang_score_overall',
    label: 'What was your overall score?',
    description: 'Enter your overall band / score (e.g. 7.0 for IELTS, 9 for CELPIP).',
    field_type: 'text',
    options: [],
    is_required: true,
    sort_order: 16,
    condition: { field_id: 'sq_language_test', operator: 'equals', value: 'yes' },
  },

  // ── 10c. Reading score ────────────────────────────────────────────────────
  {
    id: 'sq_lang_score_reading',
    label: 'Reading score',
    field_type: 'text',
    options: [],
    is_required: true,
    sort_order: 17,
    condition: { field_id: 'sq_language_test', operator: 'equals', value: 'yes' },
  },

  // ── 10d. Writing score ────────────────────────────────────────────────────
  {
    id: 'sq_lang_score_writing',
    label: 'Writing score',
    field_type: 'text',
    options: [],
    is_required: true,
    sort_order: 18,
    condition: { field_id: 'sq_language_test', operator: 'equals', value: 'yes' },
  },

  // ── 10e. Speaking score ───────────────────────────────────────────────────
  {
    id: 'sq_lang_score_speaking',
    label: 'Speaking score',
    field_type: 'text',
    options: [],
    is_required: true,
    sort_order: 19,
    condition: { field_id: 'sq_language_test', operator: 'equals', value: 'yes' },
  },

  // ── 10f. Listening score ──────────────────────────────────────────────────
  {
    id: 'sq_lang_score_listening',
    label: 'Listening score',
    field_type: 'text',
    options: [],
    is_required: true,
    sort_order: 20,
    condition: { field_id: 'sq_language_test', operator: 'equals', value: 'yes' },
  },

  // ── 10g. Test date ────────────────────────────────────────────────────────
  {
    id: 'sq_lang_test_date',
    label: 'When did you take the test?',
    field_type: 'date',
    options: [],
    is_required: true,
    sort_order: 21,
    condition: { field_id: 'sq_language_test', operator: 'equals', value: 'yes' },
  },

  // ── 10h. Second language test ─────────────────────────────────────────────
  {
    id: 'sq_language_test_second',
    label: 'Do you have results from any other language test?',
    field_type: 'boolean',
    options: [],
    is_required: true,
    sort_order: 22,
    condition: { field_id: 'sq_language_test', operator: 'equals', value: 'yes' },
  },

  // ── 10i. Second test details ──────────────────────────────────────────────
  {
    id: 'sq_language_test_second_detail',
    label: 'Please provide details of the other test',
    description: 'Test name, scores (overall, reading, writing, speaking, listening) and date.',
    field_type: 'textarea',
    options: [],
    is_required: true,
    sort_order: 23,
    condition: { field_id: 'sq_language_test_second', operator: 'equals', value: 'yes' },
  },

  // ── 11. Police clearance ──────────────────────────────────────────────────
  {
    id: 'sq_police_clearance',
    label: 'Do you have a valid police clearance certificate?',
    field_type: 'boolean',
    options: [],
    is_required: true,
    sort_order: 24,
    condition: undefined,
  },

  // ── 12. Medical exam ──────────────────────────────────────────────────────
  {
    id: 'sq_medical_exam',
    label: 'Have you undergone an IRCC-approved medical examination in the past 12 months?',
    field_type: 'boolean',
    options: [],
    is_required: true,
    sort_order: 25,
    condition: undefined,
  },

  // ── 13. How they heard ────────────────────────────────────────────────────
  {
    id: 'sq_how_heard',
    label: 'How did you hear about our office?',
    field_type: 'select',
    options: [
      { value: 'referral', label: 'Referral from friend or family' },
      { value: 'previous_client', label: 'Previous client of ours' },
      { value: 'google', label: 'Google Search' },
      { value: 'social_media', label: 'Social Media' },
      { value: 'walk_in', label: 'Walk-In' },
      { value: 'community', label: 'Community organisation or event' },
      { value: 'other', label: 'Other' },
    ],
    is_required: true,
    sort_order: 26,
    condition: undefined,
  },

  // ── 14. Additional notes (free text, optional) ────────────────────────────
  {
    id: 'sq_additional_notes',
    label: 'Is there anything else you would like us to know?',
    description: 'Any additional details about your situation (optional).',
    field_type: 'textarea',
    options: [],
    is_required: false,
    sort_order: 27,
    condition: undefined,
  },
]

// ─── Condition Evaluator ─────────────────────────────────────────────────────

export function evaluateScreeningCondition(
  condition: ScreeningCondition,
  answers: Record<string, string | string[]>,
): boolean {
  const answer = answers[condition.field_id]
  switch (condition.operator) {
    case 'equals':
      return answer === condition.value
    case 'not_equals':
      return answer !== condition.value
    case 'in': {
      const vals = Array.isArray(condition.value) ? condition.value : [condition.value ?? '']
      if (Array.isArray(answer)) return answer.some((a) => vals.includes(a))
      return vals.includes(answer as string)
    }
    case 'not_in': {
      const vals = Array.isArray(condition.value) ? condition.value : [condition.value ?? '']
      if (Array.isArray(answer)) return !answer.some((a) => vals.includes(a))
      return !vals.includes(answer as string)
    }
    case 'is_truthy':
      if (Array.isArray(answer)) return answer.length > 0
      return !!answer && answer !== 'false' && answer !== 'no'
    case 'is_falsy':
      if (Array.isArray(answer)) return answer.length === 0
      return !answer || answer === 'false' || answer === 'no'
    default:
      return true
  }
}

// ─── Helper: get visible questions given current answers ─────────────────────

export function getVisibleQuestions(
  questions: ScreeningQuestion[],
  answers: Record<string, string | string[]>,
): ScreeningQuestion[] {
  return questions.filter((q) => {
    if (!q.condition) return true
    return evaluateScreeningCondition(q.condition, answers)
  })
}

// ─── Helper: get human-readable answer for a question ────────────────────────

export function getAnswerDisplay(
  question: ScreeningQuestion,
  rawAnswer: string | string[] | undefined,
): string {
  if (rawAnswer === undefined || rawAnswer === null || rawAnswer === '') return ' - '

  if (Array.isArray(rawAnswer)) {
    if (rawAnswer.length === 0) return ' - '
    return rawAnswer
      .map((v) => question.options.find((o) => o.value === v)?.label ?? v)
      .join(', ')
  }

  // Boolean
  if (question.field_type === 'boolean') {
    return rawAnswer === 'yes' ? 'Yes' : rawAnswer === 'no' ? 'No' : rawAnswer
  }

  // Select
  if (question.field_type === 'select') {
    return question.options.find((o) => o.value === rawAnswer)?.label ?? rawAnswer
  }

  return rawAnswer
}
