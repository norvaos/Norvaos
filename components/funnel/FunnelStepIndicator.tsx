'use client'

import { Check, Lock, CircleDot } from 'lucide-react'
import { useFunnelContext, type FunnelStep } from './FunnelContext'

// ── Step metadata ────────────────────────────────────────────────────────────

const STEPS: { key: FunnelStep; number: number; label: string }[] = [
  { key: 'verification', number: 1, label: 'Setup & Eligibility' },
  { key: 'workspace', number: 2, label: 'Workspace' },
  { key: 'approval', number: 3, label: 'Assembly' },
]

const STEP_ORDER: FunnelStep[] = ['verification', 'workspace', 'approval']

function stepIndex(step: FunnelStep): number {
  return STEP_ORDER.indexOf(step)
}

// ── Component ────────────────────────────────────────────────────────────────

export function FunnelStepIndicator() {
  const { currentStep, maxUnlockedStep, setCurrentStep, canNavigateTo } =
    useFunnelContext()

  const currentIdx = stepIndex(currentStep)
  const maxIdx = stepIndex(maxUnlockedStep)

  return (
    <nav
      aria-label="Funnel progress"
      className="flex items-center justify-center gap-0 px-6 py-4"
    >
      {STEPS.map((step, i) => {
        const isActive = step.key === currentStep
        const isPast = stepIndex(step.key) < currentIdx
        const isCompleted = stepIndex(step.key) < maxIdx
        const isLocked = !canNavigateTo(step.key)

        return (
          <div key={step.key} className="flex items-center">
            {/* Connecting line before (skip first) */}
            {i > 0 && (
              <div
                className={`h-0.5 w-12 sm:w-20 ${
                  stepIndex(step.key) <= maxIdx
                    ? 'bg-emerald-500'
                    : 'bg-muted-foreground/25'
                }`}
              />
            )}

            {/* Step circle + label */}
            <button
              type="button"
              disabled={isLocked}
              onClick={() => setCurrentStep(step.key)}
              className="group flex flex-col items-center gap-1.5 disabled:cursor-not-allowed"
              aria-current={isActive ? 'step' : undefined}
            >
              {/* Circle */}
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-primary bg-primary text-primary-foreground'
                    : isCompleted || isPast
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : isLocked
                        ? 'border-muted-foreground/30 bg-muted text-muted-foreground/50'
                        : 'border-muted-foreground/40 bg-background text-muted-foreground'
                }`}
              >
                {isCompleted && !isActive ? (
                  <Check className="h-4 w-4" />
                ) : isLocked ? (
                  <Lock className="h-3.5 w-3.5" />
                ) : isActive ? (
                  <CircleDot className="h-4 w-4" />
                ) : (
                  step.number
                )}
              </span>

              {/* Label */}
              <span
                className={`text-xs whitespace-nowrap ${
                  isActive
                    ? 'text-foreground font-semibold'
                    : isLocked
                      ? 'text-muted-foreground/50'
                      : 'text-muted-foreground'
                }`}
              >
                {step.label}
              </span>
            </button>
          </div>
        )
      })}
    </nav>
  )
}
