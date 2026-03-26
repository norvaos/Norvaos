'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

type FormatType = 'number' | 'percent' | 'currency'

interface StatCardProps {
  title: string
  value: number | null | undefined
  previousValue?: number | null
  format?: FormatType
  icon?: LucideIcon
  iconColor?: string
  loading?: boolean
  className?: string
  /** Optional URL  -  clicking the card navigates to this path */
  href?: string
}

function formatValue(value: number, format: FormatType): string {
  switch (format) {
    case 'percent':
      return `${value.toFixed(1)}%`
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value)
    case 'number':
    default:
      return new Intl.NumberFormat('en-US').format(value)
  }
}

function computeDelta(
  current: number | null | undefined,
  previous: number | null | undefined
): { percent: number; direction: 'up' | 'down' | 'neutral' } | null {
  if (current == null || previous == null || previous === 0) return null
  const percent = ((current - previous) / previous) * 100
  if (Math.abs(percent) < 0.5) return { percent: 0, direction: 'neutral' }
  return {
    percent: Math.abs(percent),
    direction: percent > 0 ? 'up' : 'down',
  }
}

export function StatCard({
  title,
  value,
  previousValue,
  format = 'number',
  icon: Icon,
  iconColor = 'text-blue-500',
  loading = false,
  className,
  href,
}: StatCardProps) {
  if (loading) {
    return (
      <Card className={cn('py-4', className)}>
        <CardContent className="px-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-10 w-10 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    )
  }

  const delta = computeDelta(value, previousValue)

  const card = (
    <Card className={cn('py-4', href && 'cursor-pointer transition-shadow hover:shadow-md', className)}>
      <CardContent className="px-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tabular-nums">
              {value != null ? formatValue(value, format) : '--'}
            </p>
            {delta && (
              <div
                className={cn(
                  'flex items-center gap-1 text-xs font-medium',
                  delta.direction === 'up' && 'text-emerald-600',
                  delta.direction === 'down' && 'text-red-500',
                  delta.direction === 'neutral' && 'text-muted-foreground'
                )}
              >
                {delta.direction === 'up' && <TrendingUp className="h-3 w-3" />}
                {delta.direction === 'down' && <TrendingDown className="h-3 w-3" />}
                {delta.direction === 'neutral' && <Minus className="h-3 w-3" />}
                <span>
                  {delta.percent === 0
                    ? 'No change'
                    : `${delta.percent.toFixed(1)}%`}
                </span>
              </div>
            )}
          </div>
          {Icon && (
            <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg bg-muted', iconColor)}>
              <Icon className="h-5 w-5" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )

  if (href) {
    return (
      <Link href={href} className="block no-underline">
        {card}
      </Link>
    )
  }

  return card
}
