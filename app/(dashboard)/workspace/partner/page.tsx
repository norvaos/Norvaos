'use client'

import { useTenant } from '@/lib/hooks/use-tenant'
import { createClient } from '@/lib/supabase/client'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { BarChart3, TrendingUp, TrendingDown, AlertTriangle, Users, DollarSign } from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCents(cents: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function fmtDelta(current: number, previous: number): { pct: number; up: boolean } {
  if (previous === 0) return { pct: current > 0 ? 100 : 0, up: current >= 0 }
  const pct = Math.round(((current - previous) / previous) * 100)
  return { pct: Math.abs(pct), up: pct >= 0 }
}

// ── Widget A: Matter Pipeline Funnel ─────────────────────────────────────────

function PipelineFunnelWidget({ tenantId }: { tenantId: string }) {
  const supabase = createClient()

  const { data, isLoading } = useQuery({
    queryKey: ['partner-pipeline-funnel', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matter_stage_state')
        .select('current_stage_id, matter_stages!inner(name, sort_order)')
        .eq('tenant_id', tenantId)
      if (error) throw error

      // Group by stage name
      const grouped: Record<string, { count: number; sort_order: number }> = {}
      for (const row of data ?? []) {
        const stage = row.matter_stages as unknown as { name: string; sort_order: number }
        if (!stage) continue
        const key = stage.name
        if (!grouped[key]) grouped[key] = { count: 0, sort_order: stage.sort_order }
        grouped[key].count++
      }

      return Object.entries(grouped)
        .map(([name, { count, sort_order }]) => ({ name, count, sort_order }))
        .sort((a, b) => a.sort_order - b.sort_order)
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  })

  const maxCount = Math.max(...(data ?? []).map((s) => s.count), 1)

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Matter Pipeline Funnel</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {isLoading ? (
          <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-7 w-full" />)}</div>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No active matters with stage data.</p>
        ) : (
          data.map((stage) => {
            const widthPct = Math.max(8, Math.round((stage.count / maxCount) * 100))
            return (
              <div key={stage.name} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-32 shrink-0 truncate">{stage.name}</span>
                <div className="flex-1 h-6 bg-slate-100 rounded overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded transition-all duration-300 flex items-center justify-end pr-2"
                    style={{ width: `${widthPct}%` }}
                  >
                    <span className="text-[10px] font-bold text-white">{stage.count}</span>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

// ── Widget B: Revenue This Month vs Last Month ────────────────────────────────

function RevenueWidget({ tenantId }: { tenantId: string }) {
  const supabase = createClient()

  const thisMonthStart = new Date()
  thisMonthStart.setDate(1)
  thisMonthStart.setHours(0, 0, 0, 0)

  const lastMonthStart = new Date(thisMonthStart)
  lastMonthStart.setMonth(lastMonthStart.getMonth() - 1)

  const { data: thisMonthRevenue, isLoading: loadingThis } = useQuery({
    queryKey: ['partner-revenue-this', tenantId, thisMonthStart.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('total_amount')
        .eq('tenant_id', tenantId)
        .eq('status', 'paid')
        .gte('updated_at', thisMonthStart.toISOString())
      if (error) throw error
      return (data ?? []).reduce((sum, inv) => sum + (inv.total_amount ?? 0), 0)
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  })

  const { data: lastMonthRevenue, isLoading: loadingLast } = useQuery({
    queryKey: ['partner-revenue-last', tenantId, lastMonthStart.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('total_amount')
        .eq('tenant_id', tenantId)
        .eq('status', 'paid')
        .gte('updated_at', lastMonthStart.toISOString())
        .lt('updated_at', thisMonthStart.toISOString())
      if (error) throw error
      return (data ?? []).reduce((sum, inv) => sum + (inv.total_amount ?? 0), 0)
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  })

  const isLoading = loadingThis || loadingLast
  const delta = fmtDelta(thisMonthRevenue ?? 0, lastMonthRevenue ?? 0)

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Revenue  -  This Month vs Last</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-8 w-full" /></div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs text-muted-foreground mb-1">This Month</p>
              <p className="text-2xl font-bold text-slate-900">{fmtCents(thisMonthRevenue ?? 0)}</p>
              <div className="mt-1">
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 border ${delta.up ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}`}
                >
                  {delta.up
                    ? <TrendingUp className="inline h-2.5 w-2.5 mr-0.5" />
                    : <TrendingDown className="inline h-2.5 w-2.5 mr-0.5" />
                  }
                  {delta.pct}%
                </Badge>
              </div>
            </div>
            <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs text-muted-foreground mb-1">Last Month</p>
              <p className="text-2xl font-bold text-slate-500">{fmtCents(lastMonthRevenue ?? 0)}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Widget C: Top 5 Matters by Outstanding Balance ────────────────────────────

interface OutstandingMatter {
  matter_id: string | null
  matter_number: string | null
  client_name: string | null
  outstanding: number
}

function OutstandingBalanceWidget({ tenantId }: { tenantId: string }) {
  const supabase = createClient()

  const { data, isLoading } = useQuery({
    queryKey: ['partner-outstanding', tenantId],
    queryFn: async (): Promise<OutstandingMatter[]> => {
      const { data, error } = await supabase
        .from('invoices')
        .select('matter_id, total_amount, amount_paid, matters(matter_number, matter_people(first_name, last_name))')
        .eq('tenant_id', tenantId)
        .in('status', ['sent', 'viewed', 'overdue', 'partially_paid'])
      if (error) throw error

      // Group by matter_id and sum outstanding
      const byMatter: Record<string, OutstandingMatter> = {}
      for (const inv of data ?? []) {
        const mid = inv.matter_id ?? 'unknown'
        const outstanding = (inv.total_amount ?? 0) - ((inv as any).amount_paid ?? 0)
        if (!byMatter[mid]) {
          const matter = (inv as any).matters
          const firstPerson = matter?.matter_people?.[0]
          const clientName = firstPerson
            ? [firstPerson.first_name, firstPerson.last_name].filter(Boolean).join(' ') || null
            : null
          byMatter[mid] = {
            matter_id: inv.matter_id,
            matter_number: matter?.matter_number ?? null,
            client_name: clientName,
            outstanding: 0,
          }
        }
        byMatter[mid].outstanding += outstanding
      }

      return Object.values(byMatter)
        .sort((a, b) => b.outstanding - a.outstanding)
        .slice(0, 5)
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  })

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <CardTitle className="text-sm font-semibold">Top 5 Matters  -  Outstanding Balance</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-1.5">
        {isLoading ? (
          <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No outstanding balances.</p>
        ) : (
          data.map((m, idx) => (
            <div
              key={m.matter_id ?? idx}
              className="flex items-center gap-3 rounded-md border border-slate-100 bg-white px-3 py-2"
            >
              <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">#{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{m.matter_number ?? 'N/A'}</p>
                {m.client_name && (
                  <p className="text-[11px] text-muted-foreground truncate">{m.client_name}</p>
                )}
              </div>
              <span className="text-sm font-bold text-amber-700 shrink-0">{fmtCents(m.outstanding)}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

// ── Widget D: Staff Utilisation ───────────────────────────────────────────────

interface StaffUtil {
  user_id: string
  display_name: string
  total_minutes: number
}

const TARGET_MINUTES = 40 * 60 // 40 hours per week

function StaffUtilisationWidget({ tenantId }: { tenantId: string }) {
  const supabase = createClient()

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  sevenDaysAgo.setHours(0, 0, 0, 0)

  const { data, isLoading } = useQuery({
    queryKey: ['partner-staff-util', tenantId, sevenDaysAgo.toISOString()],
    queryFn: async (): Promise<StaffUtil[]> => {
      const { data, error } = await supabase
        .from('time_entries')
        .select('user_id, duration_minutes, users!inner(first_name, last_name)')
        .eq('tenant_id', tenantId)
        .gte('created_at', sevenDaysAgo.toISOString())
      if (error) throw error

      const byUser: Record<string, StaffUtil> = {}
      for (const entry of data ?? []) {
        const uid = entry.user_id ?? 'unknown'
        const user = (entry as any).users as { first_name: string | null; last_name: string | null }
        const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'Unknown'
        if (!byUser[uid]) {
          byUser[uid] = { user_id: uid, display_name: displayName, total_minutes: 0 }
        }
        byUser[uid].total_minutes += entry.duration_minutes ?? 0
      }

      return Object.values(byUser).sort((a, b) => b.total_minutes - a.total_minutes)
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  })

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Staff Utilisation (Last 7 Days)</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {isLoading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No time entries in the last 7 days.</p>
        ) : (
          data.map((s) => {
            const hours = (s.total_minutes / 60).toFixed(1)
            const pct = Math.min(100, Math.round((s.total_minutes / TARGET_MINUTES) * 100))
            const barColour = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'
            return (
              <div key={s.user_id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{s.display_name}</span>
                  <span className="text-muted-foreground">{hours}h / 40h</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${barColour}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

// ── Widget E: Risk Exposure Summary ──────────────────────────────────────────

const SEVERITY_CONFIG: Record<string, { label: string; className: string }> = {
  critical:  { label: 'Critical',  className: 'bg-red-100 text-red-700 border-red-200' },
  elevated:  { label: 'Elevated',  className: 'bg-orange-100 text-orange-700 border-orange-200' },
  advisory:  { label: 'Advisory',  className: 'bg-amber-100 text-amber-700 border-amber-200' },
  low:       { label: 'Low',       className: 'bg-slate-100 text-slate-600 border-slate-200' },
}

function RiskExposureWidget({ tenantId }: { tenantId: string }) {
  const supabase = createClient()

  const { data, isLoading } = useQuery({
    queryKey: ['partner-risk-exposure', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matter_risk_flags')
        .select('severity')
        .eq('tenant_id', tenantId)
        .eq('status', 'open')
      if (error) throw error

      const counts: Record<string, number> = {}
      for (const row of data ?? []) {
        const sev = row.severity ?? 'low'
        counts[sev] = (counts[sev] ?? 0) + 1
      }
      return { counts, total: (data ?? []).length }
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  })

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <CardTitle className="text-sm font-semibold">Risk Exposure Summary</CardTitle>
          </div>
          {data && (
            <span className="text-sm font-bold text-slate-700">{data.total} open</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2"><Skeleton className="h-8 w-full" /></div>
        ) : !data || data.total === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No open risk flags.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {Object.entries(SEVERITY_CONFIG).map(([sev, cfg]) => {
              const count = data.counts[sev] ?? 0
              if (count === 0) return null
              return (
                <Badge
                  key={sev}
                  variant="outline"
                  className={`text-xs px-2 py-1 border font-semibold ${cfg.className}`}
                >
                  {cfg.label}: {count}
                </Badge>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Partner Dashboard Page ────────────────────────────────────────────────────

export default function PartnerDashboardPage() {
  const { tenant, isLoading: tenantLoading } = useTenant()
  const tenantId = tenant?.id ?? ''

  if (tenantLoading) {
    return (
      <div className="p-6 space-y-4">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-48 w-full" />)}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-6 w-6 text-indigo-600" />
        <div>
          <h1 className="text-xl font-bold">Partner Dashboard</h1>
          <p className="text-sm text-muted-foreground">Firm-wide overview  -  pipeline, revenue, utilisation, and risk.</p>
        </div>
      </div>

      {/* Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PipelineFunnelWidget tenantId={tenantId} />
        <RevenueWidget tenantId={tenantId} />
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <OutstandingBalanceWidget tenantId={tenantId} />
        <StaffUtilisationWidget tenantId={tenantId} />
      </div>

      {/* Row 3 */}
      <RiskExposureWidget tenantId={tenantId} />
    </div>
  )
}
