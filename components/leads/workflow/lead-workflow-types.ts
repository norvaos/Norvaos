/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Lead Workflow — Shared TypeScript Interfaces
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Re-exports database row types and defines shaped interfaces used across
 * the 3-panel lead detail UI. All workflow components import from here.
 */

import type { Database } from '@/lib/types/database'

// ─── Database Row Re-exports ─────────────────────────────────────────────────

export type Lead = Database['public']['Tables']['leads']['Row']
export type Contact = Database['public']['Tables']['contacts']['Row']
export type UserRow = Database['public']['Tables']['users']['Row']
export type PracticeArea = Database['public']['Tables']['practice_areas']['Row']
export type Activity = Database['public']['Tables']['activities']['Row']

// Lead workflow tables
export type LeadStageHistoryRow = Database['public']['Tables']['lead_stage_history']['Row']
export type LeadMilestoneGroupRow = Database['public']['Tables']['lead_milestone_groups']['Row']
export type LeadMilestoneTaskRow = Database['public']['Tables']['lead_milestone_tasks']['Row']
export type LeadCommunicationEventRow = Database['public']['Tables']['lead_communication_events']['Row']
export type LeadConsultationRow = Database['public']['Tables']['lead_consultations']['Row']
export type LeadRetainerPackageRow = Database['public']['Tables']['lead_retainer_packages']['Row']
export type LeadQualificationDecisionRow = Database['public']['Tables']['lead_qualification_decisions']['Row']
export type LeadClosureRecordRow = Database['public']['Tables']['lead_closure_records']['Row']
export type LeadAiInsightRow = Database['public']['Tables']['lead_ai_insights']['Row']

// ─── Shaped Interfaces ───────────────────────────────────────────────────────

/** Milestone group with nested tasks (returned by useLeadMilestones) */
export interface MilestoneGroupWithTasks extends LeadMilestoneGroupRow {
  tasks: LeadMilestoneTaskRow[]
}

/** Available stage transition with guard evaluation status */
export interface TransitionWithStatus {
  toStage: string
  label: string
  guards: Array<{ type: string; description: string }>
  autoTransition: boolean
  allowed: boolean
  blockedReasons: string[]
}

/** Stage transition response from GET /api/leads/[id]/stage */
export interface StageTransitionsResponse {
  success: boolean
  currentStage: string | null
  transitions: TransitionWithStatus[]
}

/** Individual conversion gate result */
export interface GateResult {
  gate: string
  label: string
  passed: boolean
  reason?: string
  enabled: boolean
}

/** Full conversion gate evaluation response */
export interface ConversionGateResponse {
  success: boolean
  canConvert: boolean
  blockedReasons: string[]
  gateResults: GateResult[]
}

/** Communication event channel type */
export type CommunicationChannel = 'call' | 'email' | 'sms' | 'portal_chat' | 'system_reminder'

/** Communication direction */
export type CommunicationDirection = 'inbound' | 'outbound' | 'system'

/** Actor type for audit trail */
export type ActorType = 'user' | 'system' | 'integration' | 'ai'

/** Task status */
export type TaskStatus = 'pending' | 'completed' | 'skipped' | 'blocked'

/** Task completion source */
export type CompletionSource = 'manual' | 'auto_completed' | 'system'
