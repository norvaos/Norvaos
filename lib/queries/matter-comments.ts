'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { toast } from 'sonner'

type MatterCommentRow = Database['public']['Tables']['matter_comments']['Row']
type MatterCommentInsert = Database['public']['Tables']['matter_comments']['Insert']

// Extended type with author info and threaded replies
export interface MatterComment extends MatterCommentRow {
  authorName: string | null
  authorAvatarUrl: string | null
  replies: MatterComment[]
}

// ── Query Keys ──────────────────────────────────────────────────────────────

export const matterCommentKeys = {
  all: ['matter-comments'] as const,
  list: (matterId: string) => [...matterCommentKeys.all, matterId] as const,
}

// ── Fetch all comments for a matter (threaded) ──────────────────────────────

export function useMatterComments(matterId: string) {
  return useQuery({
    queryKey: matterCommentKeys.list(matterId),
    queryFn: async () => {
      const supabase = createClient()

      // 1. Fetch all active comments for this matter
      const { data: comments, error } = await supabase
        .from('matter_comments')
        .select('*')
        .eq('matter_id', matterId)
        .eq('is_active', true)
        .order('created_at', { ascending: true })

      if (error) throw error
      if (!comments || comments.length === 0) return [] as MatterComment[]

      // 2. Collect unique author IDs by type
      const userIds = [
        ...new Set(
          comments
            .filter((c) => c.author_type === 'user' && c.author_user_id)
            .map((c) => c.author_user_id!)
        ),
      ]
      const contactIds = [
        ...new Set(
          comments
            .filter((c) => c.author_type === 'client' && c.author_contact_id)
            .map((c) => c.author_contact_id!)
        ),
      ]

      // 3. Fetch author names separately (no FK joins available)
      const userMap = new Map<string, { name: string; avatarUrl: string | null }>()
      const contactMap = new Map<string, { name: string }>()

      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, first_name, last_name, avatar_url')
          .in('id', userIds)
        if (users) {
          for (const u of users) {
            const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Unknown User'
            userMap.set(u.id, { name, avatarUrl: u.avatar_url })
          }
        }
      }

      if (contactIds.length > 0) {
        const { data: contacts } = await supabase
          .from('contacts')
          .select('id, first_name, last_name')
          .in('id', contactIds)
        if (contacts) {
          for (const c of contacts) {
            const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown Contact'
            contactMap.set(c.id, { name })
          }
        }
      }

      // 4. Enrich comments with author info
      const enriched: MatterComment[] = comments.map((c) => {
        let authorName: string | null = null
        let authorAvatarUrl: string | null = null

        if (c.author_type === 'user' && c.author_user_id) {
          const info = userMap.get(c.author_user_id)
          authorName = info?.name ?? 'Unknown User'
          authorAvatarUrl = info?.avatarUrl ?? null
        } else if (c.author_type === 'client' && c.author_contact_id) {
          const info = contactMap.get(c.author_contact_id)
          authorName = info?.name ?? 'Unknown Contact'
        }

        return { ...c, authorName, authorAvatarUrl, replies: [] }
      })

      // 5. Build threaded structure
      const commentMap = new Map<string, MatterComment>()
      const rootComments: MatterComment[] = []

      for (const comment of enriched) {
        commentMap.set(comment.id, comment)
      }

      for (const comment of enriched) {
        if (comment.parent_id && commentMap.has(comment.parent_id)) {
          commentMap.get(comment.parent_id)!.replies.push(comment)
        } else {
          rootComments.push(comment)
        }
      }

      return rootComments
    },
    enabled: !!matterId,
  })
}

// ── Create comment ──────────────────────────────────────────────────────────

export function useCreateMatterComment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (comment: MatterCommentInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_comments')
        .insert(comment)
        .select()
        .single()
      if (error) throw error
      return data as MatterCommentRow
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: matterCommentKeys.list(variables.matter_id) })
      toast.success('Comment added')
    },
    onError: () => {
      toast.error('Failed to add comment')
    },
  })
}

// ── Soft-delete comment ─────────────────────────────────────────────────────

export function useDeleteMatterComment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ commentId, matterId }: { commentId: string; matterId: string }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('matter_comments')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', commentId)
      if (error) throw error
      return { matterId }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: matterCommentKeys.list(data.matterId) })
      toast.success('Comment removed')
    },
    onError: () => {
      toast.error('Failed to remove comment')
    },
  })
}
