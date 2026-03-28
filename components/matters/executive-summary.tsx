'use client'

import { useState, useCallback, useMemo } from 'react'
import { useMatterDashboard, type DashboardMatter, type DashboardSlot } from '@/lib/queries/matter-dashboard'
import { useReadinessScore, type ReadinessResult } from '@/lib/queries/readiness'
import { useCheckGating } from '@/lib/queries/matter-types'
import { logAudit } from '@/lib/queries/audit-logs'
import { formatFullName } from '@/lib/utils/formatters'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Progress } from '@/components/ui/progress'
import {
  Shield, ShieldAlert, ShieldCheck, AlertTriangle, CheckCircle2,
  Lock, Eye, EyeOff, FileText, Upload, DollarSign,
  ArrowRight, Activity, User, Fingerprint,
  AlertCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMatterStages } from '@/lib/queries/matter-types'
// ─── Types ───────────────────────────────────────────────────────────────────

interface ExecutiveSummaryProps {
  matterId: string
  tenantId: string
  userId: string
}

interface ImmigrationData {
  uci?: string
  passport_number?: string
  passport_expiry?: string
  passport_country?: string
}

interface ProcessingStreamProps {
  currentStageId: string | null
  pipelineId: string | null
  matterId: string
  stageEnteredAt: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(cents: number): string {
  const dollars = cents / 100
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
  }).format(dollars)
}

function maskField(value: string): string {
  if (value.length <= 4) return value.replace(/./g, '\u2022')
  return '\u2022'.repeat(value.length - 4) + value.slice(-4)
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr)
  const now = new Date()
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function formatDuration(enteredAt: string): string {
  const start = new Date(enteredAt)
  const now = new Date()
  const diffMs = now.getTime() - start.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

  if (diffDays === 0) {
    if (diffHours === 0) return '< 1h'
    return `${diffHours}h`
  }
  if (diffDays === 1) return `1d ${diffHours}h`
  return `${diffDays}d`
}

function readinessColour(score: number): string {
  if (score < 30) return 'text-red-600'
  if (score < 60) return 'text-amber-600'
  return 'text-green-600'
}

function readinessProgressColour(score: number): string {
  if (score < 30) return '[&>div]:bg-red-950/300'
  if (score < 60) return '[&>div]:bg-amber-500'
  return '[&>div]:bg-green-500'
}

function riskBadgeVariant(level: string): string {
  switch (level) {
    case 'low': return 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
    case 'medium': return 'bg-amber-950/30 text-amber-400 border-amber-500/30'
    case 'high': return 'bg-red-950/30 text-red-400 border-red-500/30'
    case 'critical': return 'bg-red-200 text-red-900 border-red-500'
    default: return 'bg-muted text-muted-foreground'
  }
}

// ─── ZONE 1: Vitality Header ────────────────────────────────────────────────

function VitalityHeader({
  matter,
  readiness,
  readinessLoading,
  emptySlots,
  isLoading,
}: {
  matter: {
    title: string
    matter_number: string | null
    readiness_score: number | null
    risk_level: string | null
  } | null
  readiness: ReadinessResult | null | undefined
  readinessLoading: boolean
  emptySlots: { id: string; slot_name: string; is_required: boolean }[]
  isLoading: boolean
}) {
  if (isLoading || !matter) {
    return (
      <Card className="col-span-3">
        <CardContent className="flex items-center gap-6 py-3 px-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-48" />
        </CardContent>
      </Card>
    )
  }

  const score = readiness?.total ?? matter.readiness_score ?? 0
  const riskLevel = readiness?.level ?? matter.risk_level ?? 'medium'
  const completionPct = readiness
    ? Math.round(
        readiness.domains.reduce((sum, d) => sum + d.weighted, 0)
      )
    : score

  // Determine next action
  const firstRequired = emptySlots.find((s) => s.is_required)
  const nextActionLabel = firstRequired
    ? `Upload ${firstRequired.slot_name}`
    : 'No pending actions'
  const hasAction = !!firstRequired

  return (
    <Card className="col-span-3">
      <CardContent className="flex items-center gap-6 py-3 px-4">
        {/* Left: Matter identity */}
        <div className="shrink-0">
          <h2 className="text-sm font-semibold leading-tight truncate max-w-[280px]">
            {matter.title}
          </h2>
          {matter.matter_number && (
            <p className="text-xs text-muted-foreground">{matter.matter_number}</p>
          )}
        </div>

        {/* Centre: Gauges */}
        <div className="flex items-center gap-6 flex-1 justify-center">
          {/* Readiness Score */}
          <div className="flex items-center gap-2">
            <div className="text-xs text-muted-foreground">Readiness</div>
            {readinessLoading ? (
              <Skeleton className="h-6 w-20" />
            ) : (
              <div className="flex items-center gap-1.5">
                <Progress
                  value={score}
                  className={cn('h-2 w-20', readinessProgressColour(score))}
                />
                <span className={cn('text-sm font-bold tabular-nums', readinessColour(score))}>
                  {score}
                </span>
              </div>
            )}
          </div>

          {/* Risk Level */}
          <div className="flex items-center gap-2">
            <div className="text-xs text-muted-foreground">Risk</div>
            <Badge
              variant="outline"
              className={cn('text-xs capitalize', riskBadgeVariant(riskLevel))}
            >
              {riskLevel === 'critical' && <ShieldAlert className="mr-1 h-3 w-3" />}
              {riskLevel === 'high' && <ShieldAlert className="mr-1 h-3 w-3" />}
              {riskLevel === 'low' && <ShieldCheck className="mr-1 h-3 w-3" />}
              {(riskLevel === 'medium' || riskLevel === 'ready') && <Shield className="mr-1 h-3 w-3" />}
              {riskLevel}
            </Badge>
          </div>

          {/* Completion % */}
          <div className="flex items-center gap-2">
            <div className="text-xs text-muted-foreground">Completion</div>
            {readinessLoading ? (
              <Skeleton className="h-6 w-20" />
            ) : (
              <div className="flex items-center gap-1.5">
                <Progress
                  value={completionPct}
                  className="h-2 w-20 [&>div]:bg-blue-500"
                />
                <span className="text-sm font-bold tabular-nums text-blue-600">
                  {completionPct}%
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Next action */}
        <Button
          variant={hasAction ? 'default' : 'outline'}
          size="sm"
          className="shrink-0 text-xs"
          disabled={!hasAction}
        >
          {hasAction ? <Upload className="mr-1.5 h-3 w-3" /> : <CheckCircle2 className="mr-1.5 h-3 w-3" />}
          {nextActionLabel}
          {hasAction && <ArrowRight className="ml-1.5 h-3 w-3" />}
        </Button>
      </CardContent>
    </Card>
  )
}

// ─── ZONE 2: Relationship Matrix ────────────────────────────────────────────

function RelationshipMatrix({
  contact,
  isLoading,
  tenantId,
  userId,
  matterId,
}: {
  contact: {
    id: string
    first_name: string | null
    last_name: string | null
    email_primary: string | null
    phone_primary: string | null
    date_of_birth: string | null
    nationality: string | null
    immigration_status: string | null
    immigration_data: unknown
    custom_fields: unknown
  } | null
  isLoading: boolean
  tenantId: string
  userId: string
  matterId: string
}) {
  const [revealedFields, setRevealedFields] = useState<Set<string>>(new Set())

  const handleReveal = useCallback(
    (field: string) => {
      setRevealedFields((prev) => {
        const next = new Set(prev)
        if (next.has(field)) {
          next.delete(field)
        } else {
          next.add(field)
          // Fire-and-forget audit log
          logAudit({
            tenantId,
            userId,
            entityType: 'matter',
            entityId: matterId,
            action: 'field_revealed',
            metadata: { field },
          })
        }
        return next
      })
    },
    [tenantId, userId, matterId]
  )

  if (isLoading) {
    return (
      <Card className="row-span-1 min-h-0 overflow-y-auto">
        <CardHeader className="py-2 px-3">
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <CardContent className="px-3 pb-3 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (!contact) {
    return (
      <Card className="row-span-1 min-h-0 flex items-center justify-center">
        <CardContent className="py-6 text-center">
          <User className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-2 text-xs text-muted-foreground">No primary contact assigned</p>
        </CardContent>
      </Card>
    )
  }

  // Parse immigration data from JSON
  const immData: ImmigrationData = (() => {
    if (contact.immigration_data && typeof contact.immigration_data === 'object') {
      return contact.immigration_data as ImmigrationData
    }
    if (contact.custom_fields && typeof contact.custom_fields === 'object') {
      const cf = contact.custom_fields as Record<string, unknown>
      return {
        uci: cf.uci as string | undefined,
        passport_number: cf.passport_number as string | undefined,
        passport_expiry: cf.passport_expiry as string | undefined,
        passport_country: cf.passport_country as string | undefined,
      }
    }
    return {}
  })()

  const passportExpiring =
    immData.passport_expiry ? daysUntil(immData.passport_expiry) <= 90 : false

  const fullName = formatFullName(contact.first_name, contact.last_name)

  return (
    <Card className="row-span-1 min-h-0 overflow-y-auto">
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Fingerprint className="h-3.5 w-3.5 text-muted-foreground" />
          Relationship Matrix
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-2">
        {/* Contact Name */}
        <div>
          <span className="text-xs text-muted-foreground">Contact</span>
          <p className="text-sm font-semibold">{fullName || 'Unnamed'}</p>
        </div>

        {/* UCI */}
        {immData.uci && (
          <div>
            <span className="text-xs text-muted-foreground">UCI</span>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-mono tabular-nums">
                {revealedFields.has('uci') ? immData.uci : maskField(immData.uci)}
              </p>
              <button
                type="button"
                onClick={() => handleReveal('uci')}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label={revealedFields.has('uci') ? 'Hide UCI' : 'Reveal UCI'}
              >
                {revealedFields.has('uci') ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* Passport # */}
        {immData.passport_number && (
          <div>
            <span className="text-xs text-muted-foreground">Passport #</span>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-mono tabular-nums">
                {revealedFields.has('passport_number')
                  ? immData.passport_number
                  : maskField(immData.passport_number)}
              </p>
              <button
                type="button"
                onClick={() => handleReveal('passport_number')}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label={
                  revealedFields.has('passport_number')
                    ? 'Hide passport number'
                    : 'Reveal passport number'
                }
              >
                {revealedFields.has('passport_number') ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* Passport Expiry */}
        {immData.passport_expiry && (
          <div
            className={cn(
              'rounded px-2 py-1 -mx-2',
              passportExpiring && 'border border-red-500 bg-red-950/30'
            )}
          >
            <span className="text-xs text-muted-foreground">Passport Expiry</span>
            <div className="flex items-center gap-1.5">
              <p className="text-sm">{immData.passport_expiry}</p>
              {passportExpiring && (
                <>
                  <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                  <span className="text-xs font-medium text-red-600">EXPIRING SOON</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* DOB */}
        {contact.date_of_birth && (
          <div>
            <span className="text-xs text-muted-foreground">Date of Birth</span>
            <p className="text-sm">{contact.date_of_birth}</p>
          </div>
        )}

        {/* Nationality */}
        {contact.nationality && (
          <div>
            <span className="text-xs text-muted-foreground">Nationality</span>
            <p className="text-sm">{contact.nationality}</p>
          </div>
        )}

        {/* Immigration Status */}
        {contact.immigration_status && (
          <div>
            <span className="text-xs text-muted-foreground">Immigration Status</span>
            <p className="text-sm">{contact.immigration_status}</p>
          </div>
        )}

        {/* Email */}
        {contact.email_primary && (
          <div>
            <span className="text-xs text-muted-foreground">Email</span>
            <p className="text-sm truncate">{contact.email_primary}</p>
          </div>
        )}

        {/* Phone */}
        {contact.phone_primary && (
          <div>
            <span className="text-xs text-muted-foreground">Phone</span>
            <p className="text-sm">{contact.phone_primary}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── ZONE 3: Processing Stream ──────────────────────────────────────────────

function ProcessingStream({
  currentStageId,
  pipelineId,
  matterId,
  stageEnteredAt,
}: ProcessingStreamProps) {
  const { data: stages, isLoading: stagesLoading } = useMatterStages(pipelineId)
  const { data: gatingData } = useCheckGating(matterId, !!pipelineId)
  const gatingErrors = gatingData?.gatingErrors ?? {}

  if (stagesLoading || !stages) {
    return (
      <Card className="min-h-0">
        <CardHeader className="py-2 px-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="flex gap-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 flex-1" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (stages.length === 0) {
    return (
      <Card className="min-h-0 flex items-center justify-center">
        <CardContent className="py-6 text-center">
          <Activity className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-2 text-xs text-muted-foreground">No pipeline configured</p>
        </CardContent>
      </Card>
    )
  }

  // Determine which stages are completed vs current vs upcoming
  const currentIdx = stages.findIndex((s) => s.id === currentStageId)

  return (
    <Card className="min-h-0 overflow-hidden">
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-muted-foreground" />
          Processing Stream
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <TooltipProvider>
          <div className="flex items-stretch">
            {stages.map((stage, idx) => {
              const isCurrent = stage.id === currentStageId
              const isCompleted = currentIdx >= 0 && idx < currentIdx
              const isUpcoming = currentIdx >= 0 && idx > currentIdx
              const isGated = !!(gatingErrors[stage.id]?.length)
              const isFirst = idx === 0

              const stageColour = stage.color ?? '#6b7280'

              return (
                <Tooltip key={stage.id}>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        'relative flex items-center justify-center px-3 py-2 text-xs font-medium transition-all flex-1 min-w-0',
                        isCompleted && 'text-white',
                        isCurrent && 'text-white ring-2 ring-offset-1 animate-pulse',
                        isUpcoming && !isGated && 'bg-muted text-muted-foreground',
                        isGated && 'border-2 border-dashed border-red-400 bg-red-950/30 text-red-400'
                      )}
                      style={{
                        backgroundColor: isCompleted || isCurrent ? stageColour : undefined,
                        clipPath: isFirst
                          ? 'polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)'
                          : 'polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)',
                        ...(isCurrent ? { ringColor: stageColour } : {}),
                      }}
                    >
                      {isCompleted && <CheckCircle2 className="h-3 w-3 shrink-0 mr-1" />}
                      {isGated && <Lock className="h-3 w-3 shrink-0 mr-1" />}
                      <span className="truncate">{stage.name}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold">{stage.name}</p>
                      {stage.sla_days != null && (
                        <p className="text-xs text-muted-foreground">
                          SLA: {stage.sla_days} day{stage.sla_days !== 1 ? 's' : ''}
                        </p>
                      )}
                      {isCurrent && stageEnteredAt && (
                        <p className="text-xs text-muted-foreground">
                          Time in stage: {formatDuration(stageEnteredAt)}
                        </p>
                      )}
                      {isGated && gatingErrors[stage.id] && (
                        <div className="space-y-0.5">
                          <p className="text-xs font-medium text-red-600">Gating rules blocking:</p>
                          {gatingErrors[stage.id].map((err, ei) => (
                            <p key={ei} className="text-xs text-red-500">
                              - {err}
                            </p>
                          ))}
                        </div>
                      )}
                      {isCompleted && (
                        <p className="text-xs text-green-600">Completed</p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  )
}

// ─── ZONE 4: Financial War Room ─────────────────────────────────────────────

function FinancialWarRoom({
  trustBalance,
  feeSnapshot,
  isLoading,
}: {
  trustBalance: { running_balance_cents: number }
  feeSnapshot: {
    total_amount_cents?: number
    tax_amount_cents?: number
    subtotal_cents?: number
  } | null
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <Card className="row-span-1 min-h-0 overflow-y-auto">
        <CardHeader className="py-2 px-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="px-3 pb-3 space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
        </CardContent>
      </Card>
    )
  }

  const balanceCents = trustBalance.running_balance_cents
  const balanceColour =
    balanceCents < 0
      ? 'text-red-600'
      : balanceCents === 0
        ? 'text-amber-600'
        : 'text-green-600'

  const totalCents = feeSnapshot?.total_amount_cents ?? 0
  const outstandingCents = Math.max(0, totalCents - Math.max(0, balanceCents))

  return (
    <Card className="row-span-1 min-h-0 overflow-y-auto">
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
          Financial War Room
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-4">
        {/* Trust Balance */}
        <div>
          <span className="text-xs text-muted-foreground">Trust Balance</span>
          <p className={cn('text-xl font-bold tabular-nums', balanceColour)}>
            {formatCurrency(balanceCents)}
          </p>
          {balanceCents < 0 && (
            <div className="flex items-center gap-1 mt-0.5">
              <AlertCircle className="h-3 w-3 text-red-500" />
              <span className="text-xs text-red-600 font-medium">Negative balance</span>
            </div>
          )}
          {balanceCents === 0 && (
            <div className="flex items-center gap-1 mt-0.5">
              <AlertTriangle className="h-3 w-3 text-amber-500" />
              <span className="text-xs text-amber-600 font-medium">No funds in trust</span>
            </div>
          )}
        </div>

        {/* Fee Snapshot */}
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground font-medium">Fee Snapshot</span>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
            <span className="text-muted-foreground">Total</span>
            <span className="text-right font-medium tabular-nums">
              {formatCurrency(totalCents)}
            </span>

            <span className="text-muted-foreground">Trust Held</span>
            <span className="text-right font-medium tabular-nums text-green-600">
              {formatCurrency(Math.max(0, balanceCents))}
            </span>

            <span className="text-muted-foreground">Outstanding</span>
            <span
              className={cn(
                'text-right font-medium tabular-nums',
                outstandingCents > 0 ? 'text-red-600' : 'text-green-600'
              )}
            >
              {formatCurrency(outstandingCents)}
            </span>
          </div>
        </div>

        {/* Aging Buckets (placeholder) */}
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground font-medium">Aging</span>
          <div className="flex gap-1 h-3">
            <div className="flex-1 rounded-sm bg-green-400" title="Current" />
            <div className="flex-1 rounded-sm bg-amber-400" title="30 days" />
            <div className="flex-1 rounded-sm bg-red-400" title="60+ days" />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Current</span>
            <span>30d</span>
            <span>60+</span>
          </div>
          <p className="text-[10px] text-muted-foreground italic">
            Full aging report available in Billing tab
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── ZONE 5: Audit & Docs Footer ───────────────────────────────────────────

function AuditDocsFooter({
  emptySlots,
  isLoading,
}: {
  emptySlots: DashboardSlot[]
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <Card className="col-span-3">
        <CardContent className="py-3 px-4">
          <div className="flex gap-3 overflow-x-auto">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-48 shrink-0" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (emptySlots.length === 0) {
    return (
      <Card className="col-span-3">
        <CardContent className="flex items-center justify-center gap-2 py-4 px-4">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <span className="text-sm font-medium text-emerald-400">
            All documents received
          </span>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="col-span-3">
      <CardHeader className="py-2 px-4">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          Pending Documents
          <Badge variant="secondary" className="ml-1 text-[10px]">
            {emptySlots.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="flex gap-3 overflow-x-auto pb-1">
          {emptySlots.map((slot) => (
            <div
              key={slot.id}
              className="shrink-0 w-48 rounded-md border bg-card p-2.5 space-y-1.5"
            >
              <div className="flex items-start gap-1">
                <span className="text-xs font-medium leading-tight line-clamp-2">
                  {slot.slot_name}
                </span>
                {slot.is_required && (
                  <span className="text-red-500 text-xs font-bold shrink-0" title="Required">
                    *
                  </span>
                )}
              </div>
              {slot.category && (
                <Badge variant="outline" className="text-[10px] px-1 py-0">
                  {slot.category}
                </Badge>
              )}
              <Button variant="outline" size="sm" className="w-full h-6 text-[10px]">
                <Upload className="mr-1 h-3 w-3" />
                Upload
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

export function ExecutiveSummarySkeleton() {
  return (
    <div className="grid grid-cols-[280px_1fr_300px] grid-rows-[auto_1fr_auto] gap-3 h-full">
      {/* Zone 1 */}
      <Card className="col-span-3">
        <CardContent className="flex items-center gap-6 py-3 px-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-48" />
        </CardContent>
      </Card>

      {/* Zone 2 */}
      <Card>
        <CardHeader className="py-2 px-3">
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <CardContent className="px-3 pb-3 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </CardContent>
      </Card>

      {/* Zone 3 */}
      <Card>
        <CardHeader className="py-2 px-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="flex gap-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 flex-1" />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Zone 4 */}
      <Card>
        <CardHeader className="py-2 px-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="px-3 pb-3 space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
        </CardContent>
      </Card>

      {/* Zone 5 */}
      <Card className="col-span-3">
        <CardContent className="py-3 px-4">
          <div className="flex gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-48 shrink-0" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function ExecutiveSummary({
  matterId,
  tenantId,
  userId,
}: ExecutiveSummaryProps) {
  const {
    matter,
    contact,
    trustBalance,
    emptySlots,
    isLoading,
  } = useMatterDashboard(matterId)

  const {
    data: readiness,
    isLoading: readinessLoading,
  } = useReadinessScore(matterId)

  // Build fee snapshot from matter data
  const feeSnapshot = useMemo(() => {
    if (!matter) return null
    const raw = matter.fee_snapshot as Record<string, unknown> | null
    if (raw && typeof raw === 'object') {
      return {
        total_amount_cents: (raw.total_amount_cents as number) ?? 0,
        tax_amount_cents: (raw.tax_amount_cents as number) ?? 0,
        subtotal_cents: (raw.subtotal_cents as number) ?? 0,
      }
    }
    return {
      total_amount_cents: matter.total_amount_cents ?? 0,
      tax_amount_cents: (matter as any).tax_amount_cents ?? 0,
      subtotal_cents: (matter as any).subtotal_cents ?? 0,
    }
  }, [matter])

  return (
    <div className="grid grid-cols-[280px_1fr_300px] grid-rows-[auto_1fr_auto] gap-3 h-full">
      {/* ZONE 1: Vitality Header */}
      <VitalityHeader
        matter={
          matter
            ? {
                title: matter.title ?? '',
                matter_number: matter.matter_number,
                readiness_score: matter.readiness_score,
                risk_level: matter.risk_level,
              }
            : null
        }
        readiness={readiness ?? null}
        readinessLoading={readinessLoading}
        emptySlots={emptySlots}
        isLoading={isLoading}
      />

      {/* ZONE 2: Relationship Matrix (Left Rail) */}
      <RelationshipMatrix
        contact={contact}
        isLoading={isLoading}
        tenantId={tenantId}
        userId={userId}
        matterId={matterId}
      />

      {/* ZONE 3: Processing Stream (Centre) */}
      <ProcessingStream
        currentStageId={matter?.stage_id ?? null}
        pipelineId={matter?.pipeline_id ?? null}
        matterId={matterId}
        stageEnteredAt={matter?.stage_entered_at ?? null}
      />

      {/* ZONE 4: Financial War Room (Right Rail) */}
      <FinancialWarRoom
        trustBalance={trustBalance}
        feeSnapshot={feeSnapshot}
        isLoading={isLoading}
      />

      {/* ZONE 5: Audit & Docs Footer */}
      <AuditDocsFooter
        emptySlots={emptySlots}
        isLoading={isLoading}
      />
    </div>
  )
}
