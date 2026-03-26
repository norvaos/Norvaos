'use client'

import { Badge } from '@/components/ui/badge'
import type { TasksByAssigneeData } from '@/lib/queries/reports'

interface Props {
  data: TasksByAssigneeData[]
}

export default function BottleneckTable({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
        No task data for this period.
      </div>
    )
  }

  // Show top 6 by overdue count
  const top = data.slice(0, 6)

  return (
    <div className="space-y-2">
      {top.map((row) => (
        <div
          key={row.user_name}
          className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
        >
          <span className="text-sm font-medium truncate">{row.user_name}</span>
          <div className="flex items-center gap-2 shrink-0">
            {row.overdue_count > 0 && (
              <Badge variant="destructive" className="text-xs">
                {row.overdue_count} overdue
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs">
              {row.open_count} open
            </Badge>
            <Badge variant="outline" className="text-xs">
              {row.completed_count} done
            </Badge>
          </div>
        </div>
      ))}
    </div>
  )
}
