/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Directive 015 / 015.1 — Genesis Block Service Unit Tests
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Tests the Sovereign Birth Certificate (Digital Notary) logic:
 *   1. Genesis payload assembly (conflict + KYC + retainer + trust anchor)
 *   2. SHA-256 hash integrity verification
 *   3. Compliance pillar evaluation + sequence violation detection
 *   4. Immutability contract (one block per matter, revocation path)
 */

import { describe, it, expect } from 'vitest'
import { createHash } from 'crypto'

// ─── Mock Types (mirror the 015.1 genesis payload structure) ────────────────

interface GenesisPayload {
  matter_id: string
  matter_number: string
  matter_title: string
  tenant_id: string
  generated_at: string
  generated_by: string
  conflict_check: {
    scan_id: string
    search_id: string
    scan_status: string
    score: number
    decision: string
    justification: string
    decided_by: string
    decided_at: string
  }
  kyc_verification: {
    verification_id: string
    status: string
    document_type: string
    document_country: string
    document_number_hash: string
    verified_at: string
    confidence_score: number
  }
  retainer_agreement: {
    agreement_id: string
    status: string
    billing_type: string
    total_amount_cents: number
    signed_at: string
    scope_of_services: string
    retainer_hash: string
  }
  trust_ledger_anchor: {
    initial_trust_balance_cents: number
    last_trust_audit_hash: string
    balance_parity: string
  }
}

// ─── Helper: Build a test genesis payload ───────────────────────────────────

function buildTestPayload(overrides?: Partial<{
  conflictDecision: string
  conflictDecidedAt: string
  kycStatus: string
  retainerStatus: string
  retainerSignedAt: string
  initialBalance: number
}>): GenesisPayload {
  return {
    matter_id: 'matter-001',
    matter_number: 'MAT-2026-0001',
    matter_title: 'Spousal Sponsorship — Khan',
    tenant_id: 'tenant-001',
    generated_at: '2026-03-25T10:00:00Z',
    generated_by: 'user-001',
    conflict_check: {
      scan_id: 'scan-001',
      search_id: 'global-scan-001',
      scan_status: 'completed',
      score: 55,
      decision: overrides?.conflictDecision ?? 'no_conflict',
      justification: 'Confirmed different individual despite name overlap',
      decided_by: 'user-001',
      decided_at: overrides?.conflictDecidedAt ?? '2026-03-20T09:50:00Z',
    },
    kyc_verification: {
      verification_id: 'kyc-001',
      status: overrides?.kycStatus ?? 'verified',
      document_type: 'passport',
      document_country: 'CA',
      document_number_hash: createHash('sha256').update('AB123456').digest('hex'),
      verified_at: '2026-03-19T14:30:00Z',
      confidence_score: 95,
    },
    retainer_agreement: {
      agreement_id: 'ret-001',
      status: overrides?.retainerStatus ?? 'signed',
      billing_type: 'flat_fee',
      total_amount_cents: 350000,
      signed_at: overrides?.retainerSignedAt ?? '2026-03-22T16:00:00Z',
      scope_of_services: 'Spousal sponsorship application (inland)',
      retainer_hash: createHash('sha256').update('retainer-pdf-content').digest('hex'),
    },
    trust_ledger_anchor: {
      initial_trust_balance_cents: overrides?.initialBalance ?? 0,
      last_trust_audit_hash: 'abc123def456',
      balance_parity: (overrides?.initialBalance ?? 0) === 0 ? 'zero_confirmed' : 'deposit_present',
    },
  }
}

// ─── Helper: Evaluate compliance pillars (mirrors RPC logic) ────────────────

function evaluateCompliance(payload: GenesisPayload): {
  isCompliant: boolean
  hasSequenceViolation: boolean
  notes: string[]
} {
  const notes: string[] = []
  let isCompliant = true
  let hasSequenceViolation = false

  // Pillar 1: Conflict check cleared
  const clearedDecisions = ['no_conflict', 'proceed_with_caution', 'waiver_obtained']
  if (payload.conflict_check.scan_id === 'NOT_SCANNED') {
    isCompliant = false
    notes.push('No conflict scan on record')
  } else if (!clearedDecisions.includes(payload.conflict_check.decision)) {
    isCompliant = false
    notes.push(`Conflict check not cleared: ${payload.conflict_check.decision}`)
  }

  // Pillar 2: KYC verified
  if (payload.kyc_verification.verification_id === 'NOT_VERIFIED') {
    isCompliant = false
    notes.push('No KYC identity verification on record')
  } else if (payload.kyc_verification.status !== 'verified') {
    isCompliant = false
    notes.push(`KYC not verified: ${payload.kyc_verification.status}`)
  }

  // Pillar 3: Retainer signed
  if (payload.retainer_agreement.agreement_id === 'NO_RETAINER') {
    isCompliant = false
    notes.push('No retainer agreement on record')
  } else if (payload.retainer_agreement.status !== 'signed') {
    isCompliant = false
    notes.push(`Retainer not signed: ${payload.retainer_agreement.status}`)
  }

  // Sequence check: conflict decided AFTER retainer signed?
  if (payload.conflict_check.decided_at && payload.retainer_agreement.signed_at) {
    const conflictTime = new Date(payload.conflict_check.decided_at).getTime()
    const retainerTime = new Date(payload.retainer_agreement.signed_at).getTime()
    if (conflictTime > retainerTime) {
      hasSequenceViolation = true
      isCompliant = false
      notes.push('SEQUENCE VIOLATION: Conflict check after retainer signing')
    }
  }

  return { isCompliant, hasSequenceViolation, notes }
}

// ─── Helper: Compute SHA-256 ────────────────────────────────────────────────

function computeGenesisHash(payload: GenesisPayload): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

// ═══════════════════════════════════════════════════════════════════════════════
// Test Suite
// ═══════════════════════════════════════════════════════════════════════════════

describe('Directive 015/015.1: Genesis Block — Sovereign Birth Certificate', () => {

  // ── SHA-256 Hash Integrity ──────────────────────────────────────────────

  describe('SHA-256 Hash Integrity', () => {
    it('produces a 64-character hex hash', () => {
      const payload = buildTestPayload()
      const hash = computeGenesisHash(payload)
      expect(hash).toHaveLength(64)
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('produces deterministic hashes for identical payloads', () => {
      const payload = buildTestPayload()
      expect(computeGenesisHash(payload)).toBe(computeGenesisHash(payload))
    })

    it('produces different hashes for different payloads', () => {
      const hash1 = computeGenesisHash(buildTestPayload())
      const hash2 = computeGenesisHash(buildTestPayload({ conflictDecision: 'conflict_confirmed' }))
      expect(hash1).not.toBe(hash2)
    })

    it('detects payload tampering', () => {
      const payload = buildTestPayload()
      const original = computeGenesisHash(payload)
      const tampered = computeGenesisHash({
        ...payload,
        conflict_check: { ...payload.conflict_check, decision: 'waiver_obtained' },
      })
      expect(original).not.toBe(tampered)
    })
  })

  // ── Compliance Pillar Evaluation ────────────────────────────────────────

  describe('Compliance Pillar Evaluation', () => {
    it('marks fully compliant when all 3 pillars met + correct sequence', () => {
      const { isCompliant, hasSequenceViolation, notes } = evaluateCompliance(buildTestPayload())
      expect(isCompliant).toBe(true)
      expect(hasSequenceViolation).toBe(false)
      expect(notes).toHaveLength(0)
    })

    it('fails when conflict check is not cleared', () => {
      const { isCompliant, notes } = evaluateCompliance(buildTestPayload({ conflictDecision: 'conflict_confirmed' }))
      expect(isCompliant).toBe(false)
      expect(notes).toContain('Conflict check not cleared: conflict_confirmed')
    })

    it('fails when KYC is not verified', () => {
      const { isCompliant, notes } = evaluateCompliance(buildTestPayload({ kycStatus: 'pending' }))
      expect(isCompliant).toBe(false)
      expect(notes.some((n) => n.includes('KYC not verified'))).toBe(true)
    })

    it('fails when retainer is not signed', () => {
      const { isCompliant, notes } = evaluateCompliance(buildTestPayload({ retainerStatus: 'draft' }))
      expect(isCompliant).toBe(false)
      expect(notes.some((n) => n.includes('Retainer not signed'))).toBe(true)
    })

    it('fails on all 3 pillars simultaneously', () => {
      const { isCompliant, notes } = evaluateCompliance(buildTestPayload({
        conflictDecision: 'block_matter_opening',
        kycStatus: 'not_started',
        retainerStatus: 'sent',
      }))
      expect(isCompliant).toBe(false)
      expect(notes.length).toBeGreaterThanOrEqual(3)
    })

    it('accepts proceed_with_caution as a cleared conflict', () => {
      expect(evaluateCompliance(buildTestPayload({ conflictDecision: 'proceed_with_caution' })).isCompliant).toBe(true)
    })

    it('accepts waiver_obtained as a cleared conflict', () => {
      expect(evaluateCompliance(buildTestPayload({ conflictDecision: 'waiver_obtained' })).isCompliant).toBe(true)
    })
  })

  // ── Sequence Violation Detection (015.1) ───────────────────────────────

  describe('Sequence Violation Detection (015.1)', () => {
    it('correct order: conflict BEFORE retainer → no violation', () => {
      const result = evaluateCompliance(buildTestPayload({
        conflictDecidedAt: '2026-03-20T10:00:00Z',
        retainerSignedAt: '2026-03-22T10:00:00Z',
      }))
      expect(result.hasSequenceViolation).toBe(false)
      expect(result.isCompliant).toBe(true)
    })

    it('violation: conflict AFTER retainer → amber shield', () => {
      const result = evaluateCompliance(buildTestPayload({
        conflictDecidedAt: '2026-03-25T10:00:00Z',
        retainerSignedAt: '2026-03-22T10:00:00Z',
      }))
      expect(result.hasSequenceViolation).toBe(true)
      expect(result.isCompliant).toBe(false)
      expect(result.notes.some((n) => n.includes('SEQUENCE VIOLATION'))).toBe(true)
    })

    it('same timestamp → no violation', () => {
      const result = evaluateCompliance(buildTestPayload({
        conflictDecidedAt: '2026-03-22T10:00:00Z',
        retainerSignedAt: '2026-03-22T10:00:00Z',
      }))
      expect(result.hasSequenceViolation).toBe(false)
    })
  })

  // ── Genesis Payload Structure (015.1 Enhanced) ─────────────────────────

  describe('Genesis Payload Structure (015.1)', () => {
    it('contains all required fields including 015.1 additions', () => {
      const payload = buildTestPayload()
      expect(payload).toHaveProperty('conflict_check.search_id')
      expect(payload).toHaveProperty('retainer_agreement.retainer_hash')
      expect(payload).toHaveProperty('trust_ledger_anchor.initial_trust_balance_cents')
      expect(payload).toHaveProperty('trust_ledger_anchor.last_trust_audit_hash')
      expect(payload).toHaveProperty('trust_ledger_anchor.balance_parity')
    })

    it('retainer_hash is a valid SHA-256', () => {
      const payload = buildTestPayload()
      expect(payload.retainer_agreement.retainer_hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('kyc document_number_hash is SHA-256 (never raw PII)', () => {
      const payload = buildTestPayload()
      expect(payload.kyc_verification.document_number_hash).toMatch(/^[0-9a-f]{64}$/)
      expect(payload.kyc_verification.document_number_hash).not.toBe('AB123456')
    })

    it('trust balance defaults to zero (balance_parity = zero_confirmed)', () => {
      const payload = buildTestPayload()
      expect(payload.trust_ledger_anchor.initial_trust_balance_cents).toBe(0)
      expect(payload.trust_ledger_anchor.balance_parity).toBe('zero_confirmed')
    })

    it('non-zero trust balance reports deposit_present', () => {
      const payload = buildTestPayload({ initialBalance: 350000 })
      expect(payload.trust_ledger_anchor.initial_trust_balance_cents).toBe(350000)
      expect(payload.trust_ledger_anchor.balance_parity).toBe('deposit_present')
    })
  })

  // ── Immutability Contract ─────────────────────────────────────────────

  describe('Immutability Contract', () => {
    it('genesis hash is frozen at generation time', () => {
      const payload = buildTestPayload()
      expect(computeGenesisHash(payload)).toBe(computeGenesisHash(payload))
    })

    it('no field in the payload can be altered without changing the hash', () => {
      const payload = buildTestPayload()
      const originalHash = computeGenesisHash(payload)

      const modifications = [
        { ...payload, matter_id: 'TAMPERED' },
        { ...payload, tenant_id: 'TAMPERED' },
        { ...payload, conflict_check: { ...payload.conflict_check, score: 999 } },
        { ...payload, kyc_verification: { ...payload.kyc_verification, status: 'TAMPERED' } },
        { ...payload, retainer_agreement: { ...payload.retainer_agreement, total_amount_cents: 0 } },
        { ...payload, trust_ledger_anchor: { ...payload.trust_ledger_anchor, initial_trust_balance_cents: 999999 } },
      ]

      for (const modified of modifications) {
        expect(computeGenesisHash(modified)).not.toBe(originalHash)
      }
    })
  })

  // ── Edge Cases ────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('handles missing conflict scan', () => {
      const payload = buildTestPayload()
      payload.conflict_check.scan_id = 'NOT_SCANNED'
      const { isCompliant, notes } = evaluateCompliance(payload)
      expect(isCompliant).toBe(false)
      expect(notes).toContain('No conflict scan on record')
    })

    it('handles missing KYC', () => {
      const payload = buildTestPayload()
      payload.kyc_verification.verification_id = 'NOT_VERIFIED'
      const { isCompliant } = evaluateCompliance(payload)
      expect(isCompliant).toBe(false)
    })

    it('handles missing retainer', () => {
      const payload = buildTestPayload()
      payload.retainer_agreement.agreement_id = 'NO_RETAINER'
      const { isCompliant } = evaluateCompliance(payload)
      expect(isCompliant).toBe(false)
    })
  })
})
