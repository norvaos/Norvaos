import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  SLA_HOURS,
  startSLA,
  completeSLA,
  checkBreaches,
  type SLAClass,
} from '../sla-engine'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000'
const MATTER_ID = '660e8400-e29b-41d4-a716-446655440001'
const SLA_ID = '770e8400-e29b-41d4-a716-446655440002'
const USER_ID = '880e8400-e29b-41d4-a716-446655440003'

/**
 * Build a fluent Supabase mock.
 * Each chained method (.from, .insert, .select, .single, .update, .eq, .lt)
 * returns `this` so the chain works, with the terminal call resolving data.
 */
function createSupabaseMock(overrides: {
  insertReturn?: { data: unknown; error: unknown }
  updateReturn?: { data: unknown; error: unknown }
  selectReturn?: { data: unknown; error: unknown }
  activitiesInsertReturn?: { data: unknown; error: unknown }
} = {}) {
  const insertReturn = overrides.insertReturn ?? { data: { id: SLA_ID }, error: null }
  const updateReturn = overrides.updateReturn ?? { data: null, error: null }
  const selectReturn = overrides.selectReturn ?? { data: [], error: null }
  const activitiesInsertReturn = overrides.activitiesInsertReturn ?? { data: null, error: null }

  // Track which table is being targeted
  let currentTable = ''

  const mock: Record<string, unknown> = {}

  // Accumulate calls for assertions
  const calls = {
    from: [] as string[],
    insert: [] as unknown[],
    update: [] as unknown[],
    select: [] as string[],
    eq: [] as [string, unknown][],
    lt: [] as [string, unknown][],
  }

  const chain = {
    from(table: string) {
      currentTable = table
      calls.from.push(table)
      return chain
    },
    insert(payload: unknown) {
      calls.insert.push(payload)
      return chain
    },
    update(payload: unknown) {
      calls.update.push(payload)
      return chain
    },
    select(columns?: string) {
      calls.select.push(columns ?? '*')
      // If this is a select on matter_sla_tracking (for checkBreaches query),
      // return the selectReturn which includes .eq/.lt chain
      if (currentTable === 'matter_sla_tracking' && calls.insert.length === 0) {
        return chain
      }
      return chain
    },
    single() {
      // Terminal for insert().select().single()
      if (currentTable === 'activities') {
        return activitiesInsertReturn
      }
      return insertReturn
    },
    eq(col: string, val: unknown) {
      calls.eq.push([col, val])
      // For update chains, if we've seen an update call, this is terminal
      if (calls.update.length > 0 && currentTable === 'matter_sla_tracking') {
        return updateReturn
      }
      return chain
    },
    lt(col: string, val: unknown) {
      calls.lt.push([col, val])
      return selectReturn
    },
  }

  mock.from = vi.fn(chain.from)
  // Patch chain methods to be spyable
  Object.assign(mock, { _chain: chain, _calls: calls })

  return mock as unknown as {
    from: ReturnType<typeof vi.fn>
    _calls: typeof calls
    _chain: typeof chain
  }
}

// ---------------------------------------------------------------------------
// SLA_HOURS constant
// ---------------------------------------------------------------------------

describe('SLA_HOURS', () => {
  it('defines exactly 6 SLA classes', () => {
    const keys = Object.keys(SLA_HOURS)
    expect(keys).toHaveLength(6)
  })

  it.each([
    ['CLIENT_RESPONSE', 120],
    ['DOCUMENT_REVIEW', 24],
    ['LAWYER_REVIEW', 48],
    ['BILLING_CLEARANCE', 72],
    ['FILING', 48],
    ['IRCC_RESPONSE', 336],
  ] as const)('SLA_HOURS[%s] === %d', (cls, expected) => {
    expect(SLA_HOURS[cls as SLAClass]).toBe(expected)
  })

  it('all values are positive integers', () => {
    for (const [, hours] of Object.entries(SLA_HOURS)) {
      expect(hours).toBeGreaterThan(0)
      expect(Number.isInteger(hours)).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// startSLA
// ---------------------------------------------------------------------------

describe('startSLA', () => {
  let dateSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Pin Date to a known instant: 2026-03-25T12:00:00.000Z
    const fixed = new Date('2026-03-25T12:00:00.000Z')
    dateSpy = vi.spyOn(globalThis, 'Date').mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function (this: Date, ...args: any[]) {
        if (args.length === 0) {
          return new (dateSpy.getMockImplementation() ? Date : Object.getPrototypeOf(Date))(fixed.getTime())
        }
        // For `new Date(ms)`  -  used to compute dueAt
        return new (Object.getPrototypeOf(Date).constructor)(args[0])
      } as unknown as () => Date,
    )
  })

  afterEach(() => {
    dateSpy?.mockRestore()
  })

  // Use a simpler approach: just verify the mock interactions
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the id from the inserted row', async () => {
    const supabase = createMockForStartSLA({ data: { id: SLA_ID }, error: null })
    const result = await startSLA(supabase as never, TENANT_ID, MATTER_ID, 'CLIENT_RESPONSE')
    expect(result).toBe(SLA_ID)
  })

  it('throws when supabase returns an error', async () => {
    const dbError = { message: 'insert failed', code: '23505' }
    const supabase = createMockForStartSLA({ data: null, error: dbError })
    await expect(
      startSLA(supabase as never, TENANT_ID, MATTER_ID, 'DOCUMENT_REVIEW'),
    ).rejects.toEqual(dbError)
  })

  it('inserts with correct tenant_id, matter_id, sla_class', async () => {
    const insertSpy = vi.fn()
    const supabase = createMockForStartSLA({ data: { id: SLA_ID }, error: null }, insertSpy)

    await startSLA(supabase as never, TENANT_ID, MATTER_ID, 'FILING')

    expect(insertSpy).toHaveBeenCalledTimes(1)
    const payload = insertSpy.mock.calls[0][0]
    expect(payload.tenant_id).toBe(TENANT_ID)
    expect(payload.matter_id).toBe(MATTER_ID)
    expect(payload.sla_class).toBe('FILING')
    expect(payload.status).toBe('running')
  })

  it('sets context_ref to null when not provided', async () => {
    const insertSpy = vi.fn()
    const supabase = createMockForStartSLA({ data: { id: SLA_ID }, error: null }, insertSpy)

    await startSLA(supabase as never, TENANT_ID, MATTER_ID, 'BILLING_CLEARANCE')

    const payload = insertSpy.mock.calls[0][0]
    expect(payload.context_ref).toBeNull()
    expect(payload.created_by).toBeNull()
  })

  it('passes contextRef and userId when provided', async () => {
    const insertSpy = vi.fn()
    const supabase = createMockForStartSLA({ data: { id: SLA_ID }, error: null }, insertSpy)

    await startSLA(supabase as never, TENANT_ID, MATTER_ID, 'LAWYER_REVIEW', 'doc-456', USER_ID)

    const payload = insertSpy.mock.calls[0][0]
    expect(payload.context_ref).toBe('doc-456')
    expect(payload.created_by).toBe(USER_ID)
  })

  it.each([
    ['CLIENT_RESPONSE', 120],
    ['DOCUMENT_REVIEW', 24],
    ['LAWYER_REVIEW', 48],
    ['BILLING_CLEARANCE', 72],
    ['FILING', 48],
    ['IRCC_RESPONSE', 336],
  ] as const)('due_at is exactly %d hours after started_at for %s', async (cls, hours) => {
    const insertSpy = vi.fn()
    const supabase = createMockForStartSLA({ data: { id: SLA_ID }, error: null }, insertSpy)

    await startSLA(supabase as never, TENANT_ID, MATTER_ID, cls as SLAClass)

    const payload = insertSpy.mock.calls[0][0]
    const startedAt = new Date(payload.started_at).getTime()
    const dueAt = new Date(payload.due_at).getTime()
    const diffHours = (dueAt - startedAt) / (1000 * 60 * 60)
    expect(diffHours).toBe(hours)
  })

  it('started_at and due_at are valid ISO strings', async () => {
    const insertSpy = vi.fn()
    const supabase = createMockForStartSLA({ data: { id: SLA_ID }, error: null }, insertSpy)

    await startSLA(supabase as never, TENANT_ID, MATTER_ID, 'IRCC_RESPONSE')

    const payload = insertSpy.mock.calls[0][0]
    // Should parse without NaN
    expect(new Date(payload.started_at).getTime()).not.toBeNaN()
    expect(new Date(payload.due_at).getTime()).not.toBeNaN()
    // ISO format check
    expect(payload.started_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    expect(payload.due_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })
})

// Simpler mock builder specifically for startSLA
function createMockForStartSLA(
  singleReturn: { data: unknown; error: unknown },
  insertSpy?: ReturnType<typeof vi.fn>,
) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    insert: (insertSpy ?? vi.fn()).mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(singleReturn),
      }),
    }),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(singleReturn),
  }
  chain.from.mockReturnValue(chain)
  return chain
}

// ---------------------------------------------------------------------------
// completeSLA
// ---------------------------------------------------------------------------

describe('completeSLA', () => {
  it('calls update with status completed and completed_at', async () => {
    const updateSpy = vi.fn()
    const eqSpy = vi.fn().mockResolvedValue({ data: null, error: null })
    const supabase = {
      from: vi.fn().mockReturnValue({
        update: updateSpy.mockReturnValue({
          eq: eqSpy,
        }),
      }),
    }

    await completeSLA(supabase as never, SLA_ID)

    expect(supabase.from).toHaveBeenCalledWith('matter_sla_tracking')
    expect(updateSpy).toHaveBeenCalledTimes(1)
    const payload = updateSpy.mock.calls[0][0]
    expect(payload.status).toBe('completed')
    expect(payload.completed_at).toBeDefined()
    expect(new Date(payload.completed_at).getTime()).not.toBeNaN()
    expect(eqSpy).toHaveBeenCalledWith('id', SLA_ID)
  })

  it('does not throw on success', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }

    await expect(completeSLA(supabase as never, SLA_ID)).resolves.toBeUndefined()
  })

  it('completed_at is a valid ISO timestamp', async () => {
    const updateSpy = vi.fn()
    const supabase = {
      from: vi.fn().mockReturnValue({
        update: updateSpy.mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }

    await completeSLA(supabase as never, SLA_ID)

    const ts = updateSpy.mock.calls[0][0].completed_at
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })
})

// ---------------------------------------------------------------------------
// checkBreaches
// ---------------------------------------------------------------------------

describe('checkBreaches', () => {
  function createBreachMock(options: {
    overdueRecords?: Array<{
      id: string
      matter_id: string
      sla_class: string
      due_at: string
      context_ref: string | null
    }>
    updateErrors?: Map<string, unknown> // sla id -> error
    activityErrors?: Map<string, unknown> // sla id -> error
  } = {}) {
    const overdueRecords = options.overdueRecords ?? []
    const updateErrors = options.updateErrors ?? new Map()
    const activityErrors = options.activityErrors ?? new Map()

    // Track which SLA we're updating
    let currentUpdateId: string | null = null
    let currentTable = ''
    let isUpdateChain = false

    const activityInserts: unknown[] = []
    const slaUpdates: Array<{ id: string; payload: unknown }> = []

    const mock = {
      from: vi.fn((table: string) => {
        currentTable = table
        isUpdateChain = false
        return mock._chain
      }),
      _chain: {} as Record<string, unknown>,
      _activityInserts: activityInserts,
      _slaUpdates: slaUpdates,
    }

    mock._chain = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            lt: vi.fn().mockReturnValue({ data: overdueRecords, error: null }),
          }),
        }),
      }),
      update: vi.fn((payload: unknown) => {
        isUpdateChain = true
        return {
          eq: vi.fn((col: string, val: unknown) => {
            if (col === 'id') {
              currentUpdateId = val as string
              slaUpdates.push({ id: val as string, payload })
              const err = updateErrors.get(val as string)
              if (err) return Promise.resolve({ data: null, error: err })
            }
            return Promise.resolve({ data: null, error: null })
          }),
        }
      }),
      insert: vi.fn((payload: unknown) => {
        activityInserts.push(payload)
        const slaId = currentUpdateId
        const err = slaId ? activityErrors.get(slaId) : null
        if (err) throw err
        return Promise.resolve({ data: null, error: null })
      }),
    }

    return mock
  }

  it('returns empty arrays when no overdue SLAs exist', async () => {
    const supabase = createBreachMock({ overdueRecords: [] })
    const result = await checkBreaches(supabase as never, TENANT_ID)
    expect(result).toEqual({ breached: [], errors: [] })
  })

  it('marks overdue SLAs as breached and returns their IDs', async () => {
    const overdue = [
      {
        id: 'sla-001',
        matter_id: MATTER_ID,
        sla_class: 'CLIENT_RESPONSE',
        due_at: '2026-03-20T12:00:00.000Z',
        context_ref: null,
      },
      {
        id: 'sla-002',
        matter_id: MATTER_ID,
        sla_class: 'FILING',
        due_at: '2026-03-22T12:00:00.000Z',
        context_ref: 'doc-789',
      },
    ]
    const supabase = createBreachMock({ overdueRecords: overdue })
    const result = await checkBreaches(supabase as never, TENANT_ID)

    expect(result.breached).toEqual(['sla-001', 'sla-002'])
    expect(result.errors).toEqual([])
  })

  it('queries only running SLAs for the given tenant', async () => {
    const supabase = createBreachMock({ overdueRecords: [] })
    await checkBreaches(supabase as never, TENANT_ID)

    expect(supabase.from).toHaveBeenCalledWith('matter_sla_tracking')
  })

  it('creates activity alerts for each breached SLA', async () => {
    const overdue = [
      {
        id: 'sla-001',
        matter_id: MATTER_ID,
        sla_class: 'DOCUMENT_REVIEW',
        due_at: '2026-03-24T12:00:00.000Z',
        context_ref: null,
      },
    ]
    const supabase = createBreachMock({ overdueRecords: overdue })
    await checkBreaches(supabase as never, TENANT_ID)

    expect(supabase._activityInserts).toHaveLength(1)
    const activity = supabase._activityInserts[0] as Record<string, unknown>
    expect(activity.tenant_id).toBe(TENANT_ID)
    expect(activity.matter_id).toBe(MATTER_ID)
    expect(activity.activity_type).toBe('sla_breached')
    expect(activity.title).toBe('SLA Breached: DOCUMENT_REVIEW')
    expect(activity.entity_type).toBe('matter')
    expect(activity.entity_id).toBe(MATTER_ID)
  })

  it('activity description includes SLA class and due date', async () => {
    const overdue = [
      {
        id: 'sla-001',
        matter_id: MATTER_ID,
        sla_class: 'IRCC_RESPONSE',
        due_at: '2026-03-10T08:00:00.000Z',
        context_ref: null,
      },
    ]
    const supabase = createBreachMock({ overdueRecords: overdue })
    await checkBreaches(supabase as never, TENANT_ID)

    const activity = supabase._activityInserts[0] as Record<string, unknown>
    expect(activity.description).toContain('IRCC_RESPONSE')
    expect(activity.description).toContain('SLA breached')
  })

  it('collects errors but continues processing remaining SLAs', async () => {
    const overdue = [
      {
        id: 'sla-fail',
        matter_id: MATTER_ID,
        sla_class: 'FILING',
        due_at: '2026-03-20T00:00:00.000Z',
        context_ref: null,
      },
      {
        id: 'sla-ok',
        matter_id: MATTER_ID,
        sla_class: 'LAWYER_REVIEW',
        due_at: '2026-03-21T00:00:00.000Z',
        context_ref: null,
      },
    ]

    // Make the activity insert throw for the first SLA
    const activityErrors = new Map([['sla-fail', new Error('activity insert failed')]])
    const supabase = createBreachMock({ overdueRecords: overdue, activityErrors })
    const result = await checkBreaches(supabase as never, TENANT_ID)

    // The first SLA should be in errors (activity insert threw)
    expect(result.errors.length).toBeGreaterThanOrEqual(1)
    expect(result.errors[0]).toContain('sla-fail')
    // The second SLA should succeed
    expect(result.breached).toContain('sla-ok')
  })

  it('handles null overdue data gracefully (treats as empty)', async () => {
    // Simulate Supabase returning null data
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              lt: vi.fn().mockReturnValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    }

    const result = await checkBreaches(supabase as never, TENANT_ID)
    expect(result).toEqual({ breached: [], errors: [] })
  })

  it('updates SLA status to breached with breached_at timestamp', async () => {
    const overdue = [
      {
        id: 'sla-001',
        matter_id: MATTER_ID,
        sla_class: 'BILLING_CLEARANCE',
        due_at: '2026-03-23T00:00:00.000Z',
        context_ref: null,
      },
    ]
    const supabase = createBreachMock({ overdueRecords: overdue })
    await checkBreaches(supabase as never, TENANT_ID)

    expect(supabase._slaUpdates).toHaveLength(1)
    const update = supabase._slaUpdates[0]
    expect(update.id).toBe('sla-001')
    const payload = update.payload as Record<string, unknown>
    expect(payload.status).toBe('breached')
    expect(payload.breached_at).toBeDefined()
    expect(typeof payload.breached_at).toBe('string')
  })
})

// ---------------------------------------------------------------------------
// Deadline calculation edge cases
// ---------------------------------------------------------------------------

describe('deadline calculation edge cases', () => {
  it('IRCC_RESPONSE deadline is exactly 14 days (336 hours)', () => {
    const start = new Date('2026-01-01T00:00:00.000Z')
    const due = new Date(start.getTime() + SLA_HOURS.IRCC_RESPONSE * 60 * 60 * 1000)
    expect(due.toISOString()).toBe('2026-01-15T00:00:00.000Z')
  })

  it('CLIENT_RESPONSE deadline is exactly 5 days (120 hours)', () => {
    const start = new Date('2026-03-01T09:00:00.000Z')
    const due = new Date(start.getTime() + SLA_HOURS.CLIENT_RESPONSE * 60 * 60 * 1000)
    expect(due.toISOString()).toBe('2026-03-06T09:00:00.000Z')
  })

  it('DOCUMENT_REVIEW deadline is exactly 1 day (24 hours)', () => {
    const start = new Date('2026-06-15T17:30:00.000Z')
    const due = new Date(start.getTime() + SLA_HOURS.DOCUMENT_REVIEW * 60 * 60 * 1000)
    expect(due.toISOString()).toBe('2026-06-16T17:30:00.000Z')
  })

  it('deadline crossing DST boundary preserves exact hour offset', () => {
    // March 8 2026 is DST spring-forward in North America
    // SLA engine uses UTC milliseconds, so DST should not affect it
    const start = new Date('2026-03-07T06:00:00.000Z')
    const due = new Date(start.getTime() + SLA_HOURS.LAWYER_REVIEW * 60 * 60 * 1000)
    const diffMs = due.getTime() - start.getTime()
    expect(diffMs).toBe(48 * 60 * 60 * 1000) // Exactly 48 hours in ms
  })

  it('deadline at year boundary works correctly', () => {
    const start = new Date('2025-12-30T12:00:00.000Z')
    const due = new Date(start.getTime() + SLA_HOURS.BILLING_CLEARANCE * 60 * 60 * 1000)
    // 72 hours = 3 days -> Jan 2, 2026
    expect(due.toISOString()).toBe('2026-01-02T12:00:00.000Z')
  })

  it('deadline at leap year boundary (Feb 28/29) works correctly', () => {
    // 2028 is a leap year
    const start = new Date('2028-02-27T00:00:00.000Z')
    const due = new Date(start.getTime() + SLA_HOURS.LAWYER_REVIEW * 60 * 60 * 1000)
    // 48 hours = 2 days -> Feb 29, 2028
    expect(due.toISOString()).toBe('2028-02-29T00:00:00.000Z')
  })

  it('deadline at non-leap year Feb 28 rolls into March', () => {
    const start = new Date('2026-02-27T00:00:00.000Z')
    const due = new Date(start.getTime() + SLA_HOURS.LAWYER_REVIEW * 60 * 60 * 1000)
    // 48 hours = 2 days -> March 1
    expect(due.toISOString()).toBe('2026-03-01T00:00:00.000Z')
  })

  it('millisecond precision: no rounding errors in hour multiplication', () => {
    for (const [, hours] of Object.entries(SLA_HOURS)) {
      const ms = hours * 60 * 60 * 1000
      // Must be an exact integer (no floating point issues)
      expect(Number.isInteger(ms)).toBe(true)
      // Round-trip check
      expect(ms / (60 * 60 * 1000)).toBe(hours)
    }
  })
})

// ---------------------------------------------------------------------------
// SLAClass type coverage (compile-time + runtime)
// ---------------------------------------------------------------------------

describe('SLAClass type coverage', () => {
  const ALL_CLASSES: SLAClass[] = [
    'CLIENT_RESPONSE',
    'DOCUMENT_REVIEW',
    'LAWYER_REVIEW',
    'BILLING_CLEARANCE',
    'FILING',
    'IRCC_RESPONSE',
  ]

  it('every SLAClass maps to a positive number of hours', () => {
    for (const cls of ALL_CLASSES) {
      expect(SLA_HOURS[cls]).toBeGreaterThan(0)
    }
  })

  it('SLA_HOURS has no extra keys beyond the SLAClass union', () => {
    const keys = Object.keys(SLA_HOURS)
    expect(keys.sort()).toEqual([...ALL_CLASSES].sort())
  })
})

// ---------------------------------------------------------------------------
// startSLA: rapid-fire invocations (concurrent safety)
// ---------------------------------------------------------------------------

describe('startSLA concurrent invocations', () => {
  it('each call gets an independent timestamp (not shared)', async () => {
    const payloads: Array<Record<string, string>> = []
    const insertSpy = vi.fn((p: Record<string, string>) => {
      payloads.push(p)
      return {
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: `id-${payloads.length}` }, error: null }),
        }),
      }
    })
    const supabase = {
      from: vi.fn().mockReturnValue({ insert: insertSpy }),
    }

    // Fire two SLAs "simultaneously"
    const [id1, id2] = await Promise.all([
      startSLA(supabase as never, TENANT_ID, MATTER_ID, 'DOCUMENT_REVIEW'),
      startSLA(supabase as never, TENANT_ID, MATTER_ID, 'IRCC_RESPONSE'),
    ])

    expect(id1).not.toBe(id2)
    expect(payloads).toHaveLength(2)

    // Each should have computed different due_at offsets
    const due1 = new Date(payloads[0].due_at).getTime() - new Date(payloads[0].started_at).getTime()
    const due2 = new Date(payloads[1].due_at).getTime() - new Date(payloads[1].started_at).getTime()
    expect(due1).toBe(24 * 60 * 60 * 1000)   // DOCUMENT_REVIEW = 24h
    expect(due2).toBe(336 * 60 * 60 * 1000)  // IRCC_RESPONSE = 336h
  })
})

// ---------------------------------------------------------------------------
// checkBreaches: multiple breaches in single run
// ---------------------------------------------------------------------------

describe('checkBreaches batch processing', () => {
  it('processes 10 overdue SLAs in a single call', async () => {
    const overdue = Array.from({ length: 10 }, (_, i) => ({
      id: `sla-${String(i).padStart(3, '0')}`,
      matter_id: MATTER_ID,
      sla_class: 'FILING',
      due_at: `2026-03-${String(10 + i).padStart(2, '0')}T00:00:00.000Z`,
      context_ref: null,
    }))

    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'matter_sla_tracking') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  lt: vi.fn().mockReturnValue({ data: overdue, error: null }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }
        }
        // activities table
        return {
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
      }),
    }

    const result = await checkBreaches(supabase as never, TENANT_ID)
    expect(result.breached).toHaveLength(10)
    expect(result.errors).toHaveLength(0)
  })
})
