'use client'

/**
 * SovereignComplianceStep — Directive 42.0, Step 3: Compliance Review
 *
 * Informational step shown after contact + lead creation. Displays the
 * current compliance matrix, next-step guidance, and navigation options.
 * This step does NOT block — it is purely informational.
 */

import { useRouter } from 'next/navigation'
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  Fingerprint,
  FileSignature,
  UserCheck,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Lock,
} from 'lucide-react'
import { useComplianceMatrix } from '@/lib/hooks/use-compliance-data'
import { useTenant } from '@/lib/hooks/use-tenant'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { IntakeState } from '../sovereign-stepper'

// ── Types ────────────────────────────────────────────────────────────────────

interface ComplianceStepProps {
  contactId: string
  leadId: string
  onComplete: () => void
}

interface InternalComplianceStepProps {
  intake: IntakeState
  updateIntake: (patch: Partial<IntakeState>) => void
}

// ── Compliance item config ───────────────────────────────────────────────────

interface ComplianceItemConfig {
  key: string
  label: string
  icon: typeof Shield
  status: 'passed' | 'pending'
  description: string
  colourClass: string
}

function buildComplianceItems(conflictCleared: boolean): ComplianceItemConfig[] {
  return [
    {
      key: 'kyc',
      label: 'KYC Verification',
      icon: Shield,
      status: 'pending',
      description: 'Upload Government ID to verify identity',
      colourClass: 'border-slate-200 bg-slate-50 text-slate-500',
    },
    {
      key: 'conflict',
      label: 'Conflict Check',
      icon: conflictCleared ? ShieldCheck : ShieldAlert,
      status: conflictCleared ? 'passed' : 'pending',
      description: conflictCleared
        ? 'Conflict check passed'
        : 'Conflict check incomplete',
      colourClass: conflictCleared
        ? 'border-green-300 bg-green-50 text-green-700'
        : 'border-amber-300 bg-amber-50 text-amber-700',
    },
    {
      key: 'retainer',
      label: 'Retainer Agreement',
      icon: FileSignature,
      status: 'pending',
      description: 'Retainer agreement not yet sent',
      colourClass: 'border-slate-200 bg-slate-50 text-slate-500',
    },
    {
      key: 'aml',
      label: 'AML Screening',
      icon: Fingerprint,
      status: 'pending',
      description: 'Awaiting identity document upload',
      colourClass: 'border-slate-200 bg-slate-50 text-slate-500',
    },
  ]
}

// ── Next steps guidance ──────────────────────────────────────────────────────

const NEXT_STEPS = [
  'Upload Government ID to the Norva Vault',
  'Schedule a consultation',
  'Send the retainer package when ready',
]

// ── Main export (stepper-compatible) ─────────────────────────────────────────

export function SovereignComplianceStep({ intake }: InternalComplianceStepProps) {
  const router = useRouter()
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''

  const contactId = intake.contactId
  const leadId = intake.leadId

  // Fetch live compliance matrix when IDs are available
  const matrix = useComplianceMatrix(
    contactId,
    leadId,
    null, // no matter yet
    tenantId,
  )

  const items = buildComplianceItems(intake.conflictCleared)

  return (
    <div className="space-y-6">
      {/* ── Success header ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 animate-in fade-in duration-300">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="size-5 text-green-600" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Contact Created Successfully
          </h3>
          <p className="text-sm text-muted-foreground">
            {intake.firstName} {intake.lastName} has been added to the system.
          </p>
        </div>
      </div>

      {/* ── Compliance matrix ───────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h4 className="text-sm font-medium text-slate-700">
            Compliance Matrix
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {items.map((item, idx) => {
              const Icon = item.icon
              const isPassed = item.status === 'passed'

              return (
                <div
                  key={item.key}
                  className={cn(
                    'flex items-start gap-2.5 rounded-lg border p-3 transition-all',
                    'animate-in fade-in fill-mode-both',
                    item.colourClass,
                    isPassed && 'animate-pulse-once',
                  )}
                  style={{ animationDelay: `${(idx + 1) * 100}ms`, animationDuration: '400ms' }}
                >
                  <Icon
                    className={cn(
                      'mt-0.5 size-4 shrink-0',
                      isPassed ? 'text-green-600' : 'text-slate-400',
                    )}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold">{item.label}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[9px] px-1.5 py-0',
                          isPassed
                            ? 'border-green-300 bg-green-50 text-green-700'
                            : 'border-slate-200 bg-slate-50 text-slate-500',
                        )}
                      >
                        {isPassed ? 'Passed' : 'Pending'}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                      {item.description}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Next steps guidance ─────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4 space-y-2.5">
          <h4 className="text-sm font-medium text-slate-700">Next Steps</h4>
          <ul className="space-y-2">
            {NEXT_STEPS.map((step, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2 text-sm text-slate-600 animate-in fade-in fill-mode-both"
                style={{ animationDelay: `${(idx + 1) * 100 + 400}ms`, animationDuration: '300ms' }}
              >
                <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-blue-500" />
                {step}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* ── Convert to Matter (locked) ──────────────────────────────────── */}
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-400 cursor-not-allowed">
              <Lock className="size-4" />
              <span>Convert to Matter</span>
              <Badge
                variant="outline"
                className="ml-auto border-slate-200 bg-white text-[10px] text-slate-400"
              >
                Locked
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs max-w-xs">
            Complete KYC and Retainer to unlock conversion.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* ── Action buttons ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        {leadId && (
          <Button
            className="flex-1"
            onClick={() => router.push(`/leads?command=${leadId}`)}
          >
            <ExternalLink className="mr-2 size-4" />
            Open in Command Centre
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Standalone export (for direct use outside the stepper) ───────────────────

export function ComplianceStepStandalone({
  contactId,
  leadId,
  onComplete,
}: ComplianceStepProps) {
  const router = useRouter()
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''

  const matrix = useComplianceMatrix(contactId, leadId, null, tenantId)

  const items = buildComplianceItems(matrix.conflict === 'passed')

  return (
    <div className="space-y-6">
      {/* Success header */}
      <div className="flex items-center gap-3 animate-in fade-in duration-300">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="size-5 text-green-600" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Contact Created Successfully
          </h3>
        </div>
      </div>

      {/* Compliance matrix */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h4 className="text-sm font-medium text-slate-700">
            Compliance Matrix
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {items.map((item, idx) => {
              const Icon = item.icon
              const isPassed = item.status === 'passed'

              return (
                <div
                  key={item.key}
                  className={cn(
                    'flex items-start gap-2.5 rounded-lg border p-3 transition-all',
                    'animate-in fade-in fill-mode-both',
                    item.colourClass,
                    isPassed && 'animate-pulse-once',
                  )}
                  style={{ animationDelay: `${(idx + 1) * 100}ms`, animationDuration: '400ms' }}
                >
                  <Icon
                    className={cn(
                      'mt-0.5 size-4 shrink-0',
                      isPassed ? 'text-green-600' : 'text-slate-400',
                    )}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold">{item.label}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[9px] px-1.5 py-0',
                          isPassed
                            ? 'border-green-300 bg-green-50 text-green-700'
                            : 'border-slate-200 bg-slate-50 text-slate-500',
                        )}
                      >
                        {isPassed ? 'Passed' : 'Pending'}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                      {item.description}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Next steps */}
      <Card>
        <CardContent className="p-4 space-y-2.5">
          <h4 className="text-sm font-medium text-slate-700">Next Steps</h4>
          <ul className="space-y-2">
            {NEXT_STEPS.map((step, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2 text-sm text-slate-600 animate-in fade-in fill-mode-both"
                style={{ animationDelay: `${(idx + 1) * 100 + 400}ms`, animationDuration: '300ms' }}
              >
                <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-blue-500" />
                {step}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Convert to Matter (locked) */}
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-400 cursor-not-allowed">
              <Lock className="size-4" />
              <span>Convert to Matter</span>
              <Badge
                variant="outline"
                className="ml-auto border-slate-200 bg-white text-[10px] text-slate-400"
              >
                Locked
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs max-w-xs">
            Complete KYC and Retainer to unlock conversion.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button
          className="flex-1"
          onClick={() => router.push(`/leads?command=${leadId}`)}
        >
          <ExternalLink className="mr-2 size-4" />
          Open in Command Centre
        </Button>
        <Button variant="outline" onClick={onComplete}>
          Close
        </Button>
      </div>
    </div>
  )
}
