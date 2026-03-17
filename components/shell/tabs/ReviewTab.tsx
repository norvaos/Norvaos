'use client'

/**
 * ReviewTab — Multi-Level Lawyer Review
 *
 * Three sections on a single scrollable page:
 *   A. Gate Blockers          — readiness blockers with one-click navigation
 *   B. Contradiction Flags    — per-flag inline override with reason textarea
 *   C. Lawyer Sign-off        — approve / return-for-correction / undo
 *
 * Spec ref: Sprint review workflow, Section 5 — Review tab
 */

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText,
  HelpCircle,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  ChevronRight,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useImmigrationReadiness, readinessKeys } from '@/lib/queries/immigration-readiness'
import { useUser } from '@/lib/hooks/use-user'
import type { ContradictionFlag } from '@/lib/services/contradiction-engine'
import { ReturnForCorrectionModal } from '@/components/review/ReturnForCorrectionModal'

// ── Types ──────────────────────────────────────────────────────────────────

export interface ReviewTabProps {
  matterId: string
  tenantId: string
  onNavigateToSection: (section: 'documents' | 'questionnaire' | 'forms') => void
}

// ── Section A — Gate Blockers ──────────────────────────────────────────────

function BlockerIcon({ type }: { type: string }) {
  if (type === 'document') return <FileText className="h-3.5 w-3.5 text-slate-500 shrink-0" />
  if (type === 'question') return <HelpCircle className="h-3.5 w-3.5 text-slate-500 shrink-0" />
  return <FileSpreadsheet className="h-3.5 w-3.5 text-slate-500 shrink-0" />
}

function GateBlockersSection({
  matterId,
  onNavigateToSection,
}: {
  matterId: string
  onNavigateToSection: (section: 'documents' | 'questionnaire' | 'forms') => void
}) {
  const { data: readinessData } = useImmigrationReadiness(matterId)

  const blockedReasons = readinessData?.blockedReasons ?? []
  const matrix = readinessData?.readinessMatrix

  // Build typed blocker items from the matrix (more precise) or fall back to blockedReasons strings
  const items: Array<{ label: string; type: 'document' | 'question' | 'form'; section: 'documents' | 'questionnaire' | 'forms' }> = []

  if (matrix) {
    for (const b of (matrix.draftingBlockers ?? [])) {
      items.push({
        label: b.label + (b.person_name ? ` (${b.person_name})` : ''),
        type: b.type === 'question' ? 'question' : 'document',
        section: b.type === 'question' ? 'questionnaire' : 'documents',
      })
    }
    for (const b of (matrix.filingBlockers ?? [])) {
      const draftingIds = new Set((matrix.draftingBlockers ?? []).map((d) => d.identifier))
      if (!draftingIds.has(b.identifier)) {
        items.push({
          label: b.label + (b.person_name ? ` (${b.person_name})` : ''),
          type: b.type === 'question' ? 'question' : 'document',
          section: b.type === 'question' ? 'questionnaire' : 'documents',
        })
      }
    }
  } else {
    // Fall back to string-based blockedReasons
    for (const reason of blockedReasons) {
      const trimmed = reason.trim()
      if (!trimmed) continue
      if (trimmed.toLowerCase().includes('document')) {
        items.push({ label: trimmed, type: 'document', section: 'documents' })
      } else if (trimmed.toLowerCase().includes('questionnaire') || trimmed.toLowerCase().includes('field')) {
        items.push({ label: trimmed, type: 'question', section: 'questionnaire' })
      } else if (trimmed.toLowerCase().includes('form pack') || trimmed.toLowerCase().includes('pack')) {
        items.push({ label: trimmed, type: 'form', section: 'forms' })
      } else {
        items.push({ label: trimmed, type: 'document', section: 'documents' })
      }
    }
  }

  const sectionLabel: Record<'documents' | 'questionnaire' | 'forms', string> = {
    documents: 'Documents',
    questionnaire: 'Questionnaire',
    forms: 'Forms',
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-foreground">Gate Blockers</h3>
        {items.length > 0 && (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
            {items.length}
          </Badge>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          No gate blockers — file is clear to advance.
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between gap-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <BlockerIcon type={item.type} />
                <span className="text-xs text-slate-700 truncate">{item.label}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 shrink-0 text-[11px] text-blue-600 hover:text-blue-800 px-2 gap-0.5"
                onClick={() => onNavigateToSection(item.section)}
              >
                Go to {sectionLabel[item.section]}
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ── Section B — Contradiction Flags ───────────────────────────────────────

interface ContradictionFlagRowProps {
  flag: ContradictionFlag
  matterId: string
  flagIndex: number
  allFlags: ContradictionFlag[]
}

function ContradictionFlagRow({ flag, matterId, flagIndex, allFlags }: ContradictionFlagRowProps) {
  const qc = useQueryClient()
  const [showOverride, setShowOverride] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')

  const overrideMutation = useMutation({
    mutationFn: async (reason: string) => {
      const supabase = createClient()
      // Remove this specific flag from the array (by index) and record override metadata
      const newFlags = allFlags.filter((_, i) => i !== flagIndex)
      const now = new Date().toISOString()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('matter_intake') as any)
        .update({
          contradiction_flags: newFlags,
          contradiction_override_at: now,
          // Store reason in notes field as it does not have its own column in the DB type
          lawyer_review_notes: `Override reason: ${reason}`,
        })
        .eq('matter_id', matterId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: readinessKeys.detail(matterId) })
      setShowOverride(false)
      setOverrideReason('')
    },
  })

  const severityClass = flag.severity === 'blocking'
    ? 'border-red-200 bg-red-50'
    : 'border-amber-100 bg-amber-50'

  const severityBadgeVariant = flag.severity === 'blocking' ? 'destructive' : 'outline'
  const severityBadgeClassName = flag.severity !== 'blocking' ? 'text-amber-700 border-amber-300 bg-amber-50' : ''

  // The flag shape from ContradictionFlag uses `message` not `description`
  // field_key → flag.key, intake_value and ircc_value are not in ContradictionFlag
  // We display what we have: key, severity, message

  return (
    <div className={cn('rounded-lg border p-3 space-y-2', severityClass)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className={cn('h-3.5 w-3.5 shrink-0', flag.severity === 'blocking' ? 'text-red-500' : 'text-amber-500')} />
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-800">{flag.message}</p>
            {flag.field && (
              <p className="text-[10px] text-slate-500 mt-0.5">Field: {flag.field}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant={severityBadgeVariant}
            className={cn('text-[9px] px-1 py-0 capitalize', severityBadgeClassName)}
          >
            {flag.severity}
          </Badge>
          {!showOverride && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => setShowOverride(true)}
            >
              Override
            </Button>
          )}
        </div>
      </div>

      {showOverride && (
        <div className="space-y-2 pt-1">
          <Textarea
            placeholder="Enter override reason (required)…"
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            className="text-xs min-h-[60px] resize-none"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={!overrideReason.trim() || overrideMutation.isPending}
              onClick={() => overrideMutation.mutate(overrideReason.trim())}
            >
              {overrideMutation.isPending ? 'Saving…' : 'Confirm Override'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => { setShowOverride(false); setOverrideReason('') }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function ContradictionFlagsSection({ matterId }: { matterId: string }) {
  const { data: readinessData } = useImmigrationReadiness(matterId)
  const flags = readinessData?.contradictions.flags ?? []

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-foreground">Contradiction Flags</h3>
        {flags.length > 0 && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {flags.length}
          </Badge>
        )}
      </div>

      {readinessData?.contradictions.overridden && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          Contradictions overridden on{' '}
          {readinessData.contradictions.overrideAt
            ? new Date(readinessData.contradictions.overrideAt).toLocaleDateString('en-CA')
            : '—'}
        </div>
      )}

      {flags.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          No contradictions detected.
        </div>
      ) : (
        <div className="space-y-2">
          {flags.map((flag, idx) => (
            <ContradictionFlagRow
              key={`${flag.key}-${idx}`}
              flag={flag}
              matterId={matterId}
              flagIndex={idx}
              allFlags={flags}
            />
          ))}
        </div>
      )}
    </section>
  )
}

// ── Section C — Lawyer Sign-off ────────────────────────────────────────────

function LawyerSignOffSection({
  matterId,
  readinessData,
  onReturnForCorrection,
}: {
  matterId: string
  readinessData: import('@/lib/queries/immigration-readiness').ImmigrationReadinessData | null | undefined
  onReturnForCorrection: () => void
}) {
  const qc = useQueryClient()
  const { appUser } = useUser()
  const [notes, setNotes] = useState('')

  const review = readinessData?.lawyerReview
  const status = review?.status ?? null

  const approveMutation = useMutation({
    mutationFn: async (reviewNotes: string) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('matter_intake')
        .update({
          lawyer_review_status: 'approved',
          lawyer_review_notes: reviewNotes,
          lawyer_review_by: appUser?.id ?? null,
          lawyer_review_at: new Date().toISOString(),
        })
        .eq('matter_id', matterId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: readinessKeys.detail(matterId) })
      setNotes('')
    },
  })

  const undoMutation = useMutation({
    mutationFn: async () => {
      const supabase = createClient()
      const { error } = await supabase
        .from('matter_intake')
        .update({
          lawyer_review_status: 'pending',
          lawyer_review_notes: null,
          lawyer_review_by: null,
          lawyer_review_at: null,
        })
        .eq('matter_id', matterId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: readinessKeys.detail(matterId) })
    },
  })

  const statusBadge = () => {
    if (!status || status === 'pending' || status === 'not_required') {
      return <Badge variant="outline" className="text-[11px]">Pending Review</Badge>
    }
    if (status === 'approved') {
      return <Badge className="text-[11px] bg-green-600 hover:bg-green-600 text-white">Approved</Badge>
    }
    if (status === 'returned_for_correction') {
      return <Badge variant="outline" className="text-[11px] text-amber-700 border-amber-300 bg-amber-50">Returned for Correction</Badge>
    }
    return <Badge variant="outline" className="text-[11px] capitalize">{status.replace(/_/g, ' ')}</Badge>
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-violet-500" />
        <h3 className="text-sm font-semibold text-foreground">Lawyer Sign-off</h3>
        {statusBadge()}
      </div>

      {/* Approved state */}
      {status === 'approved' && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm font-medium">
                Approved by {review?.reviewedBy ?? 'Lawyer'}
                {review?.reviewedAt
                  ? ` on ${new Date(review.reviewedAt).toLocaleDateString('en-CA')}`
                  : ''}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              disabled={undoMutation.isPending}
              onClick={() => undoMutation.mutate()}
            >
              <RotateCcw className="h-3 w-3" />
              {undoMutation.isPending ? 'Undoing…' : 'Undo'}
            </Button>
          </div>
          {review?.notes && (
            <p className="text-xs text-green-600/80 pl-6">{review.notes}</p>
          )}
        </div>
      )}

      {/* Returned for correction state */}
      {status === 'returned_for_correction' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">File returned for correction</span>
          </div>
          {review?.notes && (
            <p className="text-xs text-amber-700/80 whitespace-pre-wrap">{review.notes}</p>
          )}
          {review?.reviewedAt && (
            <p className="text-[10px] text-amber-600/70">
              Returned on {new Date(review.reviewedAt).toLocaleDateString('en-CA')}
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1 mt-1"
            disabled={undoMutation.isPending}
            onClick={() => undoMutation.mutate()}
          >
            <RotateCcw className="h-3 w-3" />
            {undoMutation.isPending ? 'Resetting…' : 'Reset to Pending'}
          </Button>
        </div>
      )}

      {/* Pending / null — action area */}
      {(!status || status === 'pending' || status === 'not_required') && (
        <div className="space-y-3">
          <Textarea
            placeholder="Review notes (optional)…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-[80px] resize-none text-sm"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
              disabled={approveMutation.isPending}
              onClick={() => approveMutation.mutate(notes)}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {approveMutation.isPending ? 'Approving…' : 'Approve'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
              onClick={onReturnForCorrection}
            >
              <ArrowRight className="h-3.5 w-3.5" />
              Return for Correction
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}

// ── Main ReviewTab ─────────────────────────────────────────────────────────

export function ReviewTab({ matterId, tenantId, onNavigateToSection }: ReviewTabProps) {
  const { data: readinessData } = useImmigrationReadiness(matterId)
  const [returnModalOpen, setReturnModalOpen] = useState(false)

  return (
    <div className="p-5 space-y-8 max-w-3xl mx-auto">
      {/* Section A */}
      <GateBlockersSection matterId={matterId} onNavigateToSection={onNavigateToSection} />

      <div className="border-t border-border" />

      {/* Section B */}
      <ContradictionFlagsSection matterId={matterId} />

      <div className="border-t border-border" />

      {/* Section C */}
      <LawyerSignOffSection
        matterId={matterId}
        readinessData={readinessData}
        onReturnForCorrection={() => setReturnModalOpen(true)}
      />

      {/* Return-for-Correction modal */}
      <ReturnForCorrectionModal
        open={returnModalOpen}
        onClose={() => setReturnModalOpen(false)}
        matterId={matterId}
        tenantId={tenantId}
        readinessData={readinessData ?? null}
      />
    </div>
  )
}
