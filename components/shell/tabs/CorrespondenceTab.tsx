'use client'

/**
 * CorrespondenceTab — Zone D tab #8
 *
 * IRCC correspondence timeline for immigration matters.
 *
 * DB status (checked 2026-03-17): neither `ircc_correspondence` nor
 * `correspondence_items` exist in the database. This component renders
 * the full structured UI but operates on local state only — each field
 * is editable and shows a "No data" empty state until filled in.
 *
 * When migration 098-ircc-correspondence.sql is run (future sprint),
 * replace local state with a TanStack Query hook and persist to DB.
 *
 * JR Deadline calculation:
 *   Inside Canada  → 15 days from decision date
 *   Outside Canada → 60 days from decision date
 */

import { useState } from 'react'
import { format, differenceInDays } from 'date-fns'
import {
  CheckCircle2,
  Circle,
  AlertTriangle,
  Upload,
  Gavel,
  ScanFace,
  Stethoscope,
  FileText,
  XCircle,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ── Types ────────────────────────────────────────────────────────────────────

type DecisionType = 'approved' | 'refused' | 'other' | ''
type MilestoneStatus = 'pending' | 'received' | 'submitted' | 'n_a'

interface CorrespondenceState {
  aor_date:                 string   // Application Received (AOR)
  biometrics_date:          string
  biometrics_status:        MilestoneStatus
  medical_date:             string
  medical_status:           MilestoneStatus
  additional_docs_date:     string
  additional_docs_status:   MilestoneStatus
  decision_date:            string
  decision_type:            DecisionType
  inside_canada:            boolean
}

// ── JR Deadline helper ────────────────────────────────────────────────────────

function calculateJRDeadline(decisionDate: string, insideCanada: boolean): Date {
  const decision = new Date(decisionDate)
  const days = insideCanada ? 15 : 60
  const deadline = new Date(decision)
  deadline.setDate(deadline.getDate() + days)
  return deadline
}

// ── JR Deadline badge ─────────────────────────────────────────────────────────

function JRDeadlineBadge({
  decisionDate,
  insideCanada,
}: {
  decisionDate: string
  insideCanada: boolean
}) {
  if (!decisionDate) return null

  const deadline = calculateJRDeadline(decisionDate, insideCanada)
  const today = new Date()
  const daysRemaining = differenceInDays(deadline, today)
  const passed = daysRemaining < 0
  const urgent = daysRemaining >= 0 && daysRemaining <= 7

  if (passed) {
    return (
      <div className="flex items-center gap-1.5 mt-2 px-2.5 py-1.5 rounded-md bg-red-50 border border-red-200">
        <XCircle className="h-4 w-4 text-red-600 shrink-0" />
        <span className="text-xs font-semibold text-red-700">
          JR DEADLINE PASSED — {format(deadline, 'MMMM d, yyyy')}
        </span>
      </div>
    )
  }

  return (
    <div className={cn(
      'flex items-center gap-1.5 mt-2 px-2.5 py-1.5 rounded-md border',
      urgent
        ? 'bg-amber-50 border-amber-200'
        : 'bg-blue-50 border-blue-200',
    )}>
      <Clock className={cn('h-4 w-4 shrink-0', urgent ? 'text-amber-600' : 'text-blue-600')} />
      <span className={cn('text-xs font-semibold', urgent ? 'text-amber-700' : 'text-blue-700')}>
        JR Deadline: {format(deadline, 'MMMM d, yyyy')} ({daysRemaining} day{daysRemaining !== 1 ? 's' : ''} remaining)
      </span>
    </div>
  )
}

// ── Milestone row ─────────────────────────────────────────────────────────────

interface MilestoneRowProps {
  icon: React.ReactNode
  label: string
  date: string
  onDateChange: (v: string) => void
  status?: MilestoneStatus
  onStatusChange?: (v: MilestoneStatus) => void
  showStatus?: boolean
  children?: React.ReactNode
}

function MilestoneRow({
  icon,
  label,
  date,
  onDateChange,
  status,
  onStatusChange,
  showStatus = false,
  children,
}: MilestoneRowProps) {
  const hasDate = !!date

  return (
    <div className="flex gap-4 py-3">
      {/* Timeline indicator */}
      <div className="flex flex-col items-center">
        <div className={cn(
          'h-8 w-8 rounded-full flex items-center justify-center shrink-0 border-2',
          hasDate
            ? 'bg-green-50 border-green-400 text-green-600'
            : 'bg-muted border-border text-muted-foreground',
        )}>
          {hasDate
            ? <CheckCircle2 className="h-4 w-4" />
            : <Circle className="h-4 w-4 opacity-40" />
          }
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-1">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-muted-foreground">{icon}</span>
          <span className="text-sm font-medium">{label}</span>
          {hasDate && (
            <span className="text-xs text-muted-foreground">
              {format(new Date(date), 'MMM d, yyyy')}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2 items-end">
          {/* Date input */}
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Date</Label>
            <Input
              type="date"
              value={date}
              onChange={e => onDateChange(e.target.value)}
              className="h-7 text-xs w-36"
            />
          </div>

          {/* Status selector */}
          {showStatus && onStatusChange && (
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select
                value={status ?? 'pending'}
                onValueChange={v => onStatusChange(v as MilestoneStatus)}
              >
                <SelectTrigger className="h-7 text-xs w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="received">Received</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="n_a">N/A</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* File attach button */}
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground opacity-0 select-none">
              Attach
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1 px-2"
              onClick={() => {
                // File picker — uploads to correspondence-docs bucket (future)
                const input = document.createElement('input')
                input.type = 'file'
                input.accept = '.pdf,.doc,.docx,.jpg,.png'
                input.onchange = () => {
                  // TODO: wire to Supabase storage upload when bucket exists
                  // For now, notify the user
                  if (input.files?.[0]) {
                    window.alert(
                      `File "${input.files[0].name}" selected.\n\nStorage upload will be wired when the correspondence-docs bucket is provisioned.`
                    )
                  }
                }
                input.click()
              }}
            >
              <Upload className="h-3 w-3" />
              Attach
            </Button>
          </div>
        </div>

        {children}
      </div>
    </div>
  )
}

// ── Props ────────────────────────────────────────────────────────────────────

interface CorrespondenceTabProps {
  matterId: string
  tenantId: string
}

// ── Component ────────────────────────────────────────────────────────────────

export function CorrespondenceTab({ matterId, tenantId }: CorrespondenceTabProps) {
  // All state is local until migration 098 lands and wires to DB
  const [state, setState] = useState<CorrespondenceState>({
    aor_date:                '',
    biometrics_date:         '',
    biometrics_status:       'pending',
    medical_date:            '',
    medical_status:          'pending',
    additional_docs_date:    '',
    additional_docs_status:  'pending',
    decision_date:           '',
    decision_type:           '',
    inside_canada:           false,
  })

  function patch(updates: Partial<CorrespondenceState>) {
    setState(prev => ({ ...prev, ...updates }))
  }

  const showRefusal =
    state.decision_date !== '' && state.decision_type === 'refused'

  const hasAnyData =
    state.aor_date ||
    state.biometrics_date ||
    state.medical_date ||
    state.additional_docs_date ||
    state.decision_date

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
        <div>
          <h3 className="text-sm font-semibold">IRCC Correspondence</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Track milestones and IRCC responses for this matter
          </p>
        </div>
        {!hasAnyData && (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            No data entered
          </Badge>
        )}
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-4 py-2">

        {/* Notice: DB not yet provisioned */}
        <div className="mb-4 px-3 py-2.5 rounded-md bg-amber-50 border border-amber-200 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            <strong>Local session only.</strong> The <code>ircc_correspondence</code> table has not been provisioned yet.
            Dates entered here will reset on page refresh. Migration 098 will persist this data.
          </p>
        </div>

        <div className="divide-y">

          {/* 1 — Application Received (AOR) */}
          <MilestoneRow
            icon={<FileText className="h-4 w-4" />}
            label="Application Received (AOR)"
            date={state.aor_date}
            onDateChange={v => patch({ aor_date: v })}
          />

          {/* 2 — Biometrics Request */}
          <MilestoneRow
            icon={<ScanFace className="h-4 w-4" />}
            label="Biometrics Request"
            date={state.biometrics_date}
            onDateChange={v => patch({ biometrics_date: v })}
            showStatus
            status={state.biometrics_status}
            onStatusChange={v => patch({ biometrics_status: v })}
          />

          {/* 3 — Medical Request */}
          <MilestoneRow
            icon={<Stethoscope className="h-4 w-4" />}
            label="Medical Request"
            date={state.medical_date}
            onDateChange={v => patch({ medical_date: v })}
            showStatus
            status={state.medical_status}
            onStatusChange={v => patch({ medical_status: v })}
          />

          {/* 4 — Additional Documents Request */}
          <MilestoneRow
            icon={<FileText className="h-4 w-4" />}
            label="Additional Documents Request"
            date={state.additional_docs_date}
            onDateChange={v => patch({ additional_docs_date: v })}
            showStatus
            status={state.additional_docs_status}
            onStatusChange={v => patch({ additional_docs_status: v })}
          />

          {/* 5 — Decision Notice */}
          <div className="flex gap-4 py-3">
            <div className="flex flex-col items-center">
              <div className={cn(
                'h-8 w-8 rounded-full flex items-center justify-center shrink-0 border-2',
                state.decision_date
                  ? 'bg-green-50 border-green-400 text-green-600'
                  : 'bg-muted border-border text-muted-foreground',
              )}>
                {state.decision_date
                  ? <CheckCircle2 className="h-4 w-4" />
                  : <Circle className="h-4 w-4 opacity-40" />
                }
              </div>
            </div>
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-center gap-2 mb-2">
                <Gavel className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Decision Notice</span>
                {state.decision_date && (
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(state.decision_date), 'MMM d, yyyy')}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2 items-end">
                {/* Date */}
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Date</Label>
                  <Input
                    type="date"
                    value={state.decision_date}
                    onChange={e => patch({ decision_date: e.target.value })}
                    className="h-7 text-xs w-36"
                  />
                </div>

                {/* Decision type */}
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Decision</Label>
                  <Select
                    value={state.decision_type || 'other'}
                    onValueChange={v => patch({ decision_type: v as DecisionType })}
                  >
                    <SelectTrigger className="h-7 text-xs w-32">
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="refused">Refused</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Location (for JR calculation) */}
                {state.decision_date && (
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">Location</Label>
                    <Select
                      value={state.inside_canada ? 'inside' : 'outside'}
                      onValueChange={v => patch({ inside_canada: v === 'inside' })}
                    >
                      <SelectTrigger className="h-7 text-xs w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inside">Inside Canada</SelectItem>
                        <SelectItem value="outside">Outside Canada</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Attach */}
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground opacity-0 select-none">
                    Attach
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1 px-2"
                    onClick={() => {
                      const input = document.createElement('input')
                      input.type = 'file'
                      input.accept = '.pdf,.doc,.docx,.jpg,.png'
                      input.onchange = () => {
                        if (input.files?.[0]) {
                          window.alert(
                            `File "${input.files[0].name}" selected.\n\nStorage upload will be wired when the correspondence-docs bucket is provisioned.`
                          )
                        }
                      }
                      input.click()
                    }}
                  >
                    <Upload className="h-3 w-3" />
                    Attach
                  </Button>
                </div>
              </div>

              {/* JR Deadline badge — shown when decision date is set */}
              {state.decision_date && (
                <JRDeadlineBadge
                  decisionDate={state.decision_date}
                  insideCanada={state.inside_canada}
                />
              )}
            </div>
          </div>

          {/* 6 — Refusal section (conditional) */}
          {showRefusal && (
            <div className="flex gap-4 py-3">
              <div className="flex flex-col items-center">
                <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 border-2 bg-red-50 border-red-300 text-red-600">
                  <XCircle className="h-4 w-4" />
                </div>
              </div>
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <span className="text-sm font-medium text-red-700">Refused — Judicial Review Window</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  JR deadline is calculated automatically from the decision date above.
                  Engage counsel immediately if considering a judicial review application.
                </p>
                <JRDeadlineBadge
                  decisionDate={state.decision_date}
                  insideCanada={state.inside_canada}
                />
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
