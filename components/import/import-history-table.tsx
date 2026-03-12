'use client'

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
import { Undo2 } from 'lucide-react'
import { useImportHistory, useRollbackImport } from '@/lib/queries/data-import'
import { PLATFORM_INFO } from '@/lib/services/import/types'
import type { SourcePlatform } from '@/lib/services/import/types'

interface ImportHistoryTableProps {
  tenantId: string
}

const statusBadge: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  pending: { variant: 'secondary', label: 'Pending' },
  validating: { variant: 'secondary', label: 'Validating' },
  importing: { variant: 'default', label: 'Importing' },
  completed: { variant: 'outline', label: 'Completed' },
  completed_with_errors: { variant: 'destructive', label: 'Partial' },
  failed: { variant: 'destructive', label: 'Failed' },
  rolled_back: { variant: 'secondary', label: 'Rolled Back' },
}

export function ImportHistoryTable({ tenantId }: ImportHistoryTableProps) {
  const { data: batches, isLoading } = useImportHistory(tenantId)
  const rollback = useRollbackImport()

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
            <TableHead className="text-xs">Date</TableHead>
            <TableHead className="text-xs">Platform</TableHead>
            <TableHead className="text-xs">Entity</TableHead>
            <TableHead className="text-xs">Status</TableHead>
            <TableHead className="text-xs text-right">Rows</TableHead>
            <TableHead className="text-xs w-20"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {batches.map((batch) => {
            const canRollback = batch.status === 'completed' || batch.status === 'completed_with_errors'
            const badge = statusBadge[batch.status] ?? { variant: 'secondary' as const, label: batch.status }

            return (
              <TableRow key={batch.id}>
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
                  <Badge variant={badge.variant} className="text-[10px]">
                    {badge.label}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-right">
                  <span className="text-green-600">{batch.succeededRows}</span>
                  {batch.failedRows > 0 && (
                    <span className="text-red-600 ml-1">/ {batch.failedRows} err</span>
                  )}
                  <span className="text-slate-400 ml-1">/ {batch.totalRows}</span>
                </TableCell>
                <TableCell>
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
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
