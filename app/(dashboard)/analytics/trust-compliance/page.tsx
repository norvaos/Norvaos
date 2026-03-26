'use client'

import {
  DollarSign,
  Building2,
  ShieldCheck,
  Briefcase,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
} from 'lucide-react'

import { useTenant } from '@/lib/hooks/use-tenant'
import { RequirePermission } from '@/components/require-permission'
import { useTrustCompliance, type TrustComplianceData } from '@/lib/queries/analytics'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDollars(cents: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(cents / 100)
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ' - '
  return new Date(dateStr).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function fmtDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return ' - '
  return new Date(dateStr).toLocaleString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─── Skeleton Loader ─────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Summary cards skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-5 rounded" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table skeletons */}
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-5 w-48" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 4 }).map((_, j) => (
              <Skeleton key={j} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
        <p className="text-lg font-medium text-muted-foreground">
          All clear  -  no compliance issues detected
        </p>
      </CardContent>
    </Card>
  )
}

// ─── Severity Badge ──────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: 'info' | 'warning' | 'critical' }) {
  const variants: Record<typeof severity, { label: string; className: string }> = {
    info: { label: 'Info', className: 'bg-blue-100 text-blue-800 hover:bg-blue-100' },
    warning: { label: 'Warning', className: 'bg-amber-100 text-amber-800 hover:bg-amber-100' },
    critical: { label: 'Critical', className: 'bg-red-100 text-red-800 hover:bg-red-100' },
  }
  const v = variants[severity]
  return <Badge className={v.className}>{v.label}</Badge>
}

function SeverityIcon({ severity }: { severity: 'info' | 'warning' | 'critical' }) {
  switch (severity) {
    case 'critical':
      return <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
    case 'warning':
      return <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
    default:
      return <Info className="h-5 w-5 text-blue-500 shrink-0" />
  }
}

// ─── Reconciliation Status Badge ─────────────────────────────────────────────

function ReconciliationBadge({ status }: { status: 'ok' | 'warning' | 'overdue' }) {
  const map: Record<typeof status, { label: string; className: string }> = {
    ok: { label: 'Current', className: 'bg-green-100 text-green-800 hover:bg-green-100' },
    warning: { label: 'Due Soon', className: 'bg-amber-100 text-amber-800 hover:bg-amber-100' },
    overdue: { label: 'Overdue', className: 'bg-red-100 text-red-800 hover:bg-red-100' },
  }
  const v = map[status]
  return <Badge className={v.className}>{v.label}</Badge>
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function TrustCompliancePage() {
  const { tenant } = useTenant()
  const { data: response, isLoading } = useTrustCompliance()
  const data = response?.data ?? null

  const hasIssues =
    data &&
    (data.reconciliation_alerts.some((a: TrustComplianceData['reconciliation_alerts'][number]) => a.status !== 'ok') ||
      data.stale_balances.length > 0 ||
      data.overdue_holds.length > 0 ||
      data.pending_disbursements.length > 0 ||
      data.anomalies.length > 0)

  return (
    <RequirePermission entity="trust_accounting" action="view">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trust Compliance Dashboard</h1>
          <p className="text-muted-foreground">LSO By-Law 9 Compliance Monitoring</p>
        </div>

        {isLoading && <DashboardSkeleton />}

        {data && !hasIssues && <EmptyState />}

        {data && (
          <>
            {/* ── Summary Bar ─────────────────────────────────────────── */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Total Trust Balance</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {fmtDollars(data.summary.total_trust_balance_cents)}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Active Accounts</CardTitle>
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{data.summary.accounts_count}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Compliance Score</CardTitle>
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p
                    className={cn(
                      'text-2xl font-bold',
                      data.summary.compliance_score > 90
                        ? 'text-green-600'
                        : data.summary.compliance_score >= 70
                          ? 'text-amber-600'
                          : 'text-red-600',
                    )}
                  >
                    {data.summary.compliance_score}%
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Matters with Balance</CardTitle>
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{data.summary.matters_with_balance}</p>
                </CardContent>
              </Card>
            </div>

            {/* ── Section 1: Reconciliation Status ────────────────────── */}
            {data.reconciliation_alerts.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Monthly Reconciliation Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Account Name</TableHead>
                          <TableHead>Last Reconciliation</TableHead>
                          <TableHead className="text-right">Days Since</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.reconciliation_alerts.map((alert: TrustComplianceData['reconciliation_alerts'][number]) => (
                          <TableRow
                            key={alert.account_id}
                            className={cn(alert.status !== 'ok' && 'bg-muted/50')}
                          >
                            <TableCell className="font-medium">{alert.account_name}</TableCell>
                            <TableCell>{fmtDate(alert.last_reconciliation_date)}</TableCell>
                            <TableCell className="text-right">
                              {alert.days_since_reconciliation}
                            </TableCell>
                            <TableCell>
                              <ReconciliationBadge status={alert.status} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Section 2: Stale Balances ───────────────────────────── */}
            {data.stale_balances.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Stale Trust Balances</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Matters with trust balance but no activity in 90+ days
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Matter</TableHead>
                          <TableHead className="text-right">Balance</TableHead>
                          <TableHead>Last Transaction</TableHead>
                          <TableHead className="text-right">Days Inactive</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...data.stale_balances]
                          .sort((a, b) => b.days_inactive - a.days_inactive)
                          .map((row) => (
                            <TableRow key={row.matter_id}>
                              <TableCell className="font-medium">{row.matter_title}</TableCell>
                              <TableCell className="text-right">
                                {fmtDollars(row.trust_balance_cents)}
                              </TableCell>
                              <TableCell>{fmtDate(row.last_transaction_date)}</TableCell>
                              <TableCell className="text-right">{row.days_inactive}</TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Section 3: Overdue Holds ────────────────────────────── */}
            {data.overdue_holds.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Holds Past Release Date</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Matter</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Release Date</TableHead>
                          <TableHead className="text-right">Days Overdue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.overdue_holds.map((hold: TrustComplianceData['overdue_holds'][number]) => (
                          <TableRow key={hold.hold_id}>
                            <TableCell className="font-medium">{hold.matter_title}</TableCell>
                            <TableCell className="text-right">
                              {fmtDollars(hold.amount_cents)}
                            </TableCell>
                            <TableCell>{fmtDate(hold.hold_release_date)}</TableCell>
                            <TableCell className="text-right text-red-600 font-medium">
                              {hold.days_overdue}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Section 4: Pending Disbursements ────────────────────── */}
            {data.pending_disbursements.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Pending Disbursement Approvals</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Matter</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Requested</TableHead>
                          <TableHead className="text-right">Hours Pending</TableHead>
                          <TableHead>Prepared By</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.pending_disbursements.map((req: TrustComplianceData['pending_disbursements'][number]) => (
                          <TableRow
                            key={req.request_id}
                            className={cn(req.hours_pending > 48 && 'bg-amber-50')}
                          >
                            <TableCell className="font-medium">{req.matter_title}</TableCell>
                            <TableCell className="text-right">
                              {fmtDollars(req.amount_cents)}
                            </TableCell>
                            <TableCell>{fmtDateTime(req.requested_at)}</TableCell>
                            <TableCell className="text-right">{req.hours_pending}</TableCell>
                            <TableCell>{req.prepared_by_name}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Section 5: Anomalies ────────────────────────────────── */}
            {data.anomalies.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Trust Balance Anomalies</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.anomalies.map((anomaly: TrustComplianceData['anomalies'][number], idx: number) => (
                    <div
                      key={idx}
                      className={cn(
                        'flex items-start gap-3 rounded-lg border p-4',
                        anomaly.severity === 'critical' && 'border-red-200 bg-red-50',
                        anomaly.severity === 'warning' && 'border-amber-200 bg-amber-50',
                        anomaly.severity === 'info' && 'border-blue-200 bg-blue-50',
                      )}
                    >
                      <SeverityIcon severity={anomaly.severity} />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <SeverityBadge severity={anomaly.severity} />
                          <span className="text-sm font-medium">{anomaly.type}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{anomaly.description}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </RequirePermission>
  )
}
