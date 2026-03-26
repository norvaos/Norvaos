/**
 * Shared chainable Supabase mock factory for NorvaOS test suite.
 *
 * Consolidates the duplicated mock pattern from pdf-permission.test.ts
 * and rls-billing-regression.test.ts into a single reusable factory.
 *
 * Usage:
 *   const supabase = makeMockSupabase({
 *     tenants: { single: { data: { status: 'active', max_users: 10 }, error: null } },
 *     users:   { single: { data: { id: 'u1', is_active: true }, error: null }, count: 3 },
 *   })
 *
 *   // Chainable  -  just like real Supabase client
 *   const { data } = await supabase.from('tenants').select('status').eq('id', '...').single()
 */

export type TableConfig = {
  /** Return value for terminal `.single()` call */
  single?: { data: unknown; error: unknown }
  /** Return value for `count` when `.select('*', { count: 'exact', head: true })` is used */
  count?: number
  /** Return value for `data` when chain is awaited (no `.single()`) */
  data?: unknown[]
  /** Return value for `error` when chain is awaited */
  error?: unknown
}

export type TableOverrides = Record<string, TableConfig>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockQueryBuilder = Record<string, (...args: any[]) => any> & PromiseLike<{
  data: unknown[] | null
  error: unknown
  count: number
}>

/**
 * Create a mock Supabase client with table-specific return values.
 *
 * Chain methods: select, eq, neq, gt, lt, gte, lte, is, not, or, in,
 *   order, limit, range, insert, update, delete, maybeSingle
 *
 * Terminal: `.single()` returns `cfg.single ?? { data: null, error: null }`
 * Awaiting chain (no `.single()`) returns `{ data: cfg.data ?? [], error: cfg.error ?? null, count: cfg.count ?? 0 }`
 */
export function makeMockSupabase(tables: TableOverrides = {}) {
  function mockQueryBuilder(table: string): MockQueryBuilder {
    const cfg = tables[table] ?? {}

    const self: MockQueryBuilder = {} as MockQueryBuilder

    const chainMethods = [
      'select', 'eq', 'neq', 'gt', 'lt', 'gte', 'lte',
      'is', 'not', 'or', 'in', 'order', 'limit', 'range',
      'insert', 'update', 'delete', 'maybeSingle', 'head',
    ]

    for (const m of chainMethods) {
      self[m] = (..._args: unknown[]) => {
        if (m === 'maybeSingle') {
          return cfg.single ?? { data: null, error: null }
        }
        return self
      }
    }

    // Terminal: .single() resolves immediately
    self.single = () => cfg.single ?? { data: null, error: null }

    // Thenable: allows `await supabase.from('x').select('*').eq('id', '...')`
    self.then = ((
      resolve: (value: { data: unknown; error: unknown; count: number }) => void,
      _reject?: (reason: unknown) => void,
    ) => {
      resolve({
        data: cfg.data ?? [],
        error: cfg.error ?? null,
        count: cfg.count ?? 0,
      })
    }) as MockQueryBuilder['then']

    return self
  }

  return { from: (table: string) => mockQueryBuilder(table) }
}
