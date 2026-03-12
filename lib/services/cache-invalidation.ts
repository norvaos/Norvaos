/**
 * Centralized cache invalidation helpers.
 *
 * Every mutation route calls the relevant function here to ensure
 * cached data stays consistent. All keys are tenant-scoped.
 *
 * Scale Fix Pack v1: provides a single source of truth for what
 * gets invalidated when state changes.
 */

import { del, prefixDel, cacheKey } from '@/lib/services/cache'

/**
 * Invalidate gating evaluation cache for a matter.
 * Call after: intake save, people CRUD, stage advance, document upload/review,
 * lock-intake, override-risk, activate-kit, document-slots POST.
 */
export async function invalidateGating(tenantId: string, matterId: string): Promise<void> {
  await del(cacheKey(tenantId, 'gating', matterId))
}

/**
 * Invalidate matters list cache for a tenant.
 * Call after: matter create, stage advance, status change, intake save.
 */
export async function invalidateMattersList(tenantId: string): Promise<void> {
  await prefixDel(cacheKey(tenantId, 'matters', 'list') + ':*')
}

/**
 * Invalidate all caches related to a specific matter.
 * Use for heavy mutations (matter create, activate-kit) that affect multiple caches.
 */
export async function invalidateMatter(tenantId: string, matterId: string): Promise<void> {
  await Promise.all([
    invalidateGating(tenantId, matterId),
    invalidateMattersList(tenantId),
  ])
}

/**
 * Invalidate auth context cache for a tenant.
 * Call after: role/permission changes.
 */
export async function invalidateAuthContext(tenantId: string): Promise<void> {
  await prefixDel(cacheKey(tenantId, 'authctx') + ':*')
}
