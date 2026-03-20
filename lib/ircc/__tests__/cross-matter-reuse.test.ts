/**
 * IRCC Forms Engine — Cross-Matter Reuse Tests
 *
 * Proves all 5 required properties of importFromCanonical():
 *   1. Prior matter detection — canonical fields found and processed
 *   2. Stable/semi-stable/matter-specific categorization
 *   3. Review gate — semi_stable in fieldsNeedingReview, matter_specific listed as skipped
 *   4. Provenance logging — logAnswerChange() called with correct source/source_origin
 *   5. Second-matter acceleration — completion state updated after import
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

import { importFromCanonical } from '../cross-matter-reuse'
import type { PrefillDataAccess } from '../prefill-resolver'
import type { AnswerEngineDataAccess } from '../answer-engine'
import type {
  AnswerMap,
  AnswerRecord,
  AnswerSource,
  CompletionState,
  PropagationMode,
  OnParentChange,
} from '../types/answers'

// ============================================================================
// Types
// ============================================================================

type FormField = {
  id: string
  profile_path: string | null
  field_type: string | null
  is_required: boolean
  is_client_visible: boolean
  is_mapped: boolean
  is_meta_field: boolean
  show_when: unknown
  required_condition: unknown
  on_parent_change: OnParentChange
  propagation_mode: PropagationMode
  section_id: string | null
  min_length: number | null
  max_length: number | null
  validation_pattern: string | null
  is_blocking: boolean
  options: Array<{ label: string; value: string }> | null
}

type CanonicalField = {
  id: string
  domain: string
  field_key: string
  value: unknown
  verification_status: 'pending' | 'verified' | 'client_submitted' | 'conflict'
  effective_from: string
  source: string
}

type MockDataAccess = PrefillDataAccess & AnswerEngineDataAccess

// ============================================================================
// Fixture factories
// ============================================================================

function makeFormField(profilePath: string, overrides?: Partial<FormField>): FormField {
  return {
    id: `field-${profilePath}`,
    profile_path: profilePath,
    field_type: 'text',
    is_required: true,
    is_client_visible: true,
    is_mapped: true,
    is_meta_field: false,
    show_when: null,
    required_condition: null,
    on_parent_change: 'mark_stale',
    propagation_mode: 'auto',
    section_id: 'section-1',
    min_length: null,
    max_length: null,
    validation_pattern: null,
    is_blocking: false,
    options: null,
    ...overrides,
  }
}

function makeCanonicalField(
  domain: string,
  fieldKey: string,
  value: unknown,
  overrides?: Partial<CanonicalField>,
): CanonicalField {
  return {
    id: `cf-${domain}-${fieldKey}`,
    domain,
    field_key: fieldKey,
    value,
    verification_status: 'verified',
    effective_from: '2025-06-01T00:00:00Z',
    source: 'staff_entry',
    ...overrides,
  }
}

function makeAnswerRecord(
  value: unknown,
  source: AnswerSource = 'staff_entry',
): AnswerRecord {
  return {
    value,
    source,
    verified: false,
    stale: false,
    updated_at: new Date().toISOString(),
  }
}

// ============================================================================
// Mock DataAccess builder
// ============================================================================

interface MockConfig {
  canonicalFields: CanonicalField[]
  formFields: FormField[]
  existingAnswers: AnswerMap
}

function createMockDataAccess(config: MockConfig): MockDataAccess & {
  logAnswerChangeCalls: Array<Record<string, unknown>>
  logReuseEventCalls: Array<Record<string, unknown>>
  updateCalls: Array<{
    instanceId: string
    answers: AnswerMap
    completionState: CompletionState
    counts: { blocker_count: number; stale_count: number; missing_required_count: number }
  }>
} {
  const logAnswerChangeCalls: Array<Record<string, unknown>> = []
  const logReuseEventCalls: Array<Record<string, unknown>> = []
  const updateCalls: Array<{
    instanceId: string
    answers: AnswerMap
    completionState: CompletionState
    counts: { blocker_count: number; stale_count: number; missing_required_count: number }
  }> = []

  return {
    logAnswerChangeCalls,
    logReuseEventCalls,
    updateCalls,

    // PrefillDataAccess
    async getCanonicalFields(_contactId: string) {
      return config.canonicalFields
    },
    async getFormFields(_formId: string) {
      return config.formFields
    },
    async getInstanceFormId(_instanceId: string) {
      return 'form-imm5257'
    },
    async getInstanceAnswers(_instanceId: string) {
      return { ...config.existingAnswers }
    },

    // Extra PrefillDataAccess methods (not used by importFromCanonical but needed for type)
    async getContactFields(_contactId: string) {
      return {}
    },
    async getCrossFormAnswers() {
      return {}
    },

    // AnswerEngineDataAccess
    async updateInstanceAnswers(instanceId, answers, completionState, counts) {
      updateCalls.push({ instanceId, answers, completionState, counts })
    },
    async getSiblingInstances(_instanceId: string) {
      return []
    },
    async logAnswerChange(entry) {
      logAnswerChangeCalls.push(entry as Record<string, unknown>)
    },
    async logReuseEvent(entry) {
      logReuseEventCalls.push(entry as Record<string, unknown>)
    },
  }
}

// ============================================================================
// Shared constants
// ============================================================================

const INSTANCE_ID = 'inst-abc-001'
const CONTACT_ID = 'contact-xyz-789'
const TENANT_ID = 'tenant-waseer'

// Real stable fields from REUSE_CATEGORY_MAP
const STABLE_FIELDS: Array<[string, string, unknown]> = [
  ['personal', 'family_name', 'Doe'],
  ['personal', 'given_name', 'Jane'],
  ['personal', 'date_of_birth', '1985-03-22'],
  ['personal', 'place_of_birth_city', 'Vancouver'],
  ['personal', 'place_of_birth_country', 'Canada'],
  ['personal', 'citizenship', 'Canadian'],
  ['personal', 'sex', 'Female'],
  ['personal', 'eye_colour', 'Brown'],
  ['personal', 'height_cm', 165],
  ['personal', 'uci_number', '0000-0000'],
  ['family', 'mother_full_name', 'Mary Doe'],
  ['family', 'father_full_name', 'John Doe Sr'],
  ['language', 'native_language', 'English'],
]

// Real semi-stable fields from REUSE_CATEGORY_MAP
const SEMI_STABLE_FIELDS: Array<[string, string, unknown]> = [
  ['marital', 'status', 'Married'],
  ['marital', 'spouse_family_name', 'Smith'],
  ['marital', 'spouse_given_name', 'Robert'],
  ['contact_info', 'mailing_address', '123 Main St, Vancouver, BC V6B 1A1'],
  ['contact_info', 'telephone', '+1-604-555-0199'],
  ['contact_info', 'email', 'jane.doe@example.com'],
  ['passport', 'number', 'GA123456'],
  ['passport', 'country_of_issue', 'Canada'],
  ['passport', 'issue_date', '2022-05-01'],
  ['passport', 'expiry_date', '2032-05-01'],
  ['employment', 'current_occupation', 'Software Engineer'],
  ['education', 'highest_level', 'Masters'],
  ['background', 'refused_visa', false],
  ['background', 'criminal_record', false],
  ['personal', 'current_country_of_residence', 'Canada'],
  ['personal', 'residence_status', 'Citizen'],
]

// Matter-specific fields (not in REUSE_CATEGORY_MAP)
const MATTER_SPECIFIC_FIELDS: Array<[string, string, unknown]> = [
  ['travel', 'purpose_of_trip', 'Business meeting'],
  ['travel', 'intended_date_of_entry', '2026-07-01'],
  ['application', 'specific_program', 'LMIA Exempt'],
]

// ============================================================================
// Tests
// ============================================================================

describe('importFromCanonical', () => {
  // --------------------------------------------------------------------------
  // PROOF 1: Prior matter detection
  // --------------------------------------------------------------------------
  describe('Proof 1 — Prior matter detection', () => {
    it('detects and processes canonical fields from a prior matter', async () => {
      const canonicalFields = [
        makeCanonicalField('personal', 'family_name', 'Doe'),
        makeCanonicalField('personal', 'given_name', 'Jane'),
        makeCanonicalField('personal', 'date_of_birth', '1985-03-22'),
      ]
      const formFields = [
        makeFormField('personal.family_name'),
        makeFormField('personal.given_name'),
        makeFormField('personal.date_of_birth'),
      ]

      const da = createMockDataAccess({
        canonicalFields,
        formFields,
        existingAnswers: {},
      })

      const result = await importFromCanonical(INSTANCE_ID, CONTACT_ID, da, TENANT_ID)

      expect(result.fieldsImported).toBe(3)
      expect(result.fieldsSkipped).toBe(0)
    })

    it('returns zero imports when contact has no canonical fields', async () => {
      const formFields = [
        makeFormField('personal.family_name'),
        makeFormField('personal.given_name'),
      ]

      const da = createMockDataAccess({
        canonicalFields: [],
        formFields,
        existingAnswers: {},
      })

      const result = await importFromCanonical(INSTANCE_ID, CONTACT_ID, da, TENANT_ID)

      expect(result.fieldsImported).toBe(0)
      expect(result.fieldsSkipped).toBe(0)
      expect(result.fieldsNeedingReview).toHaveLength(0)
    })

    it('ignores canonical fields that do not match form profile_paths', async () => {
      const canonicalFields = [
        makeCanonicalField('personal', 'family_name', 'Doe'),
        makeCanonicalField('personal', 'eye_colour', 'Brown'), // form does not have this
      ]
      const formFields = [
        makeFormField('personal.family_name'),
      ]

      const da = createMockDataAccess({
        canonicalFields,
        formFields,
        existingAnswers: {},
      })

      const result = await importFromCanonical(INSTANCE_ID, CONTACT_ID, da, TENANT_ID)

      // Only family_name should be imported (eye_colour not in form)
      expect(result.fieldsImported).toBe(1)
    })
  })

  // --------------------------------------------------------------------------
  // PROOF 2: Stable / semi-stable / matter-specific categorization
  // --------------------------------------------------------------------------
  describe('Proof 2 — Categorization by reuse category', () => {
    it('auto-imports stable fields without review flag', async () => {
      const canonicalFields = STABLE_FIELDS.map(([d, k, v]) =>
        makeCanonicalField(d, k, v),
      )
      const formFields = STABLE_FIELDS.map(([d, k]) =>
        makeFormField(`${d}.${k}`),
      )

      const da = createMockDataAccess({
        canonicalFields,
        formFields,
        existingAnswers: {},
      })

      const result = await importFromCanonical(INSTANCE_ID, CONTACT_ID, da, TENANT_ID)

      expect(result.fieldsImported).toBe(13)
      expect(result.fieldsSkipped).toBe(0)
      // Stable fields should NOT appear in fieldsNeedingReview
      const stableReviews = result.fieldsNeedingReview.filter(
        (r) => r.category === 'stable',
      )
      expect(stableReviews).toHaveLength(0)
    })

    it('imports semi-stable fields and flags them for review', async () => {
      const canonicalFields = SEMI_STABLE_FIELDS.map(([d, k, v]) =>
        makeCanonicalField(d, k, v),
      )
      const formFields = SEMI_STABLE_FIELDS.map(([d, k]) =>
        makeFormField(`${d}.${k}`),
      )

      const da = createMockDataAccess({
        canonicalFields,
        formFields,
        existingAnswers: {},
      })

      const result = await importFromCanonical(INSTANCE_ID, CONTACT_ID, da, TENANT_ID)

      expect(result.fieldsImported).toBe(16)
      const semiReviews = result.fieldsNeedingReview.filter(
        (r) => r.category === 'semi_stable',
      )
      expect(semiReviews).toHaveLength(16)
    })

    it('skips matter-specific fields entirely', async () => {
      const canonicalFields = MATTER_SPECIFIC_FIELDS.map(([d, k, v]) =>
        makeCanonicalField(d, k, v),
      )
      const formFields = MATTER_SPECIFIC_FIELDS.map(([d, k]) =>
        makeFormField(`${d}.${k}`),
      )

      const da = createMockDataAccess({
        canonicalFields,
        formFields,
        existingAnswers: {},
      })

      const result = await importFromCanonical(INSTANCE_ID, CONTACT_ID, da, TENANT_ID)

      expect(result.fieldsImported).toBe(0)
      expect(result.fieldsSkipped).toBe(3)
    })
  })

  // --------------------------------------------------------------------------
  // PROOF 3: Review gate
  // --------------------------------------------------------------------------
  describe('Proof 3 — Review gate', () => {
    it('semi-stable fields appear in fieldsNeedingReview with correct values', async () => {
      const canonicalFields = [
        makeCanonicalField('marital', 'status', 'Married'),
        makeCanonicalField('passport', 'number', 'GA123456'),
      ]
      const formFields = [
        makeFormField('marital.status'),
        makeFormField('passport.number'),
      ]

      const da = createMockDataAccess({
        canonicalFields,
        formFields,
        existingAnswers: {},
      })

      const result = await importFromCanonical(INSTANCE_ID, CONTACT_ID, da, TENANT_ID)

      expect(result.fieldsNeedingReview).toHaveLength(2)
      expect(result.fieldsNeedingReview).toEqual(
        expect.arrayContaining([
          {
            profilePath: 'marital.status',
            category: 'semi_stable',
            canonicalValue: 'Married',
          },
          {
            profilePath: 'passport.number',
            category: 'semi_stable',
            canonicalValue: 'GA123456',
          },
        ]),
      )
    })

    it('matter-specific fields appear in fieldsNeedingReview as skipped', async () => {
      const canonicalFields = [
        makeCanonicalField('travel', 'purpose_of_trip', 'Business meeting'),
      ]
      const formFields = [
        makeFormField('travel.purpose_of_trip'),
      ]

      const da = createMockDataAccess({
        canonicalFields,
        formFields,
        existingAnswers: {},
      })

      const result = await importFromCanonical(INSTANCE_ID, CONTACT_ID, da, TENANT_ID)

      expect(result.fieldsSkipped).toBe(1)
      expect(result.fieldsNeedingReview).toContainEqual({
        profilePath: 'travel.purpose_of_trip',
        category: 'matter_specific',
        canonicalValue: 'Business meeting',
      })
    })

    it('mixed categories produce correct review gate breakdown', async () => {
      const canonicalFields = [
        makeCanonicalField('personal', 'family_name', 'Doe'),       // stable
        makeCanonicalField('personal', 'given_name', 'Jane'),       // stable
        makeCanonicalField('marital', 'status', 'Single'),          // semi_stable
        makeCanonicalField('passport', 'number', 'XY987654'),       // semi_stable
        makeCanonicalField('travel', 'purpose_of_trip', 'Tourism'), // matter_specific
      ]
      const formFields = [
        makeFormField('personal.family_name'),
        makeFormField('personal.given_name'),
        makeFormField('marital.status'),
        makeFormField('passport.number'),
        makeFormField('travel.purpose_of_trip'),
      ]

      const da = createMockDataAccess({
        canonicalFields,
        formFields,
        existingAnswers: {},
      })

      const result = await importFromCanonical(INSTANCE_ID, CONTACT_ID, da, TENANT_ID)

      // 2 stable + 2 semi_stable imported
      expect(result.fieldsImported).toBe(4)
      // 1 matter_specific skipped
      expect(result.fieldsSkipped).toBe(1)
      // review list: 2 semi_stable + 1 matter_specific
      expect(result.fieldsNeedingReview).toHaveLength(3)

      const categories = result.fieldsNeedingReview.map((r) => r.category)
      expect(categories.filter((c) => c === 'semi_stable')).toHaveLength(2)
      expect(categories.filter((c) => c === 'matter_specific')).toHaveLength(1)
    })
  })

  // --------------------------------------------------------------------------
  // PROOF 4: Provenance logging
  // --------------------------------------------------------------------------
  describe('Proof 4 — Provenance logging', () => {
    it('calls logAnswerChange with source=cross_matter_import and source_origin=contactId', async () => {
      const canonicalFields = [
        makeCanonicalField('personal', 'family_name', 'Doe'),
        makeCanonicalField('marital', 'status', 'Married'),
      ]
      const formFields = [
        makeFormField('personal.family_name'),
        makeFormField('marital.status'),
      ]

      const da = createMockDataAccess({
        canonicalFields,
        formFields,
        existingAnswers: {},
      })

      await importFromCanonical(INSTANCE_ID, CONTACT_ID, da, TENANT_ID)

      // Both stable and semi_stable fields should be logged
      expect(da.logAnswerChangeCalls).toHaveLength(2)

      for (const call of da.logAnswerChangeCalls) {
        expect(call.source).toBe('cross_matter_import')
        expect(call.source_origin).toBe(CONTACT_ID)
        expect(call.tenant_id).toBe(TENANT_ID)
        expect(call.form_instance_id).toBe(INSTANCE_ID)
        expect(call.stale_triggered).toBe(false)
      }
    })

    it('logs old_value as null when no prior answer exists', async () => {
      const canonicalFields = [
        makeCanonicalField('personal', 'given_name', 'Jane'),
      ]
      const formFields = [
        makeFormField('personal.given_name'),
      ]

      const da = createMockDataAccess({
        canonicalFields,
        formFields,
        existingAnswers: {},
      })

      await importFromCanonical(INSTANCE_ID, CONTACT_ID, da, TENANT_ID)

      expect(da.logAnswerChangeCalls).toHaveLength(1)
      expect(da.logAnswerChangeCalls[0].old_value).toBeNull()
      expect(da.logAnswerChangeCalls[0].new_value).toBe('Jane')
    })

    it('logs old_value from existing answer when overwriting non-staff data', async () => {
      const canonicalFields = [
        makeCanonicalField('personal', 'family_name', 'Doe-Updated'),
      ]
      const formFields = [
        makeFormField('personal.family_name'),
      ]

      const existingAnswers: AnswerMap = {
        'personal.family_name': makeAnswerRecord('Doe-Old', 'canonical_prefill'),
      }

      const da = createMockDataAccess({
        canonicalFields,
        formFields,
        existingAnswers,
      })

      await importFromCanonical(INSTANCE_ID, CONTACT_ID, da, TENANT_ID)

      expect(da.logAnswerChangeCalls).toHaveLength(1)
      expect(da.logAnswerChangeCalls[0].old_value).toBe('Doe-Old')
      expect(da.logAnswerChangeCalls[0].new_value).toBe('Doe-Updated')
    })

    it('does not log for matter-specific fields (they are skipped)', async () => {
      const canonicalFields = [
        makeCanonicalField('travel', 'purpose_of_trip', 'Tourism'),
      ]
      const formFields = [
        makeFormField('travel.purpose_of_trip'),
      ]

      const da = createMockDataAccess({
        canonicalFields,
        formFields,
        existingAnswers: {},
      })

      await importFromCanonical(INSTANCE_ID, CONTACT_ID, da, TENANT_ID)

      expect(da.logAnswerChangeCalls).toHaveLength(0)
    })
  })

  // --------------------------------------------------------------------------
  // PROOF 5: Second-matter acceleration
  // --------------------------------------------------------------------------
  describe('Proof 5 — Second-matter acceleration', () => {
    it('calls updateInstanceAnswers with merged answers and completion state', async () => {
      const canonicalFields = [
        makeCanonicalField('personal', 'family_name', 'Doe'),
        makeCanonicalField('personal', 'given_name', 'Jane'),
        makeCanonicalField('personal', 'date_of_birth', '1985-03-22'),
      ]
      const formFields = [
        makeFormField('personal.family_name'),
        makeFormField('personal.given_name'),
        makeFormField('personal.date_of_birth'),
      ]

      const da = createMockDataAccess({
        canonicalFields,
        formFields,
        existingAnswers: {},
      })

      await importFromCanonical(INSTANCE_ID, CONTACT_ID, da, TENANT_ID)

      expect(da.updateCalls).toHaveLength(1)
      const [update] = da.updateCalls

      expect(update.instanceId).toBe(INSTANCE_ID)

      // All 3 stable fields should be in the merged answers
      expect(update.answers['personal.family_name'].value).toBe('Doe')
      expect(update.answers['personal.given_name'].value).toBe('Jane')
      expect(update.answers['personal.date_of_birth'].value).toBe('1985-03-22')

      // All answers should have source = cross_matter_import
      for (const path of ['personal.family_name', 'personal.given_name', 'personal.date_of_birth']) {
        expect(update.answers[path].source).toBe('cross_matter_import')
        expect(update.answers[path].source_origin).toBe(CONTACT_ID)
      }

      // Completion state should show progress
      expect(update.completionState.completion_pct).toBe(100)
      expect(update.completionState.total_filled).toBe(3)
      expect(update.completionState.total_relevant).toBe(3)
    })

    it('does not call updateInstanceAnswers when nothing to import', async () => {
      const da = createMockDataAccess({
        canonicalFields: [],
        formFields: [makeFormField('personal.family_name')],
        existingAnswers: {},
      })

      await importFromCanonical(INSTANCE_ID, CONTACT_ID, da, TENANT_ID)

      expect(da.updateCalls).toHaveLength(0)
    })

    it('preserves existing staff_entry answers (does not overwrite)', async () => {
      const canonicalFields = [
        makeCanonicalField('personal', 'family_name', 'Doe-Canonical'),
        makeCanonicalField('personal', 'given_name', 'Jane'),
      ]
      const formFields = [
        makeFormField('personal.family_name'),
        makeFormField('personal.given_name'),
      ]

      const existingAnswers: AnswerMap = {
        'personal.family_name': makeAnswerRecord('Doe-Staff', 'staff_entry'),
      }

      const da = createMockDataAccess({
        canonicalFields,
        formFields,
        existingAnswers,
      })

      const result = await importFromCanonical(INSTANCE_ID, CONTACT_ID, da, TENANT_ID)

      // family_name should be skipped (staff_entry takes priority)
      // given_name should be imported
      expect(result.fieldsImported).toBe(1)
      expect(result.fieldsSkipped).toBe(1)

      expect(da.updateCalls).toHaveLength(1)
      // The staff entry should remain untouched
      expect(da.updateCalls[0].answers['personal.family_name'].source).toBe('staff_entry')
      expect(da.updateCalls[0].answers['personal.family_name'].value).toBe('Doe-Staff')
      // given_name should be imported
      expect(da.updateCalls[0].answers['personal.given_name'].value).toBe('Jane')
    })

    it('deduplicates canonical fields keeping the most recent per profile_path', async () => {
      const canonicalFields = [
        // Most recent first (sorted by effective_from DESC)
        makeCanonicalField('personal', 'family_name', 'Doe-Latest', {
          effective_from: '2026-01-01T00:00:00Z',
        }),
        makeCanonicalField('personal', 'family_name', 'Doe-Older', {
          id: 'cf-personal-family_name-old',
          effective_from: '2024-01-01T00:00:00Z',
        }),
      ]
      const formFields = [makeFormField('personal.family_name')]

      const da = createMockDataAccess({
        canonicalFields,
        formFields,
        existingAnswers: {},
      })

      const result = await importFromCanonical(INSTANCE_ID, CONTACT_ID, da, TENANT_ID)

      expect(result.fieldsImported).toBe(1)
      expect(da.updateCalls[0].answers['personal.family_name'].value).toBe('Doe-Latest')
    })
  })

  // --------------------------------------------------------------------------
  // Edge cases
  // --------------------------------------------------------------------------
  describe('Edge cases', () => {
    it('skips canonical fields with null values', async () => {
      const canonicalFields = [
        makeCanonicalField('personal', 'family_name', null),
        makeCanonicalField('personal', 'given_name', 'Jane'),
      ]
      const formFields = [
        makeFormField('personal.family_name'),
        makeFormField('personal.given_name'),
      ]

      const da = createMockDataAccess({
        canonicalFields,
        formFields,
        existingAnswers: {},
      })

      const result = await importFromCanonical(INSTANCE_ID, CONTACT_ID, da, TENANT_ID)

      expect(result.fieldsImported).toBe(1)
      expect(da.logAnswerChangeCalls).toHaveLength(1)
      expect(da.logAnswerChangeCalls[0].profile_path).toBe('personal.given_name')
    })

    it('skips unmapped form fields', async () => {
      const canonicalFields = [
        makeCanonicalField('personal', 'family_name', 'Doe'),
      ]
      const formFields = [
        makeFormField('personal.family_name', { is_mapped: false }),
      ]

      const da = createMockDataAccess({
        canonicalFields,
        formFields,
        existingAnswers: {},
      })

      const result = await importFromCanonical(INSTANCE_ID, CONTACT_ID, da, TENANT_ID)

      // The form field is unmapped so it's not in the form's profile_path set
      expect(result.fieldsImported).toBe(0)
    })
  })
})
