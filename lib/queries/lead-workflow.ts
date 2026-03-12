/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Lead Workflow — React Query Hooks
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Client-side query and mutation hooks for the lead intake automation pipeline.
 * Follows the same patterns as contacts.ts/tasks.ts:
 *   - Hierarchical query key factory
 *   - Column selection for list performance
 *   - Cache invalidation on mutations
 *   - Audit logging via logAudit()
 *   - Toast notifications for user feedback
 *
 * All mutations delegate to API routes which call the service layer.
 * No business logic in these hooks — they are data access + cache management.
 *
 * ─── DATA ACCESS BOUNDARY RULE ─────────────────────────────────────────────
 *
 * There are two data access patterns in this file. Each hook uses exactly one.
 * The rule for which pattern a hook uses is:
 *
 * 1. DIRECT SUPABASE READ — Used for **read-only, single-table, RLS-protected
 *    queries** that do not require guard evaluation, cross-entity orchestration,
 *    three-tier template resolution, or any server-side business logic.
 *    These are pure data fetches. RLS on the table enforces tenant isolation.
 *
 *    Hooks using this pattern:
 *      - useLeadStageHistory          (lead_stage_history — read-only audit trail)
 *      - useLeadMilestones            (lead_milestone_groups + tasks — read-only)
 *      - useLeadCommunicationEvents   (lead_communication_events — read-only)
 *      - useLeadInsights              (lead_ai_insights — read-only)
 *      - useLeadConsultations         (lead_consultations — read-only)
 *      - useLeadRetainerPackages      (lead_retainer_packages — read-only)
 *      - useLeadQualificationDecisions(lead_qualification_decisions — read-only)
 *      - useLeadClosureRecords        (lead_closure_records — read-only)
 *
 * 2. API ROUTE — Used when the query or mutation involves **business logic,
 *    guard evaluation, multi-step orchestration, three-tier config/template
 *    resolution, or any write operation**. These go through authenticated API
 *    routes which delegate to the service layer.
 *
 *    Hooks using this pattern:
 *      - useLeadStageTransitions      (GET — evaluates transition guards)
 *      - useConversionGates           (GET — evaluates all conversion gates)
 *      - useLeadAutomationSettings    (GET — three-tier resolution: registry → settings → templates)
 *      - useAdvanceLeadStage          (POST — guard evaluation + stage engine)
 *      - useCloseLead                 (POST — closure engine orchestration)
 *      - useReopenLead                (POST — reopen engine orchestration)
 *      - useConvertLead               (POST — full gating + matter creation)
 *      - useLogCommunicationEvent     (POST — auto-complete + template resolution)
 *      - useGenerateInsights          (POST — AI service invocation)
 *      - useAcceptInsight             (PUT — insight acceptance + audit)
 *
 * When adding new hooks, follow this rule:
 *   - If the hook is a READ against a SINGLE RLS-protected table with NO
 *     business logic → use direct Supabase.
 *   - Everything else → use an API route.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database, Json } from '@/lib/types/database'
import { logAudit } from '@/lib/queries/audit-logs'
import { toast } from 'sonner'

// ─── Query Key Factory ──────────────────────────────────────────────────────

export const leadWorkflowKeys = {
  all: ['lead-workflow'] as const,

  // Stage
  stageHistory: (leadId: string) => [...leadWorkflowKeys.all, 'stage-history', leadId] as const,
  stageTransitions: (leadId: string) => [...leadWorkflowKeys.all, 'stage-transitions', leadId] as const,

  // Milestones
  milestones: (leadId: string) => [...leadWorkflowKeys.all, 'milestones', leadId] as const,

  // Communication
  communicationEvents: (leadId: string) => [...leadWorkflowKeys.all, 'communication', leadId] as const,

  // Conversion
  conversionGates: (leadId: string) => [...leadWorkflowKeys.all, 'conversion-gates', leadId] as const,

  // AI Insights
  insights: (leadId: string) => [...leadWorkflowKeys.all, 'insights', leadId] as const,

  // Automation Settings
  automationSettings: (leadId: string, triggerKey?: string) =>
    [...leadWorkflowKeys.all, 'automation-settings', leadId, triggerKey ?? 'all'] as const,

  // Consultations
  consultations: (leadId: string) => [...leadWorkflowKeys.all, 'consultations', leadId] as const,

  // Retainer
  retainerPackages: (leadId: string) => [...leadWorkflowKeys.all, 'retainer', leadId] as const,

  // Qualification
  qualificationDecisions: (leadId: string) => [...leadWorkflowKeys.all, 'qualification', leadId] as const,

  // Closure
  closureRecords: (leadId: string) => [...leadWorkflowKeys.all, 'closure', leadId] as const,

  // Lead detail (for invalidation after mutations)
  detail: (leadId: string) => ['leads', 'detail', leadId] as const,
  lists: () => ['leads', 'list'] as const,
}

// ─── Column Selections ──────────────────────────────────────────────────────
// All read-only queries use select('*') so the return types match Database Row
// types exactly. These are small, RLS-protected tables where selecting all
// columns has negligible performance impact.

// ─── Stage History Query ────────────────────────────────────────────────────

export function useLeadStageHistory(leadId: string) {
  return useQuery({
    queryKey: leadWorkflowKeys.stageHistory(leadId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('lead_stage_history')
        .select('*')
        .eq('lead_id', leadId)
        .order('changed_at', { ascending: true })

      if (error) throw error
      return data ?? []
    },
    enabled: !!leadId,
  })
}

// ─── Stage Transitions Query ────────────────────────────────────────────────

export function useLeadStageTransitions(leadId: string) {
  return useQuery({
    queryKey: leadWorkflowKeys.stageTransitions(leadId),
    queryFn: async () => {
      const res = await fetch(`/api/leads/${leadId}/stage`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to load stage transitions')
      }
      return res.json() as Promise<{
        success: boolean
        currentStage: string | null
        transitions: Array<{
          toStage: string
          label: string
          guards: Array<{ type: string; description: string }>
          autoTransition: boolean
          allowed: boolean
          blockedReasons: string[]
        }>
      }>
    },
    enabled: !!leadId,
  })
}

// ─── Milestones Query ───────────────────────────────────────────────────────

export function useLeadMilestones(leadId: string) {
  return useQuery({
    queryKey: leadWorkflowKeys.milestones(leadId),
    queryFn: async () => {
      const supabase = createClient()

      // Fetch groups
      const { data: groups, error: groupsErr } = await supabase
        .from('lead_milestone_groups')
        .select('*')
        .eq('lead_id', leadId)
        .order('sort_order', { ascending: true })

      if (groupsErr) throw groupsErr

      // Fetch tasks for all groups in one query
      const groupIds = (groups ?? []).map((g) => g.id)
      let tasks: Database['public']['Tables']['lead_milestone_tasks']['Row'][] = []

      if (groupIds.length > 0) {
        const { data: taskData, error: tasksErr } = await supabase
          .from('lead_milestone_tasks')
          .select('*')
          .in('milestone_group_id', groupIds)
          .order('sort_order', { ascending: true })

        if (tasksErr) throw tasksErr
        tasks = taskData ?? []
      }

      // Group tasks by milestone_group_id
      type TaskRow = (typeof tasks)[number]
      const tasksByGroup = tasks.reduce<Record<string, TaskRow[]>>((acc, task) => {
        const gid = task.milestone_group_id
        if (!acc[gid]) acc[gid] = []
        acc[gid].push(task)
        return acc
      }, {})

      return (groups ?? []).map((group) => ({
        ...group,
        tasks: tasksByGroup[group.id] ?? [],
      }))
    },
    enabled: !!leadId,
  })
}

// ─── Communication Events Query ─────────────────────────────────────────────

export function useLeadCommunicationEvents(leadId: string) {
  return useQuery({
    queryKey: leadWorkflowKeys.communicationEvents(leadId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('lead_communication_events')
        .select('*')
        .eq('lead_id', leadId)
        .order('occurred_at', { ascending: false })

      if (error) throw error
      return data ?? []
    },
    enabled: !!leadId,
  })
}

// ─── Conversion Gates Query ─────────────────────────────────────────────────

export function useConversionGates(leadId: string) {
  return useQuery({
    queryKey: leadWorkflowKeys.conversionGates(leadId),
    queryFn: async () => {
      const res = await fetch(`/api/leads/${leadId}/conversion-gates`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to evaluate conversion gates')
      }
      return res.json() as Promise<{
        success: boolean
        canConvert: boolean
        blockedReasons: string[]
        gateResults: Array<{
          gate: string
          label: string
          passed: boolean
          reason?: string
          enabled: boolean
        }>
      }>
    },
    enabled: !!leadId,
  })
}

// ─── AI Insights Query ──────────────────────────────────────────────────────

export function useLeadInsights(leadId: string) {
  return useQuery({
    queryKey: leadWorkflowKeys.insights(leadId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('lead_ai_insights')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data ?? []
    },
    enabled: !!leadId,
  })
}

// ─── Automation Settings Query ──────────────────────────────────────────────

export function useLeadAutomationSettings(
  leadId: string,
  options?: { triggerKey?: string; category?: string; includeTemplates?: boolean }
) {
  return useQuery({
    queryKey: leadWorkflowKeys.automationSettings(leadId, options?.triggerKey),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (options?.triggerKey) params.set('triggerKey', options.triggerKey)
      if (options?.category) params.set('category', options.category)
      if (options?.includeTemplates) params.set('includeTemplates', 'true')

      const url = `/api/leads/${leadId}/automation-settings${params.toString() ? `?${params}` : ''}`
      const res = await fetch(url)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to load automation settings')
      }
      return res.json() as Promise<{
        success: boolean
        automationSettings: Array<{
          triggerKey: string
          label: string
          description: string
          category: string
          isEnabled: boolean
          isSystemControlled: boolean
          enabledChannels: string[]
          supportedChannels: string[]
          availableMergeFields: Array<{ key: string; label: string; sampleValue: string }>
          settingsOverrides: Record<string, unknown>
          templates?: Record<string, { subject: string | null; body: string; isWorkspaceOverride: boolean }>
        }>
      }>
    },
    enabled: !!leadId,
  })
}

// ─── Consultations Query ────────────────────────────────────────────────────

export function useLeadConsultations(leadId: string) {
  return useQuery({
    queryKey: leadWorkflowKeys.consultations(leadId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('lead_consultations')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data ?? []
    },
    enabled: !!leadId,
  })
}

// ─── Retainer Packages Query ────────────────────────────────────────────────

export function useLeadRetainerPackages(leadId: string) {
  return useQuery({
    queryKey: leadWorkflowKeys.retainerPackages(leadId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('lead_retainer_packages')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data ?? []
    },
    enabled: !!leadId,
  })
}

// ─── Qualification Decisions Query ──────────────────────────────────────────

export function useLeadQualificationDecisions(leadId: string) {
  return useQuery({
    queryKey: leadWorkflowKeys.qualificationDecisions(leadId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('lead_qualification_decisions')
        .select('*')
        .eq('lead_id', leadId)
        .order('decided_at', { ascending: false })

      if (error) throw error
      return data ?? []
    },
    enabled: !!leadId,
  })
}

// ─── Closure Records Query ──────────────────────────────────────────────────

export function useLeadClosureRecords(leadId: string) {
  return useQuery({
    queryKey: leadWorkflowKeys.closureRecords(leadId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('lead_closure_records')
        .select('*')
        .eq('lead_id', leadId)
        .order('closed_at', { ascending: false })

      if (error) throw error
      return data ?? []
    },
    enabled: !!leadId,
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Advance Stage ──────────────────────────────────────────────────────────

export function useAdvanceLeadStage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      leadId: string
      targetStage: string
      reason?: string
      tenantId: string
      userId: string
    }) => {
      const res = await fetch(`/api/leads/${params.leadId}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetStage: params.targetStage,
          reason: params.reason,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to advance stage')
      return { ...data, leadId: params.leadId, tenantId: params.tenantId, userId: params.userId }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.stageHistory(data.leadId) })
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.stageTransitions(data.leadId) })
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.milestones(data.leadId) })
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.detail(data.leadId) })
      toast.success(`Stage advanced to ${data.newStage}`)

      logAudit({
        tenantId: data.tenantId,
        userId: data.userId,
        entityType: 'lead',
        entityId: data.leadId,
        action: 'stage_advanced',
        changes: { from: data.previousStage, to: data.newStage },
      })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to advance stage')
    },
  })
}

// ─── Close Lead ─────────────────────────────────────────────────────────────

export function useCloseLead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      leadId: string
      closedStage: string
      reasonCode: string
      reasonText?: string
      tenantId: string
      userId: string
    }) => {
      const res = await fetch(`/api/leads/${params.leadId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          closedStage: params.closedStage,
          reasonCode: params.reasonCode,
          reasonText: params.reasonText,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to close lead')
      return { ...data, leadId: params.leadId, tenantId: params.tenantId, userId: params.userId }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.stageHistory(data.leadId) })
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.milestones(data.leadId) })
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.closureRecords(data.leadId) })
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.detail(data.leadId) })
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.lists() })
      toast.success('Lead closed')

      logAudit({
        tenantId: data.tenantId,
        userId: data.userId,
        entityType: 'lead',
        entityId: data.leadId,
        action: 'lead_closed',
        changes: { closureRecordId: data.closureRecordId },
      })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to close lead')
    },
  })
}

// ─── Reopen Lead ────────────────────────────────────────────────────────────

export function useReopenLead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      leadId: string
      targetStage: string
      reason: string
      taskStrategy: 'restore' | 'reopen' | 'regenerate'
      tenantId: string
      userId: string
    }) => {
      const res = await fetch(`/api/leads/${params.leadId}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetStage: params.targetStage,
          reason: params.reason,
          taskStrategy: params.taskStrategy,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to reopen lead')
      return { ...data, leadId: params.leadId, tenantId: params.tenantId, userId: params.userId }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.stageHistory(data.leadId) })
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.milestones(data.leadId) })
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.closureRecords(data.leadId) })
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.detail(data.leadId) })
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.lists() })
      toast.success('Lead reopened')

      logAudit({
        tenantId: data.tenantId,
        userId: data.userId,
        entityType: 'lead',
        entityId: data.leadId,
        action: 'lead_reopened',
        changes: { reopenRecordId: data.reopenRecordId },
      })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reopen lead')
    },
  })
}

// ─── Convert Lead to Matter ─────────────────────────────────────────────────

export function useConvertLead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      leadId: string
      tenantId: string
      userId: string
      title: string
      description?: string
      practiceAreaId?: string
      responsibleLawyerId?: string
      originatingLawyerId?: string
      matterTypeId?: string
      caseTypeId?: string
      billingType?: string
      priority?: string
      pipelineId?: string
      stageId?: string
    }) => {
      const { leadId, tenantId, userId, ...matterData } = params
      const res = await fetch(`/api/leads/${leadId}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(matterData),
      })

      const data = await res.json()
      if (!res.ok) throw new ConversionError(data.error || 'Conversion failed', data.gateResults)
      return { ...data, leadId, tenantId, userId }
    },
    onSuccess: (data) => {
      // Invalidate lead queries
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.stageHistory(data.leadId) })
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.milestones(data.leadId) })
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.conversionGates(data.leadId) })
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.detail(data.leadId) })
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.lists() })
      // Also invalidate matters list since a new matter was created
      queryClient.invalidateQueries({ queryKey: ['matters', 'list'] })
      toast.success('Lead converted to matter')

      logAudit({
        tenantId: data.tenantId,
        userId: data.userId,
        entityType: 'lead',
        entityId: data.leadId,
        action: 'lead_converted',
        changes: { matterId: data.matterId },
      })
    },
    onError: (error: Error) => {
      if (error instanceof ConversionError && error.gateResults) {
        const blockedCount = error.gateResults.blockedReasons?.length ?? 0
        toast.error(`Conversion blocked: ${blockedCount} gate(s) not met`)
      } else {
        toast.error(error.message || 'Failed to convert lead')
      }
    },
  })
}

// ─── Log Communication Event ────────────────────────────────────────────────

export function useLogCommunicationEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      leadId: string
      tenantId: string
      userId: string
      channel: string
      direction: string
      subtype?: string
      subject?: string
      bodyPreview?: string
      deliveryStatus?: string
      readStatus?: string
      threadKey?: string
      providerThreadId?: string
      providerMessageId?: string
      inReplyTo?: string
      linkedTaskId?: string
      contactId?: string
      metadata?: Record<string, unknown>
      automationTriggerKey?: string
    }) => {
      const { leadId, tenantId, userId, ...eventData } = params
      const res = await fetch(`/api/leads/${leadId}/communication`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to log communication event')
      return { ...data, leadId, tenantId, userId }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.communicationEvents(data.leadId) })
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.milestones(data.leadId) })
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.detail(data.leadId) })

      if (data.countsAsContactAttempt) {
        toast.success('Communication logged (counted as contact attempt)')
      } else {
        toast.success('Communication logged')
      }

      logAudit({
        tenantId: data.tenantId,
        userId: data.userId,
        entityType: 'lead',
        entityId: data.leadId,
        action: 'communication_logged',
        changes: { eventId: data.eventId, tasksAutoCompleted: data.tasksAutoCompleted },
      })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to log communication event')
    },
  })
}

// ─── Generate AI Insights ───────────────────────────────────────────────────

export function useGenerateInsights() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { leadId: string }) => {
      const res = await fetch(`/api/leads/${params.leadId}/insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate insights')
      return { ...data, leadId: params.leadId }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.insights(data.leadId) })
      toast.success('AI insights generated')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to generate insights')
    },
  })
}

// ─── Accept AI Insight ──────────────────────────────────────────────────────

export function useAcceptInsight() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      leadId: string
      insightId: string
      notes?: string
      tenantId: string
      userId: string
    }) => {
      const res = await fetch(`/api/leads/${params.leadId}/insights`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          insightId: params.insightId,
          notes: params.notes,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to accept insight')
      return { ...data, leadId: params.leadId, tenantId: params.tenantId, userId: params.userId, insightId: params.insightId }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.insights(data.leadId) })
      toast.success('AI insight accepted')

      logAudit({
        tenantId: data.tenantId,
        userId: data.userId,
        entityType: 'lead',
        entityId: data.leadId,
        action: 'ai_insight_accepted',
        changes: { insightId: data.insightId },
      })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to accept insight')
    },
  })
}

// ─── Update Milestone Task (Complete / Skip) ────────────────────────────────

export function useUpdateMilestoneTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      leadId: string
      taskId: string
      action: 'complete' | 'skip'
      skipReason?: string
      tenantId: string
      userId: string
    }) => {
      const res = await fetch(`/api/leads/${params.leadId}/milestones`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: params.taskId,
          action: params.action,
          skipReason: params.skipReason,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update task')
      return { ...data, leadId: params.leadId, tenantId: params.tenantId, userId: params.userId }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.milestones(data.leadId) })
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.stageTransitions(data.leadId) })
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.detail(data.leadId) })
      toast.success(data.action === 'complete' ? 'Task completed' : 'Task skipped')

      logAudit({
        tenantId: data.tenantId,
        userId: data.userId,
        entityType: 'lead',
        entityId: data.leadId,
        action: data.action === 'complete' ? 'task_completed' : 'task_skipped',
        changes: { taskId: data.taskId },
      })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update task')
    },
  })
}

// ─── Retainer Package Mutations ──────────────────────────────────────────────

/**
 * Upsert a retainer package with line items, fees, and totals.
 * If a retainer package already exists for this lead, updates it.
 * Otherwise creates a new one.
 */
export function useSaveRetainerPackage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      leadId: string
      tenantId: string
      billingType: string
      lineItems: { description: string; quantity: number; unitPrice: number }[]
      governmentFees: { description: string; amount: number }[]
      disbursements: { description: string; amount: number }[]
      hstApplicable: boolean
      subtotalCents: number
      taxAmountCents: number
      totalAmountCents: number
      paymentTerms?: string
      paymentPlan?: unknown | null
      existingPackageId?: string | null
    }) => {
      const supabase = createClient()

      const record = {
        tenant_id: params.tenantId,
        lead_id: params.leadId,
        billing_type: params.billingType,
        line_items: params.lineItems as unknown as Json,
        government_fees: params.governmentFees as unknown as Json,
        disbursements: params.disbursements as unknown as Json,
        hst_applicable: params.hstApplicable,
        subtotal_cents: params.subtotalCents,
        tax_amount_cents: params.taxAmountCents,
        total_amount_cents: params.totalAmountCents,
        amount_requested: params.totalAmountCents,
        payment_terms: params.paymentTerms ?? null,
        payment_plan: params.paymentPlan as unknown as Json ?? null,
      }

      if (params.existingPackageId) {
        // Update existing
        const { data, error } = await (supabase as any)
          .from('lead_retainer_packages')
          .update(record)
          .eq('id', params.existingPackageId)
          .select()
          .single()
        if (error) throw error
        return data
      } else {
        // Create new
        const { data, error } = await (supabase as any)
          .from('lead_retainer_packages')
          .insert(record)
          .select()
          .single()
        if (error) throw error
        return data
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.retainerPackages(variables.leadId) })
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.detail(variables.leadId) })
      toast.success('Retainer package saved')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save retainer package')
    },
  })
}

/**
 * Record a payment against a lead retainer package.
 * Supports partial payments. On any payment, auto-converts lead to a matter.
 * Returns: { success, matterId?, matterNumber?, paymentStatus, totalPaid, totalOwed, balance }
 */
export function useRecordRetainerPayment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      leadId: string
      retainerPackageId: string
      amount: number // cents
      paymentMethod: string
      reference?: string
    }): Promise<{
      success: boolean
      matterId?: string | null
      matterNumber?: string | null
      conversionError?: string
      paymentStatus: 'paid' | 'partial'
      totalPaid: number
      totalOwed: number
      balance: number
    }> => {
      const res = await fetch('/api/command/record-retainer-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to record payment')
      }
      return res.json()
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.retainerPackages(variables.leadId) })
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.detail(variables.leadId) })
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.stageTransitions(variables.leadId) })
      // Also invalidate the main leads list so the pipeline/kanban view refreshes
      queryClient.invalidateQueries({ queryKey: ['leads'] })

      if (data.matterId && data.matterNumber) {
        toast.success(`Payment recorded — Matter ${data.matterNumber} created`)
      } else if (data.matterId) {
        toast.success('Payment recorded — Lead converted to matter')
      } else if (data.paymentStatus === 'partial') {
        const balance = `$${(data.balance / 100).toFixed(2)}`
        toast.success(`Payment recorded — Balance remaining: ${balance}`)
      } else {
        toast.success('Payment recorded')
      }
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

// ─── Custom Error for Conversion (carries gate results) ─────────────────────

class ConversionError extends Error {
  gateResults: {
    canConvert: boolean
    blockedReasons: string[]
    gateResults: Array<{ gate: string; label: string; passed: boolean; reason?: string; enabled: boolean }>
  } | undefined

  constructor(
    message: string,
    gateResults?: ConversionError['gateResults']
  ) {
    super(message)
    this.name = 'ConversionError'
    this.gateResults = gateResults
  }
}
