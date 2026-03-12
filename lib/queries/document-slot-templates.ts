import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database, Json } from '@/lib/types/database'
import { toast } from 'sonner'

type DocumentSlotTemplate = Database['public']['Tables']['document_slot_templates']['Row']

export type { DocumentSlotTemplate }

// ─── Query Keys ─────────────────────────────────────────────────────────────────

export const slotTemplateKeys = {
  all: ['document_slot_templates'] as const,
  byMatterType: (matterTypeId: string) =>
    [...slotTemplateKeys.all, 'matter-type', matterTypeId] as const,
  byCaseType: (caseTypeId: string) =>
    [...slotTemplateKeys.all, 'case-type', caseTypeId] as const,
}

// ─── Slug Utilities ─────────────────────────────────────────────────────────────

/** Derive a stable slug from a human-readable name. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

/**
 * Resolve a unique slug within the given scope.
 * If `baseSlug` already exists, appends _2, _3, etc.
 */
async function resolveUniqueSlug(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  scopeCol: 'matter_type_id' | 'case_type_id',
  scopeId: string,
  baseSlug: string
): Promise<string> {
  const { data: existing } = await supabase
    .from('document_slot_templates')
    .select('slot_slug')
    .eq('tenant_id', tenantId)
    .eq(scopeCol, scopeId)

  const taken = new Set(existing?.map((t) => t.slot_slug) ?? [])
  let slug = baseSlug
  let i = 2
  while (taken.has(slug)) {
    slug = `${baseSlug}_${i++}`
  }
  return slug
}

// ─── useDocumentSlotTemplatesByMatterType ────────────────────────────────────────

export function useDocumentSlotTemplatesByMatterType(matterTypeId: string) {
  return useQuery({
    queryKey: slotTemplateKeys.byMatterType(matterTypeId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('document_slot_templates')
        .select('*')
        .eq('matter_type_id', matterTypeId)
        .eq('is_active', true)
        .order('sort_order')
        .order('slot_name')

      if (error) throw error
      return data as DocumentSlotTemplate[]
    },
    enabled: !!matterTypeId,
    staleTime: 3 * 60 * 1000,
  })
}

// ─── useDocumentSlotTemplatesByCaseType ──────────────────────────────────────────

export function useDocumentSlotTemplatesByCaseType(caseTypeId: string) {
  return useQuery({
    queryKey: slotTemplateKeys.byCaseType(caseTypeId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('document_slot_templates')
        .select('*')
        .eq('case_type_id', caseTypeId)
        .eq('is_active', true)
        .order('sort_order')
        .order('slot_name')

      if (error) throw error
      return data as DocumentSlotTemplate[]
    },
    enabled: !!caseTypeId,
    staleTime: 3 * 60 * 1000,
  })
}

// ─── useCreateDocumentSlotTemplate ──────────────────────────────────────────────

export function useCreateDocumentSlotTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      tenant_id: string
      slot_name: string
      matter_type_id?: string | null
      case_type_id?: string | null
      description?: string | null
      description_translations?: Record<string, string> | null
      category?: string
      person_role_scope?: string | null
      is_required?: boolean
      accepted_file_types?: string[]
      conditions?: Json
      sort_order?: number
      folder_template_id?: string | null
    }) => {
      const supabase = createClient()

      // Determine scope
      const scopeCol = input.matter_type_id ? 'matter_type_id' : 'case_type_id'
      const scopeId = (input.matter_type_id ?? input.case_type_id)!

      // Auto-generate slug with conflict resolution
      const baseSlug = slugify(input.slot_name)
      const slot_slug = await resolveUniqueSlug(
        supabase,
        input.tenant_id,
        scopeCol,
        scopeId,
        baseSlug
      )

      const { data, error } = await supabase
        .from('document_slot_templates')
        .insert({
          tenant_id: input.tenant_id,
          slot_name: input.slot_name,
          slot_slug,
          matter_type_id: input.matter_type_id ?? null,
          case_type_id: input.case_type_id ?? null,
          description: input.description ?? null,
          description_translations: input.description_translations ?? {},
          category: input.category ?? 'general',
          person_role_scope: input.person_role_scope || null,
          is_required: input.is_required ?? true,
          accepted_file_types: input.accepted_file_types ?? [
            'application/pdf',
            'image/jpeg',
            'image/png',
          ],
          conditions: input.conditions ?? null,
          sort_order: input.sort_order ?? 0,
          folder_template_id: input.folder_template_id ?? null,
        })
        .select()
        .single()

      if (error) throw error
      return data as DocumentSlotTemplate
    },
    onSuccess: (data) => {
      if (data.matter_type_id) {
        queryClient.invalidateQueries({
          queryKey: slotTemplateKeys.byMatterType(data.matter_type_id),
        })
      }
      if (data.case_type_id) {
        queryClient.invalidateQueries({
          queryKey: slotTemplateKeys.byCaseType(data.case_type_id),
        })
      }
      toast.success('Document slot template created')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create template')
    },
  })
}

// ─── useUpdateDocumentSlotTemplate ──────────────────────────────────────────────

export function useUpdateDocumentSlotTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      matterTypeId,
      caseTypeId,
      ...updates
    }: {
      id: string
      matterTypeId?: string | null
      caseTypeId?: string | null
      slot_name?: string
      description?: string | null
      description_translations?: Record<string, string> | null
      category?: string
      person_role_scope?: string | null
      is_required?: boolean
      accepted_file_types?: string[]
      conditions?: Json
      folder_template_id?: string | null
    }) => {
      const supabase = createClient()

      // Never update slot_slug — it's stable after creation
      const { data, error } = await supabase
        .from('document_slot_templates')
        .update({
          slot_name: updates.slot_name,
          description: updates.description,
          description_translations: updates.description_translations ?? undefined,
          category: updates.category,
          person_role_scope: updates.person_role_scope,
          is_required: updates.is_required,
          accepted_file_types: updates.accepted_file_types,
          conditions: updates.conditions,
          folder_template_id: updates.folder_template_id,
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return { ...data, _matterTypeId: matterTypeId, _caseTypeId: caseTypeId } as DocumentSlotTemplate & {
        _matterTypeId?: string | null
        _caseTypeId?: string | null
      }
    },
    onSuccess: (data) => {
      const matterTypeId = data._matterTypeId ?? data.matter_type_id
      const caseTypeId = data._caseTypeId ?? data.case_type_id
      if (matterTypeId) {
        queryClient.invalidateQueries({
          queryKey: slotTemplateKeys.byMatterType(matterTypeId),
        })
      }
      if (caseTypeId) {
        queryClient.invalidateQueries({
          queryKey: slotTemplateKeys.byCaseType(caseTypeId),
        })
      }
      toast.success('Document slot template updated')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update template')
    },
  })
}

// ─── useDeleteDocumentSlotTemplate ──────────────────────────────────────────────

export function useDeleteDocumentSlotTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      matterTypeId,
      caseTypeId,
    }: {
      id: string
      matterTypeId?: string | null
      caseTypeId?: string | null
    }) => {
      const supabase = createClient()

      // Soft-delete: preserve audit trail
      const { error } = await supabase
        .from('document_slot_templates')
        .update({ is_active: false })
        .eq('id', id)

      if (error) throw error
      return { matterTypeId, caseTypeId }
    },
    onSuccess: (data) => {
      if (data.matterTypeId) {
        queryClient.invalidateQueries({
          queryKey: slotTemplateKeys.byMatterType(data.matterTypeId),
        })
      }
      if (data.caseTypeId) {
        queryClient.invalidateQueries({
          queryKey: slotTemplateKeys.byCaseType(data.caseTypeId),
        })
      }
      toast.success('Document slot template deactivated')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to deactivate template')
    },
  })
}

// ─── useReorderDocumentSlotTemplates ────────────────────────────────────────────

export function useReorderDocumentSlotTemplates() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      templates,
      matterTypeId,
      caseTypeId,
    }: {
      templates: { id: string; sort_order: number }[]
      matterTypeId?: string | null
      caseTypeId?: string | null
    }) => {
      const supabase = createClient()
      for (const t of templates) {
        const { error } = await supabase
          .from('document_slot_templates')
          .update({ sort_order: t.sort_order })
          .eq('id', t.id)
        if (error) throw error
      }
      return { matterTypeId, caseTypeId }
    },
    onSuccess: (data) => {
      if (data.matterTypeId) {
        queryClient.invalidateQueries({
          queryKey: slotTemplateKeys.byMatterType(data.matterTypeId),
        })
      }
      if (data.caseTypeId) {
        queryClient.invalidateQueries({
          queryKey: slotTemplateKeys.byCaseType(data.caseTypeId),
        })
      }
    },
    onError: () => {
      toast.error('Failed to reorder templates')
    },
  })
}

// ─── Exported Utility ───────────────────────────────────────────────────────────

export { slugify }
