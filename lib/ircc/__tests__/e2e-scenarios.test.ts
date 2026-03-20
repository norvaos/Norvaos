/**
 * IRCC Forms Engine — End-to-End Scenario Tests
 *
 * Six mandatory CTO-specified scenarios proving full client flows through
 * the engine pipeline. Uses mock DataAccess (no live database).
 *
 * Scenarios:
 *   1. Fresh Matter — Full Client Flow (partial save, resume, complete)
 *   2. Cross-Form Reuse (propagation between sibling instances)
 *   3. Stale Invalidation (dependency change, visibility transitions)
 *   4. Trust Conflict (verified vs unverified overwrite guard)
 *   5. Generation Readiness Gate (blockers → fix → unblocked)
 *   6. Format Normalization Round-Trip (storage, display, XFA)
 */
import { describe, it, expect, beforeEach } from 'vitest'

// Answer engine
import {
  saveAnswers,
  computeCompletionState,
  createAnswerRecord,
  checkTrustConflict,
} from '../answer-engine'
import type { AnswerEngineDataAccess } from '../answer-engine'

// Stale tracker
import {
  computeStaleUpdates,
  applyStaleUpdates,
  detectVisibilityTransition,
  countStaleAnswers,
  flattenAnswers,
  clearStaleFlags,
} from '../stale-tracker'

// Validation & generation readiness
import {
  validateFormInstance,
  checkGenerationReadiness,
  validateFieldValue,
} from '../validation-rules-engine'
import type { ValidationDataAccess } from '../validation-rules-engine'

// Cross-form reuse
import { prefillFromSiblings } from '../cross-form-reuse'

// Format normalizer
import { normalizeForStorage, formatForDisplay, formatForXfa } from '../format-normalizer'

// Generation resolver (value transforms)
import { transformValueForXfa, resolveArrayFields } from '../generation-resolver'

// Types
import type {
  AnswerRecord,
  AnswerMap,
  AnswerSource,
  CompletionState,
  PropagationMode,
  OnParentChange,
} from '../types/answers'
import { SOURCE_TRUST_LEVEL } from '../types/answers'
import type { FieldCondition } from '../types/conditions'
import type { CompositeValidationRule, CompositeValidationResult } from '../types/reuse'

// ============================================================================
// Shared Fixture Factories
// ============================================================================

/** Field definition shape matching all engine interfaces */
interface TestField {
  id: string
  profile_path: string | null
  field_type: string | null
  is_required: boolean
  is_client_visible: boolean
  is_mapped: boolean
  is_meta_field: boolean
  show_when: FieldCondition | null
  required_condition: FieldCondition | null
  on_parent_change: OnParentChange
  propagation_mode: PropagationMode
  section_id: string | null
  min_length: number | null
  max_length: number | null
  validation_pattern: string | null
  is_blocking: boolean
  options: Array<{ label: string; value: string }> | null
  label?: string | null
  validation_message?: string | null
}

function makeField(overrides: Partial<TestField> & { id: string; profile_path: string }): TestField {
  return {
    field_type: 'text',
    is_required: false,
    is_client_visible: true,
    is_mapped: true,
    is_meta_field: false,
    show_when: null,
    required_condition: null,
    on_parent_change: 'mark_stale',
    propagation_mode: 'auto',
    section_id: 'sec-default',
    min_length: null,
    max_length: null,
    validation_pattern: null,
    is_blocking: true,
    options: null,
    label: null,
    validation_message: null,
    ...overrides,
  }
}

function makeAnswerRecord(
  value: unknown,
  source: AnswerSource = 'client_portal',
  overrides?: Partial<AnswerRecord>
): AnswerRecord {
  return {
    value,
    source,
    verified: false,
    stale: false,
    updated_at: '2026-03-01T00:00:00.000Z',
    ...overrides,
  }
}

function profileToAnswerMap(
  profile: Record<string, unknown>,
  source: AnswerSource = 'client_portal',
  overrides?: Partial<AnswerRecord>
): AnswerMap {
  const map: AnswerMap = {}
  for (const [path, value] of Object.entries(profile)) {
    map[path] = makeAnswerRecord(value, source, overrides)
  }
  return map
}

// ============================================================================
// Mock DataAccess (shared by saveAnswers / prefillFromSiblings)
// ============================================================================

interface MockStore {
  instances: Map<
    string,
    {
      form_id: string
      status: string
      answers: AnswerMap
      person_id: string | null
      completion_state?: CompletionState
    }
  >
  formFields: Map<string, TestField[]>
  changeLog: Array<Record<string, unknown>>
  reuseLog: Array<Record<string, unknown>>
}

function createMockStore(): MockStore {
  return {
    instances: new Map(),
    formFields: new Map(),
    changeLog: [],
    reuseLog: [],
  }
}

function createMockDataAccess(store: MockStore): AnswerEngineDataAccess {
  return {
    async getInstanceAnswers(instanceId: string): Promise<AnswerMap> {
      return store.instances.get(instanceId)?.answers ?? {}
    },

    async updateInstanceAnswers(
      instanceId: string,
      answers: AnswerMap,
      completionState: CompletionState,
      _counts: { blocker_count: number; stale_count: number; missing_required_count: number }
    ): Promise<void> {
      const instance = store.instances.get(instanceId)
      if (instance) {
        instance.answers = answers
        instance.completion_state = completionState
      }
    },

    async getSiblingInstances(instanceId: string) {
      const self = store.instances.get(instanceId)
      if (!self) return []
      return Array.from(store.instances.entries()).map(([id, inst]) => ({
        id,
        form_id: inst.form_id,
        status: inst.status,
        answers: { ...inst.answers },
        person_id: inst.person_id,
      }))
    },

    async getFormFields(formId: string) {
      return (store.formFields.get(formId) ?? []) as Awaited<
        ReturnType<AnswerEngineDataAccess['getFormFields']>
      >
    },

    async getInstanceFormId(instanceId: string): Promise<string> {
      return store.instances.get(instanceId)?.form_id ?? 'unknown-form'
    },

    async logAnswerChange(entry: Record<string, unknown>): Promise<void> {
      store.changeLog.push(entry)
    },

    async logReuseEvent(entry: Record<string, unknown>): Promise<void> {
      store.reuseLog.push(entry)
    },
  }
}

// ============================================================================
// Mock ValidationDataAccess (for validateFormInstance / checkGenerationReadiness)
// ============================================================================

function createMockValidationDataAccess(
  store: MockStore
): ValidationDataAccess {
  return {
    async getFormFields(formId: string) {
      const fields = store.formFields.get(formId) ?? []
      return fields.map((f) => ({
        id: f.id,
        profile_path: f.profile_path,
        label: f.label ?? f.profile_path,
        field_type: f.field_type,
        is_required: f.is_required,
        is_mapped: f.is_mapped,
        is_meta_field: f.is_meta_field,
        is_blocking: f.is_blocking,
        min_length: f.min_length,
        max_length: f.max_length,
        validation_pattern: f.validation_pattern,
        validation_message: f.validation_message ?? null,
        options: f.options,
        show_when: f.show_when,
        required_condition: f.required_condition,
        section_id: f.section_id,
      }))
    },

    async getCompositeRules(_formId: string, _tenantId: string): Promise<CompositeValidationRule[]> {
      return []
    },

    async getMatterInstances(matterId: string) {
      return Array.from(store.instances.entries()).map(([id, inst]) => ({
        id,
        form_id: inst.form_id,
        person_id: inst.person_id,
        answers: { ...inst.answers },
      }))
    },
  }
}

// ============================================================================
// Scenario 1: Fresh Matter — Full Client Flow
// ============================================================================

describe('Scenario 1: Fresh Matter — Full Client Flow', () => {
  let store: MockStore
  let da: AnswerEngineDataAccess

  // 10 required fields for this test form
  const FORM_ID = 'form-imm5406'
  const INSTANCE_ID = 'inst-001'
  const TENANT_ID = 'tenant-1'

  const requiredFields: TestField[] = [
    makeField({ id: 'f1', profile_path: 'personal.family_name', is_required: true }),
    makeField({ id: 'f2', profile_path: 'personal.given_name', is_required: true }),
    makeField({ id: 'f3', profile_path: 'personal.date_of_birth', is_required: true, field_type: 'date' }),
    makeField({ id: 'f4', profile_path: 'personal.sex', is_required: true, field_type: 'select',
      options: [{ label: 'Male', value: 'Male' }, { label: 'Female', value: 'Female' }] }),
    makeField({ id: 'f5', profile_path: 'personal.citizenship', is_required: true }),
    makeField({ id: 'f6', profile_path: 'marital.status', is_required: true, field_type: 'select',
      options: [{ label: 'Single', value: 'Single' }, { label: 'Married', value: 'Married' }] }),
    makeField({ id: 'f7', profile_path: 'contact_info.email', is_required: true, field_type: 'email' }),
    makeField({ id: 'f8', profile_path: 'passport.number', is_required: true }),
    makeField({ id: 'f9', profile_path: 'passport.country_of_issue', is_required: true }),
    makeField({ id: 'f10', profile_path: 'passport.expiry_date', is_required: true, field_type: 'date' }),
  ]

  beforeEach(() => {
    store = createMockStore()
    store.formFields.set(FORM_ID, requiredFields)
    store.instances.set(INSTANCE_ID, {
      form_id: FORM_ID,
      status: 'draft',
      answers: {},
      person_id: 'person-1',
    })
    da = createMockDataAccess(store)
  })

  it('saves partial answers (5 of 10) and reports ~50% completion', async () => {
    const result = await saveAnswers(
      {
        instance_id: INSTANCE_ID,
        updates: {
          'personal.family_name': 'Smith',
          'personal.given_name': 'John',
          'personal.date_of_birth': '1990-01-15',
          'personal.sex': 'Male',
          'personal.citizenship': 'Canada',
        },
        source: 'client_portal',
      },
      da,
      TENANT_ID
    )

    expect(result.completion_state.completion_pct).toBe(50)
    expect(result.completion_state.total_filled).toBe(5)
    expect(result.completion_state.total_relevant).toBe(10)
  })

  it('resumes and completes remaining 5 fields to reach 100%', async () => {
    // First save partial
    await saveAnswers(
      {
        instance_id: INSTANCE_ID,
        updates: {
          'personal.family_name': 'Smith',
          'personal.given_name': 'John',
          'personal.date_of_birth': '1990-01-15',
          'personal.sex': 'Male',
          'personal.citizenship': 'Canada',
        },
        source: 'client_portal',
      },
      da,
      TENANT_ID
    )

    // Then resume and complete
    const result = await saveAnswers(
      {
        instance_id: INSTANCE_ID,
        updates: {
          'marital.status': 'Single',
          'contact_info.email': 'john@example.com',
          'passport.number': 'AB123456',
          'passport.country_of_issue': 'Canada',
          'passport.expiry_date': '2030-01-01',
        },
        source: 'client_portal',
      },
      da,
      TENANT_ID
    )

    expect(result.completion_state.completion_pct).toBe(100)
    expect(result.completion_state.total_filled).toBe(10)
    expect(result.completion_state.total_relevant).toBe(10)
  })

  it('has no stale fields and no blockers after full completion', async () => {
    // Save all 10 fields in one go
    await saveAnswers(
      {
        instance_id: INSTANCE_ID,
        updates: {
          'personal.family_name': 'Smith',
          'personal.given_name': 'John',
          'personal.date_of_birth': '1990-01-15',
          'personal.sex': 'Male',
          'personal.citizenship': 'Canada',
          'marital.status': 'Single',
          'contact_info.email': 'john@example.com',
          'passport.number': 'AB123456',
          'passport.country_of_issue': 'Canada',
          'passport.expiry_date': '2030-01-01',
        },
        source: 'client_portal',
      },
      da,
      TENANT_ID
    )

    const answers = store.instances.get(INSTANCE_ID)!.answers
    const staleCount = countStaleAnswers(answers)
    expect(staleCount).toBe(0)

    const result = store.instances.get(INSTANCE_ID)!.completion_state!
    expect(result.total_stale).toBe(0)
    expect(result.total_blocked).toBe(0)
    expect(result.completion_pct).toBe(100)
  })
})

// ============================================================================
// Scenario 2: Cross-Form Reuse
// ============================================================================

describe('Scenario 2: Cross-Form Reuse', () => {
  let store: MockStore
  let da: AnswerEngineDataAccess

  const FORM_A = 'form-imm5406'
  const FORM_B = 'form-imm5257e'
  const INSTANCE_A = 'inst-A'
  const INSTANCE_B = 'inst-B'
  const TENANT_ID = 'tenant-1'
  const PERSON_ID = 'person-1'

  // Both forms share personal.family_name with auto propagation
  const fieldsA: TestField[] = [
    makeField({ id: 'fA1', profile_path: 'personal.family_name', is_required: true, propagation_mode: 'auto' }),
    makeField({ id: 'fA2', profile_path: 'personal.given_name', is_required: true, propagation_mode: 'auto' }),
  ]

  const fieldsB: TestField[] = [
    makeField({ id: 'fB1', profile_path: 'personal.family_name', is_required: true, propagation_mode: 'auto' }),
    makeField({ id: 'fB2', profile_path: 'personal.given_name', is_required: true, propagation_mode: 'auto' }),
    makeField({ id: 'fB3', profile_path: 'travel.destination', is_required: false, propagation_mode: 'auto' }),
  ]

  beforeEach(() => {
    store = createMockStore()
    store.formFields.set(FORM_A, fieldsA)
    store.formFields.set(FORM_B, fieldsB)

    store.instances.set(INSTANCE_A, {
      form_id: FORM_A,
      status: 'draft',
      answers: {},
      person_id: PERSON_ID,
    })
    store.instances.set(INSTANCE_B, {
      form_id: FORM_B,
      status: 'draft',
      answers: {},
      person_id: PERSON_ID,
    })

    da = createMockDataAccess(store)
  })

  it('propagates family_name from instance A to instance B on save', async () => {
    const result = await saveAnswers(
      {
        instance_id: INSTANCE_A,
        updates: { 'personal.family_name': 'Smith' },
        source: 'client_portal',
      },
      da,
      TENANT_ID
    )

    // Verify propagation occurred
    expect(result.propagated.length).toBeGreaterThanOrEqual(1)
    expect(result.propagated).toContainEqual({
      instance_id: INSTANCE_B,
      profile_path: 'personal.family_name',
    })

    // Verify B now has the value
    const bAnswers = store.instances.get(INSTANCE_B)!.answers
    expect(bAnswers['personal.family_name']).toBeDefined()
    expect(bAnswers['personal.family_name'].value).toBe('Smith')
    expect(bAnswers['personal.family_name'].source).toBe('cross_form_reuse')
  })

  it('logs a reuse event for the propagation', async () => {
    await saveAnswers(
      {
        instance_id: INSTANCE_A,
        updates: { 'personal.family_name': 'Smith' },
        source: 'client_portal',
      },
      da,
      TENANT_ID
    )

    const reuseEntries = store.reuseLog.filter(
      (e) =>
        e.reuse_type === 'cross_form' &&
        e.target_instance_id === INSTANCE_B &&
        e.target_profile_path === 'personal.family_name'
    )
    expect(reuseEntries.length).toBe(1)
    expect(reuseEntries[0].value).toBe('Smith')
    expect(reuseEntries[0].source_instance_id).toBe(INSTANCE_A)
  })

  it('prefillFromSiblings populates B with matching fields from A', async () => {
    // Pre-populate A with answers
    store.instances.get(INSTANCE_A)!.answers = profileToAnswerMap({
      'personal.family_name': 'Doe',
      'personal.given_name': 'Jane',
    })

    const result = await prefillFromSiblings(INSTANCE_B, da, TENANT_ID)

    expect(result.fieldsReused).toBe(2)
    expect(result.details).toContainEqual(
      expect.objectContaining({
        profilePath: 'personal.family_name',
        value: 'Doe',
      })
    )

    // Verify reuse log entries created
    expect(store.reuseLog.length).toBe(2)
  })
})

// ============================================================================
// Scenario 3: Stale Invalidation
// ============================================================================

describe('Scenario 3: Stale Invalidation', () => {
  // Fields: marital.status (parent), spouse fields conditional on status=Married
  const spouseFields: TestField[] = [
    makeField({
      id: 'f-marital-status',
      profile_path: 'marital.status',
      is_required: true,
      field_type: 'select',
      options: [
        { label: 'Single', value: 'Single' },
        { label: 'Married', value: 'Married' },
      ],
    }),
    makeField({
      id: 'f-spouse-name',
      profile_path: 'marital.spouse_family_name',
      is_required: true,
      show_when: {
        logic: 'AND' as const,
        rules: [{ field_path: 'marital.status', operator: 'equals' as const, value: 'Married' }],
      },
    }),
    makeField({
      id: 'f-spouse-given',
      profile_path: 'marital.spouse_given_name',
      is_required: false,
      show_when: {
        logic: 'AND' as const,
        rules: [{ field_path: 'marital.status', operator: 'equals' as const, value: 'Married' }],
      },
    }),
    makeField({
      id: 'f-spouse-dob',
      profile_path: 'marital.spouse_date_of_birth',
      is_required: false,
      on_parent_change: 'auto_clear',
      show_when: {
        logic: 'AND' as const,
        rules: [{ field_path: 'marital.status', operator: 'equals' as const, value: 'Married' }],
      },
    }),
  ]

  it('marks spouse_name stale when marital_status changes', () => {
    const answers: AnswerMap = {
      'marital.status': makeAnswerRecord('Married'),
      'marital.spouse_family_name': makeAnswerRecord('Jane'),
      'marital.spouse_given_name': makeAnswerRecord('Doe'),
      'marital.spouse_date_of_birth': makeAnswerRecord('1992-05-10'),
    }

    const updates = computeStaleUpdates(
      ['marital.status'],
      answers,
      spouseFields
    )

    // All three spouse fields depend on marital.status via show_when
    expect(updates.length).toBe(3)

    const spouseNameUpdate = updates.find(
      (u) => u.profile_path === 'marital.spouse_family_name'
    )
    expect(spouseNameUpdate).toBeDefined()
    expect(spouseNameUpdate!.action).toBe('mark_stale')

    // spouse_dob should be auto_clear
    const spouseDobUpdate = updates.find(
      (u) => u.profile_path === 'marital.spouse_date_of_birth'
    )
    expect(spouseDobUpdate).toBeDefined()
    expect(spouseDobUpdate!.action).toBe('auto_clear')
  })

  it('applies stale updates without mutating the original map', () => {
    const original: AnswerMap = {
      'marital.status': makeAnswerRecord('Married'),
      'marital.spouse_family_name': makeAnswerRecord('Jane'),
      'marital.spouse_date_of_birth': makeAnswerRecord('1992-05-10'),
    }

    const updates = computeStaleUpdates(
      ['marital.status'],
      original,
      spouseFields
    )

    const result = applyStaleUpdates(original, updates)

    // Original unchanged
    expect(original['marital.spouse_family_name'].stale).toBe(false)

    // Result has stale applied
    expect(result['marital.spouse_family_name'].stale).toBe(true)
    expect(result['marital.spouse_family_name'].value).toBe('Jane') // value preserved

    // auto_clear sets value to null
    expect(result['marital.spouse_date_of_birth'].stale).toBe(true)
    expect(result['marital.spouse_date_of_birth'].value).toBeNull()
  })

  it('detects visibility transitions (hidden → visible, visible → hidden)', () => {
    const field = {
      show_when: {
        logic: 'AND' as const,
        rules: [{ field_path: 'marital.status', operator: 'equals' as const, value: 'Married' }],
      },
    }

    // Married → Single: spouse fields become hidden
    const hideTransition = detectVisibilityTransition(
      field,
      { 'marital.status': 'Married' },
      { 'marital.status': 'Single' }
    )
    expect(hideTransition).toBe('became_hidden')

    // Single → Married: spouse fields become visible
    const showTransition = detectVisibilityTransition(
      field,
      { 'marital.status': 'Single' },
      { 'marital.status': 'Married' }
    )
    expect(showTransition).toBe('became_visible')

    // Married → Married: no transition
    const noTransition = detectVisibilityTransition(
      field,
      { 'marital.status': 'Married' },
      { 'marital.status': 'Married' }
    )
    expect(noTransition).toBeNull()
  })

  it('counts stale answers correctly after applying updates', () => {
    const answers: AnswerMap = {
      'marital.status': makeAnswerRecord('Married'),
      'marital.spouse_family_name': makeAnswerRecord('Jane'),
      'marital.spouse_given_name': makeAnswerRecord('Doe'),
    }

    const updates = computeStaleUpdates(['marital.status'], answers, spouseFields)
    const result = applyStaleUpdates(answers, updates)

    expect(countStaleAnswers(result)).toBe(2) // spouse_family_name + spouse_given_name

    // Clear stale flags
    const cleared = clearStaleFlags(result, [
      'marital.spouse_family_name',
      'marital.spouse_given_name',
    ])
    expect(countStaleAnswers(cleared)).toBe(0)
  })
})

// ============================================================================
// Scenario 4: Trust Conflict
// ============================================================================

describe('Scenario 4: Trust Conflict', () => {
  let store: MockStore
  let da: AnswerEngineDataAccess

  const FORM_ID = 'form-trust'
  const INSTANCE_ID = 'inst-trust'
  const TENANT_ID = 'tenant-1'

  const fields: TestField[] = [
    makeField({ id: 'f-fn', profile_path: 'personal.family_name', is_required: true }),
  ]

  beforeEach(() => {
    store = createMockStore()
    store.formFields.set(FORM_ID, fields)
    store.instances.set(INSTANCE_ID, {
      form_id: FORM_ID,
      status: 'draft',
      answers: {},
      person_id: 'person-1',
    })
    da = createMockDataAccess(store)
  })

  it('detects conflict when client tries to overwrite verified staff value', async () => {
    // Step 1: Staff saves and verifies family_name
    await saveAnswers(
      {
        instance_id: INSTANCE_ID,
        updates: { 'personal.family_name': 'Smith' },
        source: 'staff_entry',
      },
      da,
      TENANT_ID
    )

    // Manually mark as verified (simulating staff verification action)
    const inst = store.instances.get(INSTANCE_ID)!
    inst.answers['personal.family_name'] = {
      ...inst.answers['personal.family_name'],
      verified: true,
      verified_by: 'staff-user-1',
      verified_at: '2026-03-01T12:00:00.000Z',
    }

    // Step 2: Client tries to overwrite with different value
    const result = await saveAnswers(
      {
        instance_id: INSTANCE_ID,
        updates: { 'personal.family_name': 'Smyth' },
        source: 'client_portal',
      },
      da,
      TENANT_ID
    )

    // Conflict should be returned but NOT overwrite the value
    // checkTrustConflict returns hasConflict=true when verified staff ≥ client trust
    // The saveAnswers function skips conflicting fields
    const finalAnswers = store.instances.get(INSTANCE_ID)!.answers
    expect(finalAnswers['personal.family_name'].value).toBe('Smith') // preserved
    expect(finalAnswers['personal.family_name'].verified).toBe(true)
  })

  it('checkTrustConflict returns conflict reason with trust level details', () => {
    const verified: AnswerRecord = makeAnswerRecord('Smith', 'staff_entry', {
      verified: true,
      verified_by: 'staff-1',
      verified_at: '2026-03-01T00:00:00.000Z',
    })

    const conflict = checkTrustConflict(verified, 'Smyth', 'client_portal')

    expect(conflict.hasConflict).toBe(true)
    expect(conflict.reason).toBeDefined()
    expect(conflict.reason).toContain('staff_entry')
    expect(conflict.reason).toContain('client_portal')
    expect(conflict.reason).toContain('trust')
  })

  it('allows overwrite when values are identical (no conflict)', () => {
    const verified: AnswerRecord = makeAnswerRecord('Smith', 'staff_entry', {
      verified: true,
    })

    const conflict = checkTrustConflict(verified, 'Smith', 'client_portal')
    expect(conflict.hasConflict).toBe(false)
  })

  it('allows overwrite when existing is not verified', () => {
    const unverified: AnswerRecord = makeAnswerRecord('Smith', 'staff_entry', {
      verified: false,
    })

    const conflict = checkTrustConflict(unverified, 'Smyth', 'client_portal')
    expect(conflict.hasConflict).toBe(false)
  })

  it('allows higher-trust source to overwrite lower-trust verified value', () => {
    // client_portal verified (trust 5) → staff_entry (trust 6) should succeed
    const verifiedClient: AnswerRecord = makeAnswerRecord('Smith', 'client_portal', {
      verified: true,
    })

    const conflict = checkTrustConflict(verifiedClient, 'Smyth', 'staff_entry')
    expect(conflict.hasConflict).toBe(false) // staff_entry trust (6) > client_portal trust (5)
  })
})

// ============================================================================
// Scenario 5: Generation Readiness Gate
// ============================================================================

describe('Scenario 5: Generation Readiness Gate', () => {
  let store: MockStore
  let vda: ValidationDataAccess

  const FORM_ID = 'form-gen-ready'
  const INSTANCE_ID = 'inst-gen'
  const TENANT_ID = 'tenant-1'
  const MATTER_ID = 'matter-1'

  const fields: TestField[] = [
    makeField({ id: 'f1', profile_path: 'personal.family_name', is_required: true, min_length: 2, label: 'Family Name' }),
    makeField({ id: 'f2', profile_path: 'personal.given_name', is_required: true, label: 'Given Name' }),
    makeField({ id: 'f3', profile_path: 'personal.date_of_birth', is_required: true, label: 'Date of Birth', field_type: 'date' }),
    makeField({ id: 'f4', profile_path: 'contact_info.email', is_required: false, label: 'Email', field_type: 'email' }),
    makeField({ id: 'f5', profile_path: 'passport.number', is_required: false, label: 'Passport Number' }),
  ]

  beforeEach(() => {
    store = createMockStore()
    store.formFields.set(FORM_ID, fields)
    store.instances.set(INSTANCE_ID, {
      form_id: FORM_ID,
      status: 'draft',
      answers: {},
      person_id: 'person-1',
    })
    vda = createMockValidationDataAccess(store)
  })

  it('blocks generation when required fields missing, stale exists, and validation error present', async () => {
    // Set up answers: 3 required fields missing, 1 stale, 1 validation error (too short)
    const answers: AnswerMap = {
      // family_name is present but too short (min_length=2)
      'personal.family_name': makeAnswerRecord('X', 'client_portal'),
      // given_name and date_of_birth are MISSING (required)
      // email has a stale flag
      'contact_info.email': makeAnswerRecord('john@example.com', 'client_portal', { stale: true, stale_reason: 'Dependency changed' }),
    }

    store.instances.get(INSTANCE_ID)!.answers = answers

    const readiness = await checkGenerationReadiness(
      INSTANCE_ID,
      FORM_ID,
      answers,
      vda,
      TENANT_ID,
      MATTER_ID,
      'person-1'
    )

    expect(readiness.ready).toBe(false)

    // Should have blockers for:
    // 1. missing given_name (required)
    // 2. missing date_of_birth (required)
    // 3. family_name min_length violation
    // 4. stale email
    expect(readiness.blockers.length).toBeGreaterThanOrEqual(3)
    expect(readiness.stale_count).toBe(1)

    // Verify specific blocker types exist
    const blockerCodes = readiness.validation.blocking_issues.map((i) => i.code)
    expect(blockerCodes).toContain('missing_required')
    expect(blockerCodes).toContain('stale_answer')
  })

  it('unblocks generation after fixing all issues', async () => {
    // Fix everything: fill all required, no stale, valid lengths
    const fixedAnswers: AnswerMap = {
      'personal.family_name': makeAnswerRecord('Smith', 'client_portal'),
      'personal.given_name': makeAnswerRecord('John', 'client_portal'),
      'personal.date_of_birth': makeAnswerRecord('1990-01-15', 'client_portal'),
      'contact_info.email': makeAnswerRecord('john@example.com', 'client_portal'),
    }

    store.instances.get(INSTANCE_ID)!.answers = fixedAnswers

    const readiness = await checkGenerationReadiness(
      INSTANCE_ID,
      FORM_ID,
      fixedAnswers,
      vda,
      TENANT_ID,
      MATTER_ID,
      'person-1'
    )

    expect(readiness.ready).toBe(true)
    expect(readiness.blockers.length).toBe(0)
    expect(readiness.stale_count).toBe(0)
    expect(readiness.validation.is_valid).toBe(true)
  })

  it('validateFieldValue catches min_length violation', () => {
    const issues = validateFieldValue('X', {
      profile_path: 'personal.family_name',
      label: 'Family Name',
      field_type: 'text',
      is_required: true,
      is_blocking: true,
      min_length: 2,
      max_length: 100,
      validation_pattern: null,
      validation_message: null,
      options: null,
    }, 'final')

    expect(issues.length).toBe(1)
    expect(issues[0].code).toBe('min_length')
    expect(issues[0].blocking).toBe(true)
  })
})

// ============================================================================
// Scenario 6: Format Normalization Round-Trip
// ============================================================================

describe('Scenario 6: Format Normalization Round-Trip', () => {
  describe('Boolean normalization', () => {
    it('"yes" → true (storage) → "Yes" (display) → "1" (XFA)', () => {
      const storage = normalizeForStorage('yes', 'boolean')
      expect(storage).toBe(true)

      const display = formatForDisplay(true, 'boolean')
      expect(display).toBe('Yes')

      const xfa = formatForXfa(true, {
        field_type: 'boolean',
        value_format: null,
        date_split: null,
        max_length: null,
      })
      expect(xfa).toBe('1')
    })

    it('"no" → false (storage) → "No" (display) → "2" (XFA)', () => {
      const storage = normalizeForStorage('no', 'boolean')
      expect(storage).toBe(false)

      const display = formatForDisplay(false, 'boolean')
      expect(display).toBe('No')

      const xfa = formatForXfa(false, {
        field_type: 'boolean',
        value_format: null,
        date_split: null,
        max_length: null,
      })
      expect(xfa).toBe('2')
    })

    it('boolean with custom value_format: true → "Yes" in XFA', () => {
      const xfa = formatForXfa(true, {
        field_type: 'boolean',
        value_format: { boolean_true: 'Yes', boolean_false: 'No' },
        date_split: null,
        max_length: null,
      })
      expect(xfa).toBe('Yes')
    })
  })

  describe('Date normalization', () => {
    it('"03/15/2024" → "2024-03-15" (storage)', () => {
      const storage = normalizeForStorage('03/15/2024', 'date')
      expect(storage).toBe('2024-03-15')
    })

    it('ISO date formats to display string', () => {
      const display = formatForDisplay('2024-03-15', 'date', 'en-CA')
      expect(display).toBeTruthy()
      // en-CA locale should produce a readable date string
      expect(typeof display).toBe('string')
      expect(display.length).toBeGreaterThan(0)
    })

    it('"2024-03-15" → "2024/03/15" (XFA, no split)', () => {
      const xfa = formatForXfa('2024-03-15', {
        field_type: 'date',
        value_format: null,
        date_split: null,
        max_length: null,
      })
      expect(xfa).toBe('2024/03/15')
    })

    it('date split extracts year, month, day components', () => {
      const year = formatForXfa('2024-03-15', {
        field_type: 'date',
        value_format: null,
        date_split: 'year',
        max_length: null,
      })
      expect(year).toBe('2024')

      const month = formatForXfa('2024-03-15', {
        field_type: 'date',
        value_format: null,
        date_split: 'month',
        max_length: null,
      })
      expect(month).toBe('03')

      const day = formatForXfa('2024-03-15', {
        field_type: 'date',
        value_format: null,
        date_split: 'day',
        max_length: null,
      })
      expect(day).toBe('15')
    })

    it('transformValueForXfa also splits dates correctly', () => {
      expect(
        transformValueForXfa('2024-03-15', {
          field_type: 'date',
          value_format: null,
          date_split: 'year',
          max_length: null,
        })
      ).toBe('2024')

      expect(
        transformValueForXfa('2024-03-15', {
          field_type: 'date',
          value_format: null,
          date_split: 'month',
          max_length: null,
        })
      ).toBe('03')

      expect(
        transformValueForXfa('2024-03-15', {
          field_type: 'date',
          value_format: null,
          date_split: 'day',
          max_length: null,
        })
      ).toBe('15')
    })
  })

  describe('Phone normalization', () => {
    it('"+1 (416) 555-1234" → "+14165551234" (storage)', () => {
      const storage = normalizeForStorage('+1 (416) 555-1234', 'phone')
      expect(storage).toBe('+14165551234')
    })

    it('strips all non-digit characters except leading +', () => {
      const storage = normalizeForStorage('1-800-FLOWERS', 'phone')
      // Only digits and + kept
      expect(storage).toBe('1800')
    })
  })

  describe('Email normalization', () => {
    it('"  John@Example.COM  " → "john@example.com" (storage)', () => {
      const storage = normalizeForStorage('  John@Example.COM  ', 'email')
      expect(storage).toBe('john@example.com')
    })

    it('empty string normalizes to null', () => {
      const storage = normalizeForStorage('', 'email')
      expect(storage).toBeNull()
    })

    it('whitespace-only normalizes to null', () => {
      const storage = normalizeForStorage('   ', 'email')
      expect(storage).toBeNull()
    })
  })

  describe('Text normalization', () => {
    it('trims whitespace from text fields', () => {
      const storage = normalizeForStorage('  Hello World  ', 'text')
      expect(storage).toBe('Hello World')
    })
  })

  describe('Number normalization', () => {
    it('"1,234.56" → 1234.56 (storage)', () => {
      const storage = normalizeForStorage('1,234.56', 'number')
      expect(storage).toBe(1234.56)
    })

    it('NaN input → null', () => {
      const storage = normalizeForStorage('not-a-number', 'number')
      expect(storage).toBeNull()
    })
  })

  describe('XFA max_length truncation', () => {
    it('truncates long strings to max_length', () => {
      const xfa = formatForXfa('Hello World', {
        field_type: 'text',
        value_format: null,
        date_split: null,
        max_length: 5,
      })
      expect(xfa).toBe('Hello')
    })
  })

  describe('Round-trip integrity', () => {
    it('boolean round-trip: input → storage → display → XFA', () => {
      // Input
      const input = 'yes'

      // Step 1: normalize for storage
      const stored = normalizeForStorage(input, 'boolean')
      expect(stored).toBe(true)

      // Step 2: format for display
      const displayed = formatForDisplay(stored, 'boolean')
      expect(displayed).toBe('Yes')

      // Step 3: format for XFA
      const xfaDefault = formatForXfa(stored, {
        field_type: 'boolean',
        value_format: null,
        date_split: null,
        max_length: null,
      })
      expect(xfaDefault).toBe('1')

      // Step 3 alt: custom XFA format
      const xfaCustom = formatForXfa(stored, {
        field_type: 'boolean',
        value_format: { boolean_true: 'Yes', boolean_false: 'No' },
        date_split: null,
        max_length: null,
      })
      expect(xfaCustom).toBe('Yes')
    })

    it('date round-trip: input → storage → display → XFA → split', () => {
      // Input (MM/DD/YYYY)
      const input = '03/15/2024'

      // Step 1: normalize for storage
      const stored = normalizeForStorage(input, 'date')
      expect(stored).toBe('2024-03-15')

      // Step 2: format for display
      const displayed = formatForDisplay(stored, 'date', 'en-CA')
      expect(displayed).toBeTruthy()

      // Step 3: format for XFA (full date)
      const xfaFull = formatForXfa(stored, {
        field_type: 'date',
        value_format: null,
        date_split: null,
        max_length: null,
      })
      expect(xfaFull).toBe('2024/03/15')

      // Step 4: format for XFA split
      const year = formatForXfa(stored, {
        field_type: 'date',
        value_format: null,
        date_split: 'year',
        max_length: null,
      })
      const month = formatForXfa(stored, {
        field_type: 'date',
        value_format: null,
        date_split: 'month',
        max_length: null,
      })
      const day = formatForXfa(stored, {
        field_type: 'date',
        value_format: null,
        date_split: 'day',
        max_length: null,
      })

      expect(year).toBe('2024')
      expect(month).toBe('03')
      expect(day).toBe('15')
    })
  })
})
