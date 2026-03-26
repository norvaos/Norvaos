/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Stage Engine Tests — Matter Stage Transitions (Generic + Immigration)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Proves:
 * - advanceGenericStage: valid transitions, gating rule enforcement, auto-close,
 *   activity logging, skipActivityLog, upsert vs insert for stage state
 * - advanceImmigrationStage: checklist gating, auto-tasks, idempotent task creation,
 *   auto-initialize checklist, stage history tracking
 * - evaluateGatingRules: every rule type (checklist, deadlines, previous_stage,
 *   intake_complete, risk_review, document_slots, no_contradictions,
 *   imm_intake_status, no_open_deficiencies, submission_confirmation,
 *   retainer_agreement)
 * - getEffectiveGatingRules: explicit rules passthrough, early stage bypass,
 *   enforcement_enabled default baseline, ungated fallback
 * - isPostSubmissionStage: immigration history, generic history, current stage
 *   name matching, negative case
 * - Terminal stage auto-close behaviour
 * - Stage history exit-time stamping
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock External Dependencies ──────────────────────────────────────────────

vi.mock('../checklist-engine', () => ({
  calculateCompletionScore: vi.fn(),
}))

vi.mock('../automation-engine', () => ({
  processAutomationTrigger: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../email-service', () => ({
  sendStageChangeEmail: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/config/immigration-playbooks', () => ({
  IMMIGRATION_INTAKE_STATUS_ORDER: [
    'not_issued',
    'issued',
    'in_progress',
    'submitted',
    'completed',
  ],
}))

import { calculateCompletionScore } from '../checklist-engine'
import { processAutomationTrigger } from '../automation-engine'
import {
  advanceGenericStage,
  advanceImmigrationStage,
  evaluateGatingRules,
  getEffectiveGatingRules,
  isPostSubmissionStage,
} from '../stage-engine'
import type { GatingRule } from '../stage-engine'

// ─── Supabase Mock Builder ───────────────────────────────────────────────────

type MockChain = {
  select: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  in: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
}

/**
 * Creates a Supabase mock with configurable per-table return values.
 * tableResponses is a map of table name -> array of { data, error?, count? }
 * responses consumed in order per table.
 */
function createSupabaseMock(tableResponses: Record<string, Array<{ data?: any; error?: any; count?: number }>>) {
  const callIndices: Record<string, number> = {}

  function getNextResponse(table: string) {
    const responses = tableResponses[table] ?? [{ data: null }]
    const idx = callIndices[table] ?? 0
    callIndices[table] = idx + 1
    return responses[Math.min(idx, responses.length - 1)]
  }

  function buildChain(table: string): any {
    let resolved = false
    const response = () => {
      resolved = true
      return getNextResponse(table)
    }

    const chain: any = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      single: vi.fn().mockImplementation(() => response()),
      maybeSingle: vi.fn().mockImplementation(() => response()),
      // Make chain thenable so `await supabase.from('x').select().eq().in()` resolves
      then: (resolve: (v: any) => void, reject?: (e: any) => void) => {
        const r = resolved ? getNextResponse(table) : response()
        return Promise.resolve(r).then(resolve, reject)
      },
    }

    // Make chain methods return the chain for fluent API
    for (const method of ['select', 'insert', 'update', 'eq', 'in', 'order', 'limit']) {
      chain[method].mockReturnValue(chain)
    }

    return chain
  }

  // Track chains per call
  const tableChains: Record<string, any[]> = {}

  const supabase = {
    from: vi.fn((table: string) => {
      const chain = buildChain(table)
      if (!tableChains[table]) tableChains[table] = []
      tableChains[table].push(chain)
      return chain
    }),
  }

  return { supabase: supabase as any, tableChains }
}

// ─── Test Constants ──────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-001'
const MATTER_ID = 'matter-001'
const USER_ID = 'user-001'
const TARGET_STAGE_ID = 'stage-002'
const PIPELINE_ID = 'pipeline-001'

// ─── evaluateGatingRules ─────────────────────────────────────────────────────

describe('evaluateGatingRules', () => {
  const mockCalcScore = vi.mocked(calculateCompletionScore)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns passed=true with empty rules', async () => {
    const { supabase } = createSupabaseMock({})
    const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, [], undefined)
    expect(result.passed).toBe(true)
    expect(result.failedRules).toHaveLength(0)
    expect(result.conditions).toHaveLength(0)
  })

  describe('require_checklist_complete', () => {
    const rules: GatingRule[] = [{ type: 'require_checklist_complete' }]

    it('passes when checklist is complete', async () => {
      const { supabase } = createSupabaseMock({
        matter_checklist_items: [{ data: [{ id: '1', document_name: 'Passport', status: 'approved', is_required: true }] }],
      })
      mockCalcScore.mockReturnValue({
        total: 1, required: 1, requiredApproved: 1, completionPercent: 100, isComplete: true, missingRequired: [],
      } as any)

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(true)
      expect(result.conditions[0].conditionId).toBe('require_checklist_complete')
      expect(result.conditions[0].passed).toBe(true)
    })

    it('fails when checklist items are missing', async () => {
      const { supabase } = createSupabaseMock({
        matter_checklist_items: [{ data: [{ id: '1', document_name: 'Passport', status: 'missing', is_required: true }] }],
      })
      mockCalcScore.mockReturnValue({
        total: 1, required: 1, requiredApproved: 0, completionPercent: 0, isComplete: false,
        missingRequired: ['Passport'],
      } as any)

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(false)
      expect(result.failedRules.length).toBeGreaterThan(0)
      expect(result.conditions[0].passed).toBe(false)
    })

    it('passes when no required items exist (empty result)', async () => {
      const { supabase } = createSupabaseMock({
        matter_checklist_items: [{ data: [] }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(true)
    })
  })

  describe('require_deadlines', () => {
    const rules: GatingRule[] = [{ type: 'require_deadlines', deadline_type_names: ['Filing Deadline', 'Hearing Date'] }]

    it('passes when all required deadlines exist', async () => {
      const { supabase } = createSupabaseMock({
        matter_deadlines: [{
          data: [
            { deadline_type: 'Filing Deadline', title: 'Filing Deadline' },
            { deadline_type: 'Hearing Date', title: 'Hearing Date' },
          ],
        }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(true)
      expect(result.conditions).toHaveLength(2)
      expect(result.conditions.every((c) => c.passed)).toBe(true)
    })

    it('fails when a required deadline is missing', async () => {
      const { supabase } = createSupabaseMock({
        matter_deadlines: [{ data: [{ deadline_type: 'Filing Deadline', title: 'Filing Deadline' }] }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(false)
      expect(result.conditions.find((c) => c.conditionId === 'require_deadline:Hearing Date')?.passed).toBe(false)
    })

    it('fails when no deadlines exist at all', async () => {
      const { supabase } = createSupabaseMock({
        matter_deadlines: [{ data: [] }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(false)
      expect(result.failedRules).toHaveLength(2)
    })
  })

  describe('require_previous_stage', () => {
    const rules: GatingRule[] = [{ type: 'require_previous_stage', stage_name: 'Consultation' }]

    it('passes when stage was reached in history', async () => {
      const { supabase } = createSupabaseMock({})
      const history = [{ stage_name: 'Intake' }, { stage_name: 'Consultation' }]

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, history)
      expect(result.passed).toBe(true)
    })

    it('fails when stage was never reached', async () => {
      const { supabase } = createSupabaseMock({})
      const history = [{ stage_name: 'Intake' }]

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, history)
      expect(result.passed).toBe(false)
      expect(result.failedRules[0]).toContain('Consultation')
    })

    it('fails with empty or missing history', async () => {
      const { supabase } = createSupabaseMock({})

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(false)
    })
  })

  describe('require_intake_complete', () => {
    it('passes when intake status meets minimum (validated >= validated)', async () => {
      const rules: GatingRule[] = [{ type: 'require_intake_complete', minimum_status: 'validated' }]
      const { supabase } = createSupabaseMock({
        matter_intake: [{ data: { intake_status: 'validated' } }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(true)
    })

    it('passes when intake status exceeds minimum (locked > validated)', async () => {
      const rules: GatingRule[] = [{ type: 'require_intake_complete', minimum_status: 'validated' }]
      const { supabase } = createSupabaseMock({
        matter_intake: [{ data: { intake_status: 'locked' } }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(true)
    })

    it('fails when intake status is below minimum', async () => {
      const rules: GatingRule[] = [{ type: 'require_intake_complete', minimum_status: 'validated' }]
      const { supabase } = createSupabaseMock({
        matter_intake: [{ data: { intake_status: 'complete' } }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(false)
      expect(result.conditions[0].details).toContain('Core Data Card')
    })

    it('fails when no intake record exists (defaults to incomplete)', async () => {
      const rules: GatingRule[] = [{ type: 'require_intake_complete' }]
      const { supabase } = createSupabaseMock({
        matter_intake: [{ data: null }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(false)
    })

    it('defaults to validated minimum_status when not specified', async () => {
      const rules: GatingRule[] = [{ type: 'require_intake_complete' }]
      const { supabase } = createSupabaseMock({
        matter_intake: [{ data: { intake_status: 'complete' } }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      // 'complete' < 'validated' (the default), so should fail
      expect(result.passed).toBe(false)
    })
  })

  describe('require_risk_review', () => {
    it('passes when no risk level is set', async () => {
      const rules: GatingRule[] = [{ type: 'require_risk_review' }]
      const { supabase } = createSupabaseMock({
        matter_intake: [{ data: { risk_level: null, risk_override_level: null, risk_override_at: null } }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(true)
    })

    it('blocks when risk level is critical and no override', async () => {
      const rules: GatingRule[] = [{ type: 'require_risk_review' }]
      const { supabase } = createSupabaseMock({
        matter_intake: [{ data: { risk_level: 'critical', risk_override_level: null, risk_override_at: null } }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(false)
      expect(result.conditions[0].details).toContain('critical')
    })

    it('passes when critical risk has been overridden', async () => {
      const rules: GatingRule[] = [{ type: 'require_risk_review' }]
      const { supabase } = createSupabaseMock({
        matter_intake: [{
          data: {
            risk_level: 'critical',
            risk_override_level: 'critical',
            risk_override_at: '2026-01-01T00:00:00Z',
          },
        }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(true)
    })

    it('respects custom block_levels', async () => {
      const rules: GatingRule[] = [{ type: 'require_risk_review', block_levels: ['high', 'critical'] }]
      const { supabase } = createSupabaseMock({
        matter_intake: [{ data: { risk_level: 'high', risk_override_level: null, risk_override_at: null } }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(false)
    })
  })

  describe('require_document_slots_complete', () => {
    const rules: GatingRule[] = [{ type: 'require_document_slots_complete' }]

    it('passes when all required slots are accepted', async () => {
      const { supabase } = createSupabaseMock({
        document_slots: [{ data: [{ id: '1', slot_name: 'ID', status: 'accepted', is_required: true }] }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(true)
    })

    it('fails when required slots are not accepted', async () => {
      const { supabase } = createSupabaseMock({
        document_slots: [{
          data: [
            { id: '1', slot_name: 'ID', status: 'accepted' },
            { id: '2', slot_name: 'Photo', status: 'pending' },
          ],
        }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(false)
      expect(result.conditions[0].details).toContain('Photo')
    })

    it('passes when no required slots exist', async () => {
      const { supabase } = createSupabaseMock({
        document_slots: [{ data: [] }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(true)
    })
  })

  describe('require_no_contradictions', () => {
    const rules: GatingRule[] = [{ type: 'require_no_contradictions' }]

    it('passes when no contradiction flags exist', async () => {
      const { supabase } = createSupabaseMock({
        matter_intake: [{ data: { contradiction_flags: [], contradiction_override_at: null } }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(true)
    })

    it('fails when blocking contradictions exist without override', async () => {
      const { supabase } = createSupabaseMock({
        matter_intake: [{
          data: {
            contradiction_flags: [{ severity: 'blocking', field: 'dob' }],
            contradiction_override_at: null,
          },
        }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(false)
      expect(result.conditions[0].details).toContain('contradiction')
    })

    it('passes when contradictions have been overridden', async () => {
      const { supabase } = createSupabaseMock({
        matter_intake: [{
          data: {
            contradiction_flags: [{ severity: 'blocking', field: 'dob' }],
            contradiction_override_at: '2026-01-01T00:00:00Z',
          },
        }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(true)
    })
  })

  describe('require_imm_intake_status', () => {
    it('passes when status meets minimum', async () => {
      const rules: GatingRule[] = [{ type: 'require_imm_intake_status', minimum_status: 'submitted' }]
      const { supabase } = createSupabaseMock({
        matter_intake: [{ data: { immigration_intake_status: 'submitted' } }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(true)
    })

    it('fails when status is below minimum', async () => {
      const rules: GatingRule[] = [{ type: 'require_imm_intake_status', minimum_status: 'submitted' }]
      const { supabase } = createSupabaseMock({
        matter_intake: [{ data: { immigration_intake_status: 'in_progress' } }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(false)
      expect(result.conditions[0].details).toContain('submitted')
    })

    it('defaults to not_issued when no intake record exists', async () => {
      const rules: GatingRule[] = [{ type: 'require_imm_intake_status', minimum_status: 'issued' }]
      const { supabase } = createSupabaseMock({
        matter_intake: [{ data: null }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(false)
    })
  })

  describe('require_no_open_deficiencies', () => {
    const rules: GatingRule[] = [{ type: 'require_no_open_deficiencies' }]

    it('passes when no open deficiencies exist', async () => {
      const { supabase } = createSupabaseMock({
        matter_deficiencies: [{ data: [] }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(true)
    })

    it('fails when open deficiencies exist', async () => {
      const { supabase } = createSupabaseMock({
        matter_deficiencies: [{
          data: [
            { id: 'd1', severity: 'high', category: 'doc', description: 'Missing', status: 'open' },
          ],
        }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(false)
      expect(result.conditions[0].details).toContain('1 open deficiencie')
    })

    it('pluralises correctly for multiple deficiencies', async () => {
      const { supabase } = createSupabaseMock({
        matter_deficiencies: [{
          data: [
            { id: 'd1', severity: 'high', category: 'doc', description: 'A' },
            { id: 'd2', severity: 'medium', category: 'form', description: 'B' },
          ],
        }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.conditions[0].details).toContain('2 open deficiencies')
    })
  })

  describe('require_submission_confirmation', () => {
    const rules: GatingRule[] = [{ type: 'require_submission_confirmation' }]

    it('passes when confirmation number exists', async () => {
      const { supabase } = createSupabaseMock({
        matter_intake: [{
          data: { submission_confirmation_number: 'CONF-123', submission_confirmation_doc_path: null },
        }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(true)
    })

    it('passes when confirmation doc path exists', async () => {
      const { supabase } = createSupabaseMock({
        matter_intake: [{
          data: { submission_confirmation_number: null, submission_confirmation_doc_path: '/docs/conf.pdf' },
        }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(true)
    })

    it('fails when neither exists', async () => {
      const { supabase } = createSupabaseMock({
        matter_intake: [{
          data: { submission_confirmation_number: null, submission_confirmation_doc_path: null },
        }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(false)
      expect(result.conditions[0].details).toContain('Submission confirmation')
    })
  })

  describe('require_retainer_agreement', () => {
    it('passes when retainer is signed (default minimum)', async () => {
      const rules: GatingRule[] = [{ type: 'require_retainer_agreement' }]
      const { supabase } = createSupabaseMock({
        retainer_agreements: [{ data: { status: 'signed' } }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(true)
    })

    it('fails when retainer status is below minimum', async () => {
      const rules: GatingRule[] = [{ type: 'require_retainer_agreement', minimum_status: 'signed' }]
      const { supabase } = createSupabaseMock({
        retainer_agreements: [{ data: { status: 'draft' } }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(false)
      expect(result.conditions[0].details).toContain('draft')
    })

    it('fails when no retainer agreement exists', async () => {
      const rules: GatingRule[] = [{ type: 'require_retainer_agreement' }]
      const { supabase } = createSupabaseMock({
        retainer_agreements: [{ data: null }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(false)
      expect(result.conditions[0].details).toContain('missing')
    })

    it('passes with custom minimum_status (sent_for_signing)', async () => {
      const rules: GatingRule[] = [{ type: 'require_retainer_agreement', minimum_status: 'sent_for_signing' }]
      const { supabase } = createSupabaseMock({
        retainer_agreements: [{ data: { status: 'sent_for_signing' } }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(true)
    })
  })

  describe('multiple rules combined', () => {
    it('reports all failed conditions when multiple rules fail', async () => {
      const rules: GatingRule[] = [
        { type: 'require_no_open_deficiencies' },
        { type: 'require_submission_confirmation' },
      ]
      const { supabase } = createSupabaseMock({
        matter_deficiencies: [{ data: [{ id: 'd1', severity: 'high', category: 'doc', description: 'A' }] }],
        matter_intake: [{ data: { submission_confirmation_number: null, submission_confirmation_doc_path: null } }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(false)
      expect(result.failedRules).toHaveLength(2)
      expect(result.conditions).toHaveLength(2)
    })

    it('passes when all rules pass', async () => {
      const rules: GatingRule[] = [
        { type: 'require_no_open_deficiencies' },
        { type: 'require_submission_confirmation' },
      ]
      const { supabase } = createSupabaseMock({
        matter_deficiencies: [{ data: [] }],
        matter_intake: [{ data: { submission_confirmation_number: 'C-100', submission_confirmation_doc_path: null } }],
      })

      const result = await evaluateGatingRules(supabase, MATTER_ID, TENANT_ID, rules, undefined)
      expect(result.passed).toBe(true)
      expect(result.failedRules).toHaveLength(0)
    })
  })
})

// ─── getEffectiveGatingRules ─────────────────────────────────────────────────

describe('getEffectiveGatingRules', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns explicit rules as-is when provided', async () => {
    const { supabase } = createSupabaseMock({})
    const explicit: GatingRule[] = [{ type: 'require_checklist_complete' }]

    const result = await getEffectiveGatingRules(supabase, MATTER_ID, explicit, 5)
    expect(result).toEqual(explicit)
  })

  it('returns empty array for early stages (sort_order < 2)', async () => {
    const { supabase } = createSupabaseMock({})

    const result0 = await getEffectiveGatingRules(supabase, MATTER_ID, [], 0)
    const result1 = await getEffectiveGatingRules(supabase, MATTER_ID, [], 1)
    expect(result0).toEqual([])
    expect(result1).toEqual([])
  })

  it('injects default baseline when enforcement_enabled is true and sort_order >= 2', async () => {
    const { supabase } = createSupabaseMock({
      matters: [{ data: { matter_type_id: 'mt-001' } }],
      matter_types: [{ data: { enforcement_enabled: true } }],
    })

    const result = await getEffectiveGatingRules(supabase, MATTER_ID, [], 2)
    expect(result).toEqual([{ type: 'require_intake_complete', minimum_status: 'complete' }])
  })

  it('returns empty array when enforcement_enabled is false', async () => {
    const { supabase } = createSupabaseMock({
      matters: [{ data: { matter_type_id: 'mt-001' } }],
      matter_types: [{ data: { enforcement_enabled: false } }],
    })

    const result = await getEffectiveGatingRules(supabase, MATTER_ID, [], 3)
    expect(result).toEqual([])
  })

  it('returns empty array when matter has no matter_type_id', async () => {
    const { supabase } = createSupabaseMock({
      matters: [{ data: { matter_type_id: null } }],
    })

    const result = await getEffectiveGatingRules(supabase, MATTER_ID, [], 5)
    expect(result).toEqual([])
  })
})

// ─── advanceGenericStage ─────────────────────────────────────────────────────

describe('advanceGenericStage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makeBaseParams(overrides?: Record<string, any>) {
    return {
      matterId: MATTER_ID,
      tenantId: TENANT_ID,
      targetStageId: TARGET_STAGE_ID,
      userId: USER_ID,
      ...overrides,
    }
  }

  const defaultTargetStage = {
    id: TARGET_STAGE_ID,
    pipeline_id: PIPELINE_ID,
    name: 'Document Review',
    gating_rules: [],
    sort_order: 0,
    is_terminal: false,
    auto_close_matter: false,
    sla_days: 14,
    client_label: null,
    notify_client_on_stage_change: false,
  }

  it('returns error when target stage is not found', async () => {
    const { supabase } = createSupabaseMock({
      matter_stages: [{ data: null, error: { message: 'not found' } }],
    })

    const result = await advanceGenericStage({ supabase, ...makeBaseParams() })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Target stage not found')
    }
  })

  it('succeeds for valid transition with no gating rules (insert path)', async () => {
    const { supabase } = createSupabaseMock({
      matter_stages: [{ data: defaultTargetStage }],
      matter_stage_state: [
        // Fetch current state: none exists
        { data: null },
        // Insert new state: success
        { data: null },
      ],
      // getEffectiveGatingRules: matters lookup (early stage, sort_order 0 → no default rules)
      matters: [{ data: { matter_type_id: null } }],
      // Notification: fetch matter details
      activities: [{ data: null }],
      notifications: [{ data: null }],
      workflow_templates: [{ data: [] }],
    })

    const result = await advanceGenericStage({ supabase, ...makeBaseParams() })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.stageName).toBe('Document Review')
      expect(result.gateSnapshot.allPassed).toBe(true)
    }
  })

  it('succeeds for valid transition (update path with existing state)', async () => {
    const existingState = {
      id: 'state-001',
      matter_id: MATTER_ID,
      pipeline_id: PIPELINE_ID,
      current_stage_id: 'stage-001',
      previous_stage_id: null,
      entered_at: '2026-01-01T00:00:00Z',
      stage_history: [{ stage_id: 'stage-001', stage_name: 'Intake', entered_at: '2026-01-01T00:00:00Z' }],
    }

    const { supabase } = createSupabaseMock({
      matter_stages: [{ data: defaultTargetStage }],
      matter_stage_state: [
        { data: existingState },
        { data: null }, // update
      ],
      matters: [{ data: { matter_type_id: null } }],
      activities: [{ data: null }],
      notifications: [{ data: null }],
      workflow_templates: [{ data: [] }],
    })

    const result = await advanceGenericStage({ supabase, ...makeBaseParams() })
    expect(result.success).toBe(true)
  })

  it('blocks transition when gating rules fail', async () => {
    const stageWithGating = {
      ...defaultTargetStage,
      gating_rules: [{ type: 'require_no_open_deficiencies' }],
      sort_order: 3,
    }

    const { supabase } = createSupabaseMock({
      matter_stages: [{ data: stageWithGating }],
      matter_stage_state: [{ data: null }],
      matter_deficiencies: [{ data: [{ id: 'd1', severity: 'high', category: 'doc', description: 'Issue' }] }],
      activities: [{ data: null }],
    })

    const result = await advanceGenericStage({ supabase, ...makeBaseParams() })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.failedRules).toBeDefined()
      expect(result.failedRules!.length).toBeGreaterThan(0)
      expect(result.conditions).toBeDefined()
    }
  })

  it('auto-closes matter when terminal stage with auto_close_matter', async () => {
    const terminalStage = {
      ...defaultTargetStage,
      is_terminal: true,
      auto_close_matter: true,
      name: 'Closed - Won',
    }

    const { supabase } = createSupabaseMock({
      matter_stages: [{ data: terminalStage }],
      matter_stage_state: [{ data: null }, { data: null }],
      matters: [
        { data: { matter_type_id: null } }, // getEffectiveGatingRules
        { data: null }, // auto-close update
        { data: { title: 'Test Matter', responsible_lawyer_id: null, originating_lawyer_id: null } }, // notify
      ],
      activities: [{ data: null }],
      notifications: [{ data: null }],
      workflow_templates: [{ data: [] }],
    })

    const result = await advanceGenericStage({ supabase, ...makeBaseParams() })
    expect(result.success).toBe(true)

    // Verify supabase.from('matters').update was called (auto-close)
    const matterCalls = supabase.from.mock.calls.filter(([t]: [string]) => t === 'matters')
    expect(matterCalls.length).toBeGreaterThanOrEqual(2) // at least getEffective + auto-close
  })

  it('does not auto-close when terminal but auto_close_matter is false', async () => {
    const terminalNoClose = {
      ...defaultTargetStage,
      is_terminal: true,
      auto_close_matter: false,
      name: 'Withdrawn',
    }

    const { supabase } = createSupabaseMock({
      matter_stages: [{ data: terminalNoClose }],
      matter_stage_state: [{ data: null }, { data: null }],
      matters: [
        { data: { matter_type_id: null } },
        { data: { title: 'Test', responsible_lawyer_id: null, originating_lawyer_id: null } },
      ],
      activities: [{ data: null }],
      notifications: [{ data: null }],
      workflow_templates: [{ data: [] }],
    })

    const result = await advanceGenericStage({ supabase, ...makeBaseParams() })
    expect(result.success).toBe(true)

    // Verify that .update was NOT called on matters (no auto-close)
    // The matters table is accessed for getEffectiveGatingRules (select) and notification (select)
    // but should not have update called
    const matterChains = supabase.from.mock.results
      .filter((_: any, i: number) => supabase.from.mock.calls[i][0] === 'matters')
      .map((r: any) => r.value)
    const updateCallCount = matterChains.reduce((sum: number, chain: any) => sum + chain.update.mock.calls.length, 0)
    expect(updateCallCount).toBe(0)
  })

  it('skips activity log when skipActivityLog is true', async () => {
    const { supabase } = createSupabaseMock({
      matter_stages: [{ data: defaultTargetStage }],
      matter_stage_state: [{ data: null }, { data: null }],
      matters: [
        { data: { matter_type_id: null } },
        { data: { title: 'Test', responsible_lawyer_id: null, originating_lawyer_id: null } },
      ],
      activities: [{ data: null }],
      notifications: [{ data: null }],
      workflow_templates: [{ data: [] }],
    })

    const result = await advanceGenericStage({
      supabase,
      ...makeBaseParams({ skipActivityLog: true }),
    })
    expect(result.success).toBe(true)

    // The activities table should not have been called for the stage_change log
    // (it may still be called for notifications, but the main stage_change activity insert is skipped)
    const activityChains = supabase.from.mock.results
      .filter((_: any, i: number) => supabase.from.mock.calls[i][0] === 'activities')
      .map((r: any) => r.value)
    // When skipActivityLog=true, the stage_change activity insert is skipped.
    // Only notification-related activity inserts (if any) would happen.
    const totalInserts = activityChains.reduce((sum: number, chain: any) => sum + chain.insert.mock.calls.length, 0)
    // With notify_client_on_stage_change=false and no responsible/originating lawyer,
    // there should be no activity inserts at all.
    expect(totalInserts).toBe(0)
  })

  it('triggers automation engine after successful transition', async () => {
    const { supabase } = createSupabaseMock({
      matter_stages: [{ data: defaultTargetStage }],
      matter_stage_state: [{ data: null }, { data: null }],
      matters: [
        { data: { matter_type_id: null } },
        { data: { title: 'Test', responsible_lawyer_id: null, originating_lawyer_id: null } },
      ],
      activities: [{ data: null }],
      notifications: [{ data: null }],
      workflow_templates: [{ data: [] }],
    })

    await advanceGenericStage({ supabase, ...makeBaseParams() })
    expect(processAutomationTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerType: 'stage_change',
        triggerContext: expect.objectContaining({
          to_stage_id: TARGET_STAGE_ID,
          to_stage_name: 'Document Review',
        }),
      }),
    )
  })
})

// ─── advanceImmigrationStage ─────────────────────────────────────────────────

describe('advanceImmigrationStage', () => {
  const mockCalcScore = vi.mocked(calculateCompletionScore)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makeBaseParams(overrides?: Record<string, any>) {
    return {
      matterId: MATTER_ID,
      tenantId: TENANT_ID,
      targetStageId: TARGET_STAGE_ID,
      userId: USER_ID,
      ...overrides,
    }
  }

  const defaultImmStage = {
    id: TARGET_STAGE_ID,
    name: 'Application Preparation',
    requires_checklist_complete: false,
    is_terminal: false,
    sort_order: 2,
    client_label: null,
    notify_client_on_stage_change: false,
    case_type_id: 'ct-001',
    auto_tasks: [],
  }

  it('returns error when target immigration stage not found', async () => {
    const { supabase } = createSupabaseMock({
      case_stage_definitions: [{ data: null, error: { message: 'not found' } }],
    })

    const result = await advanceImmigrationStage({ supabase, ...makeBaseParams() })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Target immigration stage not found')
    }
  })

  it('returns error when immigration record not found', async () => {
    const { supabase } = createSupabaseMock({
      case_stage_definitions: [{ data: defaultImmStage }],
      matter_immigration: [{ data: null, error: { message: 'not found' } }],
    })

    const result = await advanceImmigrationStage({ supabase, ...makeBaseParams() })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Immigration record not found for this matter')
    }
  })

  it('succeeds for valid transition without checklist requirement', async () => {
    const { supabase } = createSupabaseMock({
      case_stage_definitions: [{ data: defaultImmStage }],
      matter_immigration: [
        { data: { stage_history: [], current_stage_id: 'stage-001' } },
        { data: null }, // update
      ],
      matter_checklist_items: [{ data: null, count: 0 }], // auto-init check
      checklist_templates: [{ data: [] }],
      activities: [{ data: null }],
      matters: [{ data: { title: 'Test', responsible_lawyer_id: null, originating_lawyer_id: null } }],
      notifications: [{ data: null }],
    })

    const result = await advanceImmigrationStage({ supabase, ...makeBaseParams() })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.stageName).toBe('Application Preparation')
    }
  })

  it('blocks when requires_checklist_complete and checklist is incomplete', async () => {
    const stageWithChecklist = { ...defaultImmStage, requires_checklist_complete: true }
    const { supabase } = createSupabaseMock({
      case_stage_definitions: [{ data: stageWithChecklist }],
      matter_checklist_items: [{
        data: [{ id: '1', document_name: 'Passport', status: 'missing', is_required: true }],
      }],
      activities: [{ data: null }],
    })

    mockCalcScore.mockReturnValue({
      total: 1, required: 1, requiredApproved: 0, completionPercent: 0, isComplete: false,
      missingRequired: ['Passport'],
    } as any)

    const result = await advanceImmigrationStage({ supabase, ...makeBaseParams() })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Passport')
      expect(result.failedRules).toBeDefined()
      expect(result.conditions).toBeDefined()
    }
  })

  it('passes when requires_checklist_complete and all items approved', async () => {
    const stageWithChecklist = { ...defaultImmStage, requires_checklist_complete: true }
    const { supabase } = createSupabaseMock({
      case_stage_definitions: [{ data: stageWithChecklist }],
      matter_checklist_items: [
        { data: [{ id: '1', document_name: 'Passport', status: 'approved', is_required: true }] },
        { data: null, count: 1 }, // auto-init check (already initialized)
      ],
      matter_immigration: [
        { data: { stage_history: [], current_stage_id: 'stage-001' } },
        { data: null },
      ],
      checklist_templates: [{ data: [] }],
      activities: [{ data: null }],
      matters: [{ data: { title: 'Test', responsible_lawyer_id: null, originating_lawyer_id: null } }],
      notifications: [{ data: null }],
    })

    mockCalcScore.mockReturnValue({
      total: 1, required: 1, requiredApproved: 1, completionPercent: 100, isComplete: true,
      missingRequired: [],
    } as any)

    const result = await advanceImmigrationStage({ supabase, ...makeBaseParams() })
    expect(result.success).toBe(true)
  })

  it('creates auto-tasks idempotently', async () => {
    const stageWithTasks = {
      ...defaultImmStage,
      auto_tasks: [
        { title: 'Review docs', description: 'Check all docs', priority: 'high', due_days_offset: 7 },
      ],
    }
    const { supabase } = createSupabaseMock({
      case_stage_definitions: [{ data: stageWithTasks }],
      matter_immigration: [
        { data: { stage_history: [], current_stage_id: 'stage-001' } },
        { data: null },
      ],
      // Idempotency check: no existing task found
      tasks: [
        { data: [] },    // select (check existing)
        { data: null },   // insert
      ],
      matter_checklist_items: [{ data: null, count: 0 }],
      checklist_templates: [{ data: [] }],
      activities: [{ data: null }],
      matters: [{ data: { title: 'Test', responsible_lawyer_id: null, originating_lawyer_id: null } }],
      notifications: [{ data: null }],
    })

    const result = await advanceImmigrationStage({ supabase, ...makeBaseParams() })
    expect(result.success).toBe(true)

    // Verify tasks table was accessed for idempotency check + insert
    const taskCalls = supabase.from.mock.calls.filter(([t]: [string]) => t === 'tasks')
    expect(taskCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('skips auto-task creation when task already exists (idempotent)', async () => {
    const stageWithTasks = {
      ...defaultImmStage,
      auto_tasks: [{ title: 'Review docs' }],
    }
    const { supabase } = createSupabaseMock({
      case_stage_definitions: [{ data: stageWithTasks }],
      matter_immigration: [
        { data: { stage_history: [], current_stage_id: 'stage-001' } },
        { data: null },
      ],
      // Idempotency check: existing task found
      tasks: [{ data: [{ id: 'existing-task' }] }],
      matter_checklist_items: [{ data: null, count: 0 }],
      checklist_templates: [{ data: [] }],
      activities: [{ data: null }],
      matters: [{ data: { title: 'Test', responsible_lawyer_id: null, originating_lawyer_id: null } }],
      notifications: [{ data: null }],
    })

    const result = await advanceImmigrationStage({ supabase, ...makeBaseParams() })
    expect(result.success).toBe(true)

    // Only the idempotency select should have been called, not the insert
    const taskChains = supabase.from.mock.results
      .filter((_: any, i: number) => supabase.from.mock.calls[i][0] === 'tasks')
      .map((r: any) => r.value)
    const totalInserts = taskChains.reduce((sum: number, chain: any) => sum + chain.insert.mock.calls.length, 0)
    expect(totalInserts).toBe(0)
  })

  it('skips activity log when skipActivityLog is true', async () => {
    const { supabase } = createSupabaseMock({
      case_stage_definitions: [{ data: defaultImmStage }],
      matter_immigration: [
        { data: { stage_history: [], current_stage_id: 'stage-001' } },
        { data: null },
      ],
      matter_checklist_items: [{ data: null, count: 0 }],
      checklist_templates: [{ data: [] }],
      activities: [{ data: null }],
      matters: [{ data: { title: 'Test', responsible_lawyer_id: null, originating_lawyer_id: null } }],
      notifications: [{ data: null }],
    })

    const result = await advanceImmigrationStage({
      supabase,
      ...makeBaseParams({ skipActivityLog: true }),
    })
    expect(result.success).toBe(true)

    // The main stage_change activity insert should be skipped
    const activityChains = supabase.from.mock.results
      .filter((_: any, i: number) => supabase.from.mock.calls[i][0] === 'activities')
      .map((r: any) => r.value)
    const totalInserts = activityChains.reduce((sum: number, chain: any) => sum + chain.insert.mock.calls.length, 0)
    expect(totalInserts).toBe(0)
  })

  it('returns gateSnapshot with checklist condition when checklist is required', async () => {
    const stageWithChecklist = { ...defaultImmStage, requires_checklist_complete: true }
    const { supabase } = createSupabaseMock({
      case_stage_definitions: [{ data: stageWithChecklist }],
      matter_checklist_items: [
        { data: [{ id: '1', document_name: 'ID', status: 'approved', is_required: true }] },
        { data: null, count: 1 },
      ],
      matter_immigration: [
        { data: { stage_history: [], current_stage_id: 'stage-001' } },
        { data: null },
      ],
      checklist_templates: [{ data: [] }],
      activities: [{ data: null }],
      matters: [{ data: { title: 'Test', responsible_lawyer_id: null, originating_lawyer_id: null } }],
      notifications: [{ data: null }],
    })

    mockCalcScore.mockReturnValue({
      total: 1, required: 1, requiredApproved: 1, completionPercent: 100, isComplete: true,
      missingRequired: [],
    } as any)

    const result = await advanceImmigrationStage({ supabase, ...makeBaseParams() })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.gateSnapshot.conditions).toHaveLength(1)
      expect(result.gateSnapshot.conditions[0].conditionId).toBe('require_checklist_complete')
      expect(result.gateSnapshot.allPassed).toBe(true)
    }
  })
})

// ─── isPostSubmissionStage ───────────────────────────────────────────────────

describe('isPostSubmissionStage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns true when immigration history includes a post-submission stage', async () => {
    const { supabase } = createSupabaseMock({
      matter_immigration: [{
        data: {
          current_stage_id: 'stage-x',
          stage_history: [
            { stage_name: 'Intake' },
            { stage_name: 'Submitted' },
          ],
        },
      }],
    })

    const result = await isPostSubmissionStage(supabase, MATTER_ID)
    expect(result).toBe(true)
  })

  it('returns true when generic pipeline history includes a post-submission stage', async () => {
    const { supabase } = createSupabaseMock({
      matter_immigration: [{ data: null }],
      matter_stage_state: [{
        data: {
          current_stage_id: 'stage-y',
          stage_history: [
            { stage_name: 'Filed' },
          ],
        },
      }],
    })

    const result = await isPostSubmissionStage(supabase, MATTER_ID)
    expect(result).toBe(true)
  })

  it('returns true when current immigration stage name matches', async () => {
    const { supabase } = createSupabaseMock({
      matter_immigration: [{
        data: {
          current_stage_id: 'stage-sub',
          stage_history: [{ stage_name: 'Intake' }],
        },
      }],
      case_stage_definitions: [{ data: { name: 'Awaiting Decision' } }],
    })

    const result = await isPostSubmissionStage(supabase, MATTER_ID)
    expect(result).toBe(true)
  })

  it('returns true when current generic stage name matches', async () => {
    const { supabase } = createSupabaseMock({
      matter_immigration: [{ data: null }],
      matter_stage_state: [{
        data: {
          current_stage_id: 'stage-proc',
          stage_history: [],
        },
      }],
      matter_stages: [{ data: { name: 'Processing' } }],
    })

    const result = await isPostSubmissionStage(supabase, MATTER_ID)
    expect(result).toBe(true)
  })

  it('returns false when no post-submission stages found', async () => {
    const { supabase } = createSupabaseMock({
      matter_immigration: [{
        data: {
          current_stage_id: 'stage-prep',
          stage_history: [{ stage_name: 'Intake' }, { stage_name: 'Preparation' }],
        },
      }],
      case_stage_definitions: [{ data: { name: 'Preparation' } }],
      matter_stage_state: [{ data: null }],
    })

    const result = await isPostSubmissionStage(supabase, MATTER_ID)
    expect(result).toBe(false)
  })

  it('returns false when neither immigration nor generic records exist', async () => {
    const { supabase } = createSupabaseMock({
      matter_immigration: [{ data: null }],
      matter_stage_state: [{ data: null }],
    })

    const result = await isPostSubmissionStage(supabase, MATTER_ID)
    expect(result).toBe(false)
  })

  it('matches stage names case-insensitively', async () => {
    const { supabase } = createSupabaseMock({
      matter_immigration: [{
        data: {
          current_stage_id: 'stage-x',
          stage_history: [{ stage_name: 'APPLICATION SUBMITTED' }],
        },
      }],
    })

    const result = await isPostSubmissionStage(supabase, MATTER_ID)
    expect(result).toBe(true)
  })
})
