/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PDF Preview — TanStack Query Hooks
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Hooks for the live PDF preview in the immigration funnel workspace.
 * Uses the existing POST /api/ircc/forms/[formId]/preview endpoint.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// ── Types ────────────────────────────────────────────────────────────────────

export interface PdfPreviewImage {
  page: number
  base64_png: string
  width: number
  height: number
}

export interface PdfPreviewResult {
  images: PdfPreviewImage[]
  page_count: number
}

// ── Live PDF Preview Hook ────────────────────────────────────────────────────

/**
 * Fetches a rendered PDF page preview with profile overrides.
 * Used in the funnel workspace to show live form fill as the user types.
 *
 * The query key includes a hash of the overrides, so it only refetches when
 * the debounced profile data actually changes.
 */
export function useLivePdfPreview(
  formId: string | null,
  profileOverrides: Record<string, unknown>,
  page: number,
) {
  const stableKey = useMemo(
    () => JSON.stringify(profileOverrides),
    [profileOverrides],
  )

  return useQuery({
    queryKey: ['pdf-preview', formId, page, stableKey],
    queryFn: async (): Promise<PdfPreviewResult> => {
      const res = await fetch(`/api/ircc/forms/${formId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page, profile_overrides: profileOverrides }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Preview failed (${res.status})`)
      }
      return res.json() as Promise<PdfPreviewResult>
    },
    enabled: !!formId,
    staleTime: 5_000,
    gcTime: 30_000,
  })
}

// ── Primary Form ID Hook ─────────────────────────────────────────────────────

/**
 * Fetches the first IRCC form configured for a matter type.
 * Used to determine which form to preview in the funnel workspace.
 */
export function usePrimaryFormId(matterTypeId: string | null) {
  return useQuery({
    queryKey: ['primary-ircc-form', matterTypeId],
    queryFn: async (): Promise<string | null> => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ircc_stream_forms')
        .select('form_id')
        .eq('matter_type_id', matterTypeId)
        .order('sort_order', { ascending: true })
        .limit(1)
        .single()

      if (error || !data) return null
      return (data as { form_id: string }).form_id
    },
    enabled: !!matterTypeId,
    staleTime: 5 * 60_000,
  })
}

// ── Stream Forms List Hook ───────────────────────────────────────────────────

/**
 * Fetches all IRCC forms configured for a matter type (for the form selector).
 */
export function useStreamForms(matterTypeId: string | null) {
  return useQuery({
    queryKey: ['ircc-stream-forms', matterTypeId],
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('ircc_stream_forms')
        .select('form_id, sort_order, ircc_forms(form_code, form_name)')
        .eq('matter_type_id', matterTypeId)
        .order('sort_order', { ascending: true })

      if (error) throw error
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data as any[]).map((sf: any) => ({
        formId: sf.form_id as string,
        formCode: (sf.ircc_forms as any)?.form_code ?? '',
        formName: (sf.ircc_forms as any)?.form_name ?? 'Unknown Form',
      }))
    },
    enabled: !!matterTypeId,
    staleTime: 5 * 60_000,
  })
}
