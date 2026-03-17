/**
 * stage-transitions.ts
 * Query hooks for:
 *   - stage_transition_log  (Zone E — audit rail)
 *   - matter_risk_flags     (Zone A + Zone C — risk badges)
 *
 * Both tables created in migration 113-workplace-shell-tables.sql
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type {
  StageTransitionLogRow,
  StageTransitionLogInsert,
  MatterRiskFlagRow,
  MatterRiskFlagInsert,
  MatterRiskFlagUpdate,
  RiskFlagStatus,
} from '@/lib/types/database'

// ── Query key factories ──────────────────────────────────────────────────────

export const stageTransitionKeys = {
  all:         ['stage_transition_log'] as const,
  byMatter:    (matterId: string) => [...stageTransitionKeys.all, matterId] as const,
}

export const riskFlagKeys = {
  all:         ['matter_risk_flags'] as const,
  byMatter:    (matterId: string) => [...riskFlagKeys.all, matterId] as const,
  countByMatter: (matterId: string) => [...riskFlagKeys.all, matterId, 'count'] as const,
}

// ── Stage Transition Log ─────────────────────────────────────────────────────

/** Row returned with the joined user display name. */
export interface StageTransitionWithUser extends StageTransitionLogRow {
  users: {
    first_name: string | null
    last_name: string | null
    email: string
  } | null
}

/**
 * Fetch the last 20 stage transitions for a matter.
 * Used by Zone E (audit rail).
 */
export function useStageTransitionLog(matterId: string | null | undefined) {
  return useQuery({
    queryKey: stageTransitionKeys.byMatter(matterId ?? ''),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('stage_transition_log')
        .select(`
          id,
          tenant_id,
          matter_id,
          from_stage_id,
          to_stage_id,
          from_stage_name,
          to_stage_name,
          transition_type,
          override_reason,
          gate_snapshot,
          transitioned_by,
          created_at,
          users ( first_name, last_name, email )
        `)
        .eq('matter_id', matterId!)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) throw error
      return (data ?? []) as StageTransitionWithUser[]
    },
    enabled: !!matterId,
    staleTime: 30 * 1000,   // 30s — re-fetch frequently to stay current
    refetchOnWindowFocus: true,
  })
}

/**
 * Write a stage transition log entry.
 * Called by the advance-stage API route and any override flows.
 * Also invalidates Zone E and all stage state queries.
 */
export function useCreateStageTransition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: StageTransitionLogInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('stage_transition_log')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data as StageTransitionLogRow
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: stageTransitionKeys.byMatter(vars.matter_id) })
    },
    onError: () => {
      // Non-fatal — log silently; don't block stage advance
      console.error('[stage-transitions] Failed to write transition log entry')
    },
  })
}

// ── Matter Risk Flags ────────────────────────────────────────────────────────

/**
 * Fetch all open risk flags for a matter, ordered by severity then detected_at.
 * Used by Zone A (count pill) and Zone C (flag list).
 */
export function useMatterRiskFlags(matterId: string | null | undefined) {
  return useQuery({
    queryKey: riskFlagKeys.byMatter(matterId ?? ''),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_risk_flags')
        .select('*')
        .eq('matter_id', matterId!)
        .eq('status', 'open')
        .order('detected_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as MatterRiskFlagRow[]
    },
    enabled: !!matterId,
    staleTime: 60 * 1000,
  })
}

/**
 * Count of open risk flags — used by Zone A badge without loading full list.
 */
export function useMatterRiskFlagCount(matterId: string | null | undefined) {
  return useQuery({
    queryKey: riskFlagKeys.countByMatter(matterId ?? ''),
    queryFn: async () => {
      const supabase = createClient()
      const { count, error } = await supabase
        .from('matter_risk_flags')
        .select('*', { count: 'exact', head: true })
        .eq('matter_id', matterId!)
        .eq('status', 'open')
      if (error) return 0
      return count ?? 0
    },
    enabled: !!matterId,
    staleTime: 60 * 1000,
  })
}

/**
 * Create a new risk flag on a matter.
 * Used by Lawyer, Legal Assistant, and system automation.
 */
export function useCreateRiskFlag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: MatterRiskFlagInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_risk_flags')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data as MatterRiskFlagRow
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: riskFlagKeys.byMatter(vars.matter_id) })
      qc.invalidateQueries({ queryKey: riskFlagKeys.countByMatter(vars.matter_id) })
      toast.success('Risk flag raised')
    },
    onError: () => {
      toast.error('Failed to raise risk flag')
    },
  })
}

/**
 * Resolve or override a risk flag.
 * Requires resolution_note; for overrides also requires override_reason.
 */
export function useResolveRiskFlag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      matterId: string
      updates: MatterRiskFlagUpdate & { resolved_by: string }
    }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('matter_risk_flags')
        .update({
          ...input.updates,
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: riskFlagKeys.byMatter(vars.matterId) })
      qc.invalidateQueries({ queryKey: riskFlagKeys.countByMatter(vars.matterId) })
      toast.success('Risk flag resolved')
    },
    onError: () => {
      toast.error('Failed to resolve risk flag')
    },
  })
}
