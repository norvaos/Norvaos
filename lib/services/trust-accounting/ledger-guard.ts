/**
 * LedgerGuard Middleware  -  Fiduciary Gate (Directive 20.0 Technical Handover)
 *
 * Enforces: Any manual edit to a Trust Account balance without a corresponding
 * 'Reason Code' must be blocked and logged to the Sentinel Chain-of-Custody.
 *
 * Architecture:
 *   - All trust balance modifications MUST go through the trust_transactions
 *     append-only ledger (enforced by DB trigger trust_transactions_immutable).
 *   - This middleware validates that every balance-affecting operation has:
 *     1. A valid reason_code from the approved set
 *     2. An authorising user_id
 *     3. A description explaining the adjustment
 *   - Any attempt to bypass is logged to sentinel_audit_log and rejected.
 *
 * No ghost-money in the system.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from './trust-types'

// ── Approved Reason Codes ────────────────────────────────────────────────────

export const TRUST_REASON_CODES = {
  CLIENT_DEPOSIT:       'client_deposit',
  GOVERNMENT_FEE:       'government_fee',
  PROFESSIONAL_FEE:     'professional_fee',
  DISBURSEMENT:         'disbursement',
  CLIENT_REFUND:        'client_refund',
  INTER_MATTER_TRANSFER:'inter_matter_transfer',
  BANK_FEE:             'bank_fee',
  INTEREST_CREDIT:      'interest_credit',
  OPENING_BALANCE:      'opening_balance',
  CLIO_MIGRATION:       'clio_migration',
  CORRECTION:           'correction',
  REVERSAL:             'reversal',
  COURT_ORDER:          'court_order',
} as const

export type TrustReasonCode = typeof TRUST_REASON_CODES[keyof typeof TRUST_REASON_CODES]

const VALID_REASON_CODES = new Set(Object.values(TRUST_REASON_CODES))

// ── Validation Types ─────────────────────────────────────────────────────────

export interface LedgerGuardInput {
  tenantId: string
  matterId: string
  trustAccountId: string
  amountCents: number
  reasonCode: string
  description: string
  authorisedBy: string
  /** Optional: for corrections/reversals, reference the original transaction */
  reversalOfId?: string
}

export interface LedgerGuardResult {
  allowed: boolean
  violations: string[]
}

// ── Guard Function ───────────────────────────────────────────────────────────

/**
 * Validate a trust balance modification before it is recorded.
 *
 * Returns { allowed: true } if all checks pass, or { allowed: false, violations }
 * with an array of reasons why the operation was blocked.
 *
 * Any blocked operation is logged to the sentinel audit trail.
 */
export async function validateTrustModification(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  input: LedgerGuardInput,
): Promise<ServiceResult<LedgerGuardResult>> {
  const violations: string[] = []

  // ── 1. Reason Code validation ──────────────────────────────────────────
  if (!input.reasonCode || !VALID_REASON_CODES.has(input.reasonCode as TrustReasonCode)) {
    violations.push(
      `Invalid reason code: '${input.reasonCode}'. ` +
      `Approved codes: ${Array.from(VALID_REASON_CODES).join(', ')}`
    )
  }

  // ── 2. Description required ────────────────────────────────────────────
  if (!input.description || input.description.trim().length < 5) {
    violations.push('Description is required (minimum 5 characters) for all trust modifications.')
  }

  // ── 3. Authorisation required ──────────────────────────────────────────
  if (!input.authorisedBy) {
    violations.push('An authorising user ID is required for all trust modifications.')
  }

  // ── 4. Amount sanity ───────────────────────────────────────────────────
  if (input.amountCents === 0) {
    violations.push('Zero-amount trust transactions are not permitted.')
  }

  // ── 5. Correction/Reversal must reference original ─────────────────────
  if (
    (input.reasonCode === 'correction' || input.reasonCode === 'reversal') &&
    !input.reversalOfId
  ) {
    violations.push(
      'Corrections and reversals must reference the original transaction (reversalOfId required).'
    )
  }

  // ── 6. Verify trust account exists and is active ───────────────────────
  if (violations.length === 0) {
    const { data: account } = await supabase
      .from('trust_bank_accounts')
      .select('id, is_active')
      .eq('id', input.trustAccountId)
      .eq('tenant_id', input.tenantId)
      .maybeSingle()

    if (!account) {
      violations.push('Trust account not found or does not belong to this tenant.')
    } else if (!account.is_active) {
      violations.push('Trust account is inactive. Reactivate before recording transactions.')
    }
  }

  // ── 7. Log blocked attempts to Sentinel ────────────────────────────────
  if (violations.length > 0) {
    try {
      await supabase
        .from('trust_audit_log')
        .insert({
          tenant_id: input.tenantId,
          action: 'LEDGER_GUARD_BLOCKED',
          entity_type: 'trust_transaction',
          entity_id: input.trustAccountId,
          matter_id: input.matterId,
          user_id: input.authorisedBy || null,
          metadata: {
            reason_code: input.reasonCode,
            amount_cents: input.amountCents,
            description: input.description,
            violations,
            blocked_at: new Date().toISOString(),
          },
        })
    } catch {
      // Audit failure is non-fatal but should be monitored
      console.error('[LedgerGuard] Failed to log blocked attempt to audit trail')
    }
  }

  return {
    success: true,
    data: {
      allowed: violations.length === 0,
      violations,
    },
  }
}

/**
 * Convenience: throw if the guard rejects.
 * Use in API route handlers for clean early-return pattern.
 */
export async function enforceLedgerGuard(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  input: LedgerGuardInput,
): Promise<void> {
  const result = await validateTrustModification(supabase, input)

  if (!result.success) {
    throw new Error(`LedgerGuard error: ${result.error}`)
  }

  const data = result.data
  if (!data || !data.allowed) {
    const violations = data?.violations ?? ['Unknown violation']
    const err = new Error(
      `LedgerGuard: Trust modification blocked. Violations: ${violations.join('; ')}`
    )
    ;(err as Error & { violations: string[] }).violations = violations
    throw err
  }
}
