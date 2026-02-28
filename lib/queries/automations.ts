'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { toast } from 'sonner'

// ── Types ────────────────────────────────────────────────────────────────────────

export type AutomationRule = Database['public']['Tables']['automation_rules']['Row']
export type AutomationRuleInsert = Database['public']['Tables']['automation_rules']['Insert']
export type AutomationExecutionLog = Database['public']['Tables']['automation_execution_log']['Row']

// ── Queries ──────────────────────────────────────────────────────────────────────

export function useAutomationRules(tenantId: string) {
  return useQuery({
    queryKey: ['automation-rules', tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('automation_rules')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('sort_order')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as AutomationRule[]
    },
    enabled: !!tenantId,
    staleTime: 2 * 60 * 1000,
  })
}

export function useAutomationExecutionCounts(tenantId: string, ruleIds: string[]) {
  return useQuery({
    queryKey: ['automation-execution-counts', tenantId, ruleIds],
    queryFn: async () => {
      if (ruleIds.length === 0) return {} as Record<string, number>
      const supabase = createClient()
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const { data, error } = await supabase
        .from('automation_execution_log')
        .select('automation_rule_id')
        .eq('tenant_id', tenantId)
        .in('automation_rule_id', ruleIds)
        .gte('executed_at', thirtyDaysAgo.toISOString())

      if (error) throw error

      const counts: Record<string, number> = {}
      for (const row of data ?? []) {
        counts[row.automation_rule_id] = (counts[row.automation_rule_id] || 0) + 1
      }
      return counts
    },
    enabled: !!tenantId && ruleIds.length > 0,
    staleTime: 5 * 60 * 1000,
  })
}

export function useAutomationExecutionLog(tenantId: string, ruleId: string | null) {
  return useQuery({
    queryKey: ['automation-execution-log', tenantId, ruleId],
    queryFn: async () => {
      const supabase = createClient()
      // No FK from automation_execution_log to matters — use 2-query pattern
      const { data: logs, error } = await supabase
        .from('automation_execution_log')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('automation_rule_id', ruleId!)
        .order('executed_at', { ascending: false })
        .limit(50)
      if (error) throw error
      if (!logs || logs.length === 0) return []

      // Batch-fetch matter info for all logs
      const matterIds = [...new Set(logs.map((l) => l.matter_id).filter(Boolean))] as string[]
      let mattersMap: Record<string, { id: string; title: string; matter_number: string | null }> = {}
      if (matterIds.length > 0) {
        const { data: matters } = await supabase
          .from('matters')
          .select('id, title, matter_number')
          .in('id', matterIds)
        if (matters) {
          mattersMap = Object.fromEntries(matters.map((m) => [m.id, m]))
        }
      }

      return logs.map((log) => ({
        ...log,
        matters: log.matter_id ? mattersMap[log.matter_id] ?? null : null,
      }))
    },
    enabled: !!tenantId && !!ruleId,
    staleTime: 60 * 1000,
  })
}

// ── Mutations ────────────────────────────────────────────────────────────────────

export function useCreateAutomationRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: AutomationRuleInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('automation_rules')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data as AutomationRule
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules', vars.tenant_id] })
      toast.success('Automation rule created')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create automation rule')
    },
  })
}

export function useUpdateAutomationRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      tenantId: string
      updates: Partial<AutomationRuleInsert>
    }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('automation_rules')
        .update(input.updates)
        .eq('id', input.id)
        .eq('tenant_id', input.tenantId)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules', vars.tenantId] })
      toast.success('Automation rule updated')
    },
    onError: () => toast.error('Failed to update automation rule'),
  })
}

export function useDeleteAutomationRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; tenantId: string }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('automation_rules')
        .delete()
        .eq('id', input.id)
        .eq('tenant_id', input.tenantId)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules', vars.tenantId] })
      toast.success('Automation rule deleted')
    },
    onError: () => toast.error('Failed to delete automation rule'),
  })
}

export function useToggleAutomationRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; tenantId: string; isActive: boolean }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('automation_rules')
        .update({ is_active: input.isActive })
        .eq('id', input.id)
        .eq('tenant_id', input.tenantId)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules', vars.tenantId] })
      toast.success(vars.isActive ? 'Rule enabled' : 'Rule disabled')
    },
    onError: () => toast.error('Failed to toggle automation rule'),
  })
}
