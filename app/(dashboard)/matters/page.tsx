'use client'

import { useState, useCallback, useRef, useMemo, useEffect, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { prefetchMatterFull } from '@/lib/queries/matter-dashboard'
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
  GripVertical,
  SlidersHorizontal,
  Trash2,
  AlertTriangle,
} from 'lucide-react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  useSensor,
  useSensors,
  PointerSensor,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useDraggable, useDroppable } from '@dnd-kit/core'

import { useI18n } from '@/lib/i18n/i18n-provider'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useMatters, useUpdateMatterStage } from '@/lib/queries/matters'
import { usePipelines, usePipelineStages } from '@/lib/queries/pipelines'
import { useUIStore } from '@/lib/stores/ui-store'
import { usePracticeAreaContext } from '@/lib/hooks/use-practice-area-context'
import { useMatterTypes } from '@/lib/queries/matter-types'
import { createClient } from '@/lib/supabase/client'
import { MATTER_STATUSES, PRIORITIES, RISK_LEVELS } from '@/lib/utils/constants'
import { formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import type { Database } from '@/lib/types/database'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu as ColumnDropdown,
  DropdownMenuContent as ColumnDropdownContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel as ColumnDropdownLabel,
  DropdownMenuSeparator as ColumnDropdownSeparator,
  DropdownMenuTrigger as ColumnDropdownTrigger,
} from '@/components/ui/dropdown-menu'
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
import { Card } from '@/components/ui/card'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { useVirtualizer } from '@tanstack/react-virtual'
import { EmptyState } from '@/components/shared/empty-state'
import { MatterCreateSheet } from '@/components/matters/matter-create-sheet'
import { RiskBadge } from '@/components/matters/risk-badge'
import { IntakeStatusBadge } from '@/components/matters/intake-status-badge'

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

const MATTER_COLUMN_STORAGE_KEY = 'norvaos:matters:visible-columns'

interface MatterColumn {
  id: string
  label: string
  sortable?: SortColumn
  alwaysVisible?: boolean
}

function buildMatterColumns(t: (key: any) => string): MatterColumn[] {
  return [
    { id: 'matter_number', label: t('matters.col_matter_number' as any), sortable: 'matter_number', alwaysVisible: true },
    { id: 'title', label: t('matters.col_title' as any), sortable: 'title', alwaysVisible: true },
    { id: 'practice_area', label: t('matters.col_practice_area' as any) },
    { id: 'matter_type', label: t('matters.col_matter_type' as any) },
    { id: 'stage', label: t('matters.col_stage' as any) },
    { id: 'status', label: t('matters.col_status' as any), sortable: 'status' },
    { id: 'priority', label: t('matters.col_priority' as any), sortable: 'priority' },
    { id: 'risk', label: t('matters.col_risk' as any) },
    { id: 'intake', label: t('matters.col_intake' as any) },
    { id: 'lawyer', label: t('matters.col_lawyer' as any) },
    { id: 'next_deadline', label: t('matters.col_next_deadline' as any), sortable: 'next_deadline' },
    { id: 'created_at', label: t('matters.col_created' as any), sortable: 'created_at' },
  ]
}

const DEFAULT_VISIBLE = ['matter_number', 'title', 'stage', 'status', 'priority', 'lawyer', 'next_deadline', 'created_at']

function loadVisibleColumns(): string[] {
  if (typeof window === 'undefined') return DEFAULT_VISIBLE
  try {
    const stored = localStorage.getItem(MATTER_COLUMN_STORAGE_KEY)
    if (stored) return JSON.parse(stored)
  } catch { /* ignore */ }
  return DEFAULT_VISIBLE
}

export default function MattersPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''
  const queryClient = useQueryClient()
  const { t } = useI18n()

  const MATTER_COLUMNS = useMemo(() => buildMatterColumns(t), [t])

  const [visibleColumns, setVisibleColumns] = useState<string[]>(loadVisibleColumns)

  function toggleColumn(colId: string) {
    setVisibleColumns((prev) => {
      const next = prev.includes(colId) ? prev.filter((c) => c !== colId) : [...prev, colId]
      try { localStorage.setItem(MATTER_COLUMN_STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  const activeColumns = MATTER_COLUMNS.filter((c) => c.alwaysVisible || visibleColumns.includes(c.id))

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
  const [riskLevelFilter, setRiskLevelFilter] = useState<string>(searchParams.get('riskLevel') ?? '')
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table')
  const [sheetOpen, setSheetOpen] = useState(false)

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        allPageIds.forEach((id) => next.delete(id))
        return next
      })
    } else {
      setSelectedIds((prev) => new Set([...prev, ...allPageIds]))
    }
  }

  function toggleSelectOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleBulkDelete() {
    setDeleting(true)
    try {
      const res = await fetch('/api/matters', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Delete failed')
      }
      setSelectedIds(new Set())
      setDeleteDialogOpen(false)
      queryClient.invalidateQueries({ queryKey: ['matters'] })
    } catch (err) {
      console.error('Bulk delete error:', err)
    } finally {
      setDeleting(false)
    }
  }

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
    riskLevel: riskLevelFilter || undefined,
  })

  const matters = mattersData?.matters ?? []
  const totalPages = mattersData?.totalPages ?? 0
  const totalCount = mattersData?.totalCount ?? 0

  const allPageIds = matters.map((m) => m.id)
  const allSelected = allPageIds.length > 0 && allPageIds.every((id) => selectedIds.has(id))
  const someSelected = allPageIds.some((id) => selectedIds.has(id)) && !allSelected

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

  // Bulk stage state for current page
  const matterIds = useMemo(() => matters.map((m) => m.id), [matters])
  const { data: stageStates } = useQuery({
    queryKey: ['matter_stage_states_bulk', matterIds.join(',')],
    queryFn: async () => {
      if (!matterIds.length) return []
      const supabase = createClient()
      const { data: states, error: statesError } = await supabase
        .from('matter_stage_state')
        .select('matter_id, current_stage_id')
        .in('matter_id', matterIds)
      if (statesError) throw statesError
      const stageIds = [...new Set(states.map((s) => s.current_stage_id).filter(Boolean))] as string[]
      if (!stageIds.length) return states.map((s) => ({ matter_id: s.matter_id, stage: null }))
      const { data: stages, error: stagesError } = await supabase
        .from('matter_stages')
        .select('id, name, color, completion_pct')
        .in('id', stageIds)
      if (stagesError) throw stagesError
      const stageMap = new Map(stages.map((s) => [s.id, s]))
      return states.map((s) => ({
        matter_id: s.matter_id,
        stage: s.current_stage_id ? (stageMap.get(s.current_stage_id) ?? null) : null,
      }))
    },
    enabled: matterIds.length > 0,
    staleTime: 1000 * 60 * 2,
  })

  function getMatterStageInfo(matterId: string) {
    return stageStates?.find((s) => s.matter_id === matterId) ?? null
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
    setRiskLevelFilter('')
    setSearch('')
    setDebouncedSearch('')
    setPage(1)
  }

  const hasActiveFilters = statusFilter || effectivePracticeAreaId || priorityFilter || lawyerFilter || riskLevelFilter || debouncedSearch

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t('dashboard.matters')}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t('matters.subtitle' as any)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Column toggle */}
          <ColumnDropdown>
            <ColumnDropdownTrigger asChild>
              <Button variant="outline" size="sm">
                <SlidersHorizontal className="mr-1.5 h-4 w-4" />
                {t('matters.columns' as any)}
              </Button>
            </ColumnDropdownTrigger>
            <ColumnDropdownContent align="end" className="w-48">
              <ColumnDropdownLabel>{t('matters.toggle_columns' as any)}</ColumnDropdownLabel>
              <ColumnDropdownSeparator />
              {MATTER_COLUMNS.map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  checked={col.alwaysVisible || visibleColumns.includes(col.id)}
                  onCheckedChange={() => toggleColumn(col.id)}
                  disabled={col.alwaysVisible}
                >
                  {col.label}
                </DropdownMenuCheckboxItem>
              ))}
            </ColumnDropdownContent>
          </ColumnDropdown>

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
            {t('dashboard.new_matter')}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder={`${t('common.search')}...`}
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
            <SelectValue placeholder={t('matters.col_status' as any)} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER_VALUE}>{t('matters.all_statuses' as any)}</SelectItem>
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
              <SelectValue placeholder={t('matters.col_practice_area' as any)} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>{t('matters.all_practice_areas' as any)}</SelectItem>
              {practiceAreas?.map((pa) => (
                <SelectItem key={pa.id} value={pa.id}>{pa.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {globalIsFiltered && activePracticeArea && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {t('matters.via_global_filter' as any)}
            </span>
          )}
        </div>

        <Select
          value={priorityFilter || ALL_FILTER_VALUE}
          onValueChange={(v) => { setPriorityFilter(v === ALL_FILTER_VALUE ? '' : v); setPage(1) }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={t('matters.col_priority' as any)} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER_VALUE}>{t('matters.all_priorities' as any)}</SelectItem>
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
            <SelectValue placeholder={t('matters.col_lawyer' as any)} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER_VALUE}>{t('matters.all_lawyers' as any)}</SelectItem>
            {lawyers?.map((u) => (
              <SelectItem key={u.id} value={u.id}>{formatUserName(u)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={riskLevelFilter || ALL_FILTER_VALUE}
          onValueChange={(v) => { setRiskLevelFilter(v === ALL_FILTER_VALUE ? '' : v); setPage(1) }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={t('matters.risk_level' as any)} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER_VALUE}>{t('matters.all_risk_levels' as any)}</SelectItem>
            {RISK_LEVELS.map((r) => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={handleClearFilters}>
            {t('matters.clear_filters' as any)}
          </Button>
        )}
      </div>

      {/* Content */}
      {viewMode === 'kanban' ? (
        <MattersKanban
          tenantId={tenantId}
          getLawyerName={getLawyerName}
          onMatterClick={(id) => router.push(`/matters/${id}`)}
          onMatterHover={(id) => router.prefetch(`/matters/${id}`)}
        />
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center">
          <p className="text-sm text-red-600">{t('matters.load_error' as any)}</p>
        </div>
      ) : matters.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={t('matters.no_matters_found' as any)}
          description={
            hasActiveFilters
              ? t('matters.no_matters_filtered' as any)
              : t('matters.no_matters_empty' as any)
          }
          quickHint={hasActiveFilters ? undefined : t('matters.quick_hint' as any)}
          actionLabel={hasActiveFilters ? t('matters.clear_filters' as any) : t('dashboard.new_matter')}
          onAction={hasActiveFilters ? handleClearFilters : () => setSheetOpen(true)}
        />
      ) : (
        <>
          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5">
              <span className="text-sm font-medium text-blue-800">
                {selectedIds.size} {selectedIds.size !== 1 ? t('matters.matters_plural' as any) : t('matters.matter_singular' as any)} {t('matters.selected' as any)}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-slate-600"
                  onClick={() => setSelectedIds(new Set())}
                >
                  {t('matters.clear_selection' as any)}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  {t('common.delete' as any)} {selectedIds.size} {selectedIds.size !== 1 ? t('matters.matters_plural' as any) : t('matters.matter_singular' as any)}
                </Button>
              </div>
            </div>
          )}

          <VirtualizedMatterTable
            matters={matters}
            activeColumns={activeColumns}
            selectedIds={selectedIds}
            allSelected={allSelected}
            someSelected={someSelected}
            toggleSelectAll={toggleSelectAll}
            toggleSelectOne={toggleSelectOne}
            handleSort={handleSort}
            renderSortIcon={renderSortIcon}
            getPracticeAreaName={getPracticeAreaName}
            getMatterTypeName={getMatterTypeName}
            getMatterTypeColor={getMatterTypeColor}
            getMatterStageInfo={getMatterStageInfo}
            getLawyerName={getLawyerName}
            onRowClick={(id) => router.push(`/matters/${id}`)}
            onRowHover={(id) => {
              prefetchMatterFull(queryClient, id)
              router.prefetch(`/matters/${id}`)
            }}
          />

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {t('matters.showing' as any)} {((page - 1) * 25) + 1}--{Math.min(page * 25, totalCount)} {t('matters.of' as any)} {totalCount} {totalCount !== 1 ? t('matters.matters_plural' as any) : t('matters.matter_singular' as any)}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                {t('matters.previous' as any)}
              </Button>
              <span className="text-sm text-slate-600">
                {t('matters.page' as any)} {page} {t('matters.of' as any)} {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('matters.next' as any)}
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              {t('common.delete' as any)} {selectedIds.size} {selectedIds.size !== 1 ? t('matters.matters_plural' as any) : t('matters.matter_singular' as any)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('matters.delete_description' as any)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deleting ? t('matters.deleting' as any) : `${t('common.delete' as any)} ${selectedIds.size} ${selectedIds.size !== 1 ? t('matters.matters_plural' as any) : t('matters.matter_singular' as any)}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Sheet */}
      <MatterCreateSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  )
}

// -------------------------------------------------------------------
// Virtualized Matter Table  -  only renders visible rows in the DOM
// -------------------------------------------------------------------

type Matter = Database['public']['Tables']['matters']['Row']

const ROW_HEIGHT = 48 // px  -  matches TableRow height with py-2 + content
const TABLE_MAX_HEIGHT = 'calc(100vh - 340px)' // leaves room for header, filters, pagination

function VirtualizedMatterTable({
  matters,
  activeColumns,
  selectedIds,
  allSelected,
  someSelected,
  toggleSelectAll,
  toggleSelectOne,
  handleSort,
  renderSortIcon,
  getPracticeAreaName,
  getMatterTypeName,
  getMatterTypeColor,
  getMatterStageInfo,
  getLawyerName,
  onRowClick,
  onRowHover,
}: {
  matters: Matter[]
  activeColumns: MatterColumn[]
  selectedIds: Set<string>
  allSelected: boolean
  someSelected: boolean
  toggleSelectAll: () => void
  toggleSelectOne: (id: string) => void
  handleSort: (column: SortColumn) => void
  renderSortIcon: (column: SortColumn) => ReactNode
  getPracticeAreaName: (id: string | null) => string
  getMatterTypeName: (id: string | null) => string | null
  getMatterTypeColor: (id: string | null) => string | null
  getMatterStageInfo: (matterId: string) => { matter_id: string; stage: { name: string; color: string; completion_pct: number } | null } | null
  getLawyerName: (id: string | null) => string
  onRowClick: (id: string) => void
  onRowHover: (id: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: matters.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5, // render 5 extra rows above/below viewport for smooth scrolling
  })

  return (
    <div className="rounded-lg border">
      {/* Sticky header  -  always visible */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 pl-3">
              <Checkbox
                checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                onCheckedChange={toggleSelectAll}
                aria-label="Select all matters"
              />
            </TableHead>
            {activeColumns.map((col) => (
              <TableHead key={col.id}>
                {col.sortable ? (
                  <button
                    className="inline-flex items-center text-xs font-medium"
                    onClick={() => handleSort(col.sortable!)}
                  >
                    {col.label} {renderSortIcon(col.sortable!)}
                  </button>
                ) : (
                  col.label
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
      </Table>

      {/* Virtualized scrollable body */}
      <div
        ref={scrollRef}
        style={{ height: TABLE_MAX_HEIGHT, overflow: 'auto' }}
      >
        <Table>
          <TableBody>
            {/* Spacer for items above the viewport */}
            {virtualizer.getVirtualItems().length > 0 && (
              <tr style={{ height: virtualizer.getVirtualItems()[0]?.start ?? 0 }} />
            )}
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const matter = matters[virtualRow.index]
              if (!matter) return null
              return (
                <TableRow
                  key={matter.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className={`cursor-pointer ${selectedIds.has(matter.id) ? 'bg-blue-50/60' : ''}`}
                  onClick={() => onRowClick(matter.id)}
                  onMouseEnter={() => onRowHover(matter.id)}
                >
                  <TableCell className="pl-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(matter.id)}
                      onCheckedChange={() => toggleSelectOne(matter.id)}
                      aria-label={`Select ${matter.title}`}
                    />
                  </TableCell>
                  {activeColumns.map((col) => {
                    switch (col.id) {
                      case 'matter_number':
                        return <TableCell key={col.id} className="font-mono text-xs text-slate-500">{matter.matter_number ?? '--'}</TableCell>
                      case 'title':
                        return <TableCell key={col.id} className="font-medium text-slate-900 max-w-[250px] truncate">{matter.title}</TableCell>
                      case 'practice_area':
                        return <TableCell key={col.id} className="text-sm text-slate-600">{getPracticeAreaName(matter.practice_area_id)}</TableCell>
                      case 'matter_type':
                        return (
                          <TableCell key={col.id}>
                            {matter.matter_type_id ? (() => {
                              const typeName = getMatterTypeName(matter.matter_type_id)
                              const typeColor = getMatterTypeColor(matter.matter_type_id)
                              return typeName ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium">
                                  <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: typeColor ?? '#6366f1' }} />
                                  {typeName}
                                </span>
                              ) : <span className="text-slate-400 text-xs">--</span>
                            })() : <span className="text-slate-400 text-xs">--</span>}
                          </TableCell>
                        )
                      case 'stage': {
                        const stageInfo = getMatterStageInfo(matter.id)
                        const pct = stageInfo?.stage?.completion_pct ?? null
                        const stageName = stageInfo?.stage?.name ?? null
                        const stageColor = stageInfo?.stage?.color ?? '#94a3b8'
                        if (!stageName) return <TableCell key={col.id} className="text-slate-400 text-xs">--</TableCell>
                        return (
                          <TableCell key={col.id} className="min-w-[160px]">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: stageColor }} />
                                <span className="text-xs font-medium text-slate-700 truncate max-w-[120px]">{stageName}</span>
                                {pct !== null && (
                                  <span className={cn(
                                    'text-[10px] font-semibold tabular-nums shrink-0',
                                    pct >= 100 ? 'text-emerald-600' : pct >= 70 ? 'text-violet-600' : pct >= 40 ? 'text-blue-600' : 'text-amber-600'
                                  )}>{pct}%</span>
                                )}
                              </div>
                              {pct !== null && (
                                <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className={cn(
                                      'h-full rounded-full transition-all duration-500',
                                      pct >= 100 ? 'bg-emerald-500' : pct >= 70 ? 'bg-violet-500' : pct >= 40 ? 'bg-blue-500' : 'bg-amber-500'
                                    )}
                                    style={{ width: `${Math.min(pct, 100)}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          </TableCell>
                        )
                      }
                      case 'status':
                        return <TableCell key={col.id}>{getStatusBadge(matter.status ?? '')}</TableCell>
                      case 'priority':
                        return <TableCell key={col.id}>{getPriorityBadge(matter.priority ?? '')}</TableCell>
                      case 'risk':
                        return <TableCell key={col.id}><RiskBadge level={(matter as any).risk_level} size="sm" /></TableCell>
                      case 'intake':
                        return <TableCell key={col.id}><IntakeStatusBadge status={(matter as any).intake_status} /></TableCell>
                      case 'lawyer':
                        return <TableCell key={col.id} className="text-sm text-slate-600">{getLawyerName(matter.responsible_lawyer_id)}</TableCell>
                      case 'next_deadline':
                        return <TableCell key={col.id} className="text-sm text-slate-600">{matter.next_deadline ? formatDate(matter.next_deadline) : '--'}</TableCell>
                      case 'created_at':
                        return <TableCell key={col.id} className="text-sm text-slate-500">{formatDate(matter.created_at)}</TableCell>
                      default:
                        return <TableCell key={col.id}>--</TableCell>
                    }
                  })}
                </TableRow>
              )
            })}
            {/* Spacer for items below the viewport */}
            {virtualizer.getVirtualItems().length > 0 && (
              <tr style={{ height: virtualizer.getTotalSize() - (virtualizer.getVirtualItems()[virtualizer.getVirtualItems().length - 1]?.end ?? 0) }} />
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// -------------------------------------------------------------------
// Matters Kanban Board
// -------------------------------------------------------------------

function MatterKanbanCard({
  matter,
  getLawyerName,
  onClick,
  onMouseEnter,
}: {
  matter: Matter
  getLawyerName: (id: string | null) => string
  onClick: () => void
  onMouseEnter?: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: matter.id,
  })

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined

  const statusDef = MATTER_STATUSES.find((s) => s.value === matter.status)
  const priorityDef = PRIORITIES.find((p) => p.value === matter.priority)

  const daysSinceStageEntry = matter.stage_entered_at
    ? Math.floor((Date.now() - new Date(matter.stage_entered_at).getTime()) / (1000 * 60 * 60 * 24))
    : null

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border bg-white p-3 shadow-sm transition-shadow hover:shadow-md cursor-pointer group ${
        isDragging ? 'opacity-50' : ''
      }`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <div className="flex items-start gap-2">
        <div
          {...attributes}
          {...listeners}
          className="mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4 text-slate-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">{matter.title}</p>
          {matter.matter_number && (
            <p className="text-xs text-muted-foreground">#{matter.matter_number}</p>
          )}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {statusDef && (
              <Badge
                variant="outline"
                className="text-[10px] py-0 h-5"
                style={{ borderColor: statusDef.color, color: statusDef.color, backgroundColor: `${statusDef.color}10` }}
              >
                {statusDef.label}
              </Badge>
            )}
            {priorityDef && (
              <Badge
                variant="outline"
                className="text-[10px] py-0 h-5"
                style={{ borderColor: priorityDef.color, color: priorityDef.color, backgroundColor: `${priorityDef.color}10` }}
              >
                {priorityDef.label}
              </Badge>
            )}
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
            <span className="truncate">{getLawyerName(matter.responsible_lawyer_id)}</span>
            {daysSinceStageEntry !== null && (
              <span className={`shrink-0 ml-1 ${daysSinceStageEntry > 14 ? 'text-red-500 font-medium' : daysSinceStageEntry > 7 ? 'text-amber-500' : ''}`}>
                {daysSinceStageEntry}d
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MatterKanbanColumn({
  stageId,
  stageName,
  stageColor,
  matters,
  getLawyerName,
  onMatterClick,
  onMatterHover,
}: {
  stageId: string
  stageName: string
  stageColor: string | null
  matters: Matter[]
  getLawyerName: (id: string | null) => string
  onMatterClick: (id: string) => void
  onMatterHover?: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stageId })
  const { t } = useI18n()

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-72 shrink-0 rounded-lg border bg-slate-50 ${
        isOver ? 'ring-2 ring-primary/30' : ''
      }`}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: stageColor ?? '#6366f1' }}
          />
          <span className="text-sm font-medium text-slate-700 truncate">{stageName}</span>
        </div>
        <Badge variant="secondary" className="text-[10px] h-5">{matters.length}</Badge>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-[calc(100vh-300px)]">
        {matters.length > 0 ? (
          matters.map((matter) => (
            <MatterKanbanCard
              key={matter.id}
              matter={matter}
              getLawyerName={getLawyerName}
              onClick={() => onMatterClick(matter.id)}
              onMouseEnter={() => onMatterHover?.(matter.id)}
            />
          ))
        ) : (
          <p className="text-xs text-center text-slate-400 py-6">{t('matters.no_matters' as any)}</p>
        )}
      </div>
    </div>
  )
}

function MattersKanban({
  tenantId,
  getLawyerName,
  onMatterClick,
  onMatterHover,
}: {
  tenantId: string
  getLawyerName: (id: string | null) => string
  onMatterClick: (id: string) => void
  onMatterHover?: (id: string) => void
}) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const { data: pipelines } = usePipelines(tenantId, 'matter')
  const [selectedPipelineId, setSelectedPipelineId] = useState('')

  // Auto-select first pipeline
  const pipelineId = selectedPipelineId || pipelines?.[0]?.id || ''
  const { data: stages } = usePipelineStages(pipelineId)
  const updateStage = useUpdateMatterStage()

  // Load all matters for this pipeline (large page size for kanban)
  const { data: mattersData, isLoading } = useMatters({
    tenantId,
    pipelineId: pipelineId || undefined,
    pageSize: 500,
    sortBy: 'created_at',
    sortDirection: 'desc',
  })

  const matters = mattersData?.matters ?? []

  // Group matters by stage
  const mattersByStage = useMemo(() => {
    const map: Record<string, Matter[]> = {}
    if (stages) {
      for (const stage of stages) {
        map[stage.id] = []
      }
    }
    // Add an "unassigned" bucket for matters without a stage
    map['__no_stage__'] = []
    for (const matter of matters) {
      const sid = matter.stage_id
      if (sid && map[sid]) {
        map[sid].push(matter)
      } else {
        map['__no_stage__'].push(matter)
      }
    }
    return map
  }, [matters, stages])

  // Drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )
  const [activeMatterId, setActiveMatterId] = useState<string | null>(null)
  const activeMatter = activeMatterId ? matters.find((m) => m.id === activeMatterId) : null

  function handleDragStart(event: DragStartEvent) {
    setActiveMatterId(event.active.id as string)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveMatterId(null)
    const { active, over } = event
    if (!over) return
    const matterId = active.id as string
    const newStageId = over.id as string
    if (newStageId === '__no_stage__') return

    const matter = matters.find((m) => m.id === matterId)
    if (!matter || matter.stage_id === newStageId) return

    updateStage.mutate({ id: matterId, stageId: newStageId })
  }

  if (!pipelines || pipelines.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
        <Kanban className="mx-auto mb-3 h-10 w-10 text-slate-400" />
        <h3 className="text-base font-medium text-slate-900">{t('matters.no_pipelines' as any)}</h3>
        <p className="mt-1 text-sm text-slate-500">
          {t('matters.no_pipelines_description' as any)}
        </p>
        <Button variant="outline" className="mt-4" asChild>
          <a href="/settings/pipelines">{t('matters.manage_pipelines' as any)}</a>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Pipeline selector */}
      {pipelines.length > 1 && (
        <Select value={pipelineId} onValueChange={setSelectedPipelineId}>
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder={t('matters.select_pipeline' as any)} />
          </SelectTrigger>
          <SelectContent>
            {pipelines.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {isLoading ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-72 shrink-0 rounded-lg" />
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveMatterId(null)}
        >
          <ScrollArea className="w-full">
            <div className="flex gap-3 pb-4">
              {stages?.map((stage) => (
                <MatterKanbanColumn
                  key={stage.id}
                  stageId={stage.id}
                  stageName={stage.name}
                  stageColor={stage.color}
                  matters={mattersByStage[stage.id] ?? []}
                  getLawyerName={getLawyerName}
                  onMatterClick={onMatterClick}
                  onMatterHover={(id) => { prefetchMatterFull(queryClient, id); onMatterHover?.(id) }}
                />
              ))}
              {(mattersByStage['__no_stage__']?.length ?? 0) > 0 && (
                <MatterKanbanColumn
                  stageId="__no_stage__"
                  stageName={t('matters.no_stage' as any)}
                  stageColor="#9ca3af"
                  matters={mattersByStage['__no_stage__']}
                  getLawyerName={getLawyerName}
                  onMatterClick={onMatterClick}
                  onMatterHover={(id) => { prefetchMatterFull(queryClient, id); onMatterHover?.(id) }}
                />
              )}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          <DragOverlay dropAnimation={null}>
            {activeMatter && (
              <div className="w-72 rounded-lg border bg-white p-3 shadow-lg">
                <p className="text-sm font-medium text-slate-900 truncate">{activeMatter.title}</p>
                {activeMatter.matter_number && (
                  <p className="text-xs text-muted-foreground">#{activeMatter.matter_number}</p>
                )}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  )
}
