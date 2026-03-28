'use client'

import { useMemo } from 'react'
import { useAuditLogs } from '@/lib/queries/audit-logs'
import { useActivities } from '@/lib/queries/activities'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { formatDistanceToNow } from 'date-fns'
import type { Database } from '@/lib/types/database'
import {
  PlusCircle,
  Edit3,
  Trash2,
  ArrowRight,
  History,
  Mail,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Calendar,
  FileText,
  MessageSquare,
  Clock,
  CheckCircle2,
  Activity,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type UserRow = Database['public']['Tables']['users']['Row']

function useTimelineUsers(tenantId: string) {
  return useQuery({
    queryKey: ['timeline-users', tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('tenant_id', tenantId)
      if (error) throw error
      return data as UserRow[]
    },
    enabled: !!tenantId,
  })
}

function getIcon(type: string, action: string) {
  if (type === 'audit') {
    switch (action) {
      case 'created': return PlusCircle
      case 'updated': return Edit3
      case 'deleted':
      case 'archived': return Trash2
      case 'stage_changed': return ArrowRight
      case 'completed': return CheckCircle2
      case 'converted': return ArrowRight
      default: return History
    }
  }
  // activity types
  switch (action) {
    case 'email': return Mail
    case 'phone_call': return Phone
    case 'phone_inbound': return PhoneIncoming
    case 'phone_outbound': return PhoneOutgoing
    case 'meeting': return Calendar
    case 'document': return FileText
    case 'note': return MessageSquare
    case 'task': return Clock
    default: return Activity
  }
}

function getColorClass(type: string, action: string): string {
  if (type === 'audit') {
    switch (action) {
      case 'created': return 'text-emerald-600 bg-emerald-950/30'
      case 'updated': return 'text-blue-600 bg-blue-950/30'
      case 'deleted':
      case 'archived': return 'text-red-500 bg-red-950/30'
      case 'stage_changed': return 'text-violet-600 bg-violet-50'
      case 'completed': return 'text-green-600 bg-emerald-950/30'
      case 'converted': return 'text-indigo-600 bg-indigo-50'
      default: return 'text-slate-500 bg-slate-50'
    }
  }
  // activity types
  switch (action) {
    case 'phone_inbound': return 'text-green-600 bg-emerald-950/30'
    case 'phone_outbound': return 'text-blue-600 bg-blue-950/30'
    case 'phone_call': return 'text-emerald-600 bg-emerald-950/30'
    case 'meeting': return 'text-purple-600 bg-purple-950/30'
    default: return 'text-blue-500 bg-blue-950/30'
  }
}

function formatAuditTitle(action: string, entityType: string): string {
  const actionLabel = action.replace(/_/g, ' ')
  const entityLabel = entityType.replace(/_/g, ' ')
  return `${actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1)} ${entityLabel}`
}

interface MiniTimelineProps {
  tenantId: string
  entityType?: string
  entityId?: string
  matterId?: string
  contactId?: string
  /** Max items to display */
  limit?: number
  /** Show "View All" link text */
  className?: string
}

/**
 * A compact, inline timeline showing the most recent activity.
 * Perfect for embedding in overview tabs, sidebars, and cards.
 */
export function MiniTimeline({
  tenantId,
  entityType,
  entityId,
  matterId,
  contactId,
  limit = 5,
  className,
}: MiniTimelineProps) {
  const { data: auditLogs, isLoading: auditLoading } = useAuditLogs({
    tenantId,
    entityType,
    entityId,
    limit: 20,
  })

  const { data: activities, isLoading: activitiesLoading } = useActivities({
    tenantId,
    matterId,
    contactId,
    limit: 20,
  })

  const { data: users } = useTimelineUsers(tenantId)
  const userMap = useMemo(() => new Map(users?.map((u) => [u.id, u]) || []), [users])

  const getUserName = (userId: string | null) => {
    if (!userId) return 'System'
    const user = userMap.get(userId)
    if (!user) return 'Unknown'
    return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email
  }

  const items = useMemo(() => {
    const merged: Array<{
      id: string
      type: 'audit' | 'activity'
      action: string
      title: string
      description: string | null
      userId: string | null
      createdAt: string
      entityType: string
    }> = []

    auditLogs?.forEach((log) => {
      const changes = (log.changes != null ? log.changes : {}) as Record<string, unknown>
      const changesDesc = Object.keys(changes).length > 0
        ? `Changed: ${Object.keys(changes).join(', ')}`
        : null
      merged.push({
        id: `audit-${log.id}`,
        type: 'audit',
        action: log.action,
        title: formatAuditTitle(log.action, log.entity_type),
        description: changesDesc,
        userId: log.user_id,
        createdAt: log.created_at ?? '',
        entityType: log.entity_type,
      })
    })

    activities?.forEach((a) => {
      merged.push({
        id: `activity-${a.id}`,
        type: 'activity',
        action: a.activity_type,
        title: a.title,
        description: a.description,
        userId: a.user_id,
        createdAt: a.created_at ?? '',
        entityType: 'activity',
      })
    })

    merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return merged.slice(0, limit)
  }, [auditLogs, activities, limit])

  const isLoading = auditLoading || activitiesLoading

  if (isLoading) {
    return (
      <div className={cn('space-y-2', className)}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-2 animate-pulse">
            <div className="h-6 w-6 rounded-full bg-slate-100 shrink-0" />
            <div className="flex-1 space-y-1">
              <div className="h-3 w-3/4 bg-slate-100 rounded" />
              <div className="h-2.5 w-1/2 bg-slate-50 rounded" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className={cn('py-4 text-center', className)}>
        <History className="mx-auto h-5 w-5 text-slate-300 mb-1" />
        <p className="text-xs text-slate-400">No timeline entries yet</p>
      </div>
    )
  }

  return (
    <div className={cn('relative', className)}>
      {/* Vertical line */}
      <div className="absolute left-3 top-1 bottom-1 w-px bg-slate-100" />

      <div className="space-y-2.5">
        {items.map((item) => {
          const Icon = getIcon(item.type, item.action)
          const colorClass = getColorClass(item.type, item.action)

          return (
            <div key={item.id} className="flex gap-2.5 relative">
              <div
                className={cn(
                  'relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                  colorClass
                )}
              >
                <Icon className="h-3 w-3" />
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <p className="text-xs font-medium text-slate-700 leading-tight truncate">
                  {item.title}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] text-slate-400 truncate">
                    {getUserName(item.userId)}
                  </span>
                  <span className="text-[10px] text-slate-300">·</span>
                  <span className="text-[10px] text-slate-400 whitespace-nowrap">
                    {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
