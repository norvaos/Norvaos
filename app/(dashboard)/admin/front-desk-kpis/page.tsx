'use client'

import { useState } from 'react'
import { Download, Calendar, Users, BarChart3, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useAdminFrontDeskKpis, type AdminUserKpiSummary } from '@/lib/queries/admin-kpi-queries'
import { TenantDateInput } from '@/components/ui/tenant-date-input'
import type { ShiftKpiValue } from '@/lib/queries/front-desk-queries'

/**
 * Admin Front Desk KPI Dashboard
 *
 * Shows per-user KPI cards with colored indicators, day summary,
 * and CSV export functionality. Date picker for historical review.
 */

const KPI_COLOR_MAP: Record<string, string> = {
  green: 'bg-emerald-950/40 text-emerald-400 border-emerald-500/20',
  amber: 'bg-amber-950/40 text-amber-400 border-amber-500/20',
  red: 'bg-red-950/40 text-red-400 border-red-500/20',
  grey: 'bg-slate-100 text-slate-500 border-slate-200',
}

const KPI_DOT_MAP: Record<string, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  grey: 'bg-slate-400',
}

function KpiCard({ kpi }: { kpi: ShiftKpiValue }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${KPI_COLOR_MAP[kpi.color]}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium truncate">{kpi.label}</span>
        <span className={`w-2 h-2 rounded-full ${KPI_DOT_MAP[kpi.color]}`} />
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-lg font-bold tabular-nums">{kpi.displayValue}</span>
        <span className="text-xs opacity-70">/ {kpi.target} {kpi.unit}</span>
      </div>
    </div>
  )
}

function UserKpiSection({ user }: { user: AdminUserKpiSummary }) {
  const volumeKpis = user.kpis.filter((k) => k.category === 'volume')
  const efficiencyKpis = user.kpis.filter((k) => k.category === 'efficiency')
  const qualityKpis = user.kpis.filter((k) => k.category === 'quality')
  const productivityKpis = user.kpis.filter((k) => k.category === 'productivity')

  // Summary scores
  const greenCount = user.kpis.filter((k) => k.color === 'green').length
  const amberCount = user.kpis.filter((k) => k.color === 'amber').length
  const redCount = user.kpis.filter((k) => k.color === 'red').length

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
            <Users className="w-4 h-4 text-slate-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">{user.userName}</h3>
            <p className="text-xs text-slate-500">
              {user.shiftCount} shift{user.shiftCount !== 1 ? 's' : ''}
              {user.shifts.length > 0 && (
                <span className="ml-2">
                  {user.shifts[0].startedAt
                    ? new Date(user.shifts[0].startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : ''}
                  {user.shifts[user.shifts.length - 1].endedAt
                    ? `  -  ${new Date(user.shifts[user.shifts.length - 1].endedAt!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : '  -  active'}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/40 text-emerald-400 font-medium">
            {greenCount} green
          </span>
          {amberCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-950/40 text-amber-400 font-medium">
              {amberCount} amber
            </span>
          )}
          {redCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-950/40 text-red-400 font-medium">
              {redCount} red
            </span>
          )}
        </div>
      </div>

      {/* KPI Grid */}
      <div className="p-5 space-y-4">
        {volumeKpis.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Volume</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {volumeKpis.map((kpi) => (
                <KpiCard key={kpi.key} kpi={kpi} />
              ))}
            </div>
          </div>
        )}

        {efficiencyKpis.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Efficiency</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {efficiencyKpis.map((kpi) => (
                <KpiCard key={kpi.key} kpi={kpi} />
              ))}
            </div>
          </div>
        )}

        {qualityKpis.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Quality</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {qualityKpis.map((kpi) => (
                <KpiCard key={kpi.key} kpi={kpi} />
              ))}
            </div>
          </div>
        )}

        {productivityKpis.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Productivity</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {productivityKpis.map((kpi) => (
                <KpiCard key={kpi.key} kpi={kpi} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AdminFrontDeskKpisPage() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const { data: kpiData, isLoading } = useAdminFrontDeskKpis(date)

  function handleExportCsv() {
    window.open(`/api/admin/front-desk-kpis/export?date=${date}`, '_blank')
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-slate-400 hover:text-slate-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-blue-600" />
              Front Desk KPIs
            </h1>
            <p className="text-sm text-slate-500">
              Per-user productivity metrics with shift-scoped KPIs
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
            <Calendar className="w-4 h-4 text-slate-400" />
            <TenantDateInput
              value={date}
              onChange={(iso) => setDate(iso)}
              className="text-sm bg-transparent border-none outline-none text-slate-700"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            className="flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary Bar */}
      {kpiData && (
        <div className="flex items-center gap-6 bg-slate-50 rounded-lg px-5 py-3 text-sm">
          <div>
            <span className="text-slate-500">Date:</span>{' '}
            <span className="font-medium text-slate-900">{kpiData.date}</span>
          </div>
          <div>
            <span className="text-slate-500">Staff:</span>{' '}
            <span className="font-medium text-slate-900">{kpiData.users.length}</span>
          </div>
          <div>
            <span className="text-slate-500">Total Shifts:</span>{' '}
            <span className="font-medium text-slate-900">{kpiData.totalShifts}</span>
          </div>
        </div>
      )}

      {/* User KPI Cards */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-6 animate-pulse">
              <div className="h-6 w-48 bg-slate-200 rounded mb-4" />
              <div className="grid grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, j) => (
                  <div key={j} className="h-16 bg-slate-100 rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : kpiData?.users && kpiData.users.length > 0 ? (
        <div className="space-y-4">
          {kpiData.users.map((user) => (
            <UserKpiSection key={user.userId} user={user} />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-slate-900">No shifts recorded</h3>
          <p className="text-sm text-slate-500 mt-1">
            No front desk shifts were logged on {date}.
          </p>
        </div>
      )}
    </div>
  )
}
