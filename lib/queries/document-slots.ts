import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { gatingKeys } from '@/lib/queries/matter-types'
import { readinessKeys } from '@/lib/queries/immigration-readiness'
import { toast } from 'sonner'

type DocumentSlot = Database['public']['Tables']['document_slots']['Row']
type DocumentVersion = Database['public']['Tables']['document_versions']['Row']

export type { DocumentSlot, DocumentVersion }

// ─── Query Keys ─────────────────────────────────────────────────────────────────

export const slotKeys = {
  all: ['document_slots'] as const,
  list: (matterId: string) => [...slotKeys.all, matterId] as const,
  versions: (slotId: string) => [...slotKeys.all, 'versions', slotId] as const,
}

// ─── useDocumentSlots ───────────────────────────────────────────────────────────

/**
 * Fetch all active document slots for a matter.
 * Returns slots grouped by category with current document info.
 */
export function useDocumentSlots(matterId: string | undefined) {
  return useQuery({
    queryKey: slotKeys.list(matterId ?? ''),
    queryFn: async () => {
      const res = await fetch(`/api/matters/${matterId}/document-slots`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to fetch document slots')
      }
      const data = await res.json()
      return data.slots as (DocumentSlot & {
        current_document?: {
          id: string
          file_name: string
          file_type: string | null
          file_size: number | null
          storage_path: string
          storage_bucket: string | null
          is_shared_with_client: boolean | null
          created_at: string
        } | null
      })[]
    },
    enabled: !!matterId,
  })
}

// ─── useDocumentSlotVersions ────────────────────────────────────────────────────

/**
 * Fetch version history for a specific document slot.
 */
export function useDocumentSlotVersions(slotId: string | undefined) {
  return useQuery({
    queryKey: slotKeys.versions(slotId ?? ''),
    queryFn: async () => {
      const supabase = createClient()

      // Fetch versions (flat — no FK joins due to multiple FK refs to users)
      const { data: versions, error } = await supabase
        .from('document_versions')
        .select('*')
        .eq('slot_id', slotId!)
        .order('version_number', { ascending: false })

      if (error) throw error
      if (!versions) return []

      // Collect unique user IDs to resolve names
      const userIds = new Set<string>()
      for (const v of versions) {
        if (v.uploaded_by) userIds.add(v.uploaded_by)
        if (v.reviewed_by) userIds.add(v.reviewed_by)
      }

      const userMap = new Map<string, { first_name: string | null; last_name: string | null }>()
      if (userIds.size > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, first_name, last_name')
          .in('id', Array.from(userIds))

        for (const u of users ?? []) {
          userMap.set(u.id, { first_name: u.first_name, last_name: u.last_name })
        }
      }

      return versions.map((v) => ({
        ...v,
        uploader: v.uploaded_by ? userMap.get(v.uploaded_by) ?? null : null,
        reviewer: v.reviewed_by ? userMap.get(v.reviewed_by) ?? null : null,
      }))
    },
    enabled: !!slotId,
  })
}

// ─── useUploadToSlot ────────────────────────────────────────────────────────────

/**
 * Upload a file to a specific document slot.
 * Wraps the existing upload endpoint with slot_id enforcement.
 */
export function useUploadToSlot() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      file: File
      slotId: string
      matterId: string
    }) => {
      const formData = new FormData()
      formData.append('file', params.file)
      formData.append('slot_id', params.slotId)
      formData.append('matter_id', params.matterId)

      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Upload failed')
      }

      return res.json()
    },
    onSuccess: (_data, variables) => {
      toast.success('Document uploaded successfully')
      queryClient.invalidateQueries({ queryKey: slotKeys.list(variables.matterId) })
      queryClient.invalidateQueries({ queryKey: gatingKeys.check(variables.matterId) })
      queryClient.invalidateQueries({ queryKey: readinessKeys.detail(variables.matterId) })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to upload document')
    },
  })
}

// ─── useReviewSlot ──────────────────────────────────────────────────────────────

/**
 * Review a document slot: accept, request re-upload, or reject.
 */
export function useReviewSlot() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      slotId: string
      matterId: string
      action: 'accept' | 'needs_re_upload' | 'reject'
      reason?: string
      rejectionReasonCode?: string
      clientGuidance?: string
      notifyClient?: boolean
    }) => {
      const res = await fetch(`/api/documents/slots/${params.slotId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: params.action,
          reason: params.reason,
          rejection_reason_code: params.rejectionReasonCode,
          client_guidance: params.clientGuidance,
          notify_client: params.notifyClient ?? false,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Review failed')
      }

      return res.json()
    },
    onSuccess: (_data, variables) => {
      const actionLabels: Record<string, string> = {
        accept: 'accepted',
        needs_re_upload: 'marked for re-upload',
        reject: 'rejected',
      }
      toast.success(`Document ${actionLabels[variables.action] ?? 'reviewed'}`)
      queryClient.invalidateQueries({ queryKey: slotKeys.list(variables.matterId) })
      queryClient.invalidateQueries({ queryKey: slotKeys.versions(variables.slotId) })
      queryClient.invalidateQueries({ queryKey: gatingKeys.check(variables.matterId) })
      queryClient.invalidateQueries({ queryKey: readinessKeys.detail(variables.matterId) })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to review document')
    },
  })
}

// ─── useRegenerateSlots ─────────────────────────────────────────────────────────

/**
 * Trigger regeneration of document slots for a matter.
 * Deterministically recomputes slots from current Core Data.
 */
export function useRegenerateSlots() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { matterId: string }) => {
      const res = await fetch(`/api/matters/${params.matterId}/document-slots`, {
        method: 'POST',
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Regeneration failed')
      }

      return res.json()
    },
    onSuccess: (data, variables) => {
      const added = data.added ?? 0
      const removed = data.removed ?? 0
      if (added > 0 || removed > 0) {
        toast.success(`Document requirements updated: ${added} added, ${removed} removed`)
      } else {
        toast.info('Document requirements are up to date')
      }
      queryClient.invalidateQueries({ queryKey: slotKeys.list(variables.matterId) })
      queryClient.invalidateQueries({ queryKey: gatingKeys.check(variables.matterId) })
      queryClient.invalidateQueries({ queryKey: readinessKeys.detail(variables.matterId) })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to regenerate slots')
    },
  })
}

// ─── useCreateCustomSlot ──────────────────────────────────────────────────────

/**
 * Create a custom (ad-hoc) document slot on a matter.
 * Used from the Send Document Request dialog for matter-specific documents.
 */
export function useCreateCustomSlot() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { matterId: string; slotName: string }) => {
      const res = await fetch(`/api/matters/${params.matterId}/document-slots`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_name: params.slotName }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create custom document')
      }

      return res.json() as Promise<{ success: true; slot: DocumentSlot }>
    },
    onSuccess: (_data, variables) => {
      toast.success('Custom document added')
      queryClient.invalidateQueries({ queryKey: slotKeys.list(variables.matterId) })
      queryClient.invalidateQueries({ queryKey: gatingKeys.check(variables.matterId) })
      queryClient.invalidateQueries({ queryKey: readinessKeys.detail(variables.matterId) })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add custom document')
    },
  })
}

// ─── useRemoveSlot ────────────────────────────────────────────────────────────

/**
 * Soft-delete a document slot (is_active = false).
 */
export function useRemoveSlot() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { slotId: string; matterId: string }) => {
      const res = await fetch(
        `/api/matters/${params.matterId}/document-slots?slot_id=${params.slotId}`,
        { method: 'DELETE' },
      )
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to remove document')
      }
      return res.json()
    },
    onSuccess: (_data, variables) => {
      toast.success('Document removed')
      queryClient.invalidateQueries({ queryKey: slotKeys.list(variables.matterId) })
      queryClient.invalidateQueries({ queryKey: ['doc_templates_catalogue', variables.matterId] })
      queryClient.invalidateQueries({ queryKey: gatingKeys.check(variables.matterId) })
      queryClient.invalidateQueries({ queryKey: readinessKeys.detail(variables.matterId) })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove document')
    },
  })
}

// ─── useAvailableTemplatesForMatter ───────────────────────────────────────────

/**
 * Returns ALL document_slot_templates configured for this matter's
 * matter_type / case_type, each annotated with `isInstantiated` so the
 * picker can show the full catalogue: already-added slots are greyed out,
 * missing ones are selectable to add with one click.
 */
export interface CataloguedTemplate {
  id: string
  slot_name: string
  description: string | null
  category: string
  person_role_scope: string | null
  is_required: boolean
  is_active: boolean
  sort_order: number
  /** true when a document_slot for this template already exists on the matter */
  isInstantiated: boolean
}

/** @deprecated use useDocumentTemplatesCatalogue */
export type AvailableTemplate = CataloguedTemplate

export function useDocumentTemplatesCatalogue(matterId: string | undefined) {
  return useQuery({
    queryKey: ['doc_templates_catalogue', matterId],
    queryFn: async (): Promise<CataloguedTemplate[]> => {
      const supabase = createClient()

      // 1. Get matter's matter_type_id + existing slots (with their template refs) in parallel
      const [matterRes, immigRes, existingSlotsRes] = await Promise.all([
        supabase.from('matters').select('matter_type_id').eq('id', matterId!).single(),
        supabase.from('matter_immigration').select('case_type_id').eq('matter_id', matterId!).maybeSingle(),
        supabase.from('document_slots').select('slot_template_id').eq('matter_id', matterId!).not('slot_template_id', 'is', null),
      ])

      const matterTypeId = matterRes.data?.matter_type_id ?? null
      const caseTypeId = immigRes.data?.case_type_id ?? null

      // All template IDs currently referenced by any slot on this matter (active or not)
      const referencedTemplateIds = (existingSlotsRes.data ?? [])
        .map((s) => s.slot_template_id)
        .filter((id): id is string => !!id)

      // Active slot template IDs (for isInstantiated flag)
      const { data: activeSlots } = await supabase
        .from('document_slots')
        .select('slot_template_id')
        .eq('matter_id', matterId!)
        .eq('is_active', true)
        .not('slot_template_id', 'is', null)

      const instantiated = new Set(
        (activeSlots ?? []).map((s) => s.slot_template_id).filter(Boolean),
      )

      // 2. Build query:
      //    - scope-based (matter_type / case_type): active templates available to add
      //    - referenced by existing slots: always include (even if now inactive) so already-added items show
      const scopeParts: string[] = []
      if (matterTypeId) scopeParts.push(`matter_type_id.eq.${matterTypeId}`)
      if (caseTypeId) scopeParts.push(`case_type_id.eq.${caseTypeId}`)

      // Deduplicate referenced IDs
      const uniqueRefIds = [...new Set(referencedTemplateIds)]

      if (scopeParts.length === 0 && uniqueRefIds.length === 0) return []

      // Fetch scope-based active templates + referenced templates in one OR query
      // Use is_active filter only for scope-based; referenced IDs bypass it via OR
      const orParts: string[] = [...scopeParts]
      for (const tid of uniqueRefIds) {
        orParts.push(`id.eq.${tid}`)
      }

      const { data: templates, error } = await supabase
        .from('document_slot_templates')
        .select('id, slot_name, description, category, person_role_scope, is_required, sort_order, is_active')
        .or(orParts.join(','))
        .order('sort_order', { ascending: true })
        .order('slot_name', { ascending: true })

      if (error) throw error
      if (!templates?.length) return []

      // 3. Return ALL templates, annotated with isInstantiated
      // Inactive templates show as greyed out (disabled) — they're already added or deprecated
      return (templates as Omit<CataloguedTemplate, 'isInstantiated'>[]).map((t) => ({
        ...t,
        // Treat inactive templates as "already instantiated" so they're disabled in the picker
        isInstantiated: instantiated.has(t.id) || !t.is_active,
      }))
    },
    enabled: !!matterId,
    staleTime: 30_000,
  })
}

/** Backwards-compatible alias used internally */
export function useAvailableTemplatesForMatter(matterId: string | undefined) {
  return useDocumentTemplatesCatalogue(matterId)
}

// ─── useInstantiateTemplateSlot ───────────────────────────────────────────────

/**
 * Instantiates a specific document_slot_template as a document_slot on the
 * matter. Used from the "Add Document" picker (as opposed to useCreateCustomSlot
 * which creates a free-form slot with no template linkage).
 */
export function useInstantiateTemplateSlot() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      matterId: string
      slotTemplateId: string
      personId?: string | null
    }) => {
      const res = await fetch(`/api/matters/${params.matterId}/document-slots`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot_template_id: params.slotTemplateId,
          person_id: params.personId ?? null,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to add document')
      }

      return res.json()
    },
    onSuccess: (_data, variables) => {
      toast.success('Document added')
      queryClient.invalidateQueries({ queryKey: slotKeys.list(variables.matterId) })
      queryClient.invalidateQueries({ queryKey: ['doc_templates_catalogue', variables.matterId] })
      queryClient.invalidateQueries({ queryKey: gatingKeys.check(variables.matterId) })
      queryClient.invalidateQueries({ queryKey: readinessKeys.detail(variables.matterId) })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add document')
    },
  })
}
