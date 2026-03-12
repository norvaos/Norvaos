'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'

type TenantDocumentLibraryRow = Database['public']['Tables']['tenant_document_library']['Row']
type TenantDocumentLibraryInsert = Database['public']['Tables']['tenant_document_library']['Insert']

const supabase = createClient()

export const libraryKeys = {
  all: (tenantId: string) => ['tenant_document_library', tenantId] as const,
  byCategory: (tenantId: string, category: string) =>
    ['tenant_document_library', tenantId, 'category', category] as const,
  byTag: (tenantId: string, tag: string) =>
    ['tenant_document_library', tenantId, 'tag', tag] as const,
}

// ── Queries ──────────────────────────────────────────────────────────────────

export function useTenantDocumentLibrary(tenantId: string) {
  return useQuery({
    queryKey: libraryKeys.all(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_document_library')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('category', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('slot_name', { ascending: true })
      if (error) throw error
      return data as TenantDocumentLibraryRow[]
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 5,
  })
}

export function useActiveLibraryEntries(tenantId: string) {
  return useQuery({
    queryKey: [...libraryKeys.all(tenantId), 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_document_library')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('category', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('slot_name', { ascending: true })
      if (error) throw error
      return data as TenantDocumentLibraryRow[]
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 5,
  })
}

// Returns how many document_slot_templates reference each library entry
// Used in the library settings page to show "X matter types using this"
export function useLibraryUsageCounts(tenantId: string) {
  return useQuery({
    queryKey: [...libraryKeys.all(tenantId), 'usage'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_slot_templates')
        .select('library_slot_id')
        .eq('tenant_id', tenantId)
        .not('library_slot_id', 'is', null)
        .eq('is_active', true)
      if (error) throw error
      const counts: Record<string, number> = {}
      for (const row of data ?? []) {
        if (row.library_slot_id) {
          counts[row.library_slot_id] = (counts[row.library_slot_id] ?? 0) + 1
        }
      }
      return counts
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 2,
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useCreateLibraryEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Omit<TenantDocumentLibraryInsert, 'slot_slug'> & { slot_slug?: string }) => {
      const slug = input.slot_slug ||
        input.slot_name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '')
      const { data, error } = await supabase
        .from('tenant_document_library')
        .insert({ ...input, slot_slug: slug })
        .select()
        .single()
      if (error) throw error
      return data as TenantDocumentLibraryRow
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: libraryKeys.all(data.tenant_id) })
    },
  })
}

export function useUpdateLibraryEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      tenantId,
      updates,
    }: {
      id: string
      tenantId: string
      updates: Partial<TenantDocumentLibraryInsert>
    }) => {
      const { data, error } = await supabase
        .from('tenant_document_library')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as TenantDocumentLibraryRow
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: libraryKeys.all(data.tenant_id) })
    },
  })
}

export function useDeactivateLibraryEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, tenantId }: { id: string; tenantId: string }) => {
      const { error } = await supabase
        .from('tenant_document_library')
        .update({ is_active: false })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, { tenantId }) => {
      qc.invalidateQueries({ queryKey: libraryKeys.all(tenantId) })
    },
  })
}

export function useRestoreLibraryEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, tenantId }: { id: string; tenantId: string }) => {
      const { error } = await supabase
        .from('tenant_document_library')
        .update({ is_active: true })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, { tenantId }) => {
      qc.invalidateQueries({ queryKey: libraryKeys.all(tenantId) })
    },
  })
}

// Syncs all document_slot_templates linked to a library entry with the
// library's current definition (name, description, category, is_required).
// Useful when a description is updated in the library.
export function useSyncLibraryEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      libraryEntry,
      tenantId,
    }: {
      libraryEntry: TenantDocumentLibraryRow
      tenantId: string
    }) => {
      const { error } = await supabase
        .from('document_slot_templates')
        .update({
          slot_name: libraryEntry.slot_name,
          description: libraryEntry.description,
          category: libraryEntry.category,
          is_required: libraryEntry.is_required,
          person_role_scope: libraryEntry.person_role_scope,
          accepted_file_types: libraryEntry.accepted_file_types,
        })
        .eq('library_slot_id', libraryEntry.id)
        .eq('tenant_id', tenantId)
      if (error) throw error
    },
    onSuccess: (_data, { tenantId }) => {
      qc.invalidateQueries({ queryKey: libraryKeys.all(tenantId) })
      qc.invalidateQueries({ queryKey: ['document_slot_templates'] })
    },
  })
}

// Bulk-add library entries to a matter type as document_slot_templates.
// Skips entries that already exist (by slot_slug + matter_type_id).
export function useAddLibraryToMatterType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      entries,
      matterTypeId,
      tenantId,
      existingSlugs,
      currentCount,
    }: {
      entries: TenantDocumentLibraryRow[]
      matterTypeId: string
      tenantId: string
      existingSlugs: Set<string>
      currentCount: number
    }) => {
      const toAdd = entries.filter((e) => !existingSlugs.has(e.slot_slug))
      if (toAdd.length === 0) return { added: 0 }

      const inserts = toAdd.map((e, i) => ({
        tenant_id: tenantId,
        matter_type_id: matterTypeId,
        library_slot_id: e.id,
        slot_name: e.slot_name,
        slot_slug: e.slot_slug,
        description: e.description,
        category: e.category,
        person_role_scope: e.person_role_scope,
        is_required: e.is_required,
        accepted_file_types: e.accepted_file_types,
        max_file_size_bytes: e.max_file_size_bytes,
        sort_order: currentCount + i + 1,
      }))

      const { error } = await supabase
        .from('document_slot_templates')
        .insert(inserts)
      if (error) throw error
      return { added: inserts.length }
    },
    onSuccess: (_data, { tenantId, matterTypeId }) => {
      qc.invalidateQueries({ queryKey: ['document_slot_templates', matterTypeId] })
      qc.invalidateQueries({ queryKey: libraryKeys.all(tenantId) })
    },
  })
}

// Same but for immigration case types
export function useAddLibraryToCaseType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      entries,
      caseTypeId,
      tenantId,
      existingSlugs,
      currentCount,
    }: {
      entries: TenantDocumentLibraryRow[]
      caseTypeId: string
      tenantId: string
      existingSlugs: Set<string>
      currentCount: number
    }) => {
      const toAdd = entries.filter((e) => !existingSlugs.has(e.slot_slug))
      if (toAdd.length === 0) return { added: 0 }

      const inserts = toAdd.map((e, i) => ({
        tenant_id: tenantId,
        case_type_id: caseTypeId,
        library_slot_id: e.id,
        slot_name: e.slot_name,
        slot_slug: e.slot_slug,
        description: e.description,
        category: e.category,
        person_role_scope: e.person_role_scope,
        is_required: e.is_required,
        accepted_file_types: e.accepted_file_types,
        max_file_size_bytes: e.max_file_size_bytes,
        sort_order: currentCount + i + 1,
      }))

      const { error } = await supabase
        .from('document_slot_templates')
        .insert(inserts)
      if (error) throw error
      return { added: inserts.length }
    },
    onSuccess: (_data, { tenantId, caseTypeId }) => {
      qc.invalidateQueries({ queryKey: ['document_slot_templates', caseTypeId] })
      qc.invalidateQueries({ queryKey: libraryKeys.all(tenantId) })
    },
  })
}
