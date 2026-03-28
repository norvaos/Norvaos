'use client'

import { Badge } from '@/components/ui/badge'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProspectiveLeadBadgeProps {
  visible: boolean
  className?: string
}

export function ProspectiveLeadBadge({ visible, className }: ProspectiveLeadBadgeProps) {
  if (!visible) return null

  return (
    <div className={cn('flex items-center justify-center', className)}>
      <Badge
        variant="outline"
        className={cn(
          'text-sm gap-1.5 px-4 py-1.5',
          'border-yellow-400 bg-gradient-to-r from-yellow-50 to-amber-50 text-yellow-400',
          'shadow-sm shadow-yellow-200/50',
          'animate-in zoom-in-50 fade-in duration-500',
        )}
      >
        <Sparkles className="size-4 text-yellow-500" />
        PROSPECTIVE LEAD
        <Sparkles className="size-4 text-yellow-500" />
      </Badge>
    </div>
  )
}
