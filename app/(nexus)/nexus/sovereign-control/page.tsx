'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNexusDark } from '../../layout'
import { cn } from '@/lib/utils'
import { COMM_FEATURE_FLAGS, COMM_TEMPLATE_LIMITS } from '@/lib/config/features'
import type { SubscriptionTier } from '@/lib/config/features'
import {
  Satellite,
  Building2,
  Eye,
  EyeOff,
  ToggleLeft,
  ToggleRight,
  Zap,
  Phone,
  Mail,
  FileText,
  Globe,
  Plus,
  Search,
  ChevronDown,
  ChevronUp,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Users,
  Briefcase,
  MessageSquare,
  Crown,
  Rocket,
  Loader2,
  Clock,
  ArrowRight,
  Sparkles,
  FlaskConical,
  History,
  Undo2,
  Radio,
} from 'lucide-react'

// ── Types ───────────────────────────────────────────────────────────────────

interface TenantCommData {
  id: string
  name: string
  slug: string
  subscription_tier: string
  status: string
  logo_url: string | null
  primary_color: string | null
  is_internal_test: boolean
  created_at: string
  updated_at: string
  counts: {
    users: number
    matters: number
    communications: number
    templates: number
  }
  comm_flags: {
    hybrid_ai_ingest: boolean
    ircc_pattern_match: boolean
    voip_bridge: boolean
    comm_template_max: number
  }
  raw_overrides: Record<string, unknown>
}

interface ConfigHistoryEntry {
  id: string
  action: string
  flag: string | null
  scope: string
  tenants_affected: number
  admin_id: string | null
  reason: string
  environment: string
  rolled_back_at: string | null
  rolled_back_by: string | null
  created_at: string
}

interface ImpersonationLog {
  id: string
  admin_id: string
  action: string
  target_id: string
  reason: string
  ip: string
  created_at: string
}

interface ImpersonationView {
  tenant: Record<string, unknown>
  users: Array<{ id: string; first_name: string; last_name: string; email: string; role: string; is_active: boolean }>
  matters: Array<{ id: string; title: string; status: string; created_at: string }>
  recent_activity: Array<{ id: string; title: string; activity_type: string; created_at: string }>
  impersonation_token: string
  started_at: string
}

// ── Data fetching ───────────────────────────────────────────────────────────

function useSovereignControl() {
  return useQuery({
    queryKey: ['nexus', 'sovereign-control'],
    queryFn: async () => {
      const res = await fetch('/api/nexus/sovereign-control')
      if (!res.ok) throw new Error('Failed to fetch sovereign control data')
      const json = await res.json()
      return json.data as {
        tenants: TenantCommData[]
        impersonation_history: ImpersonationLog[]
        total: number
      }
    },
    staleTime: 1000 * 30,
  })
}

// ── Flag toggle icons ───────────────────────────────────────────────────────

const FLAG_ICONS: Record<string, typeof Mail> = {
  hybrid_ai_ingest: Sparkles,
  ircc_pattern_match: Mail,
  voip_bridge: Phone,
  comm_template_max: FileText,
}

const FLAG_COLOURS: Record<string, string> = {
  hybrid_ai_ingest: 'violet',
  ircc_pattern_match: 'blue',
  voip_bridge: 'emerald',
  comm_template_max: 'amber',
}

// ── Tier badge ──────────────────────────────────────────────────────────────

function TierBadge({ tier, dark }: { tier: string; dark: boolean }) {
  const colors: Record<string, string> = {
    starter: dark ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-blue-950/30 text-blue-400 border-blue-500/20',
    professional: dark ? 'bg-violet-500/10 text-violet-400 border-violet-500/20' : 'bg-violet-50 text-violet-700 border-violet-200',
    enterprise: dark ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-amber-950/30 text-amber-400 border-amber-500/20',
  }
  const TierIcon = tier === 'enterprise' ? Crown : tier === 'professional' ? Rocket : Zap
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', colors[tier] ?? colors.starter)}>
      <TierIcon className="h-3 w-3" />
      {tier}
    </span>
  )
}

// ── Sovereign Control Page ──────────────────────────────────────────────────

export default function SovereignControlPage() {
  const dark = useNexusDark()
  const qc = useQueryClient()
  const { data, isLoading, error } = useSovereignControl()
  const [search, setSearch] = useState('')
  const [expandedTenant, setExpandedTenant] = useState<string | null>(null)
  const [globalIgniteFlag, setGlobalIgniteFlag] = useState<string | null>(null)
  const [globalIgniteValue, setGlobalIgniteValue] = useState<boolean>(true)
  const [impersonating, setImpersonating] = useState<ImpersonationView | null>(null)
  const [impersonateReason, setImpersonateReason] = useState('')
  const [impersonateTarget, setImpersonateTarget] = useState<string | null>(null)
  const [showCreateTenant, setShowCreateTenant] = useState(false)
  const [newTenantName, setNewTenantName] = useState('')
  const [newTenantTier, setNewTenantTier] = useState<SubscriptionTier>('starter')
  const [igniteScope, setIgniteScope] = useState<'global' | 'alpha_only'>('global')

  // Directive 078: Config history for rollback
  const { data: configHistory } = useQuery({
    queryKey: ['nexus', 'config-history'],
    queryFn: async () => {
      const res = await fetch('/api/nexus/sovereign-control/history')
      if (!res.ok) return []
      const json = await res.json()
      return json.data as ConfigHistoryEntry[]
    },
    staleTime: 1000 * 30,
  })

  // ── Toggle mutation ──
  const toggleFlag = useMutation({
    mutationFn: async (params: { tenant_id?: string; flag: string; value: boolean | number; global?: boolean; scope?: string; reason: string }) => {
      const res = await fetch('/api/nexus/sovereign-control', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      if (!res.ok) throw new Error('Toggle failed')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nexus', 'sovereign-control'] })
      setGlobalIgniteFlag(null)
    },
  })

  // ── Impersonation mutation ──
  const impersonate = useMutation({
    mutationFn: async (params: { tenant_id: string; reason: string }) => {
      const res = await fetch('/api/nexus/sovereign-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      if (!res.ok) throw new Error('Impersonation failed')
      return res.json()
    },
    onSuccess: (result) => {
      setImpersonating(result.data)
      setImpersonateTarget(null)
      setImpersonateReason('')
    },
  })

  // ── Suspend/Activate mutation ──
  const suspendTenant = useMutation({
    mutationFn: async (params: { tenant_id: string; status: string; reason: string }) => {
      const res = await fetch('/api/nexus/sovereign-control', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      if (!res.ok) throw new Error('Status change failed')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nexus', 'sovereign-control'] })
    },
  })

  // ── Alpha-firm toggle mutation (Directive 078) ──
  const toggleAlpha = useMutation({
    mutationFn: async (params: { tenant_id: string; is_internal_test: boolean }) => {
      const res = await fetch('/api/nexus/sovereign-control/alpha', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, reason: `Alpha designation ${params.is_internal_test ? 'granted' : 'revoked'} via Sovereign Control` }),
      })
      if (!res.ok) throw new Error('Alpha toggle failed')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nexus', 'sovereign-control'] })
    },
  })

  // ── Rollback mutation (Directive 078) ──
  const rollback = useMutation({
    mutationFn: async (params: { snapshot_id: string }) => {
      const res = await fetch('/api/nexus/sovereign-control/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, reason: 'Global Ignite rollback from Sovereign Control' }),
      })
      if (!res.ok) throw new Error('Rollback failed')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nexus', 'sovereign-control'] })
      qc.invalidateQueries({ queryKey: ['nexus', 'config-history'] })
    },
  })

  // ── Create tenant mutation ──
  const createTenant = useMutation({
    mutationFn: async (params: { name: string; subscription_tier: string }) => {
      const res = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      if (!res.ok) throw new Error('Failed to create tenant')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nexus', 'sovereign-control'] })
      setShowCreateTenant(false)
      setNewTenantName('')
      setNewTenantTier('starter')
    },
  })

  const handleToggle = useCallback((tenantId: string, flag: string, currentValue: boolean) => {
    toggleFlag.mutate({
      tenant_id: tenantId,
      flag,
      value: !currentValue,
      reason: `Sovereign Control toggle: ${flag} → ${!currentValue}`,
    })
  }, [toggleFlag])

  const handleGlobalIgnite = useCallback(() => {
    if (!globalIgniteFlag) return
    toggleFlag.mutate({
      flag: globalIgniteFlag,
      value: globalIgniteValue,
      global: true,
      scope: igniteScope,
      reason: `Global Ignite (${igniteScope}): ${globalIgniteFlag} → ${globalIgniteValue}`,
    })
  }, [globalIgniteFlag, globalIgniteValue, igniteScope, toggleFlag])

  // Filter tenants
  const filtered = data?.tenants?.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.slug.toLowerCase().includes(search.toLowerCase())
  ) ?? []

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className={cn('h-8 w-8 animate-spin', dark ? 'text-amber-400/50' : 'text-amber-500/50')} />
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('rounded-2xl border p-8 text-center', dark ? 'border-red-500/20 bg-red-500/5' : 'border-red-500/20 bg-red-950/30')}>
        <XCircle className="mx-auto h-10 w-10 text-red-400 mb-3" />
        <p className={cn('font-medium', dark ? 'text-red-400' : 'text-red-600')}>Failed to load Sovereign Control data</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className={cn(
            'flex h-14 w-14 items-center justify-center rounded-2xl',
            dark
              ? 'bg-gradient-to-br from-amber-500/20 to-orange-500/20 shadow-lg shadow-amber-500/10'
              : 'bg-gradient-to-br from-amber-100 to-orange-100 shadow-md',
          )}>
            <Satellite className={cn('h-7 w-7', dark ? 'text-amber-400' : 'text-amber-600')} />
          </div>
          <div>
            <h1 className={cn('text-3xl font-bold tracking-tight', dark ? 'text-white' : 'text-gray-900')}>
              Sovereign Control
            </h1>
            <p className={cn('text-sm', dark ? 'text-white/40' : 'text-gray-500')}>
              Multi-Tenant Legal Factory — Communication Intelligence Dashboard
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowCreateTenant(true)}
            className={cn(
              'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all',
              dark
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30'
                : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md hover:shadow-lg',
            )}
          >
            <Plus className="h-4 w-4" />
            Create Tenant
          </button>
        </div>
      </div>

      {/* ── KPI Strip ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Total Firms', value: data?.total ?? 0, icon: Building2, colour: 'amber' },
          { label: 'AI Ingest Active', value: filtered.filter((t) => t.comm_flags.hybrid_ai_ingest).length, icon: Sparkles, colour: 'violet' },
          { label: 'IRCC Active', value: filtered.filter((t) => t.comm_flags.ircc_pattern_match).length, icon: Mail, colour: 'blue' },
          { label: 'VoIP Active', value: filtered.filter((t) => t.comm_flags.voip_bridge).length, icon: Phone, colour: 'emerald' },
        ].map((kpi) => {
          const Icon = kpi.icon
          return (
            <div
              key={kpi.label}
              className={cn(
                'rounded-2xl border p-5 transition-all',
                dark
                  ? 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                  : 'border-gray-200 bg-white hover:shadow-md',
              )}
            >
              <div className="flex items-center justify-between">
                <div className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-xl',
                  dark ? `bg-${kpi.colour}-500/10` : `bg-${kpi.colour}-50`,
                )}>
                  <Icon className={cn('h-5 w-5', dark ? `text-${kpi.colour}-400` : `text-${kpi.colour}-600`)} />
                </div>
                <span className={cn('text-3xl font-bold', dark ? 'text-white' : 'text-gray-900')}>{kpi.value}</span>
              </div>
              <p className={cn('mt-2 text-xs font-medium', dark ? 'text-white/40' : 'text-gray-500')}>{kpi.label}</p>
            </div>
          )
        })}
      </div>

      {/* ── Global Ignite Panel ────────────────────────────────────────── */}
      <div className={cn(
        'rounded-2xl border p-6',
        dark
          ? 'border-amber-500/10 bg-gradient-to-r from-amber-500/[0.03] to-orange-500/[0.03]'
          : 'border-amber-500/20 bg-gradient-to-r from-amber-50 to-orange-50',
      )}>
        <div className="flex items-center gap-3 mb-4">
          <Globe className={cn('h-5 w-5', dark ? 'text-amber-400' : 'text-amber-600')} />
          <h2 className={cn('text-lg font-bold', dark ? 'text-white' : 'text-gray-900')}>Global Ignite</h2>
          <span className={cn('text-xs', dark ? 'text-white/30' : 'text-gray-400')}>— Enable/Disable a feature for ALL active tenants</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={globalIgniteFlag ?? ''}
            onChange={(e) => setGlobalIgniteFlag(e.target.value || null)}
            className={cn(
              'rounded-xl border px-4 py-2.5 text-sm font-medium',
              dark
                ? 'border-white/10 bg-white/5 text-white'
                : 'border-gray-200 bg-white text-gray-900',
            )}
          >
            <option value="">Select Feature…</option>
            {Object.values(COMM_FEATURE_FLAGS).filter((f) => f.key !== 'comm_template_max').map((f) => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </select>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setGlobalIgniteValue(true)}
              className={cn(
                'rounded-lg px-3 py-2 text-xs font-semibold transition-all',
                globalIgniteValue
                  ? dark ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30' : 'bg-emerald-950/40 text-emerald-400 ring-1 ring-emerald-300'
                  : dark ? 'bg-white/5 text-white/40' : 'bg-gray-100 text-gray-400',
              )}
            >
              ENABLE ALL
            </button>
            <button
              type="button"
              onClick={() => setGlobalIgniteValue(false)}
              className={cn(
                'rounded-lg px-3 py-2 text-xs font-semibold transition-all',
                !globalIgniteValue
                  ? dark ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/30' : 'bg-red-950/40 text-red-400 ring-1 ring-red-300'
                  : dark ? 'bg-white/5 text-white/40' : 'bg-gray-100 text-gray-400',
              )}
            >
              DISABLE ALL
            </button>
          </div>

          {/* Directive 078: Scope selector */}
          <div className={cn('flex items-center gap-1 rounded-xl border p-0.5', dark ? 'border-white/10 bg-white/[0.03]' : 'border-gray-200 bg-gray-50')}>
            <button
              type="button"
              onClick={() => setIgniteScope('global')}
              className={cn(
                'flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold transition-all',
                igniteScope === 'global'
                  ? dark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-950/40 text-amber-400'
                  : dark ? 'text-white/30' : 'text-gray-400',
              )}
            >
              <Globe className="h-3 w-3" />
              All Firms
            </button>
            <button
              type="button"
              onClick={() => setIgniteScope('alpha_only')}
              className={cn(
                'flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold transition-all',
                igniteScope === 'alpha_only'
                  ? dark ? 'bg-cyan-500/20 text-cyan-400' : 'bg-cyan-100 text-cyan-700'
                  : dark ? 'text-white/30' : 'text-gray-400',
              )}
            >
              <FlaskConical className="h-3 w-3" />
              Alpha Only
            </button>
          </div>

          <button
            type="button"
            disabled={!globalIgniteFlag || toggleFlag.isPending}
            onClick={handleGlobalIgnite}
            className={cn(
              'flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all disabled:opacity-30',
              dark
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/20'
                : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md',
            )}
          >
            {toggleFlag.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Ignite
          </button>
        </div>
        {globalIgniteFlag && (
          <p className={cn('mt-3 text-xs', dark ? 'text-amber-400/50' : 'text-amber-600/70')}>
            <AlertTriangle className="inline h-3 w-3 mr-1" />
            This will {globalIgniteValue ? 'ENABLE' : 'DISABLE'} <strong>{COMM_FEATURE_FLAGS[globalIgniteFlag as keyof typeof COMM_FEATURE_FLAGS]?.label}</strong> for {igniteScope === 'alpha_only' ? 'Alpha test firms only' : `all ${data?.total ?? 0} active tenants`}. A snapshot will be taken for 1-click rollback.
          </p>
        )}
      </div>

      {/* ── Search + Tenant List ───────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className={cn('relative flex-1')}>
            <Search className={cn('absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4', dark ? 'text-white/20' : 'text-gray-400')} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search firms…"
              className={cn(
                'w-full rounded-xl border py-2.5 pl-10 pr-4 text-sm transition-all',
                dark
                  ? 'border-white/10 bg-white/5 text-white placeholder:text-white/20 focus:border-amber-500/30 focus:ring-1 focus:ring-amber-500/20'
                  : 'border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20',
              )}
            />
          </div>
          <span className={cn('text-xs font-medium', dark ? 'text-white/30' : 'text-gray-400')}>
            {filtered.length} firm{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* ── Tenant Cards ─────────────────────────────────────────────── */}
        <div className="space-y-3">
          {filtered.map((tenant) => {
            const isExpanded = expandedTenant === tenant.id
            const isImpersonateTarget = impersonateTarget === tenant.id

            return (
              <div
                key={tenant.id}
                className={cn(
                  'rounded-2xl border transition-all',
                  dark
                    ? 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1]'
                    : 'border-gray-200 bg-white hover:shadow-md',
                  isExpanded && (dark ? 'border-amber-500/20 bg-amber-500/[0.02]' : 'border-amber-500/30 bg-amber-950/30/30'),
                )}
              >
                {/* Collapsed row */}
                <div
                  className="flex items-center justify-between p-5 cursor-pointer"
                  onClick={() => setExpandedTenant(isExpanded ? null : tenant.id)}
                >
                  <div className="flex items-center gap-4">
                    {/* Logo / Initial */}
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold text-white shadow-md"
                      style={{ background: tenant.primary_color ? `linear-gradient(135deg, ${tenant.primary_color}, ${tenant.primary_color}dd)` : 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                    >
                      {tenant.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className={cn('text-base font-bold', dark ? 'text-white' : 'text-gray-900')}>{tenant.name}</span>
                        <TierBadge tier={tenant.subscription_tier} dark={dark} />
                        {tenant.is_internal_test && (
                          <span className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                            dark ? 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400' : 'border-cyan-200 bg-cyan-50 text-cyan-700',
                          )}>
                            <FlaskConical className="h-3 w-3" />
                            Alpha
                          </span>
                        )}
                        <span className={cn(
                          'h-2 w-2 rounded-full',
                          tenant.status === 'active' ? 'bg-emerald-400' : tenant.status === 'suspended' ? 'bg-amber-400' : 'bg-red-400',
                        )} />
                      </div>
                      <div className={cn('flex items-center gap-3 mt-0.5 text-xs', dark ? 'text-white/30' : 'text-gray-400')}>
                        <span>{tenant.counts.users} users</span>
                        <span>•</span>
                        <span>{tenant.counts.matters} matters</span>
                        <span>•</span>
                        <span>{tenant.counts.communications} comms</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: flag indicators + expand */}
                  <div className="flex items-center gap-3">
                    {/* Comm flag pills */}
                    <div className="hidden md:flex items-center gap-2">
                      {Object.entries(tenant.comm_flags).filter(([k]) => k !== 'comm_template_max').map(([key, val]) => {
                        const Icon = FLAG_ICONS[key] ?? Zap
                        return (
                          <span
                            key={key}
                            className={cn(
                              'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                              val
                                ? dark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-950/30 text-emerald-600'
                                : dark ? 'bg-white/5 text-white/20' : 'bg-gray-100 text-gray-400',
                            )}
                          >
                            <Icon className="h-3 w-3" />
                            {val ? 'ON' : 'OFF'}
                          </span>
                        )
                      })}
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        dark ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-950/30 text-amber-600',
                      )}>
                        {tenant.comm_flags.comm_template_max === -1 ? '∞' : tenant.comm_flags.comm_template_max} templates
                      </span>
                    </div>

                    {isExpanded
                      ? <ChevronUp className={cn('h-4 w-4', dark ? 'text-white/20' : 'text-gray-400')} />
                      : <ChevronDown className={cn('h-4 w-4', dark ? 'text-white/20' : 'text-gray-400')} />
                    }
                  </div>
                </div>

                {/* Expanded panel */}
                {isExpanded && (
                  <div className={cn('border-t px-5 pb-5 pt-4', dark ? 'border-white/[0.06]' : 'border-gray-100')}>
                    <div className="grid gap-6 lg:grid-cols-2">
                      {/* Left: Comm toggles */}
                      <div className="space-y-3">
                        <h3 className={cn('text-sm font-bold uppercase tracking-wider', dark ? 'text-white/50' : 'text-gray-500')}>
                          Communication Intelligence
                        </h3>
                        {Object.values(COMM_FEATURE_FLAGS).map((flag) => {
                          const Icon = FLAG_ICONS[flag.key] ?? Zap
                          const colour = FLAG_COLOURS[flag.key] ?? 'gray'
                          const isOn = flag.key === 'comm_template_max'
                            ? true
                            : (tenant.comm_flags as unknown as Record<string, boolean>)[flag.key] ?? false

                          if (flag.key === 'comm_template_max') {
                            return (
                              <div
                                key={flag.key}
                                className={cn(
                                  'flex items-center justify-between rounded-xl border p-4',
                                  dark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-gray-100 bg-gray-50',
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', dark ? `bg-${colour}-500/10` : `bg-${colour}-50`)}>
                                    <Icon className={cn('h-4 w-4', dark ? `text-${colour}-400` : `text-${colour}-600`)} />
                                  </div>
                                  <div>
                                    <p className={cn('text-sm font-semibold', dark ? 'text-white' : 'text-gray-900')}>{flag.label}</p>
                                    <p className={cn('text-xs', dark ? 'text-white/30' : 'text-gray-400')}>{flag.description}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {[5, 10, 25, -1].map((limit) => (
                                    <button
                                      key={limit}
                                      type="button"
                                      onClick={() => toggleFlag.mutate({
                                        tenant_id: tenant.id,
                                        flag: 'comm_template_max',
                                        value: limit,
                                        reason: `Template limit changed to ${limit === -1 ? 'Unlimited' : limit}`,
                                      })}
                                      className={cn(
                                        'rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all',
                                        tenant.comm_flags.comm_template_max === limit
                                          ? dark ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30' : 'bg-amber-950/40 text-amber-400 ring-1 ring-amber-300'
                                          : dark ? 'bg-white/5 text-white/30 hover:text-white/50' : 'bg-gray-100 text-gray-400 hover:text-gray-600',
                                      )}
                                    >
                                      {limit === -1 ? '∞' : limit}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )
                          }

                          return (
                            <div
                              key={flag.key}
                              className={cn(
                                'flex items-center justify-between rounded-xl border p-4',
                                dark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-gray-100 bg-gray-50',
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', dark ? `bg-${colour}-500/10` : `bg-${colour}-50`)}>
                                  <Icon className={cn('h-4 w-4', dark ? `text-${colour}-400` : `text-${colour}-600`)} />
                                </div>
                                <div>
                                  <p className={cn('text-sm font-semibold', dark ? 'text-white' : 'text-gray-900')}>{flag.label}</p>
                                  <p className={cn('text-xs', dark ? 'text-white/30' : 'text-gray-400')}>{flag.impact}</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleToggle(tenant.id, flag.key, isOn)}
                                disabled={toggleFlag.isPending}
                                className="transition-all"
                              >
                                {isOn ? (
                                  <ToggleRight className={cn('h-8 w-8', dark ? 'text-emerald-400' : 'text-emerald-500')} />
                                ) : (
                                  <ToggleLeft className={cn('h-8 w-8', dark ? 'text-white/20' : 'text-gray-300')} />
                                )}
                              </button>
                            </div>
                          )
                        })}
                      </div>

                      {/* Right: Actions + Stats */}
                      <div className="space-y-4">
                        <h3 className={cn('text-sm font-bold uppercase tracking-wider', dark ? 'text-white/50' : 'text-gray-500')}>
                          Tenant Actions
                        </h3>

                        {/* Impersonation */}
                        <div className={cn(
                          'rounded-xl border p-4',
                          dark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-gray-100 bg-gray-50',
                        )}>
                          <div className="flex items-center gap-2 mb-3">
                            <Eye className={cn('h-4 w-4', dark ? 'text-amber-400' : 'text-amber-600')} />
                            <span className={cn('text-sm font-bold', dark ? 'text-white' : 'text-gray-900')}>Impersonation Engine</span>
                          </div>
                          {isImpersonateTarget ? (
                            <div className="space-y-3">
                              <input
                                type="text"
                                value={impersonateReason}
                                onChange={(e) => setImpersonateReason(e.target.value)}
                                placeholder="Reason for access (Law Society compliance)…"
                                className={cn(
                                  'w-full rounded-lg border px-3 py-2 text-sm',
                                  dark ? 'border-white/10 bg-white/5 text-white placeholder:text-white/20' : 'border-gray-200 bg-white text-gray-900',
                                )}
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  disabled={impersonateReason.trim().length < 5 || impersonate.isPending}
                                  onClick={() => impersonate.mutate({ tenant_id: tenant.id, reason: impersonateReason })}
                                  className={cn(
                                    'flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all disabled:opacity-30',
                                    dark ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30' : 'bg-amber-950/40 text-amber-400 hover:bg-amber-200',
                                  )}
                                >
                                  {impersonate.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                                  View as Tenant
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setImpersonateTarget(null); setImpersonateReason('') }}
                                  className={cn('rounded-lg px-3 py-2 text-xs font-medium', dark ? 'text-white/30 hover:text-white/50' : 'text-gray-400 hover:text-gray-600')}
                                >
                                  Cancel
                                </button>
                              </div>
                              <p className={cn('text-[10px]', dark ? 'text-red-400/50' : 'text-red-400')}>
                                <Shield className="inline h-3 w-3 mr-0.5" />
                                This access will be logged in the Forensic Ledger for Law Society compliance.
                              </p>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setImpersonateTarget(tenant.id)}
                              className={cn(
                                'flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all',
                                dark ? 'bg-white/5 text-white/40 hover:text-white/60 hover:bg-white/[0.08]' : 'bg-gray-100 text-gray-500 hover:text-gray-700 hover:bg-gray-200',
                              )}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              View as {tenant.name}
                            </button>
                          )}
                        </div>

                        {/* Kill Switch  -  Suspend / Activate */}
                        <div className={cn(
                          'rounded-xl border p-4',
                          dark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-gray-100 bg-gray-50',
                        )}>
                          <div className="flex items-center gap-2 mb-3">
                            <Shield className={cn('h-4 w-4', dark ? 'text-red-400' : 'text-red-500')} />
                            <span className={cn('text-sm font-bold', dark ? 'text-white' : 'text-gray-900')}>Kill Switch</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={cn('text-xs', dark ? 'text-white/40' : 'text-gray-500')}>
                              Status - <strong className={
                                tenant.status === 'active' ? (dark ? 'text-emerald-400' : 'text-emerald-600') :
                                tenant.status === 'suspended' ? (dark ? 'text-red-400' : 'text-red-600') :
                                (dark ? 'text-gray-400' : 'text-gray-500')
                              }>{tenant.status.charAt(0).toUpperCase() + tenant.status.slice(1)}</strong>
                            </span>
                            <div className="flex-1" />
                            {tenant.status === 'active' ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm(`SUSPEND "${tenant.name}"? Their staff will see "The Fortress is in Maintenance."`)) {
                                    suspendTenant.mutate({ tenant_id: tenant.id, status: 'suspended', reason: 'Suspended via Kill Switch' })
                                  }
                                }}
                                className={cn(
                                  'rounded-lg px-3 py-1.5 text-xs font-bold transition-all',
                                  dark ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 ring-1 ring-red-500/20' : 'bg-red-950/30 text-red-600 hover:bg-red-950/40 ring-1 ring-red-200',
                                )}
                              >
                                SUSPEND
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => suspendTenant.mutate({ tenant_id: tenant.id, status: 'active', reason: 'Reactivated via Sovereign Control' })}
                                className={cn(
                                  'rounded-lg px-3 py-1.5 text-xs font-bold transition-all',
                                  dark ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 ring-1 ring-emerald-500/20' : 'bg-emerald-950/30 text-emerald-600 hover:bg-emerald-950/40 ring-1 ring-emerald-200',
                                )}
                              >
                                ACTIVATE
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Alpha-Firm Designation (Directive 078) */}
                        <div className={cn(
                          'rounded-xl border p-4',
                          dark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-gray-100 bg-gray-50',
                        )}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <FlaskConical className={cn('h-4 w-4', dark ? 'text-cyan-400' : 'text-cyan-600')} />
                              <span className={cn('text-sm font-bold', dark ? 'text-white' : 'text-gray-900')}>Alpha Designation</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleAlpha.mutate({ tenant_id: tenant.id, is_internal_test: !tenant.is_internal_test })}
                              disabled={toggleAlpha.isPending}
                              className="transition-all"
                            >
                              {tenant.is_internal_test ? (
                                <ToggleRight className={cn('h-8 w-8', dark ? 'text-cyan-400' : 'text-cyan-500')} />
                              ) : (
                                <ToggleLeft className={cn('h-8 w-8', dark ? 'text-white/20' : 'text-gray-300')} />
                              )}
                            </button>
                          </div>
                          <p className={cn('text-xs mt-1', dark ? 'text-white/30' : 'text-gray-400')}>
                            {tenant.is_internal_test
                              ? 'This firm receives new features before Global Ignite.'
                              : 'Enable to include in Alpha-only feature deployments.'}
                          </p>
                        </div>

                        {/* Stats grid */}
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { label: 'Users', value: tenant.counts.users, icon: Users },
                            { label: 'Matters', value: tenant.counts.matters, icon: Briefcase },
                            { label: 'Comms', value: tenant.counts.communications, icon: MessageSquare },
                            { label: 'Templates', value: `${tenant.counts.templates}/${tenant.comm_flags.comm_template_max === -1 ? '∞' : tenant.comm_flags.comm_template_max}`, icon: FileText },
                          ].map((stat) => {
                            const Icon = stat.icon
                            return (
                              <div
                                key={stat.label}
                                className={cn(
                                  'rounded-xl border p-3 text-center',
                                  dark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-gray-100 bg-gray-50',
                                )}
                              >
                                <Icon className={cn('mx-auto h-4 w-4 mb-1', dark ? 'text-white/20' : 'text-gray-400')} />
                                <p className={cn('text-lg font-bold', dark ? 'text-white' : 'text-gray-900')}>{stat.value}</p>
                                <p className={cn('text-[10px] font-medium uppercase tracking-wider', dark ? 'text-white/30' : 'text-gray-400')}>{stat.label}</p>
                              </div>
                            )
                          })}
                        </div>

                        {/* Tier Selector */}
                        <div className={cn(
                          'rounded-xl border p-4',
                          dark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-gray-100 bg-gray-50',
                        )}>
                          <div className="flex items-center gap-2 mb-3">
                            <Crown className={cn('h-4 w-4', dark ? 'text-amber-400' : 'text-amber-600')} />
                            <span className={cn('text-sm font-bold', dark ? 'text-white' : 'text-gray-900')}>Subscription Tier</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {(['starter', 'professional', 'enterprise'] as const).map((tier) => {
                              const TIcon = tier === 'enterprise' ? Crown : tier === 'professional' ? Rocket : Zap
                              const isCurrentTier = tenant.subscription_tier === tier
                              return (
                                <button
                                  key={tier}
                                  type="button"
                                  onClick={() => {
                                    if (!isCurrentTier) {
                                      toggleFlag.mutate({
                                        tenant_id: tenant.id,
                                        flag: '_subscription_tier_change',
                                        value: true,
                                        reason: `Tier changed to ${tier}`,
                                      })
                                      // Use admin API for tier change
                                      fetch(`/api/admin/tenants/${tenant.id}`, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ subscription_tier: tier }),
                                      }).then(() => qc.invalidateQueries({ queryKey: ['nexus', 'sovereign-control'] }))
                                    }
                                  }}
                                  className={cn(
                                    'flex flex-col items-center gap-1 rounded-lg border p-2.5 text-[10px] font-bold uppercase transition-all',
                                    isCurrentTier
                                      ? dark ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' : 'border-amber-400 bg-amber-950/30 text-amber-400'
                                      : dark ? 'border-white/[0.06] text-white/20 hover:text-white/40 hover:border-white/10' : 'border-gray-200 text-gray-400 hover:text-gray-600',
                                  )}
                                >
                                  <TIcon className="h-4 w-4" />
                                  {tier}
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {/* Slug + ID */}
                        <div className={cn('rounded-lg p-3 text-xs font-mono', dark ? 'bg-white/[0.02] text-white/20' : 'bg-gray-50 text-gray-400')}>
                          <p>slug: {tenant.slug}</p>
                          <p className="mt-0.5 truncate">id: {tenant.id}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Impersonation View Modal ───────────────────────────────────── */}
      {impersonating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={cn(
            'relative w-full max-w-4xl max-h-[85vh] overflow-y-auto rounded-3xl border p-8',
            dark ? 'border-amber-500/20 bg-[#111114]' : 'border-amber-500/20 bg-white',
          )}>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-500/20">
                  <Eye className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className={cn('text-xl font-bold', dark ? 'text-white' : 'text-gray-900')}>
                    Viewing as: {(impersonating.tenant as Record<string, unknown>).name as string}
                  </h2>
                  <p className={cn('text-xs', dark ? 'text-amber-400/50' : 'text-amber-600/70')}>
                    <Shield className="inline h-3 w-3 mr-1" />
                    Forensic audit logged • Token: {impersonating.impersonation_token}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setImpersonating(null)}
                className={cn(
                  'rounded-xl px-4 py-2 text-sm font-bold transition-all',
                  dark ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-red-950/30 text-red-600 hover:bg-red-950/40',
                )}
              >
                <EyeOff className="inline h-4 w-4 mr-1" />
                Exit Impersonation
              </button>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Users */}
              <div>
                <h3 className={cn('text-sm font-bold uppercase tracking-wider mb-3', dark ? 'text-white/50' : 'text-gray-500')}>
                  Team ({impersonating.users.length})
                </h3>
                <div className="space-y-2">
                  {impersonating.users.map((u) => (
                    <div key={u.id} className={cn('flex items-center justify-between rounded-xl border p-3', dark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-gray-100 bg-gray-50')}>
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 text-[10px] font-bold text-white">
                          {u.first_name?.[0]}{u.last_name?.[0]}
                        </div>
                        <div>
                          <p className={cn('text-sm font-semibold', dark ? 'text-white' : 'text-gray-900')}>{u.first_name} {u.last_name}</p>
                          <p className={cn('text-xs', dark ? 'text-white/30' : 'text-gray-400')}>{u.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn('text-[10px] font-semibold uppercase', dark ? 'text-white/30' : 'text-gray-400')}>{u.role}</span>
                        <span className={cn('h-2 w-2 rounded-full', u.is_active ? 'bg-emerald-400' : 'bg-red-400')} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Matters */}
              <div>
                <h3 className={cn('text-sm font-bold uppercase tracking-wider mb-3', dark ? 'text-white/50' : 'text-gray-500')}>
                  Recent Matters ({impersonating.matters.length})
                </h3>
                <div className="space-y-2">
                  {impersonating.matters.map((m) => (
                    <div key={m.id} className={cn('flex items-center justify-between rounded-xl border p-3', dark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-gray-100 bg-gray-50')}>
                      <div>
                        <p className={cn('text-sm font-semibold', dark ? 'text-white' : 'text-gray-900')}>{m.title}</p>
                        <p className={cn('text-xs', dark ? 'text-white/20' : 'text-gray-400')}>
                          {new Date(m.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
                        m.status === 'open'
                          ? dark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-950/30 text-emerald-600'
                          : dark ? 'bg-white/5 text-white/30' : 'bg-gray-100 text-gray-400',
                      )}>
                        {m.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="mt-6">
              <h3 className={cn('text-sm font-bold uppercase tracking-wider mb-3', dark ? 'text-white/50' : 'text-gray-500')}>
                Recent Activity
              </h3>
              <div className="space-y-1.5">
                {impersonating.recent_activity.slice(0, 10).map((a) => (
                  <div key={a.id} className={cn('flex items-center justify-between rounded-lg px-3 py-2', dark ? 'bg-white/[0.02]' : 'bg-gray-50')}>
                    <div className="flex items-center gap-2">
                      <Clock className={cn('h-3 w-3', dark ? 'text-white/15' : 'text-gray-300')} />
                      <span className={cn('text-xs', dark ? 'text-white/50' : 'text-gray-600')}>{a.title}</span>
                    </div>
                    <span className={cn('text-[10px]', dark ? 'text-white/20' : 'text-gray-400')}>
                      {new Date(a.created_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Tenant Modal ────────────────────────────────────────── */}
      {showCreateTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={cn(
            'relative w-full max-w-lg rounded-3xl border p-8',
            dark ? 'border-amber-500/20 bg-[#111114]' : 'border-amber-500/20 bg-white',
          )}>
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/20">
                <Plus className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className={cn('text-xl font-bold', dark ? 'text-white' : 'text-gray-900')}>Create Tenant</h2>
                <p className={cn('text-xs', dark ? 'text-white/30' : 'text-gray-400')}>
                  New database partition, blank Vault, unique tenant_id — under 60 seconds.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className={cn('text-xs font-semibold uppercase tracking-wider', dark ? 'text-white/50' : 'text-gray-500')}>Firm Name</label>
                <input
                  type="text"
                  value={newTenantName}
                  onChange={(e) => setNewTenantName(e.target.value)}
                  placeholder="e.g. Smith & Associates LLP"
                  className={cn(
                    'mt-1.5 w-full rounded-xl border px-4 py-3 text-sm font-medium',
                    dark ? 'border-white/10 bg-white/5 text-white placeholder:text-white/20' : 'border-gray-200 bg-white text-gray-900',
                  )}
                />
              </div>
              <div>
                <label className={cn('text-xs font-semibold uppercase tracking-wider', dark ? 'text-white/50' : 'text-gray-500')}>Subscription Tier</label>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {(['starter', 'professional', 'enterprise'] as const).map((tier) => {
                    const TierIcon = tier === 'enterprise' ? Crown : tier === 'professional' ? Rocket : Zap
                    return (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => setNewTenantTier(tier)}
                        className={cn(
                          'flex flex-col items-center gap-1 rounded-xl border p-3 text-xs font-semibold uppercase transition-all',
                          newTenantTier === tier
                            ? dark ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' : 'border-amber-400 bg-amber-950/30 text-amber-400'
                            : dark ? 'border-white/[0.06] bg-white/[0.02] text-white/30 hover:text-white/50' : 'border-gray-200 text-gray-400 hover:text-gray-600',
                        )}
                      >
                        <TierIcon className="h-5 w-5" />
                        {tier}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                disabled={!newTenantName.trim() || createTenant.isPending}
                onClick={() => createTenant.mutate({ name: newTenantName.trim(), subscription_tier: newTenantTier })}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all disabled:opacity-30',
                  dark
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/20'
                    : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md',
                )}
              >
                {createTenant.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                Provision Tenant
              </button>
              <button
                type="button"
                onClick={() => setShowCreateTenant(false)}
                className={cn(
                  'rounded-xl px-5 py-3 text-sm font-medium',
                  dark ? 'text-white/30 hover:text-white/50' : 'text-gray-400 hover:text-gray-600',
                )}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Config History + Rollback (Directive 078) ───────────────────── */}
      {configHistory && configHistory.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <History className={cn('h-4 w-4', dark ? 'text-violet-400/60' : 'text-violet-500')} />
            <h2 className={cn('text-sm font-bold uppercase tracking-wider', dark ? 'text-white/50' : 'text-gray-500')}>
              Global Config History — Stealth-to-Global Audit
            </h2>
          </div>
          <div className={cn('rounded-2xl border overflow-hidden', dark ? 'border-white/[0.06]' : 'border-gray-200')}>
            <table className="w-full text-xs">
              <thead>
                <tr className={cn(dark ? 'bg-white/[0.02]' : 'bg-gray-50')}>
                  <th className={cn('px-4 py-3 text-left font-semibold', dark ? 'text-white/40' : 'text-gray-500')}>Date</th>
                  <th className={cn('px-4 py-3 text-left font-semibold', dark ? 'text-white/40' : 'text-gray-500')}>Action</th>
                  <th className={cn('px-4 py-3 text-left font-semibold', dark ? 'text-white/40' : 'text-gray-500')}>Flag</th>
                  <th className={cn('px-4 py-3 text-left font-semibold', dark ? 'text-white/40' : 'text-gray-500')}>Scope</th>
                  <th className={cn('px-4 py-3 text-left font-semibold', dark ? 'text-white/40' : 'text-gray-500')}>Affected</th>
                  <th className={cn('px-4 py-3 text-left font-semibold', dark ? 'text-white/40' : 'text-gray-500')}>Status</th>
                  <th className={cn('px-4 py-3 text-left font-semibold', dark ? 'text-white/40' : 'text-gray-500')}>Rollback</th>
                </tr>
              </thead>
              <tbody>
                {configHistory.map((entry) => (
                  <tr key={entry.id} className={cn('border-t', dark ? 'border-white/[0.04]' : 'border-gray-100')}>
                    <td className={cn('px-4 py-2.5', dark ? 'text-white/60' : 'text-gray-600')}>
                      {new Date(entry.created_at).toLocaleString()}
                    </td>
                    <td className={cn('px-4 py-2.5 font-semibold', dark ? 'text-amber-400/70' : 'text-amber-600')}>
                      {entry.action === 'global_ignite' ? 'Ignite' : entry.action}
                    </td>
                    <td className={cn('px-4 py-2.5 font-mono', dark ? 'text-white/50' : 'text-gray-500')}>
                      {entry.flag ?? '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        entry.scope === 'alpha_only'
                          ? dark ? 'bg-cyan-500/10 text-cyan-400' : 'bg-cyan-50 text-cyan-700'
                          : dark ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-950/30 text-amber-400',
                      )}>
                        {entry.scope === 'alpha_only' ? <FlaskConical className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                        {entry.scope === 'alpha_only' ? 'Alpha' : 'Global'}
                      </span>
                    </td>
                    <td className={cn('px-4 py-2.5 font-bold', dark ? 'text-white' : 'text-gray-900')}>
                      {entry.tenants_affected}
                    </td>
                    <td className="px-4 py-2.5">
                      {entry.rolled_back_at ? (
                        <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold', dark ? 'text-red-400' : 'text-red-600')}>
                          <Undo2 className="h-3 w-3" />
                          Rolled back
                        </span>
                      ) : (
                        <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold', dark ? 'text-emerald-400' : 'text-emerald-600')}>
                          <Radio className="h-3 w-3" />
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {!entry.rolled_back_at && (
                        <button
                          type="button"
                          disabled={rollback.isPending}
                          onClick={() => {
                            if (confirm(`ROLLBACK this ignite? This will restore feature_flags to pre-ignite state for ${entry.tenants_affected} tenants.`)) {
                              rollback.mutate({ snapshot_id: entry.id })
                            }
                          }}
                          className={cn(
                            'flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all',
                            dark ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-red-950/30 text-red-600 hover:bg-red-950/40',
                          )}
                        >
                          <Undo2 className="h-3 w-3" />
                          Rollback
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Forensic Ledger (Impersonation History) ────────────────────── */}
      {data?.impersonation_history && data.impersonation_history.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Shield className={cn('h-4 w-4', dark ? 'text-red-400/60' : 'text-red-500')} />
            <h2 className={cn('text-sm font-bold uppercase tracking-wider', dark ? 'text-white/50' : 'text-gray-500')}>
              Forensic Ledger — Admin Access Events
            </h2>
          </div>
          <div className={cn('rounded-2xl border overflow-hidden', dark ? 'border-white/[0.06]' : 'border-gray-200')}>
            <table className="w-full text-xs">
              <thead>
                <tr className={cn(dark ? 'bg-white/[0.02]' : 'bg-gray-50')}>
                  <th className={cn('px-4 py-3 text-left font-semibold', dark ? 'text-white/40' : 'text-gray-500')}>Date</th>
                  <th className={cn('px-4 py-3 text-left font-semibold', dark ? 'text-white/40' : 'text-gray-500')}>Admin</th>
                  <th className={cn('px-4 py-3 text-left font-semibold', dark ? 'text-white/40' : 'text-gray-500')}>Tenant</th>
                  <th className={cn('px-4 py-3 text-left font-semibold', dark ? 'text-white/40' : 'text-gray-500')}>Reason</th>
                  <th className={cn('px-4 py-3 text-left font-semibold', dark ? 'text-white/40' : 'text-gray-500')}>IP</th>
                </tr>
              </thead>
              <tbody>
                {data.impersonation_history.map((entry) => (
                  <tr key={entry.id} className={cn('border-t', dark ? 'border-white/[0.04]' : 'border-gray-100')}>
                    <td className={cn('px-4 py-2.5', dark ? 'text-white/60' : 'text-gray-600')}>
                      {new Date(entry.created_at).toLocaleString()}
                    </td>
                    <td className={cn('px-4 py-2.5 font-mono', dark ? 'text-amber-400/60' : 'text-amber-600')}>
                      {entry.admin_id?.slice(0, 8) ?? 'bearer'}…
                    </td>
                    <td className={cn('px-4 py-2.5', dark ? 'text-white/60' : 'text-gray-600')}>
                      {entry.target_id?.slice(0, 8)}…
                    </td>
                    <td className={cn('px-4 py-2.5 max-w-[200px] truncate', dark ? 'text-white/40' : 'text-gray-500')}>
                      {entry.reason}
                    </td>
                    <td className={cn('px-4 py-2.5 font-mono', dark ? 'text-white/20' : 'text-gray-400')}>
                      {entry.ip}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
