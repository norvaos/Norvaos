'use client'

import { useState } from 'react'
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Search,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Loader2,
  ChevronDown,
  ChevronRight,
  User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  useLatestConflictScan,
  useConflictDecisions,
  useConflictScans,
  useRunConflictScan,
  useRecordConflictDecision,
} from '@/lib/queries/conflicts'
import type { Database } from '@/lib/types/database'
import type { MatchReason } from '@/lib/services/conflict-engine'

type ConflictMatch = Database['public']['Tables']['conflict_matches']['Row']
type ConflictDecision = Database['public']['Tables']['conflict_decisions']['Row']
type ConflictScan = Database['public']['Tables']['conflict_scans']['Row']

// ─── Main Panel ──────────────────────────────────────────────────────────────

interface ConflictReviewPanelProps {
  contactId: string
  conflictScore: number
  conflictStatus: string
  canApprove: boolean // true for lawyers/admins
}

export function ConflictReviewPanel({
  contactId,
  conflictScore,
  conflictStatus,
  canApprove,
}: ConflictReviewPanelProps) {
  const { data: latestScan, isLoading: scanLoading } = useLatestConflictScan(contactId)
  const { data: decisions } = useConflictDecisions(contactId)
  const { data: scanHistory } = useConflictScans(contactId)
  const runScan = useRunConflictScan()
  const [showScanHistory, setShowScanHistory] = useState(false)

  return (
    <div className="space-y-4">
      {/* 1. Summary Bar */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Score Gauge */}
            <div className="flex items-center gap-4">
              <ConflictScoreGauge score={conflictScore} />
              <div>
                <ConflictStatusBadge status={conflictStatus} />
                {latestScan?.scan && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Last scanned: {formatDate(latestScan.scan.completed_at ?? latestScan.scan.created_at)}
                  </p>
                )}
              </div>
            </div>

            {/* Run Scan Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => runScan.mutate({ contactId })}
              disabled={runScan.isPending}
            >
              {runScan.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Search className="mr-2 size-4" />
              )}
              {runScan.isPending ? 'Scanning...' : 'Run Scan'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 2. Match List */}
      {scanLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : latestScan?.matches && latestScan.matches.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Matches Found ({latestScan.matches.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {latestScan.matches.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </CardContent>
        </Card>
      ) : conflictStatus !== 'not_run' ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <ShieldCheck className="size-5 text-emerald-500" />
            <div>
              <p className="text-sm font-medium text-slate-700">No conflicts found</p>
              <p className="text-xs text-muted-foreground">
                The latest scan found no potential conflicts with existing records.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <ShieldQuestion className="size-5 text-slate-400" />
            <div>
              <p className="text-sm font-medium text-slate-700">No scan has been run</p>
              <p className="text-xs text-muted-foreground">
                Click &quot;Run Scan&quot; to check for potential conflicts.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3. Lawyer Decision Panel */}
      {canApprove && conflictStatus !== 'not_run' && (
        <DecisionPanel
          contactId={contactId}
          scanId={latestScan?.scan?.id}
        />
      )}

      {/* 4. Decision History */}
      {decisions && decisions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Decision History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {decisions.map((decision) => (
              <DecisionRow key={decision.id} decision={decision} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* 5. Scan History (collapsible) */}
      {scanHistory && scanHistory.length > 0 && (
        <Card>
          <CardHeader
            className="cursor-pointer"
            onClick={() => setShowScanHistory((s) => !s)}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">
                Scan History ({scanHistory.length})
              </CardTitle>
              {showScanHistory ? (
                <ChevronDown className="size-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
          {showScanHistory && (
            <CardContent className="space-y-2">
              {scanHistory.map((scan) => (
                <ScanHistoryRow key={scan.id} scan={scan} />
              ))}
            </CardContent>
          )}
        </Card>
      )}
    </div>
  )
}

// ─── Conflict Score Gauge ────────────────────────────────────────────────────

function ConflictScoreGauge({ score }: { score: number }) {
  const color =
    score >= 50
      ? 'text-red-600 border-red-200 bg-red-50'
      : score >= 25
        ? 'text-amber-600 border-amber-200 bg-amber-50'
        : 'text-emerald-600 border-emerald-200 bg-emerald-50'

  const icon =
    score >= 50 ? (
      <ShieldAlert className="size-5" />
    ) : score >= 25 ? (
      <Shield className="size-5" />
    ) : (
      <ShieldCheck className="size-5" />
    )

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-2',
        color
      )}
    >
      {icon}
      <div>
        <p className="text-lg font-bold leading-none">{score}</p>
        <p className="text-[10px] leading-tight opacity-70">Risk Score</p>
      </div>
    </div>
  )
}

// ─── Conflict Status Badge ───────────────────────────────────────────────────

export function ConflictStatusBadge({ status, className }: { status: string; className?: string }) {
  const config: Record<string, { label: string; variant: string; icon: React.ReactNode }> = {
    not_run: {
      label: 'Not Scanned',
      variant: 'bg-slate-50 text-slate-600 border-slate-200',
      icon: <Circle className="size-3" />,
    },
    auto_scan_complete: {
      label: 'Auto Scan Complete',
      variant: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: <CheckCircle2 className="size-3" />,
    },
    review_suggested: {
      label: 'Review Suggested',
      variant: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: <AlertTriangle className="size-3" />,
    },
    review_required: {
      label: 'Review Required',
      variant: 'bg-red-50 text-red-700 border-red-200',
      icon: <ShieldAlert className="size-3" />,
    },
    cleared_by_lawyer: {
      label: 'Cleared by Lawyer',
      variant: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: <ShieldCheck className="size-3" />,
    },
    conflict_confirmed: {
      label: 'Conflict Confirmed',
      variant: 'bg-red-50 text-red-700 border-red-200',
      icon: <XCircle className="size-3" />,
    },
    waiver_required: {
      label: 'Waiver Required',
      variant: 'bg-orange-50 text-orange-700 border-orange-200',
      icon: <AlertTriangle className="size-3" />,
    },
    waiver_obtained: {
      label: 'Waiver Obtained',
      variant: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: <ShieldCheck className="size-3" />,
    },
    blocked: {
      label: 'Blocked',
      variant: 'bg-red-50 text-red-700 border-red-200',
      icon: <XCircle className="size-3" />,
    },
  }

  const c = config[status] ?? config.not_run

  return (
    <Badge
      className={cn(
        'gap-1 border',
        c.variant,
        className
      )}
    >
      {c.icon}
      {c.label}
    </Badge>
  )
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function Circle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
    </svg>
  )
}

function MatchCard({ match }: { match: ConflictMatch }) {
  const reasons = (match.match_reasons ?? []) as unknown as MatchReason[]

  const categoryLabels: Record<string, string> = {
    possible_duplicate: 'Possible Duplicate',
    adverse_party: 'Adverse Party',
    same_household: 'Same Household',
    related_corporate: 'Related Corporate',
    former_client: 'Former Client',
    shared_payor: 'Shared Payor',
    opposing_party: 'Opposing Party',
  }

  const categoryColors: Record<string, string> = {
    possible_duplicate: 'bg-blue-50 text-blue-700 border-blue-200',
    adverse_party: 'bg-red-50 text-red-700 border-red-200',
    same_household: 'bg-purple-50 text-purple-700 border-purple-200',
    related_corporate: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    former_client: 'bg-amber-50 text-amber-700 border-amber-200',
    shared_payor: 'bg-teal-50 text-teal-700 border-teal-200',
    opposing_party: 'bg-red-50 text-red-700 border-red-200',
  }

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <User className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium text-slate-900">
            {match.matched_name ?? 'Unknown'}
          </span>
          {match.matched_role && (
            <span className="text-xs text-muted-foreground">
              ({match.matched_role})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge
            className={cn(
              'gap-1 border text-[10px]',
              categoryColors[match.match_category] ?? 'bg-slate-50 text-slate-600'
            )}
          >
            {categoryLabels[match.match_category] ?? match.match_category}
          </Badge>
          <span className="text-xs font-semibold text-slate-600">
            {match.confidence}%
          </span>
        </div>
      </div>

      {/* Match reasons */}
      {reasons.length > 0 && (
        <div className="space-y-1">
          {reasons.map((reason, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium capitalize">{reason.field.replace(/_/g, ' ')}:</span>
              <span>&quot;{reason.our_value}&quot;</span>
              <span>vs</span>
              <span>&quot;{reason.their_value}&quot;</span>
              {reason.similarity < 100 && (
                <span className="text-blue-600">({reason.similarity}% match)</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Link to entity */}
      <div className="flex items-center gap-1">
        <ExternalLink className="size-3 text-blue-500" />
        <a
          href={
            match.matched_entity_type === 'contact'
              ? `/contacts/${match.matched_entity_id}`
              : match.matched_entity_type === 'matter'
                ? `/matters/${match.matched_entity_id}`
                : '#'
          }
          className="text-xs text-blue-600 hover:underline"
        >
          View {match.matched_entity_type}
        </a>
      </div>
    </div>
  )
}

// ─── Decision Panel ──────────────────────────────────────────────────────────

function DecisionPanel({
  contactId,
  scanId,
}: {
  contactId: string
  scanId?: string
}) {
  const [decision, setDecision] = useState('')
  const [notes, setNotes] = useState('')
  const [internalNote, setInternalNote] = useState('')
  const recordDecision = useRecordConflictDecision()

  const handleSubmit = () => {
    if (!decision) return
    recordDecision.mutate({
      contactId,
      scanId,
      decision,
      notes: notes || undefined,
      internalNote: internalNote || undefined,
    })

    // Reset form on success
    if (!recordDecision.isError) {
      setDecision('')
      setNotes('')
      setInternalNote('')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Shield className="size-4 text-blue-600" />
          Record Decision
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Decision Select */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">
            Decision
          </label>
          <Select value={decision} onValueChange={setDecision}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select decision..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="no_conflict">No Conflict</SelectItem>
              <SelectItem value="proceed_with_caution">Proceed with Caution</SelectItem>
              <SelectItem value="conflict_confirmed">Conflict Confirmed</SelectItem>
              <SelectItem value="waiver_required">Waiver Required</SelectItem>
              <SelectItem value="waiver_obtained">Waiver Obtained</SelectItem>
              <SelectItem value="block_matter_opening">Block Matter Opening</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Notes */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">
            Notes <span className="text-muted-foreground">(visible to team)</span>
          </label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes about this decision..."
            rows={2}
            className="text-sm"
          />
        </div>

        {/* Internal Note */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">
            Internal Note <span className="text-muted-foreground">(private)</span>
          </label>
          <Textarea
            value={internalNote}
            onChange={(e) => setInternalNote(e.target.value)}
            placeholder="Private note for the file..."
            rows={2}
            className="text-sm"
          />
        </div>

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          disabled={!decision || recordDecision.isPending}
          size="sm"
          className="w-full"
        >
          {recordDecision.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 size-4" />
          )}
          {recordDecision.isPending ? 'Recording...' : 'Record Decision'}
        </Button>
      </CardContent>
    </Card>
  )
}

// ─── Decision History Row ────────────────────────────────────────────────────

function DecisionRow({ decision }: { decision: ConflictDecision }) {
  const decisionLabels: Record<string, string> = {
    no_conflict: 'No Conflict',
    proceed_with_caution: 'Proceed with Caution',
    conflict_confirmed: 'Conflict Confirmed',
    waiver_required: 'Waiver Required',
    waiver_obtained: 'Waiver Obtained',
    block_matter_opening: 'Block Matter Opening',
  }

  const decisionColors: Record<string, string> = {
    no_conflict: 'text-emerald-700',
    proceed_with_caution: 'text-amber-700',
    conflict_confirmed: 'text-red-700',
    waiver_required: 'text-orange-700',
    waiver_obtained: 'text-emerald-700',
    block_matter_opening: 'text-red-700',
  }

  return (
    <div className="flex items-start gap-3">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50">
        <Shield className="size-3 text-blue-600" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={cn('text-xs font-semibold', decisionColors[decision.decision])}>
            {decisionLabels[decision.decision] ?? decision.decision}
          </p>
          <span className="text-[10px] text-muted-foreground">
            {formatDate(decision.created_at)}
          </span>
        </div>
        {decision.notes && (
          <p className="mt-0.5 text-xs text-muted-foreground">{decision.notes}</p>
        )}
      </div>
    </div>
  )
}

// ─── Scan History Row ────────────────────────────────────────────────────────

function ScanHistoryRow({ scan }: { scan: ConflictScan }) {
  return (
    <div className="flex items-center justify-between rounded border px-3 py-2">
      <div className="flex items-center gap-2">
        <Clock className="size-3.5 text-muted-foreground" />
        <span className="text-xs text-slate-700">
          {formatDate(scan.created_at)}
        </span>
        <Badge variant="secondary" className="text-[10px]">
          {scan.trigger_type}
        </Badge>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {scan.match_count} match{scan.match_count !== 1 ? 'es' : ''}
        </span>
        <span className="text-xs font-semibold text-slate-600">
          Score: {scan.score}
        </span>
      </div>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`

    return date.toLocaleDateString('en-CA', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    })
  } catch {
    return dateStr
  }
}
