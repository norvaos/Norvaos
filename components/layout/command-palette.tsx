'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/i18n-provider'
import { useUIStore } from '@/lib/stores/ui-store'
import { useGlobalSearch } from '@/lib/queries/global-search'
import { useWikiSearch } from '@/lib/queries/wiki'
import { useCrossLocaleSearch } from '@/components/search/SearchContext'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Target,
  CheckSquare,
  Calendar,
  FileText,
  Mail,
  MessageSquare,
  DollarSign,
  BarChart3,
  Settings,
  Plus,
  Loader2,
  BookOpen,
  ScrollText,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Debounce hook — 150ms for near-instant feel
// ---------------------------------------------------------------------------
function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debouncedValue
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function CommandPalette() {
  const router = useRouter()
  const { t } = useI18n()
  const open = useUIStore((s) => s.commandPaletteOpen)
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen)
  const initialQuery = useUIStore((s) => s.commandPaletteInitialQuery)
  const openModal = useUIStore((s) => s.openModal)

  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 150)

  // Deep-link: pre-fill query when opened via openCommandPaletteWith()
  useEffect(() => {
    if (open && initialQuery) {
      setQuery(initialQuery)
    }
  }, [open, initialQuery])

  // Directive 36.2: Cross-locale resolution — if user types "پاسپورٹ" (Urdu),
  // resolve to English equivalents ("Passport Number", "Passport Expiry Date")
  // and search with the first English match instead of the raw non-English term.
  const { englishTerms } = useCrossLocaleSearch(debouncedQuery, 80)
  const effectiveQuery = englishTerms.length > 0 && debouncedQuery.trim().length > 0
    ? englishTerms[0] // Use the first English canonical match
    : debouncedQuery

  // Single RPC call via TanStack Query — replaces 4 parallel client queries
  const { data: results, isFetching } = useGlobalSearch(effectiveQuery)

  // Directive 36.3: Wiki search — Universal Library (locale-agnostic).
  // Always searches English content regardless of Globe locale setting.
  // Uses the raw debouncedQuery AND effectiveQuery to cast the widest net.
  const { data: wikiResults, isFetching: wikiFetching } = useWikiSearch(effectiveQuery)

  // Listen for Cmd+K / Ctrl+K keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(!open)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, setOpen])

  // Clear state when dialog closes
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  function runAction(callback: () => void) {
    setOpen(false)
    callback()
  }

  const hasQuery = query.trim().length > 0
  const contacts = results?.contacts ?? []
  const matters = results?.matters ?? []
  const leads = results?.leads ?? []
  const tasks = results?.tasks ?? []
  const wiki = wikiResults ?? []
  const hasResults = contacts.length > 0 || matters.length > 0 || leads.length > 0 || tasks.length > 0 || wiki.length > 0
  const isSearching = isFetching || wikiFetching

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={t('common.globalSearch' as any)}
      description={t('common.globalSearchDescription' as any)}
      shouldFilter={false}
    >
      <CommandInput
        placeholder={t('common.searchPlaceholder' as any)}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {/* Loading state */}
        {isSearching && !results && !wikiResults && (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            {t('common.searching' as any)}
          </div>
        )}

        {/* No results for query */}
        {!isSearching && hasQuery && !hasResults && (
          <CommandEmpty>No results found for &ldquo;{query}&rdquo;</CommandEmpty>
        )}

        {/* Search Results */}
        {hasQuery && hasResults && (
          <>
            {contacts.length > 0 && (
              <CommandGroup heading="Contacts">
                {contacts.map((c) => {
                  const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.organization_name || 'Unnamed'
                  return (
                    <CommandItem
                      key={c.id}
                      value={`contact-${c.id}-${name}`}
                      onSelect={() => runAction(() => router.push(`/contacts/${c.id}`))}
                    >
                      <Users className="mr-2 size-4 text-blue-500" />
                      <div className="flex flex-col">
                        <span className="text-sm">{name}</span>
                        <span className="text-xs text-muted-foreground">{c.email_primary || c.contact_type || 'Contact'}</span>
                      </div>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}

            {matters.length > 0 && (
              <CommandGroup heading="Matters">
                {matters.map((m) => (
                  <CommandItem
                    key={m.id}
                    value={`matter-${m.id}-${m.title}`}
                    onSelect={() => runAction(() => router.push(`/matters/${m.id}`))}
                  >
                    <Briefcase className="mr-2 size-4 text-green-500" />
                    <div className="flex flex-col">
                      <span className="text-sm">{m.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {m.matter_number ? `#${m.matter_number} · ${m.status ?? ''}` : (m.status ?? '')}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {leads.length > 0 && (
              <CommandGroup heading="Leads">
                {leads.map((l) => {
                  const name = [l.contact_first_name, l.contact_last_name].filter(Boolean).join(' ') || 'Unknown'
                  return (
                    <CommandItem
                      key={l.id}
                      value={`lead-${l.id}-${name}`}
                      onSelect={() => runAction(() => router.push(`/command/lead/${l.id}`))}
                    >
                      <Target className="mr-2 size-4 text-orange-500" />
                      <div className="flex flex-col">
                        <span className="text-sm">{name}</span>
                        <span className="text-xs text-muted-foreground">{l.source ? `Lead · ${l.source}` : 'Lead'}</span>
                      </div>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}

            {tasks.length > 0 && (
              <CommandGroup heading="Tasks">
                {tasks.map((t) => (
                  <CommandItem
                    key={t.id}
                    value={`task-${t.id}-${t.title}`}
                    onSelect={() => runAction(() => router.push('/tasks'))}
                  >
                    <CheckSquare className="mr-2 size-4 text-purple-500" />
                    <div className="flex flex-col">
                      <span className="text-sm">{t.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {(t.status ?? '').replace(/_/g, ' ')} · {t.priority ?? ''}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* Knowledge Base — Universal Library (locale-agnostic, Directive 36.3) */}
            {wiki.length > 0 && (
              <CommandGroup heading="Knowledge Base">
                {wiki.map((w) => (
                  <CommandItem
                    key={w.id}
                    value={`wiki-${w.id}-${w.title}`}
                    onSelect={() => runAction(() =>
                      router.push(
                        w.item_type === 'playbook'
                          ? `/wiki/playbooks/${w.id}`
                          : `/wiki/snippets/${w.id}`
                      )
                    )}
                  >
                    {w.item_type === 'playbook' ? (
                      <BookOpen className="mr-2 size-4 text-amber-500" />
                    ) : (
                      <ScrollText className="mr-2 size-4 text-teal-500" />
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm truncate">{w.title}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {w.category_name ? `${w.category_name} · ` : ''}
                        {w.item_type === 'playbook' ? 'Playbook' : 'Snippet'}
                        {w.description ? ` — ${w.description.slice(0, 80)}` : ''}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        )}

        {/* Default state: Quick Actions + Navigation (shown when no query) */}
        {!hasQuery && (
          <>
            {/* Quick Actions */}
            <CommandGroup heading="Quick Actions">
              <CommandItem onSelect={() => runAction(() => openModal('create-contact'))}>
                <Plus className="mr-2 size-4" />
                New Contact
              </CommandItem>
              <CommandItem onSelect={() => runAction(() => openModal('create-matter'))}>
                <Plus className="mr-2 size-4" />
                New Matter
              </CommandItem>
              <CommandItem onSelect={() => runAction(() => openModal('create-task'))}>
                <Plus className="mr-2 size-4" />
                New Task
              </CommandItem>
              <CommandItem onSelect={() => runAction(() => openModal('create-lead'))}>
                <Plus className="mr-2 size-4" />
                New Lead
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            {/* Navigation */}
            <CommandGroup heading="Go to">
              <CommandItem onSelect={() => runAction(() => router.push('/'))}>
                <LayoutDashboard className="mr-2 size-4" />
                Dashboard
              </CommandItem>
              <CommandItem onSelect={() => runAction(() => router.push('/contacts'))}>
                <Users className="mr-2 size-4" />
                Contacts
              </CommandItem>
              <CommandItem onSelect={() => runAction(() => router.push('/matters'))}>
                <Briefcase className="mr-2 size-4" />
                Matters
              </CommandItem>
              <CommandItem onSelect={() => runAction(() => router.push('/leads'))}>
                <Target className="mr-2 size-4" />
                Leads
              </CommandItem>
              <CommandItem onSelect={() => runAction(() => router.push('/tasks'))}>
                <CheckSquare className="mr-2 size-4" />
                Tasks
              </CommandItem>
              <CommandItem onSelect={() => runAction(() => router.push('/calendar'))}>
                <Calendar className="mr-2 size-4" />
                Calendar
              </CommandItem>
              <CommandItem onSelect={() => runAction(() => router.push('/documents'))}>
                <FileText className="mr-2 size-4" />
                Documents
              </CommandItem>
              <CommandItem onSelect={() => runAction(() => router.push('/communications'))}>
                <Mail className="mr-2 size-4" />
                Communications
              </CommandItem>
              <CommandItem onSelect={() => runAction(() => router.push('/chat'))}>
                <MessageSquare className="mr-2 size-4" />
                Chat
              </CommandItem>
              <CommandItem onSelect={() => runAction(() => router.push('/billing'))}>
                <DollarSign className="mr-2 size-4" />
                Billing
              </CommandItem>
              <CommandItem onSelect={() => runAction(() => router.push('/reports'))}>
                <BarChart3 className="mr-2 size-4" />
                Reports
              </CommandItem>
              <CommandItem onSelect={() => runAction(() => router.push('/settings'))}>
                <Settings className="mr-2 size-4" />
                Settings
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
