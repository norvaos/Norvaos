/**
 * TrustReconciler  -  Clio-to-Norva Balance Reconciliation (Directive 20.1)
 *
 * Compares trust balances between imported Clio data (stored as import metadata)
 * and the live Norva Ledger running balances. Any discrepancy > 0 cents triggers
 * a TRUST_MISMATCH alert persisted to the admin_alerts table.
 *
 * Goal: 100% financial accuracy for Law Society Form 9A compliance.
 *
 * Usage:
 *   const results = await reconcileClioMigration(supabase, tenantId)
 *   // results.mismatches → array of { matterId, clioBalance, norvaBalance, delta }
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from './trust-types'

// ── Types ────────────────────────────────────────────────────────────────────

export interface TrustMismatch {
  matterId: string
  matterTitle: string
  clioBalanceCents: number
  norvaBalanceCents: number
  deltaCents: number
  severity: 'exact' | 'minor' | 'major' | 'critical'
}

export interface ReconciliationReport {
  tenantId: string
  totalMatters: number
  matchedCount: number
  mismatchCount: number
  mismatches: TrustMismatch[]
  totalClioBalanceCents: number
  totalNorvaBalanceCents: number
  totalDeltaCents: number
  reconciledAt: string
  form9aCompliant: boolean
}

// ── Severity Thresholds ──────────────────────────────────────────────────────

function classifySeverity(deltaCents: number): TrustMismatch['severity'] {
  const abs = Math.abs(deltaCents)
  if (abs === 0) return 'exact'
  if (abs <= 100) return 'minor'       // <= $1.00
  if (abs <= 10000) return 'major'     // <= $100.00
  return 'critical'                     // > $100.00
}

// ── Main Reconciler ──────────────────────────────────────────────────────────

/**
 * Reconcile all migrated matters by comparing Clio import balances
 * against current Norva Ledger running balances.
 *
 * Clio balances are stored in:
 *   - matters.import_metadata.clio_trust_balance_cents (JSONB, set during import)
 *   - OR trust_transactions where description LIKE '%opening_balance%'
 *
 * Norva balances are the latest running_balance_cents from trust_transactions.
 */
export async function reconcileClioMigration(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  tenantId: string,
): Promise<ServiceResult<ReconciliationReport>> {
  try {
    // ── 1. Fetch all matters with trust activity ──────────────────────────

    const { data: mattersWithTrust, error: matterErr } = await supabase
      .from('matters')
      .select('id, title, trust_balance, import_metadata')
      .eq('tenant_id', tenantId)
      .not('trust_balance', 'is', null)

    if (matterErr) {
      return { success: false, error: `Failed to fetch matters: ${matterErr.message}` }
    }

    const matters = (mattersWithTrust ?? []) as Array<{
      id: string
      title: string
      trust_balance: number | null
      import_metadata: Record<string, unknown> | null
    }>

    // ── 2. For each matter, get the latest Norva ledger balance ──────────

    const mismatches: TrustMismatch[] = []
    let totalClioBalanceCents = 0
    let totalNorvaBalanceCents = 0
    let matchedCount = 0

    for (const matter of matters) {
      // Get latest running balance from trust_transactions
      const { data: latestTxn } = await supabase
        .from('trust_transactions')
        .select('running_balance_cents')
        .eq('matter_id', matter.id)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const norvaBalanceCents = Number(latestTxn?.running_balance_cents ?? matter.trust_balance ?? 0)

      // Resolve Clio balance from import_metadata or opening_balance transaction
      let clioBalanceCents = 0

      if (matter.import_metadata?.clio_trust_balance_cents != null) {
        clioBalanceCents = Number(matter.import_metadata.clio_trust_balance_cents)
      } else {
        // Fallback: look for opening_balance transaction
        const { data: openingTxn } = await supabase
          .from('trust_transactions')
          .select('amount_cents')
          .eq('matter_id', matter.id)
          .eq('tenant_id', tenantId)
          .eq('transaction_type', 'opening_balance')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (openingTxn) {
          clioBalanceCents = Number(openingTxn.amount_cents)
        } else {
          // No Clio reference  -  assume match (matter created natively in Norva)
          clioBalanceCents = norvaBalanceCents
        }
      }

      totalClioBalanceCents += clioBalanceCents
      totalNorvaBalanceCents += norvaBalanceCents

      const deltaCents = norvaBalanceCents - clioBalanceCents

      if (deltaCents === 0) {
        matchedCount++
      } else {
        mismatches.push({
          matterId: matter.id,
          matterTitle: matter.title ?? 'Untitled',
          clioBalanceCents,
          norvaBalanceCents,
          deltaCents,
          severity: classifySeverity(deltaCents),
        })
      }
    }

    // ── 3. Persist TRUST_MISMATCH alerts for any discrepancies ──────────

    if (mismatches.length > 0) {
      for (const m of mismatches) {
        await supabase
          .from('admin_alerts')
          .upsert({
            tenant_id: tenantId,
            alert_type: 'TRUST_MISMATCH',
            severity: m.severity,
            title: `Trust Balance Mismatch: ${m.matterTitle}`,
            description: `Clio: $${(m.clioBalanceCents / 100).toFixed(2)} → Norva: $${(m.norvaBalanceCents / 100).toFixed(2)} (Δ $${(m.deltaCents / 100).toFixed(2)})`,
            entity_type: 'matter',
            entity_id: m.matterId,
            status: 'open',
            metadata: {
              clio_balance_cents: m.clioBalanceCents,
              norva_balance_cents: m.norvaBalanceCents,
              delta_cents: m.deltaCents,
              reconciled_at: new Date().toISOString(),
            },
          }, {
            onConflict: 'tenant_id,alert_type,entity_id',
            ignoreDuplicates: false,
          })
      }
    }

    // ── 4. Build report ─────────────────────────────────────────────────

    const report: ReconciliationReport = {
      tenantId,
      totalMatters: matters.length,
      matchedCount,
      mismatchCount: mismatches.length,
      mismatches,
      totalClioBalanceCents,
      totalNorvaBalanceCents,
      totalDeltaCents: totalNorvaBalanceCents - totalClioBalanceCents,
      reconciledAt: new Date().toISOString(),
      form9aCompliant: mismatches.length === 0,
    }

    return { success: true, data: report }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error in reconcileClioMigration',
    }
  }
}
