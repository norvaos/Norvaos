/**
 * Tests for the Immigration Readiness Matrix Engine.
 *
 * Covers: computeReadinessMatrix(), evaluateLawyerReviewTriggers()
 *  -  domain scoring, blocker identification, person-role scoping,
 *   drafting vs filing separation, and lawyer review trigger logic.
 */

import { describe, it, expect } from 'vitest'
import {
  computeReadinessMatrix,
  evaluateLawyerReviewTriggers,
  type ReadinessMatrixContext,
  type ReadinessPersonRow,
  type ReadinessSlotRow,
  type ReadinessImmigrationRow,
} from '../readiness-matrix-engine'
import type {
  ImmigrationPlaybook,
  QuestionnaireFieldRule,
  DocumentRule,
  LawyerReviewTrigger,
} from '@/lib/config/immigration-playbooks'

// ── Test Fixtures ────────────────────────────────────────────────────────────

function makePlaybook(overrides?: Partial<ImmigrationPlaybook>): ImmigrationPlaybook {
  return {
    matterTypeKey: 'spousal',
    label: 'Spousal Sponsorship',
    personRoleRequirements: [],
    questionnaireSections: [],
    mandatoryDocumentSlugs: [],
    lawyerReviewRequired: true,
    reminderCadenceDays: [3, 7],
    formPackTypes: ['draft'],
    formGenerationRules: {
      minQuestionnairePct: 80,
      requiredDocumentSlugs: [],
      requireNoUnresolvedContradictions: true,
    },
    filingReadinessRules: {
      requireAllMandatoryDocsAccepted: true,
      requireAllFormPacksGenerated: true,
      requireLawyerReview: true,
      requireNoActiveContradictions: true,
      requireNoPendingReviews: true,
    },
    contradictionRules: [],
    readinessThreshold: 85,
    questionnaireFieldRules: [],
    documentRules: [],
    lawyerReviewTriggers: [],
    ...overrides,
  }
}

function makePerson(overrides?: Partial<ReadinessPersonRow>): ReadinessPersonRow {
  return {
    id: 'person-1',
    person_role: 'principal_applicant',
    first_name: 'Test',
    last_name: 'User',
    criminal_charges: false,
    inadmissibility_flag: false,
    is_active: true,
    ...overrides,
  }
}

function makeSlot(overrides?: Partial<ReadinessSlotRow>): ReadinessSlotRow {
  return {
    slot_slug: 'passport',
    status: 'accepted',
    is_required: true,
    is_active: true,
    person_id: null,
    person_role: null,
    ...overrides,
  }
}

function makeContext(overrides?: Partial<ReadinessMatrixContext>): ReadinessMatrixContext {
  return {
    playbook: makePlaybook(),
    profile: {},
    people: [makePerson()],
    documentSlots: [],
    immigration: null,
    ...overrides,
  }
}

const FIELD_RULES: QuestionnaireFieldRule[] = [
  {
    profile_path: 'personal.family_name',
    label: 'Family name',
    readiness_domain: 'client_identity',
    person_role_scope: 'pa',
    blocks_drafting: true,
    blocks_filing: true,
    review_role_required: null,
  },
  {
    profile_path: 'personal.given_name',
    label: 'Given name',
    readiness_domain: 'client_identity',
    person_role_scope: 'pa',
    blocks_drafting: true,
    blocks_filing: true,
    review_role_required: null,
  },
  {
    profile_path: 'personal.date_of_birth',
    label: 'Date of birth',
    readiness_domain: 'client_identity',
    person_role_scope: 'pa',
    blocks_drafting: false,
    blocks_filing: true,
    review_role_required: null,
  },
  {
    profile_path: 'family.spouse_name',
    label: 'Spouse name',
    readiness_domain: 'family_composition',
    person_role_scope: 'spouse',
    blocks_drafting: true,
    blocks_filing: true,
    review_role_required: null,
  },
  {
    profile_path: 'immigration_history.prior_refusals',
    label: 'Prior refusals',
    readiness_domain: 'immigration_history',
    person_role_scope: 'pa',
    blocks_drafting: false,
    blocks_filing: true,
    review_role_required: null,
  },
]

const DOC_RULES: DocumentRule[] = [
  {
    slot_slug: 'passport',
    label: 'Passport',
    readiness_domain: 'client_identity',
    person_role_scope: 'pa',
    blocks_drafting: true,
    blocks_filing: true,
    translation_required: false,
    expiry_rule: null,
  },
  {
    slot_slug: 'marriage_cert',
    label: 'Marriage Certificate',
    readiness_domain: 'evidence',
    person_role_scope: 'pa',
    blocks_drafting: false,
    blocks_filing: true,
    translation_required: false,
    expiry_rule: null,
  },
  {
    slot_slug: 'police_clearance',
    label: 'Police Clearance',
    readiness_domain: 'review_risk',
    person_role_scope: 'all',
    blocks_drafting: false,
    blocks_filing: true,
    translation_required: false,
    expiry_rule: null,
  },
]

// ── computeReadinessMatrix tests ─────────────────────────────────────────────

describe('computeReadinessMatrix', () => {
  it('returns null when playbook has no questionnaireFieldRules', () => {
    const ctx = makeContext({
      playbook: makePlaybook({ questionnaireFieldRules: undefined }),
    })
    expect(computeReadinessMatrix(ctx)).toBeNull()
  })

  it('returns null when questionnaireFieldRules is empty array', () => {
    const ctx = makeContext({
      playbook: makePlaybook({ questionnaireFieldRules: [] }),
    })
    expect(computeReadinessMatrix(ctx)).toBeNull()
  })

  it('computes 100% when all fields are filled', () => {
    const ctx = makeContext({
      playbook: makePlaybook({ questionnaireFieldRules: FIELD_RULES }),
      profile: {
        personal: { family_name: 'Zia', given_name: 'Waseer', date_of_birth: '1990-01-01' },
        immigration_history: { prior_refusals: false },
        // No spouse rule fires because no spouse person exists
      },
      people: [makePerson()],
    })

    const result = computeReadinessMatrix(ctx)!
    expect(result).not.toBeNull()

    // 4 PA rules should be evaluated (spouse rule skipped  -  no spouse person)
    expect(result.allBlockers).toHaveLength(0)
    expect(result.overallPct).toBe(100)
    expect(result.meetsThreshold).toBe(true)
  })

  it('identifies blockers for missing fields', () => {
    const ctx = makeContext({
      playbook: makePlaybook({ questionnaireFieldRules: FIELD_RULES }),
      profile: {
        personal: { family_name: 'Zia' },
        // given_name, date_of_birth, prior_refusals are missing
      },
      people: [makePerson()],
    })

    const result = computeReadinessMatrix(ctx)!
    expect(result.allBlockers).toHaveLength(3) // given_name, dob, prior_refusals
    expect(result.allBlockers.map((b) => b.identifier)).toEqual(
      expect.arrayContaining([
        'personal.given_name',
        'personal.date_of_birth',
        'immigration_history.prior_refusals',
      ])
    )
  })

  it('separates drafting vs filing blockers', () => {
    const ctx = makeContext({
      playbook: makePlaybook({ questionnaireFieldRules: FIELD_RULES }),
      profile: {
        personal: { family_name: 'Zia' },
        // given_name missing → blocks_drafting: true + blocks_filing: true
        // date_of_birth missing → blocks_drafting: false + blocks_filing: true
        // prior_refusals missing → blocks_drafting: false + blocks_filing: true
      },
      people: [makePerson()],
    })

    const result = computeReadinessMatrix(ctx)!
    expect(result.draftingBlockers).toHaveLength(1) // only given_name
    expect(result.draftingBlockers[0].identifier).toBe('personal.given_name')
    expect(result.filingBlockers).toHaveLength(3) // all three
  })

  it('skips spouse-scoped rules when no spouse person exists', () => {
    const ctx = makeContext({
      playbook: makePlaybook({ questionnaireFieldRules: FIELD_RULES }),
      profile: {},
      people: [makePerson()], // PA only, no spouse
    })

    const result = computeReadinessMatrix(ctx)!
    // Spouse rule should NOT appear in blockers
    const spouseBlockers = result.allBlockers.filter((b) => b.identifier === 'family.spouse_name')
    expect(spouseBlockers).toHaveLength(0)
  })

  it('includes spouse-scoped rules when spouse person exists', () => {
    const ctx = makeContext({
      playbook: makePlaybook({ questionnaireFieldRules: FIELD_RULES }),
      profile: {},
      people: [
        makePerson(),
        makePerson({ id: 'person-2', person_role: 'spouse', first_name: 'Sara', last_name: 'Ahmed' }),
      ],
    })

    const result = computeReadinessMatrix(ctx)!
    const spouseBlockers = result.allBlockers.filter((b) => b.identifier === 'family.spouse_name')
    expect(spouseBlockers).toHaveLength(1)
    expect(spouseBlockers[0].blocks_drafting).toBe(true)
  })

  it('tracks question-only rule counts separately from total', () => {
    const ctx = makeContext({
      playbook: makePlaybook({
        questionnaireFieldRules: FIELD_RULES.slice(0, 2), // 2 client_identity questions
        documentRules: [DOC_RULES[0]], // 1 client_identity document (passport)
      }),
      profile: { personal: { family_name: 'Zia' } }, // 1 of 2 questions filled
      people: [makePerson()],
      documentSlots: [], // passport not accepted
    })

    const result = computeReadinessMatrix(ctx)!
    const identity = result.domains.client_identity

    // Total: 2 questions + 1 document = 3 rules
    expect(identity.totalRules).toBe(3)
    // Question-only: 2 rules
    expect(identity.questionTotalRules).toBe(2)
    // Question satisfied: 1 (family_name filled)
    expect(identity.questionSatisfiedRules).toBe(1)
    // Total satisfied: 1 (family_name)
    expect(identity.satisfiedRules).toBe(1)
  })

  it('evaluates document rules for PA scope', () => {
    const ctx = makeContext({
      playbook: makePlaybook({
        questionnaireFieldRules: FIELD_RULES.slice(0, 1), // minimal question
        documentRules: [DOC_RULES[0]], // passport  -  PA scope
      }),
      profile: { personal: { family_name: 'Zia' } },
      people: [makePerson()],
      documentSlots: [
        makeSlot({ slot_slug: 'passport', status: 'accepted', person_role: 'principal_applicant' }),
      ],
    })

    const result = computeReadinessMatrix(ctx)!
    const docBlockers = result.allBlockers.filter((b) => b.type === 'document')
    expect(docBlockers).toHaveLength(0) // passport accepted
    expect(result.overallPct).toBe(100)
  })

  it('creates blocker for missing PA document', () => {
    const ctx = makeContext({
      playbook: makePlaybook({
        questionnaireFieldRules: FIELD_RULES.slice(0, 1),
        documentRules: [DOC_RULES[0]], // passport required
      }),
      profile: { personal: { family_name: 'Zia' } },
      people: [makePerson()],
      documentSlots: [
        makeSlot({ slot_slug: 'passport', status: 'pending_review', person_role: 'principal_applicant' }),
      ],
    })

    const result = computeReadinessMatrix(ctx)!
    const docBlockers = result.allBlockers.filter((b) => b.type === 'document')
    expect(docBlockers).toHaveLength(1)
    expect(docBlockers[0].identifier).toBe('passport')
    expect(docBlockers[0].blocks_drafting).toBe(true)
  })

  it('evaluates "all" scope document rules per active person', () => {
    const ctx = makeContext({
      playbook: makePlaybook({
        questionnaireFieldRules: FIELD_RULES.slice(0, 1),
        documentRules: [DOC_RULES[2]], // police_clearance  -  "all" scope
      }),
      profile: { personal: { family_name: 'Zia' } },
      people: [
        makePerson({ id: 'p1' }),
        makePerson({ id: 'p2', person_role: 'spouse', first_name: 'Sara', last_name: 'Ahmed' }),
      ],
      documentSlots: [
        makeSlot({ slot_slug: 'police_clearance', status: 'accepted', person_id: 'p1' }),
        // p2 doesn't have police clearance accepted
      ],
    })

    const result = computeReadinessMatrix(ctx)!
    const policeClearanceBlockers = result.allBlockers.filter(
      (b) => b.type === 'document' && b.identifier === 'police_clearance'
    )
    // One blocker for p2 (spouse)
    expect(policeClearanceBlockers).toHaveLength(1)
    expect(policeClearanceBlockers[0].person_name).toBe('Sara Ahmed')
  })

  it('computes correct overallPct with mixed satisfaction', () => {
    const ctx = makeContext({
      playbook: makePlaybook({
        questionnaireFieldRules: FIELD_RULES.slice(0, 3), // 3 PA rules
      }),
      profile: {
        personal: { family_name: 'Zia', given_name: 'Waseer' },
        // date_of_birth missing
      },
      people: [makePerson()],
    })

    const result = computeReadinessMatrix(ctx)!
    // 2 of 3 satisfied = 67%
    expect(result.overallPct).toBe(67)
    expect(result.meetsThreshold).toBe(false) // threshold is 85
  })

  it('respects custom readiness threshold', () => {
    const ctx = makeContext({
      playbook: makePlaybook({
        questionnaireFieldRules: FIELD_RULES.slice(0, 3),
        readinessThreshold: 60, // Lower threshold
      }),
      profile: {
        personal: { family_name: 'Zia', given_name: 'Waseer' },
      },
      people: [makePerson()],
    })

    const result = computeReadinessMatrix(ctx)!
    expect(result.overallPct).toBe(67)
    expect(result.meetsThreshold).toBe(true) // 67 >= 60
  })

  it('skips inactive person roles', () => {
    const ctx = makeContext({
      playbook: makePlaybook({ questionnaireFieldRules: FIELD_RULES }),
      profile: {},
      people: [
        makePerson(),
        makePerson({
          id: 'p2',
          person_role: 'spouse',
          is_active: false, // Inactive spouse
        }),
      ],
    })

    const result = computeReadinessMatrix(ctx)!
    const spouseBlockers = result.allBlockers.filter((b) => b.identifier === 'family.spouse_name')
    expect(spouseBlockers).toHaveLength(0) // Spouse is inactive, rule skipped
  })

  it('assigns blockers to correct domains', () => {
    const ctx = makeContext({
      playbook: makePlaybook({ questionnaireFieldRules: FIELD_RULES }),
      profile: {},
      people: [makePerson()],
    })

    const result = computeReadinessMatrix(ctx)!

    // client_identity blockers
    const identityBlockers = result.domains.client_identity.blockers
    expect(identityBlockers.map((b) => b.identifier)).toEqual(
      expect.arrayContaining(['personal.family_name', 'personal.given_name', 'personal.date_of_birth'])
    )

    // immigration_history blockers
    const historyBlockers = result.domains.immigration_history.blockers
    expect(historyBlockers.map((b) => b.identifier)).toEqual(
      expect.arrayContaining(['immigration_history.prior_refusals'])
    )
  })

  it('handles empty profile gracefully', () => {
    const ctx = makeContext({
      playbook: makePlaybook({ questionnaireFieldRules: FIELD_RULES }),
      profile: null,
      people: [makePerson()],
    })

    const result = computeReadinessMatrix(ctx)!
    // All PA fields should be blockers
    expect(result.allBlockers.length).toBeGreaterThan(0)
    expect(result.overallPct).toBe(0)
  })

  it('treats empty string as unfilled', () => {
    const ctx = makeContext({
      playbook: makePlaybook({
        questionnaireFieldRules: [FIELD_RULES[0]], // family_name only
      }),
      profile: { personal: { family_name: '   ' } }, // whitespace-only
      people: [makePerson()],
    })

    const result = computeReadinessMatrix(ctx)!
    expect(result.allBlockers).toHaveLength(1)
    expect(result.allBlockers[0].identifier).toBe('personal.family_name')
  })

  it('treats boolean false as filled', () => {
    const ctx = makeContext({
      playbook: makePlaybook({
        questionnaireFieldRules: [FIELD_RULES[4]], // prior_refusals
      }),
      profile: { immigration_history: { prior_refusals: false } },
      people: [makePerson()],
    })

    const result = computeReadinessMatrix(ctx)!
    expect(result.allBlockers).toHaveLength(0) // false is a valid answer
  })
})

// ── evaluateLawyerReviewTriggers tests ──────────────────────────────────────

describe('evaluateLawyerReviewTriggers', () => {
  const TRIGGERS: LawyerReviewTrigger[] = [
    {
      key: 'criminal_record',
      condition_field: 'criminal_charges',
      condition_source: 'people',
      condition_operator: 'truthy',
      message: 'Criminal charges detected  -  lawyer review required',
    },
    {
      key: 'prior_refusals',
      condition_field: 'prior_refusals',
      condition_source: 'immigration',
      condition_operator: 'truthy',
      message: 'Prior refusals on record  -  lawyer review required',
    },
    {
      key: 'inadmissibility',
      condition_field: 'inadmissibility_flag',
      condition_source: 'people',
      condition_operator: 'equals',
      condition_value: true,
      message: 'Inadmissibility flag  -  lawyer review required',
    },
  ]

  it('returns empty when no triggers fire', () => {
    const results = evaluateLawyerReviewTriggers(
      TRIGGERS,
      makePerson({ criminal_charges: false, inadmissibility_flag: false }),
      { prior_refusals: false, has_criminal_record: false, spouse_included: null },
    )
    expect(results).toHaveLength(0)
  })

  it('fires truthy trigger when field is true', () => {
    const results = evaluateLawyerReviewTriggers(
      TRIGGERS,
      makePerson({ criminal_charges: true }),
      { prior_refusals: false, has_criminal_record: false, spouse_included: null },
    )
    expect(results).toHaveLength(1)
    expect(results[0].key).toBe('criminal_record')
  })

  it('fires equals trigger when field matches value', () => {
    const results = evaluateLawyerReviewTriggers(
      TRIGGERS,
      makePerson({ inadmissibility_flag: true }),
      { prior_refusals: false, has_criminal_record: false, spouse_included: null },
    )
    expect(results).toHaveLength(1)
    expect(results[0].key).toBe('inadmissibility')
  })

  it('fires immigration source trigger', () => {
    const results = evaluateLawyerReviewTriggers(
      TRIGGERS,
      makePerson(),
      { prior_refusals: true, has_criminal_record: false, spouse_included: null },
    )
    expect(results).toHaveLength(1)
    expect(results[0].key).toBe('prior_refusals')
  })

  it('fires multiple triggers simultaneously', () => {
    const results = evaluateLawyerReviewTriggers(
      TRIGGERS,
      makePerson({ criminal_charges: true, inadmissibility_flag: true }),
      { prior_refusals: true, has_criminal_record: false, spouse_included: null },
    )
    expect(results).toHaveLength(3)
    expect(results.map((r) => r.key)).toEqual(
      expect.arrayContaining(['criminal_record', 'prior_refusals', 'inadmissibility'])
    )
  })

  it('handles null PA person gracefully', () => {
    const results = evaluateLawyerReviewTriggers(TRIGGERS, null, null)
    expect(results).toHaveLength(0)
  })

  it('evaluates gt operator correctly', () => {
    const gtTrigger: LawyerReviewTrigger[] = [
      {
        key: 'high_refusal_count',
        condition_field: 'refusal_count',
        condition_source: 'immigration',
        condition_operator: 'gt',
        condition_value: 2,
        message: 'More than 2 refusals',
      },
    ]
    const results = evaluateLawyerReviewTriggers(
      gtTrigger,
      null,
      { prior_refusals: false, has_criminal_record: false, spouse_included: null, refusal_count: 3 },
    )
    expect(results).toHaveLength(1)
    expect(results[0].key).toBe('high_refusal_count')
  })

  it('evaluates in operator correctly', () => {
    const inTrigger: LawyerReviewTrigger[] = [
      {
        key: 'high_risk_nationality',
        condition_field: 'nationality',
        condition_source: 'people',
        condition_operator: 'in',
        condition_value: ['CountryA', 'CountryB'],
        message: 'High-risk nationality',
      },
    ]
    const results = evaluateLawyerReviewTriggers(
      inTrigger,
      { ...makePerson(), nationality: 'CountryA' },
      null,
    )
    expect(results).toHaveLength(1)
    expect(results[0].key).toBe('high_risk_nationality')
  })

  it('does not fire in operator when value not in array', () => {
    const inTrigger: LawyerReviewTrigger[] = [
      {
        key: 'high_risk_nationality',
        condition_field: 'nationality',
        condition_source: 'people',
        condition_operator: 'in',
        condition_value: ['CountryA', 'CountryB'],
        message: 'High-risk nationality',
      },
    ]
    const results = evaluateLawyerReviewTriggers(
      inTrigger,
      { ...makePerson(), nationality: 'CountryC' },
      null,
    )
    expect(results).toHaveLength(0)
  })
})
