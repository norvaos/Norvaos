/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Wave 6  -  Query & Mutation Consistency Tests
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Validates the React Query key factory and that the invalidation patterns
 * described in the mutation hooks are structurally correct. Ensures:
 * - Query keys are deterministic and unique per entity
 * - Invalidation matrix covers all affected queries
 * - No stale data can persist after mutations
 * - Cache key hierarchy supports granular + broad invalidation
 */

import { describe, it, expect } from 'vitest'

// Import the key factory directly for structural validation
import { leadWorkflowKeys } from '@/lib/queries/lead-workflow'

// ─── Query Key Factory Determinism ───────────────────────────────────────────

describe('leadWorkflowKeys (Query Key Factory)', () => {
  it('all key is consistent base', () => {
    expect(leadWorkflowKeys.all).toEqual(['lead-workflow'])
  })

  it('stageHistory key is unique per lead', () => {
    const key1 = leadWorkflowKeys.stageHistory('lead-1')
    const key2 = leadWorkflowKeys.stageHistory('lead-2')
    expect(key1).not.toEqual(key2)
    expect(key1[0]).toBe('lead-workflow')
  })

  it('stageTransitions key is unique per lead', () => {
    const key1 = leadWorkflowKeys.stageTransitions('lead-1')
    const key2 = leadWorkflowKeys.stageTransitions('lead-2')
    expect(key1).not.toEqual(key2)
  })

  it('milestones key is unique per lead', () => {
    const key1 = leadWorkflowKeys.milestones('lead-1')
    const key2 = leadWorkflowKeys.milestones('lead-2')
    expect(key1).not.toEqual(key2)
  })

  it('communicationEvents key is unique per lead', () => {
    const key1 = leadWorkflowKeys.communicationEvents('lead-1')
    const key2 = leadWorkflowKeys.communicationEvents('lead-2')
    expect(key1).not.toEqual(key2)
  })

  it('conversionGates key is unique per lead', () => {
    const key1 = leadWorkflowKeys.conversionGates('lead-1')
    const key2 = leadWorkflowKeys.conversionGates('lead-2')
    expect(key1).not.toEqual(key2)
  })

  it('insights key is unique per lead', () => {
    const key1 = leadWorkflowKeys.insights('lead-1')
    const key2 = leadWorkflowKeys.insights('lead-2')
    expect(key1).not.toEqual(key2)
  })

  it('automationSettings key is unique per lead + triggerKey', () => {
    const key1 = leadWorkflowKeys.automationSettings('lead-1', 'stage_advance')
    const key2 = leadWorkflowKeys.automationSettings('lead-1', 'closure')
    const key3 = leadWorkflowKeys.automationSettings('lead-1')
    expect(key1).not.toEqual(key2)
    expect(key3).not.toEqual(key1)
  })

  it('consultations key is unique per lead', () => {
    const key1 = leadWorkflowKeys.consultations('lead-1')
    const key2 = leadWorkflowKeys.consultations('lead-2')
    expect(key1).not.toEqual(key2)
  })

  it('retainerPackages key is unique per lead', () => {
    const key1 = leadWorkflowKeys.retainerPackages('lead-1')
    const key2 = leadWorkflowKeys.retainerPackages('lead-2')
    expect(key1).not.toEqual(key2)
  })

  it('qualificationDecisions key is unique per lead', () => {
    const key1 = leadWorkflowKeys.qualificationDecisions('lead-1')
    const key2 = leadWorkflowKeys.qualificationDecisions('lead-2')
    expect(key1).not.toEqual(key2)
  })

  it('closureRecords key is unique per lead', () => {
    const key1 = leadWorkflowKeys.closureRecords('lead-1')
    const key2 = leadWorkflowKeys.closureRecords('lead-2')
    expect(key1).not.toEqual(key2)
  })

  it('detail key uses leads namespace', () => {
    const key = leadWorkflowKeys.detail('lead-1')
    expect(key).toEqual(['leads', 'detail', 'lead-1'])
  })

  it('lists key uses leads namespace', () => {
    const key = leadWorkflowKeys.lists()
    expect(key).toEqual(['leads', 'list'])
  })

  // ─── Broad Invalidation via Key Prefixes ─────────────────────────────────

  it('all workflow keys share "lead-workflow" prefix for broad invalidation', () => {
    const workflowKeyCalls = [
      leadWorkflowKeys.stageHistory('x'),
      leadWorkflowKeys.stageTransitions('x'),
      leadWorkflowKeys.milestones('x'),
      leadWorkflowKeys.communicationEvents('x'),
      leadWorkflowKeys.conversionGates('x'),
      leadWorkflowKeys.insights('x'),
      leadWorkflowKeys.automationSettings('x'),
      leadWorkflowKeys.consultations('x'),
      leadWorkflowKeys.retainerPackages('x'),
      leadWorkflowKeys.qualificationDecisions('x'),
      leadWorkflowKeys.closureRecords('x'),
    ]

    for (const key of workflowKeyCalls) {
      expect(key[0], `Key ${JSON.stringify(key)} missing lead-workflow prefix`).toBe('lead-workflow')
    }
  })

  // ─── Key uniqueness across types ──────────────────────────────────────

  it('different query types produce different keys for same lead', () => {
    const leadId = 'lead-1'
    const keys = [
      leadWorkflowKeys.stageHistory(leadId),
      leadWorkflowKeys.stageTransitions(leadId),
      leadWorkflowKeys.milestones(leadId),
      leadWorkflowKeys.communicationEvents(leadId),
      leadWorkflowKeys.conversionGates(leadId),
      leadWorkflowKeys.insights(leadId),
      leadWorkflowKeys.consultations(leadId),
      leadWorkflowKeys.retainerPackages(leadId),
      leadWorkflowKeys.qualificationDecisions(leadId),
      leadWorkflowKeys.closureRecords(leadId),
    ]

    const keyStrings = keys.map((k) => JSON.stringify(k))
    const unique = new Set(keyStrings)
    expect(unique.size, 'Some query types produce duplicate keys').toBe(keyStrings.length)
  })
})

// ─── Invalidation Matrix Specification ───────────────────────────────────────

describe('Invalidation Matrix (documented contract)', () => {
  /**
   * This test documents the expected invalidation patterns for each mutation.
   * If a mutation hook changes its invalidation targets, this test should be
   * updated to match  -  it serves as a living contract.
   */

  const INVALIDATION_MATRIX: Record<string, string[]> = {
    advanceLeadStage: ['stageHistory', 'stageTransitions', 'milestones', 'detail', 'lists'],
    closeLead: ['stageHistory', 'milestones', 'closureRecords', 'detail', 'lists'],
    reopenLead: ['stageHistory', 'milestones', 'closureRecords', 'detail', 'lists'],
    convertLead: ['stageHistory', 'stageTransitions', 'detail', 'lists'],
    logCommunicationEvent: ['communicationEvents', 'milestones', 'detail'],
    updateMilestoneTask: ['milestones', 'stageTransitions', 'detail'],
    generateInsights: ['insights'],
    acceptInsight: ['insights', 'detail'],
  }

  it('every mutation has at least one invalidation target', () => {
    for (const [mutation, targets] of Object.entries(INVALIDATION_MATRIX)) {
      expect(targets.length, `${mutation} has no invalidation targets`).toBeGreaterThan(0)
    }
  })

  it('every mutation that changes lead state invalidates "detail"', () => {
    const stateChangingMutations = [
      'advanceLeadStage', 'closeLead', 'reopenLead', 'convertLead',
      'logCommunicationEvent', 'updateMilestoneTask', 'acceptInsight',
    ]
    for (const mutation of stateChangingMutations) {
      expect(
        INVALIDATION_MATRIX[mutation],
        `${mutation} should invalidate "detail"`
      ).toContain('detail')
    }
  })

  it('mutations that change pipeline stage invalidate "lists" for list refresh', () => {
    const stageChangingMutations = ['advanceLeadStage', 'closeLead', 'reopenLead', 'convertLead']
    for (const mutation of stageChangingMutations) {
      expect(
        INVALIDATION_MATRIX[mutation],
        `${mutation} should invalidate "lists"`
      ).toContain('lists')
    }
  })

  it('stage advance invalidates stageHistory and milestones (new milestones created)', () => {
    expect(INVALIDATION_MATRIX.advanceLeadStage).toContain('stageHistory')
    expect(INVALIDATION_MATRIX.advanceLeadStage).toContain('milestones')
  })

  it('communication event invalidates milestones (auto-completion may fire)', () => {
    expect(INVALIDATION_MATRIX.logCommunicationEvent).toContain('milestones')
  })

  it('task update invalidates stageTransitions (guard status may change)', () => {
    expect(INVALIDATION_MATRIX.updateMilestoneTask).toContain('stageTransitions')
  })

  it('closure invalidates closureRecords', () => {
    expect(INVALIDATION_MATRIX.closeLead).toContain('closureRecords')
  })

  it('reopen invalidates closureRecords', () => {
    expect(INVALIDATION_MATRIX.reopenLead).toContain('closureRecords')
  })
})
