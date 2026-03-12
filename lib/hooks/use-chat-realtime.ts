'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRealtime } from '@/lib/hooks/use-realtime'
import { chatKeys, type ChatMessage } from '@/lib/queries/chat'

/**
 * Subscribe to real-time chat message events for a channel.
 *
 * On new message:
 *   - Appends to the TanStack Query cache for this channel's messages
 *   - Invalidates the channel list (unread count change)
 *
 * Wraps the generic `useRealtime` hook with chat-specific logic.
 */
export function useChatRealtime(channelId: string, userId: string) {
  const queryClient = useQueryClient()

  useRealtime<Record<string, unknown>>({
    table: 'chat_messages',
    filter: `channel_id=eq.${channelId}`,
    event: 'INSERT',
    enabled: !!channelId,
    onInsert: (newMessage: Record<string, unknown>) => {
      // Invalidate messages to refetch with sender details
      queryClient.invalidateQueries({
        queryKey: chatKeys.messages(channelId),
      })

      // If message is from another user, bump unread
      if ((newMessage as { sender_id?: string }).sender_id !== userId) {
        queryClient.invalidateQueries({
          queryKey: chatKeys.channels(userId),
        })
      }
    },
  })
}
