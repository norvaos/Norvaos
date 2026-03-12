'use client'

import { Shield } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useRiskOverview } from '@/lib/queries/matter-intake'
import { RISK_LEVELS } from '@/lib/utils/constants'

interface RiskOverviewWidgetProps {
  tenantId: string
  practiceAreaId?: string
}

export function RiskOverviewWidget({ tenantId, practiceAreaId }: RiskOverviewWidgetProps) {
  const { data: counts, isLoading } = useRiskOverview(tenantId, practiceAreaId)
  const router = useRouter()

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!counts || counts.total === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Shield className="size-4 text-slate-400" />
            Risk Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No risk-assessed matters yet.</p>
        </CardContent>
      </Card>
    )
  }

  const maxCount = Math.max(counts.low, counts.medium, counts.high, counts.critical, 1)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Shield className="size-4 text-slate-400" />
          Risk Overview
          <span className="text-muted-foreground font-normal ml-auto text-xs">
            {counts.total} matter{counts.total !== 1 ? 's' : ''}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {RISK_LEVELS.map((level) => {
          const count = counts[level.value as keyof typeof counts] as number
          const pct = (count / maxCount) * 100

          return (
            <button
              key={level.value}
              className="w-full flex items-center gap-3 group hover:opacity-80 transition-opacity text-left"
              onClick={() => router.push(`/matters?riskLevel=${level.value}`)}
            >
              <span className="text-xs w-14 text-muted-foreground">{level.label}</span>
              <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: level.color,
                  }}
                />
              </div>
              <span className="text-sm font-medium w-8 text-right">{count}</span>
            </button>
          )
        })}
      </CardContent>
    </Card>
  )
}
