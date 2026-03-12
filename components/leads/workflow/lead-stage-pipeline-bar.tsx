'use client'

import { CheckCircle2, Lock, ArrowRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ACTIVE_STAGES, isTerminalStage, isClosedStage, LEAD_STAGES } from '@/lib/config/lead-workflow-definitions'
import type { LeadStage } from '@/lib/config/lead-workflow-definitions'
import { getStageColour, getStageLabel, getTerminalBannerConfig } from './lead-workflow-helpers'
import type { TransitionWithStatus } from './lead-workflow-types'

// ─── Component ──────────────────────────────────────────────────────────────

interface LeadStagePipelineBarProps {
  currentStage: string | null
  transitions: TransitionWithStatus[] | undefined
  onStageClick: (transition: TransitionWithStatus) => void
  convertedMatterId?: string | null
}

export function LeadStagePipelineBar({
  currentStage,
  transitions,
  onStageClick,
  convertedMatterId,
}: LeadStagePipelineBarProps) {
  // Terminal state banners
  const terminalConfig = currentStage ? getTerminalBannerConfig(currentStage) : null

  if (terminalConfig) {
    return <TerminalBanner config={terminalConfig} convertedMatterId={convertedMatterId} />
  }

  // Build transition lookup for quick access
  const transitionMap = new Map<string, TransitionWithStatus>()
  transitions?.forEach((t) => transitionMap.set(t.toStage, t))

  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b overflow-x-auto">
      <TooltipProvider delayDuration={200}>
        {ACTIVE_STAGES.map((stage, idx) => {
          const colours = getStageColour(stage, currentStage)
          const isCurrent = stage === currentStage
          const isPast = colours.state === 'past'
          const isFuture = colours.state === 'future'

          // Can this stage be clicked? Only if there's a valid transition to it
          const transition = transitionMap.get(stage)
          const isClickable = transition != null && !isCurrent && !isPast

          return (
            <div key={stage} className="flex items-center shrink-0">
              {idx > 0 && (
                <ArrowRight className={`h-3 w-3 mx-0.5 ${isPast ? 'text-green-400' : 'text-slate-300'}`} />
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => {
                      if (isClickable && transition) onStageClick(transition)
                    }}
                    disabled={!isClickable}
                    className={`
                      relative flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium
                      transition-all whitespace-nowrap
                      ${colours.bg} ${colours.border} ${colours.text}
                      ${isCurrent ? 'ring-2 ring-primary/20 ring-offset-1' : ''}
                      ${isClickable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}
                      ${!isClickable && isFuture ? 'opacity-60' : ''}
                    `}
                  >
                    {isPast && (
                      <CheckCircle2 className="h-3 w-3 text-green-600" />
                    )}
                    {transition && !transition.allowed && isFuture && (
                      <Lock className="h-3 w-3 text-slate-400" />
                    )}
                    {getStageLabel(stage)}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  {transition && !transition.allowed ? (
                    <div>
                      <p className="font-medium text-sm mb-1">Blocked</p>
                      <ul className="text-xs space-y-0.5">
                        {transition.blockedReasons.map((r, i) => (
                          <li key={i}>• {r}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-xs">{getStageLabel(stage)}</p>
                  )}
                </TooltipContent>
              </Tooltip>
            </div>
          )
        })}
      </TooltipProvider>
    </div>
  )
}

// ─── Terminal Banner ────────────────────────────────────────────────────────

function TerminalBanner({
  config,
  convertedMatterId,
}: {
  config: NonNullable<ReturnType<typeof getTerminalBannerConfig>>
  convertedMatterId?: string | null
}) {
  return (
    <div className={`flex items-center justify-between px-4 py-2.5 border-b ${config.bg} ${config.border}`}>
      <div className="flex items-center gap-2">
        {config.icon === 'check' ? (
          <CheckCircle2 className={`h-5 w-5 ${config.text}`} />
        ) : (
          <Lock className={`h-5 w-5 ${config.text}`} />
        )}
        <span className={`text-sm font-medium ${config.text}`}>
          {config.label}
        </span>
      </div>

      {convertedMatterId && (
        <a
          href={`/matters/${convertedMatterId}`}
          className={`text-sm font-medium ${config.text} hover:underline flex items-center gap-1`}
        >
          View Matter
          <ArrowRight className="h-3 w-3" />
        </a>
      )}
    </div>
  )
}
