'use client'

import { useState, useCallback } from 'react'
import { MessageSquare } from 'lucide-react'
import { useUser } from '@/lib/hooks/use-user'
import { useChatRealtime } from '@/lib/hooks/use-chat-realtime'
import { useMarkChannelRead, type ChatChannel } from '@/lib/queries/chat'
import { ChannelList } from '@/components/chat/channel-list'
import { ChannelHeader } from '@/components/chat/channel-header'
import { MessageList } from '@/components/chat/message-list'
import { MessageInput } from '@/components/chat/message-input'
import { NewChannelDialog } from '@/components/chat/new-channel-dialog'

export default function ChatPage() {
  const { appUser } = useUser()
  const [selectedChannel, setSelectedChannel] = useState<ChatChannel | null>(null)
  const [newChannelOpen, setNewChannelOpen] = useState(false)
  const markRead = useMarkChannelRead()

  const userId = appUser?.id ?? ''
  const tenantId = appUser?.tenant_id ?? ''
  const channelId = selectedChannel?.id ?? ''

  // Subscribe to realtime for the active channel
  useChatRealtime(channelId, userId)

  const handleSelectChannel = useCallback(
    (channel: ChatChannel) => {
      setSelectedChannel(channel)
      // Mark as read when opening
      if (channel.unread_count > 0) {
        markRead.mutate(channel.id)
      }
    },
    [markRead]
  )

  const handleChannelCreated = useCallback(
    (newChannelId: string) => {
      // Set the channel by ID  -  the channel list will refetch and show it
      setSelectedChannel({
        id: newChannelId,
        tenant_id: tenantId,
        name: null,
        channel_type: 'direct',
        matter_id: null,
        created_at: new Date().toISOString(),
        display_name: null,
        last_message: null,
        unread_count: 0,
        member_count: 0,
      })
    },
    [tenantId]
  )

  if (!appUser) return null

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Sidebar */}
      <ChannelList
        userId={userId}
        selectedChannelId={channelId}
        onSelectChannel={handleSelectChannel}
        onNewChannel={() => setNewChannelOpen(true)}
      />

      {/* Main chat area */}
      <div className="flex flex-1 flex-col">
        {selectedChannel ? (
          <>
            <ChannelHeader
              channelId={channelId}
              displayName={selectedChannel.display_name || selectedChannel.name}
            />
            <MessageList channelId={channelId} currentUserId={userId} />
            <MessageInput channelId={channelId} />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
            <MessageSquare className="h-12 w-12 opacity-20" />
            <p className="text-sm">Select a conversation or start a new one</p>
          </div>
        )}
      </div>

      {/* New channel dialog */}
      <NewChannelDialog
        open={newChannelOpen}
        onOpenChange={setNewChannelOpen}
        currentUserId={userId}
        tenantId={tenantId}
        onChannelCreated={handleChannelCreated}
      />
    </div>
  )
}
