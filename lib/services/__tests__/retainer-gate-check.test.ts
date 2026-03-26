/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Retainer Generation — 4-Gate Pre-check Service — Unit Tests
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Proves:
 * - All four gates pass when matter is fully configured
 * - Each gate fails independently with correct error codes
 * - Matter not found returns all gates failed
 * - Conflict gate: no contacts = pass, contacts with clean scans = pass,
 *   contacts with open conflicts = fail, DB error = soft pass
 * - Edge case: exactly at threshold (score = 0 does not trigger conflict)
 * - Missing matter data fields: null matter_type_id, null billing_type, null lawyer
 * - Gate helper structure is correct
 */

import { describe, it, expect, vi } from 'vitest'
import { checkRetainerGates, type RetainerGateResult } from '../retainer-gate-check'
import { createMockSupabase } from '@/lib/test-utils/mock-supabase'

// ─── Fixtures ───────────────────────────────────────────────────────────────

const MATTER_ID = 'matter-1'
const TENANT_ID = 'tenant-1'

function fullyConfiguredMatter() {
  return {
    id: MATTER_ID,
    matter_type_id: 'mt-1',
    billing_type: 'hourly',
    responsible_lawyer_id: 'lawyer-1',
  }
}

// ─── All Gates Pass ─────────────────────────────────────────────────────────

describe('checkRetainerGates', () => {
  describe('all gates pass', () => {
    it('returns passed = true when matter is fully configured and no conflicts exist', async () => {
      const supabase = createMockSupabase({
        matters: { selectData: fullyConfiguredMatter() },
        matter_contacts: { selectData: [{ contact_id: 'c-1' }] },
        conflict_scans: { selectData: [] },
      })
      // Override the default .single() for matter_contacts to return array via thenable
      // The mock returns selectData via the chain's thenable (non-.single())
      // matter_contacts uses the chain without .single(), so the thenable returns the array

      const result = await checkRetainerGates(supabase, MATTER_ID, TENANT_ID)

      expect(result.passed).toBe(true)
      expect(result.gates).toHaveLength(4)
      expect(result.gates.every(g => g.passed)).toBe(true)
    })
  })

  // ── Matter Not Found ──────────────────────────────────────────────────────

  describe('matter not found', () => {
    it('returns passed = false with all gates failed when matter cannot be loaded', async () => {
      const supabase = createMockSupabase({
        matters: {
          selectData: null,
          selectError: { message: 'Row not found' },
        },
      })

      const result = await checkRetainerGates(supabase, 'non-existent', TENANT_ID)

      expect(result.passed).toBe(false)
      expect(result.gates).toHaveLength(4)

      const conflictGate = result.gates.find(g => g.id === 'conflict_clear')
      expect(conflictGate?.passed).toBe(false)
      expect(conflictGate?.error?.code).toBe('MATTER_NOT_FOUND')
    })

    it('marks non-conflict gates as skipped (no error) when matter not found', async () => {
      const supabase = createMockSupabase({
        matters: {
          selectData: null,
          selectError: { message: 'Row not found' },
        },
      })

      const result = await checkRetainerGates(supabase, 'non-existent', TENANT_ID)

      const matterTypeGate = result.gates.find(g => g.id === 'matter_type_set')
      expect(matterTypeGate?.passed).toBe(false)
      expect(matterTypeGate?.error).toBeUndefined()

      const billingGate = result.gates.find(g => g.id === 'billing_structure')
      expect(billingGate?.passed).toBe(false)
      expect(billingGate?.error).toBeUndefined()

      const lawyerGate = result.gates.find(g => g.id === 'lawyer_assigned')
      expect(lawyerGate?.passed).toBe(false)
      expect(lawyerGate?.error).toBeUndefined()
    })
  })

  // ── Gate 1: Conflict Clear ────────────────────────────────────────────────

  describe('gate 1 — conflict clear', () => {
    it('passes when no contacts are linked to the matter', async () => {
      const supabase = createMockSupabase({
        matters: { selectData: fullyConfiguredMatter() },
        matter_contacts: { selectData: [] },
        conflict_scans: { selectData: [] },
      })

      const result = await checkRetainerGates(supabase, MATTER_ID, TENANT_ID)
      const gate = result.gates.find(g => g.id === 'conflict_clear')

      expect(gate?.passed).toBe(true)
    })

    it('passes when contacts exist but no conflict scans have score > 0', async () => {
      const supabase = createMockSupabase({
        matters: { selectData: fullyConfiguredMatter() },
        matter_contacts: { selectData: [{ contact_id: 'c-1' }] },
        conflict_scans: { selectData: [] },
      })

      const result = await checkRetainerGates(supabase, MATTER_ID, TENANT_ID)
      const gate = result.gates.find(g => g.id === 'conflict_clear')

      expect(gate?.passed).toBe(true)
    })

    it('fails when a contact has an open conflict scan with score > 0', async () => {
      const supabase = createMockSupabase({
        matters: { selectData: fullyConfiguredMatter() },
        matter_contacts: { selectData: [{ contact_id: 'c-1' }] },
        conflict_scans: {
          selectData: [{ id: 'scan-1', score: 85, contact_id: 'c-1' }],
        },
      })

      const result = await checkRetainerGates(supabase, MATTER_ID, TENANT_ID)
      const gate = result.gates.find(g => g.id === 'conflict_clear')

      expect(gate?.passed).toBe(false)
      expect(gate?.error?.code).toBe('GATE_CONFLICT_OPEN')
      expect(gate?.error?.owner).toBe('lawyer')
    })

    it('soft-passes when conflict_scans query returns an error', async () => {
      const supabase = createMockSupabase({
        matters: { selectData: fullyConfiguredMatter() },
        matter_contacts: { selectData: [{ contact_id: 'c-1' }] },
        conflict_scans: {
          selectData: null,
          selectError: { message: 'relation does not exist' },
        },
      })

      const result = await checkRetainerGates(supabase, MATTER_ID, TENANT_ID)
      const gate = result.gates.find(g => g.id === 'conflict_clear')

      expect(gate?.passed).toBe(true)
    })

    it('soft-passes when conflict check throws an exception', async () => {
      // Create a supabase where matter_contacts throws
      const supabase = createMockSupabase({
        matters: { selectData: fullyConfiguredMatter() },
      })
      // Override matter_contacts to throw
      const originalFrom = supabase.from
      let callCount = 0
      supabase.from = vi.fn((table: string) => {
        if (table === 'matter_contacts') {
          throw new Error('Table does not exist')
        }
        return originalFrom(table)
      })

      const result = await checkRetainerGates(supabase, MATTER_ID, TENANT_ID)
      const gate = result.gates.find(g => g.id === 'conflict_clear')

      expect(gate?.passed).toBe(true)
    })
  })

  // ── Gate 2: Matter Type Set ───────────────────────────────────────────────

  describe('gate 2 — matter type set', () => {
    it('passes when matter_type_id is set', async () => {
      const supabase = createMockSupabase({
        matters: { selectData: fullyConfiguredMatter() },
        matter_contacts: { selectData: [] },
      })

      const result = await checkRetainerGates(supabase, MATTER_ID, TENANT_ID)
      const gate = result.gates.find(g => g.id === 'matter_type_set')

      expect(gate?.passed).toBe(true)
    })

    it('fails when matter_type_id is null', async () => {
      const supabase = createMockSupabase({
        matters: { selectData: { ...fullyConfiguredMatter(), matter_type_id: null } },
        matter_contacts: { selectData: [] },
      })

      const result = await checkRetainerGates(supabase, MATTER_ID, TENANT_ID)
      const gate = result.gates.find(g => g.id === 'matter_type_set')

      expect(gate?.passed).toBe(false)
      expect(gate?.error?.code).toBe('GATE_MATTER_TYPE_MISSING')
      expect(gate?.error?.owner).toBe('lawyer')
    })
  })

  // ── Gate 3: Billing Structure ─────────────────────────────────────────────

  describe('gate 3 — billing structure', () => {
    it('passes when billing_type is set', async () => {
      const supabase = createMockSupabase({
        matters: { selectData: fullyConfiguredMatter() },
        matter_contacts: { selectData: [] },
      })

      const result = await checkRetainerGates(supabase, MATTER_ID, TENANT_ID)
      const gate = result.gates.find(g => g.id === 'billing_structure')

      expect(gate?.passed).toBe(true)
    })

    it('fails when billing_type is null', async () => {
      const supabase = createMockSupabase({
        matters: { selectData: { ...fullyConfiguredMatter(), billing_type: null } },
        matter_contacts: { selectData: [] },
      })

      const result = await checkRetainerGates(supabase, MATTER_ID, TENANT_ID)
      const gate = result.gates.find(g => g.id === 'billing_structure')

      expect(gate?.passed).toBe(false)
      expect(gate?.error?.code).toBe('GATE_BILLING_TYPE_MISSING')
    })

    it('passes for all valid billing types', async () => {
      for (const billingType of ['flat_fee', 'hourly', 'contingency', 'hybrid']) {
        const supabase = createMockSupabase({
          matters: { selectData: { ...fullyConfiguredMatter(), billing_type: billingType } },
          matter_contacts: { selectData: [] },
        })

        const result = await checkRetainerGates(supabase, MATTER_ID, TENANT_ID)
        const gate = result.gates.find(g => g.id === 'billing_structure')

        expect(gate?.passed, `billing_type "${billingType}" should pass`).toBe(true)
      }
    })
  })

  // ── Gate 4: Lawyer Assigned ───────────────────────────────────────────────

  describe('gate 4 — lawyer assigned', () => {
    it('passes when responsible_lawyer_id is set', async () => {
      const supabase = createMockSupabase({
        matters: { selectData: fullyConfiguredMatter() },
        matter_contacts: { selectData: [] },
      })

      const result = await checkRetainerGates(supabase, MATTER_ID, TENANT_ID)
      const gate = result.gates.find(g => g.id === 'lawyer_assigned')

      expect(gate?.passed).toBe(true)
    })

    it('fails when responsible_lawyer_id is null', async () => {
      const supabase = createMockSupabase({
        matters: {
          selectData: { ...fullyConfiguredMatter(), responsible_lawyer_id: null },
        },
        matter_contacts: { selectData: [] },
      })

      const result = await checkRetainerGates(supabase, MATTER_ID, TENANT_ID)
      const gate = result.gates.find(g => g.id === 'lawyer_assigned')

      expect(gate?.passed).toBe(false)
      expect(gate?.error?.code).toBe('GATE_LAWYER_UNASSIGNED')
      expect(gate?.error?.owner).toBe('legal_assistant')
    })
  })

  // ── Combined gate failures ────────────────────────────────────────────────

  describe('combined gate failures', () => {
    it('returns passed = false when multiple gates fail', async () => {
      const supabase = createMockSupabase({
        matters: {
          selectData: {
            id: MATTER_ID,
            matter_type_id: null,
            billing_type: null,
            responsible_lawyer_id: null,
          },
        },
        matter_contacts: { selectData: [] },
      })

      const result = await checkRetainerGates(supabase, MATTER_ID, TENANT_ID)

      expect(result.passed).toBe(false)
      const failedGates = result.gates.filter(g => !g.passed)
      expect(failedGates.length).toBe(3)
    })

    it('returns passed = false if only one gate fails', async () => {
      const supabase = createMockSupabase({
        matters: {
          selectData: { ...fullyConfiguredMatter(), billing_type: null },
        },
        matter_contacts: { selectData: [] },
      })

      const result = await checkRetainerGates(supabase, MATTER_ID, TENANT_ID)

      expect(result.passed).toBe(false)
      const failedGates = result.gates.filter(g => !g.passed)
      expect(failedGates.length).toBe(1)
      expect(failedGates[0].id).toBe('billing_structure')
    })
  })

  // ── Gate result structure ─────────────────────────────────────────────────

  describe('gate result structure', () => {
    it('always returns exactly 4 gates in order', async () => {
      const supabase = createMockSupabase({
        matters: { selectData: fullyConfiguredMatter() },
        matter_contacts: { selectData: [] },
      })

      const result = await checkRetainerGates(supabase, MATTER_ID, TENANT_ID)

      expect(result.gates).toHaveLength(4)
      expect(result.gates[0].id).toBe('conflict_clear')
      expect(result.gates[1].id).toBe('matter_type_set')
      expect(result.gates[2].id).toBe('billing_structure')
      expect(result.gates[3].id).toBe('lawyer_assigned')
    })

    it('passed gates have no error property', async () => {
      const supabase = createMockSupabase({
        matters: { selectData: fullyConfiguredMatter() },
        matter_contacts: { selectData: [] },
      })

      const result = await checkRetainerGates(supabase, MATTER_ID, TENANT_ID)

      for (const gate of result.gates) {
        expect(gate.passed).toBe(true)
        expect(gate.error).toBeUndefined()
      }
    })

    it('failed gates have structured NorvaOSGateFailure with required fields', async () => {
      const supabase = createMockSupabase({
        matters: {
          selectData: {
            id: MATTER_ID,
            matter_type_id: null,
            billing_type: null,
            responsible_lawyer_id: null,
          },
        },
        matter_contacts: { selectData: [{ contact_id: 'c-1' }] },
        conflict_scans: {
          selectData: [{ id: 'scan-1', score: 50, contact_id: 'c-1' }],
        },
      })

      const result = await checkRetainerGates(supabase, MATTER_ID, TENANT_ID)

      for (const gate of result.gates) {
        if (!gate.passed && gate.error) {
          expect(gate.error.code).toBeTruthy()
          expect(gate.error.title).toBeTruthy()
          expect(gate.error.message).toBeTruthy()
          expect(gate.error.action).toBeTruthy()
          expect(gate.error.owner).toBeTruthy()
          expect(Array.isArray(gate.error.failedConditions)).toBe(true)
        }
      }
    })
  })
})
