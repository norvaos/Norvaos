'use client'

import { Hash, MessageCircle, Briefcase, Users } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage, AvatarGroup } from '@/components/ui/avatar'
import { useChannelDetail, type ChannelDetail } from '@/lib/queries/chat'

function getInitials(first: string | null, last: string | null): string {
  const f = first?.charAt(0) ?? ''
  const l = last?.charAt(0) ?? ''
  return (f + l).toUpperCase() || '?'
}

function ChannelIcon({ type }: { type: string }) {
  switch (type) {
    case 'direct':
      return <MessageCircle className="h-4 w-4 text-muted-foreground" />
    case 'matter':
      return <Briefcase className="h-4 w-4 text-muted-foreground" />
    default:
      return <Hash className="h-4 w-4 text-muted-foreground" />
  }
}

interface ChannelHeaderProps {
  channelId: string
  displayName?: string | null
}

export function ChannelHeader({ channelId, displayName }: ChannelHeaderProps) {
  const { data: channel } = useChannelDetail(channelId)

  const title = displayName || channel?.name || 'Chat'

  return (
    <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
      <div className="flex items-center gap-2">
        <ChannelIcon type={channel?.channel_type ?? 'group'} />
        <h2 className="text-sm font-semibold">{title}</h2>
        {channel?.matter && (
          <span className="text-xs text-muted-foreground">
            &middot; {channel.matter.matter_number}
          </span>
        )}
      </div>

      {/* Member avatars */}
      {channel?.members && channel.members.length > 0 && (
        <div className="flex items-center gap-2">
          <AvatarGroup>
            {channel.members.slice(0, 4).map((m) => (
              <Avatar key={m.user_id} size="sm">
                {m.avatar_url && <AvatarImage src={m.avatar_url} />}
                <AvatarFallback>{getInitials(m.first_name, m.last_name)}</AvatarFallback>
              </Avatar>
            ))}
          </AvatarGroup>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            {channel.members.length}
          </span>
        </div>
      )}
    </div>
  )
}
