/**
 * User supervision management service.
 *
 * Manages supervisor ↔ supervisee relationships within a tenant.
 * Supervisors gain access to all matters assigned to their supervisees.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditServer } from '@/lib/queries/audit-logs'
import { log } from '@/lib/utils/logger'

/**
 * Add a supervisor ↔ supervisee relationship.
 *
 * @throws Error if relationship already exists or users are in different tenants
 */
export async function addSupervision(
  supabase: SupabaseClient<Database>,
  supervisorId: string,
  superviseeId: string,
  createdBy: string,
): Promise<{ id: string }> {
  const admin = createAdminClient()

  if (supervisorId === superviseeId) {
    throw new Error('A user cannot supervise themselves')
  }

  // Verify both users exist and are in the same tenant
  const [supervisorResult, superviseeResult] = await Promise.all([
    admin.from('users').select('tenant_id').eq('id', supervisorId).single(),
    admin.from('users').select('tenant_id').eq('id', superviseeId).single(),
  ])

  const supervisor = supervisorResult.data
  const supervisee = superviseeResult.data

  if (!supervisor || !supervisee) {
    throw new Error('One or both users not found')
  }

  if (supervisor.tenant_id !== supervisee.tenant_id) {
    throw new Error('Users must be in the same tenant')
  }

  const { data: supervision, error } = await admin
    .from('user_supervision')
    .insert({
      tenant_id: supervisor.tenant_id,
      supervisor_user_id: supervisorId,
      supervisee_user_id: superviseeId,
      created_by: createdBy,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('This supervision relationship already exists')
    }
    log.error('[Supervision] Failed to create supervision', { error })
    throw new Error('Failed to create supervision relationship')
  }

  await logAuditServer({
    supabase: admin,
    tenantId: supervisor.tenant_id,
    userId: createdBy,
    entityType: 'user_supervision',
    entityId: supervision.id,
    action: 'created',
    changes: {
      supervisor_user_id: supervisorId,
      supervisee_user_id: superviseeId,
    },
  })

  return { id: supervision.id }
}

/**
 * Remove (deactivate) a supervision relationship.
 */
export async function removeSupervision(
  supabase: SupabaseClient<Database>,
  supervisionId: string,
  removedBy: string,
): Promise<void> {
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('user_supervision')
    .select('id, tenant_id, supervisor_user_id, supervisee_user_id')
    .eq('id', supervisionId)
    .single()

  if (!existing) throw new Error('Supervision relationship not found')

  const { error } = await admin
    .from('user_supervision')
    .update({ is_active: false })
    .eq('id', supervisionId)

  if (error) {
    log.error('[Supervision] Failed to remove supervision', { error })
    throw new Error('Failed to remove supervision relationship')
  }

  await logAuditServer({
    supabase: admin,
    tenantId: existing.tenant_id,
    userId: removedBy,
    entityType: 'user_supervision',
    entityId: supervisionId,
    action: 'deactivated',
    changes: {
      supervisor_user_id: existing.supervisor_user_id,
      supervisee_user_id: existing.supervisee_user_id,
    },
  })
}

/**
 * Get all active supervisees for a given supervisor.
 */
export async function getSupervisees(
  supabase: SupabaseClient<Database>,
  supervisorId: string,
) {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('user_supervision')
    .select('id, supervisee_user_id, created_at, users!user_supervision_supervisee_user_id_fkey(id, first_name, last_name, email, avatar_url)')
    .eq('supervisor_user_id', supervisorId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) {
    // Fallback without join
    const { data: fallbackData, error: fallbackError } = await admin
      .from('user_supervision')
      .select('id, supervisee_user_id, created_at')
      .eq('supervisor_user_id', supervisorId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (fallbackError) {
      log.error('[Supervision] Failed to fetch supervisees', { error: fallbackError })
      throw new Error('Failed to fetch supervisees')
    }
    return fallbackData ?? []
  }

  return data ?? []
}

/**
 * Get all active supervisors for a given user.
 */
export async function getSupervisors(
  supabase: SupabaseClient<Database>,
  userId: string,
) {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('user_supervision')
    .select('id, supervisor_user_id, created_at, users!user_supervision_supervisor_user_id_fkey(id, first_name, last_name, email, avatar_url)')
    .eq('supervisee_user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) {
    // Fallback without join
    const { data: fallbackData, error: fallbackError } = await admin
      .from('user_supervision')
      .select('id, supervisor_user_id, created_at')
      .eq('supervisee_user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (fallbackError) {
      log.error('[Supervision] Failed to fetch supervisors', { error: fallbackError })
      throw new Error('Failed to fetch supervisors')
    }
    return fallbackData ?? []
  }

  return data ?? []
}
