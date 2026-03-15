'use client'

import { useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { useEmailLogs, useDeleteEmailLog } from '@/lib/queries/email-logs'
import { LogEmailDialog } from '@/components/communications/log-email-dialog'
import { EmailLogTable } from '@/components/communications/email-log-table'
import { UnmatchedEmailTriage } from '@/components/communications/unmatched-email-triage'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Mail,
  Plus,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react'

const PAGE_SIZE = 25

export default function CommunicationsPage() {
  const { tenant } = useTenant()
  const { appUser } = useUser()

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [direction, setDirection] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [logDialogOpen, setLogDialogOpen] = useState(false)

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

  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading } = useEmailLogs(tenant?.id ?? '', {
    search: debouncedSearch || undefined,
    direction,
    limit: PAGE_SIZE,
    offset,
  })

  const deleteEmailLog = useDeleteEmailLog()

  const emails = data?.data ?? []
  const totalCount = data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const hasFilters = !!debouncedSearch || direction !== 'all'

  function clearFilters() {
    setSearch('')
    setDebouncedSearch('')
    setDirection('all')
    setPage(1)
  }

  function handleDelete(id: string) {
    deleteEmailLog.mutate(id)
  }

  return (
    <div className="space-y-4">
      {/* Unmatched Email Triage Queue */}
      <UnmatchedEmailTriage />

      {/* Deprecation Banner */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-900">
            This view has been deprecated
          </p>
          <p className="mt-1 text-sm text-amber-800">
            This view has been replaced by the Communication Panel in the Matter Workplace.
            Navigate to any matter to access the new email experience.
          </p>
          <Link href="/matters" className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:text-amber-900 transition-colors">
            Go to Matters
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Communications</h1>
          <p className="mt-1 text-sm text-slate-500">
            Log and track email correspondence
          </p>
        </div>
        <Button onClick={() => setLogDialogOpen(true)}>
          <Plus className="mr-2 size-4" />
          Log Email
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search emails..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select
          value={direction}
          onValueChange={(val) => {
            setDirection(val)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All directions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All directions</SelectItem>
            <SelectItem value="outbound">Sent</SelectItem>
            <SelectItem value="inbound">Received</SelectItem>
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
          {totalCount} {totalCount === 1 ? 'email' : 'emails'} found
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border bg-white">
        <EmailLogTable
          emails={emails}
          isLoading={isLoading}
          onDelete={handleDelete}
        />

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
      </div>

      {/* Log Email Dialog */}
      {tenant && appUser && (
        <LogEmailDialog
          open={logDialogOpen}
          onOpenChange={setLogDialogOpen}
          tenantId={tenant.id}
          userId={appUser.id}
        />
      )}
    </div>
  )
}
