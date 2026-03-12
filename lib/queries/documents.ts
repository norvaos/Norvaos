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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: documentKeys.all })
      const location = variables.storageLocation === 'onedrive' ? 'OneDrive' : 'NorvaOS'
      toast.success(`Document uploaded to ${location}`)
    },
    onError: (error: Error) => {
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
