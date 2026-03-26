'use client'

import { useState, useMemo, useCallback } from 'react'
import { AlertTriangle, ChevronRight, ShieldCheck, FileSearch, ClipboardList, RefreshCw, CheckCircle2, Upload, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SectionSummaryStrip } from './section-summary-strip'
import type { ImmigrationReadinessData } from '@/lib/queries/immigration-readiness'
import { useSyncIntakeStatus } from '@/lib/queries/immigration-readiness'
import { useUploadToSlot, useReviewSlot } from '@/lib/queries/document-slots'
import type { DocumentSlot } from '@/lib/queries/document-slots'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ReviewBlockersWorkflowSectionProps {
  readinessData: ImmigrationReadinessData | null | undefined
  matterId: string
  /** Document slots for the matter  -  used to resolve slot_slug → slot_id for direct upload */
  slots?: DocumentSlot[]
  /** Controlled expand state (overrides internal state when provided) */
  isExpanded?: boolean
  /** Controlled toggle callback */
  onToggle?: () => void
  /** Fallback initial value when uncontrolled */
  defaultExpanded?: boolean
  onNavigateToSection: (section: 'questions' | 'documents' | 'formPacks') => void
  onNavigateToField?: (profilePath: string) => void
  onOpenLawyerReview?: () => void
  onOpenContradictionOverride?: () => void
}

interface RankedBlockerGroup {
  tier: 1 | 2 | 3 | 4
  tierLabel: string
  tierColor: string // Tailwind class
  tierIcon: string // emoji for visual distinction
  items: BlockerItem[]
}

interface BlockerItem {
  type: 'question' | 'document' | 'contradiction' | 'lawyer_review' | 'pending_review' | 'stale_pack'
  label: string
  personName?: string
  identifier?: string
  action: {
    label: string
    section?: 'questions' | 'documents' | 'formPacks'
    profilePath?: string
    specialAction?: 'lawyer_review' | 'contradiction_override'
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ReviewBlockersWorkflowSection({
  readinessData,
  matterId,
  slots = [],
  isExpanded: controlledExpanded,
  onToggle: controlledToggle,
  defaultExpanded = false,
  onNavigateToSection,
  onNavigateToField,
  onOpenLawyerReview,
  onOpenContradictionOverride,
}: ReviewBlockersWorkflowSectionProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded)
  const syncStatus = useSyncIntakeStatus()
  const isExpanded = controlledExpanded ?? internalExpanded
  const handleToggle = controlledToggle ?? (() => setInternalExpanded((p) => !p))

  const matrix = readinessData?.readinessMatrix

  // Compute ranked blocker groups
  const rankedGroups = useMemo(() => {
    if (!readinessData) return []
    const groups: RankedBlockerGroup[] = []

    // Tier 1: Critical  -  lawyer review + contradictions
    const criticalItems: BlockerItem[] = []

    if (readinessData.lawyerReview.required && readinessData.lawyerReview.status !== 'approved' && readinessData.lawyerReview.status !== 'not_required') {
      const reviewReasons = matrix?.lawyerReviewReasons ?? []
      criticalItems.push({
        type: 'lawyer_review',
        label: `Lawyer review required${reviewReasons.length > 0 ? `  -  ${reviewReasons[0]}` : ''}`,
        action: { label: 'Open Lawyer Review', specialAction: 'lawyer_review' },
      })
    }

    if (readinessData.contradictions.blockingCount > 0 && !readinessData.contradictions.overridden) {
      for (const flag of readinessData.contradictions.flags.filter((f) => f.severity === 'blocking')) {
        criticalItems.push({
          type: 'contradiction',
          label: flag.message,
          action: { label: 'Override Contradiction', specialAction: 'contradiction_override' },
        })
      }
    }

    if (criticalItems.length > 0) {
      groups.push({
        tier: 1,
        tierLabel: 'Critical',
        tierColor: 'text-red-700 bg-red-50 border-red-200',
        tierIcon: '🔴',
        items: criticalItems,
      })
    }

    // Tier 2: Drafting blockers
    const draftingItems: BlockerItem[] = (matrix?.draftingBlockers ?? []).map((b) => ({
      type: b.type,
      label: b.label,
      personName: b.person_name,
      identifier: b.identifier,
      action: {
        label: b.type === 'question' ? 'Complete Field' : 'Upload Document',
        section: b.type === 'question' ? 'questions' as const : 'documents' as const,
        profilePath: b.type === 'question' ? b.identifier : undefined,
      },
    }))

    if (draftingItems.length > 0) {
      groups.push({
        tier: 2,
        tierLabel: 'Blocks Drafting',
        tierColor: 'text-orange-700 bg-orange-50 border-orange-200',
        tierIcon: '🟠',
        items: draftingItems,
      })
    }

    // Tier 3: Filing blockers (exclude items already in drafting)
    const draftingIds = new Set(matrix?.draftingBlockers.map((b) => b.identifier) ?? [])
    const filingOnly = (matrix?.filingBlockers ?? []).filter((b) => !draftingIds.has(b.identifier))
    const filingItems: BlockerItem[] = filingOnly.map((b) => ({
      type: b.type,
      label: b.label,
      personName: b.person_name,
      identifier: b.identifier,
      action: {
        label: b.type === 'question' ? 'Complete Field' : 'Upload Document',
        section: b.type === 'question' ? 'questions' as const : 'documents' as const,
        profilePath: b.type === 'question' ? b.identifier : undefined,
      },
    }))

    if (filingItems.length > 0) {
      groups.push({
        tier: 3,
        tierLabel: 'Blocks Filing',
        tierColor: 'text-amber-700 bg-amber-50 border-amber-200',
        tierIcon: '🟡',
        items: filingItems,
      })
    }

    // Tier 4: Warnings  -  pending review + stale packs + warning contradictions
    const warningItems: BlockerItem[] = []

    if (readinessData.documents.pendingReview > 0) {
      warningItems.push({
        type: 'pending_review',
        label: `${readinessData.documents.pendingReview} document${readinessData.documents.pendingReview > 1 ? 's' : ''} awaiting acceptance`,
        action: { label: 'Accept Pending Documents', section: 'documents' },
      })
    }

    if (readinessData.formPacks.stale.length > 0) {
      for (const packType of readinessData.formPacks.stale) {
        warningItems.push({
          type: 'stale_pack',
          label: `${packType} form pack is outdated  -  data has changed`,
          action: { label: 'Regenerate Form Pack', section: 'formPacks' },
        })
      }
    }

    for (const flag of readinessData.contradictions.flags.filter((f) => f.severity === 'warning')) {
      warningItems.push({
        type: 'contradiction',
        label: flag.message,
        action: { label: 'View Details', specialAction: 'contradiction_override' },
      })
    }

    if (warningItems.length > 0) {
      groups.push({
        tier: 4,
        tierLabel: 'Warnings',
        tierColor: 'text-slate-600 bg-slate-50 border-slate-200',
        tierIcon: '⚪',
        items: warningItems,
      })
    }

    return groups
  }, [readinessData, matrix])

  // Total blocker counts
  const draftingCount = matrix?.draftingBlockers.length ?? 0
  const filingCount = matrix?.filingBlockers.length ?? 0
  const totalItems = rankedGroups.reduce((sum, g) => sum + g.items.length, 0)

  // Summary strip metrics
  const metrics = [
    ...(draftingCount > 0
      ? [{ label: 'Drafting blockers', value: draftingCount, color: 'red' as const }]
      : []),
    ...(filingCount > 0
      ? [{ label: 'Filing blockers', value: filingCount, color: 'amber' as const }]
      : []),
  ]

  // Highlights
  const highlights = rankedGroups
    .flatMap((g) => g.items)
    .slice(0, 2)
    .map((item) => `${item.label}${item.personName ? ` (${item.personName})` : ''}`)

  if (!readinessData) return null

  // Nothing to show  -  still render the Recalculate button so stuck matters can be fixed
  if (totalItems === 0 && !readinessData.lawyerReview.required) {
    return (
      <div>
        <SectionSummaryStrip
          title="Review & Blockers"
          icon={AlertTriangle}
          metrics={[{ label: 'Status', value: 'All Clear', color: 'green' }]}
          isExpanded={false}
          onToggle={() => {}}
          badge={{ text: 'Clear', variant: 'default' }}
        />
        {/* Always-visible recalculate row  -  recovers matters with stale completion_pct */}
        <div className="flex justify-end pt-1 pr-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] gap-1 text-slate-400 hover:text-slate-600"
            disabled={syncStatus.isPending}
            onClick={() => syncStatus.mutate(matterId)}
            title="Recomputes intake status from current questionnaire and document data"
          >
            <RefreshCw className={cn('h-2.5 w-2.5', syncStatus.isPending && 'animate-spin')} />
            {syncStatus.isPending ? 'Recalculating…' : 'Recalculate Status'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <SectionSummaryStrip
        title="Review & Blockers"
        icon={AlertTriangle}
        metrics={metrics}
        highlights={isExpanded ? undefined : highlights}
        isExpanded={isExpanded}
        onToggle={handleToggle}
        badge={
          draftingCount > 0
            ? { text: `${totalItems} issues`, variant: 'destructive' }
            : totalItems > 0
              ? { text: `${totalItems} items`, variant: 'warning' }
              : undefined
        }
      />

      {/* Expanded detail */}
      {isExpanded && (
        <div className="mt-2 space-y-3 pl-7">
          {rankedGroups.map((group) => (
            <div key={group.tier} className={cn('rounded-lg border p-3', group.tierColor)}>
              {/* Tier header */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">{group.tierIcon}</span>
                <span className="text-xs font-semibold">{group.tierLabel}</span>
                <Badge variant="outline" className="text-[9px] px-1 py-0">
                  {group.items.length}
                </Badge>
              </div>

              {/* Blocker items */}
              <div className="space-y-1">
                {group.items.map((item, idx) => {
                  const matchedSlot = item.type === 'document' && item.identifier
                    ? slots.find((s) => s.slot_slug === item.identifier)
                    : undefined

                  return (
                    <div
                      key={`${item.type}-${item.identifier ?? idx}`}
                      className="flex items-center justify-between gap-2 text-xs py-1.5 px-2 rounded bg-white/60"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <BlockerTypeIcon type={item.type} />
                        <span className="text-slate-700 truncate">{item.label}</span>
                        {item.personName && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
                            {item.personName}
                          </Badge>
                        )}
                      </div>

                      {/* Document blocker: upload directly (create slot on-demand if needed) */}
                      {item.type === 'document' && item.identifier ? (
                        <DocumentUploadButton
                          slotId={matchedSlot?.id}
                          slotStatus={matchedSlot?.status ?? null}
                          slotSlug={item.identifier}
                          slotLabel={item.label}
                          matterId={matterId}
                        />
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 text-[10px] text-blue-600 hover:text-blue-800 px-1 shrink-0"
                          onClick={() => {
                            if (item.action.specialAction === 'lawyer_review') {
                              onOpenLawyerReview?.()
                            } else if (item.action.specialAction === 'contradiction_override') {
                              onOpenContradictionOverride?.()
                            } else if (item.action.profilePath && onNavigateToField) {
                              onNavigateToField(item.action.profilePath)
                            } else if (item.action.section) {
                              onNavigateToSection(item.action.section)
                            }
                          }}
                        >
                          {item.action.label}
                          <ChevronRight className="ml-0.5 h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Overridden contradictions  -  shown outside the active tiers */}
          {readinessData.contradictions.overridden && readinessData.contradictions.blockingCount > 0 && (
            <div className="rounded-lg border p-3 text-green-700 bg-green-50 border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                <span className="text-xs font-semibold">Contradictions Overridden</span>
                <Badge variant="outline" className="text-[9px] px-1 py-0 border-green-300 text-green-600">
                  {readinessData.contradictions.blockingCount} resolved
                </Badge>
              </div>
              <div className="space-y-1">
                {readinessData.contradictions.flags
                  .filter((f) => f.severity === 'blocking')
                  .map((flag, idx) => (
                    <div
                      key={`overridden-${idx}`}
                      className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-white/60"
                    >
                      <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                      <span className="text-slate-500 line-through truncate">{flag.message}</span>
                    </div>
                  ))}
                {readinessData.contradictions.overrideAt && (
                  <p className="text-[10px] text-green-600/80 mt-1.5 px-2">
                    Overridden on {new Date(readinessData.contradictions.overrideAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Always-visible recalculate row  -  recovers matters with stale completion_pct */}
      <div className="flex justify-end pt-1 pr-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[10px] gap-1 text-slate-400 hover:text-slate-600"
          disabled={syncStatus.isPending}
          onClick={() => syncStatus.mutate(matterId)}
          title="Recomputes intake status from current questionnaire and document data"
        >
          <RefreshCw className={cn('h-2.5 w-2.5', syncStatus.isPending && 'animate-spin')} />
          {syncStatus.isPending ? 'Recalculating…' : 'Recalculate Status'}
        </Button>
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// ── Document Upload Button ────────────────────────────────────────────────────

function DocumentUploadButton({
  slotId,
  slotStatus,
  slotSlug,
  slotLabel,
  matterId,
}: {
  slotId?: string
  slotStatus: string | null
  slotSlug: string
  slotLabel: string
  matterId: string
}) {
  const uploadSlot = useUploadToSlot()
  const reviewSlot = useReviewSlot()
  const [isPending, setIsPending] = useState(false)
  const inputId = `doc-upload-${slotSlug}`

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      e.target.value = ''
      setIsPending(true)

      try {
        let targetSlotId = slotId

        // If no slot exists yet, create it first using the playbook slug
        if (!targetSlotId) {
          const res = await fetch(`/api/matters/${matterId}/document-slots`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slot_name: slotLabel, slot_slug: slotSlug }),
          })
          if (!res.ok) throw new Error('Failed to create document slot')
          const data = await res.json()
          targetSlotId = data.slot?.id
        }

        if (!targetSlotId) throw new Error('No slot ID available')
        uploadSlot.mutate({ file, slotId: targetSlotId, matterId })
        // Reset local pending immediately  -  uploadSlot.isPending tracks the actual upload state
        setIsPending(false)
      } catch {
        setIsPending(false)
      }
    },
    [slotId, slotSlug, slotLabel, matterId, uploadSlot],
  )

  const handleAccept = useCallback(() => {
    if (!slotId) return
    reviewSlot.mutate({ slotId, matterId, action: 'accept' })
  }, [slotId, matterId, reviewSlot])

  const isWorking = isPending || uploadSlot.isPending || reviewSlot.isPending

  if (isWorking) {
    return (
      <span className="flex items-center gap-0.5 text-[10px] text-blue-600 px-1 shrink-0">
        <Loader2 className="h-3 w-3 animate-spin" />
        {reviewSlot.isPending ? 'Accepting…' : 'Uploading…'}
      </span>
    )
  }

  // Document uploaded but awaiting review  -  show Accept button
  if (slotStatus === 'pending_review' && slotId) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-5 text-[10px] text-green-700 hover:text-green-900 hover:bg-green-50 px-1 shrink-0"
        onClick={handleAccept}
      >
        ✓ Accept Document
      </Button>
    )
  }

  return (
    <label
      htmlFor={inputId}
      className="flex items-center gap-0.5 text-[10px] text-blue-600 hover:text-blue-800 cursor-pointer px-1 shrink-0 select-none"
    >
      <input
        id={inputId}
        type="file"
        className="hidden"
        onChange={handleFileChange}
        accept="application/pdf,image/*,.doc,.docx"
      />
      <Upload className="h-3 w-3" />
      Upload Document
      <ChevronRight className="h-3 w-3" />
    </label>
  )
}

function BlockerTypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'question':
      return <ClipboardList className="h-3 w-3 text-slate-400 shrink-0" />
    case 'document':
      return <FileSearch className="h-3 w-3 text-slate-400 shrink-0" />
    case 'contradiction':
      return <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
    case 'lawyer_review':
      return <ShieldCheck className="h-3 w-3 text-indigo-500 shrink-0" />
    case 'stale_pack':
      return <RefreshCw className="h-3 w-3 text-slate-400 shrink-0" />
    default:
      return <AlertTriangle className="h-3 w-3 text-slate-400 shrink-0" />
  }
}
