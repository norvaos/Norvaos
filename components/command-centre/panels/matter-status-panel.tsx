'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useCommandCentre } from '../command-centre-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Activity, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react'

// ─── Hooks ──────────────────────────────────────────────────────────

function useMatterStageInfo(matterId: string, tenantId: string) {
  return useQuery({
    queryKey: ['matter-stage-info', matterId],
    queryFn: async () => {
      const supabase = createClient()

      // Get matter with its pipeline stages
      const { data: matter } = await supabase
        .from('matters')
        .select('id, title, status, matter_type, stage_id, stage_entered_at, date_opened, date_closed, responsible_lawyer_id')
        .eq('id', matterId)
        .eq('tenant_id', tenantId)
        .single()

      if (!matter) return null

      // Get pipeline stages if matter has a stage
      let stages: { id: string; name: string; color: string | null; sort_order: number }[] = []
      if (matter.stage_id) {
        // Find which pipeline this stage belongs to
        const { data: currentStage } = await supabase
          .from('pipeline_stages')
          .select('pipeline_id')
          .eq('id', matter.stage_id)
          .single()

        if (currentStage?.pipeline_id) {
          const { data: pipelineStages } = await supabase
            .from('pipeline_stages')
            .select('id, name, color, sort_order')
            .eq('pipeline_id', currentStage.pipeline_id)
            .order('sort_order')

          stages = pipelineStages ?? []
        }
      }

      // Get recent workflow actions for SLA
      const { data: recentActions } = await supabase
        .from('workflow_actions')
        .select('id, action_type, created_at')
        .eq('entity_id', matterId)
        .eq('entity_type', 'matter')
        .order('created_at', { ascending: false })
        .limit(5)

      return { matter, stages, recentActions: recentActions ?? [] }
    },
    enabled: !!matterId && !!tenantId,
    refetchInterval: 30_000,
  })
}

// ─── Status helpers ─────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: 'bg-green-50 text-green-700 border-green-200' },
  pending: { label: 'Pending', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  on_hold: { label: 'On Hold', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  closed_won: { label: 'Closed (Won)', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  closed_lost: { label: 'Closed (Lost)', color: 'bg-red-50 text-red-700 border-red-200' },
}

// ─── Component ──────────────────────────────────────────────────────

/**
 * Matter Status Panel — shows pipeline progress and SLA countdown.
 *
 * Rule #19: No N+1 — consolidated queries.
 */
export function MatterStatusPanel() {
  const { entityId, tenantId, entityType } = useCommandCentre()
  const { data, isLoading } = useMatterStageInfo(entityId, tenantId)

  if (entityType !== 'matter') return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-slate-700">
          <Activity className="h-4 w-4" />
          Matter Status
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : !data?.matter ? (
          <p className="text-sm text-slate-500">Matter not found.</p>
        ) : (
          <div className="space-y-4">
            {/* Status badge + time info */}
            <div className="flex items-center justify-between">
              <Badge
                variant="outline"
                className={STATUS_CONFIG[data.matter.status]?.color ?? 'bg-slate-50 text-slate-500'}
              >
                {STATUS_CONFIG[data.matter.status]?.label ?? data.matter.status}
              </Badge>

              <div className="flex items-center gap-3 text-xs text-slate-500">
                {data.matter.date_opened && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Opened {new Date(data.matter.date_opened).toLocaleDateString()}
                  </span>
                )}
                {data.matter.stage_entered_at && (
                  <span className="flex items-center gap-1">
                    {Math.floor((Date.now() - new Date(data.matter.stage_entered_at).getTime()) / 86400000)}d in stage
                  </span>
                )}
              </div>
            </div>

            {/* Pipeline progress bar */}
            {data.stages.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  {data.stages.map((stage) => {
                    const isCurrent = stage.id === data.matter.stage_id
                    const currentIdx = data.stages.findIndex((s) => s.id === data.matter.stage_id)
                    const stageIdx = data.stages.findIndex((s) => s.id === stage.id)
                    const isPast = stageIdx < currentIdx

                    return (
                      <div
                        key={stage.id}
                        className="flex-1 h-2 rounded-full transition-colors"
                        style={{
                          backgroundColor: isPast || isCurrent
                            ? (stage.color ?? '#6b7280')
                            : '#e2e8f0',
                        }}
                        title={stage.name}
                      />
                    )
                  })}
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>{data.stages[0]?.name}</span>
                  <span className="font-medium text-slate-600">
                    {data.stages.find((s) => s.id === data.matter.stage_id)?.name ?? 'Unknown'}
                  </span>
                  <span>{data.stages[data.stages.length - 1]?.name}</span>
                </div>
              </div>
            )}

            {/* Recent workflow actions */}
            {data.recentActions.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Recent Actions</p>
                {data.recentActions.map((action) => (
                  <div key={action.id} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 capitalize">
                      {action.action_type.replace(/_/g, ' ')}
                    </span>
                    <span className="text-slate-400">
                      {new Date(action.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* SLA warning if in stage too long */}
            {data.matter.stage_entered_at && (() => {
              const daysInStage = Math.floor(
                (Date.now() - new Date(data.matter.stage_entered_at!).getTime()) / 86400000
              )
              if (daysInStage > 14) {
                return (
                  <div className="flex items-center gap-2 p-2 bg-amber-50 rounded-md border border-amber-200">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span className="text-xs text-amber-700">
                      This matter has been in the current stage for {daysInStage} days.
                    </span>
                  </div>
                )
              }
              if (data.matter.status === 'active' && daysInStage <= 3) {
                return (
                  <div className="flex items-center gap-2 p-2 bg-green-50 rounded-md border border-green-200">
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    <span className="text-xs text-green-700">
                      Matter is progressing on schedule.
                    </span>
                  </div>
                )
              }
              return null
            })()}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
