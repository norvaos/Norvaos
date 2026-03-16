'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  useBillingStats,
  useInvoices,
  useCreateTimeEntry,
  useUpdateInvoiceStatus,
  useRecordPayment,
  useSendInvoice,
  useSendReceipt,
  type InvoiceWithMatter,
} from '@/lib/queries/invoicing'
import { useMatters } from '@/lib/queries/matters'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { RequirePermission } from '@/components/require-permission'
import { formatDate } from '@/lib/utils/formatters'
import { INVOICE_STATUSES, PAYMENT_METHODS } from '@/lib/utils/constants'
import { EmptyState } from '@/components/shared/empty-state'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  DollarSign,
  Clock,
  AlertTriangle,
  TrendingUp,
  FileText,
  Plus,
  Loader2,
  Receipt,
} from 'lucide-react'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

function getStatusColor(status: string): string {
  const found = INVOICE_STATUSES.find((s) => s.value === status)
  return found?.color ?? '#6b7280'
}

function getStatusLabel(status: string): string {
  const found = INVOICE_STATUSES.find((s) => s.value === status)
  return found?.label ?? status
}

// ── Record Payment Dialog ────────────────────────────────────────────────────

function RecordPaymentDialog({
  invoice,
  tenantId,
  onClose,
}: {
  invoice: InvoiceWithMatter | null
  tenantId: string
  onClose: () => void
}) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('bank_transfer')
  const [reference, setReference] = useState('')
  const recordPayment = useRecordPayment()

  if (!invoice) return null

  const remaining = invoice.total_amount - invoice.amount_paid

  const handleSubmit = async () => {
    const amountCents = Math.round(parseFloat(amount) * 100)
    if (isNaN(amountCents) || amountCents <= 0) return

    await recordPayment.mutateAsync({
      tenant_id: tenantId,
      invoice_id: invoice.id,
      amount: amountCents,
      payment_method: method,
      reference: reference || undefined,
    })
    onClose()
  }

  return (
    <Dialog open={!!invoice} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            Invoice #{invoice.invoice_number} — Balance: {fmtCents(remaining)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Amount ($)</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              max={(remaining / 100).toFixed(2)}
              placeholder={(remaining / 100).toFixed(2)}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Payment Method</Label>
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
            <Label>Reference (optional)</Label>
            <Input
              placeholder="Cheque #, transaction ID..."
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="mt-1"
            />
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

// ── Quick Time Entry Form ────────────────────────────────────────────────────

function QuickTimeEntry({ tenantId, userId }: { tenantId: string; userId: string }) {
  const [matterId, setMatterId] = useState('')
  const [hours, setHours] = useState('')
  const [minutes, setMinutes] = useState('')
  const [description, setDescription] = useState('')
  const [billable, setBillable] = useState(true)
  const [rate, setRate] = useState('')

  const { data: mattersData } = useMatters({ tenantId, status: 'active', pageSize: 100 })
  const matters = mattersData?.matters ?? []
  const createTimeEntry = useCreateTimeEntry()

  const handleSubmit = async () => {
    const totalMinutes = (parseInt(hours || '0') * 60) + parseInt(minutes || '0')
    if (!matterId || totalMinutes <= 0 || !description.trim()) return

    await createTimeEntry.mutateAsync({
      tenant_id: tenantId,
      matter_id: matterId,
      user_id: userId,
      duration_minutes: totalMinutes,
      description: description.trim(),
      is_billable: billable,
      hourly_rate: rate ? parseFloat(rate) : undefined,
    })

    setHours('')
    setMinutes('')
    setDescription('')
    setRate('')
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Clock className="h-4 w-4" /> Quick Time Entry
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label className="text-xs">Matter</Label>
          <Select value={matterId} onValueChange={setMatterId}>
            <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="Select matter..." /></SelectTrigger>
            <SelectContent>
              {matters.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.matter_number ? `${m.matter_number} — ` : ''}{m.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Hours</Label>
            <Input
              type="number"
              min="0"
              placeholder="0"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="mt-1 h-9 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Minutes</Label>
            <Input
              type="number"
              min="0"
              max="59"
              placeholder="0"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="mt-1 h-9 text-sm"
            />
          </div>
        </div>
        <div>
          <Label className="text-xs">Rate ($/hr)</Label>
          <Input
            type="number"
            step="0.01"
            placeholder="Optional"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="mt-1 h-9 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">Description</Label>
          <Input
            placeholder="What did you work on?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 h-9 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="billable"
            checked={billable}
            onCheckedChange={(v) => setBillable(v === true)}
          />
          <label htmlFor="billable" className="text-xs font-medium cursor-pointer">
            Billable
          </label>
        </div>
        <Button
          size="sm"
          className="w-full"
          onClick={handleSubmit}
          disabled={createTimeEntry.isPending || !matterId || !description.trim()}
        >
          {createTimeEntry.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          Log Time
        </Button>
      </CardContent>
    </Card>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function BillingPage() {
  return (
    <RequirePermission entity="billing" action="view">
      <BillingPageContent />
    </RequirePermission>
  )
}

function BillingPageContent() {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''
  const { appUser } = useUser()
  const router = useRouter()
  const [paymentInvoice, setPaymentInvoice] = useState<InvoiceWithMatter | null>(null)

  const { data: stats, isLoading: statsLoading } = useBillingStats(tenantId)
  const { data: invoices, isLoading: invoicesLoading } = useInvoices(tenantId)
  const updateStatus = useUpdateInvoiceStatus()
  const sendInvoice = useSendInvoice()
  const sendReceipt = useSendReceipt()

  return (
    <div className="space-y-6 p-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
          <p className="text-sm text-muted-foreground">
            Track time, manage invoices, and record payments
          </p>
        </div>
        <Button onClick={() => router.push('/billing/invoices/new')}>
          <Plus className="h-4 w-4 mr-1" /> New Invoice
        </Button>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100">
              <DollarSign className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Outstanding</p>
              {statsLoading ? <Skeleton className="h-5 w-16 mt-0.5" /> : (
                <p className="text-lg font-semibold">{fmtCents(stats?.totalOutstanding ?? 0)}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100">
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Overdue</p>
              {statsLoading ? <Skeleton className="h-5 w-16 mt-0.5" /> : (
                <p className="text-lg font-semibold">{fmtCents(stats?.totalOverdue ?? 0)}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Collected (Month)</p>
              {statsLoading ? <Skeleton className="h-5 w-16 mt-0.5" /> : (
                <p className="text-lg font-semibold">{fmtCents(stats?.collectedThisMonth ?? 0)}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100">
              <Clock className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Unbilled Hours</p>
              {statsLoading ? <Skeleton className="h-5 w-10 mt-0.5" /> : (
                <p className="text-lg font-semibold">{stats?.unbilledHours ?? 0}h</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Main Content: Invoices + Quick Time Entry ── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Left: Recent Invoices */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" /> Recent Invoices
            </CardTitle>
          </CardHeader>
          <CardContent>
            {invoicesLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : !invoices?.length ? (
              <EmptyState
                icon={Receipt}
                title="No invoices yet"
                description="Create your first invoice from a matter's Billing tab"
              />
            ) : (
              <div className="space-y-1">
                {/* Header */}
                <div className="grid grid-cols-[80px_1fr_100px_100px_90px_120px] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground border-b">
                  <span>Invoice #</span>
                  <span>Matter</span>
                  <span className="text-right">Amount</span>
                  <span className="text-right">Paid</span>
                  <span>Status</span>
                  <span>Actions</span>
                </div>
                {/* Rows */}
                {invoices.slice(0, 20).map((inv) => (
                  <div
                    key={inv.id}
                    className="grid grid-cols-[80px_1fr_100px_100px_90px_120px] gap-2 px-3 py-2.5 text-sm rounded-md hover:bg-slate-50 cursor-pointer items-center"
                    onClick={() => router.push(`/billing/invoices/${inv.id}`)}
                  >
                    <span className="font-mono text-xs">{inv.invoice_number || 'Draft'}</span>
                    <span className="truncate text-xs">
                      {inv.matter_number ? `${inv.matter_number} — ` : ''}{inv.matter_title}
                    </span>
                    <span className="text-right font-medium text-xs">{fmtCents(inv.total_amount)}</span>
                    <span className="text-right text-xs text-muted-foreground">{fmtCents(inv.amount_paid)}</span>
                    <Badge
                      variant="outline"
                      className="text-xs py-0 w-fit"
                      style={{ borderColor: getStatusColor(inv.status), color: getStatusColor(inv.status) }}
                    >
                      {getStatusLabel(inv.status)}
                    </Badge>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      {inv.status === 'finalized' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs px-2"
                          onClick={() => sendInvoice.mutate({ invoiceId: inv.id })}
                          disabled={sendInvoice.isPending}
                        >
                          {sendInvoice.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                          Send
                        </Button>
                      )}
                      {['sent', 'viewed', 'overdue', 'partially_paid'].includes(inv.status) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs px-2"
                          onClick={() => setPaymentInvoice(inv)}
                        >
                          Pay
                        </Button>
                      )}
                      {inv.status === 'paid' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs px-2"
                          onClick={() => sendReceipt.mutate({ invoiceId: inv.id })}
                          disabled={sendReceipt.isPending}
                        >
                          {sendReceipt.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                          Send Receipt
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Quick Time Entry */}
        <QuickTimeEntry tenantId={tenantId} userId={appUser?.id ?? ''} />
      </div>

      {/* Record Payment Dialog */}
      <RecordPaymentDialog
        invoice={paymentInvoice}
        tenantId={tenantId}
        onClose={() => setPaymentInvoice(null)}
      />
    </div>
  )
}
