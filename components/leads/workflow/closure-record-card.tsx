'use client'

import { XCircle, RotateCcw, User as UserIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatRelativeDate, formatFullName } from '@/lib/utils/formatters'
import { getStageLabel, getActorDisplay } from './lead-workflow-helpers'
import type { LeadClosureRecordRow, UserRow } from './lead-workflow-types'

// ─── Reason Code Labels ─────────────────────────────────────────────────────

const REASON_CODE_LABELS: Record<string, string> = {
  no_response: 'No Response',
  retainer_not_signed: 'Retainer Not Signed',
  client_declined: 'Client Declined',
  not_a_fit: 'Not a Fit',
  conflict_of_interest: 'Conflict of Interest',
  unable_to_pay: 'Unable to Pay',
  other: 'Other',
}

// ─── Component ──────────────────────────────────────────────────────────────

interface ClosureRecordCardProps {
  record: LeadClosureRecordRow
  users: UserRow[] | undefined
  onReopen?: () => void
}

export function ClosureRecordCard({ record, users, onReopen }: ClosureRecordCardProps) {
  const closedByUser = getActorDisplay('user', record.closed_by, users)

  return (
    <Card className="border-amber-200 bg-amber-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <XCircle className="h-4 w-4" />
            Lead Closed
          </CardTitle>
          {onReopen && (
            <Button variant="outline" size="sm" onClick={onReopen} className="h-7 text-xs">
              <RotateCcw className="mr-1 h-3 w-3" />
              Reopen
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Closed stage */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Stage:</span>
          <Badge variant="outline" size="xs" className="bg-amber-50 text-amber-700 border-amber-200">
            {getStageLabel(record.closed_stage)}
          </Badge>
        </div>

        {/* Reason code */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Reason:</span>
          <span className="text-sm text-foreground">
            {REASON_CODE_LABELS[record.reason_code] ?? record.reason_code}
          </span>
        </div>

        {/* Reason text */}
        {record.reason_text && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Details</p>
            <p className="text-sm text-foreground whitespace-pre-line line-clamp-4">
              {record.reason_text}
            </p>
          </div>
        )}

        {/* Closed by / at */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground border-t pt-2">
          <span className="flex items-center gap-1">
            <UserIcon className="h-3 w-3" />
            {closedByUser.label}
          </span>
          <span>{formatRelativeDate(record.closed_at)}</span>
        </div>
      </CardContent>
    </Card>
  )
}
