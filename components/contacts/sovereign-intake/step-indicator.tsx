'use client'

import { cn } from '@/lib/utils'
import { Shield, UserPlus, ShieldCheck, Check } from 'lucide-react'

interface StepIndicatorProps {
  currentStep: number // 0, 1, 2
  steps: Array<{
    label: string
    sublabel: string
    icon: typeof Shield
  }>
}

const DEFAULT_STEPS = [
  { label: 'Conflict Search', sublabel: 'LSO/CICC Gate', icon: Shield },
  { label: 'Contact Details', sublabel: 'Minimal Collection', icon: UserPlus },
  { label: 'Compliance Review', sublabel: 'Regulatory Matrix', icon: ShieldCheck },
]

export function StepIndicator({ currentStep, steps = DEFAULT_STEPS }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-between w-full mb-6">
      {steps.map((step, index) => {
        const isCompleted = index < currentStep
        const isCurrent = index === currentStep
        const StepIcon = isCompleted ? Check : step.icon

        return (
          <div key={index} className="flex items-center flex-1">
            {/* Step circle */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500 border-2',
                  isCompleted && 'bg-emerald-500 border-emerald-500 text-white',
                  isCurrent && 'bg-blue-600 border-blue-600 text-white animate-pulse',
                  !isCompleted && !isCurrent && 'bg-slate-100 border-slate-300 text-slate-400'
                )}
              >
                <StepIcon className="size-4" />
              </div>
              <span
                className={cn(
                  'text-[10px] font-medium mt-1.5 text-center',
                  isCurrent ? 'text-blue-400' : isCompleted ? 'text-emerald-400' : 'text-slate-400'
                )}
              >
                {step.label}
              </span>
              <span
                className={cn(
                  'text-[8px] text-center',
                  isCurrent ? 'text-blue-500' : isCompleted ? 'text-emerald-500' : 'text-slate-300'
                )}
              >
                {step.sublabel}
              </span>
            </div>

            {/* Connecting line */}
            {index < steps.length - 1 && (
              <div className="flex-1 mx-2 h-0.5 rounded-full overflow-hidden bg-slate-200">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-700 ease-out',
                    isCompleted ? 'w-full bg-emerald-500' : isCurrent ? 'w-1/2 bg-blue-400' : 'w-0'
                  )}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
