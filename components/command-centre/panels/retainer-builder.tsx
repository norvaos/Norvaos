'use client'

import { useState, useMemo, useCallback, useEffect, useRef, Fragment } from 'react'
import { RequirePermission } from '@/components/require-permission'
import { useCommandCentre } from '../command-centre-context'
import {
  useLeadRetainerPackages,
  useSaveRetainerPackage,
  useRecordRetainerPayment,
} from '@/lib/queries/lead-workflow'
import {
  useSigningRequestsForLead,
  useSendRetainerForESign,
  useResendLeadESign,
  useCancelLeadESign,
  useSendESignReminder,
  type SigningRequest,
} from '@/lib/queries/esign'
import {
  BILLING_TYPES,
  PAYMENT_MILESTONES,
} from '@/lib/utils/constants'
import {
  useRetainerPresets,
  useCreateRetainerPreset,
  retainerPresetKeys,
} from '@/lib/queries/retainer-presets'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip'
import {
  DollarSign,
  Plus,
  Trash2,
  Receipt,
  CreditCard,
  Loader2,
  FileSignature,
  CheckCircle2,
  CalendarDays,
  Landmark,
  Briefcase,
  Search,
  Check,
  ChevronDown,
  RotateCcw,
  Bell,
  Download,
  XCircle,
  Bookmark,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { SigningRequestDetailSheet } from '@/components/esign/signing-request-detail-sheet'

// ─── Types ──────────────────────────────────────────────────────────

interface LineItem {
  id: string
  description: string
  quantity: number
  unitPrice: number // dollars
}

interface FeeItem {
  id: string
  description: string
  amount: number // dollars
}

type DueType = 'date' | 'milestone'

interface InstallmentConfig {
  amount: number
  dueType: DueType
  dueDate: string
  milestone: string
}

type RetainerState = 'draft' | 'saved' | 'sent' | 'viewed' | 'signed' | 'paid'

function newLineItem(): LineItem {
  return { id: crypto.randomUUID(), description: '', quantity: 1, unitPrice: 0 }
}

function newFeeItem(): FeeItem {
  return { id: crypto.randomUUID(), description: '', amount: 0 }
}

// ─── Constants ──────────────────────────────────────────────────────

const HST_RATE = 0.13

// ─── Retainer Timeline Sub-Component ────────────────────────────────

function RetainerTimeline({
  state,
  pkg,
  signingReq,
}: {
  state: RetainerState
  pkg: Record<string, unknown> | null
  signingReq: SigningRequest | null
}) {
  const steps = [
    { key: 'saved' as const, label: 'Draft', timestamp: pkg?.created_at as string | undefined },
    { key: 'sent' as const, label: 'Sent', timestamp: pkg?.sent_at as string | undefined },
    { key: 'viewed' as const, label: 'Viewed', timestamp: signingReq?.viewed_at ?? undefined },
    { key: 'signed' as const, label: 'Signed', timestamp: (signingReq?.signed_at ?? pkg?.signed_at) as string | undefined },
    { key: 'paid' as const, label: 'Payment', timestamp: pkg?.payment_received_at as string | undefined },
  ]

  const stateOrder: RetainerState[] = ['draft', 'saved', 'sent', 'viewed', 'signed', 'paid']
  const currentIndex = stateOrder.indexOf(state)

  return (
    <div className="flex items-center gap-1 py-3 px-1">
      {steps.map((step, i) => {
        const stepIndex = stateOrder.indexOf(step.key)
        const isCompleted = stepIndex <= currentIndex && stepIndex >= 0
        const isCurrent = step.key === state

        return (
          <Fragment key={step.key}>
            {i > 0 && (
              <div className={cn('flex-1 h-0.5', isCompleted ? 'bg-green-400' : 'bg-slate-200')} />
            )}
            <div className="flex flex-col items-center gap-0.5">
              <div
                className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium',
                  isCompleted
                    ? 'bg-green-100 text-green-700'
                    : isCurrent
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-slate-100 text-slate-400'
                )}
              >
                {isCompleted ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span className={cn('text-[9px]', isCompleted ? 'text-green-700' : 'text-slate-400')}>
                {step.label}
              </span>
              {step.timestamp && (
                <span className="text-[8px] text-slate-400">
                  {new Date(step.timestamp).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}

// ─── Preset Picker Sub-Component ────────────────────────────────────

function PresetPicker<T extends { name: string; description?: string | null }>({
  presets,
  isAdded,
  onToggle,
  triggerLabel,
  triggerColor,
  disabled,
}: {
  presets: readonly T[]
  isAdded: (name: string) => boolean
  onToggle: (preset: T) => void
  triggerLabel: string
  triggerColor: string
  disabled?: boolean
}) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

  const filtered = useMemo(() => {
    if (!search.trim()) return presets
    const q = search.toLowerCase()
    return presets.filter((p) => p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q)))
  }, [presets, search])

  const addedCount = presets.filter((p) => isAdded(p.name)).length

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('h-7 text-xs gap-1.5', triggerColor)}
          disabled={disabled}
        >
          <ChevronDown className="h-3 w-3" />
          {triggerLabel}
          {addedCount > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px] ml-0.5">
              {addedCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0"
        align="end"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Search */}
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              className="h-8 text-xs pl-8"
              placeholder="Search presets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="max-h-64 overflow-y-auto py-1">
          {presets.length === 0 && !search.trim() && (
            <p className="text-xs text-slate-400 text-center py-4 px-3">
              No presets yet. Add them in Settings → Retainer Presets.
            </p>
          )}
          {presets.length > 0 && filtered.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-4">No matching presets</p>
          )}
          {filtered.map((preset) => {
            const added = isAdded(preset.name)
            const amount =
              'unitPrice' in preset
                ? (preset as unknown as { unitPrice: number }).unitPrice
                : (preset as unknown as { amount: number }).amount
            return (
              <button
                key={preset.name}
                type="button"
                onClick={() => onToggle(preset)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 transition-colors',
                  added && 'bg-slate-50'
                )}
              >
                <div
                  className={cn(
                    'h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                    added ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300'
                  )}
                >
                  {added && <Check className="h-3 w-3" />}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-slate-700 truncate block">{preset.name}</span>
                  {preset.description && (
                    <span className="text-[10px] text-slate-400 leading-tight truncate block">{preset.description}</span>
                  )}
                </div>
                <span className="text-xs text-slate-400 shrink-0 font-medium">
                  ${amount.toLocaleString()}
                </span>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ─── Component (billing:view gated) ─────────────────────────────────

export function RetainerBuilder() {
  return (
    <RequirePermission entity="billing" action="view" variant="inline">
      <RetainerBuilderContent />
    </RequirePermission>
  )
}

function RetainerBuilderContent() {
  const { tenantId, lead, contact } = useCommandCentre()
  const queryClient = useQueryClient()

  // ── Fetch DB-backed fee presets ───────────────────────────────────
  const { data: dbPresets = [], isLoading: presetsLoading } = useRetainerPresets(tenantId)
  const createPreset = useCreateRetainerPreset()

  // Split by category, convert cents → dollars for UI compatibility
  const servicePresets = useMemo(() =>
    dbPresets.filter(p => p.category === 'professional_services')
      .map(p => ({ name: p.name, description: p.description, unitPrice: p.amount / 100 })),
    [dbPresets]
  )
  const govFeePresets = useMemo(() =>
    dbPresets.filter(p => p.category === 'government_fees')
      .map(p => ({ name: p.name, description: p.description, amount: p.amount / 100 })),
    [dbPresets]
  )
  const disbursementPresets = useMemo(() =>
    dbPresets.filter(p => p.category === 'disbursements')
      .map(p => ({ name: p.name, description: p.description, amount: p.amount / 100 })),
    [dbPresets]
  )

  // Auto-seed defaults if tenant has no presets yet
  const seededRef = useRef(false)
  useEffect(() => {
    if (!presetsLoading && dbPresets.length === 0 && tenantId && !seededRef.current) {
      seededRef.current = true
      fetch('/api/settings/retainer-presets/seed-defaults', { method: 'POST' })
        .then(() => queryClient.invalidateQueries({ queryKey: retainerPresetKeys.all }))
        .catch(() => {}) // silent — user can always add manually
    }
  }, [presetsLoading, dbPresets.length, tenantId, queryClient])

  // ── Fetch existing retainer package ──────────────────────────────
  const { data: retainerPackages } = useLeadRetainerPackages(lead?.id ?? '')
  // Skip cancelled packages — after cancel + recreate, the newest active package should be used
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingPackage = (retainerPackages as any[])?.find((p: any) => p.status !== 'cancelled') ?? null

  // ── Fetch signing requests for this lead ─────────────────────────
  const { data: signingRequests } = useSigningRequestsForLead(lead?.id ?? '')

  // ── Mutations ────────────────────────────────────────────────────
  const saveRetainer = useSaveRetainerPackage()
  const sendForESign = useSendRetainerForESign()
  const resendESign = useResendLeadESign()
  const cancelESign = useCancelLeadESign()
  const sendReminder = useSendESignReminder()
  const recordPayment = useRecordRetainerPayment()

  // ── Find the active signing request (newest non-superseded) ──────
  const activeSigningReq = useMemo(() => {
    if (!signingRequests?.length) return null
    return signingRequests.find((r) => r.status !== 'superseded') ?? null
  }, [signingRequests])

  // ── Derive retainer state ────────────────────────────────────────
  const retainerState = useMemo((): RetainerState => {
    if (!existingPackage) return 'draft' // No package yet
    const status = (existingPackage as Record<string, unknown>).status as string | undefined
    const paymentStatus = (existingPackage as Record<string, unknown>).payment_status as string | undefined
    if (paymentStatus === 'paid') return 'paid'
    if (status === 'signed' || status === 'fully_retained') return 'signed'
    if (status === 'sent' && activeSigningReq) {
      if (activeSigningReq.status === 'signed') return 'signed'
      if (activeSigningReq.status === 'viewed') return 'viewed'
      return 'sent'
    }
    if (status === 'sent') return 'sent'
    return 'saved' // Package exists but not sent
  }, [existingPackage, activeSigningReq])

  // Whether form should be read-only (once sent, no more edits)
  const isReadOnly = retainerState !== 'draft' && retainerState !== 'saved'

  // ── Form state ───────────────────────────────────────────────────
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [billingType, setBillingType] = useState('flat_fee')
  const [paymentTerms, setPaymentTerms] = useState('Due upon receipt')
  const [hstApplicable, setHstApplicable] = useState(false)
  const [govFees, setGovFees] = useState<FeeItem[]>([])
  const [disbursements, setDisbursements] = useState<FeeItem[]>([])
  const [paymentPlanEnabled, setPaymentPlanEnabled] = useState(false)
  const [numPayments, setNumPayments] = useState(2)
  const [splitMode, setSplitMode] = useState<'equal' | 'manual'>('equal')
  const [installmentConfigs, setInstallmentConfigs] = useState<InstallmentConfig[]>([])

  // ── Payment dialog state ─────────────────────────────────────────
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('e_transfer')
  const [paymentRef, setPaymentRef] = useState('')

  // ── E-sign dialog state ──────────────────────────────────────────
  const [esignDialogOpen, setEsignDialogOpen] = useState(false)
  const [esignSignerName, setEsignSignerName] = useState('')
  const [esignSignerEmail, setEsignSignerEmail] = useState('')
  const [esignSending, setEsignSending] = useState(false)
  /** Include Use of Representative (IMM5476E) with the retainer package */
  const [includeUseOfRep, setIncludeUseOfRep] = useState(true)

  // ── E-sign detail sheet state ────────────────────────────────────
  const [detailSheetRequestId, setDetailSheetRequestId] = useState<string | null>(null)
  const [detailSheetOpen, setDetailSheetOpen] = useState(false)

  // ── Load saved data on mount ─────────────────────────────────────
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (existingPackage && !hasLoadedRef.current) {
      hasLoadedRef.current = true
      const pkg = existingPackage as Record<string, unknown>
      const li: Array<Record<string, unknown>> = Array.isArray(pkg.line_items) ? pkg.line_items : []
      const gf: Array<Record<string, unknown>> = Array.isArray(pkg.government_fees) ? pkg.government_fees : []
      const db: Array<Record<string, unknown>> = Array.isArray(pkg.disbursements) ? pkg.disbursements : []

      setLineItems(
        li.map((i) => ({
          id: crypto.randomUUID(),
          description: (i.description as string) ?? '',
          quantity: (i.quantity as number) ?? 1,
          unitPrice: (i.unitPrice as number) ?? 0,
        }))
      )
      setGovFees(
        gf.map((g) => ({
          id: crypto.randomUUID(),
          description: (g.description as string) ?? '',
          amount: (g.amount as number) ?? 0,
        }))
      )
      setDisbursements(
        db.map((d) => ({
          id: crypto.randomUUID(),
          description: (d.description as string) ?? '',
          amount: (d.amount as number) ?? 0,
        }))
      )

      setBillingType((pkg.billing_type as string) ?? 'flat_fee')
      setHstApplicable((pkg.hst_applicable as boolean) ?? false)
      setPaymentTerms((pkg.payment_terms as string) ?? 'Due upon receipt')

      const plan = pkg.payment_plan as InstallmentConfig[] | null
      if (plan && Array.isArray(plan) && plan.length > 0) {
        setPaymentPlanEnabled(true)
        setNumPayments(plan.length)
        setInstallmentConfigs(plan)
      }
    }
  }, [existingPackage])

  // ── Calculated totals ─────────────────────────────────────────────
  const feesSubtotal = useMemo(
    () => lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    [lineItems]
  )

  const govFeesTotal = useMemo(
    () => govFees.reduce((sum, g) => sum + g.amount, 0),
    [govFees]
  )

  const disbursementsTotal = useMemo(
    () => disbursements.reduce((sum, d) => sum + d.amount, 0),
    [disbursements]
  )

  const subtotalBeforeTax = feesSubtotal + govFeesTotal + disbursementsTotal
  const hstAmount = hstApplicable ? subtotalBeforeTax * HST_RATE : 0
  const grandTotal = subtotalBeforeTax + hstAmount

  // ── Initialize installment configs ────────────────────────────────
  useEffect(() => {
    if (!paymentPlanEnabled) return
    const baseDate = new Date()
    setInstallmentConfigs((prev) => {
      return Array.from({ length: numPayments }, (_, i) => {
        if (prev[i]) return prev[i]
        const due = new Date(baseDate)
        due.setDate(due.getDate() + 30 * i)
        return {
          amount: splitMode === 'equal' ? grandTotal / numPayments : 0,
          dueType: 'date' as DueType,
          dueDate: due.toISOString().split('T')[0],
          milestone: '',
        }
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentPlanEnabled, numPayments])

  // Recalculate equal amounts when total changes
  useEffect(() => {
    if (!paymentPlanEnabled || splitMode !== 'equal') return
    setInstallmentConfigs((prev) =>
      prev.map((inst) => ({ ...inst, amount: grandTotal / numPayments }))
    )
  }, [grandTotal, numPayments, splitMode, paymentPlanEnabled])

  // ── Line item handlers ──────────────────────────────────────────
  const addLineItem = () => setLineItems((prev) => [...prev, newLineItem()])
  const removeLineItem = (id: string) =>
    setLineItems((prev) => prev.filter((li) => li.id !== id))
  const updateLineItem = (id: string, field: keyof LineItem, value: string | number) =>
    setLineItems((prev) => prev.map((li) => (li.id === id ? { ...li, [field]: value } : li)))

  // ── Gov fee handlers ───────────────────────────────────────────
  const removeGovFee = (id: string) =>
    setGovFees((prev) => prev.filter((g) => g.id !== id))
  const updateGovFee = (id: string, field: keyof FeeItem, value: string | number) =>
    setGovFees((prev) => prev.map((g) => (g.id === id ? { ...g, [field]: value } : g)))

  // ── Disbursement handlers ────────────────────────────────────────
  const removeDisbursement = (id: string) =>
    setDisbursements((prev) => prev.filter((d) => d.id !== id))
  const updateDisbursement = (id: string, field: keyof FeeItem, value: string | number) =>
    setDisbursements((prev) => prev.map((d) => (d.id === id ? { ...d, [field]: value } : d)))

  // ── Preset toggle helpers ───────────────────────────────────────
  const isServiceAdded = (name: string) => lineItems.some((li) => li.description === name)
  const isGovFeeAdded = (name: string) => govFees.some((g) => g.description === name)
  const isDisbursementAdded = (name: string) => disbursements.some((d) => d.description === name)

  const toggleServicePreset = (preset: { name: string; description?: string | null; unitPrice: number }) => {
    if (isServiceAdded(preset.name)) {
      setLineItems((prev) => prev.filter((li) => li.description !== preset.name))
    } else {
      setLineItems((prev) => [
        ...prev,
        { id: crypto.randomUUID(), description: preset.name, quantity: 1, unitPrice: preset.unitPrice },
      ])
    }
  }

  const toggleGovFeePreset = (preset: { name: string; description?: string | null; amount: number }) => {
    if (isGovFeeAdded(preset.name)) {
      setGovFees((prev) => prev.filter((g) => g.description !== preset.name))
    } else {
      setGovFees((prev) => [
        ...prev,
        { id: crypto.randomUUID(), description: preset.name, amount: preset.amount },
      ])
    }
  }

  const toggleDisbursementPreset = (preset: { name: string; description?: string | null; amount: number }) => {
    if (isDisbursementAdded(preset.name)) {
      setDisbursements((prev) => prev.filter((d) => d.description !== preset.name))
    } else {
      setDisbursements((prev) => [
        ...prev,
        { id: crypto.randomUUID(), description: preset.name, amount: preset.amount },
      ])
    }
  }

  // ── Save retainer ─────────────────────────────────────────────────
  const handleSaveRetainer = useCallback(async () => {
    if (!lead) return

    const validFeeItems = lineItems.filter((li) => li.description.trim() && li.unitPrice > 0)
    const validGovFees = govFees.filter((g) => g.description.trim() && g.amount > 0)
    const validDisbursements = disbursements.filter((d) => d.description.trim() && d.amount > 0)

    if (validFeeItems.length === 0 && validGovFees.length === 0 && validDisbursements.length === 0) {
      toast.error('Add at least one fee item')
      return
    }

    saveRetainer.mutate({
      leadId: lead.id,
      tenantId,
      billingType,
      lineItems: validFeeItems.map((li) => ({ description: li.description, quantity: li.quantity, unitPrice: li.unitPrice })),
      governmentFees: validGovFees.map((g) => ({ description: g.description, amount: g.amount })),
      disbursements: validDisbursements.map((d) => ({ description: d.description, amount: d.amount })),
      hstApplicable,
      subtotalCents: Math.round(feesSubtotal * 100) + Math.round(govFeesTotal * 100) + Math.round(disbursementsTotal * 100),
      taxAmountCents: Math.round(hstAmount * 100),
      totalAmountCents: Math.round(grandTotal * 100),
      paymentTerms,
      paymentPlan: paymentPlanEnabled ? installmentConfigs : null,
      existingPackageId: (existingPackage as Record<string, unknown> | null)?.id as string ?? null,
    })
  }, [
    lead, lineItems, govFees, disbursements, billingType, hstApplicable,
    feesSubtotal, govFeesTotal, disbursementsTotal, hstAmount, grandTotal,
    paymentTerms, paymentPlanEnabled, installmentConfigs, existingPackage,
    tenantId, saveRetainer,
  ])

  // ── Send for E-Sign ──────────────────────────────────────────────
  const handleSendForESign = useCallback(async () => {
    if (!lead?.id || !existingPackage || !esignSignerName.trim() || !esignSignerEmail.trim()) return
    const pkgId = (existingPackage as Record<string, unknown>).id as string
    if (!pkgId) return

    setEsignSending(true)
    try {
      await sendForESign.mutateAsync({
        retainerPackageId: pkgId,
        leadId: lead.id,
        signerName: esignSignerName.trim(),
        signerEmail: esignSignerEmail.trim(),
        signerContactId: contact?.id ?? null,
      })
      setEsignDialogOpen(false)
    } catch {
      // Error handled by mutation onError
    } finally {
      setEsignSending(false)
    }
  }, [lead, existingPackage, esignSignerName, esignSignerEmail, contact, sendForESign])

  // ── Open E-Sign dialog ───────────────────────────────────────────
  const openESignDialog = useCallback(() => {
    setEsignSignerName(
      contact ? `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() : ''
    )
    setEsignSignerEmail((contact as Record<string, string> | null)?.email ?? '')
    setEsignDialogOpen(true)
  }, [contact])

  // ── Record payment ───────────────────────────────────────────────
  const handleRecordPayment = useCallback(async () => {
    if (!lead?.id || !existingPackage || !paymentAmount) return
    const pkgId = (existingPackage as Record<string, unknown>).id as string
    if (!pkgId) return

    recordPayment.mutate({
      leadId: lead.id,
      retainerPackageId: pkgId,
      amount: Math.round(parseFloat(paymentAmount) * 100),
      paymentMethod,
      reference: paymentRef || undefined,
    }, {
      onSuccess: () => {
        setPaymentDialogOpen(false)
        setPaymentAmount('')
        setPaymentRef('')
      },
    })
  }, [lead, existingPackage, paymentAmount, paymentMethod, paymentRef, recordPayment])

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-slate-700">
            <Receipt className="h-4 w-4" />
            Retainer Builder
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {billingType ? BILLING_TYPES.find((bt) => bt.value === billingType)?.label ?? billingType : 'Flat Fee'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* ─── Retainer Timeline ──────────────────────────────────── */}
        {retainerState !== 'draft' && (
          <RetainerTimeline
            state={retainerState}
            pkg={existingPackage as Record<string, unknown> | null}
            signingReq={activeSigningReq}
          />
        )}

        {/* ─── Action Row (fee editing only — lifecycle actions are in the Retainer Action Hub above) ── */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Save Retainer - available in draft/saved states */}
          {(retainerState === 'draft' || retainerState === 'saved') && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    onClick={handleSaveRetainer}
                    disabled={saveRetainer.isPending || lineItems.length === 0}
                  >
                    {saveRetainer.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Receipt className="h-3.5 w-3.5" />
                    )}
                    Save Retainer
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Saves the fee breakdown. Send, sign, and payment actions are in the Retainer card above.</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Read-only state indicator */}
          {isReadOnly && (
            <Badge variant="secondary" className="text-[10px] h-7 gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {retainerState === 'sent' || retainerState === 'viewed' ? 'Sent — fees locked' : ''}
              {retainerState === 'signed' ? 'Signed — fees locked' : ''}
              {retainerState === 'paid' ? 'Fully retained' : ''}
            </Badge>
          )}
        </div>

        {/* Signing request info line */}
        {activeSigningReq && activeSigningReq.status !== 'superseded' && (
          <button
            type="button"
            className="text-[10px] text-slate-400 truncate hover:text-slate-600 transition-colors cursor-pointer text-left"
            onClick={() => {
              setDetailSheetRequestId(activeSigningReq.id)
              setDetailSheetOpen(true)
            }}
          >
            {activeSigningReq.signer_name}
            {activeSigningReq.signed_at && ` \u2022 Signed ${new Date(activeSigningReq.signed_at).toLocaleDateString()}`}
            {activeSigningReq.status === 'declined' && activeSigningReq.decline_reason && ` \u2022 ${activeSigningReq.decline_reason}`}
            {activeSigningReq.reminder_count > 0 && ` \u2022 ${activeSigningReq.reminder_count} reminder(s)`}
          </button>
        )}

        <Separator />

        {/* Billing type */}
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500">Billing Type</Label>
          <Select value={billingType} onValueChange={setBillingType} disabled={isReadOnly}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BILLING_TYPES.map((bt) => (
                <SelectItem key={bt.value} value={bt.value}>
                  {bt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* ─── Professional Fees ────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5" />
              Professional Fees
              {feesSubtotal > 0 && (
                <span className="text-slate-400 font-normal">
                  — ${feesSubtotal.toLocaleString()}
                </span>
              )}
            </p>
            {!isReadOnly && (
              <div className="flex items-center gap-1">
                <PresetPicker
                  presets={servicePresets}
                  isAdded={isServiceAdded}
                  onToggle={toggleServicePreset}
                  triggerLabel="Quick Add"
                  triggerColor="text-blue-600 hover:text-blue-700"
                  disabled={isReadOnly}
                />
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={addLineItem} disabled={isReadOnly}>
                  <Plus className="h-3 w-3" />
                  Custom
                </Button>
              </div>
            )}
          </div>

          {/* Editable line items */}
          {lineItems.length > 0 ? (
            <div className="space-y-1.5">
              {lineItems.map((item) => (
                <div key={item.id} className="flex items-center gap-2 group">
                  <Input
                    className="h-8 text-xs flex-1"
                    placeholder="Description..."
                    value={item.description}
                    onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                    disabled={isReadOnly}
                  />
                  <Input
                    type="number"
                    className="h-8 text-xs w-14"
                    placeholder="Qty"
                    value={item.quantity || ''}
                    onChange={(e) => updateLineItem(item.id, 'quantity', parseInt(e.target.value) || 0)}
                    disabled={isReadOnly}
                  />
                  <div className="relative w-24">
                    <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                    <Input
                      type="number"
                      className="h-8 text-xs pl-7"
                      placeholder="Price"
                      value={item.unitPrice || ''}
                      onChange={(e) => updateLineItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                      disabled={isReadOnly}
                    />
                  </div>
                  <span className="text-xs text-slate-500 w-20 text-right tabular-nums">
                    ${(item.quantity * item.unitPrice).toLocaleString()}
                  </span>
                  {!isReadOnly && (
                    <>
                      {item.description && item.unitPrice > 0 && !servicePresets.some(p => p.name === item.description) && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-slate-400 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => createPreset.mutate({
                                  tenant_id: tenantId,
                                  user_id: '', // audit only
                                  category: 'professional_services',
                                  name: item.description,
                                  amount: Math.round(item.unitPrice * 100),
                                })}
                              >
                                <Bookmark className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Save as preset — will appear in Quick Add</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeLineItem(item.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic py-1">
              {isReadOnly ? 'No professional fees' : 'Use Quick Add or add a custom item'}
            </p>
          )}
        </div>

        <Separator />

        {/* ─── Government Fees ──────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
              <Landmark className="h-3.5 w-3.5" />
              Government Fees
              {govFeesTotal > 0 && (
                <span className="text-slate-400 font-normal">
                  — ${govFeesTotal.toLocaleString()}
                </span>
              )}
            </p>
            {!isReadOnly && (
              <div className="flex items-center gap-1">
                <PresetPicker
                  presets={govFeePresets}
                  isAdded={isGovFeeAdded}
                  onToggle={toggleGovFeePreset}
                  triggerLabel="Quick Add"
                  triggerColor="text-amber-600 hover:text-amber-700"
                  disabled={isReadOnly}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setGovFees((prev) => [...prev, newFeeItem()])}
                  disabled={isReadOnly}
                >
                  <Plus className="h-3 w-3" />
                  Custom
                </Button>
              </div>
            )}
          </div>

          {/* Editable gov fee items */}
          {govFees.length > 0 ? (
            <div className="space-y-1.5">
              {govFees.map((g) => (
                <div key={g.id} className="flex items-center gap-2 group">
                  <Input
                    className="h-8 text-xs flex-1"
                    placeholder="Fee description..."
                    value={g.description}
                    onChange={(e) => updateGovFee(g.id, 'description', e.target.value)}
                    disabled={isReadOnly}
                  />
                  <div className="relative w-24">
                    <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                    <Input
                      type="number"
                      className="h-8 text-xs pl-7"
                      placeholder="Amount"
                      value={g.amount || ''}
                      onChange={(e) => updateGovFee(g.id, 'amount', parseFloat(e.target.value) || 0)}
                      disabled={isReadOnly}
                    />
                  </div>
                  {!isReadOnly && (
                    <>
                      {g.description && g.amount > 0 && !govFeePresets.some(p => p.name === g.description) && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-slate-400 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => createPreset.mutate({
                                  tenant_id: tenantId,
                                  user_id: '',
                                  category: 'government_fees',
                                  name: g.description,
                                  amount: Math.round(g.amount * 100),
                                })}
                              >
                                <Bookmark className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Save as preset — will appear in Quick Add</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeGovFee(g.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic py-1">
              {isReadOnly ? 'No government fees' : 'Use Quick Add or add a custom fee'}
            </p>
          )}
        </div>

        <Separator />

        {/* ─── Disbursements ────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
              <Receipt className="h-3.5 w-3.5" />
              Disbursements
              {disbursementsTotal > 0 && (
                <span className="text-slate-400 font-normal">
                  — ${disbursementsTotal.toLocaleString()}
                </span>
              )}
            </p>
            {!isReadOnly && (
              <div className="flex items-center gap-1">
                <PresetPicker
                  presets={disbursementPresets}
                  isAdded={isDisbursementAdded}
                  onToggle={toggleDisbursementPreset}
                  triggerLabel="Quick Add"
                  triggerColor="text-purple-600 hover:text-purple-700"
                  disabled={isReadOnly}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setDisbursements((prev) => [...prev, newFeeItem()])}
                  disabled={isReadOnly}
                >
                  <Plus className="h-3 w-3" />
                  Custom
                </Button>
              </div>
            )}
          </div>

          {/* Editable disbursement items */}
          {disbursements.length > 0 ? (
            <div className="space-y-1.5">
              {disbursements.map((d) => (
                <div key={d.id} className="flex items-center gap-2 group">
                  <Input
                    className="h-8 text-xs flex-1"
                    placeholder="Courier, translation, etc..."
                    value={d.description}
                    onChange={(e) => updateDisbursement(d.id, 'description', e.target.value)}
                    disabled={isReadOnly}
                  />
                  <div className="relative w-24">
                    <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                    <Input
                      type="number"
                      className="h-8 text-xs pl-7"
                      placeholder="Amount"
                      value={d.amount || ''}
                      onChange={(e) => updateDisbursement(d.id, 'amount', parseFloat(e.target.value) || 0)}
                      disabled={isReadOnly}
                    />
                  </div>
                  {!isReadOnly && d.description && d.amount > 0 && !disbursementPresets.some(p => p.name === d.description) && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-slate-400 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => createPreset.mutate({
                              tenant_id: tenantId,
                              user_id: '',
                              category: 'disbursements',
                              name: d.description,
                              amount: Math.round(d.amount * 100),
                            })}
                          >
                            <Bookmark className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Save as preset — will appear in Quick Add</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {!isReadOnly && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removeDisbursement(d.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic py-1">
              {isReadOnly ? 'No disbursements' : 'Use Quick Add or add a custom one'}
            </p>
          )}
        </div>

        <Separator />

        {/* ─── HST Toggle ────────────────────────────────────── */}
        <div className="flex items-center gap-2">
          <Checkbox
            id="hst-toggle"
            checked={hstApplicable}
            onCheckedChange={(checked) => setHstApplicable(checked === true)}
            disabled={isReadOnly}
          />
          <Label htmlFor="hst-toggle" className="text-xs text-slate-600 cursor-pointer">
            HST Applicable (13%) — applied to all fees
          </Label>
        </div>

        {/* ─── Totals Summary ──────────────────────────────────── */}
        <div className="space-y-1 bg-slate-50 rounded-lg p-3">
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Professional Fees</span>
            <span className="font-medium tabular-nums">${feesSubtotal.toFixed(2)}</span>
          </div>
          {govFeesTotal > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Government Fees</span>
              <span className="tabular-nums">${govFeesTotal.toFixed(2)}</span>
            </div>
          )}
          {disbursementsTotal > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Disbursements</span>
              <span className="tabular-nums">${disbursementsTotal.toFixed(2)}</span>
            </div>
          )}
          {(govFeesTotal > 0 || disbursementsTotal > 0) && (
            <div className="flex justify-between text-xs pt-1 border-t border-slate-200">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-medium tabular-nums">${subtotalBeforeTax.toFixed(2)}</span>
            </div>
          )}
          {hstApplicable && (
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">HST (13%)</span>
              <span className="tabular-nums">${hstAmount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-semibold pt-1 border-t border-slate-200">
            <span>Grand Total</span>
            <span className="tabular-nums">${grandTotal.toFixed(2)}</span>
          </div>
        </div>

        {/* ─── Payment Plan ────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="payment-plan-toggle"
              checked={paymentPlanEnabled}
              onCheckedChange={(checked) => setPaymentPlanEnabled(checked === true)}
              disabled={isReadOnly}
            />
            <Label htmlFor="payment-plan-toggle" className="text-xs text-slate-600 cursor-pointer">
              Payment Plan
            </Label>
          </div>

          {paymentPlanEnabled && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Number of Payments</Label>
                  <Input
                    type="number"
                    min={2}
                    max={12}
                    className="h-8 text-xs"
                    value={numPayments}
                    onChange={(e) => {
                      const n = parseInt(e.target.value) || 2
                      setNumPayments(Math.max(2, Math.min(12, n)))
                    }}
                    disabled={isReadOnly}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Split Mode</Label>
                  <Select value={splitMode} onValueChange={(v) => setSplitMode(v as 'equal' | 'manual')} disabled={isReadOnly}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equal">Equal Payments</SelectItem>
                      <SelectItem value="manual">Manual Amounts</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Installment schedule */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-600 flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />
                  Payment Schedule
                </p>
                {installmentConfigs.map((inst, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs flex-wrap">
                    <span className="text-slate-400 w-5 shrink-0">{i + 1}.</span>

                    {/* Amount */}
                    {splitMode === 'manual' ? (
                      <div className="relative w-24">
                        <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                        <Input
                          type="number"
                          className="h-7 text-xs pl-7"
                          value={inst.amount || ''}
                          onChange={(e) => {
                            const next = [...installmentConfigs]
                            next[i] = { ...next[i], amount: parseFloat(e.target.value) || 0 }
                            setInstallmentConfigs(next)
                          }}
                          disabled={isReadOnly}
                        />
                      </div>
                    ) : (
                      <span className="font-medium w-24 tabular-nums">${inst.amount.toFixed(2)}</span>
                    )}

                    {/* Due type toggle */}
                    <Select
                      value={inst.dueType}
                      onValueChange={(val) => {
                        const next = [...installmentConfigs]
                        next[i] = { ...next[i], dueType: val as DueType }
                        setInstallmentConfigs(next)
                      }}
                      disabled={isReadOnly}
                    >
                      <SelectTrigger className="h-7 text-xs w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="date">Date</SelectItem>
                        <SelectItem value="milestone">Milestone</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Date picker or milestone dropdown */}
                    {inst.dueType === 'date' ? (
                      <Input
                        type="date"
                        className="h-7 text-xs w-36"
                        value={inst.dueDate}
                        onChange={(e) => {
                          const next = [...installmentConfigs]
                          next[i] = { ...next[i], dueDate: e.target.value }
                          setInstallmentConfigs(next)
                        }}
                        disabled={isReadOnly}
                      />
                    ) : (
                      <Select
                        value={inst.milestone}
                        onValueChange={(val) => {
                          const next = [...installmentConfigs]
                          next[i] = { ...next[i], milestone: val }
                          setInstallmentConfigs(next)
                        }}
                        disabled={isReadOnly}
                      >
                        <SelectTrigger className="h-7 text-xs w-52">
                          <SelectValue placeholder="Select milestone..." />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_MILESTONES.map((m) => (
                            <SelectItem key={m} value={m}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Payment terms */}
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500">Payment Terms</Label>
          <Input
            className="h-8 text-xs"
            placeholder="Due upon receipt"
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value)}
            disabled={isReadOnly}
          />
        </div>
      </CardContent>

      {/* ─── Record Payment Dialog ──────────────────────────────── */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" /> Record Payment
            </DialogTitle>
            <DialogDescription>Record a payment received for this retainer.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Amount</Label>
              <Input
                type="number"
                placeholder="Amount in dollars"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="e_transfer">E-Transfer</SelectItem>
                  <SelectItem value="credit_card">Credit Card</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reference (optional)</Label>
              <Input
                placeholder="Transaction ID..."
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRecordPayment} disabled={!paymentAmount || recordPayment.isPending}>
              {recordPayment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── E-Sign Confirmation Dialog ─────────────────────────── */}
      <Dialog open={esignDialogOpen} onOpenChange={setEsignDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileSignature className="h-4 w-4" />
              Send for E-Signature
            </DialogTitle>
            <DialogDescription>
              The retainer agreement will be frozen as a PDF and sent to the lead for electronic signature.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Signer Name</Label>
              <Input
                value={esignSignerName}
                onChange={(e) => setEsignSignerName(e.target.value)}
                placeholder="Lead full name"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Signer Email</Label>
              <Input
                type="email"
                value={esignSignerEmail}
                onChange={(e) => setEsignSignerEmail(e.target.value)}
                placeholder="lead@example.com"
              />
            </div>
            {/* Use of Rep toggle */}
            <div className="flex items-center justify-between rounded-md border px-3 py-2.5 gap-3">
              <div>
                <p className="text-sm font-medium">Include Use of Representative (IMM5476E)</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Attach the pre-filled Use of Rep form to this e-sign package.
                </p>
              </div>
              <Switch
                checked={includeUseOfRep}
                onCheckedChange={setIncludeUseOfRep}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEsignDialogOpen(false)} disabled={esignSending}>
              Cancel
            </Button>
            <Button
              onClick={handleSendForESign}
              disabled={!esignSignerName.trim() || !esignSignerEmail.trim() || esignSending}
            >
              {esignSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send for E-Sign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Signing Request Detail Sheet ───────────────────────── */}
      {lead?.id && (
        <SigningRequestDetailSheet
          requestId={detailSheetRequestId}
          matterId={lead.id}
          open={detailSheetOpen}
          onOpenChange={setDetailSheetOpen}
        />
      )}
    </Card>
  )
}
