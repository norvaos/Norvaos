'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { CanonicalProfileFieldRow } from '@/lib/types/database'

// ── Types ───────────────────────────────────────────────────────────────────

export interface AutoFillResult {
  /** The resolved value (from matter override, canonical, or null) */
  value: unknown
  /** Where the value came from */
  source: 'snapshot' | 'canonical' | null
  /** Confidence: 'high' for verified, 'medium' for client_submitted, 'low' for pending */
  confidence: 'high' | 'medium' | 'low' | null
  /** Whether this is a matter-level override (snapshot) vs canonical */
  isOverridden: boolean
  /** Whether data is still loading */
  isLoading: boolean
}

/**
 * Auto-fill hook implementing the Low-Keyboard spec's three-layer lookup:
 *   1. Matter-level override (snapshot) — highest priority
 *   2. Canonical profile field — contact-level shared truth
 *   3. Empty — no value found
 *
 * Usage:
 *   const { value, source, confidence, isOverridden } = useAutoFill('family_name', contactId, matterId)
 */
export function useAutoFill(
  canonicalKey: string,
  contactId: string,
  matterId: string,
): AutoFillResult {
  const { data, isLoading } = useQuery({
    queryKey: ['auto-fill', canonicalKey, contactId, matterId],
    queryFn: async (): Promise<Omit<AutoFillResult, 'isLoading'>> => {
      const supabase = createClient()

      // Step 1: Get canonical profile
      const { data: profile } = await supabase
        .from('canonical_profiles')
        .select('id')
        .eq('contact_id', contactId)
        .maybeSingle()

      if (!profile) {
        return { value: null, source: null, confidence: null, isOverridden: false }
      }

      // Step 2: Check matter snapshot (Layer 2 — matter override)
      const { data: snapshot } = await supabase
        .from('canonical_profile_snapshots')
        .select('snapshot_data')
        .eq('profile_id', profile.id)
        .eq('matter_id', matterId)
        .maybeSingle()

      if (snapshot?.snapshot_data) {
        const snapshotData = snapshot.snapshot_data as Record<
          string,
          Record<string, { value: unknown; verification_status?: string }>
        >
        for (const domain of Object.values(snapshotData)) {
          if (domain[canonicalKey]) {
            const entry = domain[canonicalKey]
            return {
              value: entry.value,
              source: 'snapshot',
              confidence: mapConfidence(entry.verification_status),
              isOverridden: true,
            }
          }
        }
      }

      // Step 3: Fall back to canonical field (Layer 1)
      const { data: field } = await supabase
        .from('canonical_profile_fields')
        .select('value, source, verification_status')
        .eq('profile_id', profile.id)
        .eq('field_key', canonicalKey)
        .is('effective_to', null)
        .maybeSingle()

      if (field) {
        return {
          value: field.value,
          source: 'canonical',
          confidence: mapConfidence(field.verification_status),
          isOverridden: false,
        }
      }

      // Layer 3: Empty
      return { value: null, source: null, confidence: null, isOverridden: false }
    },
    enabled: !!canonicalKey && !!contactId && !!matterId,
    staleTime: 1000 * 60 * 2, // 2 minutes
  })

  return {
    value: data?.value ?? null,
    source: data?.source ?? null,
    confidence: data?.confidence ?? null,
    isOverridden: data?.isOverridden ?? false,
    isLoading,
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function mapConfidence(
  verificationStatus?: string,
): 'high' | 'medium' | 'low' | null {
  switch (verificationStatus) {
    case 'verified':
      return 'high'
    case 'client_submitted':
      return 'medium'
    case 'pending':
      return 'low'
    case 'conflict':
      return 'low'
    default:
      return null
  }
}
