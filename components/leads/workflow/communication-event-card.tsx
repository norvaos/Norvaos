'use client'

import {
  Phone, Mail, MessageSquare, MessageCircle, Bell, Activity,
  ArrowUpRight, ArrowDownLeft, Bot, User, Plug, Sparkles,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatRelativeDate } from '@/lib/utils/formatters'
import {
  getChannelIconName, getDirectionConfig, getActorDisplay, getChannelLabel, getSubtypeLabel,
} from './lead-workflow-helpers'
import type { LeadCommunicationEventRow, UserRow } from './lead-workflow-types'

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  phone: Phone, mail: Mail, 'message-square': MessageSquare,
  'message-circle': MessageCircle, bell: Bell, activity: Activity,
}
const DIRECTION_ICONS: Record<string, React.ElementType> = {
  'arrow-up-right': ArrowUpRight, 'arrow-down-left': ArrowDownLeft, bot: Bot,
}
const ACTOR_ICONS: Record<string, React.ElementType> = {
  user: User, bot: Bot, plug: Plug, sparkles: Sparkles,
}

interface CommunicationEventCardProps {
  event: LeadCommunicationEventRow
  users: UserRow[] | undefined
}

export function CommunicationEventCard({ event, users }: CommunicationEventCardProps) {
  const channelIconName = getChannelIconName(event.channel)
  const ChannelIcon = CHANNEL_ICONS[channelIconName] ?? Activity
  const dirConfig = getDirectionConfig(event.direction)
  const DirIcon = DIRECTION_ICONS[dirConfig.iconName] ?? ArrowUpRight
  const actor = getActorDisplay(event.actor_type, event.actor_user_id, users)
  const ActorIcon = ACTOR_ICONS[actor.iconName] ?? User
  const subtypeLabel = getSubtypeLabel(event.subtype)

  return (
    <div className="flex gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors">
      {/* Channel icon */}
      <div className="flex shrink-0 items-start pt-0.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
          <ChannelIcon className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {/* Top row: channel label + direction + timestamp */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-medium">{getChannelLabel(event.channel)}</span>
          <DirIcon className={`h-3 w-3 ${dirConfig.colour}`} />
          <span>{dirConfig.label}</span>
          <span className="ml-auto shrink-0">{formatRelativeDate(event.occurred_at ?? event.created_at)}</span>
        </div>

        {/* Subject */}
        {event.subject && (
          <p className="mt-0.5 text-sm font-medium text-foreground truncate">
            {event.subject}
          </p>
        )}

        {/* Body preview */}
        {event.body_preview && (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
            {event.body_preview}
          </p>
        )}

        {/* Badges row: actor + subtype + delivery/read status + contact attempt */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {/* Actor badge */}
          <Badge variant="outline" size="xs" className={actor.badgeClass}>
            <ActorIcon className="mr-1 h-3 w-3" />
            {actor.label}
          </Badge>

          {/* Subtype label for automated events */}
          {subtypeLabel && event.actor_type === 'system' && (
            <Badge variant="outline" size="xs" className="bg-slate-50 text-slate-600 border-slate-200">
              {subtypeLabel}
            </Badge>
          )}

          {/* Contact attempt indicator */}
          {event.counts_as_contact_attempt && (
            <Badge variant="outline" size="xs" className="bg-blue-50 text-blue-600 border-blue-200">
              Contact Attempt
            </Badge>
          )}

          {/* Delivery status */}
          {event.delivery_status && event.delivery_status !== 'sent' && (
            <Badge variant="outline" size="xs" className="text-muted-foreground">
              {event.delivery_status}
            </Badge>
          )}
        </div>
      </div>
    </div>
  )
}
