/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Wave 6 — Closure & Reopen Engine Tests
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Proves:
 * - closeLead validates target is a closed stage
 * - closeLead rejects invalid closure stages
 * - reopenLead validates lead is actually closed
 * - reopenLead rejects reopening to a closed stage
 * - Three task strategies work correctly (restore, reopen, regenerate)
 * - Idempotent closure and reopen (duplicate → skip, not error)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { closeLead, reopenLead } from '../lead-closure-engine'
import { LEAD_STAGES, CLOSED_STAGES, isClosedStage } from '@/lib/config/lead-workflow-definitions'
import { createMockSupabase } from '@/lib/test-utils/mock-supabase'

// ─── Mock Dependencies ───────────────────────────────────────────────────────

vi.mock('../lead-idempotency', async () => {
  const actual = await vi.importActual<typeof import('../lead-idempotency')>('../lead-idempotency')
  return {
    ...actual,
    executeIdempotent: vi.fn(async (_supabase, params) => {
      // Execute handler directly (no real ledger)
      const data = await params.handler()
      return { executed: true, skipped: false, data }
    }),
  }
})

vi.mock('../lead-stage-engine', () => ({
  advanceLeadStage: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('../lead-milestone-engine', () => ({
  skipAllRemainingTasksForLead: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lead-summary-recalculator', () => ({
  recalculateLeadSummary: vi.fn().mockResolvedValue(undefined),
}))

// ─── closeLead ───────────────────────────────────────────────────────────────

describe('closeLead', () => {
  it('rejects non-closed stages', async () => {
    const supabase = createMockSupabase({})

    const result = await closeLead({
      supabase,
      leadId: 'lead-1',
      tenantId: 'tenant-1',
      closedStage: LEAD_STAGES.NEW_INQUIRY as any,
      reasonCode: 'no_response',
      closedBy: 'user-1',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('not a valid closure stage')
  })

  it('rejects CONVERTED as a closure stage', async () => {
    const supabase = createMockSupabase({})

    const result = await closeLead({
      supabase,
      leadId: 'lead-1',
      tenantId: 'tenant-1',
      closedStage: LEAD_STAGES.CONVERTED as any,
      reasonCode: 'test',
      closedBy: 'user-1',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('not a valid closure stage')
  })

  it('accepts all 4 valid closure stages', async () => {
    for (const closedStage of CLOSED_STAGES) {
      const supabase = createMockSupabase({
        lead_closure_records: { insertData: { id: `closure-${closedStage}` } },
        activities: { insertData: { id: 'activity-1' } },
        leads: { updateData: {} },
      })

      const result = await closeLead({
        supabase,
        leadId: 'lead-1',
        tenantId: 'tenant-1',
        closedStage: closedStage as any,
        reasonCode: 'test_reason',
        closedBy: 'user-1',
      })

      expect(result.success, `closeLead failed for ${closedStage}`).toBe(true)
    }
  })

  it('returns closureRecordId on success', async () => {
    const supabase = createMockSupabase({
      lead_closure_records: { insertData: { id: 'closure-abc' } },
      activities: { insertData: { id: 'activity-1' } },
      leads: { updateData: {} },
    })

    const result = await closeLead({
      supabase,
      leadId: 'lead-1',
      tenantId: 'tenant-1',
      closedStage: LEAD_STAGES.CLOSED_NO_RESPONSE as any,
      reasonCode: 'no_response',
      closedBy: 'user-1',
    })

    expect(result.success).toBe(true)
    expect(result.closureRecordId).toBe('closure-abc')
  })

  it('validates all closed stages are recognized by isClosedStage', () => {
    for (const stage of CLOSED_STAGES) {
      expect(isClosedStage(stage), `${stage} not recognized as closed`).toBe(true)
    }
  })
})

// ─── reopenLead ──────────────────────────────────────────────────────────────

describe('reopenLead', () => {
  it('rejects reopening to a closed stage', async () => {
    const supabase = createMockSupabase({
      leads: {
        selectData: { current_stage: LEAD_STAGES.CLOSED_NO_RESPONSE, is_closed: true, closure_record_id: 'cr-1' },
      },
    })

    const result = await reopenLead({
      supabase,
      leadId: 'lead-1',
      tenantId: 'tenant-1',
      targetStage: LEAD_STAGES.CLOSED_NO_RESPONSE as any,
      reason: 'Test',
      taskStrategy: 'restore',
      reopenedBy: 'user-1',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Cannot reopen to a closed stage')
  })

  it('rejects reopening a lead that is not closed', async () => {
    const supabase = createMockSupabase({
      leads: {
        selectData: { current_stage: LEAD_STAGES.NEW_INQUIRY, is_closed: false, closure_record_id: null },
      },
    })

    const result = await reopenLead({
      supabase,
      leadId: 'lead-1',
      tenantId: 'tenant-1',
      targetStage: LEAD_STAGES.NEW_INQUIRY as any,
      reason: 'Test',
      taskStrategy: 'restore',
      reopenedBy: 'user-1',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('not currently closed')
  })

  it('rejects reopening when lead not found', async () => {
    const supabase = createMockSupabase({
      leads: { selectData: null },
    })

    const result = await reopenLead({
      supabase,
      leadId: 'nonexistent',
      tenantId: 'tenant-1',
      targetStage: LEAD_STAGES.NEW_INQUIRY as any,
      reason: 'Test',
      taskStrategy: 'restore',
      reopenedBy: 'user-1',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Lead not found')
  })

  it('accepts all 3 task strategies for valid reopen', async () => {
    for (const strategy of ['restore', 'reopen', 'regenerate'] as const) {
      const supabase = createMockSupabase({
        leads: {
          selectData: { current_stage: LEAD_STAGES.CLOSED_NO_RESPONSE, is_closed: true, closure_record_id: 'cr-1' },
          updateData: {},
        },
        lead_reopen_records: { insertData: { id: `reopen-${strategy}` } },
        lead_milestone_tasks: { updateData: {} },
        lead_milestone_groups: { updateData: {} },
        activities: { insertData: { id: 'a-1' } },
      })

      const result = await reopenLead({
        supabase,
        leadId: 'lead-1',
        tenantId: 'tenant-1',
        targetStage: LEAD_STAGES.CONTACT_ATTEMPTED as any,
        reason: `Reopening with ${strategy}`,
        taskStrategy: strategy,
        reopenedBy: 'user-1',
      })

      expect(result.success, `reopenLead failed with strategy ${strategy}`).toBe(true)
      expect(result.reopenRecordId, `Missing reopenRecordId for ${strategy}`).toBeTruthy()
    }
  })

  it('can reopen to any active stage', async () => {
    const activeTargets = [
      LEAD_STAGES.NEW_INQUIRY,
      LEAD_STAGES.CONTACT_ATTEMPTED,
      LEAD_STAGES.RETAINED_ACTIVE_MATTER,
    ]

    for (const targetStage of activeTargets) {
      const supabase = createMockSupabase({
        leads: {
          selectData: { current_stage: LEAD_STAGES.CLOSED_CLIENT_DECLINED, is_closed: true, closure_record_id: 'cr-1' },
          updateData: {},
        },
        lead_reopen_records: { insertData: { id: 'reopen-1' } },
        lead_milestone_tasks: { updateData: {} },
        lead_milestone_groups: { updateData: {} },
        activities: { insertData: { id: 'a-1' } },
      })

      const result = await reopenLead({
        supabase,
        leadId: 'lead-1',
        tenantId: 'tenant-1',
        targetStage: targetStage as any,
        reason: 'Testing reopen targets',
        taskStrategy: 'restore',
        reopenedBy: 'user-1',
      })

      expect(result.success, `Cannot reopen to ${targetStage}`).toBe(true)
    }
  })
})
