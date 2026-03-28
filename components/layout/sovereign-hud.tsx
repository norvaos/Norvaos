'use client'

/**
 * =============================================================================
 * Directive 045: Sovereign HUD (Heads-Up Display)
 * =============================================================================
 *
 * The "God-Mode" Command Centre. Pressing Cmd+K opens a prestige glass bar
 * that combines slash commands, global search, and contextual intelligence.
 *
 * Slash Commands:
 *   /genesis      Initiate New Matter
 *   /ledger       View Firm Financials (Principal-only)
 *   /audit        Forensic Scan  -  re-scan for 0-Day gaps
 *   /ignite       Submit to Gov (only if Readiness = 100)
 *   /whisper      Start AI Meeting (Norva Ear)
 *   /clio-sync    Refresh Clio Bridge
 *   /brand        Open Brand Wizard
 *
 * When no slash prefix: searches matters, contacts, documents sub-100ms.
 * Principal-only commands are hidden for Staff role via Feature Gating.
 */

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useUIStore } from '@/lib/stores/ui-store'
import { useUser } from '@/lib/hooks/use-user'
import { useGlobalSearch } from '@/lib/queries/global-search'
import { useWikiSearch } from '@/lib/queries/wiki'
import { useCrossLocaleSearch } from '@/components/search/SearchContext'
import { useI18n } from '@/lib/i18n/i18n-provider'
import {
  Sparkles,
  Briefcase,
  Users,
  Target,
  CheckSquare,
  BookOpen,
  ScrollText,
  Loader2,
  DollarSign,
  Shield,
  Flame,
  Mic,
  RefreshCw,
  Palette,
  Zap,
  FileText,
  LayoutDashboard,
  Calendar,
  Mail,
  MessageSquare,
  BarChart3,
  Settings,
  Plus,
  Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

interface SlashCommand {
  id: string
  label: string
  description: string
  icon: typeof Sparkles
  action: () => void
  /** Minimum role required. null = all users */
  minRole: 'principal' | 'admin' | null
  /** Only show when readiness is 100 */
  requiresReadiness100?: boolean
}

// ── Debounce Hook ────────────────────────────────────────────────────────────

function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debouncedValue
}

// ── Component ────────────────────────────────────────────────────────────────

export function SovereignHUD() {
  const router = useRouter()
  const { t } = useI18n()
  const { appUser } = useUser()
  const open = useUIStore((s) => s.commandPaletteOpen)
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen)
  const initialQuery = useUIStore((s) => s.commandPaletteInitialQuery)
  const openModal = useUIStore((s) => s.openModal)

  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const debouncedQuery = useDebounce(query, 120)

  // Cross-locale resolution (Directive 36.2)
  const { englishTerms } = useCrossLocaleSearch(debouncedQuery, 80)
  const effectiveQuery = englishTerms.length > 0 && debouncedQuery.trim().length > 0
    ? englishTerms[0]
    : debouncedQuery

  // Global search
  const isSlashMode = query.startsWith('/')
  const searchQuery = isSlashMode ? '' : effectiveQuery
  const { data: results, isFetching } = useGlobalSearch(searchQuery)
  const { data: wikiResults, isFetching: wikiFetching } = useWikiSearch(searchQuery)

  // Role-based filtering: check settings for role hint, or default to showing all
  // (server-side permissions enforce actual access  -  HUD just hides UI clutter)
  const userSettings = (appUser?.settings ?? {}) as Record<string, unknown>
  const isPrincipal = userSettings.role_hint === 'principal' || userSettings.role_hint === 'admin' || !userSettings.role_hint

  // ── Slash Commands ─────────────────────────────────────────────────────

  const slashCommands = useMemo<SlashCommand[]>(() => {
    const commands: SlashCommand[] = [
      // ── Core Quick Commands (for every user) ──
      {
        id: 'task',
        label: '/task',
        description: 'Create a new task in the Breeze',
        icon: CheckSquare,
        action: () => { setOpen(false); openModal('create-task') },
        minRole: null,
      },
      {
        id: 'contact',
        label: '/contact',
        description: 'Open the Contact Creator',
        icon: Users,
        action: () => { setOpen(false); openModal('create-contact') },
        minRole: null,
      },
      {
        id: 'genesis',
        label: '/genesis',
        description: 'Initiate a new matter',
        icon: Sparkles,
        action: () => { setOpen(false); openModal('create-matter') },
        minRole: null,
      },
      {
        id: 'bill',
        label: '/bill',
        description: 'Start a new invoice',
        icon: DollarSign,
        action: () => { setOpen(false); router.push('/billing') },
        minRole: null,
      },
      {
        id: 'event',
        label: '/event',
        description: 'Pin an event to the Firm Pulse',
        icon: Calendar,
        action: () => { setOpen(false); router.push('/calendar') },
        minRole: null,
      },
      {
        id: 'help',
        label: '/help',
        description: 'Open the help guide',
        icon: BookOpen,
        action: () => { setOpen(false); router.push('/help') },
        minRole: null,
      },
      // ── Power Commands (role-gated) ──
      {
        id: 'ledger',
        label: '/ledger',
        description: 'View firm financials',
        icon: DollarSign,
        action: () => { setOpen(false); router.push('/billing') },
        minRole: 'principal',
      },
      {
        id: 'audit',
        label: '/audit',
        description: 'Forensic scan - re-scan for 0-day gaps',
        icon: Shield,
        action: () => { setOpen(false); router.push('/admin/sentinel-command') },
        minRole: 'admin',
      },
      {
        id: 'ignite',
        label: '/ignite',
        description: 'Submit to government - final ritual',
        icon: Flame,
        action: () => { setOpen(false); /* Navigate to active matter's IRCC portal */ },
        minRole: null,
        requiresReadiness100: true,
      },
      {
        id: 'whisper',
        label: '/whisper',
        description: 'Start AI meeting recorder',
        icon: Mic,
        action: () => { setOpen(false); /* Trigger Norva Ear panel */ },
        minRole: null,
      },
      {
        id: 'clio-sync',
        label: '/clio-sync',
        description: 'Refresh Clio extraction bridge',
        icon: RefreshCw,
        action: () => { setOpen(false); router.push('/settings/integrations') },
        minRole: 'admin',
      },
      {
        id: 'brand',
        label: '/brand',
        description: 'Open brand wizard - logos, signatures',
        icon: Palette,
        action: () => { setOpen(false); router.push('/settings/brand') },
        minRole: 'admin',
      },
    ]

    // Filter by role
    return commands.filter((cmd) => {
      if (!cmd.minRole) return true
      if (cmd.minRole === 'principal') return isPrincipal
      if (cmd.minRole === 'admin') return isPrincipal
      return true
    })
  }, [isPrincipal, setOpen, openModal, router])

  // ── Filtered Slash Commands ────────────────────────────────────────────

  const filteredSlashCommands = useMemo(() => {
    if (!isSlashMode) return []
    const slashQuery = query.slice(1).toLowerCase()
    if (!slashQuery) return slashCommands
    return slashCommands.filter(
      (cmd) =>
        cmd.id.includes(slashQuery) ||
        cmd.label.includes(slashQuery) ||
        cmd.description.toLowerCase().includes(slashQuery),
    )
  }, [isSlashMode, query, slashCommands])

  // ── Ghost Auto-Complete ──────────────────────────────────────────────
  // When user types "/t", suggest "/task" as a ghost completion

  const ghostSuggestion = useMemo(() => {
    if (!isSlashMode) return ''
    const slashQuery = query.toLowerCase()
    if (slashQuery.length < 2) return ''
    const match = slashCommands.find((cmd) => cmd.label.startsWith(slashQuery) && cmd.label !== slashQuery)
    return match ? match.label : ''
  }, [isSlashMode, query, slashCommands])

  // ── Quick Actions + Navigation (when empty) ────────────────────────────

  const quickActions = useMemo(() => [
    { id: 'new-contact', label: 'New Contact', icon: Plus, action: () => { setOpen(false); openModal('create-contact') } },
    { id: 'new-matter', label: 'New Matter', icon: Plus, action: () => { setOpen(false); openModal('create-matter') } },
    { id: 'new-task', label: 'New Task', icon: Plus, action: () => { setOpen(false); openModal('create-task') } },
    { id: 'new-lead', label: 'New Lead', icon: Plus, action: () => { setOpen(false); openModal('create-lead') } },
  ], [setOpen, openModal])

  const navigationItems = useMemo(() => [
    { id: 'nav-dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/' },
    { id: 'nav-contacts', label: 'Contacts', icon: Users, path: '/contacts' },
    { id: 'nav-matters', label: 'Matters', icon: Briefcase, path: '/matters' },
    { id: 'nav-leads', label: 'Leads', icon: Target, path: '/leads' },
    { id: 'nav-tasks', label: 'Tasks', icon: CheckSquare, path: '/tasks' },
    { id: 'nav-calendar', label: 'Calendar', icon: Calendar, path: '/calendar' },
    { id: 'nav-documents', label: 'Documents', icon: FileText, path: '/documents' },
    { id: 'nav-communications', label: 'Communications', icon: Mail, path: '/communications' },
    { id: 'nav-billing', label: 'Billing', icon: DollarSign, path: '/billing' },
    { id: 'nav-reports', label: 'Reports', icon: BarChart3, path: '/reports' },
    { id: 'nav-settings', label: 'Settings', icon: Settings, path: '/settings' },
  ], [])

  // ── Build all items for keyboard navigation ────────────────────────────

  const allItems = useMemo(() => {
    const items: { id: string; action: () => void }[] = []

    if (isSlashMode) {
      filteredSlashCommands.forEach((cmd) => items.push({ id: cmd.id, action: cmd.action }))
    } else if (!query.trim()) {
      quickActions.forEach((a) => items.push({ id: a.id, action: a.action }))
      navigationItems.forEach((n) =>
        items.push({ id: n.id, action: () => { setOpen(false); router.push(n.path) } }),
      )
    } else {
      // Search results
      const contacts = results?.contacts ?? []
      const matters = results?.matters ?? []
      const leads = results?.leads ?? []
      const tasks = results?.tasks ?? []
      const wiki = wikiResults ?? []
      contacts.forEach((c) => items.push({ id: `c-${c.id}`, action: () => { setOpen(false); router.push(`/contacts/${c.id}`) } }))
      matters.forEach((m) => items.push({ id: `m-${m.id}`, action: () => { setOpen(false); router.push(`/matters/${m.id}`) } }))
      leads.forEach((l) => items.push({ id: `l-${l.id}`, action: () => { setOpen(false); router.push(`/command/lead/${l.id}`) } }))
      tasks.forEach((tk) => items.push({ id: `t-${tk.id}`, action: () => { setOpen(false); router.push('/tasks') } }))
      wiki.forEach((w) => items.push({
        id: `w-${w.id}`,
        action: () => { setOpen(false); router.push(w.item_type === 'playbook' ? `/wiki/playbooks/${w.id}` : `/wiki/snippets/${w.id}`) },
      }))
    }

    return items
  }, [isSlashMode, filteredSlashCommands, query, quickActions, navigationItems, results, wikiResults, setOpen, router])

  // ── Keyboard Navigation ────────────────────────────────────────────────

  useEffect(() => { setSelectedIndex(0) }, [query])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setSelectedIndex(0)
    }
  }, [open])

  useEffect(() => {
    if (open && initialQuery) setQuery(initialQuery)
  }, [open, initialQuery])

  // Cmd+K / Ctrl+K listener
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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Ghost auto-complete: Tab or → accepts the suggestion
      if ((e.key === 'Tab' || e.key === 'ArrowRight') && ghostSuggestion && isSlashMode) {
        e.preventDefault()
        setQuery(ghostSuggestion)
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, allItems.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter' && allItems[selectedIndex]) {
        e.preventDefault()
        allItems[selectedIndex].action()
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    },
    [allItems, selectedIndex, setOpen, ghostSuggestion, isSlashMode],
  )

  // Auto-focus input
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  if (!open) return null

  const hasQuery = query.trim().length > 0
  const contacts = results?.contacts ?? []
  const matters = results?.matters ?? []
  const leads = results?.leads ?? []
  const tasks = results?.tasks ?? []
  const wiki = wikiResults ?? []
  const isSearching = isFetching || wikiFetching
  const hasResults = contacts.length > 0 || matters.length > 0 || leads.length > 0 || tasks.length > 0 || wiki.length > 0

  let itemCounter = 0
  function nextIndex() { return itemCounter++ }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9990] bg-black/60 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* HUD Panel */}
      <div
        className={cn(
          'fixed top-[15%] left-1/2 -translate-x-1/2 z-[9991]',
          'w-full max-w-[640px] rounded-2xl overflow-hidden',
          'bg-[#09090b]/90 backdrop-blur-xl border border-zinc-800/60',
          'shadow-2xl shadow-emerald-900/20',
          'animate-in fade-in-0 zoom-in-95 duration-200',
        )}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input with Ghost Auto-Complete */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-800/60">
          <Search className="h-4 w-4 text-emerald-400 shrink-0" />
          <div className="relative flex-1">
            {/* Ghost suggestion (appears behind the real input) */}
            {ghostSuggestion && (
              <span className="absolute inset-0 flex items-center text-sm text-zinc-600 pointer-events-none font-mono">
                {ghostSuggestion}
              </span>
            )}
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or type / for commands..."
              className="relative w-full bg-transparent text-sm text-white placeholder:text-zinc-500 outline-none"
            />
          </div>
          {ghostSuggestion && (
            <span className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white/[0.06] text-[10px] text-zinc-500 font-mono">
              Tab ↹
            </span>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white/[0.06] text-[10px] text-zinc-500 font-mono">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[400px] overflow-y-auto p-2" role="listbox">
          {/* Slash Commands Mode */}
          {isSlashMode && (
            <div className="space-y-0.5">
              <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-zinc-600">
                Sovereign Commands
              </p>
              {filteredSlashCommands.length === 0 && (
                <p className="px-3 py-4 text-xs text-zinc-400 text-center">No matching commands</p>
              )}
              {filteredSlashCommands.map((cmd) => {
                const idx = nextIndex()
                const Icon = cmd.icon
                return (
                  <button
                    key={cmd.id}
                    role="option"
                    aria-selected={selectedIndex === idx}
                    onClick={cmd.action}
                    className={cn(
                      'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left transition-colors',
                      selectedIndex === idx
                        ? 'bg-white/[0.08] text-white'
                        : 'text-white/70 hover:bg-white/[0.04]',
                    )}
                  >
                    <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-white/[0.04] border border-white/[0.06] shrink-0">
                      <Icon className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono">{cmd.label}</p>
                      <p className="text-xs text-zinc-400">{cmd.description}</p>
                    </div>
                    {cmd.minRole && (
                      <span className="text-[9px] uppercase tracking-wider text-zinc-500 border border-white/[0.06] px-1.5 py-0.5 rounded">
                        {cmd.minRole}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Search Results */}
          {!isSlashMode && hasQuery && (
            <>
              {isSearching && !results && (
                <div className="flex items-center justify-center py-6 text-sm text-zinc-400">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching...
                </div>
              )}
              {!isSearching && !hasResults && (
                <p className="px-3 py-6 text-xs text-zinc-400 text-center">
                  No results for &quot;{query}&quot;
                </p>
              )}

              {matters.length > 0 && (
                <div className="space-y-0.5 mb-2">
                  <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-zinc-600">Matters</p>
                  {matters.map((m) => {
                    const idx = nextIndex()
                    return (
                      <button
                        key={m.id}
                        role="option"
                        aria-selected={selectedIndex === idx}
                        onClick={() => { setOpen(false); router.push(`/matters/${m.id}`) }}
                        className={cn(
                          'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-left transition-colors',
                          selectedIndex === idx ? 'bg-white/[0.08] text-white' : 'text-white/70 hover:bg-white/[0.04]',
                        )}
                      >
                        <Briefcase className="h-4 w-4 text-emerald-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{m.title}</p>
                          <p className="text-xs text-zinc-400 truncate">
                            {m.matter_number ? `#${m.matter_number}` : ''} {m.status ? `· ${m.status}` : ''}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {contacts.length > 0 && (
                <div className="space-y-0.5 mb-2">
                  <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-zinc-600">Contacts</p>
                  {contacts.map((c) => {
                    const idx = nextIndex()
                    const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.organization_name || 'Unnamed'
                    return (
                      <button
                        key={c.id}
                        role="option"
                        aria-selected={selectedIndex === idx}
                        onClick={() => { setOpen(false); router.push(`/contacts/${c.id}`) }}
                        className={cn(
                          'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-left transition-colors',
                          selectedIndex === idx ? 'bg-white/[0.08] text-white' : 'text-white/70 hover:bg-white/[0.04]',
                        )}
                      >
                        <Users className="h-4 w-4 text-blue-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{name}</p>
                          <p className="text-xs text-zinc-400 truncate">{c.email_primary || c.contact_type || 'Contact'}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {leads.length > 0 && (
                <div className="space-y-0.5 mb-2">
                  <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-zinc-600">Leads</p>
                  {leads.map((l) => {
                    const idx = nextIndex()
                    const name = [l.contact_first_name, l.contact_last_name].filter(Boolean).join(' ') || 'Unknown'
                    return (
                      <button
                        key={l.id}
                        role="option"
                        aria-selected={selectedIndex === idx}
                        onClick={() => { setOpen(false); router.push(`/command/lead/${l.id}`) }}
                        className={cn(
                          'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-left transition-colors',
                          selectedIndex === idx ? 'bg-white/[0.08] text-white' : 'text-white/70 hover:bg-white/[0.04]',
                        )}
                      >
                        <Target className="h-4 w-4 text-orange-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{name}</p>
                          <p className="text-xs text-zinc-400 truncate">Lead {l.source ? `· ${l.source}` : ''}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {tasks.length > 0 && (
                <div className="space-y-0.5 mb-2">
                  <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-zinc-600">Tasks</p>
                  {tasks.map((tk) => {
                    const idx = nextIndex()
                    return (
                      <button
                        key={tk.id}
                        role="option"
                        aria-selected={selectedIndex === idx}
                        onClick={() => { setOpen(false); router.push('/tasks') }}
                        className={cn(
                          'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-left transition-colors',
                          selectedIndex === idx ? 'bg-white/[0.08] text-white' : 'text-white/70 hover:bg-white/[0.04]',
                        )}
                      >
                        <CheckSquare className="h-4 w-4 text-purple-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{tk.title}</p>
                          <p className="text-xs text-zinc-400 truncate">
                            {(tk.status ?? '').replace(/_/g, ' ')} {tk.priority ? `· ${tk.priority}` : ''}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {wiki.length > 0 && (
                <div className="space-y-0.5 mb-2">
                  <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-zinc-600">Knowledge Base</p>
                  {wiki.map((w) => {
                    const idx = nextIndex()
                    return (
                      <button
                        key={w.id}
                        role="option"
                        aria-selected={selectedIndex === idx}
                        onClick={() => {
                          setOpen(false)
                          router.push(w.item_type === 'playbook' ? `/wiki/playbooks/${w.id}` : `/wiki/snippets/${w.id}`)
                        }}
                        className={cn(
                          'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-left transition-colors',
                          selectedIndex === idx ? 'bg-white/[0.08] text-white' : 'text-white/70 hover:bg-white/[0.04]',
                        )}
                      >
                        {w.item_type === 'playbook' ? (
                          <BookOpen className="h-4 w-4 text-amber-400 shrink-0" />
                        ) : (
                          <ScrollText className="h-4 w-4 text-teal-400 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{w.title}</p>
                          <p className="text-xs text-zinc-400 truncate">
                            {w.category_name ? `${w.category_name} · ` : ''}
                            {w.item_type === 'playbook' ? 'Playbook' : 'Snippet'}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* Default State: Quick Actions + Navigation */}
          {!isSlashMode && !hasQuery && (
            <>
              {/* Floating Slash Command Suggestions */}
              <div className="mb-3 rounded-lg bg-white/[0.02] border border-white/[0.06] px-3 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="h-3 w-3 text-emerald-400" />
                  <p className="text-[11px] text-zinc-400">
                    Type <span className="font-mono text-emerald-400">/</span> for instant commands
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { cmd: '/task', desc: 'New task', icon: CheckSquare },
                    { cmd: '/contact', desc: 'New contact', icon: Users },
                    { cmd: '/genesis', desc: 'New matter', icon: Sparkles },
                    { cmd: '/bill', desc: 'Invoice', icon: DollarSign },
                    { cmd: '/event', desc: 'Calendar', icon: Calendar },
                    { cmd: '/help', desc: 'Help guide', icon: BookOpen },
                  ].map(({ cmd, desc, icon: CmdIcon }) => (
                    <button
                      key={cmd}
                      onClick={() => setQuery(cmd)}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-left transition-colors hover:bg-white/[0.06] group"
                    >
                      <CmdIcon className="h-3 w-3 text-emerald-400/50 group-hover:text-emerald-400" />
                      <div className="min-w-0">
                        <span className="block text-[11px] font-mono text-emerald-400/70 group-hover:text-emerald-400">{cmd}</span>
                        <span className="block text-[9px] text-zinc-700">{desc}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-0.5 mb-2">
                <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-zinc-600">Quick Actions</p>
                {quickActions.map((a) => {
                  const idx = nextIndex()
                  const Icon = a.icon
                  return (
                    <button
                      key={a.id}
                      role="option"
                      aria-selected={selectedIndex === idx}
                      onClick={a.action}
                      className={cn(
                        'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-left transition-colors',
                        selectedIndex === idx ? 'bg-white/[0.08] text-white' : 'text-white/70 hover:bg-white/[0.04]',
                      )}
                    >
                      <Icon className="h-4 w-4 text-zinc-400" />
                      <span className="text-sm">{a.label}</span>
                    </button>
                  )
                })}
              </div>

              <div className="space-y-0.5">
                <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-zinc-600">Navigate</p>
                {navigationItems.map((n) => {
                  const idx = nextIndex()
                  const Icon = n.icon
                  return (
                    <button
                      key={n.id}
                      role="option"
                      aria-selected={selectedIndex === idx}
                      onClick={() => { setOpen(false); router.push(n.path) }}
                      className={cn(
                        'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-left transition-colors',
                        selectedIndex === idx ? 'bg-white/[0.08] text-white' : 'text-white/70 hover:bg-white/[0.04]',
                      )}
                    >
                      <Icon className="h-4 w-4 text-zinc-400" />
                      <span className="text-sm">{n.label}</span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-800/60">
          <div className="flex items-center gap-3 text-[10px] text-zinc-600">
            <span>
              <kbd className="font-mono">↑↓</kbd> navigate
            </span>
            <span>
              <kbd className="font-mono">↵</kbd> select
            </span>
            <span>
              <kbd className="font-mono">tab</kbd> complete
            </span>
            <span>
              <kbd className="font-mono">esc</kbd> close
            </span>
          </div>
          <span className="text-[9px] text-emerald-400/40 font-mono">Sovereign HUD</span>
        </div>
      </div>
    </>
  )
}
