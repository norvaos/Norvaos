'use client'

import { useState } from 'react'
import { useUser } from '@/lib/hooks/use-user'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Plus, Trash2, Loader2, FileDown, CheckCircle2, Clock, AlertCircle, DollarSign, Lock } from 'lucide-react'
import { NorvaWhisper } from '@/components/ui/norva-whisper'
import { formatDate, formatCurrency } from '@/lib/utils/formatters'
import { INVOICE_STATUSES, PAYMENT_METHODS } from '@/lib/utils/constants'
import {
  useTimeEntries,
  useUnbilledTimeEntries,
  useCreateTimeEntry,
  useDeleteTimeEntry,
  useInvoices,
  useCreateInvoice,
  useUpdateInvoiceStatus,
  useDeleteInvoice,
  useRecordPayment,
  useSendInvoice,
  useSendReceipt,
  useMatterRetainerSummary,
  useRecordMatterRetainerPayment,
  type MatterRetainerSummary,
} from '@/lib/queries/invoicing'
import { GovernmentDisbursementCard } from '@/components/trust/government-disbursement-card'
import type { Database } from '@/lib/types/database'

type MatterRow = Database['public']['Tables']['matters']['Row']

function fmtCents(cents: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2 }).format(cents / 100)
}

// ── Retainer Agreement Card ───────────────────────────────────────────────────

function RetainerAgreementCard({ matterId }: { matterId: string }) {
  const { data: summary, isLoading } = useMatterRetainerSummary(matterId)
  const recordPayment = useRecordMatterRetainerPayment(matterId)
  const [showPayDialog, setShowPayDialog] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('e_transfer')
  const [payRef, setPayRef] = useState('')

  if (isLoading) {
    return <Skeleton className="h-28 w-full" />
  }

  if (!summary) return null

  const profServicesTotal = (summary.lineItems ?? []).reduce(
    (s: number, i: MatterRetainerSummary['lineItems'][number]) => s + (Number(i.amount) || Number(i.unitPrice) * Number(i.quantity) || 0),
    0,
  )
  const govtFeesTotal = (summary.governmentFees ?? []).reduce(
    (s: number, i: MatterRetainerSummary['governmentFees'][number]) => s + Number(i.amount),
    0,
  )
  const disbTotal = (summary.disbursements ?? []).reduce(
    (s: number, i: MatterRetainerSummary['disbursements'][number]) => s + Number(i.amount),
    0,
  )

  const isFullyPaid = summary.paymentStatus === 'paid'
  const isPartial = summary.paymentStatus === 'partial'

  const statusBadge = isFullyPaid
    ? { label: 'Paid in Full', icon: CheckCircle2, cls: 'text-green-700 bg-green-50 border-green-200' }
    : isPartial
    ? { label: 'Partial Payment', icon: Clock, cls: 'text-amber-700 bg-amber-50 border-amber-200' }
    : { label: 'Payment Pending', icon: AlertCircle, cls: 'text-orange-700 bg-orange-50 border-orange-200' }

  const handleRecord = async () => {
    const cents = Math.round(parseFloat(payAmount) * 100)
    if (isNaN(cents) || cents <= 0) return
    await recordPayment.mutateAsync({ amount: cents, paymentMethod: payMethod, reference: payRef || undefined })
    setShowPayDialog(false)
    setPayAmount('')
    setPayRef('')
  }

  return (
    <>
      <Card className="border-blue-200 bg-blue-50/30">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold">
              Retainer Agreement
              <NorvaWhisper contentKey="ledger.retainer" />
            </CardTitle>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusBadge.cls}`}
            >
              <statusBadge.icon className="h-3 w-3" />
              {statusBadge.label}
            </span>
          </div>
          {!isFullyPaid && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowPayDialog(true)}>
              <DollarSign className="mr-1 h-3 w-3" />
              Record Payment
            </Button>
          )}
        </CardHeader>

        <CardContent className="pt-0">
          {/* Fee breakdown table */}
          <div className="rounded-md border border-blue-100 bg-white overflow-hidden text-sm">
            {profServicesTotal > 0 && (
              <div className="flex justify-between items-center px-3 py-2 border-b border-slate-100">
                <span className="text-muted-foreground text-xs">Professional Services</span>
                <span className="font-medium text-xs">{fmtCents(profServicesTotal)}</span>
              </div>
            )}
            {govtFeesTotal > 0 && (
              <div className="flex justify-between items-center px-3 py-2 border-b border-slate-100">
                <span className="text-muted-foreground text-xs">Government Fees</span>
                <span className="font-medium text-xs">{fmtCents(govtFeesTotal)}</span>
              </div>
            )}
            {disbTotal > 0 && (
              <div className="flex justify-between items-center px-3 py-2 border-b border-slate-100">
                <span className="text-muted-foreground text-xs">Disbursements</span>
                <span className="font-medium text-xs">{fmtCents(disbTotal)}</span>
              </div>
            )}
            {summary.hstApplicable && summary.taxAmountCents > 0 && (
              <div className="flex justify-between items-center px-3 py-2 border-b border-slate-100">
                <span className="text-muted-foreground text-xs">HST/Tax</span>
                <span className="font-medium text-xs">{fmtCents(summary.taxAmountCents)}</span>
              </div>
            )}
            <div className="flex justify-between items-center px-3 py-2 bg-slate-50 border-b border-slate-100">
              <span className="font-semibold text-xs">Total Agreed</span>
              <span className="font-bold text-sm">{fmtCents(summary.totalAmountCents)}</span>
            </div>
            <div className="flex justify-between items-center px-3 py-2 border-b border-slate-100">
              <span className="text-green-700 text-xs font-medium">Paid to Date</span>
              <span className="text-green-700 font-semibold text-xs">{fmtCents(summary.paymentAmount)}</span>
            </div>
            <div className="flex justify-between items-center px-3 py-2">
              <span className={`text-xs font-semibold ${summary.balanceCents > 0 ? 'text-orange-700' : 'text-green-700'}`}>
                Balance Due
              </span>
              <span className={`font-bold text-sm ${summary.balanceCents > 0 ? 'text-orange-700' : 'text-green-700'}`}>
                {summary.balanceCents > 0 ? fmtCents(summary.balanceCents) : 'Paid in Full'}
              </span>
            </div>
          </div>

          {/* Payment terms */}
          {summary.paymentTerms && (
            <p className="text-xs text-muted-foreground mt-2">
              <span className="font-medium">Terms:</span> {summary.paymentTerms}
            </p>
          )}

          {/* Signed date */}
          {summary.signedAt && (
            <p className="text-xs text-muted-foreground mt-1">
              <span className="font-medium">Signed:</span> {new Date(summary.signedAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Record Retainer Payment Dialog */}
      <Dialog open={showPayDialog} onOpenChange={setShowPayDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Retainer Payment</DialogTitle>
            <DialogDescription>
              Balance remaining: <strong>{fmtCents(summary.balanceCents)}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Amount Received ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder={`e.g. ${(summary.balanceCents / 100).toFixed(2)}`}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Payment Method</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
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
              <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} className="mt-1" placeholder="Cheque #, transfer ID…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPayDialog(false)}>Cancel</Button>
            <Button onClick={handleRecord} disabled={recordPayment.isPending || !payAmount}>
              {recordPayment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function BillingTab({ matterId, tenantId, matter }: { matterId: string; tenantId: string; matter: MatterRow }) {
  const { appUser } = useUser()
  const [showLogTime, setShowLogTime] = useState(false)
  const [showCreateInvoice, setShowCreateInvoice] = useState(false)
  const [showPayment, setShowPayment] = useState<string | null>(null)

  // Time entry form state
  const [teHours, setTeHours] = useState('')
  const [teMinutes, setTeMinutes] = useState('')
  const [teDesc, setTeDesc] = useState('')
  const [teRate, setTeRate] = useState(matter.hourly_rate?.toString() ?? '')
  const [teBillable, setTeBillable] = useState(true)

  // Invoice form state
  const [invNotes, setInvNotes] = useState('')
  const [invDueDays, setInvDueDays] = useState('30')
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set())

  // Payment form state
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('bank_transfer')
  const [payRef, setPayRef] = useState('')

  const { data: timeEntries = [], isLoading: teLoading } = useTimeEntries(tenantId, matterId)
  const { data: unbilledEntries = [] } = useUnbilledTimeEntries(tenantId, matterId)
  const { data: invoices = [], isLoading: invLoading } = useInvoices(tenantId, matterId)
  const createTimeEntry = useCreateTimeEntry()
  const deleteTimeEntry = useDeleteTimeEntry()
  const createInvoice = useCreateInvoice()
  const updateStatus = useUpdateInvoiceStatus()
  const deleteInvoice = useDeleteInvoice()
  const recordPayment = useRecordPayment()
  const sendInvoice = useSendInvoice()
  const sendReceipt = useSendReceipt()

  const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null)

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

  const outstanding = (matter.total_billed ?? 0) - (matter.total_paid ?? 0)

  // ── Log Time Handler ──
  const handleLogTime = async () => {
    const totalMin = (parseInt(teHours || '0') * 60) + parseInt(teMinutes || '0')
    if (totalMin <= 0 || !teDesc.trim()) return
    await createTimeEntry.mutateAsync({
      tenant_id: tenantId,
      matter_id: matterId,
      user_id: appUser?.id ?? '',
      duration_minutes: totalMin,
      description: teDesc.trim(),
      is_billable: teBillable,
      hourly_rate: teRate ? parseFloat(teRate) : undefined,
    })
    setTeHours(''); setTeMinutes(''); setTeDesc(''); setShowLogTime(false)
  }

  // ── Create Invoice Handler ──
  const handleCreateInvoice = async () => {
    const entries = unbilledEntries.filter((e) => selectedEntries.has(e.id))
    if (entries.length === 0) return
    const now = new Date()
    const dueDate = new Date(now.getTime() + parseInt(invDueDays) * 86400000)
    const invoiceNumber = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`

    const lineItems = entries.map((e) => ({
      description: e.description,
      quantity: Math.round((e.duration_minutes / 60) * 100) / 100,
      unitPrice: Math.round((e.hourly_rate ?? matter.hourly_rate ?? 0) * 100),
      timeEntryId: e.id,
    }))

    await createInvoice.mutateAsync({
      tenantId,
      matterId,
      invoiceNumber,
      issueDate: now.toISOString().split('T')[0],
      dueDate: dueDate.toISOString().split('T')[0],
      notes: invNotes || undefined,
      lineItems,
    })
    setSelectedEntries(new Set()); setInvNotes(''); setShowCreateInvoice(false)
  }

  // ── Record Payment Handler ──
  const handleRecordPayment = async () => {
    if (!showPayment) return
    const amountCents = Math.round(parseFloat(payAmount) * 100)
    if (isNaN(amountCents) || amountCents <= 0) return
    const payInvoice = invoices.find((inv) => inv.id === showPayment)
    await recordPayment.mutateAsync({
      tenant_id: tenantId,
      invoice_id: showPayment,
      contact_id: payInvoice?.contact_id ?? '',
      amount: amountCents,
      payment_method: payMethod,
      external_payment_id: payRef || undefined,
    })
    setPayAmount(''); setPayRef(''); setShowPayment(null)
  }

  const toggleEntry = (id: string) => {
    setSelectedEntries((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectAllUnbilled = () => {
    setSelectedEntries(new Set(unbilledEntries.map((e) => e.id)))
  }

  const invoiceStatusColor = (status: string) => INVOICE_STATUSES.find((s) => s.value === status)?.color ?? '#6b7280'
  const invoiceStatusLabel = (status: string) => INVOICE_STATUSES.find((s) => s.value === status)?.label ?? status

  // Fee snapshot & tax info from matter (added by migration 153)
  const feeSnapshot = (matter as any).fee_snapshot as { template_name: string; snapshotted_at: string } | null
  const taxLabel = (matter as any).tax_label as string | null
  const taxRate = (matter as any).tax_rate as number | null
  const applicantLocation = (matter as any).applicant_location as string | null

  const isOutsideCanada = applicantLocation ? applicantLocation.toLowerCase() === 'outside_canada' : false

  return (
    <div className="space-y-6">
      {/* Snapshot indicator  -  shows when fees were locked */}
      {feeSnapshot && (
        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <Lock className="h-3.5 w-3.5 text-slate-500 shrink-0" />
          <span className="text-sm text-slate-600">
            Fees locked from &lsquo;{feeSnapshot.template_name}&rsquo; template on{' '}
            {new Date(feeSnapshot.snapshotted_at).toLocaleDateString('en-CA', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </span>
          {/* Tax badge */}
          {isOutsideCanada ? (
            <Badge variant="outline" className="ml-auto text-xs border-emerald-200 text-emerald-700 bg-emerald-50">
              Zero-rated (non-resident)
            </Badge>
          ) : taxLabel && taxRate != null ? (
            <Badge variant="outline" className="ml-auto text-xs border-slate-300 text-slate-700">
              {applicantLocation}  -  {taxLabel} {taxRate}%
            </Badge>
          ) : null}
        </div>
      )}

      {/* Retainer Agreement (fee breakdown from signing) */}
      <RetainerAgreementCard matterId={matterId} />

      {/* Government Fee Disbursement */}
      <GovernmentDisbursementCard matterId={matterId} />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Billed</p><p className="text-lg font-semibold">{formatCurrency(matter.total_billed)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Paid</p><p className="text-lg font-semibold">{formatCurrency(matter.total_paid)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Outstanding</p><p className="text-lg font-semibold">{formatCurrency(outstanding)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Trust Balance</p><p className="text-lg font-semibold">{formatCurrency(matter.trust_balance)}</p></CardContent></Card>
      </div>

      {/* Time Entries Section */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Time Entries</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setShowLogTime(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Log Time
          </Button>
        </CardHeader>
        <CardContent>
          {teLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : timeEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No time entries yet</p>
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-[80px_60px_70px_70px_1fr_60px_50px] gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground border-b">
                <span>Date</span><span>Duration</span><span>Rate</span><span>Amount</span><span>Description</span><span>Billable</span><span></span>
              </div>
              {timeEntries.slice(0, 30).map((te) => {
                const hrs = Math.floor(te.duration_minutes / 60)
                const mins = te.duration_minutes % 60
                const amount = te.hourly_rate ? (te.duration_minutes / 60) * Number(te.hourly_rate) : 0
                return (
                  <div key={te.id} className="grid grid-cols-[80px_60px_70px_70px_1fr_60px_50px] gap-2 px-2 py-2 text-sm items-center rounded hover:bg-slate-50">
                    <span className="text-xs">{formatDate(te.entry_date)}</span>
                    <span className="text-xs">{hrs}h {mins > 0 ? `${mins}m` : ''}</span>
                    <span className="text-xs">{te.hourly_rate ? `$${Number(te.hourly_rate).toFixed(0)}` : ' - '}</span>
                    <span className="text-xs font-medium">{amount > 0 ? `$${amount.toFixed(2)}` : ' - '}</span>
                    <span className="text-xs truncate">{te.description}</span>
                    <span>{te.is_billable ? <Badge variant="outline" className="text-xs py-0">{te.invoice_id ? 'Billed' : 'Yes'}</Badge> : <span className="text-xs text-muted-foreground">No</span>}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteTimeEntry.mutate(te.id)} disabled={!!te.invoice_id}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoices Section */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Invoices</CardTitle>
          <Button size="sm" onClick={() => { selectAllUnbilled(); setShowCreateInvoice(true) }} disabled={unbilledEntries.length === 0}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Create Invoice
          </Button>
        </CardHeader>
        <CardContent>
          {invLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No invoices yet</p>
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-[90px_80px_90px_90px_80px_1fr] gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground border-b">
                <span>Invoice #</span><span>Date</span><span>Amount</span><span>Paid</span><span>Status</span><span>Actions</span>
              </div>
              {invoices.map((inv) => (
                <div key={inv.id} className="grid grid-cols-[90px_80px_90px_90px_80px_1fr] gap-2 px-2 py-2 text-sm items-center rounded hover:bg-slate-50">
                  <span className="font-mono text-xs">{inv.invoice_number}</span>
                  <span className="text-xs">{formatDate(inv.issue_date)}</span>
                  <span className="text-xs font-medium">{fmtCents(inv.total_amount ?? 0)}</span>
                  <span className="text-xs">{fmtCents(inv.amount_paid ?? 0)}</span>
                  <Badge variant="outline" className="text-xs py-0 w-fit" style={{ borderColor: invoiceStatusColor(inv.status ?? ''), color: invoiceStatusColor(inv.status ?? '') }}>
                    {invoiceStatusLabel(inv.status ?? '')}
                  </Badge>
                  <div className="flex gap-1">
                    {inv.status === 'finalized' && (
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2" disabled={sendInvoice.isPending} onClick={() => sendInvoice.mutate({ invoiceId: inv.id })}>
                        {sendInvoice.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}Send Invoice
                      </Button>
                    )}
                    {inv.status === 'draft' && (
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2 text-red-500" onClick={() => deleteInvoice.mutate(inv.id)}>Delete</Button>
                    )}
                    {['sent', 'viewed', 'overdue'].includes(inv.status ?? '') && (
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setShowPayment(inv.id)}>Record Payment</Button>
                    )}
                    {inv.status === 'paid' && (
                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2" disabled={sendReceipt.isPending} onClick={() => sendReceipt.mutate({ invoiceId: inv.id })}>
                        {sendReceipt.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}Send Receipt
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs px-2"
                      disabled={downloadingPdf === inv.id}
                      onClick={() => handleDownloadPdf(inv.id)}
                    >
                      {downloadingPdf === inv.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <FileDown className="mr-1 h-3 w-3" />}
                      Download PDF
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log Time Dialog */}
      <Dialog open={showLogTime} onOpenChange={setShowLogTime}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Log Time</DialogTitle><DialogDescription>Add a time entry for this matter</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Hours</Label><Input type="number" min="0" value={teHours} onChange={(e) => setTeHours(e.target.value)} className="mt-1" /></div>
              <div><Label className="text-xs">Minutes</Label><Input type="number" min="0" max="59" value={teMinutes} onChange={(e) => setTeMinutes(e.target.value)} className="mt-1" /></div>
            </div>
            <div><Label className="text-xs">Rate ($/hr)</Label><Input type="number" step="0.01" value={teRate} onChange={(e) => setTeRate(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-xs">Description</Label><Input value={teDesc} onChange={(e) => setTeDesc(e.target.value)} className="mt-1" placeholder="Work performed..." /></div>
            <div className="flex items-center gap-2"><Checkbox id="te-billable" checked={teBillable} onCheckedChange={(v) => setTeBillable(v === true)} /><label htmlFor="te-billable" className="text-sm">Billable</label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLogTime(false)}>Cancel</Button>
            <Button onClick={handleLogTime} disabled={createTimeEntry.isPending}>
              {createTimeEntry.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Log Time
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Invoice Dialog */}
      <Dialog open={showCreateInvoice} onOpenChange={setShowCreateInvoice}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Create Invoice</DialogTitle><DialogDescription>Select time entries to include</DialogDescription></DialogHeader>
          <div className="space-y-4">
            {unbilledEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No unbilled time entries</p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1 border rounded-md p-2">
                {unbilledEntries.map((e) => {
                  const hrs = Math.floor(e.duration_minutes / 60)
                  const mins = e.duration_minutes % 60
                  const amt = e.hourly_rate ? (e.duration_minutes / 60) * Number(e.hourly_rate) : 0
                  return (
                    <div key={e.id} className="flex items-center gap-2 py-1 text-sm">
                      <Checkbox checked={selectedEntries.has(e.id)} onCheckedChange={() => toggleEntry(e.id)} />
                      <span className="text-xs flex-1 truncate">{e.description}</span>
                      <span className="text-xs text-muted-foreground">{hrs}h{mins > 0 ? ` ${mins}m` : ''}</span>
                      <span className="text-xs font-medium">{amt > 0 ? `$${amt.toFixed(2)}` : ' - '}</span>
                    </div>
                  )
                })}
              </div>
            )}
            <div><Label className="text-xs">Payment Terms (days)</Label><Input type="number" value={invDueDays} onChange={(e) => setInvDueDays(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-xs">Notes (optional)</Label><Input value={invNotes} onChange={(e) => setInvNotes(e.target.value)} className="mt-1" placeholder="Additional notes..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateInvoice(false)}>Cancel</Button>
            <Button onClick={handleCreateInvoice} disabled={createInvoice.isPending || selectedEntries.size === 0}>
              {createInvoice.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={!!showPayment} onOpenChange={() => setShowPayment(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Amount ($)</Label><Input type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="mt-1" /></div>
            <div>
              <Label className="text-xs">Method</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_METHODS.map((pm) => <SelectItem key={pm.value} value={pm.value}>{pm.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Reference</Label><Input value={payRef} onChange={(e) => setPayRef(e.target.value)} className="mt-1" placeholder="Optional" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPayment(null)}>Cancel</Button>
            <Button onClick={handleRecordPayment} disabled={recordPayment.isPending || !payAmount}>
              {recordPayment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
