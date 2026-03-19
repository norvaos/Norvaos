import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { logAudit } from '@/lib/queries/audit-logs'
import { toast } from 'sonner'

type Lead = Database['public']['Tables']['leads']['Row']
type LeadInsert = Database['public']['Tables']['leads']['Insert']
type LeadUpdate = Database['public']['Tables']['leads']['Update']

interface LeadListParams {
  tenantId: string
  page?: number
  pageSize?: number
  pipelineId?: string
  stageId?: string
  status?: string
  assignedTo?: string
  temperature?: string
  practiceAreaId?: string
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
}

export const leadKeys = {
  all: ['leads'] as const,
  lists: () => [...leadKeys.all, 'list'] as const,
  list: (params: LeadListParams) => [...leadKeys.lists(), params] as const,
  details: () => [...leadKeys.all, 'detail'] as const,
  detail: (id: string) => [...leadKeys.details(), id] as const,
  byPipeline: (pipelineId: string) => [...leadKeys.all, 'pipeline', pipelineId] as const,
}

export function useLeads(params: LeadListParams) {
  const {
    tenantId, page = 1, pageSize = 50, pipelineId, stageId,
    status = 'open', assignedTo, temperature, practiceAreaId,
    sortBy = 'created_at', sortDirection = 'desc',
  } = params

  return useQuery({
    queryKey: leadKeys.list(params),
    queryFn: async () => {
      const supabase = createClient()
      const from = (page - 1) * pageSize
      const to = from + pageSize - 1

      let query = supabase
        .from('leads')
        .select('id, tenant_id, contact_id, pipeline_id, stage_id, assigned_to, practice_area_id, status, temperature, source, estimated_value, next_follow_up, notes, stage_entered_at, created_at, updated_at', { count: 'exact' })
        .eq('tenant_id', tenantId)

      if (pipelineId) query = query.eq('pipeline_id', pipelineId)
      if (stageId) query = query.eq('stage_id', stageId)
      if (status) query = query.eq('status', status)
      if (assignedTo) query = query.eq('assigned_to', assignedTo)
      if (temperature) query = query.eq('temperature', temperature)
      if (practiceAreaId) query = query.eq('practice_area_id', practiceAreaId)

      query = query.order(sortBy, { ascending: sortDirection === 'asc' }).range(from, to)

      const { data, error, count } = await query

      if (error) throw error

      return {
        leads: data as Lead[],
        totalCount: count ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      }
    },
    enabled: !!tenantId,
  })
}

export function useLead(id: string) {
  return useQuery({
    queryKey: leadKeys.detail(id),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      return data as Lead
    },
    enabled: !!id,
  })
}

export function useCreateLead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (lead: LeadInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('leads')
        .insert(lead)
        .select()
        .single()

      if (error) throw error
      return data as Lead
    },
    onSuccess: (lead) => {
      queryClient.invalidateQueries({ queryKey: leadKeys.lists() })
      toast.success('Lead created successfully')

      logAudit({
        tenantId: lead.tenant_id,
        userId: lead.created_by ?? 'system',
        entityType: 'lead',
        entityId: lead.id,
        action: 'created',
        changes: { contact_id: lead.contact_id, temperature: lead.temperature, status: lead.status },
      })

      // Fire conflict scan in the background — updates contact.conflict_status
      // and lead.conflict_status automatically
      if (lead.contact_id) {
        fetch(`/api/contacts/${lead.contact_id}/conflict-scan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ triggerType: 'auto_create', leadId: lead.id }),
        }).catch(() => {})
      }
    },
    onError: () => {
      toast.error('Failed to create lead')
    },
  })
}

export function useUpdateLead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: LeadUpdate & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('leads')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as Lead
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: leadKeys.lists() })
      queryClient.setQueryData(leadKeys.detail(data.id), data)
      toast.success('Lead updated successfully')

      logAudit({
        tenantId: data.tenant_id,
        userId: data.created_by ?? 'system',
        entityType: 'lead',
        entityId: data.id,
        action: 'updated',
        changes: { contact_id: data.contact_id, temperature: data.temperature, status: data.status },
      })
    },
    onError: () => {
      toast.error('Failed to update lead')
    },
  })
}

export function useUpdateLeadStage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, stageId }: { id: string; stageId: string; userId?: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('leads')
        .update({ stage_id: stageId, stage_entered_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as Lead
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: leadKeys.lists() })
      queryClient.setQueryData(leadKeys.detail(data.id), data)

      logAudit({
        tenantId: data.tenant_id,
        userId: variables.userId ?? data.created_by ?? 'system',
        entityType: 'lead',
        entityId: data.id,
        action: 'stage_changed',
        changes: { stage_id: data.stage_id, stage_name: data.stage_id },
        metadata: { contact_id: data.contact_id },
      })
    },
    onError: () => {
      toast.error('Failed to move lead')
    },
  })
}

/**
 * Convert a lead to a matter.
 * After marking the lead as converted, triggers kit activation for the linked matter
 * by calling the matter's kit activation endpoint (if the matter has a matter_type_id or case_type_id).
 */
export function useConvertLead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      leadId,
      matterId,
    }: {
      leadId: string
      matterId: string
    }) => {
      const supabase = createClient()

      // 1. Mark lead as converted
      const { data: lead, error } = await supabase
        .from('leads')
        .update({
          status: 'converted',
          converted_matter_id: matterId,
          converted_at: new Date().toISOString(),
        })
        .eq('id', leadId)
        .select()
        .single()

      if (error) throw error

      // 2. Trigger kit activation for the linked matter via API
      // The API route handles workflow/immigration kit activation server-side
      try {
        const { data: matter } = await supabase
          .from('matters')
          .select('id, matter_type_id, case_type_id')
          .eq('id', matterId)
          .single()

        if (matter && (matter.matter_type_id || matter.case_type_id)) {
          await fetch(`/api/matters/${matterId}/activate-kit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              matterTypeId: matter.matter_type_id,
              caseTypeId: matter.case_type_id,
            }),
          })
        }
      } catch {
        // Kit activation failure is non-fatal — lead is already converted
        console.warn('Kit activation after lead conversion failed (non-fatal)')
      }

      return lead as Lead
    },
    onSuccess: (lead) => {
      queryClient.invalidateQueries({ queryKey: leadKeys.lists() })
      queryClient.invalidateQueries({ queryKey: ['matters'] })
      queryClient.invalidateQueries({ queryKey: ['matter_stage_state'] })
      queryClient.invalidateQueries({ queryKey: ['immigration'] })
      toast.success('Lead converted to matter')

      logAudit({
        tenantId: lead.tenant_id,
        userId: lead.created_by ?? 'system',
        entityType: 'lead',
        entityId: lead.id,
        action: 'converted',
        changes: { status: 'converted', converted_matter_id: lead.converted_matter_id },
        metadata: { contact_id: lead.contact_id },
      })
    },
    onError: () => {
      toast.error('Failed to convert lead')
    },
  })
}

export function useDeleteLead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('leads')
        .update({ status: 'lost' })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as Lead
    },
    onSuccess: (lead) => {
      queryClient.invalidateQueries({ queryKey: leadKeys.lists() })
      toast.success('Lead archived successfully')

      logAudit({
        tenantId: lead.tenant_id,
        userId: lead.created_by ?? 'system',
        entityType: 'lead',
        entityId: lead.id,
        action: 'archived',
        metadata: { contact_id: lead.contact_id },
      })
    },
    onError: () => {
      toast.error('Failed to archive lead')
    },
  })
}
