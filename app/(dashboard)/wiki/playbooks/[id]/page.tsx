'use client'

/**
 * Playbook Editor  -  Notion-style block editor with version control.
 *
 * Features:
 * - Block types: heading, paragraph, checklist, callout, divider, code, quote
 * - Real-time auto-save (VELOCITY-style debounced save, 1.5s after last edit)
 * - Version control: every save snapshots content to wiki_playbook_versions
 * - Version history sidebar with "who changed what, when"
 * - 20-column budget on all queries
 */

import { useState, useEffect, useCallback, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import { useTenant } from '@/lib/hooks/use-tenant'
import {
  useWikiPlaybook,
  useUpdatePlaybook,
  useCreatePlaybook,
  useCreatePlaybookVersion,
  usePlaybookVersions,
  useDeletePlaybook,
  useWikiCategories,
} from '@/lib/queries/wiki'
import { useSovereignGuard } from '@/components/ui/sovereign-guard'
import { cn } from '@/lib/utils'
import type { WikiBlockContent, Json } from '@/lib/types/database'
import {
  ArrowLeft,
  Save,
  History,
  Trash2,
  Plus,
  GripVertical,
  Type,
  AlignLeft,
  CheckSquare,
  AlertCircle,
  Minus,
  Code,
  Quote,
  Pin,
  Globe,
  X,
} from 'lucide-react'

// ── Block Helpers ────────────────────────────────────────────────────────────

function createBlock(type: WikiBlockContent['type'], content = ''): WikiBlockContent {
  return {
    id: crypto.randomUUID(),
    type,
    content,
    checked: type === 'checklist' ? false : undefined,
    level: type === 'heading' ? 2 : undefined,
  }
}

/**
 * Convert stored content to WikiBlockContent[].
 * Handles two formats:
 *  1. Native block array: [{ id, type, content }, ...]
 *  2. TipTap JSON (seeded playbooks): { type: "doc", content: [{ type: "heading", ... }] }
 */
function parseBlocks(content: Json): WikiBlockContent[] {
  // Already an array  -  native block format
  if (Array.isArray(content)) {
    return content.length === 0
      ? [createBlock('paragraph')]
      : (content as unknown as WikiBlockContent[])
  }

  // TipTap JSON: { type: "doc", content: [...] }
  if (
    content &&
    typeof content === 'object' &&
    'type' in content &&
    (content as Record<string, unknown>).type === 'doc' &&
    Array.isArray((content as Record<string, unknown>).content)
  ) {
    const nodes = (content as { content: Array<Record<string, unknown>> }).content
    const blocks: WikiBlockContent[] = nodes.map((node) => {
      const textParts = Array.isArray(node.content)
        ? (node.content as Array<{ text?: string }>).map((c) => c.text ?? '').join('')
        : ''

      if (node.type === 'heading') {
        return createBlock('heading', textParts)
      }
      return createBlock('paragraph', textParts)
    })
    return blocks.length > 0 ? blocks : [createBlock('paragraph')]
  }

  return [createBlock('paragraph')]
}

// ── Slug Generator ───────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'untitled'
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PlaybookEditorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const isNew = id === 'new'
  const router = useRouter()
  const guard = useSovereignGuard()
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''

  // Queries
  const { data: playbook, isLoading } = useWikiPlaybook(isNew ? '' : id)
  const { data: versions = [] } = usePlaybookVersions(isNew ? '' : id)
  const { data: categories = [] } = useWikiCategories(tenantId)
  const updatePlaybook = useUpdatePlaybook()
  const createPlaybook = useCreatePlaybook()
  const createVersion = useCreatePlaybookVersion()
  const deletePlaybook = useDeletePlaybook()

  // Local state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [blocks, setBlocks] = useState<WikiBlockContent[]>([createBlock('paragraph')])
  const [status, setStatus] = useState<'draft' | 'published'>('draft')
  const [isPinned, setIsPinned] = useState(false)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [hasInitialized, setHasInitialized] = useState(false)

  // Auto-save timer
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentIdRef = useRef<string | null>(isNew ? null : id)

  // Initialize from loaded playbook
  useEffect(() => {
    if (playbook && !hasInitialized) {
      setTitle(playbook.title)
      setDescription(playbook.description ?? '')
      setBlocks(parseBlocks(playbook.content))
      setStatus(playbook.status === 'archived' ? 'draft' : playbook.status as 'draft' | 'published')
      setIsPinned(playbook.is_pinned)
      setCategoryId(playbook.category_id)
      setTags(playbook.tags ?? [])
      setHasInitialized(true)
    }
    if (isNew && !hasInitialized) {
      setHasInitialized(true)
    }
  }, [playbook, hasInitialized, isNew])

  // ── Deep-link: scroll to URL hash anchor (e.g. #work-permit-restoration-hc-overlap)
  useEffect(() => {
    if (!hasInitialized || blocks.length === 0) return
    const hash = window.location.hash.slice(1)
    if (!hash) return
    // Small delay to let blocks render
    const timer = setTimeout(() => {
      const el = document.getElementById(hash)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 300)
    return () => clearTimeout(timer)
  }, [hasInitialized, blocks.length])

  // ── Save Logic (VELOCITY real-time) ────────────────────────────────────────

  const save = useCallback(async () => {
    if (!tenantId || !title.trim()) return

    setSaveStatus('saving')
    const content = blocks as unknown as Json

    if (!currentIdRef.current) {
      // Create new playbook
      const slug = slugify(title)
      const result = await createPlaybook.mutateAsync({
        tenant_id: tenantId,
        title: title.trim(),
        slug,
        description: description.trim() || undefined,
        content,
        status,
        is_pinned: isPinned,
        category_id: categoryId,
        tags,
      })
      currentIdRef.current = result.id
      // Replace URL without full navigation
      window.history.replaceState(null, '', `/wiki/playbooks/${result.id}`)
    } else {
      // Update existing + create version snapshot
      const nextVersion = (playbook?.version_number ?? 0) + 1
      await updatePlaybook.mutateAsync({
        id: currentIdRef.current,
        title: title.trim(),
        slug: slugify(title),
        description: description.trim() || null,
        content,
        status,
        is_pinned: isPinned,
        category_id: categoryId,
        tags,
        version_number: nextVersion,
      })

      // Snapshot version for audit trail
      await createVersion.mutateAsync({
        tenant_id: tenantId,
        playbook_id: currentIdRef.current,
        version_number: nextVersion,
        title: title.trim(),
        content,
        change_summary: `Saved by editor`,
      })
    }

    setSaveStatus('saved')
  }, [tenantId, title, description, blocks, status, isPinned, categoryId, tags, playbook, createPlaybook, updatePlaybook, createVersion])

  // Trigger auto-save 1.5s after last edit
  const markUnsaved = useCallback(() => {
    setSaveStatus('unsaved')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      save()
    }, 1500)
  }, [save])

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  // ── Block Operations ───────────────────────────────────────────────────────

  const updateBlock = useCallback((blockId: string, updates: Partial<WikiBlockContent>) => {
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, ...updates } : b))
    markUnsaved()
  }, [markUnsaved])

  const addBlockAfter = useCallback((afterId: string, type: WikiBlockContent['type'] = 'paragraph') => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === afterId)
      const newBlock = createBlock(type)
      const next = [...prev]
      next.splice(idx + 1, 0, newBlock)
      return next
    })
    markUnsaved()
  }, [markUnsaved])

  const removeBlock = useCallback((blockId: string) => {
    setBlocks(prev => {
      if (prev.length <= 1) return prev
      return prev.filter(b => b.id !== blockId)
    })
    markUnsaved()
  }, [markUnsaved])

  const moveBlock = useCallback((blockId: string, direction: 'up' | 'down') => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === blockId)
      if (direction === 'up' && idx > 0) {
        const next = [...prev];
        [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
        return next
      }
      if (direction === 'down' && idx < prev.length - 1) {
        const next = [...prev];
        [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
        return next
      }
      return prev
    })
    markUnsaved()
  }, [markUnsaved])

  // ── Tag Operations ─────────────────────────────────────────────────────────

  const addTag = useCallback(() => {
    const tag = tagInput.trim().toLowerCase()
    if (tag && !tags.includes(tag)) {
      setTags(prev => [...prev, tag])
      setTagInput('')
      markUnsaved()
    }
  }, [tagInput, tags, markUnsaved])

  const removeTag = useCallback((tag: string) => {
    setTags(prev => prev.filter(t => t !== tag))
    markUnsaved()
  }, [markUnsaved])

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = useCallback(async () => {
    if (!currentIdRef.current) return
    const keep = await guard.confirm({
      variant: 'delete',
      title: 'Delete Playbook?',
      message: 'This playbook and all its versions will be permanently removed from the Fortress. This action cannot be undone.',
      confirmLabel: 'Keep Playbook',
      cancelLabel: 'Delete Permanently',
    })
    if (keep) return
    await deletePlaybook.mutateAsync(currentIdRef.current)
    router.push('/wiki')
  }, [deletePlaybook, router, guard])

  // ── Loading State ──────────────────────────────────────────────────────────

  if (!isNew && isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* ── Editor Main ──────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto">
        {/* Toolbar */}
        <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/wiki')}
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-muted-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              <div className={cn(
                'h-2 w-2 rounded-full',
                saveStatus === 'saved' ? 'bg-emerald-950/300' : saveStatus === 'saving' ? 'bg-amber-950/300 animate-pulse' : 'bg-muted-foreground/30',
              )} />
              <span className="text-xs text-muted-foreground capitalize">{saveStatus}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { setIsPinned(!isPinned); markUnsaved() }}
              className={cn(
                'rounded-lg p-2 transition-colors',
                isPinned ? 'bg-amber-950/30 text-amber-600' : 'text-muted-foreground hover:bg-muted',
              )}
              title={isPinned ? 'Unpin' : 'Pin to top'}
            >
              <Pin className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                setStatus(status === 'draft' ? 'published' : 'draft')
                markUnsaved()
              }}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                status === 'published'
                  ? 'bg-emerald-950/30 text-emerald-400 hover:bg-emerald-950/40'
                  : 'bg-amber-950/30 text-amber-400 hover:bg-amber-950/40',
              )}
            >
              <Globe className="h-3.5 w-3.5" />
              {status === 'published' ? 'Published' : 'Draft'}
            </button>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={cn(
                'rounded-lg p-2 transition-colors',
                showHistory ? 'bg-blue-950/30 text-blue-600' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              <History className="h-4 w-4" />
            </button>
            <button
              onClick={() => save()}
              disabled={saveStatus === 'saving'}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              Save
            </button>
            {!isNew && (
              <button
                onClick={handleDelete}
                className="rounded-lg p-2 text-muted-foreground hover:bg-red-950/30 hover:text-red-600 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Editor Area */}
        <div className="max-w-3xl mx-auto px-6 py-8">
          {/* Title */}
          <input
            type="text"
            value={title}
            onChange={e => { setTitle(e.target.value); markUnsaved() }}
            placeholder="Playbook Title"
            className="w-full text-3xl font-bold text-foreground placeholder:text-muted-foreground/50 border-none outline-none bg-transparent mb-2"
          />

          {/* Description */}
          <input
            type="text"
            value={description}
            onChange={e => { setDescription(e.target.value); markUnsaved() }}
            placeholder="Brief description..."
            className="w-full text-sm text-muted-foreground placeholder:text-muted-foreground/50 border-none outline-none bg-transparent mb-2"
          />

          {/* Meta: Category + Tags */}
          <div className="flex flex-wrap items-center gap-2 mb-6 pb-6 border-b">
            <select
              value={categoryId ?? ''}
              onChange={e => { setCategoryId(e.target.value || null); markUnsaved() }}
              className="rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-muted-foreground"
            >
              <option value="">No Category</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            {tags.map(tag => (
              <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-blue-950/30 px-2.5 py-1 text-xs text-blue-400">
                {tag}
                <button onClick={() => removeTag(tag)} className="hover:text-red-500">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              type="text"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
              placeholder="+ Add tag"
              className="rounded-lg border border-dashed border-border bg-transparent px-2.5 py-1 text-xs placeholder:text-muted-foreground outline-none focus:border-blue-500/30 w-24"
            />
          </div>

          {/* ── Blocks ──────────────────────────────────────────────── */}
          <div className="space-y-1">
            {blocks.map(block => (
              <BlockEditor
                key={block.id}
                block={block}
                onUpdate={updates => updateBlock(block.id, updates)}
                onAddAfter={type => addBlockAfter(block.id, type)}
                onRemove={() => removeBlock(block.id)}
                onMove={dir => moveBlock(block.id, dir)}
              />
            ))}
          </div>

          {/* Add Block Button */}
          <div className="mt-4 flex justify-center">
            <button
              onClick={() => addBlockAfter(blocks[blocks.length - 1].id)}
              className="flex items-center gap-1.5 rounded-lg border-2 border-dashed border-border px-4 py-2 text-xs text-muted-foreground hover:border-blue-500/30 hover:text-blue-500 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Block
            </button>
          </div>
        </div>
      </main>

      {/* ── Version History Sidebar ───────────────────────────────────── */}
      {showHistory && (
        <aside className="w-72 shrink-0 border-l bg-muted/50 overflow-auto">
          <div className="p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" />
              Version History
            </h3>
            {versions.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No versions yet. Save to create the first version.</p>
            ) : (
              <div className="space-y-2">
                {versions.map(v => (
                  <div key={v.id} className="rounded-lg border bg-card p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-foreground/80">v{v.version_number}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(v.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">{v.title}</p>
                    {v.change_summary && (
                      <p className="text-[10px] text-muted-foreground mt-1 italic">{v.change_summary}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}

// ── Block Editor Component ───────────────────────────────────────────────────

const BLOCK_TYPES: { type: WikiBlockContent['type']; icon: typeof Type; label: string }[] = [
  { type: 'heading', icon: Type, label: 'Heading' },
  { type: 'paragraph', icon: AlignLeft, label: 'Paragraph' },
  { type: 'checklist', icon: CheckSquare, label: 'Checklist' },
  { type: 'callout', icon: AlertCircle, label: 'Callout' },
  { type: 'code', icon: Code, label: 'Code' },
  { type: 'quote', icon: Quote, label: 'Quote' },
  { type: 'divider', icon: Minus, label: 'Divider' },
]

function BlockEditor({
  block,
  onUpdate,
  onAddAfter,
  onRemove,
  onMove,
}: {
  block: WikiBlockContent
  onUpdate: (updates: Partial<WikiBlockContent>) => void
  onAddAfter: (type?: WikiBlockContent['type']) => void
  onRemove: () => void
  onMove: (direction: 'up' | 'down') => void
}) {
  const [showMenu, setShowMenu] = useState(false)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onAddAfter('paragraph')
    }
    if (e.key === 'Backspace' && block.content === '') {
      e.preventDefault()
      onRemove()
    }
  }

  return (
    <div className="group relative flex items-start gap-1">
      {/* Grip + Controls */}
      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center pt-1.5 -ml-8 shrink-0">
        <button
          onClick={() => onMove('up')}
          className="text-muted-foreground/50 hover:text-muted-foreground text-[10px]"
          title="Move up"
        >
          ▲
        </button>
        <button
          className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground"
          title="Drag to reorder"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onMove('down')}
          className="text-muted-foreground/50 hover:text-muted-foreground text-[10px]"
          title="Move down"
        >
          ▼
        </button>
      </div>

      {/* Block Type Selector */}
      <div className="relative shrink-0">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity rounded p-1 text-muted-foreground/50 hover:bg-muted hover:text-muted-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        {showMenu && (
          <div className="absolute left-0 top-8 z-20 w-40 rounded-lg border bg-card shadow-lg py-1">
            {BLOCK_TYPES.map(bt => (
              <button
                key={bt.type}
                onClick={() => {
                  onUpdate({ type: bt.type })
                  setShowMenu(false)
                }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
              >
                <bt.icon className="h-3.5 w-3.5" />
                {bt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Block Content */}
      <div className="flex-1 min-w-0">
        {block.type === 'divider' ? (
          <hr className="my-4 border-border" />
        ) : block.type === 'heading' ? (
          <div id={slugify(block.content)} className="scroll-mt-24">
            <textarea
              value={block.content}
              onChange={e => onUpdate({ content: e.target.value })}
              onKeyDown={handleKeyDown}
              placeholder="Heading"
              rows={1}
              className="w-full resize-none text-xl font-bold text-foreground placeholder:text-muted-foreground/50 border-none outline-none bg-transparent"
            />
          </div>
        ) : block.type === 'checklist' ? (
          <div className="flex items-start gap-2 py-1">
            <input
              type="checkbox"
              checked={block.checked ?? false}
              onChange={e => onUpdate({ checked: e.target.checked })}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <textarea
              value={block.content}
              onChange={e => onUpdate({ content: e.target.value })}
              onKeyDown={handleKeyDown}
              placeholder="Checklist item..."
              rows={1}
              className={cn(
                'w-full resize-none text-sm border-none outline-none bg-transparent',
                block.checked ? 'text-muted-foreground line-through' : 'text-foreground/80',
              )}
            />
          </div>
        ) : block.type === 'callout' ? (
          <div className="rounded-lg border-l-4 border-amber-400 bg-amber-950/30 p-3 my-1">
            <textarea
              value={block.content}
              onChange={e => onUpdate({ content: e.target.value })}
              onKeyDown={handleKeyDown}
              placeholder="Callout or important note..."
              rows={1}
              className="w-full resize-none text-sm text-amber-900 placeholder:text-amber-400 border-none outline-none bg-transparent"
            />
          </div>
        ) : block.type === 'code' ? (
          <div className="rounded-lg bg-zinc-900 p-3 my-1">
            <textarea
              value={block.content}
              onChange={e => onUpdate({ content: e.target.value })}
              placeholder="Code block..."
              rows={3}
              className="w-full resize-none text-sm text-emerald-400 placeholder:text-muted-foreground border-none outline-none bg-transparent font-mono"
            />
          </div>
        ) : block.type === 'quote' ? (
          <div className="border-l-4 border-slate-300 pl-4 my-1">
            <textarea
              value={block.content}
              onChange={e => onUpdate({ content: e.target.value })}
              onKeyDown={handleKeyDown}
              placeholder="Quote..."
              rows={1}
              className="w-full resize-none text-sm text-muted-foreground italic placeholder:text-muted-foreground/50 border-none outline-none bg-transparent"
            />
          </div>
        ) : (
          <textarea
            value={block.content}
            onChange={e => onUpdate({ content: e.target.value })}
            onKeyDown={handleKeyDown}
            placeholder="Type something..."
            rows={1}
            className="w-full resize-none text-sm text-foreground/80 placeholder:text-muted-foreground/50 border-none outline-none bg-transparent py-1"
          />
        )}
      </div>
    </div>
  )
}
