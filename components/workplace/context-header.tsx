'use client'

/**
 * ContextHeader (Zone 1) — Compact, information-dense header bar.
 *
 * Shows: matter title/number, type, current stage, readiness %, blocker count,
 * responsible lawyer, next suggested action, next deadline, portal status.
 */

import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Hash,
  Shield,
  User,
  Calendar,
  AlertTriangle,
  ExternalLink,
  Pencil,
  MoreHorizontal,
  Archive,
  Trash2,
  Link2,
  RefreshCw,
  Mail,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { StagePipelineBar } from '@/components/matters/stage-pipeline-bar'
import { StageProgressionBar } from '@/components/immigration/stage-progression-bar'
import type { ImmigrationReadinessData } from '@/lib/queries/immigration-readiness'
import type { Database } from '@/lib/types/database'

type Matter = Database['public']['Tables']['matters']['Row']
type UserRow = Database['public']['Tables']['users']['Row']

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ContextHeaderProps {
  matter: Matter
  primaryClientName?: string | null
  matterTypeName?: string | null
  practiceAreaName?: string | null
  readinessData?: ImmigrationReadinessData | null
  blockerCount?: number
  responsibleLawyer?: UserRow | null
  nextDeadline?: string | null
  nextAction?: string | null
  portalActive?: boolean

  // Pipeline data
  hasImmigration?: boolean
  hasGenericPipeline?: boolean
  pipelineStages?: Database['public']['Tables']['matter_stages']['Row'][]
  currentStageId?: string | null
  stageEnteredAt?: string | null
  stageHistory?: Array<{ stage_id: string; stage_name: string; entered_at: string; exited_at?: string; user_id?: string }>
  immigrationStages?: Database['public']['Tables']['case_stage_definitions']['Row'][]
  immigrationData?: { current_stage_id: string | null; stage_entered_at: string | null; stage_history: unknown }
  onStageClick?: (stageId: string) => void
  stageAdvancing?: boolean
  gatingErrors?: Record<string, string[]>
  users?: UserRow[]

  // Actions
  onEdit?: () => void
  onArchive?: () => void
  onDelete?: () => void
  onPortalOpen?: () => void
  onDocRequestOpen?: () => void
  onRegenerateSlots?: () => void
  regeneratingSlots?: boolean
  enforcementEnabled?: boolean
  completionPercent?: number | null
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ContextHeader({
  matter,
  primaryClientName,
  matterTypeName,
  practiceAreaName,
  readinessData,
  blockerCount = 0,
  responsibleLawyer,
  nextDeadline,
  nextAction,
  portalActive = false,

  hasImmigration = false,
  hasGenericPipeline = false,
  pipelineStages,
  currentStageId,
  stageEnteredAt,
  stageHistory = [],
  immigrationStages,
  immigrationData,
  onStageClick,
  stageAdvancing = false,
  gatingErrors,
  users,

  onEdit,
  onArchive,
  onDelete,
  onPortalOpen,
  onDocRequestOpen,
  onRegenerateSlots,
  regeneratingSlots = false,
  enforcementEnabled = false,
  completionPercent,
}: ContextHeaderProps) {
  const router = useRouter()

  const readinessPct = readinessData?.readinessMatrix?.overallPct ?? 0
  const readinessColour = readinessPct >= 85
    ? 'text-emerald-700 bg-emerald-100'
    : readinessPct >= 60
      ? 'text-amber-700 bg-amber-100'
      : 'text-red-700 bg-red-100'

  const lawyerName = responsibleLawyer
    ? [responsibleLawyer.first_name, responsibleLawyer.last_name].filter(Boolean).join(' ')
    : null

  return (
    <div className="border-b bg-card">
      {/* Row 1: Title + meta + actions */}
      <div className="flex items-center gap-2 px-4 py-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={() => router.push('/matters')}
        >
          <ArrowLeft className="size-4" />
        </Button>

        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
          <h1 className="text-base font-semibold truncate">{matter.title}</h1>
          {primaryClientName && (
            <span className="text-sm text-muted-foreground shrink-0">
              — {primaryClientName}
            </span>
          )}
          {matter.matter_number && (
            <Badge variant="secondary" className="gap-0.5 text-[10px] shrink-0">
              <Hash className="size-2.5" />
              {matter.matter_number}
            </Badge>
          )}
          {matterTypeName && (
            <Badge variant="outline" className="text-[10px] shrink-0">{matterTypeName}</Badge>
          )}
          {practiceAreaName && (
            <Badge variant="outline" className="text-[10px] shrink-0">{practiceAreaName}</Badge>
          )}
        </div>

        {/* Right-side quick info pills */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Readiness */}
          {readinessData && (
            <Badge className={cn('text-[10px] tabular-nums', readinessColour)}>
              {readinessPct}%
            </Badge>
          )}

          {/* Blockers */}
          {blockerCount > 0 && (
            <Badge variant="destructive" className="text-[10px]">
              <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
              {blockerCount}
            </Badge>
          )}

          {/* Lawyer */}
          {lawyerName && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <User className="h-3 w-3" />
              {lawyerName}
            </span>
          )}

          {/* Next deadline */}
          {nextDeadline && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(nextDeadline).toLocaleDateString('en-CA')}
            </span>
          )}

          {/* Portal indicator */}
          {portalActive && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="h-2 w-2 rounded-full bg-green-500" />
              </TooltipTrigger>
              <TooltipContent>Client portal active</TooltipContent>
            </Tooltip>
          )}

          {/* Edit */}
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onEdit}>
            <Pencil className="h-3 w-3 mr-1" />
            Edit
          </Button>

          {/* More actions */}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="size-7">
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[100]">
              {enforcementEnabled && (
                <>
                  <DropdownMenuItem
                    onClick={onRegenerateSlots}
                    disabled={regeneratingSlots}
                  >
                    {regeneratingSlots ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 size-4" />
                    )}
                    {regeneratingSlots ? 'Refreshing...' : 'Regenerate Slots'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onDocRequestOpen}>
                    <Mail className="mr-2 size-4" />
                    Request Documents
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={onPortalOpen}>
                <Link2 className="mr-2 size-4" />
                Client Portal Link
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onArchive}>
                <Archive className="mr-2 size-4" />
                Archive Matter
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="mr-2 size-4" />
                Delete Matter
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Row 2: Pipeline bar (if applicable) */}
      {hasGenericPipeline && pipelineStages && pipelineStages.length > 0 && (
        <div className="px-4 pb-2">
          <StagePipelineBar
            stages={pipelineStages}
            currentStageId={currentStageId ?? null}
            stageEnteredAt={stageEnteredAt ?? null}
            stageHistory={stageHistory as Array<{ stage_id: string; stage_name: string; entered_at: string; exited_at?: string; user_id?: string }>}
            onStageClick={(stageId) => onStageClick?.(stageId)}
            disabled={stageAdvancing}
            gatingErrors={gatingErrors}
            completionPercent={completionPercent ?? null}
            users={users}
          />
        </div>
      )}

      {hasImmigration && immigrationStages && immigrationStages.length > 0 && immigrationData && (
        <div className="px-4 pb-2">
          <StageProgressionBar
            stages={immigrationStages}
            currentStageId={immigrationData.current_stage_id}
            stageEnteredAt={immigrationData.stage_entered_at}
            stageHistory={(Array.isArray(immigrationData.stage_history) ? immigrationData.stage_history : []) as Array<{ stage_id: string; stage_name: string; entered_at: string; exited_at?: string; entered_by?: string }>}
            onStageClick={(stageId) => onStageClick?.(stageId)}
            disabled={stageAdvancing}
            users={users}
          />
        </div>
      )}

      {/* Row 3: Next action (compact bar) */}
      {nextAction && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Next:</span>
            <span className="truncate">{nextAction}</span>
          </div>
        </div>
      )}
    </div>
  )
}
