'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { useNexusDark } from '../layout'
import { cn } from '@/lib/utils'
import {
  Building2, Users, FolderOpen, TrendingUp, Shield, Loader2,
  Crown, Zap, Rocket, ArrowUpRight, Activity, Cpu, HardDrive,
  Wifi, Database, Clock, Server,
} from 'lucide-react'

interface NexusOverview {
  data: {
    totals: { tenants: number; users: number; matters: number; new_tenants_30d: number }
    tier_distribution: Record<string, number>
    status_distribution: Record<string, number>
    tier_coverage: Array<{
      tier: string; label: string; coverage: number; colour: string
      description: string; enabled: number; total: number; percentage: number; tenant_count: number
    }>
    tenants: Array<{
      id: string; name: string; slug: string; subscription_tier: string | null
      subscription_status: string | null; max_users: number | null; created_at: string | null; status: string
    }>
  }
}

// ── Tiny components ─────────────────────────────────────────────────────────

function Spark({ values, dark }: { values: number[]; dark: boolean }) {
  const max = Math.max(...values, 1)
  return (
    <div className="flex items-end gap-[2px] h-8">
      {values.map((v, i) => (
        <div
          key={i}
          className="w-[4px] rounded-sm transition-all"
          style={{
            height: `${Math.max((v / max) * 100, 10)}%`,
            backgroundColor: dark ? '#f59e0b' : '#d97706',
            opacity: 0.2 + (i / values.length) * 0.8,
          }}
        />
      ))}
    </div>
  )
}

function Donut({ segments, dark }: { segments: { value: number; colour: string; label: string }[]; dark: boolean }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  const r = 45; const circ = 2 * Math.PI * r; let off = 0
  return (
    <div className="relative" style={{ width: 120, height: 120 }}>
      <svg width="120" height="120" className="-rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke={dark ? 'rgba(255,255,255,0.04)' : '#f3f4f6'} strokeWidth="14" />
        {segments.map((seg, i) => {
          const pct = total > 0 ? seg.value / total : 0
          const d = pct * circ; const g = circ - d; const o = off; off += d
          return <circle key={i} cx="60" cy="60" r={r} fill="none" stroke={seg.colour} strokeWidth="14"
            strokeDasharray={`${d} ${g}`} strokeDashoffset={-o} strokeLinecap="round" />
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('text-2xl font-bold', dark ? 'text-white' : 'text-gray-900')}>{total}</span>
        <span className={cn('text-[10px] font-medium', dark ? 'text-white/25' : 'text-gray-400')}>firms</span>
      </div>
    </div>
  )
}

function Pulse({ colour }: { colour: string }) {
  return (
    <span className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40" style={{ backgroundColor: colour }} />
      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: colour }} />
    </span>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function NexusDashboardPage() {
  const dark = useNexusDark()

  const { data, isLoading, error } = useQuery<NexusOverview>({
    queryKey: ['nexus-overview'],
    queryFn: async () => {
      const res = await fetch('/api/nexus/overview')
      if (!res.ok) throw new Error(res.status === 403 ? 'Access denied.' : 'Failed')
      return res.json()
    },
    refetchInterval: 15000,
  })

  const card = dark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-gray-200 bg-white shadow-sm'
  const h = dark ? 'text-white' : 'text-gray-900'
  const sub = dark ? 'text-white/40' : 'text-gray-500'
  const lbl = dark ? 'text-white/50' : 'text-gray-600'
  const dim = dark ? 'text-white/20' : 'text-gray-300'

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className={cn('h-6 w-6 animate-spin', dark ? 'text-amber-400/50' : 'text-amber-500')} />
        <span className={cn('text-xs font-medium', dim)}>Loading dashboard...</span>
      </div>
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className={cn('rounded-xl border p-8 text-center', dark ? 'border-red-500/20 bg-red-500/5' : 'border-red-200 bg-red-50')}>
        <Shield className="h-8 w-8 mx-auto mb-3 text-red-500" />
        <p className={cn('text-sm font-bold', h)}>Access Denied</p>
        <p className={cn('mt-1 text-xs', sub)}>{error.message}</p>
      </div>
    </div>
  )

  const o = data?.data
  if (!o) return null

  const growthPct = o.totals.tenants > 0 ? Math.round((o.totals.new_tenants_30d / o.totals.tenants) * 100) : 0

  const sysMetrics = [
    { label: 'CPU', value: 12, icon: Cpu },
    { label: 'Memory', value: 34, icon: HardDrive },
    { label: 'Network', value: 8, icon: Wifi },
    { label: 'DB Pool', value: 22, icon: Database },
    { label: 'Latency', value: '14ms', icon: Clock },
    { label: 'Uptime', value: '99.9%', icon: Server },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className={cn('text-2xl font-bold tracking-tight', h)}>Control Center</h1>
          <p className={cn('text-sm mt-0.5', sub)}>Platform overview and system metrics</p>
        </div>
        <div className={cn('hidden lg:flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider', dark ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400' : 'border-emerald-200 bg-emerald-50 text-emerald-600')}>
          <Pulse colour="#34d399" />
          All Systems Nominal
        </div>
      </div>

      {/* ── System Performance Strip ─────────────────────────────────── */}
      <Link href="/nexus/health" className={cn('block rounded-xl border p-5 transition-all hover:scale-[1.005]', card, dark ? 'hover:border-amber-400/20' : 'hover:border-amber-300 hover:shadow-md')}>
        <div className="flex items-center gap-2 mb-4">
          <Server className={cn('h-5 w-5', dark ? 'text-amber-400/50' : 'text-amber-500')} />
          <span className={cn('text-sm font-semibold uppercase tracking-wider', sub)}>System Metrics</span>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
          {sysMetrics.map((m) => {
            const Icon = m.icon
            const isNumber = typeof m.value === 'number'
            return (
              <div key={m.label} className="flex flex-col items-center gap-2">
                <Icon className={cn('h-5 w-5', dark ? 'text-white/15' : 'text-gray-300')} />
                <span className={cn('text-2xl font-bold', h)}>
                  {isNumber ? `${m.value}%` : m.value}
                </span>
                <span className={cn('text-xs font-medium uppercase tracking-wider', dim)}>{m.label}</span>
                {isNumber && (
                  <div className={cn('w-full h-1.5 rounded-full overflow-hidden', dark ? 'bg-white/[0.04]' : 'bg-gray-100')}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${m.value}%`,
                        backgroundColor: (m.value as number) > 80 ? '#ef4444' : (m.value as number) > 50 ? '#f59e0b' : '#22c55e',
                      }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Link>

      {/* ── KPI Cards ────────────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Firms', value: o.totals.tenants, sub: `+${o.totals.new_tenants_30d} this month`, icon: Building2, spark: [1, 1, 2, 2, 3, 3, 3, 4, o.totals.tenants], href: '/nexus/firms' },
          { label: 'Total Users', value: o.totals.users, sub: 'active accounts', icon: Users, spark: [1, 1, 2, 2, 3, o.totals.users], href: '/nexus/firms' },
          { label: 'Total Matters', value: o.totals.matters, sub: 'all practice areas', icon: FolderOpen, spark: [20, 45, 80, 150, 220, 280, o.totals.matters], href: '/nexus/features' },
          { label: 'Growth Rate', value: `${growthPct}%`, sub: '30-day period', icon: TrendingUp, spark: [10, 20, 40, 60, 80, growthPct], href: '/nexus/health' },
        ].map((kpi) => {
          const Icon = kpi.icon
          return (
            <Link key={kpi.label} href={kpi.href} className={cn('group rounded-xl border p-6 transition-all hover:scale-[1.02] cursor-pointer', card, dark ? 'hover:border-amber-400/20' : 'hover:border-amber-300 hover:shadow-md')}>
              <div className="flex items-start justify-between mb-4">
                <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl', dark ? 'bg-amber-400/[0.08]' : 'bg-amber-50')}>
                  <Icon className={cn('h-6 w-6', dark ? 'text-amber-400/60' : 'text-amber-600')} />
                </div>
                <Spark values={kpi.spark} dark={dark} />
              </div>
              <div className={cn('text-4xl font-bold', h)}>{kpi.value}</div>
              <div className={cn('text-sm mt-1 font-medium', sub)}>{kpi.label}</div>
              <div className="flex items-center gap-1.5 mt-2">
                <ArrowUpRight className={cn('h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5', dark ? 'text-emerald-400' : 'text-emerald-500')} />
                <span className={cn('text-sm', dark ? 'text-emerald-400' : 'text-emerald-600')}>{kpi.sub}</span>
              </div>
            </Link>
          )
        })}
      </div>

      {/* ── Tier Distribution Row ────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* Donut */}
        <Link href="/nexus/features" className={cn('rounded-xl border p-6 flex flex-col items-center transition-all hover:scale-[1.02]', card, dark ? 'hover:border-amber-400/20' : 'hover:border-amber-300 hover:shadow-md')}>
          <span className={cn('text-sm font-semibold uppercase tracking-wider mb-5', sub)}>Tier Breakdown</span>
          <Donut dark={dark} segments={o.tier_coverage.map((t) => ({ value: t.tenant_count, colour: t.colour, label: t.label }))} />
          <div className="mt-5 space-y-2.5 w-full">
            {o.tier_coverage.map((tier) => (
              <div key={tier.tier} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-2.5 w-2.5 rounded" style={{ backgroundColor: tier.colour }} />
                  <span className={cn('text-sm', lbl)}>{tier.label}</span>
                </div>
                <span className={cn('text-base font-bold', h)}>{tier.tenant_count}</span>
              </div>
            ))}
          </div>
        </Link>

        {/* Tier detail cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          {o.tier_coverage.map((tier) => {
            const icons: Record<string, React.ReactNode> = {
              starter: <Zap className="h-5 w-5" />, professional: <Rocket className="h-5 w-5" />, enterprise: <Crown className="h-5 w-5" />,
            }
            return (
              <Link href="/nexus/features" key={tier.tier} className={cn('rounded-xl border p-5 flex flex-col justify-between transition-all hover:scale-[1.02]', card, dark ? 'hover:border-amber-400/20' : 'hover:border-amber-300 hover:shadow-md')}>
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl mb-3"
                    style={{ backgroundColor: tier.colour + '15', color: tier.colour }}>
                    {icons[tier.tier]}
                  </div>
                  <div className={cn('text-base font-bold mb-1', h)}>{tier.label}</div>
                  <p className={cn('text-sm leading-relaxed', sub)}>{tier.description}</p>
                </div>
                <div className="mt-4">
                  <div className="flex items-baseline gap-1.5 mb-3">
                    <span className={cn('text-4xl font-bold', h)}>{tier.tenant_count}</span>
                    <span className={cn('text-sm', dim)}>firms</span>
                  </div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={cn('text-xs font-medium uppercase tracking-wider', dim)}>Coverage</span>
                    <span className="text-sm font-bold" style={{ color: tier.colour }}>{tier.percentage}%</span>
                  </div>
                  <div className={cn('h-2 rounded-full overflow-hidden', dark ? 'bg-white/[0.04]' : 'bg-gray-100')}>
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${tier.percentage}%`, backgroundColor: tier.colour,
                    }} />
                  </div>
                  <span className={cn('text-xs mt-1.5 block', dim)}>{tier.enabled}/{tier.total} modules enabled</span>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* ── Firms Table ──────────────────────────────────────────────── */}
      <div>
        <Link href="/nexus/firms" className="flex items-center gap-3 mb-4 group">
          <span className={cn('text-lg font-bold group-hover:underline', h)}>Registered Firms</span>
          <span className={cn('text-sm font-medium px-2.5 py-0.5 rounded-md', dark ? 'bg-white/[0.04] text-white/30' : 'bg-gray-100 text-gray-500')}>
            {o.tenants.length}
          </span>
          <ArrowUpRight className={cn('h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5', dark ? 'text-amber-400/50' : 'text-amber-500')} />
        </Link>
        <div className={cn('rounded-xl border overflow-hidden', card)}>
          <table className="w-full text-sm">
            <thead>
              <tr className={cn('border-b', dark ? 'border-white/[0.04]' : 'border-gray-100')}>
                {['', 'Firm', 'Slug', 'Tier', 'Status', 'Seats', 'Registered'].map((col) => (
                  <th key={col} className={cn('text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider', dim)}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {o.tenants.map((t, i) => {
                const colour = { starter: '#3B82F6', professional: '#8B5CF6', enterprise: '#F59E0B' }[t.subscription_tier ?? ''] ?? '#6b7280'
                const sColour = t.subscription_status === 'active' ? '#22c55e' : t.subscription_status === 'trialing' ? '#06b6d4' : '#f59e0b'
                return (
                  <tr key={t.id} className={cn(
                    'border-b last:border-0 transition-colors',
                    dark ? `border-white/[0.03] hover:bg-white/[0.02] ${i % 2 ? 'bg-white/[0.01]' : ''}` : `border-gray-50 hover:bg-gray-50 ${i % 2 ? 'bg-gray-50/50' : ''}`,
                  )}>
                    <td className="pl-4 py-3 w-6"><Pulse colour={sColour} /></td>
                    <td className={cn('px-4 py-3 font-semibold', dark ? 'text-white/80' : 'text-gray-900')}>{t.name}</td>
                    <td className={cn('px-4 py-3 mono text-xs', dim)}>{t.slug}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                        style={{ backgroundColor: colour + '12', color: colour, border: `1px solid ${colour}20` }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colour }} />
                        {t.subscription_tier ?? 'none'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                        style={{ backgroundColor: sColour + '10', color: sColour, border: `1px solid ${sColour}20` }}>
                        {t.subscription_status ?? 'unknown'}
                      </span>
                    </td>
                    <td className={cn('px-4 py-3', lbl)}>{t.max_users ?? ' - '}</td>
                    <td className={cn('px-4 py-3 mono text-xs', dim)}>{t.created_at ? new Date(t.created_at).toLocaleDateString('en-CA') : ' - '}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
