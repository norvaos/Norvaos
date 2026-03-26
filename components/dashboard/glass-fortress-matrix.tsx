'use client'

/**
 * Glass Fortress Matrix  -  Session A: "Prestige" Architect
 *
 * The "Bento-Box" Glassmorphism dashboard presenting the Norva Sovereign Matrix.
 * Each matter card is a piece of polished jade:
 *   - backdrop-blur + 0.05 opacity emerald borders
 *   - "Micro-Audit Trace" on hover: 500ms SHA-256 hash connecting to Global Firm Hash
 *   - High-Fidelity SVG Circular Gauge replacing standard progress bars
 *   - Heat-Map Red pulse at 34 (Locked), Gold Aura at 100
 *
 * Uses a "bento" grid layout  -  no sharp edges, every card is a frosted surface.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useFirmHealth } from '@/lib/hooks/use-firm-health'
import {
  Shield,
  ShieldCheck,
  Sparkles,
  Lock,
  Fingerprint,
  Link2,
  AlertTriangle,
  Activity,
  Loader2,
  ArrowRight,
  Hash,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import Link from 'next/link'

// ── Types ───────────────────────────────────────────────────────────────────

interface MatrixMatter {
  id: string
  matter_number: string | null
  title: string
  status: string | null
  readiness_score: number | null
  genesis_hash: string | null
  is_compliant: boolean | null
  trust_balance_cents: number | null
  updated_at: string | null
}

interface FirmHashData {
  globalFirmHash: string
  totalGenesis: number
  totalMatters: number
}

// ── Glass Fortress Hook ─────────────────────────────────────────────────────

function useMatrixMatters(tenantId: string) {
  return useQuery({
    queryKey: ['glass-fortress-matrix', tenantId],
    queryFn: async (): Promise<{ matters: MatrixMatter[]; firmHash: FirmHashData }> => {
      const supabase = createClient()

      // Fetch active matters with readiness + genesis data
      const { data: matters, error } = await supabase
        .from('matters')
        .select('id, matter_number, title, status, readiness_score, updated_at')
        .eq('tenant_id', tenantId)
        .in('status', ['active', 'pending', 'in_progress'])
        .order('updated_at', { ascending: false })
        .limit(24)

      if (error) throw error

      // Batch fetch genesis metadata
      const matterIds = (matters ?? []).map((m) => m.id)
      const { data: genesisData } = await supabase
        .from('matter_genesis_metadata')
        .select('matter_id, genesis_hash, is_compliant')
        .in('matter_id', matterIds)

      const genesisMap = new Map(
        (genesisData ?? []).map((g) => [g.matter_id, g])
      )

      // Compute a pseudo-firm-hash from available genesis hashes
      const allHashes = (genesisData ?? []).map((g) => g.genesis_hash).filter(Boolean)
      const firmHashInput = [tenantId, ...allHashes].join(':')

      // Browser-compatible SHA-256
      const encoder = new TextEncoder()
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(firmHashInput))
      const globalFirmHash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')

      const enriched: MatrixMatter[] = (matters ?? []).map((m) => {
        const genesis = genesisMap.get(m.id)
        return {
          ...m,
          genesis_hash: genesis?.genesis_hash ?? null,
          is_compliant: genesis?.is_compliant ?? null,
          trust_balance_cents: null,
        }
      })

      return {
        matters: enriched,
        firmHash: {
          globalFirmHash,
          totalGenesis: allHashes.length,
          totalMatters: matters?.length ?? 0,
        },
      }
    },
    enabled: !!tenantId,
    staleTime: 1000 * 15,
    refetchInterval: 30000,
  })
}

// ── SVG High-Fidelity Readiness Ring ────────────────────────────────────────

function ReadinessRingGauge({
  score,
  size = 56,
  strokeWidth = 4,
}: {
  score: number
  size?: number
  strokeWidth?: number
}) {
  const radius = (size - strokeWidth * 2) / 2
  const circumference = 2 * Math.PI * radius
  const progress = (Math.min(score, 100) / 100) * circumference

  const isLocked = score <= 34
  const isPerfect = score >= 100
  const isHigh = score >= 70

  const ringColour = isPerfect
    ? 'stroke-emerald-500'
    : isHigh
      ? 'stroke-emerald-400'
      : score >= 40
        ? 'stroke-amber-400'
        : 'stroke-red-500'

  const textColour = isPerfect
    ? 'text-emerald-600'
    : isHigh
      ? 'text-emerald-500'
      : score >= 40
        ? 'text-amber-500'
        : 'text-red-500'

  return (
    <div className="relative">
      <svg width={size} height={size} className="-rotate-90">
        {/* Background ring  -  frosted track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-white/10"
        />
        {/* Progress ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          className={cn(
            ringColour,
            'transition-all duration-700 ease-out',
            isLocked && 'animate-pulse',
          )}
        />
        {/* Outer glow for perfect score */}
        {isPerfect && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius + 3}
            fill="none"
            strokeWidth={1}
            className="stroke-amber-400/40"
            style={{
              filter: 'drop-shadow(0 0 6px rgba(212, 175, 55, 0.5))',
            }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn('text-xs font-bold tabular-nums', textColour)}>
          {score}
        </span>
      </div>
    </div>
  )
}

// ── Micro-Audit Trace Overlay ───────────────────────────────────────────────

function MicroAuditTrace({
  genesisHash,
  firmHash,
  visible,
}: {
  genesisHash: string | null
  firmHash: string
  visible: boolean
}) {
  if (!visible || !genesisHash) return null

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-black/70 backdrop-blur-md transition-opacity duration-500 animate-in fade-in">
      {/* Genesis Hash */}
      <div className="flex items-center gap-1.5 mb-2">
        <Fingerprint className="h-3 w-3 text-emerald-400" />
        <span className="text-[9px] font-mono text-emerald-400/90 tracking-wider">
          GENESIS
        </span>
      </div>
      <p className="text-[10px] font-mono text-emerald-300/80 px-3 text-center break-all leading-relaxed mb-3">
        {genesisHash.slice(0, 32)}
      </p>

      {/* Connection line */}
      <div className="flex flex-col items-center gap-0.5 mb-3">
        <div className="w-px h-3 bg-gradient-to-b from-emerald-400/60 to-amber-400/60" />
        <Link2 className="h-3 w-3 text-amber-400/70" />
        <div className="w-px h-3 bg-gradient-to-b from-amber-400/60 to-violet-400/60" />
      </div>

      {/* Firm Hash */}
      <div className="flex items-center gap-1.5 mb-2">
        <Hash className="h-3 w-3 text-violet-400" />
        <span className="text-[9px] font-mono text-violet-400/90 tracking-wider">
          FIRM CHAIN
        </span>
      </div>
      <p className="text-[10px] font-mono text-violet-300/80 px-3 text-center break-all leading-relaxed">
        {firmHash.slice(0, 32)}
      </p>
    </div>
  )
}

// ── Glass Matter Card ───────────────────────────────────────────────────────

function GlassMatterCard({
  matter,
  firmHash,
}: {
  matter: MatrixMatter
  firmHash: string
}) {
  const [showTrace, setShowTrace] = useState(false)
  const hoverTimeout = useRef<NodeJS.Timeout | null>(null)

  const score = matter.readiness_score ?? 0
  const isSealed = !!matter.genesis_hash
  const isPerfect = score >= 100
  const isLocked = score <= 34

  const handleMouseEnter = useCallback(() => {
    if (!matter.genesis_hash) return
    hoverTimeout.current = setTimeout(() => setShowTrace(true), 500)
  }, [matter.genesis_hash])

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
    setShowTrace(false)
  }, [])

  return (
    <Link
      href={`/matters/${matter.id}`}
      className="block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={cn(
          'group relative rounded-2xl border p-4 transition-all duration-300',
          // Glassmorphism base
          'bg-white/[0.04] backdrop-blur-xl',
          'hover:bg-white/[0.08] hover:shadow-lg hover:shadow-emerald-900/10',
          // Border colour by state
          isSealed && isPerfect
            ? 'border-amber-400/20 hover:border-amber-400/40'
            : isSealed
              ? 'border-emerald-500/15 hover:border-emerald-500/30'
              : isLocked
                ? 'border-red-500/20 hover:border-red-500/35 glass-heatmap-pulse'
                : 'border-white/[0.08] hover:border-emerald-500/20',
          // Gold Aura for perfect score
          isPerfect && 'glass-gold-aura',
        )}
      >
        {/* Micro-Audit Trace overlay */}
        <MicroAuditTrace
          genesisHash={matter.genesis_hash}
          firmHash={firmHash}
          visible={showTrace}
        />

        {/* Card content */}
        <div className="flex items-start gap-3">
          {/* Readiness Ring */}
          <ReadinessRingGauge score={score} />

          {/* Matter info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-mono text-white/40 tracking-wider">
                {matter.matter_number}
              </span>
              {isSealed && (
                <Badge
                  variant="outline"
                  className="text-[9px] px-1.5 py-0 h-4 border-emerald-500/30 text-emerald-400/80 bg-emerald-500/5"
                >
                  <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />
                  Sealed
                </Badge>
              )}
            </div>
            <p className="text-sm font-medium text-white/80 truncate group-hover:text-white transition-colors">
              {matter.title}
            </p>
            <div className="flex items-center gap-2 mt-1.5">
              <StatusPill status={matter.status ?? 'pending'} />
              {matter.genesis_hash && (
                <span className="text-[9px] font-mono text-white/25 truncate max-w-20">
                  {matter.genesis_hash.slice(0, 8)}...
                </span>
              )}
            </div>
          </div>

          {/* Arrow indicator */}
          <ArrowRight className="h-4 w-4 text-white/20 group-hover:text-white/50 transition-colors shrink-0 mt-1" />
        </div>
      </div>
    </Link>
  )
}

// ── Status Pill ─────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    active: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'Active' },
    pending: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'Pending' },
    in_progress: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'In Progress' },
  }
  const c = config[status] ?? { bg: 'bg-white/10', text: 'text-white/50', label: status }

  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium', c.bg, c.text)}>
      {c.label}
    </span>
  )
}

// ── Firm Hash Card ──────────────────────────────────────────────────────────

function FirmHashCard({ firmHash }: { firmHash: FirmHashData }) {
  return (
    <div className="rounded-2xl border border-violet-500/15 bg-white/[0.03] backdrop-blur-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="h-4 w-4 text-violet-400" />
        <span className="text-xs font-semibold text-violet-300/90 uppercase tracking-wider">
          Global Firm Hash
        </span>
      </div>
      <p className="font-mono text-[11px] text-violet-300/60 break-all leading-relaxed mb-4">
        {firmHash.globalFirmHash}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white/[0.04] p-3 text-center">
          <p className="text-lg font-bold text-emerald-400 tabular-nums">{firmHash.totalGenesis}</p>
          <p className="text-[10px] text-white/40 mt-0.5">Genesis Sealed</p>
        </div>
        <div className="rounded-xl bg-white/[0.04] p-3 text-center">
          <p className="text-lg font-bold text-white/70 tabular-nums">{firmHash.totalMatters}</p>
          <p className="text-[10px] text-white/40 mt-0.5">Active Matters</p>
        </div>
      </div>
    </div>
  )
}

// ── Firm Health Pulse Card ──────────────────────────────────────────────────

function HealthPulseCard() {
  const { overallStatus, data } = useFirmHealth()

  const statusConfig = {
    COMPLIANT: { colour: 'text-emerald-400', bg: 'border-emerald-500/20', icon: ShieldCheck, label: 'Compliant' },
    WARNING: { colour: 'text-amber-400', bg: 'border-amber-500/20', icon: AlertTriangle, label: 'Warning' },
    CRITICAL: { colour: 'text-red-400', bg: 'border-red-500/20', icon: AlertTriangle, label: 'Critical' },
  }

  const config = statusConfig[overallStatus] ?? statusConfig.COMPLIANT
  const Icon = config.icon

  const gapRate = data?.checks?.hardeningIntegrity?.gapClosureRate ?? 0

  return (
    <div className={cn('rounded-2xl border bg-white/[0.03] backdrop-blur-xl p-5', config.bg)}>
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-white/50" />
        <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">
          Firm Health Pulse
        </span>
      </div>
      <div className="flex items-center gap-3 mb-4">
        <Icon className={cn('h-8 w-8', config.colour)} />
        <div>
          <p className={cn('text-lg font-bold', config.colour)}>{config.label}</p>
          <p className="text-[10px] text-white/30">Real-time compliance state</p>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-1000',
            gapRate >= 90 ? 'bg-emerald-500' : gapRate >= 60 ? 'bg-amber-500' : 'bg-red-500',
          )}
          style={{ width: `${Math.min(gapRate, 100)}%` }}
        />
      </div>
      <p className="text-[10px] text-white/30 mt-1.5 text-right tabular-nums">
        Gap Closure: {gapRate}%
      </p>
    </div>
  )
}

// ── Main Export ──────────────────────────────────────────────────────────────

export function GlassFortressMatrix() {
  const { tenant } = useTenant()
  const { data, isLoading } = useMatrixMatters(tenant?.id ?? '')

  if (isLoading || !data) {
    return (
      <div className="glass-fortress-container rounded-3xl border border-white/[0.06] bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-500/50" />
        </div>
      </div>
    )
  }

  return (
    <div className="glass-fortress-container rounded-3xl border border-white/[0.06] bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10">
            <Sparkles className="h-4 w-4 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white/90">Norva Sovereign Matrix</h2>
            <p className="text-[10px] text-white/30">Hover a sealed matter for Micro-Audit Trace</p>
          </div>
        </div>
        <Badge
          variant="outline"
          className="text-[10px] border-emerald-500/20 text-emerald-400/60 bg-emerald-500/5"
        >
          {data.matters.length} matters
        </Badge>
      </div>

      {/* Bento Grid  -  top row: Firm Hash + Health Pulse */}
      <div className="grid gap-4 lg:grid-cols-2">
        <FirmHashCard firmHash={data.firmHash} />
        <HealthPulseCard />
      </div>

      {/* Bento Grid  -  matter cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {data.matters.map((matter) => (
          <GlassMatterCard
            key={matter.id}
            matter={matter}
            firmHash={data.firmHash.globalFirmHash}
          />
        ))}
      </div>

      {data.matters.length === 0 && (
        <div className="text-center py-12">
          <Lock className="h-8 w-8 mx-auto text-white/20 mb-3" />
          <p className="text-sm text-white/30">No active matters in the Sovereign Matrix</p>
        </div>
      )}
    </div>
  )
}
