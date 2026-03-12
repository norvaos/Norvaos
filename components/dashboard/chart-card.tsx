'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface ChartCardProps {
  title: string
  subtitle?: string
  children: ReactNode
  loading?: boolean
  className?: string
  /** Height of the chart area (for skeleton). Default: 300 */
  chartHeight?: number
  /** Optional action element (e.g. export button) rendered in the card header */
  action?: ReactNode
}

export function ChartCard({
  title,
  subtitle,
  children,
  loading = false,
  className,
  chartHeight = 300,
  action,
}: ChartCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-semibold">{title}</CardTitle>
            {subtitle && <CardDescription>{subtitle}</CardDescription>}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className={cn('w-full rounded-md')} style={{ height: chartHeight }} />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )
}
