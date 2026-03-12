'use client'

import { useState } from 'react'
import { useActivities } from '@/lib/queries/activities'
import { useNotes } from '@/lib/queries/notes'
import { useAuditLogs } from '@/lib/queries/audit-logs'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { formatRelativeDate, formatDate } from '@/lib/utils/formatters'

import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Mail,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Calendar,
  FileText,
  MessageSquare,
  Clock,
  Edit3,
  PlusCircle,
  Trash2,
  ArrowRight,
  StickyNote,
  Activity,
  History,
} from 'lucide-react'

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

function getActivityIcon(type: string) {
  switch (type) {
    case 'email': return Mail
    case 'phone_call': return Phone
    case 'phone_inbound': return PhoneIncoming
    case 'phone_outbound': return PhoneOutgoing
    case 'meeting': return Calendar
    case 'document': return FileText
    case 'note': return StickyNote
    case 'message': return MessageSquare
    case 'task': return Clock
    default: return Activity
  }
}

function getAuditIcon(action: string) {
  switch (action) {
    case 'create': return PlusCircle
    case 'update': return Edit3
    case 'delete': return Trash2
    case 'stage_change': return ArrowRight
    default: return History
  }
}

function getAuditColor(action: string) {
  switch (action) {
    case 'create': return 'text-green-600 bg-green-50'
    case 'update': return 'text-blue-600 bg-blue-50'
    case 'delete': return 'text-red-600 bg-red-50'
    case 'stage_change': return 'text-purple-600 bg-purple-50'
    default: return 'text-slate-600 bg-slate-50'
  }
}

interface ActivityTimelineProps {
  tenantId: string
  matterId?: string
  contactId?: string
  entityType?: string
  entityId?: string
}

export function ActivityTimeline({ tenantId, matterId, contactId, entityType, entityId }: ActivityTimelineProps) {
  const [activeTab, setActiveTab] = useState('all')

  const { data: activities, isLoading: activitiesLoading } = useActivities({
    tenantId,
    matterId,
    contactId,
    limit: 50,
  })

  const { data: notes, isLoading: notesLoading } = useNotes({
    tenantId,
    matterId,
    contactId,
  })

  const { data: auditLogs, isLoading: auditLoading } = useAuditLogs({
    tenantId,
    entityType,
    entityId,
    limit: 50,
  })

  const { data: users } = useTimelineUsers(tenantId)

  const userMap = new Map(users?.map((u) => [u.id, u]) || [])

  const getUserName = (userId: string | null) => {
    if (!userId) return 'System'
    const user = userMap.get(userId)
    if (!user) return 'Unknown'
    return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email
  }

  const isLoading = activitiesLoading || notesLoading || auditLoading

  // Merge all items into a unified timeline
  const allItems: Array<{
    id: string
    type: 'activity' | 'note' | 'audit'
    title: string
    description: string | null
    userId: string | null
    createdAt: string
    icon: typeof Activity
    iconColor: string
    metadata?: Record<string, unknown>
  }> = []

  activities?.forEach((a) => {
    // Determine icon and color for phone calls based on direction
    let icon = getActivityIcon(a.activity_type)
    let iconColor = 'text-blue-600 bg-blue-50'

    if (a.activity_type === 'phone_call' || a.activity_type === 'phone_inbound' || a.activity_type === 'phone_outbound') {
      const meta = (a.metadata ?? {}) as Record<string, unknown>
      const direction = (meta.call_direction ?? meta.direction) as string | undefined
      if (direction === 'inbound' || a.activity_type === 'phone_inbound') {
        icon = PhoneIncoming
        iconColor = 'text-green-600 bg-green-50'
      } else if (direction === 'outbound' || a.activity_type === 'phone_outbound') {
        icon = PhoneOutgoing
        iconColor = 'text-blue-600 bg-blue-50'
      } else {
        iconColor = 'text-emerald-600 bg-emerald-50'
      }
    }

    allItems.push({
      id: `activity-${a.id}`,
      type: 'activity',
      title: a.title,
      description: a.description,
      userId: a.user_id,
      createdAt: a.created_at,
      icon,
      iconColor,
    })
  })

  notes?.forEach((n) => {
    allItems.push({
      id: `note-${n.id}`,
      type: 'note',
      title: 'Note added',
      description: n.content,
      userId: n.user_id,
      createdAt: n.created_at,
      icon: StickyNote,
      iconColor: 'text-amber-600 bg-amber-50',
    })
  })

  auditLogs?.forEach((log) => {
    const changes = log.changes as Record<string, unknown>
    const changesDesc = Object.keys(changes).length > 0
      ? `Changed: ${Object.keys(changes).join(', ')}`
      : null
    allItems.push({
      id: `audit-${log.id}`,
      type: 'audit',
      title: `${log.action.charAt(0).toUpperCase() + log.action.slice(1)} ${log.entity_type}`,
      description: changesDesc,
      userId: log.user_id,
      createdAt: log.created_at,
      icon: getAuditIcon(log.action),
      iconColor: getAuditColor(log.action),
      metadata: changes,
    })
  })

  // Sort by created_at descending
  allItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const filteredItems = activeTab === 'all'
    ? allItems
    : activeTab === 'notes'
    ? allItems.filter((i) => i.type === 'note')
    : activeTab === 'changes'
    ? allItems.filter((i) => i.type === 'audit')
    : allItems.filter((i) => i.type === 'activity')

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All Activity</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="activities">Events</TabsTrigger>
          <TabsTrigger value="changes">Changes</TabsTrigger>
        </TabsList>
      </Tabs>

      {filteredItems.length > 0 ? (
        <div className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-px bg-slate-200" />
          <div className="space-y-4">
            {filteredItems.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.id} className="flex gap-3 relative">
                  <div
                    className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center z-10 ${item.iconColor}`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0 pt-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-900">{item.title}</p>
                      <Badge variant="outline" className="text-xs py-0">
                        {item.type}
                      </Badge>
                    </div>
                    {item.description && (
                      <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">{item.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                      <span>{getUserName(item.userId)}</span>
                      <span>•</span>
                      <span>{formatRelativeDate(item.createdAt)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-slate-500">
          <History className="mx-auto h-8 w-8 text-slate-300 mb-2" />
          <p className="text-sm">No activity yet</p>
        </div>
      )}
    </div>
  )
}
