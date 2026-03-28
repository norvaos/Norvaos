'use client'

/**
 * ZoneA  -  Control Header
 *
 * Fixed top bar. Always visible. ~80px height.
 * Shows: matter number, title, matter-type pill, status badge, priority
 * indicator, responsible lawyer, open risk-flag count, and quick-action
 * buttons (Flag, Notes, Share, Retainer).
 *
 * Data fetched internally so the WorkplaceShell stays a thin layout shell.
 */

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { ArrowLeft, Flag, StickyNote, Share2, AlertTriangle, FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useQuery } from '@tanstack/react-query'
import { useMatterRiskFlagCount } from '@/lib/queries/stage-transitions'
import { useLatestRetainerAgreement } from '@/lib/queries/retainer-agreements'
import { useMatterSLA } from '@/lib/queries/sla'
import { useReadinessScore } from '@/lib/queries/readiness'
import { RetainerGenerationModal } from '@/components/retainer/RetainerGenerationModal'
import type { Database } from '@/lib/types/database'

type Matter = Database['public']['Tables']['matters']['Row']

// ── Status display config ────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active:            { label: 'Active',              className: 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30' },
  intake:            { label: 'Intake',              className: 'bg-blue-950/40 text-blue-400 border-blue-500/30' },
  closed_won:        { label: 'Closed  -  Won',        className: 'bg-slate-100 text-slate-700 border-slate-300' },
  closed_refused:    { label: 'Closed  -  Refused',    className: 'bg-red-950/40 text-red-400 border-red-500/30' },
  closed_withdrawn:  { label: 'Closed  -  Withdrawn',  className: 'bg-amber-950/40 text-amber-400 border-amber-500/30' },
  on_hold:           { label: 'On Hold',             className: 'bg-yellow-950/40 text-yellow-400 border-yellow-500/30' },
}

const PRIORITY_DOT: Record<string, string> = {
  low:      'bg-slate-400',
  medium:   'bg-amber-400',
  high:     'bg-red-950/300',
  critical: 'bg-red-700 animate-pulse',
}

const RISK_LEVEL_CONFIG: Record<string, string> = {
  critical: 'bg-red-950/30 text-red-400 border-red-500/30',
  high:     'bg-orange-950/30 text-orange-400 border-orange-500/30',
  medium:   'bg-amber-950/30 text-amber-400 border-amber-500/30',
  low:      'bg-emerald-950/30 text-emerald-400 border-emerald-500/30',
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface ZoneAProps {
  matter: Matter
  tenantId: string
  /** Optional: called when user clicks Flag button  -  e.g. open risk-flag modal */
  onFlagClick?: () => void
  /** Optional: called when user clicks Notes  -  e.g. scroll to notes tab */
  onNotesClick?: () => void
}

// ── Component ────────────────────────────────────────────────────────────────

export function ZoneA({ matter, tenantId, onFlagClick, onNotesClick }: ZoneAProps) {
  const supabase = createClient()
  const router = useRouter()
  const pathname = usePathname()
  const [retainerModalOpen, setRetainerModalOpen] = useState(false)

  // Composite readiness score
  const { data: readiness, isLoading: readinessLoading } = useReadinessScore(matter.id)

  // Determine if retainer is already signed  -  used to decide button label/style
  const { data: latestRetainer } = useLatestRetainerAgreement(matter.id)

  // Matter-type name + colour
  const { data: matterType } = useQuery({
    queryKey: ['matter_type_meta', matter.matter_type_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('matter_types')
        .select('id, name, color')
        .eq('id', matter.matter_type_id!)
        .single()
      return (data ?? null) as { id: string; name: string; color: string | null } | null
    },
    enabled: !!matter.matter_type_id,
    staleTime: 5 * 60 * 1000,
  })

  // Responsible lawyer display name
  const { data: lawyer } = useQuery({
    queryKey: ['user_display', matter.responsible_lawyer_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('users')
        .select('id, first_name, last_name, email')
        .eq('id', matter.responsible_lawyer_id!)
        .single()
      return (data ?? null) as {
        id: string
        first_name: string | null
        last_name: string | null
        email: string
      } | null
    },
    enabled: !!matter.responsible_lawyer_id,
    staleTime: 10 * 60 * 1000,
  })

  // Open risk-flag count
  const { data: riskFlagCount = 0 } = useMatterRiskFlagCount(matter.id)

  // Most critical active SLA (first by due_at)
  const { data: activeSLAs = [] } = useMatterSLA(matter.id)
  const criticalSLA = activeSLAs[0] ?? null
  const criticalSLARemaining = criticalSLA
    ? Math.max(0, Math.round((new Date(criticalSLA.due_at).getTime() - Date.now()) / (1000 * 60 * 60)))
    : null

  const statusCfg  = STATUS_CONFIG[matter.status ?? 'active'] ?? { label: matter.status ?? 'Unknown', className: 'bg-slate-100 text-slate-700 border-slate-300' }
  const priorityDot = PRIORITY_DOT[matter.priority ?? 'medium'] ?? PRIORITY_DOT.medium
  const riskLevelCfg = matter.risk_level ? RISK_LEVEL_CONFIG[matter.risk_level] : null

  const lawyerName = lawyer
    ? [lawyer.first_name, lawyer.last_name].filter(Boolean).join(' ') || lawyer.email
    : null

  return (
    <>
    <div
      className="flex-none border-b bg-card px-4 py-2.5"
      style={{ minHeight: '72px' }}
      aria-label="Matter control header"
    >
      <div className="flex items-start gap-3">
        {/* Back to matters list */}
        <Link
          href="/matters"
          className="mt-1 flex-none text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Back to matters"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        {/* Identity block */}
        <div className="flex-1 min-w-0">

          {/* Row 1: number + title + type pill */}
          <div className="flex items-center gap-2 flex-wrap">
            {matter.matter_number && (
              <span className="text-xs font-mono text-muted-foreground shrink-0">
                {matter.matter_number}
              </span>
            )}
            <h1 className="text-sm font-semibold text-foreground truncate max-w-md">
              {matter.title}
            </h1>
            {matterType && (
              <span
                className="text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0"
                style={matterType.color ? {
                  backgroundColor: `${matterType.color}1A`,
                  color: matterType.color,
                  borderColor: `${matterType.color}40`,
                } : undefined}
              >
                {matterType.name}
              </span>
            )}
          </div>

          {/* Row 2: status + priority + risk level + lawyer + flags */}
          <div className="flex items-center gap-2 flex-wrap mt-1">

            <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 border', statusCfg.className)}>
              {statusCfg.label}
            </Badge>

            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <div className={cn('h-1.5 w-1.5 rounded-full', priorityDot)} />
              <span className="capitalize">{matter.priority ?? 'Medium'}</span>
            </div>

            {riskLevelCfg && (
              <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 border capitalize', riskLevelCfg)}>
                {matter.risk_level} risk
              </Badge>
            )}

            {riskFlagCount > 0 && (
              <div className="flex items-center gap-1 text-[10px] text-amber-400">
                <AlertTriangle className="h-3 w-3 text-amber-500" />
                <span className="font-medium">
                  {riskFlagCount} open {riskFlagCount === 1 ? 'flag' : 'flags'}
                </span>
              </div>
            )}

            {lawyerName && (
              <span className="text-[10px] text-muted-foreground">
                {lawyerName}
              </span>
            )}

            {criticalSLA && (
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] px-1.5 py-0 border font-medium',
                  criticalSLA.status === 'breached'
                    ? 'bg-red-950/30 text-red-400 border-red-500/30'
                    : criticalSLARemaining !== null && criticalSLARemaining <= (criticalSLA ? Math.round(0.2 * (new Date(criticalSLA.due_at).getTime() - new Date(criticalSLA.started_at).getTime()) / (1000 * 60 * 60)) : 48)
                      ? 'bg-amber-950/30 text-amber-400 border-amber-500/30'
                      : 'bg-blue-950/30 text-blue-400 border-blue-500/30',
                )}
              >
                {criticalSLA.status === 'breached' ? 'SLA: BREACHED' : `SLA: ${criticalSLARemaining}h`}
              </Badge>
            )}

            {/* Readiness score pill */}
            {readinessLoading ? (
              <Skeleton className="h-4 w-16 rounded-full" />
            ) : readiness ? (
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] px-1.5 py-0 border font-medium cursor-pointer',
                  readiness.total >= 80
                    ? 'bg-emerald-950/30 text-emerald-400 border-emerald-500/30'
                    : readiness.total >= 40
                      ? 'bg-amber-950/30 text-amber-400 border-amber-500/30'
                      : 'bg-red-950/30 text-red-400 border-red-500/30',
                )}
                onClick={() => router.push(`${pathname}?tab=details#readiness`)}
                title={`Readiness: ${readiness.focus_area} needs attention`}
              >
                {readiness.total}% Ready
              </Badge>
            ) : null}

          </div>
        </div>

        {/* Quick-action buttons */}
        <div className="flex items-center gap-1 flex-none mt-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1.5"
            onClick={onFlagClick}
          >
            <Flag className="h-3.5 w-3.5" />
            Flag
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1.5"
            onClick={onNotesClick}
          >
            <StickyNote className="h-3.5 w-3.5" />
            Notes
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1.5"
          >
            <Share2 className="h-3.5 w-3.5" />
            Share
          </Button>
          {/* Retainer button  -  only shown when retainer is not yet signed */}
          {latestRetainer?.status !== 'signed' && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
              onClick={() => setRetainerModalOpen(true)}
            >
              <FileText className="h-3.5 w-3.5" />
              Retainer
            </Button>
          )}
        </div>

      </div>
    </div>

    {/* Retainer generation modal */}
    <RetainerGenerationModal
      open={retainerModalOpen}
      onOpenChange={setRetainerModalOpen}
      matter={matter}
      tenantId={tenantId}
    />
    </>
  )
}
