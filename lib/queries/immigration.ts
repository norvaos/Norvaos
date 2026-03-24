import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { toast } from 'sonner'

type ImmigrationCaseType = Database['public']['Tables']['immigration_case_types']['Row']
type CaseStageDefinition = Database['public']['Tables']['case_stage_definitions']['Row']
type ChecklistTemplate = Database['public']['Tables']['checklist_templates']['Row']
type MatterImmigration = Database['public']['Tables']['matter_immigration']['Row']
type MatterImmigrationInsert = Database['public']['Tables']['matter_immigration']['Insert']
type MatterImmigrationUpdate = Database['public']['Tables']['matter_immigration']['Update']
type MatterChecklistItem = Database['public']['Tables']['matter_checklist_items']['Row']
type MatterChecklistItemInsert = Database['public']['Tables']['matter_checklist_items']['Insert']
type MatterDeadline = Database['public']['Tables']['matter_deadlines']['Row']
type MatterDeadlineInsert = Database['public']['Tables']['matter_deadlines']['Insert']
type AutomationRule = Database['public']['Tables']['automation_rules']['Row']

export const immigrationKeys = {
  all: ['immigration'] as const,
  caseTypes: (tenantId: string) => [...immigrationKeys.all, 'case-types', tenantId] as const,
  stages: (caseTypeId: string) => [...immigrationKeys.all, 'stages', caseTypeId] as const,
  checklistTemplates: (caseTypeId: string) => [...immigrationKeys.all, 'checklist-templates', caseTypeId] as const,
  matterImmigration: (matterId: string) => [...immigrationKeys.all, 'matter', matterId] as const,
  checklistItems: (matterId: string) => [...immigrationKeys.all, 'checklist', matterId] as const,
  deadlines: (matterId: string) => [...immigrationKeys.all, 'deadlines', matterId] as const,
  allDeadlines: (tenantId: string) => [...immigrationKeys.all, 'all-deadlines', tenantId] as const,
  automationRules: (tenantId: string) => [...immigrationKeys.all, 'automations', tenantId] as const,
  stageStats: (tenantId: string) => [...immigrationKeys.all, 'stage-stats', tenantId] as const,
  riskItems: (tenantId: string) => [...immigrationKeys.all, 'risk-items', tenantId] as const,
  staffWorkload: (tenantId: string) => [...immigrationKeys.all, 'staff-workload', tenantId] as const,
}

// ─── 1. useCaseTypes ────────────────────────────────────────────────────────────

export function useCaseTypes(tenantId: string) {
  return useQuery({
    queryKey: immigrationKeys.caseTypes(tenantId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('immigration_case_types')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (error) throw error
      return data as ImmigrationCaseType[]
    },
    enabled: !!tenantId,
  })
}

// ─── 2. useCaseStages ───────────────────────────────────────────────────────────

export function useCaseStages(caseTypeId: string) {
  return useQuery({
    queryKey: immigrationKeys.stages(caseTypeId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('case_stage_definitions')
        .select('*')
        .eq('case_type_id', caseTypeId)
        .order('sort_order', { ascending: true })

      if (error) throw error
      return data as CaseStageDefinition[]
    },
    enabled: !!caseTypeId,
  })
}

// ─── 3. useChecklistTemplates ───────────────────────────────────────────────────

export function useChecklistTemplates(caseTypeId: string) {
  return useQuery({
    queryKey: immigrationKeys.checklistTemplates(caseTypeId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('checklist_templates')
        .select('*')
        .eq('case_type_id', caseTypeId)
        .order('sort_order', { ascending: true })

      if (error) throw error
      return data as ChecklistTemplate[]
    },
    enabled: !!caseTypeId,
  })
}

// ─── 4. useMatterImmigration ────────────────────────────────────────────────────

export function useMatterImmigration(matterId: string) {
  return useQuery({
    queryKey: immigrationKeys.matterImmigration(matterId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_immigration')
        .select('*')
        .eq('matter_id', matterId)
        .maybeSingle()

      if (error) throw error
      return data as MatterImmigration | null
    },
    enabled: !!matterId,
  })
}

// ─── 5. useCreateMatterImmigration ──────────────────────────────────────────────

export function useCreateMatterImmigration() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: MatterImmigrationInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_immigration')
        .insert(input)
        .select()
        .single()

      if (error) throw error
      return data as MatterImmigration
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: immigrationKeys.matterImmigration(data.matter_id) })
      toast.success('Immigration data created')
    },
    onError: () => {
      toast.error('Failed to create immigration data')
    },
  })
}

// ─── 6. useUpdateMatterImmigration ──────────────────────────────────────────────

export function useUpdateMatterImmigration() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ matterId, ...updates }: MatterImmigrationUpdate & { matterId: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_immigration')
        .update(updates)
        .eq('matter_id', matterId)
        .select()
        .single()

      if (error) throw error
      return data as MatterImmigration
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: immigrationKeys.matterImmigration(data.matter_id) })
      toast.success('Immigration data updated')
    },
    onError: () => {
      toast.error('Failed to update immigration data')
    },
  })
}

// ─── 6b. usePopulateChecklist ────────────────────────────────────────────────────
// Calls the DB function populate_checklist_from_stream() which copies
// requirement_templates → matter_checklist_items for the given stream.
// Idempotent: skips documents that already exist.

export function usePopulateChecklist() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      matterId,
      tenantId,
      programCategory,
      jurisdiction = 'CA',
    }: {
      matterId: string
      tenantId: string
      programCategory: string
      jurisdiction?: string
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc(
        'populate_checklist_from_stream',
        {
          p_matter_id: matterId,
          p_tenant_id: tenantId,
          p_program_cat: programCategory,
          p_jurisdiction: jurisdiction,
        },
      )

      if (error) throw error
      return data as number // rows inserted
    },
    onSuccess: (_count, vars) => {
      queryClient.invalidateQueries({
        queryKey: immigrationKeys.checklistItems(vars.matterId),
      })
    },
    onError: () => {
      toast.error('Failed to populate document checklist')
    },
  })
}

// ─── 7. useMatterChecklistItems ─────────────────────────────────────────────────

export function useMatterChecklistItems(matterId: string) {
  return useQuery({
    queryKey: immigrationKeys.checklistItems(matterId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_checklist_items')
        .select('*')
        .eq('matter_id', matterId)
        .order('sort_order', { ascending: true })

      if (error) throw error
      return data as MatterChecklistItem[]
    },
    enabled: !!matterId,
  })
}

// ─── 8. useCreateChecklistItem ──────────────────────────────────────────────────

export function useCreateChecklistItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (item: MatterChecklistItemInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_checklist_items')
        .insert(item)
        .select()
        .single()

      if (error) throw error
      return data as MatterChecklistItem
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: immigrationKeys.checklistItems(data.matter_id) })
    },
    onError: () => {
      toast.error('Failed to create checklist item')
    },
  })
}

// ─── 9. useUpdateChecklistItem ──────────────────────────────────────────────────

export function useUpdateChecklistItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      tenantId,
      userId,
      ...updates
    }: Database['public']['Tables']['matter_checklist_items']['Update'] & {
      id: string
      tenantId?: string
      userId?: string
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_checklist_items')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      const item = data as MatterChecklistItem

      // Log activity for status changes
      if (updates.status && tenantId && userId) {
        const statusLabel = updates.status === 'approved'
          ? 'approved'
          : updates.status === 'not_applicable'
            ? 'marked as N/A'
            : updates.status === 'rejected'
              ? 'rejected'
              : `updated to ${updates.status}`

        await supabase.from('activities').insert({
          tenant_id: tenantId,
          matter_id: item.matter_id,
          activity_type: 'checklist_updated',
          title: `Checklist item "${item.document_name}" ${statusLabel}`,
          description: `Document checklist status changed to ${updates.status}`,
          entity_type: 'matter',
          entity_id: item.matter_id,
          user_id: userId,
          metadata: {
            checklist_item_id: item.id,
            document_name: item.document_name,
            new_status: updates.status,
            category: item.category,
          } as any,
        })
      }

      return item
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: immigrationKeys.checklistItems(data.matter_id) })
      queryClient.invalidateQueries({ queryKey: ['activities'] })
      toast.success('Checklist item updated')
    },
    onError: () => {
      toast.error('Failed to update checklist item')
    },
  })
}

// ─── 10. useInitializeChecklist ─────────────────────────────────────────────────

export function useInitializeChecklist() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ tenantId, matterId, caseTypeId }: { tenantId: string; matterId: string; caseTypeId: string }) => {
      const supabase = createClient()

      // Fetch all checklist templates for this case type
      const { data: templates, error: templatesError } = await supabase
        .from('checklist_templates')
        .select('*')
        .eq('case_type_id', caseTypeId)
        .order('sort_order', { ascending: true })

      if (templatesError) throw templatesError
      if (!templates || templates.length === 0) return []

      // Bulk-insert as matter_checklist_items
      const items: MatterChecklistItemInsert[] = templates.map((t) => ({
        tenant_id: tenantId,
        matter_id: matterId,
        checklist_template_id: t.id,
        document_name: t.document_name,
        description: t.description,
        category: t.category,
        is_required: t.is_required,
        sort_order: t.sort_order,
        status: 'missing',
      }))

      const { data, error } = await supabase
        .from('matter_checklist_items')
        .insert(items)
        .select()

      if (error) throw error
      return data as MatterChecklistItem[]
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: immigrationKeys.checklistItems(variables.matterId) })
      toast.success('Document checklist initialized')
    },
    onError: () => {
      toast.error('Failed to initialize checklist')
    },
  })
}

// ─── 11. useMatterDeadlines ─────────────────────────────────────────────────────

export function useMatterDeadlines(matterId: string) {
  return useQuery({
    queryKey: immigrationKeys.deadlines(matterId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_deadlines')
        .select('*')
        .eq('matter_id', matterId)
        .order('due_date', { ascending: true })

      if (error) throw error
      return data as MatterDeadline[]
    },
    enabled: !!matterId,
  })
}

// ─── 12. useCreateDeadline ──────────────────────────────────────────────────────

export function useCreateDeadline() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (deadline: MatterDeadlineInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_deadlines')
        .insert(deadline)
        .select()
        .single()

      if (error) throw error
      return data as MatterDeadline
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: immigrationKeys.deadlines(data.matter_id) })
      toast.success('Deadline added')
    },
    onError: () => {
      toast.error('Failed to add deadline')
    },
  })
}

// ─── 13. useUpdateDeadline ──────────────────────────────────────────────────────

export function useUpdateDeadline() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: Database['public']['Tables']['matter_deadlines']['Update'] & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_deadlines')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as MatterDeadline
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: immigrationKeys.deadlines(data.matter_id) })
    },
    onError: () => {
      toast.error('Failed to update deadline')
    },
  })
}

// ─── 14. useCompleteDeadline ────────────────────────────────────────────────────

export function useCompleteDeadline() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, userId }: { id: string; userId: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_deadlines')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          completed_by: userId,
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as MatterDeadline
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: immigrationKeys.deadlines(data.matter_id) })
      toast.success('Deadline completed')
    },
    onError: () => {
      toast.error('Failed to complete deadline')
    },
  })
}

// ─── 15. useAllUpcomingDeadlines ────────────────────────────────────────────────

export function useAllUpcomingDeadlines(tenantId: string) {
  return useQuery({
    queryKey: immigrationKeys.allDeadlines(tenantId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_deadlines')
        .select('*, matters!inner(title)')
        .eq('tenant_id', tenantId)
        .neq('status', 'completed')
        .order('due_date', { ascending: true })
        .limit(50)

      if (error) throw error

      return (data as unknown as (MatterDeadline & { matters: { title: string } })[]).map((d) => ({
        ...d,
        matter_title: d.matters.title,
      }))
    },
    enabled: !!tenantId,
  })
}

// ─── 16. useActiveFilesByStage ──────────────────────────────────────────────────

export function useActiveFilesByStage(tenantId: string) {
  return useQuery({
    queryKey: immigrationKeys.stageStats(tenantId),
    queryFn: async () => {
      const supabase = createClient()

      // Fetch all matter_immigration rows with their current stages for active matters
      const { data: matterImm, error: matterImmError } = await supabase
        .from('matter_immigration')
        .select('current_stage_id, matters!inner(status)')
        .eq('tenant_id', tenantId)
        .not('current_stage_id', 'is', null)

      if (matterImmError) throw matterImmError

      // Filter to active matters only
      const activeMatterImm = (matterImm as unknown as { current_stage_id: string | null; matters: { status: string } }[])
        .filter((m) => m.matters.status === 'active' && m.current_stage_id)

      // Count per stage
      const stageCounts: Record<string, number> = {}
      for (const m of activeMatterImm) {
        const stageId = m.current_stage_id!
        stageCounts[stageId] = (stageCounts[stageId] || 0) + 1
      }

      // Fetch all stage definitions for the tenant
      const stageIds = Object.keys(stageCounts)
      if (stageIds.length === 0) return []

      const { data: stages, error: stagesError } = await supabase
        .from('case_stage_definitions')
        .select('id, name, color')
        .in('id', stageIds)

      if (stagesError) throw stagesError

      return (stages ?? []).map((s) => ({
        stage_name: s.name,
        stage_color: s.color,
        count: stageCounts[s.id] || 0,
      }))
    },
    enabled: !!tenantId,
  })
}

// ─── 17. useFilesAwaitingDocuments ──────────────────────────────────────────────

export function useFilesAwaitingDocuments(tenantId: string) {
  return useQuery({
    queryKey: [...immigrationKeys.all, 'awaiting-documents', tenantId] as const,
    queryFn: async () => {
      const supabase = createClient()

      // Get distinct matter_ids that have at least one checklist item with status 'missing' or 'requested'
      const { data, error } = await supabase
        .from('matter_checklist_items')
        .select('matter_id')
        .eq('tenant_id', tenantId)
        .in('status', ['missing', 'requested'])

      if (error) throw error

      // Count unique matter_ids
      const uniqueMatterIds = new Set((data ?? []).map((d) => d.matter_id))
      return uniqueMatterIds.size
    },
    enabled: !!tenantId,
  })
}

// ─── 18. useFilesWaitingOnIRCC ──────────────────────────────────────────────────

export function useFilesWaitingOnIRCC(tenantId: string) {
  return useQuery({
    queryKey: [...immigrationKeys.all, 'waiting-ircc', tenantId] as const,
    queryFn: async () => {
      const supabase = createClient()

      // Find active matters where stage slug contains 'awaiting' or 'filed'
      const { data: matterImm, error: matterImmError } = await supabase
        .from('matter_immigration')
        .select('current_stage_id, matters!inner(status)')
        .eq('tenant_id', tenantId)
        .not('current_stage_id', 'is', null)

      if (matterImmError) throw matterImmError

      const activeMatterImm = (matterImm as unknown as { current_stage_id: string | null; matters: { status: string } }[])
        .filter((m) => m.matters.status === 'active' && m.current_stage_id)

      if (activeMatterImm.length === 0) return 0

      const stageIds = [...new Set(activeMatterImm.map((m) => m.current_stage_id!))]

      const { data: stages, error: stagesError } = await supabase
        .from('case_stage_definitions')
        .select('id, slug')
        .in('id', stageIds)

      if (stagesError) throw stagesError

      const matchingStageIds = new Set(
        (stages ?? [])
          .filter((s) => s.slug.includes('awaiting') || s.slug.includes('filed'))
          .map((s) => s.id)
      )

      return activeMatterImm.filter((m) => matchingStageIds.has(m.current_stage_id!)).length
    },
    enabled: !!tenantId,
  })
}

// ─── 19. useRetainerConversionRate ──────────────────────────────────────────────

export function useRetainerConversionRate(tenantId: string) {
  return useQuery({
    queryKey: [...immigrationKeys.all, 'retainer-conversion', tenantId] as const,
    queryFn: async () => {
      const supabase = createClient()

      // Get the first day of the current month
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      // Fetch all matter_immigration rows created this month
      const { data, error } = await supabase
        .from('matter_immigration')
        .select('retainer_signed')
        .eq('tenant_id', tenantId)
        .gte('created_at', startOfMonth)

      if (error) throw error
      if (!data || data.length === 0) return { rate: 0, signed: 0, total: 0 }

      const signedCount = data.filter((d) => d.retainer_signed).length
      return {
        rate: Math.round((signedCount / data.length) * 100),
        signed: signedCount,
        total: data.length,
      }
    },
    enabled: !!tenantId,
  })
}

// ─── 20. useOverdueRiskItems ────────────────────────────────────────────────────

export function useOverdueRiskItems(tenantId: string) {
  return useQuery({
    queryKey: immigrationKeys.riskItems(tenantId),
    queryFn: async () => {
      const supabase = createClient()
      const today = new Date().toISOString().split('T')[0]

      const { count, error } = await supabase
        .from('matter_deadlines')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .neq('status', 'completed')
        .lt('due_date', today)

      if (error) throw error
      return count ?? 0
    },
    enabled: !!tenantId,
  })
}

// ─── 21. useStaffWorkload ───────────────────────────────────────────────────────

export function useStaffWorkload(tenantId: string) {
  return useQuery({
    queryKey: immigrationKeys.staffWorkload(tenantId),
    queryFn: async () => {
      const supabase = createClient()
      const today = new Date().toISOString().split('T')[0]

      // Fetch all active users for the tenant
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, first_name, last_name')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .limit(500)

      if (usersError) throw usersError
      if (!users || users.length === 0) return []

      // Fetch active matters per responsible_lawyer_id
      const { data: matters, error: mattersError } = await supabase
        .from('matters')
        .select('responsible_lawyer_id')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .not('responsible_lawyer_id', 'is', null)
        .limit(5000)

      if (mattersError) throw mattersError

      const matterCounts: Record<string, number> = {}
      for (const m of matters ?? []) {
        if (m.responsible_lawyer_id) {
          matterCounts[m.responsible_lawyer_id] = (matterCounts[m.responsible_lawyer_id] || 0) + 1
        }
      }

      // Fetch open tasks (not done/cancelled) per assigned_to
      const { data: openTasks, error: openTasksError } = await supabase
        .from('tasks')
        .select('assigned_to, due_date')
        .eq('tenant_id', tenantId)
        .not('assigned_to', 'is', null)
        .not('status', 'in', '("done","cancelled")')

      if (openTasksError) throw openTasksError

      const openTaskCounts: Record<string, number> = {}
      const overdueTaskCounts: Record<string, number> = {}
      for (const t of openTasks ?? []) {
        if (t.assigned_to) {
          openTaskCounts[t.assigned_to] = (openTaskCounts[t.assigned_to] || 0) + 1
          if (t.due_date && t.due_date < today) {
            overdueTaskCounts[t.assigned_to] = (overdueTaskCounts[t.assigned_to] || 0) + 1
          }
        }
      }

      return users.map((u) => ({
        user_id: u.id,
        first_name: u.first_name,
        last_name: u.last_name,
        active_matters: matterCounts[u.id] || 0,
        open_tasks: openTaskCounts[u.id] || 0,
        overdue_tasks: overdueTaskCounts[u.id] || 0,
      }))
    },
    enabled: !!tenantId,
  })
}

// ─── 22a. useAllCaseTypes (includes inactive, for settings) ─────────────────

export function useAllCaseTypes(tenantId: string) {
  return useQuery({
    queryKey: [...immigrationKeys.caseTypes(tenantId), 'all'] as const,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('immigration_case_types')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('sort_order', { ascending: true })

      if (error) throw error
      return data as ImmigrationCaseType[]
    },
    enabled: !!tenantId,
  })
}

// ─── 22b. useCreateCaseType ────────────────────────────────────────────────────

export function useCreateCaseType() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      tenant_id: string
      name: string
      description?: string | null
      default_billing_type?: string
      default_estimated_value?: number | null
    }) => {
      const slug = input.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')

      const supabase = createClient()
      const { data, error } = await supabase
        .from('immigration_case_types')
        .insert({
          tenant_id: input.tenant_id,
          name: input.name,
          slug,
          description: input.description ?? null,
          default_billing_type: input.default_billing_type ?? 'flat_fee',
          default_estimated_value: input.default_estimated_value ?? null,
        })
        .select()
        .single()

      if (error) throw error
      return data as ImmigrationCaseType
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: immigrationKeys.caseTypes(data.tenant_id) })
      toast.success('Case type created')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create case type')
    },
  })
}

// ─── 22c. useUpdateCaseType ────────────────────────────────────────────────────

export function useUpdateCaseType() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      tenantId,
      updates,
    }: {
      id: string
      tenantId: string
      updates: Database['public']['Tables']['immigration_case_types']['Update']
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('immigration_case_types')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return { data: data as ImmigrationCaseType, tenantId }
    },
    onSuccess: ({ tenantId }) => {
      queryClient.invalidateQueries({ queryKey: immigrationKeys.caseTypes(tenantId) })
      toast.success('Case type updated')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update case type')
    },
  })
}

// ─── 22d. useDeleteCaseType (soft delete) ──────────────────────────────────────

export function useDeleteCaseType() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, tenantId }: { id: string; tenantId: string }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('immigration_case_types')
        .update({ is_active: false })
        .eq('id', id)

      if (error) throw error
      return { tenantId }
    },
    onSuccess: ({ tenantId }) => {
      queryClient.invalidateQueries({ queryKey: immigrationKeys.caseTypes(tenantId) })
      toast.success('Case type archived')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to archive case type')
    },
  })
}

// ─── 22e. useReorderCaseTypes ──────────────────────────────────────────────────

export function useReorderCaseTypes() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      caseTypes,
      tenantId,
    }: {
      caseTypes: { id: string; sort_order: number }[]
      tenantId: string
    }) => {
      const supabase = createClient()
      for (const ct of caseTypes) {
        const { error } = await supabase
          .from('immigration_case_types')
          .update({ sort_order: ct.sort_order })
          .eq('id', ct.id)
        if (error) throw error
      }
      return { tenantId }
    },
    onSuccess: ({ tenantId }) => {
      queryClient.invalidateQueries({ queryKey: immigrationKeys.caseTypes(tenantId) })
    },
    onError: () => {
      toast.error('Failed to reorder case types')
    },
  })
}

// ─── 22. useCreateCaseStage ─────────────────────────────────────────────────────

export function useCreateCaseStage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: Database['public']['Tables']['case_stage_definitions']['Insert']) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('case_stage_definitions')
        .insert(input)
        .select()
        .single()

      if (error) throw error
      return data as CaseStageDefinition
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: immigrationKeys.stages(data.case_type_id) })
      toast.success('Stage created')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create stage')
    },
  })
}

// ─── 23. useUpdateCaseStage ─────────────────────────────────────────────────────

export function useUpdateCaseStage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, caseTypeId, ...updates }: Database['public']['Tables']['case_stage_definitions']['Update'] & { id: string; caseTypeId: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('case_stage_definitions')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as CaseStageDefinition
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: immigrationKeys.stages(data.case_type_id) })
      toast.success('Stage updated')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update stage')
    },
  })
}

// ─── 24. useDeleteCaseStage ─────────────────────────────────────────────────────

export function useDeleteCaseStage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, caseTypeId }: { id: string; caseTypeId: string }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('case_stage_definitions')
        .delete()
        .eq('id', id)

      if (error) throw error
      return { caseTypeId }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: immigrationKeys.stages(data.caseTypeId) })
      toast.success('Stage deleted')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete stage')
    },
  })
}

// ─── 25. useReorderCaseStages ───────────────────────────────────────────────────

export function useReorderCaseStages() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ stages, caseTypeId }: { stages: { id: string; sort_order: number }[]; caseTypeId: string }) => {
      const supabase = createClient()
      // Update each stage's sort_order
      for (const s of stages) {
        const { error } = await supabase
          .from('case_stage_definitions')
          .update({ sort_order: s.sort_order })
          .eq('id', s.id)
        if (error) throw error
      }
      return { caseTypeId }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: immigrationKeys.stages(data.caseTypeId) })
    },
    onError: () => {
      toast.error('Failed to reorder stages')
    },
  })
}

// ─── 26. useAdvanceStage ────────────────────────────────────────────────────────

/**
 * Advance an immigration matter's stage via the server-side enforcement engine.
 * This calls the unified API route which validates gating rules, creates auto-tasks,
 * logs activity, and triggers automations — all server-side.
 */
export function useAdvanceStage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      matterId,
      tenantId,
      newStageId,
      userId,
    }: {
      matterId: string
      tenantId: string
      newStageId: string
      userId: string
    }) => {
      const response = await fetch(`/api/matters/${matterId}/advance-stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetStageId: newStageId,
          system: 'immigration',
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to advance stage')
      }

      return { stageName: data.stageName }
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: immigrationKeys.matterImmigration(variables.matterId) })
      queryClient.invalidateQueries({ queryKey: immigrationKeys.checklistItems(variables.matterId) })
      queryClient.invalidateQueries({ queryKey: immigrationKeys.deadlines(variables.matterId) })
      queryClient.invalidateQueries({ queryKey: ['tasks', 'list'] })
      queryClient.invalidateQueries({ queryKey: ['activities'] })
      toast.success(`Stage advanced to ${result.stageName}`)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to advance stage')
    },
  })
}

// ─── 27. useCreateChecklistTemplate ──────────────────────────────────────────

export function useCreateChecklistTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: Database['public']['Tables']['checklist_templates']['Insert']) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('checklist_templates')
        .insert(input)
        .select()
        .single()

      if (error) throw error
      return data as ChecklistTemplate
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: immigrationKeys.checklistTemplates(data.case_type_id) })
      toast.success('Document template created')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create template')
    },
  })
}

// ─── 28. useUpdateChecklistTemplate ──────────────────────────────────────────

export function useUpdateChecklistTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      caseTypeId,
      ...updates
    }: Database['public']['Tables']['checklist_templates']['Update'] & {
      id: string
      caseTypeId: string
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('checklist_templates')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as ChecklistTemplate
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: immigrationKeys.checklistTemplates(data.case_type_id) })
      toast.success('Document template updated')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update template')
    },
  })
}

// ─── 29. useDeleteChecklistTemplate ──────────────────────────────────────────

export function useDeleteChecklistTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, caseTypeId }: { id: string; caseTypeId: string }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('checklist_templates')
        .delete()
        .eq('id', id)

      if (error) throw error
      return { caseTypeId }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: immigrationKeys.checklistTemplates(data.caseTypeId) })
      toast.success('Document template deleted')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete template')
    },
  })
}

// ─── 30. useReorderChecklistTemplates ────────────────────────────────────────

export function useReorderChecklistTemplates() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      templates,
      caseTypeId,
    }: {
      templates: { id: string; sort_order: number }[]
      caseTypeId: string
    }) => {
      const supabase = createClient()
      for (const t of templates) {
        const { error } = await supabase
          .from('checklist_templates')
          .update({ sort_order: t.sort_order })
          .eq('id', t.id)
        if (error) throw error
      }
      return { caseTypeId }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: immigrationKeys.checklistTemplates(data.caseTypeId) })
    },
    onError: () => {
      toast.error('Failed to reorder templates')
    },
  })
}
