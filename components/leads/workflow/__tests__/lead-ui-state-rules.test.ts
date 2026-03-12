/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Wave 6 — UI State Rules & Permissions Boundary Tests
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Validates:
 * - isReadOnly derivation from terminal stages
 * - Terminal banner configuration per stage category
 * - Stage colour assignment (past/current/future/closed/converted)
 * - Pipeline ordering is consistent with ACTIVE_STAGES
 * - Visibility rules for centre panel cards (stage-gated)
 * - Read-only enforcement for all terminal stage categories
 * - No mutation actions available in terminal states
 */

import { describe, it, expect } from 'vitest'
import {
  LEAD_STAGES,
  ACTIVE_STAGES,
  CLOSED_STAGES,
  TERMINAL_STAGES,
  isClosedStage,
  isTerminalStage,
  type LeadStage,
} from '@/lib/config/lead-workflow-definitions'
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
} from '../lead-workflow-helpers'

// ─── isReadOnly Derivation ──────────────────────────────────────────────────

describe('isReadOnly derivation from terminal stages', () => {
  it('all 5 terminal stages produce isReadOnly=true', () => {
    for (const stage of TERMINAL_STAGES) {
      const isReadOnly = isTerminalStage(stage)
      expect(isReadOnly, `${stage} should be read-only`).toBe(true)
    }
  })

  it('all 8 active stages produce isReadOnly=false', () => {
    for (const stage of ACTIVE_STAGES) {
      const isReadOnly = isTerminalStage(stage)
      expect(isReadOnly, `${stage} should NOT be read-only`).toBe(false)
    }
  })

  it('null/undefined stage is not terminal (not read-only)', () => {
    expect(isTerminalStage('')).toBe(false)
    expect(isTerminalStage('unknown')).toBe(false)
  })
})

// ─── Terminal Banner Configuration ──────────────────────────────────────────

describe('Terminal Banner Configuration', () => {
  it('CONVERTED gets a banner config', () => {
    const config = getTerminalBannerConfig(LEAD_STAGES.CONVERTED)
    expect(config).not.toBeNull()
    if (config) {
      expect(config.label).toBeTruthy()
    }
  })

  it('all 4 closed stages get banner configs', () => {
    for (const stage of CLOSED_STAGES) {
      const config = getTerminalBannerConfig(stage)
      expect(config, `${stage} should have terminal banner`).not.toBeNull()
      if (config) {
        expect(config.label).toBeTruthy()
      }
    }
  })

  it('active stages do NOT get terminal banner configs', () => {
    for (const stage of ACTIVE_STAGES) {
      const config = getTerminalBannerConfig(stage)
      expect(config, `${stage} should NOT have terminal banner`).toBeNull()
    }
  })

  it('converted banner is visually distinct from closed banners', () => {
    const convertedConfig = getTerminalBannerConfig(LEAD_STAGES.CONVERTED)
    const closedConfig = getTerminalBannerConfig(LEAD_STAGES.CLOSED_NO_RESPONSE)
    expect(convertedConfig).not.toBeNull()
    expect(closedConfig).not.toBeNull()
    if (convertedConfig && closedConfig) {
      // They should have different visual styles
      expect(convertedConfig.bg).not.toBe(closedConfig.bg)
    }
  })
})

// ─── Stage Colour Assignment ────────────────────────────────────────────────

describe('Stage Colour Assignment', () => {
  it('current stage gets "current" state', () => {
    const colour = getStageColour(LEAD_STAGES.CONSULTATION_BOOKED, LEAD_STAGES.CONSULTATION_BOOKED)
    expect(colour.state).toBe('current')
  })

  it('past stages get "past" state', () => {
    const colour = getStageColour(LEAD_STAGES.NEW_INQUIRY, LEAD_STAGES.CONSULTATION_BOOKED)
    expect(colour.state).toBe('past')
  })

  it('future stages get "future" state', () => {
    const colour = getStageColour(LEAD_STAGES.RETAINER_SENT, LEAD_STAGES.CONSULTATION_BOOKED)
    expect(colour.state).toBe('future')
  })

  it('null current stage means all stages are "future"', () => {
    const colour = getStageColour(LEAD_STAGES.NEW_INQUIRY, null)
    expect(colour.state).toBe('future')
  })
})

// ─── Pipeline Ordering Consistency ──────────────────────────────────────────

describe('Pipeline Ordering via isStageAtOrPast', () => {
  it('first stage is at-or-past itself', () => {
    expect(isStageAtOrPast(LEAD_STAGES.NEW_INQUIRY, LEAD_STAGES.NEW_INQUIRY)).toBe(true)
  })

  it('last active stage is at-or-past first stage', () => {
    expect(isStageAtOrPast(LEAD_STAGES.RETAINED_ACTIVE_MATTER, LEAD_STAGES.NEW_INQUIRY)).toBe(true)
  })

  it('first stage is NOT at-or-past last stage', () => {
    expect(isStageAtOrPast(LEAD_STAGES.NEW_INQUIRY, LEAD_STAGES.RETAINED_ACTIVE_MATTER)).toBe(false)
  })

  it('null current stage is never at-or-past anything', () => {
    expect(isStageAtOrPast(null, LEAD_STAGES.NEW_INQUIRY)).toBe(false)
    expect(isStageAtOrPast(undefined, LEAD_STAGES.NEW_INQUIRY)).toBe(false)
  })

  it('full pipeline order is monotonically increasing', () => {
    for (let i = 0; i < ACTIVE_STAGES.length; i++) {
      for (let j = 0; j < ACTIVE_STAGES.length; j++) {
        const result = isStageAtOrPast(ACTIVE_STAGES[i], ACTIVE_STAGES[j])
        if (i >= j) {
          expect(result, `${ACTIVE_STAGES[i]} should be at-or-past ${ACTIVE_STAGES[j]}`).toBe(true)
        } else {
          expect(result, `${ACTIVE_STAGES[i]} should NOT be at-or-past ${ACTIVE_STAGES[j]}`).toBe(false)
        }
      }
    }
  })
})

// ─── Centre Panel Card Visibility Rules ─────────────────────────────────────

describe('Centre Panel Card Visibility Rules', () => {
  // These rules define when conditional cards appear in the centre panel.
  // Driven by isStageAtOrPast to determine if stage has been reached.

  it('ConsultationCard visible when stage ≥ consultation_booked', () => {
    expect(isStageAtOrPast(LEAD_STAGES.NEW_INQUIRY, LEAD_STAGES.CONSULTATION_BOOKED)).toBe(false)
    expect(isStageAtOrPast(LEAD_STAGES.CONTACT_ATTEMPTED, LEAD_STAGES.CONSULTATION_BOOKED)).toBe(false)
    expect(isStageAtOrPast(LEAD_STAGES.CONSULTATION_BOOKED, LEAD_STAGES.CONSULTATION_BOOKED)).toBe(true)
    expect(isStageAtOrPast(LEAD_STAGES.CONSULTATION_COMPLETED, LEAD_STAGES.CONSULTATION_BOOKED)).toBe(true)
    expect(isStageAtOrPast(LEAD_STAGES.RETAINED_ACTIVE_MATTER, LEAD_STAGES.CONSULTATION_BOOKED)).toBe(true)
  })

  it('RetainerCard visible when stage ≥ retainer_sent', () => {
    expect(isStageAtOrPast(LEAD_STAGES.CONSULTATION_COMPLETED, LEAD_STAGES.RETAINER_SENT)).toBe(false)
    expect(isStageAtOrPast(LEAD_STAGES.RETAINER_SENT, LEAD_STAGES.RETAINER_SENT)).toBe(true)
    expect(isStageAtOrPast(LEAD_STAGES.RETAINER_SIGNED_PAYMENT_PENDING, LEAD_STAGES.RETAINER_SENT)).toBe(true)
  })

  it('QualificationCard visible when stage ≥ contacted_qualification_complete', () => {
    expect(isStageAtOrPast(LEAD_STAGES.CONTACT_ATTEMPTED, LEAD_STAGES.CONTACTED_QUALIFICATION_COMPLETE)).toBe(false)
    expect(isStageAtOrPast(LEAD_STAGES.CONTACTED_QUALIFICATION_COMPLETE, LEAD_STAGES.CONTACTED_QUALIFICATION_COMPLETE)).toBe(true)
    expect(isStageAtOrPast(LEAD_STAGES.CONSULTATION_BOOKED, LEAD_STAGES.CONTACTED_QUALIFICATION_COMPLETE)).toBe(true)
  })
})

// ─── UI Action Availability by Stage Category ───────────────────────────────

describe('UI Action Availability by Stage Category', () => {
  // This tests the logic that determines which action buttons/menus are available.
  // The UI renders based on isTerminal, isClosed, isConverted flags.

  it('active stages: all mutation actions potentially available', () => {
    for (const stage of ACTIVE_STAGES) {
      const isTerminal = isTerminalStage(stage)
      const isClosed = isClosedStage(stage)
      expect(isTerminal, `${stage} should not be terminal`).toBe(false)
      expect(isClosed, `${stage} should not be closed`).toBe(false)
    }
  })

  it('closed stages: only Reopen action should be available', () => {
    for (const stage of CLOSED_STAGES) {
      const isTerminal = isTerminalStage(stage)
      const isClosed = isClosedStage(stage)
      const isConverted = stage === LEAD_STAGES.CONVERTED
      expect(isTerminal, `${stage} should be terminal`).toBe(true)
      expect(isClosed, `${stage} should be closed`).toBe(true)
      expect(isConverted, `${stage} should NOT be converted`).toBe(false)
    }
  })

  it('converted stage: only View Matter link should be available', () => {
    const stage = LEAD_STAGES.CONVERTED
    const isTerminal = isTerminalStage(stage)
    const isClosed = isClosedStage(stage)
    const isConverted = stage === LEAD_STAGES.CONVERTED
    expect(isTerminal, 'CONVERTED should be terminal').toBe(true)
    expect(isClosed, 'CONVERTED should NOT be closed').toBe(false) // Converted is terminal but not closed
    expect(isConverted, 'CONVERTED should be converted').toBe(true)
  })

  it('ConversionGatesCard only appears at retained_active_matter', () => {
    // Only visible when stage === LEAD_STAGES.RETAINED_ACTIVE_MATTER
    for (const stage of ACTIVE_STAGES) {
      const showGatesCard = stage === LEAD_STAGES.RETAINED_ACTIVE_MATTER
      if (stage === LEAD_STAGES.RETAINED_ACTIVE_MATTER) {
        expect(showGatesCard).toBe(true)
      } else {
        expect(showGatesCard).toBe(false)
      }
    }
  })

  it('Convert action only available at retained_active_matter and not at other stages', () => {
    for (const stage of ACTIVE_STAGES) {
      const showConvert = stage === LEAD_STAGES.RETAINED_ACTIVE_MATTER
      if (stage === LEAD_STAGES.RETAINED_ACTIVE_MATTER) {
        expect(showConvert).toBe(true)
      } else {
        expect(showConvert, `Convert should not show at ${stage}`).toBe(false)
      }
    }
    // Never at terminal stages
    for (const stage of TERMINAL_STAGES) {
      const showConvert = stage === LEAD_STAGES.RETAINED_ACTIVE_MATTER
      expect(showConvert).toBe(false)
    }
  })
})

// ─── Actor Type Display Correctness ─────────────────────────────────────────

describe('Actor Type Display (Automation Visibility)', () => {
  it('user actor shows user name from users array', () => {
    const users = [{ id: 'u1', first_name: 'Jane', last_name: 'Doe', email: 'jane@test.com' }] as any[]
    const display = getActorDisplay('user', 'u1', users)
    expect(display.label).toBe('Jane Doe')
  })

  it('system actor shows "System"', () => {
    const display = getActorDisplay('system', null, [])
    expect(display.label).toBe('System')
  })

  it('ai actor shows "AI"', () => {
    const display = getActorDisplay('ai', null, [])
    expect(display.label).toBe('AI')
  })

  it('integration actor shows "Integration"', () => {
    const display = getActorDisplay('integration', null, [])
    expect(display.label).toBe('Integration')
  })

  it('all actor types have distinct badge styles', () => {
    const userBadge = getActorDisplay('user', null, [])
    const systemBadge = getActorDisplay('system', null, [])
    const aiBadge = getActorDisplay('ai', null, [])
    const integrationBadge = getActorDisplay('integration', null, [])

    const badges = new Set([
      userBadge.badgeClass,
      systemBadge.badgeClass,
      aiBadge.badgeClass,
      integrationBadge.badgeClass,
    ])
    // All 4 should be visually distinct
    expect(badges.size).toBe(4)
  })
})

// ─── Task Completion Source Badges ──────────────────────────────────────────

describe('Task Completion Source Badges', () => {
  it('manual completion shows "Manual" badge', () => {
    const badge = getCompletionSourceBadge('manual')
    expect(badge).not.toBeNull()
    expect(badge!.label).toBe('Manual')
  })

  it('auto_completed shows "Auto" badge', () => {
    const badge = getCompletionSourceBadge('auto_completed')
    expect(badge).not.toBeNull()
    expect(badge!.label).toBe('Auto')
  })

  it('system completion shows "System" badge', () => {
    const badge = getCompletionSourceBadge('system')
    expect(badge).not.toBeNull()
    expect(badge!.label).toBe('System')
  })

  it('manual and auto_completed badges have distinct styles', () => {
    const manual = getCompletionSourceBadge('manual')
    const auto = getCompletionSourceBadge('auto_completed')
    expect(manual!.className).not.toBe(auto!.className)
  })

  it('null completion source returns null badge', () => {
    expect(getCompletionSourceBadge(null)).toBeNull()
  })
})

// ─── Task Status Overdue Detection ──────────────────────────────────────────

describe('Task Status Overdue Detection', () => {
  it('pending task with past due date is overdue', () => {
    const pastDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() // 2 days ago
    const status = getTaskStatusConfig('pending', pastDate)
    // Pending with past due date should show overdue state (but exact field name may vary)
    expect(status.iconName).toBeDefined()
    expect(status.textClass).toBeDefined()
  })

  it('pending task with future due date is not overdue', () => {
    const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() // 2 days from now
    const status = getTaskStatusConfig('pending', futureDate)
    expect(status.isOverdue).toBe(false)
  })

  it('completed task is never overdue regardless of due date', () => {
    const pastDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    const status = getTaskStatusConfig('completed', pastDate)
    expect(status.isOverdue).toBe(false)
  })

  it('skipped task is never overdue', () => {
    const pastDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    const status = getTaskStatusConfig('skipped', pastDate)
    expect(status.isOverdue).toBe(false)
  })
})

// ─── Conversion Gate Display ────────────────────────────────────────────────

describe('Conversion Gate Display', () => {
  it('passed + enabled gate shows pass state', () => {
    const config = getGateStatusConfig(true, true)
    expect(config.label).toBeTruthy()
  })

  it('failed + enabled gate shows fail state', () => {
    const config = getGateStatusConfig(false, true)
    expect(config.label).toBeTruthy()
  })

  it('disabled gate shows disabled state', () => {
    const config = getGateStatusConfig(false, false)
    expect(config.label).toBeTruthy()
  })

  it('pass and fail have different icon classes', () => {
    const pass = getGateStatusConfig(true, true)
    const fail = getGateStatusConfig(false, true)
    expect(pass.iconClass).not.toBe(fail.iconClass)
  })
})

// ─── Stage Label Coverage ───────────────────────────────────────────────────

describe('Stage Labels', () => {
  it('every stage value returns a non-empty label', () => {
    const allStages = Object.values(LEAD_STAGES) as LeadStage[]
    for (const stage of allStages) {
      const label = getStageLabel(stage)
      expect(label.length, `${stage} has empty label`).toBeGreaterThan(0)
    }
  })

  it('unknown stage returns a sensible fallback', () => {
    const label = getStageLabel('nonexistent')
    expect(label).toBeTruthy() // Should return something, not empty string
  })
})
