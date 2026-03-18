import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { FrontDeskHeader } from '@/components/front-desk/front-desk-header'

/**
 * Front Desk Layout — restricted interface with NO sidebar.
 *
 * Rule #10: Front Desk Mode is a separate locked interface.
 *           Own route group, no sidebar, enforced by middleware AND server.
 *           URL typing must not bypass restrictions.
 *
 * Requires: front_desk:view permission.
 *
 * Feature flag: tenant.feature_flags.front_desk_mode must be enabled.
 */
export default async function FrontDeskLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Server-side auth check
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get user's tenant and role.
  // A user may belong to multiple tenants (one row per tenant). We resolve the
  // active tenant via the cookie written by persistActiveTenant() on the client.
  // If no cookie, we fall back to the most recently created row.
  const admin = createAdminClient()
  const cookieStore = await cookies()
  const activeTenantId = cookieStore.get('norvaos-active-tenant')?.value

  let usersQuery = admin
    .from('users')
    .select('id, first_name, last_name, avatar_url, tenant_id, role_id')
    .eq('auth_user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)

  if (activeTenantId) {
    usersQuery = usersQuery.eq('tenant_id', activeTenantId) as typeof usersQuery
  }

  const { data: userRows } = await usersQuery
  const userData = userRows?.[0] ?? null

  if (!userData) {
    redirect('/login')
  }

  // Check role has front_desk:view permission
  let hasPermission = false
  if (userData.role_id) {
    const { data: role } = await admin
      .from('roles')
      .select('name, permissions')
      .eq('id', userData.role_id)
      .single()

    if (role) {
      if (role.name === 'Admin') {
        hasPermission = true
      } else {
        const perms = (role.permissions ?? {}) as Record<string, Record<string, boolean>>
        hasPermission = perms.front_desk?.view === true
      }
    }
  }

  if (!hasPermission) {
    redirect('/')
  }

  // Check feature flag — reads from the top-level feature_flags column,
  // NOT settings.feature_flags (which is a different, nested key).
  const { data: tenant } = await admin
    .from('tenants')
    .select('name, feature_flags')
    .eq('id', userData.tenant_id)
    .single()

  const featureFlags = (tenant?.feature_flags ?? {}) as Record<string, boolean>

  if (!featureFlags.front_desk_mode) {
    redirect('/')
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <FrontDeskHeader
        userId={userData.id}
        userName={[userData.first_name, userData.last_name].filter(Boolean).join(' ') || 'User'}
        avatarUrl={userData.avatar_url}
        firmName={tenant?.name ?? 'Law Office'}
      />
      <main className="flex-1">
        {children}
      </main>
    </div>
  )
}
