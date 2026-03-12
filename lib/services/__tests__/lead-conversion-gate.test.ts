/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Wave 6 — Conversion Gate Tests
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Proves:
 * - Each individual gate evaluates correctly (pass/fail)
 * - Gate enable/disable from workspace config is respected
 * - canConvert = true only when ALL enabled gates pass
 * - blockedReasons contain human-readable explanations
 * - "not already converted" gate is always enforced
 * - Structured GateResult format returned for all gates
 */

import { describe, it, expect } from 'vitest'
import { evaluateConversionGates, type ConversionGateResult } from '../lead-conversion-gate'
import { createMockSupabase } from '@/lib/test-utils/mock-supabase'

// ─── Config Fixture ──────────────────────────────────────────────────────────

function makeConfig(overrides: Record<string, boolean> = {}) {
  return {
    activeConversionGates: {
      conflict_cleared: true,
      retainer_signed: true,
      payment_received: true,
      intake_complete: true,
      id_verification: false,
      required_documents: false,
      ...overrides,
    },
  } as any
}

// ─── Helper: All Gates Passing ───────────────────────────────────────────────

function allPassingSupabase() {
  return createMockSupabase({
    leads: {
      selectData: { contact_id: 'c-1', conflict_status: 'cleared', status: 'active', converted_matter_id: null },
    },
    lead_retainer_packages: {
      selectData: { status: 'signed', signed_at: '2026-03-01', payment_status: 'paid' },
    },
    lead_intake_profiles: {
      selectData: { mandatory_fields_complete: true },
    },
  })
}

// ─── evaluateConversionGates ─────────────────────────────────────────────────

describe('evaluateConversionGates', () => {
  it('returns canConvert = true when all enabled gates pass', async () => {
    const supabase = allPassingSupabase()
    const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', makeConfig())

    expect(result.canConvert).toBe(true)
    expect(result.blockedReasons).toHaveLength(0)
    expect(result.gateResults.length).toBeGreaterThan(0)
  })

  it('returns canConvert = false when conflict not cleared', async () => {
    const supabase = createMockSupabase({
      leads: {
        selectData: { contact_id: 'c-1', conflict_status: 'pending', status: 'active', converted_matter_id: null },
      },
      lead_retainer_packages: {
        selectData: { status: 'signed', signed_at: '2026-03-01', payment_status: 'paid' },
      },
      lead_intake_profiles: {
        selectData: { mandatory_fields_complete: true },
      },
    })

    const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', makeConfig())
    expect(result.canConvert).toBe(false)
    expect(result.blockedReasons.some((r) => r.toLowerCase().includes('conflict'))).toBe(true)
  })

  it('returns canConvert = false when retainer not signed', async () => {
    const supabase = createMockSupabase({
      leads: {
        selectData: { contact_id: 'c-1', conflict_status: 'cleared', status: 'active', converted_matter_id: null },
      },
      lead_retainer_packages: {
        selectData: { status: 'sent', signed_at: null, payment_status: 'pending' },
      },
      lead_intake_profiles: {
        selectData: { mandatory_fields_complete: true },
      },
    })

    const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', makeConfig())
    expect(result.canConvert).toBe(false)
    expect(result.blockedReasons.some((r) => r.toLowerCase().includes('retainer') || r.toLowerCase().includes('signed'))).toBe(true)
  })

  it('returns canConvert = false when payment not received', async () => {
    const supabase = createMockSupabase({
      leads: {
        selectData: { contact_id: 'c-1', conflict_status: 'cleared', status: 'active', converted_matter_id: null },
      },
      lead_retainer_packages: {
        selectData: { status: 'signed', signed_at: '2026-03-01', payment_status: 'pending' },
      },
      lead_intake_profiles: {
        selectData: { mandatory_fields_complete: true },
      },
    })

    const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', makeConfig())
    expect(result.canConvert).toBe(false)
    expect(result.blockedReasons.some((r) => r.toLowerCase().includes('payment'))).toBe(true)
  })

  it('returns canConvert = false when intake not complete', async () => {
    const supabase = createMockSupabase({
      leads: {
        selectData: { contact_id: 'c-1', conflict_status: 'cleared', status: 'active', converted_matter_id: null },
      },
      lead_retainer_packages: {
        selectData: { status: 'signed', signed_at: '2026-03-01', payment_status: 'paid' },
      },
      lead_intake_profiles: {
        selectData: { mandatory_fields_complete: false },
      },
    })

    const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', makeConfig())
    expect(result.canConvert).toBe(false)
    expect(result.blockedReasons.some((r) => r.toLowerCase().includes('intake'))).toBe(true)
  })

  it('returns canConvert = false when lead already converted', async () => {
    const supabase = createMockSupabase({
      leads: {
        selectData: { contact_id: 'c-1', conflict_status: 'cleared', status: 'converted', converted_matter_id: 'matter-1' },
      },
      lead_retainer_packages: {
        selectData: { status: 'signed', signed_at: '2026-03-01', payment_status: 'paid' },
      },
      lead_intake_profiles: {
        selectData: { mandatory_fields_complete: true },
      },
    })

    const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', makeConfig())
    expect(result.canConvert).toBe(false)
    expect(result.blockedReasons.some((r) => r.toLowerCase().includes('already been converted'))).toBe(true)
  })

  // ─── Gate Enable/Disable ─────────────────────────────────────────────────

  it('skips disabled gates (id_verification disabled by default)', async () => {
    const supabase = allPassingSupabase()
    const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', makeConfig())

    const idGate = result.gateResults.find((g) => g.gate === 'id_verification')
    expect(idGate).toBeUndefined() // Disabled gates should not be in results
  })

  it('evaluates id_verification when enabled', async () => {
    const supabase = createMockSupabase({
      leads: {
        selectData: { contact_id: 'c-1', conflict_status: 'cleared', status: 'active', converted_matter_id: null },
      },
      lead_retainer_packages: {
        selectData: {
          status: 'signed', signed_at: '2026-03-01', payment_status: 'paid',
          id_verification_status: 'not_verified',
        },
      },
      lead_intake_profiles: {
        selectData: { mandatory_fields_complete: true },
      },
    })

    const result = await evaluateConversionGates(
      supabase,
      'lead-1',
      'tenant-1',
      makeConfig({ id_verification: true })
    )

    expect(result.canConvert).toBe(false)
    const idGate = result.gateResults.find((g) => g.gate === 'id_verification')
    expect(idGate).toBeDefined()
    expect(idGate!.passed).toBe(false)
  })

  // ─── Multiple Blockers ─────────────────────────────────────────────────

  it('accumulates multiple blocked reasons when multiple gates fail', async () => {
    const supabase = createMockSupabase({
      leads: {
        selectData: { contact_id: 'c-1', conflict_status: 'pending', status: 'active', converted_matter_id: null },
      },
      lead_retainer_packages: {
        selectData: { status: 'draft', signed_at: null, payment_status: 'pending' },
      },
      lead_intake_profiles: {
        selectData: { mandatory_fields_complete: false },
      },
    })

    const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', makeConfig())
    expect(result.canConvert).toBe(false)
    // Should have at least 3 blocked reasons: conflict, retainer, payment, intake
    expect(result.blockedReasons.length).toBeGreaterThanOrEqual(3)
  })

  // ─── "Not Already Converted" is Always Enforced ─────────────────────────

  it('"not already converted" gate is always present even when all gates disabled', async () => {
    const supabase = createMockSupabase({
      leads: {
        selectData: { status: 'active', converted_matter_id: null },
      },
    })

    const disableAll = makeConfig({
      conflict_cleared: false,
      retainer_signed: false,
      payment_received: false,
      intake_complete: false,
    })

    const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', disableAll)
    const notConvertedGate = result.gateResults.find((g) => g.gate === 'not_already_converted')
    expect(notConvertedGate).toBeDefined()
    expect(notConvertedGate!.enabled).toBe(true) // Always enforced
  })

  // ─── GateResult Structure ──────────────────────────────────────────────

  it('gate results have correct structure', async () => {
    const supabase = allPassingSupabase()
    const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', makeConfig())

    for (const gate of result.gateResults) {
      expect(gate.gate).toBeTruthy()
      expect(gate.label).toBeTruthy()
      expect(typeof gate.passed).toBe('boolean')
      expect(typeof gate.enabled).toBe('boolean')
      if (!gate.passed && gate.enabled) {
        expect(gate.reason).toBeTruthy()
      }
    }
  })

  // ─── Accepted Statuses ─────────────────────────────────────────────────

  it('conflict gate passes for cleared, cleared_by_lawyer, waiver_obtained', async () => {
    for (const status of ['cleared', 'cleared_by_lawyer', 'waiver_obtained']) {
      const supabase = createMockSupabase({
        leads: {
          selectData: { contact_id: 'c-1', conflict_status: status, status: 'active', converted_matter_id: null },
        },
        lead_retainer_packages: {
          selectData: { status: 'signed', signed_at: '2026-03-01', payment_status: 'paid' },
        },
        lead_intake_profiles: {
          selectData: { mandatory_fields_complete: true },
        },
      })

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', makeConfig())
      const conflictGate = result.gateResults.find((g) => g.gate === 'conflict_cleared')
      expect(conflictGate?.passed, `Conflict status "${status}" should pass`).toBe(true)
    }
  })

  it('retainer gate passes for signed, payment_pending, fully_retained', async () => {
    for (const status of ['signed', 'payment_pending', 'fully_retained']) {
      const supabase = createMockSupabase({
        leads: {
          selectData: { contact_id: 'c-1', conflict_status: 'cleared', status: 'active', converted_matter_id: null },
        },
        lead_retainer_packages: {
          selectData: { status, signed_at: '2026-03-01', payment_status: 'paid' },
        },
        lead_intake_profiles: {
          selectData: { mandatory_fields_complete: true },
        },
      })

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', makeConfig())
      const retainerGate = result.gateResults.find((g) => g.gate === 'retainer_signed')
      expect(retainerGate?.passed, `Retainer status "${status}" should pass`).toBe(true)
    }
  })

  it('payment gate passes for paid and waived', async () => {
    for (const paymentStatus of ['paid', 'waived']) {
      const supabase = createMockSupabase({
        leads: {
          selectData: { contact_id: 'c-1', conflict_status: 'cleared', status: 'active', converted_matter_id: null },
        },
        lead_retainer_packages: {
          selectData: { status: 'signed', signed_at: '2026-03-01', payment_status: paymentStatus },
        },
        lead_intake_profiles: {
          selectData: { mandatory_fields_complete: true },
        },
      })

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', makeConfig())
      const paymentGate = result.gateResults.find((g) => g.gate === 'payment_received')
      expect(paymentGate?.passed, `Payment status "${paymentStatus}" should pass`).toBe(true)
    }
  })
})
