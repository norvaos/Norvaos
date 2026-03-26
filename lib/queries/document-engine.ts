/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Document Engine  -  React Query Hooks
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Query key factory, fetch hooks, and mutations with surgical invalidation.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

// ─── Query Key Factory ───────────────────────────────────────────────────────

export const documentEngineKeys = {
  all: ['document-engine'] as const,

  // Templates
  templates: () => [...documentEngineKeys.all, 'templates'] as const,
  templateList: (filters?: Record<string, string>) =>
    [...documentEngineKeys.templates(), 'list', filters] as const,
  templateDetail: (id: string) =>
    [...documentEngineKeys.templates(), 'detail', id] as const,

  // Instances
  instances: () => [...documentEngineKeys.all, 'instances'] as const,
  instanceList: (filters?: Record<string, string>) =>
    [...documentEngineKeys.instances(), 'list', filters] as const,
  instanceDetail: (id: string) =>
    [...documentEngineKeys.instances(), 'detail', id] as const,

  // Preview
  preview: (templateId: string, matterId?: string) =>
    [...documentEngineKeys.all, 'preview', templateId, matterId] as const,
}

// ─── Fetch Helpers ───────────────────────────────────────────────────────────

async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const json = await res.json()
  if (!json.success) {
    throw new Error(json.error ?? 'Request failed')
  }
  return json
}

// ─── Template Queries ────────────────────────────────────────────────────────

export function useDocumentTemplates(filters?: { documentFamily?: string; status?: string }) {
  const params = new URLSearchParams()
  if (filters?.documentFamily) params.set('documentFamily', filters.documentFamily)
  if (filters?.status) params.set('status', filters.status)
  const qs = params.toString()

  return useQuery({
    queryKey: documentEngineKeys.templateList(filters as Record<string, string>),
    queryFn: () => fetchApi<{ templates: unknown[] }>(`/api/document-engine/templates${qs ? `?${qs}` : ''}`),
    select: (data) => data.templates,
  })
}

export function useDocumentTemplate(templateId: string | null) {
  return useQuery({
    queryKey: documentEngineKeys.templateDetail(templateId ?? ''),
    queryFn: () => fetchApi<Record<string, unknown>>(`/api/document-engine/templates/${templateId}`),
    enabled: !!templateId,
  })
}

// ─── Template Mutations ──────────────────────────────────────────────────────

export function useCreateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      fetchApi('/api/document-engine/templates', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: documentEngineKeys.templates() })
      toast.success('Template created')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

export function useUpdateTemplate(templateId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      fetchApi(`/api/document-engine/templates/${templateId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: documentEngineKeys.templateDetail(templateId) })
      qc.invalidateQueries({ queryKey: documentEngineKeys.templates() })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

export function useDeleteTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (templateId: string) =>
      fetchApi(`/api/document-engine/templates/${templateId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: documentEngineKeys.templates() })
      toast.success('Template deleted')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

export function usePublishVersion(templateId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (versionId: string) =>
      fetchApi(`/api/document-engine/templates/${templateId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'publish', versionId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: documentEngineKeys.templateDetail(templateId) })
      qc.invalidateQueries({ queryKey: documentEngineKeys.templates() })
      toast.success('Version published')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

export function useCloneTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { sourceTemplateId: string; newTemplateKey: string; newName: string }) =>
      fetchApi(`/api/document-engine/templates/${input.sourceTemplateId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'clone', newTemplateKey: input.newTemplateKey, newName: input.newName }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: documentEngineKeys.templates() })
      toast.success('Template cloned')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

export function useArchiveTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (templateId: string) =>
      fetchApi(`/api/document-engine/templates/${templateId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'archive' }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: documentEngineKeys.templates() })
      toast.success('Template archived')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

// ─── Instance Queries ────────────────────────────────────────────────────────

export function useDocumentInstances(filters?: {
  matterId?: string
  contactId?: string
  status?: string
  documentFamily?: string
}) {
  const params = new URLSearchParams()
  if (filters?.matterId) params.set('matterId', filters.matterId)
  if (filters?.contactId) params.set('contactId', filters.contactId)
  if (filters?.status) params.set('status', filters.status)
  if (filters?.documentFamily) params.set('documentFamily', filters.documentFamily)
  const qs = params.toString()

  return useQuery({
    queryKey: documentEngineKeys.instanceList(filters as Record<string, string>),
    queryFn: () => fetchApi<{ instances: unknown[] }>(`/api/document-engine/instances${qs ? `?${qs}` : ''}`),
    select: (data) => data.instances,
    enabled: !!(filters?.matterId || filters?.contactId),
  })
}

export function useDocumentInstance(instanceId: string | null) {
  return useQuery({
    queryKey: documentEngineKeys.instanceDetail(instanceId ?? ''),
    queryFn: () => fetchApi<Record<string, unknown>>(`/api/document-engine/instances/${instanceId}`),
    enabled: !!instanceId,
  })
}

// ─── Instance Mutations ──────────────────────────────────────────────────────

export function useGenerateDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { templateId: string; matterId: string; contactId?: string; customValues?: Record<string, string> }) =>
      fetchApi('/api/document-engine/instances', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: documentEngineKeys.instances() })
      toast.success('Document generated')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

export function useInstanceAction(instanceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      fetchApi(`/api/document-engine/instances/${instanceId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: documentEngineKeys.instanceDetail(instanceId) })
      qc.invalidateQueries({ queryKey: documentEngineKeys.instances() })

      const action = (variables as Record<string, unknown>).action as string
      const messages: Record<string, string> = {
        approve: 'Document approved',
        send: 'Document marked as sent',
        void: 'Document voided',
        regenerate: 'Document regenerated',
        create_signature_request: 'Signature request created',
      }
      toast.success(messages[action] ?? 'Action completed')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

// ─── Signer Mutations ────────────────────────────────────────────────────────

export function useUpdateSignerStatus(instanceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { signerId: string; status?: string; action?: string; note?: string; declineReason?: string; requestId?: string }) =>
      fetchApi(`/api/document-engine/signature/signers/${input.signerId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: documentEngineKeys.instanceDetail(instanceId) })
      qc.invalidateQueries({ queryKey: documentEngineKeys.instances() })
      toast.success('Signer status updated')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

// ─── Create Version ─────────────────────────────────────────────────────

export function useCreateVersion(templateId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      templateBody: unknown
      versionLabel: string
      changeSummary: string
      mappings?: unknown[]
      conditions?: unknown[]
      clauseAssignments?: unknown[]
    }) =>
      fetchApi(`/api/document-engine/templates/${templateId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'create_version', ...input }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: documentEngineKeys.templateDetail(templateId) })
      qc.invalidateQueries({ queryKey: documentEngineKeys.templates() })
      toast.success('New version saved')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

// ─── Seed Templates ─────────────────────────────────────────────────────────

export function useSeedTemplates() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      fetchApi<{ seeded: string[]; skipped: string[]; errors: string[] }>('/api/document-engine/seed', {
        method: 'POST',
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: documentEngineKeys.templates() })
      const result = data as { seeded: string[]; skipped: string[]; errors: string[] }
      if (result.seeded.length > 0) {
        toast.success(`Seeded: ${result.seeded.join(', ')}`)
      }
      if (result.skipped.length > 0) {
        toast.info(`Already exists: ${result.skipped.join(', ')}`)
      }
      if (result.errors.length > 0) {
        toast.error(`Errors: ${result.errors.join(', ')}`)
      }
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

// ─── Preview ─────────────────────────────────────────────────────────────────

export function usePreviewFields(input: { templateId: string; matterId?: string; contactId?: string; customValues?: Record<string, string> } | null) {
  return useQuery({
    queryKey: documentEngineKeys.preview(input?.templateId ?? '', input?.matterId),
    queryFn: () =>
      fetchApi<{ resolvedFields: unknown[]; missingRequired: unknown[]; conditionEvaluations: unknown[] }>(
        '/api/document-engine/preview-fields',
        { method: 'POST', body: JSON.stringify(input) }
      ),
    enabled: !!input?.templateId,
  })
}
