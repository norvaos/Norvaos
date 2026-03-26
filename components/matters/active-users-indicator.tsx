'use client'

/**
 * ActiveUsersIndicator — Shows avatars of users currently viewing a matter.
 *
 * Renders an AvatarGroup with online pulse indicators. Each avatar has a
 * tooltip showing the user's name. Excludes the current user from the display
 * (you already know you're here). If only you are viewing, shows nothing.
 */

import { useMemo } from 'react'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  AvatarGroup,
  AvatarGroupCount,
  AvatarBadge,
} from '@/components/ui/avatar'
import type { MatterPresenceUser } from '@/lib/hooks/use-matter-presence'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────

interface ActiveUsersIndicatorProps {
  viewers: MatterPresenceUser[]
  currentUserId: string | null
  /** Max avatars to show before "+N" overflow */
  maxVisible?: number
  className?: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getInitials(firstName: string | null, lastName: string | null, email: string): string {
  if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase()
  if (firstName) return firstName[0].toUpperCase()
  return email[0].toUpperCase()
}

function getDisplayName(user: MatterPresenceUser): string {
  if (user.firstName && user.lastName) return `${user.firstName} ${user.lastName}`
  if (user.firstName) return user.firstName
  return user.email
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ActiveUsersIndicator({
  viewers,
  currentUserId,
  maxVisible = 4,
  className,
}: ActiveUsersIndicatorProps) {
  // Filter out the current user — they don't need to see themselves
  const otherViewers = useMemo(
    () => viewers.filter((v) => v.userId !== currentUserId),
    [viewers, currentUserId],
  )

  if (otherViewers.length === 0) return null

  const visible = otherViewers.slice(0, maxVisible)
  const overflow = otherViewers.length - maxVisible

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <AvatarGroup>
        {visible.map((user) => (
          <Avatar key={user.userId} size="sm" title={getDisplayName(user)}>
            {user.avatarUrl ? (
              <AvatarImage src={user.avatarUrl} alt={getDisplayName(user)} />
            ) : null}
            <AvatarFallback>{getInitials(user.firstName, user.lastName, user.email)}</AvatarFallback>
            {/* Green pulse = online now */}
            <AvatarBadge className="bg-emerald-500 ring-background" />
          </Avatar>
        ))}
        {overflow > 0 && (
          <AvatarGroupCount>
            <span className="text-[10px]">+{overflow}</span>
          </AvatarGroupCount>
        )}
      </AvatarGroup>
      <span className="text-[11px] text-muted-foreground whitespace-nowrap">
        {otherViewers.length === 1
          ? `${getDisplayName(otherViewers[0])} is viewing`
          : `${otherViewers.length} others viewing`}
      </span>
    </div>
  )
}
