'use client'

import { Badge } from '@/components/ui/badge'
import { Shield, UserPlus, ShieldCheck, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

type GateType = 'inquiry' | 'screening' | 'retained'

interface RegulatoryGateBadgeProps {
  gate: GateType
  className?: string
}

const GATE_CONFIG: Record<GateType, {
  label: string
  tooltip: string
  icon: typeof Shield
  colour: string
}> = {
  inquiry: {
    label: 'INQUIRY GATE',
    tooltip: 'LSO/LSBC Requirement: Conflict search must be completed before collecting personal data.',
    icon: Shield,
    colour: 'border-blue-300 bg-blue-50 text-blue-700',
  },
  screening: {
    label: 'SCREENING GATE',
    tooltip: 'CICC/LSO Requirement: Identity must be verified before retaining a client.',
    icon: UserPlus,
    colour: 'border-amber-300 bg-amber-50 text-amber-700',
  },
  retained: {
    label: 'RETAINED GATE',
    tooltip: 'All compliance checks must pass: KYC verified, conflict cleared, retainer signed and hash-locked.',
    icon: Lock,
    colour: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  },
}

export function RegulatoryGateBadge({ gate, className }: RegulatoryGateBadgeProps) {
  const config = GATE_CONFIG[gate]
  const Icon = config.icon

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              'text-[9px] gap-1 animate-in fade-in zoom-in duration-300',
              config.colour,
              className
            )}
          >
            <Icon className="size-2.5" />
            {config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs max-w-xs">
          {config.tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
