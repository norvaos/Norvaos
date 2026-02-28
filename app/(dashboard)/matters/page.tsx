'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  Plus,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  LayoutList,
  Kanban,
  Briefcase,
} from 'lucide-react'

import { useTenant } from '@/lib/hooks/use-tenant'
import { useMatters } from '@/lib/queries/matters'
import { useUIStore } from '@/lib/stores/ui-store'
import { usePracticeAreaContext } from '@/lib/hooks/use-practice-area-context'
import { useMatterTypes } from '@/lib/queries/matter-types'
import { createClient } from '@/lib/supabase/client'
import { MATTER_STATUSES, PRIORITIES } from '@/lib/utils/constants'
import { formatDate } from '@/lib/utils/formatters'
import type { Database } from '@/lib/types/database'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/shared/empty-state'
import { MatterCreateSheet } from '@/components/matters/matter-create-sheet'

type PracticeArea = Database['public']['Tables']['practice_areas']['Row']
type MatterType = Database['public']['Tables']['matter_types']['Row']
type User = Database['public']['Tables']['users']['Row']

type SortColumn = 'title' | 'matter_number' | 'status' | 'priority' | 'next_deadline' | 'created_at'

const ALL_FILTER_VALUE = '__all__'

function usePracticeAreas(tenantId: string) {
  return useQuery({
    queryKey: ['practice_areas', tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('practice_areas')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name')

      if (error) throw error
      return data as PracticeArea[]
    },
    enabled: !!tenantId,
  })
}

function useLawyers(tenantId: string) {
  return useQuery({
    queryKey: ['users', tenantId, 'lawyers'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('first_name')

      if (error) throw error
      return data as User[]
    },
    enabled: !!tenantId,
  })
}

function getStatusBadge(status: string) {
  const statusDef = MATTER_STATUSES.find((s) => s.value === status)
  if (!statusDef) return <Badge variant="secondary">{status}</Badge>
  return (
    <Badge
      variant="outline"
      style={{ borderColor: statusDef.color, color: statusDef.color, backgroundColor: `${statusDef.color}10` }}
    >
      {statusDef.label}
    </Badge>
  )
}

function getPriorityBadge(priority: string) {
  const priorityDef = PRIORITIES.find((p) => p.value === priority)
  if (!priorityDef) return <Badge variant="secondary">{priority}</Badge>
  return (
    <Badge
      variant="outline"
      style={{ borderColor: priorityDef.color, color: priorityDef.color, backgroundColor: `${priorityDef.color}10` }}
    >
      {priorityDef.label}
    </Badge>
  )
}

function formatUserName(user: User | undefined): string {
  if (!user) return '--'
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ')
  return name || user.email
}

export default function MattersPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''

  // Global practice area context
  const { filter: globalPracticeFilter, isFiltered: globalIsFiltered, activePracticeArea } = usePracticeAreaContext()

  // Seed initial filter state from URL search params (e.g. /matters?status=active)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState<SortColumn>('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') ?? '')
  const [practiceAreaFilter, setPracticeAreaFilter] = useState<string>('')
  const [priorityFilter, setPriorityFilter] = useState<string>(searchParams.get('priority') ?? '')
  const [lawyerFilter, setLawyerFilter] = useState<string>('')
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table')
  const [sheetOpen, setSheetOpen] = useState(false)

  // When global filter is active, it overrides the local practice area filter
  const effectivePracticeAreaId = globalIsFiltered
    ? globalPracticeFilter
    : practiceAreaFilter || ''

  // Debounce search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearch = useCallback((value: string) => {
    setSearch(value)
    setPage(1)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value)
    }, 300)
  }, [])

  // Queries
  const { data: practiceAreas } = usePracticeAreas(tenantId)
  const { data: matterTypes } = useMatterTypes(tenantId, effectivePracticeAreaId || null)
  const { data: lawyers } = useLawyers(tenantId)

  const {
    data: mattersData,
    isLoading,
    isError,
  } = useMatters({
    tenantId,
    page,
    pageSize: 25,
    search: debouncedSearch || undefined,
    sortBy,
    sortDirection,
    status: statusFilter || undefined,
    practiceAreaId: effectivePracticeAreaId || undefined,
    priority: priorityFilter || undefined,
    responsibleLawyerId: lawyerFilter || undefined,
  })

  const matters = mattersData?.matters ?? []
  const totalPages = mattersData?.totalPages ?? 0
  const totalCount = mattersData?.totalCount ?? 0

  // Lookup helpers
  function getPracticeAreaName(id: string | null): string {
    if (!id) return '--'
    return practiceAreas?.find((pa) => pa.id === id)?.name ?? '--'
  }

  function getMatterTypeName(id: string | null): string | null {
    if (!id) return null
    return matterTypes?.find((mt) => mt.id === id)?.name ?? null
  }

  function getMatterTypeColor(id: string | null): string | null {
    if (!id) return null
    return matterTypes?.find((mt) => mt.id === id)?.color ?? null
  }

  function getLawyerName(id: string | null): string {
    if (!id) return '--'
    return formatUserName(lawyers?.find((u) => u.id === id))
  }

  // Sort handler
  function handleSort(column: SortColumn) {
    if (sortBy === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(column)
      setSortDirection('asc')
    }
    setPage(1)
  }

  function renderSortIcon(column: SortColumn) {
    if (sortBy !== column) return <ArrowUpDown className="ml-1 h-3 w-3 text-slate-400" />
    return sortDirection === 'asc'
      ? <ArrowUp className="ml-1 h-3 w-3" />
      : <ArrowDown className="ml-1 h-3 w-3" />
  }

  // Reset filters
  function handleClearFilters() {
    setStatusFilter('')
    setPracticeAreaFilter('')
    setPriorityFilter('')
    setLawyerFilter('')
    setSearch('')
    setDebouncedSearch('')
    setPage(1)
  }

  const hasActiveFilters = statusFilter || effectivePracticeAreaId || priorityFilter || lawyerFilter || debouncedSearch

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Matters</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage your firm&apos;s matters and cases
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex items-center rounded-md border border-slate-200">
            <Button
              variant={viewMode === 'table' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-r-none"
              onClick={() => setViewMode('table')}
            >
              <LayoutList className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'kanban' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-l-none"
              onClick={() => setViewMode('kanban')}
            >
              <Kanban className="h-4 w-4" />
            </Button>
          </div>

          <Button onClick={() => setSheetOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Matter
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by title or matter number..."
            className="pl-10"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>

        <Select
          value={statusFilter || ALL_FILTER_VALUE}
          onValueChange={(v) => { setStatusFilter(v === ALL_FILTER_VALUE ? '' : v); setPage(1) }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER_VALUE}>All Statuses</SelectItem>
            {MATTER_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <Select
            value={globalIsFiltered ? globalPracticeFilter : (practiceAreaFilter || ALL_FILTER_VALUE)}
            onValueChange={(v) => { setPracticeAreaFilter(v === ALL_FILTER_VALUE ? '' : v); setPage(1) }}
            disabled={globalIsFiltered}
          >
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Practice Area" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>All Practice Areas</SelectItem>
              {practiceAreas?.map((pa) => (
                <SelectItem key={pa.id} value={pa.id}>{pa.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {globalIsFiltered && activePracticeArea && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              via global filter
            </span>
          )}
        </div>

        <Select
          value={priorityFilter || ALL_FILTER_VALUE}
          onValueChange={(v) => { setPriorityFilter(v === ALL_FILTER_VALUE ? '' : v); setPage(1) }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER_VALUE}>All Priorities</SelectItem>
            {PRIORITIES.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={lawyerFilter || ALL_FILTER_VALUE}
          onValueChange={(v) => { setLawyerFilter(v === ALL_FILTER_VALUE ? '' : v); setPage(1) }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Responsible Lawyer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER_VALUE}>All Lawyers</SelectItem>
            {lawyers?.map((u) => (
              <SelectItem key={u.id} value={u.id}>{formatUserName(u)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={handleClearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Content */}
      {viewMode === 'kanban' ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
          <Kanban className="mx-auto mb-3 h-10 w-10 text-slate-400" />
          <h3 className="text-base font-medium text-slate-900">Pipeline Board View</h3>
          <p className="mt-1 text-sm text-slate-500">
            View and manage matters as a Kanban board grouped by pipeline stages.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => router.push('/settings/pipelines')}>
            Manage Pipelines
          </Button>
        </div>
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center">
          <p className="text-sm text-red-600">Failed to load matters. Please try again.</p>
        </div>
      ) : matters.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No matters found"
          description={
            hasActiveFilters
              ? 'No matters match your current filters. Try adjusting or clearing your filters.'
              : 'Get started by creating your first matter.'
          }
          actionLabel={hasActiveFilters ? 'Clear filters' : 'New Matter'}
          onAction={hasActiveFilters ? handleClearFilters : () => setSheetOpen(true)}
        />
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button
                      className="inline-flex items-center text-xs font-medium"
                      onClick={() => handleSort('matter_number')}
                    >
                      Matter # {renderSortIcon('matter_number')}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      className="inline-flex items-center text-xs font-medium"
                      onClick={() => handleSort('title')}
                    >
                      Title {renderSortIcon('title')}
                    </button>
                  </TableHead>
                  <TableHead>Practice Area</TableHead>
                  <TableHead>Matter Type</TableHead>
                  <TableHead>
                    <button
                      className="inline-flex items-center text-xs font-medium"
                      onClick={() => handleSort('status')}
                    >
                      Status {renderSortIcon('status')}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      className="inline-flex items-center text-xs font-medium"
                      onClick={() => handleSort('priority')}
                    >
                      Priority {renderSortIcon('priority')}
                    </button>
                  </TableHead>
                  <TableHead>Responsible Lawyer</TableHead>
                  <TableHead>
                    <button
                      className="inline-flex items-center text-xs font-medium"
                      onClick={() => handleSort('next_deadline')}
                    >
                      Next Deadline {renderSortIcon('next_deadline')}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      className="inline-flex items-center text-xs font-medium"
                      onClick={() => handleSort('created_at')}
                    >
                      Created {renderSortIcon('created_at')}
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matters.map((matter) => (
                  <TableRow
                    key={matter.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/matters/${matter.id}`)}
                  >
                    <TableCell className="font-mono text-xs text-slate-500">
                      {matter.matter_number ?? '--'}
                    </TableCell>
                    <TableCell className="font-medium text-slate-900 max-w-[250px] truncate">
                      {matter.title}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {getPracticeAreaName(matter.practice_area_id)}
                    </TableCell>
                    <TableCell>
                      {matter.matter_type_id ? (() => {
                        const typeName = getMatterTypeName(matter.matter_type_id)
                        const typeColor = getMatterTypeColor(matter.matter_type_id)
                        return typeName ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium">
                            <span
                              className="h-1.5 w-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: typeColor ?? '#6366f1' }}
                            />
                            {typeName}
                          </span>
                        ) : <span className="text-slate-400 text-xs">--</span>
                      })() : <span className="text-slate-400 text-xs">--</span>}
                    </TableCell>
                    <TableCell>{getStatusBadge(matter.status)}</TableCell>
                    <TableCell>{getPriorityBadge(matter.priority)}</TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {getLawyerName(matter.responsible_lawyer_id)}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {matter.next_deadline ? formatDate(matter.next_deadline) : '--'}
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {formatDate(matter.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Showing {((page - 1) * 25) + 1}--{Math.min(page * 25, totalCount)} of {totalCount} matter{totalCount !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm text-slate-600">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Create Sheet */}
      <MatterCreateSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  )
}
