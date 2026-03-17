'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useUIStore } from '@/lib/stores/ui-store'
import { useTenant } from '@/lib/hooks/use-tenant'
import { createClient } from '@/lib/supabase/client'
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
  Search,
  Loader2,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types for search results
// ---------------------------------------------------------------------------
interface SearchResult {
  id: string
  type: 'contact' | 'matter' | 'lead' | 'task'
  title: string
  subtitle: string
  url: string
}

// ---------------------------------------------------------------------------
// Debounce hook
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
  const open = useUIStore((s) => s.commandPaletteOpen)
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen)
  const openModal = useUIStore((s) => s.openModal)
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)

  const debouncedQuery = useDebounce(query, 300)

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
    if (!open) {
      setQuery('')
      setResults([])
    }
  }, [open])

  // Global search across contacts, matters, leads, tasks
  const performSearch = useCallback(
    async (searchTerm: string) => {
      if (!searchTerm.trim() || !tenantId) {
        setResults([])
        return
      }

      setIsSearching(true)

      try {
        const supabase = createClient()
        const q = `%${searchTerm}%`

        // Run all four queries in parallel
        const [contactsRes, mattersRes, leadsRes, tasksRes] = await Promise.all([
          // Search contacts by name or email
          supabase
            .from('contacts')
            .select('id, first_name, last_name, email_primary, organization_name, contact_type')
            .eq('tenant_id', tenantId)
            .or(`first_name.ilike.${q},last_name.ilike.${q},email_primary.ilike.${q},organization_name.ilike.${q}`)
            .limit(5),

          // Search matters by title or matter_number
          supabase
            .from('matters')
            .select('id, title, matter_number, status')
            .eq('tenant_id', tenantId)
            .or(`title.ilike.${q},matter_number.ilike.${q}`)
            .limit(5),

          // Search leads by contact info (via join)
          supabase
            .from('leads')
            .select('id, contact_id, source, contacts!inner(first_name, last_name, email_primary)')
            .eq('tenant_id', tenantId)
            .or(`contacts.first_name.ilike.${q},contacts.last_name.ilike.${q},contacts.email_primary.ilike.${q}`)
            .limit(5),

          // Search tasks by title or description
          supabase
            .from('tasks')
            .select('id, title, status, priority')
            .eq('tenant_id', tenantId)
            .eq('is_deleted', false)
            .or(`title.ilike.${q},description.ilike.${q}`)
            .limit(5),
        ])

        const searchResults: SearchResult[] = []

        // Process contacts
        if (contactsRes.data) {
          for (const c of contactsRes.data) {
            const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.organization_name || 'Unnamed'
            searchResults.push({
              id: c.id,
              type: 'contact',
              title: name,
              subtitle: c.email_primary || c.contact_type || 'Contact',
              url: `/contacts/${c.id}`,
            })
          }
        }

        // Process matters
        if (mattersRes.data) {
          for (const m of mattersRes.data) {
            searchResults.push({
              id: m.id,
              type: 'matter',
              title: m.title,
              subtitle: m.matter_number ? `#${m.matter_number} · ${m.status ?? ''}` : (m.status ?? ''),
              url: `/matters/${m.id}`,
            })
          }
        }

        // Process leads
        if (leadsRes.data) {
          for (const l of leadsRes.data) {
            const contact = l.contacts as any
            const name = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') : 'Unknown'
            searchResults.push({
              id: l.id,
              type: 'lead',
              title: name,
              subtitle: l.source ? `Lead · ${l.source}` : 'Lead',
              url: `/command/lead/${l.id}`,
            })
          }
        }

        // Process tasks
        if (tasksRes.data) {
          for (const t of tasksRes.data) {
            searchResults.push({
              id: t.id,
              type: 'task',
              title: t.title,
              subtitle: `${(t.status ?? '').replace(/_/g, ' ')} · ${t.priority ?? ''}`,
              url: '/tasks',
            })
          }
        }

        setResults(searchResults)
      } catch (error) {
        console.error('Global search error:', error)
        setResults([])
      } finally {
        setIsSearching(false)
      }
    },
    [tenantId]
  )

  // Trigger search when debounced query changes
  useEffect(() => {
    performSearch(debouncedQuery)
  }, [debouncedQuery, performSearch])

  function runAction(callback: () => void) {
    setOpen(false)
    callback()
  }

  // Group results by type
  const contactResults = results.filter((r) => r.type === 'contact')
  const matterResults = results.filter((r) => r.type === 'matter')
  const leadResults = results.filter((r) => r.type === 'lead')
  const taskResults = results.filter((r) => r.type === 'task')

  const hasResults = results.length > 0
  const hasQuery = query.trim().length > 0

  // Icon for result type
  function getTypeIcon(type: SearchResult['type']) {
    switch (type) {
      case 'contact': return <Users className="mr-2 size-4 text-blue-500" />
      case 'matter': return <Briefcase className="mr-2 size-4 text-green-500" />
      case 'lead': return <Target className="mr-2 size-4 text-orange-500" />
      case 'task': return <CheckSquare className="mr-2 size-4 text-purple-500" />
    }
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Global Search"
      description="Search across contacts, matters, leads, and tasks. Or use quick actions."
      shouldFilter={false}
    >
      <CommandInput
        placeholder="Search contacts, matters, leads, tasks..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {/* Loading state */}
        {isSearching && (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Searching...
          </div>
        )}

        {/* No results for query */}
        {!isSearching && hasQuery && !hasResults && (
          <CommandEmpty>No results found for &ldquo;{query}&rdquo;</CommandEmpty>
        )}

        {/* Search Results */}
        {!isSearching && hasQuery && hasResults && (
          <>
            {contactResults.length > 0 && (
              <CommandGroup heading="Contacts">
                {contactResults.map((r) => (
                  <CommandItem
                    key={r.id}
                    value={`contact-${r.id}-${r.title}`}
                    onSelect={() => runAction(() => router.push(r.url))}
                  >
                    {getTypeIcon(r.type)}
                    <div className="flex flex-col">
                      <span className="text-sm">{r.title}</span>
                      <span className="text-xs text-muted-foreground">{r.subtitle}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {matterResults.length > 0 && (
              <CommandGroup heading="Matters">
                {matterResults.map((r) => (
                  <CommandItem
                    key={r.id}
                    value={`matter-${r.id}-${r.title}`}
                    onSelect={() => runAction(() => router.push(r.url))}
                  >
                    {getTypeIcon(r.type)}
                    <div className="flex flex-col">
                      <span className="text-sm">{r.title}</span>
                      <span className="text-xs text-muted-foreground">{r.subtitle}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {leadResults.length > 0 && (
              <CommandGroup heading="Leads">
                {leadResults.map((r) => (
                  <CommandItem
                    key={r.id}
                    value={`lead-${r.id}-${r.title}`}
                    onSelect={() => runAction(() => router.push(r.url))}
                  >
                    {getTypeIcon(r.type)}
                    <div className="flex flex-col">
                      <span className="text-sm">{r.title}</span>
                      <span className="text-xs text-muted-foreground">{r.subtitle}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {taskResults.length > 0 && (
              <CommandGroup heading="Tasks">
                {taskResults.map((r) => (
                  <CommandItem
                    key={r.id}
                    value={`task-${r.id}-${r.title}`}
                    onSelect={() => runAction(() => router.push(r.url))}
                  >
                    {getTypeIcon(r.type)}
                    <div className="flex flex-col">
                      <span className="text-sm">{r.title}</span>
                      <span className="text-xs text-muted-foreground">{r.subtitle}</span>
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
              <CommandItem
                onSelect={() =>
                  runAction(() => openModal('create-contact'))
                }
              >
                <Plus className="mr-2 size-4" />
                New Contact
              </CommandItem>
              <CommandItem
                onSelect={() =>
                  runAction(() => openModal('create-matter'))
                }
              >
                <Plus className="mr-2 size-4" />
                New Matter
              </CommandItem>
              <CommandItem
                onSelect={() =>
                  runAction(() => openModal('create-task'))
                }
              >
                <Plus className="mr-2 size-4" />
                New Task
              </CommandItem>
              <CommandItem
                onSelect={() =>
                  runAction(() => openModal('create-lead'))
                }
              >
                <Plus className="mr-2 size-4" />
                New Lead
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            {/* Navigation */}
            <CommandGroup heading="Go to">
              <CommandItem
                onSelect={() => runAction(() => router.push('/'))}
              >
                <LayoutDashboard className="mr-2 size-4" />
                Dashboard
              </CommandItem>
              <CommandItem
                onSelect={() => runAction(() => router.push('/contacts'))}
              >
                <Users className="mr-2 size-4" />
                Contacts
              </CommandItem>
              <CommandItem
                onSelect={() => runAction(() => router.push('/matters'))}
              >
                <Briefcase className="mr-2 size-4" />
                Matters
              </CommandItem>
              <CommandItem
                onSelect={() => runAction(() => router.push('/leads'))}
              >
                <Target className="mr-2 size-4" />
                Leads
              </CommandItem>
              <CommandItem
                onSelect={() => runAction(() => router.push('/tasks'))}
              >
                <CheckSquare className="mr-2 size-4" />
                Tasks
              </CommandItem>
              <CommandItem
                onSelect={() => runAction(() => router.push('/calendar'))}
              >
                <Calendar className="mr-2 size-4" />
                Calendar
              </CommandItem>
              <CommandItem
                onSelect={() => runAction(() => router.push('/documents'))}
              >
                <FileText className="mr-2 size-4" />
                Documents
              </CommandItem>
              <CommandItem
                onSelect={() =>
                  runAction(() => router.push('/communications'))
                }
              >
                <Mail className="mr-2 size-4" />
                Communications
              </CommandItem>
              <CommandItem
                onSelect={() => runAction(() => router.push('/chat'))}
              >
                <MessageSquare className="mr-2 size-4" />
                Chat
              </CommandItem>
              <CommandItem
                onSelect={() => runAction(() => router.push('/billing'))}
              >
                <DollarSign className="mr-2 size-4" />
                Billing
              </CommandItem>
              <CommandItem
                onSelect={() => runAction(() => router.push('/reports'))}
              >
                <BarChart3 className="mr-2 size-4" />
                Reports
              </CommandItem>
              <CommandItem
                onSelect={() => runAction(() => router.push('/settings'))}
              >
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
