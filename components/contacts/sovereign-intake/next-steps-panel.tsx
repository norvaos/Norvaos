'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Upload,
  Calendar,
  FileSignature,
  ArrowRight,
  CheckCircle2,
  Circle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NextStep {
  label: string
  description: string
  icon: typeof Upload
  completed: boolean
}

interface NextStepsPanelProps {
  hasGovId: boolean
  hasConsultation: boolean
  hasRetainer: boolean
}

export function NextStepsPanel({ hasGovId, hasConsultation, hasRetainer }: NextStepsPanelProps) {
  const steps: NextStep[] = [
    {
      label: 'Upload Government ID',
      description: 'Upload a passport or government-issued ID to the Norva Vault for KYC verification.',
      icon: Upload,
      completed: hasGovId,
    },
    {
      label: 'Schedule Consultation',
      description: 'Book an initial consultation. A meeting record will be auto-generated.',
      icon: Calendar,
      completed: hasConsultation,
    },
    {
      label: 'Send Retainer Package',
      description: 'Once KYC and conflict check pass, send the retainer for signature.',
      icon: FileSignature,
      completed: hasRetainer,
    },
  ]

  return (
    <Card className="border-dashed border-slate-300 bg-slate-50/50">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
          <ArrowRight className="size-3" />
          Next Steps
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-2">
        {steps.map((step, index) => {
          const StepIcon = step.icon
          return (
            <div
              key={index}
              className={cn(
                'flex items-start gap-2.5 text-xs p-2 rounded-md transition-colors',
                'animate-in fade-in slide-in-from-bottom-2 duration-300',
                step.completed
                  ? 'bg-emerald-950/30/50 text-emerald-400'
                  : 'text-slate-600 hover:bg-slate-100'
              )}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {step.completed ? (
                <CheckCircle2 className="size-4 text-green-500 shrink-0 mt-0.5" />
              ) : (
                <Circle className="size-4 text-slate-300 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-medium">{step.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{step.description}</p>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
