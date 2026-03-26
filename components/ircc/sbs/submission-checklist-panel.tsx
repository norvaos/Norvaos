'use client'

import { useEffect, useState } from 'react'
import { Check, Circle, Loader2, AlertTriangle, Ban, FileText, Landmark, Fingerprint, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { NorvaWhisper } from '@/components/ui/norva-whisper'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  useSubmissionChecklist,
  useInitSubmissionChecklist,
  useToggleSubmissionItem,
  useUpdateSubmissionItem,
  type SubmissionChecklistItem,
} from '@/lib/queries/ircc-submission-checklist'
import { DEFAULT_SUBMISSION_CHECKLIST } from '@/lib/services/ircc-field-clip'

// ─── Icon map for categories ─────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  form: FileText,
  document: FileText,
  fee: Landmark,
  biometric: Fingerprint,
  other: MoreHorizontal,
}

const STATUS_ICONS: Record<string, React.ElementType> = {
  pending: Circle,
  in_progress: Loader2,
  completed: Check,
  not_applicable: Ban,
  blocked: AlertTriangle,
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface SubmissionChecklistPanelProps {
  matterId: string
  tenantId: string
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SubmissionChecklistPanel({ matterId, tenantId }: SubmissionChecklistPanelProps) {
  const { data: items, isLoading } = useSubmissionChecklist(matterId)
  const initChecklist = useInitSubmissionChecklist()
  const toggleItem = useToggleSubmissionItem()
  const updateItem = useUpdateSubmissionItem()

  // Auto-initialize checklist on first visit if empty
  useEffect(() => {
    if (items && items.length === 0 && !initChecklist.isPending) {
      initChecklist.mutate({
        matterId,
        tenantId,
        items: DEFAULT_SUBMISSION_CHECKLIST,
      })
    }
  }, [items, matterId, tenantId, initChecklist])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const checklist = items ?? []
  const completed = checklist.filter((i) => i.status === 'completed' || i.status === 'not_applicable')
  const required = checklist.filter((i) => i.is_required)
  const requiredDone = required.filter((i) => i.status === 'completed' || i.status === 'not_applicable')
  const percent = required.length > 0 ? Math.round((requiredDone.length / required.length) * 100) : 0

  // Group by category
  const categories = ['form', 'document', 'fee', 'biometric', 'other']
  const grouped = categories
    .map((cat) => ({
      category: cat,
      label: cat === 'form' ? 'Forms' : cat === 'document' ? 'Documents' : cat === 'fee' ? 'Fees' : cat === 'biometric' ? 'Biometrics' : 'Other',
      items: checklist.filter((i) => i.category === cat),
    }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="flex flex-col h-full">
      {/* Header with progress */}
      <div className="flex-none px-3 py-2 border-b space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center">
            Submission Sync
            <NorvaWhisper contentKey="engine.checklist" />
          </h3>
          <Badge
            variant={percent === 100 ? 'default' : 'secondary'}
            className="text-[10px]"
          >
            {completed.length}/{checklist.length}
          </Badge>
        </div>
        <Progress value={percent} className="h-1.5" />
        <p className="text-[10px] text-muted-foreground">
          {requiredDone.length}/{required.length} required items complete
        </p>
      </div>

      {/* Checklist items grouped by category */}
      <div className="flex-1 overflow-y-auto">
        {grouped.map((group) => (
          <div key={group.category}>
            <div className="px-3 py-1.5 bg-muted/30 border-b">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {group.label}
              </span>
            </div>
            {group.items.map((item) => (
              <ChecklistItemRow
                key={item.id}
                item={item}
                matterId={matterId}
                onToggle={() => toggleItem.mutate({
                  itemId: item.id,
                  matterId,
                  currentStatus: item.status,
                })}
                onUpdateRef={(ref) => updateItem.mutate({
                  itemId: item.id,
                  matterId,
                  ircc_ref: ref,
                })}
                onUpdateNotes={(notes) => updateItem.mutate({
                  itemId: item.id,
                  matterId,
                  notes,
                })}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Checklist Item Row ──────────────────────────────────────────────────────

function ChecklistItemRow({
  item,
  matterId,
  onToggle,
  onUpdateRef,
  onUpdateNotes,
}: {
  item: SubmissionChecklistItem
  matterId: string
  onToggle: () => void
  onUpdateRef: (ref: string) => void
  onUpdateNotes: (notes: string) => void
}) {
  const [refInput, setRefInput] = useState(item.ircc_ref ?? '')
  const isComplete = item.status === 'completed'
  const StatusIcon = STATUS_ICONS[item.status] ?? Circle
  const CategoryIcon = CATEGORY_ICONS[item.category] ?? FileText

  return (
    <div className={`flex items-center gap-2 px-3 py-2 border-b group ${
      isComplete ? 'bg-emerald-50/50 dark:bg-emerald-950/10' : ''
    }`}>
      {/* Toggle button */}
      <button
        onClick={onToggle}
        className={`flex-none h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
          isComplete
            ? 'bg-emerald-500 border-emerald-500 text-white'
            : 'border-slate-300 hover:border-slate-400 dark:border-slate-600'
        }`}
      >
        {isComplete && <Check className="h-3 w-3" />}
      </button>

      {/* Label */}
      <div className="flex-1 min-w-0">
        <p className={`text-xs leading-tight ${isComplete ? 'line-through text-muted-foreground' : ''}`}>
          {item.label}
        </p>
        {item.ircc_ref && (
          <p className="text-[10px] text-muted-foreground">
            Ref: {item.ircc_ref}
          </p>
        )}
      </div>

      {/* Required badge */}
      {item.is_required && !isComplete && (
        <Badge variant="outline" className="text-[9px] h-4 px-1 border-amber-300 text-amber-700">
          Required
        </Badge>
      )}

      {/* Actions popover */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreHorizontal className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="end">
          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-muted-foreground">IRCC Reference #</label>
              <div className="flex gap-1">
                <Input
                  value={refInput}
                  onChange={(e) => setRefInput(e.target.value)}
                  className="h-7 text-xs"
                  placeholder="e.g. T123456789"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => onUpdateRef(refInput)}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
