/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * IRCC Forms Engine  -  Answer History & Reuse Log React Query Hooks
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Module M: Schema, Versioning, and Audit Trail.
 *
 * Query hooks for the append-only answer history audit trail and reuse log,
 * backed by the form_instance_answer_history and reuse_log tables
 * (migration 145).
 *
 * Query hooks:
 *   useInstanceAnswerHistory   -  all history rows for an instance
 *   useFieldAnswerHistory      -  history for a single field in an instance
 *   useInstanceReuseLog        -  reuse events targeting an instance
 *   useMatterReuseLog          -  reuse events across all instances in a matter
 */

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { AnswerSource } from '@/lib/ircc/types/answers'

// ── Types ────────────────────────────────────────────────────────────────────

export interface AnswerHistoryRow {
  id: string
  form_instance_id: string
  profile_path: string
  old_value: unknown
  new_value: unknown
  source: AnswerSource
  source_origin: string | null
  changed_by: string | null
  changed_by_name?: string | null
  stale_triggered: boolean
  changed_at: string
}

export interface ReuseLogRow {
  id: string
  reuse_type: 'cross_form' | 'cross_matter' | 'canonical_prefill'
  target_instance_id: string
  target_profile_path: string
  source_instance_id: string | null
  source_matter_id: string | null
  source_canonical_field_id: string | null
  value: unknown
  accepted: boolean | null
  accepted_by: string | null
  accepted_at: string | null
  created_at: string
}

// ── Query Keys ───────────────────────────────────────────────────────────────

export const answerHistoryKeys = {
  all: ['answer-history'] as const,
  instanceHistory: (instanceId: string) =>
    [...answerHistoryKeys.all, 'instance', instanceId] as const,
  fieldHistory: (instanceId: string, profilePath: string) =>
    [...answerHistoryKeys.all, 'field', instanceId, profilePath] as const,
  reuseLog: (instanceId: string) =>
    [...answerHistoryKeys.all, 'reuse', instanceId] as const,
  matterReuseLog: (matterId: string) =>
    [...answerHistoryKeys.all, 'matter-reuse', matterId] as const,
}

// ── Query: Instance Answer History ───────────────────────────────────────────

/**
 * Fetch all answer history rows for a form instance, ordered by changed_at DESC.
 * Joins users table to resolve changed_by into a display name.
 */
export function useInstanceAnswerHistory(instanceId: string) {
  return useQuery({
    queryKey: answerHistoryKeys.instanceHistory(instanceId),
    enabled: !!instanceId,
    staleTime: 30_000,
    queryFn: async (): Promise<AnswerHistoryRow[]> => {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('form_instance_answer_history' as never)
        .select('id, form_instance_id, profile_path, old_value, new_value, source, source_origin, changed_by, stale_triggered, changed_at, users:changed_by ( full_name )')
        .eq('form_instance_id', instanceId)
        .order('changed_at', { ascending: false })

      if (error) throw new Error(error.message)

      const rows = data as unknown as Array<
        Omit<AnswerHistoryRow, 'changed_by_name'> & {
          users: { full_name: string } | null
        }
      >

      return rows.map((row) => ({
        id: row.id,
        form_instance_id: row.form_instance_id,
        profile_path: row.profile_path,
        old_value: row.old_value,
        new_value: row.new_value,
        source: row.source,
        source_origin: row.source_origin,
        changed_by: row.changed_by,
        changed_by_name: row.users?.full_name ?? null,
        stale_triggered: row.stale_triggered,
        changed_at: row.changed_at,
      }))
    },
  })
}

// ── Query: Field Answer History ──────────────────────────────────────────────

/**
 * Fetch answer history for a single field (profile_path) in a form instance.
 */
export function useFieldAnswerHistory(instanceId: string, profilePath: string) {
  return useQuery({
    queryKey: answerHistoryKeys.fieldHistory(instanceId, profilePath),
    enabled: !!instanceId && !!profilePath,
    staleTime: 30_000,
    queryFn: async (): Promise<AnswerHistoryRow[]> => {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('form_instance_answer_history' as never)
        .select('id, form_instance_id, profile_path, old_value, new_value, source, source_origin, changed_by, stale_triggered, changed_at, users:changed_by ( full_name )')
        .eq('form_instance_id', instanceId)
        .eq('profile_path', profilePath)
        .order('changed_at', { ascending: false })

      if (error) throw new Error(error.message)

      const rows = data as unknown as Array<
        Omit<AnswerHistoryRow, 'changed_by_name'> & {
          users: { full_name: string } | null
        }
      >

      return rows.map((row) => ({
        id: row.id,
        form_instance_id: row.form_instance_id,
        profile_path: row.profile_path,
        old_value: row.old_value,
        new_value: row.new_value,
        source: row.source,
        source_origin: row.source_origin,
        changed_by: row.changed_by,
        changed_by_name: row.users?.full_name ?? null,
        stale_triggered: row.stale_triggered,
        changed_at: row.changed_at,
      }))
    },
  })
}

// ── Query: Instance Reuse Log ────────────────────────────────────────────────

/**
 * Fetch reuse log entries where target_instance_id matches the given instance.
 */
export function useInstanceReuseLog(instanceId: string) {
  return useQuery({
    queryKey: answerHistoryKeys.reuseLog(instanceId),
    enabled: !!instanceId,
    staleTime: 60_000,
    queryFn: async (): Promise<ReuseLogRow[]> => {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('reuse_log' as never)
        .select('id, reuse_type, target_instance_id, target_profile_path, source_instance_id, source_matter_id, source_canonical_field_id, value, accepted, accepted_by, accepted_at, created_at')
        .eq('target_instance_id', instanceId)
        .order('created_at', { ascending: false })

      if (error) throw new Error(error.message)

      return data as unknown as ReuseLogRow[]
    },
  })
}

// ── Query: Matter Reuse Log ──────────────────────────────────────────────────

/**
 * Fetch all reuse log entries for all form instances belonging to a matter.
 * First resolves instance IDs from matter_form_instances, then fetches
 * reuse_log rows where target_instance_id is in that set.
 */
export function useMatterReuseLog(matterId: string) {
  return useQuery({
    queryKey: answerHistoryKeys.matterReuseLog(matterId),
    enabled: !!matterId,
    staleTime: 60_000,
    queryFn: async (): Promise<ReuseLogRow[]> => {
      const supabase = createClient()

      // 1. Get all instance IDs for this matter
      const { data: instances, error: instanceError } = await supabase
        .from('matter_form_instances' as never)
        .select('id')
        .eq('matter_id', matterId)

      if (instanceError) throw new Error(instanceError.message)

      const instanceIds = (instances as unknown as Array<{ id: string }>).map((i) => i.id)
      if (instanceIds.length === 0) return []

      // 2. Fetch reuse_log rows for those instances
      const { data, error } = await supabase
        .from('reuse_log' as never)
        .select('id, reuse_type, target_instance_id, target_profile_path, source_instance_id, source_matter_id, source_canonical_field_id, value, accepted, accepted_by, accepted_at, created_at')
        .in('target_instance_id', instanceIds)
        .order('created_at', { ascending: false })

      if (error) throw new Error(error.message)

      return data as unknown as ReuseLogRow[]
    },
  })
}
