/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Supabase Mock Factory — Chainable Query Builder for Tests
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Creates a mock Supabase client that supports the chaining pattern used by
 * all lead workflow services. Uses real thenables so `await` works correctly.
 */

import { vi } from 'vitest'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MockTableConfig {
  selectData?: unknown
  selectError?: { message: string; code?: string } | null
  insertData?: unknown
  insertError?: { message: string; code?: string } | null
  updateData?: unknown
  updateError?: { message: string; code?: string } | null
  countResult?: number | null
}

type TableConfigs = Record<string, MockTableConfig>

// ─── Thenable Helpers ─────────────────────────────────────────────────────────

/**
 * Makes an object awaitable. When `await obj` is called, JS calls `obj.then(resolve, reject)`.
 * This patches the object's `.then` to behave like a real Promise's `.then`.
 */
function makeThenable(obj: Record<string, unknown>, result: { data: unknown; error: unknown; count?: number | null }) {
  obj.then = (resolve?: (val: unknown) => unknown, reject?: (err: unknown) => unknown) => {
    return Promise.resolve(result).then(resolve, reject)
  }
  return obj
}

// ─── Chain Builder ───────────────────────────────────────────────────────────

function createChain(config: MockTableConfig) {
  const selectResult = {
    data: config.selectData ?? null,
    error: config.selectError ?? null,
    count: config.countResult ?? null,
  }

  const insertResult = {
    data: config.insertData ?? null,
    error: config.insertError ?? null,
  }

  const updateResult = {
    data: config.updateData ?? null,
    error: config.updateError ?? null,
  }

  // Main SELECT chain
  const chain: Record<string, unknown> = {}

  const chainMethods = ['select', 'eq', 'neq', 'in', 'gt', 'lt', 'gte', 'lte',
    'like', 'ilike', 'not', 'or', 'order', 'limit', 'range', 'is', 'filter']
  for (const method of chainMethods) {
    chain[method] = vi.fn().mockReturnValue(chain)
  }
  chain.single = vi.fn().mockResolvedValue({ data: selectResult.data, error: selectResult.error })
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: selectResult.data, error: selectResult.error })
  makeThenable(chain, selectResult)

  // INSERT chain — must be awaitable for `const { error } = await supabase.from().insert()`
  const insertChain: Record<string, unknown> = {}
  for (const method of chainMethods) {
    insertChain[method] = vi.fn().mockReturnValue(insertChain)
  }
  insertChain.single = vi.fn().mockResolvedValue(insertResult)
  insertChain.maybeSingle = vi.fn().mockResolvedValue(insertResult)
  makeThenable(insertChain, insertResult)

  chain.insert = vi.fn().mockReturnValue(insertChain)

  // UPDATE chain — must be awaitable
  const updateChain: Record<string, unknown> = {}
  for (const method of chainMethods) {
    updateChain[method] = vi.fn().mockReturnValue(updateChain)
  }
  updateChain.single = vi.fn().mockResolvedValue(updateResult)
  updateChain.maybeSingle = vi.fn().mockResolvedValue(updateResult)
  // update().select().single() pattern
  const updateSelectChain: Record<string, unknown> = {}
  for (const method of chainMethods) {
    updateSelectChain[method] = vi.fn().mockReturnValue(updateSelectChain)
  }
  updateSelectChain.single = vi.fn().mockResolvedValue(updateResult)
  makeThenable(updateSelectChain, updateResult)
  updateChain.select = vi.fn().mockReturnValue(updateSelectChain)
  makeThenable(updateChain, updateResult)

  chain.update = vi.fn().mockReturnValue(updateChain)

  return chain
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createMockSupabase(configs: TableConfigs = {}) {
  const tableChains: Record<string, ReturnType<typeof createChain>> = {}
  for (const [table, config] of Object.entries(configs)) {
    tableChains[table] = createChain(config)
  }

  const from = vi.fn((table: string) => {
    if (tableChains[table]) return tableChains[table]
    return createChain({})
  })

  return { from } as unknown as any
}

export function createMockSupabaseWithDuplicate(table: string) {
  return createMockSupabase({
    [table]: {
      insertError: { message: 'duplicate key value', code: '23505' },
    },
  })
}
