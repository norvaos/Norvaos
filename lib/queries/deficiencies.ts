/**
 * Deficiency Query Hooks  -  TanStack Query hooks for the deficiency workflow.
 *
 * Follows the exact pattern established in lib/queries/matter-types.ts.
 * All mutations call the corresponding API routes rather than Supabase directly.
 *
 * Sprint 6, Week 1  -  2026-03-17
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { MatterDeficiencyRow } from '@/lib/types/database'

// ─── Query Key Factory ────────────────────────────────────────────────────────

export const deficiencyKeys = {
  all: ['deficiencies'] as const,
  list: (matterId: string) => ['deficiencies', matterId] as const,
}

// ─── List Deficiencies ────────────────────────────────────────────────────────

/**
 * Fetch all deficiencies for a matter, ordered by created_at DESC.
 * staleTime 30s  -  deficiencies change frequently.
 */
export function useDeficiencies(matterId: string) {
  return useQuery({
    queryKey: deficiencyKeys.list(matterId),
    queryFn: async (): Promise<MatterDeficiencyRow[]> => {
      const res = await fetch(`/api/matters/${matterId}/deficiencies`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? 'Failed to load deficiencies')
      }
      return res.json() as Promise<MatterDeficiencyRow[]>
    },
    enabled: !!matterId,
    staleTime: 1000 * 30,
  })
}

// ─── Create Deficiency ────────────────────────────────────────────────────────

export interface CreateDeficiencyInput {
  matter_id: string
  severity: 'minor' | 'major' | 'critical'
  category: string
  description: string
  assigned_to_user_id?: string
  stage_id?: string
}

/**
 * Create a new deficiency on a matter.
 * Invalidates: ['deficiencies', matterId]
 */
export function useCreateDeficiency() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateDeficiencyInput): Promise<MatterDeficiencyRow> => {
      const res = await fetch(`/api/matters/${input.matter_id}/deficiencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? 'Failed to create deficiency')
      }
      return res.json() as Promise<MatterDeficiencyRow>
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: deficiencyKeys.list(vars.matter_id) })
      toast.success('Deficiency logged')
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'Failed to create deficiency')
    },
  })
}

// ─── Resolve Deficiency ───────────────────────────────────────────────────────

export interface ResolveDeficiencyInput {
  matter_id: string
  deficiency_id: string
  resolution_notes: string
  resolution_evidence_path?: string
}

/**
 * Resolve an open deficiency.
 * Auth: Lawyer or Admin only (enforced server-side).
 * Invalidates: ['deficiencies', matterId]
 */
export function useResolveDeficiency() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ResolveDeficiencyInput): Promise<MatterDeficiencyRow> => {
      const res = await fetch(
        `/api/matters/${input.matter_id}/deficiencies/${input.deficiency_id}/resolve`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resolution_notes: input.resolution_notes,
            resolution_evidence_path: input.resolution_evidence_path,
          }),
        },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? 'Failed to resolve deficiency')
      }
      return res.json() as Promise<MatterDeficiencyRow>
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: deficiencyKeys.list(vars.matter_id) })
      toast.success('Deficiency resolved')
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'Failed to resolve deficiency')
    },
  })
}

// ─── Reopen Deficiency ────────────────────────────────────────────────────────

export interface ReopenDeficiencyInput {
  matter_id: string
  deficiency_id: string
}

/**
 * Reopen a resolved or closed deficiency.
 * Invalidates: ['deficiencies', matterId]
 */
export function useReopenDeficiency() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ReopenDeficiencyInput): Promise<MatterDeficiencyRow> => {
      const res = await fetch(
        `/api/matters/${input.matter_id}/deficiencies/${input.deficiency_id}/reopen`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
        },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? 'Failed to reopen deficiency')
      }
      return res.json() as Promise<MatterDeficiencyRow>
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: deficiencyKeys.list(vars.matter_id) })
      toast.success('Deficiency reopened')
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'Failed to reopen deficiency')
    },
  })
}
