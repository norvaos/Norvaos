'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { ChatMessage } from '@/lib/queries/chat'

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return name.charAt(0).toUpperCase()
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

interface MessageBubbleProps {
  message: ChatMessage
  isOwn: boolean
  showSender: boolean
}

export function MessageBubble({ message, isOwn, showSender }: MessageBubbleProps) {
  if (message.is_deleted) {
    return (
      <div className="flex justify-center py-1">
        <span className="text-xs text-muted-foreground italic">
          This message was deleted
        </span>
      </div>
    )
  }

  return (
    <div className={`group flex gap-2.5 px-4 py-0.5 ${isOwn ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className="w-8 shrink-0">
        {showSender && (
          <Avatar size="sm">
            {message.sender_avatar_url && (
              <AvatarImage src={message.sender_avatar_url} alt={message.sender_name} />
            )}
            <AvatarFallback>{getInitials(message.sender_name)}</AvatarFallback>
          </Avatar>
        )}
      </div>

      {/* Content */}
      <div className={`flex max-w-[70%] flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
        {showSender && (
          <div className="mb-0.5 flex items-center gap-2">
            <span className="text-xs font-medium text-foreground">
              {message.sender_name}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {formatTime(message.created_at)}
            </span>
          </div>
        )}

        <div
          className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
            isOwn
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-foreground'
          }`}
        >
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>

        {!showSender && (
          <span className="mt-0.5 hidden text-[10px] text-muted-foreground group-hover:block">
            {formatTime(message.created_at)}
          </span>
        )}

        {message.is_edited && (
          <span className="mt-0.5 text-[10px] text-muted-foreground">(edited)</span>
        )}
      </div>
    </div>
  )
}
