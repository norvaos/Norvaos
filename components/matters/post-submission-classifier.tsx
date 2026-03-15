'use client'

import { useState } from 'react'
import { FileText, ArrowRight, Clock, CheckSquare, Mail, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { usePostSubmissionDocTypes, useClassifyDocument } from '@/lib/queries/lifecycle'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PostSubmissionClassifierProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  matterId: string
  tenantId: string
  documentId?: string
}

// ── Component ──────────────────────────────────────────────────────────────────

export function PostSubmissionClassifier({
  open,
  onOpenChange,
  matterId,
  tenantId,
  documentId,
}: PostSubmissionClassifierProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const { data: docTypes, isLoading: typesLoading } = usePostSubmissionDocTypes(tenantId)
  const classifyMutation = useClassifyDocument()

  const selectedType = docTypes?.find((t) => t.key === selectedKey)

  const handleClassify = () => {
    if (!selectedKey) return

    classifyMutation.mutate(
      { matterId, documentId, typeKey: selectedKey },
      {
        onSuccess: (result) => {
          toast.success(`Document classified as "${selectedType?.label}"`, {
            description: result.actionsTriggered?.length
              ? `${result.actionsTriggered.length} action(s) triggered`
              : undefined,
          })
          setSelectedKey(null)
          onOpenChange(false)
        },
        onError: (err) => toast.error(err.message || 'Classification failed'),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Classify Post-Submission Document
          </DialogTitle>
          <DialogDescription>
            What type of document was received from IRCC? This will trigger the appropriate
            follow-up actions automatically.
          </DialogDescription>
        </DialogHeader>

        {typesLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Document type selection */}
            <div className="grid gap-2 max-h-[300px] overflow-y-auto pr-1">
              {(docTypes ?? []).map((docType) => (
                <button
                  key={docType.key}
                  onClick={() => setSelectedKey(docType.key)}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent',
                    selectedKey === docType.key
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border'
                  )}
                >
                  <FileText className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{docType.label}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {docType.stage_change_target && (
                        <Badge variant="outline" className="text-xs">
                          <ArrowRight className="h-3 w-3 mr-1" />
                          {docType.stage_change_target}
                        </Badge>
                      )}
                      {docType.creates_deadline && (
                        <Badge variant="outline" className="text-xs">
                          <Clock className="h-3 w-3 mr-1" />
                          {docType.deadline_days}d deadline
                        </Badge>
                      )}
                      {docType.creates_task && (
                        <Badge variant="outline" className="text-xs">
                          <CheckSquare className="h-3 w-3 mr-1" />
                          Task
                        </Badge>
                      )}
                      {docType.triggers_communication && (
                        <Badge variant="outline" className="text-xs">
                          <Mail className="h-3 w-3 mr-1" />
                          Communication
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Preview of triggered actions */}
            {selectedType && (
              <div className="rounded-lg bg-muted/50 p-3 space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Actions that will be triggered
                </div>
                <ul className="text-sm space-y-1">
                  {selectedType.stage_change_target && (
                    <li className="flex items-center gap-2">
                      <ArrowRight className="h-3.5 w-3.5 text-blue-500" />
                      Stage will change to &ldquo;{selectedType.stage_change_target}&rdquo;
                    </li>
                  )}
                  {selectedType.creates_deadline && (
                    <li className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-orange-500" />
                      Deadline created: {selectedType.deadline_days} days from today
                    </li>
                  )}
                  {selectedType.creates_task && (
                    <li className="flex items-center gap-2">
                      <CheckSquare className="h-3.5 w-3.5 text-green-500" />
                      Follow-up task will be created
                    </li>
                  )}
                  {selectedType.triggers_communication && (
                    <li className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-purple-500" />
                      Communication draft will be prepared
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleClassify}
            disabled={!selectedKey || classifyMutation.isPending}
          >
            {classifyMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Classify Document
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
