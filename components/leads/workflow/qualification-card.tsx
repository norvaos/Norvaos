'use client'

import { ClipboardCheck, AlertTriangle, User as UserIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatRelativeDate, formatFullName } from '@/lib/utils/formatters'
import { getActorDisplay } from './lead-workflow-helpers'
import type { LeadQualificationDecisionRow, UserRow } from './lead-workflow-types'

// ─── Status Visual Config ───────────────────────────────────────────────────

const QUALIFICATION_STATUS: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  pending: {
    label: 'Pending Review',
    className: 'bg-muted text-muted-foreground border-border',
    icon: ClipboardCheck,
  },
  qualified: {
    label: 'Qualified',
    className: 'bg-emerald-950/30 text-emerald-400 border-emerald-500/20',
    icon: ClipboardCheck,
  },
  not_qualified: {
    label: 'Not Qualified',
    className: 'bg-red-950/30 text-red-600 border-red-500/20',
    icon: AlertTriangle,
  },
  needs_review: {
    label: 'Needs Lawyer Review',
    className: 'bg-amber-950/30 text-amber-400 border-amber-500/20',
    icon: AlertTriangle,
  },
}

// ─── Not-Fit Reason Labels ──────────────────────────────────────────────────

const NOT_FIT_REASONS: Record<string, string> = {
  no_merit: 'No legal merit',
  conflict_of_interest: 'Conflict of interest',
  outside_practice_area: 'Outside practice area',
  unable_to_pay: 'Unable to pay',
  client_declined: 'Client declined',
  other: 'Other',
}

// ─── Component ──────────────────────────────────────────────────────────────

interface QualificationCardProps {
  decision: LeadQualificationDecisionRow
  users: UserRow[] | undefined
}

export function QualificationCard({ decision, users }: QualificationCardProps) {
  const statusConfig = QUALIFICATION_STATUS[decision.status] ?? QUALIFICATION_STATUS.pending
  const StatusIcon = statusConfig.icon
  const decidedByUser = decision.decided_by
    ? getActorDisplay('user', decision.decided_by, users)
    : null

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Qualification</CardTitle>
          <Badge variant="outline" size="xs" className={statusConfig.className}>
            <StatusIcon className="mr-1 h-3 w-3" />
            {statusConfig.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Lawyer review flag */}
        {decision.requires_lawyer_review && decision.status !== 'qualified' && (
          <div className="flex items-center gap-2 rounded-md bg-amber-950/30 px-3 py-2 text-sm text-amber-400 border border-amber-500/20">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Requires lawyer review before proceeding</span>
          </div>
        )}

        {/* Not-fit reason */}
        {decision.status === 'not_qualified' && decision.not_fit_reason_code && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Reason:</span>
            <span className="text-sm text-foreground">
              {NOT_FIT_REASONS[decision.not_fit_reason_code] ?? decision.not_fit_reason_code}
            </span>
          </div>
        )}

        {/* Notes */}
        {decision.notes && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            <p className="text-sm text-foreground whitespace-pre-line line-clamp-4">
              {decision.notes}
            </p>
          </div>
        )}

        {/* Decision metadata */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground border-t pt-2">
          {decidedByUser && (
            <span className="flex items-center gap-1">
              <UserIcon className="h-3 w-3" />
              {decidedByUser.label}
            </span>
          )}
          {decision.decided_at && (
            <span>{formatRelativeDate(decision.decided_at)}</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
