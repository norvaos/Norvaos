'use client'

import { Button } from '@/components/ui/button'
import { CheckCircle2, AlertTriangle, XCircle, Undo2, Download } from 'lucide-react'
import { useImportBatch, useRollbackImport } from '@/lib/queries/data-import'

interface ImportResultsProps {
  batchId: string
  onImportAnother: () => void
  onDone: () => void
}

export function ImportResults({ batchId, onImportAnother, onDone }: ImportResultsProps) {
  const { data: batch } = useImportBatch(batchId, false)
  const rollback = useRollbackImport()

  if (!batch) return null

  const isSuccess = batch.status === 'completed'
  const isPartial = batch.status === 'completed_with_errors'
  const isFailed = batch.status === 'failed'
  const isRolledBack = batch.status === 'rolled_back'
  const canRollback = isSuccess || isPartial

  const errors = (batch.importErrors ?? []) as { rowNumber?: number; message?: string }[]
  const hasErrors = batch.failedRows > 0 || batch.skippedRows > 0

  const handleDownloadReport = async () => {
    try {
      const res = await fetch(`/api/import/${batchId}/error-report`)
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Failed to download report')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? 'import-errors.csv'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      // Silently fail — toast is handled by the query layer if needed
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Import Results</h2>
      </div>

      {/* Status icon and message */}
      <div className="flex flex-col items-center gap-4 py-6">
        {isSuccess && (
          <>
            <CheckCircle2 className="h-16 w-16 text-green-500" />
            <p className="text-lg font-semibold text-green-700">Import completed successfully!</p>
          </>
        )}
        {isPartial && (
          <>
            <AlertTriangle className="h-16 w-16 text-amber-500" />
            <p className="text-lg font-semibold text-amber-700">Import completed with some errors</p>
          </>
        )}
        {isFailed && (
          <>
            <XCircle className="h-16 w-16 text-red-500" />
            <p className="text-lg font-semibold text-red-700">Import failed</p>
          </>
        )}
        {isRolledBack && (
          <>
            <Undo2 className="h-16 w-16 text-slate-400" />
            <p className="text-lg font-semibold text-slate-600">Import has been rolled back</p>
          </>
        )}
      </div>

      {/* Stats */}
      <div className="flex flex-wrap justify-center gap-4">
        <div className="rounded-lg border bg-white px-6 py-3 text-center">
          <p className="text-2xl font-bold text-slate-900">{batch.totalRows}</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Total</p>
        </div>
        <div className="rounded-lg border bg-green-50 border-green-200 px-6 py-3 text-center">
          <p className="text-2xl font-bold text-green-700">{batch.succeededRows}</p>
          <p className="text-[10px] uppercase tracking-wider text-green-600">Imported</p>
        </div>
        {batch.failedRows > 0 && (
          <div className="rounded-lg border bg-red-50 border-red-200 px-6 py-3 text-center">
            <p className="text-2xl font-bold text-red-700">{batch.failedRows}</p>
            <p className="text-[10px] uppercase tracking-wider text-red-600">Failed</p>
          </div>
        )}
        {batch.skippedRows > 0 && (
          <div className="rounded-lg border bg-amber-50 border-amber-200 px-6 py-3 text-center">
            <p className="text-2xl font-bold text-amber-700">{batch.skippedRows}</p>
            <p className="text-[10px] uppercase tracking-wider text-amber-600">Skipped</p>
          </div>
        )}
      </div>

      {/* Errors list */}
      {errors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-red-800">Errors:</p>
            {hasErrors && (
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px] border-red-300 text-red-700 hover:bg-red-100"
                onClick={handleDownloadReport}
              >
                <Download className="h-3 w-3 mr-1" />
                Download Error Report
              </Button>
            )}
          </div>
          <div className="max-h-40 overflow-y-auto">
            {errors.slice(0, 20).map((err, i) => (
              <p key={i} className="text-xs text-red-700">
                {err.rowNumber ? `Row ${err.rowNumber}: ` : ''}{err.message ?? 'Unknown error'}
              </p>
            ))}
            {errors.length > 20 && (
              <p className="text-xs text-red-500 mt-1">...and {errors.length - 20} more</p>
            )}
          </div>
        </div>
      )}

      {/* Download report if there are skipped rows but no errors shown */}
      {hasErrors && errors.length === 0 && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={handleDownloadReport}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Download Error Report
          </Button>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap justify-center gap-3 pt-4">
        {canRollback && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => rollback.mutate(batchId)}
            disabled={rollback.isPending}
          >
            <Undo2 className="h-3.5 w-3.5 mr-1.5" />
            {rollback.isPending ? 'Rolling Back...' : 'Undo Import'}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onImportAnother}>
          Import Another Entity
        </Button>
        <Button size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  )
}
