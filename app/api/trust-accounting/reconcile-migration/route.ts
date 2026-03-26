/**
 * POST /api/trust-accounting/reconcile-migration
 *
 * Clio-to-Norva Trust Reconciliation (Directive 20.1)
 *
 * Runs the TrustReconciler against all migrated matters, comparing
 * Clio import balances to live Norva Ledger running balances.
 *
 * Any mismatch is flagged as a TRUST_MISMATCH alert in admin_alerts.
 * Returns a full reconciliation report for Form 9A compliance.
 */

import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { reconcileClioMigration } from '@/lib/services/trust-accounting/trust-reconciler'

export async function POST() {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()

    const result = await reconcileClioMigration(admin, auth.tenantId)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      report: result.data,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }
    console.error('[reconcile-migration] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Reconciliation failed' },
      { status: 500 },
    )
  }
}
