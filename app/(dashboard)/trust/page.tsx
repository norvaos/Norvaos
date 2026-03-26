'use client'

import { useState, useMemo } from 'react'
import {
  DollarSign,
  Briefcase,
  ShieldCheck,
  CalendarCheck,
  Plus,
  ArrowDownToLine,
  ClipboardCheck,
  ScrollText,
  Users,
  ArrowUpDown,
  FileText,
  BookOpen,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
} from 'lucide-react'

import { useTenant } from '@/lib/hooks/use-tenant'
import { RequirePermission } from '@/components/require-permission'
import {
  useTrustAccounts,
  useTrustTransactions,
  useDisbursementRequests,
  useReconciliations,
  useCheques,
  useTrustReport,
  useRecordDeposit,
  usePrepareDisbursement,
  useCreateReconciliation,
  useApproveDisbursement,
  useRejectDisbursement,
} from '@/lib/queries/trust-accounting'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { NorvaWhisper } from '@/components/ui/norva-whisper'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { TenantDateInput } from '@/components/ui/tenant-date-input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(cents / 100)
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ' - '
  return new Date(dateStr).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return ' - '
  return new Date(dateStr).toLocaleString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
    pending: { variant: 'outline', label: 'Pending' },
    approved: { variant: 'default', label: 'Approved' },
    rejected: { variant: 'destructive', label: 'Rejected' },
    completed: { variant: 'default', label: 'Completed' },
    in_progress: { variant: 'secondary', label: 'In Progress' },
    draft: { variant: 'outline', label: 'Draft' },
    issued: { variant: 'default', label: 'Issued' },
    voided: { variant: 'destructive', label: 'Voided' },
    cleared: { variant: 'default', label: 'Cleared' },
    cancelled: { variant: 'destructive', label: 'Cancelled' },
  }
  const { variant, label } = config[status] ?? { variant: 'secondary' as const, label: status }
  return <Badge variant={variant}>{label}</Badge>
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TrustAccountingPage() {
  return (
    <RequirePermission entity="trust_accounting" action="view">
      <TrustDashboard />
    </RequirePermission>
  )
}

function TrustDashboard() {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''

  const [selectedAccountId, setSelectedAccountId] = useState<string>('')
  const [activeTab, setActiveTab] = useState('clients')

  // ── Dialogs ──
  const [depositDialogOpen, setDepositDialogOpen] = useState(false)
  const [disbursementDialogOpen, setDisbursementDialogOpen] = useState(false)
  const [reconciliationDialogOpen, setReconciliationDialogOpen] = useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectTargetId, setRejectTargetId] = useState('')
  const [rejectReason, setRejectReason] = useState('')

  // ── Data hooks ──
  const { data: accountsData, isLoading: accountsLoading } = useTrustAccounts()
  const accounts = (accountsData as { accounts?: unknown[] })?.accounts ?? []

  // Auto-select first account if none selected
  const effectiveAccountId = selectedAccountId || (accounts[0] as { id?: string })?.id || ''

  const { data: reportData, isLoading: reportLoading } = useTrustReport(
    'client_listing',
    effectiveAccountId ? { trustAccountId: effectiveAccountId } : {}
  )

  const { data: txnData, isLoading: txnLoading } = useTrustTransactions({
    trustAccountId: effectiveAccountId || undefined,
    pageSize: 25,
  })

  const { data: disbData, isLoading: disbLoading } = useDisbursementRequests({
    trustAccountId: effectiveAccountId || undefined,
    pageSize: 25,
  })

  const { data: reconData, isLoading: reconLoading } = useReconciliations({
    trustAccountId: effectiveAccountId || undefined,
    pageSize: 25,
  })

  const { data: chequeData, isLoading: chequeLoading } = useCheques({
    trustAccountId: effectiveAccountId || undefined,
    pageSize: 25,
  })

  const { data: auditData, isLoading: auditLoading } = useTrustReport(
    'audit_trail',
    effectiveAccountId ? { trustAccountId: effectiveAccountId } : {}
  )

  // ── Mutations ──
  const approveMutation = useApproveDisbursement()
  const rejectMutation = useRejectDisbursement()

  // ── Derived summary ──
  const reportEntries = ((reportData as { data?: unknown })?.data as unknown[]) ?? []
  const transactions = ((txnData as { transactions?: unknown[] })?.transactions) ?? []
  const disbursements = ((disbData as { requests?: unknown[] })?.requests) ?? []
  const reconciliations = ((reconData as { reconciliations?: unknown[] })?.reconciliations) ?? []
  const cheques = ((chequeData as { cheques?: unknown[] })?.cheques) ?? []
  const auditEntries = ((auditData as { data?: unknown })?.data as unknown[]) ?? []

  const totalBalanceCents = useMemo(
    () => reportEntries.reduce((sum: number, r: unknown) => sum + ((r as { balance_cents?: number }).balance_cents ?? 0), 0),
    [reportEntries]
  )

  const activeMatterCount = reportEntries.length

  const outstandingHolds = useMemo(
    () =>
      transactions.filter(
        (t: unknown) => (t as { hold_status?: string }).hold_status === 'held'
      ).length,
    [transactions]
  )

  const lastReconciliation = useMemo(() => {
    if (reconciliations.length === 0) return null
    return reconciliations[0] as { status?: string; period_end?: string; completed_at?: string }
  }, [reconciliations])

  const selectedAccount = useMemo(
    () => accounts.find((a: unknown) => (a as { id: string }).id === effectiveAccountId) as { id: string; account_name?: string; bank_name?: string } | undefined,
    [accounts, effectiveAccountId]
  )

  const isLoading = accountsLoading || reportLoading

  // ── Reject handler ──
  function handleReject() {
    if (!rejectTargetId || !rejectReason.trim()) {
      toast.error('Please provide a reason for rejection.')
      return
    }
    rejectMutation.mutate(
      { id: rejectTargetId, rejectionReason: rejectReason },
      {
        onSuccess: () => {
          setRejectDialogOpen(false)
          setRejectTargetId('')
          setRejectReason('')
        },
      }
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Page Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Norva Ledger
            <NorvaWhisper contentKey="ledger.trust" />
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage trust accounts, client balances, and regulatory compliance.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setDepositDialogOpen(true)}>
            <ArrowDownToLine className="mr-2 h-4 w-4" />
            Record Deposit
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDisbursementDialogOpen(true)}>
            <FileText className="mr-2 h-4 w-4" />
            Create Disbursement
          </Button>
          <Button size="sm" variant="outline" onClick={() => setReconciliationDialogOpen(true)}>
            <ClipboardCheck className="mr-2 h-4 w-4" />
            Start Reconciliation
          </Button>
        </div>
      </div>

      {/* ── Account Selector ────────────────────────────────────────── */}
      <div className="max-w-sm">
        <Label htmlFor="trust-account-select" className="text-sm font-medium text-slate-700 mb-1.5 block">
          Trust Account
        </Label>
        {accountsLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : accounts.length === 0 ? (
          <p className="text-sm text-slate-500">No trust accounts configured.</p>
        ) : (
          <Select
            value={effectiveAccountId}
            onValueChange={setSelectedAccountId}
          >
            <SelectTrigger id="trust-account-select">
              <SelectValue placeholder="Select a trust account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((acc: unknown) => {
                const a = acc as { id: string; account_name?: string; bank_name?: string }
                return (
                  <SelectItem key={a.id} value={a.id}>
                    {a.account_name ?? 'Unnamed Account'}  -  {a.bank_name ?? ''}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* ── Summary Cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Total Balance"
          value={isLoading ? undefined : formatCurrency(totalBalanceCents)}
          icon={DollarSign}
          iconColour="text-emerald-600"
          bgColour="bg-emerald-50"
        />
        <SummaryCard
          title="Active Matters"
          value={isLoading ? undefined : String(activeMatterCount)}
          icon={Briefcase}
          iconColour="text-blue-600"
          bgColour="bg-blue-50"
        />
        <SummaryCard
          title="Outstanding Holds"
          value={isLoading ? undefined : String(outstandingHolds)}
          icon={ShieldCheck}
          iconColour="text-amber-600"
          bgColour="bg-amber-50"
        />
        <SummaryCard
          title="Last Reconciliation"
          value={isLoading ? undefined : lastReconciliation ? formatDate(lastReconciliation.period_end) : 'Never'}
          icon={CalendarCheck}
          iconColour="text-purple-600"
          bgColour="bg-purple-50"
          badge={lastReconciliation ? lastReconciliation.status : undefined}
        />
      </div>

      {/* ── Tab Navigation ──────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="clients" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Client Listing
          </TabsTrigger>
          <TabsTrigger value="transactions" className="gap-1.5">
            <ArrowUpDown className="h-3.5 w-3.5" />
            Recent Transactions
          </TabsTrigger>
          <TabsTrigger value="disbursements" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Disbursement Requests
          </TabsTrigger>
          <TabsTrigger value="cheques" className="gap-1.5">
            <ScrollText className="h-3.5 w-3.5" />
            Cheque Register
          </TabsTrigger>
          <TabsTrigger value="reconciliation" className="gap-1.5">
            <ClipboardCheck className="h-3.5 w-3.5" />
            Reconciliation
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            Norva Vault
            <NorvaWhisper contentKey="vault.audit" className="ml-0.5" />
          </TabsTrigger>
        </TabsList>

        {/* ── Client Listing Tab ──────────────────────────────────── */}
        <TabsContent value="clients">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Client Trust Balances</CardTitle>
            </CardHeader>
            <CardContent>
              {reportLoading ? (
                <TableSkeleton rows={5} cols={4} />
              ) : reportEntries.length === 0 ? (
                <EmptyState message="No client balances for this account." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Matter</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead>Last Activity</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reportEntries.map((entry: unknown, i: number) => {
                        const e = entry as {
                          matter_id?: string
                          matter_title?: string
                          file_number?: string
                          client_name?: string
                          balance_cents?: number
                          last_activity?: string
                        }
                        return (
                          <TableRow key={e.matter_id ?? i}>
                            <TableCell className="font-medium">
                              {e.file_number ?? ' - '}{' '}
                              <span className="text-slate-500">{e.matter_title ?? ''}</span>
                            </TableCell>
                            <TableCell>{e.client_name ?? ' - '}</TableCell>
                            <TableCell className="text-right font-mono">
                              {formatCurrency(e.balance_cents ?? 0)}
                            </TableCell>
                            <TableCell>{formatDate(e.last_activity)}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Recent Transactions Tab ─────────────────────────────── */}
        <TabsContent value="transactions">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Trust Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              {txnLoading ? (
                <TableSkeleton rows={5} cols={6} />
              ) : transactions.length === 0 ? (
                <EmptyState message="No transactions recorded yet." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Matter</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((txn: unknown, i: number) => {
                        const t = txn as {
                          id?: string
                          effective_date?: string
                          transaction_type?: string
                          description?: string
                          matter_title?: string
                          file_number?: string
                          amount_cents?: number
                          status?: string
                          hold_status?: string
                        }
                        const isDebit = ['disbursement', 'withdrawal', 'refund'].includes(t.transaction_type ?? '')
                        return (
                          <TableRow key={t.id ?? i}>
                            <TableCell>{formatDate(t.effective_date)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize">
                                {(t.transaction_type ?? '').replace(/_/g, ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate">{t.description ?? ' - '}</TableCell>
                            <TableCell>{t.file_number ?? t.matter_title ?? ' - '}</TableCell>
                            <TableCell className={cn('text-right font-mono', isDebit ? 'text-red-600' : 'text-emerald-600')}>
                              {isDebit ? '- ' : '+ '}
                              {formatCurrency(Math.abs(t.amount_cents ?? 0))}
                            </TableCell>
                            <TableCell>
                              {t.hold_status === 'held' ? (
                                <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
                                  <Clock className="mr-1 h-3 w-3" />
                                  On Hold
                                </Badge>
                              ) : (
                                <StatusBadge status={t.status ?? 'completed'} />
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Disbursement Requests Tab ────────────────────────────── */}
        <TabsContent value="disbursements">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Disbursement Requests</CardTitle>
            </CardHeader>
            <CardContent>
              {disbLoading ? (
                <TableSkeleton rows={5} cols={7} />
              ) : disbursements.length === 0 ? (
                <EmptyState message="No disbursement requests found." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Payee</TableHead>
                        <TableHead>Matter</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {disbursements.map((d: unknown, i: number) => {
                        const req = d as {
                          id?: string
                          created_at?: string
                          payee_name?: string
                          matter_title?: string
                          file_number?: string
                          description?: string
                          amount_cents?: number
                          status?: string
                        }
                        const isPending = req.status === 'pending'
                        return (
                          <TableRow key={req.id ?? i}>
                            <TableCell>{formatDate(req.created_at)}</TableCell>
                            <TableCell className="font-medium">{req.payee_name ?? ' - '}</TableCell>
                            <TableCell>{req.file_number ?? req.matter_title ?? ' - '}</TableCell>
                            <TableCell className="max-w-[180px] truncate">{req.description ?? ' - '}</TableCell>
                            <TableCell className="text-right font-mono">
                              {formatCurrency(req.amount_cents ?? 0)}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={req.status ?? 'pending'} />
                            </TableCell>
                            <TableCell className="text-right">
                              {isPending && req.id && (
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
                                    onClick={() => approveMutation.mutate(req.id!)}
                                    disabled={approveMutation.isPending}
                                  >
                                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-red-700 hover:text-red-800 hover:bg-red-50"
                                    onClick={() => {
                                      setRejectTargetId(req.id!)
                                      setRejectDialogOpen(true)
                                    }}
                                    disabled={rejectMutation.isPending}
                                  >
                                    <XCircle className="mr-1 h-3.5 w-3.5" />
                                    Reject
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Cheque Register Tab ──────────────────────────────────── */}
        <TabsContent value="cheques">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cheque Register</CardTitle>
            </CardHeader>
            <CardContent>
              {chequeLoading ? (
                <TableSkeleton rows={5} cols={6} />
              ) : cheques.length === 0 ? (
                <EmptyState message="No cheques recorded for this account." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cheque #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Payee</TableHead>
                        <TableHead>Memo</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cheques.map((c: unknown, i: number) => {
                        const chq = c as {
                          id?: string
                          cheque_number?: string | number
                          issued_date?: string
                          payee_name?: string
                          memo?: string
                          amount_cents?: number
                          status?: string
                        }
                        return (
                          <TableRow key={chq.id ?? i}>
                            <TableCell className="font-mono">{chq.cheque_number ?? ' - '}</TableCell>
                            <TableCell>{formatDate(chq.issued_date)}</TableCell>
                            <TableCell className="font-medium">{chq.payee_name ?? ' - '}</TableCell>
                            <TableCell className="max-w-[200px] truncate">{chq.memo ?? ' - '}</TableCell>
                            <TableCell className="text-right font-mono">
                              {formatCurrency(chq.amount_cents ?? 0)}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={chq.status ?? 'issued'} />
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Reconciliation Tab ───────────────────────────────────── */}
        <TabsContent value="reconciliation">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Reconciliation History</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setReconciliationDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Start Reconciliation
              </Button>
            </CardHeader>
            <CardContent>
              {reconLoading ? (
                <TableSkeleton rows={4} cols={5} />
              ) : reconciliations.length === 0 ? (
                <EmptyState message="No reconciliations recorded. Start your first reconciliation above." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Period</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Book Balance</TableHead>
                        <TableHead className="text-right">Bank Balance</TableHead>
                        <TableHead>Completed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reconciliations.map((r: unknown, i: number) => {
                        const rec = r as {
                          id?: string
                          period_start?: string
                          period_end?: string
                          status?: string
                          book_balance_cents?: number
                          bank_balance_cents?: number
                          completed_at?: string
                        }
                        const isBalanced =
                          rec.book_balance_cents != null &&
                          rec.bank_balance_cents != null &&
                          rec.book_balance_cents === rec.bank_balance_cents
                        return (
                          <TableRow key={rec.id ?? i}>
                            <TableCell>
                              {formatDate(rec.period_start)}  -  {formatDate(rec.period_end)}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={rec.status ?? 'draft'} />
                              {rec.status === 'completed' && !isBalanced && (
                                <Badge variant="destructive" className="ml-1.5 text-xs">
                                  <AlertTriangle className="mr-1 h-3 w-3" />
                                  Variance
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {rec.book_balance_cents != null ? formatCurrency(rec.book_balance_cents) : ' - '}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {rec.bank_balance_cents != null ? formatCurrency(rec.bank_balance_cents) : ' - '}
                            </TableCell>
                            <TableCell>{formatDateTime(rec.completed_at)}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Audit Trail Tab ─────────────────────────────────────── */}
        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Norva Vault  -  Trust Audit Trail</CardTitle>
            </CardHeader>
            <CardContent>
              {auditLoading ? (
                <TableSkeleton rows={5} cols={5} />
              ) : auditEntries.length === 0 ? (
                <EmptyState message="No audit entries for this account." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Timestamp</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Details</TableHead>
                        <TableHead>Reference</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditEntries.map((entry: unknown, i: number) => {
                        const e = entry as {
                          id?: string
                          created_at?: string
                          action?: string
                          user_name?: string
                          user_email?: string
                          details?: string
                          reference_type?: string
                          reference_id?: string
                        }
                        return (
                          <TableRow key={e.id ?? i}>
                            <TableCell className="whitespace-nowrap">{formatDateTime(e.created_at)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize">
                                {(e.action ?? '').replace(/_/g, ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell>{e.user_name ?? e.user_email ?? ' - '}</TableCell>
                            <TableCell className="max-w-[250px] truncate">{e.details ?? ' - '}</TableCell>
                            <TableCell className="text-xs text-slate-500">
                              {e.reference_type ? `${e.reference_type}:${e.reference_id ?? ''}` : ' - '}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Record Deposit Dialog ───────────────────────────────────── */}
      <RecordDepositDialog
        open={depositDialogOpen}
        onOpenChange={setDepositDialogOpen}
        trustAccountId={effectiveAccountId}
      />

      {/* ── Create Disbursement Dialog ──────────────────────────────── */}
      <CreateDisbursementDialog
        open={disbursementDialogOpen}
        onOpenChange={setDisbursementDialogOpen}
        trustAccountId={effectiveAccountId}
      />

      {/* ── Start Reconciliation Dialog ─────────────────────────────── */}
      <StartReconciliationDialog
        open={reconciliationDialogOpen}
        onOpenChange={setReconciliationDialogOpen}
        trustAccountId={effectiveAccountId}
      />

      {/* ── Reject Disbursement Dialog ──────────────────────────────── */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Disbursement</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting this disbursement request. This will be recorded in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="reject-reason">Reason for Rejection</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Insufficient documentation provided"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejectMutation.isPending || !rejectReason.trim()}
            >
              {rejectMutation.isPending ? 'Rejecting...' : 'Reject Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({
  title,
  value,
  icon: Icon,
  iconColour,
  bgColour,
  badge,
}: {
  title: string
  value: string | undefined
  icon: React.ElementType
  iconColour: string
  bgColour: string
  badge?: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', bgColour)}>
          <Icon className={cn('h-5 w-5', iconColour)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-500">{title}</p>
          {value === undefined ? (
            <Skeleton className="mt-1 h-6 w-24" />
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-lg font-semibold text-slate-900 truncate">{value}</p>
              {badge && <StatusBadge status={badge} />}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <DollarSign className="mb-3 h-10 w-10 text-slate-300" />
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  )
}

// ─── Table Skeleton ───────────────────────────────────────────────────────────

function TableSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── Record Deposit Dialog ────────────────────────────────────────────────────

function RecordDepositDialog({
  open,
  onOpenChange,
  trustAccountId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  trustAccountId: string
}) {
  const depositMutation = useRecordDeposit()

  const [matterId, setMatterId] = useState('')
  const [amountStr, setAmountStr] = useState('')
  const [description, setDescription] = useState('')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cheque')

  function handleSubmit() {
    const amountCents = Math.round(parseFloat(amountStr) * 100)
    if (!matterId.trim() || isNaN(amountCents) || amountCents <= 0 || !description.trim()) {
      toast.error('Please fill in all required fields.')
      return
    }

    depositMutation.mutate(
      {
        trustAccountId,
        matterId: matterId.trim(),
        amountCents,
        description: description.trim(),
        referenceNumber: referenceNumber.trim() || undefined,
        paymentMethod,
      },
      {
        onSuccess: () => {
          onOpenChange(false)
          setMatterId('')
          setAmountStr('')
          setDescription('')
          setReferenceNumber('')
          setPaymentMethod('cheque')
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Trust Deposit</DialogTitle>
          <DialogDescription>
            Record a deposit into the selected trust account. All deposits are logged in the audit trail.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="deposit-matter">Matter ID *</Label>
            <Input
              id="deposit-matter"
              value={matterId}
              onChange={(e) => setMatterId(e.target.value)}
              placeholder="Enter matter ID"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="deposit-amount">Amount (CAD) *</Label>
            <Input
              id="deposit-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="deposit-description">Description *</Label>
            <Input
              id="deposit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Retainer deposit from client"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="deposit-reference">Reference Number</Label>
            <Input
              id="deposit-reference"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="deposit-method">Payment Method</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger id="deposit-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="eft">EFT / Wire</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank_draft">Bank Draft</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={depositMutation.isPending}>
            {depositMutation.isPending ? 'Recording...' : 'Record Deposit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Create Disbursement Dialog ───────────────────────────────────────────────

function CreateDisbursementDialog({
  open,
  onOpenChange,
  trustAccountId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  trustAccountId: string
}) {
  const disbursementMutation = usePrepareDisbursement()

  const [matterId, setMatterId] = useState('')
  const [payeeName, setPayeeName] = useState('')
  const [amountStr, setAmountStr] = useState('')
  const [description, setDescription] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cheque')

  function handleSubmit() {
    const amountCents = Math.round(parseFloat(amountStr) * 100)
    if (!matterId.trim() || !payeeName.trim() || isNaN(amountCents) || amountCents <= 0 || !description.trim()) {
      toast.error('Please fill in all required fields.')
      return
    }

    disbursementMutation.mutate(
      {
        trustAccountId,
        matterId: matterId.trim(),
        payeeName: payeeName.trim(),
        amountCents,
        description: description.trim(),
        paymentMethod,
      },
      {
        onSuccess: () => {
          onOpenChange(false)
          setMatterId('')
          setPayeeName('')
          setAmountStr('')
          setDescription('')
          setPaymentMethod('cheque')
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Disbursement Request</DialogTitle>
          <DialogDescription>
            Prepare a disbursement request. It must be approved before funds are released.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="disb-matter">Matter ID *</Label>
            <Input
              id="disb-matter"
              value={matterId}
              onChange={(e) => setMatterId(e.target.value)}
              placeholder="Enter matter ID"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="disb-payee">Payee Name *</Label>
            <Input
              id="disb-payee"
              value={payeeName}
              onChange={(e) => setPayeeName(e.target.value)}
              placeholder="e.g. Ministry of Finance"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="disb-amount">Amount (CAD) *</Label>
            <Input
              id="disb-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="disb-description">Description *</Label>
            <Input
              id="disb-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Government filing fee"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="disb-method">Payment Method</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger id="disb-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="eft">EFT / Wire</SelectItem>
                <SelectItem value="bank_draft">Bank Draft</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={disbursementMutation.isPending}>
            {disbursementMutation.isPending ? 'Creating...' : 'Create Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Start Reconciliation Dialog ──────────────────────────────────────────────

function StartReconciliationDialog({
  open,
  onOpenChange,
  trustAccountId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  trustAccountId: string
}) {
  const reconMutation = useCreateReconciliation()

  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')

  function handleSubmit() {
    if (!periodStart || !periodEnd) {
      toast.error('Please select both start and end dates.')
      return
    }
    if (new Date(periodEnd) <= new Date(periodStart)) {
      toast.error('End date must be after start date.')
      return
    }

    reconMutation.mutate(
      {
        trustAccountId,
        periodStart,
        periodEnd,
      },
      {
        onSuccess: () => {
          onOpenChange(false)
          setPeriodStart('')
          setPeriodEnd('')
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start Reconciliation</DialogTitle>
          <DialogDescription>
            Begin a trust account reconciliation for the selected period. You will compare book and bank balances.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="recon-start">Period Start *</Label>
            <TenantDateInput
              id="recon-start"
              value={periodStart}
              onChange={(iso) => setPeriodStart(iso)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="recon-end">Period End *</Label>
            <TenantDateInput
              id="recon-end"
              value={periodEnd}
              onChange={(iso) => setPeriodEnd(iso)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={reconMutation.isPending}>
            {reconMutation.isPending ? 'Creating...' : 'Start Reconciliation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
