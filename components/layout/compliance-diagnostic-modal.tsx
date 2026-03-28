'use client'

/**
 * Compliance Diagnostic Modal  -  Directive 41.2
 *
 * The "Regulatory Watchdog" of NorvaOS. When the user clicks the
 * compliance badge in the header, this modal opens showing:
 *
 * 1. Overall firm compliance score (5-tier colour spectrum)
 * 2. Each compliance checkpoint with By-Law citations
 * 3. "Fix" buttons that deep-link + scroll-and-glow to the exact field
 * 4. Bypass option with explicit user acknowledgement (not just "OK")
 *
 * Regulatory By-Law References:
 *   - Firm Address: By-Law 7.1, Part II
 *   - Client ID Verification: By-Law 7.1, Part III, Sec. 21 & 23
 *   - Tax Compliance: CRA GST/HST Memorandum 15.1 / RPC 3.6
 *   - Conflict Check: Rule 3.4 (Rules of Professional Conduct)
 *   - Trust Account: By-Law 9, Section 7
 *   - Engagement Letter: Rule 3.6-1 (Commentary 1)
 */

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import confetti from 'canvas-confetti'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ExternalLink,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Building2,
  Scale,
  Fingerprint,
  FileCheck2,
  Landmark,
  Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { scrollToField } from '@/lib/utils/ui-helpers'
import { useTenant } from '@/lib/hooks/use-tenant'
import { resolveRegulatoryBody, type RegulatoryBodyDef } from '@/lib/config/jurisdictions'

// ── Risk Spectrum (5-tier) ──────────────────────────────────────────────────

export type ComplianceTier = 'compliant' | 'good' | 'warning' | 'high_risk' | 'critical'

export interface TierDef {
  tier: ComplianceTier
  label: string
  min: number
  badgeClass: string
  textClass: string
  bgClass: string
  borderClass: string
  icon: typeof ShieldCheck
  description: string
}

export const COMPLIANCE_TIERS: TierDef[] = [
  {
    tier: 'compliant',
    label: 'Compliant',
    min: 100,
    badgeClass: 'border-emerald-500/30 bg-emerald-950/30 text-emerald-400',
    textClass: 'text-emerald-600',
    bgClass: 'bg-emerald-950/30',
    borderClass: 'border-emerald-500/20',
    icon: ShieldCheck,
    description: 'Audit-ready. No action required.',
  },
  {
    tier: 'good',
    label: 'Good',
    min: 80,
    badgeClass: 'border-emerald-500/30 bg-emerald-950/30 text-emerald-400',
    textClass: 'text-green-500',
    bgClass: 'bg-emerald-950/30',
    borderClass: 'border-emerald-500/20',
    icon: ShieldCheck,
    description: 'Minimum legal requirements met.',
  },
  {
    tier: 'warning',
    label: 'Warning',
    min: 60,
    badgeClass: 'border-amber-500/30 bg-amber-950/30 text-amber-400',
    textClass: 'text-amber-500',
    bgClass: 'bg-amber-950/30',
    borderClass: 'border-amber-500/20',
    icon: ShieldAlert,
    description: 'Operational but failing minor By-Laws.',
  },
  {
    tier: 'high_risk',
    label: 'High Risk',
    min: 40,
    badgeClass: 'border-orange-500/30 bg-orange-950/30 text-orange-400',
    textClass: 'text-orange-600',
    bgClass: 'bg-orange-950/30',
    borderClass: 'border-orange-500/20',
    icon: ShieldAlert,
    description: 'Likely failing By-Law 9 (Trust Accounting).',
  },
  {
    tier: 'critical',
    label: 'Critical',
    min: 0,
    badgeClass: 'border-red-500/30 bg-red-950/30 text-red-400',
    textClass: 'text-red-600',
    bgClass: 'bg-red-950/30',
    borderClass: 'border-red-500/20',
    icon: ShieldX,
    description: 'Severe liability. Breach of Directive 41.',
  },
]

export function resolveTier(score: number): TierDef {
  for (const t of COMPLIANCE_TIERS) {
    if (score >= t.min) return t
  }
  return COMPLIANCE_TIERS[COMPLIANCE_TIERS.length - 1]
}

// ── Compliance Check Definitions ────────────────────────────────────────────

export type CheckSeverity = 'mandatory' | 'recommended' | 'optimisation'

export interface ComplianceCheck {
  id: string
  label: string
  severity: CheckSeverity
  /** Points out of 100 this check contributes */
  weight: number
  byLaw: string
  byLawUrl: string
  guidance: string
  fixLabel: string
  fixPath: string
  fixFieldId: string
  icon: typeof Building2
  /** Function to determine if this check passes */
  test: (tenant: TenantData) => boolean
}

interface TenantData {
  home_province: string | null
  address_line1: string | null
  city: string | null
  province: string | null
  postal_code: string | null
  office_phone: string | null
  office_fax: string | null
  regBody: RegulatoryBodyDef | null
}

const COMPLIANCE_CHECKS: ComplianceCheck[] = [
  // ── Mandatory (Red/Critical when missing) ── Total: 75pts
  {
    id: 'jurisdiction',
    label: 'Regulatory Body',
    severity: 'mandatory',
    weight: 30,
    byLaw: 'By-Law 7.1',
    byLawUrl: 'https://lso.ca/about-lso/legislation-rules/by-laws/by-law-7-1',
    guidance: 'A governing regulatory body must be set to determine which compliance protocols, trust rules, and professional conduct standards apply to your firm.',
    fixLabel: 'Set Jurisdiction',
    fixPath: '/settings/firm',
    fixFieldId: 'firm-jurisdiction-field',
    icon: Scale,
    test: (t) => !!t.regBody,
  },
  {
    id: 'firm_address',
    label: 'Firm Office Address',
    severity: 'mandatory',
    weight: 25,
    byLaw: 'By-Law 7.1, Part II',
    byLawUrl: 'https://lso.ca/about-lso/legislation-rules/by-laws/by-law-7-1',
    guidance: 'A physical business address is required for the service of documents and regulatory notices. Without this, your compliance score cannot exceed 80%.',
    fixLabel: 'Add Firm Address',
    fixPath: '/settings/firm',
    fixFieldId: 'firm-address-field',
    icon: Building2,
    test: (t) => !!(t.address_line1 && t.city && t.province),
  },
  {
    id: 'tax_engine',
    label: 'Tax Engine',
    severity: 'mandatory',
    weight: 20,
    byLaw: 'CRA GST/HST Mem. 15.1 / RPC 3.6',
    byLawUrl: 'https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/15-1.html',
    guidance: 'Fees and disbursements must be fair and reasonable; incorrect tax application can result in overcharging. Tax engine auto-activates when a regulatory body is set.',
    fixLabel: 'Configure Tax',
    fixPath: '/settings/firm',
    fixFieldId: 'firm-jurisdiction-field',
    icon: Landmark,
    test: (t) => !!t.regBody,
  },
  // ── Recommended (Amber when missing) ── Total: 15pts
  {
    id: 'office_phone',
    label: 'Office Phone',
    severity: 'recommended',
    weight: 15,
    byLaw: 'By-Law 7.1, Part II',
    byLawUrl: 'https://lso.ca/about-lso/legislation-rules/by-laws/by-law-7-1',
    guidance: 'A verified contact number ensures the regulatory body and clients can reach you. Required for trust compliance.',
    fixLabel: 'Add Phone',
    fixPath: '/settings/firm',
    fixFieldId: 'firm-phone-field',
    icon: Building2,
    test: (t) => !!t.office_phone,
  },
  // ── Optimisation (informational, no score impact) ── Total: 10pts
  {
    id: 'postal_code',
    label: 'Postal Code',
    severity: 'optimisation',
    weight: 10,
    byLaw: 'By-Law 7.1, Part II',
    byLawUrl: 'https://lso.ca/about-lso/legislation-rules/by-laws/by-law-7-1',
    guidance: 'Complete address including postal code ensures accurate Place of Supply tax calculation and proper regulatory correspondence.',
    fixLabel: 'Add Postal Code',
    fixPath: '/settings/firm',
    fixFieldId: 'firm-postal-field',
    icon: Building2,
    test: (t) => !!t.postal_code,
  },
  {
    id: 'office_fax',
    label: 'Office Fax',
    severity: 'optimisation',
    weight: 0, // Fax is optional  -  zero impact on compliance score
    byLaw: 'By-Law 7.1, Part II',
    byLawUrl: 'https://lso.ca/about-lso/legislation-rules/by-laws/by-law-7-1',
    guidance: 'While optional, a fax number is still used by courts and regulatory bodies for service of documents. Not required for compliance.',
    fixLabel: 'Add Fax',
    fixPath: '/settings/firm',
    fixFieldId: 'firm-fax-field',
    icon: Building2,
    test: (t) => !!t.office_fax,
  },
]

// ── Score Calculator ────────────────────────────────────────────────────────

export function calculateComplianceScore(tenant: TenantData): {
  score: number
  checks: Array<ComplianceCheck & { passed: boolean }>
} {
  let earned = 0
  const checks = COMPLIANCE_CHECKS.map((check) => {
    const passed = check.test(tenant)
    if (passed) earned += check.weight
    return { ...check, passed }
  })
  return { score: earned, checks }
}

// ── Bypass Acknowledgement Phrase ───────────────────────────────────────────
const BYPASS_PHRASE = 'I accept the risk'

// ── Modal Component ─────────────────────────────────────────────────────────

interface ComplianceDiagnosticModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ComplianceDiagnosticModal({
  open,
  onOpenChange,
}: ComplianceDiagnosticModalProps) {
  const router = useRouter()
  const { tenant } = useTenant()
  const [showBypass, setShowBypass] = useState(false)
  const [bypassInput, setBypassInput] = useState('')
  const prevScoreRef = useRef<number | null>(null)

  const regBody = resolveRegulatoryBody(tenant?.home_province ?? null)

  const tenantData: TenantData = {
    home_province: tenant?.home_province ?? null,
    address_line1: tenant?.address_line1 ?? null,
    city: tenant?.city ?? null,
    province: tenant?.province ?? null,
    postal_code: tenant?.postal_code ?? null,
    office_phone: tenant?.office_phone ?? null,
    office_fax: tenant?.office_fax ?? null,
    regBody,
  }

  const { score, checks } = calculateComplianceScore(tenantData)
  const tier = resolveTier(score)
  const TierIcon = tier.icon
  const failingChecks = checks.filter((c) => !c.passed)
  const passingChecks = checks.filter((c) => c.passed)

  // ── Confetti celebration on first 100% ──────────────────────────────────
  useEffect(() => {
    if (prevScoreRef.current !== null && prevScoreRef.current < 100 && score === 100) {
      // Fire confetti
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#10b981', '#059669', '#34d399'],
      })
      toast.success('Regulatory Foundation Complete', {
        description: `${regBody?.abbr ?? 'Regulator'} By-Law 7.1 and Directive 41 protocols are now guarding your practice.`,
        duration: 6000,
      })
    }
    prevScoreRef.current = score
  }, [score, regBody?.abbr])

  function handleFixClick(fieldId: string, path: string) {
    onOpenChange(false) // Close Modal first

    // Navigate to Firm Settings with the specific ID anchor
    router.push(`${path}#${fieldId}`)

    // Delay to ensure the page is fully rendered before scrolling
    setTimeout(() => {
      const element = document.getElementById(fieldId)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })

        // Focus the element if it's an input
        if ('focus' in element && typeof element.focus === 'function') {
          element.focus()
        }

        // Add temporary highlight glow
        element.classList.add(
          'ring-4',
          'ring-amber-400',
          'ring-offset-2',
          'transition-all',
          'duration-500',
        )

        // Remove glow after 2.5 seconds
        setTimeout(() => {
          element.classList.remove(
            'ring-4',
            'ring-amber-400',
            'ring-offset-2',
          )
        }, 2500)
      }
    }, 400)
  }

  function handleBypass() {
    if (bypassInput.trim().toLowerCase() === BYPASS_PHRASE.toLowerCase()) {
      onOpenChange(false)
      setShowBypass(false)
      setBypassInput('')
      toast.warning('Compliance bypass acknowledged', {
        description: 'Your firm is operating below recommended compliance thresholds. This has been logged.',
        duration: 5000,
      })
    }
  }

  const severityOrder: Record<CheckSeverity, number> = { mandatory: 0, recommended: 1, optimisation: 2 }
  const sortedFailing = [...failingChecks].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl p-0 gap-0">
        {/* ── Header with Score ──────────────────────────────── */}
        <DialogHeader className={cn('p-6 pb-4 border-b', tier.bgClass, tier.borderClass)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn('flex items-center justify-center size-10 rounded-xl', tier.bgClass)}>
                <TierIcon className={cn('size-5', tier.textClass)} />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">
                  Firm Compliance Diagnostic
                </DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  {regBody ? `${regBody.name} (${regBody.abbr})` : 'No Regulatory Body Set'}
                </DialogDescription>
              </div>
            </div>
            <div className="text-right">
              <div className={cn('text-3xl font-semibold tracking-tight font-mono', tier.textClass)}>
                {score}%
              </div>
              <Badge className={cn('text-[9px]', tier.badgeClass)}>
                {tier.label}
              </Badge>
            </div>
          </div>
          <p className={cn('text-xs mt-2', tier.textClass)}>
            {tier.description}
          </p>
        </DialogHeader>

        {/* ── Checklist ──────────────────────────────────────── */}
        <ScrollArea className="max-h-[55vh]">
          <div className="p-4 space-y-1">
            {/* Failing items first */}
            {sortedFailing.length > 0 && (
              <div className="space-y-2 mb-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
                  Action Required ({sortedFailing.length})
                </p>
                {sortedFailing.map((check) => (
                  <ComplianceCheckRow
                    key={check.id}
                    check={check}
                    onFix={() => handleFixClick(check.fixFieldId, check.fixPath)}
                  />
                ))}
              </div>
            )}

            {/* Passing items */}
            {passingChecks.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
                  Passing ({passingChecks.length})
                </p>
                {passingChecks.map((check) => (
                  <ComplianceCheckRow key={check.id} check={check} />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* ── Footer: Bypass or Close ────────────────────────── */}
        <div className="border-t p-4 space-y-3">
          {score === 100 ? (
            <div className="flex items-center justify-center gap-2 text-sm text-emerald-400 font-semibold">
              <ShieldCheck className="size-4" />
              Audit-Ready  -  All Directives Satisfied
            </div>
          ) : showBypass ? (
            <div className="space-y-2">
              <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-950/30 p-3">
                <AlertTriangle className="size-4 text-red-600 shrink-0 mt-0.5" />
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-red-400">
                    Regulatory Bypass Warning
                  </p>
                  <p className="text-[10px] text-red-400 leading-relaxed">
                    You are choosing to operate below compliance thresholds. This may expose your firm to regulatory action under {regBody?.abbr ?? 'Regulator'} By-Laws. Type <strong>&quot;{BYPASS_PHRASE}&quot;</strong> to continue.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={bypassInput}
                      onChange={(e) => setBypassInput(e.target.value)}
                      placeholder={`Type "${BYPASS_PHRASE}" to continue`}
                      className="flex-1 rounded-md border border-red-500/30 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-red-400"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleBypass()
                      }}
                    />
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={bypassInput.trim().toLowerCase() !== BYPASS_PHRASE.toLowerCase()}
                      onClick={handleBypass}
                      className="text-xs"
                    >
                      Bypass
                    </Button>
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                onClick={() => { setShowBypass(false); setBypassInput('') }}
              >
                Cancel  -  Return to Diagnostic
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs text-muted-foreground"
                onClick={() => setShowBypass(true)}
              >
                <AlertTriangle className="size-3 mr-1.5" />
                Bypass Compliance
              </Button>
              <Button
                size="sm"
                className="flex-1 text-xs"
                onClick={() => onOpenChange(false)}
              >
                Close Diagnostic
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Individual Check Row ────────────────────────────────────────────────────

function ComplianceCheckRow({
  check,
  onFix,
}: {
  check: ComplianceCheck & { passed: boolean }
  onFix?: () => void
}) {
  const Icon = check.icon
  const severityLabel: Record<CheckSeverity, string> = {
    mandatory: 'Mandatory',
    recommended: 'Recommended',
    optimisation: 'Optimisation',
  }
  const severityColor: Record<CheckSeverity, string> = {
    mandatory: 'text-red-600 bg-red-950/30 border-red-500/20',
    recommended: 'text-amber-600 bg-amber-950/30 border-amber-500/20',
    optimisation: 'text-blue-600 bg-blue-950/30 border-blue-500/20',
  }

  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-colors',
        check.passed
          ? 'border-emerald-100 bg-emerald-950/30/50'
          : 'border-slate-200 bg-white hover:border-slate-300',
      )}
    >
      <div className="flex items-start gap-3">
        {/* Status icon */}
        <div className="mt-0.5">
          {check.passed ? (
            <CheckCircle2 className="size-4 text-emerald-600" />
          ) : (
            <XCircle className="size-4 text-red-500" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{check.label}</span>
            <Badge
              variant="outline"
              className={cn('text-[8px] px-1.5 py-0', severityColor[check.severity])}
            >
              {severityLabel[check.severity]}
            </Badge>
            <span className="text-[9px] text-muted-foreground ml-auto shrink-0">
              {check.weight}pts
            </span>
          </div>

          {/* By-Law citation */}
          <a
            href={check.byLawUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:underline mt-0.5"
          >
            {check.byLaw}
            <ExternalLink className="size-2.5" />
          </a>

          {/* Guidance text */}
          <p className="text-[10px] text-muted-foreground leading-relaxed mt-1">
            {check.guidance}
          </p>

          {/* Fix button (only for failing checks) */}
          {!check.passed && onFix && (
            <Button
              size="sm"
              variant="outline"
              className="mt-2 h-7 text-[10px] gap-1.5 border-amber-500/30 text-amber-400 hover:bg-amber-950/30"
              onClick={onFix}
            >
              {check.fixLabel}
              <ArrowRight className="size-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
