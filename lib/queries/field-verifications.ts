'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface FieldVerification {
  id: string
  profile_path: string
  verified_value: unknown
  verified_by: string
  verified_at: string
  notes: string | null
}

// ── Query keys ────────────────────────────────────────────────────────────────

export const fieldVerificationKeys = {
  all: ['field-verifications'] as const,
  matter: (matterId: string) => ['field-verifications', matterId] as const,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true if the current profile value matches the verified_value snapshot.
 * JSON.stringify comparison handles nested objects and arrays.
 */
export function isVerificationStale(
  verification: FieldVerification,
  currentValue: unknown,
): boolean {
  return JSON.stringify(verification.verified_value) !== JSON.stringify(currentValue)
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/**
 * Fetches all field verifications for a matter.
 * Returns a map of profile_path → FieldVerification for easy lookup.
 */
export function useFieldVerifications(matterId: string | null | undefined) {
  return useQuery({
    queryKey: fieldVerificationKeys.matter(matterId ?? ''),
    queryFn: async (): Promise<Record<string, FieldVerification>> => {
      const res = await fetch(`/api/matters/${matterId}/field-verifications`)
      if (!res.ok) throw new Error('Failed to fetch field verifications')
      const json = await res.json()
      const map: Record<string, FieldVerification> = {}
      for (const v of (json.verifications ?? []) as FieldVerification[]) {
        map[v.profile_path] = v
      }
      return map
    },
    enabled: !!matterId,
    staleTime: 1000 * 60 * 2,
  })
}

/**
 * Upserts a single field verification (lawyer sign-off on a value).
 */
export function useVerifyField(matterId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      profile_path: string
      verified_value: unknown
      notes?: string | null
    }) => {
      const res = await fetch(`/api/matters/${matterId}/field-verifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error('Failed to verify field')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fieldVerificationKeys.matter(matterId) })
    },
  })
}

/**
 * Bulk-verifies all fields in a section (one POST call).
 */
export function useBulkVerifyFields(matterId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (fields: { profile_path: string; verified_value: unknown }[]) => {
      const res = await fetch(`/api/matters/${matterId}/field-verifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      })
      if (!res.ok) throw new Error('Failed to bulk verify fields')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fieldVerificationKeys.matter(matterId) })
    },
  })
}

/**
 * Removes a field verification (un-verifies / flags for re-review).
 */
export function useUnverifyField(matterId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (profilePath: string) => {
      const res = await fetch(`/api/matters/${matterId}/field-verifications`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_path: profilePath }),
      })
      if (!res.ok) throw new Error('Failed to remove field verification')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fieldVerificationKeys.matter(matterId) })
    },
  })
}
