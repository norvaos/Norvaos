'use client'

import { Thermometer, Calendar, Clock, DollarSign, Briefcase, User as UserIcon, Globe } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { formatDate, formatRelativeDate, formatCurrency, formatFullName, formatInitials, isOverdue, daysInStage } from '@/lib/utils/formatters'
import { getStageLabel } from './lead-workflow-helpers'
import type { Lead, Contact, PracticeArea, UserRow } from './lead-workflow-types'

// ─── Temperature Visual Config ──────────────────────────────────────────────

const TEMPERATURE_CONFIG: Record<string, { label: string; className: string }> = {
  hot: { label: 'Hot', className: 'bg-red-50 text-red-700 border-red-200' },
  warm: { label: 'Warm', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  cold: { label: 'Cold', className: 'bg-blue-50 text-blue-700 border-blue-200' },
}

// ─── Qualification Status Config ────────────────────────────────────────────

const QUALIFICATION_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  qualified: { label: 'Qualified', className: 'bg-green-50 text-green-700 border-green-200' },
  not_qualified: { label: 'Not Qualified', className: 'bg-red-50 text-red-600 border-red-200' },
  needs_review: { label: 'Needs Review', className: 'bg-amber-50 text-amber-700 border-amber-200' },
}

// ─── Component ──────────────────────────────────────────────────────────────

interface LeadSummaryCardProps {
  lead: Lead
  contact: Contact | null | undefined
  practiceArea: PracticeArea | null | undefined
  users: UserRow[] | undefined
}

export function LeadSummaryCard({ lead, contact, practiceArea, users }: LeadSummaryCardProps) {
  const assignedUser = users?.find((u) => u.id === lead.assigned_to)
  const intakeStaff = users?.find((u) => u.id === lead.assigned_intake_staff_id)
  const responsibleLawyer = users?.find((u) => u.id === lead.responsible_lawyer_id)
  const temperature = TEMPERATURE_CONFIG[lead.temperature ?? ''] ?? TEMPERATURE_CONFIG.warm
  const qualification = QUALIFICATION_STATUS_CONFIG[lead.qualification_status ?? ''] ?? QUALIFICATION_STATUS_CONFIG.pending
  const stageAge = daysInStage(lead.stage_entered_at)
  const followUpOverdue = isOverdue(lead.next_follow_up)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Lead Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Contact Info */}
        {contact && (
          <div className="flex items-center gap-3">
            <Avatar size="sm">
              <AvatarFallback className="text-xs bg-primary/10 text-primary">
                {formatInitials(contact.first_name, contact.last_name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">
                {formatFullName(contact.first_name, contact.last_name)}
              </p>
              {contact.email_primary && (
                <p className="text-xs text-muted-foreground truncate">{contact.email_primary}</p>
              )}
            </div>
          </div>
        )}

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {/* Temperature */}
          <InfoRow icon={Thermometer} label="Temperature">
            <Badge variant="outline" size="xs" className={temperature.className}>
              {temperature.label}
            </Badge>
          </InfoRow>

          {/* Qualification */}
          <InfoRow icon={Briefcase} label="Qualification">
            <Badge variant="outline" size="xs" className={qualification.className}>
              {qualification.label}
            </Badge>
          </InfoRow>

          {/* Source */}
          {(lead.lead_source || lead.source) && (
            <InfoRow icon={Globe} label="Source">
              <span className="text-sm text-foreground truncate">
                {lead.lead_source || lead.source}
              </span>
            </InfoRow>
          )}

          {/* Estimated Value */}
          {lead.estimated_value != null && (
            <InfoRow icon={DollarSign} label="Value">
              <span className="text-sm font-medium text-foreground">
                {formatCurrency(lead.estimated_value)}
              </span>
            </InfoRow>
          )}

          {/* Practice Area */}
          {practiceArea && (
            <InfoRow icon={Briefcase} label="Practice Area">
              <span className="text-sm text-foreground truncate">{practiceArea.name}</span>
            </InfoRow>
          )}

          {/* Current Stage */}
          {lead.current_stage && (
            <InfoRow icon={Clock} label="Stage">
              <span className="text-sm text-foreground truncate">
                {getStageLabel(lead.current_stage)}
              </span>
            </InfoRow>
          )}

          {/* Days in Stage */}
          <InfoRow icon={Clock} label="Days in Stage">
            <span className={`text-sm font-medium ${stageAge > 7 ? 'text-amber-600' : 'text-foreground'}`}>
              {stageAge}
            </span>
          </InfoRow>

          {/* Created */}
          <InfoRow icon={Calendar} label="Created">
            <span className="text-sm text-foreground">{formatDate(lead.created_at)}</span>
          </InfoRow>
        </div>

        {/* Follow-Up */}
        {lead.next_follow_up && (
          <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${followUpOverdue ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-muted/50 text-foreground'}`}>
            <Calendar className={`h-4 w-4 shrink-0 ${followUpOverdue ? 'text-red-500' : 'text-muted-foreground'}`} />
            <span className="font-medium">Follow-up:</span>
            <span>{formatRelativeDate(lead.next_follow_up)}</span>
            {followUpOverdue && (
              <Badge variant="outline" size="xs" className="ml-auto bg-red-50 text-red-600 border-red-200">
                Overdue
              </Badge>
            )}
          </div>
        )}

        {/* Assignment Section */}
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Assignment</p>
          <div className="space-y-1.5">
            {assignedUser && (
              <AssignmentRow label="Assigned To" user={assignedUser} />
            )}
            {intakeStaff && (
              <AssignmentRow label="Intake Staff" user={intakeStaff} />
            )}
            {responsibleLawyer && (
              <AssignmentRow label="Responsible Lawyer" user={responsibleLawyer} />
            )}
            {!assignedUser && !intakeStaff && !responsibleLawyer && (
              <p className="text-xs text-muted-foreground italic">No one assigned</p>
            )}
          </div>
        </div>

        {/* Notes */}
        {lead.notes && (
          <div className="border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Notes</p>
            <p className="text-sm text-foreground whitespace-pre-line line-clamp-3">{lead.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="h-3 w-3" />
        <span>{label}</span>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function AssignmentRow({ label, user }: { label: string; user: UserRow }) {
  return (
    <div className="flex items-center gap-2">
      <Avatar size="sm">
        <AvatarFallback className="text-[10px] bg-slate-100">
          {formatInitials(user.first_name, user.last_name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm truncate">{formatFullName(user.first_name, user.last_name) || user.email}</p>
      </div>
    </div>
  )
}
