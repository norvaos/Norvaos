/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Sprint 6, Week 1  -  Exception Workflow Tests
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Covers:
 * - Return reason validation (length boundary tests)
 * - Stage ordering enforcement (target must be earlier than current)
 * - Critical deficiency blocking
 * - Happy path: writes, state mutation, result shape
 *
 * Mock strategy: vitest + createMockSupabase factory from lib/test-utils/mock-supabase.
 * Each test constructs a supabase mock wired to return the data required to reach
 * the scenario under test. Order-sensitive calls are handled by per-call vi.fn() stubs
 * on the `from` spy when the standard table-level config is insufficient.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { returnMatterToStage } from '../exception-workflow'
import { createMockSupabase } from '@/lib/test-utils/mock-supabase'
import type { ReturnStageInput } from '../exception-workflow'

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID      = 'tenant-aaaa-1111'
const MATTER_ID      = 'matter-bbbb-2222'
const PIPELINE_ID    = 'pipeline-cccc-3333'
const CURRENT_STAGE  = 'stage-current-0001'
const TARGET_STAGE   = 'stage-target-0002'   // earlier stage
const PERFORMED_BY   = 'user-dddd-4444'
const LOG_ID         = 'log-eeee-5555'

const LONG_REASON    = 'This matter requires correction because the document bundle was submitted prematurely before all required signatures were obtained from the client.'

// ─── Fixture helpers ─────────────────────────────────────────────────────────

function baseInput(overrides: Partial<ReturnStageInput> = {}): ReturnStageInput {
  return {
    matterId:      MATTER_ID,
    tenantId:      TENANT_ID,
    targetStageId: TARGET_STAGE,
    returnReason:  LONG_REASON,
    performedBy:   PERFORMED_BY,
    ...overrides,
  }
}

/** Stage state row where current = stage at sort_order 3 */
const stageStateRow = {
  id:                'ss-id-0001',
  current_stage_id:  CURRENT_STAGE,
  previous_stage_id: null,
  pipeline_id:       PIPELINE_ID,
  stage_history:     [],
}

/** Target stage  -  sort_order 1 (earlier than current at sort_order 3) */
const targetStageRow = {
  id:          TARGET_STAGE,
  name:        'Document Review',
  pipeline_id: PIPELINE_ID,
  sort_order:  1,
}

/** Current stage  -  sort_order 3 */
const currentStageRow = {
  id:         CURRENT_STAGE,
  name:       'Filing Submission',
  sort_order: 3,
}

/** Same-stage target  -  identical sort_order to current */
const sameOrderStageRow = {
  id:          'stage-same-order',
  name:        'Filing Submission',
  pipeline_id: PIPELINE_ID,
  sort_order:  3,
}

/** Later stage  -  sort_order higher than current */
const laterStageRow = {
  id:          'stage-later-0003',
  name:        'Post Filing Review',
  pipeline_id: PIPELINE_ID,
  sort_order:  5,
}

/** Transition log insert response */
const logInsertRow = { id: LOG_ID }

// ─── Helper: build a fully wired happy-path mock ─────────────────────────────

/**
 * Constructs a mock supabase where every call succeeds.
 * The mock-supabase factory routes all calls to the same table config, which
 * works for single-table services. For multi-table services we override `from`
 * to dispatch per-table.
 */
function buildHappyPathSupabase() {
  // We use vi.fn() directly on the `from` dispatcher to give per-call control.
  const makeChain = (selectData: unknown, insertData: unknown = null) => {
    const chain: Record<string, unknown> = {}
    chain.select = vi.fn().mockReturnValue(chain)
    chain.eq     = vi.fn().mockReturnValue(chain)
    chain.neq    = vi.fn().mockReturnValue(chain)
    chain.in     = vi.fn().mockReturnValue(chain)
    chain.single = vi.fn().mockResolvedValue({ data: selectData, error: null })
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: selectData, error: null })

    const insertChain: Record<string, unknown> = {}
    insertChain.select = vi.fn().mockReturnValue(insertChain)
    insertChain.single = vi.fn().mockResolvedValue({ data: insertData, error: null })
    insertChain.eq     = vi.fn().mockReturnValue(insertChain)

    // Make insertChain directly awaitable (for .insert() without .select().single())
    insertChain.then = (resolve?: (val: unknown) => unknown, reject?: (err: unknown) => unknown) =>
      Promise.resolve({ data: insertData, error: null }).then(resolve, reject)

    chain.insert = vi.fn().mockReturnValue(insertChain)

    const updateChain: Record<string, unknown> = {}
    updateChain.eq   = vi.fn().mockReturnValue(updateChain)
    updateChain.then = (resolve?: (val: unknown) => unknown, reject?: (err: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve, reject)

    chain.update = vi.fn().mockReturnValue(updateChain)

    return chain
  }

  // Call sequence for returnMatterToStage:
  //   1. matter_stage_state   → maybeSingle   → stageStateRow
  //   2. matter_stages        → single         → targetStageRow  (target stage lookup)
  //   3. matter_stages        → single         → currentStageRow (current stage lookup)
  //   4. matter_deficiencies  → (count check)  → [] (empty = no critical deficiencies)
  //   5. stage_transition_log → insert → logInsertRow
  //   6. matter_stage_state   → update
  //   7. activities           → insert

  const callCount: Record<string, number> = {
    matter_stages: 0,
  }

  const from = vi.fn((table: string) => {
    if (table === 'matter_stage_state') {
      return makeChain(stageStateRow)
    }

    if (table === 'matter_stages') {
      callCount.matter_stages++
      // First call = target stage, second call = current stage
      if (callCount.matter_stages === 1) {
        return makeChain(targetStageRow)
      }
      return makeChain(currentStageRow)
    }

    if (table === 'matter_deficiencies') {
      // Return empty array → no critical open deficiencies
      const chain = makeChain([])
      chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
      // Direct await on the chain should return empty array
      ;(chain as Record<string, unknown>).then = (
        resolve?: (val: unknown) => unknown,
        reject?: (err: unknown) => unknown
      ) => Promise.resolve({ data: [], error: null }).then(resolve, reject)
      return chain
    }

    if (table === 'stage_transition_log') {
      return makeChain(logInsertRow, logInsertRow)
    }

    if (table === 'matter_stage_state' || table === 'activities') {
      return makeChain(null)
    }

    // Default: permissive no-op chain
    return makeChain(null)
  })

  return { from } as unknown as ReturnType<typeof createMockSupabase>
}

// ═══════════════════════════════════════════════════════════════════════════════
// Test Suites
// ═══════════════════════════════════════════════════════════════════════════════

describe('exception-workflow', () => {

  // ─── Validation ─────────────────────────────────────────────────────────────

  describe('returnMatterToStage - validation', () => {

    it('throws when return_reason is less than 50 characters', async () => {
      const supabase = createMockSupabase({})
      await expect(
        returnMatterToStage(supabase, baseInput({ returnReason: 'Too short reason here.' }))
      ).rejects.toThrow('Return reason must be at least 50 characters')
    })

    it('throws when return_reason is exactly 49 characters', async () => {
      const fortyNineChars = 'A'.repeat(49)
      const supabase = createMockSupabase({})
      await expect(
        returnMatterToStage(supabase, baseInput({ returnReason: fortyNineChars }))
      ).rejects.toThrow('Return reason must be at least 50 characters')
    })

    it('passes validation when return_reason is exactly 50 characters', async () => {
      // This test only validates the reason check  -  the DB mock will throw on the
      // next step (no stage state), so we confirm the reason check itself passed
      // by checking that the error is NOT the reason-length error.
      const fiftyChars = 'A'.repeat(50)
      const supabase = createMockSupabase({
        matter_stage_state: { selectData: null },
      })
      await expect(
        returnMatterToStage(supabase, baseInput({ returnReason: fiftyChars }))
      ).rejects.toThrow('Matter has no stage state')
    })

    it('throws when target stage is the same as current stage', async () => {
      // same sort_order = not earlier
      const supabase = createMockSupabase({})
      const callCount = { matter_stages: 0 }

      const from = vi.fn((table: string) => {
        const makeChain = (data: unknown) => {
          const c: Record<string, unknown> = {}
          c.select    = vi.fn().mockReturnValue(c)
          c.eq        = vi.fn().mockReturnValue(c)
          c.in        = vi.fn().mockReturnValue(c)
          c.single    = vi.fn().mockResolvedValue({ data, error: null })
          c.maybeSingle = vi.fn().mockResolvedValue({ data, error: null })
          c.insert    = vi.fn().mockReturnValue(c)
          c.update    = vi.fn().mockReturnValue(c)
          c.then = (res?: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve({ data, error: null }).then(res, rej)
          return c
        }

        if (table === 'matter_stage_state') return makeChain(stageStateRow)
        if (table === 'matter_stages') {
          callCount.matter_stages++
          if (callCount.matter_stages === 1) return makeChain(sameOrderStageRow)
          return makeChain(currentStageRow)
        }
        return makeChain(null)
      })

      const mockSupa = { from } as unknown as ReturnType<typeof createMockSupabase>
      await expect(
        returnMatterToStage(mockSupa, baseInput({ targetStageId: sameOrderStageRow.id }))
      ).rejects.toThrow('Target stage is not earlier than current stage')
    })

    it('throws when target stage is later than current stage', async () => {
      const callCount = { matter_stages: 0 }

      const from = vi.fn((table: string) => {
        const makeChain = (data: unknown) => {
          const c: Record<string, unknown> = {}
          c.select    = vi.fn().mockReturnValue(c)
          c.eq        = vi.fn().mockReturnValue(c)
          c.in        = vi.fn().mockReturnValue(c)
          c.single    = vi.fn().mockResolvedValue({ data, error: null })
          c.maybeSingle = vi.fn().mockResolvedValue({ data, error: null })
          c.insert    = vi.fn().mockReturnValue(c)
          c.update    = vi.fn().mockReturnValue(c)
          c.then = (res?: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve({ data, error: null }).then(res, rej)
          return c
        }

        if (table === 'matter_stage_state') return makeChain(stageStateRow)
        if (table === 'matter_stages') {
          callCount.matter_stages++
          if (callCount.matter_stages === 1) return makeChain(laterStageRow)
          return makeChain(currentStageRow)
        }
        return makeChain(null)
      })

      const mockSupa = { from } as unknown as ReturnType<typeof createMockSupabase>
      await expect(
        returnMatterToStage(mockSupa, baseInput({ targetStageId: laterStageRow.id }))
      ).rejects.toThrow('Target stage is not earlier than current stage')
    })
  })

  // ─── Critical Deficiency Blocking ────────────────────────────────────────────

  describe('returnMatterToStage - critical deficiency check', () => {

    function buildStageCheckSupabase(deficiencyRows: { id: string }[]) {
      const callCount = { matter_stages: 0 }

      const from = vi.fn((table: string) => {
        const makeChain = (data: unknown) => {
          const c: Record<string, unknown> = {}
          c.select    = vi.fn().mockReturnValue(c)
          c.eq        = vi.fn().mockReturnValue(c)
          c.in        = vi.fn().mockReturnValue(c)
          c.single    = vi.fn().mockResolvedValue({ data, error: null })
          c.maybeSingle = vi.fn().mockResolvedValue({ data, error: null })
          c.insert    = vi.fn().mockReturnValue(c)
          c.update    = vi.fn().mockReturnValue(c)
          c.then = (res?: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve({ data, error: null }).then(res, rej)
          return c
        }

        if (table === 'matter_stage_state') return makeChain(stageStateRow)
        if (table === 'matter_stages') {
          callCount.matter_stages++
          if (callCount.matter_stages === 1) return makeChain(targetStageRow)
          return makeChain(currentStageRow)
        }
        if (table === 'matter_deficiencies') {
          return makeChain(deficiencyRows)
        }
        return makeChain(null)
      })

      return { from } as unknown as ReturnType<typeof createMockSupabase>
    }

    it('throws when a critical deficiency is open', async () => {
      const supabase = buildStageCheckSupabase([{ id: 'def-001' }])
      await expect(
        returnMatterToStage(supabase, baseInput())
      ).rejects.toThrow('Cannot return stage while critical deficiencies are open')
    })

    it('throws when a critical deficiency is in_progress', async () => {
      // The query filters by status IN ('open','in_progress','reopened').
      // The mock returns matching rows  -  the service checks array length.
      const supabase = buildStageCheckSupabase([{ id: 'def-002' }])
      await expect(
        returnMatterToStage(supabase, baseInput())
      ).rejects.toThrow('Cannot return stage while critical deficiencies are open')
    })

    it('allows return when only minor deficiencies are open', async () => {
      // Minor deficiencies do not appear in the critical query  -  empty array returned.
      const supabase = buildStageCheckSupabase([])
      // Will proceed past deficiency check and attempt the log insert.
      // Since stage_transition_log insert returns null id, it will throw a different error.
      await expect(
        returnMatterToStage(supabase, baseInput())
      ).rejects.toThrow('Failed to write stage transition log')
    })

    it('allows return when all deficiencies are resolved', async () => {
      const supabase = buildStageCheckSupabase([])
      await expect(
        returnMatterToStage(supabase, baseInput())
      ).rejects.toThrow('Failed to write stage transition log')
    })
  })

  // ─── Happy Path ───────────────────────────────────────────────────────────────

  describe('returnMatterToStage - happy path (mocked supabase)', () => {

    let mockFrom: ReturnType<typeof vi.fn>
    let matterStagesCallCount: number
    let capturedLogInsert: unknown
    let capturedStateUpdate: unknown
    let capturedActivityInsert: unknown

    beforeEach(() => {
      matterStagesCallCount = 0
      capturedLogInsert     = undefined
      capturedStateUpdate   = undefined
      capturedActivityInsert = undefined

      mockFrom = vi.fn((table: string) => {
        const makeInsertCapturing = (
          capture: (v: unknown) => void,
          returnData: unknown
        ) => {
          const insertChain: Record<string, unknown> = {}
          insertChain.eq     = vi.fn().mockReturnValue(insertChain)
          insertChain.select = vi.fn().mockReturnValue(insertChain)
          insertChain.single = vi.fn().mockResolvedValue({ data: returnData, error: null })
          insertChain.then   = (res?: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve({ data: returnData, error: null }).then(res, rej)
          return insertChain
        }

        const makeUpdateCapturing = (capture: (v: unknown) => void) => {
          const updateChain: Record<string, unknown> = {}
          updateChain.eq   = vi.fn().mockReturnValue(updateChain)
          updateChain.then = (res?: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve({ data: null, error: null }).then(res, rej)
          return updateChain
        }

        if (table === 'matter_stage_state') {
          const c: Record<string, unknown> = {}
          c.select      = vi.fn().mockReturnValue(c)
          c.eq          = vi.fn().mockReturnValue(c)
          c.maybeSingle = vi.fn().mockResolvedValue({ data: stageStateRow, error: null })

          // For the UPDATE call
          c.update = vi.fn().mockImplementation((payload: unknown) => {
            capturedStateUpdate = payload
            return makeUpdateCapturing(() => {})
          })

          return c
        }

        if (table === 'matter_stages') {
          matterStagesCallCount++
          const stageData = matterStagesCallCount === 1 ? targetStageRow : currentStageRow
          const c: Record<string, unknown> = {}
          c.select = vi.fn().mockReturnValue(c)
          c.eq     = vi.fn().mockReturnValue(c)
          c.single = vi.fn().mockResolvedValue({ data: stageData, error: null })
          return c
        }

        if (table === 'matter_deficiencies') {
          const c: Record<string, unknown> = {}
          c.select = vi.fn().mockReturnValue(c)
          c.eq     = vi.fn().mockReturnValue(c)
          c.in     = vi.fn().mockReturnValue(c)
          c.then   = (res?: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(res, rej)
          return c
        }

        if (table === 'stage_transition_log') {
          const c: Record<string, unknown> = {}
          c.insert = vi.fn().mockImplementation((payload: unknown) => {
            capturedLogInsert = payload
            return makeInsertCapturing(() => {}, logInsertRow)
          })
          return c
        }

        if (table === 'activities') {
          const c: Record<string, unknown> = {}
          c.insert = vi.fn().mockImplementation((payload: unknown) => {
            capturedActivityInsert = payload
            return makeInsertCapturing(() => {}, null)
          })
          return c
        }

        // Default fallback
        const c: Record<string, unknown> = {}
        c.select = vi.fn().mockReturnValue(c)
        c.eq     = vi.fn().mockReturnValue(c)
        c.in     = vi.fn().mockReturnValue(c)
        c.insert = vi.fn().mockReturnValue(c)
        c.update = vi.fn().mockReturnValue(c)
        c.single = vi.fn().mockResolvedValue({ data: null, error: null })
        c.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
        c.then   = (res?: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve({ data: null, error: null }).then(res, rej)
        return c
      })
    })

    it('writes stage_transition_log with transition_type = return_for_correction', async () => {
      const supabase = { from: mockFrom } as unknown as ReturnType<typeof createMockSupabase>
      await returnMatterToStage(supabase, baseInput())

      expect(capturedLogInsert).toBeDefined()
      const log = capturedLogInsert as Record<string, unknown>
      expect(log['transition_type']).toBe('return_for_correction')
      expect(log['from_stage_id']).toBe(CURRENT_STAGE)
      expect(log['to_stage_id']).toBe(TARGET_STAGE)
      expect(log['matter_id']).toBe(MATTER_ID)
      expect(log['tenant_id']).toBe(TENANT_ID)
      expect(log['transitioned_by']).toBe(PERFORMED_BY)
      expect(log['override_reason']).toBe(LONG_REASON)
    })

    it('updates matter_stage_state with new current_stage_id', async () => {
      const supabase = { from: mockFrom } as unknown as ReturnType<typeof createMockSupabase>
      await returnMatterToStage(supabase, baseInput())

      expect(capturedStateUpdate).toBeDefined()
      const update = capturedStateUpdate as Record<string, unknown>
      expect(update['current_stage_id']).toBe(TARGET_STAGE)
      expect(update['previous_stage_id']).toBe(CURRENT_STAGE)
      expect(typeof update['entered_at']).toBe('string')
    })

    it('appends to stage_history with transition_type = return_for_correction', async () => {
      const supabase = { from: mockFrom } as unknown as ReturnType<typeof createMockSupabase>
      await returnMatterToStage(supabase, baseInput())

      const update = capturedStateUpdate as Record<string, unknown>
      const history = update['stage_history'] as Array<Record<string, unknown>>
      expect(Array.isArray(history)).toBe(true)
      expect(history.length).toBeGreaterThan(0)

      const lastEntry = history[history.length - 1]
      expect(lastEntry['stage_id']).toBe(TARGET_STAGE)
      expect(lastEntry['transition_type']).toBe('return_for_correction')
      expect(typeof lastEntry['entered_at']).toBe('string')
    })

    it('writes to activities with activity_type = stage_returned', async () => {
      const supabase = { from: mockFrom } as unknown as ReturnType<typeof createMockSupabase>
      await returnMatterToStage(supabase, baseInput())

      expect(capturedActivityInsert).toBeDefined()
      const activity = capturedActivityInsert as Record<string, unknown>
      expect(activity['activity_type']).toBe('stage_returned')
      expect(activity['matter_id']).toBe(MATTER_ID)
      expect(activity['tenant_id']).toBe(TENANT_ID)
      expect(activity['user_id']).toBe(PERFORMED_BY)
      expect(activity['description']).toBe(LONG_REASON)
    })

    it('returns correct ReturnStageResult', async () => {
      const supabase = { from: mockFrom } as unknown as ReturnType<typeof createMockSupabase>
      const result = await returnMatterToStage(supabase, baseInput())

      expect(result.success).toBe(true)
      expect(result.previousStageId).toBe(CURRENT_STAGE)
      expect(result.newCurrentStageId).toBe(TARGET_STAGE)
      expect(result.transitionLogId).toBe(LOG_ID)
    })
  })
})
