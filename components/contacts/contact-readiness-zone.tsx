'use client'

/**
 * ContactReadinessZone  -  Directive 41.0 Readiness Decoupling
 *
 * For Leads: Shows "Intake Completion" (0-100)  -  how much of the intake
 * pipeline is complete (ID 20%, basic info 20%, payment 60%).
 *
 * For Clients (with a matter): Shows "Legal Success Probability" (0-100)  - 
 * the existing matter readiness score ("Red 35" scenario).
 */

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useReadinessScore } from '@/lib/queries/readiness'
import { useLeadReadiness } from '@/lib/queries/lead-readiness'
import { ReadinessZone } from '@/components/matters/vitality-header/readiness-zone'
import type { ReadinessZoneData } from '@/components/matters/vitality-header/types'
import type { ReadinessResult } from '@/lib/services/readiness-engine'
import {
  FileQuestion,
  TrendingUp,
  ClipboardCheck,
  AlertTriangle,
  Shield,
  CheckCircle2,
  XCircle,
  FileText,
  FolderOpen,
  Scale,
  Loader2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

// ── Props ────────────────────────────────────────────────────────────────────

interface ContactReadinessZoneProps {
  contactId: string
  tenantId: string
}

// ── Hooks ────────────────────────────────────────────────────────────────────

function usePrimaryMatter(contactId: string, tenantId: string) {
  return useQuery({
    queryKey: ['contact-primary-matter', contactId, tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matter_contacts')
        .select('matter_id')
        .eq('contact_id', contactId)
        .eq('tenant_id', tenantId)
        .eq('is_primary', true)
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data?.matter_id as string | null
    },
    enabled: !!contactId && !!tenantId,
    staleTime: 1000 * 60 * 5,
  })
}

function useActiveLead(contactId: string) {
  return useQuery({
    queryKey: ['contact-active-lead', contactId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('leads')
        .select('id, status')
        .eq('contact_id', contactId)
        .not('status', 'in', '("converted","closed_lost","closed_won","closed")')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!contactId,
  })
}

// ── Map ReadinessResult -> ReadinessZoneData ─────────────────────────────────

function toClientZoneData(r: ReadinessResult): ReadinessZoneData {
  const riskLevel: ReadinessZoneData['riskLevel'] =
    r.level === 'ready' ? 'low' : r.level === 'high' ? 'medium' : r.level

  return {
    overallScore: r.total,
    riskLevel,
    completionPct: r.total,
    intakeStatus: null,
    draftingReady: r.total >= 70,
    draftingBlockerCount: 0,
    filingReady: r.total >= 90,
    filingBlockerCount: 0,
    lawyerReviewRequired: false,
    lawyerReviewStatus: null,
    stalePacks: 0,
    formsPct: r.total,
    docsPct: r.total,
    contradictionCount: 0,
    topBlockers: r.total < 40 ? [{ label: r.focus_area, type: 'domain' }] : [],
    domains: r.domains.map((d) => ({
      key: d.name,
      label: d.name,
      pct: d.score,
      satisfied: Math.round(d.score / 10),
      total: 10,
    })),
  }
}

// ── Intake Completion Ring (for Leads) ───────────────────────────────────────

function IntakeCompletionRing({ score, missing }: { score: number; missing: { key: string; label: string }[] }) {
  const radius = 36
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (score / 100) * circumference

  const colorClass =
    score >= 70 ? 'text-emerald-500' :
    score >= 40 ? 'text-amber-500' :
    'text-red-500'

  const bgColorClass =
    score >= 70 ? 'stroke-emerald-100' :
    score >= 40 ? 'stroke-amber-100' :
    'stroke-red-100'

  const labelText = score >= 70 ? 'Ready to Convert' : score >= 40 ? 'In Progress' : 'Needs Attention'

  return (
    <div className="space-y-3">
      {/* Header label */}
      <div className="flex items-center gap-1.5">
        <ClipboardCheck className="size-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Intake Completion
        </span>
      </div>

      {/* Score ring */}
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <svg width="88" height="88" viewBox="0 0 88 88">
            <circle
              cx="44" cy="44" r={radius}
              fill="none"
              className={bgColorClass}
              strokeWidth="6"
            />
            <circle
              cx="44" cy="44" r={radius}
              fill="none"
              className={colorClass}
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              transform="rotate(-90 44 44)"
              style={{ transition: 'stroke-dashoffset 0.6s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn('text-lg font-bold', colorClass)}>{score}%</span>
          </div>
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          <p className={cn('text-xs font-semibold', colorClass)}>{labelText}</p>
          {/* Intake breakdown */}
          <div className="space-y-1">
            <IntakeBar label="Identity" pct={score >= 20 ? 100 : score * 5} />
            <IntakeBar label="Basic Info" pct={score >= 40 ? 100 : Math.max(0, (score - 20) * 5)} />
            <IntakeBar label="Payment" pct={score >= 100 ? 100 : Math.max(0, (score - 40) * (100 / 60))} />
          </div>
        </div>
      </div>

      {/* Missing fields */}
      {missing.length > 0 && (
        <div className="border-t border-slate-100 pt-2 space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground">Missing Fields</p>
          <div className="flex flex-wrap gap-1">
            {missing.slice(0, 5).map((m) => (
              <span
                key={m.key}
                className="inline-flex items-center rounded bg-amber-950/30 border border-amber-500/20 px-1.5 py-0.5 text-[9px] text-amber-400"
              >
                {m.label}
              </span>
            ))}
            {missing.length > 5 && (
              <span className="text-[9px] text-muted-foreground">+{missing.length - 5} more</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function IntakeBar({ label, pct }: { label: string; pct: number }) {
  const clampedPct = Math.min(100, Math.max(0, Math.round(pct)))
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-14 shrink-0">{label}</span>
      <div className="flex-1 h-1 rounded-full bg-slate-100">
        <div
          className={cn(
            'h-1 rounded-full transition-all duration-500',
            clampedPct >= 100 ? 'bg-emerald-950/300' : clampedPct > 0 ? 'bg-amber-400' : 'bg-slate-200',
          )}
          style={{ width: `${clampedPct}%` }}
        />
      </div>
      <span className="text-[9px] text-muted-foreground w-7 text-right">{clampedPct}%</span>
    </div>
  )
}

// ── Legal Success Probability Gauge (for Clients) ─────────────────────────────

/** Colour helpers  -  mirrors readiness-zone.tsx scoreColour */
function gaugeColour(score: number) {
  if (score >= 95) return { stroke: '#d4af37', text: 'text-yellow-600', bg: 'bg-yellow-500', ring: 'stroke-yellow-200', gold: true }
  if (score >= 85) return { stroke: '#22c55e', text: 'text-green-600', bg: 'bg-emerald-950/300', ring: 'stroke-green-100', gold: false }
  if (score >= 60) return { stroke: '#f59e0b', text: 'text-amber-600', bg: 'bg-amber-950/300', ring: 'stroke-amber-100', gold: false }
  return { stroke: '#ef4444', text: 'text-red-600', bg: 'bg-red-950/300', ring: 'stroke-red-100', gold: false }
}

function riskLabel(level: string) {
  switch (level) {
    case 'ready': return { label: 'Ready', classes: 'border-green-300 bg-emerald-950/30 text-emerald-400' }
    case 'high': return { label: 'High', classes: 'border-green-300 bg-emerald-950/30 text-emerald-400' }
    case 'medium': return { label: 'Medium', classes: 'border-amber-300 bg-amber-950/30 text-amber-400' }
    case 'low': return { label: 'Low', classes: 'border-red-300 bg-red-950/30 text-red-400' }
    case 'critical': return { label: 'Critical', classes: 'border-red-400 bg-red-100 text-red-800' }
    default: return { label: level, classes: 'border-slate-300 bg-slate-50 text-slate-700' }
  }
}

function domainBarColour(pct: number) {
  if (pct >= 85) return 'bg-emerald-950/300'
  if (pct >= 60) return 'bg-amber-950/300'
  return 'bg-red-950/300'
}

function ClientReadinessView({ matterId }: { matterId: string }) {
  const { data: readiness, isLoading } = useReadinessScore(matterId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!readiness) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
        <Scale className="size-8 opacity-40" />
        <p className="text-sm font-medium">No readiness data</p>
        <p className="text-xs">Matter readiness has not been calculated yet.</p>
      </div>
    )
  }

  const score = readiness.total
  const isRed35 = score <= 35
  const colours = gaugeColour(score)
  const risk = riskLabel(readiness.level)

  // SVG gauge
  const radius = 44
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (score / 100) * circumference

  // Sort domains by weight descending for the breakdown
  const sortedDomains = [...readiness.domains].sort((a, b) => b.weight - a.weight)

  // Derive drafting/filing readiness
  const draftingReady = score >= 70
  const filingReady = score >= 90

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="size-3.5 text-muted-foreground" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Legal Success Probability
            </span>
          </div>
          {isRed35 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 border border-red-300 px-2 py-0.5 text-[10px] font-bold text-red-400 animate-pulse">
              <AlertTriangle className="size-2.5" />
              Red {score}
            </span>
          )}
        </div>

        {/* ── Score Ring + Risk Level ─────────────────────────────── */}
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            {colours.gold && (
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: 'radial-gradient(circle, rgba(212,175,55,0.25) 0%, transparent 70%)',
                  animation: 'pulse 2s ease-in-out infinite',
                }}
              />
            )}
            <svg width="100" height="100" viewBox="0 0 100 100" aria-hidden="true">
              <circle
                cx="50" cy="50" r={radius}
                fill="none"
                className={colours.ring}
                strokeWidth="7"
              />
              <circle
                cx="50" cy="50" r={radius}
                fill="none"
                stroke={colours.stroke}
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                transform="rotate(-90 50 50)"
                style={{ transition: 'stroke-dashoffset 0.6s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={cn('text-2xl font-bold tabular-nums', colours.text)}>{score}</span>
              <span className="text-[9px] text-muted-foreground font-medium">/ 100</span>
            </div>
          </div>

          <div className="flex-1 min-w-0 space-y-2">
            {/* Risk level badge */}
            <Badge variant="outline" className={cn('gap-1 text-[10px]', risk.classes)}>
              <Shield className="size-3" />
              {risk.label} Risk
            </Badge>

            {/* Drafting / Filing gates */}
            <div className="flex flex-wrap gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className={cn(
                      'gap-1 text-[9px]',
                      draftingReady
                        ? 'border-green-300 bg-emerald-950/30 text-emerald-400'
                        : 'border-red-300 bg-red-950/30 text-red-400',
                    )}
                  >
                    {draftingReady ? <CheckCircle2 className="size-2.5" /> : <XCircle className="size-2.5" />}
                    Drafting
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {draftingReady ? 'Drafting ready  -  score above 70' : 'Drafting blocked  -  score below 70'}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className={cn(
                      'gap-1 text-[9px]',
                      filingReady
                        ? 'border-green-300 bg-emerald-950/30 text-emerald-400'
                        : 'border-red-300 bg-red-950/30 text-red-400',
                    )}
                  >
                    {filingReady ? <CheckCircle2 className="size-2.5" /> : <XCircle className="size-2.5" />}
                    Filing
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {filingReady ? 'Filing ready  -  score above 90' : 'Filing blocked  -  score below 90'}
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Focus area callout */}
            {score < 90 && (
              <p className="text-[10px] text-muted-foreground">
                <AlertTriangle className="inline size-2.5 mr-0.5 text-amber-500" />
                Focus: <span className="font-medium">{readiness.focus_area}</span>
              </p>
            )}
          </div>
        </div>

        {/* ── Domain Breakdown ────────────────────────────────────── */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Domain Breakdown
          </p>
          {sortedDomains.map((domain) => (
            <Tooltip key={domain.name}>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 group cursor-default">
                  <span className="w-24 shrink-0 truncate text-[10px] text-muted-foreground group-hover:text-foreground transition-colors">
                    {domain.name}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-500',
                        domainBarColour(domain.score),
                      )}
                      style={{ width: `${Math.min(domain.score, 100)}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-[10px] font-medium tabular-nums text-muted-foreground">
                    {domain.score}%
                  </span>
                  <span className="w-8 shrink-0 text-right text-[9px] tabular-nums text-muted-foreground/50">
                    ×{Math.round(domain.weight * 100)}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs max-w-xs">
                <p className="font-medium">{domain.name}  -  {domain.score}% (weight: {Math.round(domain.weight * 100)}%)</p>
                <p className="text-muted-foreground">{domain.detail}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        {/* ── Completion Meters ───────────────────────────────────── */}
        <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
          <GaugePill label="Forms" pct={readiness.domains.find(d => d.name === 'Forms')?.score ?? 0} icon={FileText} />
          <GaugePill label="Docs" pct={readiness.domains.find(d => d.name === 'Documents')?.score ?? 0} icon={FolderOpen} />
        </div>
      </div>
    </TooltipProvider>
  )
}

function GaugePill({
  label,
  pct,
  icon: Icon,
}: {
  label: string
  pct: number
  icon: React.ComponentType<{ className?: string }>
}) {
  const colour = gaugeColour(pct)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5 rounded-full bg-muted/50 px-2 py-0.5 cursor-default">
          <Icon className="size-3 text-muted-foreground" />
          <div className="relative h-1.5 w-14 overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full transition-all duration-500', colour.bg)}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
            {pct}%
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>{label}: {pct}% complete</TooltipContent>
    </Tooltip>
  )
}

// ── No-Data Placeholder ─────────────────────────────────────────────────────

function NoDataPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
      <FileQuestion className="size-8 opacity-40" />
      <p className="text-sm font-medium">No readiness data</p>
      <p className="text-xs">
        Create a lead or assign a matter to see readiness scores.
      </p>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function ContactReadinessZone({ contactId, tenantId }: ContactReadinessZoneProps) {
  const { data: matterId, isLoading: matterLoading } = usePrimaryMatter(contactId, tenantId)
  const { data: activeLead, isLoading: leadLoading } = useActiveLead(contactId)
  const { data: leadReadiness, isLoading: leadReadinessLoading } = useLeadReadiness(activeLead?.id)

  const isClient = !!matterId
  const isLead = !isClient && !!activeLead

  // Loading
  if (matterLoading || leadLoading) {
    return <ReadinessZone data={null} isLoading />
  }

  // Client path → Legal Success Probability
  if (isClient) {
    return <ClientReadinessView matterId={matterId} />
  }

  // Lead path → Intake Completion
  if (isLead) {
    if (leadReadinessLoading) {
      return <ReadinessZone data={null} isLoading />
    }

    return (
      <IntakeCompletionRing
        score={leadReadiness?.score ?? 0}
        missing={leadReadiness?.missing ?? []}
      />
    )
  }

  // Neither lead nor client
  return <NoDataPlaceholder />
}
