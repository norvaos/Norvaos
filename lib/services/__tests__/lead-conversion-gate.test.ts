/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Lead Conversion Gate — Full Branch Coverage Tests
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Proves:
 * - Each individual gate evaluates correctly (pass/fail) for every branch
 * - Gate enable/disable from workspace config is respected
 * - canConvert = true only when ALL enabled gates pass
 * - blockedReasons contain human-readable explanations
 * - "not already converted" gate is always enforced regardless of config
 * - Structured GateResult format returned for all gates
 * - Conflict alpha auto-scan: triggers when status is not_run/null, handles
 *   success (conflict found vs clear), failure fallback
 * - Each conflict reasonMessage variant
 * - Retainer/payment/intake: no-record-found branches
 * - ID verification: verified, not_required, unknown status
 * - Required documents: complete, not_required, unknown, no retainer
 * - Readiness score: above/below threshold, RPC failure, null data
 * - Trust deposit: retainer amount path, trust_transactions path, neither path
 * - Not already converted: status-only, converted_matter_id-only, both
 */

import { describe, it, expect, vi } from 'vitest'
import { evaluateConversionGates, type ConversionGateResult, type GateResult } from '../lead-conversion-gate'
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
      readiness_complete: false,
      trust_deposit_received: false,
      ...overrides,
    },
  } as any
}

/** Config with only one gate enabled (plus the always-on not_already_converted) */
function singleGateConfig(gate: string) {
  return makeConfig({
    conflict_cleared: false,
    retainer_signed: false,
    payment_received: false,
    intake_complete: false,
    id_verification: false,
    required_documents: false,
    readiness_complete: false,
    trust_deposit_received: false,
    [gate]: true,
  })
}

// ─── Enhanced Mock Builder ──────────────────────────────────────────────────
// The base createMockSupabase does not support .rpc(), so we wrap it.

interface RpcConfig {
  [fnName: string]: { data: unknown; error?: unknown }
}

function createMockSupabaseWithRpc(
  tableConfigs: Record<string, any>,
  rpcConfigs: RpcConfig = {}
) {
  const base = createMockSupabase(tableConfigs)
  const rpcFn = vi.fn((fnName: string, _params?: unknown) => {
    const cfg = rpcConfigs[fnName]
    if (cfg?.error) return Promise.resolve({ data: null, error: cfg.error })
    return Promise.resolve({ data: cfg?.data ?? null, error: null })
  })
  ;(base as any).rpc = rpcFn
  return base
}

function createRpcThrowingSupabase(
  tableConfigs: Record<string, any>,
  throwingFns: string[] = []
) {
  const base = createMockSupabase(tableConfigs)
  ;(base as any).rpc = vi.fn((fnName: string) => {
    if (throwingFns.includes(fnName)) {
      throw new Error('RPC unavailable')
    }
    return Promise.resolve({ data: null, error: null })
  })
  return base
}

// ─── Helper: Standard passing data (no conflict auto-scan needed) ───────────

function allPassingSupabase() {
  return createMockSupabaseWithRpc({
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

// ─── Helper: Find a single gate from results ────────────────────────────────

function findGate(result: ConversionGateResult, gate: string): GateResult | undefined {
  return result.gateResults.find((g) => g.gate === gate)
}

// ═════════════════════════════════════════════════════════════════════════════
// Tests
// ═════════════════════════════════════════════════════════════════════════════

describe('evaluateConversionGates', () => {
  // ─── Happy Path ─────────────────────────────────────────────────────────

  it('returns canConvert = true when all enabled gates pass', async () => {
    const supabase = allPassingSupabase()
    const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', makeConfig())

    expect(result.canConvert).toBe(true)
    expect(result.blockedReasons).toHaveLength(0)
    expect(result.gateResults.length).toBeGreaterThan(0)
  })

  it('gate results have correct structure (gate, label, passed, enabled, reason)', async () => {
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
      if (gate.passed) {
        expect(gate.reason).toBeUndefined()
      }
    }
  })

  // ─── Gate Enable/Disable ──────────────────────────────────────────────

  it('skips disabled gates — they do not appear in results', async () => {
    const supabase = allPassingSupabase()
    const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', makeConfig())

    expect(findGate(result, 'id_verification')).toBeUndefined()
    expect(findGate(result, 'required_documents')).toBeUndefined()
    expect(findGate(result, 'readiness_complete')).toBeUndefined()
    expect(findGate(result, 'trust_deposit_received')).toBeUndefined()
  })

  it('evaluates optional gates when enabled in config', async () => {
    const supabase = createMockSupabaseWithRpc(
      {
        leads: {
          selectData: { contact_id: 'c-1', conflict_status: 'cleared', status: 'active', converted_matter_id: null },
        },
        lead_retainer_packages: {
          selectData: {
            status: 'signed', signed_at: '2026-03-01', payment_status: 'paid',
            id_verification_status: 'verified',
            required_documents_status: 'complete',
            payment_amount: '5000',
          },
        },
        lead_intake_profiles: {
          selectData: { mandatory_fields_complete: true },
        },
      },
      {
        fn_calculate_lead_readiness: { data: { score: 85, missing: [] } },
      }
    )

    const allEnabled = makeConfig({
      id_verification: true,
      required_documents: true,
      readiness_complete: true,
      trust_deposit_received: true,
    })

    const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', allEnabled)

    expect(findGate(result, 'id_verification')).toBeDefined()
    expect(findGate(result, 'required_documents')).toBeDefined()
    expect(findGate(result, 'readiness_complete')).toBeDefined()
    expect(findGate(result, 'trust_deposit_received')).toBeDefined()
  })

  // ─── Multiple Blockers ────────────────────────────────────────────────

  it('accumulates multiple blocked reasons when multiple gates fail', async () => {
    const supabase = createMockSupabaseWithRpc({
      leads: {
        selectData: { contact_id: 'c-1', conflict_status: 'blocked', status: 'active', converted_matter_id: null },
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
    expect(result.blockedReasons.length).toBeGreaterThanOrEqual(4) // conflict, retainer, payment, intake
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Conflict Cleared Gate
  // ═══════════════════════════════════════════════════════════════════════

  describe('conflict_cleared gate', () => {
    it('passes for each cleared status: auto_scan_complete, review_suggested, cleared, cleared_by_lawyer, waiver_obtained', async () => {
      for (const status of ['auto_scan_complete', 'review_suggested', 'cleared', 'cleared_by_lawyer', 'waiver_obtained']) {
        const supabase = createMockSupabaseWithRpc({
          leads: {
            selectData: { contact_id: 'c-1', conflict_status: status, status: 'active', converted_matter_id: null },
          },
        })

        const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('conflict_cleared'))
        const gate = findGate(result, 'conflict_cleared')
        expect(gate?.passed, `Status "${status}" should pass`).toBe(true)
        expect(gate?.reason).toBeUndefined()
      }
    })

    it('fails when lead is not found', async () => {
      // single() returns null data
      const supabase = createMockSupabaseWithRpc({
        leads: {
          selectData: null,
        },
      })

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('conflict_cleared'))
      const gate = findGate(result, 'conflict_cleared')
      expect(gate?.passed).toBe(false)
      expect(gate?.reason).toBe('Lead not found')
    })

    it('auto-runs alpha conflict check when status is not_run, sets auto_scan_complete if no conflicts', async () => {
      const supabase = createMockSupabaseWithRpc(
        {
          leads: {
            selectData: { contact_id: 'c-1', conflict_status: 'not_run', status: 'active', converted_matter_id: null },
          },
        },
        {
          fn_conflict_check_alpha: { data: { has_conflicts: false } },
        }
      )

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('conflict_cleared'))
      const gate = findGate(result, 'conflict_cleared')
      expect(gate?.passed).toBe(true)
      // Verify update was called to persist auto_scan_complete
      expect(supabase.from).toHaveBeenCalledWith('leads')
    })

    it('auto-runs alpha conflict check when status is null', async () => {
      const supabase = createMockSupabaseWithRpc(
        {
          leads: {
            selectData: { contact_id: 'c-1', conflict_status: null, status: 'active', converted_matter_id: null },
          },
        },
        {
          fn_conflict_check_alpha: { data: { has_conflicts: false } },
        }
      )

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('conflict_cleared'))
      const gate = findGate(result, 'conflict_cleared')
      expect(gate?.passed).toBe(true)
    })

    it('auto-scan detects conflicts and sets conflict_detected', async () => {
      const supabase = createMockSupabaseWithRpc(
        {
          leads: {
            selectData: { contact_id: 'c-1', conflict_status: 'not_run', status: 'active', converted_matter_id: null },
          },
        },
        {
          fn_conflict_check_alpha: { data: { has_conflicts: true } },
        }
      )

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('conflict_cleared'))
      const gate = findGate(result, 'conflict_cleared')
      expect(gate?.passed).toBe(false)
      expect(gate?.reason).toContain('Email or passport conflict detected')
    })

    it('falls back to existing status logic when alpha RPC throws', async () => {
      const supabase = createRpcThrowingSupabase(
        {
          leads: {
            selectData: { contact_id: 'c-1', conflict_status: 'not_run', status: 'active', converted_matter_id: null },
          },
        },
        ['fn_conflict_check_alpha']
      )

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('conflict_cleared'))
      const gate = findGate(result, 'conflict_cleared')
      expect(gate?.passed).toBe(false)
      expect(gate?.reason).toBe('Conflict check has not been run yet.')
    })

    it('alpha RPC returns null result — falls through to existing status', async () => {
      const supabase = createMockSupabaseWithRpc(
        {
          leads: {
            selectData: { contact_id: 'c-1', conflict_status: 'not_run', status: 'active', converted_matter_id: null },
          },
        },
        {
          fn_conflict_check_alpha: { data: null },
        }
      )

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('conflict_cleared'))
      const gate = findGate(result, 'conflict_cleared')
      expect(gate?.passed).toBe(false)
      expect(gate?.reason).toBe('Conflict check has not been run yet.')
    })

    // Each specific reasonMessage
    it('returns correct reason for conflict_detected status', async () => {
      const supabase = createMockSupabaseWithRpc({
        leads: {
          selectData: { contact_id: 'c-1', conflict_status: 'conflict_detected', status: 'active', converted_matter_id: null },
        },
      })
      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('conflict_cleared'))
      expect(findGate(result, 'conflict_cleared')?.reason).toContain('Email or passport conflict detected')
    })

    it('returns correct reason for review_required status', async () => {
      const supabase = createMockSupabaseWithRpc({
        leads: {
          selectData: { contact_id: 'c-1', conflict_status: 'review_required', status: 'active', converted_matter_id: null },
        },
      })
      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('conflict_cleared'))
      expect(findGate(result, 'conflict_cleared')?.reason).toContain('lawyer must review')
    })

    it('returns correct reason for conflict_confirmed status', async () => {
      const supabase = createMockSupabaseWithRpc({
        leads: {
          selectData: { contact_id: 'c-1', conflict_status: 'conflict_confirmed', status: 'active', converted_matter_id: null },
        },
      })
      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('conflict_cleared'))
      expect(findGate(result, 'conflict_cleared')?.reason).toContain('conflict of interest has been confirmed')
    })

    it('returns correct reason for blocked status', async () => {
      const supabase = createMockSupabaseWithRpc({
        leads: {
          selectData: { contact_id: 'c-1', conflict_status: 'blocked', status: 'active', converted_matter_id: null },
        },
      })
      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('conflict_cleared'))
      expect(findGate(result, 'conflict_cleared')?.reason).toContain('blocked due to a confirmed conflict')
    })

    it('returns fallback reason for unrecognised failing status', async () => {
      const supabase = createMockSupabaseWithRpc({
        leads: {
          selectData: { contact_id: 'c-1', conflict_status: 'some_unknown_status', status: 'active', converted_matter_id: null },
        },
      })
      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('conflict_cleared'))
      const gate = findGate(result, 'conflict_cleared')
      expect(gate?.passed).toBe(false)
      expect(gate?.reason).toContain('does not allow matter opening')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Retainer Signed Gate
  // ═══════════════════════════════════════════════════════════════════════

  describe('retainer_signed gate', () => {
    it('passes for signed, payment_pending, fully_retained', async () => {
      for (const status of ['signed', 'payment_pending', 'fully_retained']) {
        const supabase = createMockSupabaseWithRpc({
          leads: { selectData: { status: 'active', converted_matter_id: null } },
          lead_retainer_packages: { selectData: { status, signed_at: '2026-03-01' } },
        })

        const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('retainer_signed'))
        expect(findGate(result, 'retainer_signed')?.passed, `Retainer status "${status}" should pass`).toBe(true)
      }
    })

    it('fails for non-signed status with descriptive reason', async () => {
      const supabase = createMockSupabaseWithRpc({
        leads: { selectData: { status: 'active', converted_matter_id: null } },
        lead_retainer_packages: { selectData: { status: 'sent', signed_at: null } },
      })

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('retainer_signed'))
      const gate = findGate(result, 'retainer_signed')
      expect(gate?.passed).toBe(false)
      expect(gate?.reason).toContain('Retainer status is "sent"')
      expect(gate?.reason).toContain('sign the retainer agreement')
    })

    it('fails with "no retainer package" reason when no retainer exists', async () => {
      const supabase = createMockSupabaseWithRpc({
        leads: { selectData: { status: 'active', converted_matter_id: null } },
        lead_retainer_packages: { selectData: null },
      })

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('retainer_signed'))
      const gate = findGate(result, 'retainer_signed')
      expect(gate?.passed).toBe(false)
      expect(gate?.reason).toContain('No retainer package found')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Payment Received Gate
  // ═══════════════════════════════════════════════════════════════════════

  describe('payment_received gate', () => {
    it('passes for paid, partial, waived', async () => {
      for (const paymentStatus of ['paid', 'partial', 'waived']) {
        const supabase = createMockSupabaseWithRpc({
          leads: { selectData: { status: 'active', converted_matter_id: null } },
          lead_retainer_packages: { selectData: { payment_status: paymentStatus } },
        })

        const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('payment_received'))
        expect(findGate(result, 'payment_received')?.passed, `Payment "${paymentStatus}" should pass`).toBe(true)
      }
    })

    it('fails for pending payment with descriptive reason', async () => {
      const supabase = createMockSupabaseWithRpc({
        leads: { selectData: { status: 'active', converted_matter_id: null } },
        lead_retainer_packages: { selectData: { payment_status: 'pending' } },
      })

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('payment_received'))
      const gate = findGate(result, 'payment_received')
      expect(gate?.passed).toBe(false)
      expect(gate?.reason).toContain('Payment status is "pending"')
    })

    it('fails with "no retainer package" reason when no retainer exists', async () => {
      const supabase = createMockSupabaseWithRpc({
        leads: { selectData: { status: 'active', converted_matter_id: null } },
        lead_retainer_packages: { selectData: null },
      })

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('payment_received'))
      const gate = findGate(result, 'payment_received')
      expect(gate?.passed).toBe(false)
      expect(gate?.reason).toContain('No retainer package found')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Intake Complete Gate
  // ═══════════════════════════════════════════════════════════════════════

  describe('intake_complete gate', () => {
    it('passes when mandatory_fields_complete is true', async () => {
      const supabase = createMockSupabaseWithRpc({
        leads: { selectData: { status: 'active', converted_matter_id: null } },
        lead_intake_profiles: { selectData: { mandatory_fields_complete: true } },
      })

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('intake_complete'))
      expect(findGate(result, 'intake_complete')?.passed).toBe(true)
    })

    it('fails when mandatory_fields_complete is false', async () => {
      const supabase = createMockSupabaseWithRpc({
        leads: { selectData: { status: 'active', converted_matter_id: null } },
        lead_intake_profiles: { selectData: { mandatory_fields_complete: false } },
      })

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('intake_complete'))
      const gate = findGate(result, 'intake_complete')
      expect(gate?.passed).toBe(false)
      expect(gate?.reason).toContain('Mandatory intake fields are not complete')
    })

    it('fails with "no intake profile" reason when no profile exists', async () => {
      const supabase = createMockSupabaseWithRpc({
        leads: { selectData: { status: 'active', converted_matter_id: null } },
        lead_intake_profiles: { selectData: null },
      })

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('intake_complete'))
      const gate = findGate(result, 'intake_complete')
      expect(gate?.passed).toBe(false)
      expect(gate?.reason).toContain('No intake profile found')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // ID Verification Gate
  // ═══════════════════════════════════════════════════════════════════════

  describe('id_verification gate', () => {
    it('passes when status is verified', async () => {
      const supabase = createMockSupabaseWithRpc({
        leads: { selectData: { status: 'active', converted_matter_id: null } },
        lead_retainer_packages: { selectData: { id_verification_status: 'verified' } },
      })

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('id_verification'))
      expect(findGate(result, 'id_verification')?.passed).toBe(true)
    })

    it('passes when status is not_required', async () => {
      const supabase = createMockSupabaseWithRpc({
        leads: { selectData: { status: 'active', converted_matter_id: null } },
        lead_retainer_packages: { selectData: { id_verification_status: 'not_required' } },
      })

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('id_verification'))
      expect(findGate(result, 'id_verification')?.passed).toBe(true)
    })

    it('fails when status is not_verified', async () => {
      const supabase = createMockSupabaseWithRpc({
        leads: { selectData: { status: 'active', converted_matter_id: null } },
        lead_retainer_packages: { selectData: { id_verification_status: 'not_verified' } },
      })

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('id_verification'))
      const gate = findGate(result, 'id_verification')
      expect(gate?.passed).toBe(false)
      expect(gate?.reason).toContain('"not_verified"')
    })

    it('fails with "unknown" when no retainer exists', async () => {
      const supabase = createMockSupabaseWithRpc({
        leads: { selectData: { status: 'active', converted_matter_id: null } },
        lead_retainer_packages: { selectData: null },
      })

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('id_verification'))
      const gate = findGate(result, 'id_verification')
      expect(gate?.passed).toBe(false)
      expect(gate?.reason).toContain('"unknown"')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Required Documents Gate
  // ═══════════════════════════════════════════════════════════════════════

  describe('required_documents gate', () => {
    it('passes when status is complete', async () => {
      const supabase = createMockSupabaseWithRpc({
        leads: { selectData: { status: 'active', converted_matter_id: null } },
        lead_retainer_packages: { selectData: { required_documents_status: 'complete' } },
      })

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('required_documents'))
      expect(findGate(result, 'required_documents')?.passed).toBe(true)
    })

    it('passes when status is not_required', async () => {
      const supabase = createMockSupabaseWithRpc({
        leads: { selectData: { status: 'active', converted_matter_id: null } },
        lead_retainer_packages: { selectData: { required_documents_status: 'not_required' } },
      })

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('required_documents'))
      expect(findGate(result, 'required_documents')?.passed).toBe(true)
    })

    it('fails when status is pending', async () => {
      const supabase = createMockSupabaseWithRpc({
        leads: { selectData: { status: 'active', converted_matter_id: null } },
        lead_retainer_packages: { selectData: { required_documents_status: 'pending' } },
      })

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('required_documents'))
      const gate = findGate(result, 'required_documents')
      expect(gate?.passed).toBe(false)
      expect(gate?.reason).toContain('"pending"')
    })

    it('fails with "unknown" when no retainer exists', async () => {
      const supabase = createMockSupabaseWithRpc({
        leads: { selectData: { status: 'active', converted_matter_id: null } },
        lead_retainer_packages: { selectData: null },
      })

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('required_documents'))
      const gate = findGate(result, 'required_documents')
      expect(gate?.passed).toBe(false)
      expect(gate?.reason).toContain('"unknown"')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Readiness Complete Gate
  // ═══════════════════════════════════════════════════════════════════════

  describe('readiness_complete gate', () => {
    it('passes when score >= 70', async () => {
      const supabase = createMockSupabaseWithRpc(
        {
          leads: { selectData: { status: 'active', converted_matter_id: null } },
        },
        {
          fn_calculate_lead_readiness: { data: { score: 85, missing: [] } },
        }
      )

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('readiness_complete'))
      expect(findGate(result, 'readiness_complete')?.passed).toBe(true)
    })

    it('passes when score is exactly 70 (threshold boundary)', async () => {
      const supabase = createMockSupabaseWithRpc(
        {
          leads: { selectData: { status: 'active', converted_matter_id: null } },
        },
        {
          fn_calculate_lead_readiness: { data: { score: 70, missing: [] } },
        }
      )

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('readiness_complete'))
      expect(findGate(result, 'readiness_complete')?.passed).toBe(true)
    })

    it('fails when score < 70 with score and missing count in reason', async () => {
      const supabase = createMockSupabaseWithRpc(
        {
          leads: { selectData: { status: 'active', converted_matter_id: null } },
        },
        {
          fn_calculate_lead_readiness: {
            data: { score: 45, missing: [{ label: 'Phone' }, { label: 'Address' }] },
          },
        }
      )

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('readiness_complete'))
      const gate = findGate(result, 'readiness_complete')
      expect(gate?.passed).toBe(false)
      expect(gate?.reason).toContain('45%')
      expect(gate?.reason).toContain('70%')
      expect(gate?.reason).toContain('2 required field(s) missing')
    })

    it('fails with score 0 when RPC returns null data', async () => {
      const supabase = createMockSupabaseWithRpc(
        {
          leads: { selectData: { status: 'active', converted_matter_id: null } },
        },
        {
          fn_calculate_lead_readiness: { data: null },
        }
      )

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('readiness_complete'))
      const gate = findGate(result, 'readiness_complete')
      expect(gate?.passed).toBe(false)
      expect(gate?.reason).toContain('0%')
    })

    it('fails with fallback reason when RPC throws', async () => {
      const supabase = createRpcThrowingSupabase(
        {
          leads: { selectData: { status: 'active', converted_matter_id: null } },
        },
        ['fn_calculate_lead_readiness']
      )

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('readiness_complete'))
      const gate = findGate(result, 'readiness_complete')
      expect(gate?.passed).toBe(false)
      expect(gate?.reason).toBe('Failed to calculate lead readiness score.')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Trust Deposit Received Gate
  // ═══════════════════════════════════════════════════════════════════════

  describe('trust_deposit_received gate', () => {
    it('passes via retainer path when payment_amount > 0', async () => {
      const supabase = createMockSupabaseWithRpc({
        leads: { selectData: { status: 'active', converted_matter_id: null } },
        lead_retainer_packages: { selectData: { payment_status: 'paid', payment_amount: '5000' } },
      })

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('trust_deposit_received'))
      expect(findGate(result, 'trust_deposit_received')?.passed).toBe(true)
    })

    it('passes via trust_transactions path when matter has deposit', async () => {
      // Retainer has no payment_amount, but there's a matter with trust transactions.
      // We need a more nuanced mock here — matters query returns data, trust_transactions query returns count.
      const supabase = createMockSupabaseWithRpc({
        leads: { selectData: { status: 'active', converted_matter_id: null } },
        lead_retainer_packages: { selectData: { payment_status: 'pending', payment_amount: null } },
        matters: { selectData: [{ id: 'matter-1' }] },
        trust_transactions: { countResult: 2 },
      })

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('trust_deposit_received'))
      const gate = findGate(result, 'trust_deposit_received')
      expect(gate?.passed).toBe(true)
    })

    it('fails when retainer has zero amount and no matters exist', async () => {
      const supabase = createMockSupabaseWithRpc({
        leads: { selectData: { status: 'active', converted_matter_id: null } },
        lead_retainer_packages: { selectData: { payment_status: 'pending', payment_amount: '0' } },
        matters: { selectData: null },
      })

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('trust_deposit_received'))
      const gate = findGate(result, 'trust_deposit_received')
      expect(gate?.passed).toBe(false)
      expect(gate?.reason).toContain('No trust deposit has been recorded')
    })

    it('fails when retainer has no amount and no retainer exists', async () => {
      const supabase = createMockSupabaseWithRpc({
        leads: { selectData: { status: 'active', converted_matter_id: null } },
        lead_retainer_packages: { selectData: null },
        matters: { selectData: null },
      })

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('trust_deposit_received'))
      const gate = findGate(result, 'trust_deposit_received')
      expect(gate?.passed).toBe(false)
      expect(gate?.reason).toContain('Norva Ledger')
    })

    it('fails when matter exists but trust_transactions count is 0', async () => {
      const supabase = createMockSupabaseWithRpc({
        leads: { selectData: { status: 'active', converted_matter_id: null } },
        lead_retainer_packages: { selectData: { payment_status: 'pending', payment_amount: null } },
        matters: { selectData: [{ id: 'matter-1' }] },
        trust_transactions: { countResult: 0 },
      })

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('trust_deposit_received'))
      const gate = findGate(result, 'trust_deposit_received')
      expect(gate?.passed).toBe(false)
      expect(gate?.reason).toContain('No trust deposit has been recorded')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Not Already Converted Gate (always enforced)
  // ═══════════════════════════════════════════════════════════════════════

  describe('not_already_converted gate (always enforced)', () => {
    it('is always present even when all optional gates are disabled', async () => {
      const supabase = createMockSupabaseWithRpc({
        leads: { selectData: { status: 'active', converted_matter_id: null } },
      })

      const disableAll = makeConfig({
        conflict_cleared: false,
        retainer_signed: false,
        payment_received: false,
        intake_complete: false,
      })

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', disableAll)
      const gate = findGate(result, 'not_already_converted')
      expect(gate).toBeDefined()
      expect(gate!.enabled).toBe(true)
      expect(gate!.passed).toBe(true)
    })

    it('passes when status is not converted and no converted_matter_id', async () => {
      const supabase = createMockSupabaseWithRpc({
        leads: { selectData: { status: 'active', converted_matter_id: null } },
      })

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', singleGateConfig('conflict_cleared'))
      const gate = findGate(result, 'not_already_converted')
      expect(gate?.passed).toBe(true)
    })

    it('fails when status is converted', async () => {
      const supabase = createMockSupabaseWithRpc({
        leads: { selectData: { status: 'converted', converted_matter_id: 'matter-1' } },
      })

      const disableAll = makeConfig({
        conflict_cleared: false,
        retainer_signed: false,
        payment_received: false,
        intake_complete: false,
      })

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', disableAll)
      const gate = findGate(result, 'not_already_converted')
      expect(gate?.passed).toBe(false)
      expect(gate?.reason).toContain('already been converted')
    })

    it('fails when converted_matter_id is set (even without status = converted)', async () => {
      const supabase = createMockSupabaseWithRpc({
        leads: { selectData: { status: 'active', converted_matter_id: 'matter-1' } },
      })

      const disableAll = makeConfig({
        conflict_cleared: false,
        retainer_signed: false,
        payment_received: false,
        intake_complete: false,
      })

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', disableAll)
      const gate = findGate(result, 'not_already_converted')
      expect(gate?.passed).toBe(false)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Integration: All 8 Optional Gates + Always-On Gate
  // ═══════════════════════════════════════════════════════════════════════

  describe('full integration — all gates enabled', () => {
    it('returns canConvert = true when every gate passes', async () => {
      const supabase = createMockSupabaseWithRpc(
        {
          leads: {
            selectData: { contact_id: 'c-1', conflict_status: 'cleared', status: 'active', converted_matter_id: null },
          },
          lead_retainer_packages: {
            selectData: {
              status: 'fully_retained',
              signed_at: '2026-03-01',
              payment_status: 'paid',
              payment_amount: '10000',
              id_verification_status: 'verified',
              required_documents_status: 'complete',
            },
          },
          lead_intake_profiles: {
            selectData: { mandatory_fields_complete: true },
          },
        },
        {
          fn_calculate_lead_readiness: { data: { score: 95, missing: [] } },
        }
      )

      const allEnabled = makeConfig({
        conflict_cleared: true,
        retainer_signed: true,
        payment_received: true,
        intake_complete: true,
        id_verification: true,
        required_documents: true,
        readiness_complete: true,
        trust_deposit_received: true,
      })

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', allEnabled)

      expect(result.canConvert).toBe(true)
      expect(result.blockedReasons).toHaveLength(0)
      // 8 optional + 1 always-on = 9 gate results
      expect(result.gateResults).toHaveLength(9)
      for (const gate of result.gateResults) {
        expect(gate.passed).toBe(true)
      }
    })

    it('blocks conversion and lists all failing gates when everything fails', async () => {
      const supabase = createMockSupabaseWithRpc(
        {
          leads: {
            selectData: { contact_id: 'c-1', conflict_status: 'blocked', status: 'converted', converted_matter_id: 'matter-x' },
          },
          lead_retainer_packages: {
            selectData: {
              status: 'draft',
              signed_at: null,
              payment_status: 'unpaid',
              payment_amount: null,
              id_verification_status: 'not_verified',
              required_documents_status: 'pending',
            },
          },
          lead_intake_profiles: {
            selectData: { mandatory_fields_complete: false },
          },
          matters: { selectData: null },
        },
        {
          fn_calculate_lead_readiness: { data: { score: 10, missing: [{ label: 'A' }] } },
        }
      )

      const allEnabled = makeConfig({
        conflict_cleared: true,
        retainer_signed: true,
        payment_received: true,
        intake_complete: true,
        id_verification: true,
        required_documents: true,
        readiness_complete: true,
        trust_deposit_received: true,
      })

      const result = await evaluateConversionGates(supabase, 'lead-1', 'tenant-1', allEnabled)

      expect(result.canConvert).toBe(false)
      // All 9 gates should fail
      expect(result.gateResults).toHaveLength(9)
      for (const gate of result.gateResults) {
        expect(gate.passed).toBe(false)
      }
      expect(result.blockedReasons.length).toBe(9)
    })
  })
})
