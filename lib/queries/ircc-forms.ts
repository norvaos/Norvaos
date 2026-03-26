/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * IRCC Form Management  -  React Query Hooks
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Client-side hooks for the DB-driven form management platform.
 *
 * NOTE: Direct Supabase queries use `as any` because ircc_form_* tables
 * are not yet in the generated Database types. Once migration 057 is run
 * and types are regenerated, the casts can be removed.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTenant } from '@/lib/hooks/use-tenant'
import type {
  IrccForm,
  IrccFormField,
  IrccFormSection,
  IrccFormFieldUpdate,
  IrccStreamFormWithDetails,
  MatterTypeSectionConfig,
  IrccFormVersion,
  FolderScanResult,
  SyncFormRequest,
  SyncResult,
} from '@/lib/types/ircc-forms'
import { createClient } from '@/lib/supabase/client'

// ── Query Keys ───────────────────────────────────────────────────────────────

const KEYS = {
  forms: (tenantId: string) => ['ircc-forms', tenantId] as const,
  form: (formId: string) => ['ircc-form', formId] as const,
  formFields: (formId: string) => ['ircc-form-fields', formId] as const,
  formSections: (formId: string) => ['ircc-form-sections', formId] as const,
  streamForms: (caseTypeId: string) => ['ircc-stream-forms', caseTypeId] as const,
  matterTypeForms: (matterTypeId: string) => ['ircc-matter-type-forms', matterTypeId] as const,
  matterTypeFormIds: (matterTypeId: string) => ['ircc-matter-type-form-ids', matterTypeId] as const,
  sectionConfig: (matterTypeId: string) => ['matter-type-section-config', matterTypeId] as const,
  formVersions: (formId: string) => ['ircc-form-versions', formId] as const,
  clientFieldStats: (formId: string) => ['ircc-client-field-stats', formId] as const,
}

// ── Form Library ─────────────────────────────────────────────────────────────

/** List all IRCC forms for the current tenant */
export function useIrccForms() {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? null

  return useQuery({
    queryKey: KEYS.forms(tenantId ?? ''),
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient()
      const { data, error } = await supabase
        .from('ircc_forms')
        .select('*')
        .eq('tenant_id', tenantId!)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as IrccForm[]
    },
    enabled: !!tenantId,
    staleTime: 30_000,
  })
}

/** Get a single IRCC form by ID */
export function useIrccForm(formId: string | null) {
  return useQuery({
    queryKey: KEYS.form(formId ?? ''),
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient()
      const { data, error } = await supabase
        .from('ircc_forms')
        .select('*')
        .eq('id', formId!)
        .single()

      if (error) throw error
      return data as IrccForm
    },
    enabled: !!formId,
    staleTime: 30_000,
  })
}

/** Upload a new IRCC form PDF */
export function useUploadIrccForm() {
  const queryClient = useQueryClient()
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? null

  return useMutation({
    mutationFn: async (params: {
      file: File
      formCode: string
      formName: string
      description?: string
      descriptionTranslations?: Record<string, string>
    }) => {
      const formData = new FormData()
      formData.append('file', params.file)
      formData.append('form_code', params.formCode)
      formData.append('form_name', params.formName)
      if (params.description) {
        formData.append('description', params.description)
      }
      if (params.descriptionTranslations && Object.keys(params.descriptionTranslations).length > 0) {
        formData.append('description_translations', JSON.stringify(params.descriptionTranslations))
      }

      const response = await fetch('/api/ircc/forms/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => null)
        throw new Error(errData?.error ?? `Upload failed (${response.status})`)
      }

      return response.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: KEYS.forms(tenantId ?? '') })
      const autoMapped: number = data?.auto_mapped_count ?? 0
      const restored: number = data?.mappings_restored ?? 0
      const fieldCount: number = data?.field_count ?? 0
      const mappedPart = autoMapped > 0 ? ` · ${autoMapped}/${fieldCount} auto-mapped` : ''
      const restoredPart = restored > 0 ? ` · ${restored} mappings restored` : ''
      toast.success(`Form uploaded and scanned successfully${mappedPart}${restoredPart}`)
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

/** Delete an IRCC form */
export function useDeleteIrccForm() {
  const queryClient = useQueryClient()
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? null

  return useMutation({
    mutationFn: async (formId: string) => {
      const response = await fetch(`/api/ircc/forms/${formId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => null)
        throw new Error(errData?.error ?? `Delete failed (${response.status})`)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.forms(tenantId ?? '') })
      toast.success('Form deleted')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

/** Re-scan form to extract XFA fields */
export function useRescanIrccForm() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (formId: string) => {
      const response = await fetch(`/api/ircc/forms/${formId}/rescan`, {
        method: 'POST',
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => null)
        throw new Error(errData?.error ?? `Rescan failed (${response.status})`)
      }

      return response.json()
    },
    onSuccess: (_data, formId) => {
      queryClient.invalidateQueries({ queryKey: KEYS.form(formId) })
      queryClient.invalidateQueries({ queryKey: KEYS.formFields(formId) })
      toast.success('Form re-scanned successfully')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

export function useRelabelIrccFormFields() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (formId: string) => {
      const response = await fetch(`/api/ircc/forms/${formId}/relabel`, {
        method: 'POST',
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => null)
        throw new Error(errData?.error ?? `Relabel failed (${response.status})`)
      }

      return response.json() as Promise<{ success: boolean; relabeled: number }>
    },
    onSuccess: (data, formId) => {
      queryClient.invalidateQueries({ queryKey: KEYS.formFields(formId) })
      toast.success(`Relabelled ${data.relabeled} field${data.relabeled === 1 ? '' : 's'} from form`)
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

// ── Form Fields ──────────────────────────────────────────────────────────────

/** Get all fields for a form */
export function useIrccFormFields(formId: string | null) {
  return useQuery({
    queryKey: KEYS.formFields(formId ?? ''),
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient()
      const { data, error } = await supabase
        .from('ircc_form_fields')
        .select('*')
        .eq('form_id', formId!)
        .order('sort_order', { ascending: true })

      if (error) throw error
      return data as IrccFormField[]
    },
    enabled: !!formId,
    staleTime: 30_000,
  })
}

/** Count client-visible fields for a form (lightweight stats for badges) */
export function useClientFieldStats(formId: string | null) {
  return useQuery({
    queryKey: KEYS.clientFieldStats(formId ?? ''),
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient()
      const { count: visibleCount, error: visErr } = await supabase
        .from('ircc_form_fields')
        .select('id', { count: 'exact', head: true })
        .eq('form_id', formId!)
        .eq('is_client_visible', true)
        .eq('is_meta_field', false)

      if (visErr) throw visErr

      const { count: requiredCount, error: reqErr } = await supabase
        .from('ircc_form_fields')
        .select('id', { count: 'exact', head: true })
        .eq('form_id', formId!)
        .eq('is_client_visible', true)
        .eq('is_client_required', true)
        .eq('is_meta_field', false)

      if (reqErr) throw reqErr

      return { visibleCount: visibleCount ?? 0, requiredCount: requiredCount ?? 0 }
    },
    enabled: !!formId,
    staleTime: 30_000,
  })
}

/** Update a single field mapping */
export function useUpdateIrccFormField() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { fieldId: string; formId: string; updates: IrccFormFieldUpdate }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient()
      const { error } = await supabase
        .from('ircc_form_fields')
        .update({
          ...params.updates,
          is_mapped: !!params.updates.profile_path,
        })
        .eq('id', params.fieldId)

      if (error) throw error
    },
    onSuccess: (_data, params) => {
      queryClient.invalidateQueries({ queryKey: KEYS.formFields(params.formId) })
    },
    onError: (err: Error) => {
      toast.error(`Failed to update field: ${err.message}`)
    },
  })
}

/** Bulk update multiple field mappings */
export function useBulkUpdateIrccFormFields() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      formId: string
      updates: Array<{ fieldId: string; updates: IrccFormFieldUpdate }>
    }) => {
      const response = await fetch(`/api/ircc/forms/${params.formId}/fields`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: params.updates }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => null)
        throw new Error(errData?.error ?? `Bulk update failed (${response.status})`)
      }

      return response.json()
    },
    onSuccess: (_data, params) => {
      queryClient.invalidateQueries({ queryKey: KEYS.formFields(params.formId) })
      toast.success('Field mappings updated')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

// ── Form Sections ────────────────────────────────────────────────────────────

/** Get all sections for a form */
export function useIrccFormSections(formId: string | null) {
  return useQuery({
    queryKey: KEYS.formSections(formId ?? ''),
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient()
      const { data, error } = await supabase
        .from('ircc_form_sections')
        .select('*')
        .eq('form_id', formId!)
        .order('sort_order', { ascending: true })

      if (error) throw error
      return data as IrccFormSection[]
    },
    enabled: !!formId,
    staleTime: 30_000,
  })
}

/** Create a new section */
export function useCreateIrccFormSection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      tenantId: string
      formId: string
      sectionKey: string
      title: string
      sortOrder?: number
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient()
      const { data, error } = await supabase
        .from('ircc_form_sections')
        .insert({
          tenant_id: params.tenantId,
          form_id: params.formId,
          section_key: params.sectionKey,
          title: params.title,
          sort_order: params.sortOrder ?? 0,
        })
        .select()
        .single()

      if (error) throw error
      return data as IrccFormSection
    },
    onSuccess: (_data, params) => {
      queryClient.invalidateQueries({ queryKey: KEYS.formSections(params.formId) })
    },
    onError: (err: Error) => {
      toast.error(`Failed to create section: ${err.message}`)
    },
  })
}

/** Update a section's title (and optionally description) */
export function useUpdateIrccFormSection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      sectionId: string
      formId: string
      title: string
      description?: string | null
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient()
      const { error } = await supabase
        .from('ircc_form_sections')
        .update({ title: params.title, description: params.description ?? null })
        .eq('id', params.sectionId)

      if (error) throw error
    },
    onSuccess: (_data, params) => {
      queryClient.invalidateQueries({ queryKey: KEYS.formSections(params.formId) })
      toast.success('Section renamed')
    },
    onError: (err: Error) => {
      toast.error(`Failed to rename section: ${err.message}`)
    },
  })
}

// ── Stream Forms (Case Type ↔ Forms) ─────────────────────────────────────────

/** Get forms assigned to a case type */
export function useStreamForms(caseTypeId: string | null) {
  return useQuery({
    queryKey: KEYS.streamForms(caseTypeId ?? ''),
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient()
      const { data, error } = await supabase
        .from('ircc_stream_forms')
        .select('*, form:ircc_forms(*)')
        .eq('case_type_id', caseTypeId!)
        .order('sort_order', { ascending: true })

      if (error) throw error
      return data as IrccStreamFormWithDetails[]
    },
    enabled: !!caseTypeId,
    staleTime: 30_000,
  })
}

/** Add a form to a case type */
export function useAddStreamForm() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      tenantId: string
      caseTypeId: string
      formId: string
      sortOrder?: number
      isRequired?: boolean
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient()
      const { error } = await supabase
        .from('ircc_stream_forms')
        .insert({
          tenant_id: params.tenantId,
          case_type_id: params.caseTypeId,
          form_id: params.formId,
          sort_order: params.sortOrder ?? 0,
          is_required: params.isRequired ?? true,
        })

      if (error) throw error
    },
    onSuccess: (_data, params) => {
      queryClient.invalidateQueries({ queryKey: KEYS.streamForms(params.caseTypeId) })
      toast.success('Form added to stream')
    },
    onError: (err: Error) => {
      toast.error(`Failed to add form: ${err.message}`)
    },
  })
}

/** Remove a form from a case type */
export function useRemoveStreamForm() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { streamFormId: string; caseTypeId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient()
      const { error } = await supabase
        .from('ircc_stream_forms')
        .delete()
        .eq('id', params.streamFormId)

      if (error) throw error
    },
    onSuccess: (_data, params) => {
      queryClient.invalidateQueries({ queryKey: KEYS.streamForms(params.caseTypeId) })
      toast.success('Form removed from stream')
    },
    onError: (err: Error) => {
      toast.error(`Failed to remove form: ${err.message}`)
    },
  })
}

// ── Matter Type ↔ Forms ──────────────────────────────────────────────────────

/** Get forms assigned to a matter type */
export function useStreamFormsByMatterType(matterTypeId: string | null) {
  return useQuery({
    queryKey: KEYS.matterTypeForms(matterTypeId ?? ''),
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient()
      const { data, error } = await supabase
        .from('ircc_stream_forms')
        .select('*, form:ircc_forms(*)')
        .eq('matter_type_id', matterTypeId!)
        .order('sort_order', { ascending: true })

      if (error) throw error
      return data as IrccStreamFormWithDetails[]
    },
    enabled: !!matterTypeId,
    staleTime: 30_000,
  })
}

/** Get just the form IDs assigned to a matter type (for questionnaire building) */
export function useMatterTypeFormIds(matterTypeId: string | null) {
  return useQuery({
    queryKey: KEYS.matterTypeFormIds(matterTypeId ?? ''),
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient()
      const { data, error } = await supabase
        .from('ircc_stream_forms')
        .select('form_id')
        .eq('matter_type_id', matterTypeId!)
        .order('sort_order', { ascending: true })

      if (error) throw error
      return (data as { form_id: string }[]).map((r) => r.form_id)
    },
    enabled: !!matterTypeId,
    staleTime: 30_000,
  })
}

/** Add a form to a matter type */
export function useAddStreamFormToMatterType() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      tenantId: string
      matterTypeId: string
      formId: string
      sortOrder?: number
      isRequired?: boolean
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient()
      const { error } = await supabase
        .from('ircc_stream_forms')
        .insert({
          tenant_id: params.tenantId,
          matter_type_id: params.matterTypeId,
          form_id: params.formId,
          sort_order: params.sortOrder ?? 0,
          is_required: params.isRequired ?? true,
        })

      if (error) throw error
    },
    onSuccess: (_data, params) => {
      queryClient.invalidateQueries({ queryKey: KEYS.matterTypeForms(params.matterTypeId) })
      queryClient.invalidateQueries({ queryKey: KEYS.matterTypeFormIds(params.matterTypeId) })
      // Also invalidate the form library page's assignments query
      queryClient.invalidateQueries({ queryKey: ['ircc-stream-form-assignments'] })
      toast.success('Form assigned to matter type')
    },
    onError: (err: Error) => {
      toast.error(`Failed to assign form: ${err.message}`)
    },
  })
}

/** Remove a form from a matter type */
export function useRemoveStreamFormFromMatterType() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { streamFormId: string; matterTypeId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient()
      const { error } = await supabase
        .from('ircc_stream_forms')
        .delete()
        .eq('id', params.streamFormId)

      if (error) throw error
    },
    onSuccess: (_data, params) => {
      queryClient.invalidateQueries({ queryKey: KEYS.matterTypeForms(params.matterTypeId) })
      queryClient.invalidateQueries({ queryKey: KEYS.matterTypeFormIds(params.matterTypeId) })
      // Also invalidate the form library page's assignments query
      queryClient.invalidateQueries({ queryKey: ['ircc-stream-form-assignments'] })
      toast.success('Form removed from matter type')
    },
    onError: (err: Error) => {
      toast.error(`Failed to remove form: ${err.message}`)
    },
  })
}

// ── Matter Type Section Config ──────────────────────────────────────────────

/** Get section config for a matter type */
export function useMatterTypeSectionConfig(matterTypeId: string | null) {
  return useQuery({
    queryKey: KEYS.sectionConfig(matterTypeId ?? ''),
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient()
      const { data, error } = await supabase
        .from('matter_type_section_config')
        .select('*')
        .eq('matter_type_id', matterTypeId!)
        .order('sort_order', { ascending: true })

      if (error) throw error
      return data as MatterTypeSectionConfig[]
    },
    enabled: !!matterTypeId,
    staleTime: 30_000,
  })
}

/** Upsert a single section config (toggle on/off) */
export function useUpsertSectionConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      tenantId: string
      matterTypeId: string
      sectionKey: string
      sectionLabel: string
      isEnabled: boolean
      sortOrder: number
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient()
      const { error } = await supabase
        .from('matter_type_section_config')
        .upsert(
          {
            tenant_id: params.tenantId,
            matter_type_id: params.matterTypeId,
            section_key: params.sectionKey,
            section_label: params.sectionLabel,
            is_enabled: params.isEnabled,
            sort_order: params.sortOrder,
          },
          { onConflict: 'matter_type_id,section_key' }
        )

      if (error) throw error
    },
    onSuccess: (_data, params) => {
      queryClient.invalidateQueries({ queryKey: KEYS.sectionConfig(params.matterTypeId) })
    },
    onError: (err: Error) => {
      toast.error(`Failed to update section config: ${err.message}`)
    },
  })
}

/** Bulk upsert all section configs (for reorder or initial setup) */
export function useBulkUpsertSectionConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      tenantId: string
      matterTypeId: string
      sections: Array<{
        sectionKey: string
        sectionLabel: string
        isEnabled: boolean
        sortOrder: number
      }>
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient()
      const rows = params.sections.map((s) => ({
        tenant_id: params.tenantId,
        matter_type_id: params.matterTypeId,
        section_key: s.sectionKey,
        section_label: s.sectionLabel,
        is_enabled: s.isEnabled,
        sort_order: s.sortOrder,
      }))

      const { error } = await supabase
        .from('matter_type_section_config')
        .upsert(rows, { onConflict: 'matter_type_id,section_key' })

      if (error) throw error
    },
    onSuccess: (_data, params) => {
      queryClient.invalidateQueries({ queryKey: KEYS.sectionConfig(params.matterTypeId) })
      toast.success('Section configuration saved')
    },
    onError: (err: Error) => {
      toast.error(`Failed to save section config: ${err.message}`)
    },
  })
}

/** Update field_config and custom_fields for a specific section config row */
export function useUpdateSectionFieldConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      sectionConfigId: string
      matterTypeId: string
      fieldConfig?: Record<string, { visible: boolean }>
      customFields?: Array<{
        key: string
        label: string
        type: 'text' | 'date' | 'select' | 'number' | 'checkbox'
        required: boolean
        options?: { label: string; value: string }[]
      }>
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const update: any = {}
      if (params.fieldConfig !== undefined) update.field_config = params.fieldConfig
      if (params.customFields !== undefined) update.custom_fields = params.customFields

      const { error } = await supabase
        .from('matter_type_section_config')
        .update(update)
        .eq('id', params.sectionConfigId)

      if (error) throw error
    },
    onSuccess: (_data, params) => {
      queryClient.invalidateQueries({ queryKey: KEYS.sectionConfig(params.matterTypeId) })
      toast.success('Field configuration saved')
    },
    onError: (err: Error) => {
      toast.error(`Failed to save field config: ${err.message}`)
    },
  })
}

// ── Forms Vault  -  Folder Scan & Sync ────────────────────────────────────────

/** Scan the local IRCC forms folder and compare against DB */
export function useScanFolder() {
  return useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/ircc/forms/scan-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!response.ok) {
        const errData = await response.json().catch(() => null)
        throw new Error(errData?.error ?? `Scan failed (${response.status})`)
      }
      return response.json() as Promise<FolderScanResult>
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

/** Sync selected forms from local folder into DB (add new / update existing) */
export function useSyncForms() {
  const queryClient = useQueryClient()
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''

  return useMutation({
    mutationFn: async (forms: SyncFormRequest[]) => {
      const response = await fetch('/api/ircc/forms/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forms }),
      })
      if (!response.ok) {
        const errData = await response.json().catch(() => null)
        throw new Error(errData?.error ?? `Sync failed (${response.status})`)
      }
      return response.json() as Promise<SyncResult>
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: KEYS.forms(tenantId) })
      const { added, updated, failed } = data.summary
      const parts: string[] = []
      if (added > 0) parts.push(`${added} added`)
      if (updated > 0) parts.push(`${updated} updated`)
      if (failed > 0) parts.push(`${failed} failed`)
      toast.success(`Sync complete: ${parts.join(', ')}`)
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

/** Fetch version history for a specific IRCC form */
export function useFormVersions(formId: string | null) {
  return useQuery({
    queryKey: KEYS.formVersions(formId ?? ''),
    queryFn: async () => {
      const response = await fetch(`/api/ircc/forms/${formId}/versions`)
      if (!response.ok) {
        const errData = await response.json().catch(() => null)
        throw new Error(errData?.error ?? `Failed to fetch versions (${response.status})`)
      }
      return response.json() as Promise<{
        formId: string
        formCode: string
        currentVersion: number
        versions: IrccFormVersion[]
      }>
    },
    enabled: !!formId,
    staleTime: 30_000,
  })
}

// ── Composite Form + Question Set Hooks ─────────────────────────────────────

import { hasQuestionDefinitions } from '@/lib/ircc/form-question-utils'

/**
 * Assign a form to a matter type AND auto-add the form code to
 * ircc_question_set_codes if FORM_REGISTRY has questions for it.
 */
export function useAssignFormWithQuestions() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      tenantId: string
      matterTypeId: string
      formId: string
      formCode: string
      sortOrder?: number
      isRequired?: boolean
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient()

      // 1. Insert into ircc_stream_forms
      const { error: streamError } = await supabase
        .from('ircc_stream_forms')
        .insert({
          tenant_id: params.tenantId,
          matter_type_id: params.matterTypeId,
          form_id: params.formId,
          sort_order: params.sortOrder ?? 0,
          is_required: params.isRequired ?? true,
        })
      if (streamError) throw streamError

      // 2. Auto-add to ircc_question_set_codes if form has questions
      if (hasQuestionDefinitions(params.formCode)) {
        const { data: mtData } = await supabase
          .from('matter_types')
          .select('ircc_question_set_codes')
          .eq('id', params.matterTypeId)
          .single()

        const currentCodes: string[] = mtData?.ircc_question_set_codes ?? []
        if (!currentCodes.includes(params.formCode)) {
          const { error: updateError } = await supabase
            .from('matter_types')
            .update({ ircc_question_set_codes: [...currentCodes, params.formCode] })
            .eq('id', params.matterTypeId)
          if (updateError) throw updateError
        }
      }
    },
    onSuccess: (_data, params) => {
      queryClient.invalidateQueries({ queryKey: KEYS.matterTypeForms(params.matterTypeId) })
      queryClient.invalidateQueries({ queryKey: KEYS.matterTypeFormIds(params.matterTypeId) })
      queryClient.invalidateQueries({ queryKey: ['ircc-stream-form-assignments'] })
      queryClient.invalidateQueries({ queryKey: ['matter_types'] })
      queryClient.invalidateQueries({ queryKey: ['matter-type-form-codes', params.matterTypeId] })
      toast.success('Form assigned to matter type')
    },
    onError: (err: Error) => {
      toast.error(`Failed to assign form: ${err.message}`)
    },
  })
}

/**
 * Remove a form from a matter type AND optionally remove the form code
 * from ircc_question_set_codes.
 */
export function useRemoveFormWithQuestions() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      streamFormId: string
      matterTypeId: string
      formCode: string
      removeQuestions?: boolean // default true
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient()

      // 1. Delete from ircc_stream_forms
      const { error } = await supabase
        .from('ircc_stream_forms')
        .delete()
        .eq('id', params.streamFormId)
      if (error) throw error

      // 2. Optionally remove from ircc_question_set_codes
      if (params.removeQuestions !== false && hasQuestionDefinitions(params.formCode)) {
        const { data: mtData } = await supabase
          .from('matter_types')
          .select('ircc_question_set_codes')
          .eq('id', params.matterTypeId)
          .single()

        const currentCodes: string[] = mtData?.ircc_question_set_codes ?? []
        const updated = currentCodes.filter((c) => c !== params.formCode)
        if (updated.length !== currentCodes.length) {
          await supabase
            .from('matter_types')
            .update({ ircc_question_set_codes: updated })
            .eq('id', params.matterTypeId)
        }
      }
    },
    onSuccess: (_data, params) => {
      queryClient.invalidateQueries({ queryKey: KEYS.matterTypeForms(params.matterTypeId) })
      queryClient.invalidateQueries({ queryKey: KEYS.matterTypeFormIds(params.matterTypeId) })
      queryClient.invalidateQueries({ queryKey: ['ircc-stream-form-assignments'] })
      queryClient.invalidateQueries({ queryKey: ['matter_types'] })
      queryClient.invalidateQueries({ queryKey: ['matter-type-form-codes', params.matterTypeId] })
      toast.success('Form removed from matter type')
    },
    onError: (err: Error) => {
      toast.error(`Failed to remove form: ${err.message}`)
    },
  })
}

/**
 * Toggle a single question set code on a matter type
 * without affecting the ircc_stream_forms assignment.
 */
export function useToggleQuestionSetCode() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      matterTypeId: string
      formCode: string
      enabled: boolean
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient()
      const { data: mtData } = await supabase
        .from('matter_types')
        .select('ircc_question_set_codes')
        .eq('id', params.matterTypeId)
        .single()

      const currentCodes: string[] = mtData?.ircc_question_set_codes ?? []
      let updated: string[]
      if (params.enabled) {
        updated = currentCodes.includes(params.formCode) ? currentCodes : [...currentCodes, params.formCode]
      } else {
        updated = currentCodes.filter((c) => c !== params.formCode)
      }

      const { error } = await supabase
        .from('matter_types')
        .update({ ircc_question_set_codes: updated })
        .eq('id', params.matterTypeId)
      if (error) throw error
    },
    onSuccess: (_data, params) => {
      queryClient.invalidateQueries({ queryKey: ['matter_types'] })
      queryClient.invalidateQueries({ queryKey: ['matter-type-form-codes', params.matterTypeId] })
    },
    onError: (err: Error) => {
      toast.error(`Failed to update question set: ${err.message}`)
    },
  })
}

// ── PDF Preview ───────────────────────────────────────────────────────────────

export interface IrccFormPreviewResult {
  images: {
    page: number
    base64_png?: string
    width?: number
    height?: number
    error?: string
  }[]
  page_count: number
}

/**
 * Mutation to trigger a server-side PDF preview render for a form.
 * Returns base64-encoded PNG images per requested page.
 *
 * Usage:
 *   const preview = useIrccFormPreview()
 *   preview.mutate({ formId, page: 0 })
 */
export function useIrccFormPreview() {
  return useMutation({
    mutationFn: async (params: {
      formId: string
      page?: number
      profileOverrides?: Record<string, unknown>
    }): Promise<IrccFormPreviewResult> => {
      const res = await fetch(`/api/ircc/forms/${params.formId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page: params.page ?? 0,
          profile_overrides: params.profileOverrides ?? {},
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? `Preview failed (${res.status})`)
      }
      return res.json()
    },
    onError: (err: Error) => {
      toast.error(`Preview error: ${err.message}`)
    },
  })
}

// ── Available Forms for a Matter ─────────────────────────────────────────────

/**
 * Get available IRCC form packs for a matter, ordered for the pack selector.
 *
 * Strategy:
 *   1. If caseTypeId provided: fetch ircc_stream_forms for that case type (ordered)
 *   2. Fallback: all active ircc_forms for the tenant (alphabetical by form_code)
 *
 * Returns `{ formCode, label }[]`  -  empty array while loading.
 */
export function useAvailableFormsForMatter(
  caseTypeId: string | null | undefined,
  tenantId: string | null | undefined,
) {
  return useQuery({
    queryKey: ['ircc-available-forms', caseTypeId ?? null, tenantId ?? null],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient()

      if (caseTypeId) {
        const { data, error } = await supabase
          .from('ircc_stream_forms')
          .select('form:ircc_forms(form_code, form_name)')
          .eq('case_type_id', caseTypeId)
          .order('sort_order', { ascending: true })

        if (!error && Array.isArray(data) && data.length > 0) {
          return (data as { form: { form_code: string; form_name: string } | null }[])
            .map((r) => r.form)
            .filter((f): f is { form_code: string; form_name: string } => f !== null)
            .map((f) => ({ formCode: f.form_code, label: f.form_name }))
        }
      }

      // Fallback: all active forms for tenant
      const { data, error } = await supabase
        .from('ircc_forms')
        .select('form_code, form_name')
        .eq('tenant_id', tenantId!)
        .eq('is_active', true)
        .order('form_code', { ascending: true })

      if (error) throw error
      return ((data ?? []) as { form_code: string; form_name: string }[]).map((f) => ({
        formCode: f.form_code,
        label: f.form_name,
      }))
    },
    enabled: !!tenantId,
    staleTime: 60_000,
  })
}

// ── Array Maps ────────────────────────────────────────────────────────────────

/** Fetch all array maps for a form */
export function useIrccFormArrayMaps(formId: string | null) {
  return useQuery({
    queryKey: ['ircc-form-array-maps', formId ?? ''],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient()
      const { data, error } = await supabase
        .from('ircc_form_array_maps')
        .select('*')
        .eq('form_id', formId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as import('@/lib/types/ircc-forms').IrccFormArrayMap[]
    },
    enabled: !!formId,
    staleTime: 30_000,
  })
}

/** Create a new array map */
export function useCreateIrccFormArrayMap() {
  const qc = useQueryClient()
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''

  return useMutation({
    mutationFn: async (input: Omit<import('@/lib/types/ircc-forms').IrccFormArrayMapInsert, 'tenant_id'> & { form_id: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient()
      const { data, error } = await supabase
        .from('ircc_form_array_maps')
        .insert({ ...input, tenant_id: tenantId })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ['ircc-form-array-maps', input.form_id] })
      toast.success('Array map created')
    },
    onError: (err: Error) => toast.error(`Failed to create array map: ${err.message}`),
  })
}

/** Delete an array map by ID */
export function useDeleteIrccFormArrayMap() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ mapId, formId }: { mapId: string; formId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase: any = createClient()
      const { error } = await supabase.from('ircc_form_array_maps').delete().eq('id', mapId)
      if (error) throw error
      return formId
    },
    onSuccess: (_data, { formId }) => {
      qc.invalidateQueries({ queryKey: ['ircc-form-array-maps', formId] })
      toast.success('Array map deleted')
    },
    onError: (err: Error) => toast.error(`Failed to delete array map: ${err.message}`),
  })
}
