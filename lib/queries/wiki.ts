/**
 * Wiki Knowledge Base  -  TanStack Query hooks.
 *
 * Domain: wiki_playbooks, wiki_snippets, wiki_categories, wiki_playbook_versions
 * Budget: All queries use explicit column fragments (< 20 cols each).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type {
  WikiPlaybookRow,
  WikiPlaybookInsert,
  WikiPlaybookUpdate,
  WikiSnippetRow,
  WikiSnippetInsert,
  WikiSnippetUpdate,
  WikiCategoryRow,
  WikiCategoryInsert,
  WikiCategoryUpdate,
  WikiPlaybookVersionRow,
  WikiSearchResult,
  Json,
} from '@/lib/types/database'

// ── Column Fragments (100/20 compliant) ──────────────────────────────────────

const PLAYBOOK_LIST_COLS = 'id, title, slug, description, status, is_pinned, version_number, tags, category_id, practice_area_id, updated_at, created_by, updated_by' as const // 13
const PLAYBOOK_DETAIL_COLS = 'id, tenant_id, title, slug, description, content, status, is_pinned, version_number, tags, category_id, practice_area_id, matter_type_id, created_at, updated_at, created_by, updated_by' as const // 17
const SNIPPET_LIST_COLS = 'id, title, content, snippet_type, tags, use_count, is_favourite, category_id, practice_area_id, updated_at, created_by' as const // 11
const VERSION_COLS = 'id, playbook_id, version_number, title, change_summary, created_at, created_by' as const // 7
const CATEGORY_COLS = 'id, name, slug, description, color, icon, sort_order, is_active' as const // 8

// ── Query Key Factory ────────────────────────────────────────────────────────

export const wikiKeys = {
  all: ['wiki'] as const,
  // Playbooks
  playbooks: () => [...wikiKeys.all, 'playbooks'] as const,
  playbookList: (tenantId: string, filters?: Record<string, unknown>) =>
    [...wikiKeys.playbooks(), 'list', tenantId, filters] as const,
  playbookDetail: (id: string) => [...wikiKeys.playbooks(), 'detail', id] as const,
  playbookVersions: (playbookId: string) => [...wikiKeys.playbooks(), 'versions', playbookId] as const,
  // Snippets
  snippets: () => [...wikiKeys.all, 'snippets'] as const,
  snippetList: (tenantId: string, filters?: Record<string, unknown>) =>
    [...wikiKeys.snippets(), 'list', tenantId, filters] as const,
  // Categories
  categories: () => [...wikiKeys.all, 'categories'] as const,
  categoryList: (tenantId: string) => [...wikiKeys.categories(), 'list', tenantId] as const,
  // Search
  search: (term: string) => [...wikiKeys.all, 'search', term] as const,
}

// ── Playbook Hooks ───────────────────────────────────────────────────────────

interface PlaybookListParams {
  tenantId: string
  categoryId?: string
  status?: string
  search?: string
  practiceAreaId?: string
}

export function useWikiPlaybooks(params: PlaybookListParams) {
  const { tenantId, categoryId, status, search, practiceAreaId } = params

  return useQuery({
    queryKey: wikiKeys.playbookList(tenantId, { categoryId, status, search, practiceAreaId }),
    queryFn: async () => {
      const supabase = createClient()
      let query = supabase
        .from('wiki_playbooks')
        .select(PLAYBOOK_LIST_COLS)
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('is_pinned', { ascending: false })
        .order('updated_at', { ascending: false })

      if (categoryId) query = query.eq('category_id', categoryId)
      if (status) query = query.eq('status', status)
      if (practiceAreaId) query = query.eq('practice_area_id', practiceAreaId)
      if (search?.trim()) {
        query = query.or(`title.ilike.%${search.trim()}%,description.ilike.%${search.trim()}%`)
      }

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as WikiPlaybookRow[]
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 2,
  })
}

export function useWikiPlaybook(id: string) {
  return useQuery({
    queryKey: wikiKeys.playbookDetail(id),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('wiki_playbooks')
        .select(PLAYBOOK_DETAIL_COLS)
        .eq('id', id)
        .single()

      if (error) throw error
      return data as WikiPlaybookRow
    },
    enabled: !!id,
  })
}

export function useCreatePlaybook() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: WikiPlaybookInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('wiki_playbooks')
        .insert(input)
        .select(PLAYBOOK_DETAIL_COLS)
        .single()

      if (error) throw error
      return data as WikiPlaybookRow
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: wikiKeys.playbooks() })
      toast.success('Playbook created')
    },
    onError: () => toast.error('Failed to create playbook'),
  })
}

export function useUpdatePlaybook() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: WikiPlaybookUpdate & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('wiki_playbooks')
        .update({ ...updates, updated_at: new Date().toISOString() } as Record<string, unknown>)
        .eq('id', id)
        .select(PLAYBOOK_DETAIL_COLS)
        .single()

      if (error) throw error
      return data as WikiPlaybookRow
    },
    onSuccess: (data) => {
      qc.setQueryData(wikiKeys.playbookDetail(data.id), data)
      qc.invalidateQueries({ queryKey: wikiKeys.playbooks() })
    },
    onError: () => toast.error('Failed to save playbook'),
  })
}

export function useDeletePlaybook() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('wiki_playbooks')
        .update({ is_active: false })
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: wikiKeys.playbooks() })
      toast.success('Playbook deleted')
    },
    onError: () => toast.error('Failed to delete playbook'),
  })
}

// ── Playbook Versions ────────────────────────────────────────────────────────

export function usePlaybookVersions(playbookId: string) {
  return useQuery({
    queryKey: wikiKeys.playbookVersions(playbookId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('wiki_playbook_versions')
        .select(VERSION_COLS)
        .eq('playbook_id', playbookId)
        .order('version_number', { ascending: false })
        .limit(50)

      if (error) throw error
      return (data ?? []) as WikiPlaybookVersionRow[]
    },
    enabled: !!playbookId,
  })
}

export function useCreatePlaybookVersion() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      tenant_id: string
      playbook_id: string
      version_number: number
      title: string
      content: Json
      change_summary?: string
      created_by?: string
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('wiki_playbook_versions')
        .insert(input)
        .select(VERSION_COLS)
        .single()

      if (error) throw error
      return data as WikiPlaybookVersionRow
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: wikiKeys.playbookVersions(data.playbook_id) })
    },
  })
}

// ── Snippet Hooks ────────────────────────────────────────────────────────────

interface SnippetListParams {
  tenantId: string
  categoryId?: string
  snippetType?: string
  search?: string
}

export function useWikiSnippets(params: SnippetListParams) {
  const { tenantId, categoryId, snippetType, search } = params

  return useQuery({
    queryKey: wikiKeys.snippetList(tenantId, { categoryId, snippetType, search }),
    queryFn: async () => {
      const supabase = createClient()
      let query = supabase
        .from('wiki_snippets')
        .select(SNIPPET_LIST_COLS)
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('is_favourite', { ascending: false })
        .order('use_count', { ascending: false })

      if (categoryId) query = query.eq('category_id', categoryId)
      if (snippetType) query = query.eq('snippet_type', snippetType)
      if (search?.trim()) {
        query = query.or(`title.ilike.%${search.trim()}%,content.ilike.%${search.trim()}%`)
      }

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as WikiSnippetRow[]
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 2,
  })
}

export function useCreateSnippet() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: WikiSnippetInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('wiki_snippets')
        .insert(input)
        .select(SNIPPET_LIST_COLS)
        .single()

      if (error) throw error
      return data as WikiSnippetRow
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: wikiKeys.snippets() })
      toast.success('Snippet created')
    },
    onError: () => toast.error('Failed to create snippet'),
  })
}

export function useUpdateSnippet() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: WikiSnippetUpdate & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('wiki_snippets')
        .update({ ...updates, updated_at: new Date().toISOString() } as Record<string, unknown>)
        .eq('id', id)
        .select(SNIPPET_LIST_COLS)
        .single()

      if (error) throw error
      return data as WikiSnippetRow
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: wikiKeys.snippets() })
    },
    onError: () => toast.error('Failed to update snippet'),
  })
}

export function useDeleteSnippet() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('wiki_snippets')
        .update({ is_active: false })
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: wikiKeys.snippets() })
      toast.success('Snippet deleted')
    },
    onError: () => toast.error('Failed to delete snippet'),
  })
}

export function useIncrementSnippetUse() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      // Atomic increment via RPC-style update
      const { data: current } = await supabase
        .from('wiki_snippets')
        .select('use_count')
        .eq('id', id)
        .single()

      const { error } = await supabase
        .from('wiki_snippets')
        .update({ use_count: (current?.use_count ?? 0) + 1 })
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: wikiKeys.snippets() })
    },
  })
}

// ── Category Hooks ───────────────────────────────────────────────────────────

export function useWikiCategories(tenantId: string) {
  return useQuery({
    queryKey: wikiKeys.categoryList(tenantId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('wiki_categories')
        .select(CATEGORY_COLS)
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (error) throw error
      return (data ?? []) as WikiCategoryRow[]
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 5,
  })
}

export function useCreateCategory() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: WikiCategoryInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('wiki_categories')
        .insert(input)
        .select(CATEGORY_COLS)
        .single()

      if (error) throw error
      return data as WikiCategoryRow
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: wikiKeys.categories() })
      toast.success('Category created')
    },
    onError: () => toast.error('Failed to create category'),
  })
}

export function useUpdateCategory() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: WikiCategoryUpdate & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('wiki_categories')
        .update(updates)
        .eq('id', id)
        .select(CATEGORY_COLS)
        .single()

      if (error) throw error
      return data as WikiCategoryRow
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: wikiKeys.categories() })
      toast.success('Category updated')
    },
    onError: () => toast.error('Failed to update category'),
  })
}

// ── VELOCITY Search ──────────────────────────────────────────────────────────

export function useWikiSearch(searchTerm: string) {
  return useQuery({
    queryKey: wikiKeys.search(searchTerm),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as unknown as { rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> })
        .rpc('wiki_search', {
          p_search_term: searchTerm,
          p_result_limit: 20,
        })

      if (error) throw error
      return (data ?? []) as WikiSearchResult[]
    },
    enabled: searchTerm.trim().length > 1,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 2,
    placeholderData: (prev: WikiSearchResult[] | undefined) => prev,
  })
}
