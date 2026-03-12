/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * IRCC Form Pack — React Query Hooks
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Client-side data fetching and mutations for the IRCC Forms tab.
 *
 * Query hooks: form pack versions, artifacts, readiness
 * Mutation hooks: generate, approve, export, log access
 *
 * All mutations route through /api/actions/{actionType} which invokes
 * the Action Executor server-side.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type {
  FormPackVersion,
  FormPackArtifact,
  PackReadiness,
  PackType,
} from '@/lib/types/form-packs'
// IRCCProfile import removed — DB readiness uses Record<string, unknown>
import { computePackReadinessFromDB } from '@/lib/ircc/xfa-filler-db'

// ── Query Keys ────────────────────────────────────────────────────────────────

export const formPackKeys = {
  all: ['form-packs'] as const,
  versions: (matterId: string) => [...formPackKeys.all, 'versions', matterId] as const,
  artifacts: (versionId: string) => [...formPackKeys.all, 'artifacts', versionId] as const,
  readiness: (matterId: string, packType: string) =>
    [...formPackKeys.all, 'readiness', matterId, packType] as const,
}

// ── Query: Form Pack Versions ─────────────────────────────────────────────────

/**
 * Fetch all form pack versions for a matter, ordered newest first.
 */
export function useFormPackVersions(matterId: string) {
  return useQuery({
    queryKey: formPackKeys.versions(matterId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('form_pack_versions')
        .select('*')
        .eq('matter_id', matterId)
        .order('version_number', { ascending: false })

      if (error) throw error
      return (data ?? []) as FormPackVersion[]
    },
    enabled: !!matterId,
  })
}

// ── Query: Form Pack Artifacts ────────────────────────────────────────────────

/**
 * Fetch all artifacts for a specific form pack version.
 */
export function useFormPackArtifacts(versionId: string) {
  return useQuery({
    queryKey: formPackKeys.artifacts(versionId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('form_pack_artifacts')
        .select('*')
        .eq('pack_version_id', versionId)
        .order('created_at', { ascending: true })

      if (error) throw error
      return (data ?? []) as FormPackArtifact[]
    },
    enabled: !!versionId,
  })
}

// ── Query: Pack Readiness ─────────────────────────────────────────────────────

/**
 * Compute readiness for a form pack by fetching the primary contact's
 * immigration profile and running the readiness engine client-side.
 */
export function usePackReadiness(contactId: string | null, packType: PackType) {
  return useQuery({
    queryKey: formPackKeys.readiness(contactId ?? '', packType),
    queryFn: async (): Promise<PackReadiness | null> => {
      if (!contactId) return null

      const supabase = createClient()

      // Fetch profile
      const { data, error } = await supabase
        .from('contacts')
        .select('immigration_data, tenant_id')
        .eq('id', contactId)
        .single()

      if (error) throw error

      const profile = (data?.immigration_data as Record<string, unknown>) ?? {}
      const tenantId = data?.tenant_id as string

      // Resolve form ID from DB
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: dbForm } = await (supabase as any)
        .from('ircc_forms')
        .select('id')
        .eq('form_code', packType)
        .eq('tenant_id', tenantId)
        .maybeSingle()

      if (!dbForm) {
        // No DB form found — return empty readiness
        return {
          overall_pct: 0,
          fields: { total: 0, filled: 0, missing: [] },
          validation: { errors: [], warnings: [] },
          can_generate: false,
        }
      }

      const result = await computePackReadinessFromDB(
        profile,
        [dbForm.id as string],
        supabase,
      )

      // Convert to PackReadiness shape
      const overallPct = result.totalRequired > 0
        ? Math.round((result.filledRequired / result.totalRequired) * 100)
        : 100

      return {
        overall_pct: overallPct,
        fields: {
          total: result.totalRequired,
          filled: result.filledRequired,
          missing: result.missingFields.map((f) => ({
            profile_path: f.profile_path,
            label: f.label,
            section: '',
          })),
        },
        validation: {
          errors: result.missingFields.map((f) => ({
            code: 'missing_required' as const,
            profile_path: f.profile_path,
            message: `Required field missing: ${f.label}`,
          })),
          warnings: [],
        },
        can_generate: result.isReady,
      }
    },
    enabled: !!contactId,
    staleTime: 30_000,
  })
}

// ── Mutation: Generate Form Pack ──────────────────────────────────────────────

/**
 * Generate a draft form pack via the Action Executor.
 * Invalidates versions list on success.
 */
export function useGenerateFormPack() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      matterId,
      packType,
    }: {
      matterId: string
      packType: PackType
    }) => {
      const res = await fetch('/api/actions/generate_form_pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { matterId, packType },
          source: 'dashboard',
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Generation failed (${res.status})`)
      }

      return res.json()
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: formPackKeys.versions(variables.matterId),
      })
      const versionNumber = data?.data?.versionNumber ?? ''
      toast.success(`Draft v${versionNumber} generated successfully`)
    },
    onError: (error) => {
      toast.error(`Form generation failed: ${error.message}`)
    },
  })
}

// ── Mutation: Approve Form Pack ───────────────────────────────────────────────

/**
 * Approve a draft form pack via the Action Executor.
 * Re-generates final PDF without watermark.
 */
export function useApproveFormPack() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      matterId,
      packVersionId,
    }: {
      matterId: string
      packVersionId: string
    }) => {
      const res = await fetch('/api/actions/approve_form_pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { matterId, packVersionId },
          source: 'dashboard',
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Approval failed (${res.status})`)
      }

      return res.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: formPackKeys.versions(variables.matterId),
      })
      queryClient.invalidateQueries({
        queryKey: formPackKeys.artifacts(variables.packVersionId),
      })
      toast.success('Form pack approved — final PDF generated')
    },
    onError: (error) => {
      toast.error(`Approval failed: ${error.message}`)
    },
  })
}

// ── Mutation: Export Form Pack ─────────────────────────────────────────────────

/**
 * Get a signed download URL for an approved form pack.
 */
export function useExportFormPack() {
  return useMutation({
    mutationFn: async ({
      matterId,
      packVersionId,
    }: {
      matterId: string
      packVersionId: string
    }) => {
      const res = await fetch('/api/actions/export_form_pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { matterId, packVersionId },
          source: 'dashboard',
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Export failed (${res.status})`)
      }

      return res.json() as Promise<{
        data: {
          signedUrl: string
          fileName: string
          versionNumber: number
          packType: string
        }
      }>
    },
    onError: (error) => {
      toast.error(`Export failed: ${error.message}`)
    },
  })
}

// ── Mutation: Log Form Access ─────────────────────────────────────────────────

/**
 * Log a view/download/print access event.
 * Lightweight — no PDF generation, just audit trail.
 */
export function useLogFormAccess() {
  return useMutation({
    mutationFn: async ({
      artifactId,
      matterId,
      accessType,
    }: {
      artifactId: string
      matterId: string
      accessType: 'view' | 'download' | 'print'
    }) => {
      const res = await fetch('/api/actions/log_form_access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { artifactId, matterId, accessType },
          source: 'dashboard',
        }),
      })

      if (!res.ok) {
        // Don't throw for access logging — it's non-critical
        console.error('[form-packs] Failed to log access:', res.status)
        return null
      }

      return res.json()
    },
    // No toast for access logging — it's transparent to the user
  })
}

// ── Mutation: Get Artifact Signed URL ─────────────────────────────────────────

/**
 * Get a signed download URL for a specific artifact (draft or final).
 * This does NOT go through the Action Executor — it's a direct storage call.
 * Use useLogFormAccess() separately to record the access event.
 */
export function useFormPackArtifactUrl() {
  return useMutation({
    mutationFn: async (storagePath: string) => {
      const supabase = createClient()
      const { data, error } = await supabase.storage
        .from('documents')
        .createSignedUrl(storagePath, 3600) // 1-hour expiry

      if (error) throw error
      return data.signedUrl
    },
    onError: () => {
      toast.error('Failed to generate download link')
    },
  })
}
