'use client'

/**
 * Snippet Library  -  reusable email templates and document clauses.
 *
 * Features:
 * - Filter by type (email, clause, template, note) and category
 * - Click-to-copy with use_count tracking
 * - Favourite snippets float to top
 * - Create/edit inline dialog
 * - Drag-friendly: each snippet has a copy button for "drag-and-drop" into work
 */

import { useState, useCallback } from 'react'
import { useSovereignGuard } from '@/components/ui/sovereign-guard'
import { useTenant } from '@/lib/hooks/use-tenant'
import {
  useWikiSnippets,
  useCreateSnippet,
  useUpdateSnippet,
  useDeleteSnippet,
  useIncrementSnippetUse,
  useWikiCategories,
} from '@/lib/queries/wiki'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { WikiSnippetType } from '@/lib/types/database'
import {
  Clipboard,
  Search,
  Plus,
  Copy,
  Star,
  Trash2,
  Edit3,
  X,
  Mail,
  FileText,
  StickyNote,
  ScrollText,
  Tag,
} from 'lucide-react'

// ── Constants ────────────────────────────────────────────────────────────────

const SNIPPET_TYPES: { value: WikiSnippetType; label: string; icon: typeof Mail }[] = [
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'clause', label: 'Clause', icon: ScrollText },
  { value: 'template', label: 'Template', icon: FileText },
  { value: 'note', label: 'Note', icon: StickyNote },
]

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SnippetsPage() {
  const { tenant } = useTenant()
  const guard = useSovereignGuard()
  const tenantId = tenant?.id ?? ''

  const [search, setSearch] = useState('')
  const [activeType, setActiveType] = useState<string | undefined>()
  const [activeCategory, setActiveCategory] = useState<string | undefined>()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Form state
  const [formTitle, setFormTitle] = useState('')
  const [formContent, setFormContent] = useState('')
  const [formType, setFormType] = useState<WikiSnippetType>('email')
  const [formCategoryId, setFormCategoryId] = useState<string | null>(null)
  const [formTags, setFormTags] = useState<string[]>([])
  const [formTagInput, setFormTagInput] = useState('')

  // Queries
  const { data: snippets = [], isLoading } = useWikiSnippets({
    tenantId,
    snippetType: activeType,
    categoryId: activeCategory,
    search: search.trim() || undefined,
  })
  const { data: categories = [] } = useWikiCategories(tenantId)
  const createSnippet = useCreateSnippet()
  const updateSnippet = useUpdateSnippet()
  const deleteSnippet = useDeleteSnippet()
  const incrementUse = useIncrementSnippetUse()

  // ── Copy to Clipboard ──────────────────────────────────────────────────────

  const copySnippet = useCallback(async (id: string, content: string) => {
    await navigator.clipboard.writeText(content)
    incrementUse.mutate(id)
    toast.success('Copied to clipboard')
  }, [incrementUse])

  // ── Form Handlers ──────────────────────────────────────────────────────────

  const resetForm = useCallback(() => {
    setFormTitle('')
    setFormContent('')
    setFormType('email')
    setFormCategoryId(null)
    setFormTags([])
    setFormTagInput('')
    setEditingId(null)
    setShowForm(false)
  }, [])

  const openEditForm = useCallback((snippet: {
    id: string
    title: string
    content: string
    snippet_type: WikiSnippetType
    category_id: string | null
    tags: string[]
  }) => {
    setEditingId(snippet.id)
    setFormTitle(snippet.title)
    setFormContent(snippet.content)
    setFormType(snippet.snippet_type)
    setFormCategoryId(snippet.category_id)
    setFormTags(snippet.tags)
    setShowForm(true)
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!formTitle.trim() || !formContent.trim()) {
      toast.error('Title and content are required')
      return
    }

    if (editingId) {
      await updateSnippet.mutateAsync({
        id: editingId,
        title: formTitle.trim(),
        content: formContent.trim(),
        snippet_type: formType,
        category_id: formCategoryId,
        tags: formTags,
      })
      toast.success('Snippet updated')
    } else {
      await createSnippet.mutateAsync({
        tenant_id: tenantId,
        title: formTitle.trim(),
        content: formContent.trim(),
        snippet_type: formType,
        category_id: formCategoryId,
        tags: formTags,
      })
    }
    resetForm()
  }, [editingId, formTitle, formContent, formType, formCategoryId, formTags, tenantId, createSnippet, updateSnippet, resetForm])

  const handleDelete = useCallback(async (id: string) => {
    const keep = await guard.confirm({
      variant: 'delete',
      title: 'Delete Snippet?',
      message: 'This snippet will be permanently removed from the Fortress. This action cannot be undone.',
      confirmLabel: 'Keep Snippet',
      cancelLabel: 'Delete Permanently',
    })
    if (keep) return
    await deleteSnippet.mutateAsync(id)
  }, [deleteSnippet, guard])

  const addFormTag = useCallback(() => {
    const tag = formTagInput.trim().toLowerCase()
    if (tag && !formTags.includes(tag)) {
      setFormTags(prev => [...prev, tag])
      setFormTagInput('')
    }
  }, [formTagInput, formTags])

  return (
    <div className="h-full overflow-auto">
      {/* Header */}
      <div className="border-b bg-white px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Clipboard className="h-6 w-6 text-amber-600" />
              Snippet Library
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Reusable email templates, document clauses, and notes. Click to copy.
            </p>
          </div>
          <button
            onClick={() => { resetForm(); setShowForm(true) }}
            className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Snippet
          </button>
        </div>

        {/* Search + Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search snippets..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm placeholder:text-slate-400 focus:border-amber-500/30 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-100 transition-all"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={activeType ?? ''}
              onChange={e => setActiveType(e.target.value || undefined)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"
            >
              <option value="">All Types</option>
              {SNIPPET_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <select
              value={activeCategory ?? ''}
              onChange={e => setActiveCategory(e.target.value || undefined)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"
            >
              <option value="">All Categories</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Snippet Grid */}
      <div className="p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
          </div>
        ) : snippets.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-slate-200 p-12 text-center">
            <Clipboard className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-700 mb-1">No Snippets Yet</h3>
            <p className="text-sm text-slate-500 mb-4">
              Create reusable text snippets your team can copy with a single click.
            </p>
            <button
              onClick={() => { resetForm(); setShowForm(true) }}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Create Snippet
            </button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {snippets.map(snippet => {
              const typeConfig = SNIPPET_TYPES.find(t => t.value === snippet.snippet_type) ?? SNIPPET_TYPES[0]
              const TypeIcon = typeConfig.icon

              return (
                <div
                  key={snippet.id}
                  className="rounded-xl border bg-white p-4 hover:shadow-md transition-shadow group"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="rounded-lg bg-amber-950/30 p-1.5 shrink-0">
                        <TypeIcon className="h-3.5 w-3.5 text-amber-600" />
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900 truncate">{snippet.title}</h3>
                    </div>
                    {snippet.is_favourite && (
                      <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />
                    )}
                  </div>

                  {/* Content Preview */}
                  <p className="text-xs text-slate-500 line-clamp-3 mb-3 whitespace-pre-wrap leading-relaxed">
                    {snippet.content}
                  </p>

                  {/* Tags */}
                  {snippet.tags.length > 0 && (
                    <div className="flex gap-1 flex-wrap mb-3">
                      {snippet.tags.slice(0, 4).map(tag => (
                        <span key={tag} className="inline-flex items-center gap-0.5 rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">
                          <Tag className="h-2.5 w-2.5" />{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase',
                        'bg-slate-100 text-slate-600',
                      )}>
                        {typeConfig.label}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {snippet.use_count} uses
                      </span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => copySnippet(snippet.id, snippet.content)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-950/30 hover:text-blue-600 transition-colors"
                        title="Copy to clipboard"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => openEditForm(snippet)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                        title="Edit"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(snippet.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-950/30 hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Create/Edit Modal ────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl mx-4">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingId ? 'Edit Snippet' : 'New Snippet'}
              </h2>
              <button onClick={resetForm} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Title</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder="e.g. Spousal Sponsorship Confirmation Email"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-amber-500/30 focus:outline-none focus:ring-2 focus:ring-amber-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Content</label>
                <textarea
                  value={formContent}
                  onChange={e => setFormContent(e.target.value)}
                  placeholder="Dear [Client Name],&#10;&#10;We are pleased to confirm..."
                  rows={6}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono focus:border-amber-500/30 focus:outline-none focus:ring-2 focus:ring-amber-100 resize-none"
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Type</label>
                  <select
                    value={formType}
                    onChange={e => setFormType(e.target.value as WikiSnippetType)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    {SNIPPET_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
                  <select
                    value={formCategoryId ?? ''}
                    onChange={e => setFormCategoryId(e.target.value || null)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="">None</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Tags</label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {formTags.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-amber-950/30 px-2.5 py-1 text-xs text-amber-400">
                      {tag}
                      <button onClick={() => setFormTags(prev => prev.filter(t => t !== tag))} className="hover:text-red-500">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <input
                  type="text"
                  value={formTagInput}
                  onChange={e => setFormTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFormTag() } }}
                  placeholder="Add tag and press Enter"
                  className="w-full rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs focus:border-amber-500/30 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t px-6 py-4">
              <button
                onClick={resetForm}
                className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={createSnippet.isPending || updateSnippet.isPending}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition-colors disabled:opacity-50"
              >
                {editingId ? 'Update' : 'Create'} Snippet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
