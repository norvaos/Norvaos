'use client'

import { cn } from '@/lib/utils'
import { RISK_LEVELS } from '@/lib/utils/constants'

interface RiskBadgeProps {
  level: string | null | undefined
  score?: number | null
  size?: 'sm' | 'md' | 'lg'
  showScore?: boolean
  className?: string
}

export function RiskBadge({ level, score, size = 'md', showScore = false, className }: RiskBadgeProps) {
  if (!level) return null

  const config = RISK_LEVELS.find((r) => r.value === level)
  if (!config) return null

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-[10px]',
    md: 'px-2 py-0.5 text-xs',
    lg: 'px-2.5 py-1 text-sm',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap',
        sizeClasses[size],
        className
      )}
      style={{
        backgroundColor: `${config.color}15`,
        color: config.color,
        border: `1px solid ${config.color}30`,
      }}
    >
      <span
        className={cn('rounded-full', size === 'sm' ? 'size-1.5' : 'size-2')}
        style={{ backgroundColor: config.color }}
      />
      {config.label}
      {showScore && score != null && (
        <span className="opacity-70">({score})</span>
      )}
    </span>
  )
}
