'use client'

/**
 * Wiki Search  -  VELOCITY-powered searchable knowledge base.
 *
 * Features:
 * - Full-text search via PostgreSQL tsvector (< 100ms target)
 * - Unified results: playbooks + snippets in one stream
 * - Category filter sidebar
 * - Quick-access pinned playbooks
 */

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useWikiPlaybooks, useWikiCategories, useWikiSearch } from '@/lib/queries/wiki'
import { cn } from '@/lib/utils'
import { BookOpen, Search, FileText, Clipboard, Star, Tag, Plus, ArrowRight } from 'lucide-react'
import { NorvaWhisper } from '@/components/ui/norva-whisper'

// ── Debounce Hook ────────────────────────────────────────────────────────────

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function WikiPage() {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''
  const router = useRouter()

  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const debouncedSearch = useDebouncedValue(search, 200)

  // Queries
  const { data: categories = [] } = useWikiCategories(tenantId)
  const { data: pinnedPlaybooks = [] } = useWikiPlaybooks({
    tenantId,
    categoryId: activeCategory ?? undefined,
  })
  const { data: searchResults = [], isFetching: isSearching } = useWikiSearch(debouncedSearch)

  const isSearchActive = debouncedSearch.trim().length > 1

  const navigateToPlaybook = useCallback((id: string) => {
    router.push(`/wiki/playbooks/${id}`)
  }, [router])

  const pinned = pinnedPlaybooks.filter(p => p.is_pinned)
  const published = pinnedPlaybooks.filter(p => p.status === 'published' && !p.is_pinned)
  const drafts = pinnedPlaybooks.filter(p => p.status === 'draft')

  return (
    <div className="flex h-full">
      {/* ── Sidebar: Categories ──────────────────────────────────────── */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r bg-muted/50 p-4 gap-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Categories
        </h2>
        <button
          onClick={() => setActiveCategory(null)}
          className={cn(
            'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors text-left',
            !activeCategory
              ? 'bg-blue-50 text-blue-700 font-medium'
              : 'text-muted-foreground hover:bg-muted',
          )}
        >
          <BookOpen className="h-4 w-4" />
          All Playbooks
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors text-left',
              activeCategory === cat.id
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: cat.color }}
            />
            {cat.name}
          </button>
        ))}
        <div className="mt-auto pt-4 border-t">
          <button
            onClick={() => router.push('/wiki/snippets')}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted w-full text-left"
          >
            <Clipboard className="h-4 w-4" />
            Snippet Library
          </button>
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <div className="border-b bg-card px-6 py-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <BookOpen className="h-6 w-6 text-blue-600" />
                Norva Knowledge Wiki
                <NorvaWhisper contentKey="global.cmd_k" />
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Your firm&apos;s playbooks, SOPs, and reusable snippets  -  searchable in under 100ms.
              </p>
            </div>
            <button
              onClick={() => router.push('/wiki/playbooks/new')}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Playbook
            </button>
          </div>

          {/* VELOCITY Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search playbooks, snippets, tags... (VELOCITY engine)"
              className="w-full rounded-xl border border-border bg-muted py-3 pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:border-blue-300 focus:bg-card focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
            />
            {isSearching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              </div>
            )}
          </div>
        </div>

        <div className="p-6 space-y-8">
          {/* ── Search Results ──────────────────────────────────────── */}
          {isSearchActive ? (
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Search Results ({searchResults.length})
              </h2>
              {searchResults.length === 0 && !isSearching ? (
                <div className="rounded-xl border-2 border-dashed border-border p-8 text-center">
                  <Search className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No results found for &ldquo;{debouncedSearch}&rdquo;</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {searchResults.map(result => (
                    <button
                      key={result.id}
                      onClick={() => {
                        if (result.item_type === 'playbook') navigateToPlaybook(result.id)
                      }}
                      className="w-full rounded-xl border bg-card p-4 text-left hover:shadow-md transition-shadow flex items-start gap-3"
                    >
                      <div className={cn(
                        'mt-0.5 rounded-lg p-2',
                        result.item_type === 'playbook' ? 'bg-blue-50' : 'bg-amber-50',
                      )}>
                        {result.item_type === 'playbook' ? (
                          <FileText className="h-4 w-4 text-blue-600" />
                        ) : (
                          <Clipboard className="h-4 w-4 text-amber-600" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-foreground truncate">{result.title}</p>
                          <span className={cn(
                            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase',
                            result.item_type === 'playbook' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700',
                          )}>
                            {result.item_type}
                          </span>
                        </div>
                        {result.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{result.description}</p>
                        )}
                        {result.tags.length > 0 && (
                          <div className="flex gap-1 mt-2">
                            {result.tags.slice(0, 4).map(tag => (
                              <span key={tag} className="inline-flex items-center gap-0.5 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                <Tag className="h-2.5 w-2.5" />{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-1" />
                    </button>
                  ))}
                </div>
              )}
            </section>
          ) : (
            <>
              {/* ── Pinned Playbooks ─────────────────────────────────── */}
              {pinned.length > 0 && (
                <section>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Star className="h-3.5 w-3.5 text-amber-500" />
                    Pinned
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {pinned.map(pb => (
                      <PlaybookCard key={pb.id} playbook={pb} onClick={() => navigateToPlaybook(pb.id)} />
                    ))}
                  </div>
                </section>
              )}

              {/* ── Published Playbooks ──────────────────────────────── */}
              {published.length > 0 && (
                <section>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Published ({published.length})
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {published.map(pb => (
                      <PlaybookCard key={pb.id} playbook={pb} onClick={() => navigateToPlaybook(pb.id)} />
                    ))}
                  </div>
                </section>
              )}

              {/* ── Drafts ───────────────────────────────────────────── */}
              {drafts.length > 0 && (
                <section>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Drafts ({drafts.length})
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {drafts.map(pb => (
                      <PlaybookCard key={pb.id} playbook={pb} onClick={() => navigateToPlaybook(pb.id)} />
                    ))}
                  </div>
                </section>
              )}

              {/* ── Empty State ───────────────────────────────────────── */}
              {pinnedPlaybooks.length === 0 && (
                <div className="rounded-xl border-2 border-dashed border-border p-12 text-center">
                  <BookOpen className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                  <h3 className="text-lg font-semibold text-foreground/80 mb-1">No Playbooks Yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Create your first playbook to start building your firm&apos;s knowledge base.
                  </p>
                  <button
                    onClick={() => router.push('/wiki/playbooks/new')}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Create Playbook
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

// ── Playbook Card ────────────────────────────────────────────────────────────

function PlaybookCard({
  playbook,
  onClick,
}: {
  playbook: {
    id: string
    title: string
    description: string | null
    status: string
    tags: string[]
    is_pinned: boolean
    version_number: number
    updated_at: string
  }
  onClick: () => void
}) {
  const statusColor = playbook.status === 'published'
    ? 'bg-emerald-100 text-emerald-700'
    : playbook.status === 'draft'
    ? 'bg-amber-100 text-amber-700'
    : 'bg-muted text-muted-foreground'

  return (
    <button
      onClick={onClick}
      className="rounded-xl border bg-card p-4 text-left hover:shadow-md transition-all group"
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-sm font-semibold text-foreground group-hover:text-blue-600 transition-colors line-clamp-1">
          {playbook.title}
        </h3>
        {playbook.is_pinned && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />}
      </div>
      {playbook.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{playbook.description}</p>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium uppercase', statusColor)}>
            {playbook.status}
          </span>
          <span className="text-[10px] text-muted-foreground">v{playbook.version_number}</span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {new Date(playbook.updated_at).toLocaleDateString()}
        </span>
      </div>
      {playbook.tags.length > 0 && (
        <div className="flex gap-1 mt-2 flex-wrap">
          {playbook.tags.slice(0, 3).map(tag => (
            <span key={tag} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}
