'use client'

import { useMemo } from 'react'
import {
  useMatterImmigration,
  useMatterChecklistItems,
} from '@/lib/queries/immigration'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils/formatters'

import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  MapPin,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ClientProgressPanelProps {
  matterId: string
  tenantId?: string
}

interface ProgressStep {
  id: string
  label: string
  status: 'complete' | 'current' | 'upcoming' | 'at_risk'
  date?: string | null
  detail?: string
}

// ─── Status Config ───────────────────────────────────────────────────────────

const STATUS_STYLES = {
  complete: {
    dot: 'bg-green-500',
    line: 'bg-green-500',
    text: 'text-green-700',
    bg: 'bg-green-50',
  },
  current: {
    dot: 'bg-blue-500 ring-4 ring-blue-100',
    line: 'bg-slate-200',
    text: 'text-blue-700',
    bg: 'bg-blue-50',
  },
  upcoming: {
    dot: 'bg-slate-300',
    line: 'bg-slate-200',
    text: 'text-slate-500',
    bg: 'bg-slate-50',
  },
  at_risk: {
    dot: 'bg-amber-500 ring-4 ring-amber-100',
    line: 'bg-slate-200',
    text: 'text-amber-700',
    bg: 'bg-amber-50',
  },
}

// ─── Assembly Line Step ──────────────────────────────────────────────────────

function AssemblyStep({
  step,
  isLast,
}: {
  step: ProgressStep
  isLast: boolean
}) {
  const style = STATUS_STYLES[step.status]

  return (
    <div className="flex items-start gap-3">
      {/* Dot + connecting line */}
      <div className="flex flex-col items-center">
        <div className={cn('h-3 w-3 rounded-full shrink-0 mt-0.5', style.dot)} />
        {!isLast && (
          <div className={cn('w-0.5 flex-1 min-h-[32px]', step.status === 'complete' ? style.line : 'bg-slate-200')} />
        )}
      </div>

      {/* Content */}
      <div className="pb-4 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn('text-sm font-medium', style.text)}>{step.label}</span>
          {step.status === 'current' && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-blue-600 border-blue-200">
              In Progress
            </Badge>
          )}
          {step.status === 'at_risk' && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-amber-600 border-amber-200">
              At Risk
            </Badge>
          )}
        </div>
        {step.date && (
          <p className="text-[11px] text-slate-400 mt-0.5">{formatDate(step.date)}</p>
        )}
        {step.detail && (
          <p className="text-[11px] text-slate-500 mt-0.5">{step.detail}</p>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ClientProgressPanel({ matterId }: ClientProgressPanelProps) {
  const { data: immigration, isLoading: loadingImmigration } = useMatterImmigration(matterId)
  const { data: checklistItems, isLoading: loadingChecklist } = useMatterChecklistItems(matterId)
  // Build progress steps from case data
  const steps = useMemo((): ProgressStep[] => {
    if (!immigration) return []
    const result: ProgressStep[] = []

    // 1. Retainer step
    result.push({
      id: 'retainer',
      label: 'Retainer Agreement',
      status: immigration.retainer_signed ? 'complete' : 'upcoming',
      date: immigration.retainer_signed_at,
      detail: immigration.retainer_signed ? 'Signed' : 'Pending signature',
    })

    // 2. Document collection step
    const requiredDocs = (checklistItems ?? []).filter((i) => i.is_required)
    const approvedDocs = requiredDocs.filter((i) => i.status === 'approved')
    const missingDocs = requiredDocs.filter((i) => i.status === 'missing')
    const docProgress = requiredDocs.length > 0
      ? Math.round((approvedDocs.length / requiredDocs.length) * 100)
      : 0

    if (requiredDocs.length > 0) {
      result.push({
        id: 'documents',
        label: 'Document Collection',
        status: docProgress === 100 ? 'complete' : missingDocs.length > 3 ? 'at_risk' : docProgress > 0 ? 'current' : 'upcoming',
        detail: `${approvedDocs.length} of ${requiredDocs.length} documents approved`,
      })
    }

    // 3. Application filed step
    result.push({
      id: 'filed',
      label: 'Application Filed',
      status: immigration.date_filed ? 'complete' : 'upcoming',
      date: immigration.date_filed,
    })

    // 4. Biometrics step
    result.push({
      id: 'biometrics',
      label: 'Biometrics',
      status: immigration.date_biometrics ? 'complete' : immigration.date_filed ? 'current' : 'upcoming',
      date: immigration.date_biometrics,
    })

    // 5. Medical exam step
    result.push({
      id: 'medical',
      label: 'Medical Exam',
      status: immigration.date_medical ? 'complete' : 'upcoming',
      date: immigration.date_medical,
    })

    // 6. Interview step (if applicable)
    if (immigration.date_interview) {
      result.push({
        id: 'interview',
        label: 'Interview',
        status: 'complete',
        date: immigration.date_interview,
      })
    }

    // 7. Decision step
    result.push({
      id: 'decision',
      label: 'Decision',
      status: immigration.date_decision ? 'complete' : 'upcoming',
      date: immigration.date_decision,
      detail: immigration.date_decision ? 'Decision received' : 'Awaiting decision',
    })

    // 8. Landing step (if applicable for PR)
    if (immigration.date_landing || immigration.program_category === 'perm_resident') {
      result.push({
        id: 'landing',
        label: 'Landing / PR Confirmation',
        status: immigration.date_landing ? 'complete' : 'upcoming',
        date: immigration.date_landing,
      })
    }

    // Find the first non-complete step and mark it current (if not already)
    let foundCurrent = false
    for (const step of result) {
      if (step.status === 'current') {
        foundCurrent = true
        break
      }
    }
    if (!foundCurrent) {
      for (const step of result) {
        if (step.status === 'upcoming') {
          step.status = 'current'
          break
        }
      }
    }

    return result
  }, [immigration, checklistItems])

  // Overall progress
  const overallPct = useMemo(() => {
    if (steps.length === 0) return 0
    const completed = steps.filter((s) => s.status === 'complete').length
    return Math.round((completed / steps.length) * 100)
  }, [steps])

  const isLoading = loadingImmigration || loadingChecklist

  if (isLoading) {
    return (
      <div className="border border-slate-200 rounded-lg p-4 space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-2 w-full" />
        <div className="space-y-4 mt-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-3 w-3 rounded-full" />
              <div className="space-y-1 flex-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!immigration || steps.length === 0) return null

  const progressColor =
    overallPct >= 80
      ? '[&_[data-slot=progress-indicator]]:bg-green-500'
      : overallPct >= 40
        ? '[&_[data-slot=progress-indicator]]:bg-blue-500'
        : '[&_[data-slot=progress-indicator]]:bg-slate-400'

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-800">Case Progress</h3>
        </div>
        <div className="flex items-center gap-2">
          <Progress value={overallPct} className={cn('h-1.5 w-20', progressColor)} />
          <span className="text-xs font-medium text-slate-500 tabular-nums">{overallPct}%</span>
        </div>
      </div>

      {/* Assembly line */}
      <div className="p-4">
        {steps.map((step, i) => (
          <AssemblyStep key={step.id} step={step} isLast={i === steps.length - 1} />
        ))}
      </div>
    </div>
  )
}
