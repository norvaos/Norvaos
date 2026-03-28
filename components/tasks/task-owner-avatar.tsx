'use client'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { Database } from '@/lib/types/database'

type UserRow = Database['public']['Tables']['users']['Row']

interface TaskOwnerAvatarProps {
  userId: string | null
  users: UserRow[] | undefined
}

const AVATAR_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#ef4444', // red
] as const

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return Math.abs(hash)
}

function getColorFromId(userId: string): string {
  const index = hashString(userId) % AVATAR_COLORS.length
  return AVATAR_COLORS[index]
}

function getInitials(firstName: string | null, lastName: string | null): string {
  const first = firstName?.charAt(0)?.toUpperCase() ?? ''
  const last = lastName?.charAt(0)?.toUpperCase() ?? ''
  return first + last || '?'
}

function getFullName(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(' ') || 'Unknown'
}

export function TaskOwnerAvatar({ userId, users }: TaskOwnerAvatarProps) {
  if (!userId) {
    return (
      <div className="flex h-7 shrink-0 items-center">
        <span className="inline-flex items-center rounded-full border border-amber-500/20 bg-amber-950/30 px-2 py-0.5 text-[10px] font-medium text-amber-600">
          Unassigned
        </span>
      </div>
    )
  }

  if (!users) {
    return null
  }

  const user = users.find((u) => u.id === userId)
  if (!user) {
    return null
  }

  const initials = getInitials(user.first_name, user.last_name)
  const fullName = getFullName(user.first_name, user.last_name)
  const bgColor = getColorFromId(userId)

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white cursor-pointer"
            style={{ backgroundColor: bgColor }}
          >
            {initials}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{fullName}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
