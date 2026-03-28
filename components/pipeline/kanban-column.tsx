'use client'

import { memo, useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils/formatters'
import { KanbanCard } from './kanban-card'
import type { ContactInfo, UserInfo, KanbanCardDisplayOptions } from './kanban-card'
import type { Database } from '@/lib/types/database'

type Lead = Database['public']['Tables']['leads']['Row']
type PipelineStage = Database['public']['Tables']['pipeline_stages']['Row']

export interface PracticeAreaInfo {
  id: string
  name: string
  color: string
}

interface KanbanColumnProps extends KanbanCardDisplayOptions {
  stage: PipelineStage
  leads: Lead[]
  contactsMap: Record<string, ContactInfo>
  usersMap: Record<string, UserInfo>
  practiceAreasMap?: Record<string, PracticeAreaInfo>
  activeMatterCountMap?: Record<string, number>
  onAddLead?: (stageId: string) => void
  onCardClick?: (leadId: string) => void
  onViewMatter?: (matterId: string) => void
}

export const KanbanColumn = memo(function KanbanColumn({
  stage,
  leads,
  contactsMap,
  usersMap,
  practiceAreasMap,
  activeMatterCountMap,
  onAddLead,
  onCardClick,
  onViewMatter,
  showValues = true,
  showFollowUp = true,
  showSource = true,
  showAssignee = true,
  showDaysInStage = true,
  showPracticeArea = false,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
    data: {
      type: 'stage',
      stage,
    },
  })

  const leadIds = useMemo(() => leads.map((l) => l.id), [leads])

  const totalValue = useMemo(
    () =>
      leads.reduce((sum, lead) => sum + (lead.estimated_value ?? 0), 0),
    [leads]
  )

  const stageColour = stage.color ?? '#6b7280'

  return (
    <div
      className={cn(
        'flex h-full w-72 flex-shrink-0 flex-col rounded-lg bg-slate-50',
        isOver && 'ring-2 ring-primary/30'
      )}
    >
      {/* Column header with colour stripe */}
      <div
        className="rounded-t-lg border-t-[3px] px-3 pb-2 pt-3"
        style={{ borderTopColor: stageColour }}
      >
        <div className="flex items-center justify-between">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 cursor-default">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {stage.name}
                  </h3>
                  <Badge variant="secondary" className="text-[10px]">
                    {leads.length}
                  </Badge>
                </div>
              </TooltipTrigger>
              {stage.description && (
                <TooltipContent side="bottom">
                  <p className="font-semibold text-[11px] text-emerald-400">{stage.name}</p>
                  <p className="text-[11px] text-white mt-0.5">{stage.description}</p>
                  {stage.win_probability != null && (
                    <p className="text-[10px] text-zinc-400 mt-1.5 border-t border-zinc-700/50 pt-1.5">Win probability: {stage.win_probability}%{stage.rotting_days ? ` · Stale after ${stage.rotting_days}d` : ''}</p>
                  )}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
        {showValues && totalValue > 0 && (
          <p className="mt-0.5 text-xs text-slate-500">
            {formatCurrency(totalValue)}
          </p>
        )}
      </div>

      {/* Scrollable card area */}
      <ScrollArea className="flex-1 px-2 pb-2">
        <div
          ref={setNodeRef}
          className="flex min-h-[120px] flex-col gap-2 py-1"
        >
          <SortableContext items={leadIds} strategy={verticalListSortingStrategy}>
            {leads.map((lead) => (
              <KanbanCard
                key={lead.id}
                lead={lead}
                stageName={stage.name}
                stageRottingDays={stage.rotting_days}
                stageSortOrder={stage.sort_order}
                contact={lead.contact_id ? contactsMap[lead.contact_id] : undefined}
                assignedUser={lead.assigned_to ? usersMap[lead.assigned_to] : undefined}
                practiceAreaName={lead.practice_area_id && practiceAreasMap ? practiceAreasMap[lead.practice_area_id]?.name : null}
                practiceAreaColor={lead.practice_area_id && practiceAreasMap ? practiceAreasMap[lead.practice_area_id]?.color : null}
                activeMatterCount={lead.contact_id && activeMatterCountMap ? activeMatterCountMap[lead.contact_id] : undefined}
                onClick={onCardClick}
                onViewMatter={onViewMatter}
                showValues={showValues}
                showFollowUp={showFollowUp}
                showSource={showSource}
                showAssignee={showAssignee}
                showDaysInStage={showDaysInStage}
                showPracticeArea={showPracticeArea}
              />
            ))}
          </SortableContext>

          {leads.length === 0 && (
            <div className="flex flex-1 items-center justify-center py-8 text-xs text-slate-400">
              No leads in this stage
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Add lead button at bottom */}
      <div className="border-t border-slate-200 p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-slate-500"
          onClick={() => onAddLead?.(stage.id)}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add lead
        </Button>
      </div>
    </div>
  )
})

export function KanbanColumnSkeleton() {
  return (
    <div className="flex h-full w-72 flex-shrink-0 flex-col rounded-lg bg-slate-50">
      <div className="rounded-t-lg border-t-[3px] border-t-slate-200 px-3 pb-2 pt-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-6 rounded-full" />
        </div>
        <Skeleton className="mt-1 h-3 w-16" />
      </div>
      <div className="flex-1 space-y-2 px-2 py-2">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    </div>
  )
}
