/**
 * intake-questions.ts
 *
 * Rule-based question tree for the interactive intake wizard.
 * Questions are answered one at a time; branching logic is expressed
 * via a `next` function on each option (or a default `nextId` on the
 * question itself).  Answers are saved to `lead.custom_fields` under
 * the key defined by `saveAs` on each question.
 *
 * Recommendation engine lives at the bottom of this file.
 */

// ─── Core types ─────────────────────────────────────────────────────────────

export interface IntakeOption {
  value: string
  label: string
  /** Optional emoji prefix shown in the wizard button */
  emoji?: string
  /** Short descriptor shown below the label */
  hint?: string
  /** Which question to go to next. If omitted, falls through to question.nextId */
  nextId?: string | null
}

export interface IntakeQuestion {
  id: string
  /** Human-readable prompt */
  question: string
  /** Additional context shown below the question */
  subtext?: string
  /** Plain-English explanation of WHY we ask this question  -  shown in the "Why are we asking this?" help section */
  why?: string
  /** Key used to store the answer in custom_fields / the answer map */
  saveAs: string
  /** Input type */
  type: 'single' | 'multi' | 'text' | 'date' | 'number'
  options?: IntakeOption[]
  /** Default next question ID (overridden by option.nextId) */
  nextId?: string | null
  /** If true, the user may press Skip */
  optional?: boolean
  /** Placeholder text for text/number/date inputs */
  placeholder?: string
  /** Minimum value for number/date inputs */
  min?: string | number
}

// ─── Answer map type ─────────────────────────────────────────────────────────

export type IntakeAnswers = Record<string, string | string[]>

// ─── Question tree ───────────────────────────────────────────────────────────

export const INTAKE_QUESTIONS: IntakeQuestion[] = [
  // ── Q1: Who is this for? ────────────────────────────────────────
  {
    id: 'q_who',
    question: 'Who is this intake for?',
    subtext: 'Helps us apply the right immigration rules from the start.',
    why: 'Immigration rules vary significantly depending on whether we\'re dealing with an individual, a couple/family, or a business. This single answer determines which legal framework applies and which questions come next.',
    saveAs: 'intake_who',
    type: 'single',
    options: [
      {
        value: 'individual',
        label: 'An individual',
        emoji: '👤',
        hint: 'Single applicant (may include family members on the same application)',
        nextId: 'q_citizen',
      },
      {
        value: 'couple',
        label: 'A couple or family',
        emoji: '👨‍👩‍👧',
        hint: 'Spouse/partner sponsorship or family class',
        nextId: 'q_citizen',
      },
      {
        value: 'employer',
        label: 'An employer / business',
        emoji: '🏢',
        hint: 'LMIA, work permit support, corporate immigration',
        nextId: 'q_employer_size',
      },
    ],
  },

  // ── Q2 (employer branch): Employer size ─────────────────────────
  {
    id: 'q_employer_size',
    question: 'How many employees does the business currently have?',
    saveAs: 'employer_size',
    type: 'single',
    nextId: 'q_employer_goal',
    options: [
      { value: '1-10', label: '1 – 10 employees', emoji: '🏠', hint: 'Small business / startup' },
      { value: '11-50', label: '11 – 50 employees', emoji: '🏬' },
      { value: '51-200', label: '51 – 200 employees', emoji: '🏭' },
      { value: '200+', label: '200+ employees', emoji: '🏙️', hint: 'Mid-to-large enterprise' },
    ],
  },

  // ── Q3 (employer branch): Employer goal ─────────────────────────
  {
    id: 'q_employer_goal',
    question: 'What is the business trying to accomplish?',
    saveAs: 'employer_goal',
    type: 'single',
    nextId: 'q_timeline',
    options: [
      {
        value: 'hire_foreign_worker',
        label: 'Hire a foreign worker (LMIA / work permit)',
        emoji: '📋',
        hint: 'Labour Market Impact Assessment or employer-specific work permit',
        nextId: 'q_lmia_stream',
      },
      {
        value: 'transfer_employee',
        label: 'Transfer an existing employee to Canada',
        emoji: '✈️',
        hint: 'Intra-company transfer, ICT work permit',
        nextId: 'q_timeline',
      },
      {
        value: 'global_talent',
        label: 'Hire a highly skilled tech worker quickly',
        emoji: '⚡',
        hint: 'Global Talent Stream  -  2-week processing',
        nextId: 'q_timeline',
      },
      {
        value: 'caregiver',
        label: 'Hire a caregiver',
        emoji: '🤝',
        hint: 'Home Child Care Provider or Home Support Worker pilot',
        nextId: 'q_timeline',
      },
    ],
  },

  // ── Q3b (LMIA sub-branch): LMIA stream ──────────────────────────
  {
    id: 'q_lmia_stream',
    question: 'Which LMIA stream best fits the role?',
    subtext: 'NOC skill level helps determine the stream. Not sure? Select "I\'m not sure" and we\'ll assess.',
    saveAs: 'lmia_stream',
    type: 'single',
    nextId: 'q_timeline',
    optional: true,
    options: [
      { value: 'high_wage', label: 'High-Wage stream (above provincial median)', emoji: '💼' },
      { value: 'low_wage', label: 'Low-Wage stream (at or below median)', emoji: '🔧' },
      { value: 'agricultural', label: 'Agricultural stream (SAWP / Ag Workers)', emoji: '🌾' },
      { value: 'global_talent', label: 'Global Talent Stream (tech roles, NOC 0/A)', emoji: '⚡' },
      { value: 'not_sure', label: "I'm not sure", emoji: '❓' },
    ],
  },

  // ── Q2 (individual branch): Citizenship / status ────────────────
  {
    id: 'q_citizen',
    question: "What is the client's current immigration status?",
    why: 'Current status is often the single most important factor in immigration. It determines which programs the client can access, whether they can apply inside or outside Canada, what their timeline looks like, and whether there are any urgent risks (e.g., implied status, out-of-status).',
    saveAs: 'current_status',
    type: 'single',
    options: [
      {
        value: 'no_status',
        label: 'No status in Canada (outside or undocumented)',
        emoji: '🌍',
        hint: 'Applying to come to Canada for the first time',
        nextId: 'q_goal',
      },
      {
        value: 'visitor',
        label: 'Visitor (tourist visa / eTA)',
        emoji: '🛂',
        nextId: 'q_goal',
      },
      {
        value: 'student',
        label: 'Student permit holder',
        emoji: '🎓',
        nextId: 'q_goal',
      },
      {
        value: 'worker',
        label: 'Work permit holder',
        emoji: '💼',
        nextId: 'q_work_permit_type',
      },
      {
        value: 'pr',
        label: 'Permanent Resident',
        emoji: '🍁',
        nextId: 'q_pr_goal',
      },
      {
        value: 'refugee_claimant',
        label: 'Refugee claimant',
        emoji: '🕊️',
        nextId: 'q_refugee_type',
      },
      {
        value: 'protected_person',
        label: 'Protected person / Convention Refugee',
        emoji: '✅',
        nextId: 'q_goal',
      },
    ],
  },

  // ── Q (work permit sub-branch): Type of work permit ─────────────
  {
    id: 'q_work_permit_type',
    question: 'What type of work permit does the client currently hold?',
    saveAs: 'work_permit_type',
    type: 'single',
    optional: true,
    nextId: 'q_goal',
    options: [
      { value: 'employer_specific', label: 'Employer-specific (closed)', emoji: '🔒' },
      { value: 'open_permit', label: 'Open work permit', emoji: '🔓', hint: 'PGWP, spousal OWP, BOWP, etc.' },
      { value: 'lmia_based', label: 'LMIA-based', emoji: '📋' },
      { value: 'iec', label: 'IEC / Working Holiday', emoji: '🎒' },
      { value: 'not_sure', label: "Not sure", emoji: '❓' },
    ],
  },

  // ── Q (PR sub-branch): PR goal ──────────────────────────────────
  {
    id: 'q_pr_goal',
    question: 'What does the PR client need help with?',
    saveAs: 'pr_goal',
    type: 'single',
    nextId: 'q_timeline',
    options: [
      { value: 'citizenship', label: 'Apply for Canadian Citizenship', emoji: '🍁' },
      { value: 'renew_pr_card', label: 'Renew PR Card', emoji: '💳' },
      { value: 'travel_document', label: 'PR Travel Document (PRTD)', emoji: '✈️' },
      { value: 'sponsor_family', label: 'Sponsor a family member', emoji: '❤️' },
      { value: 'maintain_residency', label: 'Residency obligation concern / appeal', emoji: '⚖️' },
      { value: 'other', label: 'Other', emoji: '📝' },
    ],
  },

  // ── Q (refugee sub-branch): Refugee type ────────────────────────
  {
    id: 'q_refugee_type',
    question: 'What type of refugee claim or process is involved?',
    saveAs: 'refugee_type',
    type: 'single',
    nextId: 'q_refugee_stage',
    options: [
      { value: 'inland_claim', label: 'Inland refugee claim (already in Canada)', emoji: '🏠' },
      { value: 'pre_removal', label: 'Pre-Removal Risk Assessment (PRRA)', emoji: '⚠️' },
      { value: 'had_claim', label: 'HAD / H&C application', emoji: '⚖️' },
      { value: 'sponsorship', label: 'Privately sponsored refugee (PSR)', emoji: '🤝' },
      { value: 'gar', label: 'Government-Assisted Refugee (GAR)', emoji: '🏛️' },
    ],
  },

  // ── Q (refugee sub-branch): Stage of claim ─────────────────────
  {
    id: 'q_refugee_stage',
    question: 'What stage is the refugee claim at?',
    saveAs: 'refugee_stage',
    type: 'single',
    nextId: 'q_timeline',
    optional: true,
    options: [
      { value: 'just_arrived', label: 'Just arrived  -  claim not yet filed', emoji: '🛬' },
      { value: 'claim_filed', label: 'Claim filed  -  waiting for hearing', emoji: '📅' },
      { value: 'hearing_soon', label: 'Hearing scheduled (within 3 months)', emoji: '⏰' },
      { value: 'rejected', label: 'Claim rejected  -  considering appeal or PRRA', emoji: '❌' },
      { value: 'appeal_filed', label: 'RAD appeal filed', emoji: '⚖️' },
    ],
  },

  // ── Q: Main goal ────────────────────────────────────────────────
  {
    id: 'q_goal',
    question: "What is the client's primary immigration goal?",
    subtext: 'Select the outcome they are most trying to achieve.',
    why: 'This is the core of the intake. Understanding what the client ultimately wants determines the correct visa category, processing time, fee structure, and application strategy. Different goals lead to completely different legal products.',
    saveAs: 'immigration_goal',
    type: 'single',
    options: [
      {
        value: 'permanent_residence',
        label: 'Become a Permanent Resident',
        emoji: '🍁',
        nextId: 'q_pr_pathway',
      },
      {
        value: 'work_permit',
        label: 'Get or extend a work permit',
        emoji: '💼',
        nextId: 'q_work_goal',
      },
      {
        value: 'study_permit',
        label: 'Get or extend a study permit',
        emoji: '🎓',
        nextId: 'q_study_goal',
      },
      {
        value: 'visitor_visa',
        label: 'Get or extend visitor status',
        emoji: '🛂',
        nextId: 'q_visitor_type',
      },
      {
        value: 'family_sponsorship',
        label: 'Sponsor a family member',
        emoji: '❤️',
        nextId: 'q_sponsor_type',
      },
      {
        value: 'citizenship',
        label: 'Apply for Citizenship',
        emoji: '🏆',
        nextId: 'q_citizenship_eligibility',
      },
      {
        value: 'humanitarian',
        label: 'Humanitarian & Compassionate (H&C)',
        emoji: '🕊️',
        nextId: 'q_timeline',
      },
      {
        value: 'appeal_review',
        label: 'Appeal or judicial review',
        emoji: '⚖️',
        nextId: 'q_appeal_type',
      },
    ],
  },

  // ── Q (PR branch): Which pathway? ───────────────────────────────
  {
    id: 'q_pr_pathway',
    question: 'Which PR pathway is the client most likely eligible for?',
    subtext: 'Not sure? Use "Help me figure this out"  -  the system will recommend based on the other answers.',
    why: 'Different PR pathways have different eligibility criteria, points scores, and processing timelines. Identifying the right one early prevents wasted applications. Express Entry is points-based; PNP adds provincial nomination; Family Class is sponsorship-based. The wrong pathway choice can cost months of delays.',
    saveAs: 'pr_pathway',
    type: 'single',
    nextId: 'q_canada_time',
    options: [
      { value: 'express_entry', label: 'Express Entry (Federal Skilled Worker / CEC / FST)', emoji: '⚡' },
      { value: 'pnp', label: 'Provincial Nominee Program (PNP)', emoji: '🏔️' },
      { value: 'atlantic', label: 'Atlantic Immigration Program (AIP)', emoji: '🌊' },
      { value: 'rural_northern', label: 'Rural and Northern Immigration Pilot', emoji: '🌲' },
      { value: 'agri_food', label: 'Agri-Food Pilot', emoji: '🌾' },
      { value: 'caregiver_pr', label: 'Home Care Worker PR Pathway', emoji: '🏠' },
      { value: 'family_class', label: 'Family Class (spousal or parent/grandparent)', emoji: '❤️', nextId: 'q_sponsor_type' },
      { value: 'refugee_pr', label: 'Protected Person / Refugee pathway', emoji: '🕊️' },
      { value: 'not_sure', label: 'Help me figure it out', emoji: '❓' },
    ],
  },

  // ── Q (PR branch): Canada time ──────────────────────────────────
  {
    id: 'q_canada_time',
    question: 'How long has the client been in Canada?',
    why: 'Time in Canada is a key eligibility factor for many pathways. Canadian Experience Class (CEC) requires at least 1 year of Canadian work experience. Citizenship requires 3 of the last 5 years of physical presence. Some PNP streams require minimum residency in the province.',
    saveAs: 'canada_time',
    type: 'single',
    nextId: 'q_education',
    options: [
      { value: 'not_yet', label: 'Not yet in Canada', emoji: '🌍' },
      { value: 'less_1yr', label: 'Less than 1 year', emoji: '📅' },
      { value: '1_3yr', label: '1 – 3 years', emoji: '📅' },
      { value: '3_5yr', label: '3 – 5 years', emoji: '📅' },
      { value: 'over_5yr', label: 'Over 5 years', emoji: '⭐' },
    ],
  },

  // ── Q: Education ────────────────────────────────────────────────
  {
    id: 'q_education',
    question: "What is the client's highest level of education?",
    why: 'Education directly affects CRS points in Express Entry  -  a Master\'s or PhD can add up to 150 extra points (Academic bonus). It also determines NOC TEER eligibility and whether an Educational Credential Assessment (ECA) is needed for foreign degrees.',
    saveAs: 'education_level',
    type: 'single',
    nextId: 'q_language',
    options: [
      { value: 'less_than_secondary', label: 'Less than high school', emoji: '📚' },
      { value: 'secondary', label: 'High school diploma', emoji: '🏫' },
      { value: 'one_year_post_secondary', label: '1-year post-secondary certificate', emoji: '🎓' },
      { value: 'two_year_post_secondary', label: '2-year post-secondary diploma', emoji: '🎓' },
      { value: 'bachelors', label: "Bachelor's degree (3+ years)", emoji: '🎓' },
      { value: 'two_or_more_credentials', label: 'Two or more post-secondary credentials', emoji: '🎓' },
      { value: 'masters_phd', label: "Master's degree or PhD", emoji: '🏆' },
    ],
  },

  // ── Q: Language ─────────────────────────────────────────────────
  {
    id: 'q_language',
    question: 'Has the client taken a language test (IELTS, CELPIP, TEF, TCF)?',
    why: 'Language ability is the most heavily weighted factor in Express Entry  -  up to 160 CRS points per language (320 for bilingual). CLB 9+ in English/French can make or break an application. The test type matters: CELPIP is Canada-specific, IELTS General is widely accepted, TEF/TCF for French.',
    saveAs: 'language_test',
    type: 'single',
    nextId: 'q_clb',
    options: [
      { value: 'ielts_general', label: 'IELTS General', emoji: '🇬🇧' },
      { value: 'ielts_academic', label: 'IELTS Academic', emoji: '🇬🇧' },
      { value: 'celpip', label: 'CELPIP', emoji: '🍁' },
      { value: 'tef', label: 'TEF Canada (French)', emoji: '🇫🇷' },
      { value: 'tcf', label: 'TCF Canada (French)', emoji: '🇫🇷' },
      { value: 'not_yet', label: 'Not yet  -  test pending', emoji: '⏳', nextId: 'q_work_experience' },
      { value: 'none', label: 'No test taken', emoji: '❌', nextId: 'q_work_experience' },
    ],
  },

  // ── Q: CLB level ────────────────────────────────────────────────
  {
    id: 'q_clb',
    question: 'What is the client\'s approximate CLB level?',
    subtext: 'Check the IRCC CLB equivalency chart if unsure. CLB 9 is approx IELTS 7.0.',
    why: 'CLB (Canadian Language Benchmark) level is used across all immigration programs. CLB 7 is the minimum for most Express Entry streams. CLB 9 maximises CRS language points. For spousal sponsorship, CLB 5 is required for the sponsor. Use the IRCC equivalency table to convert IELTS/CELPIP scores.',
    saveAs: 'clb_level',
    type: 'single',
    nextId: 'q_work_experience',
    options: [
      { value: 'below_clb4', label: 'Below CLB 4', emoji: '📊' },
      { value: 'clb4_5', label: 'CLB 4 – 5', emoji: '📊' },
      { value: 'clb6_7', label: 'CLB 6 – 7', emoji: '📊' },
      { value: 'clb8', label: 'CLB 8', emoji: '📊' },
      { value: 'clb9_plus', label: 'CLB 9 or above', emoji: '⭐' },
      { value: 'not_sure', label: "Not sure", emoji: '❓' },
    ],
  },

  // ── Q: Work experience ──────────────────────────────────────────
  {
    id: 'q_work_experience',
    question: 'How many years of skilled work experience does the client have?',
    subtext: 'Include both Canadian and foreign skilled work (NOC TEER 0, 1, 2, or 3).',
    why: 'Work experience is a core CRS factor. Canadian work experience specifically  -  even 1 year in a TEER 0/1/2/3 occupation  -  opens up the Canadian Experience Class (CEC). Foreign skilled work experience earns additional CRS points. "Skilled" means NOC TEER 0, 1, 2, or 3  -  not unskilled labour.',
    saveAs: 'work_experience_years',
    type: 'single',
    nextId: 'q_job_offer',
    options: [
      { value: 'none', label: 'None', emoji: '❌' },
      { value: 'less_1yr', label: 'Less than 1 year', emoji: '📅' },
      { value: '1yr', label: '1 year', emoji: '📅' },
      { value: '2yr', label: '2 years', emoji: '📅' },
      { value: '3yr_plus', label: '3 or more years', emoji: '⭐' },
    ],
  },

  // ── Q: Job offer ────────────────────────────────────────────────
  {
    id: 'q_job_offer',
    question: 'Does the client have a valid job offer from a Canadian employer?',
    why: 'A Canadian job offer can add 50–200 CRS points, which can significantly boost Express Entry ranking. An LMIA-supported offer from a TEER 0 NOC employer adds 200 points; TEER 1–3 adds 50. LMIA-exempt offers (under ICA/CUSMA) may add 0–50 points. A strong job offer can be the difference between being selected and not.',
    saveAs: 'job_offer',
    type: 'single',
    nextId: 'q_province',
    options: [
      { value: 'yes_lmia', label: 'Yes  -  LMIA-supported offer', emoji: '✅', hint: '+50 CRS points' },
      { value: 'yes_exempt', label: 'Yes  -  LMIA-exempt offer', emoji: '✅', hint: '+0 or +25 CRS points depending on NOC' },
      { value: 'no', label: 'No job offer', emoji: '❌' },
      { value: 'not_sure', label: "Not sure if LMIA is required", emoji: '❓' },
    ],
  },

  // ── Q: Province ─────────────────────────────────────────────────
  {
    id: 'q_province',
    question: 'Which province or territory is the client in (or planning to settle in)?',
    why: 'Province matters for PNP nominations (each province has its own streams and requirements), French-language programs, Atlantic Immigration, and Rural/Northern pilots. Québec has a completely separate immigration system (CSQ). Some streams require the client to already be living in the province.',
    saveAs: 'target_province',
    type: 'single',
    nextId: 'q_billing_arrangement',
    options: [
      { value: 'BC', label: 'British Columbia', emoji: '🏔️' },
      { value: 'AB', label: 'Alberta', emoji: '⛽' },
      { value: 'SK', label: 'Saskatchewan', emoji: '🌾' },
      { value: 'MB', label: 'Manitoba', emoji: '🦌' },
      { value: 'ON', label: 'Ontario', emoji: '🏙️' },
      { value: 'QC', label: 'Québec', emoji: '⚜️' },
      { value: 'NB', label: 'New Brunswick', emoji: '🌊' },
      { value: 'NS', label: 'Nova Scotia', emoji: '🦞' },
      { value: 'PEI', label: 'Prince Edward Island', emoji: '🥔' },
      { value: 'NL', label: 'Newfoundland & Labrador', emoji: '🪨' },
      { value: 'north', label: 'NT / YT / NU', emoji: '🏔️' },
      { value: 'not_decided', label: 'Not yet decided', emoji: '❓' },
    ],
  },

  // ── Q (work goal branch): Work permit goal ──────────────────────
  {
    id: 'q_work_goal',
    question: 'What does the client need for a work permit?',
    saveAs: 'work_permit_goal',
    type: 'single',
    nextId: 'q_billing_arrangement',
    options: [
      { value: 'new_permit_lmia', label: 'New employer-specific permit (LMIA-based)', emoji: '📋' },
      { value: 'new_permit_exempt', label: 'New permit  -  LMIA exempt (ICA, CUSMA, ICT, etc.)', emoji: '🤝' },
      { value: 'pgwp', label: 'Post-Graduation Work Permit (PGWP)', emoji: '🎓' },
      { value: 'iec', label: 'International Experience Canada (IEC / Working Holiday)', emoji: '🎒' },
      { value: 'restore_extend', label: 'Restore or extend an existing permit', emoji: '🔄' },
      { value: 'bridging', label: 'Bridging Open Work Permit (BOWP)', emoji: '🌉', hint: 'While PR application in progress' },
      { value: 'spousal_owp', label: 'Spousal / Partner Open Work Permit', emoji: '❤️' },
    ],
  },

  // ── Q (study branch): Study permit goal ─────────────────────────
  {
    id: 'q_study_goal',
    question: 'What does the client need for study?',
    saveAs: 'study_permit_goal',
    type: 'single',
    nextId: 'q_billing_arrangement',
    options: [
      { value: 'new_permit', label: 'New study permit', emoji: '📚' },
      { value: 'extend_permit', label: 'Extend existing study permit', emoji: '🔄' },
      { value: 'restore', label: 'Restore study permit (maintained status?)', emoji: '⚠️' },
      { value: 'student_direct', label: 'Student Direct Stream (SDS)', emoji: '⚡', hint: 'India, China, Philippines, Vietnam, and others' },
    ],
  },

  // ── Q (visitor branch): Visitor type ────────────────────────────
  {
    id: 'q_visitor_type',
    question: 'What type of visitor status is needed?',
    saveAs: 'visitor_type',
    type: 'single',
    nextId: 'q_billing_arrangement',
    options: [
      { value: 'trv', label: 'Temporary Resident Visa (TRV)', emoji: '🛂', hint: 'For nationalities requiring a visa stamp' },
      { value: 'eta', label: 'Electronic Travel Authorisation (eTA)', emoji: '📱', hint: 'For visa-exempt nationalities flying to Canada' },
      { value: 'extension', label: 'Extend visitor status (maintain status)', emoji: '🔄' },
      { value: 'restore', label: 'Restore visitor status', emoji: '⚠️' },
      { value: 'super_visa', label: 'Super Visa (for parents / grandparents)', emoji: '👴', hint: 'Multi-entry, up to 5 years per entry' },
      { value: 'transit', label: 'Transit visa', emoji: '✈️' },
    ],
  },

  // ── Q (family branch): Sponsor type ────────────────────────────
  {
    id: 'q_sponsor_type',
    question: 'Who is the client sponsoring?',
    saveAs: 'sponsor_type',
    type: 'single',
    nextId: 'q_billing_arrangement',
    options: [
      { value: 'spouse_common_law', label: 'Spouse or common-law partner', emoji: '💍' },
      { value: 'conjugal', label: 'Conjugal partner', emoji: '❤️' },
      { value: 'dependent_child', label: 'Dependent child', emoji: '👶' },
      { value: 'parent_grandparent', label: 'Parent or grandparent (PGP)', emoji: '👴', hint: 'Lottery-based  -  intake only open certain years' },
      { value: 'other_relative', label: 'Other relative', emoji: '👥' },
    ],
  },

  // ── Q (citizenship branch): Eligibility check ───────────────────
  {
    id: 'q_citizenship_eligibility',
    question: 'Has the client been a Permanent Resident for at least 3 years in the last 5?',
    saveAs: 'citizenship_residency_met',
    type: 'single',
    nextId: 'q_billing_arrangement',
    options: [
      { value: 'yes', label: 'Yes  -  residency requirement met', emoji: '✅' },
      { value: 'close', label: 'Almost  -  within 6 months of meeting it', emoji: '⏳' },
      { value: 'no', label: 'No  -  not yet eligible', emoji: '❌' },
      { value: 'not_sure', label: "Not sure  -  need to calculate", emoji: '❓' },
    ],
  },

  // ── Q (appeal branch): Type of appeal ───────────────────────────
  {
    id: 'q_appeal_type',
    question: 'What type of appeal or review is needed?',
    saveAs: 'appeal_type',
    type: 'single',
    nextId: 'q_appeal_deadline',
    options: [
      { value: 'iad', label: 'Immigration Appeal Division (IAD)', emoji: '⚖️', hint: 'Sponsorship refusal or removal order' },
      { value: 'rad', label: 'Refugee Appeal Division (RAD)', emoji: '🕊️' },
      { value: 'judicial_review', label: 'Federal Court  -  Judicial Review', emoji: '🏛️' },
      { value: 'irb_other', label: 'Other IRB proceeding (ID or RPD)', emoji: '📋' },
      { value: 'ministerial_relief', label: 'Ministerial Relief / Security review', emoji: '🔒' },
    ],
  },

  // ── Q (appeal branch): Deadline ─────────────────────────────────
  {
    id: 'q_appeal_deadline',
    question: 'Is there a known appeal or JR deadline?',
    subtext: 'IAD: 30 days from removal order. Federal Court JR: 15 days (inland) / 60 days (abroad).',
    why: 'Appeal deadlines in immigration law are STRICT  -  missing one can permanently bar the client from that remedy with no exceptions. We flag these immediately as critical tasks in the matter. If a deadline is approaching, this intake may need to be paused and an emergency task created right away.',
    saveAs: 'appeal_deadline',
    type: 'date',
    optional: true,
    placeholder: 'YYYY-MM-DD',
    nextId: 'q_billing_arrangement',
  },

  // ── Q: Timeline ──────────────────────────────────────────────────
  {
    id: 'q_timeline',
    question: 'How urgently does the client need a result?',
    why: 'Urgency affects which application pathway we recommend and whether we need to flag immediate risks. If a permit is expiring, there may be implied status implications. If there is a removal order or hearing, fast-track options or bridging permits may be needed. We use this to set the right expectations.',
    saveAs: 'urgency',
    type: 'single',
    nextId: 'q_billing_arrangement',
    options: [
      { value: 'asap', label: 'Urgent  -  within 4 weeks', emoji: '🔴', hint: 'Impending removal, expiry, or departure' },
      { value: '1_3_months', label: '1 – 3 months', emoji: '🟡' },
      { value: '3_6_months', label: '3 – 6 months', emoji: '🟢' },
      { value: '6_plus_months', label: 'No rush  -  6+ months', emoji: '⚪' },
      { value: 'not_sure', label: "Not sure", emoji: '❓' },
    ],
  },

  // ── Q: Billing arrangement (MANDATORY  -  must ask before recommendation) ──
  {
    id: 'q_billing_arrangement',
    question: 'What billing arrangement will apply to this matter?',
    why: 'A matter cannot be formally opened in NorvaOS until a billing arrangement is confirmed. This protects both the firm and the client  -  it ensures everyone agrees on fees before work begins. Pro Bono and Fee Deferred are valid options but must be explicitly chosen (not assumed). This is a regulatory best practice.',
    subtext:
      'A matter cannot be opened until the billing arrangement is confirmed. ' +
      'Pro Bono and Fee Deferred are valid options but must be explicitly selected.',
    saveAs: 'billing_arrangement',
    type: 'single',
    nextId: null, // END  -  triggers recommendation
    options: [
      {
        value: 'flat_fee',
        label: 'Flat fee',
        emoji: '💳',
        hint: 'Fixed amount agreed before work begins',
      },
      {
        value: 'hourly',
        label: 'Hourly billing',
        emoji: '⏱️',
        hint: 'Billed at hourly rate as work progresses',
      },
      {
        value: 'contingency',
        label: 'Contingency / success fee',
        emoji: '🏆',
      },
      {
        value: 'pro_bono',
        label: 'Pro Bono (no fee)',
        emoji: '🤝',
        hint: 'No retainer required  -  matter opens immediately upon commitment',
      },
      {
        value: 'fee_deferred',
        label: 'Fee Deferred',
        emoji: '📅',
        hint: 'Fee agreed but collected later  -  document reason for deferral',
      },
    ],
  },
]

// ─── Question lookup helper ──────────────────────────────────────────────────

const QUESTION_MAP = Object.fromEntries(INTAKE_QUESTIONS.map((q) => [q.id, q]))

export function getQuestion(id: string): IntakeQuestion | undefined {
  return QUESTION_MAP[id]
}

export const FIRST_QUESTION_ID = 'q_who'

/**
 * Given the current question and the answer value, returns the ID of the
 * next question (null = end of tree, trigger recommendation).
 */
export function getNextQuestionId(
  question: IntakeQuestion,
  answerValue: string
): string | null {
  const matchingOption = question.options?.find((o) => o.value === answerValue)
  if (matchingOption && 'nextId' in matchingOption) {
    return matchingOption.nextId ?? null
  }
  return question.nextId ?? null
}

// ─── Recommendation engine ───────────────────────────────────────────────────

export interface IntakeRecommendation {
  /** Short title, e.g. "Express Entry  -  Federal Skilled Worker" */
  title: string
  /** IRCC application code or key, e.g. "EE-FSW" */
  code: string
  /** Emoji icon */
  emoji: string
  /** Confidence level */
  confidence: 'strong' | 'likely' | 'possible'
  /** Why this route was recommended */
  rationale: string[]
  /** Typical IRCC processing time */
  processingTime?: string
  /** Known hard-deadline warning (e.g. JR window) */
  deadlineWarning?: string
  /** Whether to show a JR-deadline calculator */
  showJrDeadline?: boolean
}

/**
 * Generates up to 3 recommended immigration routes based on the collected answers.
 * This is a rule-based engine  -  it will be augmented by Claude AI inference at the
 * end of the wizard UI.
 */
export function generateRecommendations(answers: IntakeAnswers): IntakeRecommendation[] {
  const results: IntakeRecommendation[] = []
  const goal = answers.immigration_goal as string | undefined
  const pathway = answers.pr_pathway as string | undefined
  const status = answers.current_status as string | undefined
  const clb = answers.clb_level as string | undefined
  const edu = answers.education_level as string | undefined
  const exp = answers.work_experience_years as string | undefined
  const jobOffer = answers.job_offer as string | undefined
  const province = answers.target_province as string | undefined
  const who = answers.intake_who as string | undefined
  const urgency = answers.urgency as string | undefined
  const refugeeType = answers.refugee_type as string | undefined
  const refugeeStage = answers.refugee_stage as string | undefined
  const appealType = answers.appeal_type as string | undefined
  const citizenshipMet = answers.citizenship_residency_met as string | undefined
  const workGoal = answers.work_permit_goal as string | undefined
  const studyGoal = answers.study_permit_goal as string | undefined
  const visitorType = answers.visitor_type as string | undefined
  const sponsorType = answers.sponsor_type as string | undefined
  const employerGoal = answers.employer_goal as string | undefined

  // ── Employer track ───────────────────────────────────────────────
  if (who === 'employer') {
    if (employerGoal === 'global_talent') {
      results.push({
        title: 'Global Talent Stream (LMIA  -  GTS)',
        code: 'GTS',
        emoji: '⚡',
        confidence: 'strong',
        rationale: [
          'Client explicitly identified as needing highly skilled tech workers',
          'GTS offers 2-week processing  -  fastest LMIA route available',
        ],
        processingTime: '2 weeks (Government service standard)',
      })
    }
    if (employerGoal === 'hire_foreign_worker' || employerGoal === 'global_talent') {
      if (answers.lmia_stream === 'high_wage') {
        results.push({
          title: 'LMIA  -  High-Wage Stream',
          code: 'LMIA-HW',
          emoji: '💼',
          confidence: 'strong',
          rationale: ['Role is above provincial/territorial median wage', 'Transition Plan required'],
          processingTime: '~2 – 5 months (standard)',
        })
      } else if (answers.lmia_stream === 'low_wage') {
        results.push({
          title: 'LMIA  -  Low-Wage Stream',
          code: 'LMIA-LW',
          emoji: '🔧',
          confidence: 'strong',
          rationale: ['Role at or below provincial/territorial median wage', 'Caps on low-wage workers may apply by sector'],
          processingTime: '~2 – 5 months',
        })
      } else if (answers.lmia_stream === 'agricultural') {
        results.push({
          title: 'LMIA  -  Agricultural / SAWP',
          code: 'LMIA-AG',
          emoji: '🌾',
          confidence: 'strong',
          rationale: ['Agricultural role identified', 'SAWP applicable for Mexico/Caribbean source countries'],
          processingTime: '~1 – 2 months (expedited for SAWP)',
        })
      } else {
        results.push({
          title: 'LMIA  -  Stream Assessment Required',
          code: 'LMIA-TBD',
          emoji: '📋',
          confidence: 'likely',
          rationale: ['LMIA likely required', 'Stream (high-wage vs. low-wage vs. GTS) needs full NOC and wage assessment'],
          processingTime: '2 weeks – 5 months depending on stream',
        })
      }
    }
    if (employerGoal === 'transfer_employee') {
      results.push({
        title: 'Intra-Company Transfer (ICT) Work Permit',
        code: 'ICT',
        emoji: '✈️',
        confidence: 'strong',
        rationale: [
          'Employee already works for the company abroad',
          'LMIA-exempt under CUSMA/NAFTA or ICA if qualifications met',
        ],
        processingTime: '~1 – 3 months',
      })
    }
    return results.slice(0, 3)
  }

  // ── Appeal track ─────────────────────────────────────────────────
  if (goal === 'appeal_review' || appealType) {
    if (appealType === 'judicial_review') {
      results.push({
        title: 'Federal Court  -  Judicial Review',
        code: 'JR',
        emoji: '🏛️',
        confidence: 'strong',
        rationale: [
          'Client has received a negative decision from IRCC or the IRB',
          'JR leave application must be filed within strict deadlines',
        ],
        processingTime: '6 – 24 months',
        deadlineWarning:
          '⚠ JR must be filed within 15 days of decision (inland) or 60 days (outside Canada). Confirm date of decision immediately.',
        showJrDeadline: true,
      })
    }
    if (appealType === 'rad') {
      results.push({
        title: 'Refugee Appeal Division (RAD)',
        code: 'RAD',
        emoji: '⚖️',
        confidence: 'strong',
        rationale: ['RPD claim rejected', 'RAD appeal must be filed within 15 days of RPD decision'],
        processingTime: '3 – 18 months',
        deadlineWarning: '⚠ RAD Notice of Appeal due within 15 days of RPD rejection. Confirm appeal period immediately.',
      })
    }
    if (appealType === 'iad') {
      results.push({
        title: 'Immigration Appeal Division (IAD)',
        code: 'IAD',
        emoji: '⚖️',
        confidence: 'strong',
        rationale: ['Removal order or sponsorship refusal  -  IAD has jurisdiction'],
        processingTime: '1 – 3 years',
        deadlineWarning: '⚠ IAD appeal must be filed within 30 days of removal order.',
      })
    }
    return results.slice(0, 3)
  }

  // ── Refugee track ────────────────────────────────────────────────
  if (status === 'refugee_claimant' || refugeeType) {
    if (refugeeType === 'inland_claim' || (status === 'refugee_claimant' && !refugeeType)) {
      const isPreHearing = refugeeStage === 'claim_filed' || refugeeStage === 'hearing_soon' || refugeeStage === 'just_arrived'
      results.push({
        title: 'Inland Refugee Claim  -  RPD Hearing',
        code: 'RPD',
        emoji: '🕊️',
        confidence: 'strong',
        rationale: [
          'Client is claiming refugee protection from within Canada',
          isPreHearing ? 'Claim is pre-hearing  -  RPD preparation required' : 'Claim rejected  -  consider RAD or JR',
        ],
        processingTime: '18 – 24 months (varies by office)',
        deadlineWarning: refugeeStage === 'hearing_soon'
          ? '⚠ Hearing within 3 months  -  disclosure deadline may have passed. Review immediately.'
          : undefined,
      })
    }
    if (refugeeType === 'pre_removal') {
      results.push({
        title: 'Pre-Removal Risk Assessment (PRRA)',
        code: 'PRRA',
        emoji: '⚠️',
        confidence: 'strong',
        rationale: ['Client is subject to removal and eligible for PRRA', 'Must be filed within the PRRA application period'],
        processingTime: '6 – 18 months',
      })
    }
    if (refugeeType === 'had_claim') {
      results.push({
        title: 'Humanitarian & Compassionate (H&C) Application',
        code: 'H&C',
        emoji: '⚖️',
        confidence: 'strong',
        rationale: ['H&C is being considered in parallel or as primary relief route'],
        processingTime: '18 – 36 months',
      })
    }
    return results.slice(0, 3)
  }

  // ── Citizenship ──────────────────────────────────────────────────
  if (goal === 'citizenship') {
    const eligible = citizenshipMet === 'yes' || citizenshipMet === 'close'
    results.push({
      title: 'Canadian Citizenship Application',
      code: 'CITZ',
      emoji: '🍁',
      confidence: eligible ? 'strong' : 'possible',
      rationale: [
        eligible
          ? 'Residency requirement appears to be met or nearly met'
          : 'Residency obligation not yet met  -  application cannot proceed until satisfied',
        'Language requirement (CLB 4+) and Citizenship test required for ages 18 – 54',
      ],
      processingTime: '12 – 24 months',
    })
    return results
  }

  // ── Visitor visa / eTA / extension ──────────────────────────────
  if (goal === 'visitor_visa' || visitorType) {
    const type = visitorType || 'trv'
    if (type === 'super_visa') {
      results.push({
        title: 'Super Visa',
        code: 'SUPER-VISA',
        emoji: '👴',
        confidence: 'strong',
        rationale: [
          'Client\'s parents or grandparents visiting adult child who is Canadian citizen or PR',
          'Up to 5 years per stay, 10-year multiple-entry visa',
        ],
        processingTime: '~8 weeks',
      })
    } else if (type === 'extension' || type === 'restore') {
      results.push({
        title: type === 'restore' ? 'Restoration of Visitor Status' : 'Visitor Record Extension',
        code: type === 'restore' ? 'RESTORE-VIS' : 'VIS-EXT',
        emoji: '🔄',
        confidence: 'strong',
        rationale: [
          type === 'restore' ? 'Status expired  -  restoration must be filed promptly (within 90 days)' : 'Client wishes to extend authorised stay',
        ],
        processingTime: type === 'restore' ? '~2 – 3 months' : '~1 – 2 months',
        deadlineWarning: type === 'restore'
          ? '⚠ Restoration must be filed within 90 days of status expiry  -  confirm expiry date immediately.'
          : undefined,
      })
    } else {
      results.push({
        title: type === 'eta' ? 'Electronic Travel Authorisation (eTA)' : 'Temporary Resident Visa (TRV)',
        code: type === 'eta' ? 'ETA' : 'TRV',
        emoji: '🛂',
        confidence: 'strong',
        rationale: [
          type === 'eta' ? 'Client is from a visa-exempt country requiring an eTA to fly to Canada' : 'Client requires a visa stamp to enter Canada',
        ],
        processingTime: type === 'eta' ? 'Minutes to 72 hours (usually instant)' : '~2 – 8 weeks',
      })
    }
    return results.slice(0, 3)
  }

  // ── Study permit ─────────────────────────────────────────────────
  if (goal === 'study_permit' || studyGoal) {
    const sg = studyGoal || 'new_permit'
    results.push({
      title:
        sg === 'student_direct'
          ? 'Student Direct Stream (SDS)'
          : sg === 'extend_permit'
          ? 'Study Permit Extension'
          : sg === 'restore'
          ? 'Restoration of Student Status'
          : 'New Study Permit',
      code: sg === 'student_direct' ? 'SDS' : sg === 'extend_permit' ? 'STUDY-EXT' : sg === 'restore' ? 'RESTORE-STUDY' : 'STUDY',
      emoji: '🎓',
      confidence: 'strong',
      rationale: [
        sg === 'student_direct' ? 'Client is from an SDS-eligible country  -  faster processing (20 days)' : 'Standard study permit application',
        sg === 'restore' ? '⚠ Restoration required  -  must file within 90 days of status expiry' : 'Acceptance letter from DLI required',
      ],
      processingTime: sg === 'student_direct' ? '~20 days' : '~4 – 12 weeks (varies by visa office)',
      deadlineWarning:
        sg === 'restore' ? '⚠ Restoration must be filed within 90 days of expiry.' : undefined,
    })
    return results
  }

  // ── Work permit ──────────────────────────────────────────────────
  if (goal === 'work_permit' || workGoal) {
    const wg = workGoal || 'new_permit_lmia'
    if (wg === 'pgwp') {
      results.push({
        title: 'Post-Graduation Work Permit (PGWP)',
        code: 'PGWP',
        emoji: '🎓',
        confidence: 'strong',
        rationale: ['Client graduated from a PGWP-eligible DLI', 'Must apply within 180 days of graduation'],
        processingTime: '~3 – 5 months',
        deadlineWarning: '⚠ PGWP application must be submitted within 180 days of graduation date.',
      })
    } else if (wg === 'bridging') {
      results.push({
        title: 'Bridging Open Work Permit (BOWP)',
        code: 'BOWP',
        emoji: '🌉',
        confidence: 'strong',
        rationale: ['PR application is in progress', 'BOWP allows continued work while PR is being processed'],
        processingTime: '~1 – 3 months',
      })
    } else if (wg === 'spousal_owp') {
      results.push({
        title: 'Spousal / Partner Open Work Permit',
        code: 'SOWP',
        emoji: '❤️',
        confidence: 'strong',
        rationale: ['Client is spouse or partner of a Canadian citizen, PR, or work permit holder (eligible category)'],
        processingTime: '~2 – 6 months',
      })
    } else if (wg === 'iec') {
      results.push({
        title: 'International Experience Canada (IEC / Working Holiday)',
        code: 'IEC',
        emoji: '🎒',
        confidence: 'strong',
        rationale: ['Client is from an IEC-eligible country and within eligible age range (typically 18–35)'],
        processingTime: '~4 – 8 weeks',
      })
    } else {
      results.push({
        title: wg === 'restore_extend' ? 'Work Permit Restoration / Extension' : wg === 'new_permit_exempt' ? 'LMIA-Exempt Work Permit' : 'Employer-Specific Work Permit (LMIA)',
        code: wg === 'restore_extend' ? 'WP-RESTORE' : wg === 'new_permit_exempt' ? 'WP-EXEMPT' : 'WP-LMIA',
        emoji: '💼',
        confidence: 'strong',
        rationale: [wg === 'new_permit_exempt' ? 'Position is exempt from LMIA under ICA, CUSMA, or other exemption' : 'Standard work permit pathway'],
        processingTime: '~2 – 6 months',
      })
    }
    return results.slice(0, 3)
  }

  // ── Family sponsorship ───────────────────────────────────────────
  if (goal === 'family_sponsorship' || sponsorType) {
    const st = sponsorType || 'spouse_common_law'
    if (st === 'parent_grandparent') {
      results.push({
        title: 'Parent & Grandparent Sponsorship (PGP)',
        code: 'PGP',
        emoji: '👴',
        confidence: 'likely',
        rationale: [
          'Client wishes to sponsor a parent or grandparent',
          'Intake pool is only open certain years  -  confirm current IRCC intake status',
          'Super Visa is an alternative if PGP intake is closed',
        ],
        processingTime: '24 – 48 months',
      })
      results.push({
        title: 'Super Visa (interim alternative)',
        code: 'SUPER-VISA',
        emoji: '👴',
        confidence: 'possible',
        rationale: ['While waiting for PGP lottery, a Super Visa allows multi-year stays'],
        processingTime: '~8 weeks',
      })
    } else {
      results.push({
        title:
          st === 'spouse_common_law'
            ? 'Spousal / Common-Law Sponsorship'
            : st === 'dependent_child'
            ? 'Dependent Child Sponsorship'
            : 'Family Class Sponsorship',
        code: st === 'spouse_common_law' ? 'SPOUSE-SPONS' : st === 'dependent_child' ? 'CHILD-SPONS' : 'FAM-SPONS',
        emoji: st === 'spouse_common_law' ? '💍' : '👶',
        confidence: 'strong',
        rationale: ['Client meets sponsor eligibility (citizen or PR)', 'Outland or inland option depending on client location'],
        processingTime: st === 'spouse_common_law' ? '12 months (outland) / varies (inland)' : '~12 months',
      })
    }
    return results.slice(0, 3)
  }

  // ── PR / Express Entry ───────────────────────────────────────────
  if (goal === 'permanent_residence' || pathway) {
    const pw = pathway || 'not_sure'

    const hasStrongCLB = clb === 'clb9_plus' || clb === 'clb8'
    const hasDegree = edu === 'bachelors' || edu === 'masters_phd' || edu === 'two_or_more_credentials'
    const hasExperience = exp === '1yr' || exp === '2yr' || exp === '3yr_plus'
    const hasJobOffer = jobOffer === 'yes_lmia' || jobOffer === 'yes_exempt'

    if (pw === 'express_entry' || pw === 'not_sure') {
      // Canadian Experience Class
      if (status === 'worker' || status === 'student') {
        results.push({
          title: 'Express Entry  -  Canadian Experience Class (CEC)',
          code: 'EE-CEC',
          emoji: '⚡',
          confidence: hasExperience ? 'strong' : 'likely',
          rationale: [
            'Client has Canadian temporary status  -  CEC requires 1 year of skilled Canadian work experience',
            hasStrongCLB ? 'Language scores meet CEC requirements' : 'Language scores need verification for CLB 7+ requirement',
            hasExperience ? 'Work experience appears sufficient' : 'Confirm 1 year of skilled Canadian work experience (NOC TEER 0/1/2/3)',
          ],
          processingTime: '~6 months from ITA',
        })
      }

      // Federal Skilled Worker
      if (pw === 'not_sure' || pw === 'express_entry') {
        results.push({
          title: 'Express Entry  -  Federal Skilled Worker (FSW)',
          code: 'EE-FSW',
          emoji: '⚡',
          confidence: hasExperience && hasDegree && hasStrongCLB ? 'strong' : 'likely',
          rationale: [
            'Most internationally educated applicants use the FSW stream',
            hasDegree ? 'Education level meets minimum requirements' : 'Education assessment (ECA) required if degree obtained outside Canada',
            hasStrongCLB ? 'Language profile appears strong' : 'CLB 7+ required in all four abilities',
            hasJobOffer ? 'Job offer adds significant CRS points' : 'No job offer  -  CRS score may need PNP boost',
          ],
          processingTime: '~6 months from ITA',
        })
      }
    }

    if (pw === 'pnp' || (pw === 'not_sure' && province && province !== 'not_decided')) {
      results.push({
        title: `Provincial Nominee Program  -  ${province ?? 'TBD'} Stream`,
        code: 'PNP',
        emoji: '🏔️',
        confidence: 'likely',
        rationale: [
          `Target province is ${province ?? 'not yet identified'}  -  review province-specific streams`,
          'PNP nomination adds 600 CRS points in Express Entry (guaranteed ITA)',
          province === 'ON' ? 'OINP  -  check Human Capital Priorities or Masters Graduate stream' : '',
          province === 'BC' ? 'BCPNP  -  check Skills Immigration, Tech Pilot, or International Graduate stream' : '',
          province === 'AB' ? 'AINP  -  check Alberta Opportunity Stream or Express Entry' : '',
        ].filter(Boolean),
        processingTime: '~12 – 24 months (includes provincial processing)',
      })
    }

    if (pw === 'atlantic') {
      results.push({
        title: 'Atlantic Immigration Program (AIP)',
        code: 'AIP',
        emoji: '🌊',
        confidence: 'strong',
        rationale: ['Client intends to settle in Atlantic Canada', 'Employer designation and job offer required'],
        processingTime: '~12 months',
      })
    }

    if (urgency === 'asap' && results.length === 0) {
      results.push({
        title: 'Bridging / Status Maintenance (Immediate)',
        code: 'BRIDGE',
        emoji: '🔴',
        confidence: 'possible',
        rationale: ['Client has indicated urgent timeline', 'Immediate priority: maintain status while permanent pathway is assessed'],
        processingTime: 'Immediate filing required',
        deadlineWarning: '⚠ Review current status expiry immediately to avoid loss of status.',
      })
    }
  }

  return results.slice(0, 3)
}
