/**
 * Matter-scoped access control service.
 *
 * Provides server-side access checks using the DB function check_matter_access().
 * LOCKED: This service enforces all 9 access paths and restricted-matter rules.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/utils/logger'

export type MatterAccessPath =
  | 'admin_non_restricted'
  | 'admin_override_restricted'
  | 'responsible_lawyer'
  | 'originating_lawyer'
  | 'followup_lawyer'
  | 'team_member'
  | 'supervisor'
  | 'delegation'
  | 'break_glass'
  | 'none'

export interface MatterAccessInfo {
  hasAccess: boolean
  path: MatterAccessPath
  isRestricted: boolean
  delegationId?: string
  breakGlassId?: string
  supervisorOf?: string
}

/**
 * Check if a user has access to a specific matter.
 * Calls the DB function check_matter_access() for the authoritative answer.
 *
 * Use this in API routes before returning matter data.
 */
export async function checkMatterAccess(
  supabase: SupabaseClient<Database>,
  userId: string,
  matterId: string,
): Promise<boolean> {
  const admin = createAdminClient()
  const { data, error } = await (admin as any).rpc('check_matter_access', {
    p_user_id: userId,
    p_matter_id: matterId,
  })

  if (error) {
    log.error('[MatterAccess] check_matter_access RPC failed', { error, userId, matterId })
    return false
  }

  return data === true
}

/**
 * Get detailed access info — which path grants access to this matter.
 *
 * This mirrors the 9-path logic from check_matter_access() but returns
 * the specific path. Used for UI hints (e.g. "You have access via delegation").
 *
 * Always runs server-side with admin client to avoid RLS interference.
 */
export async function getMatterAccessInfo(
  supabase: SupabaseClient<Database>,
  userId: string,
  matterId: string,
): Promise<MatterAccessInfo> {
  const admin = createAdminClient()

  // Fetch matter and user in parallel
  const [matterResult, userResult] = await Promise.all([
    admin.from('matters').select('id, tenant_id, is_restricted, restricted_admin_override, responsible_lawyer_id, originating_lawyer_id, followup_lawyer_id, team_member_ids').eq('id', matterId).single(),
    admin.from('users').select('id, tenant_id, role_id').eq('id', userId).single(),
  ])

  const matter = matterResult.data
  const user = userResult.data

  if (!matter || !user) {
    return { hasAccess: false, path: 'none', isRestricted: false }
  }

  if (user.tenant_id !== matter.tenant_id) {
    return { hasAccess: false, path: 'none', isRestricted: matter.is_restricted ?? false }
  }

  const isRestricted = matter.is_restricted ?? false

  // Resolve role name
  let roleName: string | null = null
  if (user.role_id) {
    const { data: role } = await admin.from('roles').select('name').eq('id', user.role_id).single()
    roleName = role?.name ?? null
  }

  // Path 1: Admin on non-restricted matter
  if (roleName === 'Admin' && !isRestricted) {
    return { hasAccess: true, path: 'admin_non_restricted', isRestricted }
  }

  // Path 2: Admin with override on restricted matter
  if (roleName === 'Admin' && isRestricted && (matter.restricted_admin_override ?? false)) {
    return { hasAccess: true, path: 'admin_override_restricted', isRestricted }
  }

  // Path 3: Responsible lawyer
  if (matter.responsible_lawyer_id === userId) {
    return { hasAccess: true, path: 'responsible_lawyer', isRestricted }
  }

  // Path 4: Originating lawyer
  if (matter.originating_lawyer_id === userId) {
    return { hasAccess: true, path: 'originating_lawyer', isRestricted }
  }

  // Path 5: Follow-up lawyer
  if (matter.followup_lawyer_id === userId) {
    return { hasAccess: true, path: 'followup_lawyer', isRestricted }
  }

  // Path 6: Team member
  const teamMemberIds = (matter.team_member_ids ?? []) as string[]
  if (teamMemberIds.includes(userId)) {
    return { hasAccess: true, path: 'team_member', isRestricted }
  }

  // Path 7: Supervisor of an assigned person
  const { data: supervision } = await admin
    .from('user_supervision')
    .select('supervisee_user_id')
    .eq('supervisor_user_id', userId)
    .eq('is_active', true)
    .eq('tenant_id', matter.tenant_id)

  if (supervision) {
    const superviseeIds = supervision.map((s: { supervisee_user_id: string }) => s.supervisee_user_id)
    const assignedUsers = [
      matter.responsible_lawyer_id,
      matter.originating_lawyer_id,
      matter.followup_lawyer_id,
      ...teamMemberIds,
    ].filter(Boolean) as string[]

    const match = assignedUsers.find((uid) => superviseeIds.includes(uid))
    if (match) {
      return { hasAccess: true, path: 'supervisor', isRestricted, supervisorOf: match }
    }
  }

  // Path 8: Active delegation
  const { data: delegation } = await admin
    .from('matter_delegations')
    .select('id')
    .eq('delegate_user_id', userId)
    .eq('tenant_id', matter.tenant_id)
    .lte('starts_at', new Date().toISOString())
    .or(`matter_id.eq.${matterId},matter_id.is.null`)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .limit(1)
    .maybeSingle()

  if (delegation) {
    return { hasAccess: true, path: 'delegation', isRestricted, delegationId: delegation.id }
  }

  // Path 9: Active break-glass
  const { data: breakGlass } = await admin
    .from('break_glass_access_grants')
    .select('id')
    .eq('granted_to', userId)
    .eq('tenant_id', matter.tenant_id)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .or(`matter_id.eq.${matterId},matter_id.is.null`)
    .limit(1)
    .maybeSingle()

  if (breakGlass) {
    return { hasAccess: true, path: 'break_glass', isRestricted, breakGlassId: breakGlass.id }
  }

  return { hasAccess: false, path: 'none', isRestricted }
}
