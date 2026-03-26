'use client'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Lock, Unlock, Trophy, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChainLockButtonProps {
  canConvert: boolean
  missingItems: string[]
  onClick: () => void
  isLoading?: boolean
  className?: string
}

export function ChainLockButton({
  canConvert,
  missingItems,
  onClick,
  isLoading,
  className,
}: ChainLockButtonProps) {
  const tooltipContent = canConvert
    ? 'All compliance checks passed. Click to convert to an active matter.'
    : `Cannot convert yet. Missing:\n${missingItems.map((item) => `• ${item}`).join('\n')}`

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="lg"
            disabled={!canConvert || isLoading}
            onClick={onClick}
            className={cn(
              'w-full gap-2 transition-all duration-500',
              canConvert
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-200/50 animate-pulse'
                : 'bg-slate-100 text-slate-400 border border-slate-300 cursor-not-allowed',
              className
            )}
          >
            {isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : canConvert ? (
              <Trophy className="size-4" />
            ) : (
              <Lock className="size-4" />
            )}
            {canConvert ? 'Convert to Active Matter' : 'Conversion Locked'}
          </Button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="text-xs max-w-xs whitespace-pre-line"
        >
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
