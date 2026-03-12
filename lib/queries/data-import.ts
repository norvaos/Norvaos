import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const importKeys = {
  all: ['imports'] as const,
  history: (tenantId: string) => [...importKeys.all, 'history', tenantId] as const,
  batch: (batchId: string) => [...importKeys.all, 'batch', batchId] as const,
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ImportBatchSummary {
  id: string
  sourcePlatform: string
  entityType: string
  status: string
  fileName: string
  totalRows: number
  succeededRows: number
  failedRows: number
  skippedRows: number
  createdAt: string
  completedAt: string | null
  rolledBackAt: string | null
}

interface ImportBatchDetail extends ImportBatchSummary {
  processedRows: number
  duplicateStrategy: string
  columnMapping: Record<string, string>
  validationErrors: unknown[]
  importErrors: unknown[]
  startedAt: string | null
}

interface UploadResponse {
  batchId: string
  detectedHeaders: string[]
  suggestedMapping: Record<string, string>
  unmappedHeaders: string[]
  missingRequired: string[]
  totalRows: number
  previewRows: Record<string, string>[]
}

interface ValidateResponse {
  totalRows: number
  validRows: number
  invalidRows: number
  duplicateRows: number
  errors: { rowNumber: number; field?: string; message: string; severity: string }[]
  duplicates: { rowNumber: number; matchedEntityId: string; matchedOn: string; confidence: string }[]
  previewRows: { rowNumber: number; data: Record<string, unknown>; isDuplicate: boolean }[]
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/**
 * Fetch import history for the tenant.
 */
export function useImportHistory(tenantId: string) {
  return useQuery({
    queryKey: importKeys.history(tenantId),
    queryFn: async (): Promise<ImportBatchSummary[]> => {
      const res = await fetch('/api/import/history')
      if (!res.ok) throw new Error('Failed to fetch import history')
      const json = await res.json()
      return json.batches
    },
    enabled: !!tenantId,
    staleTime: 1000 * 30,
  })
}

/**
 * Fetch a single import batch (for progress polling).
 */
export function useImportBatch(batchId: string | null, polling = false) {
  return useQuery({
    queryKey: importKeys.batch(batchId ?? ''),
    queryFn: async (): Promise<ImportBatchDetail> => {
      const res = await fetch(`/api/import/${batchId}`)
      if (!res.ok) throw new Error('Failed to fetch batch status')
      const json = await res.json()
      return json.batch
    },
    enabled: !!batchId,
    refetchInterval: polling ? 2000 : false,
    staleTime: 0,
  })
}

/**
 * Upload a CSV file to start an import.
 */
export function useUploadImport() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      file: File
      platform: string
      entityType: string
    }): Promise<UploadResponse> => {
      const formData = new FormData()
      formData.append('file', params.file)
      formData.append('platform', params.platform)
      formData.append('entityType', params.entityType)

      const res = await fetch('/api/import/upload', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Upload failed')
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: importKeys.all })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

/**
 * Validate mapped columns and preview the import.
 */
export function useValidateImport() {
  return useMutation({
    mutationFn: async (params: {
      batchId: string
      columnMapping: Record<string, string>
    }): Promise<ValidateResponse> => {
      const res = await fetch('/api/import/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })

      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Validation failed')
      }
      return res.json()
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

/**
 * Execute a validated import batch.
 */
export function useExecuteImport() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      batchId: string
      duplicateStrategy: 'skip' | 'update' | 'create_new'
    }) => {
      const res = await fetch('/api/import/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })

      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Import execution failed')
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: importKeys.all })
      toast.success('Import started.')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

/**
 * Fetch data from a connected platform API.
 */
export function useApiFetch() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      platform: 'ghl' | 'clio'
      entityType: string
    }): Promise<UploadResponse> => {
      const res = await fetch('/api/import/api-fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })

      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'API fetch failed')
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: importKeys.all })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

/**
 * Roll back an import batch.
 */
export function useRollbackImport() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (batchId: string) => {
      const res = await fetch(`/api/import/${batchId}/rollback`, {
        method: 'POST',
      })

      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Rollback failed')
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: importKeys.all })
      toast.success('Import rolled back successfully.')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}
