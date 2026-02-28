import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { toast } from 'sonner'

type Note = Database['public']['Tables']['notes']['Row']
type NoteInsert = Database['public']['Tables']['notes']['Insert']

interface NoteListParams {
  tenantId: string
  matterId?: string
  contactId?: string
  leadId?: string
  noteType?: string
  limit?: number
}

export const noteKeys = {
  all: ['notes'] as const,
  lists: () => [...noteKeys.all, 'list'] as const,
  list: (params: NoteListParams) => [...noteKeys.lists(), params] as const,
  byMatter: (matterId: string) => [...noteKeys.all, 'matter', matterId] as const,
  byContact: (contactId: string) => [...noteKeys.all, 'contact', contactId] as const,
  byLead: (leadId: string) => [...noteKeys.all, 'lead', leadId] as const,
  detail: (id: string) => [...noteKeys.all, 'detail', id] as const,
}

export function useNotes(params: NoteListParams) {
  const { tenantId, matterId, contactId, leadId, noteType, limit = 100 } = params

  return useQuery({
    queryKey: noteKeys.list(params),
    queryFn: async () => {
      const supabase = createClient()

      let query = supabase
        .from('notes')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit)

      if (matterId) query = query.eq('matter_id', matterId)
      if (contactId) query = query.eq('contact_id', contactId)
      if (leadId) query = query.eq('lead_id', leadId)
      if (noteType) query = query.eq('note_type', noteType)

      const { data, error } = await query
      if (error) throw error
      return data as Note[]
    },
    enabled: !!tenantId,
  })
}

export function useCreateNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (note: NoteInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('notes')
        .insert(note)
        .select()
        .single()

      if (error) throw error
      return data as Note
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noteKeys.all })
      toast.success('Note added')
    },
    onError: () => {
      toast.error('Failed to add note')
    },
  })
}

export function useUpdateNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<NoteInsert>) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('notes')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as Note
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noteKeys.all })
    },
    onError: () => {
      toast.error('Failed to update note')
    },
  })
}

export function useDeleteNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase.from('notes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noteKeys.all })
      toast.success('Note deleted')
    },
    onError: () => {
      toast.error('Failed to delete note')
    },
  })
}

export function useTogglePinNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, isPinned }: { id: string; isPinned: boolean }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('notes')
        .update({ is_pinned: !isPinned, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noteKeys.all })
    },
    onError: () => {
      toast.error('Failed to update note')
    },
  })
}
