'use client'

import { useReadinessScore } from '@/lib/queries/readiness'
import { Loader2, ShieldCheck, AlertTriangle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ReadinessGaugeProps {
  matterId: string
  compact?: boolean
  className?: string
}

const LEVEL_CONFIG = {
  critical: { colour: 'text-red-500', bg: 'bg-red-500', ring: 'stroke-red-500', label: 'Critical', Icon: XCircle },
  low: { colour: 'text-orange-500', bg: 'bg-orange-500', ring: 'stroke-orange-500', label: 'Low', Icon: AlertTriangle },
  medium: { colour: 'text-amber-500', bg: 'bg-amber-500', ring: 'stroke-amber-500', label: 'Medium', Icon: AlertTriangle },
  high: { colour: 'text-emerald-500', bg: 'bg-emerald-500', ring: 'stroke-emerald-500', label: 'High', Icon: ShieldCheck },
  ready: { colour: 'text-emerald-600', bg: 'bg-emerald-600', ring: 'stroke-emerald-600', label: 'Ready', Icon: ShieldCheck },
}

function scoreToLevel(score: number): keyof typeof LEVEL_CONFIG {
  if (score >= 90) return 'ready'
  if (score >= 70) return 'high'
  if (score >= 40) return 'medium'
  if (score >= 20) return 'low'
  return 'critical'
}

export function ReadinessGauge({ matterId, compact, className }: ReadinessGaugeProps) {
  const { data, isLoading } = useReadinessScore(matterId)

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center py-6', className)}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const score = data?.total ?? 0
  const level = scoreToLevel(score)
  const config = LEVEL_CONFIG[level]
  const domains = data?.domains ?? []
  const Icon = config.Icon

  // SVG ring gauge
  const radius = compact ? 32 : 48
  const strokeWidth = compact ? 5 : 7
  const circumference = 2 * Math.PI * radius
  const progress = (score / 100) * circumference
  const svgSize = (radius + strokeWidth) * 2

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      {/* Ring Gauge */}
      <div className="relative">
        <svg width={svgSize} height={svgSize} className="-rotate-90">
          {/* Background ring */}
          <circle
            cx={radius + strokeWidth}
            cy={radius + strokeWidth}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-muted/30"
          />
          {/* Progress ring */}
          <circle
            cx={radius + strokeWidth}
            cy={radius + strokeWidth}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            className={cn(config.ring, 'transition-all duration-700 ease-out')}
          />
        </svg>
        {/* Score text centered */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('font-bold', config.colour, compact ? 'text-lg' : 'text-2xl')}>
            {score}
          </span>
          {!compact && (
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              / 100
            </span>
          )}
        </div>
      </div>

      {/* Level Badge */}
      <div className={cn('flex items-center gap-1.5', config.colour)}>
        <Icon className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
        <span className={cn('font-semibold', compact ? 'text-xs' : 'text-sm')}>
          {config.label}
        </span>
      </div>

      {/* Domain breakdown (non-compact only) */}
      {!compact && domains.length > 0 && (
        <div className="w-full max-w-[200px] space-y-1.5">
          {domains.map((d: any) => (
            <div key={d.name} className="flex items-center gap-2 text-xs">
              <span className="w-20 text-muted-foreground truncate">{d.name}</span>
              <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all duration-500', config.bg)}
                  style={{ width: `${Math.min(100, d.score)}%` }}
                />
              </div>
              <span className="w-6 text-right text-muted-foreground">{d.score}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
