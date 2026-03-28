'use client'

import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'

interface TrustStatusIndicatorProps {
  /** Trust balance in cents */
  balanceCents: number
  /** Number of invoices overdue >30 days for this matter */
  overdueCount?: number
  /** Whether to show as compact (icon only) or full (with text) */
  variant?: 'compact' | 'full'
}

export function TrustStatusIndicator({
  balanceCents,
  overdueCount = 0,
  variant = 'compact',
}: TrustStatusIndicatorProps) {
  const isZeroBalance = balanceCents <= 0
  const hasOverdue = overdueCount > 0
  const isAlert = isZeroBalance || hasOverdue

  // Determine status
  let status: 'healthy' | 'warning' | 'critical'
  let label: string
  let description: string

  if (isZeroBalance && hasOverdue) {
    status = 'critical'
    label = 'Critical'
    description = `Trust balance is $0.00 and ${overdueCount} invoice${overdueCount > 1 ? 's' : ''} overdue >30 days`
  } else if (isZeroBalance) {
    status = 'critical'
    label = 'Zero Balance'
    description = 'Trust balance is $0.00  -  no funds available'
  } else if (hasOverdue) {
    status = 'warning'
    label = 'Overdue'
    description = `${overdueCount} invoice${overdueCount > 1 ? 's' : ''} overdue >30 days`
  } else {
    status = 'healthy'
    label = 'Healthy'
    description = 'Trust account in good standing'
  }

  const colorMap = {
    healthy: {
      badge: 'bg-emerald-950/30 text-emerald-400 border-emerald-500/20',
      icon: 'text-green-600',
    },
    warning: {
      badge: 'bg-red-950/30 text-red-400 border-red-500/20',
      icon: 'text-red-600',
    },
    critical: {
      badge: 'bg-red-950/40 text-red-400 border-red-500/30',
      icon: 'text-red-400',
    },
  }

  const colors = colorMap[status]
  const Icon = status === 'healthy' ? CheckCircle2 : status === 'warning' ? AlertTriangle : XCircle

  if (variant === 'compact') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`inline-flex items-center ${colors.icon}`}>
              <Icon className="h-4 w-4" />
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">{description}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`text-xs ${colors.badge}`}>
            <Icon className="mr-1 h-3 w-3" />
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
