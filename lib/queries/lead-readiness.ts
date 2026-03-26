import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { LeadReadinessResult, LeadMissingField } from '@/lib/services/lead-readiness-engine'
import type { ConflictCheckResult } from '@/lib/services/conflict-check-alpha'
import type { JurisdictionMatchResult } from '@/lib/services/jurisdiction-matcher'

// ─── Query Key Factories ─────────────────────────────────────────────────────

export const leadReadinessKeys = {
  all: ['lead_readiness'] as const,
  detail: (leadId: string) => [...leadReadinessKeys.all, leadId] as const,
}

export const conflictCheckKeys = {
  all: ['lead_conflict_check'] as const,
  detail: (leadId: string) => [...conflictCheckKeys.all, leadId] as const,
}

export const jurisdictionKeys = {
  all: ['jurisdictions'] as const,
  list: () => [...jurisdictionKeys.all, 'list'] as const,
  match: (leadId: string) => [...jurisdictionKeys.all, 'match', leadId] as const,
  history: (leadId: string) => [...jurisdictionKeys.all, 'history', leadId] as const,
}

// ─── Lead Readiness Score ────────────────────────────────────────────────────

/**
 * Fetch or calculate the readiness score for a lead.
 * Calls the server-side API which invokes fn_calculate_lead_readiness.
 */
export function useLeadReadiness(leadId: string | null | undefined) {
  return useQuery({
    queryKey: leadReadinessKeys.detail(leadId ?? ''),
    queryFn: async (): Promise<LeadReadinessResult> => {
      const response = await fetch(`/api/leads/${leadId}/readiness`)
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch readiness')
      }
      return data as LeadReadinessResult
    },
    enabled: !!leadId,
    staleTime: 30_000,
  })
}

/**
 * Recalculate readiness score (mutation — forces refresh).
 */
export function useRecalculateReadiness() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ leadId }: { leadId: string }) => {
      const response = await fetch(`/api/leads/${leadId}/readiness`)
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Readiness calculation failed')
      }
      return data as LeadReadinessResult
    },
    onSuccess: (result, vars) => {
      queryClient.invalidateQueries({ queryKey: leadReadinessKeys.detail(vars.leadId) })
      queryClient.invalidateQueries({ queryKey: ['leads'] })

      if (result.score >= 70) {
        toast.success(`Readiness: ${result.score}% — Lead is conversion-ready`)
      } else {
        toast.warning(`Readiness: ${result.score}% — ${result.missing?.length ?? 0} field(s) missing`)
      }
    },
    onError: () => {
      toast.error('Failed to calculate readiness')
    },
  })
}

/**
 * Convenience hook: get just the missing fields from readiness result.
 */
export function useLeadMissingFields(leadId: string | null | undefined): LeadMissingField[] {
  const { data } = useLeadReadiness(leadId)
  return data?.missing ?? []
}

// ─── Conflict Check Alpha ────────────────────────────────────────────────────

/**
 * Run the conflict check for a lead (email + passport scan).
 */
export function useRunConflictCheck() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ leadId }: { leadId: string }) => {
      const response = await fetch(`/api/leads/${leadId}/conflict-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Conflict check failed')
      }
      return data as ConflictCheckResult & { success: true }
    },
    onSuccess: (result, vars) => {
      queryClient.invalidateQueries({ queryKey: conflictCheckKeys.detail(vars.leadId) })
      queryClient.invalidateQueries({ queryKey: ['leads'] })

      if (result.has_conflicts) {
        toast.warning(`${result.match_count} conflict(s) detected — review required`)
      } else {
        toast.success('No conflicts detected')
      }
    },
    onError: () => {
      toast.error('Failed to run conflict check')
    },
  })
}

// ─── Jurisdiction Matching ───────────────────────────────────────────────────

/**
 * Fetch all active jurisdictions for dropdowns.
 */
export function useJurisdictions() {
  return useQuery({
    queryKey: jurisdictionKeys.list(),
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('jurisdictions')
        .select('id, code, name, type, parent_id')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data as Array<{
        id: string
        code: string
        name: string
        type: string
        parent_id: string | null
      }>
    },
    staleTime: 10 * 60 * 1000, // Reference data: 10 min cache
  })
}

/**
 * Match a raw jurisdiction string to a structured UUID.
 */
export function useMatchJurisdiction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ leadId, rawInput }: { leadId: string; rawInput: string }) => {
      const response = await fetch(`/api/leads/${leadId}/match-jurisdiction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_input: rawInput }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Jurisdiction match failed')
      }
      return data as JurisdictionMatchResult & { success: true }
    },
    onSuccess: (result, vars) => {
      queryClient.invalidateQueries({ queryKey: jurisdictionKeys.match(vars.leadId) })
      queryClient.invalidateQueries({ queryKey: ['leads'] })

      if (result.match_type === 'unresolved') {
        toast.warning('Could not match jurisdiction — manual selection required')
      } else if (result.needs_review) {
        toast.info(`Fuzzy match: "${result.jurisdiction?.name}" (${result.confidence}% confidence) — please confirm`)
      } else {
        toast.success(`Jurisdiction matched: ${result.jurisdiction?.name}`)
      }
    },
    onError: () => {
      toast.error('Failed to match jurisdiction')
    },
  })
}

/**
 * Fetch jurisdiction match history for a lead (fuzzy match audit trail).
 */
export function useLeadJurisdictionMatches(leadId: string | null | undefined) {
  return useQuery({
    queryKey: jurisdictionKeys.history(leadId ?? ''),
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('lead_jurisdiction_matches')
        .select('id, raw_input, matched_jurisdiction_id, match_type, confidence, reviewed_by, reviewed_at, created_at')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Array<{
        id: string
        raw_input: string
        matched_jurisdiction_id: string | null
        match_type: string
        confidence: number
        reviewed_by: string | null
        reviewed_at: string | null
        created_at: string
      }>
    },
    enabled: !!leadId,
    staleTime: 30_000,
  })
}

/**
 * Resolve a fuzzy jurisdiction match (human confirms or overrides).
 */
export function useResolveJurisdiction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      matchId,
      jurisdictionId,
      leadId,
    }: {
      matchId: string
      jurisdictionId: string
      leadId: string
    }) => {
      const supabase = createClient()

      // Update the match record
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: matchErr } = await (supabase as any)
        .from('lead_jurisdiction_matches')
        .update({
          matched_jurisdiction_id: jurisdictionId,
          match_type: 'exact', // Human confirmed = exact
          confidence: 100,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', matchId)
      if (matchErr) throw matchErr

      // Update the lead's jurisdiction_id
      const { error: leadErr } = await supabase
        .from('leads')
        .update({
          jurisdiction_id: jurisdictionId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', leadId)
      if (leadErr) throw leadErr
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: jurisdictionKeys.history(vars.leadId) })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      toast.success('Jurisdiction confirmed')
    },
    onError: () => {
      toast.error('Failed to resolve jurisdiction')
    },
  })
}
