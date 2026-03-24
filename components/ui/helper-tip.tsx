'use client'

import { Info } from 'lucide-react'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { HELP_CONTENT, type HelpContentKey } from '@/lib/config/help-content'
import { cn } from '@/lib/utils'

interface HelperTipProps {
  /** Key into the central help dictionary */
  contentKey: HelpContentKey
  /** Additional CSS classes for the icon */
  className?: string
}

/**
 * Global instructional tooltip ("i-button") for field-level help.
 *
 * Usage:
 *   <Label>Billing Type <HelperTip contentKey="matter.billing_type" /></Label>
 *
 * Pulls text from the central HELP_CONTENT dictionary so all help text
 * is maintained in one place. Returns null if the key is not found.
 */
export function HelperTip({ contentKey, className }: HelperTipProps) {
  const text = HELP_CONTENT[contentKey]
  if (!text) return null

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <Info
          className={cn(
            'ml-1 inline size-3.5 cursor-help text-primary opacity-30 transition-opacity hover:opacity-100',
            className
          )}
          aria-label="Help"
        />
      </TooltipTrigger>
      <TooltipContent className="max-w-[280px] text-sm">
        {text}
      </TooltipContent>
    </Tooltip>
  )
}
