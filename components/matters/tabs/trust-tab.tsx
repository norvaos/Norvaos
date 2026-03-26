'use client'

import { useState } from 'react'
import { useUser } from '@/lib/hooks/use-user'
import { useUserRole } from '@/lib/hooks/use-user-role'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
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
import { Plus, ArrowDownRight, Loader2, ShieldCheck, XCircle, Landmark } from 'lucide-react'
import { TrustStatusIndicator } from '@/components/trust/trust-status-indicator'
import { OverdueInvoiceBanner } from '@/components/trust/overdue-invoice-banner'
import { SmartMatchCard } from '@/components/trust/smart-match-card'
import { useOverdueInvoices } from '@/lib/queries/overdue-invoices'
import {
  useTrustAccounts,
  useTrustTransactions,
  useRecordDeposit,
  usePrepareDisbursement,
  useDisbursementRequests,
  useApproveDisbursement,
  useRejectDisbursement,
} from '@/lib/queries/trust-accounting'
import { PAYMENT_METHODS } from '@/lib/utils/constants'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtCents(cents: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

function txTypeBadge(type: string) {
  switch (type) {
    case 'deposit':
      return { label: 'Deposit', cls: 'bg-green-50 text-green-700 border-green-200' }
    case 'opening_balance':
      return { label: 'Opening Balance', cls: 'bg-blue-50 text-blue-700 border-blue-200' }
    case 'disbursement':
      return { label: 'Disbursement', cls: 'bg-red-50 text-red-700 border-red-200' }
    case 'transfer':
      return { label: 'Transfer', cls: 'bg-purple-50 text-purple-700 border-purple-200' }
    case 'refund':
      return { label: 'Refund', cls: 'bg-orange-50 text-orange-700 border-orange-200' }
    case 'interest':
      return { label: 'Interest', cls: 'bg-teal-50 text-teal-700 border-teal-200' }
    default:
      return { label: type, cls: 'bg-slate-50 text-slate-700 border-slate-200' }
  }
}

function statusBadge(status: string) {
  switch (status) {
    case 'cleared':
      return { label: 'Cleared', cls: 'bg-green-50 text-green-700 border-green-200' }
    case 'held':
      return { label: 'Held', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
    case 'pending':
      return { label: 'Pending', cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' }
    case 'voided':
      return { label: 'Voided', cls: 'bg-slate-50 text-slate-500 border-slate-200' }
    default:
      return { label: status, cls: 'bg-slate-50 text-slate-700 border-slate-200' }
  }
}

const AUTHORIZATION_TYPES = [
  { value: 'client_written', label: 'Client Written Authorisation' },
  { value: 'client_verbal', label: 'Client Verbal Authorisation' },
  { value: 'court_order', label: 'Court Order' },
  { value: 'trust_condition', label: 'Trust Condition' },
  { value: 'statutory', label: 'Statutory Authority' },
] as const

// ── Main Component ───────────────────────────────────────────────────────────

interface TrustTabProps {
  matterId: string
  tenantId: string
  matter: {
    trust_balance: number
    is_trust_admin?: boolean
  }
}

export function TrustTab({ matterId, tenantId, matter }: TrustTabProps) {
  const { appUser } = useUser()
  const { role } = useUserRole()

  // Dialog state
  const [showDeposit, setShowDeposit] = useState(false)
  const [showDisbursement, setShowDisbursement] = useState(false)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  // Account selector
  const [selectedAccountId, setSelectedAccountId] = useState<string>('')

  // Deposit form state
  const [depAmount, setDepAmount] = useState('')
  const [depMethod, setDepMethod] = useState('bank_transfer')
  const [depDesc, setDepDesc] = useState('')
  const [depRef, setDepRef] = useState('')

  // Disbursement form state
  const [disbAmount, setDisbAmount] = useState('')
  const [disbPayee, setDisbPayee] = useState('')
  const [disbDesc, setDisbDesc] = useState('')
  const [disbMethod, setDisbMethod] = useState('cheque')
  const [disbAuthType, setDisbAuthType] = useState('client_written')

  // Queries
  const { data: accountsData, isLoading: accountsLoading } = useTrustAccounts()
  const accounts = (accountsData as { accounts?: Array<{ id: string; account_name: string; bank_name: string; is_active: boolean }> })?.accounts ?? []

  const effectiveAccountId = selectedAccountId || (accounts.length > 0 ? accounts[0]?.id : '')

  const { data: txData, isLoading: txLoading } = useTrustTransactions({
    matterId,
    trustAccountId: effectiveAccountId || undefined,
  })
  const transactions = (txData as { transactions?: Array<{
    id: string
    effective_date: string
    transaction_type: string
    description: string
    amount_cents: number
    running_balance_cents: number
    reference_number: string | null
    status: string
  }> })?.transactions ?? []

  const { data: disbData, isLoading: disbLoading } = useDisbursementRequests({
    matterId,
    status: 'pending_approval',
  })
  const pendingDisbursements = (disbData as { requests?: Array<{
    id: string
    amount_cents: number
    payee_name: string
    description: string
    payment_method: string
    authorization_type: string
    created_at: string
    requested_by_name?: string
  }> })?.requests ?? []

  const { data: overdueData } = useOverdueInvoices(matterId)
  const overdueInvoices = overdueData?.invoices ?? []

  // Mutations
  const recordDeposit = useRecordDeposit()
  const prepareDisbursement = usePrepareDisbursement()
  const approveDisbursement = useApproveDisbursement()
  const rejectDisbursement = useRejectDisbursement()

  // Determine if user is a lawyer (has trust_accounting.approve permission or role is lawyer/admin)
  const isLawyer = role?.name === 'lawyer' || role?.name === 'admin' || role?.name === 'owner' ||
    role?.permissions?.trust_accounting?.approve === true

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleRecordDeposit = async () => {
    const cents = Math.round(parseFloat(depAmount) * 100)
    if (isNaN(cents) || cents <= 0) {
      toast.error('Please enter a valid amount')
      return
    }
    if (!depDesc.trim()) {
      toast.error('Please enter a description')
      return
    }
    if (!effectiveAccountId) {
      toast.error('Please select a trust account')
      return
    }
    await recordDeposit.mutateAsync({
      trustAccountId: effectiveAccountId,
      matterId,
      amountCents: cents,
      description: depDesc.trim(),
      paymentMethod: depMethod,
      referenceNumber: depRef || undefined,
    })
    setDepAmount('')
    setDepDesc('')
    setDepRef('')
    setShowDeposit(false)
  }

  const handlePrepareDisbursement = async () => {
    const cents = Math.round(parseFloat(disbAmount) * 100)
    if (isNaN(cents) || cents <= 0) {
      toast.error('Please enter a valid amount')
      return
    }
    if (!disbPayee.trim()) {
      toast.error('Please enter a payee name')
      return
    }
    if (!disbDesc.trim()) {
      toast.error('Please enter a description')
      return
    }
    if (!effectiveAccountId) {
      toast.error('Please select a trust account')
      return
    }
    await prepareDisbursement.mutateAsync({
      trustAccountId: effectiveAccountId,
      matterId,
      amountCents: cents,
      payeeName: disbPayee.trim(),
      description: disbDesc.trim(),
      paymentMethod: disbMethod,
      authorizationType: disbAuthType,
    })
    setDisbAmount('')
    setDisbPayee('')
    setDisbDesc('')
    setShowDisbursement(false)
  }

  const handleApprove = async (id: string) => {
    await approveDisbursement.mutateAsync(id)
  }

  const handleReject = async () => {
    if (!rejectingId || !rejectReason.trim()) {
      toast.error('Please provide a reason for rejection')
      return
    }
    await rejectDisbursement.mutateAsync({ id: rejectingId, rejectionReason: rejectReason.trim() })
    setRejectingId(null)
    setRejectReason('')
  }

  // ── Balance colour ───────────────────────────────────────────────────────

  const balanceCents = matter.trust_balance ?? 0
  const hasOverdue = overdueInvoices.length > 0
  const isZeroOrNegative = balanceCents <= 0
  const balanceColour = isZeroOrNegative ? 'text-red-700' : 'text-green-700'

  return (
    <div className="space-y-6">
      {/* Header  -  Trust Balance Summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Card className={isZeroOrNegative ? 'border-red-300 bg-red-50' : ''}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Trust Balance</p>
              <TrustStatusIndicator balanceCents={balanceCents} overdueCount={overdueInvoices.length} />
            </div>
            <p className={`text-lg font-semibold ${balanceColour}`}>
              {fmtCents(balanceCents)}
            </p>
            {isZeroOrNegative && (
              <p className="text-[10px] text-red-600 font-medium mt-0.5">No funds available</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Available Balance</p>
            <p className="text-lg font-semibold text-slate-700">
              {fmtCents(balanceCents)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">After held funds cleared</p>
          </CardContent>
        </Card>
        <Card className="col-span-2 lg:col-span-1">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Pending Disbursements</p>
            <p className="text-lg font-semibold text-amber-700">
              {pendingDisbursements.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Overdue Invoice Alert */}
      <OverdueInvoiceBanner invoices={overdueInvoices as any} matterId={matterId} />

      {/* Smart-Match Suggestions */}
      <SmartMatchCard matterId={matterId} />

      {/* Trust Account Selector */}
      {accountsLoading ? (
        <Skeleton className="h-10 w-64" />
      ) : accounts.length > 0 ? (
        <div className="flex items-center gap-3">
          <Landmark className="h-4 w-4 text-muted-foreground" />
          <Label className="text-xs font-medium">Trust Account</Label>
          <Select
            value={effectiveAccountId}
            onValueChange={setSelectedAccountId}
          >
            <SelectTrigger className="w-72">
              <SelectValue placeholder="Select trust account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((acct) => (
                <SelectItem key={acct.id} value={acct.id}>
                  {acct.account_name}  -  {acct.bank_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {/* Quick Actions */}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setShowDeposit(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Record Deposit
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowDisbursement(true)}>
          <ArrowDownRight className="mr-1 h-3.5 w-3.5" /> Request Disbursement
        </Button>
      </div>

      {/* Ledger Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Trust Ledger</CardTitle>
        </CardHeader>
        <CardContent>
          {txLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No trust transactions for this matter
            </p>
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-[80px_100px_1fr_100px_100px_90px_80px] gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground border-b">
                <span>Date</span>
                <span>Type</span>
                <span>Description</span>
                <span className="text-right">Amount</span>
                <span className="text-right">Balance</span>
                <span>Reference</span>
                <span>Status</span>
              </div>
              {transactions.map((tx) => {
                const typeBadge = txTypeBadge(tx.transaction_type)
                const stsBadge = statusBadge(tx.status)
                const isPositive = tx.amount_cents >= 0
                return (
                  <div
                    key={tx.id}
                    className="grid grid-cols-[80px_100px_1fr_100px_100px_90px_80px] gap-2 px-2 py-2 text-sm items-center rounded hover:bg-slate-50"
                  >
                    <span className="text-xs">
                      {new Date(tx.effective_date).toLocaleDateString('en-CA', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] py-0 w-fit ${typeBadge.cls}`}
                    >
                      {typeBadge.label}
                    </Badge>
                    <span className="text-xs truncate">{tx.description}</span>
                    <span
                      className={`text-xs font-medium text-right ${
                        isPositive ? 'text-green-700' : 'text-red-700'
                      }`}
                    >
                      {isPositive ? '+' : ''}
                      {fmtCents(tx.amount_cents)}
                    </span>
                    <span className={`text-xs font-medium text-right ${tx.running_balance_cents <= 0 ? 'text-red-700 font-bold' : ''}`}>
                      {fmtCents(tx.running_balance_cents)}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {tx.reference_number ?? ' - '}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] py-0 w-fit ${stsBadge.cls}`}
                    >
                      {stsBadge.label}
                    </Badge>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Disbursements */}
      {pendingDisbursements.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              Pending Disbursement Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <div className="grid grid-cols-[80px_1fr_120px_100px_100px_140px] gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground border-b">
                <span>Date</span>
                <span>Description</span>
                <span>Payee</span>
                <span className="text-right">Amount</span>
                <span>Authorisation</span>
                <span>Actions</span>
              </div>
              {pendingDisbursements.map((req) => (
                <div
                  key={req.id}
                  className="grid grid-cols-[80px_1fr_120px_100px_100px_140px] gap-2 px-2 py-2 text-sm items-center rounded hover:bg-amber-50"
                >
                  <span className="text-xs">
                    {new Date(req.created_at).toLocaleDateString('en-CA', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <span className="text-xs truncate">{req.description}</span>
                  <span className="text-xs truncate">{req.payee_name}</span>
                  <span className="text-xs font-medium text-right text-red-700">
                    {fmtCents(req.amount_cents)}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">
                    {AUTHORIZATION_TYPES.find((a) => a.value === req.authorization_type)?.label ??
                      req.authorization_type}
                  </span>
                  <div className="flex gap-1">
                    {isLawyer && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs px-2 text-green-700 border-green-300 hover:bg-green-50"
                        onClick={() => handleApprove(req.id)}
                        disabled={approveDisbursement.isPending}
                      >
                        {approveDisbursement.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <ShieldCheck className="mr-1 h-3 w-3" />
                        )}
                        Approve
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs px-2 text-red-700 border-red-300 hover:bg-red-50"
                      onClick={() => setRejectingId(req.id)}
                      disabled={rejectDisbursement.isPending}
                    >
                      <XCircle className="mr-1 h-3 w-3" />
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Record Deposit Dialog */}
      <Dialog open={showDeposit} onOpenChange={setShowDeposit}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Trust Deposit</DialogTitle>
            <DialogDescription>
              Record a deposit into the client trust account for this matter.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Amount ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={depAmount}
                onChange={(e) => setDepAmount(e.target.value)}
                className="mt-1"
                placeholder="0.00"
              />
            </div>
            <div>
              <Label className="text-xs">Payment Method</Label>
              <Select value={depMethod} onValueChange={setDepMethod}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((pm) => (
                    <SelectItem key={pm.value} value={pm.value}>
                      {pm.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input
                value={depDesc}
                onChange={(e) => setDepDesc(e.target.value)}
                className="mt-1"
                placeholder="Retainer deposit, settlement funds…"
              />
            </div>
            <div>
              <Label className="text-xs">Reference # (optional)</Label>
              <Input
                value={depRef}
                onChange={(e) => setDepRef(e.target.value)}
                className="mt-1"
                placeholder="Cheque #, transfer ID…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeposit(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRecordDeposit}
              disabled={recordDeposit.isPending || !depAmount || !depDesc}
            >
              {recordDeposit.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Record Deposit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Disbursement Dialog */}
      <Dialog open={showDisbursement} onOpenChange={setShowDisbursement}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request Disbursement</DialogTitle>
            <DialogDescription>
              Prepare a disbursement request. It must be approved by a lawyer before funds are released.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Amount ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={disbAmount}
                onChange={(e) => setDisbAmount(e.target.value)}
                className="mt-1"
                placeholder="0.00"
              />
            </div>
            <div>
              <Label className="text-xs">Payee</Label>
              <Input
                value={disbPayee}
                onChange={(e) => setDisbPayee(e.target.value)}
                className="mt-1"
                placeholder="Payee name"
              />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input
                value={disbDesc}
                onChange={(e) => setDisbDesc(e.target.value)}
                className="mt-1"
                placeholder="Purpose of disbursement…"
              />
            </div>
            <div>
              <Label className="text-xs">Payment Method</Label>
              <Select value={disbMethod} onValueChange={setDisbMethod}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((pm) => (
                    <SelectItem key={pm.value} value={pm.value}>
                      {pm.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Authorisation Type</Label>
              <Select value={disbAuthType} onValueChange={setDisbAuthType}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUTHORIZATION_TYPES.map((at) => (
                    <SelectItem key={at.value} value={at.value}>
                      {at.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDisbursement(false)}>
              Cancel
            </Button>
            <Button
              onClick={handlePrepareDisbursement}
              disabled={
                prepareDisbursement.isPending ||
                !disbAmount ||
                !disbPayee ||
                !disbDesc
              }
            >
              {prepareDisbursement.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Disbursement Dialog */}
      <Dialog open={!!rejectingId} onOpenChange={() => setRejectingId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Disbursement</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this disbursement request.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs">Reason</Label>
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="mt-1"
              placeholder="Reason for rejection…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejectDisbursement.isPending || !rejectReason.trim()}
            >
              {rejectDisbursement.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
