import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ChatChannel {
  id: string
  tenant_id: string
  name: string | null
  channel_type: string
  matter_id: string | null
  created_at: string
  display_name: string | null
  last_message: {
    id: string
    content: string
    sender_id: string
    created_at: string
  } | null
  unread_count: number
  member_count: number
}

export interface ChatMessage {
  id: string
  tenant_id: string
  channel_id: string
  sender_id: string
  content: string
  attachments: unknown
  mentions: string[]
  matter_id: string | null
  document_id: string | null
  task_id: string | null
  is_edited: boolean
  edited_at: string | null
  is_deleted: boolean
  created_at: string
  sender_name: string
  sender_avatar_url: string | null
}

interface ChannelMember {
  id: string
  user_id: string
  last_read_at: string | null
  joined_at: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
}

export interface ChannelDetail {
  id: string
  tenant_id: string
  name: string | null
  channel_type: string
  matter_id: string | null
  created_at: string
  members: ChannelMember[]
  matter: { id: string; title: string; matter_number: string } | null
}

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const chatKeys = {
  all: ['chat'] as const,
  channels: (userId: string) => [...chatKeys.all, 'channels', userId] as const,
  channelDetail: (channelId: string) => [...chatKeys.all, 'channel', channelId] as const,
  messages: (channelId: string) => [...chatKeys.all, 'messages', channelId] as const,
  unreadCount: (userId: string) => [...chatKeys.all, 'unread', userId] as const,
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

export function useChannels(userId: string) {
  return useQuery({
    queryKey: chatKeys.channels(userId),
    queryFn: async () => {
      const res = await fetch('/api/chat/channels')
      if (!res.ok) throw new Error('Failed to fetch channels')
      const data = await res.json()
      return data.channels as ChatChannel[]
    },
    enabled: !!userId,
  })
}

export function useChannelDetail(channelId: string) {
  return useQuery({
    queryKey: chatKeys.channelDetail(channelId),
    queryFn: async () => {
      const res = await fetch(`/api/chat/channels/${channelId}`)
      if (!res.ok) throw new Error('Failed to fetch channel')
      const data = await res.json()
      return data.channel as ChannelDetail
    },
    enabled: !!channelId,
  })
}

export function useChannelMessages(channelId: string) {
  return useInfiniteQuery({
    queryKey: chatKeys.messages(channelId),
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '50' })
      if (pageParam) params.set('cursor', pageParam)
      const res = await fetch(`/api/chat/channels/${channelId}/messages?${params}`)
      if (!res.ok) throw new Error('Failed to fetch messages')
      return res.json() as Promise<{
        messages: ChatMessage[]
        has_more: boolean
        next_cursor: string | null
      }>
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.has_more ? lastPage.next_cursor ?? undefined : undefined,
    enabled: !!channelId,
  })
}

export function useSendMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      channelId,
      content,
      mentions,
    }: {
      channelId: string
      content: string
      mentions?: string[]
    }) => {
      const res = await fetch(`/api/chat/channels/${channelId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, mentions }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to send message')
      }
      return res.json() as Promise<{ message: ChatMessage }>
    },
    onSuccess: ({ message }) => {
      // Append to messages cache
      queryClient.invalidateQueries({ queryKey: chatKeys.messages(message.channel_id) })
      // Update channel list (last message changed)
      queryClient.invalidateQueries({ queryKey: chatKeys.all })
    },
    onError: () => {
      toast.error('Failed to send message')
    },
  })
}

export function useCreateChannel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      name,
      channel_type,
      member_ids,
      matter_id,
    }: {
      name?: string
      channel_type: string
      member_ids: string[]
      matter_id?: string
    }) => {
      const res = await fetch('/api/chat/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, channel_type, member_ids, matter_id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to create channel')
      }
      return res.json() as Promise<{ channel: ChatChannel }>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.all })
      toast.success('Channel created')
    },
    onError: () => {
      toast.error('Failed to create channel')
    },
  })
}

export function useFindDirectChannel() {
  return useMutation({
    mutationFn: async (otherUserId: string) => {
      const res = await fetch('/api/chat/direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: otherUserId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to find/create DM')
      }
      return res.json() as Promise<{ channel: ChatChannel; created: boolean }>
    },
  })
}

export function useMarkChannelRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (channelId: string) => {
      const res = await fetch(`/api/chat/channels/${channelId}/read`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Failed to mark as read')
      return channelId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.all })
    },
  })
}

export function useChatUnreadCount(userId: string) {
  const { data: channels } = useChannels(userId)
  const total = channels?.reduce((sum, ch) => sum + ch.unread_count, 0) ?? 0
  return total
}
