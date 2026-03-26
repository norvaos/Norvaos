'use client'

import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow, format } from 'date-fns'
import {
  CheckCircle2,
  Clock,
  UserPlus,
  Plus,
  Edit,
  Trash2,
  MessageSquare,
  Loader2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import type { Database } from '@/lib/types/database'

type Activity = Database['public']['Tables']['activities']['Row']

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface TaskActivityLogProps {
  taskId: string
  tenantId: string
}

// ---------------------------------------------------------------------------
// Icon mapping by activity type
// ---------------------------------------------------------------------------
function getActivityIcon(activityType: string) {
  switch (activityType) {
    case 'completed':
    case 'task_completed':
      return CheckCircle2
    case 'status_change':
    case 'status_changed':
      return Clock
    case 'assigned':
    case 'task_assigned':
      return UserPlus
    case 'created':
    case 'task_created':
      return Plus
    case 'updated':
    case 'task_updated':
      return Edit
    case 'deleted':
    case 'task_deleted':
      return Trash2
    case 'comment':
    case 'note':
      return MessageSquare
    default:
      return Clock
  }
}

// ---------------------------------------------------------------------------
// Color classes by activity type
// ---------------------------------------------------------------------------
function getActivityColorClass(activityType: string): string {
  switch (activityType) {
    case 'completed':
    case 'task_completed':
      return 'text-green-600 bg-green-50 dark:bg-green-950/30'
    case 'status_change':
    case 'status_changed':
      return 'text-blue-600 bg-blue-50 dark:bg-blue-950/30'
    case 'assigned':
    case 'task_assigned':
      return 'text-purple-600 bg-purple-50 dark:bg-purple-950/30'
    case 'created':
    case 'task_created':
      return 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30'
    case 'updated':
    case 'task_updated':
      return 'text-amber-600 bg-amber-50 dark:bg-amber-950/30'
    case 'deleted':
    case 'task_deleted':
      return 'text-red-600 bg-red-50 dark:bg-red-950/30'
    case 'comment':
    case 'note':
      return 'text-sky-600 bg-sky-50 dark:bg-sky-950/30'
    default:
      return 'text-muted-foreground bg-muted'
  }
}

// ---------------------------------------------------------------------------
// Timestamp formatting
// ---------------------------------------------------------------------------
function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)

  // If less than 24 hours, show relative time
  if (diffHours < 24) {
    return formatDistanceToNow(date, { addSuffix: true })
  }

  // If yesterday or further, show "Yesterday at 3:00 PM" style
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  if (diffDays < 2) {
    return `Yesterday at ${format(date, 'h:mm a')}`
  }

  // Otherwise show full date
  return format(date, 'MMM d, yyyy \'at\' h:mm a')
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function TaskActivityLog({ taskId, tenantId }: TaskActivityLogProps) {
  const {
    data: activities,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['activities', 'task', taskId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('activities')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('entity_type', 'task')
        .eq('entity_id', taskId)
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error
      return data as Activity[]
    },
    enabled: !!taskId && !!tenantId,
  })

  // ---- Loading state ----
  if (isLoading) {
    return (
      <div className="space-y-4 py-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ---- Empty state ----
  if (!activities || activities.length === 0) {
    return (
      <div className="py-8 text-center">
        <Clock className="mx-auto h-8 w-8 text-muted-foreground/40" />
        <p className="mt-2 text-sm text-muted-foreground">No timeline entries yet</p>
      </div>
    )
  }

  // ---- Timeline ----
  return (
    <div className="relative space-y-0">
      {/* Vertical timeline line */}
      <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />

      {activities.map((activity) => {
        const Icon = getActivityIcon(activity.activity_type)
        const colorClass = getActivityColorClass(activity.activity_type)

        return (
          <div key={activity.id} className="relative flex gap-3 pb-4">
            {/* Icon circle */}
            <div
              className={cn(
                'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                colorClass
              )}
            >
              <Icon className="h-4 w-4" />
            </div>

            {/* Content */}
            <div className="flex-1 pt-0.5">
              <p className="text-sm font-medium leading-tight">
                {activity.title}
              </p>
              {activity.description && (
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                  {activity.description}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {formatTimestamp(activity.created_at ?? '')}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
