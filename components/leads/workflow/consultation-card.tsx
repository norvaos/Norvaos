'use client'

import { Calendar, Clock, User as UserIcon, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDateTime, formatRelativeDate } from '@/lib/utils/formatters'
import { getActorDisplay } from './lead-workflow-helpers'
import type { LeadConsultationRow, UserRow } from './lead-workflow-types'

// ─── Status Config ──────────────────────────────────────────────────────────

const CONSULTATION_STATUS: Record<string, { label: string; className: string }> = {
  booked: { label: 'Booked', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  completed: { label: 'Completed', className: 'bg-green-50 text-green-700 border-green-200' },
  no_show: { label: 'No Show', className: 'bg-red-50 text-red-600 border-red-200' },
  cancelled: { label: 'Cancelled', className: 'bg-slate-100 text-slate-500 border-slate-200' },
}

const CONSULTATION_TYPE_LABELS: Record<string, string> = {
  in_person: 'In Person',
  phone: 'Phone',
  video: 'Video',
  initial: 'Initial',
  follow_up: 'Follow-up',
}

const OUTCOME_LABELS: Record<string, string> = {
  send_retainer: 'Send Retainer',
  client_declined: 'Client Declined',
  not_a_fit: 'Not a Fit',
  needs_followup: 'Needs Follow-up',
}

// ─── Component ──────────────────────────────────────────────────────────────

interface ConsultationCardProps {
  consultation: LeadConsultationRow
  users: UserRow[] | undefined
}

export function ConsultationCard({ consultation, users }: ConsultationCardProps) {
  const statusConfig = CONSULTATION_STATUS[consultation.status] ?? CONSULTATION_STATUS.booked
  const typeLabel = CONSULTATION_TYPE_LABELS[consultation.consultation_type ?? ''] ?? consultation.consultation_type
  const conductedByDisplay = consultation.conducted_by
    ? getActorDisplay('user', consultation.conducted_by, users)
    : null

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Consultation</CardTitle>
          <Badge variant="outline" size="xs" className={statusConfig.className}>
            {statusConfig.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Scheduled date/time */}
        {consultation.scheduled_at && (
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
            <span>{formatDateTime(consultation.scheduled_at)}</span>
          </div>
        )}

        {/* Type */}
        {typeLabel && (
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
            <span>{typeLabel}</span>
          </div>
        )}

        {/* Conducted by */}
        {conductedByDisplay && (
          <div className="flex items-center gap-2 text-sm">
            <UserIcon className="h-4 w-4 text-muted-foreground shrink-0" />
            <span>{conductedByDisplay.label}</span>
          </div>
        )}

        {/* No-show indicator (status-based) */}
        {consultation.status === 'no_show' && (
          <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Client did not attend</span>
          </div>
        )}

        {/* Completion indicator (status-based) */}
        {consultation.status === 'completed' && (
          <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 border border-green-200">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Consultation completed</span>
          </div>
        )}

        {/* Outcome */}
        {consultation.outcome && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Outcome:</span>
            <span className="text-sm text-foreground">
              {OUTCOME_LABELS[consultation.outcome] ?? consultation.outcome}
            </span>
          </div>
        )}

        {/* Outcome notes */}
        {consultation.outcome_notes && (
          <div className="border-t pt-2">
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            <p className="text-sm text-foreground whitespace-pre-line line-clamp-4">
              {consultation.outcome_notes}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
