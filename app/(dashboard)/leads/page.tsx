'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Funnel,
  Plus,
  Search,
  Settings2,
  Thermometer,
  X,
  SlidersHorizontal,
  Eye,
  EyeOff,
  ListFilter,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { useTenant } from '@/lib/hooks/use-tenant'
import { usePracticeAreaContext } from '@/lib/hooks/use-practice-area-context'
import { createClient } from '@/lib/supabase/client'
import { usePipelines, usePipelineStages } from '@/lib/queries/pipelines'
import { useLeads, useUpdateLeadStage, leadKeys } from '@/lib/queries/leads'
import { formatCurrency } from '@/lib/utils/formatters'
import { LEAD_TEMPERATURES, CONTACT_SOURCES } from '@/lib/utils/constants'

import { KanbanColumn, KanbanColumnSkeleton } from '@/components/pipeline/kanban-column'
import { KanbanCard } from '@/components/pipeline/kanban-card'
import type { ContactInfo, UserInfo } from '@/components/pipeline/kanban-card'
import { LeadCreateSheet } from '@/components/leads/lead-create-sheet'
import { EmptyState } from '@/components/shared/empty-state'
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'

import type { Database } from '@/lib/types/database'

type Lead = Database['public']['Tables']['leads']['Row']

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function LeadsPage() {
  const { tenant, isLoading: tenantLoading } = useTenant()
  const queryClient = useQueryClient()
  const router = useRouter()
  const tenantId = tenant?.id ?? ''

  // ---- Global practice area context ----------------------------------------
  const { filter: globalPracticeFilter, effectiveName: practiceAreaName } = usePracticeAreaContext()

  // ---- Pipeline selection --------------------------------------------------
  const {
    data: pipelines,
    isLoading: pipelinesLoading,
  } = usePipelines(tenantId, 'lead')

  // Filter pipelines by active practice area (pipelines.practice_area is TEXT name).
  // Uses case-insensitive comparison. If filtering produces zero results,
  // falls back to showing all pipelines so the user is never locked out.
  const filteredPipelines = useMemo(() => {
    if (!pipelines) return []
    if (globalPracticeFilter === 'all' || !practiceAreaName) return pipelines
    const nameLower = practiceAreaName.toLowerCase()
    const filtered = pipelines.filter(
      (p) => !p.practice_area || p.practice_area.toLowerCase() === nameLower
    )
    // Graceful fallback: if nothing matches, show all pipelines
    return filtered.length > 0 ? filtered : pipelines
  }, [pipelines, globalPracticeFilter, practiceAreaName])

  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('')

  // Auto-select the default pipeline (or first available)
  useEffect(() => {
    if (filteredPipelines.length > 0 && !selectedPipelineId) {
      const defaultPipeline = filteredPipelines.find((p) => p.is_default)
      setSelectedPipelineId(defaultPipeline?.id ?? filteredPipelines[0].id)
    }
  }, [filteredPipelines, selectedPipelineId])

  // Re-select pipeline when global practice area changes
  useEffect(() => {
    if (!filteredPipelines.length) return
    const match = filteredPipelines.find((p) => p.is_default) ?? filteredPipelines[0]
    setSelectedPipelineId(match.id)
  }, [globalPracticeFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedPipeline = useMemo(
    () => pipelines?.find((p) => p.id === selectedPipelineId) ?? null,
    [pipelines, selectedPipelineId]
  )

  // ---- Stages for selected pipeline ---------------------------------------
  const {
    data: stages,
    isLoading: stagesLoading,
  } = usePipelineStages(selectedPipelineId)

  // ---- Leads for selected pipeline ----------------------------------------
  const {
    data: leadsData,
    isLoading: leadsLoading,
  } = useLeads({
    tenantId,
    pipelineId: selectedPipelineId,
    status: 'open',
    pageSize: 500, // kanban should load all open leads
  })

  const leads = leadsData?.leads ?? []

  // ---- Filters ------------------------------------------------------------
  const [searchQuery, setSearchQuery] = useState('')
  const [temperatureFilter, setTemperatureFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')

  // ---- Display settings ---------------------------------------------------
  const [showValues, setShowValues] = useState(true)
  const [showFollowUp, setShowFollowUp] = useState(true)
  const [showSource, setShowSource] = useState(true)
  const [showAssignee, setShowAssignee] = useState(true)
  const [showDaysInStage, setShowDaysInStage] = useState(true)
  const [showPracticeArea, setShowPracticeArea] = useState(false)
  const [hiddenStageIds, setHiddenStageIds] = useState<Set<string>>(new Set())

  const toggleStageVisibility = useCallback((stageId: string) => {
    setHiddenStageIds((prev) => {
      const next = new Set(prev)
      if (next.has(stageId)) {
        next.delete(stageId)
      } else {
        next.add(stageId)
      }
      return next
    })
  }, [])

  // Visible stages (filtered by hidden)
  const visibleStages = useMemo(
    () => stages?.filter((s) => !hiddenStageIds.has(s.id)) ?? [],
    [stages, hiddenStageIds]
  )

  // ---- Lookup maps: contacts and users ------------------------------------
  const contactIds = useMemo(
    () => [...new Set(leads.map((l) => l.contact_id).filter(Boolean))],
    [leads]
  )

  const assignedUserIds = useMemo(
    () => [...new Set(leads.map((l) => l.assigned_to).filter((id): id is string => !!id))],
    [leads]
  )

  const { data: contactsMap = {} } = useQuery({
    queryKey: ['contacts', 'map', contactIds],
    queryFn: async () => {
      if (contactIds.length === 0) return {} as Record<string, ContactInfo>
      const supabase = createClient()
      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email_primary, organization_name')
        .in('id', contactIds)

      if (error) throw error
      const map: Record<string, ContactInfo> = {}
      for (const c of (data ?? []) as ContactInfo[]) {
        map[c.id] = c
      }
      return map
    },
    enabled: contactIds.length > 0,
  })

  const { data: usersMap = {} } = useQuery({
    queryKey: ['users', 'map', assignedUserIds],
    queryFn: async () => {
      if (assignedUserIds.length === 0) return {} as Record<string, UserInfo>
      const supabase = createClient()
      const { data, error } = await supabase
        .from('users')
        .select('id, first_name, last_name, avatar_url')
        .in('id', assignedUserIds)

      if (error) throw error
      const map: Record<string, UserInfo> = {}
      for (const u of (data ?? []) as UserInfo[]) {
        map[u.id] = u
      }
      return map
    },
    enabled: assignedUserIds.length > 0,
  })

  // Build practice areas map for card display
  const practiceAreaIds = useMemo(
    () => [...new Set(leads.map((l) => l.practice_area_id).filter(Boolean))] as string[],
    [leads]
  )

  const { data: practiceAreasMap = {} } = useQuery({
    queryKey: ['practice_areas', 'map', practiceAreaIds],
    queryFn: async () => {
      if (practiceAreaIds.length === 0) return {} as Record<string, { id: string; name: string; color: string }>
      const supabase = createClient()
      const { data, error } = await supabase
        .from('practice_areas')
        .select('id, name, color')
        .in('id', practiceAreaIds)

      if (error) throw error
      const map: Record<string, { id: string; name: string; color: string }> = {}
      for (const pa of data ?? []) {
        map[pa.id] = pa
      }
      return map
    },
    enabled: practiceAreaIds.length > 0,
  })

  // ---- Filter leads -------------------------------------------------------
  const filteredLeads = useMemo(() => {
    let result = leads

    // Temperature filter
    if (temperatureFilter && temperatureFilter !== 'all') {
      result = result.filter((l) => l.temperature === temperatureFilter)
    }

    // Source filter
    if (sourceFilter && sourceFilter !== 'all') {
      result = result.filter((l) => l.source === sourceFilter)
    }

    // Search filter (by contact name or notes)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((lead) => {
        const contact = lead.contact_id ? contactsMap[lead.contact_id] : null
        const contactName = contact
          ? [contact.first_name, contact.last_name, contact.organization_name, contact.email_primary]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()
          : ''
        const notesText = (lead.notes ?? '').toLowerCase()
        const sourceText = (lead.source ?? '').toLowerCase()
        return contactName.includes(q) || notesText.includes(q) || sourceText.includes(q)
      })
    }

    return result
  }, [leads, temperatureFilter, sourceFilter, searchQuery, contactsMap])

  // Group filtered leads by stage
  const leadsByStage = useMemo(() => {
    const map: Record<string, Lead[]> = {}
    if (stages) {
      for (const stage of stages) {
        map[stage.id] = []
      }
    }
    for (const lead of filteredLeads) {
      if (map[lead.stage_id]) {
        map[lead.stage_id].push(lead)
      }
    }
    return map
  }, [filteredLeads, stages])

  // ---- Summary stats -------------------------------------------------------
  const totalLeads = leads.length
  const totalValue = useMemo(
    () => leads.reduce((sum, l) => sum + (l.estimated_value ?? 0), 0),
    [leads]
  )

  // ---- Drag-and-drop -------------------------------------------------------
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null)
  const updateLeadStage = useUpdateLeadStage()

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  const activeLead = useMemo(
    () => (activeLeadId ? leads.find((l) => l.id === activeLeadId) ?? null : null),
    [activeLeadId, leads]
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveLeadId(event.active.id as string)
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveLeadId(null)

      const { active, over } = event
      if (!over) return

      const leadId = active.id as string
      const lead = leads.find((l) => l.id === leadId)
      if (!lead) return

      // The droppable id is the stage id
      const targetStageId = over.id as string
      if (lead.stage_id === targetStageId) return

      // Optimistic update: immediately move the lead in the cache
      queryClient.setQueryData(
        leadKeys.list({
          tenantId,
          pipelineId: selectedPipelineId,
          status: 'open',
          pageSize: 500,
        }),
        (old: { leads: Lead[]; totalCount: number; page: number; pageSize: number; totalPages: number } | undefined) => {
          if (!old) return old
          return {
            ...old,
            leads: old.leads.map((l) =>
              l.id === leadId ? { ...l, stage_id: targetStageId, stage_entered_at: new Date().toISOString() } : l
            ),
          }
        }
      )

      updateLeadStage.mutate(
        { id: leadId, stageId: targetStageId },
        {
          onError: () => {
            // Revert optimistic update
            queryClient.invalidateQueries({ queryKey: leadKeys.lists() })
          },
        }
      )
    },
    [leads, queryClient, tenantId, selectedPipelineId, updateLeadStage]
  )

  const handleDragCancel = useCallback(() => {
    setActiveLeadId(null)
  }, [])

  // ---- Lead creation sheet -------------------------------------------------
  const [createSheetOpen, setCreateSheetOpen] = useState(false)
  const [createSheetStageId, setCreateSheetStageId] = useState<string>('')

  const handleAddLead = useCallback(
    (stageId: string) => {
      setCreateSheetStageId(stageId)
      setCreateSheetOpen(true)
    },
    []
  )

  const handleCardClick = useCallback((leadId: string) => {
    router.push(`/leads/${leadId}`)
  }, [router])

  // ---- Active filter count -------------------------------------------------
  const activeFilterCount =
    (temperatureFilter && temperatureFilter !== 'all' ? 1 : 0) +
    (sourceFilter && sourceFilter !== 'all' ? 1 : 0) +
    (searchQuery.trim() ? 1 : 0)

  // ---- Loading state -------------------------------------------------------
  const isLoading = tenantLoading || pipelinesLoading

  if (isLoading) {
    return <LeadsPageSkeleton />
  }

  // ---- No pipelines state --------------------------------------------------
  if (!pipelinesLoading && filteredPipelines.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader />
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={Funnel}
            title="No lead pipelines configured"
            description="Create a lead pipeline in Settings to start tracking your leads through stages."
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Page header with pipeline selector */}
      <div className="flex-shrink-0 border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-semibold text-slate-900">Leads</h1>

            {/* Pipeline selector */}
            {filteredPipelines.length > 1 && (
              <Select
                value={selectedPipelineId}
                onValueChange={(val) => {
                  setSelectedPipelineId(val)
                }}
              >
                <SelectTrigger className="w-[200px]">
                  <Funnel className="mr-2 h-4 w-4 text-slate-400" />
                  <SelectValue placeholder="Select pipeline" />
                </SelectTrigger>
                <SelectContent>
                  {filteredPipelines.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Pipeline name badge when there's only one */}
            {filteredPipelines.length === 1 && selectedPipeline && (
              <Badge variant="secondary" className="text-xs">
                {selectedPipeline.name}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Summary stats */}
            <div className="hidden items-center gap-4 text-sm text-slate-500 md:flex">
              <span>
                <span className="font-medium text-slate-700">{totalLeads}</span>{' '}
                {totalLeads === 1 ? 'lead' : 'leads'}
              </span>
              {totalValue > 0 && (
                <span>
                  <span className="font-medium text-slate-700">
                    {formatCurrency(totalValue)}
                  </span>{' '}
                  total value
                </span>
              )}
            </div>

            {/* Add lead button */}
            <Button
              size="sm"
              onClick={() => {
                const firstStage = stages?.[0]
                if (firstStage) {
                  handleAddLead(firstStage.id)
                }
              }}
              disabled={!stages || stages.length === 0}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add Lead
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9" asChild>
              <Link href="/settings/pipelines">
                <Settings2 className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="mt-3 flex items-center gap-3">
          {/* Search */}
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search leads..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
            {searchQuery && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                onClick={() => setSearchQuery('')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Temperature filter */}
          <Select
            value={temperatureFilter}
            onValueChange={setTemperatureFilter}
          >
            <SelectTrigger className="w-[160px]">
              <Thermometer className="mr-2 h-4 w-4 text-slate-400" />
              <SelectValue placeholder="Temperature" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All temperatures</SelectItem>
              {LEAD_TEMPERATURES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: t.color }}
                    />
                    {t.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Source filter */}
          <Select
            value={sourceFilter}
            onValueChange={setSourceFilter}
          >
            <SelectTrigger className="w-[160px]">
              <ListFilter className="mr-2 h-4 w-4 text-slate-400" />
              <SelectValue placeholder="Source" />
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

          {/* Display settings popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Display
                {hiddenStageIds.size > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px] px-1.5">
                    {hiddenStageIds.size} hidden
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72" align="end">
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium mb-2">Card Display</h4>
                  <div className="space-y-2">
                    <label className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Show values</span>
                      <button
                        onClick={() => setShowValues(!showValues)}
                        className={`h-5 w-9 rounded-full transition-colors ${showValues ? 'bg-blue-600' : 'bg-slate-200'}`}
                      >
                        <span className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${showValues ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    </label>
                    <label className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Show follow-up dates</span>
                      <button
                        onClick={() => setShowFollowUp(!showFollowUp)}
                        className={`h-5 w-9 rounded-full transition-colors ${showFollowUp ? 'bg-blue-600' : 'bg-slate-200'}`}
                      >
                        <span className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${showFollowUp ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    </label>
                    <label className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Show source</span>
                      <button
                        onClick={() => setShowSource(!showSource)}
                        className={`h-5 w-9 rounded-full transition-colors ${showSource ? 'bg-blue-600' : 'bg-slate-200'}`}
                      >
                        <span className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${showSource ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    </label>
                    <label className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Show assignee</span>
                      <button
                        onClick={() => setShowAssignee(!showAssignee)}
                        className={`h-5 w-9 rounded-full transition-colors ${showAssignee ? 'bg-blue-600' : 'bg-slate-200'}`}
                      >
                        <span className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${showAssignee ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    </label>
                    <label className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Show days in stage</span>
                      <button
                        onClick={() => setShowDaysInStage(!showDaysInStage)}
                        className={`h-5 w-9 rounded-full transition-colors ${showDaysInStage ? 'bg-blue-600' : 'bg-slate-200'}`}
                      >
                        <span className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${showDaysInStage ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    </label>
                    <label className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Show practice area</span>
                      <button
                        onClick={() => setShowPracticeArea(!showPracticeArea)}
                        className={`h-5 w-9 rounded-full transition-colors ${showPracticeArea ? 'bg-blue-600' : 'bg-slate-200'}`}
                      >
                        <span className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${showPracticeArea ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    </label>
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="text-sm font-medium mb-2">Stage Visibility</h4>
                  <div className="space-y-1.5">
                    {stages?.map((stage) => (
                      <button
                        key={stage.id}
                        onClick={() => toggleStageVisibility(stage.id)}
                        className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-slate-100 text-left"
                      >
                        {hiddenStageIds.has(stage.id) ? (
                          <EyeOff className="h-3.5 w-3.5 text-slate-400" />
                        ) : (
                          <Eye className="h-3.5 w-3.5 text-blue-600" />
                        )}
                        <span
                          className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: stage.color ?? '#6b7280' }}
                        />
                        <span className={hiddenStageIds.has(stage.id) ? 'text-slate-400' : 'text-slate-700'}>
                          {stage.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Active filter indicator */}
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-500"
              onClick={() => {
                setSearchQuery('')
                setTemperatureFilter('all')
                setSourceFilter('all')
              }}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Clear filters ({activeFilterCount})
            </Button>
          )}
        </div>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-hidden">
        {stagesLoading || leadsLoading ? (
          <div className="flex gap-4 overflow-x-auto p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <KanbanColumnSkeleton key={i} />
            ))}
          </div>
        ) : !stages || stages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={Funnel}
              title="No stages configured"
              description="This pipeline has no stages yet. Add stages in pipeline settings to start organizing leads."
            />
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div className="flex h-full gap-4 overflow-x-auto p-4">
              {visibleStages.map((stage) => (
                <KanbanColumn
                  key={stage.id}
                  stage={stage}
                  leads={leadsByStage[stage.id] ?? []}
                  contactsMap={contactsMap}
                  usersMap={usersMap}
                  practiceAreasMap={practiceAreasMap}
                  onAddLead={handleAddLead}
                  onCardClick={handleCardClick}
                  showValues={showValues}
                  showFollowUp={showFollowUp}
                  showSource={showSource}
                  showAssignee={showAssignee}
                  showDaysInStage={showDaysInStage}
                  showPracticeArea={showPracticeArea}
                />
              ))}
            </div>

            {/* Drag overlay - shows floating card while dragging */}
            <DragOverlay dropAnimation={null}>
              {activeLead ? (
                <div className="w-72">
                  <KanbanCard
                    lead={activeLead}
                    contact={
                      activeLead.contact_id
                        ? contactsMap[activeLead.contact_id]
                        : undefined
                    }
                    assignedUser={
                      activeLead.assigned_to
                        ? usersMap[activeLead.assigned_to]
                        : undefined
                    }
                    practiceAreaName={activeLead.practice_area_id ? practiceAreasMap[activeLead.practice_area_id]?.name : null}
                    practiceAreaColor={activeLead.practice_area_id ? practiceAreasMap[activeLead.practice_area_id]?.color : null}
                    showValues={showValues}
                    showFollowUp={showFollowUp}
                    showSource={showSource}
                    showAssignee={showAssignee}
                    showDaysInStage={showDaysInStage}
                    showPracticeArea={showPracticeArea}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* Lead creation sheet */}
      {selectedPipelineId && stages && stages.length > 0 && (
        <LeadCreateSheet
          open={createSheetOpen}
          onOpenChange={setCreateSheetOpen}
          pipelineId={selectedPipelineId}
          stageId={createSheetStageId || stages[0].id}
          stages={stages}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page header for empty-pipeline state
// ---------------------------------------------------------------------------

function PageHeader() {
  return (
    <div className="flex-shrink-0 border-b bg-white px-6 py-4">
      <h1 className="text-2xl font-semibold text-slate-900">Leads</h1>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Full-page skeleton loader
// ---------------------------------------------------------------------------

function LeadsPageSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-shrink-0 border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-9 w-[200px]" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Skeleton className="h-9 w-[250px]" />
          <Skeleton className="h-9 w-[160px]" />
        </div>
      </div>
      <div className="flex flex-1 gap-4 overflow-x-auto p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <KanbanColumnSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
