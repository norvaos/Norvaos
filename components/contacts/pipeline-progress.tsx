'use client'

import { CheckCircle2, Circle, Loader2, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

// ─── Pipeline Stages ─────────────────────────────────────────────────────────

export const PIPELINE_STAGES = [
  { key: 'new_lead', label: 'New Lead', shortLabel: 'Lead' },
  { key: 'consultation_scheduled', label: 'Consultation Scheduled', shortLabel: 'Scheduled' },
  { key: 'consultation_completed', label: 'Consultation Completed', shortLabel: 'Consulted' },
  { key: 'awaiting_retainer', label: 'Awaiting Retainer', shortLabel: 'Retainer' },
  { key: 'retainer_signed', label: 'Retainer Signed', shortLabel: 'Signed' },
  { key: 'payment_received', label: 'Payment Received', shortLabel: 'Paid' },
  { key: 'conflict_cleared', label: 'Conflict Cleared', shortLabel: 'Cleared' },
  { key: 'ready_to_open', label: 'Ready to Open', shortLabel: 'Ready' },
  { key: 'matter_opened', label: 'Matter Opened', shortLabel: 'Opened' },
] as const

export type PipelineStage = (typeof PIPELINE_STAGES)[number]['key']

function getStageIndex(stage: string): number {
  const idx = PIPELINE_STAGES.findIndex((s) => s.key === stage)
  return idx >= 0 ? idx : 0
}

// ─── Pipeline Progress Component ─────────────────────────────────────────────

interface PipelineProgressProps {
  currentStage: string
  className?: string
  compact?: boolean
  onStageChange?: (stage: string) => void
  isUpdating?: boolean
}

export function PipelineProgress({
  currentStage,
  className,
  compact = false,
  onStageChange,
  isUpdating = false,
}: PipelineProgressProps) {
  const currentIndex = getStageIndex(currentStage)

  if (compact) {
    return (
      <CompactPipeline
        currentIndex={currentIndex}
        currentStage={currentStage}
        className={className}
        onStageChange={onStageChange}
        isUpdating={isUpdating}
      />
    )
  }

  return (
    <div className={cn('w-full', className)}>
      {/* Progress bar */}
      <div className="relative mb-2">
        <div className="h-1.5 w-full rounded-full bg-slate-100">
          <div
            className="h-1.5 rounded-full bg-blue-950/300 transition-all duration-500"
            style={{
              width: `${((currentIndex + 1) / PIPELINE_STAGES.length) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Stage labels  -  clickable if onStageChange provided */}
      <TooltipProvider delayDuration={200}>
        <div className="flex items-start justify-between">
          {PIPELINE_STAGES.map((stage, index) => {
            const isCompleted = index < currentIndex
            const isCurrent = index === currentIndex
            const isPending = index > currentIndex
            const isClickable = !!onStageChange && !isUpdating

            return (
              <Tooltip key={stage.key}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={!isClickable}
                    onClick={() => isClickable && onStageChange(stage.key)}
                    className={cn(
                      'flex flex-col items-center gap-1 transition-opacity',
                      PIPELINE_STAGES.length > 6 ? 'max-w-[60px]' : 'max-w-[80px]',
                      isClickable && 'cursor-pointer hover:opacity-80',
                      !isClickable && 'cursor-default'
                    )}
                  >
                    {/* Status icon */}
                    {isUpdating && isCurrent ? (
                      <Loader2 className="size-4 shrink-0 animate-spin text-blue-500" />
                    ) : isCompleted ? (
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                    ) : isCurrent ? (
                      <div className="size-4 shrink-0 rounded-full border-2 border-blue-500 bg-blue-950/300" />
                    ) : (
                      <Circle className="size-4 shrink-0 text-slate-300" />
                    )}

                    {/* Label */}
                    <span
                      className={cn(
                        'text-center text-[10px] leading-tight',
                        isCompleted && 'font-medium text-emerald-600',
                        isCurrent && 'font-semibold text-blue-600',
                        isPending && 'text-muted-foreground'
                      )}
                    >
                      {stage.shortLabel}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {isClickable ? `Set to: ${stage.label}` : stage.label}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </TooltipProvider>
    </div>
  )
}

// ─── Compact Pipeline (for sidebar / cards) ──────────────────────────────────

function CompactPipeline({
  currentIndex,
  currentStage,
  className,
  onStageChange,
  isUpdating,
}: {
  currentIndex: number
  currentStage: string
  className?: string
  onStageChange?: (stage: string) => void
  isUpdating?: boolean
}) {
  const stageConfig = PIPELINE_STAGES[currentIndex]
  const progress = Math.round(((currentIndex + 1) / PIPELINE_STAGES.length) * 100)
  const nextStage = currentIndex < PIPELINE_STAGES.length - 1 ? PIPELINE_STAGES[currentIndex + 1] : null

  return (
    <div className={cn('space-y-2', className)}>
      {/* Current stage + progress */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-700">
          {stageConfig?.label ?? 'Unknown'}
        </span>
        <span className="text-xs text-muted-foreground">{progress}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-slate-100">
        <div
          className="h-1.5 rounded-full bg-blue-950/300 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <p className="text-[10px] text-muted-foreground">
        Step {currentIndex + 1} of {PIPELINE_STAGES.length}
      </p>

      {/* Stage selector & advance button */}
      {onStageChange && (
        <div className="space-y-2 pt-1 border-t border-slate-100">
          {/* Stage dropdown */}
          <Select
            value={currentStage}
            onValueChange={(val) => onStageChange(val)}
            disabled={isUpdating}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PIPELINE_STAGES.map((stage, idx) => (
                <SelectItem key={stage.key} value={stage.key} className="text-xs">
                  <span className="flex items-center gap-2">
                    {idx < currentIndex ? (
                      <CheckCircle2 className="size-3 text-emerald-500" />
                    ) : idx === currentIndex ? (
                      <div className="size-3 rounded-full border-2 border-blue-500 bg-blue-950/300" />
                    ) : (
                      <Circle className="size-3 text-slate-300" />
                    )}
                    {stage.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Quick advance button */}
          {nextStage && (
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => onStageChange(nextStage.key)}
              className={cn(
                'flex w-full items-center justify-center gap-1.5 rounded-md border border-blue-500/20 bg-blue-950/30 px-2.5 py-1.5 text-xs font-medium text-blue-400 transition-colors',
                'hover:bg-blue-100 hover:border-blue-300',
                isUpdating && 'opacity-50 cursor-not-allowed'
              )}
            >
              {isUpdating ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <ChevronRight className="size-3" />
              )}
              Advance to {nextStage.shortLabel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Pipeline Stage Badge ────────────────────────────────────────────────────

interface PipelineStageBadgeProps {
  stage: string
  className?: string
}

export function PipelineStageBadge({ stage, className }: PipelineStageBadgeProps) {
  const index = getStageIndex(stage)
  const stageConfig = PIPELINE_STAGES[index]

  // Color mapping based on position in pipeline
  const colorClass =
    index < 3
      ? 'bg-blue-950/30 text-blue-400 border-blue-500/20'
      : index < 6
        ? 'bg-amber-950/30 text-amber-400 border-amber-200'
        : index < 8
          ? 'bg-emerald-950/30 text-emerald-400 border-emerald-500/20'
          : 'bg-emerald-950/30 text-emerald-400 border-green-200'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        colorClass,
        className
      )}
    >
      {stageConfig?.label ?? stage}
    </span>
  )
}
