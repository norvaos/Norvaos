import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { logAudit } from '@/lib/queries/audit-logs'
import { toast } from 'sonner'
import { IMPORT_REVERTED_STATUS } from '@/lib/utils/matter-status'
import { broadcastMutation } from '@/lib/hooks/use-cross-tab-sync'

type Matter = Database['public']['Tables']['matters']['Row']
type MatterInsert = Database['public']['Tables']['matters']['Insert']
type MatterUpdate = Database['public']['Tables']['matters']['Update']

// ─── Lean Column Fragment (19 cols  -  max 20) ────────────────────────────────
// Only the columns needed by the matter list table + kanban card.
// Dropped: tenant_id, originating_lawyer_id, date_closed, estimated_value,
//          total_billed, total_paid, updated_at
export const MATTER_LIST_COLUMNS =
  'id, title, matter_number, status, priority, practice_area_id, matter_type_id, matter_type, pipeline_id, stage_id, stage_entered_at, responsible_lawyer_id, date_opened, risk_level, intake_status, created_at, case_type_id, billing_type, trust_balance' as const

// ─── Detail Column Fragment (20 cols  -  max 20) ─────────────────────────────
// Only the columns needed by the matter detail view.
// Adds total_billed, total_paid, readiness_score/breakdown over list columns.
// Dropped: created_at, intake_status (both available from list-query cache).
export const MATTER_DETAIL_COLUMNS =
  'id, title, matter_number, status, priority, risk_level, practice_area_id, matter_type_id, matter_type, pipeline_id, stage_id, stage_entered_at, responsible_lawyer_id, billing_type, date_opened, case_type_id, total_billed, total_paid, readiness_score, readiness_breakdown' as const

interface MatterListParams {
  tenantId: string
  page?: number
  pageSize?: number
  search?: string
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
  practiceAreaId?: string
  status?: string
  priority?: string
  responsibleLawyerId?: string
  pipelineId?: string
  stageId?: string
  riskLevel?: string
}

export const matterKeys = {
  all: ['matters'] as const,
  lists: () => [...matterKeys.all, 'list'] as const,
  list: (params: MatterListParams) => [...matterKeys.lists(), params] as const,
  details: () => [...matterKeys.all, 'detail'] as const,
  detail: (id: string) => [...matterKeys.details(), id] as const,
}

export function useMatters(params: MatterListParams) {
  const {
    tenantId, page = 1, pageSize = 25, search, sortBy = 'created_at',
    sortDirection = 'desc', practiceAreaId, status, priority, responsibleLawyerId, pipelineId, stageId, riskLevel,
  } = params

  return useQuery({
    queryKey: matterKeys.list(params),
    queryFn: async () => {
      const supabase = createClient()
      const from = (page - 1) * pageSize
      const to = from + pageSize - 1

      let query = supabase
        .from('matters')
        .select(MATTER_LIST_COLUMNS, { count: 'exact' })
        .eq('tenant_id', tenantId)
        .neq('status', 'archived')
        .neq('status', IMPORT_REVERTED_STATUS)

      if (search) {
        query = query.or(`title.ilike.%${search}%,matter_number.ilike.%${search}%`)
      }

      if (practiceAreaId) query = query.eq('practice_area_id', practiceAreaId)
      if (status) query = query.eq('status', status)
      if (priority) query = query.eq('priority', priority)
      if (responsibleLawyerId) query = query.eq('responsible_lawyer_id', responsibleLawyerId)
      if (pipelineId) query = query.eq('pipeline_id', pipelineId)
      if (stageId) query = query.eq('stage_id', stageId)
      if (riskLevel) query = query.eq('risk_level', riskLevel)

      query = query.order(sortBy, { ascending: sortDirection === 'asc' }).range(from, to)

      const { data, error, count } = await query

      if (error) throw error

      return {
        matters: data as Matter[],
        totalCount: count ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      }
    },
    enabled: !!tenantId,
  })
}

/** Standalone fetch for a single matter  -  can be used in queryFn or prefetch. */
export async function fetchMatterDetail(id: string): Promise<Matter> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('matters')
    .select(MATTER_DETAIL_COLUMNS)
    .eq('id', id)
    .single()
  if (error) throw error
  return data as Matter
}

/** Fetch enforcement_enabled flag for a matter type. */
export async function fetchMatterTypeEnforcement(
  matterTypeId: string
): Promise<{ id: string; enforcement_enabled: boolean }> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('matter_types')
    .select('id, enforcement_enabled')
    .eq('id', matterTypeId)
    .single()
  if (error) throw error
  return data as { id: string; enforcement_enabled: boolean }
}

export function useMatter(id: string) {
  return useQuery({
    queryKey: matterKeys.detail(id),
    queryFn: () => fetchMatterDetail(id),
    enabled: !!id,
    staleTime: 1000 * 60 * 2, // 2 min  -  cached data shows instantly (e.g. header context) while revalidating
  })
}

/**
 * Create a new matter via the server-side API route.
 * Automatically activates workflow kit (pipeline + tasks) or immigration kit
 * (checklist + stages) based on matter_type_id / case_type_id.
 */
export function useCreateMatter() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (matter: MatterInsert & {
      contact_id?: string | null
      // initial_matter_stage_id is a creation-time param: seeds matter_stage_state
      // but is NOT stored on matters itself. The API reads it from the body.
      initial_matter_stage_id?: string | null
      // Fee snapshot fields  -  handled by the API route, not stored via MatterInsert type yet
      applicant_location?: string | null
      client_province?: string | null
      tax_rate?: number | null
      tax_label?: string | null
    }) => {
      const response = await fetch('/api/matters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(matter),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create matter')
      }

      return result.matter as Matter
    },
    onSuccess: (matter) => {
      queryClient.invalidateQueries({ queryKey: matterKeys.lists() })
      queryClient.invalidateQueries({ queryKey: ['matter_stage_state'] })
      queryClient.invalidateQueries({ queryKey: ['immigration'] })
      toast.success('Matter created successfully')

      // Broadcast to other tabs
      broadcastMutation('matter:created', { matterId: matter.id })

      logAudit({
        tenantId: matter.tenant_id,
        userId: matter.created_by ?? 'system',
        entityType: 'matter',
        entityId: matter.id,
        action: 'created',
        changes: { title: matter.title, status: matter.status, practice_area_id: matter.practice_area_id },
      })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create matter')
    },
  })
}

export function useUpdateMatter() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: MatterUpdate & { id: string }) => {
      const supabase = createClient()

      // Fetch current state before update for diff comparison
      const { data: before } = await supabase
        .from('matters')
        .select()
        .eq('id', id)
        .single()

      const { data, error } = await supabase
        .from('matters')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return { matter: data as Matter, before }
    },
    // ── Optimistic UI: update cache instantly before server responds ──
    onMutate: async ({ id, ...updates }) => {
      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: matterKeys.detail(id) })
      await queryClient.cancelQueries({ queryKey: matterKeys.lists() })

      // Snapshot previous detail value for rollback
      const previousDetail = queryClient.getQueryData<Matter>(matterKeys.detail(id))

      // Optimistically update the detail cache
      if (previousDetail) {
        queryClient.setQueryData<Matter>(matterKeys.detail(id), {
          ...previousDetail,
          ...updates,
          updated_at: new Date().toISOString(),
        } as Matter)
      }

      // Optimistically update the dashboard core cache
      const dashboardKey = ['matter-dashboard', 'core', id]
      const previousDashboard = queryClient.getQueryData(dashboardKey)
      if (previousDashboard) {
        queryClient.setQueryData(dashboardKey, { ...previousDashboard as Record<string, unknown>, ...updates })
      }

      return { previousDetail, previousDashboard }
    },
    onSuccess: ({ matter: data, before }) => {
      // Replace optimistic data with real server data
      queryClient.setQueryData(matterKeys.detail(data.id), data)
      queryClient.invalidateQueries({ queryKey: matterKeys.lists() })
      toast.success('Matter updated successfully')

      // Broadcast to other tabs
      broadcastMutation('matter:updated', { matterId: data.id })

      // Only log fields that actually changed
      if (before) {
        const changes: Record<string, { from: unknown; to: unknown }> = {}
        for (const key of Object.keys(before) as (keyof typeof before)[]) {
          const oldVal = before[key]
          const newVal = data[key as keyof typeof data]
          if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
            changes[key] = { from: oldVal, to: newVal }
          }
        }
        // Only audit if something actually changed
        if (Object.keys(changes).length > 0) {
          logAudit({
            tenantId: data.tenant_id,
            userId: data.created_by ?? 'system',
            entityType: 'matter',
            entityId: data.id,
            action: 'updated',
            changes,
          })
        }
      }
    },
    onError: (_error, variables, context) => {
      // Rollback to previous data on error
      if (context?.previousDetail) {
        queryClient.setQueryData(matterKeys.detail(variables.id), context.previousDetail)
      }
      if (context?.previousDashboard) {
        queryClient.setQueryData(['matter-dashboard', 'core', variables.id], context.previousDashboard)
      }
      toast.error('Failed to update matter')
    },
  })
}

export function useUpdateMatterStage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, stageId }: { id: string; stageId: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matters')
        .update({ stage_id: stageId })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as Matter
    },
    // ── Optimistic UI: update stage instantly ──
    onMutate: async ({ id, stageId }) => {
      await queryClient.cancelQueries({ queryKey: matterKeys.detail(id) })

      const previousDetail = queryClient.getQueryData<Matter>(matterKeys.detail(id))
      if (previousDetail) {
        queryClient.setQueryData<Matter>(matterKeys.detail(id), {
          ...previousDetail,
          stage_id: stageId,
          stage_entered_at: new Date().toISOString(),
        } as Matter)
      }
      return { previousDetail }
    },
    onSuccess: (data) => {
      queryClient.setQueryData(matterKeys.detail(data.id), data)
      queryClient.invalidateQueries({ queryKey: matterKeys.lists() })
      toast.success('Stage updated')

      // Broadcast to other tabs
      broadcastMutation('matter:stage-advanced', { matterId: data.id })

      logAudit({
        tenantId: data.tenant_id,
        userId: data.created_by ?? 'system',
        entityType: 'matter',
        entityId: data.id,
        action: 'stage_changed',
        changes: { stage_id: data.stage_id },
        metadata: { title: data.title },
      })
    },
    onError: (_error, variables, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(matterKeys.detail(variables.id), context.previousDetail)
      }
      toast.error('Failed to update stage')
    },
  })
}

// ─── Sovereign Identity Preview ──────────────────────────────────────────────
// Calls fn_preview_matter_number via RPC to show a non-incrementing preview
// of the next matter number while the wizard is open.

export function usePreviewMatterNumber(
  tenantId: string,
  clientLast: string | null,
  typeCode: string | null,
) {
  return useQuery({
    queryKey: ['matter-number-preview', tenantId, clientLast, typeCode],
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('fn_preview_matter_number', {
        p_tenant_id: tenantId,
        p_client_last: clientLast,
        p_type_code: typeCode,
      })
      if (error) throw error
      return data as string
    },
    enabled: !!tenantId,
    staleTime: 1000 * 30,
  })
}
