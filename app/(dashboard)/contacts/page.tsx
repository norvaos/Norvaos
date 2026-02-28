'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useContacts } from '@/lib/queries/contacts'
import { CONTACT_SOURCES, CONTACT_TYPES } from '@/lib/utils/constants'
import { formatDate, formatPhoneNumber, formatFullName, formatInitials } from '@/lib/utils/formatters'
import { ContactCreateDialog } from '@/components/contacts/contact-create-dialog'
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
} from 'lucide-react'

type SortField = 'name' | 'email_primary' | 'phone_primary' | 'source' | 'created_at'

// Map user-facing sort field to database column
function mapSortField(field: SortField): string {
  if (field === 'name') return 'last_name'
  return field
}

export default function ContactsPage() {
  const router = useRouter()
  const { tenant } = useTenant()

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [contactType, setContactType] = useState<string>('')
  const [source, setSource] = useState<string>('')
  const [sortBy, setSortBy] = useState<SortField>('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [createOpen, setCreateOpen] = useState(false)

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

  // Display name for a contact row
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Contacts</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage your clients, organisations, and other contacts.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 size-4" />
          Add Contact
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
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
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {CONTACT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
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
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
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
            Clear filters
          </Button>
        )}
      </div>

      {/* Results count */}
      {!isLoading && (
        <div className="text-sm text-muted-foreground">
          {totalCount} {totalCount === 1 ? 'contact' : 'contacts'} found
          {selectedIds.size > 0 && (
            <span className="ml-2 font-medium text-slate-700">
              ({selectedIds.size} selected)
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
            <p className="text-sm text-destructive">Failed to load contacts. Please try again.</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        ) : contacts.length === 0 ? (
          hasFilters ? (
            <EmptyState
              icon={Search}
              title="No contacts found"
              description="No contacts match your current filters. Try adjusting your search or filter criteria."
              actionLabel="Clear filters"
              onAction={clearFilters}
            />
          ) : (
            <EmptyState
              icon={Users}
              title="No contacts yet"
              description="Get started by adding your first contact to the system."
              actionLabel="Add Contact"
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
                  <TableHead>
                    <button
                      type="button"
                      className="flex items-center text-xs font-medium hover:text-foreground"
                      onClick={() => handleSort('name')}
                    >
                      Name
                      <SortIcon field="name" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      className="flex items-center text-xs font-medium hover:text-foreground"
                      onClick={() => handleSort('email_primary')}
                    >
                      Email
                      <SortIcon field="email_primary" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      className="flex items-center text-xs font-medium hover:text-foreground"
                      onClick={() => handleSort('phone_primary')}
                    >
                      Phone
                      <SortIcon field="phone_primary" />
                    </button>
                  </TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>
                    <button
                      type="button"
                      className="flex items-center text-xs font-medium hover:text-foreground"
                      onClick={() => handleSort('source')}
                    >
                      Source
                      <SortIcon field="source" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      className="flex items-center text-xs font-medium hover:text-foreground"
                      onClick={() => handleSort('created_at')}
                    >
                      Created
                      <SortIcon field="created_at" />
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => (
                  <TableRow
                    key={contact.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => router.push(`/contacts/${contact.id}`)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(contact.id)}
                        onCheckedChange={() => toggleSelect(contact.id)}
                        aria-label={`Select ${getDisplayName(contact)}`}
                      />
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {contact.email_primary ?? '-'}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {contact.phone_primary
                        ? formatPhoneNumber(contact.phone_primary)
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="gap-1 capitalize">
                        {contact.contact_type === 'organization' ? (
                          <Building2 className="size-3" />
                        ) : (
                          <User className="size-3" />
                        )}
                        {contact.contact_type === 'organization'
                          ? 'Organisation'
                          : 'Individual'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {contact.source ?? '-'}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {formatDate(contact.created_at, 'dd MMM yyyy')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="mr-1 size-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                    <ChevronRight className="ml-1 size-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Contact Sheet */}
      <ContactCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
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
