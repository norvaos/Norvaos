'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// ── Types ──────────────────────────────────────────────────────────────────────

export type VerificationStatus = 'pending' | 'submitted' | 'verified' | 'rejected'

export interface FieldVerification {
  id: string
  profile_path: string
  verified_value: unknown
  verified_by: string
  verified_at: string
  notes: string | null
  verification_status: VerificationStatus
  rejection_reason: string | null
}

export interface VerifyTarget {
  type: 'field' | 'document'
  profile_path?: string
  verified_value?: unknown
  slot_id?: string
}

export interface VerifyRequest {
  action: 'verify' | 'reject'
  targets: VerifyTarget[]
  rejection_reason?: string
  notes?: string
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

/** Returns true when the field has been verified and should be read-only. */
export function isFieldLocked(verification: FieldVerification | undefined): boolean {
  return verification?.verification_status === 'verified'
}

/** Returns true when the field has been rejected and needs correction. */
export function isFieldRejected(verification: FieldVerification | undefined): boolean {
  return verification?.verification_status === 'rejected'
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

/**
 * Unified verify/reject mutation using POST /api/matters/[id]/verify.
 * Supports both field and document targets in a single call.
 */
export function useVerifyTargets(matterId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: VerifyRequest) => {
      const res = await fetch(`/api/matters/${matterId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(err.error || 'Verification failed')
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fieldVerificationKeys.matter(matterId) })
    },
  })
}
