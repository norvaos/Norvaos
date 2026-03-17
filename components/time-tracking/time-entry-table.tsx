'use client'

import { format } from 'date-fns'
import { Pencil, Trash2, Clock, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { TimeEntry } from '@/lib/queries/invoicing'

interface TimeEntryTableProps {
  entries: TimeEntry[]
  onEdit: (entry: TimeEntry) => void
  onDelete: (id: string) => void
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function TimeEntryTable({ entries, onEdit, onDelete }: TimeEntryTableProps) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center rounded-lg border bg-white">
        <Clock className="mb-3 size-10 text-muted-foreground/30" />
        <h3 className="text-sm font-medium">No time entries</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Start the timer or log time manually to get started.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Date</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Description</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Duration</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Rate</th>
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
            <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {entries.map((entry) => (
            <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
              <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                {format(new Date(entry.entry_date), 'MMM d, yyyy')}
              </td>
              <td className="px-4 py-2.5 max-w-xs truncate">
                {entry.description}
              </td>
              <td className="px-4 py-2.5 whitespace-nowrap font-mono text-xs">
                {formatDuration(entry.duration_minutes)}
              </td>
              <td className="px-4 py-2.5 whitespace-nowrap">
                {entry.hourly_rate != null ? (
                  <span className="text-muted-foreground">${entry.hourly_rate}/hr</span>
                ) : (
                  <span className="text-muted-foreground/40">—</span>
                )}
              </td>
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-1.5">
                  {entry.is_billable ? (
                    <Badge variant="secondary" className="text-xs">
                      <DollarSign className="size-3 mr-0.5" />
                      Billable
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      Non-billable
                    </Badge>
                  )}
                  {!!entry.invoice_id && (
                    <Badge className="text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                      Billed
                    </Badge>
                  )}
                </div>
              </td>
              <td className="px-4 py-2.5 text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => onEdit(entry)}
                    disabled={!!entry.invoice_id}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-destructive hover:text-destructive"
                    onClick={() => onDelete(entry.id)}
                    disabled={!!entry.invoice_id}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
