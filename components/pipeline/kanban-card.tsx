'use client'

import { useMemo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import {
  CalendarClock,
  CircleDollarSign,
  Clock,
  GripVertical,
  User,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { formatCurrency, formatRelativeDate, isOverdue } from '@/lib/utils/formatters'
import { LEAD_TEMPERATURES } from '@/lib/utils/constants'
import type { Database } from '@/lib/types/database'

type Lead = Database['public']['Tables']['leads']['Row']

export interface ContactInfo {
  id: string
  first_name: string | null
  last_name: string | null
  email_primary: string | null
  organization_name: string | null
}

export interface UserInfo {
  id: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
}

export interface KanbanCardDisplayOptions {
  showValues?: boolean
  showFollowUp?: boolean
  showSource?: boolean
  showAssignee?: boolean
  showDaysInStage?: boolean
  showPracticeArea?: boolean
}

interface KanbanCardProps extends KanbanCardDisplayOptions {
  lead: Lead
  contact?: ContactInfo
  assignedUser?: UserInfo
  practiceAreaName?: string | null
  practiceAreaColor?: string | null
  onClick?: (leadId: string) => void
}

function getTemperatureColour(temperature: string | null): string {
  const temp = LEAD_TEMPERATURES.find((t) => t.value === temperature)
  return temp?.color ?? '#6b7280'
}

function getTemperatureLabel(temperature: string | null): string {
  const temp = LEAD_TEMPERATURES.find((t) => t.value === temperature)
  return temp?.label ?? 'Unknown'
}

function getContactDisplayName(contact?: ContactInfo): string {
  if (!contact) return 'Unknown Contact'
  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ')
  return fullName || contact.organization_name || contact.email_primary || 'Unknown Contact'
}

function getContactInitials(contact?: ContactInfo): string {
  if (!contact) return '?'
  const first = contact.first_name?.charAt(0)?.toUpperCase() ?? ''
  const last = contact.last_name?.charAt(0)?.toUpperCase() ?? ''
  if (first || last) return first + last
  if (contact.organization_name) return contact.organization_name.charAt(0).toUpperCase()
  return '?'
}

function getUserInitials(user?: UserInfo): string {
  if (!user) return '?'
  const first = user.first_name?.charAt(0)?.toUpperCase() ?? ''
  const last = user.last_name?.charAt(0)?.toUpperCase() ?? ''
  return first + last || '?'
}

function getUserDisplayName(user?: UserInfo): string {
  if (!user) return 'Unassigned'
  return [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Unassigned'
}

function calculateDaysInStage(lead: Lead): number {
  const stageDate = lead.stage_entered_at ?? lead.created_at
  if (!stageDate) return 0
  const diff = Date.now() - new Date(stageDate).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

export function KanbanCard({
  lead,
  contact,
  assignedUser,
  practiceAreaName,
  practiceAreaColor,
  onClick,
  showValues = true,
  showFollowUp = true,
  showSource = true,
  showAssignee = true,
  showDaysInStage = true,
  showPracticeArea = false,
}: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
    data: {
      type: 'lead',
      lead,
    },
  })

  const style = useMemo(
    () => ({
      transform: CSS.Translate.toString(transform),
      opacity: isDragging ? 0.5 : undefined,
    }),
    [transform, isDragging]
  )

  const daysInStage = calculateDaysInStage(lead)
  const contactName = getContactDisplayName(contact)
  const followUpOverdue = lead.next_follow_up ? isOverdue(lead.next_follow_up) : false

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group cursor-pointer rounded-lg border bg-white p-3 shadow-sm transition-shadow hover:shadow-md',
        isDragging && 'shadow-lg ring-2 ring-primary/20'
      )}
      onClick={() => onClick?.(lead.id)}
    >
      {/* Drag handle and contact name */}
      <div className="flex items-start gap-2">
        <button
          className="mt-0.5 flex-shrink-0 cursor-grab touch-none text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {/* Temperature indicator */}
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="mt-0.5 inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: getTemperatureColour(lead.temperature) }}
                />
              </TooltipTrigger>
              <TooltipContent>
                {getTemperatureLabel(lead.temperature)} lead
              </TooltipContent>
            </Tooltip>

            <span className="truncate text-sm font-medium text-slate-900">
              {contactName}
            </span>
          </div>

          {/* Source & practice area badges */}
          {(showSource && lead.source) || (showPracticeArea && practiceAreaName) ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {showSource && lead.source && (
                <Badge variant="secondary" className="text-[10px] font-normal">
                  {lead.source}
                </Badge>
              )}
              {showPracticeArea && practiceAreaName && (
                <Badge
                  variant="outline"
                  className="text-[10px] font-normal"
                  style={{
                    borderColor: (practiceAreaColor ?? '#6b7280') + '40',
                    color: practiceAreaColor ?? '#6b7280',
                  }}
                >
                  {practiceAreaName}
                </Badge>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Card details */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500">
        {/* Estimated value */}
        {showValues && lead.estimated_value != null && lead.estimated_value > 0 && (
          <div className="flex items-center gap-1">
            <CircleDollarSign className="h-3 w-3" />
            <span className="font-medium text-slate-700">
              {formatCurrency(lead.estimated_value)}
            </span>
          </div>
        )}

        {/* Days in stage */}
        {showDaysInStage && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'flex items-center gap-1',
                  daysInStage >= 14 && 'font-medium text-red-600',
                  daysInStage >= 7 && daysInStage < 14 && 'text-amber-600'
                )}
              >
                <Clock className="h-3 w-3" />
                <span>
                  {daysInStage === 0
                    ? 'Today'
                    : daysInStage === 1
                      ? '1d'
                      : `${daysInStage}d`}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {daysInStage === 0
                ? 'Entered this stage today'
                : `${daysInStage} day${daysInStage !== 1 ? 's' : ''} in this stage`}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Next follow-up */}
        {showFollowUp && lead.next_follow_up && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'flex items-center gap-1',
                  followUpOverdue && 'font-medium text-red-600'
                )}
              >
                <CalendarClock className="h-3 w-3" />
                <span>{formatRelativeDate(lead.next_follow_up)}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {followUpOverdue ? 'Follow-up overdue' : 'Next follow-up'}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Assigned user */}
      {showAssignee && assignedUser && (
        <div className="mt-2.5 flex items-center justify-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Avatar size="sm">
                  {assignedUser.avatar_url && (
                    <AvatarImage src={assignedUser.avatar_url} alt={getUserDisplayName(assignedUser)} />
                  )}
                  <AvatarFallback>{getUserInitials(assignedUser)}</AvatarFallback>
                </Avatar>
              </div>
            </TooltipTrigger>
            <TooltipContent>{getUserDisplayName(assignedUser)}</TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  )
}
