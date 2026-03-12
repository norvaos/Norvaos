'use client'

import { useMemo } from 'react'
import { useCommandCentre } from './command-centre-context'
import { useAutomationRules } from '@/lib/queries/automations'
import { Zap } from 'lucide-react'

// ─── Action labels ──────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  create_task: 'Create task',
  create_deadline: 'Create deadline',
  send_notification: 'Send notification',
  send_client_email: 'Email client',
  log_activity: 'Log activity',
}

// ─── Shared hook ────────────────────────────────────────────────────

function useStageAutomations(stageId: string, stageName: string) {
  const { tenantId } = useCommandCentre()
  const { data: allRules } = useAutomationRules(tenantId)

  return useMemo(() => {
    if (!allRules) return []
    return allRules.filter((rule) => {
      if (rule.trigger_type !== 'stage_change') return false
      if (!rule.is_active) return false

      const config = rule.trigger_config as Record<string, unknown> | null
      if (!config) return true

      if (config.to_stage_id && config.to_stage_id !== stageId) return false
      if (
        config.to_stage_name &&
        typeof config.to_stage_name === 'string' &&
        !stageName.toLowerCase().includes(config.to_stage_name.toLowerCase())
      ) {
        return false
      }

      return true
    })
  }, [allRules, stageId, stageName])
}

// ─── Inline hint for tooltips ───────────────────────────────────────

interface StageAutomationHintProps {
  stageId: string
  stageName: string
}

/**
 * Lightweight inline hint shown inside Tooltip content.
 * Shows automation count + action labels for a given stage.
 */
export function StageAutomationHint({ stageId, stageName }: StageAutomationHintProps) {
  const matchingRules = useStageAutomations(stageId, stageName)

  if (matchingRules.length === 0) return null

  return (
    <div className="mt-1.5 pt-1.5 border-t border-slate-600/20">
      <div className="flex items-center gap-1 text-amber-400 mb-0.5">
        <Zap className="h-2.5 w-2.5" />
        <span className="text-[10px] font-medium">
          {matchingRules.length} automation{matchingRules.length !== 1 ? 's' : ''}
        </span>
      </div>
      {matchingRules.slice(0, 3).map((rule) => (
        <p key={rule.id} className="text-[10px] text-slate-400 truncate">
          {ACTION_LABELS[rule.action_type] ?? rule.action_type}: {rule.name}
        </p>
      ))}
      {matchingRules.length > 3 && (
        <p className="text-[10px] text-slate-500">+{matchingRules.length - 3} more</p>
      )}
    </div>
  )
}
