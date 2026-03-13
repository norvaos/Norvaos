'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import { FileText, Check, RotateCcw, Loader2, Upload, Plus, X, Eye } from 'lucide-react'
import {
  useDocumentSlots,
  useDocumentSlotVersions,
  useReviewSlot,
  useUploadToSlot,
  useCreateCustomSlot,
  useRemoveSlot,
  useDocumentTemplatesCatalogue,
  useInstantiateTemplateSlot,
} from '@/lib/queries/document-slots'
import { useMatterPeople } from '@/lib/queries/matter-people'
import {
  StatusBadge,
  formatPersonRole,
  formatCategory,
} from '@/components/matters/document-slot-panel'
import type { SlotStatus } from '@/components/matters/document-slot-panel'
import {
  SectionSummaryStrip,
  type SectionMetric,
} from '@/components/matters/workflow/section-summary-strip'
import type { ImmigrationReadinessData } from '@/lib/queries/immigration-readiness'
import { DocumentViewer } from '@/components/shared/document-viewer'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectGroup,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

// ── Rejection Reason Codes ───────────────────────────────────────────────────

export type RejectionReasonCode =
  | 'blurry'
  | 'corner_cut'
  | 'not_readable'
  | 'needs_translation'
  | 'wrong_document'
  | 'expired'
  | 'incomplete'
  | 'other'

const REJECTION_REASON_OPTIONS: { code: RejectionReasonCode; label: string; defaultText: string }[] = [
  {
    code: 'blurry',
    label: 'Blurry or out of focus',
    defaultText: 'The document appears blurry or out of focus. Please upload a clearer copy.',
  },
  {
    code: 'corner_cut',
    label: 'Corners or edges cut off',
    defaultText: 'The document corners or edges are cut off. Please ensure all four borders are fully visible.',
  },
  {
    code: 'not_readable',
    label: 'Text not readable',
    defaultText: 'The text in this document is not legible. Please upload a higher quality scan or photo.',
  },
  {
    code: 'needs_translation',
    label: 'Needs certified translation',
    defaultText: 'This document requires a certified translation into English or French. Please provide the original document along with a certified translation.',
  },
  {
    code: 'wrong_document',
    label: 'Wrong document uploaded',
    defaultText: 'The uploaded document does not match what was requested. Please check the document name and upload the correct document.',
  },
  {
    code: 'expired',
    label: 'Document has expired',
    defaultText: 'This document has passed its expiry date. Please obtain and upload a current version.',
  },
  {
    code: 'incomplete',
    label: 'Incomplete — missing pages',
    defaultText: 'The document appears to be missing pages or required sections. Please upload the complete document.',
  },
  {
    code: 'other',
    label: 'Other reason',
    defaultText: '',
  },
]

// ── Types ───────────────────────────────────────────────────────────────────────

export interface DocumentsWorkflowSectionProps {
  matterId: string
  tenantId: string
  readinessData: ImmigrationReadinessData | null | undefined
  /** Controlled expand state (overrides internal state when provided) */
  isExpanded?: boolean
  /** Controlled toggle callback */
  onToggle?: () => void
  /** Fallback initial value when uncontrolled */
  defaultExpanded?: boolean
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

type SlotWithDoc = NonNullable<ReturnType<typeof useDocumentSlots>['data']>[number]

function personDisplayName(
  personId: string | null,
  personRole: string | null,
  peopleMap: Map<string, { first_name: string; last_name: string; person_role: string }>,
): string {
  if (!personId) return 'Matter-Level'
  const person = peopleMap.get(personId)
  if (person) {
    const name = [person.first_name, person.last_name].filter(Boolean).join(' ')
    const role = formatPersonRole(person.person_role)
    return name ? `${name} (${role})` : role
  }
  return formatPersonRole(personRole) || 'Unknown Person'
}

// ── Main Component ──────────────────────────────────────────────────────────────

export function DocumentsWorkflowSection({
  matterId,
  tenantId,
  readinessData,
  isExpanded: controlledExpanded,
  onToggle: controlledToggle,
  defaultExpanded = false,
}: DocumentsWorkflowSectionProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded)
  const expanded = controlledExpanded ?? internalExpanded
  const handleToggle = controlledToggle ?? (() => setInternalExpanded((p) => !p))

  // Lazy-fetch slots only when expanded
  const {
    data: slots,
    isLoading: slotsLoading,
    error: slotsError,
  } = useDocumentSlots(expanded ? matterId : undefined)

  // Fetch people for name resolution
  const { data: people } = useMatterPeople(expanded ? matterId : '')

  // Build a people lookup map
  const peopleMap = useMemo(() => {
    const map = new Map<string, { first_name: string; last_name: string; person_role: string }>()
    if (people) {
      for (const p of people) {
        map.set(p.id, {
          first_name: p.first_name,
          last_name: p.last_name,
          person_role: p.person_role,
        })
      }
    }
    return map
  }, [people])

  // ── Summary metrics from readinessData (shown even when collapsed) ──────────

  const docs = readinessData?.documents
  const metrics: SectionMetric[] = useMemo(() => {
    if (!docs) return []
    const result: SectionMetric[] = [
      {
        label: 'Accepted',
        value: `${docs.accepted}/${docs.totalSlots}`,
        color: docs.accepted === docs.totalSlots ? 'green' : 'default',
      },
    ]
    if (docs.pendingReview > 0) {
      result.push({ label: 'Pending Review', value: docs.pendingReview, color: 'blue' })
    }
    if (docs.needsReUpload > 0) {
      result.push({ label: 'Needs Re-upload', value: docs.needsReUpload, color: 'amber' })
    }
    if (docs.empty > 0) {
      result.push({ label: 'Missing', value: docs.empty, color: 'red' })
    }
    return result
  }, [docs])

  // Highlight: first 2 missing doc names from blockers
  const highlights = useMemo(() => {
    if (!readinessData?.readinessMatrix) return []
    const docBlockers = readinessData.readinessMatrix.allBlockers
      .filter((b) => b.type === 'document')
      .slice(0, 2)
      .map((b) => b.label + (b.person_name ? ` (${b.person_name})` : ''))
    return docBlockers
  }, [readinessData])

  // Badge for section header
  const badge = useMemo(() => {
    if (!docs) return undefined
    if (docs.pendingReview > 0) {
      return { text: `${docs.pendingReview} to review`, variant: 'warning' as const }
    }
    if (docs.needsReUpload > 0 || docs.rejected > 0) {
      return { text: 'Action needed', variant: 'destructive' as const }
    }
    if (docs.accepted === docs.totalSlots && docs.totalSlots > 0) {
      return { text: 'Complete', variant: 'default' as const }
    }
    return undefined
  }, [docs])

  return (
    <div className="space-y-0">
      <SectionSummaryStrip
        title="Documents"
        icon={FileText}
        metrics={metrics}
        highlights={highlights}
        isExpanded={expanded}
        onToggle={handleToggle}
        badge={badge}
      />

      {expanded && (
        <div className="border border-t-0 rounded-b-lg bg-card px-4 py-4 space-y-4">
          {slotsLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          )}

          {slotsError && (
            <p className="text-sm text-destructive">
              Failed to load documents. Please try again.
            </p>
          )}

          {slots && slots.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No document requirements configured.
            </p>
          )}

          {slots && slots.length > 0 && (
            <DocumentsDetailView
              slots={slots}
              matterId={matterId}
              peopleMap={peopleMap}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── Detail View: Grouping + Bulk Accept + Inline Review ─────────────────────

function DocumentsDetailView({
  slots,
  matterId,
  peopleMap,
}: {
  slots: SlotWithDoc[]
  matterId: string
  peopleMap: Map<string, { first_name: string; last_name: string; person_role: string }>
}) {
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set())
  const reviewSlot = useReviewSlot()
  const [bulkProcessing, setBulkProcessing] = useState(false)
  const createCustomSlot = useCreateCustomSlot()
  const instantiateTemplate = useInstantiateTemplateSlot()
  const { data: catalogueTemplates = [] } = useDocumentTemplatesCatalogue(matterId)

  // Add Document UI state: 'idle' | 'picker' | 'custom'
  const [addMode, setAddMode] = useState<'idle' | 'picker' | 'custom'>('idle')
  const [newDocName, setNewDocName] = useState('')

  // Group by person_id, sort by role order
  const grouped = useMemo(() => {
    const byPerson = new Map<string | null, SlotWithDoc[]>()
    for (const slot of slots) {
      const key = slot.person_id ?? null
      if (!byPerson.has(key)) byPerson.set(key, [])
      byPerson.get(key)!.push(slot)
    }
    // Sort: PA first, then spouse, dependent, then null (matter-level)
    const order = ['principal_applicant', 'spouse', 'dependent', 'co_sponsor']
    return [...byPerson.entries()].sort(([, a], [, b]) => {
      const aRole = a[0]?.person_role ?? 'zzz'
      const bRole = b[0]?.person_role ?? 'zzz'
      const aIdx = order.indexOf(aRole)
      const bIdx = order.indexOf(bRole)
      return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx)
    })
  }, [slots])

  // All pending_review slot IDs
  const pendingSlotIds = useMemo(
    () => slots.filter((s) => s.status === 'pending_review').map((s) => s.id),
    [slots],
  )

  const toggleSlot = useCallback((slotId: string) => {
    setSelectedSlots((prev) => {
      const next = new Set(prev)
      if (next.has(slotId)) {
        next.delete(slotId)
      } else {
        next.add(slotId)
      }
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedSlots(new Set(pendingSlotIds))
  }, [pendingSlotIds])

  const deselectAll = useCallback(() => {
    setSelectedSlots(new Set())
  }, [])

  const handleBulkAccept = useCallback(async () => {
    if (selectedSlots.size === 0) return
    setBulkProcessing(true)
    let successCount = 0
    let errorCount = 0

    for (const slotId of selectedSlots) {
      try {
        await reviewSlot.mutateAsync({
          slotId,
          matterId,
          action: 'accept',
        })
        successCount++
      } catch {
        errorCount++
      }
    }

    setBulkProcessing(false)
    setSelectedSlots(new Set())

    if (errorCount > 0) {
      toast.error(`${errorCount} document(s) failed to accept`)
    }
    if (successCount > 0) {
      toast.success(`${successCount} document(s) accepted`)
    }
  }, [selectedSlots, matterId, reviewSlot])

  const handleAddCustomDoc = useCallback(() => {
    const trimmed = newDocName.trim()
    if (!trimmed || createCustomSlot.isPending) return
    createCustomSlot.mutate(
      { matterId, slotName: trimmed },
      {
        onSuccess: () => {
          setNewDocName('')
          setAddMode('idle')
        },
      },
    )
  }, [newDocName, matterId, createCustomSlot])

  const handleSelectTemplate = useCallback(
    (value: string) => {
      if (value === '__custom__') {
        setAddMode('custom')
        return
      }
      // Find template to check if already instantiated (safety guard)
      const tpl = catalogueTemplates.find((t) => t.id === value)
      if (!tpl || tpl.isInstantiated) return
      instantiateTemplate.mutate(
        { matterId, slotTemplateId: value },
        { onSuccess: () => setAddMode('idle') },
      )
    },
    [matterId, instantiateTemplate, catalogueTemplates],
  )

  return (
    <div className="space-y-4">
      {/* Bulk accept bar */}
      {pendingSlotIds.length >= 2 && (
        <div className="flex items-center gap-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
          <span className="text-xs font-medium text-blue-700">
            {pendingSlotIds.length} pending review
          </span>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-blue-700"
            onClick={selectedSlots.size === pendingSlotIds.length ? deselectAll : selectAll}
          >
            {selectedSlots.size === pendingSlotIds.length ? 'Deselect All' : 'Select All'}
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs bg-green-600 hover:bg-green-700"
            onClick={handleBulkAccept}
            disabled={selectedSlots.size === 0 || bulkProcessing}
          >
            {bulkProcessing ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Check className="mr-1 h-3 w-3" />
            )}
            Accept Selected ({selectedSlots.size})
          </Button>
        </div>
      )}

      {/* Person groups */}
      {grouped.map(([personId, personSlots]) => (
        <PersonGroup
          key={personId ?? '__matter__'}
          personId={personId}
          slots={personSlots}
          matterId={matterId}
          peopleMap={peopleMap}
          selectedSlots={selectedSlots}
          onToggleSlot={toggleSlot}
          showCheckboxes={pendingSlotIds.length >= 2}
        />
      ))}

      {/* Add Document row */}
      {addMode === 'idle' && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-muted-foreground hover:text-foreground w-full justify-start"
          onClick={() => {
            const hasAvailable = catalogueTemplates.some((t) => !t.isInstantiated)
            setAddMode(hasAvailable ? 'picker' : 'custom')
          }}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Document
        </Button>
      )}

      {addMode === 'picker' && (
        <div className="flex items-center gap-2 pt-1">
          <Select
            onValueChange={handleSelectTemplate}
            disabled={instantiateTemplate.isPending}
          >
            <SelectTrigger className="h-8 text-sm flex-1">
              <SelectValue placeholder="Select a document to add…" />
            </SelectTrigger>
            <SelectContent>
              {(() => {
                const available = catalogueTemplates.filter((t) => !t.isInstantiated)
                if (available.length === 0) {
                  return (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      All standard documents are already on this matter.
                    </div>
                  )
                }
                const byCategory = available.reduce<Record<string, typeof available>>(
                  (acc, t) => {
                    const cat = t.category || 'general'
                    ;(acc[cat] = acc[cat] ?? []).push(t)
                    return acc
                  },
                  {},
                )
                return Object.entries(byCategory).map(([cat, items]) => (
                  <SelectGroup key={cat}>
                    <SelectLabel className="capitalize">{cat}</SelectLabel>
                    {items.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.slot_name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))
              })()}
              <SelectSeparator />
              <SelectItem value="__custom__">
                <span className="italic text-muted-foreground">+ New custom document…</span>
              </SelectItem>
            </SelectContent>
          </Select>
          {instantiateTemplate.isPending && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs shrink-0"
            onClick={() => setAddMode('idle')}
            disabled={instantiateTemplate.isPending}
          >
            Cancel
          </Button>
        </div>
      )}

      {addMode === 'custom' && (
        <div className="flex items-center gap-2 pt-1">
          <Input
            autoFocus
            value={newDocName}
            onChange={(e) => setNewDocName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleAddCustomDoc() }
              if (e.key === 'Escape') { setAddMode('idle'); setNewDocName('') }
            }}
            placeholder="Document name, e.g. Employment letter"
            className="h-8 text-sm flex-1"
            disabled={createCustomSlot.isPending}
          />
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={handleAddCustomDoc}
            disabled={!newDocName.trim() || createCustomSlot.isPending}
          >
            {createCustomSlot.isPending ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Plus className="mr-1 h-3 w-3" />
            )}
            Add
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => { setAddMode('picker'); setNewDocName('') }}
            disabled={createCustomSlot.isPending}
          >
            Back
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Person Group ────────────────────────────────────────────────────────────────

function PersonGroup({
  personId,
  slots,
  matterId,
  peopleMap,
  selectedSlots,
  onToggleSlot,
  showCheckboxes,
}: {
  personId: string | null
  slots: SlotWithDoc[]
  matterId: string
  peopleMap: Map<string, { first_name: string; last_name: string; person_role: string }>
  selectedSlots: Set<string>
  onToggleSlot: (slotId: string) => void
  showCheckboxes: boolean
}) {
  // Sub-group by category
  const byCategory = useMemo(() => {
    const groups = new Map<string, SlotWithDoc[]>()
    for (const slot of slots) {
      const cat = slot.category || 'general'
      if (!groups.has(cat)) groups.set(cat, [])
      groups.get(cat)!.push(slot)
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [slots])

  const displayName = personDisplayName(personId, slots[0]?.person_role ?? null, peopleMap)

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground border-b pb-1">
        {displayName}
      </h3>

      {byCategory.map(([category, categorySlots]) => (
        <div key={category} className="space-y-1.5 ml-1">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mt-2">
            {formatCategory(category)}
          </h4>

          {categorySlots.map((slot) => (
            <InlineSlotRow
              key={slot.id}
              slot={slot}
              matterId={matterId}
              isSelected={selectedSlots.has(slot.id)}
              onToggle={() => onToggleSlot(slot.id)}
              showCheckbox={showCheckboxes && slot.status === 'pending_review'}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

// ── View Document Dialog (lazy-fetches latest version) ──────────────────────

function ViewDocumentDialog({
  slotId,
  slotName,
  open,
  onOpenChange,
}: {
  slotId: string
  slotName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: versions, isLoading } = useDocumentSlotVersions(open ? slotId : undefined)
  const latest = versions?.[0] // versions are sorted descending

  return (
    <>
      {/* Trigger loading by rendering dialog open state */}
      {open && latest && (
        <DocumentViewer
          storagePath={latest.storage_path}
          fileName={latest.file_name}
          fileType={latest.file_type ?? null}
          open={open}
          onOpenChange={onOpenChange}
        />
      )}
      {open && isLoading && (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="sm:max-w-4xl h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="truncate pr-8">{slotName}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </DialogContent>
        </Dialog>
      )}
      {open && !isLoading && !latest && (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{slotName}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground py-4 text-center">
              No document versions found.
            </p>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

// ── Reject Document Dialog ───────────────────────────────────────────────────

function RejectDocumentDialog({
  slotId,
  slotName,
  matterId,
  open,
  onOpenChange,
}: {
  slotId: string
  slotName: string
  matterId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const reviewSlot = useReviewSlot()
  const [reasonCode, setReasonCode] = useState<RejectionReasonCode | ''>('')
  const [reasonText, setReasonText] = useState('')
  const [notifyClient, setNotifyClient] = useState(true)

  const handleReasonCodeChange = useCallback((code: string) => {
    const typed = code as RejectionReasonCode
    setReasonCode(typed)
    const option = REJECTION_REASON_OPTIONS.find((o) => o.code === typed)
    setReasonText(option?.defaultText ?? '')
  }, [])

  const handleSubmit = useCallback(() => {
    if (!reasonCode) return
    reviewSlot.mutate(
      {
        slotId,
        matterId,
        action: 'needs_re_upload',
        reason: reasonText || undefined,
        rejectionReasonCode: reasonCode,
        notifyClient,
      },
      {
        onSuccess: () => {
          onOpenChange(false)
          setReasonCode('')
          setReasonText('')
          setNotifyClient(true)
        },
      }
    )
  }, [slotId, matterId, reasonCode, reasonText, notifyClient, reviewSlot, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Request Re-upload</DialogTitle>
          <p className="text-sm text-muted-foreground truncate">{slotName}</p>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Rejection reason code */}
          <div className="space-y-1.5">
            <Label className="text-sm">Reason for rejection</Label>
            <Select value={reasonCode} onValueChange={handleReasonCodeChange}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select a reason…" />
              </SelectTrigger>
              <SelectContent>
                {REJECTION_REASON_OPTIONS.map((opt) => (
                  <SelectItem key={opt.code} value={opt.code}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reason text (auto-filled, editable) */}
          <div className="space-y-1.5">
            <Label className="text-sm">
              Message to client
              <span className="text-muted-foreground font-normal ml-1">(shown in portal)</span>
            </Label>
            <Textarea
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder="Describe the issue so the client knows how to fix it…"
              className="text-sm resize-none"
              rows={3}
            />
          </div>

          {/* Notify client toggle */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="notify-client"
              checked={notifyClient}
              onCheckedChange={(v) => setNotifyClient(!!v)}
            />
            <Label htmlFor="notify-client" className="text-sm font-normal cursor-pointer">
              Send email notification to client
            </Label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={reviewSlot.isPending}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-orange-600 hover:bg-orange-700 text-white"
            onClick={handleSubmit}
            disabled={!reasonCode || reviewSlot.isPending}
          >
            {reviewSlot.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Request Re-upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Inline Slot Row with Quick-Review + Upload ──────────────────────────────────

function InlineSlotRow({
  slot,
  matterId,
  isSelected,
  onToggle,
  showCheckbox,
}: {
  slot: SlotWithDoc
  matterId: string
  isSelected: boolean
  onToggle: () => void
  showCheckbox: boolean
}) {
  const reviewSlot = useReviewSlot()
  const uploadSlot = useUploadToSlot()
  const removeSlot = useRemoveSlot()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const status = (slot.status as SlotStatus) ?? 'empty'
  const isPending = status === 'pending_review'
  const canUpload = status === 'empty' || status === 'needs_re_upload' || status === 'rejected'
  const hasDocument = status !== 'empty'

  const handleAccept = useCallback(() => {
    reviewSlot.mutate({
      slotId: slot.id,
      matterId,
      action: 'accept',
    })
  }, [slot.id, matterId, reviewSlot])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      uploadSlot.mutate({ file, slotId: slot.id, matterId })
      e.target.value = ''
    },
    [slot.id, matterId, uploadSlot],
  )

  return (
    <>
      <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
        {/* Checkbox for bulk select */}
        {showCheckbox && (
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggle}
            aria-label={`Select ${slot.slot_name}`}
          />
        )}

        {/* Slot name */}
        <div className="flex-1 min-w-0">
          <span className="font-medium text-sm truncate block">{slot.slot_name}</span>
          {slot.description && (
            <span className="text-xs text-muted-foreground truncate block">{slot.description}</span>
          )}
        </div>

        {/* Status badge */}
        <StatusBadge status={status} />

        {/* View button — shown whenever a document has been uploaded */}
        {hasDocument && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => setViewerOpen(true)}
            title="View document"
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
        )}

        {/* Upload action for empty / needs_re_upload / rejected */}
        {canUpload && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
              accept="application/pdf,image/*,.doc,.docx"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs text-blue-700 border-blue-200 hover:bg-blue-50 shrink-0 ml-1"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadSlot.isPending}
            >
              {uploadSlot.isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Upload className="mr-1 h-3 w-3" />
              )}
              Upload
            </Button>
          </>
        )}

        {/* Quick-review actions for pending_review */}
        {isPending && (
          <div className="flex items-center gap-1 shrink-0 ml-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs text-green-700 border-green-200 hover:bg-green-50"
              onClick={handleAccept}
              disabled={reviewSlot.isPending}
            >
              {reviewSlot.isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Check className="mr-1 h-3 w-3" />
              )}
              Accept
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs text-orange-700 border-orange-200 hover:bg-orange-50"
              onClick={() => setRejectDialogOpen(true)}
              disabled={reviewSlot.isPending}
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              Reject
            </Button>
          </div>
        )}

        {/* Remove slot */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
          onClick={() => removeSlot.mutate({ slotId: slot.id, matterId })}
          disabled={removeSlot.isPending}
          title="Remove document requirement"
        >
          {removeSlot.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <X className="h-3 w-3" />
          )}
        </Button>
      </div>

      {/* Document Viewer — lazy-fetches latest version on open */}
      <ViewDocumentDialog
        slotId={slot.id}
        slotName={slot.slot_name}
        open={viewerOpen}
        onOpenChange={setViewerOpen}
      />

      {/* Reject / Request Re-upload Dialog */}
      <RejectDocumentDialog
        slotId={slot.id}
        slotName={slot.slot_name}
        matterId={matterId}
        open={rejectDialogOpen}
        onOpenChange={setRejectDialogOpen}
      />
    </>
  )
}
