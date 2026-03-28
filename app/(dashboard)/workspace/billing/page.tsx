'use client'

import { useQuery } from '@tanstack/react-query'
import { DollarSign, AlertCircle, Landmark } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import { formatDate, formatCurrency } from '@/lib/utils/formatters'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { differenceInDays, parseISO } from 'date-fns'

const supabase = createClient()

export default function BillingWorkspace() {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''

  // Unpaid invoices
  const { data: unpaidInvoices = [] } = useQuery({
    queryKey: ['workspace-bi-unpaid', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('invoices')
        .select('id, invoice_number, status, total_amount, balance_due, due_date, contact_id, matter_id, currency_code')
        .eq('tenant_id', tenantId)
        .in('status', ['sent', 'viewed', 'overdue', 'partially_paid'])
        .order('due_date')
        .limit(30)
      return data ?? []
    },
    enabled: !!tenantId,
  })

  const totalOutstanding = unpaidInvoices.reduce((sum, inv) => sum + (inv.balance_due ?? inv.total_amount ?? 0), 0)

  // Overdue invoices
  const overdueInvoices = unpaidInvoices.filter((inv) => {
    if (inv.status === 'overdue') return true
    if (!inv.due_date) return false
    return differenceInDays(new Date(), parseISO(inv.due_date)) > 0
  })

  // Trust bank accounts
  const { data: trustAccounts = [] } = useQuery({
    queryKey: ['workspace-bi-trust', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('trust_bank_accounts')
        .select('id, account_name, bank_name, account_type, currency, is_active')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('account_name')
      return data ?? []
    },
    enabled: !!tenantId,
  })

  // Latest running balance per trust account
  const { data: latestBalances = [] } = useQuery({
    queryKey: ['workspace-bi-trust-balances', tenantId],
    queryFn: async () => {
      if (trustAccounts.length === 0) return []
      // Fetch the most recent transaction per account to get running balance
      const accountIds = trustAccounts.map((a) => a.id)
      const { data } = await supabase
        .from('trust_transactions')
        .select('trust_account_id, running_balance_cents, created_at')
        .eq('tenant_id', tenantId)
        .in('trust_account_id', accountIds)
        .order('created_at', { ascending: false })
        .limit(100)
      return data ?? []
    },
    enabled: !!tenantId && trustAccounts.length > 0,
  })

  // Compute per-account balance: take the most recent running_balance_cents
  const accountBalanceMap: Record<string, number> = {}
  latestBalances.forEach((txn) => {
    if (!txn.trust_account_id) return
    // Only store if not already set (since ordered desc, first seen = most recent)
    if (accountBalanceMap[txn.trust_account_id] === undefined) {
      accountBalanceMap[txn.trust_account_id] = txn.running_balance_cents ?? 0
    }
  })

  const statusColour = (status: string | null) => {
    switch (status) {
      case 'overdue': return 'bg-red-950/40 text-red-400'
      case 'partially_paid': return 'bg-orange-950/40 text-orange-400'
      case 'sent': return 'bg-blue-950/40 text-blue-400'
      case 'viewed': return 'bg-purple-950/40 text-purple-400'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <DollarSign className="size-6 text-primary" />
          Billing Workspace
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Outstanding invoices, trust accounts, and overdue payment alerts.
        </p>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Total Outstanding</p>
          <p className="text-xl font-bold text-foreground">{formatCurrency(totalOutstanding)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Unpaid Invoices</p>
          <p className="text-xl font-bold">{unpaidInvoices.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Overdue</p>
          <p className="text-xl font-bold text-red-600">{overdueInvoices.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Trust Accounts</p>
          <p className="text-xl font-bold">{trustAccounts.length}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Unpaid Invoices */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <DollarSign className="size-4 text-primary" />
                Unpaid Invoices
              </span>
              <Badge variant={unpaidInvoices.length > 0 ? 'destructive' : 'secondary'}>
                {unpaidInvoices.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {unpaidInvoices.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No unpaid invoices to show.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="pb-2 text-left font-medium">Invoice #</th>
                      <th className="pb-2 text-left font-medium">Due Date</th>
                      <th className="pb-2 text-right font-medium">Balance Due</th>
                      <th className="pb-2 text-right font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unpaidInvoices.map((inv) => (
                      <tr key={inv.id} className="border-b last:border-0">
                        <td className="py-2 font-medium">
                          <Link href={`/billing`} className="hover:underline">
                            {inv.invoice_number ?? inv.id.slice(0, 8)}
                          </Link>
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {inv.due_date ? formatDate(inv.due_date) : ' - '}
                        </td>
                        <td className="py-2 text-right font-medium">
                          {formatCurrency(inv.balance_due ?? inv.total_amount ?? 0, inv.currency_code ?? 'CAD')}
                        </td>
                        <td className="py-2 text-right">
                          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', statusColour(inv.status))}>
                            {inv.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Trust Account Balances */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Landmark className="size-4 text-primary" />
                Trust Account Balances
              </span>
              <Badge variant="secondary">{trustAccounts.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {trustAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No trust accounts to show.
              </p>
            ) : (
              <ul className="space-y-2">
                {trustAccounts.map((acct) => {
                  const balanceCents = accountBalanceMap[acct.id] ?? 0
                  return (
                    <li key={acct.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{acct.account_name}</p>
                        <p className="text-xs text-muted-foreground">{acct.bank_name} · {acct.account_type}</p>
                      </div>
                      <p className="ml-2 font-bold shrink-0">
                        {formatCurrency(balanceCents / 100, acct.currency ?? 'CAD')}
                        {balanceCents === 0 && (
                          <span className="ml-1 text-xs text-muted-foreground font-normal">(no txns)</span>
                        )}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Overdue Payment Alerts */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <AlertCircle className="size-4 text-red-500" />
                Overdue Payment Alerts
              </span>
              <Badge variant={overdueInvoices.length > 0 ? 'destructive' : 'secondary'}>
                {overdueInvoices.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {overdueInvoices.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No overdue invoices.
              </p>
            ) : (
              <ul className="space-y-2">
                {overdueInvoices.map((inv) => {
                  const daysOverdue = inv.due_date
                    ? differenceInDays(new Date(), parseISO(inv.due_date))
                    : 0
                  return (
                    <li key={inv.id} className="rounded-md border border-red-500/20 bg-red-950/30 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{inv.invoice_number ?? inv.id.slice(0, 8)}</p>
                        <p className="text-xs text-red-600 font-medium">{daysOverdue}d overdue</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Due {inv.due_date ? formatDate(inv.due_date) : ' - '} · {formatCurrency(inv.balance_due ?? inv.total_amount ?? 0)}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
