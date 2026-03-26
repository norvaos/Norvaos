/**
 * Server-side permission enforcement utility.
 *
 * Uses the pre-fetched role from AuthContext  -  ZERO additional DB calls.
 * authenticateRequest() resolves the user's role + permissions once;
 * this function simply reads from that context.
 *
 * Throws AuthError on failure  -  use in try/catch in route handlers.
 *
 * Usage in API routes:
 *   const auth = await authenticateRequest()
 *   requirePermission(auth, 'settings', 'edit')
 */

import { hasPermission } from '@/lib/utils/permissions'
import { AuthError, type AuthContext, type AuthRole } from './auth'

export interface UserRole {
  name: string
  permissions: Record<string, Record<string, boolean>>
  is_system: boolean
}

/**
 * Require that the authenticated user has a specific permission.
 * Throws AuthError (403) if the user lacks the permission.
 * Returns the user's role object on success.
 *
 * ZERO DB calls  -  reads from auth.role pre-populated by authenticateRequest().
 */
export function requirePermission(
  auth: AuthContext,
  entity: string,
  action: string,
): UserRole {
  if (!auth.role) {
    throw new AuthError('No role assigned', 403)
  }

  const userRole: UserRole = {
    name: auth.role.name,
    permissions: auth.role.permissions,
    is_system: auth.role.is_system,
  }

  if (!hasPermission(userRole, entity, action)) {
    throw new AuthError(`Permission denied: ${entity}:${action}`, 403)
  }

  return userRole
}
