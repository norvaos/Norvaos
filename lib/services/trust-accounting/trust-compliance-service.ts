import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// ── Types ────────────────────────────────────────────────────────────────────

/** Standard service return envelope. */
export interface ServiceResult<T> {
  success: boolean
  data?: T
  error?: string
}

export interface AvailableBalance {
  ledger_balance_cents: number
  active_holds_cents: number
  available_balance_cents: number
}

export interface OverdraftCheck {
  allowed: boolean
  ledger_balance_cents: number
  available_balance_cents: number
  requested_cents: number
}

export interface ClosureCompliance {
  canClose: boolean
  blockers: string[]
}

export interface DisbursementValidation {
  valid: boolean
  errors: string[]
}

export interface AuditLogParams {
  tenantId: string
  action: string
  entityType: string
  entityId: string
  matterId?: string
  userId: string
  metadata?: Record<string, unknown>
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Create an RLS-respecting Supabase client for reads.
 * This ensures all queries are scoped to the authenticated user's tenant.
 */
async function getReadClient(): Promise<SupabaseClient<Database>> {
  return (await createServerSupabaseClient()) as SupabaseClient<Database>
}

/**
 * Check whether a trust account is an admin account (exempt from overdraft).
 */
async function isTrustAdminAccount(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  trustAccountId: string,
): Promise<boolean> {
  const { data } = await (supabase as any)
    .from('trust_accounts')
    .select('is_trust_admin')
    .eq('id', trustAccountId)
    .eq('tenant_id', tenantId)
    .single()

  return data?.is_trust_admin === true
}

// ── Service Functions ────────────────────────────────────────────────────────

/**
 * Get the available balance for a matter within a trust account.
 *
 * Available balance = ledger balance - sum of active holds.
 * The ledger balance is the `running_balance_cents` from the most recent
 * trust transaction for the given matter + account.
 */
export async function getAvailableBalance(
  tenantId: string,
  matterId: string,
  trustAccountId: string,
): Promise<ServiceResult<AvailableBalance>> {
  try {
    const supabase = await getReadClient()

    // Fetch the latest running balance for this matter + trust account
    const { data: latestTxn, error: txnError } = await (supabase as any)
      .from('trust_transactions')
      .select('running_balance_cents')
      .eq('tenant_id', tenantId)
      .eq('matter_id', matterId)
      .eq('trust_account_id', trustAccountId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (txnError) {
      return { success: false, error: `Failed to fetch ledger balance: ${txnError.message}` }
    }

    const ledgerBalanceCents = Number(latestTxn?.running_balance_cents ?? 0)

    // Sum all active holds for this matter + trust account
    const { data: holdsData, error: holdsError } = await (supabase as any)
      .from('trust_holds')
      .select('amount_cents')
      .eq('tenant_id', tenantId)
      .eq('matter_id', matterId)
      .eq('trust_account_id', trustAccountId)
      .eq('status', 'held')

    if (holdsError) {
      return { success: false, error: `Failed to fetch active holds: ${holdsError.message}` }
    }

    const activeHoldsCents = (holdsData ?? []).reduce(
      (sum: number, hold: any) => sum + Number(hold.amount_cents),
      0,
    )

    const availableBalanceCents = ledgerBalanceCents - activeHoldsCents

    return {
      success: true,
      data: {
        ledger_balance_cents: ledgerBalanceCents,
        active_holds_cents: activeHoldsCents,
        available_balance_cents: availableBalanceCents,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error in getAvailableBalance'
    return { success: false, error: message }
  }
}

/**
 * Check whether a disbursement of `amountCents` would overdraw the trust account
 * for a given matter.
 *
 * Admin trust accounts (is_trust_admin=true) are exempt from overdraft checks
 * and always return allowed=true.
 */
export async function checkOverdraftRisk(
  tenantId: string,
  matterId: string,
  trustAccountId: string,
  amountCents: number,
): Promise<ServiceResult<OverdraftCheck>> {
  try {
    if (amountCents <= 0) {
      return { success: false, error: 'Amount must be a positive integer (cents)' }
    }

    const supabase = await getReadClient()

    // Admin accounts are exempt from overdraft checks
    const isAdmin = await isTrustAdminAccount(supabase, tenantId, trustAccountId)

    const balanceResult = await getAvailableBalance(tenantId, matterId, trustAccountId)
    if (!balanceResult.success || !balanceResult.data) {
      return { success: false, error: balanceResult.error ?? 'Failed to retrieve balance' }
    }

    const { ledger_balance_cents, available_balance_cents } = balanceResult.data
    const allowed = isAdmin || available_balance_cents >= amountCents

    return {
      success: true,
      data: {
        allowed,
        ledger_balance_cents,
        available_balance_cents,
        requested_cents: amountCents,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error in checkOverdraftRisk'
    return { success: false, error: message }
  }
}

/**
 * Check whether a matter can be closed from a trust compliance perspective.
 *
 * A matter cannot be closed if any of the following are true:
 *   1. There is a positive trust balance remaining
 *   2. There are pending (unapproved) disbursement requests
 *   3. There are active holds on trust funds
 */
export async function checkMatterClosureCompliance(
  tenantId: string,
  matterId: string,
): Promise<ServiceResult<ClosureCompliance>> {
  try {
    const supabase = await getReadClient()
    const blockers: string[] = []

    // Run all three checks in parallel for performance
    const [balanceResult, disbursementsResult, holdsResult] = await Promise.all([
      // 1. Check for positive trust balance across all trust accounts for this matter
      (supabase as any)
        .from('trust_transactions')
        .select('trust_account_id, running_balance_cents')
        .eq('tenant_id', tenantId)
        .eq('matter_id', matterId)
        .order('created_at', { ascending: false }),

      // 2. Check for pending disbursement requests
      (supabase as any)
        .from('trust_disbursement_requests')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('matter_id', matterId)
        .in('status', ['pending_approval']),

      // 3. Check for active holds
      (supabase as any)
        .from('trust_holds')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('matter_id', matterId)
        .eq('status', 'held'),
    ])

    // 1. Evaluate trust balance — find the latest transaction per trust account
    if (balanceResult.error) {
      return { success: false, error: `Failed to check trust balance: ${balanceResult.error.message}` }
    }

    // Deduplicate: keep only the most recent transaction per trust account
    const latestByAccount = new Map<string, number>()
    for (const txn of balanceResult.data ?? []) {
      if (!latestByAccount.has(txn.trust_account_id)) {
        latestByAccount.set(txn.trust_account_id, Number(txn.running_balance_cents))
      }
    }

    for (const [, balance] of latestByAccount) {
      if (balance > 0) {
        blockers.push('Matter has a positive trust balance that must be disbursed or refunded before closure')
        break
      }
    }

    // 2. Evaluate pending disbursements
    if (disbursementsResult.error) {
      return { success: false, error: `Failed to check disbursements: ${disbursementsResult.error.message}` }
    }
    if ((disbursementsResult.count ?? 0) > 0) {
      blockers.push('Matter has pending disbursement requests that must be approved or cancelled')
    }

    // 3. Evaluate active holds
    if (holdsResult.error) {
      return { success: false, error: `Failed to check holds: ${holdsResult.error.message}` }
    }
    if ((holdsResult.count ?? 0) > 0) {
      blockers.push('Matter has active trust holds that must be released')
    }

    return {
      success: true,
      data: {
        canClose: blockers.length === 0,
        blockers,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error in checkMatterClosureCompliance'
    return { success: false, error: message }
  }
}

/**
 * Validate that a disbursement request is eligible for approval.
 *
 * Checks:
 *   1. The request exists and belongs to the tenant
 *   2. The request is in 'pending_approval' status
 *   3. Segregation of duties: the preparer and approver are different users
 */
export async function validateDisbursementAuthorization(
  tenantId: string,
  requestId: string,
  approverId?: string,
): Promise<ServiceResult<DisbursementValidation>> {
  try {
    const supabase = await getReadClient()
    const errors: string[] = []

    const { data: request, error: fetchError } = await (supabase as any)
      .from('trust_disbursement_requests')
      .select('id, status, prepared_by, tenant_id')
      .eq('id', requestId)
      .eq('tenant_id', tenantId)
      .single()

    if (fetchError || !request) {
      return {
        success: true,
        data: {
          valid: false,
          errors: ['Disbursement request not found or does not belong to this tenant'],
        },
      }
    }

    // Status check
    if (request.status !== 'pending_approval') {
      errors.push(
        `Request is in '${request.status}' status; only 'pending_approval' requests can be approved`,
      )
    }

    // Segregation of duties: preparer cannot be the approver
    if (approverId && request.prepared_by === approverId) {
      errors.push(
        'Segregation of duties violation: the preparer of a disbursement request cannot also approve it',
      )
    }

    return {
      success: true,
      data: {
        valid: errors.length === 0,
        errors,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error in validateDisbursementAuthorization'
    return { success: false, error: message }
  }
}

/**
 * Write an entry to the trust audit log.
 *
 * Uses the admin client (service_role) to bypass RLS, since audit log writes
 * are a service-layer concern that should succeed regardless of the user's
 * row-level permissions.
 */
export async function auditLog(params: AuditLogParams): Promise<ServiceResult<{ id: string }>> {
  try {
    const admin = createAdminClient()

    const { data, error } = await (admin as any)
      .from('trust_audit_log')
      .insert({
        tenant_id: params.tenantId,
        action: params.action,
        entity_type: params.entityType,
        entity_id: params.entityId,
        matter_id: params.matterId ?? null,
        user_id: params.userId,
        metadata: params.metadata ?? null,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error) {
      // Audit failures are logged but should not crash the calling operation.
      // In production, this would also fire an alert to the ops channel.
      console.error('[trust-audit-log] Insert failed:', error.message)
      return { success: false, error: `Audit log insert failed: ${error.message}` }
    }

    return { success: true, data: { id: data.id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error in auditLog'
    console.error('[trust-audit-log] Unexpected error:', message)
    return { success: false, error: message }
  }
}
