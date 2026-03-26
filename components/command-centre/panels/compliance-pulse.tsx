'use client'

/**
 * CompliancePulse  -  Directive 41.3 (LSO/CICC Standards)
 *
 * A persistent, compact compliance matrix visible on every Lead/Matter page.
 * Shows the 4-item File Compliance Matrix at a glance:
 *   1. KYC Status      -  Verified / Pending / Not Started
 *   2. Conflict Status  -  Passed / Flagged / Not Started
 *   3. Retainer Status  -  Hash-Verified / Signed / Unsigned / None
 *   4. AML Pulse        -  Match / Mismatch / Pending
 *
 * Also displays a composite compliance score (0-100%) as a progress bar.
 */

import { useCommandCentre } from '../command-centre-context'
import {
  useComplianceMatrix,
  type KycStatus,
  type ConflictPulse,
  type RetainerPulse,
  type AmlPulse,
} from '@/lib/hooks/use-compliance-data'
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  Fingerprint,
  FileSignature,
  UserCheck,
  Loader2,
  Lock,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

// ── Status config maps ───────────────────────────────────────────────

const KYC_CONFIG: Record<KycStatus, { label: string; colour: string; icon: typeof ShieldCheck }> = {
  verified: { label: 'Verified', colour: 'border-green-300 bg-green-50 text-green-700', icon: ShieldCheck },
  pending: { label: 'Pending', colour: 'border-amber-300 bg-amber-50 text-amber-700', icon: Shield },
  not_started: { label: 'Not Started', colour: 'border-slate-200 bg-slate-50 text-slate-500', icon: Shield },
}

const CONFLICT_CONFIG: Record<ConflictPulse, { label: string; colour: string; icon: typeof ShieldCheck }> = {
  passed: { label: 'Passed', colour: 'border-green-300 bg-green-50 text-green-700', icon: ShieldCheck },
  flagged: { label: 'Flagged', colour: 'border-red-300 bg-red-50 text-red-700', icon: ShieldAlert },
  not_started: { label: 'Not Started', colour: 'border-slate-200 bg-slate-50 text-slate-500', icon: Shield },
}

const RETAINER_CONFIG: Record<RetainerPulse, { label: string; colour: string; icon: typeof FileSignature }> = {
  hash_verified: { label: 'Hash-Verified', colour: 'border-green-300 bg-green-50 text-green-700', icon: FileSignature },
  signed: { label: 'Signed', colour: 'border-blue-300 bg-blue-50 text-blue-700', icon: FileSignature },
  unsigned: { label: 'Unsigned', colour: 'border-amber-300 bg-amber-50 text-amber-700', icon: FileSignature },
  none: { label: 'None', colour: 'border-slate-200 bg-slate-50 text-slate-500', icon: FileSignature },
}

const AML_CONFIG: Record<AmlPulse, { label: string; colour: string; icon: typeof Fingerprint }> = {
  match: { label: 'Match', colour: 'border-green-300 bg-green-50 text-green-700', icon: Fingerprint },
  mismatch: { label: 'Mismatch', colour: 'border-red-300 bg-red-50 text-red-700 animate-pulse', icon: Fingerprint },
  pending: { label: 'Pending', colour: 'border-slate-200 bg-slate-50 text-slate-500', icon: Fingerprint },
}

// ── Progress bar colour ──────────────────────────────────────────────

function scoreColour(score: number): string {
  if (score === 100) return 'bg-green-500'
  if (score >= 75) return 'bg-blue-500'
  if (score >= 50) return 'bg-amber-500'
  return 'bg-red-500'
}

function scoreBorderColour(score: number): string {
  if (score === 100) return 'border-green-300'
  if (score >= 75) return 'border-blue-300'
  if (score >= 50) return 'border-amber-300'
  return 'border-red-300'
}

// ── Component ────────────────────────────────────────────────────────

export function CompliancePulse() {
  const { lead, matter, contact, tenantId, entityId, entityType } = useCommandCentre()

  const contactId = contact?.id ?? null
  const leadId = entityType === 'lead' ? entityId : lead?.id ?? null
  const matterId = entityType === 'matter' ? entityId : matter?.id ?? null

  const matrix = useComplianceMatrix(contactId, leadId, matterId, tenantId)

  if (matrix.isLoading) {
    return (
      <Card>
        <CardContent className="py-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Loading Compliance Matrix...
        </CardContent>
      </Card>
    )
  }

  const kycCfg = KYC_CONFIG[matrix.kyc]
  const conflictCfg = CONFLICT_CONFIG[matrix.conflict]
  const retainerCfg = RETAINER_CONFIG[matrix.retainer]
  const amlCfg = AML_CONFIG[matrix.aml]
  const KycIcon = kycCfg.icon
  const ConflictIcon = conflictCfg.icon
  const RetainerIcon = retainerCfg.icon
  const AmlIcon = amlCfg.icon

  return (
    <Card className={cn('transition-colors', scoreBorderColour(matrix.score))}>
      <CardHeader className="pb-1.5 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Lock className="size-3.5 text-blue-600" />
            Compliance Pulse
          </CardTitle>
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px] font-bold tabular-nums',
                    matrix.score === 100
                      ? 'border-green-300 bg-green-50 text-green-700'
                      : matrix.score >= 50
                        ? 'border-amber-300 bg-amber-50 text-amber-700'
                        : 'border-red-300 bg-red-50 text-red-700'
                  )}
                >
                  {matrix.score}%
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">
                File compliance score. 100% required for retention.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {/* Progress bar */}
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
          <div
            className={cn('h-full rounded-full transition-all duration-500', scoreColour(matrix.score))}
            style={{ width: `${matrix.score}%` }}
          />
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-3 pt-1">
        <div className="grid grid-cols-2 gap-2">
          {/* KYC */}
          <PulseItem
            icon={<KycIcon className="size-3" />}
            label="KYC"
            status={kycCfg.label}
            colour={kycCfg.colour}
            tooltip="Know Your Client  -  Government ID verified against original."
          />
          {/* Conflict */}
          <PulseItem
            icon={<ConflictIcon className="size-3" />}
            label="Conflict"
            status={conflictCfg.label}
            colour={conflictCfg.colour}
            tooltip="Conflict of interest check. Must pass before any stage advance."
          />
          {/* Retainer */}
          <PulseItem
            icon={<RetainerIcon className="size-3" />}
            label="Retainer"
            status={retainerCfg.label}
            colour={retainerCfg.colour}
            tooltip="Retainer agreement signing and SHA-256 hash verification."
          />
          {/* AML */}
          <PulseItem
            icon={<AmlIcon className="size-3" />}
            label="AML"
            status={amlCfg.label}
            colour={amlCfg.colour}
            tooltip="Anti-Money Laundering scan  -  Identity hash vs document hash."
          />
        </div>
      </CardContent>
    </Card>
  )
}

// ── Pulse Item ───────────────────────────────────────────────────────

function PulseItem({
  icon,
  label,
  status,
  colour,
  tooltip,
}: {
  icon: React.ReactNode
  label: string
  status: string
  colour: string
  tooltip: string
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="shrink-0 text-slate-500">{icon}</div>
            <span className="text-[10px] font-medium text-slate-600 shrink-0">{label}</span>
            <Badge
              variant="outline"
              className={cn('text-[8px] ml-auto shrink-0', colour)}
            >
              {status}
            </Badge>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs max-w-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
