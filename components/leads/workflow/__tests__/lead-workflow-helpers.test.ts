/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Wave 6 — Pure Function Tests: Lead Workflow Helpers
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Tests all presentation helper functions. These are pure functions with no
 * React/hooks dependencies — the fastest and most reliable tests in the suite.
 *
 * Covers: stage colours, labels, pipeline ordering, terminal banners, channel
 * helpers, direction config, actor display, task status, completion badges,
 * gate status, overdue calculation, subtype labels.
 */

import { describe, it, expect } from 'vitest'
import {
  getStageColour,
  getStageLabel,
  isStageAtOrPast,
  getTerminalBannerConfig,
  getChannelIconName,
  getChannelLabel,
  getDirectionConfig,
  getActorDisplay,
  getTaskStatusConfig,
  getCompletionSourceBadge,
  getGateStatusConfig,
  getOverdueDays,
  getSubtypeLabel,
} from '../lead-workflow-helpers'
import { LEAD_STAGES, ACTIVE_STAGES, CLOSED_STAGES } from '@/lib/config/lead-workflow-definitions'
import type { UserRow } from '../lead-workflow-types'

// ─── Stage Colour ────────────────────────────────────────────────────────────

describe('getStageColour', () => {
  it('returns "past" state for stages before current', () => {
    const result = getStageColour(LEAD_STAGES.NEW_INQUIRY, LEAD_STAGES.CONSULTATION_BOOKED)
    expect(result.state).toBe('past')
    expect(result.bg).toContain('green')
  })

  it('returns "current" state for the current stage', () => {
    const result = getStageColour(LEAD_STAGES.CONSULTATION_BOOKED, LEAD_STAGES.CONSULTATION_BOOKED)
    expect(result.state).toBe('current')
    expect(result.text).toContain('primary')
  })

  it('returns "future" state for stages after current', () => {
    const result = getStageColour(LEAD_STAGES.RETAINER_SENT, LEAD_STAGES.CONSULTATION_BOOKED)
    expect(result.state).toBe('future')
    expect(result.bg).toContain('slate')
  })

  it('returns "terminal" state when currentStage is closed', () => {
    const result = getStageColour(LEAD_STAGES.NEW_INQUIRY, LEAD_STAGES.CLOSED_NO_RESPONSE)
    expect(result.state).toBe('terminal')
  })

  it('returns "terminal" state when currentStage is converted', () => {
    const result = getStageColour(LEAD_STAGES.NEW_INQUIRY, LEAD_STAGES.CONVERTED)
    expect(result.state).toBe('terminal')
  })

  it('handles null currentStage gracefully', () => {
    const result = getStageColour(LEAD_STAGES.NEW_INQUIRY, null)
    expect(result.state).toBe('future')
  })

  it('handles unknown stage gracefully', () => {
    const result = getStageColour('unknown_stage', LEAD_STAGES.NEW_INQUIRY)
    expect(result.state).toBe('future')
  })
})

// ─── Stage Label ─────────────────────────────────────────────────────────────

describe('getStageLabel', () => {
  it('returns human-readable label for all active stages', () => {
    for (const stage of ACTIVE_STAGES) {
      const label = getStageLabel(stage)
      expect(label).toBeTruthy()
      expect(label).not.toBe(stage) // Should be human-readable, not the key
    }
  })

  it('returns human-readable label for all closed stages', () => {
    for (const stage of CLOSED_STAGES) {
      const label = getStageLabel(stage)
      expect(label).toBeTruthy()
    }
  })

  it('returns the raw value for unknown stages', () => {
    expect(getStageLabel('some_unknown_stage')).toBe('some_unknown_stage')
  })
})

// ─── isStageAtOrPast ─────────────────────────────────────────────────────────

describe('isStageAtOrPast', () => {
  it('returns true when current equals reference', () => {
    expect(isStageAtOrPast(LEAD_STAGES.CONSULTATION_BOOKED, LEAD_STAGES.CONSULTATION_BOOKED)).toBe(true)
  })

  it('returns true when current is past reference', () => {
    expect(isStageAtOrPast(LEAD_STAGES.RETAINER_SENT, LEAD_STAGES.CONSULTATION_BOOKED)).toBe(true)
  })

  it('returns false when current is before reference', () => {
    expect(isStageAtOrPast(LEAD_STAGES.NEW_INQUIRY, LEAD_STAGES.CONSULTATION_BOOKED)).toBe(false)
  })

  it('returns true for terminal (closed) stages — they are past everything', () => {
    expect(isStageAtOrPast(LEAD_STAGES.CLOSED_NO_RESPONSE, LEAD_STAGES.NEW_INQUIRY)).toBe(true)
    expect(isStageAtOrPast(LEAD_STAGES.CLOSED_NO_RESPONSE, LEAD_STAGES.RETAINED_ACTIVE_MATTER)).toBe(true)
  })

  it('returns true for converted stage — it is past everything', () => {
    expect(isStageAtOrPast(LEAD_STAGES.CONVERTED, LEAD_STAGES.NEW_INQUIRY)).toBe(true)
  })

  it('returns false for null/undefined currentStage', () => {
    expect(isStageAtOrPast(null, LEAD_STAGES.NEW_INQUIRY)).toBe(false)
    expect(isStageAtOrPast(undefined, LEAD_STAGES.NEW_INQUIRY)).toBe(false)
  })

  it('validates the full pipeline ordering', () => {
    for (let i = 0; i < ACTIVE_STAGES.length; i++) {
      for (let j = 0; j < ACTIVE_STAGES.length; j++) {
        const current = ACTIVE_STAGES[i]
        const reference = ACTIVE_STAGES[j]
        expect(isStageAtOrPast(current, reference)).toBe(i >= j)
      }
    }
  })
})

// ─── Terminal Banner Config ──────────────────────────────────────────────────

describe('getTerminalBannerConfig', () => {
  it('returns green check config for CONVERTED', () => {
    const config = getTerminalBannerConfig(LEAD_STAGES.CONVERTED)
    expect(config).not.toBeNull()
    expect(config!.icon).toBe('check')
    expect(config!.bg).toContain('green')
  })

  it('returns amber X config for all closed stages', () => {
    for (const stage of CLOSED_STAGES) {
      const config = getTerminalBannerConfig(stage)
      expect(config, `Missing banner config for ${stage}`).not.toBeNull()
      expect(config!.icon).toBe('x')
      expect(config!.bg).toContain('amber')
    }
  })

  it('returns null for active stages', () => {
    for (const stage of ACTIVE_STAGES) {
      expect(getTerminalBannerConfig(stage)).toBeNull()
    }
  })
})

// ─── Channel Helpers ─────────────────────────────────────────────────────────

describe('getChannelIconName', () => {
  it('maps all known channels to correct icons', () => {
    expect(getChannelIconName('call')).toBe('phone')
    expect(getChannelIconName('email')).toBe('mail')
    expect(getChannelIconName('sms')).toBe('message-square')
    expect(getChannelIconName('portal_chat')).toBe('message-circle')
    expect(getChannelIconName('system_reminder')).toBe('bell')
  })

  it('returns "activity" for unknown channels', () => {
    expect(getChannelIconName('unknown')).toBe('activity')
    expect(getChannelIconName('')).toBe('activity')
  })
})

describe('getChannelLabel', () => {
  it('returns human-readable labels for all known channels', () => {
    expect(getChannelLabel('call')).toBe('Call')
    expect(getChannelLabel('email')).toBe('Email')
    expect(getChannelLabel('sms')).toBe('SMS')
    expect(getChannelLabel('portal_chat')).toBe('Portal Chat')
    expect(getChannelLabel('system_reminder')).toBe('System Reminder')
  })

  it('returns raw value for unknown channels', () => {
    expect(getChannelLabel('fax')).toBe('fax')
  })
})

// ─── Direction Config ────────────────────────────────────────────────────────

describe('getDirectionConfig', () => {
  it('configures outbound with blue colour and arrow-up-right', () => {
    const config = getDirectionConfig('outbound')
    expect(config.iconName).toBe('arrow-up-right')
    expect(config.colour).toContain('blue')
    expect(config.label).toBe('Outbound')
  })

  it('configures inbound with green colour and arrow-down-left', () => {
    const config = getDirectionConfig('inbound')
    expect(config.iconName).toBe('arrow-down-left')
    expect(config.colour).toContain('green')
    expect(config.label).toBe('Inbound')
  })

  it('configures system with bot icon', () => {
    const config = getDirectionConfig('system')
    expect(config.iconName).toBe('bot')
    expect(config.label).toBe('System')
  })

  it('handles unknown direction', () => {
    const config = getDirectionConfig('unknown')
    expect(config.label).toBe('unknown')
  })
})

// ─── Actor Display ───────────────────────────────────────────────────────────

describe('getActorDisplay', () => {
  const mockUsers: UserRow[] = [
    { id: 'user-1', email: 'alice@firm.com', first_name: 'Alice', last_name: 'Smith' } as UserRow,
    { id: 'user-2', email: 'bob@firm.com', first_name: null, last_name: null } as UserRow,
  ]

  it('resolves user actor with name from users list', () => {
    const result = getActorDisplay('user', 'user-1', mockUsers)
    expect(result.label).toBe('Alice Smith')
    expect(result.iconName).toBe('user')
    expect(result.badgeClass).toContain('blue')
  })

  it('falls back to email when user has no name', () => {
    const result = getActorDisplay('user', 'user-2', mockUsers)
    expect(result.label).toBe('bob@firm.com')
  })

  it('falls back to "User" when user not found', () => {
    const result = getActorDisplay('user', 'unknown-id', mockUsers)
    expect(result.label).toBe('User')
  })

  it('shows "System" for system actor with bot icon', () => {
    const result = getActorDisplay('system', null, mockUsers)
    expect(result.label).toBe('System')
    expect(result.iconName).toBe('bot')
    expect(result.badgeClass).toContain('slate')
  })

  it('shows "Integration" for integration actor with plug icon', () => {
    const result = getActorDisplay('integration', null, mockUsers)
    expect(result.label).toBe('Integration')
    expect(result.iconName).toBe('plug')
    expect(result.badgeClass).toContain('purple')
  })

  it('shows "AI" for ai actor with sparkles icon', () => {
    const result = getActorDisplay('ai', null, mockUsers)
    expect(result.label).toBe('AI')
    expect(result.iconName).toBe('sparkles')
    expect(result.badgeClass).toContain('amber')
  })

  it('shows "Unknown" for null/unknown actorType', () => {
    expect(getActorDisplay(null, null, mockUsers).label).toBe('Unknown')
    expect(getActorDisplay('garbage', null, mockUsers).label).toBe('Unknown')
  })

  it('handles undefined users list', () => {
    const result = getActorDisplay('user', 'user-1', undefined)
    expect(result.label).toBe('User')
  })
})

// ─── Task Status Config ──────────────────────────────────────────────────────

describe('getTaskStatusConfig', () => {
  it('returns green check for completed tasks', () => {
    const config = getTaskStatusConfig('completed', null)
    expect(config.iconName).toBe('check-circle-2')
    expect(config.iconClass).toContain('green')
    expect(config.isOverdue).toBe(false)
  })

  it('returns strikethrough for skipped tasks', () => {
    const config = getTaskStatusConfig('skipped', null)
    expect(config.iconName).toBe('minus-circle')
    expect(config.textClass).toContain('line-through')
    expect(config.isOverdue).toBe(false)
  })

  it('returns red for blocked tasks', () => {
    const config = getTaskStatusConfig('blocked', null)
    expect(config.iconName).toBe('x-circle')
    expect(config.iconClass).toContain('red')
    expect(config.isOverdue).toBe(false)
  })

  it('returns neutral circle for pending tasks (not overdue)', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString()
    const config = getTaskStatusConfig('pending', futureDate)
    expect(config.iconName).toBe('circle')
    expect(config.isOverdue).toBe(false)
  })

  it('returns red overdue state for pending tasks past due', () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString()
    const config = getTaskStatusConfig('pending', pastDate)
    expect(config.isOverdue).toBe(true)
    expect(config.iconClass).toContain('red')
    expect(config.bgClass).toContain('red')
  })

  it('completed tasks are NOT marked overdue even with past dueAt', () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString()
    const config = getTaskStatusConfig('completed', pastDate)
    expect(config.isOverdue).toBe(false)
    expect(config.iconName).toBe('check-circle-2')
  })

  it('handles null dueAt for pending tasks', () => {
    const config = getTaskStatusConfig('pending', null)
    expect(config.isOverdue).toBe(false)
  })
})

// ─── Completion Source Badge ─────────────────────────────────────────────────

describe('getCompletionSourceBadge', () => {
  it('returns "Manual" badge for manual completion', () => {
    const badge = getCompletionSourceBadge('manual')
    expect(badge).not.toBeNull()
    expect(badge!.label).toBe('Manual')
    expect(badge!.className).toContain('blue')
  })

  it('returns "Auto" badge for auto_completed', () => {
    const badge = getCompletionSourceBadge('auto_completed')
    expect(badge).not.toBeNull()
    expect(badge!.label).toBe('Auto')
    expect(badge!.className).toContain('amber')
  })

  it('returns "System" badge for system completion', () => {
    const badge = getCompletionSourceBadge('system')
    expect(badge).not.toBeNull()
    expect(badge!.label).toBe('System')
  })

  it('returns null for null source', () => {
    expect(getCompletionSourceBadge(null)).toBeNull()
  })

  it('returns raw source for unknown sources', () => {
    const badge = getCompletionSourceBadge('webhook')
    expect(badge).not.toBeNull()
    expect(badge!.label).toBe('webhook')
  })
})

// ─── Gate Status Config ──────────────────────────────────────────────────────

describe('getGateStatusConfig', () => {
  it('returns "Passed" with green check for passed + enabled gate', () => {
    const config = getGateStatusConfig(true, true)
    expect(config.iconName).toBe('check-circle-2')
    expect(config.iconClass).toContain('green')
    expect(config.label).toBe('Passed')
  })

  it('returns "Blocked" with red X for failed + enabled gate', () => {
    const config = getGateStatusConfig(false, true)
    expect(config.iconName).toBe('x-circle')
    expect(config.iconClass).toContain('red')
    expect(config.label).toBe('Blocked')
  })

  it('returns "Not Required" for disabled gate regardless of passed', () => {
    const config = getGateStatusConfig(false, false)
    expect(config.iconName).toBe('minus-circle')
    expect(config.label).toBe('Not Required')

    const config2 = getGateStatusConfig(true, false)
    expect(config2.label).toBe('Not Required')
  })
})

// ─── Overdue Days ────────────────────────────────────────────────────────────

describe('getOverdueDays', () => {
  it('returns null for null dueAt', () => {
    expect(getOverdueDays(null)).toBeNull()
  })

  it('returns null for future dueAt', () => {
    const future = new Date(Date.now() + 7 * 86400000).toISOString()
    expect(getOverdueDays(future)).toBeNull()
  })

  it('returns positive number for past dueAt', () => {
    const pastDate = new Date(Date.now() - 3 * 86400000).toISOString()
    const days = getOverdueDays(pastDate)
    expect(days).not.toBeNull()
    expect(days!).toBeGreaterThanOrEqual(2) // At least 2 days (rounding)
    expect(days!).toBeLessThanOrEqual(4)
  })
})

// ─── Subtype Label ───────────────────────────────────────────────────────────

describe('getSubtypeLabel', () => {
  it('returns null for null input', () => {
    expect(getSubtypeLabel(null)).toBeNull()
  })

  it('returns known labels for recognized subtypes', () => {
    expect(getSubtypeLabel('ai_analysis_complete')).toBe('AI Analysis Complete')
    expect(getSubtypeLabel('consultation_invite')).toBe('Consultation Invite')
    expect(getSubtypeLabel('consultation_reminder')).toBe('Consultation Reminder')
    expect(getSubtypeLabel('closure_notice')).toBe('Closure Notice')
    expect(getSubtypeLabel('payment_request')).toBe('Payment Request')
    expect(getSubtypeLabel('welcome_package')).toBe('Welcome Package')
  })

  it('title-cases unknown subtypes with underscores replaced', () => {
    const result = getSubtypeLabel('custom_event_type')
    expect(result).toBe('Custom Event Type')
  })
})
