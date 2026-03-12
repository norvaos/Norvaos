'use client'

import { Shield, User, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { RiskBadge } from '@/components/matters/risk-badge'
import { INTAKE_STATUSES, PROGRAM_CATEGORIES, PROCESSING_STREAMS } from '@/lib/utils/constants'
import { useMatterIntake } from '@/lib/queries/matter-intake'
import { useMatter } from '@/lib/queries/matters'
import { useMatterPeople } from '@/lib/queries/matter-people'
import { cn } from '@/lib/utils'

interface CoreDataSummaryPanelProps {
  matterId: string
}

export function CoreDataSummaryPanel({ matterId }: CoreDataSummaryPanelProps) {
  const { data: matter } = useMatter(matterId)
  const { data: intake, isLoading: intakeLoading } = useMatterIntake(matterId)
  const { data: people, isLoading: peopleLoading } = useMatterPeople(matterId)

  const isLoading = intakeLoading || peopleLoading

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 py-2">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading core data...</span>
      </div>
    )
  }

  // No intake record yet — show prompt
  if (!intake) {
    return (
      <div className="flex items-center gap-3 py-2 px-3 rounded-md bg-amber-50/50 border border-dashed border-amber-200">
        <Shield className="size-4 text-amber-500" />
        <span className="text-sm text-amber-700">
          Core Data Card not started — switch to the Core Data tab to begin intake.
        </span>
      </div>
    )
  }

  const pa = people?.find((p) => p.person_role === 'principal_applicant')
  const intakeStatusConfig = INTAKE_STATUSES.find((s) => s.value === intake.intake_status)
  const programLabel = matter?.matter_type ?? PROGRAM_CATEGORIES.find((c) => c.value === intake.program_category)?.label
  const streamLabel = PROCESSING_STREAMS.find((s) => s.value === intake.processing_stream)?.label
  const effectiveRiskLevel = intake.risk_override_level ?? intake.risk_level
  const redFlagCount = Array.isArray(intake.red_flags) ? intake.red_flags.length : 0

  return (
    <div className="border-b border-slate-100 py-2">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {/* Risk Badge */}
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-slate-400" />
            <RiskBadge
              level={effectiveRiskLevel}
              score={intake.risk_score}
              showScore
              size="md"
            />
            {intake.risk_override_level && (
              <span className="text-[10px] text-muted-foreground">(override)</span>
            )}
          </div>

          {/* Separator */}
          <div className="h-4 w-px bg-slate-200" />

          {/* PA Name */}
          {pa && (
            <div className="flex items-center gap-1.5 text-sm">
              <User className="size-3.5 text-slate-400" />
              <span className="font-medium text-foreground">
                {pa.first_name} {pa.last_name}
              </span>
              {pa.immigration_status && (
                <span className="text-muted-foreground">
                  · {pa.immigration_status.replace(/_/g, ' ')}
                </span>
              )}
            </div>
          )}

          {/* Separator */}
          <div className="h-4 w-px bg-slate-200" />

          {/* Program + Stream */}
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {programLabel && <span>{programLabel}</span>}
            {programLabel && streamLabel && <span>·</span>}
            {streamLabel && <span>{streamLabel}</span>}
            {!programLabel && !streamLabel && <span className="italic">No program set</span>}
          </div>

          {/* Separator */}
          <div className="h-4 w-px bg-slate-200" />

          {/* Intake Status */}
          {intakeStatusConfig && (
            <Badge
              variant="outline"
              className="text-[11px]"
              style={{
                borderColor: intakeStatusConfig.color,
                color: intakeStatusConfig.color,
                backgroundColor: `${intakeStatusConfig.color}10`,
              }}
            >
              {intakeStatusConfig.label} · {intake.completion_pct}%
            </Badge>
          )}

          {/* Red Flags */}
          {redFlagCount > 0 && (
            <div className="flex items-center gap-1 text-sm text-amber-600">
              <AlertTriangle className="size-3.5" />
              <span>{redFlagCount} flag{redFlagCount !== 1 ? 's' : ''}</span>
            </div>
          )}

          {/* Valid check */}
          {intake.intake_status === 'validated' && (
            <div className="flex items-center gap-1 text-sm text-green-600">
              <CheckCircle2 className="size-3.5" />
              <span>Validated</span>
            </div>
          )}
      </div>
    </div>
  )
}
