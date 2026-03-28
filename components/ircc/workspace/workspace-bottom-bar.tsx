'use client'

/**
 * WorkspaceBottomBar  -  Persistent bottom status strip.
 *
 * Shows:
 *   - Stream type
 *   - Internal file status
 *   - IRCC processing time reference field (with last-updated attribution)
 *   - Matter number / file reference
 *
 * Processing time data is manually maintained (no live API).
 * Shows last-updated date and "Manual" source indicator as required by PRD.
 */

import { Clock, Info, FileText, Activity } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { Database } from '@/lib/types/database'
import type { ImmigrationReadinessData } from '@/lib/queries/immigration-readiness'

type Matter = Database['public']['Tables']['matters']['Row']

// ── Processing time lookup (static reference  -  manually maintained) ────────────
// In a future phase this will be API-fed from IRCC processing times RSS/API.

const PROCESSING_TIMES: Record<string, { weeks: string; updated: string }> = {
  study: { weeks: '8–12 weeks', updated: '2026-03-01' },
  student: { weeks: '8–12 weeks', updated: '2026-03-01' },
  visitor: { weeks: '3–5 weeks', updated: '2026-03-01' },
  trv: { weeks: '3–5 weeks', updated: '2026-03-01' },
  work: { weeks: '10–14 weeks', updated: '2026-03-01' },
  pgwp: { weeks: '3–5 weeks', updated: '2026-03-01' },
  lmia: { weeks: '12–16 weeks', updated: '2026-03-01' },
  'express entry': { weeks: '6 months', updated: '2026-03-01' },
  'permanent': { weeks: '6–12 months', updated: '2026-03-01' },
  spousal: { weeks: '12 months', updated: '2026-03-01' },
  citizenship: { weeks: '12 months', updated: '2026-03-01' },
}

function getProcessingTime(matterType: string | null): { weeks: string; updated: string } | null {
  if (!matterType) return null
  const lower = matterType.toLowerCase()
  for (const [key, value] of Object.entries(PROCESSING_TIMES)) {
    if (lower.includes(key)) return value
  }
  return null
}

// ── Status colour ─────────────────────────────────────────────────────────────

function statusColour(status: string): string {
  switch (status) {
    case 'active':       return 'text-emerald-400 bg-emerald-950/30 border-green-300'
    case 'pending':      return 'text-amber-400 bg-amber-950/30 border-amber-300'
    case 'closed_won':   return 'text-blue-400 bg-blue-950/30 border-blue-300'
    case 'closed_lost':  return 'text-zinc-600 bg-zinc-50 border-zinc-300'
    case 'archived':     return 'text-zinc-500 bg-zinc-50 border-zinc-200'
    default:             return 'text-muted-foreground'
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface WorkspaceBottomBarProps {
  matter: Matter
  readinessData: ImmigrationReadinessData | null
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WorkspaceBottomBar({ matter, readinessData }: WorkspaceBottomBarProps) {
  const processingTime = getProcessingTime(matter.matter_type)
  const intakeStatus = readinessData?.intakeStatus ?? matter.intake_status

  return (
    <TooltipProvider>
      <div className="flex items-center gap-0 border-t bg-card shrink-0 h-8 overflow-hidden">

        {/* Stream */}
        <div className="flex items-center gap-1.5 px-3 border-r h-full">
          <FileText className="h-3 w-3 text-muted-foreground" />
          <span className="text-[11px] font-medium truncate max-w-[160px]">
            {matter.matter_type ?? 'Unassigned Stream'}
          </span>
        </div>

        {/* Internal file status */}
        <div className="flex items-center gap-1.5 px-3 border-r h-full">
          <Activity className="h-3 w-3 text-muted-foreground" />
          <Badge
            variant="outline"
            className={cn('text-[10px] py-0 px-1.5 border leading-4', statusColour(matter.status ?? ''))}
          >
            {matter.status ?? 'Unknown'}
          </Badge>
        </div>

        {/* Intake status */}
        {intakeStatus && (
          <div className="flex items-center gap-1.5 px-3 border-r h-full">
            <span className="text-[10px] text-muted-foreground">Intake:</span>
            <span className={cn(
              'text-[10px] font-medium',
              intakeStatus === 'complete' ? 'text-emerald-400' :
              intakeStatus === 'incomplete' ? 'text-amber-600' :
              'text-muted-foreground'
            )}>
              {String(intakeStatus).replace('_', ' ')}
            </span>
          </div>
        )}

        {/* IRCC Processing time reference */}
        {processingTime ? (
          <div className="flex items-center gap-1.5 px-3 border-r h-full">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-[11px]">
              <span className="text-muted-foreground">IRCC processing: </span>
              <span className="font-medium">{processingTime.weeks}</span>
            </span>
            <Tooltip delayDuration={400}>
              <TooltipTrigger asChild>
                <button className="text-muted-foreground/60 hover:text-muted-foreground">
                  <Info className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Last updated: {processingTime.updated}</p>
                <p className="text-xs text-muted-foreground">Source: Manual  -  verify at IRCC.ca</p>
              </TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-3 border-r h-full">
            <Clock className="h-3 w-3 text-muted-foreground/40" />
            <span className="text-[11px] text-muted-foreground/50">Processing time: assign stream type</span>
          </div>
        )}

        {/* Matter number */}
        {matter.matter_number && (
          <div className="flex items-center gap-1.5 px-3 border-r h-full">
            <span className="text-[10px] text-muted-foreground">File:</span>
            <span className="text-[11px] font-mono font-medium">{matter.matter_number}</span>
          </div>
        )}

        {/* Last updated */}
        <div className="flex items-center gap-1 px-3 h-full ml-auto">
          <span className="text-[10px] text-muted-foreground/60">
            Updated {new Date(matter.updated_at ?? '').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
          </span>
        </div>
      </div>
    </TooltipProvider>
  )
}
