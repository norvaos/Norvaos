/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Form Instance Engine  -  React Query Hooks
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Client-side hooks for form assignment templates and matter form instances.
 * Maps to tables created in migration 074-form-assignment-engine.sql.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTenant } from '@/lib/hooks/use-tenant'
import { createClient } from '@/lib/supabase/client'
import { logAudit } from '@/lib/queries/audit-logs'
import { compositeReadinessKeys } from '@/lib/queries/readiness'
import type {
  FormAssignmentTemplate,
  MatterFormInstance,
  FormAssignmentTemplateHistory,
  FormAssignmentTemplateWithForm,
  AssignmentTemplateStatus,
} from '@/lib/types/form-instances'

// ── Query Keys ───────────────────────────────────────────────────────────────

const KEYS = {
  assignmentTemplates: (scopeId: string) =>
    ['form-assignment-templates', scopeId] as const,
  assignmentTemplatesByStatus: (scopeId: string, status: AssignmentTemplateStatus) =>
    ['form-assignment-templates', scopeId, status] as const,
  matterFormInstances: (matterId: string) =>
    ['matter-form-instances', matterId] as const,
  templateHistory: (templateId: string) =>
    ['form-assignment-template-history', templateId] as const,
}

// ── Assignment Templates ─────────────────────────────────────────────────────

/** Fetch published assignment templates for a matter type */
export function useFormAssignmentTemplates(matterTypeId: string | null) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? null

  return useQuery({
    queryKey: KEYS.assignmentTemplates(matterTypeId ?? ''),
    enabled: !!tenantId && !!matterTypeId,
    queryFn: async (): Promise<FormAssignmentTemplateWithForm[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient()

      const { data, error } = await supabase
        .from('ircc_form_assignment_templates')
        .select('*, form:ircc_forms(id, form_code, form_name, description, current_version, checksum_sha256)')
        .eq('matter_type_id', matterTypeId!)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (error) throw new Error(error.message)
      return data ?? []
    },
  })
}

/** Fetch assignment templates for a case type (immigration) */
export function useFormAssignmentTemplatesByCaseType(caseTypeId: string | null) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? null

  return useQuery({
    queryKey: KEYS.assignmentTemplates(caseTypeId ?? ''),
    enabled: !!tenantId && !!caseTypeId,
    queryFn: async (): Promise<FormAssignmentTemplateWithForm[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient()

      const { data, error } = await supabase
        .from('ircc_form_assignment_templates')
        .select('*, form:ircc_forms(id, form_code, form_name, description, current_version, checksum_sha256)')
        .eq('case_type_id', caseTypeId!)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (error) throw new Error(error.message)
      return data ?? []
    },
  })
}

// ── Matter Form Instances ───────────────────────────────────────────────────

/** Fetch all form instances for a matter */
export function useMatterFormInstances(matterId: string | null) {
  return useQuery({
    queryKey: KEYS.matterFormInstances(matterId ?? ''),
    enabled: !!matterId,
    queryFn: async (): Promise<MatterFormInstance[]> => {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('matter_form_instances' as never)
        .select('*')
        .eq('matter_id', matterId!)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as MatterFormInstance[]
    },
  })
}

/** Update form instance status */
export function useUpdateFormInstanceStatus() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      instanceId: string
      matterId: string
      status: string
    }) => {
      const supabase = createClient()

      const { error } = await supabase
        .from('matter_form_instances' as never)
        .update({ status: params.status } as never)
        .eq('id', params.instanceId)

      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.matterFormInstances(vars.matterId) })
      qc.invalidateQueries({ queryKey: compositeReadinessKeys.detail(vars.matterId) })
      fetch(`/api/matters/${vars.matterId}/readiness`, { method: 'POST' }).catch(console.error)
      toast.success('Form instance status updated')
    },
    onError: (err: Error) => {
      toast.error(`Failed to update status: ${err.message}`)
    },
  })
}

// ── Template History ────────────────────────────────────────────────────────

/** Fetch history for a specific assignment template */
export function useFormAssignmentTemplateHistory(templateId: string | null) {
  return useQuery({
    queryKey: KEYS.templateHistory(templateId ?? ''),
    enabled: !!templateId,
    queryFn: async (): Promise<FormAssignmentTemplateHistory[]> => {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('form_assignment_template_history' as never)
        .select('*')
        .eq('template_id', templateId!)
        .order('created_at', { ascending: false })

      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as FormAssignmentTemplateHistory[]
    },
  })
}

// ── Template Mutations ──────────────────────────────────────────────────────

/** Create a new assignment template (draft) */
export function useCreateAssignmentTemplate() {
  const qc = useQueryClient()
  const { tenant } = useTenant()

  return useMutation({
    mutationFn: async (params: {
      formId: string
      matterTypeId?: string | null
      caseTypeId?: string | null
      sortOrder?: number
      isRequired?: boolean
      personRoleScope?: string | null
      conditions?: unknown
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient()

      const { data, error } = await supabase
        .from('ircc_form_assignment_templates')
        .insert({
          tenant_id: tenant!.id,
          form_id: params.formId,
          matter_type_id: params.matterTypeId ?? null,
          case_type_id: params.caseTypeId ?? null,
          sort_order: params.sortOrder ?? 0,
          is_required: params.isRequired ?? true,
          person_role_scope: params.personRoleScope ?? null,
          conditions: params.conditions ?? null,
          status: 'draft',
          version: 1,
        })
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data as unknown as FormAssignmentTemplate
    },
    onSuccess: (data, vars) => {
      const scopeId = vars.matterTypeId ?? vars.caseTypeId ?? ''
      qc.invalidateQueries({ queryKey: KEYS.assignmentTemplates(scopeId) })
      toast.success('Assignment template created')

      logAudit({
        tenantId: tenant!.id,
        userId: 'system',
        entityType: 'ircc_form_assignment_template',
        entityId: data.id,
        action: 'form_assignment_template_created',
        changes: {
          form_id: vars.formId,
          matter_type_id: vars.matterTypeId ?? null,
          case_type_id: vars.caseTypeId ?? null,
          is_required: vars.isRequired ?? true,
          person_role_scope: vars.personRoleScope ?? null,
          conditions: vars.conditions ?? null,
        },
      })
    },
    onError: (err: Error) => {
      toast.error(`Failed to create template: ${err.message}`)
    },
  })
}

/** Publish an assignment template via RPC */
export function usePublishAssignmentTemplate() {
  const qc = useQueryClient()
  const { tenant } = useTenant()

  return useMutation({
    mutationFn: async (params: { templateId: string; userId: string; scopeId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient()

      const { data, error } = await supabase
        .rpc('publish_form_assignment_template', {
          p_template_id: params.templateId,
          p_user_id: params.userId,
        })

      if (error) throw new Error(error.message)

      const result = data as unknown as { success: boolean; error?: string }
      if (!result.success) {
        throw new Error(result.error ?? 'Publish failed')
      }

      return result
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.assignmentTemplates(vars.scopeId) })
      qc.invalidateQueries({ queryKey: KEYS.templateHistory(vars.templateId) })
      toast.success('Template published')

      if (tenant?.id) {
        logAudit({
          tenantId: tenant.id,
          userId: vars.userId,
          entityType: 'ircc_form_assignment_template',
          entityId: vars.templateId,
          action: 'form_assignment_template_published',
        })
      }
    },
    onError: (err: Error) => {
      toast.error(`Failed to publish: ${err.message}`)
    },
  })
}

/** Archive an assignment template via RPC */
export function useArchiveAssignmentTemplate() {
  const qc = useQueryClient()
  const { tenant } = useTenant()

  return useMutation({
    mutationFn: async (params: { templateId: string; userId: string; scopeId: string; reason?: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient()

      const { data, error } = await supabase
        .rpc('archive_form_assignment_template', {
          p_template_id: params.templateId,
          p_user_id: params.userId,
          p_reason: params.reason ?? null,
        })

      if (error) throw new Error(error.message)

      const result = data as unknown as { success: boolean; error?: string }
      if (!result.success) {
        throw new Error(result.error ?? 'Archive failed')
      }

      return result
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.assignmentTemplates(vars.scopeId) })
      qc.invalidateQueries({ queryKey: KEYS.templateHistory(vars.templateId) })
      toast.success('Template archived')

      if (tenant?.id) {
        logAudit({
          tenantId: tenant.id,
          userId: vars.userId,
          entityType: 'ircc_form_assignment_template',
          entityId: vars.templateId,
          action: 'form_assignment_template_archived',
          changes: vars.reason ? { reason: vars.reason } : undefined,
        })
      }
    },
    onError: (err: Error) => {
      toast.error(`Failed to archive: ${err.message}`)
    },
  })
}

/** Check active matter impact before moving a template */
export function useCheckMoveImpact() {
  return useMutation({
    mutationFn: async (params: { templateId: string }) => {
      const supabase = createClient()

      // Count active matters that have instances from this template
      const { data, error } = await supabase
        .from('matter_form_instances' as never)
        .select('matter_id', { count: 'exact', head: true })
        .eq('assignment_template_id', params.templateId)
        .eq('is_active', true)

      if (error) throw new Error(error.message)

      return { activeMatterCount: data?.length ?? 0 }
    },
  })
}
