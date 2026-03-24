'use client'

import { useState, useRef, useCallback, useMemo } from 'react'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useDocumentSlots } from '@/lib/queries/document-slots'
import { useStreamForms } from '@/lib/queries/pdf-preview'
import {
  useMatterChecklistItems,
  useCreateChecklistItem,
  useUpdateChecklistItem,
  useMatterImmigration,
} from '@/lib/queries/immigration'
import { useSeedRequirements } from '@/lib/hooks/use-seed-requirements'
import { useQuery } from '@tanstack/react-query'
import { buildQuestionnaireFromDB } from '@/lib/ircc/questionnaire-engine-db'
import { createClient } from '@/lib/supabase/client'
import { useFunnelContext } from '../FunnelContext'
import { IRCCQuestionnaire } from '@/components/ircc/ircc-questionnaire'
import type { IRCCProfile } from '@/lib/types/ircc-profile'
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertCircle,
  Clock,
  Plus,
  X,
  Loader2,
  ClipboardList,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface IntakePanelProps {
  matterId: string
  matterTypeId: string | null
  onProfileChange: (profile: Record<string, unknown>) => void
}

// ── Status badge helpers ────────────────────────────────────────────────────

type SlotStatus =
  | 'empty'
  | 'pending_review'
  | 'accepted'
  | 'rejected'
  | 'needs_re_upload'

const STATUS_CONFIG: Record<
  SlotStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof FileText }
> = {
  empty: { label: 'Empty', variant: 'outline', icon: Upload },
  pending_review: { label: 'Pending Review', variant: 'secondary', icon: Clock },
  accepted: { label: 'Accepted', variant: 'default', icon: CheckCircle2 },
  rejected: { label: 'Rejected', variant: 'destructive', icon: AlertCircle },
  needs_re_upload: { label: 'Needs Re-upload', variant: 'destructive', icon: AlertCircle },
}

function SlotStatusBadge({ status }: { status: SlotStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.empty
  const Icon = config.icon

  return (
    <Badge variant={config.variant} className="gap-1 text-xs">
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  )
}

// ── Checklist status badge ──────────────────────────────────────────────────

const CHECKLIST_STATUS_CONFIG: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  missing: { label: 'Missing', variant: 'outline' },
  received: { label: 'Received', variant: 'secondary' },
  accepted: { label: 'Accepted', variant: 'default' },
  approved: { label: 'Approved', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
}

// ── Program category → hidden sections map ──────────────────────────────────

const HIDDEN_SECTIONS: Record<string, string[]> = {
  study_permit: ['work-permit-details', 'spousal-sponsorship'],
  work_permit: ['study-details', 'spousal-sponsorship'],
  spousal_sponsorship: ['study-details', 'work-permit-details'],
}

// ── IntakePanel ─────────────────────────────────────────────────────────────

export function IntakePanel({ matterId, matterTypeId, onProfileChange }: IntakePanelProps) {
  const { tenantId } = useFunnelContext()

  // ── Existing profile (empty on first load — prefill handled by engine) ──
  const [existingProfile] = useState<Partial<IRCCProfile>>({})
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Immigration metadata for program_category ────────────────────────────
  const { data: matterImmigration } = useMatterImmigration(matterId)
  const programCategory = matterImmigration?.program_category ?? null
  const caseTypeId = matterImmigration?.case_type_id ?? null

  // ── Auto-seed checklist from templates when case type is set ─────────────
  const { seeding } = useSeedRequirements(matterId, tenantId, caseTypeId)

  // ── Derive form codes from the matter type's stream forms ──────────────
  const { data: streamForms } = useStreamForms(matterTypeId)
  const formCodes = (streamForms ?? []).map((f) => f.formCode).filter(Boolean)
  const formIds = useMemo(() => (streamForms ?? []).map((f) => f.formId).filter(Boolean), [streamForms])

  // ── Build questionnaire from DB (replaces legacy registry lookup) ────────
  const { data: dbQuestionnaire } = useQuery({
    queryKey: ['db-questionnaire', ...formIds],
    queryFn: async () => {
      if (formIds.length === 0) return null
      const supabase = createClient()
      return buildQuestionnaireFromDB(formIds, existingProfile ?? {}, supabase)
    },
    enabled: formIds.length > 0,
    staleTime: 5 * 60_000,
  })

  // ── onSave / onComplete: flatten profile → push to parent for PDF sync ─
  const handleSave = useCallback(
    (profile: Partial<IRCCProfile>) => {
      const flat: Record<string, unknown> = {}
      flattenProfile(profile, '', flat)

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        onProfileChange(flat)
      }, 300)
    },
    [onProfileChange],
  )

  const handleComplete = useCallback(
    (profile: Partial<IRCCProfile>) => {
      const flat: Record<string, unknown> = {}
      flattenProfile(profile, '', flat)
      onProfileChange(flat)
    },
    [onProfileChange],
  )

  // ── Document slots ──────────────────────────────────────────────────────
  const { data: slots, isLoading: slotsLoading } = useDocumentSlots(matterId)

  const totalSlots = slots?.length ?? 0
  const acceptedSlots =
    slots?.filter((s) => s.status === 'accepted').length ?? 0
  const slotsPct = totalSlots > 0 ? Math.round((acceptedSlots / totalSlots) * 100) : 0

  // ── Checklist items ───────────────────────────────────────────────────────
  const { data: checklistItems, isLoading: checklistLoading } =
    useMatterChecklistItems(matterId)
  const activeItems = (checklistItems ?? []).filter((i) => i.status !== 'removed')
  const receivedCount = activeItems.filter(
    (i) => i.status === 'received' || i.status === 'accepted' || i.status === 'approved',
  ).length

  // ── Checklist mutations ──────────────────────────────────────────────────
  const createItem = useCreateChecklistItem()
  const updateItem = useUpdateChecklistItem()

  // ── Add custom item form state ────────────────────────────────────────────
  const [showAddForm, setShowAddForm] = useState(false)
  const [newItemName, setNewItemName] = useState('')

  const handleAddCustom = () => {
    if (!newItemName.trim()) return
    createItem.mutate({
      tenant_id: tenantId,
      matter_id: matterId,
      document_name: newItemName.trim(),
      category: 'custom',
      is_required: false,
      sort_order: activeItems.length + 1,
      status: 'missing',
    })
    setNewItemName('')
    setShowAddForm(false)
  }

  const handleRemoveItem = (itemId: string) => {
    updateItem.mutate({ id: itemId, status: 'removed' })
  }

  // ── Sections to hide based on program category ────────────────────────────
  const hiddenSections = programCategory
    ? HIDDEN_SECTIONS[programCategory] ?? []
    : []

  return (
    <div className="p-4">
      <Accordion type="multiple" defaultValue={['questionnaire', 'requirements']}>
        {/* ── Questionnaire Section ───────────────────────────────────── */}
        <AccordionItem value="questionnaire">
          <AccordionTrigger className="text-sm font-medium">
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Questionnaire
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="p-1">
              {formCodes.length > 0 ? (
                <IRCCQuestionnaire
                  formCodes={formCodes}
                  existingProfile={existingProfile}
                  prebuiltQuestionnaire={dbQuestionnaire ?? null}
                  onSave={handleSave}
                  onComplete={handleComplete}
                  matterId={matterId}
                  canVerify
                />
              ) : (
                <div className="p-4 text-center">
                  <p className="text-muted-foreground text-sm">
                    No IRCC forms configured for this matter type.
                  </p>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── Document Requirements (Checklist) ────────────────────────── */}
        <AccordionItem value="requirements">
          <AccordionTrigger className="text-sm font-medium">
            <span className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Document Requirements
              {activeItems.length > 0 && (
                <span className="text-muted-foreground ml-1 text-xs">
                  ({receivedCount}/{activeItems.length} received)
                </span>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 p-4">
              {/* Seeding indicator */}
              {seeding && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Initialising requirements from template…
                </div>
              )}

              {/* Progress bar */}
              {activeItems.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-muted-foreground flex justify-between text-xs">
                    <span>
                      {receivedCount} of {activeItems.length} requirements fulfilled
                    </span>
                    <span>
                      {Math.round((receivedCount / activeItems.length) * 100)}%
                    </span>
                  </div>
                  <Progress
                    value={
                      activeItems.length > 0
                        ? Math.round((receivedCount / activeItems.length) * 100)
                        : 0
                    }
                    className="h-2"
                  />
                </div>
              )}

              {/* Loading state */}
              {checklistLoading && (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              )}

              {/* Checklist items */}
              {!checklistLoading && activeItems.length > 0 && (
                <ul className="space-y-1.5">
                  {activeItems.map((item) => {
                    const statusConfig =
                      CHECKLIST_STATUS_CONFIG[item.status] ??
                      CHECKLIST_STATUS_CONFIG.missing
                    return (
                      <li
                        key={item.id}
                        className="flex items-center gap-2 rounded-md border px-3 py-2"
                      >
                        {/* Status checkbox indicator */}
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            item.status === 'accepted' || item.status === 'approved' || item.status === 'received'
                              ? 'border-emerald-500 bg-emerald-500 text-white'
                              : 'border-muted-foreground/30'
                          }`}
                        >
                          {(item.status === 'accepted' || item.status === 'approved' || item.status === 'received') && (
                            <CheckCircle2 className="h-3 w-3" />
                          )}
                        </span>

                        {/* Name */}
                        <span className="flex-1 text-sm">{item.document_name}</span>

                        {/* Required badge */}
                        {item.is_required && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            Required
                          </Badge>
                        )}

                        {/* Status badge */}
                        <Badge variant={statusConfig.variant} className="text-xs">
                          {statusConfig.label}
                        </Badge>

                        {/* Remove button (only for non-required or custom items) */}
                        {!item.is_required && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="text-muted-foreground hover:text-destructive shrink-0 p-0.5 transition-colors"
                            title="Remove requirement"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}

              {/* Empty state */}
              {!checklistLoading && activeItems.length === 0 && !seeding && (
                <p className="text-muted-foreground text-center text-sm py-2">
                  No document requirements configured. Add a custom requirement below.
                </p>
              )}

              {/* Add custom form */}
              {showAddForm ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder="e.g. Explanation Letter for Gap Year"
                    className="h-8 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddCustom()
                      if (e.key === 'Escape') {
                        setShowAddForm(false)
                        setNewItemName('')
                      }
                    }}
                    autoFocus
                  />
                  <Button
                    size="sm"
                    className="h-8 shrink-0"
                    onClick={handleAddCustom}
                    disabled={!newItemName.trim() || createItem.isPending}
                  >
                    {createItem.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      'Add'
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0"
                    onClick={() => {
                      setShowAddForm(false)
                      setNewItemName('')
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => setShowAddForm(true)}
                >
                  <Plus className="h-3 w-3" />
                  Add Custom Requirement
                </Button>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── Document Slots (Uploads) ─────────────────────────────────── */}
        <AccordionItem
          value="documents"
          className={hiddenSections.length > 0 ? '' : ''}
        >
          <AccordionTrigger className="text-sm font-medium">
            <span className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Uploaded Documents
              {totalSlots > 0 && (
                <span className="text-muted-foreground ml-1 text-xs">
                  ({acceptedSlots}/{totalSlots})
                </span>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 p-4">
              {/* Progress bar */}
              {totalSlots > 0 && (
                <div className="space-y-1.5">
                  <div className="text-muted-foreground flex justify-between text-xs">
                    <span>
                      {acceptedSlots} of {totalSlots} documents accepted
                    </span>
                    <span>{slotsPct}%</span>
                  </div>
                  <Progress value={slotsPct} className="h-2" />
                </div>
              )}

              {slotsLoading && (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              )}

              {!slotsLoading && slots && slots.length > 0 && (
                <ul className="space-y-2">
                  {slots.map((slot) => (
                    <li
                      key={slot.id}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                    >
                      <span className="flex items-center gap-2 text-sm">
                        <FileText className="text-muted-foreground h-4 w-4" />
                        {slot.slot_name}
                      </span>
                      <SlotStatusBadge
                        status={(slot.status as SlotStatus) ?? 'empty'}
                      />
                    </li>
                  ))}
                </ul>
              )}

              {!slotsLoading && (!slots || slots.length === 0) && (
                <p className="text-muted-foreground text-center text-sm">
                  No document slots configured for this matter.
                </p>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* ── Conditional section hiding via CSS ────────────────────────── */}
      {hiddenSections.length > 0 && (
        <style>{`
          ${hiddenSections.map((s) => `[data-section="${s}"]`).join(',\n          ')} {
            display: none !important;
          }
        `}</style>
      )}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Recursively flatten a nested IRCCProfile into dot-notation keys.
 * e.g. { personal: { family_name: 'Khan' } } → { 'personal.family_name': 'Khan' }
 * This matches the format expected by the PDF preview endpoint.
 */
function flattenProfile(
  obj: Record<string, unknown>,
  prefix: string,
  result: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    ) {
      flattenProfile(value as Record<string, unknown>, path, result)
    } else {
      result[path] = value
    }
  }
}
