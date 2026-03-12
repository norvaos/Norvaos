'use client'

import { Progress } from '@/components/ui/progress'
import { Loader2 } from 'lucide-react'
import { useImportBatch } from '@/lib/queries/data-import'

interface ImportProgressProps {
  batchId: string
  onComplete: () => void
}

export function ImportProgress({ batchId, onComplete }: ImportProgressProps) {
  const { data: batch } = useImportBatch(batchId, true)

  const isComplete = batch?.status === 'completed' || batch?.status === 'completed_with_errors' || batch?.status === 'failed'
  const total = batch?.totalRows ?? 0
  const processed = batch?.processedRows ?? 0
  const percent = total > 0 ? Math.round((processed / total) * 100) : 0

  // Auto-advance when done
  if (isComplete) {
    // Use setTimeout to avoid state update during render
    setTimeout(onComplete, 500)
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Importing Data</h2>
        <p className="text-sm text-slate-500 mt-1">
          Please wait while your data is being imported. Do not close this page.
        </p>
      </div>

      <div className="flex flex-col items-center gap-6 py-8">
        <Loader2 className="h-10 w-10 text-primary animate-spin" />

        <div className="w-full max-w-md space-y-3">
          <Progress value={percent} className="h-3" />
          <div className="flex justify-between text-xs text-slate-500">
            <span>{processed} of {total} rows processed</span>
            <span>{percent}%</span>
          </div>
        </div>

        {batch && (
          <div className="flex gap-4 text-xs text-slate-500">
            <span className="text-green-600">{batch.succeededRows} succeeded</span>
            {batch.failedRows > 0 && (
              <span className="text-red-600">{batch.failedRows} failed</span>
            )}
            {batch.skippedRows > 0 && (
              <span className="text-amber-600">{batch.skippedRows} skipped</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
