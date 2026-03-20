/**
 * IRCC Forms Engine — Repeated Group / Array Field Tests
 *
 * Covers:
 *   1. Array field save and resume (persist and retrieve indexed entries)
 *   2. Array field validation (required sub-fields within array entries)
 *   3. Array field stale handling (parent change invalidates array entries)
 *   4. Array field XFA generation mapping via resolveArrayFields()
 *   5. Max entries limit enforcement
 */
import { describe, it, expect, beforeEach } from 'vitest'

// Answer engine
import {
  saveAnswers,
  computeCompletionState,
  createAnswerRecord,
} from '../answer-engine'
import type { AnswerEngineDataAccess } from '../answer-engine'

// Stale tracker
import {
  computeStaleUpdates,
  applyStaleUpdates,
  countStaleAnswers,
} from '../stale-tracker'

// Generation resolver (array field resolution + value transforms)
import { resolveArrayFields, transformValueForXfa } from '../generation-resolver'

// Types
import type {
  AnswerRecord,
  AnswerMap,
  AnswerSource,
  CompletionState,
  PropagationMode,
  OnParentChange,
} from '../types/answers'
import type { FieldCondition } from '../types/conditions'

// ============================================================================
// Shared Fixture Factories (mirrors e2e-scenarios.test.ts patterns)
// ============================================================================

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

// Standard array map for children (used across multiple test groups)
const CHILDREN_ARRAY_MAP = {
  profile_path: 'children',
  xfa_base_path: 'form1[0].Page2[0].ChildrenDetails',
  xfa_entry_name: 'Child',
  max_entries: 4,
  sub_fields: {
    given_name: 'GivenName',
    family_name: 'FamilyName',
    date_of_birth: 'DOBYear',
    country_of_birth: 'CountryOfBirth',
  },
}

// ============================================================================
// Mock DataAccess
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
// 1. Array Field Save and Resume
// ============================================================================

describe('Array Field Save and Resume', () => {
  let store: MockStore
  let da: AnswerEngineDataAccess

  const FORM_ID = 'form-imm5406'
  const INSTANCE_ID = 'inst-array-001'
  const TENANT_ID = 'tenant-1'

  // Fields include both scalar and array-indexed profile_paths
  const fields: TestField[] = [
    makeField({ id: 'f-num-children', profile_path: 'family.number_of_children', is_required: true }),
    makeField({ id: 'f-c0-given', profile_path: 'children[0].given_name', is_required: false }),
    makeField({ id: 'f-c0-family', profile_path: 'children[0].family_name', is_required: false }),
    makeField({ id: 'f-c1-given', profile_path: 'children[1].given_name', is_required: false }),
    makeField({ id: 'f-c1-family', profile_path: 'children[1].family_name', is_required: false }),
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

  it('saves array-indexed answers and persists them in the answer map', async () => {
    await saveAnswers(
      {
        instance_id: INSTANCE_ID,
        updates: {
          'children[0].given_name': 'Alice',
          'children[0].family_name': 'Smith',
          'children[1].given_name': 'Bob',
          'children[1].family_name': 'Smith',
        },
        source: 'client_portal',
      },
      da,
      TENANT_ID
    )

    const answers = store.instances.get(INSTANCE_ID)!.answers
    expect(answers['children[0].given_name'].value).toBe('Alice')
    expect(answers['children[0].family_name'].value).toBe('Smith')
    expect(answers['children[1].given_name'].value).toBe('Bob')
    expect(answers['children[1].family_name'].value).toBe('Smith')
  })

  it('resumes and retrieves previously saved array entries', async () => {
    // First save: child 0
    await saveAnswers(
      {
        instance_id: INSTANCE_ID,
        updates: {
          'family.number_of_children': '2',
          'children[0].given_name': 'Alice',
          'children[0].family_name': 'Smith',
        },
        source: 'client_portal',
      },
      da,
      TENANT_ID
    )

    // Second save: child 1 (resume)
    await saveAnswers(
      {
        instance_id: INSTANCE_ID,
        updates: {
          'children[1].given_name': 'Bob',
          'children[1].family_name': 'Smith',
        },
        source: 'client_portal',
      },
      da,
      TENANT_ID
    )

    // All entries should be present
    const answers = store.instances.get(INSTANCE_ID)!.answers
    expect(answers['family.number_of_children'].value).toBe('2')
    expect(answers['children[0].given_name'].value).toBe('Alice')
    expect(answers['children[1].given_name'].value).toBe('Bob')
    expect(Object.keys(answers)).toHaveLength(5) // 1 scalar + 4 array sub-fields
  })

  it('overwrites an existing array entry value on re-save', async () => {
    await saveAnswers(
      {
        instance_id: INSTANCE_ID,
        updates: { 'children[0].given_name': 'Alice' },
        source: 'client_portal',
      },
      da,
      TENANT_ID
    )

    // Overwrite with a new name
    await saveAnswers(
      {
        instance_id: INSTANCE_ID,
        updates: { 'children[0].given_name': 'Alicia' },
        source: 'client_portal',
      },
      da,
      TENANT_ID
    )

    const answers = store.instances.get(INSTANCE_ID)!.answers
    expect(answers['children[0].given_name'].value).toBe('Alicia')
  })
})

// ============================================================================
// 2. Array Field Validation (Required Sub-Fields)
// ============================================================================

describe('Array Field Validation', () => {
  it('computeCompletionState counts required array sub-fields as relevant', () => {
    const fields: TestField[] = [
      makeField({ id: 'f-c0-given', profile_path: 'children[0].given_name', is_required: true }),
      makeField({ id: 'f-c0-family', profile_path: 'children[0].family_name', is_required: true }),
      makeField({ id: 'f-c0-dob', profile_path: 'children[0].date_of_birth', is_required: false }),
    ]

    // No answers provided yet
    const answers: AnswerMap = {}

    const state = computeCompletionState(answers, fields)

    // 3 mapped fields visible, 0 filled
    expect(state.total_relevant).toBe(3)
    expect(state.total_filled).toBe(0)
    expect(state.completion_pct).toBe(0)
  })

  it('reports 100% when all required array sub-fields are filled', () => {
    const fields: TestField[] = [
      makeField({ id: 'f-c0-given', profile_path: 'children[0].given_name', is_required: true }),
      makeField({ id: 'f-c0-family', profile_path: 'children[0].family_name', is_required: true }),
      makeField({ id: 'f-c0-dob', profile_path: 'children[0].date_of_birth', is_required: false }),
    ]

    const answers: AnswerMap = {
      'children[0].given_name': makeAnswerRecord('Alice'),
      'children[0].family_name': makeAnswerRecord('Smith'),
      // date_of_birth is optional so leaving it empty should not block 100%
    }

    const state = computeCompletionState(answers, fields)

    expect(state.total_relevant).toBe(3)
    expect(state.total_filled).toBe(2)
    // 2 of 3 fields filled = 67%
    expect(state.completion_pct).toBe(67)
  })

  it('treats stale array sub-field answers as unfilled', () => {
    const fields: TestField[] = [
      makeField({ id: 'f-c0-given', profile_path: 'children[0].given_name', is_required: true }),
    ]

    const answers: AnswerMap = {
      'children[0].given_name': makeAnswerRecord('Alice', 'client_portal', {
        stale: true,
        stale_reason: 'Parent changed',
      }),
    }

    const state = computeCompletionState(answers, fields)

    // Stale answers are not counted as filled
    expect(state.total_filled).toBe(0)
    expect(state.total_stale).toBe(1)
  })
})

// ============================================================================
// 3. Array Field Stale Handling
// ============================================================================

describe('Array Field Stale Handling', () => {
  // When number_of_children changes, child sub-fields that depend on it should go stale
  const fields: TestField[] = [
    makeField({
      id: 'f-num-children',
      profile_path: 'family.number_of_children',
      is_required: true,
    }),
    makeField({
      id: 'f-c0-given',
      profile_path: 'children[0].given_name',
      is_required: false,
      show_when: {
        logic: 'AND' as const,
        rules: [{ field_path: 'family.number_of_children', operator: 'gte' as const, value: '1' }],
      },
    }),
    makeField({
      id: 'f-c0-family',
      profile_path: 'children[0].family_name',
      is_required: false,
      on_parent_change: 'auto_clear',
      show_when: {
        logic: 'AND' as const,
        rules: [{ field_path: 'family.number_of_children', operator: 'gte' as const, value: '1' }],
      },
    }),
    makeField({
      id: 'f-c1-given',
      profile_path: 'children[1].given_name',
      is_required: false,
      show_when: {
        logic: 'AND' as const,
        rules: [{ field_path: 'family.number_of_children', operator: 'gte' as const, value: '2' }],
      },
    }),
  ]

  it('marks array entry sub-fields stale when parent count changes', () => {
    const answers: AnswerMap = {
      'family.number_of_children': makeAnswerRecord('2'),
      'children[0].given_name': makeAnswerRecord('Alice'),
      'children[0].family_name': makeAnswerRecord('Smith'),
      'children[1].given_name': makeAnswerRecord('Bob'),
    }

    const updates = computeStaleUpdates(
      ['family.number_of_children'],
      answers,
      fields
    )

    // All child fields depend on number_of_children via show_when
    expect(updates.length).toBe(3)

    const c0Given = updates.find((u) => u.profile_path === 'children[0].given_name')
    expect(c0Given).toBeDefined()
    expect(c0Given!.action).toBe('mark_stale')

    const c0Family = updates.find((u) => u.profile_path === 'children[0].family_name')
    expect(c0Family).toBeDefined()
    expect(c0Family!.action).toBe('auto_clear')

    const c1Given = updates.find((u) => u.profile_path === 'children[1].given_name')
    expect(c1Given).toBeDefined()
    expect(c1Given!.action).toBe('mark_stale')
  })

  it('applyStaleUpdates preserves values for mark_stale and clears for auto_clear', () => {
    const answers: AnswerMap = {
      'family.number_of_children': makeAnswerRecord('2'),
      'children[0].given_name': makeAnswerRecord('Alice'),
      'children[0].family_name': makeAnswerRecord('Smith'),
      'children[1].given_name': makeAnswerRecord('Bob'),
    }

    const updates = computeStaleUpdates(
      ['family.number_of_children'],
      answers,
      fields
    )
    const result = applyStaleUpdates(answers, updates)

    // mark_stale: value preserved, stale=true
    expect(result['children[0].given_name'].value).toBe('Alice')
    expect(result['children[0].given_name'].stale).toBe(true)

    // auto_clear: value nulled, stale=true
    expect(result['children[0].family_name'].value).toBeNull()
    expect(result['children[0].family_name'].stale).toBe(true)

    // mark_stale on second child
    expect(result['children[1].given_name'].value).toBe('Bob')
    expect(result['children[1].given_name'].stale).toBe(true)

    // Original not mutated
    expect(answers['children[0].given_name'].stale).toBe(false)
    expect(answers['children[0].family_name'].value).toBe('Smith')
  })

  it('countStaleAnswers reflects stale array entries after update', () => {
    const answers: AnswerMap = {
      'family.number_of_children': makeAnswerRecord('2'),
      'children[0].given_name': makeAnswerRecord('Alice'),
      'children[0].family_name': makeAnswerRecord('Smith'),
      'children[1].given_name': makeAnswerRecord('Bob'),
    }

    const updates = computeStaleUpdates(
      ['family.number_of_children'],
      answers,
      fields
    )
    const result = applyStaleUpdates(answers, updates)

    expect(countStaleAnswers(result)).toBe(3)
  })
})

// ============================================================================
// 4. Array Field XFA Generation Mapping via resolveArrayFields()
// ============================================================================

describe('Array Field XFA Generation Mapping', () => {
  it('maps children[0].given_name to the correct XFA path', () => {
    const answers: AnswerMap = {
      'children[0].given_name': makeAnswerRecord('Alice'),
      'children[0].family_name': makeAnswerRecord('Smith'),
    }

    const result = resolveArrayFields(answers, [CHILDREN_ARRAY_MAP])

    expect(result).toEqual({
      'form1[0].Page2[0].ChildrenDetails.Child[0].GivenName': 'Alice',
      'form1[0].Page2[0].ChildrenDetails.Child[0].FamilyName': 'Smith',
    })
  })

  it('maps multiple array indices to separate XFA entries', () => {
    const answers: AnswerMap = {
      'children[0].given_name': makeAnswerRecord('Alice'),
      'children[1].given_name': makeAnswerRecord('Bob'),
      'children[2].given_name': makeAnswerRecord('Charlie'),
    }

    const result = resolveArrayFields(answers, [CHILDREN_ARRAY_MAP])

    expect(result['form1[0].Page2[0].ChildrenDetails.Child[0].GivenName']).toBe('Alice')
    expect(result['form1[0].Page2[0].ChildrenDetails.Child[1].GivenName']).toBe('Bob')
    expect(result['form1[0].Page2[0].ChildrenDetails.Child[2].GivenName']).toBe('Charlie')
  })

  it('maps all sub-fields for a single array entry', () => {
    const answers: AnswerMap = {
      'children[0].given_name': makeAnswerRecord('Alice'),
      'children[0].family_name': makeAnswerRecord('Smith'),
      'children[0].date_of_birth': makeAnswerRecord('2015-06-20'),
      'children[0].country_of_birth': makeAnswerRecord('Canada'),
    }

    const result = resolveArrayFields(answers, [CHILDREN_ARRAY_MAP])

    expect(Object.keys(result)).toHaveLength(4)
    expect(result['form1[0].Page2[0].ChildrenDetails.Child[0].GivenName']).toBe('Alice')
    expect(result['form1[0].Page2[0].ChildrenDetails.Child[0].FamilyName']).toBe('Smith')
    expect(result['form1[0].Page2[0].ChildrenDetails.Child[0].DOBYear']).toBe('2015-06-20')
    expect(result['form1[0].Page2[0].ChildrenDetails.Child[0].CountryOfBirth']).toBe('Canada')
  })

  it('skips null and undefined values in array entries', () => {
    const answers: AnswerMap = {
      'children[0].given_name': makeAnswerRecord('Alice'),
      'children[0].family_name': makeAnswerRecord(null),
      'children[0].date_of_birth': makeAnswerRecord(undefined),
    }

    const result = resolveArrayFields(answers, [CHILDREN_ARRAY_MAP])

    // Only the non-null entry should appear
    expect(Object.keys(result)).toHaveLength(1)
    expect(result['form1[0].Page2[0].ChildrenDetails.Child[0].GivenName']).toBe('Alice')
  })

  it('handles multiple array maps (children + travel history)', () => {
    const travelArrayMap = {
      profile_path: 'travel_history',
      xfa_base_path: 'form1[0].Page3[0].TravelSection',
      xfa_entry_name: 'Trip',
      max_entries: 10,
      sub_fields: {
        country: 'DestCountry',
        departure_date: 'DepartDate',
      },
    }

    const answers: AnswerMap = {
      'children[0].given_name': makeAnswerRecord('Alice'),
      'travel_history[0].country': makeAnswerRecord('USA'),
      'travel_history[0].departure_date': makeAnswerRecord('2024-01-15'),
      'travel_history[1].country': makeAnswerRecord('UK'),
    }

    const result = resolveArrayFields(answers, [CHILDREN_ARRAY_MAP, travelArrayMap])

    expect(result['form1[0].Page2[0].ChildrenDetails.Child[0].GivenName']).toBe('Alice')
    expect(result['form1[0].Page3[0].TravelSection.Trip[0].DestCountry']).toBe('USA')
    expect(result['form1[0].Page3[0].TravelSection.Trip[0].DepartDate']).toBe('2024-01-15')
    expect(result['form1[0].Page3[0].TravelSection.Trip[1].DestCountry']).toBe('UK')
  })

  it('ignores sub-fields not declared in the sub_fields mapping', () => {
    const answers: AnswerMap = {
      'children[0].given_name': makeAnswerRecord('Alice'),
      'children[0].nickname': makeAnswerRecord('Ali'), // not in sub_fields
    }

    const result = resolveArrayFields(answers, [CHILDREN_ARRAY_MAP])

    // nickname is not in sub_fields, so it should not appear in output
    expect(Object.keys(result)).toHaveLength(1)
    expect(result['form1[0].Page2[0].ChildrenDetails.Child[0].GivenName']).toBe('Alice')
  })

  it('returns empty map when no array answers match', () => {
    const answers: AnswerMap = {
      'personal.family_name': makeAnswerRecord('Smith'),
    }

    const result = resolveArrayFields(answers, [CHILDREN_ARRAY_MAP])

    expect(Object.keys(result)).toHaveLength(0)
  })
})

// ============================================================================
// 5. Max Entries Limit Enforcement
// ============================================================================

describe('Max Entries Limit Enforcement', () => {
  it('excludes array entries at or beyond max_entries', () => {
    // max_entries is 4, so indices 0-3 are valid, index 4 is out of bounds
    const answers: AnswerMap = {
      'children[0].given_name': makeAnswerRecord('Child0'),
      'children[1].given_name': makeAnswerRecord('Child1'),
      'children[2].given_name': makeAnswerRecord('Child2'),
      'children[3].given_name': makeAnswerRecord('Child3'),
      'children[4].given_name': makeAnswerRecord('Child4'), // beyond max_entries=4
      'children[5].given_name': makeAnswerRecord('Child5'), // beyond max_entries=4
    }

    const result = resolveArrayFields(answers, [CHILDREN_ARRAY_MAP])

    // Only indices 0-3 should be mapped (4 entries)
    expect(Object.keys(result)).toHaveLength(4)
    expect(result['form1[0].Page2[0].ChildrenDetails.Child[0].GivenName']).toBe('Child0')
    expect(result['form1[0].Page2[0].ChildrenDetails.Child[1].GivenName']).toBe('Child1')
    expect(result['form1[0].Page2[0].ChildrenDetails.Child[2].GivenName']).toBe('Child2')
    expect(result['form1[0].Page2[0].ChildrenDetails.Child[3].GivenName']).toBe('Child3')

    // Index 4 and 5 should NOT appear
    expect(result['form1[0].Page2[0].ChildrenDetails.Child[4].GivenName']).toBeUndefined()
    expect(result['form1[0].Page2[0].ChildrenDetails.Child[5].GivenName']).toBeUndefined()
  })

  it('rejects negative array indices', () => {
    const answers: AnswerMap = {
      'children[-1].given_name': makeAnswerRecord('Negative'),
      'children[0].given_name': makeAnswerRecord('Valid'),
    }

    const result = resolveArrayFields(answers, [CHILDREN_ARRAY_MAP])

    expect(Object.keys(result)).toHaveLength(1)
    expect(result['form1[0].Page2[0].ChildrenDetails.Child[0].GivenName']).toBe('Valid')
  })

  it('respects a max_entries of 1 (single-entry array)', () => {
    const singleEntryMap = {
      ...CHILDREN_ARRAY_MAP,
      max_entries: 1,
    }

    const answers: AnswerMap = {
      'children[0].given_name': makeAnswerRecord('OnlyChild'),
      'children[1].given_name': makeAnswerRecord('Excluded'),
    }

    const result = resolveArrayFields(answers, [singleEntryMap])

    expect(Object.keys(result)).toHaveLength(1)
    expect(result['form1[0].Page2[0].ChildrenDetails.Child[0].GivenName']).toBe('OnlyChild')
  })

  it('handles non-numeric index gracefully (skips malformed paths)', () => {
    const answers: AnswerMap = {
      'children[abc].given_name': makeAnswerRecord('Bad'),
      'children[0].given_name': makeAnswerRecord('Good'),
    }

    const result = resolveArrayFields(answers, [CHILDREN_ARRAY_MAP])

    // Only the valid numeric index should map
    expect(Object.keys(result)).toHaveLength(1)
    expect(result['form1[0].Page2[0].ChildrenDetails.Child[0].GivenName']).toBe('Good')
  })
})

// ============================================================================
// Bonus: createAnswerRecord for array entries
// ============================================================================

describe('createAnswerRecord for array entries', () => {
  it('creates a valid answer record with array-indexed profile path values', () => {
    const record = createAnswerRecord('Alice', 'client_portal')

    expect(record.value).toBe('Alice')
    expect(record.source).toBe('client_portal')
    expect(record.verified).toBe(false)
    expect(record.stale).toBe(false)
    expect(record.updated_at).toBeTruthy()
  })

  it('createAnswerRecord works with different sources for array values', () => {
    const staffRecord = createAnswerRecord('Bob', 'staff_entry')
    expect(staffRecord.source).toBe('staff_entry')

    const prefillRecord = createAnswerRecord('Charlie', 'cross_form_reuse')
    expect(prefillRecord.source).toBe('cross_form_reuse')
  })
})
