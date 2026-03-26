'use client'

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * useScanPrefill  -  Scan-to-Autofill React Hook (Directive 40.0 §3)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Fetches all documents for a matter (or vault session) that have
 * ai_extracted_data, maps them through the scan-to-intake mapper,
 * and returns merged prefill values ready for the QuestionnaireRenderer.
 *
 * Usage:
 *   const { prefill, isLoading, fieldCount } = useScanPrefill({ matterId, tenantId })
 *   // prefill.fields['personal.given_name'] → { value: 'John', confidence: 85, ... }
 */

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  mergeScanExtractions,
  type ScanExtraction,
  type ScanPrefillResult,
} from '@/lib/services/scan-to-intake-mapper'

// ── Types ─────────────────────────────────────────────────────────────────────

interface UseScanPrefillOptions {
  /** Matter ID to fetch scanned documents for */
  matterId?: string
  /** Tenant ID for RLS filtering */
  tenantId: string
  /** Vault session temp_session_id (for pre-matter vault drops) */
  vaultSessionId?: string
  /** Minimum confidence threshold for including fields (default: 40) */
  minConfidence?: number
  /** Enable/disable the hook */
  enabled?: boolean
}

interface UseScanPrefillReturn {
  /** The merged prefill result with all mapped fields */
  prefill: ScanPrefillResult | null
  /** Whether data is loading */
  isLoading: boolean
  /** Total number of prefill fields available */
  fieldCount: number
  /** Average confidence across all fields */
  averageConfidence: number
  /** Source document IDs that contributed data */
  sourceDocumentIds: string[]
  /** Error if any */
  error: Error | null
}

// ── Query Key ─────────────────────────────────────────────────────────────────

export const scanPrefillKeys = {
  all: ['scan-prefill'] as const,
  matter: (matterId: string) => [...scanPrefillKeys.all, 'matter', matterId] as const,
  vault: (sessionId: string) => [...scanPrefillKeys.all, 'vault', sessionId] as const,
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useScanPrefill({
  matterId,
  tenantId,
  vaultSessionId,
  minConfidence = 40,
  enabled = true,
}: UseScanPrefillOptions): UseScanPrefillReturn {
  const queryKey = matterId
    ? scanPrefillKeys.matter(matterId)
    : vaultSessionId
      ? scanPrefillKeys.vault(vaultSessionId)
      : scanPrefillKeys.all

  const { data, isLoading, error } = useQuery({
    queryKey,
    enabled: enabled && !!(matterId || vaultSessionId),
    staleTime: 1000 * 60 * 2, // 2 minutes
    queryFn: async (): Promise<ScanPrefillResult> => {
      const supabase = createClient()
      const extractions: ScanExtraction[] = []

      // ── Source 1: Matter documents with ai_extracted_data ──
      if (matterId) {
        const { data: docs } = await supabase
          .from('documents')
          .select('id, ai_extracted_data, created_at')
          .eq('tenant_id', tenantId)
          .eq('matter_id', matterId)
          .not('ai_extracted_data', 'is', null)
          .order('created_at', { ascending: false })

        if (docs) {
          for (const doc of docs) {
            const extracted = doc.ai_extracted_data as Record<string, unknown> | null
            if (!extracted) continue

            extractions.push({
              documentId: doc.id,
              documentType: (extracted.detected_document_type as string) ?? 'general',
              confidence: (extracted.confidence as number) ?? 50,
              extractedFields: (extracted.extracted_fields as Record<string, string | number | null>) ?? {},
              scannedAt: (extracted.scanned_at as string) ?? doc.created_at,
            })
          }
        }
      }

      // ── Source 2: Vault drops with scan data (pre-matter) ──
      if (vaultSessionId) {
        const { data: drops } = await (supabase as any)
          .from('vault_drops')
          .select('id, ai_extracted_data, created_at')
          .eq('temp_session_id', vaultSessionId)
          .not('ai_extracted_data', 'is', null)
          .order('created_at', { ascending: false })

        if (drops) {
          for (const drop of drops as any[]) {
            const extracted = drop.ai_extracted_data as Record<string, unknown> | null
            if (!extracted) continue

            extractions.push({
              documentId: drop.id,
              documentType: (extracted.detected_document_type as string) ?? 'general',
              confidence: (extracted.confidence as number) ?? 50,
              extractedFields: (extracted.extracted_fields as Record<string, string | number | null>) ?? {},
              scannedAt: (extracted.scanned_at as string) ?? drop.created_at,
            })
          }
        }
      }

      // Merge all extractions using the field mapper
      return mergeScanExtractions(extractions)
    },
  })

  const prefill = data ?? null

  return {
    prefill,
    isLoading,
    fieldCount: prefill?.fieldCount ?? 0,
    averageConfidence: prefill?.averageConfidence ?? 0,
    sourceDocumentIds: prefill?.sourceDocumentIds ?? [],
    error: error as Error | null,
  }
}
