import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

// ─── Query Key Factories ─────────────────────────────────────────────────────

export const bulkImportKeys = {
  all: ['bulk_import'] as const,
  batch: (batchId: string) => [...bulkImportKeys.all, 'batch', batchId] as const,
  staging: (batchId: string, page: number, filter: string) =>
    [...bulkImportKeys.all, 'staging', batchId, page, filter] as const,
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface UploadResponse {
  success: boolean
  batchId: string
  headers: string[]
  suggestedMapping: Record<string, string>
  unmappedHeaders: string[]
  missingRequired: string[]
  totalRows: number
  preview: Record<string, string>[]
  error?: string
}

interface BatchStatus {
  id: string
  status: string
  total_rows: number
  file_name: string
  gatekeeper_summary: {
    phase: string
    total: number
    processed: number
    clear?: number
    conflicts?: number
    needs_review?: number
    invalid?: number
    created?: number
    skipped?: number
    errors?: number
  } | null
  created_at: string
}

interface StagingRow {
  id: string
  row_number: number
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  raw_jurisdiction: string | null
  matched_jurisdiction_id: string | null
  jurisdiction_match_type: string | null
  jurisdiction_match_confidence: number | null
  jurisdiction_needs_review: boolean
  user_jurisdiction_override: string | null
  validation_status: string
  conflict_status: string
  conflict_details: unknown[] | null
  validation_errors: string[] | null
  user_conflict_override: string | null
  committed: boolean
}

interface StagingResponse {
  success: boolean
  rows: StagingRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ─── Upload CSV ──────────────────────────────────────────────────────────────

export function useUploadImportCSV() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { file: File; importSourceId?: string }): Promise<UploadResponse> => {
      const formData = new FormData()
      formData.append('file', params.file)
      if (params.importSourceId) {
        formData.append('importSourceId', params.importSourceId)
      }
      const res = await fetch('/api/leads/import/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: bulkImportKeys.all })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

// ─── Validate (Column Mapping → Gatekeeper) ─────────────────────────────────

export function useValidateImportBatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      batchId: string
      columnMapping: Record<string, string>
      sourceTag?: string
      campaignTag?: string
    }) => {
      const res = await fetch(`/api/leads/import/${params.batchId}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columnMapping: params.columnMapping,
          sourceTag: params.sourceTag,
          campaignTag: params.campaignTag,
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      return data
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: bulkImportKeys.batch(vars.batchId) })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

// ─── Poll Batch Status ───────────────────────────────────────────────────────

export function useBatchStatus(batchId: string | null, polling = false) {
  return useQuery({
    queryKey: bulkImportKeys.batch(batchId ?? ''),
    queryFn: async (): Promise<BatchStatus> => {
      const res = await fetch(`/api/leads/import/${batchId}/status`)
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      return data.batch
    },
    enabled: !!batchId,
    refetchInterval: polling ? 2000 : false,
  })
}

// ─── Staging Rows (Paginated) ────────────────────────────────────────────────

export function useStagingRows(
  batchId: string | null,
  page = 1,
  filter = 'all'
) {
  return useQuery({
    queryKey: bulkImportKeys.staging(batchId ?? '', page, filter),
    queryFn: async (): Promise<StagingResponse> => {
      const params = new URLSearchParams({ page: String(page), filter })
      const res = await fetch(`/api/leads/import/${batchId}/staging?${params}`)
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      return data
    },
    enabled: !!batchId,
  })
}

// ─── Update Staging Row (Override) ───────────────────────────────────────────

export function useUpdateStagingRow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      batchId: string
      rowId: string
      user_conflict_override?: string
      user_jurisdiction_override?: string
    }) => {
      const { batchId, ...body } = params
      const res = await fetch(`/api/leads/import/${batchId}/staging`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: bulkImportKeys.all })
    },
  })
}

// ─── Bulk Fix ────────────────────────────────────────────────────────────────

export function useBulkFixImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      batchId: string
      action: 'fix_jurisdiction' | 'resolve_conflicts'
      jurisdictionId?: string
      conflictOverride?: string
      rowIds?: string[]
    }) => {
      const { batchId, ...body } = params
      const res = await fetch(`/api/leads/import/${batchId}/bulk-fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      return data
    },
    onSuccess: (data) => {
      toast.success(`Updated ${data.updatedCount} rows`)
      qc.invalidateQueries({ queryKey: bulkImportKeys.all })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

// ─── Commit ──────────────────────────────────────────────────────────────────

export function useCommitImportBatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      batchId: string
      pipelineId: string
      stageId: string
      defaultMatterTypeId?: string
    }) => {
      const { batchId, ...body } = params
      const res = await fetch(`/api/leads/import/${batchId}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      return data
    },
    onSuccess: (_, vars) => {
      toast.success('Norva Gatekeeper: commit started')
      qc.invalidateQueries({ queryKey: bulkImportKeys.batch(vars.batchId) })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

// ─── Discard ─────────────────────────────────────────────────────────────────

export function useDiscardImportBatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (batchId: string) => {
      const res = await fetch(`/api/leads/import/${batchId}/discard`, { method: 'DELETE' })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      toast.success('Import batch discarded by Norva Gatekeeper')
      qc.invalidateQueries({ queryKey: bulkImportKeys.all })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}
