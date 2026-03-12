'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Flag,
  Calendar,
  PhoneIncoming,
  PhoneOutgoing,
  AlertTriangle,
  ArrowLeft,
  FileText,
  CheckCircle2,
  Milestone,
} from 'lucide-react'
import { formatDate } from '@/lib/utils/formatters'
import { useActivities } from '@/lib/queries/activities'

const MILESTONE_TYPES = ['phone_call', 'meeting', 'stage_change', 'no_show', 'document_submitted', 'retainer_signed']

export function MilestonesTab({ matterId, tenantId }: { matterId: string; tenantId: string }) {
  const { data: activities, isLoading } = useActivities({
    tenantId,
    matterId,
    limit: 100,
  })

  const milestones = useMemo(() => {
    if (!activities) return []
    return activities.filter((a) => MILESTONE_TYPES.includes(a.activity_type))
  }, [activities])

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-md" />
        ))}
      </div>
    )
  }

  if (milestones.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Flag className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-muted-foreground">No milestones yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Key events like calls, meetings, stage changes, and document submissions will appear here.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Milestone className="h-4 w-4 text-indigo-500" />
          Key Milestones
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Vertical timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-200" />

          <div className="space-y-4">
            {milestones.map((m) => {
              const meta = (m.metadata ?? {}) as Record<string, unknown>
              let icon = <Flag className="h-4 w-4" />
              let iconBg = 'bg-slate-100 text-slate-600'

              if (m.activity_type === 'phone_call') {
                const dir = meta.direction as string | undefined
                icon = dir === 'inbound'
                  ? <PhoneIncoming className="h-4 w-4" />
                  : <PhoneOutgoing className="h-4 w-4" />
                iconBg = dir === 'inbound' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'
              } else if (m.activity_type === 'meeting') {
                icon = <Calendar className="h-4 w-4" />
                iconBg = 'bg-purple-50 text-purple-600'
              } else if (m.activity_type === 'stage_change') {
                icon = <ArrowLeft className="h-4 w-4 rotate-180" />
                iconBg = 'bg-indigo-50 text-indigo-600'
              } else if (m.activity_type === 'no_show') {
                icon = <AlertTriangle className="h-4 w-4" />
                iconBg = 'bg-red-50 text-red-600'
              } else if (m.activity_type === 'document_submitted') {
                icon = <FileText className="h-4 w-4" />
                iconBg = 'bg-emerald-50 text-emerald-600'
              } else if (m.activity_type === 'retainer_signed') {
                icon = <CheckCircle2 className="h-4 w-4" />
                iconBg = 'bg-green-50 text-green-600'
              }

              return (
                <div key={m.id} className="relative pl-10">
                  {/* Icon circle */}
                  <div className={cn(
                    'absolute left-1 flex h-7 w-7 items-center justify-center rounded-full',
                    iconBg
                  )}>
                    {icon}
                  </div>

                  {/* Content */}
                  <div className="rounded-lg border bg-white p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{m.title}</p>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(m.created_at)}
                      </span>
                    </div>
                    {m.description && (
                      <p className="text-xs text-muted-foreground mt-1">{m.description}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
