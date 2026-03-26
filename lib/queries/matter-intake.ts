import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { toast } from 'sonner'
import { gatingKeys } from '@/lib/queries/matter-types'
import type { IntakePrefillResult } from '@/lib/services/intake-prefill'

type MatterIntake = Database['public']['Tables']['matter_intake']['Row']
type MatterIntakeInsert = Database['public']['Tables']['matter_intake']['Insert']

// ─── Query Key Factory ──────────────────────────────────────────────────────

export const intakeKeys = {
  all: ['matter_intake'] as const,
  detail: (matterId: string) => [...intakeKeys.all, matterId] as const,
  prefill: (matterId: string) => [...intakeKeys.all, 'prefill', matterId] as const,
  riskOverview: (tenantId: string, practiceAreaId?: string) =>
    [...intakeKeys.all, 'risk_overview', tenantId, practiceAreaId ?? 'all'] as const,
}

// ─── Fetch Intake ───────────────────────────────────────────────────────────

// Lean column fragment  -  only the 16 columns actually consumed by UI components.
// Avoids fetching 37 columns via SELECT * (100/20 compliance).
const MATTER_INTAKE_COLUMNS = [
  'id',
  'matter_id',
  'tenant_id',
  'intake_status',
  'program_category',
  'processing_stream',
  'jurisdiction',
  'intake_delegation',
  'risk_level',
  'risk_score',
  'risk_override_level',
  'risk_override_reason',
  'red_flags',
  'completion_pct',
  'created_at',
  'updated_at',
].join(', ')

/**
 * Fetch the matter_intake record for a given matter.
 * Returns null if no intake record exists yet.
 */
export function useMatterIntake(matterId: string) {
  return useQuery({
    queryKey: intakeKeys.detail(matterId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_intake')
        .select(MATTER_INTAKE_COLUMNS)
        .eq('matter_id', matterId)
        .maybeSingle()

      if (error) throw error
      return data as MatterIntake | null
    },
    enabled: !!matterId,
  })
}

// ─── Intake Prefill from Lead Snapshot ──────────────────────────────────────

/**
 * Reads ONLY the lead_intake_snapshot (1 column) from matter_intake and
 * returns a flat answer map via the intake-prefill service.
 * Does NOT re-fetch from leads, lead_intake_profiles, or intake_submissions.
 */
export function useIntakePrefill(matterId: string) {
  return useQuery({
    queryKey: intakeKeys.prefill(matterId),
    queryFn: async (): Promise<IntakePrefillResult> => {
      const supabase = createClient()
      const { getIntakePrefill } = await import('@/lib/services/intake-prefill')
      return getIntakePrefill(supabase, matterId)
    },
    enabled: !!matterId,
    staleTime: 5 * 60 * 1000, // Snapshot is immutable  -  5 min cache
  })
}

// ─── Upsert Intake (via server-side API) ─────────────────────────────────────

/**
 * Save strategic variables and auto-trigger validation + risk scoring.
 * Routes through /api/matters/[id]/save-intake for server-side enforcement.
 */
export function useUpsertMatterIntake() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      matterId,
      tenantId,
      data,
    }: {
      matterId: string
      tenantId: string
      data: Partial<MatterIntakeInsert>
    }) => {
      const response = await fetch(`/api/matters/${matterId}/save-intake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to save intake')
      }
      return result
    },
    onSuccess: (result, vars) => {
      queryClient.invalidateQueries({ queryKey: intakeKeys.detail(vars.matterId) })
      queryClient.invalidateQueries({ queryKey: ['matters'] })
      queryClient.invalidateQueries({ queryKey: gatingKeys.check(vars.matterId) })
      toast.success('Core data saved')

      // Show validation feedback if there are issues
      if (result.validation && !result.validation.isValid) {
        toast.warning(`${result.validation.hardStops} issue(s) found`)
      }
    },
    onError: () => {
      toast.error('Failed to save core data')
    },
  })
}

// ─── Override Risk ──────────────────────────────────────────────────────────

/**
 * Apply a lawyer risk override via server-side API route.
 * The server calls a transactional RPC that atomically:
 * 1. Updates matter_intake override fields
 * 2. Inserts into risk_override_history (mandatory)
 * 3. Inserts audit log (mandatory)
 * If any step fails the entire transaction rolls back.
 */
export function useOverrideRisk() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      matterId,
      overrideLevel,
      overrideReason,
      previousLevel,
    }: {
      matterId: string
      overrideLevel: string
      overrideReason: string
      previousLevel: string | null
    }) => {
      const res = await fetch(`/api/matters/${matterId}/override-risk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrideLevel, overrideReason, previousLevel }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to apply risk override')
      }
      return res.json()
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: intakeKeys.detail(vars.matterId) })
      queryClient.invalidateQueries({ queryKey: ['matters'] })
      queryClient.invalidateQueries({ queryKey: gatingKeys.check(vars.matterId) })
      toast.success('Risk override applied')
    },
    onError: () => {
      toast.error('Failed to apply risk override')
    },
  })
}

// ─── Recalculate Risk ───────────────────────────────────────────────────────

/**
 * Trigger server-side validation + risk recalculation.
 */
export function useRecalculateRisk() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ matterId }: { matterId: string }) => {
      const response = await fetch(`/api/matters/${matterId}/validate-intake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Validation failed')
      }

      return data as {
        success: true
        validation: { hardStops: number; redFlags: number; isValid: boolean }
        risk: { score: number; level: string }
        completionPct: number
        intakeStatus: string
      }
    },
    onSuccess: (result, vars) => {
      queryClient.invalidateQueries({ queryKey: intakeKeys.detail(vars.matterId) })
      queryClient.invalidateQueries({ queryKey: ['matters'] })
      queryClient.invalidateQueries({ queryKey: gatingKeys.check(vars.matterId) })

      if (result.validation.isValid) {
        toast.success(`Risk score: ${result.risk.score} (${result.risk.level})`)
      } else {
        toast.warning(`${result.validation.hardStops} issue(s) found  -  review required`)
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to validate intake')
    },
  })
}

// ─── Dynamic Intake Answers (from Onboarding intake questions) ───────────────

export const dynamicIntakeKeys = {
  all: ['matter_dynamic_intake_answers'] as const,
  byMatter: (matterId: string) => [...dynamicIntakeKeys.all, matterId] as const,
}

export const intakeRiskKeys = {
  all: ['matter_intake_risk_flags'] as const,
  byMatter: (matterId: string) => [...intakeRiskKeys.all, matterId] as const,
}

export interface DynamicIntakeAnswers {
  id: string
  matter_id: string
  answers: Record<string, string | boolean | null>
  completed_at: string | null
  completed_by: string | null
  created_at: string
  updated_at: string
}

export interface IntakeRiskFlag {
  id: string
  matter_id: string
  field_key: string
  intake_value: string | null
  ircc_value: string | null
  severity: 'critical' | 'warning'
  resolved_at: string | null
  resolved_by: string | null
  note: string | null
  created_at: string
}

/**
 * Fetch the dynamic intake answers for a matter.
 */
export function useMatterDynamicIntakeAnswers(matterId: string | null | undefined) {
  return useQuery({
    queryKey: dynamicIntakeKeys.byMatter(matterId ?? ''),
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('matter_dynamic_intake_answers')
        .select('*')
        .eq('matter_id', matterId)
        .maybeSingle()
      if (error) throw error
      return data as DynamicIntakeAnswers | null
    },
    enabled: !!matterId,
    staleTime: 30_000,
  })
}

/**
 * Save / upsert dynamic intake answers for a matter.
 */
export function useSaveMatterDynamicIntake() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      matterId: string
      tenantId: string
      answers: Record<string, string | boolean | null>
      completed?: boolean
    }) => {
      const supabase = createClient()
      const payload: Record<string, unknown> = {
        matter_id: input.matterId,
        tenant_id: input.tenantId,
        answers: input.answers,
        updated_at: new Date().toISOString(),
      }
      if (input.completed) {
        payload.completed_at = new Date().toISOString()
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('matter_dynamic_intake_answers')
        .upsert(payload, { onConflict: 'matter_id' })
        .select()
        .single()
      if (error) throw error
      return data as DynamicIntakeAnswers
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: dynamicIntakeKeys.byMatter(vars.matterId) })
    },
    onError: () => {
      toast.error('Failed to save intake answers')
    },
  })
}

/**
 * Fetch risk flags for a matter (cross-reference results).
 */
export function useMatterIntakeRiskFlags(matterId: string | null | undefined) {
  return useQuery({
    queryKey: intakeRiskKeys.byMatter(matterId ?? ''),
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('matter_intake_risk_flags')
        .select('*')
        .eq('matter_id', matterId)
        .is('resolved_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as IntakeRiskFlag[]
    },
    enabled: !!matterId,
    staleTime: 30_000,
  })
}

/**
 * Resolve (dismiss) an intake risk flag with an optional note.
 */
export function useResolveIntakeRiskFlag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { flagId: string; matterId: string; note?: string }) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('matter_intake_risk_flags')
        .update({
          resolved_at: new Date().toISOString(),
          note: input.note ?? null,
        })
        .eq('id', input.flagId)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: intakeRiskKeys.byMatter(vars.matterId) })
      toast.success('Risk flag resolved')
    },
    onError: () => {
      toast.error('Failed to resolve risk flag')
    },
  })
}

// ─── Risk Overview (Dashboard) ──────────────────────────────────────────────

/**
 * Aggregate risk_level counts across all matters for the dashboard widget.
 * Optionally filtered by practice area.
 */
export function useRiskOverview(tenantId: string, practiceAreaId?: string) {
  return useQuery({
    queryKey: intakeKeys.riskOverview(tenantId, practiceAreaId),
    queryFn: async () => {
      const supabase = createClient()

      // Query matters that have a risk_level set
      let query = supabase
        .from('matters')
        .select('risk_level')
        .eq('tenant_id', tenantId)
        .not('risk_level', 'is', null)
        .in('status', ['active', 'intake'])

      if (practiceAreaId && practiceAreaId !== 'all') {
        query = query.eq('practice_area_id', practiceAreaId)
      }

      const { data, error } = await query

      if (error) throw error

      // Aggregate counts
      const counts = { low: 0, medium: 0, high: 0, critical: 0, total: 0 }
      for (const row of data ?? []) {
        const level = row.risk_level as keyof typeof counts
        if (level in counts) {
          counts[level]++
          counts.total++
        }
      }

      return counts
    },
    enabled: !!tenantId,
    staleTime: 2 * 60 * 1000,
  })
}
