/**
 * Matter delegation management service.
 *
 * Allows users to delegate access to their matters (or all matters)
 * to another user, with optional expiry and access level control.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditServer } from '@/lib/queries/audit-logs'
import { log } from '@/lib/utils/logger'

/**
 * Create a new matter delegation.
 *
 * @param matterId  -  if null, delegates access to all matters of the delegating user
 * @param accessLevel  -  'read' or 'read_write'
 * @param expiresAt  -  optional ISO timestamp; null = no expiry
 */
export async function createDelegation(
  supabase: SupabaseClient<Database>,
  delegatingUserId: string,
  delegateUserId: string,
  matterId: string | null,
  accessLevel: 'read' | 'read_write',
  reason: string | null,
  expiresAt: string | null,
): Promise<{ id: string }> {
  const admin = createAdminClient()

  if (delegatingUserId === delegateUserId) {
    throw new Error('Cannot delegate to yourself')
  }

  // Get tenant from delegating user
  const { data: delegator } = await admin
    .from('users')
    .select('tenant_id')
    .eq('id', delegatingUserId)
    .single()

  if (!delegator) throw new Error('Delegating user not found')

  // Ensure delegate is in the same tenant
  const { data: delegate } = await admin
    .from('users')
    .select('tenant_id')
    .eq('id', delegateUserId)
    .single()

  if (!delegate || delegate.tenant_id !== delegator.tenant_id) {
    throw new Error('Delegate user not found or in a different tenant')
  }

  // Validate expiry if provided
  if (expiresAt) {
    const expiry = new Date(expiresAt)
    if (expiry.getTime() <= Date.now()) {
      throw new Error('Expiry must be in the future')
    }
  }

  const { data: delegation, error } = await admin
    .from('matter_delegations')
    .insert({
      tenant_id: delegator.tenant_id,
      delegating_user_id: delegatingUserId,
      delegate_user_id: delegateUserId,
      matter_id: matterId,
      access_level: accessLevel,
      reason: reason?.trim() || null,
      expires_at: expiresAt,
    })
    .select('id')
    .single()

  if (error) {
    log.error('[Delegation] Failed to create delegation', { error })
    throw new Error('Failed to create delegation')
  }

  await logAuditServer({
    supabase: admin,
    tenantId: delegator.tenant_id,
    userId: delegatingUserId,
    entityType: 'matter_delegation',
    entityId: delegation.id,
    action: 'created',
    changes: {
      delegate_user_id: delegateUserId,
      matter_id: matterId,
      access_level: accessLevel,
      expires_at: expiresAt,
    },
  })

  return { id: delegation.id }
}

/**
 * Revoke a delegation by setting its expires_at to now.
 */
export async function revokeDelegation(
  supabase: SupabaseClient<Database>,
  delegationId: string,
  revokedBy: string,
): Promise<void> {
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('matter_delegations')
    .select('id, tenant_id, delegating_user_id, delegate_user_id, matter_id')
    .eq('id', delegationId)
    .single()

  if (!existing) throw new Error('Delegation not found')

  const { error } = await admin
    .from('matter_delegations')
    .update({ expires_at: new Date().toISOString() })
    .eq('id', delegationId)

  if (error) {
    log.error('[Delegation] Failed to revoke delegation', { error })
    throw new Error('Failed to revoke delegation')
  }

  await logAuditServer({
    supabase: admin,
    tenantId: existing.tenant_id,
    userId: revokedBy,
    entityType: 'matter_delegation',
    entityId: delegationId,
    action: 'revoked',
    changes: {
      delegate_user_id: existing.delegate_user_id,
      matter_id: existing.matter_id,
    },
  })
}

/**
 * Get active delegations where the given user is either delegating or a delegate.
 */
export async function getActiveDelegations(
  supabase: SupabaseClient<Database>,
  userId: string,
) {
  const admin = createAdminClient()

  const { data: user } = await admin
    .from('users')
    .select('tenant_id')
    .eq('id', userId)
    .single()

  if (!user) throw new Error('User not found')

  const { data, error } = await admin
    .from('matter_delegations')
    .select('*')
    .eq('tenant_id', user.tenant_id)
    .or(`delegating_user_id.eq.${userId},delegate_user_id.eq.${userId}`)
    .lte('starts_at', new Date().toISOString())
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('created_at', { ascending: false })

  if (error) {
    log.error('[Delegation] Failed to fetch active delegations', { error })
    throw new Error('Failed to fetch delegations')
  }

  return data ?? []
}
