'use client'

import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<string, { label: string; className: string; icon?: boolean }> = {
  not_applicable: {
    label: 'N/A',
    className: 'bg-slate-100 text-slate-500 border-slate-200',
  },
  incomplete: {
    label: 'Incomplete',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  complete: {
    label: 'Complete',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  validated: {
    label: 'Validated',
    className: 'bg-green-50 text-green-700 border-green-200',
  },
  locked: {
    label: 'Locked',
    className: 'bg-slate-100 text-slate-600 border-slate-300',
    icon: true,
  },
}

interface IntakeStatusBadgeProps {
  status?: string | null
  className?: string
}

export function IntakeStatusBadge({ status, className }: IntakeStatusBadgeProps) {
  const config = STATUS_CONFIG[status ?? 'not_applicable'] ?? STATUS_CONFIG.not_applicable

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-tight',
        config.className,
        className
      )}
    >
      {config.icon && <Lock className="h-2.5 w-2.5" />}
      {config.label}
    </span>
  )
}
