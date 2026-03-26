'use client'

import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Undo2, Trash2, ChevronDown, ChevronRight, FileDown, Clock, CheckCircle2, XCircle, AlertTriangle, Play, Pause } from 'lucide-react'
import { useImportHistory, useRollbackImport, useDeleteImport, useImportBatch, useExecuteImport, usePauseImport } from '@/lib/queries/data-import'
import { PLATFORM_INFO } from '@/lib/services/import/types'
import type { SourcePlatform } from '@/lib/services/import/types'

interface ImportHistoryTableProps {
  tenantId: string
}

const statusBadge: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  pending: { variant: 'secondary', label: 'Pending' },
  validating: { variant: 'secondary', label: 'Validating' },
  importing: { variant: 'default', label: 'Importing' },
  pausing: { variant: 'secondary', label: 'Pausing' },
  paused: { variant: 'secondary', label: 'Paused' },
  completed: { variant: 'outline', label: 'Completed' },
  completed_with_errors: { variant: 'destructive', label: 'Partial' },
  failed: { variant: 'destructive', label: 'Failed' },
  rolled_back: { variant: 'secondary', label: 'Rolled Back' },
}

const statusIcon: Record<string, React.ReactNode> = {
  pending: <Clock className="h-3.5 w-3.5 text-slate-400" />,
  validating: <Clock className="h-3.5 w-3.5 text-blue-500 animate-pulse" />,
  importing: <Clock className="h-3.5 w-3.5 text-indigo-500 animate-pulse" />,
  pausing: <Pause className="h-3.5 w-3.5 text-amber-500 animate-pulse" />,
  paused: <Pause className="h-3.5 w-3.5 text-amber-600" />,
  completed: <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />,
  completed_with_errors: <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />,
  failed: <XCircle className="h-3.5 w-3.5 text-red-500" />,
  rolled_back: <Undo2 className="h-3.5 w-3.5 text-slate-400" />,
}

// ─── Expanded Row Detail ───────────────────────────────────────────────────

function ImportRowDetail({ batchId }: { batchId: string }) {
  const { data: batch, isLoading } = useImportBatch(batchId)
  const executeMutation = useExecuteImport()

  if (isLoading) {
    return (
      <div className="px-4 py-3 text-xs text-slate-400 animate-pulse">
        Loading details...
      </div>
    )
  }

  if (!batch) {
    return (
      <div className="px-4 py-3 text-xs text-slate-400">
        Unable to load details.
      </div>
    )
  }

  return (
    <div className="px-4 py-3 space-y-3 bg-slate-50/50">
      {/* Progress bar for active imports */}
      {(batch.status === 'importing' || batch.status === 'validating') && batch.totalRows > 0 && (
        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>{batch.status === 'importing' ? 'Importing' : 'Validating'}...</span>
            <span>{batch.processedRows} / {batch.totalRows} rows</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-500"
              style={{ width: `${Math.min(100, (batch.processedRows / batch.totalRows) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <p className="text-[10px] uppercase text-slate-400 font-medium">File</p>
          <p className="text-xs text-slate-700 truncate">{batch.fileName || ' - '}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-slate-400 font-medium">Duplicates</p>
          <p className="text-xs text-slate-700 capitalize">{batch.duplicateStrategy?.replace(/_/g, ' ') || ' - '}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-slate-400 font-medium">Started</p>
          <p className="text-xs text-slate-700">
            {batch.startedAt
              ? new Date(batch.startedAt).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })
              : ' - '}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-slate-400 font-medium">Completed</p>
          <p className="text-xs text-slate-700">
            {batch.completedAt
              ? new Date(batch.completedAt).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })
              : ' - '}
          </p>
        </div>
      </div>

      {/* Row counts */}
      <div className="flex gap-4 text-xs">
        <span className="text-green-600">{batch.succeededRows} imported</span>
        {batch.skippedRows > 0 && (
          <span className="text-slate-500">{batch.skippedRows} skipped</span>
        )}
        {batch.failedRows > 0 && (
          <span className="text-red-600">{batch.failedRows} failed</span>
        )}
      </div>

      {/* Errors preview */}
      {batch.importErrors && Array.isArray(batch.importErrors) && batch.importErrors.length > 0 && (
        <div>
          <p className="text-[10px] uppercase text-slate-400 font-medium mb-1">Recent Errors</p>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {(batch.importErrors as Array<{ rowNumber?: number; message?: string }>).slice(0, 5).map((err, i) => (
              <p key={i} className="text-xs text-red-600">
                {err.rowNumber ? `Row ${err.rowNumber}: ` : ''}{err.message ?? JSON.stringify(err)}
              </p>
            ))}
            {batch.importErrors.length > 5 && (
              <p className="text-xs text-slate-400">
                + {batch.importErrors.length - 5} more errors
              </p>
            )}
          </div>
        </div>
      )}

      {/* Resume import  -  batch was validated but user navigated away before executing */}
      {batch.status === 'validating' && batch.succeededRows === 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-indigo-50 border border-indigo-200 p-3">
          <div className="flex-1">
            <p className="text-xs font-medium text-indigo-900">Import was not started</p>
            <p className="text-xs text-indigo-700 mt-0.5">
              This batch was validated but the import never ran. Click Resume to start it now.
            </p>
          </div>
          <Button
            size="sm"
            className="shrink-0 gap-1.5"
            disabled={executeMutation.isPending}
            onClick={() =>
              executeMutation.mutate({
                batchId,
                duplicateStrategy: (batch.duplicateStrategy as 'skip' | 'update' | 'create_new') ?? 'skip',
              })
            }
          >
            {executeMutation.isPending ? (
              <Clock className="h-3.5 w-3.5 animate-pulse" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Resume Import
          </Button>
        </div>
      )}

      {/* Downloads */}
      {(batch.failedRows > 0 || batch.skippedRows > 0) &&
        (batch.status === 'completed' || batch.status === 'completed_with_errors') && (
        <div className="flex flex-wrap gap-2">
          {batch.skippedRows > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs text-amber-700 border-amber-300 hover:bg-amber-50"
              onClick={() => window.open(`/api/import/${batchId}/skipped-report`, '_blank')}
            >
              <FileDown className="h-3 w-3 mr-1" />
              Download {batch.skippedRows} Duplicate Contacts (CSV)
            </Button>
          )}
          {batch.failedRows > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => window.open(`/api/import/${batchId}/error-report`, '_blank')}
            >
              <FileDown className="h-3 w-3 mr-1" />
              Download Error Report
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Table ────────────────────────────────────────────────────────────

export function ImportHistoryTable({ tenantId }: ImportHistoryTableProps) {
  const { data: batches, isLoading } = useImportHistory(tenantId)
  const rollback = useRollbackImport()
  const deleteBatch = useDeleteImport()
  const pauseBatch = usePauseImport()
  const resumeBatch = useExecuteImport()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  if (isLoading) {
    return <p className="text-sm text-slate-400">Loading import history...</p>
  }

  if (!batches || batches.length === 0) {
    return (
      <p className="text-sm text-slate-400">No import history yet.</p>
    )
  }

  return (
    <div className="border rounded-lg overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs w-8"></TableHead>
            <TableHead className="text-xs">Date</TableHead>
            <TableHead className="text-xs">Platform</TableHead>
            <TableHead className="text-xs">Entity</TableHead>
            <TableHead className="text-xs">Status</TableHead>
            <TableHead className="text-xs text-right">Rows</TableHead>
            <TableHead className="text-xs w-28"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {batches.map((batch) => {
            const canRollback = batch.status === 'completed' || batch.status === 'completed_with_errors'
            const canDelete = ['pending', 'validating', 'failed'].includes(batch.status)
            const canPause = batch.status === 'importing'
            const canResume = batch.status === 'paused'
            const badge = statusBadge[batch.status] ?? { variant: 'secondary' as const, label: batch.status }
            const isExpanded = expandedId === batch.id
            const isConfirmingDelete = confirmDeleteId === batch.id

            return (
              <>
                <TableRow
                  key={batch.id}
                  className="cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : batch.id)}
                >
                  <TableCell className="px-2">
                    {isExpanded
                      ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                      : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">
                    {new Date(batch.createdAt).toLocaleDateString('en-CA', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </TableCell>
                  <TableCell className="text-xs">
                    {PLATFORM_INFO[batch.sourcePlatform as SourcePlatform]?.displayName ?? batch.sourcePlatform}
                  </TableCell>
                  <TableCell className="text-xs capitalize">
                    {batch.entityType.replace(/_/g, ' ')}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {statusIcon[batch.status]}
                      <Badge variant={badge.variant} className="text-[10px]">
                        {badge.label}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-right">
                    <span className="text-green-600">{batch.succeededRows}</span>
                    {batch.failedRows > 0 && (
                      <span className="text-red-600 ml-1">/ {batch.failedRows} err</span>
                    )}
                    <span className="text-slate-400 ml-1">/ {batch.totalRows}</span>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      {canPause && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                          onClick={() => pauseBatch.mutate(batch.id)}
                          disabled={pauseBatch.isPending}
                        >
                          <Pause className="h-3 w-3 mr-1" />
                          Pause
                        </Button>
                      )}
                      {canResume && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                          onClick={() =>
                            resumeBatch.mutate({
                              batchId: batch.id,
                              duplicateStrategy: (batch.duplicateStrategy as 'skip' | 'update' | 'create_new') ?? 'skip',
                            })
                          }
                          disabled={resumeBatch.isPending}
                        >
                          <Play className="h-3 w-3 mr-1" />
                          Resume
                        </Button>
                      )}
                      {canRollback && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => rollback.mutate(batch.id)}
                          disabled={rollback.isPending}
                        >
                          <Undo2 className="h-3 w-3 mr-1" />
                          Undo
                        </Button>
                      )}
                      {canDelete && !isConfirmingDelete && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setConfirmDeleteId(batch.id)}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Delete
                        </Button>
                      )}
                      {canDelete && isConfirmingDelete && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => {
                              deleteBatch.mutate(batch.id)
                              setConfirmDeleteId(null)
                            }}
                            disabled={deleteBatch.isPending}
                          >
                            Confirm
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow key={`${batch.id}-detail`}>
                    <TableCell colSpan={7} className="p-0 border-t-0">
                      <ImportRowDetail batchId={batch.id} />
                    </TableCell>
                  </TableRow>
                )}
              </>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
