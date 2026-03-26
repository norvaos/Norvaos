import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { toast } from 'sonner'

type Document = Database['public']['Tables']['documents']['Row']
type DocumentInsert = Database['public']['Tables']['documents']['Insert']

interface DocumentListParams {
  tenantId: string
  matterId?: string
  contactId?: string
  leadId?: string
  taskId?: string
  category?: string
  limit?: number
}

export type { Document }

export interface AllDocumentsParams {
  tenantId: string
  search?: string
  category?: string
  entityType?: 'matter' | 'contact' | 'lead' | 'task' | 'unlinked'
  limit?: number
  offset?: number
}

export const documentKeys = {
  all: ['documents'] as const,
  lists: () => [...documentKeys.all, 'list'] as const,
  list: (params: DocumentListParams) => [...documentKeys.lists(), params] as const,
  allDocs: (params: AllDocumentsParams) => [...documentKeys.all, 'all-docs', params] as const,
  stats: (tenantId: string) => [...documentKeys.all, 'stats', tenantId] as const,
  byMatter: (matterId: string) => [...documentKeys.all, 'matter', matterId] as const,
  byContact: (contactId: string) => [...documentKeys.all, 'contact', contactId] as const,
  byLead: (leadId: string) => [...documentKeys.all, 'lead', leadId] as const,
  byTask: (taskId: string) => [...documentKeys.all, 'task', taskId] as const,
}

export function useDocuments(params: DocumentListParams) {
  const { tenantId, matterId, contactId, leadId, taskId, category, limit = 100 } = params

  return useQuery({
    queryKey: documentKeys.list(params),
    queryFn: async () => {
      const supabase = createClient()

      let query = supabase
        .from('documents')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (matterId) query = query.eq('matter_id', matterId)
      if (contactId) query = query.eq('contact_id', contactId)
      if (leadId) query = query.eq('lead_id', leadId)
      if (taskId) query = query.eq('task_id', taskId)
      if (category) query = query.eq('category', category)

      const { data, error } = await query
      if (error) throw error
      return data as Document[]
    },
    enabled: !!tenantId,
  })
}

/**
 * Upload a document via server-side API route.
 * Routes through /api/documents/upload for enforcement gating.
 * For enforcement-enabled matters, the server rejects uploads when
 * intake_status is 'incomplete'.
 */
export function useUploadDocument() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      file,
      metadata,
      displayName,
      storageLocation,
    }: {
      file: File
      metadata: Omit<DocumentInsert, 'file_name' | 'file_type' | 'file_size' | 'storage_path'>
      displayName?: string
      storageLocation?: 'local' | 'onedrive'
    }) => {
      const formData = new FormData()
      formData.append('file', file)
      if (metadata.matter_id) formData.append('matter_id', metadata.matter_id)
      if (metadata.contact_id) formData.append('contact_id', metadata.contact_id)
      if (metadata.lead_id) formData.append('lead_id', metadata.lead_id)
      if (metadata.task_id) formData.append('task_id', metadata.task_id)
      if (metadata.category) formData.append('category', metadata.category)
      if (metadata.description) formData.append('description', metadata.description)
      if (displayName) formData.append('display_name', displayName)
      if (storageLocation) formData.append('storage_location', storageLocation)

      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Upload failed')
      }
      return result.document as Document
    },
    // Directive 012: Optimistic UI  -  show the document instantly before server confirms
    onMutate: async (variables) => {
      // Cancel in-flight refetches to prevent overwrite
      await queryClient.cancelQueries({ queryKey: documentKeys.all })

      // Snapshot previous state for rollback
      const matterId = variables.metadata.matter_id
      const previousDocs = matterId
        ? queryClient.getQueryData(documentKeys.byMatter(matterId))
        : undefined

      // Build optimistic document entry
      if (matterId) {
        const optimisticDoc: Partial<Document> = {
          id: `optimistic-${Date.now()}`,
          file_name: variables.displayName || variables.file.name,
          file_type: variables.file.type,
          file_size: variables.file.size,
          matter_id: matterId,
          category: (variables.metadata.category ?? null) as any,
          description: (variables.metadata.description ?? null) as any,
          created_at: new Date().toISOString(),
          is_archived: false,
          storage_path: '',
        }

        // Prepend to matter document list
        queryClient.setQueryData(
          documentKeys.byMatter(matterId),
          (old: Document[] | undefined) => old ? [optimisticDoc as Document, ...old] : [optimisticDoc as Document],
        )
      }

      return { previousDocs, matterId }
    },
    onSuccess: (data, variables, context) => {
      // Replace optimistic entry with real data
      if (context?.matterId) {
        queryClient.setQueryData(
          documentKeys.byMatter(context.matterId),
          (old: Document[] | undefined) =>
            old
              ? old.map((d) => d.id.startsWith('optimistic-') ? data : d)
              : [data],
        )
      }
      // Invalidate all document caches to ensure consistency
      queryClient.invalidateQueries({ queryKey: documentKeys.all })
      // Also invalidate document slots (for readiness tracking)
      if (context?.matterId) {
        queryClient.invalidateQueries({ queryKey: ['document-slots', context.matterId] })
        queryClient.invalidateQueries({ queryKey: ['readiness', context.matterId] })
      }
      const location = variables.storageLocation === 'onedrive' ? 'OneDrive' : 'NorvaOS'
      toast.success(`Document uploaded to ${location}`)
    },
    onError: (error: Error, _variables, context) => {
      // Rollback on failure
      if (context?.matterId && context.previousDocs) {
        queryClient.setQueryData(
          documentKeys.byMatter(context.matterId),
          context.previousDocs,
        )
      }
      toast.error(error.message || 'Failed to upload document')
    },
  })
}

/**
 * Delete a document via server-side API route.
 * Storage deletion requires admin client (storage RLS blocks client-side deletes).
 */
export function useDeleteDocument() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, storagePath }: { id: string; storagePath: string }) => {
      const res = await fetch('/api/documents/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, storagePath }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to delete document')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentKeys.all })
      toast.success('Document deleted')
    },
    onError: () => {
      toast.error('Failed to delete document')
    },
  })
}

export function useShareDocument() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      documentId,
      share,
      displayName,
      category,
      description,
    }: {
      documentId: string
      share: boolean
      displayName?: string
      category?: string
      description?: string
    }) => {
      const res = await fetch('/api/documents/share', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: documentId,
          share,
          display_name: displayName,
          category,
          description,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to share document')
      }
      return res.json()
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: documentKeys.all })
      toast.success(
        variables.share
          ? 'Document shared with client'
          : 'Document unshared from client'
      )
    },
    onError: () => {
      toast.error('Failed to update sharing status')
    },
  })
}

export function useDownloadDocument() {
  return useMutation({
    mutationFn: async ({ storagePath, bucket = 'documents' }: { storagePath: string; bucket?: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase.storage
        .from(bucket)
        .download(storagePath)
      if (error) throw error
      return data
    },
    onError: () => {
      toast.error('Failed to download document')
    },
  })
}

export function useDocumentSignedUrl() {
  return useMutation({
    mutationFn: async ({ storagePath, bucket = 'documents' }: { storagePath: string; bucket?: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(storagePath, 3600)
      if (error) throw error
      return data.signedUrl
    },
  })
}

// ── All Documents (firm-wide library) ────────────────────────────────────────

export interface DocumentWithEntity extends Document {
  matter_title?: string | null
  matter_number?: string | null
}

export function useAllDocuments(params: AllDocumentsParams) {
  const { tenantId, search, category, entityType, limit = 50, offset = 0 } = params

  return useQuery({
    queryKey: documentKeys.allDocs(params),
    queryFn: async (): Promise<{ documents: DocumentWithEntity[]; total: number }> => {
      const supabase = createClient()

      // Join matters via FK (documents.matter_id -> matters.id) to avoid N+1.
      // count: 'exact' counts the primary table (documents) rows, not joined rows.
      let query = supabase
        .from('documents')
        .select('*, matters(id, title, matter_number)', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      // Text search
      if (search) {
        query = query.or(`file_name.ilike.%${search}%,description.ilike.%${search}%`)
      }

      // Category filter
      if (category) query = query.eq('category', category)

      // Entity type filter
      if (entityType === 'matter') query = query.not('matter_id', 'is', null)
      else if (entityType === 'contact') query = query.not('contact_id', 'is', null)
      else if (entityType === 'lead') query = query.not('lead_id', 'is', null)
      else if (entityType === 'task') query = query.not('task_id', 'is', null)
      else if (entityType === 'unlinked') {
        query = query
          .is('matter_id', null)
          .is('contact_id', null)
          .is('lead_id', null)
          .is('task_id', null)
      }

      const { data, error, count } = await query
      if (error) throw error

      // Flatten nested matter data to match DocumentWithEntity return type
      const enriched: DocumentWithEntity[] = (data ?? []).map((d: any) => {
        const { matters, ...rest } = d
        return {
          ...rest,
          matter_title: matters?.title ?? null,
          matter_number: matters?.matter_number ?? null,
        }
      })

      return { documents: enriched, total: count ?? 0 }
    },
    enabled: !!tenantId,
  })
}

// ── Vault Integrity Polling (Sentinel Shield  -  2s interval) ─────────────────

export interface VaultIntegrityRecord {
  id: string
  tamper_status: string | null
  content_hash: string | null
  hash_verified_at: string | null
}

/**
 * Polls tamper_status for all documents in a matter every `intervalMs`.
 * Used by the Sentinel Shield to detect hash corruption in near-real-time.
 */
export function useVaultIntegrityPolling(matterId: string, tenantId: string, intervalMs = 2000) {
  return useQuery({
    queryKey: [...documentKeys.all, 'vault-integrity', matterId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('documents')
        .select('id, tamper_status, content_hash, hash_verified_at')
        .eq('tenant_id', tenantId)
        .eq('matter_id', matterId)
        .eq('is_archived', false)

      if (error) throw error
      return (data ?? []) as VaultIntegrityRecord[]
    },
    enabled: !!tenantId && !!matterId,
    refetchInterval: intervalMs,
    staleTime: 0,
  })
}

// ── Document Scanning (AI Extraction) ────────────────────────────────────────

export interface DocumentScanResult {
  detected_document_type: string
  confidence: number
  extracted_fields: Record<string, string | number | null>
  raw_text_summary: string
}

export function useScanDocument() {
  return useMutation({
    mutationFn: async ({
      file,
      documentTypeHint,
    }: {
      file: File
      documentTypeHint?: string
    }): Promise<DocumentScanResult> => {
      const formData = new FormData()
      formData.append('file', file)
      if (documentTypeHint) formData.append('document_type_hint', documentTypeHint)

      const response = await fetch('/api/documents/scan', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Scan failed')
      }
      return result.data as DocumentScanResult
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to scan document')
    },
  })
}

// ── Document Stats ──────────────────────────────────────────────────────────

export interface DocumentStats {
  totalDocuments: number
  totalSize: number
  categoryCount: number
}

export function useDocumentStats(tenantId: string) {
  return useQuery({
    queryKey: documentKeys.stats(tenantId),
    queryFn: async (): Promise<DocumentStats> => {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('documents')
        .select('file_size, category')
        .eq('tenant_id', tenantId)
        .eq('is_archived', false)

      if (error) throw error

      const docs = data ?? []
      const totalSize = docs.reduce((sum, d) => sum + ((d.file_size as number) ?? 0), 0)
      const categories = new Set(docs.map((d) => d.category))

      return {
        totalDocuments: docs.length,
        totalSize,
        categoryCount: categories.size,
      }
    },
    enabled: !!tenantId,
    staleTime: 2 * 60 * 1000,
  })
}

// ── Retainer PDF Generation ─────────────────────────────────────────────────

export interface RetainerPdfResult {
  ok: boolean
  elapsed_ms: number
  budget_met: boolean
  document: {
    document_id: string
    slot_id: string
    file_name: string
    storage_path: string
  }
  context_summary: {
    matter_number: string
    client: string
    risk_level: string
    clauses_injected: number
    has_risk_disclosure: boolean
    total_amount: string
  }
}

// ── Persist Scan Data (Scan-to-Autofill Pipeline) ─────────────────────────

/**
 * Persists OCR scan results to a document's ai_extracted_data JSONB column.
 * Called after a successful scan + user confirmation so the data is available
 * for intake form pre-filling via useScanPrefill.
 */
export function usePersistScanData() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      documentId,
      scanData,
    }: {
      documentId: string
      scanData: DocumentScanResult
    }) => {
      const response = await fetch('/api/documents/persist-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: documentId,
          scan_data: scanData,
        }),
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to persist scan data')
      }
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentKeys.all })
      queryClient.invalidateQueries({ queryKey: ['scan-prefill'] })
    },
    onError: (error: Error) => {
      console.error('[persist-scan] Failed:', error.message)
      // Silent failure  -  scan data persistence is non-critical
    },
  })
}

// ── Retainer PDF Generation ─────────────────────────────────────────────────

export function useGenerateRetainerPdf() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (matterId: string): Promise<RetainerPdfResult> => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-retainer-pdf`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ matter_id: matterId }),
        }
      )

      const result = await response.json()
      if (!response.ok || !result.ok) {
        throw new Error(result.message || 'Failed to generate retainer PDF')
      }
      return result as RetainerPdfResult
    },
    onSuccess: (data, matterId) => {
      qc.invalidateQueries({ queryKey: documentKeys.all })
      toast.success(
        `Retainer generated in ${data.elapsed_ms}ms  -  ${data.context_summary.matter_number}`
      )
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to generate retainer')
    },
  })
}
