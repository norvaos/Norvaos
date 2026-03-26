import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const irccSubmissionKeys = {
  all: ['ircc_submission_checklist'] as const,
  list: (matterId: string) => [...irccSubmissionKeys.all, matterId] as const,
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SubmissionChecklistItem {
  id: string
  item_key: string
  label: string
  category: string
  sort_order: number
  is_required: boolean
  status: 'pending' | 'in_progress' | 'completed' | 'not_applicable' | 'blocked'
  completed_at: string | null
  completed_by: string | null
  notes: string | null
  ircc_ref: string | null
}

// ─── Fetch Checklist ─────────────────────────────────────────────────────────

export function useSubmissionChecklist(matterId: string) {
  return useQuery({
    queryKey: irccSubmissionKeys.list(matterId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('ircc_submission_checklist')
        .select('id, item_key, label, category, sort_order, is_required, status, completed_at, completed_by, notes, ircc_ref')
        .eq('matter_id', matterId)
        .order('sort_order', { ascending: true })

      if (error) throw error
      return (data ?? []) as SubmissionChecklistItem[]
    },
    enabled: !!matterId,
  })
}

// ─── Initialize Checklist ────────────────────────────────────────────────────

export function useInitSubmissionChecklist() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      matterId: string
      tenantId: string
      items: {
        item_key: string
        label: string
        category: string
        sort_order: number
        is_required: boolean
      }[]
    }) => {
      const supabase = createClient()
      const rows = params.items.map((item) => ({
        ...item,
        tenant_id: params.tenantId,
        matter_id: params.matterId,
        status: 'pending',
      }))

      const { error } = await supabase
        .from('ircc_submission_checklist')
        .upsert(rows, { onConflict: 'matter_id,item_key', ignoreDuplicates: true })

      if (error) throw error
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: irccSubmissionKeys.list(vars.matterId) })
    },
  })
}

// ─── Update Checklist Item ───────────────────────────────────────────────────

export function useUpdateSubmissionItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      itemId: string
      matterId: string
      status?: string
      notes?: string
      ircc_ref?: string
    }) => {
      const supabase = createClient()
      const updates: Record<string, unknown> = {}

      if (params.status !== undefined) {
        updates.status = params.status
        if (params.status === 'completed') {
          updates.completed_at = new Date().toISOString()
        } else {
          updates.completed_at = null
          updates.completed_by = null
        }
      }
      if (params.notes !== undefined) updates.notes = params.notes
      if (params.ircc_ref !== undefined) updates.ircc_ref = params.ircc_ref

      const { error } = await supabase
        .from('ircc_submission_checklist')
        .update(updates)
        .eq('id', params.itemId)

      if (error) throw error
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: irccSubmissionKeys.list(vars.matterId) })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

// ─── Toggle Checklist Item ───────────────────────────────────────────────────

export function useToggleSubmissionItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      itemId: string
      matterId: string
      currentStatus: string
    }) => {
      const supabase = createClient()
      const newStatus = params.currentStatus === 'completed' ? 'pending' : 'completed'
      const updates: Record<string, unknown> = {
        status: newStatus,
        completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
      }

      const { error } = await supabase
        .from('ircc_submission_checklist')
        .update(updates)
        .eq('id', params.itemId)

      if (error) throw error
      return newStatus
    },
    onSuccess: (newStatus, vars) => {
      qc.invalidateQueries({ queryKey: irccSubmissionKeys.list(vars.matterId) })
      toast.success(newStatus === 'completed' ? 'Marked complete' : 'Marked pending')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}
