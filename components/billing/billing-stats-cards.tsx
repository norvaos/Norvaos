'use client'

import { DollarSign, Clock, AlertTriangle, TrendingUp } from 'lucide-react'
import { useBillingStats } from '@/lib/queries/invoicing'
import { useTenant } from '@/lib/hooks/use-tenant'
import { Skeleton } from '@/components/ui/skeleton'
import { RequirePermission } from '@/components/require-permission'
import { formatCents } from '@/lib/utils'

interface StatCardProps {
  title: string
  value: string
  icon: React.ReactNode
  description?: string
  variant?: 'default' | 'warning' | 'success'
}

function StatCard({ title, value, icon, description, variant = 'default' }: StatCardProps) {
  const colorMap = {
    default: 'text-primary',
    warning: 'text-amber-600',
    success: 'text-emerald-600',
  }

  return (
    <div className="rounded-lg border bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div className={colorMap[variant]}>{icon}</div>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      {description && (
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  )
}

export function BillingStatsCards() {
  const { tenant } = useTenant()
  const { data: stats, isLoading } = useBillingStats(tenant?.id ?? '')

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-white p-5 space-y-3">
            <Skeleton className="h-4 w-[60%]" />
            <Skeleton className="h-8 w-[40%]" />
            <Skeleton className="h-3 w-[50%]" />
          </div>
        ))}
      </div>
    )
  }

  if (!stats) return null

  return (
    <RequirePermission entity="billing" action="view" variant="inline">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Outstanding"
          value={formatCents(stats.totalOutstanding)}
          icon={<DollarSign className="size-5" />}
          description={`${stats.invoiceCount} open invoice${stats.invoiceCount !== 1 ? 's' : ''}`}
        />
        <StatCard
          title="Overdue"
          value={formatCents(stats.totalOverdue)}
          icon={<AlertTriangle className="size-5" />}
          description="Past due date"
          variant={stats.totalOverdue > 0 ? 'warning' : 'default'}
        />
        <StatCard
          title="Collected This Month"
          value={formatCents(stats.collectedThisMonth)}
          icon={<TrendingUp className="size-5" />}
          description="Payments received"
          variant="success"
        />
        <StatCard
          title="Unbilled Time"
          value={`${stats.unbilledHours}h`}
          icon={<Clock className="size-5" />}
          description="Ready to invoice"
        />
      </div>
    </RequirePermission>
  )
}
