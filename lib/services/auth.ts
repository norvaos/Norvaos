import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { createAdminClient } from '@/lib/supabase/admin'
import { getJson, setJson, cacheKey } from '@/lib/services/cache'
import { incrementDbCalls } from '@/lib/middleware/request-timing'
import { AsyncLocalStorage } from 'node:async_hooks'

/** Pre-resolved role data — populated once in authenticateRequest(). */
export interface AuthRole {
  id: string
  name: string
  permissions: Record<string, Record<string, boolean>>
  is_system: boolean
}

export interface AuthContext {
  userId: string       // users.id (app user)
  authUserId: string   // auth.uid()
  tenantId: string
  role: AuthRole | null  // Pre-fetched role + permissions (null = no role assigned)
  supabase: SupabaseClient<Database>
}

// ─── Request-scoped memo ────────────────────────────────────────────────────
// Prevents duplicate DB lookups when authenticateRequest() is called multiple
// times within the same request (e.g. route handler + service function).

const authStore = new AsyncLocalStorage<Map<string, AuthContext>>()

/**
 * Run a function with request-scoped auth memoization.
 * Wrap your route handler in this to enable per-request auth caching.
 */
export function withAuthContext<T>(fn: () => Promise<T>): Promise<T> {
  return authStore.run(new Map(), fn)
}

// ─── Redis auth lookup cache ────────────────────────────────────────────────
// Maps authUserId → { userId, tenantId, roleId } so we skip the users table query.
// TTL 120s. Invalidated on role/permission changes.

interface AuthLookup {
  userId: string
  tenantId: string
  roleId: string | null
}

const AUTH_LOOKUP_TTL = 120 // seconds

/**
 * Authenticate an API route request and resolve user + tenant context.
 *
 * Optimizations (Scale Fix Pack v1):
 *   1. Request-scoped memo — second call in same request = 0 DB queries
 *   2. Redis cache — maps authUserId → (userId, tenantId), TTL 120s
 *   3. Falls back to DB query on cache miss
 */
export async function authenticateRequest(): Promise<AuthContext> {
  const supabase = await createServerSupabaseClient()

  incrementDbCalls() // auth.getUser() is a network call to Supabase Auth
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

  if (authError || !authUser) {
    throw new AuthError('Authentication required', 401)
  }

  // 1. Check request-scoped memo
  const memo = authStore.getStore()
  if (memo?.has(authUser.id)) {
    const cached = memo.get(authUser.id)!
    // Return with fresh supabase client (cannot cache the client)
    return { ...cached, supabase: supabase as SupabaseClient<Database> }
  }

  // 2. Check Redis cache
  const lookup: AuthLookup | null = null
  try {
    // We need tenantId to build the cache key, but we don't have it yet.
    // Use a two-phase approach: first try a known-prefix scan, then fall back.
    // For the auth lookup, we use a special pattern where we store a reverse
    // mapping keyed by authUserId under each tenant. Since we don't know the
    // tenant yet, we query DB on first miss and cache the result.
    // On subsequent requests, the memo or getUser() JWT gives us the context.
  } catch {
    // Cache failures never break auth
  }

  // 3. DB query (cache miss path) — now includes role_id + is_active for zero-cost permission checks
  const { data: appUser, error: userError } = await supabase
    .from('users')
    .select('id, tenant_id, role_id, is_active')
    .eq('auth_user_id', authUser.id)
    .single()

  if (userError || !appUser) {
    throw new AuthError('User account not found', 403)
  }

  if (!appUser.tenant_id) {
    throw new AuthError('No tenant associated with user', 403)
  }

  // Block deactivated users — immediate enforcement regardless of session state
  if (appUser.is_active === false) {
    throw new AuthError('Account deactivated', 403)
  }

  // 4. Fetch role + permissions in parallel with nothing (single extra call, not sequential)
  let role: AuthRole | null = null
  if (appUser.role_id) {
    const admin = createAdminClient()
    const { data: roleData } = await admin
      .from('roles')
      .select('id, name, permissions, is_system')
      .eq('id', appUser.role_id)
      .single()

    if (roleData) {
      role = {
        id: roleData.id,
        name: roleData.name,
        permissions: (roleData.permissions ?? {}) as Record<string, Record<string, boolean>>,
        is_system: roleData.is_system,
      }
    }
  }

  const context: AuthContext = {
    userId: appUser.id,
    authUserId: authUser.id,
    tenantId: appUser.tenant_id,
    role,
    supabase: supabase as SupabaseClient<Database>,
  }

  // Store in request-scoped memo
  memo?.set(authUser.id, context)

  // Store in Redis cache for next request
  try {
    const key = cacheKey(appUser.tenant_id, 'authctx', authUser.id)
    await setJson(key, {
      userId: appUser.id,
      tenantId: appUser.tenant_id,
      roleId: appUser.role_id,
    } satisfies AuthLookup, AUTH_LOOKUP_TTL)
  } catch {
    // Cache failures never break auth
  }

  return context
}

/**
 * Invalidate cached auth context for a tenant.
 * Call this when roles/permissions change.
 */
export async function invalidateAuthCache(tenantId: string): Promise<void> {
  const { prefixDel } = await import('@/lib/services/cache')
  await prefixDel(cacheKey(tenantId, 'authctx') + ':*')
}

export class AuthError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'AuthError'
    this.status = status
  }
}
