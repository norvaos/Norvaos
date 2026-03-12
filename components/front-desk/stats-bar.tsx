'use client'

import { Calendar, ClipboardCheck, AlertCircle, UserPlus } from 'lucide-react'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useFrontDeskStats } from '@/lib/queries/front-desk-queries'
import { Skeleton } from '@/components/ui/skeleton'

// ─── Types ──────────────────────────────────────────────────────────────────

interface StatItemProps {
  icon: React.ReactNode
  label: string
  value: string | number
  highlight?: boolean
}

// ─── Stat Item ──────────────────────────────────────────────────────────────

function StatItem({ icon, label, value, highlight }: StatItemProps) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5">
      <div
        className={`flex items-center justify-center w-8 h-8 rounded-lg ${
          highlight
            ? 'bg-red-100 text-red-600'
            : 'bg-slate-100 text-slate-500'
        }`}
      >
        {icon}
      </div>
      <div className="flex flex-col">
        <span
          className={`text-sm font-semibold leading-tight ${
            highlight ? 'text-red-700' : 'text-slate-900'
          }`}
        >
          {value}
        </span>
        <span className="text-xs text-slate-500 leading-tight">{label}</span>
      </div>
    </div>
  )
}

// ─── Stats Bar ──────────────────────────────────────────────────────────────

export function StatsBar() {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''

  const { data: stats, isLoading } = useFrontDeskStats(tenantId)

  if (isLoading) {
    return (
      <div className="flex items-center gap-4 bg-slate-50 rounded-lg px-2 py-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2.5 px-4 py-2.5">
            <Skeleton className="w-8 h-8 rounded-lg" />
            <div className="flex flex-col gap-1">
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  const appointmentsCompleted = stats?.appointmentsCompleted ?? 0
  const appointmentsTotal = stats?.appointmentsTotal ?? 0
  const checkInsWaiting = stats?.checkInsWaiting ?? 0
  const overdueTasks = (stats as Record<string, number> | undefined)?.overdueTasks ?? 0
  const walkInsToday = stats?.walkInsToday ?? 0

  return (
    <div className="flex items-center gap-1 bg-slate-50 rounded-lg px-2 py-1 flex-wrap">
      <StatItem
        icon={<Calendar className="w-4 h-4" />}
        label="Appointments"
        value={`${appointmentsCompleted} / ${appointmentsTotal}`}
      />

      <div className="w-px h-8 bg-slate-200" />

      <StatItem
        icon={<ClipboardCheck className="w-4 h-4" />}
        label="Check-ins Waiting"
        value={checkInsWaiting}
      />

      <div className="w-px h-8 bg-slate-200" />

      <StatItem
        icon={<AlertCircle className="w-4 h-4" />}
        label="Overdue Tasks"
        value={overdueTasks}
        highlight={overdueTasks > 0}
      />

      <div className="w-px h-8 bg-slate-200" />

      <StatItem
        icon={<UserPlus className="w-4 h-4" />}
        label="Walk-ins"
        value={walkInsToday}
      />
    </div>
  )
}
