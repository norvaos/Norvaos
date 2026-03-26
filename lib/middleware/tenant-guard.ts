/**
 * Tenant Guard  -  Hard 403 enforcement for cross-tenant access.
 *
 * Team SENTINEL requirement: If a user attempts to access a resource
 * belonging to a different tenant, throw a hard 403 error instead of
 * returning an empty result set.
 *
 * Usage in API routes:
 *   import { assertTenantOwnership } from '@/lib/middleware/tenant-guard'
 *   const auth = await authenticateRequest()
 *   await assertTenantOwnership(auth, resourceTenantId, 'matters', matterId)
 */

import { AuthError, type AuthContext } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export class TenantViolationError extends AuthError {
  public readonly violationType = 'CROSS_TENANT_ACCESS' as const
  public readonly userTenantId: string
  public readonly attemptedTenantId: string
  public readonly tableName: string
  public readonly recordId: string | null

  constructor(
    userTenantId: string,
    attemptedTenantId: string,
    tableName: string,
    recordId: string | null = null,
  ) {
    super(
      `SENTINEL-403: Cross-tenant access denied. Your tenant: ${userTenantId}, Requested resource tenant: ${attemptedTenantId}`,
      403,
    )
    this.userTenantId = userTenantId
    this.attemptedTenantId = attemptedTenantId
    this.tableName = tableName
    this.recordId = recordId
  }
}

/**
 * Assert that the resource's tenant_id matches the authenticated user's tenant.
 * Throws TenantViolationError (403) on mismatch.
 * Also logs the violation to sentinel_audit_log via the DB function.
 */
export async function assertTenantOwnership(
  auth: AuthContext,
  resourceTenantId: string,
  tableName: string,
  recordId: string | null = null,
): Promise<void> {
  if (resourceTenantId !== auth.tenantId) {
    // Log the violation using admin client (bypasses RLS)
    const admin = createAdminClient()
    // Fire-and-forget audit log  -  don't block the 403 response
    void Promise.resolve(admin.rpc('sentinel_log_event' as never, {
      p_event_type: 'TENANT_VIOLATION',
      p_severity: 'critical',
      p_tenant_id: auth.tenantId,
      p_user_id: auth.userId,
      p_table_name: tableName,
      p_record_id: recordId,
      p_details: {
        attempted_tenant_id: resourceTenantId,
        actual_tenant_id: auth.tenantId,
        auth_user_id: auth.authUserId,
      },
    } as never)).catch((err: Error) => {
      console.error('[SENTINEL] Failed to log tenant violation:', err.message)
    })

    throw new TenantViolationError(auth.tenantId, resourceTenantId, tableName, recordId)
  }
}

/**
 * Fetch a record by ID and assert tenant ownership in one call.
 * Returns the record if it belongs to the user's tenant.
 * Throws 404 if not found, 403 if wrong tenant.
 */
export async function fetchWithTenantGuard<T extends { tenant_id: string }>(
  auth: AuthContext,
  table: string,
  recordId: string,
  columns: string = 'id, tenant_id',
): Promise<T> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from(table as never)
    .select(columns)
    .eq('id', recordId)
    .single()

  if (error || !data) {
    throw new AuthError(`${table} record not found`, 404)
  }

  const record = data as unknown as T
  await assertTenantOwnership(auth, record.tenant_id, table, recordId)
  return record
}
