'use client'

import { AlertTriangle, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useImmigrationReadiness } from '@/lib/queries/immigration-readiness'
import { useFunnelContext } from '../FunnelContext'
import { toast } from 'sonner'

// ── Progress Ring ────────────────────────────────────────────────────────────

function ProgressRing({
  label,
  value,
  max,
  colour,
  note,
}: {
  label: string
  value: number
  max: number
  colour: string
  note?: string
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  const clampedPct = Math.min(pct, 100)

  const size = 120
  const strokeWidth = 10
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (clampedPct / 100) * circumference

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/20"
        />
        {/* Foreground arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>

      {/* Centre text (overlaid) */}
      <div className="-mt-[88px] mb-[40px] flex items-center justify-center text-xl font-bold">
        {clampedPct}%
      </div>

      <p className="text-sm font-medium">{label}</p>
      {note && (
        <p className="text-xs text-muted-foreground">{note}</p>
      )}
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ApprovalScreen() {
  const { matterId, goBack } = useFunnelContext()
  const { data: readinessData, isLoading } = useImmigrationReadiness(matterId)

  // ── Loading state ────────────────────────────────────────────────────────

  if (isLoading || !readinessData) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Skeleton className="mb-2 h-9 w-64" />
        <Skeleton className="mb-10 h-5 w-[28rem]" />
        <div className="flex justify-center gap-12">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[160px] w-[120px] rounded-full" />
          ))}
        </div>
        <Skeleton className="mt-10 h-12 w-full" />
        <div className="mt-8 flex gap-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-48" />
        </div>
      </div>
    )
  }

  // ── Derived values ───────────────────────────────────────────────────────

  const docsPct =
    readinessData.documents.totalSlots > 0
      ? readinessData.documents.accepted / readinessData.documents.totalSlots
      : 0
  const formsPct =
    Math.max(readinessData.formPacks.required.length, 1) > 0
      ? readinessData.formPacks.generated.length /
        Math.max(readinessData.formPacks.required.length, 1)
      : 0
  const feesPct = 0 // Government fee tracking not yet implemented

  const blockers = readinessData.blockedReasons
  const lawyerPending =
    readinessData.lawyerReview.required &&
    readinessData.lawyerReview.status !== 'approved'

  const allRingsComplete =
    Math.round(docsPct * 100) >= 100 &&
    Math.round(formsPct * 100) >= 100
    // Fees ring excluded from gate until hook exists

  const canSubmit = allRingsComplete && blockers.length === 0 && !lawyerPending

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">
        Application Approval
      </h1>
      <p className="mt-1 text-muted-foreground">
        All categories must reach 100% before final submission.
      </p>

      {/* ── Progress Rings ────────────────────────────────────────────────── */}
      <div className="mt-10 flex flex-wrap justify-center gap-12">
        <ProgressRing
          label="Documents"
          value={readinessData.documents.accepted}
          max={readinessData.documents.totalSlots}
          colour="#3b82f6" /* blue-500 */
        />
        <ProgressRing
          label="Forms"
          value={readinessData.formPacks.generated.length}
          max={Math.max(readinessData.formPacks.required.length, 1)}
          colour="#10b981" /* emerald-500 */
        />
        <ProgressRing
          label="Fees"
          value={0}
          max={1}
          colour="#f59e0b" /* amber-500 */
          note="(Coming soon)"
        />
      </div>

      {/* ── Blockers ──────────────────────────────────────────────────────── */}
      {(blockers.length > 0 || lawyerPending) && (
        <div className="mt-10 space-y-2">
          {blockers.map((reason, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/40"
            >
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
              <span className="text-sm text-amber-900 dark:text-amber-200">
                {reason}
              </span>
            </div>
          ))}

          {lawyerPending && (
            <div className="flex items-center gap-3 rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950/40">
              <Clock className="h-5 w-5 shrink-0 text-blue-600" />
              <span className="text-sm font-medium text-blue-900 dark:text-blue-200">
                Lawyer review pending
              </span>
              <Badge variant="secondary" className="ml-auto text-xs">
                Required
              </Badge>
            </div>
          )}
        </div>
      )}

      {/* ── Action buttons ────────────────────────────────────────────────── */}
      <div className="mt-10 flex gap-4">
        <Button variant="outline" onClick={() => goBack()}>
          &larr; Back to Workspace
        </Button>
        <Button
          className="bg-green-600 text-white hover:bg-green-700"
          disabled={!canSubmit}
          onClick={() => toast('Filing submission coming soon')}
        >
          Submit for Filing
        </Button>
      </div>
    </div>
  )
}
