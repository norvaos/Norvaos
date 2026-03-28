/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Lead Workflow  -  Presentation Utilities
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Pure functions for stage colours, channel icons, actor badges, task status
 * icons, and guard formatting. No hooks, no React  -  just data → display mapping.
 */

import {
  LEAD_STAGES,
  ACTIVE_STAGES,
  STAGE_LABELS,
  isClosedStage,
  isTerminalStage,
} from '@/lib/config/lead-workflow-definitions'
import type { LeadStage } from '@/lib/config/lead-workflow-definitions'
import type { UserRow, ActorType, CommunicationChannel, CommunicationDirection, TaskStatus, CompletionSource } from './lead-workflow-types'
import { formatFullName } from '@/lib/utils/formatters'

// ─── Stage Helpers ───────────────────────────────────────────────────────────

/** Colour classes for a stage in the pipeline bar */
export function getStageColour(stage: string, currentStage: string | null): {
  bg: string
  border: string
  text: string
  icon: string
  state: 'past' | 'current' | 'future' | 'terminal'
} {
  if (isTerminalStage(currentStage ?? '')) {
    return { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-400', icon: 'text-slate-300', state: 'terminal' }
  }

  const activeIndex = ACTIVE_STAGES.indexOf(stage as LeadStage)
  const currentIndex = ACTIVE_STAGES.indexOf(currentStage as LeadStage)

  if (activeIndex < 0 || currentIndex < 0) {
    return { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-400', icon: 'text-slate-300', state: 'future' }
  }

  if (activeIndex < currentIndex) {
    return { bg: 'bg-emerald-950/30', border: 'border-emerald-500/20', text: 'text-emerald-400', icon: 'text-green-600', state: 'past' }
  }
  if (activeIndex === currentIndex) {
    return { bg: 'bg-primary/5', border: 'border-primary/30', text: 'text-primary', icon: 'text-primary', state: 'current' }
  }
  return { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-500', icon: 'text-slate-400', state: 'future' }
}

/** Human-readable stage label */
export function getStageLabel(stage: string): string {
  return STAGE_LABELS[stage as LeadStage] ?? stage
}

/** Check if a stage is at or past a reference stage in the active pipeline */
export function isStageAtOrPast(currentStage: string | null | undefined, referenceStage: string): boolean {
  if (!currentStage) return false
  const currentIdx = ACTIVE_STAGES.indexOf(currentStage as LeadStage)
  const refIdx = ACTIVE_STAGES.indexOf(referenceStage as LeadStage)
  if (currentIdx < 0 || refIdx < 0) {
    // If current is terminal (closed/converted), it's past everything
    return isTerminalStage(currentStage)
  }
  return currentIdx >= refIdx
}

// ─── Closed / Converted Banner Helpers ───────────────────────────────────────

export function getTerminalBannerConfig(stage: string): {
  label: string
  bg: string
  border: string
  text: string
  icon: 'check' | 'x'
} | null {
  if (stage === LEAD_STAGES.CONVERTED) {
    return {
      label: 'Converted to Matter',
      bg: 'bg-emerald-950/30',
      border: 'border-emerald-500/20',
      text: 'text-emerald-400',
      icon: 'check',
    }
  }
  if (isClosedStage(stage)) {
    return {
      label: getStageLabel(stage),
      bg: 'bg-amber-950/30',
      border: 'border-amber-500/20',
      text: 'text-amber-400',
      icon: 'x',
    }
  }
  return null
}

// ─── Channel Helpers ─────────────────────────────────────────────────────────

/** Channel → icon name mapping (icon components resolved in React layer) */
export function getChannelIconName(channel: string): 'phone' | 'mail' | 'message-square' | 'message-circle' | 'bell' | 'activity' {
  switch (channel) {
    case 'call': return 'phone'
    case 'email': return 'mail'
    case 'sms': return 'message-square'
    case 'portal_chat': return 'message-circle'
    case 'system_reminder': return 'bell'
    default: return 'activity'
  }
}

/** Human-readable channel label */
export function getChannelLabel(channel: string): string {
  switch (channel) {
    case 'call': return 'Call'
    case 'email': return 'Email'
    case 'sms': return 'SMS'
    case 'portal_chat': return 'Portal Chat'
    case 'system_reminder': return 'System Reminder'
    default: return channel
  }
}

// ─── Direction Helpers ───────────────────────────────────────────────────────

/** Direction → icon name + colour */
export function getDirectionConfig(direction: string): {
  iconName: 'arrow-up-right' | 'arrow-down-left' | 'bot'
  colour: string
  label: string
} {
  switch (direction) {
    case 'outbound':
      return { iconName: 'arrow-up-right', colour: 'text-blue-500', label: 'Outbound' }
    case 'inbound':
      return { iconName: 'arrow-down-left', colour: 'text-green-500', label: 'Inbound' }
    case 'system':
      return { iconName: 'bot', colour: 'text-slate-400', label: 'System' }
    default:
      return { iconName: 'arrow-up-right', colour: 'text-slate-400', label: direction }
  }
}

// ─── Actor Helpers ───────────────────────────────────────────────────────────

/** Get actor display info */
export function getActorDisplay(
  actorType: string | null,
  actorUserId: string | null,
  users: UserRow[] | undefined
): {
  label: string
  badgeClass: string
  iconName: 'user' | 'bot' | 'plug' | 'sparkles'
} {
  switch (actorType) {
    case 'user': {
      const user = users?.find((u) => u.id === actorUserId)
      const name = user ? (formatFullName(user.first_name, user.last_name) || user.email) : 'User'
      return { label: name, badgeClass: 'bg-blue-950/30 text-blue-400 border-blue-500/20', iconName: 'user' }
    }
    case 'system':
      return { label: 'System', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200', iconName: 'bot' }
    case 'integration':
      return { label: 'Integration', badgeClass: 'bg-purple-950/30 text-purple-400 border-purple-500/20', iconName: 'plug' }
    case 'ai':
      return { label: 'AI', badgeClass: 'bg-amber-950/30 text-amber-400 border-amber-500/20', iconName: 'sparkles' }
    default:
      return { label: 'Unknown', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200', iconName: 'user' }
  }
}

// ─── Task Status Helpers ─────────────────────────────────────────────────────

/** Task status visual config */
export function getTaskStatusConfig(status: string, dueAt: string | null): {
  iconName: 'circle' | 'check-circle-2' | 'minus-circle' | 'x-circle'
  iconClass: string
  textClass: string
  bgClass: string
  isOverdue: boolean
} {
  const now = new Date()
  const isOverdue = status === 'pending' && dueAt && new Date(dueAt) < now

  if (isOverdue) {
    return {
      iconName: 'circle',
      iconClass: 'text-red-500',
      textClass: 'text-red-600',
      bgClass: 'bg-red-950/30/30 border-l-2 border-l-red-400',
      isOverdue: true,
    }
  }

  switch (status) {
    case 'completed':
      return { iconName: 'check-circle-2', iconClass: 'text-green-600', textClass: 'text-emerald-400', bgClass: 'bg-emerald-950/30', isOverdue: false }
    case 'skipped':
      return { iconName: 'minus-circle', iconClass: 'text-slate-400', textClass: 'text-slate-400 line-through', bgClass: 'bg-slate-50', isOverdue: false }
    case 'blocked':
      return { iconName: 'x-circle', iconClass: 'text-red-600', textClass: 'text-red-600', bgClass: 'bg-red-950/30', isOverdue: false }
    case 'pending':
    default:
      return { iconName: 'circle', iconClass: 'text-slate-400', textClass: 'text-slate-700', bgClass: '', isOverdue: false }
  }
}

/** Completion source badge label + style */
export function getCompletionSourceBadge(source: string | null): { label: string; className: string } | null {
  if (!source) return null
  switch (source) {
    case 'manual':
      return { label: 'Manual', className: 'bg-blue-950/30 text-blue-400 border-blue-500/20' }
    case 'auto_completed':
      return { label: 'Auto', className: 'bg-amber-950/30 text-amber-400 border-amber-500/20' }
    case 'system':
      return { label: 'System', className: 'bg-slate-100 text-slate-600 border-slate-200' }
    default:
      return { label: source, className: 'bg-slate-100 text-slate-600 border-slate-200' }
  }
}

// ─── Gate Status Helpers ─────────────────────────────────────────────────────

export function getGateStatusConfig(passed: boolean, enabled: boolean): {
  iconName: 'check-circle-2' | 'x-circle' | 'minus-circle'
  iconClass: string
  label: string
} {
  if (!enabled) {
    return { iconName: 'minus-circle', iconClass: 'text-slate-300', label: 'Not Required' }
  }
  if (passed) {
    return { iconName: 'check-circle-2', iconClass: 'text-green-600', label: 'Passed' }
  }
  return { iconName: 'x-circle', iconClass: 'text-red-500', label: 'Blocked' }
}

// ─── Overdue Days Helper ─────────────────────────────────────────────────────

export function getOverdueDays(dueAt: string | null): number | null {
  if (!dueAt) return null
  const due = new Date(dueAt)
  const now = new Date()
  if (due >= now) return null
  return Math.ceil((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
}

// ─── Subtype Display ─────────────────────────────────────────────────────────

/** Human-readable subtype label for system communication events */
export function getSubtypeLabel(subtype: string | null): string | null {
  if (!subtype) return null
  const labels: Record<string, string> = {
    ai_analysis_complete: 'AI Analysis Complete',
    consultation_invite: 'Consultation Invite',
    consultation_reminder: 'Consultation Reminder',
    consultation_summary: 'Consultation Summary',
    closure_notice: 'Closure Notice',
    payment_request: 'Payment Request',
    welcome_package: 'Welcome Package',
  }
  return labels[subtype] ?? subtype.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
