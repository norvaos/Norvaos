import type { SupabaseClient } from '@supabase/supabase-js'

// ── Billing-view permission check ─────────────────────────────────────────────

const BILLING_VIEW_ALLOWED = new Set(['Admin'])

/** Structured log entry emitted on every billing permission denial. */
export interface BillingDeniedLog {
  event: 'billing_permission_denied'
  user_id: string
  tenant_id: string
  role_name: string | null
  route: string | null
  timestamp: string
}

/**
 * Emit a structured JSON log when billing access is denied.
 *
 * This is a pure logging side-effect  -  it never throws and never
 * alters the return value of checkBillingPermission.
 */
function logBillingDenied(entry: BillingDeniedLog): void {
  try {
    console.warn(JSON.stringify(entry))
  } catch {
    // Logging must never break the request path
  }
}

/**
 * Server-side billing:view permission check.
 *
 * Fetches the user's role and checks:
 *   1. Admin bypass (role name in BILLING_VIEW_ALLOWED set)
 *   2. Explicit billing.view === true in the role's permissions JSON
 *
 * Returns { allowed, roleName } so callers can include role in audit events.
 *
 * When denied, emits a structured JSON log via console.warn with:
 *   { event, user_id, tenant_id, role_name, route, timestamp }
 * This supports observability dashboards and 403 alerting without
 * altering control flow.
 *
 * @param route  -  optional route identifier for structured logging (e.g. "/api/invoices/[id]/pdf")
 */
export async function checkBillingPermission(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  route?: string,
): Promise<{ allowed: boolean; roleName: string | null }> {
  const { data: user } = await supabase
    .from('users')
    .select('role_id')
    .eq('id', userId)
    .eq('tenant_id', tenantId)
    .single()

  if (!user?.role_id) {
    logBillingDenied({
      event: 'billing_permission_denied',
      user_id: userId,
      tenant_id: tenantId,
      role_name: null,
      route: route ?? null,
      timestamp: new Date().toISOString(),
    })
    return { allowed: false, roleName: null }
  }

  const { data: role } = await supabase
    .from('roles')
    .select('name, permissions')
    .eq('id', user.role_id)
    .single()

  if (!role) {
    logBillingDenied({
      event: 'billing_permission_denied',
      user_id: userId,
      tenant_id: tenantId,
      role_name: null,
      route: route ?? null,
      timestamp: new Date().toISOString(),
    })
    return { allowed: false, roleName: null }
  }

  // Admin bypass
  if (role.name === 'Admin' || BILLING_VIEW_ALLOWED.has(role.name)) {
    return { allowed: true, roleName: role.name }
  }

  // Check billing.view permission in the role's permissions JSON
  const perms = role.permissions as Record<string, Record<string, boolean>> | null
  const allowed = perms?.billing?.view === true

  if (!allowed) {
    logBillingDenied({
      event: 'billing_permission_denied',
      user_id: userId,
      tenant_id: tenantId,
      role_name: role.name,
      route: route ?? null,
      timestamp: new Date().toISOString(),
    })
  }

  return { allowed, roleName: role.name }
}
