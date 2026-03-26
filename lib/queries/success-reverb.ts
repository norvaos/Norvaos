/**
 * TanStack Query hooks for Success-Reverb (Directive 1.6).
 *
 * Gold Standard Template extraction and suggestion system.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { TemplateSuggestion, GoldStandardTemplate } from '@/lib/services/success-reverb/template-extractor'

// ── Query Keys ───────────────────────────────────────────────────────────────

export const successReverbKeys = {
  all: ['success-reverb'] as const,
  suggestions: (matterId: string) => [...successReverbKeys.all, 'suggestions', matterId] as const,
}

// ── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Find Gold Standard Templates matching this matter's case type.
 */
export function useGoldStandardSuggestions(matterId: string) {
  return useQuery({
    queryKey: successReverbKeys.suggestions(matterId),
    queryFn: async () => {
      const res = await fetch(`/api/matters/${matterId}/success-reverb`)
      if (!res.ok) throw new Error('Failed to load template suggestions')
      const json = await res.json()
      return (json.suggestions ?? []) as TemplateSuggestion[]
    },
    enabled: !!matterId,
    staleTime: 1000 * 60 * 10, // 10 min
  })
}

/**
 * Extract a Gold Standard Template from an approved matter.
 */
export function useExtractGoldStandard(matterId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/matters/${matterId}/success-reverb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Extraction failed' }))
        throw new Error(data.error)
      }
      return res.json() as Promise<{
        success: boolean
        templateId: string | null
        template: GoldStandardTemplate
      }>
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: successReverbKeys.suggestions(matterId) })
    },
  })
}
