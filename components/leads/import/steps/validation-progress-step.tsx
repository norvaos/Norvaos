'use client'

import { Loader2, ShieldCheck, Upload } from 'lucide-react'
import { Progress } from '@/components/ui/progress'

interface ValidationProgressStepProps {
  batchStatus: {
    status: string
    gatekeeper_summary: {
      phase: string
      total: number
      processed: number
      clear?: number
      conflicts?: number
      needs_review?: number
      invalid?: number
      created?: number
      skipped?: number
      errors?: number
    } | null
  } | undefined
  isCommitting?: boolean
}

export function ValidationProgressStep({ batchStatus, isCommitting }: ValidationProgressStepProps) {
  const summary = batchStatus?.gatekeeper_summary
  const total = summary?.total ?? 0
  const processed = summary?.processed ?? 0
  const percent = total > 0 ? Math.round((processed / total) * 100) : 0

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="relative mb-6">
        {isCommitting ? (
          <Upload className="h-12 w-12 text-primary animate-pulse" />
        ) : (
          <ShieldCheck className="h-12 w-12 text-primary animate-pulse" />
        )}
      </div>

      <h3 className="text-lg font-semibold mb-1">
        {isCommitting ? 'Creating Leads...' : 'Norva Gatekeeper Running'}
      </h3>
      <p className="text-sm text-muted-foreground mb-6">
        {isCommitting
          ? 'Committing approved rows to your leads database'
          : 'Scanning for duplicate contacts, cross-checking conflicts, and matching jurisdictions automatically'}
      </p>

      <div className="w-full max-w-xs space-y-2">
        <Progress value={percent} className="h-2" />
        <p className="text-xs text-muted-foreground">
          {processed} / {total} rows processed ({percent}%)
        </p>
      </div>

      {!isCommitting && summary && processed > 0 && (
        <div className="mt-6 flex gap-4 text-xs">
          {summary.clear !== undefined && (
            <span className="text-emerald-600">{summary.clear} clear</span>
          )}
          {(summary.conflicts ?? 0) > 0 && (
            <span className="text-amber-600">{summary.conflicts} conflicts</span>
          )}
          {(summary.needs_review ?? 0) > 0 && (
            <span className="text-blue-600">{summary.needs_review} need review</span>
          )}
          {(summary.invalid ?? 0) > 0 && (
            <span className="text-red-600">{summary.invalid} invalid</span>
          )}
        </div>
      )}

      {isCommitting && summary && processed > 0 && (
        <div className="mt-6 flex gap-4 text-xs">
          {(summary.created ?? 0) > 0 && (
            <span className="text-emerald-600">{summary.created} created</span>
          )}
          {(summary.skipped ?? 0) > 0 && (
            <span className="text-muted-foreground">{summary.skipped} skipped</span>
          )}
          {(summary.errors ?? 0) > 0 && (
            <span className="text-red-600">{summary.errors} errors</span>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        This runs in the background  -  do not close this window
      </div>
    </div>
  )
}
