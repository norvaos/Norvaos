/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Workspace Config Service
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Fetches and resolves workspace-level workflow configuration.
 * Falls back to DEFAULT_WORKSPACE_CONFIG when no config exists.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { DEFAULT_WORKSPACE_CONFIG } from '@/lib/config/lead-workflow-definitions'

type WorkspaceConfig = Database['public']['Tables']['workspace_workflow_config']['Row']

export interface ResolvedWorkflowConfig {
  contactAttemptCadenceDays: number[]
  retainerFollowupCadenceDays: number[]
  paymentFollowupCadenceDays: number[]
  noShowCadenceDays: number[]
  enabledChannels: string[]
  finalClosureMessagesMode: 'auto' | 'manual' | 'disabled'
  consultationReminderHours: number[]
  autoClosureAfterDays: number
  activeConversionGates: {
    conflict_cleared: boolean
    retainer_signed: boolean
    payment_received: boolean
    intake_complete: boolean
    id_verification: boolean
    required_documents: boolean
  }
  mandatoryTasksByStage: Record<string, string[]>
  stageReopenPermissions: Record<string, string[]>
  lawyerApprovalRequirements: Record<string, boolean>
  consultationFeeRules: {
    default_fee_required: boolean
    default_fee_amount: number
    fee_by_practice_area: Record<string, { required: boolean; amount: number }>
  }
  /** Workspace-wide automation message preferences */
  automationMessageSettings: {
    defaultSenderName?: string
    includeSignature?: boolean
    brandingMode?: 'full' | 'minimal' | 'none'
    replyToEmail?: string
  }
  /** The raw DB row, if it exists */
  raw: WorkspaceConfig | null
}

/**
 * Fetch workspace workflow config, resolving defaults for missing values.
 */
export async function getWorkspaceWorkflowConfig(
  supabase: SupabaseClient<Database>,
  tenantId: string
): Promise<ResolvedWorkflowConfig> {
  const { data: config } = await supabase
    .from('workspace_workflow_config')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  return resolveConfig(config)
}

/**
 * Resolve a raw config row into a typed config with defaults.
 */
function resolveConfig(config: WorkspaceConfig | null): ResolvedWorkflowConfig {
  return {
    contactAttemptCadenceDays: safeJsonArray(
      config?.contact_attempt_cadence_days,
      DEFAULT_WORKSPACE_CONFIG.contact_attempt_cadence_days as unknown as number[]
    ),
    retainerFollowupCadenceDays: safeJsonArray(
      config?.retainer_followup_cadence_days,
      DEFAULT_WORKSPACE_CONFIG.retainer_followup_cadence_days as unknown as number[]
    ),
    paymentFollowupCadenceDays: safeJsonArray(
      config?.payment_followup_cadence_days,
      DEFAULT_WORKSPACE_CONFIG.payment_followup_cadence_days as unknown as number[]
    ),
    noShowCadenceDays: safeJsonArray(
      config?.no_show_cadence_days,
      DEFAULT_WORKSPACE_CONFIG.no_show_cadence_days as unknown as number[]
    ),
    enabledChannels: safeJsonArray(
      config?.enabled_channels,
      DEFAULT_WORKSPACE_CONFIG.enabled_channels as unknown as string[]
    ),
    finalClosureMessagesMode: (config?.final_closure_messages_mode ?? DEFAULT_WORKSPACE_CONFIG.final_closure_messages_mode) as 'auto' | 'manual' | 'disabled',
    consultationReminderHours: safeJsonArray(
      config?.consultation_reminder_hours,
      DEFAULT_WORKSPACE_CONFIG.consultation_reminder_hours as unknown as number[]
    ),
    autoClosureAfterDays: config?.auto_closure_after_days ?? DEFAULT_WORKSPACE_CONFIG.auto_closure_after_days,
    activeConversionGates: safeJsonObject(
      config?.active_matter_conversion_gates,
      DEFAULT_WORKSPACE_CONFIG.active_matter_conversion_gates
    ) as ResolvedWorkflowConfig['activeConversionGates'],
    mandatoryTasksByStage: safeJsonObject(config?.mandatory_tasks_by_stage, {}),
    stageReopenPermissions: safeJsonObject(config?.stage_reopen_permissions, {}),
    lawyerApprovalRequirements: safeJsonObject(config?.lawyer_approval_requirements, {}),
    consultationFeeRules: safeJsonObject(
      config?.consultation_fee_rules,
      { default_fee_required: false, default_fee_amount: 0, fee_by_practice_area: {} }
    ) as ResolvedWorkflowConfig['consultationFeeRules'],
    automationMessageSettings: safeJsonObject(
      config?.automation_message_settings,
      {}
    ) as ResolvedWorkflowConfig['automationMessageSettings'],
    raw: config,
  }
}

function safeJsonArray<T>(value: unknown, fallback: T[]): T[] {
  if (Array.isArray(value)) return value as T[]
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return fallback }
  }
  return fallback
}

function safeJsonObject<T extends Record<string, unknown>>(value: unknown, fallback: T): T {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as T
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return fallback }
  }
  return fallback
}
