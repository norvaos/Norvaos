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
  LayoutGrid,
  List,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Calendar,
  Phone,
  Mail,
  User,
  ClipboardList,
  FileUp,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { useTenant } from '@/lib/hooks/use-tenant'
import { usePracticeAreaContext } from '@/lib/hooks/use-practice-area-context'
import { useI18n } from '@/lib/i18n/i18n-provider'
import { createClient } from '@/lib/supabase/client'
import { usePipelines, usePipelineStages } from '@/lib/queries/pipelines'
import { useLeads, useUpdateLeadStage, useUpdateLead, leadKeys } from '@/lib/queries/leads'
import { formatCurrency, formatDate, isOverdue } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { LEAD_TEMPERATURES, CONTACT_SOURCES } from '@/lib/utils/constants'

import { KanbanColumn, KanbanColumnSkeleton } from '@/components/pipeline/kanban-column'
import { KanbanCard } from '@/components/pipeline/kanban-card'
import type { ContactInfo, UserInfo } from '@/components/pipeline/kanban-card'
import { LeadCreateSheet } from '@/components/leads/lead-create-sheet'
import { BulkImportWizard } from '@/components/leads/import/bulk-import-wizard'
import { DeferredDateDialog } from '@/components/leads/deferred-date-dialog'
import { LostReasonDialog } from '@/components/leads/lost-reason-dialog'
import type { LostReason } from '@/components/leads/lost-reason-dialog'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { toast } from 'sonner'
import type { Database } from '@/lib/types/database'

type Lead = Database['public']['Tables']['leads']['Row']

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

// ─── Mini ScoreRing (Directive 36.1 — Sovereign Layer) ───────────────────────
const MINI_RING_SIZE = 36
const MINI_RING_CENTER = MINI_RING_SIZE / 2
const MINI_RING_RADIUS = 14
const MINI_RING_CIRCUMFERENCE = 2 * Math.PI * MINI_RING_RADIUS

function MiniScoreRing({ score }: { score: number }) {
  const colours = (() => {
    if (score >= 95) return { stroke: '#d4af37', text: 'text-yellow-600', gold: true }
    if (score >= 85) return { stroke: '#22c55e', text: 'text-green-600', gold: false }
    if (score >= 60) return { stroke: '#f59e0b', text: 'text-amber-600', gold: false }
    return { stroke: '#ef4444', text: 'text-red-600', gold: false }
  })()
  const offset = MINI_RING_CIRCUMFERENCE - (score / 100) * MINI_RING_CIRCUMFERENCE

  return (
    <div className="relative shrink-0">
      {colours.gold && (
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(212,175,55,0.25) 0%, transparent 70%)',
            animation: 'gold-pulse 2s ease-in-out infinite',
          }}
        />
      )}
      <svg
        width={MINI_RING_SIZE}
        height={MINI_RING_SIZE}
        viewBox={`0 0 ${MINI_RING_SIZE} ${MINI_RING_SIZE}`}
        className="relative"
        aria-hidden="true"
      >
        {colours.gold && (
          <defs>
            <filter id="mini-gold-glow">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        )}
        <circle
          cx={MINI_RING_CENTER}
          cy={MINI_RING_CENTER}
          r={MINI_RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          className="text-slate-200"
        />
        <circle
          cx={MINI_RING_CENTER}
          cy={MINI_RING_CENTER}
          r={MINI_RING_RADIUS}
          fill="none"
          stroke={colours.stroke}
          strokeWidth={colours.gold ? 3 : 2.5}
          strokeLinecap="round"
          strokeDasharray={MINI_RING_CIRCUMFERENCE}
          strokeDashoffset={offset}
          className="transition-all duration-500"
          filter={colours.gold ? 'url(#mini-gold-glow)' : undefined}
          style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
        />
        <text
          x={MINI_RING_CENTER}
          y={MINI_RING_CENTER}
          textAnchor="middle"
          dominantBaseline="central"
          className={cn('fill-current font-bold tabular-nums', colours.text)}
          style={{ fontSize: '10px' }}
        >
          {score}
        </text>
      </svg>
    </div>
  )
}

export default function LeadsPage() {
  const { tenant, isLoading: tenantLoading } = useTenant()
  const queryClient = useQueryClient()
  const router = useRouter()
  const { t } = useI18n()
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

  // ---- View mode (persisted in localStorage) --------------------------------
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>(() => {
    if (typeof window === 'undefined') return 'kanban'
    const saved = localStorage.getItem('norvaos-leads-view-mode')
    if (saved === 'table') return saved
    return 'kanban'
  })

  useEffect(() => {
    localStorage.setItem('norvaos-leads-view-mode', viewMode)
  }, [viewMode])

  // ---- Table sort ----------------------------------------------------------
  const [sortField, setSortField] = useState<string>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const toggleSort = useCallback((field: string) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }, [sortField])

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
        .select('id, first_name, last_name, email_primary, organization_name, active_matter_count')
        .in('id', contactIds)

      if (error) throw error
      const map: Record<string, ContactInfo> = {}
      for (const c of (data ?? []) as (ContactInfo & { active_matter_count?: number })[]) {
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
        map[pa.id] = { id: pa.id, name: pa.name, color: pa.color ?? '' }
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

  // ---- Sorted leads for table view -----------------------------------------
  const sortedLeads = useMemo(() => {
    const sorted = [...filteredLeads]
    sorted.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'contact_name': {
          const nameA = a.contact_id ? [contactsMap[a.contact_id]?.first_name, contactsMap[a.contact_id]?.last_name].filter(Boolean).join(' ') : ''
          const nameB = b.contact_id ? [contactsMap[b.contact_id]?.first_name, contactsMap[b.contact_id]?.last_name].filter(Boolean).join(' ') : ''
          cmp = nameA.localeCompare(nameB)
          break
        }
        case 'temperature': {
          const temps = ['hot', 'warm', 'cold']
          cmp = temps.indexOf(a.temperature ?? 'cold') - temps.indexOf(b.temperature ?? 'cold')
          break
        }
        case 'stage': {
          const stageMap = new Map(stages?.map((s, i) => [s.id, i]))
          cmp = (stageMap.get(a.stage_id) ?? 0) - (stageMap.get(b.stage_id) ?? 0)
          break
        }
        case 'source':
          cmp = (a.source ?? '').localeCompare(b.source ?? '')
          break
        case 'estimated_value':
          cmp = (a.estimated_value ?? 0) - (b.estimated_value ?? 0)
          break
        case 'next_follow_up':
          cmp = (a.next_follow_up ?? '').localeCompare(b.next_follow_up ?? '')
          break
        case 'assigned_to': {
          const userA = a.assigned_to ? [usersMap[a.assigned_to]?.first_name, usersMap[a.assigned_to]?.last_name].filter(Boolean).join(' ') : ''
          const userB = b.assigned_to ? [usersMap[b.assigned_to]?.first_name, usersMap[b.assigned_to]?.last_name].filter(Boolean).join(' ') : ''
          cmp = userA.localeCompare(userB)
          break
        }
        case 'created_at':
        default:
          cmp = (a.created_at ?? '').localeCompare(b.created_at ?? '')
          break
      }
      return sortDir === 'desc' ? -cmp : cmp
    })
    return sorted
  }, [filteredLeads, sortField, sortDir, contactsMap, usersMap, stages])

  // ---- Summary stats -------------------------------------------------------
  const totalLeads = leads.length
  const totalValue = useMemo(
    () => leads.reduce((sum, l) => sum + (l.estimated_value ?? 0), 0),
    [leads]

  // ---- Pipeline readiness score (weighted health metric) ------------------
  )
  const pipelineReadiness = useMemo(() => {
    if (leads.length === 0) return 0
    let score = 0
    let weight = 0
    for (const lead of leads) {
      // +25 base for existing in pipeline
      score += 25; weight += 25
      // +25 if contact assigned
      if (lead.contact_id) score += 25; weight += 25
      // +25 if has value estimate
      if (lead.estimated_value && lead.estimated_value > 0) score += 25; weight += 25
      // +25 if follow-up is set and not overdue
      if (lead.next_follow_up && !isOverdue(lead.next_follow_up)) score += 25
      weight += 25
    }
    return weight > 0 ? Math.round((score / weight) * 100) : 0
  }, [leads]
  )

  // ---- Drag-and-drop -------------------------------------------------------
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null)
  const updateLeadStage = useUpdateLeadStage()
  const updateLead = useUpdateLead()

  // ---- Deferred stage: pending move + date picker dialog -------------------
  const [pendingDeferredMove, setPendingDeferredMove] = useState<{
    leadId: string
    stageId: string
  } | null>(null)

  // ---- Lost stage: pending move + lost reason dialog ----------------------
  const [pendingLostMove, setPendingLostMove] = useState<{
    leadId: string
    stageId: string
  } | null>(null)

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

  const applyOptimisticStageMove = useCallback(
    (leadId: string, targetStageId: string) => {
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
    },
    [queryClient, tenantId, selectedPipelineId]
  )

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

      const targetStage = stages?.find((s) => s.id === targetStageId)

      // Check if target stage is a lost stage — requires a lost reason
      if (targetStage?.is_lost_stage) {
        // Do NOT apply optimistic move yet — wait for confirmation
        setPendingLostMove({ leadId, stageId: targetStageId })
        return
      }

      // Check if target stage is "Deferred" — requires a reactivation date
      if (targetStage && /deferred/i.test(targetStage.name)) {
        // Optimistic move, then open date picker
        applyOptimisticStageMove(leadId, targetStageId)
        setPendingDeferredMove({ leadId, stageId: targetStageId })
        return
      }

      // All other stages (including On Hold): move normally
      applyOptimisticStageMove(leadId, targetStageId)

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
    [leads, stages, queryClient, applyOptimisticStageMove, updateLeadStage]
  )

  // Deferred dialog: confirm with date
  const handleDeferredConfirm = useCallback(
    (date: Date) => {
      if (!pendingDeferredMove) return
      const { leadId, stageId } = pendingDeferredMove
      setPendingDeferredMove(null)

      // 1. Move the lead to the deferred stage
      updateLeadStage.mutate(
        { id: leadId, stageId },
        {
          onError: () => {
            queryClient.invalidateQueries({ queryKey: leadKeys.lists() })
          },
        }
      )

      // 2. Set next_follow_up as the reactivation date
      updateLead.mutate(
        { id: leadId, next_follow_up: date.toISOString() },
        {
          onError: () => {
            queryClient.invalidateQueries({ queryKey: leadKeys.lists() })
          },
        }
      )
    },
    [pendingDeferredMove, updateLeadStage, updateLead, queryClient]
  )

  // Deferred dialog: cancel — revert the optimistic move
  const handleDeferredCancel = useCallback(() => {
    setPendingDeferredMove(null)
    queryClient.invalidateQueries({ queryKey: leadKeys.lists() })
  }, [queryClient])

  // Lost dialog: confirm with reason
  const handleLostConfirm = useCallback(
    async (reason: LostReason, detail: string) => {
      if (!pendingLostMove) return
      const { leadId, stageId } = pendingLostMove
      setPendingLostMove(null)

      // Apply optimistic move now
      applyOptimisticStageMove(leadId, stageId)

      try {
        // 1. Move to the lost stage
        await updateLeadStage.mutateAsync({ id: leadId, stageId })

        // 2. Update lead with lost reason, detail, and status
        await updateLead.mutateAsync({
          id: leadId,
          lost_reason: reason,
          lost_detail: detail || null,
          status: 'lost',
        })

        toast.success('Lead closed as lost')
      } catch {
        toast.error('Failed to close lead as lost')
        queryClient.invalidateQueries({ queryKey: leadKeys.lists() })
      }
    },
    [pendingLostMove, applyOptimisticStageMove, updateLeadStage, updateLead, queryClient]
  )

  // Lost dialog: cancel — no optimistic update was applied, just clear
  const handleLostCancel = useCallback(() => {
    setPendingLostMove(null)
  }, [])

  const handleDragCancel = useCallback(() => {
    setActiveLeadId(null)
  }, [])

  // ---- Lead creation sheet -------------------------------------------------
  const [createSheetOpen, setCreateSheetOpen] = useState(false)
  const [importWizardOpen, setImportWizardOpen] = useState(false)
  const [createSheetStageId, setCreateSheetStageId] = useState<string>('')

  const handleAddLead = useCallback(
    (stageId: string) => {
      setCreateSheetStageId(stageId)
      setCreateSheetOpen(true)
    },
    []
  )

  const handleCardClick = useCallback((leadId: string) => {
    router.push(`/command/lead/${leadId}`)
  }, [router])

  const handleViewMatter = useCallback((matterId: string) => {
    router.push(`/matters/${matterId}`)
  }, [router])

  // Build active_matter_count lookup keyed by contact_id (from enriched contacts query)
  const activeMatterCountMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const [contactId, contact] of Object.entries(contactsMap)) {
      const count = (contact as ContactInfo & { active_matter_count?: number }).active_matter_count
      if (count != null && count > 0) map[contactId] = count
    }
    return map
  }, [contactsMap])

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
            title={t('leads.no_pipelines', 'No lead pipelines configured')}
            description="Create a lead pipeline in Settings to start tracking your leads through stages."
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col" data-leads-command>
      {/* Page header with pipeline selector */}
      <div className="flex-shrink-0 border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-semibold text-slate-900">{t('leads.title', 'Leads')}</h1>

            {/* ScoreRing — Pipeline Readiness (Directive 36.1) */}
            {totalLeads > 0 && (
              <div className="flex items-center gap-2">
                <MiniScoreRing score={pipelineReadiness} />
                <Badge variant="outline" className="text-[10px] font-medium text-blue-700 border-blue-200 bg-blue-50 iron-shadow">
                  {t('leads.new_inquiry', 'New Inquiry')}
                </Badge>
              </div>
            )}

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
                  {t('leads.total_value', 'total value')}
                </span>
              )}
            </div>

            {/* View toggle */}
            <div className="flex items-center rounded-md border border-slate-200 p-0.5">
              <Button
                variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2.5"
                title="Kanban"
                onClick={() => setViewMode('kanban')}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2.5"
                title="Table"
                onClick={() => setViewMode('table')}
              >
                <List className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Import leads */}
            <Button
              size="sm"
              variant="outline"
              className="iron-shadow"
              onClick={() => setImportWizardOpen(true)}
            >
              <FileUp className="mr-1 h-4 w-4" />
              {t('leads.import', 'Import')}
            </Button>

            {/* Add lead button */}
            <Button
              size="sm"
              className="iron-shadow"
              onClick={() => {
                const firstStage = stages?.[0]
                if (firstStage) {
                  handleAddLead(firstStage.id)
                }
              }}
              disabled={!stages || stages.length === 0}
            >
              <Plus className="mr-1 h-4 w-4" />
              {t('leads.add_lead', 'Add Lead')}
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
              placeholder={t('leads.search', 'Search leads...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 iron-shadow"
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
            <SelectTrigger className="w-[160px] iron-shadow">
              <Thermometer className="mr-2 h-4 w-4 text-slate-400" />
              <SelectValue placeholder={t('leads.temperature', 'Temperature')} />
            </SelectTrigger>
            <SelectContent className="iron-shadow-elevated">
              <SelectItem value="all">{t('leads.all_temperatures', 'All temperatures')}</SelectItem>
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
            <SelectTrigger className="w-[160px] iron-shadow">
              <ListFilter className="mr-2 h-4 w-4 text-slate-400" />
              <SelectValue placeholder={t('leads.source', 'Source')} />
            </SelectTrigger>
            <SelectContent className="iron-shadow-elevated">
              <SelectItem value="all">{t('leads.all_sources', 'All sources')}</SelectItem>
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
              <Button variant="outline" size="sm" className="gap-1.5 iron-shadow">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {t('leads.display', 'Display')}
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
                  <h4 className="text-sm font-medium mb-2">{t('leads.display', 'Card Display')}</h4>
                  <div className="space-y-2">
                    <label className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">{t('leads.card_show_values', 'Show values')}</span>
                      <button
                        onClick={() => setShowValues(!showValues)}
                        className={`h-5 w-9 rounded-full transition-colors ${showValues ? 'bg-blue-600' : 'bg-slate-200'}`}
                      >
                        <span className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${showValues ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    </label>
                    <label className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">{t('leads.card_show_follow_up', 'Show follow-up dates')}</span>
                      <button
                        onClick={() => setShowFollowUp(!showFollowUp)}
                        className={`h-5 w-9 rounded-full transition-colors ${showFollowUp ? 'bg-blue-600' : 'bg-slate-200'}`}
                      >
                        <span className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${showFollowUp ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    </label>
                    <label className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">{t('leads.card_show_source', 'Show source')}</span>
                      <button
                        onClick={() => setShowSource(!showSource)}
                        className={`h-5 w-9 rounded-full transition-colors ${showSource ? 'bg-blue-600' : 'bg-slate-200'}`}
                      >
                        <span className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${showSource ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    </label>
                    <label className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">{t('leads.card_show_assignee', 'Show assignee')}</span>
                      <button
                        onClick={() => setShowAssignee(!showAssignee)}
                        className={`h-5 w-9 rounded-full transition-colors ${showAssignee ? 'bg-blue-600' : 'bg-slate-200'}`}
                      >
                        <span className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${showAssignee ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    </label>
                    <label className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">{t('leads.card_show_days', 'Show days in stage')}</span>
                      <button
                        onClick={() => setShowDaysInStage(!showDaysInStage)}
                        className={`h-5 w-9 rounded-full transition-colors ${showDaysInStage ? 'bg-blue-600' : 'bg-slate-200'}`}
                      >
                        <span className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${showDaysInStage ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    </label>
                    <label className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">{t('leads.card_show_practice', 'Show practice area')}</span>
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
                  <h4 className="text-sm font-medium mb-2">{t('leads.stage_visibility', 'Stage Visibility')}</h4>
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
              {t('leads.clear_filters', 'Clear filters')} ({activeFilterCount})
            </Button>
          )}
        </div>
      </div>

      {/* Main content area — Kanban or Table */}
      <div className="flex-1 overflow-hidden">
        {stagesLoading || leadsLoading ? (
          viewMode === 'kanban' ? (
            <div className="flex gap-4 overflow-x-auto p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <KanbanColumnSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          )
        ) : !stages || stages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={Funnel}
              title={t('leads.no_stages', 'No stages configured')}
              description="This pipeline has no stages yet. Add stages in pipeline settings to start organizing leads."
            />
          </div>
        ) : viewMode === 'kanban' ? (
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
                  activeMatterCountMap={activeMatterCountMap}
                  onAddLead={handleAddLead}
                  onCardClick={handleCardClick}
                  onViewMatter={handleViewMatter}
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
        ) : (
          /* ── Table View ── */
          <LeadsTable
            leads={sortedLeads}
            stages={stages}
            contactsMap={contactsMap}
            usersMap={usersMap}
            practiceAreasMap={practiceAreasMap}
            sortField={sortField}
            sortDir={sortDir}
            onSort={toggleSort}
            onRowClick={handleCardClick}
          />
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

      {/* Deferred stage date picker dialog */}
      <DeferredDateDialog
        open={!!pendingDeferredMove}
        onConfirm={handleDeferredConfirm}
        onCancel={handleDeferredCancel}
      />

      {/* Lost reason dialog */}
      <LostReasonDialog
        open={!!pendingLostMove}
        onOpenChange={(open) => {
          if (!open) handleLostCancel()
        }}
        onConfirm={handleLostConfirm}
        onCancel={handleLostCancel}
      />

      {/* Bulk import wizard */}
      <BulkImportWizard
        open={importWizardOpen}
        onOpenChange={setImportWizardOpen}
        tenantId={tenantId}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Table view component
// ---------------------------------------------------------------------------

type PipelineStage = Database['public']['Tables']['pipeline_stages']['Row']

function SortHeader({
  label,
  field,
  currentField,
  currentDir,
  onSort,
}: {
  label: string
  field: string
  currentField: string
  currentDir: 'asc' | 'desc'
  onSort: (field: string) => void
}) {
  const active = currentField === field
  return (
    <button
      className="flex items-center gap-1 text-left text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
      onClick={() => onSort(field)}
    >
      {label}
      {active ? (
        currentDir === 'asc' ? (
          <ChevronUp className="h-3 w-3 text-blue-600" />
        ) : (
          <ChevronDown className="h-3 w-3 text-blue-600" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  )
}

function LeadsTable({
  leads,
  stages,
  contactsMap,
  usersMap,
  practiceAreasMap,
  sortField,
  sortDir,
  onSort,
  onRowClick,
}: {
  leads: Lead[]
  stages: PipelineStage[]
  contactsMap: Record<string, ContactInfo>
  usersMap: Record<string, UserInfo>
  practiceAreasMap: Record<string, { id: string; name: string; color: string }>
  sortField: string
  sortDir: 'asc' | 'desc'
  onSort: (field: string) => void
  onRowClick: (leadId: string) => void
}) {
  const { t } = useI18n()
  const stageMap = useMemo(
    () => new Map(stages.map((s) => [s.id, s])),
    [stages]
  )

  if (leads.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <EmptyState
          icon={List}
          title={t('leads.no_results', 'No leads match your filters')}
          description="Try adjusting your search or filter criteria."
        />
      </div>
    )
  }

  return (
    <div className="overflow-auto h-full">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
            <TableHead className="w-[200px]">
              <SortHeader label={t('leads.contact', 'Contact')} field="contact_name" currentField={sortField} currentDir={sortDir} onSort={onSort} />
            </TableHead>
            <TableHead className="w-[100px]">
              <SortHeader label={t('leads.temperature', 'Temperature')} field="temperature" currentField={sortField} currentDir={sortDir} onSort={onSort} />
            </TableHead>
            <TableHead className="w-[140px]">
              <SortHeader label={t('leads.stage', 'Stage')} field="stage" currentField={sortField} currentDir={sortDir} onSort={onSort} />
            </TableHead>
            <TableHead className="w-[120px]">
              <SortHeader label={t('leads.source', 'Source')} field="source" currentField={sortField} currentDir={sortDir} onSort={onSort} />
            </TableHead>
            <TableHead className="w-[110px] text-right">
              <SortHeader label={t('leads.value', 'Value')} field="estimated_value" currentField={sortField} currentDir={sortDir} onSort={onSort} />
            </TableHead>
            <TableHead className="w-[140px]">
              <SortHeader label={t('leads.assigned_to', 'Assigned To')} field="assigned_to" currentField={sortField} currentDir={sortDir} onSort={onSort} />
            </TableHead>
            <TableHead className="w-[120px]">
              <SortHeader label={t('leads.follow_up', 'Follow-up')} field="next_follow_up" currentField={sortField} currentDir={sortDir} onSort={onSort} />
            </TableHead>
            <TableHead className="w-[110px]">
              <SortHeader label={t('leads.created', 'Created')} field="created_at" currentField={sortField} currentDir={sortDir} onSort={onSort} />
            </TableHead>
            <TableHead className="w-[90px] text-center">{t('leads.consult', 'Consult')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => {
            const contact = lead.contact_id ? contactsMap[lead.contact_id] : null
            const contactName = contact
              ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email_primary || '—'
              : '—'
            const stage = stageMap.get(lead.stage_id)
            const tempInfo = LEAD_TEMPERATURES.find((t) => t.value === lead.temperature)
            const assignee = lead.assigned_to ? usersMap[lead.assigned_to] : null
            const assigneeName = assignee ? [assignee.first_name, assignee.last_name].filter(Boolean).join(' ') : null
            const practiceArea = lead.practice_area_id ? practiceAreasMap[lead.practice_area_id] : null
            const daysInCurrentStage = lead.stage_entered_at
              ? Math.max(0, Math.floor((Date.now() - new Date(lead.stage_entered_at).getTime()) / 86400000))
              : null

            return (
              <TableRow
                key={lead.id}
                className="cursor-pointer hover:bg-blue-50/40 transition-colors"
                onClick={() => onRowClick(lead.id)}
              >
                {/* Contact */}
                <TableCell>
                  <div>
                    <span className="text-sm font-medium text-slate-800">{contactName}</span>
                    {contact?.organization_name && (
                      <p className="text-[11px] text-slate-400 truncate">{contact.organization_name}</p>
                    )}
                  </div>
                </TableCell>

                {/* Temperature */}
                <TableCell>
                  {tempInfo ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] gap-1"
                      style={{
                        borderColor: tempInfo.color,
                        color: tempInfo.color,
                      }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: tempInfo.color }}
                      />
                      {tempInfo.label}
                    </Badge>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </TableCell>

                {/* Stage */}
                <TableCell>
                  {stage ? (
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: stage.color ?? '#6b7280' }}
                      />
                      <span className="text-xs text-slate-700">{stage.name}</span>
                      {daysInCurrentStage !== null && daysInCurrentStage > 0 && (
                        <span className="text-[10px] text-slate-400">{daysInCurrentStage}d</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </TableCell>

                {/* Source */}
                <TableCell>
                  <span className="text-xs text-slate-600">{lead.source ?? '—'}</span>
                </TableCell>

                {/* Value */}
                <TableCell className="text-right">
                  {lead.estimated_value ? (
                    <span className="text-xs font-medium text-slate-700 tabular-nums">
                      {formatCurrency(lead.estimated_value)}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </TableCell>

                {/* Assigned To */}
                <TableCell>
                  {assigneeName ? (
                    <span className="text-xs text-slate-600">{assigneeName}</span>
                  ) : (
                    <span className="text-xs text-slate-400">{t('leads.unassigned', 'Unassigned')}</span>
                  )}
                </TableCell>

                {/* Follow-up */}
                <TableCell>
                  {lead.next_follow_up ? (
                    <span
                      className={cn(
                        'text-xs tabular-nums',
                        isOverdue(lead.next_follow_up)
                          ? 'text-red-600 font-medium'
                          : 'text-slate-600'
                      )}
                    >
                      {formatDate(lead.next_follow_up)}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </TableCell>

                {/* Created */}
                <TableCell>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {lead.created_at ? formatDate(lead.created_at) : '—'}
                  </span>
                </TableCell>

                {/* Consult */}
                <TableCell className="text-center">
                  <Link
                    href={`/leads/${lead.id}/consultation`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100 hover:border-blue-300 transition-colors"
                  >
                    <ClipboardList className="h-3 w-3" />
                    {t('leads.consult', 'Consult')}
                  </Link>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page header for empty-pipeline state
// ---------------------------------------------------------------------------

function PageHeader() {
  const { t } = useI18n()
  return (
    <div className="flex-shrink-0 border-b bg-white px-6 py-4">
      <h1 className="text-2xl font-semibold text-slate-900">{t('leads.title', 'Leads')}</h1>
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
