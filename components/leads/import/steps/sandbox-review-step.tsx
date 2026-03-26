'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, XCircle, Filter, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useStagingRows, useBulkFixImport, useUpdateStagingRow } from '@/lib/queries/bulk-lead-import'
import { usePipelines, usePipelineStages } from '@/lib/queries/pipelines'

interface SandboxReviewStepProps {
  batchId: string
  batchStatus: {
    status: string
    total_rows: number
    gatekeeper_summary: {
      total: number
      processed: number
      clear?: number
      conflicts?: number
      needs_review?: number
      invalid?: number
    } | null
  } | undefined
  onCommit: (pipelineId: string, stageId: string, matterTypeId?: string) => void
  onDiscard: () => void
  tenantId: string
}

const STATUS_BADGES: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  valid: { label: 'Valid', variant: 'default' },
  conflict: { label: 'Conflict', variant: 'destructive' },
  needs_review: { label: 'Review', variant: 'secondary' },
  invalid: { label: 'Invalid', variant: 'destructive' },
  pending: { label: 'Pending', variant: 'outline' },
}

export function SandboxReviewStep({
  batchId,
  batchStatus,
  onCommit,
  onDiscard,
  tenantId,
}: SandboxReviewStepProps) {
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState('all')
  const [selectedPipeline, setSelectedPipeline] = useState('')
  const [selectedStage, setSelectedStage] = useState('')

  const { data: stagingData, isLoading } = useStagingRows(batchId, page, filter)
  const bulkFix = useBulkFixImport()
  const updateRow = useUpdateStagingRow()

  const { data: pipelines } = usePipelines(tenantId, 'lead')
  const { data: stages } = usePipelineStages(selectedPipeline)

  const summary = batchStatus?.gatekeeper_summary

  const canCommit = selectedPipeline && selectedStage && !bulkFix.isPending

  return (
    <div className="space-y-4">
      {/* Summary badges */}
      {summary && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-emerald-700 border-emerald-300">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {summary.clear ?? 0} clear
          </Badge>
          {(summary.conflicts ?? 0) > 0 && (
            <Badge variant="outline" className="text-amber-700 border-amber-300">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {summary.conflicts} conflicts
            </Badge>
          )}
          {(summary.needs_review ?? 0) > 0 && (
            <Badge variant="outline" className="text-blue-700 border-blue-300">
              {summary.needs_review} need review
            </Badge>
          )}
          {(summary.invalid ?? 0) > 0 && (
            <Badge variant="outline" className="text-red-700 border-red-300">
              <XCircle className="h-3 w-3 mr-1" />
              {summary.invalid} invalid
            </Badge>
          )}
        </div>
      )}

      {/* Bulk actions */}
      {summary && ((summary.conflicts ?? 0) > 0 || (summary.needs_review ?? 0) > 0) && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="text-sm text-amber-800 dark:text-amber-200 flex-1">
            The Norva Gatekeeper flagged rows that need your decision before import.
          </span>
          {(summary.conflicts ?? 0) > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => bulkFix.mutate({
                batchId,
                action: 'resolve_conflicts',
                conflictOverride: 'create_new',
              })}
              disabled={bulkFix.isPending}
            >
              Create New for All Conflicts
            </Button>
          )}
        </div>
      )}

      {/* Filter + Pagination */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filter} onValueChange={(v) => { setFilter(v); setPage(1) }}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Rows</SelectItem>
              <SelectItem value="valid">Valid</SelectItem>
              <SelectItem value="conflict">Conflicts</SelectItem>
              <SelectItem value="needs_review">Needs Review</SelectItem>
              <SelectItem value="invalid">Invalid</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {stagingData && stagingData.totalPages > 1 && (
          <div className="flex items-center gap-1 text-xs">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2">
              Page {page} of {stagingData.totalPages}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={page >= stagingData.totalPages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Data table */}
      <div className="rounded-md border max-h-[280px] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[120px]">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                  Loading...
                </TableCell>
              </TableRow>
            ) : stagingData?.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                  No rows match this filter
                </TableCell>
              </TableRow>
            ) : (
              stagingData?.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs text-muted-foreground">{row.row_number}</TableCell>
                  <TableCell className="text-sm">
                    {row.first_name} {row.last_name}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.email ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGES[row.validation_status]?.variant ?? 'outline'} className="text-xs">
                      {STATUS_BADGES[row.validation_status]?.label ?? row.validation_status}
                    </Badge>
                    {row.validation_errors && row.validation_errors.length > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <XCircle className="h-3 w-3 text-red-500 ml-1 inline cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <ul className="text-xs">
                            {row.validation_errors.map((e, i) => <li key={i}>{e}</li>)}
                          </ul>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.validation_status === 'conflict' && !row.user_conflict_override && (
                      <Select
                        onValueChange={(v) =>
                          updateRow.mutate({ batchId, rowId: row.id, user_conflict_override: v })
                        }
                      >
                        <SelectTrigger className="h-7 text-xs w-[110px]">
                          <SelectValue placeholder="Resolve..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="create_new">Create New</SelectItem>
                          <SelectItem value="skip">Skip</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {row.user_conflict_override && (
                      <span className="text-xs text-muted-foreground capitalize">
                        {row.user_conflict_override.replace('_', ' ')}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pipeline / Stage selection for commit */}
      <div className="border-t pt-4 space-y-3">
        <p className="text-sm font-medium">Import Destination</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Select value={selectedPipeline} onValueChange={(v) => { setSelectedPipeline(v); setSelectedStage('') }}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select pipeline..." />
              </SelectTrigger>
              <SelectContent>
                {pipelines?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Select value={selectedStage} onValueChange={setSelectedStage} disabled={!selectedPipeline}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select stage..." />
              </SelectTrigger>
              <SelectContent>
                {stages?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-2">
        <Button variant="outline" className="text-destructive" onClick={onDiscard}>
          Discard Import
        </Button>
        <Button
          onClick={() => onCommit(selectedPipeline, selectedStage)}
          disabled={!canCommit}
        >
          Import {summary?.clear ?? 0} Leads
        </Button>
      </div>
    </div>
  )
}
