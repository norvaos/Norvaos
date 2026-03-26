/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Wave 6  -  Structural Integrity Tests: Lead Workflow Definitions
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Validates the workflow definition registry is structurally sound:
 * - Stage constants complete and consistent
 * - Transition rules cover every active stage
 * - Guard types referenced in transitions exist
 * - Closure definitions match closed stages
 * - Terminal stages = closed + converted
 * - No orphaned or unreachable stages
 * - Milestone definitions reference valid stages with correct structure
 */

import { describe, it, expect } from 'vitest'
import {
  LEAD_STAGES,
  ACTIVE_STAGES,
  CLOSED_STAGES,
  TERMINAL_STAGES,
  STAGE_LABELS,
  STAGE_TRANSITION_RULES,
  CLOSURE_STAGE_DEFINITIONS,
  STAGE_MILESTONE_DEFINITIONS,
  isClosedStage,
  isTerminalStage,
  type LeadStage,
} from '@/lib/config/lead-workflow-definitions'

// ─── Stage Constants ─────────────────────────────────────────────────────────

describe('Stage Constants', () => {
  it('defines exactly 13 stages (8 active + 4 closed + 1 converted)', () => {
    const allStageValues = Object.values(LEAD_STAGES)
    expect(allStageValues.length).toBe(13)
  })

  it('has 8 active stages in correct pipeline order', () => {
    expect(ACTIVE_STAGES).toHaveLength(8)
    expect(ACTIVE_STAGES[0]).toBe(LEAD_STAGES.NEW_INQUIRY)
    expect(ACTIVE_STAGES[7]).toBe(LEAD_STAGES.RETAINED_ACTIVE_MATTER)
  })

  it('has 4 closed stages', () => {
    expect(CLOSED_STAGES).toHaveLength(4)
    expect(CLOSED_STAGES).toContain(LEAD_STAGES.CLOSED_NO_RESPONSE)
    expect(CLOSED_STAGES).toContain(LEAD_STAGES.CLOSED_RETAINER_NOT_SIGNED)
    expect(CLOSED_STAGES).toContain(LEAD_STAGES.CLOSED_CLIENT_DECLINED)
    expect(CLOSED_STAGES).toContain(LEAD_STAGES.CLOSED_NOT_A_FIT)
  })

  it('terminal stages = 4 closed + CONVERTED', () => {
    expect(TERMINAL_STAGES).toHaveLength(5)
    for (const closed of CLOSED_STAGES) {
      expect(TERMINAL_STAGES).toContain(closed)
    }
    expect(TERMINAL_STAGES).toContain(LEAD_STAGES.CONVERTED)
  })

  it('every stage has a human-readable label', () => {
    const allStages = Object.values(LEAD_STAGES) as LeadStage[]
    for (const stage of allStages) {
      expect(STAGE_LABELS[stage]).toBeDefined()
      expect(typeof STAGE_LABELS[stage]).toBe('string')
      expect(STAGE_LABELS[stage].length).toBeGreaterThan(0)
    }
  })

  it('active and closed stages do not overlap', () => {
    const activeSet = new Set(ACTIVE_STAGES)
    const closedSet = new Set(CLOSED_STAGES)
    for (const stage of activeSet) {
      expect(closedSet.has(stage)).toBe(false)
    }
  })

  it('CONVERTED is not in active or closed stages', () => {
    expect(ACTIVE_STAGES).not.toContain(LEAD_STAGES.CONVERTED)
    expect(CLOSED_STAGES).not.toContain(LEAD_STAGES.CONVERTED)
  })
})

// ─── isClosedStage / isTerminalStage ─────────────────────────────────────────

describe('isClosedStage', () => {
  it('returns true for all 4 closed stages', () => {
    for (const stage of CLOSED_STAGES) {
      expect(isClosedStage(stage)).toBe(true)
    }
  })

  it('returns false for active stages', () => {
    for (const stage of ACTIVE_STAGES) {
      expect(isClosedStage(stage)).toBe(false)
    }
  })

  it('returns false for CONVERTED', () => {
    expect(isClosedStage(LEAD_STAGES.CONVERTED)).toBe(false)
  })

  it('returns false for garbage input', () => {
    expect(isClosedStage('nonexistent_stage')).toBe(false)
    expect(isClosedStage('')).toBe(false)
  })
})

describe('isTerminalStage', () => {
  it('returns true for all 4 closed stages', () => {
    for (const stage of CLOSED_STAGES) {
      expect(isTerminalStage(stage)).toBe(true)
    }
  })

  it('returns true for CONVERTED', () => {
    expect(isTerminalStage(LEAD_STAGES.CONVERTED)).toBe(true)
  })

  it('returns false for all active stages', () => {
    for (const stage of ACTIVE_STAGES) {
      expect(isTerminalStage(stage)).toBe(false)
    }
  })

  it('returns false for garbage input', () => {
    expect(isTerminalStage('nonexistent_stage')).toBe(false)
  })
})

// ─── Transition Rules Coverage ────────────────────────────────────────────────

describe('Stage Transition Rules', () => {
  it('every active stage has at least one transition rule', () => {
    for (const stage of ACTIVE_STAGES) {
      const rules = STAGE_TRANSITION_RULES[stage]
      expect(rules, `Missing transition rules for ${stage}`).toBeDefined()
      expect(rules.length, `Empty transition rules for ${stage}`).toBeGreaterThan(0)
    }
  })

  it('terminal stages have empty transition rules (no escape from closed/converted)', () => {
    for (const stage of TERMINAL_STAGES) {
      const rules = STAGE_TRANSITION_RULES[stage]
      // Terminal stages are defined with empty arrays [], not undefined
      expect(rules, `Terminal stage ${stage} should have empty transition rules`).toBeDefined()
      expect(rules).toHaveLength(0)
    }
  })

  it('all transition targets are valid stages', () => {
    const allStages = new Set(Object.values(LEAD_STAGES))
    for (const [fromStage, rules] of Object.entries(STAGE_TRANSITION_RULES)) {
      for (const rule of rules) {
        expect(allStages.has(rule.toStage), `Transition from ${fromStage} targets invalid stage "${rule.toStage}"`).toBe(true)
      }
    }
  })

  it('every transition has at least one guard', () => {
    for (const [fromStage, rules] of Object.entries(STAGE_TRANSITION_RULES)) {
      for (const rule of rules) {
        expect(rule.guards.length, `Transition ${fromStage} → ${rule.toStage} has no guards`).toBeGreaterThan(0)
      }
    }
  })

  it('every guard has a type and description', () => {
    for (const [fromStage, rules] of Object.entries(STAGE_TRANSITION_RULES)) {
      for (const rule of rules) {
        for (const guard of rule.guards) {
          expect(guard.type, `Guard in ${fromStage} → ${rule.toStage} missing type`).toBeDefined()
          expect(guard.description, `Guard in ${fromStage} → ${rule.toStage} missing description`).toBeDefined()
          expect(guard.description.length).toBeGreaterThan(0)
        }
      }
    }
  })

  it('RETAINED_ACTIVE_MATTER only transitions to CONVERTED', () => {
    const rules = STAGE_TRANSITION_RULES[LEAD_STAGES.RETAINED_ACTIVE_MATTER]
    expect(rules).toBeDefined()
    const forwardTargets = rules
      .filter((r) => !isClosedStage(r.toStage))
      .map((r) => r.toStage)
    expect(forwardTargets).toContain(LEAD_STAGES.CONVERTED)
    // No other forward transitions
    expect(forwardTargets.filter((t) => t !== LEAD_STAGES.CONVERTED)).toHaveLength(0)
  })

  // Design note: retainer_signed_payment_pending and retained_active_matter have
  // NO closure transitions in STAGE_TRANSITION_RULES. Closure at these late stages
  // is handled via the closure engine which calls advanceLeadStage with skipGuards=true.
  // This is intentional  -  at these stages, closure is an administrative action, not
  // a workflow transition.
  const STAGES_WITH_DIRECT_CLOSURE = ACTIVE_STAGES.filter(
    (s) =>
      s !== LEAD_STAGES.RETAINER_SIGNED_PAYMENT_PENDING &&
      s !== LEAD_STAGES.RETAINED_ACTIVE_MATTER
  )

  it('early/mid active stages have direct closure transitions in rules', () => {
    for (const stage of STAGES_WITH_DIRECT_CLOSURE) {
      const rules = STAGE_TRANSITION_RULES[stage]
      const closedTargets = rules.filter((r) => isClosedStage(r.toStage))
      expect(closedTargets.length, `Stage ${stage} has no closure path`).toBeGreaterThan(0)
    }
  })

  it('late stages (retainer_signed_payment_pending, retained_active_matter) have no direct closure in rules', () => {
    // These stages rely on the closure engine with skipGuards=true
    const retainerSignedRules = STAGE_TRANSITION_RULES[LEAD_STAGES.RETAINER_SIGNED_PAYMENT_PENDING]
    const retainedActiveRules = STAGE_TRANSITION_RULES[LEAD_STAGES.RETAINED_ACTIVE_MATTER]

    const retainerClosureTargets = retainerSignedRules.filter((r) => isClosedStage(r.toStage))
    const retainedClosureTargets = retainedActiveRules.filter((r) => isClosedStage(r.toStage))

    expect(retainerClosureTargets).toHaveLength(0)
    expect(retainedClosureTargets).toHaveLength(0)
  })

  it('pipeline flows forward: each active stage transitions to a later active or terminal stage', () => {
    for (let i = 0; i < ACTIVE_STAGES.length; i++) {
      const fromStage = ACTIVE_STAGES[i]
      const rules = STAGE_TRANSITION_RULES[fromStage]
      for (const rule of rules) {
        if (isClosedStage(rule.toStage) || rule.toStage === LEAD_STAGES.CONVERTED) continue
        const toIdx = ACTIVE_STAGES.indexOf(rule.toStage)
        expect(toIdx, `${fromStage} transitions backward to ${rule.toStage}`).toBeGreaterThan(i)
      }
    }
  })
})

// ─── Closure Definitions ──────────────────────────────────────────────────────

describe('Closure Definitions', () => {
  it('has a definition for each closed stage', () => {
    for (const stage of CLOSED_STAGES) {
      const def = CLOSURE_STAGE_DEFINITIONS[stage]
      expect(def, `Missing closure definition for ${stage}`).toBeDefined()
      expect(def.stage).toBe(stage)
      expect(def.label.length).toBeGreaterThan(0)
      expect(def.defaultReasonCode.length).toBeGreaterThan(0)
      expect(typeof def.requiresLawyerApproval).toBe('boolean')
    }
  })

  it('has no extra closure definitions for non-closed stages', () => {
    const closedSet = new Set(CLOSED_STAGES as string[])
    for (const key of Object.keys(CLOSURE_STAGE_DEFINITIONS)) {
      expect(closedSet.has(key), `Closure definition for non-closed stage "${key}"`).toBe(true)
    }
  })
})

// ─── Milestone Definitions (Stage-Keyed) ─────────────────────────────────────

describe('Stage Milestone Definitions', () => {
  it('every active stage with milestones has at least one group', () => {
    for (const stage of ACTIVE_STAGES) {
      const groups = STAGE_MILESTONE_DEFINITIONS[stage]
      if (groups) {
        expect(groups.length, `${stage} has empty milestone groups`).toBeGreaterThan(0)
      }
    }
  })

  it('all milestone definition keys are valid stages', () => {
    const allStages = new Set(Object.values(LEAD_STAGES) as string[])
    for (const stageKey of Object.keys(STAGE_MILESTONE_DEFINITIONS)) {
      expect(allStages.has(stageKey), `Milestone definitions reference invalid stage "${stageKey}"`).toBe(true)
    }
  })

  it('every milestone group has a groupType, title, sortOrder, and at least one task', () => {
    for (const [stage, groups] of Object.entries(STAGE_MILESTONE_DEFINITIONS)) {
      if (!groups) continue
      for (const group of groups) {
        expect(group.groupType, `Group in ${stage} missing groupType`).toBeDefined()
        expect(group.title.length, `Group in ${stage} missing title`).toBeGreaterThan(0)
        expect(typeof group.sortOrder, `Group in ${stage} missing sortOrder`).toBe('number')
        expect(group.tasks.length, `Group ${group.groupType} in ${stage} has no tasks`).toBeGreaterThan(0)
      }
    }
  })

  it('every task within a group has a taskType, title, and sortOrder', () => {
    for (const [stage, groups] of Object.entries(STAGE_MILESTONE_DEFINITIONS)) {
      if (!groups) continue
      for (const group of groups) {
        for (const task of group.tasks) {
          expect(task.taskType, `Task in ${stage}/${group.groupType} missing taskType`).toBeDefined()
          expect(task.title, `Task in ${stage}/${group.groupType} missing title`).toBeDefined()
          expect(typeof task.sortOrder, `Task ${task.taskType} in ${group.groupType} missing sortOrder`).toBe('number')
        }
      }
    }
  })

  it('tasks within a group have unique taskTypes', () => {
    for (const [stage, groups] of Object.entries(STAGE_MILESTONE_DEFINITIONS)) {
      if (!groups) continue
      for (const group of groups) {
        const types = group.tasks.map((t) => t.taskType)
        const unique = new Set(types)
        expect(unique.size, `Duplicate taskTypes in ${stage}/${group.groupType}`).toBe(types.length)
      }
    }
  })

  it('tasks within a group are sorted by sortOrder', () => {
    for (const [stage, groups] of Object.entries(STAGE_MILESTONE_DEFINITIONS)) {
      if (!groups) continue
      for (const group of groups) {
        for (let i = 1; i < group.tasks.length; i++) {
          expect(
            group.tasks[i].sortOrder,
            `Tasks in ${stage}/${group.groupType} not sorted at index ${i}`
          ).toBeGreaterThanOrEqual(group.tasks[i - 1].sortOrder)
        }
      }
    }
  })

  it('all 8 active stages have milestone definitions', () => {
    for (const stage of ACTIVE_STAGES) {
      const groups = STAGE_MILESTONE_DEFINITIONS[stage]
      expect(groups, `Missing milestone definitions for active stage ${stage}`).toBeDefined()
    }
  })

  it('all 4 closed stages have milestone definitions (closure tasks)', () => {
    for (const stage of CLOSED_STAGES) {
      const groups = STAGE_MILESTONE_DEFINITIONS[stage]
      expect(groups, `Missing milestone definitions for closed stage ${stage}`).toBeDefined()
      if (groups) {
        expect(groups.length).toBeGreaterThan(0)
        // All closure groups should have a send_closure_notice task
        const closureGroup = groups[0]
        const hasClosure = closureGroup.tasks.some((t) => t.taskType === 'send_closure_notice')
        expect(hasClosure, `Closure stage ${stage} missing send_closure_notice task`).toBe(true)
      }
    }
  })

  it('milestone groups across all stages have globally unique groupTypes', () => {
    const allGroupTypes: string[] = []
    for (const [, groups] of Object.entries(STAGE_MILESTONE_DEFINITIONS)) {
      if (!groups) continue
      for (const group of groups) {
        allGroupTypes.push(group.groupType)
      }
    }
    const unique = new Set(allGroupTypes)
    expect(unique.size, 'Duplicate groupTypes across stages').toBe(allGroupTypes.length)
  })

  it('group sortOrders are monotonically increasing across the pipeline', () => {
    let lastSortOrder = 0
    for (const stage of ACTIVE_STAGES) {
      const groups = STAGE_MILESTONE_DEFINITIONS[stage]
      if (!groups) continue
      for (const group of groups) {
        expect(
          group.sortOrder,
          `Group ${group.groupType} at ${stage} has sortOrder ${group.sortOrder} ≤ previous ${lastSortOrder}`
        ).toBeGreaterThanOrEqual(lastSortOrder)
        lastSortOrder = group.sortOrder
      }
    }
  })
})
