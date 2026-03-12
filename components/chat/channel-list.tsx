'use client'

import { useState, useMemo } from 'react'
import {
  Hash,
  MessageCircle,
  Briefcase,
  Search,
  Plus,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useChannels, type ChatChannel } from '@/lib/queries/chat'
import { cn } from '@/lib/utils'

function ChannelIcon({ type }: { type: string }) {
  switch (type) {
    case 'direct':
      return <MessageCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
    case 'matter':
      return <Briefcase className="h-4 w-4 shrink-0 text-muted-foreground" />
    default:
      return <Hash className="h-4 w-4 shrink-0 text-muted-foreground" />
  }
}

function formatLastMessageTime(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHour = Math.floor(diffMs / 3_600_000)
  const diffDay = Math.floor(diffMs / 86_400_000)

  if (diffMin < 1) return 'now'
  if (diffMin < 60) return `${diffMin}m`
  if (diffHour < 24) return `${diffHour}h`
  if (diffDay < 7) return `${diffDay}d`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

interface ChannelListProps {
  userId: string
  selectedChannelId: string | null
  onSelectChannel: (channel: ChatChannel) => void
  onNewChannel: () => void
}

export function ChannelList({
  userId,
  selectedChannelId,
  onSelectChannel,
  onNewChannel,
}: ChannelListProps) {
  const { data: channels, isLoading } = useChannels(userId)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!channels) return []
    if (!search.trim()) return channels
    const q = search.toLowerCase()
    return channels.filter(
      (ch) =>
        ch.display_name?.toLowerCase().includes(q) ||
        ch.name?.toLowerCase().includes(q)
    )
  }, [channels, search])

  // Group channels by type
  const directChannels = filtered.filter((c) => c.channel_type === 'direct')
  const groupChannels = filtered.filter((c) => c.channel_type === 'group')
  const matterChannels = filtered.filter((c) => c.channel_type === 'matter')

  return (
    <div className="flex h-full w-[280px] shrink-0 flex-col border-r">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-3">
        <h2 className="text-sm font-semibold">Messages</h2>
        <Button size="icon-xs" variant="ghost" onClick={onNewChannel}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {/* Channel list */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="space-y-2 p-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-center text-xs text-muted-foreground">
            {search ? 'No channels found' : 'No conversations yet'}
          </p>
        ) : (
          <div className="p-1.5">
            {directChannels.length > 0 && (
              <ChannelSection
                label="Direct Messages"
                channels={directChannels}
                selectedId={selectedChannelId}
                onSelect={onSelectChannel}
              />
            )}
            {groupChannels.length > 0 && (
              <>
                {directChannels.length > 0 && <Separator className="my-1" />}
                <ChannelSection
                  label="Group Channels"
                  channels={groupChannels}
                  selectedId={selectedChannelId}
                  onSelect={onSelectChannel}
                />
              </>
            )}
            {matterChannels.length > 0 && (
              <>
                {(directChannels.length > 0 || groupChannels.length > 0) && (
                  <Separator className="my-1" />
                )}
                <ChannelSection
                  label="Matter Channels"
                  channels={matterChannels}
                  selectedId={selectedChannelId}
                  onSelect={onSelectChannel}
                />
              </>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

function ChannelSection({
  label,
  channels,
  selectedId,
  onSelect,
}: {
  label: string
  channels: ChatChannel[]
  selectedId: string | null
  onSelect: (ch: ChatChannel) => void
}) {
  return (
    <div>
      <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {channels.map((ch) => (
        <button
          key={ch.id}
          onClick={() => onSelect(ch)}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors',
            'hover:bg-muted/50',
            selectedId === ch.id && 'bg-muted'
          )}
        >
          <ChannelIcon type={ch.channel_type} />

          <div className="flex-1 overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="truncate text-sm font-medium">
                {ch.display_name || ch.name || 'Unnamed'}
              </span>
              {ch.last_message && (
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {formatLastMessageTime(ch.last_message.created_at)}
                </span>
              )}
            </div>
            {ch.last_message && (
              <p className="truncate text-xs text-muted-foreground">
                {ch.last_message.content}
              </p>
            )}
          </div>

          {ch.unread_count > 0 && (
            <Badge variant="default" className="ml-auto h-5 min-w-5 shrink-0 justify-center px-1.5 text-[10px]">
              {ch.unread_count > 99 ? '99+' : ch.unread_count}
            </Badge>
          )}
        </button>
      ))}
    </div>
  )
}
