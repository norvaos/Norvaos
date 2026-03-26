'use client'

/**
 * BillingTab  -  Zone D Billing workspace
 *
 * Sections:
 *   A. Outstanding Balance Summary Card
 *   B. Invoice List (with status badges + actions)
 *   C. Generate Invoice Sheet
 *   D. Milestone Fees Panel
 *   E. Trust Account Widget
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { TenantDateInput } from '@/components/ui/tenant-date-input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  FileDown,
  Loader2,
  Plus,
  Milestone,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Undo2,
} from 'lucide-react'
import { formatDate } from '@/lib/utils/formatters'
import { SmartMatchCard } from '@/components/trust/smart-match-card'
import { GovernmentDisbursementCard } from '@/components/trust/government-disbursement-card'
import { HelperTip } from '@/components/ui/helper-tip'
import { PAYMENT_METHODS } from '@/lib/utils/constants'
import { useUser } from '@/lib/hooks/use-user'
import {
  useInvoices,
  useCreateInvoice,
  useUnbilledTimeEntries,
  useRecordPayment,
  useSendInvoice,
  useSendReceipt,
  useDeleteInvoice,
} from '@/lib/queries/invoicing'
import type { Database, MatterBillingMilestoneRow } from '@/lib/types/database'

// ── Local types ───────────────────────────────────────────────────────────────

type MatterRow = Database['public']['Tables']['matters']['Row']
type TrustTransaction = Database['public']['Tables']['trust_transactions']['Row']

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCents(cents: number | null | undefined): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
  }).format((cents ?? 0) / 100)
}

// Map invoice status → Tailwind classes for Badge
function statusBadgeClass(status: string | null): string {
  switch (status) {
    case 'draft':          return 'bg-slate-100 text-slate-700 border-slate-200'
    case 'sent':           return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'viewed':         return 'bg-indigo-100 text-indigo-700 border-indigo-200'
    case 'finalized':      return 'bg-sky-100 text-sky-700 border-sky-200'
    case 'partially_paid': return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'paid':           return 'bg-green-100 text-green-700 border-green-200'
    case 'overdue':        return 'bg-red-100 text-red-700 border-red-200'
    case 'cancelled':
    case 'void':           return 'bg-gray-100 text-gray-500 border-gray-200'
    default:               return 'bg-slate-100 text-slate-600 border-slate-200'
  }
}

function statusLabel(status: string | null): string {
  if (!status) return 'Unknown'
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// ── Record Trust Transaction Dialog ──────────────────────────────────────────

const TRUST_TRANSACTION_TYPES = [
  { value: 'deposit', label: 'Deposit' },
  { value: 'disbursement', label: 'Disbursement' },
  { value: 'transfer_in', label: 'Transfer In' },
  { value: 'transfer_out', label: 'Transfer Out' },
  { value: 'refund', label: 'Refund' },
  { value: 'bank_fee', label: 'Bank Fee' },
  { value: 'adjustment', label: 'Adjustment' },
] as const

interface RecordTrustTransactionDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  matterId: string
  tenantId: string
}

function RecordTrustTransactionDialog({
  open,
  onOpenChange,
  matterId,
  tenantId,
}: RecordTrustTransactionDialogProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { appUser } = useUser()

  const [txType, setTxType] = useState('deposit')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [isCorrection, setIsCorrection] = useState(false)
  const [reversalOfId, setReversalOfId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Fetch all recent transactions for this matter (for reversal picker)
  const { data: allTxns = [] } = useQuery({
    queryKey: ['trust-transactions-all', matterId],
    queryFn: async (): Promise<TrustTransaction[]> => {
      const { data, error } = await supabase
        .from('trust_transactions')
        .select('*')
        .eq('matter_id', matterId)
        .order('effective_date', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as TrustTransaction[]
    },
    enabled: open && !!matterId,
    staleTime: 30 * 1000,
  })

  // Fetch the trust account ID for this matter (from existing transactions or default)
  const { data: trustAccountId } = useQuery({
    queryKey: ['trust-account-for-matter', matterId],
    queryFn: async (): Promise<string | null> => {
      // First try to get from existing transactions
      const { data: txn } = await supabase
        .from('trust_transactions')
        .select('trust_account_id')
        .eq('matter_id', matterId)
        .limit(1)
        .single()
      if (txn?.trust_account_id) return txn.trust_account_id

      // Fallback: get any trust bank account for this tenant
      const { data: account } = await supabase
        .from('trust_bank_accounts')
        .select('id')
        .limit(1)
        .single()
      return account?.id ?? null
    },
    enabled: open && !!matterId,
    staleTime: 5 * 60 * 1000,
  })

  // When a reversal target is selected, auto-fill amount as the negation
  const selectedOriginal = allTxns.find((t) => t.id === reversalOfId)

  const handleCorrectionToggle = (checked: boolean) => {
    setIsCorrection(checked)
    if (checked) {
      setTxType('reversal')
      setReversalOfId('')
      setAmount('')
      setDescription('')
    } else {
      setTxType('deposit')
      setReversalOfId('')
      setAmount('')
      setDescription('')
    }
  }

  const handleReversalSelect = (txnId: string) => {
    setReversalOfId(txnId)
    const original = allTxns.find((t) => t.id === txnId)
    if (original) {
      // Negate the amount: if original was +500, reversal is -500 (stored as absolute cents)
      setAmount((Math.abs(original.amount_cents) / 100).toFixed(2))
      setDescription(`Reversal: ${original.description}`)
    }
  }

  const resetForm = () => {
    setTxType('deposit')
    setAmount('')
    setDescription('')
    setIsCorrection(false)
    setReversalOfId('')
    setSubmitting(false)
  }

  const handleSubmit = async () => {
    if (!appUser?.id || !trustAccountId) return
    const cents = Math.round(parseFloat(amount || '0') * 100)
    if (cents <= 0 || !description.trim()) return

    setSubmitting(true)
    try {
      // For reversals, negate the original amount direction
      let finalAmountCents = cents
      if (isCorrection && selectedOriginal) {
        // If the original was positive (deposit), the reversal is negative (and vice versa)
        finalAmountCents = selectedOriginal.amount_cents >= 0 ? -cents : cents
      } else {
        // Standard types: deposits/transfers_in are positive, disbursements etc. are negative
        const negativeTypes = ['disbursement', 'transfer_out', 'refund', 'bank_fee']
        if (negativeTypes.includes(txType)) {
          finalAmountCents = -cents
        }
      }

      const { error } = await supabase
        .from('trust_transactions')
        .insert({
          tenant_id: tenantId,
          trust_account_id: trustAccountId,
          matter_id: matterId,
          transaction_type: isCorrection ? 'reversal' : txType,
          amount_cents: finalAmountCents,
          description: description.trim(),
          authorized_by: appUser.id,
          recorded_by: appUser.id,
          effective_date: new Date().toISOString().split('T')[0],
          is_cleared: true,
          reversal_of_id: isCorrection && reversalOfId ? reversalOfId : null,
        })

      if (error) {
        if (error.message?.includes('cannot go negative')) {
          toast.error('Norva Trust Ledger  -  Insufficient trust balance for this transaction')
        } else {
          toast.error(`Failed to record transaction: ${error.message}`)
        }
        return
      }

      queryClient.invalidateQueries({ queryKey: ['trust-transactions', matterId] })
      queryClient.invalidateQueries({ queryKey: ['trust-transactions-all', matterId] })
      queryClient.invalidateQueries({ queryKey: ['matters'] })
      toast.success('Norva Trust Ledger  -  Transaction recorded')
      resetForm()
      onOpenChange(false)
    } catch {
      toast.error('Failed to record transaction')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Trust Transaction</DialogTitle>
          <DialogDescription>
            Add a transaction to the trust ledger for this matter.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Correction toggle */}
          <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
            <Checkbox
              id="correction-toggle"
              checked={isCorrection}
              onCheckedChange={(checked) => handleCorrectionToggle(checked === true)}
            />
            <label htmlFor="correction-toggle" className="flex items-center gap-1.5 text-sm cursor-pointer">
              <Undo2 className="h-3.5 w-3.5 text-amber-600" />
              This is a correction (reversal of a previous transaction)
            </label>
          </div>

          {/* Reversal target picker (shown when correction is on) */}
          {isCorrection && (
            <div>
              <Label className="text-xs">Transaction to Reverse</Label>
              <Select value={reversalOfId} onValueChange={handleReversalSelect}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a transaction…" />
                </SelectTrigger>
                <SelectContent>
                  {allTxns
                    .filter((t) => t.transaction_type !== 'reversal')
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {formatDate(t.effective_date)}  -  {t.description} ({fmtCents(t.amount_cents)})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {selectedOriginal && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Original: {selectedOriginal.transaction_type} for {fmtCents(selectedOriginal.amount_cents)} on {formatDate(selectedOriginal.effective_date)}
                </p>
              )}
            </div>
          )}

          {/* Transaction type (hidden when correction is on  -  auto-set to reversal) */}
          {!isCorrection && (
            <div>
              <Label className="text-xs">Transaction Type</Label>
              <Select value={txType} onValueChange={setTxType}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRUST_TRANSACTION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Amount */}
          <div>
            <Label className="text-xs">Amount ($)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1"
              placeholder="0.00"
              disabled={isCorrection && !!reversalOfId}
            />
            {isCorrection && reversalOfId && (
              <p className="mt-1 text-xs text-amber-600">
                Amount auto-filled from the original transaction.
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 min-h-[60px]"
              placeholder="Description of the transaction…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false) }}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              submitting ||
              !amount ||
              !description.trim() ||
              !trustAccountId ||
              (isCorrection && !reversalOfId)
            }
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isCorrection ? 'Record Reversal' : 'Record Transaction'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Trust Account Widget ──────────────────────────────────────────────────────

function TrustWidget({ matterId, tenantId, trustBalance }: { matterId: string; tenantId: string; trustBalance: number | null }) {
  const [showRecordDialog, setShowRecordDialog] = useState(false)

  const { data: txns, isLoading } = useQuery({
    queryKey: ['trust-transactions', matterId],
    queryFn: async (): Promise<TrustTransaction[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('trust_transactions')
        .select('*')
        .eq('matter_id', matterId)
        .order('effective_date', { ascending: false })
        .limit(3)
      if (error) throw error
      return (data ?? []) as TrustTransaction[]
    },
    enabled: !!matterId,
    staleTime: 60 * 1000,
  })

  // Only render widget if there is a non-zero trust balance or transactions
  const hasBalance = (trustBalance ?? 0) !== 0
  const hasTxns = (txns ?? []).length > 0

  if (!isLoading && !hasBalance && !hasTxns) return null

  return (
    <Card className="border-emerald-200 bg-emerald-50/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <CardTitle className="text-sm font-semibold">Norva Ledger</CardTitle>
            <HelperTip contentKey="billing.trust_account" />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => setShowRecordDialog(true)}
          >
            <Plus className="mr-1 h-3 w-3" />
            Record Transaction
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        <div className="flex items-center justify-between rounded-md border border-emerald-100 bg-white px-3 py-2">
          <span className="text-xs text-muted-foreground">Current Balance</span>
          <span className="text-sm font-bold text-emerald-700">
            {fmtCents((trustBalance ?? 0) * 100)}
          </span>
        </div>

        {(trustBalance ?? 0) > 0 && (trustBalance ?? 0) < 50000 && (
          <div className="flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
            <AlertTriangle className="size-4 shrink-0" />
            <span>Low trust balance  -  consider requesting a retainer top-up from the client.</span>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-1.5">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : hasTxns ? (
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-1">
              Recent Transactions
            </p>
            {txns!.map((tx) => {
              const isAdjustment = tx.transaction_type === 'adjustment'
              const isCredit = isAdjustment
                ? tx.amount_cents >= 0
                : ['deposit', 'transfer_in', 'interest', 'opening_balance'].includes(tx.transaction_type)
              return (
                <div
                  key={tx.id}
                  className="flex items-center gap-2 rounded border border-slate-100 bg-white px-3 py-1.5 text-xs"
                >
                  {isCredit
                    ? <TrendingUp className="h-3 w-3 text-emerald-500 shrink-0" />
                    : <TrendingDown className="h-3 w-3 text-red-500 shrink-0" />
                  }
                  <span className="flex-1 truncate text-slate-700">{tx.description}</span>
                  <span className="text-slate-500 shrink-0">{formatDate(tx.effective_date)}</span>
                  <span className={`font-semibold shrink-0 ${isCredit ? 'text-emerald-700' : 'text-red-600'}`}>
                    {isCredit ? '+' : '-'}{fmtCents(tx.amount_cents)}
                  </span>
                </div>
              )
            })}
          </div>
        ) : null}
      </CardContent>

      <RecordTrustTransactionDialog
        open={showRecordDialog}
        onOpenChange={setShowRecordDialog}
        matterId={matterId}
        tenantId={tenantId}
      />
    </Card>
  )
}

// ── Outstanding Balance Card ──────────────────────────────────────────────────

interface BalanceCardProps {
  matter: MatterRow
  unbilledCount: number
  onGenerateInvoice: () => void
}

function BalanceCard({ matter, unbilledCount, onGenerateInvoice }: BalanceCardProps) {
  const outstanding = (matter.total_billed ?? 0) - (matter.total_paid ?? 0)
  const outstandingCents = outstanding * 100

  // Breakdown by billing type
  const isFlatFee = matter.billing_type === 'flat_fee'
  const flatFeeDisplay = isFlatFee ? fmtCents((matter.total_billed ?? 0) * 100) : '$0.00'
  const hourlyDisplay  = !isFlatFee ? fmtCents((matter.total_billed ?? 0) * 100) : '$0.00'
  const trustDisplay   = fmtCents((matter.trust_balance ?? 0) * 100)

  return (
    <Card className={outstanding > 0 ? 'border-orange-200 bg-orange-50/20' : 'border-green-200 bg-green-50/20'}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-muted-foreground">
            Outstanding Balance
          </CardTitle>
          <Button size="sm" className="h-7 text-xs" onClick={onGenerateInvoice}>
            <Plus className="mr-1 h-3 w-3" />
            Generate Invoice
          </Button>
        </div>
        <p className={`text-2xl font-bold mt-1 ${outstanding > 0 ? 'text-orange-700' : 'text-green-700'}`}>
          {fmtCents(outstandingCents)} CAD
        </p>
        {unbilledCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {unbilledCount} unbilled time {unbilledCount === 1 ? 'entry' : 'entries'} pending
          </p>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex divide-x divide-slate-200 rounded-md border border-slate-200 bg-white overflow-hidden text-xs">
          <div className="flex-1 px-3 py-2">
            <p className="text-muted-foreground">Flat Fee</p>
            <p className="font-semibold">{flatFeeDisplay}</p>
          </div>
          <div className="flex-1 px-3 py-2">
            <p className="text-muted-foreground">Hourly</p>
            <p className="font-semibold">{hourlyDisplay}</p>
          </div>
          <div className="flex-1 px-3 py-2">
            <p className="text-muted-foreground">Trust</p>
            <p className="font-semibold">{trustDisplay}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Generate Invoice Sheet ────────────────────────────────────────────────────

interface GenerateInvoiceSheetProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  matterId: string
  tenantId: string
  matter: MatterRow
}

function GenerateInvoiceSheet({
  open,
  onOpenChange,
  matterId,
  tenantId,
  matter,
}: GenerateInvoiceSheetProps) {
  const { data: unbilled = [] } = useUnbilledTimeEntries(tenantId, matterId)
  const createInvoice = useCreateInvoice()

  const [billingType, setBillingType] = useState<'flat_fee' | 'hourly' | 'milestone'>(
    (matter.billing_type as 'flat_fee' | 'hourly' | 'milestone') ?? 'flat_fee',
  )
  const [feeAmount, setFeeAmount] = useState(
    matter.billing_type === 'flat_fee'
      ? ((matter.total_billed ?? 0)).toFixed(2)
      : ((matter.hourly_rate ?? 0)).toFixed(2),
  )
  const [notes, setNotes] = useState('')
  const [dueDays, setDueDays] = useState('30')

  const handleSubmit = async () => {
    const now = new Date()
    const dueDate = new Date(now.getTime() + parseInt(dueDays || '30') * 86400000)
    const invoiceNumber = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`

    let lineItems: { description: string; quantity: number; unitPrice: number; timeEntryId?: string }[] = []

    if (billingType === 'hourly' && unbilled.length > 0) {
      lineItems = unbilled.map((e) => ({
        description: e.description,
        quantity: Math.round((e.duration_minutes / 60) * 100) / 100,
        unitPrice: Math.round((Number(e.hourly_rate) || Number(matter.hourly_rate) || 0) * 100),
        timeEntryId: e.id,
      }))
    } else {
      const amountCents = Math.round(parseFloat(feeAmount || '0') * 100)
      const desc =
        billingType === 'flat_fee'
          ? `Flat Fee  -  ${matter.title}`
          : billingType === 'milestone'
          ? `Milestone Fee  -  ${matter.title}`
          : `Legal Services  -  ${matter.title}`
      lineItems = [{ description: desc, quantity: 1, unitPrice: amountCents }]
    }

    if (lineItems.length === 0) {
      toast.error('No line items to invoice.')
      return
    }

    try {
      await createInvoice.mutateAsync({
        tenantId,
        matterId,
        invoiceNumber,
        issueDate: now.toISOString().split('T')[0],
        dueDate: dueDate.toISOString().split('T')[0],
        notes: notes.trim() || undefined,
        lineItems,
      })
      setNotes('')
      onOpenChange(false)
    } catch {
      // error toast already handled in mutation
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[420px] sm:max-w-[420px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Generate Invoice</SheetTitle>
          <SheetDescription>
            Create a new invoice for this matter. It will be saved as a draft.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          {/* Billing type */}
          <div>
            <Label className="text-xs">Billing Type</Label>
            <Select value={billingType} onValueChange={(v) => setBillingType(v as typeof billingType)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="flat_fee">Flat Fee</SelectItem>
                <SelectItem value="hourly">Hourly (from time entries)</SelectItem>
                <SelectItem value="milestone">Milestone</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Auto-populated unbilled entries preview (hourly) */}
          {billingType === 'hourly' && unbilled.length > 0 && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                {unbilled.length} unbilled time {unbilled.length === 1 ? 'entry' : 'entries'} will be included:
              </p>
              {unbilled.slice(0, 5).map((e) => {
                const hrs = Math.floor(e.duration_minutes / 60)
                const mins = e.duration_minutes % 60
                const rate = Number(e.hourly_rate) || Number(matter.hourly_rate) || 0
                const amt = (e.duration_minutes / 60) * rate
                return (
                  <div key={e.id} className="flex items-center gap-2 text-xs">
                    <span className="flex-1 truncate text-slate-700">{e.description}</span>
                    <span className="text-slate-500 shrink-0">{hrs}h{mins > 0 ? ` ${mins}m` : ''}</span>
                    <span className="font-medium shrink-0">${amt.toFixed(2)}</span>
                  </div>
                )
              })}
              {unbilled.length > 5 && (
                <p className="text-xs text-muted-foreground">+{unbilled.length - 5} more…</p>
              )}
            </div>
          )}

          {/* Fee amount (flat fee / milestone) */}
          {billingType !== 'hourly' && (
            <div>
              <Label className="text-xs">Fee Amount ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={feeAmount}
                onChange={(e) => setFeeAmount(e.target.value)}
                className="mt-1"
                placeholder="0.00"
              />
            </div>
          )}

          {/* Due date */}
          <div>
            <Label className="text-xs">Payment Terms (days until due)</Label>
            <Input
              type="number"
              min="1"
              value={dueDays}
              onChange={(e) => setDueDays(e.target.value)}
              className="mt-1"
            />
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1"
              placeholder="Additional notes for the client…"
            />
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createInvoice.isPending}>
            {createInvoice.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Draft Invoice
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

// ── Record Payment Dialog ─────────────────────────────────────────────────────

interface RecordPaymentDialogProps {
  invoiceId: string | null
  tenantId: string
  contactId: string
  onClose: () => void
}

function RecordPaymentDialog({ invoiceId, tenantId, contactId, onClose }: RecordPaymentDialogProps) {
  const recordPayment = useRecordPayment()
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('bank_transfer')
  const [ref, setRef] = useState('')

  const handleSubmit = async () => {
    if (!invoiceId) return
    const cents = Math.round(parseFloat(amount) * 100)
    if (isNaN(cents) || cents <= 0) return
    await recordPayment.mutateAsync({
      tenant_id: tenantId,
      invoice_id: invoiceId,
      contact_id: contactId,
      amount: cents,
      payment_method: method,
      external_payment_id: ref.trim() || undefined,
    })
    setAmount(''); setRef(''); onClose()
  }

  return (
    <Dialog open={!!invoiceId} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>Enter the payment details for this invoice.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Amount Received ($)</Label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1"
              placeholder="0.00"
            />
          </div>
          <div>
            <Label className="text-xs">Payment Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((pm) => (
                  <SelectItem key={pm.value} value={pm.value}>{pm.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Reference (optional)</Label>
            <Input value={ref} onChange={(e) => setRef(e.target.value)} className="mt-1" placeholder="Cheque #, transfer ID…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={recordPayment.isPending || !amount}>
            {recordPayment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Record Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Milestones Panel ──────────────────────────────────────────────────────────

function milestoneBadgeClass(status: string): string {
  switch (status) {
    case 'complete':   return 'bg-green-100 text-green-700 border-green-200'
    case 'billed':     return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'cancelled':  return 'bg-gray-100 text-gray-500 border-gray-200'
    default:           return 'bg-amber-100 text-amber-700 border-amber-200'
  }
}

interface MilestonesPanelProps {
  matterId: string
  tenantId: string
}

function MilestonesPanel({ matterId, tenantId }: MilestonesPanelProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newNotes, setNewNotes] = useState('')

  const { data: milestones = [], isLoading } = useQuery({
    queryKey: ['billing-milestones', matterId],
    queryFn: async (): Promise<MatterBillingMilestoneRow[]> => {
      const { data, error } = await supabase
        .from('matter_billing_milestones')
        .select('*')
        .eq('matter_id', matterId)
        .order('sort_order')
      if (error) throw error
      return (data ?? []) as MatterBillingMilestoneRow[]
    },
    enabled: !!matterId,
  })

  const markComplete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('matter_billing_milestones')
        .update({ status: 'complete', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-milestones', matterId] })
      toast.success('Milestone marked complete')
    },
    onError: () => toast.error('Failed to update milestone'),
  })

  const billMilestone = useMutation({
    mutationFn: async (milestone: MatterBillingMilestoneRow) => {
      const now = new Date()
      const dueDate = new Date(now.getTime() + 30 * 86400000)
      const invoiceNumber = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`

      // Create invoice
      const { data: invoice, error: invError } = await supabase
        .from('invoices')
        .insert({
          tenant_id: tenantId,
          matter_id: matterId,
          invoice_number: invoiceNumber,
          contact_id: '',
          issue_date: now.toISOString().split('T')[0],
          due_date: dueDate.toISOString().split('T')[0],
          subtotal: milestone.amount_cents,
          tax_amount: 0,
          total_amount: milestone.amount_cents,
          notes: `Milestone: ${milestone.name}`,
        })
        .select()
        .single()
      if (invError) throw invError

      // Create line item
      const { error: liError } = await supabase
        .from('invoice_line_items')
        .insert({
          invoice_id: invoice.id,
          description: `Milestone: ${milestone.name}`,
          quantity: 1,
          unit_price: milestone.amount_cents,
          amount: milestone.amount_cents,
          sort_order: 0,
        })
      if (liError) throw liError

      // Update milestone
      const { error: mbmError } = await supabase
        .from('matter_billing_milestones')
        .update({ status: 'billed', billed_at: now.toISOString(), invoice_id: invoice.id, updated_at: now.toISOString() })
        .eq('id', milestone.id)
      if (mbmError) throw mbmError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-milestones', matterId] })
      queryClient.invalidateQueries({ queryKey: ['invoicing'] })
      toast.success('Invoice created for milestone')
    },
    onError: () => toast.error('Failed to bill milestone'),
  })

  const addMilestone = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('matter_billing_milestones')
        .insert({
          tenant_id: tenantId,
          matter_id: matterId,
          name: newName.trim(),
          amount_cents: Math.round(parseFloat(newAmount || '0') * 100),
          due_date: newDueDate || null,
          notes: newNotes.trim() || null,
          sort_order: milestones.length,
        })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-milestones', matterId] })
      toast.success('Milestone added')
      setNewName(''); setNewAmount(''); setNewDueDate(''); setNewNotes('')
      setShowAddForm(false)
    },
    onError: () => toast.error('Failed to add milestone'),
  })

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Milestone className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Milestone Fees</CardTitle>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowAddForm((v) => !v)}>
            <Plus className="mr-1 h-3 w-3" />
            Add Milestone
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {/* Add form */}
        {showAddForm && (
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Milestone Name</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="mt-1 h-7 text-xs"
                  placeholder="e.g. Application Filed"
                />
              </div>
              <div>
                <Label className="text-xs">Amount ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  className="mt-1 h-7 text-xs"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Due Date (optional)</Label>
                <TenantDateInput
                  value={newDueDate}
                  onChange={(iso) => setNewDueDate(iso)}
                  className="mt-1 h-7 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">Notes (optional)</Label>
                <Input
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="mt-1 h-7 text-xs"
                  placeholder="Optional notes…"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={!newName.trim() || addMilestone.isPending}
                onClick={() => addMilestone.mutate()}
              >
                {addMilestone.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        )}

        {/* List */}
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : milestones.length === 0 && !showAddForm ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No milestones yet. Click &ldquo;Add Milestone&rdquo; to create one.
          </p>
        ) : (
          <div className="space-y-1">
            {milestones.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-3 rounded-md border border-slate-100 bg-white px-3 py-2 text-sm"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{m.name}</p>
                  {m.due_date && (
                    <p className="text-xs text-muted-foreground">Due {formatDate(m.due_date)}</p>
                  )}
                </div>
                <span className="text-sm font-semibold shrink-0">{fmtCents(m.amount_cents)}</span>
                <Badge
                  variant="outline"
                  className={`text-[10px] py-0 px-1.5 shrink-0 border ${milestoneBadgeClass(m.status)}`}
                >
                  {m.status.charAt(0).toUpperCase() + m.status.slice(1)}
                </Badge>
                <div className="flex gap-1 shrink-0">
                  {m.status === 'pending' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs px-2"
                      disabled={markComplete.isPending}
                      onClick={() => markComplete.mutate(m.id)}
                    >
                      {markComplete.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Mark Complete'}
                    </Button>
                  )}
                  {m.status === 'complete' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs px-2 text-blue-600"
                      disabled={billMilestone.isPending}
                      onClick={() => billMilestone.mutate(m)}
                    >
                      {billMilestone.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Bill'}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Main BillingTab ───────────────────────────────────────────────────────────

export interface BillingTabProps {
  matterId: string
  tenantId: string
  matter: MatterRow
}

export function BillingTab({ matterId, tenantId, matter }: BillingTabProps) {
  const [showGenerateSheet, setShowGenerateSheet] = useState(false)
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null)
  const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null)

  const { data: invoices = [], isLoading: invLoading } = useInvoices(tenantId, matterId)
  const { data: unbilled = [] } = useUnbilledTimeEntries(tenantId, matterId)
  const sendInvoice = useSendInvoice()
  const sendReceipt = useSendReceipt()
  const deleteInvoice = useDeleteInvoice()

  const handleDownloadPdf = async (invoiceId: string) => {
    setDownloadingPdf(invoiceId)
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/pdf`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Download failed' }))
        toast.error(body.error ?? `Download failed (${res.status})`)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const disposition = res.headers.get('Content-Disposition')
      const match = disposition?.match(/filename="(.+)"/)
      a.download = match?.[1] ?? 'invoice.pdf'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download PDF')
    } finally {
      setDownloadingPdf(null)
    }
  }

  // Find contact_id from the first invoice (needed for payment dialog)
  const contactId = invoices[0]?.contact_id ?? ''

  return (
    <div className="p-4 space-y-5">
      {/* ── A. Outstanding Balance Summary ─────────────────────────────────── */}
      <BalanceCard
        matter={matter}
        unbilledCount={unbilled.length}
        onGenerateInvoice={() => setShowGenerateSheet(true)}
      />

      {/* ── Smart-Match Suggestions ──────────────────────────────────────── */}
      <SmartMatchCard matterId={matterId} />

      {/* ── Government Fee Disbursement ───────────────────────────────────── */}
      <GovernmentDisbursementCard matterId={matterId} />

      {/* ── B. Invoice List ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Invoices</CardTitle>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowGenerateSheet(true)}>
            <Plus className="mr-1 h-3 w-3" />
            New Invoice
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          {invLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No invoices yet</p>
          ) : (
            <div className="space-y-0.5">
              {/* Header row */}
              <div className="grid grid-cols-[110px_85px_90px_90px_100px_1fr] gap-2 px-2 py-1.5 text-[11px] font-medium text-muted-foreground border-b">
                <span>Invoice #</span>
                <span>Date</span>
                <span>Amount</span>
                <span>Due</span>
                <span>Status</span>
                <span>Actions</span>
              </div>

              {invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="grid grid-cols-[110px_85px_90px_90px_100px_1fr] gap-2 px-2 py-2 text-sm items-center rounded hover:bg-slate-50"
                >
                  <span className="font-mono text-xs truncate">{inv.invoice_number ?? ' - '}</span>
                  <span className="text-xs">{formatDate(inv.issue_date ?? '')}</span>
                  <span className="text-xs font-medium">{fmtCents(inv.total_amount ?? 0)}</span>
                  <span className="text-xs">{inv.due_date ? formatDate(inv.due_date) : ' - '}</span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] py-0 px-1.5 w-fit font-medium border ${statusBadgeClass(inv.status)}`}
                  >
                    {statusLabel(inv.status)}
                  </Badge>
                  <div className="flex gap-1 flex-wrap">
                    {inv.status === 'finalized' && (
                      <Button
                        variant="ghost" size="sm" className="h-6 text-xs px-2"
                        disabled={sendInvoice.isPending}
                        onClick={() => sendInvoice.mutate({ invoiceId: inv.id })}
                      >
                        {sendInvoice.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                        Send
                      </Button>
                    )}
                    {inv.status === 'draft' && (
                      <Button
                        variant="ghost" size="sm" className="h-6 text-xs px-2 text-red-500"
                        onClick={() => deleteInvoice.mutate(inv.id)}
                      >
                        Delete
                      </Button>
                    )}
                    {['sent', 'viewed', 'overdue', 'partially_paid'].includes(inv.status ?? '') && (
                      <Button
                        variant="ghost" size="sm" className="h-6 text-xs px-2"
                        onClick={() => setPaymentInvoiceId(inv.id)}
                      >
                        Record Payment
                      </Button>
                    )}
                    {inv.status === 'paid' && (
                      <Button
                        variant="ghost" size="sm" className="h-6 text-xs px-2"
                        disabled={sendReceipt.isPending}
                        onClick={() => sendReceipt.mutate({ invoiceId: inv.id })}
                      >
                        {sendReceipt.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                        Receipt
                      </Button>
                    )}
                    <Button
                      variant="ghost" size="sm" className="h-6 text-xs px-2"
                      disabled={downloadingPdf === inv.id}
                      onClick={() => handleDownloadPdf(inv.id)}
                    >
                      {downloadingPdf === inv.id
                        ? <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        : <FileDown className="mr-1 h-3 w-3" />
                      }
                      PDF
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── D. Milestone Fees Panel ─────────────────────────────────────────── */}
      <MilestonesPanel matterId={matterId} tenantId={tenantId} />

      {/* ── E. Trust Account Widget ────────────────────────────────────────── */}
      <TrustWidget matterId={matterId} tenantId={tenantId} trustBalance={matter.trust_balance} />

      {/* ── Generate Invoice Sheet ─────────────────────────────────────────── */}
      <GenerateInvoiceSheet
        open={showGenerateSheet}
        onOpenChange={setShowGenerateSheet}
        matterId={matterId}
        tenantId={tenantId}
        matter={matter}
      />

      {/* ── Record Payment Dialog ──────────────────────────────────────────── */}
      <RecordPaymentDialog
        invoiceId={paymentInvoiceId}
        tenantId={tenantId}
        contactId={contactId}
        onClose={() => setPaymentInvoiceId(null)}
      />
    </div>
  )
}
