/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Wave 6 — Failure-Resistance Tests: Idempotency Ledger
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Proves the idempotency ledger correctly prevents duplicate operations.
 * Critical for: double button clicks, repeated cron runs, concurrent webhook
 * deliveries, stale client state retry.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  executeIdempotent,
  idempotencyKeys,
  todayDateKey,
  type IdempotentResult,
} from '../lead-idempotency'
import { createMockSupabase, createMockSupabaseWithDuplicate } from '@/lib/test-utils/mock-supabase'

// ─── executeIdempotent ───────────────────────────────────────────────────────

describe('executeIdempotent', () => {
  it('executes handler on first call and returns { executed: true, skipped: false }', async () => {
    const supabase = createMockSupabase({
      lead_workflow_executions: { insertData: { id: 'exec-1' } },
    })
    const handler = vi.fn().mockResolvedValue('result-data')

    const result = await executeIdempotent(supabase, {
      tenantId: 'tenant-1',
      leadId: 'lead-1',
      executionType: 'stage_advance',
      executionKey: 'stage:lead-1:new_inquiry',
      actorUserId: 'user-1',
      handler,
    })

    expect(result.executed).toBe(true)
    expect(result.skipped).toBe(false)
    expect(result.data).toBe('result-data')
    expect(handler).toHaveBeenCalledOnce()
  })

  it('skips handler on duplicate (23505 unique violation) and returns { executed: false, skipped: true }', async () => {
    const supabase = createMockSupabaseWithDuplicate('lead_workflow_executions')
    const handler = vi.fn()

    const result = await executeIdempotent(supabase, {
      tenantId: 'tenant-1',
      leadId: 'lead-1',
      executionType: 'stage_advance',
      executionKey: 'stage:lead-1:new_inquiry',
      handler,
    })

    expect(result.executed).toBe(false)
    expect(result.skipped).toBe(true)
    expect(result.data).toBeUndefined()
    expect(handler).not.toHaveBeenCalled()
  })

  it('throws on unexpected insert errors (non-23505)', async () => {
    const supabase = createMockSupabase({
      lead_workflow_executions: {
        insertError: { message: 'connection timeout', code: '57014' },
      },
    })
    const handler = vi.fn()

    await expect(
      executeIdempotent(supabase, {
        tenantId: 'tenant-1',
        leadId: 'lead-1',
        executionType: 'stage_advance',
        executionKey: 'test-key',
        handler,
      })
    ).rejects.toThrow('Idempotency ledger insert failed')

    expect(handler).not.toHaveBeenCalled()
  })
})

// ─── Idempotency Key Determinism ─────────────────────────────────────────────

describe('idempotencyKeys', () => {
  describe('stageAdvance', () => {
    it('generates deterministic key from leadId + toStage', () => {
      const key1 = idempotencyKeys.stageAdvance('lead-1', 'consultation_booked')
      const key2 = idempotencyKeys.stageAdvance('lead-1', 'consultation_booked')
      expect(key1).toBe(key2)
    })

    it('generates different keys for different stages', () => {
      const key1 = idempotencyKeys.stageAdvance('lead-1', 'consultation_booked')
      const key2 = idempotencyKeys.stageAdvance('lead-1', 'retainer_sent')
      expect(key1).not.toBe(key2)
    })

    it('generates different keys for different leads', () => {
      const key1 = idempotencyKeys.stageAdvance('lead-1', 'consultation_booked')
      const key2 = idempotencyKeys.stageAdvance('lead-2', 'consultation_booked')
      expect(key1).not.toBe(key2)
    })
  })

  describe('milestoneCreation', () => {
    it('generates deterministic key from leadId + groupType + fromStage', () => {
      const key = idempotencyKeys.milestoneCreation('lead-1', 'CONTACT_ATTEMPTS', 'new_inquiry')
      expect(key).toBe('milestone:lead-1:CONTACT_ATTEMPTS:new_inquiry')
    })
  })

  describe('taskCompletion', () => {
    it('generates unique keys per task per trigger event', () => {
      const key1 = idempotencyKeys.taskCompletion('task-1', 'event-a')
      const key2 = idempotencyKeys.taskCompletion('task-1', 'event-b')
      expect(key1).not.toBe(key2)
    })
  })

  describe('taskManualCompletion', () => {
    it('generates one key per task (no event context)', () => {
      const key = idempotencyKeys.taskManualCompletion('task-1')
      expect(key).toBe('task_manual:task-1')
    })
  })

  describe('closure', () => {
    it('includes lead and stage for unique closure per stage', () => {
      const key = idempotencyKeys.closure('lead-1', 'closed_no_response')
      expect(key).toContain('lead-1')
      expect(key).toContain('closed_no_response')
    })
  })

  describe('conversion', () => {
    it('one key per lead — enforces single conversion', () => {
      const key1 = idempotencyKeys.conversion('lead-1')
      const key2 = idempotencyKeys.conversion('lead-1')
      expect(key1).toBe(key2)
      expect(key1).toBe('conversion:lead-1')
    })

    it('different leads have different keys', () => {
      expect(idempotencyKeys.conversion('lead-1')).not.toBe(idempotencyKeys.conversion('lead-2'))
    })
  })

  describe('reminderSent', () => {
    it('includes date key for daily deduplication', () => {
      const key = idempotencyKeys.reminderSent('lead-1', 'consultation_24h', '2026-03-08')
      expect(key).toContain('2026-03-08')
    })
  })

  describe('reopen', () => {
    it('unique per lead per closure record being reversed', () => {
      const key = idempotencyKeys.reopen('lead-1', 'closure-record-1')
      expect(key).toContain('lead-1')
      expect(key).toContain('closure-record-1')
    })
  })

  describe('autoClosure', () => {
    it('daily deduplication with date key', () => {
      const key = idempotencyKeys.autoClosure('lead-1', '2026-03-08')
      expect(key).toBe('auto_closure:lead-1:2026-03-08')
    })
  })

  describe('cadenceTask', () => {
    it('unique per cadence step', () => {
      const key0 = idempotencyKeys.cadenceTask('lead-1', 'contact_attempt', 0)
      const key1 = idempotencyKeys.cadenceTask('lead-1', 'contact_attempt', 1)
      expect(key0).not.toBe(key1)
    })
  })
})

// ─── todayDateKey ────────────────────────────────────────────────────────────

describe('todayDateKey', () => {
  it('returns a YYYY-MM-DD formatted string', () => {
    const key = todayDateKey('America/Toronto')
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('handles invalid timezone gracefully with fallback', () => {
    const key = todayDateKey('Invalid/Timezone')
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns same key for multiple calls (deterministic within same second)', () => {
    const key1 = todayDateKey('UTC')
    const key2 = todayDateKey('UTC')
    expect(key1).toBe(key2)
  })
})
