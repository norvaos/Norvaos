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

export function useUploadDocument() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      file,
      metadata,
      displayName,
    }: {
      file: File
      metadata: Omit<DocumentInsert, 'file_name' | 'file_type' | 'file_size' | 'storage_path'>
      displayName?: string
    }) => {
      const supabase = createClient()

      // Upload file to Supabase Storage
      const fileExt = file.name.split('.').pop()
      const filePath = `${metadata.tenant_id}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      // Use displayName if provided, otherwise fall back to original file name
      const fileName = displayName || file.name

      // Create document record
      const { data, error } = await supabase
        .from('documents')
        .insert({
          ...metadata,
          file_name: fileName,
          file_type: file.type,
          file_size: file.size,
          storage_path: filePath,
        })
        .select()
        .single()

      if (error) throw error
      return data as Document
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentKeys.all })
      toast.success('Document uploaded successfully')
    },
    onError: (error: Error) => {
      toast.error(`Failed to upload document: ${error.message}`)
    },
  })
}

export function useDeleteDocument() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, storagePath }: { id: string; storagePath: string }) => {
      const supabase = createClient()

      // Delete from storage
      await supabase.storage.from('documents').remove([storagePath])

      // Delete record
      const { error } = await supabase.from('documents').delete().eq('id', id)
      if (error) throw error
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

export function useDownloadDocument() {
  return useMutation({
    mutationFn: async (storagePath: string) => {
      const supabase = createClient()
      const { data, error } = await supabase.storage
        .from('documents')
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
    mutationFn: async (storagePath: string) => {
      const supabase = createClient()
      const { data, error } = await supabase.storage
        .from('documents')
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
