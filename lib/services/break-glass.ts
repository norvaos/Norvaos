/**
 * Break-glass access management service.
 *
 * Provides time-limited emergency access to matters (max 72 hours).
 * All grants are audited. Grants can be revoked before expiry.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditServer } from '@/lib/queries/audit-logs'
import { log } from '@/lib/utils/logger'

const MAX_BREAK_GLASS_HOURS = 72

/**
 * Grant break-glass access to a user for a specific matter or all matters.
 *
 * @param matterId  -  if null, grants access to all matters of the target user
 * @param expiresAt  -  must be within 72 hours of now
 * @throws Error if expiresAt exceeds 72 hours
 */
export async function grantBreakGlass(
  supabase: SupabaseClient<Database>,
  grantedTo: string,
  grantedBy: string,
  matterId: string | null,
  reason: string,
  expiresAt: string,
): Promise<{ id: string }> {
  const admin = createAdminClient()

  // Enforce 72-hour max on server side
  const now = new Date()
  const expiry = new Date(expiresAt)
  const hoursDiff = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60)

  if (hoursDiff > MAX_BREAK_GLASS_HOURS) {
    throw new Error(`Break-glass access cannot exceed ${MAX_BREAK_GLASS_HOURS} hours`)
  }

  if (hoursDiff <= 0) {
    throw new Error('Expiry must be in the future')
  }

  if (!reason || reason.trim().length < 5) {
    throw new Error('A meaningful reason is required for break-glass access')
  }

  // Get tenant from the granting user
  const { data: grantor } = await admin
    .from('users')
    .select('tenant_id')
    .eq('id', grantedBy)
    .single()

  if (!grantor) throw new Error('Granting user not found')

  const { data: grant, error } = await admin
    .from('break_glass_access_grants')
    .insert({
      tenant_id: grantor.tenant_id,
      granted_to: grantedTo,
      granted_by: grantedBy,
      matter_id: matterId,
      target_user_id: grantedTo,
      reason: reason.trim(),
      expires_at: expiresAt,
    })
    .select('id')
    .single()

  if (error) {
    log.error('[BreakGlass] Failed to create grant', { error })
    throw new Error('Failed to create break-glass grant')
  }

  // Audit with high severity
  await logAuditServer({
    supabase: admin,
    tenantId: grantor.tenant_id,
    userId: grantedBy,
    entityType: 'break_glass_access_grant',
    entityId: grant.id,
    action: 'granted',
    changes: {
      granted_to: grantedTo,
      matter_id: matterId,
      reason: reason.trim(),
      expires_at: expiresAt,
    },
    metadata: { severity: 'high' },
  })

  return { id: grant.id }
}

/**
 * Revoke an active break-glass grant before its expiry.
 */
export async function revokeBreakGlass(
  supabase: SupabaseClient<Database>,
  grantId: string,
  revokedBy: string,
): Promise<void> {
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('break_glass_access_grants')
    .select('id, tenant_id, granted_to, matter_id, revoked_at')
    .eq('id', grantId)
    .single()

  if (!existing) throw new Error('Break-glass grant not found')
  if (existing.revoked_at) throw new Error('Grant is already revoked')

  const { error } = await admin
    .from('break_glass_access_grants')
    .update({ revoked_at: new Date().toISOString(), revoked_by: revokedBy })
    .eq('id', grantId)

  if (error) {
    log.error('[BreakGlass] Failed to revoke grant', { error })
    throw new Error('Failed to revoke break-glass grant')
  }

  await logAuditServer({
    supabase: admin,
    tenantId: existing.tenant_id,
    userId: revokedBy,
    entityType: 'break_glass_access_grant',
    entityId: grantId,
    action: 'revoked',
    changes: { granted_to: existing.granted_to, matter_id: existing.matter_id },
    metadata: { severity: 'high' },
  })
}

/**
 * Get all active (non-revoked, non-expired) break-glass grants for a tenant.
 */
export async function getActiveBreakGlassGrants(
  supabase: SupabaseClient<Database>,
  tenantId: string,
) {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('break_glass_access_grants')
    .select('*')
    .eq('tenant_id', tenantId)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('granted_at', { ascending: false })

  if (error) {
    log.error('[BreakGlass] Failed to fetch active grants', { error })
    throw new Error('Failed to fetch break-glass grants')
  }

  return data ?? []
}
