'use client'

/**
 * Directive 079: The Atomic Release Architecture  -  Release Management Tab
 *
 * The God Dashboard Link. Shows:
 *   - Current active Version ID + build SHA + deploy slot (Blue/Green)
 *   - Docker image tag for the running container
 *   - Full deploy history with status badges
 *   - One-click "Rollback" button (THE PANIC BUTTON)
 *   - Migration guard status
 *   - Blue-Green slot visualisation
 */

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNexusDark } from '../../layout'
import { cn } from '@/lib/utils'
import {
  Rocket,
  GitBranch,
  Container,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Undo2,
  Database,
  Zap,
  Activity,
  Loader2,
  ChevronDown,
  ChevronRight,
  ArrowDownToLine,
  Sparkles,
  Lock,
  ServerCrash,
  CircleDot,
} from 'lucide-react'

// ── Types ───────────────────────────────────────────────────────────────────

interface Release {
  id: string
  version: string
  build_sha: string
  environment: string
  deploy_slot: string
  status: string
  deploy_source: string
  docker_tag: string | null
  health_check_passed: boolean
  health_check_at: string | null
  is_rollback: boolean
  rolled_back_from_id: string | null
  migrations_applied: number
  migration_names: string[] | null
  triggered_by: string | null
  netlify_deploy_id: string | null
  deployed_at: string
  confirmed_at: string | null
  rolled_back_at: string | null
  notes: string | null
}

interface ReleaseDashboardData {
  current: {
    version: string
    buildSha: string
    buildTime: string
    deploySlot: string
    deployEnv: string
    environment: string
    enforcementSpec: string
  }
  activeRelease: Release | null
  releases: Release[]
  migrations: {
    total: number
    recent: Array<{ name: string; applied_at: string }>
  }
  blockedMigrations: Array<{
    id: string
    migration_name: string
    classification: string
    blocked_reason: string | null
    checked_at: string
  }>
}

// ── Data fetching ───────────────────────────────────────────────────────────

function useReleaseDashboard() {
  return useQuery({
    queryKey: ['nexus', 'releases'],
    queryFn: async () => {
      const res = await fetch('/api/nexus/releases')
      if (!res.ok) throw new Error('Failed to fetch release data')
      const json = await res.json()
      return json.data as ReleaseDashboardData
    },
    staleTime: 1000 * 15, // 15s  -  release data is time-sensitive
  })
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function StatusBadge({ status, dark }: { status: string; dark: boolean }) {
  const config: Record<string, { colour: string; icon: typeof CheckCircle2; label: string }> = {
    healthy: { colour: 'emerald', icon: CheckCircle2, label: 'Healthy' },
    deploying: { colour: 'blue', icon: Loader2, label: 'Deploying' },
    failed: { colour: 'red', icon: XCircle, label: 'Failed' },
    rolled_back: { colour: 'amber', icon: Undo2, label: 'Rolled Back' },
  }

  const c = config[status] || config.deploying
  const Icon = c.icon

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        dark
          ? `border-${c.colour}-500/20 bg-${c.colour}-500/10 text-${c.colour}-400`
          : `border-${c.colour}-200 bg-${c.colour}-50 text-${c.colour}-700`,
      )}
      style={{
        borderColor: `var(--${c.colour}, ${c.colour === 'emerald' ? '#10b981' : c.colour === 'red' ? '#ef4444' : c.colour === 'blue' ? '#3b82f6' : '#f59e0b'})33`,
        backgroundColor: `var(--${c.colour}, ${c.colour === 'emerald' ? '#10b981' : c.colour === 'red' ? '#ef4444' : c.colour === 'blue' ? '#3b82f6' : '#f59e0b'})11`,
        color: dark
          ? (c.colour === 'emerald' ? '#6ee7b7' : c.colour === 'red' ? '#fca5a5' : c.colour === 'blue' ? '#93c5fd' : '#fcd34d')
          : (c.colour === 'emerald' ? '#047857' : c.colour === 'red' ? '#b91c1c' : c.colour === 'blue' ? '#1d4ed8' : '#b45309'),
      }}
    >
      <Icon className={cn('h-3 w-3', status === 'deploying' && 'animate-spin')} />
      {c.label}
    </span>
  )
}

function SlotBadge({ slot, dark }: { slot: string; dark: boolean }) {
  const isBlue = slot === 'blue'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
      )}
      style={{
        backgroundColor: isBlue
          ? (dark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.08)')
          : (dark ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.08)'),
        color: isBlue
          ? (dark ? '#93c5fd' : '#1d4ed8')
          : (dark ? '#6ee7b7' : '#047857'),
        border: `1px solid ${isBlue
          ? (dark ? 'rgba(59,130,246,0.2)' : 'rgba(59,130,246,0.15)')
          : (dark ? 'rgba(16,185,129,0.2)' : 'rgba(16,185,129,0.15)')}`,
      }}
    >
      <CircleDot className="h-2.5 w-2.5" />
      {isBlue ? 'Blue' : 'Green'}
    </span>
  )
}

// ── Card wrapper ────────────────────────────────────────────────────────────

function Card({ dark, children, className }: { dark: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-6',
        dark
          ? 'border-white/[0.06] bg-white/[0.02]'
          : 'border-gray-200 bg-white shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function ReleasesPage() {
  const dark = useNexusDark()
  const qc = useQueryClient()
  const { data, isLoading, error } = useReleaseDashboard()
  const [rollbackTarget, setRollbackTarget] = useState<Release | null>(null)
  const [rollbackReason, setRollbackReason] = useState('')
  const [expandedRelease, setExpandedRelease] = useState<string | null>(null)
  const [showAllMigrations, setShowAllMigrations] = useState(false)

  // ── Rollback mutation ──
  const rollbackMutation = useMutation({
    mutationFn: async (params: { targetReleaseId: string; reason: string }) => {
      const res = await fetch('/api/nexus/releases/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      if (!res.ok) throw new Error('Rollback failed')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nexus', 'releases'] })
      setRollbackTarget(null)
      setRollbackReason('')
    },
  })

  const handleRollback = useCallback(() => {
    if (!rollbackTarget) return
    rollbackMutation.mutate({
      targetReleaseId: rollbackTarget.id,
      reason: rollbackReason || `Rollback to ${rollbackTarget.version}`,
    })
  }, [rollbackTarget, rollbackReason, rollbackMutation])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className={cn('h-6 w-6 animate-spin', dark ? 'text-amber-400/50' : 'text-amber-500/50')} />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <ServerCrash className={cn('h-8 w-8', dark ? 'text-red-400/50' : 'text-red-500/50')} />
        <p className={cn('text-sm', dark ? 'text-white/40' : 'text-gray-400')}>
          Failed to load release data. Run migration 221 first.
        </p>
      </div>
    )
  }

  const { current, activeRelease, releases, migrations, blockedMigrations } = data
  const healthyReleases = releases.filter(r => r.status === 'healthy' && !r.is_rollback)

  return (
    <div className="space-y-8">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div>
        <h1 className={cn('text-2xl font-bold tracking-tight', dark ? 'text-white' : 'text-gray-900')}>
          Release Management
        </h1>
        <p className={cn('mt-1 text-sm', dark ? 'text-white/40' : 'text-gray-500')}>
          Directive 079  -  The Atomic Release Architecture. Deploy, verify, rollback.
        </p>
      </div>

      {/* ── Active Version Card ────────────────────────────────────────── */}
      <Card dark={dark}>
        <div className="flex items-start justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl"
                style={{
                  background: dark
                    ? 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(59,130,246,0.2))'
                    : 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(59,130,246,0.1))',
                  border: `1px solid ${dark ? 'rgba(16,185,129,0.2)' : 'rgba(16,185,129,0.15)'}`,
                }}
              >
                <Rocket className={cn('h-6 w-6', dark ? 'text-emerald-400' : 'text-emerald-600')} />
              </div>
              <div>
                <div className={cn('text-xs font-medium uppercase tracking-widest', dark ? 'text-white/30' : 'text-gray-400')}>
                  Active Version
                </div>
                <div className={cn('text-2xl font-bold mono', dark ? 'text-white' : 'text-gray-900')}>
                  v{current.version}
                </div>
              </div>
            </div>

            {/* Version details grid */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-2.5">
              {[
                { label: 'Build SHA', value: current.buildSha?.slice(0, 12) || 'dev', icon: GitBranch },
                { label: 'Deploy Slot', value: current.deploySlot, icon: CircleDot, badge: true },
                { label: 'Environment', value: current.deployEnv || current.environment, icon: Activity },
                { label: 'Enforcement Spec', value: `v${current.enforcementSpec}`, icon: Shield },
                { label: 'Docker Tag', value: activeRelease?.docker_tag || `norva-${current.version}`, icon: Container },
                { label: 'Built At', value: current.buildTime ? new Date(current.buildTime).toLocaleString('en-CA') : 'unknown', icon: Clock },
              ].map(({ label, value, icon: Icon, badge }) => (
                <div key={label} className="flex items-center gap-2.5">
                  <Icon className={cn('h-3.5 w-3.5 shrink-0', dark ? 'text-white/15' : 'text-gray-300')} />
                  <span className={cn('text-[11px] font-medium', dark ? 'text-white/30' : 'text-gray-400')}>
                    {label}:
                  </span>
                  {badge ? (
                    <SlotBadge slot={value} dark={dark} />
                  ) : (
                    <span className={cn('mono text-[11px] font-semibold', dark ? 'text-white/70' : 'text-gray-700')}>
                      {value}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Health status */}
          <div className="text-right space-y-2">
            {activeRelease ? (
              <StatusBadge status={activeRelease.status} dark={dark} />
            ) : (
              <StatusBadge status="healthy" dark={dark} />
            )}
            {activeRelease?.confirmed_at && (
              <div className={cn('text-[10px]', dark ? 'text-white/20' : 'text-gray-300')}>
                Confirmed {timeAgo(activeRelease.confirmed_at)}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* ── Blue-Green Slot Visualisation ──────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        {['blue', 'green'].map((slot) => {
          const isActive = current.deploySlot === slot
          const slotReleases = releases.filter(r => r.deploy_slot === slot)
          const latest = slotReleases[0]

          return (
            <Card dark={dark} key={slot} className={cn(isActive && (dark ? 'ring-1 ring-emerald-500/30' : 'ring-1 ring-emerald-500/20'))}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <SlotBadge slot={slot} dark={dark} />
                  {isActive && (
                    <span
                      className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                      style={{
                        background: dark ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.1)',
                        color: dark ? '#6ee7b7' : '#047857',
                      }}
                    >
                      LIVE
                    </span>
                  )}
                </div>
                <span className={cn('text-[10px]', dark ? 'text-white/20' : 'text-gray-300')}>
                  {isActive ? 'Production' : 'Staging / Preview'}
                </span>
              </div>

              {latest ? (
                <div className="space-y-2">
                  <div className={cn('mono text-lg font-bold', dark ? 'text-white/80' : 'text-gray-800')}>
                    v{latest.version}
                  </div>
                  <div className={cn('mono text-[10px]', dark ? 'text-white/25' : 'text-gray-400')}>
                    {latest.build_sha?.slice(0, 12)} · {timeAgo(latest.deployed_at)}
                  </div>
                  <StatusBadge status={latest.status} dark={dark} />
                </div>
              ) : (
                <div className={cn('text-sm', dark ? 'text-white/20' : 'text-gray-300')}>
                  No deploys recorded
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {/* ── Migration Shield ───────────────────────────────────────────── */}
      <Card dark={dark}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Database className={cn('h-5 w-5', dark ? 'text-amber-400/60' : 'text-amber-500')} />
            <div>
              <h3 className={cn('text-sm font-semibold', dark ? 'text-white/80' : 'text-gray-800')}>
                Migration Shield
              </h3>
              <p className={cn('text-[11px]', dark ? 'text-white/30' : 'text-gray-400')}>
                {migrations.total} migrations applied · Double-phased add-only enforcement
              </p>
            </div>
          </div>

          {blockedMigrations && blockedMigrations.length > 0 ? (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
              style={{
                background: dark ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
                color: dark ? '#fca5a5' : '#b91c1c',
                border: `1px solid ${dark ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.15)'}`,
              }}
            >
              <AlertTriangle className="h-3 w-3" />
              {blockedMigrations.length} Blocked
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
              style={{
                background: dark ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.08)',
                color: dark ? '#6ee7b7' : '#047857',
                border: `1px solid ${dark ? 'rgba(16,185,129,0.2)' : 'rgba(16,185,129,0.15)'}`,
              }}
            >
              <Shield className="h-3 w-3" />
              All Clear
            </span>
          )}
        </div>

        {/* Recent migrations */}
        <div className="space-y-1">
          {(showAllMigrations ? migrations.recent : migrations.recent.slice(0, 5)).map((m) => (
            <div
              key={m.name}
              className={cn(
                'flex items-center justify-between rounded-lg px-3 py-2 text-[11px]',
                dark ? 'bg-white/[0.02]' : 'bg-gray-50',
              )}
            >
              <span className={cn('mono font-medium', dark ? 'text-white/50' : 'text-gray-600')}>
                {m.name}
              </span>
              <span className={cn('mono', dark ? 'text-white/20' : 'text-gray-400')}>
                {new Date(m.applied_at).toLocaleDateString('en-CA')}
              </span>
            </div>
          ))}

          {migrations.recent.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAllMigrations(!showAllMigrations)}
              className={cn(
                'flex items-center gap-1 px-3 py-1 text-[10px] font-medium',
                dark ? 'text-amber-400/50 hover:text-amber-400' : 'text-amber-600/50 hover:text-amber-600',
              )}
            >
              {showAllMigrations ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {showAllMigrations ? 'Show less' : `Show all ${migrations.recent.length}`}
            </button>
          )}
        </div>

        {/* Blocked migrations */}
        {blockedMigrations && blockedMigrations.length > 0 && (
          <div className="mt-4 space-y-2">
            <h4 className={cn('text-[10px] font-semibold uppercase tracking-wider', dark ? 'text-red-400/50' : 'text-red-600/50')}>
              Blocked Migrations
            </h4>
            {blockedMigrations.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-[11px]"
                style={{
                  background: dark ? 'rgba(239,68,68,0.06)' : 'rgba(239,68,68,0.04)',
                  border: `1px solid ${dark ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.08)'}`,
                }}
              >
                <div className="flex items-center gap-2">
                  <Lock className={cn('h-3 w-3', dark ? 'text-red-400/60' : 'text-red-500')} />
                  <span className={cn('mono font-medium', dark ? 'text-red-300/80' : 'text-red-400')}>
                    {m.migration_name}
                  </span>
                </div>
                <span className={cn('mono', dark ? 'text-red-400/40' : 'text-red-400')}>
                  {m.classification}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Deploy History ─────────────────────────────────────────────── */}
      <Card dark={dark}>
        <div className="flex items-center gap-3 mb-4">
          <ArrowDownToLine className={cn('h-5 w-5', dark ? 'text-white/30' : 'text-gray-400')} />
          <h3 className={cn('text-sm font-semibold', dark ? 'text-white/80' : 'text-gray-800')}>
            Deploy History
          </h3>
          <span className={cn('mono text-[10px]', dark ? 'text-white/20' : 'text-gray-300')}>
            Last {releases.length} deploys
          </span>
        </div>

        <div className="space-y-2">
          {releases.map((release) => {
            const isExpanded = expandedRelease === release.id

            return (
              <div
                key={release.id}
                className={cn(
                  'rounded-xl border transition-all',
                  dark ? 'border-white/[0.04] bg-white/[0.01]' : 'border-gray-100 bg-gray-50/50',
                  isExpanded && (dark ? 'border-white/[0.08] bg-white/[0.03]' : 'border-gray-200 bg-white'),
                )}
              >
                {/* Release row */}
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                  onClick={() => setExpandedRelease(isExpanded ? null : release.id)}
                >
                  <div className="flex items-center gap-3">
                    {release.is_rollback ? (
                      <Undo2 className={cn('h-4 w-4', dark ? 'text-amber-400/60' : 'text-amber-500')} />
                    ) : (
                      <Rocket className={cn('h-4 w-4', dark ? 'text-white/20' : 'text-gray-300')} />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={cn('mono text-sm font-bold', dark ? 'text-white/70' : 'text-gray-700')}>
                          v{release.version}
                        </span>
                        <span className={cn('mono text-[10px]', dark ? 'text-white/20' : 'text-gray-400')}>
                          {release.build_sha?.slice(0, 7)}
                        </span>
                        <SlotBadge slot={release.deploy_slot} dark={dark} />
                        <StatusBadge status={release.status} dark={dark} />
                        {release.is_rollback && (
                          <span
                            className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                            style={{
                              background: dark ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.1)',
                              color: dark ? '#fcd34d' : '#b45309',
                            }}
                          >
                            Rollback
                          </span>
                        )}
                      </div>
                      <div className={cn('text-[10px] mt-0.5', dark ? 'text-white/20' : 'text-gray-400')}>
                        {release.deploy_source} · {timeAgo(release.deployed_at)}
                        {release.triggered_by && ` · ${release.triggered_by}`}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Rollback button  -  only for healthy non-rollback production releases */}
                    {release.status === 'healthy' && !release.is_rollback && release.environment === 'production' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setRollbackTarget(release)
                        }}
                        className={cn(
                          'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-all',
                          dark
                            ? 'border-red-500/20 text-red-400/60 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30'
                            : 'border-red-500/20 text-red-500/60 hover:bg-red-950/30 hover:text-red-600 hover:border-red-500/30',
                        )}
                      >
                        <Undo2 className="h-3 w-3" />
                        Rollback
                      </button>
                    )}
                    <ChevronDown className={cn(
                      'h-4 w-4 transition-transform',
                      isExpanded && 'rotate-180',
                      dark ? 'text-white/15' : 'text-gray-300',
                    )} />
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className={cn('border-t px-4 py-3 space-y-2', dark ? 'border-white/[0.04]' : 'border-gray-100')}>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      {[
                        { label: 'Release ID', value: release.id.slice(0, 12) },
                        { label: 'Docker Tag', value: release.docker_tag || 'N/A' },
                        { label: 'Netlify Deploy', value: release.netlify_deploy_id?.slice(0, 12) || 'N/A' },
                        { label: 'Migrations', value: `${release.migrations_applied} applied` },
                        { label: 'Health Check', value: release.health_check_passed ? 'Passed' : 'Pending' },
                        { label: 'Deployed', value: new Date(release.deployed_at).toLocaleString('en-CA') },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex items-center gap-2">
                          <span className={cn('font-medium', dark ? 'text-white/25' : 'text-gray-400')}>{label}:</span>
                          <span className={cn('mono', dark ? 'text-white/50' : 'text-gray-600')}>{value}</span>
                        </div>
                      ))}
                    </div>
                    {release.migration_names && release.migration_names.length > 0 && (
                      <div className="mt-2">
                        <span className={cn('text-[10px] font-medium', dark ? 'text-white/25' : 'text-gray-400')}>
                          Migration files:
                        </span>
                        <div className={cn('mono text-[10px] mt-1', dark ? 'text-white/30' : 'text-gray-500')}>
                          {release.migration_names.join(', ')}
                        </div>
                      </div>
                    )}
                    {release.notes && (
                      <div className={cn('text-[11px] italic', dark ? 'text-white/25' : 'text-gray-400')}>
                        {release.notes}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {releases.length === 0 && (
            <div className={cn('text-center py-8 text-sm', dark ? 'text-white/20' : 'text-gray-300')}>
              No deploys recorded yet. Deploys will appear here after CI/CD runs.
            </div>
          )}
        </div>
      </Card>

      {/* ── Workflow Summary ───────────────────────────────────────────── */}
      <Card dark={dark}>
        <div className="flex items-center gap-3 mb-4">
          <Sparkles className={cn('h-5 w-5', dark ? 'text-amber-400/60' : 'text-amber-500')} />
          <h3 className={cn('text-sm font-semibold', dark ? 'text-white/80' : 'text-gray-800')}>
            Sovereign Release Pipeline
          </h3>
        </div>

        <div className="flex items-center gap-0">
          {[
            { step: 'Code', desc: 'Local Fortress', icon: GitBranch, colour: 'white' },
            { step: 'Commit', desc: 'GitHub', icon: Zap, colour: 'blue' },
            { step: 'Deploy', desc: 'Staging (Green)', icon: Container, colour: 'emerald' },
            { step: 'Ignite', desc: 'Production (Blue)', icon: Rocket, colour: 'amber' },
            { step: 'Panic', desc: 'Rollback', icon: Undo2, colour: 'red' },
          ].map(({ step, desc, icon: Icon, colour }, idx) => (
            <div key={step} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-2 flex-1">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{
                    background: dark
                      ? `rgba(${colour === 'white' ? '255,255,255' : colour === 'blue' ? '59,130,246' : colour === 'emerald' ? '16,185,129' : colour === 'amber' ? '245,158,11' : '239,68,68'},0.12)`
                      : `rgba(${colour === 'white' ? '0,0,0' : colour === 'blue' ? '59,130,246' : colour === 'emerald' ? '16,185,129' : colour === 'amber' ? '245,158,11' : '239,68,68'},0.08)`,
                    border: `1px solid rgba(${colour === 'white' ? '255,255,255' : colour === 'blue' ? '59,130,246' : colour === 'emerald' ? '16,185,129' : colour === 'amber' ? '245,158,11' : '239,68,68'},${dark ? '0.15' : '0.12'})`,
                  }}
                >
                  <Icon
                    className="h-4 w-4"
                    style={{
                      color: dark
                        ? (colour === 'white' ? 'rgba(255,255,255,0.5)' : colour === 'blue' ? '#93c5fd' : colour === 'emerald' ? '#6ee7b7' : colour === 'amber' ? '#fcd34d' : '#fca5a5')
                        : (colour === 'white' ? '#374151' : colour === 'blue' ? '#1d4ed8' : colour === 'emerald' ? '#047857' : colour === 'amber' ? '#b45309' : '#b91c1c'),
                    }}
                  />
                </div>
                <div className="text-center">
                  <div className={cn('text-[10px] font-bold uppercase tracking-wider', dark ? 'text-white/50' : 'text-gray-600')}>
                    {step}
                  </div>
                  <div className={cn('text-[9px]', dark ? 'text-white/20' : 'text-gray-400')}>
                    {desc}
                  </div>
                </div>
              </div>
              {idx < 4 && (
                <div
                  className="h-px w-6 shrink-0"
                  style={{ background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}
                />
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* ── Rollback Confirmation Modal ────────────────────────────────── */}
      {rollbackTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div
            className={cn(
              'mx-4 w-full max-w-md rounded-2xl border p-6 shadow-2xl',
              dark
                ? 'border-red-500/20 bg-zinc-950'
                : 'border-red-500/20 bg-white',
            )}
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{
                  background: dark ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)',
                  border: `1px solid ${dark ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.15)'}`,
                }}
              >
                <AlertTriangle className={cn('h-5 w-5', dark ? 'text-red-400' : 'text-red-500')} />
              </div>
              <div>
                <h3 className={cn('font-semibold', dark ? 'text-white' : 'text-gray-900')}>
                  Confirm Rollback
                </h3>
                <p className={cn('text-xs', dark ? 'text-white/40' : 'text-gray-500')}>
                  THE PANIC BUTTON  -  this will restore production to a previous state
                </p>
              </div>
            </div>

            <div
              className={cn('rounded-lg p-3 mb-4 text-sm', dark ? 'bg-white/[0.03] text-white/60' : 'bg-gray-50 text-gray-600')}
            >
              Rolling back to <strong className={cn(dark ? 'text-white' : 'text-gray-900')}>v{rollbackTarget.version}</strong>
              {' '}({rollbackTarget.build_sha?.slice(0, 7)}) deployed {timeAgo(rollbackTarget.deployed_at)}
            </div>

            <div className="mb-4">
              <label className={cn('text-xs font-medium mb-1.5 block', dark ? 'text-white/40' : 'text-gray-500')}>
                Reason (optional)
              </label>
              <input
                type="text"
                value={rollbackReason}
                onChange={(e) => setRollbackReason(e.target.value)}
                placeholder="Why are you rolling back?"
                className={cn(
                  'w-full rounded-lg border px-3 py-2 text-sm outline-none',
                  dark
                    ? 'border-white/10 bg-white/[0.04] text-white placeholder-white/20 focus:border-red-500/30'
                    : 'border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:border-red-400',
                )}
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => { setRollbackTarget(null); setRollbackReason('') }}
                className={cn(
                  'rounded-lg px-4 py-2 text-xs font-medium transition-colors',
                  dark
                    ? 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50',
                )}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRollback}
                disabled={rollbackMutation.isPending}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-5 py-2 text-xs font-bold uppercase tracking-wider transition-all',
                  'bg-red-600 text-white hover:bg-red-700 disabled:opacity-50',
                )}
              >
                {rollbackMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Undo2 className="h-3.5 w-3.5" />
                )}
                Execute Rollback
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
