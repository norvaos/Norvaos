'use client'

import { useEffect, useRef, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useChannelMessages } from '@/lib/queries/chat'
import { MessageBubble } from './message-bubble'

function formatDateSeparator(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday = d.toDateString() === yesterday.toDateString()

  if (isToday) return 'Today'
  if (isYesterday) return 'Yesterday'
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

interface MessageListProps {
  channelId: string
  currentUserId: string
}

export function MessageList({ channelId, currentUserId }: MessageListProps) {
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useChannelMessages(channelId)

  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevMessageCountRef = useRef(0)

  // Flatten pages into a single message array (oldest first)
  const messages = data?.pages
    ? [...data.pages].reverse().flatMap((p) => [...p.messages].reverse())
    : []

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevMessageCountRef.current = messages.length
  }, [messages.length])

  // Scroll to bottom on channel switch
  useEffect(() => {
    prevMessageCountRef.current = 0
    bottomRef.current?.scrollIntoView()
  }, [channelId])

  // Load more on scroll to top
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    if (el.scrollTop < 60 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">
          No messages yet. Start the conversation!
        </p>
      </div>
    )
  }

  // Group messages for date separators and sender grouping
  let lastDate = ''
  let lastSenderId = ''

  return (
    <ScrollArea className="flex-1">
      <div ref={scrollRef} onScroll={handleScroll} className="flex flex-col py-2">
        {isFetchingNextPage && (
          <div className="flex justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {messages.map((msg) => {
          const msgDate = new Date(msg.created_at).toDateString()
          const showDate = msgDate !== lastDate
          const showSender = showDate || msg.sender_id !== lastSenderId

          lastDate = msgDate
          lastSenderId = msg.sender_id

          return (
            <div key={msg.id}>
              {showDate && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {formatDateSeparator(msg.created_at)}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              )}
              <MessageBubble
                message={msg}
                isOwn={msg.sender_id === currentUserId}
                showSender={showSender}
              />
            </div>
          )
        })}

        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
