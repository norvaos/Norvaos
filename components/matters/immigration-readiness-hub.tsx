'use client'

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Immigration Readiness Hub
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Single panel combining questionnaire, documents, form packs, contradictions,
 * lawyer review, and blocked reasons for immigration matters.
 *
 * Sits above the DocumentSlotPanel on the matter detail page.
 */

import { useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  Gavel,
  Loader2,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import {
  useImmigrationReadiness,
  useSubmitLawyerReview,
  useOverrideContradictions,
} from '@/lib/queries/immigration-readiness'
import { IMMIGRATION_INTAKE_STATUSES } from '@/lib/utils/constants'
import type { ImmigrationReadinessData } from '@/lib/queries/immigration-readiness'
import type { ReadinessMatrix, DomainReadiness, BlockerDetail } from '@/lib/services/readiness-matrix-engine'
import { DOMAIN_LABELS } from '@/lib/services/readiness-matrix-engine'
import type { ReadinessDomain } from '@/lib/config/immigration-playbooks'

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  matterId: string
  userId: string
  userRole: string
}

// ── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config = IMMIGRATION_INTAKE_STATUSES.find((s) => s.value === status)
  if (!config) return <Badge variant="outline">{status}</Badge>

  return (
    <Badge
      style={{ backgroundColor: config.color, color: '#fff' }}
      className="text-xs font-medium"
    >
      {config.label}
    </Badge>
  )
}

// ── Metric Card ──────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  total,
  color,
}: {
  label: string
  value: number | string
  total?: number
  color: string
}) {
  return (
    <div className="rounded-lg border p-3 text-centre">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold" style={{ color }}>
        {total !== undefined ? `${value}/${total}` : value}
      </p>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function ImmigrationReadinessHub({ matterId, userId, userRole }: Props) {
  const { data, isLoading } = useImmigrationReadiness(matterId)
  const [showLawyerReview, setShowLawyerReview] = useState(false)
  const [showOverride, setShowOverride] = useState(false)

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-centre justify-centre py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading readiness data…</span>
        </CardContent>
      </Card>
    )
  }

  if (!data || !data.playbook) return null

  const { documents, questionnaire, formPacks, contradictions, lawyerReview, blockedReasons, nextAction } = data

  const docsAcceptedPct = documents.mandatorySlots > 0
    ? Math.round((documents.accepted / documents.mandatorySlots) * 100)
    : 0

  const isLawyer = userRole === 'admin' || userRole === 'lawyer'

  return (
    <>
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <div className="flex items-centre justify-between">
            <CardTitle className="flex items-centre gap-2 text-base">
              <FileText className="h-4 w-4" />
              Immigration Readiness
            </CardTitle>
            <StatusBadge status={data.intakeStatus} />
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* ── Metrics Row ── */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MetricCard
              label="Questionnaire"
              value={`${questionnaire.completionPct}%`}
              color={questionnaire.completionPct >= questionnaire.minimumPct ? '#22c55e' : '#f59e0b'}
            />
            <MetricCard
              label="Docs Uploaded"
              value={documents.uploaded}
              total={documents.totalSlots}
              color={documents.uploaded === documents.totalSlots ? '#22c55e' : '#3b82f6'}
            />
            <MetricCard
              label="Docs Accepted"
              value={documents.accepted}
              total={documents.mandatorySlots}
              color={documents.accepted === documents.mandatorySlots ? '#22c55e' : '#f59e0b'}
            />
            <MetricCard
              label="Submission Engine"
              value={formPacks.allReady ? 'Ready' : `${formPacks.generated.length}/${formPacks.required.length}`}
              color={formPacks.allReady ? '#22c55e' : '#94a3b8'}
            />
          </div>

          {/* ── Next Action (promoted  -  most important for workflow) ── */}
          {nextAction && (
            <NextActionSection
              nextAction={nextAction}
              intakeStatus={data.intakeStatus}
              isLawyer={isLawyer}
              onReview={() => setShowLawyerReview(true)}
            />
          )}

          {/* ── Readiness Matrix (6 Domains) ── */}
          {data.readinessMatrix && (
            <ReadinessMatrixPanel matrix={data.readinessMatrix} />
          )}

          {/* ── Progress Bar ── */}
          <div>
            <div className="flex items-centre justify-between text-xs text-muted-foreground mb-1">
              <span>Mandatory Documents Accepted</span>
              <span>{docsAcceptedPct}%</span>
            </div>
            <Progress value={docsAcceptedPct} className="h-2" />
          </div>

          {/* ── Flags Row ── */}
          <div className="flex flex-wrap gap-2">
            {contradictions.blockingCount > 0 && (
              <Badge variant="destructive" className="flex items-centre gap-1">
                <ShieldAlert className="h-3 w-3" />
                {contradictions.blockingCount} Contradiction{contradictions.blockingCount > 1 ? 's' : ''}
                {contradictions.overridden && ' (overridden)'}
              </Badge>
            )}
            {contradictions.warningCount > 0 && (
              <Badge variant="outline" className="flex items-centre gap-1 border-amber-500/30 text-amber-600">
                <AlertTriangle className="h-3 w-3" />
                {contradictions.warningCount} Warning{contradictions.warningCount > 1 ? 's' : ''}
              </Badge>
            )}
            {documents.pendingReview > 0 && (
              <Badge variant="outline" className="flex items-centre gap-1 border-blue-500/30 text-blue-600">
                <Clock className="h-3 w-3" />
                {documents.pendingReview} Pending Review
              </Badge>
            )}
            {documents.needsReUpload > 0 && (
              <Badge variant="outline" className="flex items-centre gap-1 border-orange-500/30 text-orange-600">
                <AlertCircle className="h-3 w-3" />
                {documents.needsReUpload} Needs Re-upload
              </Badge>
            )}
            {formPacks.stale.length > 0 && (
              <Badge variant="outline" className="flex items-centre gap-1 border-red-500/30 text-red-600">
                <XCircle className="h-3 w-3" />
                {formPacks.stale.length} Stale Pack{formPacks.stale.length > 1 ? 's' : ''}
              </Badge>
            )}
            {lawyerReview.status === 'pending' && (
              <Badge variant="outline" className="flex items-centre gap-1 border-indigo-300 text-indigo-600">
                <Gavel className="h-3 w-3" />
                Lawyer Review Pending
              </Badge>
            )}
            {lawyerReview.status === 'approved' && (
              <Badge variant="outline" className="flex items-centre gap-1 border-emerald-500/30 text-green-600">
                <CheckCircle2 className="h-3 w-3" />
                Lawyer Approved
              </Badge>
            )}
          </div>

          {/* ── Contradictions Detail ── */}
          {contradictions.flags.length > 0 && (
            <div className="rounded-lg border border-red-500/20 bg-red-950/30 p-3 dark:border-red-900 dark:bg-red-950/30">
              <p className="text-xs font-medium text-red-400 dark:text-red-300 mb-2">
                Contradictions Detected
              </p>
              <ul className="space-y-1">
                {contradictions.flags.map((flag, i) => (
                  <li key={`${flag.key}-${i}`} className="flex items-start gap-2 text-xs text-red-400 dark:text-red-400">
                    {flag.severity === 'blocking' ? (
                      <XCircle className="h-3 w-3 mt-0.5 shrink-0" />
                    ) : (
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                    )}
                    <span>{flag.message}</span>
                  </li>
                ))}
              </ul>
              {isLawyer && contradictions.blockingCount > 0 && !contradictions.overridden && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => setShowOverride(true)}
                >
                  Override Contradictions
                </Button>
              )}
            </div>
          )}

          {/* ── Blocked Reasons ── */}
          {blockedReasons.length > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-950/30 p-3 dark:border-amber-900 dark:bg-amber-950/30">
              <p className="text-xs font-medium text-amber-400 dark:text-amber-300 mb-1">
                Blocked
              </p>
              <ul className="space-y-0.5">
                {blockedReasons.map((reason, i) => (
                  <li key={i} className="text-xs text-amber-400 dark:text-amber-400">
                    • {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Next Action section rendered above matrix  -  see NextActionSection */}
        </CardContent>
      </Card>

      {/* ── Lawyer Review Dialog ── */}
      <LawyerReviewDialog
        open={showLawyerReview}
        onOpenChange={setShowLawyerReview}
        matterId={matterId}
        userId={userId}
      />

      {/* ── Contradiction Override Dialog ── */}
      <ContradictionOverrideDialog
        open={showOverride}
        onOpenChange={setShowOverride}
        matterId={matterId}
        userId={userId}
      />
    </>
  )
}

// ── Next Action Section ─────────────────────────────────────────────────────

function NextActionSection({
  nextAction,
  intakeStatus,
  isLawyer,
  onReview,
}: {
  nextAction: string
  intakeStatus: string
  isLawyer: boolean
  onReview: () => void
}) {
  // Status-aware accent colours  -  use full static class strings for Tailwind JIT
  const wrapperClass = intakeStatus === 'ready_for_filing'
    ? 'flex items-center justify-between rounded-lg border-l-4 border-l-green-500 border bg-emerald-950/30/50 dark:bg-green-950/20 p-3'
    : intakeStatus === 'deficiency_outstanding'
      ? 'flex items-center justify-between rounded-lg border-l-4 border-l-red-500 border bg-red-950/30/50 dark:bg-red-950/20 p-3'
      : 'flex items-center justify-between rounded-lg border-l-4 border-l-blue-500 border bg-blue-950/30/50 dark:bg-blue-950/20 p-3'

  const labelClass = intakeStatus === 'ready_for_filing'
    ? 'text-xs font-medium text-emerald-400 dark:text-green-300'
    : intakeStatus === 'deficiency_outstanding'
      ? 'text-xs font-medium text-red-400 dark:text-red-300'
      : 'text-xs font-medium text-blue-400 dark:text-blue-300'

  return (
    <div className={wrapperClass}>
      <div>
        <p className={labelClass}>Next Action</p>
        <p className="text-sm font-medium">{nextAction}</p>
      </div>
      <div className="flex gap-2 shrink-0 ml-3">
        {intakeStatus === 'lawyer_review' && isLawyer && (
          <Button size="sm" onClick={onReview}>
            Review
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Readiness Matrix Panel ───────────────────────────────────────────────────

function ReadinessMatrixPanel({ matrix }: { matrix: ReadinessMatrix }) {
  // R5: Auto-expand when ≤ 5 blockers
  const [showDraftingBlockers, setShowDraftingBlockers] = useState(
    matrix.draftingBlockers.length > 0 && matrix.draftingBlockers.length <= 5
  )
  const [showFilingBlockers, setShowFilingBlockers] = useState(
    matrix.filingBlockers.length > 0 && matrix.filingBlockers.length <= 5
  )

  const overallColor = matrix.meetsThreshold
    ? '#22c55e'
    : matrix.overallPct >= (matrix.meetsThreshold ? 0 : 75)
      ? '#f59e0b'
      : '#ef4444'

  const domainOrder: ReadinessDomain[] = [
    'client_identity',
    'family_composition',
    'immigration_history',
    'program_eligibility',
    'evidence',
    'review_risk',
  ]

  // Only show domains that have rules defined
  const activeDomains = domainOrder.filter((d) => matrix.domains[d].totalRules > 0)

  // R7: Click a domain card with blockers → expand relevant blocker section
  const handleDomainClick = (domainKey: ReadinessDomain) => {
    const hasDrafting = matrix.draftingBlockers.some((b) => b.domain === domainKey)
    const hasFiling = matrix.filingBlockers.some((b) => b.domain === domainKey)
    if (hasDrafting) setShowDraftingBlockers(true)
    if (hasFiling) setShowFilingBlockers(true)
  }

  return (
    <div className="space-y-3">
      {/* Overall readiness bar */}
      <div>
        <div className="flex items-centre justify-between text-xs text-muted-foreground mb-1">
          <span className="font-medium">Overall Readiness</span>
          <span style={{ color: overallColor }} className="font-semibold">
            {matrix.overallPct}%
            {matrix.meetsThreshold && '  -  Threshold met'}
          </span>
        </div>
        <Progress value={matrix.overallPct} className="h-2" />
      </div>

      {/* Domain grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {activeDomains.map((domainKey) => {
          const domain = matrix.domains[domainKey]
          return (
            <DomainCard
              key={domainKey}
              domain={domain}
              onClick={domain.blockers.length > 0 ? () => handleDomainClick(domainKey) : undefined}
            />
          )
        })}
      </div>

      {/* Drafting blockers */}
      {matrix.draftingBlockers.length > 0 && (
        <BlockerSection
          title="Drafting Blockers"
          blockers={matrix.draftingBlockers}
          color="red"
          open={showDraftingBlockers}
          onToggle={() => setShowDraftingBlockers(!showDraftingBlockers)}
        />
      )}

      {/* Filing blockers */}
      {matrix.filingBlockers.length > 0 && (
        <BlockerSection
          title="Filing Blockers"
          blockers={matrix.filingBlockers}
          color="amber"
          open={showFilingBlockers}
          onToggle={() => setShowFilingBlockers(!showFilingBlockers)}
        />
      )}

      {/* Lawyer review triggers */}
      {matrix.lawyerReviewTriggered && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-900 dark:bg-indigo-950/30">
          <p className="text-xs font-medium text-indigo-800 dark:text-indigo-300 mb-1">
            Lawyer Review Triggered
          </p>
          <ul className="space-y-0.5">
            {matrix.lawyerReviewReasons.map((reason, i) => (
              <li key={i} className="text-xs text-indigo-700 dark:text-indigo-400">
                • {reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function DomainCard({ domain, onClick }: { domain: DomainReadiness; onClick?: () => void }) {
  const color = domain.completionPct === 100
    ? '#22c55e'
    : domain.completionPct >= 75
      ? '#f59e0b'
      : '#ef4444'

  const hasBlockers = domain.blockers.length > 0

  return (
    <div
      className={`rounded-lg border p-2.5 ${hasBlockers ? 'cursor-pointer hover:bg-muted/50 transition-colors' : ''}`}
      onClick={onClick}
      role={hasBlockers ? 'button' : undefined}
      tabIndex={hasBlockers ? 0 : undefined}
      onKeyDown={hasBlockers ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.() } : undefined}
    >
      <div className="flex items-start justify-between mb-1.5">
        <p className="text-xs font-medium text-muted-foreground leading-tight">
          {domain.label}
        </p>
        {hasBlockers && (
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-950/300 shrink-0 mt-0.5" title={`${domain.blockers.length} blocker(s)`} />
        )}
      </div>
      <Progress value={domain.completionPct} className="h-1.5 mb-1" />
      <div className="flex items-centre justify-between">
        <span className="text-xs text-muted-foreground">
          {domain.satisfiedRules}/{domain.totalRules}
        </span>
        <span className="text-xs font-medium" style={{ color }}>
          {domain.completionPct}%
        </span>
      </div>
    </div>
  )
}

function BlockerSection({
  title,
  blockers,
  color,
  open,
  onToggle,
}: {
  title: string
  blockers: BlockerDetail[]
  color: 'red' | 'amber'
  open: boolean
  onToggle: () => void
}) {
  const borderClass = color === 'red' ? 'border-red-500/20 dark:border-red-900' : 'border-amber-500/20 dark:border-amber-900'
  const bgClass = color === 'red' ? 'bg-red-950/30 dark:bg-red-950/30' : 'bg-amber-950/30 dark:bg-amber-950/30'
  const textClass = color === 'red' ? 'text-red-400 dark:text-red-300' : 'text-amber-400 dark:text-amber-300'
  const itemClass = color === 'red' ? 'text-red-400 dark:text-red-400' : 'text-amber-400 dark:text-amber-400'

  return (
    <div className={`rounded-lg border ${borderClass} ${bgClass} p-3`}>
      <button
        type="button"
        className={`flex items-centre gap-1 text-xs font-medium ${textClass} w-full text-left`}
        onClick={onToggle}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {title} ({blockers.length})
      </button>
      {open && (
        <ul className="mt-2 space-y-1">
          {blockers.map((b, i) => (
            <li key={`${b.identifier}-${i}`} className={`flex items-start gap-2 text-xs ${itemClass}`}>
              {b.type === 'question' ? (
                <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              ) : (
                <FileText className="h-3 w-3 mt-0.5 shrink-0" />
              )}
              <span>
                {b.label}
                {b.person_name ? (
                  <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">
                    {b.person_name}
                  </Badge>
                ) : b.person_role_scope !== 'pa' && b.person_role_scope !== 'all' ? (
                  <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">
                    {b.person_role_scope}
                  </Badge>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Lawyer Review Dialog ─────────────────────────────────────────────────────

function LawyerReviewDialog({
  open,
  onOpenChange,
  matterId,
  userId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  matterId: string
  userId: string
}) {
  const [notes, setNotes] = useState('')
  const submitReview = useSubmitLawyerReview()

  const handleSubmit = (action: 'approved' | 'changes_requested') => {
    submitReview.mutate(
      { matterId, action, notes, userId },
      {
        onSuccess: () => {
          toast.success(
            action === 'approved'
              ? 'Review approved  -  matter is ready for filing'
              : 'Changes requested  -  matter moved to deficiency'
          )
          setNotes('')
          onOpenChange(false)
        },
        onError: () => toast.error('Failed to submit review'),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lawyer Review</DialogTitle>
          <DialogDescription>
            Review the complete intake, documents, and form packs before approving for filing.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add review notes or instructions…"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => handleSubmit('changes_requested')}
            disabled={submitReview.isPending}
          >
            Request Changes
          </Button>
          <Button
            onClick={() => handleSubmit('approved')}
            disabled={submitReview.isPending}
          >
            {submitReview.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : null}
            Approve for Filing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Contradiction Override Dialog ─────────────────────────────────────────────

function ContradictionOverrideDialog({
  open,
  onOpenChange,
  matterId,
  userId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  matterId: string
  userId: string
}) {
  const [reason, setReason] = useState('')
  const override = useOverrideContradictions()

  const handleOverride = () => {
    if (!reason.trim()) {
      toast.error('Reason is required to override contradictions')
      return
    }
    override.mutate(
      { matterId, reason, userId },
      {
        onSuccess: () => {
          toast.success('Contradictions overridden')
          setReason('')
          onOpenChange(false)
        },
        onError: () => toast.error('Failed to override contradictions'),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Override Contradictions</DialogTitle>
          <DialogDescription>
            This will allow the matter to proceed past contradiction blocks. The contradictions
            will remain visible but will no longer prevent drafting or filing. If intake data
            changes after override, contradictions will be re-evaluated.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label>Override Reason (required)</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why these contradictions are acceptable…"
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleOverride}
            disabled={override.isPending || !reason.trim()}
          >
            {override.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : null}
            Confirm Override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
