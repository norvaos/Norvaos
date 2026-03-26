/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Intake Pre-Fill Service Tests
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Proves:
 * - Screening answers from lead are extracted into flat answer map
 * - Intake profile custom data is merged without overwriting screening answers
 * - Form submission answers are merged (newest-first, no overwrites)
 * - Well-known profile fields (jurisdiction, urgency) are mapped
 * - Empty/null snapshots return empty result
 * - collectedFieldKeys correctly lists all answered fields
 * - filterUnansweredQuestions removes already-answered questions
 * - isFieldAlreadyCollected works for present and absent fields
 */

import { describe, it, expect } from 'vitest'
import { createMockSupabase } from '@/lib/test-utils/mock-supabase'
import {
  getIntakePrefill,
  isFieldAlreadyCollected,
  filterUnansweredQuestions,
} from '../intake-prefill'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FULL_SNAPSHOT = {
  originating_lead_id: 'lead-1',
  snapshot_created_at: '2026-03-24T12:00:00Z',
  screening_answers: {
    language: 'English',
    how_did_you_hear: 'Google',
    reason_for_visit: 'Work permit renewal',
  },
  intake_profile: {
    custom_intake_data: {
      occupation: 'Software Engineer',
      employer: 'Acme Corp',
    },
    jurisdiction: 'ON',
    urgency_level: 'high',
    preferred_contact_method: 'email',
    intake_summary: 'Client needs work permit renewal before expiry.',
    opposing_party_names: null,
    related_party_names: null,
    abuse_safety_flag: false,
    capacity_concern_flag: false,
    limitation_risk_flag: false,
  },
  form_submissions: [
    {
      id: 'sub-1',
      form_id: 'form-1',
      answers: {
        full_name: 'John Doe',
        email: 'john@example.com',
        // This should NOT overwrite screening_answers.language
        language: 'French',
      },
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'spring-2026',
      created_at: '2026-03-20T10:00:00Z',
    },
  ],
}

// ─── getIntakePrefill ────────────────────────────────────────────────────────

describe('getIntakePrefill', () => {
  it('returns empty result when no snapshot exists', async () => {
    const supabase = createMockSupabase({
      matter_intake: { selectData: { lead_intake_snapshot: null } },
    })

    const result = await getIntakePrefill(supabase, 'matter-1')

    expect(result.answers).toEqual({})
    expect(result.collectedFieldKeys).toHaveLength(0)
    expect(result.metadata.source).toBe('none')
  })

  it('returns empty result when matter_intake not found', async () => {
    const supabase = createMockSupabase({
      matter_intake: { selectData: null },
    })

    const result = await getIntakePrefill(supabase, 'matter-1')

    expect(result.answers).toEqual({})
    expect(result.metadata.source).toBe('none')
  })

  it('extracts screening answers into flat answer map', async () => {
    const supabase = createMockSupabase({
      matter_intake: {
        selectData: {
          lead_intake_snapshot: {
            originating_lead_id: 'lead-1',
            snapshot_created_at: '2026-03-24T12:00:00Z',
            screening_answers: {
              language: 'English',
              how_did_you_hear: 'Google',
            },
          },
        },
      },
    })

    const result = await getIntakePrefill(supabase, 'matter-1')

    expect(result.answers.language).toBe('English')
    expect(result.answers.how_did_you_hear).toBe('Google')
    expect(result.metadata.source).toBe('lead')
    expect(result.metadata.originatingLeadId).toBe('lead-1')
  })

  it('merges intake profile custom data without overwriting screening', async () => {
    const supabase = createMockSupabase({
      matter_intake: { selectData: { lead_intake_snapshot: FULL_SNAPSHOT } },
    })

    const result = await getIntakePrefill(supabase, 'matter-1')

    // Screening answers take priority
    expect(result.answers.language).toBe('English')
    // Profile custom data is also available
    expect(result.answers.occupation).toBe('Software Engineer')
    expect(result.answers.employer).toBe('Acme Corp')
  })

  it('maps well-known profile fields to standard keys', async () => {
    const supabase = createMockSupabase({
      matter_intake: { selectData: { lead_intake_snapshot: FULL_SNAPSHOT } },
    })

    const result = await getIntakePrefill(supabase, 'matter-1')

    expect(result.answers.jurisdiction).toBe('ON')
    expect(result.answers.urgency_level).toBe('high')
    expect(result.answers.preferred_contact_method).toBe('email')
    expect(result.answers.intake_summary).toBe('Client needs work permit renewal before expiry.')
  })

  it('merges form submission answers without overwriting earlier data', async () => {
    const supabase = createMockSupabase({
      matter_intake: { selectData: { lead_intake_snapshot: FULL_SNAPSHOT } },
    })

    const result = await getIntakePrefill(supabase, 'matter-1')

    // Form submission adds new fields
    expect(result.answers.full_name).toBe('John Doe')
    expect(result.answers.email).toBe('john@example.com')
    // But does NOT overwrite screening answers
    expect(result.answers.language).toBe('English') // NOT 'French'
  })

  it('returns all collected field keys', async () => {
    const supabase = createMockSupabase({
      matter_intake: { selectData: { lead_intake_snapshot: FULL_SNAPSHOT } },
    })

    const result = await getIntakePrefill(supabase, 'matter-1')

    expect(result.collectedFieldKeys).toContain('language')
    expect(result.collectedFieldKeys).toContain('occupation')
    expect(result.collectedFieldKeys).toContain('jurisdiction')
    expect(result.collectedFieldKeys).toContain('full_name')
    expect(result.collectedFieldKeys.length).toBeGreaterThan(5)
  })

  it('skips null/empty answers', async () => {
    const supabase = createMockSupabase({
      matter_intake: {
        selectData: {
          lead_intake_snapshot: {
            originating_lead_id: 'lead-1',
            snapshot_created_at: '2026-03-24T12:00:00Z',
            screening_answers: {
              filled: 'yes',
              empty_string: '',
              null_val: null,
              undef_val: undefined,
            },
          },
        },
      },
    })

    const result = await getIntakePrefill(supabase, 'matter-1')

    expect(result.answers.filled).toBe('yes')
    expect('empty_string' in result.answers).toBe(false)
    expect('null_val' in result.answers).toBe(false)
    expect('undef_val' in result.answers).toBe(false)
  })
})

// ─── isFieldAlreadyCollected ────────────────────────────────────────────────

describe('isFieldAlreadyCollected', () => {
  const prefill = {
    answers: { language: 'English', occupation: 'Engineer' },
    collectedFieldKeys: ['language', 'occupation'],
    metadata: { source: 'lead' as const, originatingLeadId: 'lead-1', snapshotCreatedAt: '2026-03-24' },
  }

  it('returns true for collected fields', () => {
    expect(isFieldAlreadyCollected(prefill, 'language')).toBe(true)
    expect(isFieldAlreadyCollected(prefill, 'occupation')).toBe(true)
  })

  it('returns false for uncollected fields', () => {
    expect(isFieldAlreadyCollected(prefill, 'marital_status')).toBe(false)
  })
})

// ─── filterUnansweredQuestions ────────────────────────────────────────────────

describe('filterUnansweredQuestions', () => {
  const prefill = {
    answers: { language: 'English', occupation: 'Engineer' },
    collectedFieldKeys: ['language', 'occupation'],
    metadata: { source: 'lead' as const, originatingLeadId: 'lead-1', snapshotCreatedAt: '2026-03-24' },
  }

  it('filters out already-answered questions', () => {
    const questions = [
      { field_key: 'language', label: 'Language' },
      { field_key: 'marital_status', label: 'Marital Status' },
      { field_key: 'occupation', label: 'Occupation' },
      { field_key: 'employer', label: 'Employer' },
    ]

    const unanswered = filterUnansweredQuestions(questions, prefill)

    expect(unanswered).toHaveLength(2)
    expect(unanswered.map((q) => q.field_key)).toEqual(['marital_status', 'employer'])
  })

  it('keeps questions without a field_key (cannot match)', () => {
    const questions = [{ label: 'No key' }]
    const unanswered = filterUnansweredQuestions(questions, prefill)
    expect(unanswered).toHaveLength(1)
  })

  it('uses id fallback when field_key is absent', () => {
    const questions = [
      { id: 'language', label: 'Language' },
      { id: 'unknown', label: 'Unknown' },
    ]
    const unanswered = filterUnansweredQuestions(questions, prefill)
    expect(unanswered).toHaveLength(1)
    expect(unanswered[0].id).toBe('unknown')
  })
})
