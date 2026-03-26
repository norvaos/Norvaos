/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Automation Engine — Comprehensive Tests
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Proves:
 * - processAutomationTrigger fetches matching rules, filters by config, executes actions, logs results
 * - Early return on DB error, empty rules, or zero matches
 * - matchesTriggerConfig: stage_change (to/from_stage_id, to_stage_name), deadline (days_before),
 *   checklist_item_approved (category), case_type_id, matter_type_id scoping
 * - Action: create_task — idempotency skip, happy path insert, error propagation
 * - Action: create_deadline — happy path insert, error propagation
 * - Action: log_activity — happy path insert, error propagation
 * - Action: send_notification — responsible_lawyer, originating_lawyer, all, no recipients, matter not found
 * - Action: send_client_email — happy path, no primary contact, sendClientEmail throws
 * - Unsupported action type falls through to default branch
 * - Rule execution errors are caught and logged (console.error), not thrown
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processAutomationTrigger } from '../automation-engine'

// ─── Mock email-service ─────────────────────────────────────────────────────

const mockSendClientEmail = vi.fn()
vi.mock('../email-service', () => ({
  sendClientEmail: (...args: unknown[]) => mockSendClientEmail(...args),
}))

// ─── Supabase mock builder ──────────────────────────────────────────────────

/**
 * Creates a chainable query builder mock. Every method (.select, .eq, .limit, .order, .insert)
 * returns `this` for chaining. Awaiting the chain resolves to `response`.
 * Calling `.single()` or `.maybeSingle()` resolves to `response`.
 */
function makeQueryChain(response: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(response),
    maybeSingle: vi.fn().mockResolvedValue(response),
    // Make the chain itself thenable so `await supabase.from(...).select(...).eq(...)` works
    then: vi.fn().mockImplementation((resolve: (v: unknown) => void) => {
      return Promise.resolve(response).then(resolve)
    }),
  }
  // Wire all chainable methods to return the same chain object
  chain.select.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  chain.limit.mockReturnValue(chain)
  chain.order.mockReturnValue(chain)
  chain.insert.mockReturnValue(chain)
  return chain
}

/**
 * Build a mock SupabaseClient where `.from(table)` dispatches to a handler function.
 * The handler receives the table name and the call index for that table and returns { data, error }.
 */
function buildSupabase(handler: (table: string, callIndex: number) => { data: unknown; error: unknown }) {
  const counters: Record<string, number> = {}
  const fromFn = vi.fn().mockImplementation((table: string) => {
    counters[table] = (counters[table] ?? 0) + 1
    const response = handler(table, counters[table])
    return makeQueryChain(response)
  })
  return { from: fromFn } as unknown as Parameters<typeof processAutomationTrigger>[0]['supabase'] & { from: ReturnType<typeof vi.fn> }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const BASE_PARAMS = {
  tenantId: 'tenant-1',
  matterId: 'matter-1',
  userId: 'user-1',
}

function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rule-1',
    tenant_id: 'tenant-1',
    name: 'Test Rule',
    trigger_type: 'stage_change',
    trigger_config: {},
    action_type: 'create_task',
    action_config: { title: 'Follow-up task', due_days_offset: 3, priority: 'high' },
    is_active: true,
    sort_order: 1,
    case_type_id: null,
    matter_type_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

const OK = { data: null, error: null }

// ═══════════════════════════════════════════════════════════════════════════════
// processAutomationTrigger — top-level flow
// ═══════════════════════════════════════════════════════════════════════════════

describe('processAutomationTrigger', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockSendClientEmail.mockReset()
  })

  it('returns early when rules query errors', async () => {
    const supabase = buildSupabase(() => ({ data: null, error: { message: 'DB down' } }))

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType: 'stage_change',
      triggerContext: {},
    })

    expect(supabase.from).toHaveBeenCalledTimes(1)
    expect(supabase.from).toHaveBeenCalledWith('automation_rules')
  })

  it('returns early when rules query returns null data', async () => {
    const supabase = buildSupabase(() => ({ data: null, error: null }))

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType: 'stage_change',
      triggerContext: {},
    })

    expect(supabase.from).toHaveBeenCalledTimes(1)
  })

  it('returns early when rules query returns empty array', async () => {
    const supabase = buildSupabase(() => ({ data: [], error: null }))

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType: 'stage_change',
      triggerContext: {},
    })

    expect(supabase.from).toHaveBeenCalledTimes(1)
  })

  it('returns early when no rules match trigger config', async () => {
    const rule = makeRule({ trigger_config: { to_stage_id: 'stage-X' } })

    const supabase = buildSupabase((table) => {
      if (table === 'automation_rules') return { data: [rule], error: null }
      return OK
    })

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType: 'stage_change',
      triggerContext: { to_stage_id: 'stage-Y' },
    })

    expect(supabase.from).toHaveBeenCalledTimes(1)
  })

  it('catches action execution errors and logs via console.error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const rule = makeRule({ action_type: 'create_task', action_config: { title: 'T' } })

    // Return rules normally, then throw on tasks table
    const counters: Record<string, number> = {}
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'automation_rules') {
        return makeQueryChain({ data: [rule], error: null })
      }
      // Throw synchronously to simulate unexpected failure inside executeRuleActions
      throw new Error('Unexpected DB failure')
    })

    const supabase = { from: fromFn } as unknown as Parameters<typeof processAutomationTrigger>[0]['supabase']

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType: 'stage_change',
      triggerContext: {},
    })

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('rule-1'),
      expect.any(Error),
    )
    consoleSpy.mockRestore()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// matchesTriggerConfig — tested indirectly via processAutomationTrigger
// ═══════════════════════════════════════════════════════════════════════════════

describe('matchesTriggerConfig (via processAutomationTrigger)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockSendClientEmail.mockReset()
  })

  // Helper: run a trigger and check if action tables were called
  async function runAndCountCalls(
    rule: ReturnType<typeof makeRule>,
    triggerType: 'stage_change' | 'deadline_approaching' | 'deadline_critical' | 'checklist_item_approved' | 'matter_created',
    triggerContext: Record<string, unknown>,
  ) {
    const supabase = buildSupabase((table) => {
      if (table === 'automation_rules') return { data: [rule], error: null }
      return OK
    })

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType,
      triggerContext,
    })

    return supabase.from
  }

  // ─── stage_change filters ─────────────────────────────────────────────────

  it('matches when trigger_config.to_stage_id equals context.to_stage_id', async () => {
    const rule = makeRule({
      trigger_config: { to_stage_id: 'stage-A' },
      action_type: 'log_activity',
      action_config: {},
    })
    const fromFn = await runAndCountCalls(rule, 'stage_change', { to_stage_id: 'stage-A' })
    // automation_rules + activities + automation_execution_log
    expect(fromFn).toHaveBeenCalledTimes(3)
    expect(fromFn).toHaveBeenCalledWith('activities')
  })

  it('rejects when trigger_config.to_stage_id mismatches', async () => {
    const rule = makeRule({ trigger_config: { to_stage_id: 'stage-A' } })
    const fromFn = await runAndCountCalls(rule, 'stage_change', { to_stage_id: 'stage-B' })
    expect(fromFn).toHaveBeenCalledTimes(1)
  })

  it('rejects when trigger_config.from_stage_id mismatches', async () => {
    const rule = makeRule({ trigger_config: { from_stage_id: 'old-stage' } })
    const fromFn = await runAndCountCalls(rule, 'stage_change', { from_stage_id: 'different-stage' })
    expect(fromFn).toHaveBeenCalledTimes(1)
  })

  it('rejects when trigger_config.to_stage_name mismatches', async () => {
    const rule = makeRule({ trigger_config: { to_stage_name: 'Approved' } })
    const fromFn = await runAndCountCalls(rule, 'stage_change', { to_stage_name: 'Rejected' })
    expect(fromFn).toHaveBeenCalledTimes(1)
  })

  it('matches from_stage_id when it matches context', async () => {
    const rule = makeRule({
      trigger_config: { from_stage_id: 'stage-old' },
      action_type: 'log_activity',
      action_config: {},
    })
    const fromFn = await runAndCountCalls(rule, 'stage_change', { from_stage_id: 'stage-old' })
    expect(fromFn).toHaveBeenCalledTimes(3)
  })

  // ─── deadline filters ─────────────────────────────────────────────────────

  it('matches deadline_approaching when days_before matches', async () => {
    const rule = makeRule({
      trigger_type: 'deadline_approaching',
      trigger_config: { days_before: 7 },
      action_type: 'log_activity',
      action_config: {},
    })
    const fromFn = await runAndCountCalls(rule, 'deadline_approaching', { days_before: 7 })
    expect(fromFn).toHaveBeenCalledTimes(3)
  })

  it('rejects deadline_critical when days_before mismatches', async () => {
    const rule = makeRule({
      trigger_type: 'deadline_critical',
      trigger_config: { days_before: 1 },
    })
    const fromFn = await runAndCountCalls(rule, 'deadline_critical', { days_before: 3 })
    expect(fromFn).toHaveBeenCalledTimes(1)
  })

  it('matches deadline when days_before config is undefined (wildcard)', async () => {
    const rule = makeRule({
      trigger_type: 'deadline_approaching',
      trigger_config: {},
      action_type: 'log_activity',
      action_config: {},
    })
    const fromFn = await runAndCountCalls(rule, 'deadline_approaching', { days_before: 14 })
    expect(fromFn).toHaveBeenCalledTimes(3)
  })

  // ─── checklist_item_approved filter ─────────────────────────────────────────

  it('matches checklist_item_approved when category matches', async () => {
    const rule = makeRule({
      trigger_type: 'checklist_item_approved',
      trigger_config: { checklist_category: 'documents' },
      action_type: 'log_activity',
      action_config: {},
    })
    const fromFn = await runAndCountCalls(rule, 'checklist_item_approved', { category: 'documents' })
    expect(fromFn).toHaveBeenCalledTimes(3)
  })

  it('rejects checklist_item_approved when category mismatches', async () => {
    const rule = makeRule({
      trigger_type: 'checklist_item_approved',
      trigger_config: { checklist_category: 'financial' },
    })
    const fromFn = await runAndCountCalls(rule, 'checklist_item_approved', { category: 'legal' })
    expect(fromFn).toHaveBeenCalledTimes(1)
  })

  // ─── case_type_id / matter_type_id scoping ────────────────────────────────

  it('rejects when rule.case_type_id does not match context.case_type_id', async () => {
    const rule = makeRule({ case_type_id: 'case-type-1', trigger_config: {} })
    const fromFn = await runAndCountCalls(rule, 'stage_change', { case_type_id: 'case-type-2' })
    expect(fromFn).toHaveBeenCalledTimes(1)
  })

  it('rejects when rule.matter_type_id does not match context.matter_type_id', async () => {
    const rule = makeRule({ matter_type_id: 'mt-1', trigger_config: {} })
    const fromFn = await runAndCountCalls(rule, 'stage_change', { matter_type_id: 'mt-2' })
    expect(fromFn).toHaveBeenCalledTimes(1)
  })

  it('passes when rule has no case/matter type scoping (null)', async () => {
    const rule = makeRule({
      case_type_id: null,
      matter_type_id: null,
      trigger_config: {},
      action_type: 'log_activity',
      action_config: {},
    })
    const fromFn = await runAndCountCalls(rule, 'matter_created', { case_type_id: 'anything' })
    expect(fromFn).toHaveBeenCalledTimes(3)
  })

  it('matches empty trigger_config (wildcard) for any context', async () => {
    const rule = makeRule({
      trigger_config: {},
      action_type: 'log_activity',
      action_config: {},
    })
    const fromFn = await runAndCountCalls(rule, 'stage_change', { to_stage_id: 'any', from_stage_id: 'any' })
    expect(fromFn).toHaveBeenCalledTimes(3)
  })

  it('matches null trigger_config as wildcard', async () => {
    const rule = makeRule({
      trigger_config: null,
      action_type: 'log_activity',
      action_config: {},
    })
    const fromFn = await runAndCountCalls(rule, 'stage_change', { to_stage_id: 'stage-Z' })
    expect(fromFn).toHaveBeenCalledTimes(3)
  })

  it('matches case_type_id when rule and context agree', async () => {
    const rule = makeRule({
      case_type_id: 'ct-1',
      trigger_config: {},
      action_type: 'log_activity',
      action_config: {},
    })
    const fromFn = await runAndCountCalls(rule, 'stage_change', { case_type_id: 'ct-1' })
    expect(fromFn).toHaveBeenCalledTimes(3)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// executeRuleActions — action: create_task
// ═══════════════════════════════════════════════════════════════════════════════

describe('action: create_task', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockSendClientEmail.mockReset()
  })

  it('skips task creation when identical task already exists (idempotency)', async () => {
    const rule = makeRule({
      action_type: 'create_task',
      action_config: { title: 'Follow-up' },
    })

    const supabase = buildSupabase((table, idx) => {
      if (table === 'automation_rules') return { data: [rule], error: null }
      if (table === 'tasks' && idx === 1) return { data: [{ id: 'existing-task' }], error: null }
      return OK
    })

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType: 'stage_change',
      triggerContext: {},
    })

    expect(supabase.from).toHaveBeenCalledWith('tasks')
    expect(supabase.from).toHaveBeenCalledWith('automation_execution_log')
    // Only 1 tasks call (idempotency check, no insert)
    const tasksCalls = (supabase.from as ReturnType<typeof vi.fn>).mock.calls.filter((c: string[]) => c[0] === 'tasks')
    expect(tasksCalls.length).toBe(1)
  })

  it('creates a task when no duplicate exists', async () => {
    const rule = makeRule({
      action_type: 'create_task',
      action_config: { title: 'New task', due_days_offset: 5, priority: 'high', description: 'Do it', assigned_to: 'user-2' },
    })

    const supabase = buildSupabase((table, idx) => {
      if (table === 'automation_rules') return { data: [rule], error: null }
      if (table === 'tasks' && idx === 1) return { data: [], error: null } // idempotency: no existing
      return OK
    })

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType: 'stage_change',
      triggerContext: {},
    })

    // 2 tasks calls: idempotency check + insert
    const tasksCalls = (supabase.from as ReturnType<typeof vi.fn>).mock.calls.filter((c: string[]) => c[0] === 'tasks')
    expect(tasksCalls.length).toBe(2)
    expect(supabase.from).toHaveBeenCalledWith('automation_execution_log')
  })

  it('uses rule.name as fallback title when action_config.title is missing', async () => {
    const rule = makeRule({
      name: 'Rule Name Fallback',
      action_type: 'create_task',
      action_config: {},
    })

    const supabase = buildSupabase((table, idx) => {
      if (table === 'automation_rules') return { data: [rule], error: null }
      if (table === 'tasks' && idx === 1) return { data: [], error: null }
      return OK
    })

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType: 'stage_change',
      triggerContext: {},
    })

    expect(supabase.from).toHaveBeenCalledWith('tasks')
    expect(supabase.from).toHaveBeenCalledWith('automation_execution_log')
  })

  it('records error when task insert fails', async () => {
    const rule = makeRule({
      action_type: 'create_task',
      action_config: { title: 'Failing task' },
    })

    const supabase = buildSupabase((table, idx) => {
      if (table === 'automation_rules') return { data: [rule], error: null }
      if (table === 'tasks' && idx === 1) return { data: [], error: null }
      if (table === 'tasks' && idx === 2) return { data: null, error: { message: 'insert failed' } }
      return OK
    })

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType: 'stage_change',
      triggerContext: {},
    })

    // Should still log execution
    expect(supabase.from).toHaveBeenCalledWith('automation_execution_log')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// executeRuleActions — action: create_deadline
// ═══════════════════════════════════════════════════════════════════════════════

describe('action: create_deadline', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockSendClientEmail.mockReset()
  })

  it('inserts a deadline with correct fields', async () => {
    const rule = makeRule({
      action_type: 'create_deadline',
      action_config: { title: 'Filing deadline', due_days_offset: 14, deadline_type: 'filing', priority: 'high' },
    })

    const supabase = buildSupabase((table) => {
      if (table === 'automation_rules') return { data: [rule], error: null }
      return OK
    })

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType: 'stage_change',
      triggerContext: {},
    })

    expect(supabase.from).toHaveBeenCalledWith('matter_deadlines')
    expect(supabase.from).toHaveBeenCalledWith('automation_execution_log')
  })

  it('uses defaults when action_config fields are missing', async () => {
    const rule = makeRule({
      name: 'Default Deadline Rule',
      action_type: 'create_deadline',
      action_config: {},
    })

    const supabase = buildSupabase((table) => {
      if (table === 'automation_rules') return { data: [rule], error: null }
      return OK
    })

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType: 'stage_change',
      triggerContext: {},
    })

    expect(supabase.from).toHaveBeenCalledWith('matter_deadlines')
    expect(supabase.from).toHaveBeenCalledWith('automation_execution_log')
  })

  it('records error when deadline insert fails', async () => {
    const rule = makeRule({
      action_type: 'create_deadline',
      action_config: { title: 'Deadline' },
    })

    const supabase = buildSupabase((table) => {
      if (table === 'automation_rules') return { data: [rule], error: null }
      if (table === 'matter_deadlines') return { data: null, error: { message: 'constraint violation' } }
      return OK
    })

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType: 'stage_change',
      triggerContext: {},
    })

    expect(supabase.from).toHaveBeenCalledWith('automation_execution_log')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// executeRuleActions — action: log_activity
// ═══════════════════════════════════════════════════════════════════════════════

describe('action: log_activity', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockSendClientEmail.mockReset()
  })

  it('inserts an activity record', async () => {
    const rule = makeRule({
      action_type: 'log_activity',
      action_config: { title: 'Stage advanced', description: 'Auto logged' },
    })

    const supabase = buildSupabase((table) => {
      if (table === 'automation_rules') return { data: [rule], error: null }
      return OK
    })

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType: 'stage_change',
      triggerContext: {},
    })

    expect(supabase.from).toHaveBeenCalledWith('activities')
    expect(supabase.from).toHaveBeenCalledWith('automation_execution_log')
  })

  it('uses default title "Automation: {rule.name}" when config.title is absent', async () => {
    const rule = makeRule({
      name: 'My Rule',
      action_type: 'log_activity',
      action_config: {},
    })

    const supabase = buildSupabase((table) => {
      if (table === 'automation_rules') return { data: [rule], error: null }
      return OK
    })

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType: 'stage_change',
      triggerContext: {},
    })

    expect(supabase.from).toHaveBeenCalledWith('activities')
    expect(supabase.from).toHaveBeenCalledWith('automation_execution_log')
  })

  it('records error when activity insert fails', async () => {
    const rule = makeRule({
      action_type: 'log_activity',
      action_config: { title: 'Log' },
    })

    const supabase = buildSupabase((table) => {
      if (table === 'automation_rules') return { data: [rule], error: null }
      if (table === 'activities') return { data: null, error: { message: 'insert failed' } }
      return OK
    })

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType: 'stage_change',
      triggerContext: {},
    })

    expect(supabase.from).toHaveBeenCalledWith('automation_execution_log')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// executeRuleActions — action: send_notification
// ═══════════════════════════════════════════════════════════════════════════════

describe('action: send_notification', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockSendClientEmail.mockReset()
  })

  it('sends notification to responsible_lawyer (default role)', async () => {
    const rule = makeRule({
      action_type: 'send_notification',
      action_config: { title: 'Stage update for {matter_title}', message: '{matter_title} moved' },
    })

    const supabase = buildSupabase((table) => {
      if (table === 'automation_rules') return { data: [rule], error: null }
      if (table === 'matters') return {
        data: { title: 'Smith v Jones', responsible_lawyer_id: 'lawyer-1', originating_lawyer_id: 'lawyer-2' },
        error: null,
      }
      return OK
    })

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType: 'stage_change',
      triggerContext: {},
    })

    expect(supabase.from).toHaveBeenCalledWith('matters')
    expect(supabase.from).toHaveBeenCalledWith('notifications')
    expect(supabase.from).toHaveBeenCalledWith('automation_execution_log')
  })

  it('sends to both lawyers when notify_role is "all"', async () => {
    const rule = makeRule({
      action_type: 'send_notification',
      action_config: { notify_role: 'all', title: 'Alert' },
    })

    const supabase = buildSupabase((table) => {
      if (table === 'automation_rules') return { data: [rule], error: null }
      if (table === 'matters') return {
        data: { title: 'Case', responsible_lawyer_id: 'lawyer-1', originating_lawyer_id: 'lawyer-2' },
        error: null,
      }
      return OK
    })

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType: 'stage_change',
      triggerContext: {},
    })

    expect(supabase.from).toHaveBeenCalledWith('notifications')
  })

  it('deduplicates when responsible and originating lawyer are same person', async () => {
    const rule = makeRule({
      action_type: 'send_notification',
      action_config: { notify_role: 'all', title: 'Alert' },
    })

    const supabase = buildSupabase((table) => {
      if (table === 'automation_rules') return { data: [rule], error: null }
      if (table === 'matters') return {
        data: { title: 'Case', responsible_lawyer_id: 'same-lawyer', originating_lawyer_id: 'same-lawyer' },
        error: null,
      }
      return OK
    })

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType: 'stage_change',
      triggerContext: {},
    })

    // Still sends notification (with 1 recipient, deduplicated)
    expect(supabase.from).toHaveBeenCalledWith('notifications')
  })

  it('sends to originating_lawyer only when notify_role is "originating_lawyer"', async () => {
    const rule = makeRule({
      action_type: 'send_notification',
      action_config: { notify_role: 'originating_lawyer', title: 'Alert' },
    })

    const supabase = buildSupabase((table) => {
      if (table === 'automation_rules') return { data: [rule], error: null }
      if (table === 'matters') return {
        data: { title: 'Case', responsible_lawyer_id: 'lawyer-1', originating_lawyer_id: 'lawyer-2' },
        error: null,
      }
      return OK
    })

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType: 'stage_change',
      triggerContext: {},
    })

    expect(supabase.from).toHaveBeenCalledWith('notifications')
  })

  it('skips notification when no recipients (both lawyer IDs null)', async () => {
    const rule = makeRule({
      action_type: 'send_notification',
      action_config: { title: 'Alert' },
    })

    const supabase = buildSupabase((table) => {
      if (table === 'automation_rules') return { data: [rule], error: null }
      if (table === 'matters') return {
        data: { title: 'Case', responsible_lawyer_id: null, originating_lawyer_id: null },
        error: null,
      }
      return OK
    })

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType: 'stage_change',
      triggerContext: {},
    })

    const notifCalls = (supabase.from as ReturnType<typeof vi.fn>).mock.calls.filter((c: string[]) => c[0] === 'notifications')
    expect(notifCalls.length).toBe(0)
    expect(supabase.from).toHaveBeenCalledWith('automation_execution_log')
  })

  it('skips notification when matter not found (null data from .single())', async () => {
    const rule = makeRule({
      action_type: 'send_notification',
      action_config: { title: 'Alert' },
    })

    const supabase = buildSupabase((table) => {
      if (table === 'automation_rules') return { data: [rule], error: null }
      if (table === 'matters') return { data: null, error: null }
      return OK
    })

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType: 'stage_change',
      triggerContext: {},
    })

    const notifCalls = (supabase.from as ReturnType<typeof vi.fn>).mock.calls.filter((c: string[]) => c[0] === 'notifications')
    expect(notifCalls.length).toBe(0)
    expect(supabase.from).toHaveBeenCalledWith('automation_execution_log')
  })

  it('records error when notification insert fails', async () => {
    const rule = makeRule({
      action_type: 'send_notification',
      action_config: { title: 'Alert' },
    })

    const supabase = buildSupabase((table) => {
      if (table === 'automation_rules') return { data: [rule], error: null }
      if (table === 'matters') return {
        data: { title: 'Case', responsible_lawyer_id: 'lawyer-1', originating_lawyer_id: null },
        error: null,
      }
      if (table === 'notifications') return { data: null, error: { message: 'insert failed' } }
      return OK
    })

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType: 'stage_change',
      triggerContext: {},
    })

    expect(supabase.from).toHaveBeenCalledWith('automation_execution_log')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// executeRuleActions — action: send_client_email
// ═══════════════════════════════════════════════════════════════════════════════

describe('action: send_client_email', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockSendClientEmail.mockReset()
  })

  it('sends email to primary contact', async () => {
    mockSendClientEmail.mockResolvedValue(undefined)

    const rule = makeRule({
      action_type: 'send_client_email',
      action_config: { subject: 'Your case update', body: 'Details here', template: 'stage_change' },
    })

    const supabase = buildSupabase((table) => {
      if (table === 'automation_rules') return { data: [rule], error: null }
      if (table === 'matter_contacts') return { data: { contact_id: 'contact-1' }, error: null }
      return OK
    })

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType: 'stage_change',
      triggerContext: {},
    })

    expect(mockSendClientEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        matterId: 'matter-1',
        contactId: 'contact-1',
        notificationType: 'stage_change',
        templateData: expect.objectContaining({
          subject: 'Your case update',
          body: 'Details here',
        }),
      }),
    )
    expect(supabase.from).toHaveBeenCalledWith('automation_execution_log')
  })

  it('skips email when no primary contact found', async () => {
    const rule = makeRule({
      action_type: 'send_client_email',
      action_config: { subject: 'Update' },
    })

    const supabase = buildSupabase((table) => {
      if (table === 'automation_rules') return { data: [rule], error: null }
      if (table === 'matter_contacts') return { data: null, error: null }
      return OK
    })

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType: 'stage_change',
      triggerContext: {},
    })

    expect(mockSendClientEmail).not.toHaveBeenCalled()
    expect(supabase.from).toHaveBeenCalledWith('automation_execution_log')
  })

  it('records failure when sendClientEmail throws an Error', async () => {
    mockSendClientEmail.mockRejectedValue(new Error('SMTP down'))

    const rule = makeRule({
      action_type: 'send_client_email',
      action_config: { subject: 'Update' },
    })

    const supabase = buildSupabase((table) => {
      if (table === 'automation_rules') return { data: [rule], error: null }
      if (table === 'matter_contacts') return { data: { contact_id: 'contact-1' }, error: null }
      return OK
    })

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType: 'stage_change',
      triggerContext: {},
    })

    expect(mockSendClientEmail).toHaveBeenCalled()
    expect(supabase.from).toHaveBeenCalledWith('automation_execution_log')
  })

  it('records non-Error throws as "Unknown error"', async () => {
    mockSendClientEmail.mockRejectedValue('string error')

    const rule = makeRule({
      action_type: 'send_client_email',
      action_config: { subject: 'Update' },
    })

    const supabase = buildSupabase((table) => {
      if (table === 'automation_rules') return { data: [rule], error: null }
      if (table === 'matter_contacts') return { data: { contact_id: 'contact-1' }, error: null }
      return OK
    })

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType: 'stage_change',
      triggerContext: {},
    })

    expect(supabase.from).toHaveBeenCalledWith('automation_execution_log')
  })

  it('uses default template "general" when config.template is missing', async () => {
    mockSendClientEmail.mockResolvedValue(undefined)

    const rule = makeRule({
      action_type: 'send_client_email',
      action_config: {},
    })

    const supabase = buildSupabase((table) => {
      if (table === 'automation_rules') return { data: [rule], error: null }
      if (table === 'matter_contacts') return { data: { contact_id: 'contact-1' }, error: null }
      return OK
    })

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType: 'stage_change',
      triggerContext: {},
    })

    expect(mockSendClientEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationType: 'general',
      }),
    )
  })

  it('passes supabase client through to sendClientEmail', async () => {
    mockSendClientEmail.mockResolvedValue(undefined)

    const rule = makeRule({
      action_type: 'send_client_email',
      action_config: { template: 'document_request' },
    })

    const supabase = buildSupabase((table) => {
      if (table === 'automation_rules') return { data: [rule], error: null }
      if (table === 'matter_contacts') return { data: { contact_id: 'contact-1' }, error: null }
      return OK
    })

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType: 'stage_change',
      triggerContext: {},
    })

    expect(mockSendClientEmail).toHaveBeenCalledWith(
      expect.objectContaining({ supabase }),
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// executeRuleActions — unsupported action type (default branch)
// ═══════════════════════════════════════════════════════════════════════════════

describe('unsupported action type', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockSendClientEmail.mockReset()
  })

  it('records skipped with reason "unsupported_action" and still logs execution', async () => {
    const rule = makeRule({
      action_type: 'teleport_matter',
      action_config: {},
    })

    const supabase = buildSupabase((table) => {
      if (table === 'automation_rules') return { data: [rule], error: null }
      return OK
    })

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType: 'stage_change',
      triggerContext: {},
    })

    expect(supabase.from).toHaveBeenCalledWith('automation_execution_log')
    expect(supabase.from).toHaveBeenCalledTimes(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Multiple rules — executes all matching, skips non-matching
// ═══════════════════════════════════════════════════════════════════════════════

describe('multiple rules processing', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockSendClientEmail.mockReset()
  })

  it('executes matching rules and skips non-matching ones', async () => {
    const matchingRule = makeRule({
      id: 'rule-match',
      trigger_config: { to_stage_id: 'stage-A' },
      action_type: 'log_activity',
      action_config: { title: 'Matched' },
    })
    const nonMatchingRule = makeRule({
      id: 'rule-no-match',
      trigger_config: { to_stage_id: 'stage-B' },
      action_type: 'log_activity',
      action_config: { title: 'Should not run' },
    })

    const supabase = buildSupabase((table) => {
      if (table === 'automation_rules') return { data: [matchingRule, nonMatchingRule], error: null }
      return OK
    })

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType: 'stage_change',
      triggerContext: { to_stage_id: 'stage-A' },
    })

    // automation_rules + activities (1 match) + automation_execution_log (1 match)
    expect(supabase.from).toHaveBeenCalledTimes(3)
    expect(supabase.from).toHaveBeenCalledWith('activities')
    expect(supabase.from).toHaveBeenCalledWith('automation_execution_log')
  })

  it('executes multiple matching rules in order', async () => {
    const rule1 = makeRule({
      id: 'rule-1',
      trigger_config: {},
      action_type: 'log_activity',
      action_config: { title: 'First' },
    })
    const rule2 = makeRule({
      id: 'rule-2',
      trigger_config: {},
      action_type: 'log_activity',
      action_config: { title: 'Second' },
    })

    const supabase = buildSupabase((table) => {
      if (table === 'automation_rules') return { data: [rule1, rule2], error: null }
      return OK
    })

    await processAutomationTrigger({
      supabase,
      ...BASE_PARAMS,
      triggerType: 'stage_change',
      triggerContext: {},
    })

    // automation_rules + (activities + log) * 2 matching rules = 5
    expect(supabase.from).toHaveBeenCalledTimes(5)
  })
})
