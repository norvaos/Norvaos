'use client'

import { CheckCircle2, Loader2, XCircle, MinusCircle, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useOnboardingRun } from '@/lib/queries/command-centre'

// ─── Types ───────────────────────────────────────────────────────────────────

interface OnboardingProgressCardProps {
  matterId: string
}

const STEP_CONFIG = [
  {
    key: 'fee_snapshot_status' as const,
    label: 'Fee Snapshot Locked',
    description: 'Professional fees and tax rates frozen at time of retainer',
  },
  {
    key: 'portal_creation_status' as const,
    label: 'Client Portal Created',
    description: 'Welcome email sent with portal access credentials',
  },
  {
    key: 'blueprint_injection_status' as const,
    label: 'Document Blueprint Loaded',
    description: '12-slot document checklist injected for client uploads',
  },
]

const STATUS_ICONS: Record<string, { icon: React.ElementType; class: string }> = {
  completed: { icon: CheckCircle2, class: 'text-emerald-600' },
  pending: { icon: MinusCircle, class: 'text-muted-foreground/70' },
  failed: { icon: XCircle, class: 'text-red-500' },
  skipped: { icon: MinusCircle, class: 'text-muted-foreground/50' },
}

// ─── Component ───────────────────────────────────────────────────────────────

export function OnboardingProgressCard({ matterId }: OnboardingProgressCardProps) {
  const { data: run, isLoading } = useOnboardingRun(matterId)

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading onboarding status...
      </div>
    )
  }

  if (!run) return null

  const allComplete = STEP_CONFIG.every(
    (step) => run[step.key] === 'completed' || run[step.key] === 'skipped'
  )

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="h-4 w-4 text-amber-500" />
        <h4 className="text-sm font-semibold">One-Click Onboarding</h4>
        {allComplete && (
          <Badge className="bg-emerald-950/40 text-emerald-400 text-[10px] ml-auto">
            Complete
          </Badge>
        )}
        {!allComplete && run.started_at && (
          <Badge variant="outline" className="text-[10px] ml-auto animate-pulse">
            In Progress
          </Badge>
        )}
      </div>

      <div className="space-y-2">
        {STEP_CONFIG.map((step) => {
          const status = run[step.key] ?? 'pending'
          const { icon: StepIcon, class: iconClass } = STATUS_ICONS[status] ?? STATUS_ICONS.pending

          return (
            <div key={step.key} className="flex items-start gap-2.5">
              <StepIcon className={cn('h-4 w-4 shrink-0 mt-0.5', iconClass)} />
              <div className="min-w-0 flex-1">
                <p className={cn(
                  'text-xs font-medium',
                  status === 'completed' ? 'text-emerald-400' : 'text-foreground/80'
                )}>
                  {step.label}
                </p>
                <p className="text-[10px] text-muted-foreground">{step.description}</p>
              </div>
            </div>
          )
        })}
      </div>

      {run.document_slots_created != null && run.document_slots_created > 0 && (
        <p className="text-[10px] text-muted-foreground mt-2 pt-2 border-t">
          {run.document_slots_created} document slot{run.document_slots_created === 1 ? '' : 's'} created
        </p>
      )}
    </div>
  )
}
