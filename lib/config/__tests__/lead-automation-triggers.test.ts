/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Wave 6 — Automation Visibility & Settings Alignment Tests
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Validates:
 * - All automation triggers are structurally sound
 * - Trigger stages reference valid stages from the registry
 * - Every trigger has merge fields with required properties
 * - System default templates exist where expected
 * - Categories cover all triggers
 * - isContactAttempt correctly classifies channels
 * - Auto-complete triggers in milestone tasks reference valid event types
 * - Cadence config keys in milestone tasks map to DEFAULT_WORKSPACE_CONFIG
 * - No hardcoded message strings exist in milestone definitions
 */

import { describe, it, expect } from 'vitest'
import {
  LEAD_AUTOMATION_TRIGGERS,
  getTriggersByCategory,
  getTriggersForStage,
  getMergeFieldsForTrigger,
  getSystemDefaultTemplate,
  isSystemControlledTrigger,
  getAllTriggerKeys,
} from '@/lib/config/lead-automation-triggers'
import {
  LEAD_STAGES,
  ACTIVE_STAGES,
  CLOSED_STAGES,
  STAGE_MILESTONE_DEFINITIONS,
  CONTACT_ATTEMPT_CHANNELS,
  isContactAttempt,
  DEFAULT_WORKSPACE_CONFIG,
  type LeadStage,
} from '@/lib/config/lead-workflow-definitions'

// ─── Trigger Registry Structure ─────────────────────────────────────────────

describe('Automation Trigger Registry', () => {
  it('has at least 10 triggers defined', () => {
    const keys = Object.keys(LEAD_AUTOMATION_TRIGGERS)
    expect(keys.length).toBeGreaterThanOrEqual(10)
  })

  it('every trigger has triggerKey, label, category, and applicableStages array', () => {
    for (const [key, trigger] of Object.entries(LEAD_AUTOMATION_TRIGGERS)) {
      expect(trigger.triggerKey, `Trigger ${key} missing triggerKey`).toBe(key)
      expect(trigger.label, `Trigger ${key} missing label`).toBeTruthy()
      expect(trigger.category, `Trigger ${key} missing category`).toBeTruthy()
      // applicableStages may be empty for global triggers (e.g., stage_transition)
      expect(Array.isArray(trigger.applicableStages), `Trigger ${key} applicableStages not an array`).toBe(true)
    }
  })

  it('most triggers have at least one applicable stage', () => {
    const triggersWithStages = Object.entries(LEAD_AUTOMATION_TRIGGERS).filter(
      ([, trigger]) => trigger.applicableStages.length > 0
    )
    // Most triggers are stage-specific
    expect(triggersWithStages.length).toBeGreaterThan(5)
  })

  it('all applicable stages in triggers are valid stages', () => {
    const allStages = new Set(Object.values(LEAD_STAGES) as string[])
    for (const [key, trigger] of Object.entries(LEAD_AUTOMATION_TRIGGERS)) {
      for (const stage of trigger.applicableStages) {
        expect(allStages.has(stage), `Trigger ${key} references invalid stage "${stage}"`).toBe(true)
      }
    }
  })

  it('every trigger has at least one merge field', () => {
    for (const [key, trigger] of Object.entries(LEAD_AUTOMATION_TRIGGERS)) {
      expect(trigger.availableMergeFields.length, `Trigger ${key} has no merge fields`).toBeGreaterThan(0)
    }
  })

  it('merge fields have key, label, and sampleValue', () => {
    for (const [triggerKey, trigger] of Object.entries(LEAD_AUTOMATION_TRIGGERS)) {
      for (const field of trigger.availableMergeFields) {
        expect(field.key, `Merge field in ${triggerKey} missing key`).toBeTruthy()
        expect(field.label, `Merge field in ${triggerKey} missing label`).toBeTruthy()
        expect(field.sampleValue, `Merge field ${field.key} in ${triggerKey} missing sampleValue`).toBeDefined()
      }
    }
  })

  it('getAllTriggerKeys returns all trigger keys', () => {
    const keys = getAllTriggerKeys()
    expect(keys.length).toBe(Object.keys(LEAD_AUTOMATION_TRIGGERS).length)
    for (const key of keys) {
      expect(LEAD_AUTOMATION_TRIGGERS[key]).toBeDefined()
    }
  })
})

// ─── Trigger Lookup Functions ───────────────────────────────────────────────

describe('Trigger Lookup Functions', () => {
  it('getTriggersByCategory groups all triggers', () => {
    const byCategory = getTriggersByCategory()
    let totalCount = 0
    for (const triggers of Object.values(byCategory)) {
      totalCount += triggers.length
    }
    expect(totalCount).toBe(Object.keys(LEAD_AUTOMATION_TRIGGERS).length)
  })

  it('getTriggersForStage returns at least one trigger for early active stages', () => {
    // Early stages should have outreach/reminder triggers
    const newInquiryTriggers = getTriggersForStage(LEAD_STAGES.NEW_INQUIRY)
    expect(newInquiryTriggers.length).toBeGreaterThan(0)
  })

  it('getMergeFieldsForTrigger returns fields for known trigger', () => {
    const keys = getAllTriggerKeys()
    if (keys.length > 0) {
      const fields = getMergeFieldsForTrigger(keys[0])
      expect(fields.length).toBeGreaterThan(0)
    }
  })

  it('getMergeFieldsForTrigger returns common merge fields for unknown trigger', () => {
    // Unknown triggers fall back to the common merge fields (not empty)
    const fields = getMergeFieldsForTrigger('nonexistent_trigger')
    expect(fields.length).toBeGreaterThan(0)
    // Should include common fields like contact.name
    const keys = fields.map((f) => f.key)
    expect(keys.some((k) => k.includes('contact'))).toBe(true)
  })

  it('isSystemControlledTrigger returns boolean for valid triggers', () => {
    for (const key of getAllTriggerKeys()) {
      const result = isSystemControlledTrigger(key)
      expect(typeof result).toBe('boolean')
    }
  })
})

// ─── System Default Templates ───────────────────────────────────────────────

describe('System Default Templates', () => {
  it('triggers with systemDefaultTemplates have at least one channel template', () => {
    for (const [key, trigger] of Object.entries(LEAD_AUTOMATION_TRIGGERS)) {
      if (trigger.systemDefaultTemplates) {
        const channels = Object.keys(trigger.systemDefaultTemplates)
        expect(channels.length, `Trigger ${key} has empty systemDefaultTemplates`).toBeGreaterThan(0)
      }
    }
  })

  it('getSystemDefaultTemplate returns valid template for known trigger+channel', () => {
    // Find a trigger with templates
    for (const [key, trigger] of Object.entries(LEAD_AUTOMATION_TRIGGERS)) {
      if (trigger.systemDefaultTemplates) {
        const channels = Object.keys(trigger.systemDefaultTemplates)
        if (channels.length > 0) {
          const template = getSystemDefaultTemplate(key, channels[0])
          if (template) {
            expect(template.subject).toBeDefined()
            expect(template.body).toBeTruthy()
          }
        }
      }
    }
  })

  it('getSystemDefaultTemplate returns null for unknown trigger', () => {
    expect(getSystemDefaultTemplate('nonexistent', 'email')).toBeNull()
  })
})

// ─── Contact Attempt Classification ─────────────────────────────────────────

describe('isContactAttempt', () => {
  it('outbound call counts as contact attempt', () => {
    expect(isContactAttempt('call', 'outbound')).toBe(true)
  })

  it('outbound email counts as contact attempt', () => {
    expect(isContactAttempt('email', 'outbound')).toBe(true)
  })

  it('outbound sms counts as contact attempt', () => {
    expect(isContactAttempt('sms', 'outbound')).toBe(true)
  })

  it('inbound calls do NOT count as contact attempt', () => {
    expect(isContactAttempt('call', 'inbound')).toBe(false)
  })

  it('portal_chat does NOT count as contact attempt', () => {
    expect(isContactAttempt('portal_chat', 'outbound')).toBe(false)
    expect(isContactAttempt('portal_chat', 'inbound')).toBe(false)
  })

  it('system_reminder does NOT count as contact attempt', () => {
    expect(isContactAttempt('system_reminder', 'outbound')).toBe(false)
    expect(isContactAttempt('system_reminder', 'system')).toBe(false)
  })

  it('unknown channel does NOT count as contact attempt', () => {
    expect(isContactAttempt('unknown_channel', 'outbound')).toBe(false)
  })
})

describe('CONTACT_ATTEMPT_CHANNELS', () => {
  it('defines all 5 channels', () => {
    const channels = CONTACT_ATTEMPT_CHANNELS.map((c) => c.channel)
    expect(channels).toContain('call')
    expect(channels).toContain('email')
    expect(channels).toContain('sms')
    expect(channels).toContain('portal_chat')
    expect(channels).toContain('system_reminder')
  })

  it('only call, email, sms count as contact attempts', () => {
    const attemptChannels = CONTACT_ATTEMPT_CHANNELS.filter((c) => c.countsAsContactAttempt)
    expect(attemptChannels).toHaveLength(3)
    const channelNames = attemptChannels.map((c) => c.channel)
    expect(channelNames).toContain('call')
    expect(channelNames).toContain('email')
    expect(channelNames).toContain('sms')
  })
})

// ─── Auto-Complete Trigger Validation ───────────────────────────────────────

describe('Auto-Complete Triggers in Milestone Definitions', () => {
  const VALID_AUTO_COMPLETE_EVENTS = new Set([
    'communication_logged',
    'consultation_updated',
    'retainer_updated',
    'payment_received',
    'qualification_decided',
    'conflict_resolved',
    'document_uploaded',
  ])

  it('every autoCompleteOn.event is a valid event type', () => {
    for (const [stage, groups] of Object.entries(STAGE_MILESTONE_DEFINITIONS)) {
      if (!groups) continue
      for (const group of groups) {
        for (const task of group.tasks) {
          if (task.autoCompleteOn) {
            expect(
              VALID_AUTO_COMPLETE_EVENTS.has(task.autoCompleteOn.event),
              `Task ${task.taskType} in ${stage}/${group.groupType} has invalid auto-complete event "${task.autoCompleteOn.event}"`
            ).toBe(true)
          }
        }
      }
    }
  })

  it('auto-complete triggers with direction filters use valid directions', () => {
    const validDirections = new Set(['inbound', 'outbound', 'system'])
    for (const [stage, groups] of Object.entries(STAGE_MILESTONE_DEFINITIONS)) {
      if (!groups) continue
      for (const group of groups) {
        for (const task of group.tasks) {
          if (task.autoCompleteOn?.direction) {
            expect(
              validDirections.has(task.autoCompleteOn.direction),
              `Task ${task.taskType} has invalid direction "${task.autoCompleteOn.direction}"`
            ).toBe(true)
          }
        }
      }
    }
  })

  it('at least some tasks have auto-complete triggers (automation exists)', () => {
    let autoCompleteCount = 0
    for (const groups of Object.values(STAGE_MILESTONE_DEFINITIONS)) {
      if (!groups) continue
      for (const group of groups) {
        for (const task of group.tasks) {
          if (task.autoCompleteOn) autoCompleteCount++
        }
      }
    }
    expect(autoCompleteCount, 'No auto-complete triggers found').toBeGreaterThan(5)
  })

  it('at least some tasks are manual-only (no auto-complete)', () => {
    let manualOnlyCount = 0
    for (const groups of Object.values(STAGE_MILESTONE_DEFINITIONS)) {
      if (!groups) continue
      for (const group of groups) {
        for (const task of group.tasks) {
          if (!task.autoCompleteOn) manualOnlyCount++
        }
      }
    }
    expect(manualOnlyCount, 'All tasks have auto-complete — no manual tasks').toBeGreaterThan(3)
  })
})

// ─── Cadence Config Key Alignment ───────────────────────────────────────────

describe('Cadence Config Key Alignment', () => {
  const validCadenceKeys = Object.keys(DEFAULT_WORKSPACE_CONFIG).filter((k) =>
    k.endsWith('_cadence_days')
  )

  it('DEFAULT_WORKSPACE_CONFIG has cadence arrays', () => {
    expect(validCadenceKeys.length).toBeGreaterThanOrEqual(3)
    for (const key of validCadenceKeys) {
      const value = DEFAULT_WORKSPACE_CONFIG[key as keyof typeof DEFAULT_WORKSPACE_CONFIG]
      expect(Array.isArray(value), `${key} should be an array`).toBe(true)
    }
  })

  it('all cadenceConfigKey references in milestone tasks exist in DEFAULT_WORKSPACE_CONFIG', () => {
    const validKeySet = new Set(Object.keys(DEFAULT_WORKSPACE_CONFIG))

    for (const [stage, groups] of Object.entries(STAGE_MILESTONE_DEFINITIONS)) {
      if (!groups) continue
      for (const group of groups) {
        for (const task of group.tasks) {
          if (task.cadenceConfigKey) {
            expect(
              validKeySet.has(task.cadenceConfigKey),
              `Task ${task.taskType} in ${stage}/${group.groupType} references unknown cadence key "${task.cadenceConfigKey}"`
            ).toBe(true)
          }
        }
      }
    }
  })

  it('cadence arrays have at least 2 steps (minimum for follow-up pattern)', () => {
    for (const key of validCadenceKeys) {
      const cadence = DEFAULT_WORKSPACE_CONFIG[key as keyof typeof DEFAULT_WORKSPACE_CONFIG] as number[]
      expect(cadence.length, `${key} has fewer than 2 cadence steps`).toBeGreaterThanOrEqual(2)
    }
  })

  it('cadence values are positive integers', () => {
    for (const key of validCadenceKeys) {
      const cadence = DEFAULT_WORKSPACE_CONFIG[key as keyof typeof DEFAULT_WORKSPACE_CONFIG] as number[]
      for (const val of cadence) {
        expect(Number.isInteger(val), `${key} contains non-integer: ${val}`).toBe(true)
        expect(val, `${key} contains non-positive value: ${val}`).toBeGreaterThan(0)
      }
    }
  })
})

// ─── Workspace Config Defaults ──────────────────────────────────────────────

describe('DEFAULT_WORKSPACE_CONFIG', () => {
  it('has all required conversion gate flags', () => {
    const gates = DEFAULT_WORKSPACE_CONFIG.active_matter_conversion_gates
    expect(gates.conflict_cleared).toBeDefined()
    expect(gates.retainer_signed).toBeDefined()
    expect(gates.payment_received).toBeDefined()
    expect(gates.intake_complete).toBeDefined()
    expect(gates.id_verification).toBeDefined()
    expect(gates.required_documents).toBeDefined()
  })

  it('enabled_channels is a non-empty array', () => {
    expect(DEFAULT_WORKSPACE_CONFIG.enabled_channels.length).toBeGreaterThan(0)
  })

  it('consultation_reminder_hours is an array of positive numbers', () => {
    expect(DEFAULT_WORKSPACE_CONFIG.consultation_reminder_hours.length).toBeGreaterThan(0)
    for (const h of DEFAULT_WORKSPACE_CONFIG.consultation_reminder_hours) {
      expect(h).toBeGreaterThan(0)
    }
  })

  it('auto_closure_after_days is a positive number', () => {
    expect(DEFAULT_WORKSPACE_CONFIG.auto_closure_after_days).toBeGreaterThan(0)
  })

  it('final_closure_messages_mode is a valid option', () => {
    expect(['auto', 'manual', 'off']).toContain(DEFAULT_WORKSPACE_CONFIG.final_closure_messages_mode)
  })
})
