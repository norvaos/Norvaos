'use client'

/**
 * CorrespondenceTab — Zone D tab #8
 *
 * IRCC correspondence timeline for immigration matters.
 * Persisted to `ircc_correspondence` (migration 117).
 *
 * JR Deadline calculation:
 *   Inside Canada  → 15 days from decision date
 *   Outside Canada → 60 days from decision date
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
import { createClient } from '@/lib/supabase/client'

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
import type { IrccCorrespondenceRow } from '@/lib/types/database'

// ── Types ────────────────────────────────────────────────────────────────────

type DecisionType = 'approved' | 'refused' | 'other' | ''
type MilestoneStatus = 'pending' | 'received' | 'submitted' | 'n_a'

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

// ── Mutation hook ─────────────────────────────────────────────────────────────

function useCreateCorrespondenceItem(matterId: string, tenantId: string) {
  const qc = useQueryClient()
  const supabase = createClient()

  return useMutation({
    mutationFn: async (payload: {
      item_type: string
      item_date?: string | null
      status?: string
      decision_type?: string | null
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('ircc_correspondence')
        .upsert(
          {
            matter_id: matterId,
            tenant_id: tenantId,
            item_type: payload.item_type,
            item_date: payload.item_date ?? null,
            status: payload.status ?? 'pending',
            decision_type: payload.decision_type ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'matter_id,item_type' }
        )
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ircc-correspondence', matterId] })
    },
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CorrespondenceTab({ matterId, tenantId }: CorrespondenceTabProps) {
  const supabase = createClient()

  const { data: correspondence, isLoading } = useQuery({
    queryKey: ['ircc-correspondence', matterId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('ircc_correspondence')
        .select('*')
        .eq('matter_id', matterId)
        .order('item_date', { ascending: true })
      return (data ?? []) as IrccCorrespondenceRow[]
    },
    enabled: !!matterId,
  })

  const upsert = useCreateCorrespondenceItem(matterId, tenantId)

  // Helper: find a record by item_type
  function byType(type: string): IrccCorrespondenceRow | undefined {
    return correspondence?.find(r => r.item_type === type)
  }

  // Helper: get date string for a type
  function dateFor(type: string): string {
    return byType(type)?.item_date ?? ''
  }

  // Helper: get status for a type
  function statusFor(type: string): MilestoneStatus {
    return (byType(type)?.status as MilestoneStatus) ?? 'pending'
  }

  // Decision notice record
  const decisionRecord = byType('decision_notice')
  const decisionDate = decisionRecord?.item_date ?? ''
  const decisionType = (decisionRecord?.decision_type as DecisionType) ?? ''

  // inside_canada is stored in notes field as a convention ("inside" | "outside")
  // We store it as decision_type for the refusal record, but for location we use
  // a separate item_type 'jr_location' with decision_type = 'inside' | 'outside'
  const jrLocationRecord = byType('jr_location')
  const insideCanada = jrLocationRecord?.decision_type === 'inside'

  const showRefusal = decisionDate !== '' && decisionType === 'refused'

  const hasAnyData = correspondence && correspondence.length > 0

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
          <div>
            <h3 className="text-sm font-semibold">IRCC Correspondence</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Loading…</p>
          </div>
        </div>
      </div>
    )
  }

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
        <div className="divide-y">

          {/* 1 — Application Received (AOR) */}
          <MilestoneRow
            icon={<FileText className="h-4 w-4" />}
            label="Application Received (AOR)"
            date={dateFor('AOR')}
            onDateChange={v => upsert.mutate({ item_type: 'AOR', item_date: v || null })}
          />

          {/* 2 — Biometrics Request */}
          <MilestoneRow
            icon={<ScanFace className="h-4 w-4" />}
            label="Biometrics Request"
            date={dateFor('biometrics_request')}
            onDateChange={v => upsert.mutate({
              item_type: 'biometrics_request',
              item_date: v || null,
              status: statusFor('biometrics_request'),
            })}
            showStatus
            status={statusFor('biometrics_request')}
            onStatusChange={v => upsert.mutate({
              item_type: 'biometrics_request',
              item_date: dateFor('biometrics_request') || null,
              status: v,
            })}
          />

          {/* 3 — Medical Request */}
          <MilestoneRow
            icon={<Stethoscope className="h-4 w-4" />}
            label="Medical Request"
            date={dateFor('medical_request')}
            onDateChange={v => upsert.mutate({
              item_type: 'medical_request',
              item_date: v || null,
              status: statusFor('medical_request'),
            })}
            showStatus
            status={statusFor('medical_request')}
            onStatusChange={v => upsert.mutate({
              item_type: 'medical_request',
              item_date: dateFor('medical_request') || null,
              status: v,
            })}
          />

          {/* 4 — Additional Documents Request */}
          <MilestoneRow
            icon={<FileText className="h-4 w-4" />}
            label="Additional Documents Request"
            date={dateFor('additional_docs_request')}
            onDateChange={v => upsert.mutate({
              item_type: 'additional_docs_request',
              item_date: v || null,
              status: statusFor('additional_docs_request'),
            })}
            showStatus
            status={statusFor('additional_docs_request')}
            onStatusChange={v => upsert.mutate({
              item_type: 'additional_docs_request',
              item_date: dateFor('additional_docs_request') || null,
              status: v,
            })}
          />

          {/* 5 — Decision Notice */}
          <div className="flex gap-4 py-3">
            <div className="flex flex-col items-center">
              <div className={cn(
                'h-8 w-8 rounded-full flex items-center justify-center shrink-0 border-2',
                decisionDate
                  ? 'bg-green-50 border-green-400 text-green-600'
                  : 'bg-muted border-border text-muted-foreground',
              )}>
                {decisionDate
                  ? <CheckCircle2 className="h-4 w-4" />
                  : <Circle className="h-4 w-4 opacity-40" />
                }
              </div>
            </div>
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-center gap-2 mb-2">
                <Gavel className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Decision Notice</span>
                {decisionDate && (
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(decisionDate), 'MMM d, yyyy')}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2 items-end">
                {/* Date */}
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Date</Label>
                  <Input
                    type="date"
                    value={decisionDate}
                    onChange={e => upsert.mutate({
                      item_type: 'decision_notice',
                      item_date: e.target.value || null,
                      decision_type: decisionType || null,
                    })}
                    className="h-7 text-xs w-36"
                  />
                </div>

                {/* Decision type */}
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Decision</Label>
                  <Select
                    value={decisionType || 'other'}
                    onValueChange={v => upsert.mutate({
                      item_type: 'decision_notice',
                      item_date: decisionDate || null,
                      decision_type: v,
                    })}
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
                {decisionDate && (
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">Location</Label>
                    <Select
                      value={insideCanada ? 'inside' : 'outside'}
                      onValueChange={v => upsert.mutate({
                        item_type: 'jr_location',
                        decision_type: v,
                      })}
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
              {decisionDate && (
                <JRDeadlineBadge
                  decisionDate={decisionDate}
                  insideCanada={insideCanada}
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
                  decisionDate={decisionDate}
                  insideCanada={insideCanada}
                />
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
