'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Download } from 'lucide-react'
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
import type { DuplicateStrategy } from '@/lib/services/import/types'

interface PreviewRow {
  rowNumber: number
  data: Record<string, unknown>
  isDuplicate: boolean
}

interface PreviewValidateProps {
  batchId: string | null
  totalRows: number
  validRows: number
  invalidRows: number
  duplicateRows: number
  errors: { rowNumber: number; field?: string; message: string }[]
  previewRows: PreviewRow[]
  duplicateStrategy: DuplicateStrategy
  onDuplicateStrategyChange: (strategy: DuplicateStrategy) => void
  onExecute: () => void
  isExecuting: boolean
  onBack: () => void
}

export function PreviewValidate({
  batchId,
  totalRows,
  validRows,
  invalidRows,
  duplicateRows,
  errors,
  previewRows,
  duplicateStrategy,
  onDuplicateStrategyChange,
  onExecute,
  isExecuting,
  onBack,
}: PreviewValidateProps) {
  // Get column keys from first preview row
  const columns = previewRows.length > 0
    ? Object.keys(previewRows[0].data).filter((k) => !k.startsWith('__'))
    : []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Preview & Validate</h2>
        <p className="text-sm text-slate-500 mt-1">
          Review mapped data before importing. Fix any issues and choose how to handle duplicates.
        </p>
      </div>

      {/* Summary bar */}
      <div className="flex flex-wrap gap-3">
        <div className="rounded-lg border bg-white px-4 py-2 text-center">
          <p className="text-2xl font-bold text-slate-900">{totalRows}</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Total Rows</p>
        </div>
        <div className="rounded-lg border bg-green-50 border-green-200 px-4 py-2 text-center">
          <p className="text-2xl font-bold text-green-700">{validRows}</p>
          <p className="text-[10px] uppercase tracking-wider text-green-600">Valid</p>
        </div>
        {invalidRows > 0 && (
          <div className="rounded-lg border bg-red-50 border-red-200 px-4 py-2 text-center">
            <p className="text-2xl font-bold text-red-700">{invalidRows}</p>
            <p className="text-[10px] uppercase tracking-wider text-red-600">Errors</p>
          </div>
        )}
        {duplicateRows > 0 && (
          <div className="rounded-lg border bg-amber-50 border-amber-200 px-4 py-2 text-center">
            <p className="text-2xl font-bold text-amber-700">{duplicateRows}</p>
            <p className="text-[10px] uppercase tracking-wider text-amber-600">Duplicates</p>
          </div>
        )}
      </div>

      {/* Duplicate strategy */}
      {duplicateRows > 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-xs text-amber-800 font-medium shrink-0">Handle duplicates:</p>
          <Select
            value={duplicateStrategy}
            onValueChange={(val) => onDuplicateStrategyChange(val as DuplicateStrategy)}
          >
            <SelectTrigger className="h-8 text-xs w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="skip">Skip duplicates</SelectItem>
              <SelectItem value="update">Update existing records</SelectItem>
              <SelectItem value="create_new">Create new records</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-red-800">Validation errors:</p>
            {batchId && (
              <a
                href={`/api/import/validate/errors?batchId=${batchId}`}
                download
                className="inline-flex items-center gap-1.5 text-xs text-red-700 hover:text-red-900 underline underline-offset-2"
              >
                <Download className="h-3 w-3" />
                Download all {invalidRows} error rows as CSV
              </a>
            )}
          </div>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {errors.slice(0, 20).map((err, i) => (
              <p key={i} className="text-xs text-red-700">
                Row {err.rowNumber}: {err.message}
              </p>
            ))}
            {errors.length > 20 && (
              <p className="text-xs text-red-500 italic">...and {invalidRows - 20} more  -  download CSV for full list</p>
            )}
          </div>
        </div>
      )}

      {/* Preview table */}
      {previewRows.length > 0 && (
        <div className="border rounded-lg overflow-auto max-h-80">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-[10px]">#</TableHead>
                {columns.slice(0, 6).map((col) => (
                  <TableHead key={col} className="text-[10px] whitespace-nowrap">
                    {col.replace(/_/g, ' ')}
                  </TableHead>
                ))}
                <TableHead className="w-20 text-[10px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewRows.slice(0, 20).map((row) => (
                <TableRow key={row.rowNumber}>
                  <TableCell className="text-xs text-slate-400">{row.rowNumber}</TableCell>
                  {columns.slice(0, 6).map((col) => (
                    <TableCell key={col} className="text-xs max-w-[150px] truncate">
                      {String(row.data[col] ?? '')}
                    </TableCell>
                  ))}
                  <TableCell>
                    {row.isDuplicate ? (
                      <Badge variant="secondary" className="text-[10px]">Duplicate</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-green-700 border-green-300">Valid</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onExecute} disabled={isExecuting || validRows === 0}>
          {isExecuting ? 'Starting Import...' : `Import ${validRows} Rows`}
        </Button>
      </div>
    </div>
  )
}
