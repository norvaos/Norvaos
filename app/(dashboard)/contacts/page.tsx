'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useI18n } from '@/lib/i18n/i18n-provider'
import { useQueryClient } from '@tanstack/react-query'
import { useContacts, contactKeys, CONTACT_DETAIL_COLUMNS } from '@/lib/queries/contacts'
import { createClient } from '@/lib/supabase/client'
import { CONTACT_SOURCES, CONTACT_TYPES } from '@/lib/utils/constants'
import { ClassificationBadge } from '@/components/contacts/classification-badge'
import { formatDate, formatPhoneNumber, formatFullName, formatInitials } from '@/lib/utils/formatters'
import { SovereignContactCreator } from '@/components/contacts/sovereign-contact-creator'
import { EmptyState } from '@/components/shared/empty-state'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Search,
  Plus,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Users,
  X,
  User,
  Building2,
  SlidersHorizontal,
} from 'lucide-react'

// ─── Column definitions ─────────────────────────────────────────────

interface ColumnDef {
  id: string
  label: string
  labelKey: string
  sortField?: string
  defaultVisible: boolean
  minWidth?: string
}

const COLUMNS: ColumnDef[] = [
  { id: 'name', label: 'Name', labelKey: 'contacts.col_name', sortField: 'name', defaultVisible: true },
  { id: 'email', label: 'Email', labelKey: 'contacts.col_email', sortField: 'email_primary', defaultVisible: true },
  { id: 'phone', label: 'Phone', labelKey: 'contacts.col_phone', sortField: 'phone_primary', defaultVisible: true },
  { id: 'type', label: 'Type', labelKey: 'contacts.col_type', defaultVisible: true },
  { id: 'classification', label: 'Classification', labelKey: 'contacts.col_classification', sortField: 'client_status', defaultVisible: true },
  { id: 'source', label: 'Source', labelKey: 'contacts.col_source', sortField: 'source', defaultVisible: true },
  { id: 'created', label: 'Created', labelKey: 'contacts.col_created', sortField: 'created_at', defaultVisible: true },
  { id: 'last_contacted', label: 'Last Contacted', labelKey: 'contacts.col_last_contacted', sortField: 'last_contacted_at', defaultVisible: false },
  { id: 'location', label: 'Location', labelKey: 'contacts.col_location', defaultVisible: false },
  { id: 'job_title', label: 'Job Title', labelKey: 'contacts.col_job_title', defaultVisible: false },
]

const STORAGE_KEY = 'norvaos:contacts:visible-columns'

function loadVisibleColumns(): Set<string> {
  if (typeof window === 'undefined') return new Set(COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id))
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return new Set(JSON.parse(stored))
  } catch { /* ignore */ }
  return new Set(COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id))
}

// ─── Sort helpers ────────────────────────────────────────────────────

type SortField = 'name' | 'email_primary' | 'phone_primary' | 'source' | 'created_at' | 'last_contacted_at'

function mapSortField(field: SortField): string {
  if (field === 'name') return 'last_name'
  return field
}

// ─── Page component ──────────────────────────────────────────────────

export default function ContactsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { tenant } = useTenant()
  const { t } = useI18n()

  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [contactType, setContactType] = useState<string>('')
  const [source, setSource] = useState<string>('')
  const [sortBy, setSortBy] = useState<SortField>('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [createOpen, setCreateOpen] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(loadVisibleColumns)

  // Persist column visibility
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...visibleColumns]))
  }, [visibleColumns])

  function toggleColumn(columnId: string) {
    setVisibleColumns((prev) => {
      const next = new Set(prev)
      if (next.has(columnId)) {
        // Don't allow hiding the Name column
        if (columnId === 'name') return prev
        next.delete(columnId)
      } else {
        next.add(columnId)
      }
      return next
    })
  }

  // Debounced search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value)
      setPage(1)
    }, 300)
  }, [])

  const { data, isLoading, isError } = useContacts({
    tenantId: tenant?.id ?? '',
    page,
    pageSize: 25,
    search: debouncedSearch || undefined,
    sortBy: mapSortField(sortBy),
    sortDirection,
    contactType: contactType || undefined,
    source: source || undefined,
  })

  const contacts = data?.contacts ?? []
  const totalCount = data?.totalCount ?? 0
  const totalPages = data?.totalPages ?? 1

  // Selection helpers
  const allSelected = contacts.length > 0 && contacts.every((c) => selectedIds.has(c.id))
  const someSelected = contacts.some((c) => selectedIds.has(c.id))

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(contacts.map((c) => c.id)))
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Sorting
  function handleSort(field: SortField) {
    if (sortBy === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortDirection('asc')
    }
    setPage(1)
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortBy !== field) return <ArrowUpDown className="ml-1 size-3.5 text-muted-foreground/50" />
    if (sortDirection === 'asc') return <ArrowUp className="ml-1 size-3.5" />
    return <ArrowDown className="ml-1 size-3.5" />
  }

  // Filter reset
  const hasFilters = !!contactType || !!source || !!debouncedSearch

  function clearFilters() {
    setSearch('')
    setDebouncedSearch('')
    setContactType('')
    setSource('')
    setPage(1)
  }

  // Display helpers
  function getDisplayName(contact: typeof contacts[number]): string {
    if (contact.contact_type === 'organization') {
      return contact.organization_name ?? 'Unnamed Organisation'
    }
    return formatFullName(contact.first_name, contact.last_name) || 'Unnamed Contact'
  }

  function getInitials(contact: typeof contacts[number]): string {
    if (contact.contact_type === 'organization') {
      return (contact.organization_name?.slice(0, 2) ?? '??').toUpperCase()
    }
    return formatInitials(contact.first_name, contact.last_name)
  }

  function getLocation(contact: typeof contacts[number]): string {
    const parts = [contact.city, contact.province_state, contact.country].filter(Boolean)
    return parts.join(', ') || '-'
  }

  // Visible column set for header rendering
  const activeColumns = COLUMNS.filter((c) => visibleColumns.has(c.id))

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t('nav.contacts')}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t('contacts.subtitle' as any)}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 size-4" />
          {t('dashboard.new_contact')}
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select
          value={contactType}
          onValueChange={(val) => {
            setContactType(val === 'all' ? '' : val)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t('contacts.all_types' as any)} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('contacts.all_types' as any)}</SelectItem>
            {CONTACT_TYPES.map((ct) => (
              <SelectItem key={ct.value} value={ct.value}>
                {ct.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={source}
          onValueChange={(val) => {
            setSource(val === 'all' ? '' : val)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t('contacts.all_sources' as any)} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('contacts.all_sources' as any)}</SelectItem>
            {CONTACT_SOURCES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 size-3.5" />
            {t('contacts.clear_filters' as any)}
          </Button>
        )}

        {/* Column visibility toggle */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="ml-auto">
              <SlidersHorizontal className="mr-1.5 size-3.5" />
              {t('contacts.columns' as any)}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>{t('contacts.toggle_columns' as any)}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {COLUMNS.map((col) => (
              <DropdownMenuCheckboxItem
                key={col.id}
                checked={visibleColumns.has(col.id)}
                onCheckedChange={() => toggleColumn(col.id)}
                disabled={col.id === 'name'}
              >
                {t(col.labelKey as any, col.label)}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Results count */}
      {!isLoading && (
        <div className="text-sm text-muted-foreground">
          {totalCount} {totalCount === 1 ? t('contacts.contact_found' as any) : t('contacts.contacts_found' as any)}
          {selectedIds.size > 0 && (
            <span className="ml-2 font-medium text-slate-700">
              ({selectedIds.size} {t('contacts.selected' as any)})
            </span>
          )}
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border bg-white">
        {isLoading ? (
          <ContactsTableSkeleton />
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-destructive">{t('contacts.failed_load' as any)}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => window.location.reload()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : contacts.length === 0 ? (
          hasFilters ? (
            <EmptyState
              icon={Search}
              title={t('contacts.no_found_title' as any)}
              description={t('contacts.no_found_desc' as any)}
              actionLabel={t('contacts.clear_filters' as any)}
              onAction={clearFilters}
            />
          ) : (
            <EmptyState
              icon={Users}
              title={t('contacts.no_yet_title' as any)}
              description={t('contacts.no_yet_desc' as any)}
              quickHint={t('contacts.no_yet_hint' as any)}
              actionLabel={t('contacts.add_contact' as any)}
              onAction={() => setCreateOpen(true)}
            />
          )
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all contacts"
                      {...(someSelected && !allSelected ? { 'data-state': 'indeterminate' } : {})}
                    />
                  </TableHead>
                  {activeColumns.map((col) => (
                    <TableHead key={col.id}>
                      {col.sortField ? (
                        <button
                          type="button"
                          className="flex items-center text-xs font-medium hover:text-foreground"
                          onClick={() => handleSort(col.sortField as SortField)}
                        >
                          {t(col.labelKey as any, col.label)}
                          <SortIcon field={col.sortField as SortField} />
                        </button>
                      ) : (
                        <span className="text-xs font-medium">{t(col.labelKey as any, col.label)}</span>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => (
                  <TableRow
                    key={contact.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => router.push(`/contacts/${contact.id}`)}
                    onMouseEnter={() => {
                      if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current)
                      prefetchTimerRef.current = setTimeout(() => {
                        router.prefetch(`/contacts/${contact.id}`)
                        queryClient.prefetchQuery({
                          queryKey: contactKeys.detail(contact.id),
                          queryFn: async () => {
                            const supabase = createClient()
                            const { data } = await supabase
                              .from('contacts')
                              .select(CONTACT_DETAIL_COLUMNS)
                              .eq('id', contact.id)
                              .single()
                            return data
                          },
                          staleTime: 1000 * 60 * 2,
                        })
                      }, 80)
                    }}
                    onMouseLeave={() => {
                      if (prefetchTimerRef.current) {
                        clearTimeout(prefetchTimerRef.current)
                        prefetchTimerRef.current = null
                      }
                    }}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(contact.id)}
                        onCheckedChange={() => toggleSelect(contact.id)}
                        aria-label={`Select ${getDisplayName(contact)}`}
                      />
                    </TableCell>
                    {activeColumns.map((col) => (
                      <TableCell key={col.id} className="text-slate-600">
                        {col.id === 'name' && (
                          <div className="flex items-center gap-3">
                            <Avatar size="sm">
                              <AvatarFallback className="text-[10px]">
                                {getInitials(contact)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium text-slate-900">
                              {getDisplayName(contact)}
                            </span>
                          </div>
                        )}
                        {col.id === 'email' && (
                          contact.email_primary ? (
                            <a
                              href={`mailto:${contact.email_primary}`}
                              className="text-blue-600 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {contact.email_primary}
                            </a>
                          ) : (
                            <span>-</span>
                          )
                        )}
                        {col.id === 'phone' && (
                          contact.phone_primary ? (
                            <a
                              href={`tel:${contact.phone_primary}`}
                              className="text-blue-600 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {formatPhoneNumber(contact.phone_primary)}
                            </a>
                          ) : (
                            <span>-</span>
                          )
                        )}
                        {col.id === 'type' && (
                          <Badge variant="secondary" className="gap-1 capitalize">
                            {contact.contact_type === 'organization' ? (
                              <Building2 className="size-3" />
                            ) : (
                              <User className="size-3" />
                            )}
                            {contact.contact_type === 'organization'
                              ? t('contacts.organisation' as any)
                              : t('contacts.individual' as any)}
                          </Badge>
                        )}
                        {col.id === 'classification' && (
                          <ClassificationBadge status={(contact as any).client_status ?? 'lead'} className="text-xs" />
                        )}
                        {col.id === 'source' && (
                          <span>{contact.source ?? '-'}</span>
                        )}
                        {col.id === 'created' && (
                          <span>{formatDate(contact.created_at)}</span>
                        )}
                        {col.id === 'last_contacted' && (
                          <span>
                            {contact.last_contacted_at
                              ? formatDate(contact.last_contacted_at)
                              : '-'}
                          </span>
                        )}
                        {col.id === 'location' && (
                          <span>{getLocation(contact)}</span>
                        )}
                        {col.id === 'job_title' && (
                          <span>{contact.job_title ?? '-'}</span>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  {t('contacts.page_of' as any).replace('{{page}}', String(page)).replace('{{total}}', String(totalPages))}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="mr-1 size-4" />
                    {t('common.previous' as any)}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    {t('common.next')}
                    <ChevronRight className="ml-1 size-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Contact Sheet */}
      <SovereignContactCreator open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}

// -------------------------------------------------------------------
// Skeleton loader for the contacts table
// -------------------------------------------------------------------
function ContactsTableSkeleton() {
  return (
    <div className="space-y-0">
      {/* Header skeleton */}
      <div className="flex items-center gap-4 border-b px-4 py-3">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-20" />
      </div>
      {/* Row skeletons */}
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b px-4 py-3">
          <Skeleton className="h-4 w-4 rounded" />
          <div className="flex items-center gap-3">
            <Skeleton className="size-6 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  )
}
