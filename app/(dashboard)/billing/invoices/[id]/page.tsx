'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useInvoiceDetail, useInvoiceAuditLog, useInvoiceTrustAllocations, useInvoiceAdjustments, useFinalizeInvoice, useVoidInvoice, billingKeys, useInvoicePaymentPlan, useApprovePaymentPlan, useCancelPaymentPlan, usePayInstalment } from '@/lib/queries/invoicing'
import type { PaymentPlanWithInstalments } from '@/lib/queries/invoicing'
import { useSendInvoice } from '@/lib/queries/invoicing'
import { useTenant } from '@/lib/hooks/use-tenant'
import { RequirePermission } from '@/components/require-permission'
import { formatDate } from '@/lib/utils/formatters'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  ArrowLeft,
  Download,
  Send,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  CreditCard,
  AlertTriangle,
  Loader2,
  History,
  Wallet,
  CalendarClock,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCents(cents: number | null | undefined, currency = 'CAD'): string {
  if (cents == null) return ' - '
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  finalized: { label: 'Finalised', variant: 'outline' },
  sent: { label: 'Sent', variant: 'default' },
  viewed: { label: 'Viewed', variant: 'default' },
  partially_paid: { label: 'Partially Paid', variant: 'default' },
  paid: { label: 'Paid', variant: 'default' },
  overdue: { label: 'Overdue', variant: 'destructive' },
  void: { label: 'Void', variant: 'secondary' },
  written_off: { label: 'Written Off', variant: 'secondary' },
  cancelled: { label: 'Cancelled', variant: 'secondary' },
}

// ── Line Items Table ──────────────────────────────────────────────────────────

function LineItemsTable({ items }: { items: Array<{ description: string; quantity: number; unit_price: number; amount: number; line_category?: string | null }> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="py-2 text-left font-medium">Description</th>
            <th className="py-2 text-left font-medium">Category</th>
            <th className="py-2 text-right font-medium">Qty</th>
            <th className="py-2 text-right font-medium">Unit Price</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((li, i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="py-2 pr-4">{li.description}</td>
              <td className="py-2 pr-4 text-muted-foreground capitalize">
                {(li.line_category ?? 'professional_fees').replace(/_/g, ' ')}
              </td>
              <td className="py-2 text-right">{li.quantity}</td>
              <td className="py-2 text-right">{fmtCents(li.unit_price)}</td>
              <td className="py-2 text-right font-medium">{fmtCents(li.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Payments Table ────────────────────────────────────────────────────────────

function PaymentsTable({ payments }: { payments: Array<{ payment_date: string; payment_method: string; amount: number; reference?: string | null; voided_at?: string | null }> }) {
  if (payments.length === 0) {
    return <p className="text-sm text-muted-foreground">No payments recorded.</p>
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-muted-foreground">
          <th className="py-2 text-left font-medium">Date</th>
          <th className="py-2 text-left font-medium">Method</th>
          <th className="py-2 text-left font-medium">Reference</th>
          <th className="py-2 text-right font-medium">Amount</th>
          <th className="py-2 text-right font-medium">Status</th>
        </tr>
      </thead>
      <tbody>
        {payments.map((p, i) => (
          <tr key={i} className="border-b last:border-0">
            <td className="py-2">{formatDate(p.payment_date)}</td>
            <td className="py-2 capitalize">{p.payment_method.replace(/_/g, ' ')}</td>
            <td className="py-2 text-muted-foreground">{p.reference ?? ' - '}</td>
            <td className="py-2 text-right">{fmtCents(p.amount)}</td>
            <td className="py-2 text-right">
              {p.voided_at ? (
                <Badge variant="secondary">Voided</Badge>
              ) : (
                <Badge variant="default">Applied</Badge>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Audit Log ─────────────────────────────────────────────────────────────────

function AuditLogPanel({ invoiceId }: { invoiceId: string }) {
  const { data: log, isLoading } = useInvoiceAuditLog(invoiceId)
  if (isLoading) return <Skeleton className="h-32 w-full" />
  if (!log?.length) return <p className="text-sm text-muted-foreground">No audit events yet.</p>
  return (
    <ol className="relative border-l border-border pl-4 space-y-3">
      {log.map((entry) => (
        <li key={entry.id} className="relative">
          <span className="absolute -left-[17px] top-1 h-3 w-3 rounded-full bg-muted-foreground/40" />
          <p className="text-sm font-medium capitalize">{entry.event_type.replace(/_/g, ' ')}</p>
          <p className="text-xs text-muted-foreground">{entry.event_description}</p>
          <p className="text-xs text-muted-foreground">{formatDate(entry.performed_at, 'datetime')}</p>
        </li>
      ))}
    </ol>
  )
}

// ── Trust Allocations Panel ───────────────────────────────────────────────────

const ALLOCATION_STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Pending', variant: 'outline' },
  confirmed: { label: 'Confirmed', variant: 'default' },
  failed: { label: 'Failed', variant: 'destructive' },
  cancelled: { label: 'Cancelled', variant: 'secondary' },
}

function TrustAllocationsPanel({ invoiceId }: { invoiceId: string }) {
  const { data: allocations, isLoading } = useInvoiceTrustAllocations(invoiceId)
  if (isLoading) return <Skeleton className="h-32 w-full" />
  if (!allocations?.length) return <p className="text-sm text-muted-foreground">No trust allocations for this invoice.</p>
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-muted-foreground">
          <th className="py-2 text-left font-medium">Date</th>
          <th className="py-2 text-left font-medium">Notes</th>
          <th className="py-2 text-right font-medium">Amount</th>
          <th className="py-2 text-right font-medium">Status</th>
        </tr>
      </thead>
      <tbody>
        {allocations.map((a) => {
          const badge = ALLOCATION_STATUS_BADGE[a.allocation_status] ?? { label: a.allocation_status, variant: 'secondary' as const }
          return (
            <tr key={a.id} className="border-b last:border-0">
              <td className="py-2">{formatDate(a.created_at)}</td>
              <td className="py-2 text-muted-foreground">{a.notes ?? ' - '}</td>
              <td className="py-2 text-right">{fmtCents(a.amount_cents)}</td>
              <td className="py-2 text-right">
                <Badge variant={badge.variant}>{badge.label}</Badge>
                {a.allocation_status === 'pending' && (
                  <span className="ml-2 text-xs text-muted-foreground">(not yet applied to balance)</span>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── Payment Plan Panel ────────────────────────────────────────────────────────

const INSTALMENT_STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Pending', variant: 'outline' },
  paid: { label: 'Paid', variant: 'default' },
  cancelled: { label: 'Cancelled', variant: 'secondary' },
}

function PaymentPlanPanel({ invoiceId, tenantId }: { invoiceId: string; tenantId: string }) {
  const { data: plan, isLoading } = useInvoicePaymentPlan(invoiceId)
  const approveMutation = useApprovePaymentPlan()
  const cancelMutation = useCancelPaymentPlan()
  const payMutation = usePayInstalment()

  if (isLoading) return <Skeleton className="h-32 w-full" />
  if (!plan) return (
    <p className="text-sm text-muted-foreground">No active payment plan for this invoice.</p>
  )

  const today = new Date().toISOString().split('T')[0]
  const isPlanApproved = !!plan.approved_by

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">
            {plan.instalments_paid} of {plan.instalments_total} instalments paid
            {' '}· {plan.frequency}
          </p>
          <p className="text-xs text-muted-foreground">
            Total: {fmtCents(plan.total_amount_cents)} · Next due: {plan.next_due_date}
          </p>
        </div>
        <div className="flex gap-2">
          {!isPlanApproved && (
            <Button
              size="sm"
              variant="outline"
              disabled={approveMutation.isPending}
              onClick={() => approveMutation.mutate({ planId: plan.id, invoiceId })}
            >
              {approveMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Approve Plan
            </Button>
          )}
          <Button
            size="sm"
            variant="destructive"
            disabled={cancelMutation.isPending}
            onClick={() => cancelMutation.mutate({ planId: plan.id, invoiceId })}
          >
            {cancelMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Cancel Plan
          </Button>
        </div>
      </div>

      {!isPlanApproved && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-950/30 px-3 py-2 text-xs text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Plan not yet approved  -  instalment payments are blocked until approved.
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="py-2 text-left font-medium">#</th>
            <th className="py-2 text-left font-medium">Due Date</th>
            <th className="py-2 text-right font-medium">Amount</th>
            <th className="py-2 text-right font-medium">Status</th>
            <th className="py-2 text-right font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {plan.instalments.map((inst) => {
            const isOverdue = inst.status === 'pending' && inst.due_date < today
            const badge = INSTALMENT_STATUS_BADGE[inst.status] ?? { label: inst.status, variant: 'secondary' as const }
            return (
              <tr key={inst.id} className="border-b last:border-0">
                <td className="py-2 text-muted-foreground">{inst.instalment_number}</td>
                <td className="py-2">
                  {formatDate(inst.due_date)}
                  {isOverdue && (
                    <span className="ml-2 text-xs font-medium text-destructive">overdue</span>
                  )}
                </td>
                <td className="py-2 text-right">{fmtCents(inst.amount_cents)}</td>
                <td className="py-2 text-right">
                  <Badge variant={isOverdue && inst.status === 'pending' ? 'destructive' : badge.variant}>
                    {isOverdue && inst.status === 'pending' ? 'Overdue' : badge.label}
                  </Badge>
                </td>
                <td className="py-2 text-right">
                  {inst.status === 'pending' && isPlanApproved && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={payMutation.isPending}
                      onClick={() =>
                        payMutation.mutate({
                          planId: plan.id,
                          instalmentId: inst.id,
                          invoiceId,
                          paymentMethod: 'cheque',
                        })
                      }
                    >
                      Record Payment
                    </Button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Void Dialog ───────────────────────────────────────────────────────────────

function VoidDialog({
  open,
  onClose,
  invoiceId,
}: {
  open: boolean
  onClose: () => void
  invoiceId: string
}) {
  const [reason, setReason] = useState('')
  const voidMutation = useVoidInvoice()

  const handleVoid = async () => {
    await voidMutation.mutateAsync({ invoiceId, reason })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void Invoice</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Voiding this invoice is permanent. This action cannot be undone for invoices with payments.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="void-reason">Reason for voiding <span className="text-destructive">*</span></Label>
            <Textarea
              id="void-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Duplicate invoice, client requested cancellation..."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || voidMutation.isPending}
            onClick={handleVoid}
          >
            {voidMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Void Invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

function InvoiceDetailContent() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { tenant } = useTenant()
  const [showVoidDialog, setShowVoidDialog] = useState(false)

  const { data: invoice, isLoading, error } = useInvoiceDetail(id)
  const finalizeMutation = useFinalizeInvoice()
  const sendMutation = useSendInvoice()

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="p-6">
        <p className="text-destructive">Invoice not found or you do not have access.</p>
        <Button variant="link" onClick={() => router.push('/billing')}>← Back to Billing</Button>
      </div>
    )
  }

  const status = invoice.status ?? ''
  const statusBadge = STATUS_BADGE[status] ?? { label: status, variant: 'secondary' as const }
  const canFinalize = status === 'draft'
  const canSend = status === 'finalized'
  const canVoid = !['paid', 'void', 'written_off', 'cancelled'].includes(status)
  const isClosed = ['paid', 'void', 'written_off', 'cancelled'].includes(status)
  const outstanding = (invoice.total_amount ?? 0) - (invoice.amount_paid ?? 0)

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/billing')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {invoice.invoice_number
                ? `Invoice ${invoice.invoice_number}`
                : `Draft Invoice`}
            </h1>
            <p className="text-sm text-muted-foreground">{(invoice as any).matter_title ?? 'Unknown Matter'}</p>
          </div>
          <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(`/api/invoices/${id}/pdf`, '_blank')}
          >
            <Download className="h-4 w-4 mr-1" /> PDF
          </Button>
          {canFinalize && (
            <Button
              size="sm"
              disabled={finalizeMutation.isPending}
              onClick={() => finalizeMutation.mutate({ invoiceId: id })}
            >
              {finalizeMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              <CheckCircle className="h-4 w-4 mr-1" /> Finalise
            </Button>
          )}
          {canSend && (
            <Button
              size="sm"
              disabled={sendMutation.isPending}
              onClick={() => sendMutation.mutate({ invoiceId: id })}
            >
              {sendMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              <Send className="h-4 w-4 mr-1" /> Send to Client
            </Button>
          )}
          {canVoid && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowVoidDialog(true)}
            >
              <XCircle className="h-4 w-4 mr-1" /> Void
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-xl font-bold">{fmtCents(invoice.total_amount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Paid</p>
            <p className="text-xl font-bold text-green-600">{fmtCents(invoice.amount_paid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className={`text-xl font-bold ${outstanding > 0 ? 'text-destructive' : ''}`}>
              {fmtCents(outstanding)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Due Date</p>
            <p className="text-xl font-bold">
              {invoice.due_date ? formatDate(invoice.due_date) : ' - '}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="lines">
        <TabsList>
          <TabsTrigger value="lines">
            <FileText className="h-4 w-4 mr-1" /> Line Items
          </TabsTrigger>
          <TabsTrigger value="payments">
            <CreditCard className="h-4 w-4 mr-1" /> Payments
          </TabsTrigger>
          <TabsTrigger value="plan">
            <CalendarClock className="h-4 w-4 mr-1" /> Payment Plan
          </TabsTrigger>
          <TabsTrigger value="trust">
            <Wallet className="h-4 w-4 mr-1" /> Trust Allocations
          </TabsTrigger>
          <TabsTrigger value="audit">
            <History className="h-4 w-4 mr-1" /> Norva Vault
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lines" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              <LineItemsTable items={invoice.line_items.map((li) => ({
                description: li.description,
                quantity: li.quantity ?? 0,
                unit_price: li.unit_price ?? 0,
                amount: li.amount ?? 0,
                line_category: li.line_category,
              }))} />
              <Separator className="my-4" />
              <div className="space-y-1 text-sm max-w-xs ml-auto">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{fmtCents(invoice.subtotal)}</span>
                </div>
                {(invoice.tax_amount ?? 0) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax</span>
                    <span>{fmtCents(invoice.tax_amount)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold">
                  <span>Total</span>
                  <span>{fmtCents(invoice.total_amount)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              <PaymentsTable payments={invoice.payments.map((p) => ({
                payment_date: p.created_at ?? '',
                payment_method: p.payment_method ?? '',
                amount: p.amount ?? 0,
                reference: p.external_payment_id ?? null,
                voided_at: p.voided_at ?? null,
              }))} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plan" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payment Plan</CardTitle>
            </CardHeader>
            <CardContent>
              <PaymentPlanPanel invoiceId={id} tenantId={tenant?.id ?? ''} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trust" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Trust Allocations</CardTitle>
            </CardHeader>
            <CardContent>
              <TrustAllocationsPanel invoiceId={id} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              <AuditLogPanel invoiceId={id} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Void Dialog */}
      <VoidDialog
        open={showVoidDialog}
        onClose={() => setShowVoidDialog(false)}
        invoiceId={id}
      />
    </div>
  )
}

export default function InvoiceDetailPage() {
  return (
    <RequirePermission entity="billing" action="view">
      <InvoiceDetailContent />
    </RequirePermission>
  )
}
