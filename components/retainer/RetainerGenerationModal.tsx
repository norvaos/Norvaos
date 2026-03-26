'use client'

/**
 * RetainerGenerationModal — 6-Step Retainer Generation Flow
 *
 * Step 1: Matter Type + Billing Structure
 * Step 2: Scope of Services
 * Step 3: Fee Schedule
 * Step 4: Client Details + Signing Method
 * Step 5: Preview
 * Step 6: Send / Download / Sign
 *
 * Gated by a 4-gate pre-check that runs on open.
 * Uses shadcn Dialog (max-w-2xl desktop, full-screen mobile).
 */

import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  FileText,
  Download,
  Send,
  PenLine,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { checkRetainerGates } from '@/lib/services/retainer-gate-check'
import {
  useCreateRetainerAgreement,
  useUpdateRetainerAgreement,
  useLatestRetainerAgreement,
} from '@/lib/queries/retainer-agreements'
import type { Database, RetainerAgreementRow } from '@/lib/types/database'

type Matter = Database['public']['Tables']['matters']['Row']

// ── Constants ─────────────────────────────────────────────────────────────────

const BILLING_TYPE_OPTIONS = [
  { value: 'flat_fee',    label: 'Flat Fee' },
  { value: 'hourly',      label: 'Hourly' },
  { value: 'contingency', label: 'Contingency' },
  { value: 'hybrid',      label: 'Hybrid' },
]

const SIGNING_METHOD_OPTIONS = [
  { value: 'docusign',   label: 'DocuSign / E-Sign' },
  { value: 'manual',     label: 'Manual (Wet Signature)' },
  { value: 'in_person',  label: 'In-Person' },
]

const HST_RATE = 0.13

const TOTAL_STEPS = 6

const STEP_LABELS = [
  'Billing',
  'Scope',
  'Fees',
  'Client',
  'Preview',
  'Send',
]

// ── Types ─────────────────────────────────────────────────────────────────────

interface FeeLineItem {
  description: string
  quantity: number
  amount: number
}

interface ClientInfo {
  id: string
  name: string
  email: string | null
  address: string | null
  phone: string | null
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface RetainerGenerationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  matter: Matter
  tenantId: string
}

// ── Gate Check Overlay ────────────────────────────────────────────────────────

function GateCheckStep({
  matter,
  tenantId,
  onGatesPassed,
}: {
  matter: Matter
  tenantId: string
  onGatesPassed: () => void
}) {
  const supabase = createClient()

  const { data: gateResult, isLoading, error } = useQuery({
    queryKey: ['retainer_gates', matter.id],
    queryFn: () => checkRetainerGates(supabase, matter.id, tenantId),
    staleTime: 0,
    gcTime: 0,
  })

  useEffect(() => {
    if (gateResult?.passed) {
      onGatesPassed()
    }
  }, [gateResult, onGatesPassed])

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Running pre-checks…</p>
      </div>
    )
  }

  if (error || !gateResult) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-sm font-medium">Pre-check failed</p>
        <p className="text-xs text-muted-foreground">
          An error occurred while validating the retainer prerequisites.
        </p>
      </div>
    )
  }

  if (gateResult.passed) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <CheckCircle2 className="h-8 w-8 text-green-500" />
        <p className="text-sm font-medium">All checks passed</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 py-2">
      <p className="text-sm text-muted-foreground">
        The following checks must pass before generating a retainer:
      </p>
      <div className="space-y-3">
        {gateResult.gates.map(gate => (
          <div
            key={gate.id}
            className={cn(
              'flex items-start gap-3 rounded-md border p-3',
              gate.passed
                ? 'border-green-200 bg-green-50'
                : 'border-red-200 bg-red-50',
            )}
          >
            {gate.passed ? (
              <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
            )}
            <div className="space-y-0.5">
              <p className={cn('text-xs font-medium', gate.passed ? 'text-green-800' : 'text-red-800')}>
                {gate.name}
              </p>
              {!gate.passed && gate.error && (
                <>
                  <p className="text-xs text-red-700">{gate.error.message}</p>
                  <p className="text-xs text-red-600 font-medium">{gate.error.action}</p>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Step Indicator ────────────────────────────────────────────────────────────

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center gap-1 justify-center mb-6">
      {STEP_LABELS.map((label, idx) => {
        const stepNum = idx + 1
        const isDone    = stepNum < currentStep
        const isCurrent = stepNum === currentStep

        return (
          <div key={stepNum} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  'h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold transition-colors',
                  isDone    && 'bg-green-500 text-white',
                  isCurrent && 'bg-primary text-primary-foreground',
                  !isDone && !isCurrent && 'bg-muted text-muted-foreground',
                )}
              >
                {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : stepNum}
              </div>
              <span className={cn(
                'text-[9px] font-medium hidden sm:block',
                isCurrent ? 'text-primary' : 'text-muted-foreground',
              )}>
                {label}
              </span>
            </div>
            {idx < STEP_LABELS.length - 1 && (
              <div className={cn(
                'w-6 h-px mb-3.5',
                stepNum < currentStep ? 'bg-green-400' : 'bg-muted',
              )} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export function RetainerGenerationModal({
  open,
  onOpenChange,
  matter,
  tenantId,
}: RetainerGenerationModalProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  // ── Gate state ──────────────────────────────────────────────────────────
  const [gatesPassed, setGatesPassed] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)

  // ── Step 1: Billing structure ───────────────────────────────────────────
  const [billingType, setBillingType] = useState<string>(matter.billing_type ?? 'flat_fee')
  const [flatFeeAmount, setFlatFeeAmount] = useState<string>('')
  const [hourlyRate, setHourlyRate] = useState<string>('')
  const [estimatedHours, setEstimatedHours] = useState<string>('')
  const [contingencyPct, setContingencyPct] = useState<string>('')

  // ── Step 2: Scope of services ───────────────────────────────────────────
  const [scopeText, setScopeText] = useState<string>('')

  // ── Step 3: Fee schedule ────────────────────────────────────────────────
  const [feeItems, setFeeItems] = useState<FeeLineItem[]>([])
  const [hstApplicable, setHstApplicable] = useState(true)

  // ── Step 4: Client details + signing method ─────────────────────────────
  const [signingMethod, setSigningMethod] = useState<string>('manual')
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null)

  // ── Audit-Mirror Disclosure (Directive 9.2) ────────────────────────────
  const [includeAiDisclosure, setIncludeAiDisclosure] = useState(true)
  const [includeUrduDisclosure, setIncludeUrduDisclosure] = useState(false)

  // ── Step 6: Agreement ID ────────────────────────────────────────────────
  const [agreementId, setAgreementId] = useState<string | null>(null)

  const createAgreement = useCreateRetainerAgreement()
  const updateAgreement = useUpdateRetainerAgreement()

  // ── Fetch matter type for scope template ───────────────────────────────
  const { data: matterType } = useQuery({
    queryKey: ['matter_type_meta', matter.matter_type_id],
    queryFn: async () => {
      if (!matter.matter_type_id) return null
      const { data } = await supabase
        .from('matter_types')
        .select('id, name, description')
        .eq('id', matter.matter_type_id)
        .single()
      return data ?? null
    },
    enabled: !!matter.matter_type_id,
    staleTime: 5 * 60 * 1000,
  })

  // ── Fetch client contacts from matter_people ────────────────────────────
  const { data: matterPeople } = useQuery({
    queryKey: ['matter_people_clients', matter.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('matter_people')
        .select('id, first_name, last_name, email, phone, address_line1, city, province_state, postal_code, person_role, contact_id')
        .eq('matter_id', matter.id)
        .in('person_role', ['client', 'principal_applicant', 'applicant'])
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()
      return data ?? null
    },
    enabled: !!matter.id,
    staleTime: 5 * 60 * 1000,
  })

  // ── Reset when modal opens ──────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setGatesPassed(false)
      setCurrentStep(1)
      setBillingType(matter.billing_type ?? 'flat_fee')
      setFlatFeeAmount('')
      setHourlyRate('')
      setEstimatedHours('')
      setContingencyPct('')
      setScopeText('')
      setFeeItems([])
      setHstApplicable(true)
      setSigningMethod('manual')
      setClientInfo(null)
      setAgreementId(null)
    }
  }, [open, matter.billing_type])

  // ── Auto-populate scope when matter type loads ──────────────────────────
  useEffect(() => {
    if (matterType && !scopeText) {
      const defaultScope = matterType.description
        ?? `Legal services for ${matterType.name} matter, including all related applications, correspondence with government authorities, preparation of supporting documents, and legal advice.`
      setScopeText(defaultScope)
    }
  }, [matterType, scopeText])

  // ── Auto-populate client info ───────────────────────────────────────────
  useEffect(() => {
    if (matterPeople) {
      const name = [matterPeople.first_name, matterPeople.last_name].filter(Boolean).join(' ')
      const addressParts = [
        matterPeople.address_line1,
        matterPeople.city,
        matterPeople.province_state,
        matterPeople.postal_code,
      ].filter(Boolean)
      setClientInfo({
        id: matterPeople.id,
        name,
        email: matterPeople.email ?? null,
        address: addressParts.length > 0 ? addressParts.join(', ') : null,
        phone: matterPeople.phone ?? null,
      })
    }
  }, [matterPeople])

  // ── Computed fee totals ─────────────────────────────────────────────────
  const subtotalCents = Math.round(
    feeItems.reduce((sum, item) => sum + item.amount * item.quantity, 0) * 100,
  )
  const taxCents    = hstApplicable ? Math.round(subtotalCents * HST_RATE) : 0
  const totalCents  = subtotalCents + taxCents

  const formatCAD = (cents: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100)

  // ── Step 1 → 2: build initial fee items ────────────────────────────────
  const handleStep1Continue = useCallback(() => {
    const items: FeeLineItem[] = []

    if (billingType === 'flat_fee' && flatFeeAmount) {
      items.push({
        description: `${matterType?.name ?? 'Legal'} — Flat Fee`,
        quantity: 1,
        amount: parseFloat(flatFeeAmount),
      })
    } else if (billingType === 'hourly' && hourlyRate && estimatedHours) {
      items.push({
        description: 'Legal Services — Hourly',
        quantity: parseFloat(estimatedHours),
        amount: parseFloat(hourlyRate),
      })
    } else if (billingType === 'contingency' && contingencyPct) {
      items.push({
        description: `Contingency Fee — ${contingencyPct}%`,
        quantity: 1,
        amount: 0, // Contingency: amount TBD at resolution
      })
    } else if (billingType === 'hybrid') {
      if (flatFeeAmount) {
        items.push({
          description: 'Flat Fee Component',
          quantity: 1,
          amount: parseFloat(flatFeeAmount),
        })
      }
      if (hourlyRate) {
        items.push({
          description: 'Hourly Component',
          quantity: parseFloat(estimatedHours || '0'),
          amount: parseFloat(hourlyRate),
        })
      }
    }

    if (items.length > 0) {
      setFeeItems(items)
    }

    setCurrentStep(2)
  }, [billingType, flatFeeAmount, hourlyRate, estimatedHours, contingencyPct, matterType])

  // ── Create draft agreement ──────────────────────────────────────────────
  const handleCreateDraft = useCallback(async () => {
    try {
      const agreement = await createAgreement.mutateAsync({
        tenant_id: tenantId,
        matter_id: matter.id,
        billing_type: billingType,
        flat_fee_amount: flatFeeAmount ? parseFloat(flatFeeAmount) : null,
        hourly_rate: hourlyRate ? parseFloat(hourlyRate) : null,
        estimated_hours: estimatedHours ? parseFloat(estimatedHours) : null,
        contingency_pct: contingencyPct ? parseFloat(contingencyPct) : null,
        scope_of_services: scopeText,
        fee_schedule: feeItems as never,
        hst_applicable: hstApplicable,
        hst_rate: HST_RATE,
        subtotal_cents: subtotalCents,
        tax_amount_cents: taxCents,
        total_amount_cents: totalCents,
        signing_method: signingMethod,
        include_ai_disclosure: includeAiDisclosure,
        status: 'draft',
      })
      setAgreementId(agreement.id)
      return agreement.id
    } catch {
      toast.error('Failed to save retainer agreement')
      return null
    }
  }, [
    tenantId, matter.id, billingType, flatFeeAmount, hourlyRate,
    estimatedHours, contingencyPct, scopeText, feeItems, hstApplicable,
    subtotalCents, taxCents, totalCents, signingMethod, includeAiDisclosure, createAgreement,
  ])

  // ── Step 5 → 6 ─────────────────────────────────────────────────────────
  const handleGoToSend = useCallback(async () => {
    const id = agreementId ?? await handleCreateDraft()
    if (id) setCurrentStep(6)
  }, [agreementId, handleCreateDraft])

  // ── Send for e-signing ──────────────────────────────────────────────────
  const handleSendForSigning = useCallback(async () => {
    if (!agreementId) return
    await updateAgreement.mutateAsync({
      id: agreementId,
      matterId: matter.id,
      updates: {
        status: 'sent_for_signing',
        sent_at: new Date().toISOString(),
        signing_method: signingMethod,
      },
    })
    toast.success('Retainer sent for signing')
    onOpenChange(false)
  }, [agreementId, matter.id, signingMethod, updateAgreement, onOpenChange])

  // ── Mark as signed ──────────────────────────────────────────────────────
  const handleMarkSigned = useCallback(async () => {
    if (!agreementId) return
    await updateAgreement.mutateAsync({
      id: agreementId,
      matterId: matter.id,
      updates: {
        status: 'signed',
        signed_at: new Date().toISOString(),
      },
    })
    toast.success('Retainer marked as signed')
    onOpenChange(false)
  }, [agreementId, matter.id, updateAgreement, onOpenChange])

  // ── Download / Print ────────────────────────────────────────────────────
  const handleDownload = useCallback(() => {
    window.print()
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Generate Retainer Agreement
          </DialogTitle>
        </DialogHeader>

        {/* Gate check */}
        {!gatesPassed ? (
          <GateCheckStep
            matter={matter}
            tenantId={tenantId}
            onGatesPassed={() => setGatesPassed(true)}
          />
        ) : (
          <>
            <StepIndicator currentStep={currentStep} />

            {/* ── Step 1: Billing ────────────────────────────────────────── */}
            {currentStep === 1 && (
              <Step1Billing
                matter={matter}
                matterTypeName={matterType?.name ?? null}
                billingType={billingType}
                setBillingType={setBillingType}
                flatFeeAmount={flatFeeAmount}
                setFlatFeeAmount={setFlatFeeAmount}
                hourlyRate={hourlyRate}
                setHourlyRate={setHourlyRate}
                estimatedHours={estimatedHours}
                setEstimatedHours={setEstimatedHours}
                contingencyPct={contingencyPct}
                setContingencyPct={setContingencyPct}
                onContinue={handleStep1Continue}
              />
            )}

            {/* ── Step 2: Scope ──────────────────────────────────────────── */}
            {currentStep === 2 && (
              <Step2Scope
                scopeText={scopeText}
                setScopeText={setScopeText}
                onBack={() => setCurrentStep(1)}
                onContinue={() => setCurrentStep(3)}
              />
            )}

            {/* ── Step 3: Fee Schedule ───────────────────────────────────── */}
            {currentStep === 3 && (
              <Step3FeeSchedule
                feeItems={feeItems}
                setFeeItems={setFeeItems}
                hstApplicable={hstApplicable}
                setHstApplicable={setHstApplicable}
                subtotalCents={subtotalCents}
                taxCents={taxCents}
                totalCents={totalCents}
                formatCAD={formatCAD}
                onBack={() => setCurrentStep(2)}
                onContinue={() => setCurrentStep(4)}
              />
            )}

            {/* ── Step 4: Client Details ─────────────────────────────────── */}
            {currentStep === 4 && (
              <Step4ClientDetails
                clientInfo={clientInfo}
                matterId={matter.id}
                signingMethod={signingMethod}
                setSigningMethod={setSigningMethod}
                includeAiDisclosure={includeAiDisclosure}
                setIncludeAiDisclosure={setIncludeAiDisclosure}
                includeUrduDisclosure={includeUrduDisclosure}
                setIncludeUrduDisclosure={setIncludeUrduDisclosure}
                onBack={() => setCurrentStep(3)}
                onContinue={() => setCurrentStep(5)}
              />
            )}

            {/* ── Step 5: Preview ────────────────────────────────────────── */}
            {currentStep === 5 && (
              <Step5Preview
                matter={matter}
                matterTypeName={matterType?.name ?? null}
                billingType={billingType}
                scopeText={scopeText}
                feeItems={feeItems}
                hstApplicable={hstApplicable}
                subtotalCents={subtotalCents}
                taxCents={taxCents}
                totalCents={totalCents}
                clientInfo={clientInfo}
                signingMethod={signingMethod}
                includeAiDisclosure={includeAiDisclosure}
                includeUrduDisclosure={includeUrduDisclosure}
                formatCAD={formatCAD}
                onBack={() => setCurrentStep(4)}
                onContinue={handleGoToSend}
                isSaving={createAgreement.isPending}
              />
            )}

            {/* ── Step 6: Send / Download ────────────────────────────────── */}
            {currentStep === 6 && (
              <Step6Send
                signingMethod={signingMethod}
                onSendForSigning={handleSendForSigning}
                onDownload={handleDownload}
                onMarkSigned={handleMarkSigned}
                onBack={() => setCurrentStep(5)}
                isSending={updateAgreement.isPending}
              />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Step sub-components
// ══════════════════════════════════════════════════════════════════════════════

// ── Step 1 ────────────────────────────────────────────────────────────────────

function Step1Billing({
  matter,
  matterTypeName,
  billingType,
  setBillingType,
  flatFeeAmount,
  setFlatFeeAmount,
  hourlyRate,
  setHourlyRate,
  estimatedHours,
  setEstimatedHours,
  contingencyPct,
  setContingencyPct,
  onContinue,
}: {
  matter: Matter
  matterTypeName: string | null
  billingType: string
  setBillingType: (v: string) => void
  flatFeeAmount: string
  setFlatFeeAmount: (v: string) => void
  hourlyRate: string
  setHourlyRate: (v: string) => void
  estimatedHours: string
  setEstimatedHours: (v: string) => void
  contingencyPct: string
  setContingencyPct: (v: string) => void
  onContinue: () => void
}) {
  const canContinue = billingType === 'contingency'
    ? !!contingencyPct
    : billingType === 'hourly'
    ? !!hourlyRate
    : !!flatFeeAmount

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Matter Type
        </Label>
        <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
          {matterTypeName ?? matter.matter_type ?? (
            <span className="text-muted-foreground italic">Not set</span>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="billing-type">Billing Structure</Label>
        <Select value={billingType} onValueChange={setBillingType}>
          <SelectTrigger id="billing-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BILLING_TYPE_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Flat fee / hybrid flat component */}
      {(billingType === 'flat_fee' || billingType === 'hybrid') && (
        <div className="space-y-1.5">
          <Label htmlFor="flat-fee">Flat Fee Amount (CAD)</Label>
          <Input
            id="flat-fee"
            type="number"
            min="0"
            step="0.01"
            placeholder="e.g. 2500.00"
            value={flatFeeAmount}
            onChange={e => setFlatFeeAmount(e.target.value)}
          />
        </div>
      )}

      {/* Hourly */}
      {(billingType === 'hourly' || billingType === 'hybrid') && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="hourly-rate">Hourly Rate (CAD)</Label>
            <Input
              id="hourly-rate"
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 350.00"
              value={hourlyRate}
              onChange={e => setHourlyRate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="est-hours">Estimated Hours</Label>
            <Input
              id="est-hours"
              type="number"
              min="0"
              step="0.5"
              placeholder="e.g. 10"
              value={estimatedHours}
              onChange={e => setEstimatedHours(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Contingency */}
      {billingType === 'contingency' && (
        <div className="space-y-1.5">
          <Label htmlFor="contingency-pct">Contingency Percentage (%)</Label>
          <Input
            id="contingency-pct"
            type="number"
            min="0"
            max="100"
            step="0.5"
            placeholder="e.g. 25"
            value={contingencyPct}
            onChange={e => setContingencyPct(e.target.value)}
          />
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button onClick={onContinue} disabled={!canContinue} className="gap-1.5">
          Continue <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ── Step 2 ────────────────────────────────────────────────────────────────────

function Step2Scope({
  scopeText,
  setScopeText,
  onBack,
  onContinue,
}: {
  scopeText: string
  setScopeText: (v: string) => void
  onBack: () => void
  onContinue: () => void
}) {
  const wordCount = scopeText.trim().split(/\s+/).filter(Boolean).length

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="scope-text">Scope of Services</Label>
          <span className="text-[10px] text-muted-foreground">{wordCount} words</span>
        </div>
        <Textarea
          id="scope-text"
          rows={8}
          placeholder="Describe the legal services to be provided…"
          value={scopeText}
          onChange={e => setScopeText(e.target.value)}
          className="resize-none text-sm"
        />
        <p className="text-[10px] text-muted-foreground">
          Pre-populated from the matter type template. You may customise this text before proceeding.
        </p>
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack} className="gap-1.5">
          <ChevronLeft className="h-3.5 w-3.5" /> Back
        </Button>
        <Button onClick={onContinue} disabled={!scopeText.trim()} className="gap-1.5">
          Continue <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ── Step 3 ────────────────────────────────────────────────────────────────────

function Step3FeeSchedule({
  feeItems,
  setFeeItems,
  hstApplicable,
  setHstApplicable,
  subtotalCents,
  taxCents,
  totalCents,
  formatCAD,
  onBack,
  onContinue,
}: {
  feeItems: FeeLineItem[]
  setFeeItems: (items: FeeLineItem[]) => void
  hstApplicable: boolean
  setHstApplicable: (v: boolean) => void
  subtotalCents: number
  taxCents: number
  totalCents: number
  formatCAD: (cents: number) => string
  onBack: () => void
  onContinue: () => void
}) {
  const updateItem = (idx: number, field: keyof FeeLineItem, value: string) => {
    const updated = feeItems.map((item, i) => {
      if (i !== idx) return item
      if (field === 'description') return { ...item, description: value }
      const num = parseFloat(value) || 0
      return { ...item, [field]: num }
    })
    setFeeItems(updated)
  }

  const addItem = () => {
    setFeeItems([...feeItems, { description: '', quantity: 1, amount: 0 }])
  }

  const removeItem = (idx: number) => {
    setFeeItems(feeItems.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b">
              <th className="text-left py-1.5 pr-2 font-medium text-muted-foreground w-1/2">Description</th>
              <th className="text-right py-1.5 px-2 font-medium text-muted-foreground w-16">Qty</th>
              <th className="text-right py-1.5 px-2 font-medium text-muted-foreground w-24">Unit Price</th>
              <th className="text-right py-1.5 pl-2 font-medium text-muted-foreground w-24">Total</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {feeItems.map((item, idx) => (
              <tr key={idx} className="border-b border-dashed">
                <td className="py-1.5 pr-2">
                  <Input
                    value={item.description}
                    onChange={e => updateItem(idx, 'description', e.target.value)}
                    className="h-7 text-xs"
                    placeholder="Service description"
                  />
                </td>
                <td className="py-1.5 px-2">
                  <Input
                    type="number"
                    value={item.quantity}
                    onChange={e => updateItem(idx, 'quantity', e.target.value)}
                    className="h-7 text-xs text-right w-16"
                    min="0"
                    step="0.5"
                  />
                </td>
                <td className="py-1.5 px-2">
                  <Input
                    type="number"
                    value={item.amount}
                    onChange={e => updateItem(idx, 'amount', e.target.value)}
                    className="h-7 text-xs text-right w-24"
                    min="0"
                    step="0.01"
                  />
                </td>
                <td className="py-1.5 pl-2 text-right tabular-nums font-medium">
                  {formatCAD(Math.round(item.amount * item.quantity * 100))}
                </td>
                <td className="py-1.5 pl-1">
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="text-muted-foreground hover:text-destructive transition-colors p-0.5"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button variant="outline" size="sm" onClick={addItem} className="text-xs h-7">
        + Add Line Item
      </Button>

      <Separator />

      {/* Totals */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Checkbox
            id="hst-applicable"
            checked={hstApplicable}
            onCheckedChange={v => setHstApplicable(!!v)}
          />
          <Label htmlFor="hst-applicable" className="text-xs cursor-pointer">
            HST applicable (13%)
          </Label>
        </div>

        <div className="space-y-1 text-xs pt-1">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatCAD(subtotalCents)}</span>
          </div>
          {hstApplicable && (
            <div className="flex justify-between text-muted-foreground">
              <span>HST (13%)</span>
              <span className="tabular-nums">{formatCAD(taxCents)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold border-t pt-1">
            <span>Total</span>
            <span className="tabular-nums">{formatCAD(totalCents)}</span>
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack} className="gap-1.5">
          <ChevronLeft className="h-3.5 w-3.5" /> Back
        </Button>
        <Button onClick={onContinue} className="gap-1.5">
          Continue <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ── Step 4 ────────────────────────────────────────────────────────────────────

function Step4ClientDetails({
  clientInfo,
  matterId,
  signingMethod,
  setSigningMethod,
  includeAiDisclosure,
  setIncludeAiDisclosure,
  includeUrduDisclosure,
  setIncludeUrduDisclosure,
  onBack,
  onContinue,
}: {
  clientInfo: ClientInfo | null
  matterId: string
  signingMethod: string
  setSigningMethod: (v: string) => void
  includeAiDisclosure: boolean
  setIncludeAiDisclosure: (v: boolean) => void
  includeUrduDisclosure: boolean
  setIncludeUrduDisclosure: (v: boolean) => void
  onBack: () => void
  onContinue: () => void
}) {
  return (
    <div className="space-y-5">
      {/* Client info block */}
      <div className="rounded-md border bg-muted/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Client Details
          </p>
          <a
            href={clientInfo?.id ? `/matters/${matterId}?tab=details` : '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-primary flex items-center gap-1 hover:underline"
          >
            Edit in Profile <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>

        {clientInfo ? (
          <div className="space-y-1 text-sm">
            <div className="font-medium">{clientInfo.name}</div>
            {clientInfo.email && (
              <div className="text-muted-foreground text-xs">{clientInfo.email}</div>
            )}
            {clientInfo.address && (
              <div className="text-muted-foreground text-xs">{clientInfo.address}</div>
            )}
            {clientInfo.phone && (
              <div className="text-muted-foreground text-xs">{clientInfo.phone}</div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            No client contact found on this matter. Retainer will be generated without client details.
          </div>
        )}
      </div>

      {/* Signing method */}
      <div className="space-y-1.5">
        <Label htmlFor="signing-method">Signing Method</Label>
        <Select value={signingMethod} onValueChange={setSigningMethod}>
          <SelectTrigger id="signing-method">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SIGNING_METHOD_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Audit-Mirror AI Disclosure (Directive 9.2) */}
      <Separator />
      <div className="space-y-2">
        <div className="flex items-start gap-3">
          <Checkbox
            id="ai-disclosure"
            checked={includeAiDisclosure}
            onCheckedChange={(checked) => setIncludeAiDisclosure(checked === true)}
            className="mt-0.5"
          />
          <div className="space-y-1">
            <Label htmlFor="ai-disclosure" className="text-sm font-medium cursor-pointer">
              Include AI-Usage Disclosure Statement
            </Label>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Per the 2026 Federal Court guidelines, disclose AI usage in research or drafting.
              This inserts a professional clause into the retainer document.
            </p>
          </div>
        </div>
        {includeAiDisclosure && (
          <div className="ml-7 space-y-3">
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground italic leading-relaxed">
                &ldquo;Portions of this document were optimised for technical accuracy using the Norva Audit-Mirror;
                final legal verification was performed by [Lawyer Name].&rdquo;
              </p>
            </div>

            {/* Polyglot Disclosure — Urdu (Directive 15.1) */}
            <div className="flex items-start gap-3">
              <Checkbox
                id="urdu-disclosure"
                checked={includeUrduDisclosure}
                onCheckedChange={(checked) => setIncludeUrduDisclosure(checked === true)}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor="urdu-disclosure" className="text-sm font-medium cursor-pointer">
                  Include Urdu translation / اردو ترجمہ شامل کریں
                </Label>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Renders the disclosure in Urdu for bilingual clients.
                </p>
              </div>
            </div>

            {includeUrduDisclosure && (
              <div className="rounded-md border bg-muted/30 p-3" dir="rtl">
                <p className="text-xs text-muted-foreground italic leading-relaxed font-urdu">
                  &ldquo;اس دستاویز کے کچھ حصوں کو تکنیکی درستگی کے لیے Norva Audit-Mirror کے ذریعے بہتر بنایا گیا ہے؛ حتمی قانونی تصدیق [وکیل کا نام] نے انجام دی ہے۔&rdquo;
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack} className="gap-1.5">
          <ChevronLeft className="h-3.5 w-3.5" /> Back
        </Button>
        <Button onClick={onContinue} className="gap-1.5">
          Continue <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ── Step 5 ────────────────────────────────────────────────────────────────────

function Step5Preview({
  matter,
  matterTypeName,
  billingType,
  scopeText,
  feeItems,
  hstApplicable,
  subtotalCents,
  taxCents,
  totalCents,
  clientInfo,
  signingMethod,
  formatCAD,
  onBack,
  onContinue,
  isSaving,
  includeAiDisclosure,
  includeUrduDisclosure,
}: {
  matter: Matter
  matterTypeName: string | null
  billingType: string
  scopeText: string
  feeItems: FeeLineItem[]
  hstApplicable: boolean
  subtotalCents: number
  taxCents: number
  totalCents: number
  clientInfo: ClientInfo | null
  signingMethod: string
  formatCAD: (cents: number) => string
  onBack: () => void
  onContinue: () => void
  isSaving: boolean
  includeAiDisclosure: boolean
  includeUrduDisclosure: boolean
}) {
  const billingLabel = BILLING_TYPE_OPTIONS.find(o => o.value === billingType)?.label ?? billingType
  const signingLabel = SIGNING_METHOD_OPTIONS.find(o => o.value === signingMethod)?.label ?? signingMethod

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-4 space-y-4 text-xs print:border-0">

        {/* Header */}
        <div className="text-center space-y-1">
          <h2 className="text-base font-bold text-primary">RETAINER AGREEMENT</h2>
          <p className="text-muted-foreground">Draft — {new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        <Separator />

        {/* Parties */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-0.5">
            <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Client</p>
            <p className="font-medium">{clientInfo?.name ?? '—'}</p>
            {clientInfo?.email && <p className="text-muted-foreground">{clientInfo.email}</p>}
            {clientInfo?.address && <p className="text-muted-foreground">{clientInfo.address}</p>}
          </div>
          <div className="space-y-0.5">
            <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Matter</p>
            <p className="font-medium">{matter.title}</p>
            {matterTypeName && <p className="text-muted-foreground">{matterTypeName}</p>}
            <p className="text-muted-foreground">Billing: {billingLabel}</p>
          </div>
        </div>

        <Separator />

        {/* Scope */}
        <div className="space-y-1">
          <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Scope of Services</p>
          <p className="leading-relaxed whitespace-pre-wrap">{scopeText}</p>
        </div>

        <Separator />

        {/* Fee schedule */}
        <div className="space-y-2">
          <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Fee Schedule</p>
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-1 font-medium text-muted-foreground">Description</th>
                <th className="text-right py-1 font-medium text-muted-foreground">Qty</th>
                <th className="text-right py-1 font-medium text-muted-foreground">Unit</th>
                <th className="text-right py-1 font-medium text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {feeItems.map((item, idx) => (
                <tr key={idx} className="border-b border-dashed">
                  <td className="py-1">{item.description}</td>
                  <td className="py-1 text-right tabular-nums">{item.quantity}</td>
                  <td className="py-1 text-right tabular-nums">{formatCAD(Math.round(item.amount * 100))}</td>
                  <td className="py-1 text-right tabular-nums">{formatCAD(Math.round(item.amount * item.quantity * 100))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="space-y-0.5 pt-1 text-right">
            <div className="flex justify-end gap-8 text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums w-24">{formatCAD(subtotalCents)}</span>
            </div>
            {hstApplicable && (
              <div className="flex justify-end gap-8 text-muted-foreground">
                <span>HST (13%)</span>
                <span className="tabular-nums w-24">{formatCAD(taxCents)}</span>
              </div>
            )}
            <div className="flex justify-end gap-8 font-bold border-t pt-1">
              <span>Total</span>
              <span className="tabular-nums w-24">{formatCAD(totalCents)}</span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Signing method */}
        <div className="flex items-center gap-2 text-muted-foreground">
          <PenLine className="h-3.5 w-3.5 shrink-0" />
          <span>Signing method: <strong className="text-foreground">{signingLabel}</strong></span>
        </div>

        {/* AI-Usage Disclosure (Directive 9.2 + 15.1 Polyglot) */}
        {includeAiDisclosure && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">AI-Usage Disclosure</p>
              <p className="leading-relaxed text-muted-foreground italic">
                Portions of this document were optimised for technical accuracy using the Norva
                Audit-Mirror; final legal verification was performed by [Lawyer Name].
              </p>
              {includeUrduDisclosure && (
                <p className="leading-relaxed text-muted-foreground italic pt-1" dir="rtl">
                  اس دستاویز کے کچھ حصوں کو تکنیکی درستگی کے لیے Norva Audit-Mirror کے ذریعے بہتر بنایا گیا ہے؛ حتمی قانونی تصدیق [وکیل کا نام] نے انجام دی ہے۔
                </p>
              )}
            </div>
          </>
        )}

        {/* Signature blocks */}
        <div className="grid grid-cols-2 gap-8 pt-4">
          <div className="space-y-6">
            <p className="font-medium text-muted-foreground text-[10px] uppercase tracking-wide">Client Signature</p>
            <div className="border-b border-foreground/40 pb-1 min-h-[32px]" />
            <p className="text-muted-foreground">{clientInfo?.name ?? '___________________________'}</p>
            <p className="text-muted-foreground">Date: _________________</p>
          </div>
          <div className="space-y-6">
            <p className="font-medium text-muted-foreground text-[10px] uppercase tracking-wide">Lawyer Signature</p>
            <div className="border-b border-foreground/40 pb-1 min-h-[32px]" />
            <p className="text-muted-foreground">___________________________</p>
            <p className="text-muted-foreground">Date: _________________</p>
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-2 gap-2">
        <Button variant="outline" onClick={onBack} className="gap-1.5">
          <ChevronLeft className="h-3.5 w-3.5" /> Edit Previous Steps
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()} className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> Download PDF
          </Button>
          <Button onClick={onContinue} disabled={isSaving} className="gap-1.5">
            {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Proceed to Send <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Step 6 ────────────────────────────────────────────────────────────────────

function Step6Send({
  signingMethod,
  onSendForSigning,
  onDownload,
  onMarkSigned,
  onBack,
  isSending,
}: {
  signingMethod: string
  onSendForSigning: () => void
  onDownload: () => void
  onMarkSigned: () => void
  onBack: () => void
  isSending: boolean
}) {
  const isESign = signingMethod === 'docusign'
  const isManual = signingMethod === 'manual' || signingMethod === 'in_person'

  return (
    <div className="space-y-6">
      <div className="rounded-md border bg-muted/30 p-4 text-center space-y-2">
        <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto" />
        <p className="text-sm font-medium">Retainer Agreement Ready</p>
        <p className="text-xs text-muted-foreground">
          The retainer has been saved as a draft. Choose how to proceed with signing.
        </p>
      </div>

      <div className="space-y-3">
        {isESign && (
          <Button
            className="w-full gap-2"
            onClick={onSendForSigning}
            disabled={isSending}
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send for Signature (DocuSign)
          </Button>
        )}

        {isManual && (
          <>
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={onDownload}
            >
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
            <Button
              variant="secondary"
              className="w-full gap-2"
              onClick={onMarkSigned}
              disabled={isSending}
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PenLine className="h-4 w-4" />
              )}
              Mark as Signed
            </Button>
          </>
        )}
      </div>

      <div className="flex justify-start">
        <Button variant="ghost" onClick={onBack} className="gap-1.5 text-xs text-muted-foreground">
          <ChevronLeft className="h-3.5 w-3.5" /> Back to Preview
        </Button>
      </div>
    </div>
  )
}
