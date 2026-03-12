'use client'

import { History, Archive, FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useFormVersions } from '@/lib/queries/ircc-forms'

export function FormVersionHistoryDialog({
  formId,
  formCode,
  open,
  onOpenChange,
}: {
  formId: string | null
  formCode: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data } = useFormVersions(open ? formId : null)

  const versions = data?.versions ?? []
  const currentVersion = data?.currentVersion ?? 1

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Version History — {formCode}
          </DialogTitle>
          <DialogDescription>
            Each version is archived when the form PDF is replaced with a newer upload.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[400px] overflow-y-auto py-2">
          {/* Current version */}
          <div className="flex items-start gap-3 pl-1">
            <div className="mt-1.5 h-3 w-3 rounded-full bg-primary border-2 border-primary shrink-0" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">Version {currentVersion}</span>
                <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">
                  Current
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Active version in use</p>
            </div>
          </div>

          {/* Archived versions */}
          {versions.length === 0 && currentVersion <= 1 && (
            <div className="text-center py-6">
              <Archive className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-400">
                No previous versions. History will appear when the form PDF is updated.
              </p>
            </div>
          )}

          {versions.map((v) => {
            const date = new Date(v.archived_at)
            const dateStr = date.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
            const timeStr = date.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            })

            return (
              <div key={v.id} className="flex items-start gap-3 pl-1 relative">
                {/* Timeline connector */}
                <div className="absolute left-[6.5px] top-0 -translate-y-full h-3 w-px bg-slate-200" />
                <div className="mt-1.5 h-3 w-3 rounded-full bg-slate-200 border-2 border-slate-300 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium">Version {v.version_number}</span>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {dateStr} {timeStr}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="secondary" className="text-[10px] gap-1">
                      <FileText className="h-2.5 w-2.5" />
                      {v.field_count} fields
                    </Badge>
                    {v.mapped_field_count > 0 && (
                      <Badge variant="secondary" className="text-[10px] text-green-600 bg-green-50 border-green-200">
                        {v.mapped_field_count} mapped
                      </Badge>
                    )}
                    <span className="text-[10px] text-slate-300 font-mono">
                      {v.checksum_sha256.slice(0, 10)}...
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
