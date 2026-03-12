'use client'

import { Check } from 'lucide-react'

interface Step {
  label: string
  key: string
}

interface KioskStepIndicatorProps {
  steps: Step[]
  currentStep: string
}

/**
 * Step indicator for the kiosk check-in flow.
 * Shows which step the user is on with checkmarks for completed steps.
 * Touch-friendly with large tap targets (44px+).
 */
export function KioskStepIndicator({ steps, currentStep }: KioskStepIndicatorProps) {
  const currentIndex = steps.findIndex((s) => s.key === currentStep)

  return (
    <div className="flex items-center justify-center gap-2 py-4 px-6">
      {steps.map((step, index) => {
        const isCompleted = index < currentIndex
        const isCurrent = index === currentIndex
        const isFuture = index > currentIndex

        return (
          <div key={step.key} className="flex items-center gap-2">
            {index > 0 && (
              <div
                className={`h-0.5 w-8 sm:w-12 ${
                  isCompleted ? 'bg-emerald-500' : 'bg-slate-200'
                }`}
              />
            )}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  isCompleted
                    ? 'bg-emerald-500 text-white'
                    : isCurrent
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-200 text-slate-500'
                }`}
              >
                {isCompleted ? (
                  <Check className="w-5 h-5" />
                ) : (
                  index + 1
                )}
              </div>
              <span
                className={`text-xs font-medium ${
                  isFuture ? 'text-slate-400' : 'text-slate-700'
                }`}
              >
                {step.label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
