'use client'

import { useState } from 'react'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import {
  useCollectionActions,
  useLogCollectionAction,
  usePaymentPlans,
  useCreatePaymentPlan,
  usePaymentPlanAction,
  useRequestWriteOff,
  useWriteOffAction,
} from '@/lib/queries/analytics'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { TenantDateInput } from '@/components/ui/tenant-date-input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, Phone, Mail, FileText, AlertTriangle, CreditCard, Plus, Check, X } from 'lucide-react'
import { toast } from 'sonner'

interface CollectionActionsPanelProps {
  invoiceId: string
  matterId?: string
  contactId: string
  invoiceTotal: number // dollars
  balanceDue: number // dollars
  agingBucket?: string
}

const ACTION_TYPES = [
  { value: 'phone_call', label: 'Phone Call', icon: Phone },
  { value: 'email_sent', label: 'Email Sent', icon: Mail },
  { value: 'reminder_sent', label: 'Reminder Sent', icon: Mail },
  { value: 'demand_letter', label: 'Demand Letter', icon: FileText },
  { value: 'escalated', label: 'Escalated', icon: AlertTriangle },
  { value: 'note', label: 'Note', icon: FileText },
] as const

const FREQUENCIES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
] as const

function fmtDollars(dollars: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(dollars)
}

function fmtCents(cents: number): string {
  return fmtDollars(cents / 100)
}

function agingBadgeVariant(bucket: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (bucket) {
    case 'current': return 'secondary'
    case '31_60': return 'outline'
    case '61_90': return 'default'
    case '91_120':
    case '120_plus': return 'destructive'
    default: return 'secondary'
  }
}

function agingLabel(bucket: string): string {
  const labels: Record<string, string> = {
    current: 'Current',
    '31_60': '31-60 Days',
    '61_90': '61-90 Days',
    '91_120': '91-120 Days',
    '120_plus': '120+ Days',
  }
  return labels[bucket] ?? bucket
}

function actionLabel(type: string): string {
  const labels: Record<string, string> = {
    reminder_sent: 'Reminder Sent',
    phone_call: 'Phone Call',
    email_sent: 'Email Sent',
    demand_letter: 'Demand Letter',
    payment_plan_offered: 'Payment Plan Offered',
    write_off_requested: 'Write-Off Requested',
    write_off_approved: 'Write-Off Approved',
    write_off_rejected: 'Write-Off Rejected',
    escalated: 'Escalated',
    note: 'Note',
  }
  return labels[type] ?? type
}

function planStatusBadge(status: string) {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    active: 'default',
    completed: 'secondary',
    defaulted: 'destructive',
    cancelled: 'outline',
  }
  return <Badge variant={variants[status] ?? 'outline'}>{status}</Badge>
}

export function CollectionActionsPanel({
  invoiceId,
  matterId,
  contactId,
  invoiceTotal,
  balanceDue,
  agingBucket = 'current',
}: CollectionActionsPanelProps) {
  const { tenant } = useTenant()
  const { appUser } = useUser()
  const [showLogDialog, setShowLogDialog] = useState(false)
  const [showPlanDialog, setShowPlanDialog] = useState(false)
  const [showWriteOffDialog, setShowWriteOffDialog] = useState(false)

  // Log action form state
  const [actionType, setActionType] = useState('')
  const [actionNotes, setActionNotes] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')

  // Payment plan form state
  const [planAmount, setPlanAmount] = useState('')
  const [planInstalment, setPlanInstalment] = useState('')
  const [planFrequency, setPlanFrequency] = useState('monthly')
  const [planStartDate, setPlanStartDate] = useState('')
  const [planNotes, setPlanNotes] = useState('')

  // Write-off form state
  const [writeOffAmount, setWriteOffAmount] = useState('')
  const [writeOffReason, setWriteOffReason] = useState('')

  const actionsQuery = useCollectionActions(invoiceId)
  const plansQuery = usePaymentPlans({ invoice_id: invoiceId })
  const logAction = useLogCollectionAction()
  const createPlan = useCreatePaymentPlan()
  const planAction = usePaymentPlanAction()
  const requestWriteOff = useRequestWriteOff()
  const writeOffAction = useWriteOffAction()

  const handleLogAction = async () => {
    if (!actionType) return
    logAction.mutate(
      {
        invoice_id: invoiceId,
        matter_id: matterId,
        action_type: actionType,
        notes: actionNotes || undefined,
        next_follow_up_date: followUpDate || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Collection action logged')
          setShowLogDialog(false)
          setActionType('')
          setActionNotes('')
          setFollowUpDate('')
        },
        onError: (err: Error) => toast.error(err.message),
      },
    )
  }

  const handleCreatePlan = async () => {
    const totalCents = Math.round(parseFloat(planAmount) * 100)
    const instalmentCents = Math.round(parseFloat(planInstalment) * 100)
    if (!totalCents || !instalmentCents || !planStartDate) return

    createPlan.mutate(
      {
        invoice_id: invoiceId,
        matter_id: matterId,
        client_contact_id: contactId,
        total_amount_cents: totalCents,
        instalment_amount_cents: instalmentCents,
        frequency: planFrequency,
        start_date: planStartDate,
        instalments_total: Math.ceil(totalCents / instalmentCents),
        notes: planNotes || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Payment plan created')
          setShowPlanDialog(false)
          setPlanAmount('')
          setPlanInstalment('')
          setPlanFrequency('monthly')
          setPlanStartDate('')
          setPlanNotes('')
        },
        onError: (err: Error) => toast.error(err.message),
      },
    )
  }

  const handleRequestWriteOff = async () => {
    const amountCents = Math.round(parseFloat(writeOffAmount) * 100)
    if (!amountCents || !writeOffReason) return

    requestWriteOff.mutate(
      { invoice_id: invoiceId, amount_cents: amountCents, reason: writeOffReason },
      {
        onSuccess: () => {
          toast.success('Write-off request submitted for partner approval')
          setShowWriteOffDialog(false)
          setWriteOffAmount('')
          setWriteOffReason('')
        },
        onError: (err: Error) => toast.error(err.message),
      },
    )
  }

  const handlePlanAction = (planId: string, action: string) => {
    planAction.mutate(
      { id: planId, action },
      {
        onSuccess: () => toast.success(`Payment plan ${action === 'record_payment' ? 'payment recorded' : action + 'd'}`),
        onError: (err: Error) => toast.error(err.message),
      },
    )
  }

  const handleWriteOffAction = (actionId: string, action: 'approve' | 'reject', _reason?: string) => {
    writeOffAction.mutate(
      { id: actionId, action },
      {
        onSuccess: () => toast.success(`Write-off ${action}d`),
        onError: (err: Error) => toast.error(err.message),
      },
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with aging status */}
      <div className="flex items-centre justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">Collections</h3>
          <Badge variant={agingBadgeVariant(agingBucket)}>{agingLabel(agingBucket)}</Badge>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowLogDialog(true)}>
            <Plus className="mr-1 h-3 w-3" /> Log Action
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowPlanDialog(true)}>
            <CreditCard className="mr-1 h-3 w-3" /> Payment Plan
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setShowWriteOffDialog(true)}>
            <AlertTriangle className="mr-1 h-3 w-3" /> Write Off
          </Button>
        </div>
      </div>

      <Tabs defaultValue="actions">
        <TabsList>
          <TabsTrigger value="actions">Action Log</TabsTrigger>
          <TabsTrigger value="plans">Payment Plans</TabsTrigger>
        </TabsList>

        {/* Action Log Tab */}
        <TabsContent value="actions">
          <Card>
            <CardContent className="p-4">
              {actionsQuery.isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : !actionsQuery.data?.actions?.length ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No collection actions recorded yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {(actionsQuery.data.actions as any[]).map((action: any) => (
                    <div key={action.id} className="flex items-start justify-between border-b pb-3 last:border-0">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{actionLabel(action.action_type)}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(action.performed_at).toLocaleDateString('en-CA')}
                          </span>
                        </div>
                        {action.notes && (
                          <p className="text-sm text-muted-foreground mt-1">{action.notes}</p>
                        )}
                        {action.next_follow_up_date && (
                          <p className="text-xs text-amber-600 mt-1">
                            Follow-up: {new Date(action.next_follow_up_date).toLocaleDateString('en-CA')}
                          </p>
                        )}
                      </div>
                      {action.action_type === 'write_off_requested' && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-green-600"
                            onClick={() => handleWriteOffAction(action.id, 'approve')}
                            disabled={writeOffAction.isPending}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600"
                            onClick={() => handleWriteOffAction(action.id, 'reject', 'Rejected by reviewer')}
                            disabled={writeOffAction.isPending}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payment Plans Tab */}
        <TabsContent value="plans">
          <Card>
            <CardContent className="p-4">
              {plansQuery.isLoading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : !plansQuery.data?.plans?.length ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No payment plans created yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {(plansQuery.data.plans as any[]).map((plan: any) => (
                    <div key={plan.id} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {planStatusBadge(plan.status)}
                          <span className="text-sm font-medium">
                            {fmtCents(plan.instalment_amount_cents)} / {plan.frequency}
                          </span>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {plan.instalments_paid} / {plan.instalments_total} instalments
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Total: {fmtCents(plan.total_amount_cents)}</span>
                        <span>Next due: {plan.next_due_date ? new Date(plan.next_due_date).toLocaleDateString('en-CA') : ' - '}</span>
                      </div>
                      {/* Progress bar */}
                      <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${(plan.instalments_paid / plan.instalments_total) * 100}%` }}
                        />
                      </div>
                      {plan.status === 'active' && (
                        <div className="flex gap-2 mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePlanAction(plan.id, 'record_payment')}
                            disabled={planAction.isPending}
                          >
                            {planAction.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Record Payment'}
                          </Button>
                          {!plan.approved_by && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handlePlanAction(plan.id, 'approve')}
                              disabled={planAction.isPending}
                            >
                              Approve
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Log Action Dialog */}
      <Dialog open={showLogDialog} onOpenChange={setShowLogDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Collection Action</DialogTitle>
            <DialogDescription>Record a follow-up action for this invoice.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Action Type</Label>
              <Select value={actionType} onValueChange={setActionType}>
                <SelectTrigger><SelectValue placeholder="Select action..." /></SelectTrigger>
                <SelectContent>
                  {ACTION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={actionNotes} onChange={(e) => setActionNotes(e.target.value)} placeholder="Details about this action..." />
            </div>
            <div>
              <Label>Next Follow-Up Date</Label>
              <TenantDateInput value={followUpDate} onChange={(iso) => setFollowUpDate(iso)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLogDialog(false)}>Cancel</Button>
            <Button onClick={handleLogAction} disabled={!actionType || logAction.isPending}>
              {logAction.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Log Action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Plan Dialog */}
      <Dialog open={showPlanDialog} onOpenChange={setShowPlanDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Payment Plan</DialogTitle>
            <DialogDescription>
              Set up an instalment plan for the outstanding balance of {fmtDollars(balanceDue)}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Total Amount ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={planAmount}
                  onChange={(e) => setPlanAmount(e.target.value)}
                  placeholder={balanceDue.toFixed(2)}
                />
              </div>
              <div>
                <Label>Instalment Amount ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={planInstalment}
                  onChange={(e) => setPlanInstalment(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Frequency</Label>
                <Select value={planFrequency} onValueChange={setPlanFrequency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Start Date</Label>
                <TenantDateInput value={planStartDate} onChange={(iso) => setPlanStartDate(iso)} />
              </div>
            </div>
            {planAmount && planInstalment && (
              <p className="text-sm text-muted-foreground">
                {Math.ceil(parseFloat(planAmount) / parseFloat(planInstalment))} instalments of {fmtDollars(parseFloat(planInstalment))}
              </p>
            )}
            <div>
              <Label>Notes</Label>
              <Textarea value={planNotes} onChange={(e) => setPlanNotes(e.target.value)} placeholder="Optional notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPlanDialog(false)}>Cancel</Button>
            <Button
              onClick={handleCreatePlan}
              disabled={!planAmount || !planInstalment || !planStartDate || createPlan.isPending}
            >
              {createPlan.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Write-Off Dialog */}
      <Dialog open={showWriteOffDialog} onOpenChange={setShowWriteOffDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Write-Off</DialogTitle>
            <DialogDescription>
              Request partner approval to write off a portion of the outstanding balance.
              Balance due: {fmtDollars(balanceDue)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Write-Off Amount ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={writeOffAmount}
                onChange={(e) => setWriteOffAmount(e.target.value)}
                max={balanceDue}
              />
            </div>
            <div>
              <Label>Reason (required)</Label>
              <Textarea
                value={writeOffReason}
                onChange={(e) => setWriteOffReason(e.target.value)}
                placeholder="Explain why this amount should be written off..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWriteOffDialog(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleRequestWriteOff}
              disabled={!writeOffAmount || !writeOffReason || requestWriteOff.isPending}
            >
              {requestWriteOff.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Submit for Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
