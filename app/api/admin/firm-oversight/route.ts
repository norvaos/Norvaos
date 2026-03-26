import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/admin/firm-oversight
 *
 * Directive 025 — Firm Oversight Dashboard ("5-Second Health Check")
 *
 * Returns a grid of all active matters split into:
 *   - Hardened (Genesis Sealed) vs Soft (In-Progress)
 *   - Trust ledger integrity status per matter
 *   - Overall firm health summary
 */
async function handleGet() {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'view')

    const admin = createAdminClient()

    // ─── 1. Fetch all active matters ──────────────────────────────────────────
    const { data: matters, error: mattersError } = await admin
      .from('matters')
      .select('id, matter_number, title, status, created_at')
      .eq('tenant_id', auth.tenantId)
      .in('status', ['active', 'intake', 'in_progress', 'pending'])

    if (mattersError) {
      console.error('[FirmOversight] Failed to fetch matters:', mattersError)
      return NextResponse.json(
        { error: 'Failed to fetch matters' },
        { status: 500 },
      )
    }

    const activeMatterIds = (matters ?? []).map((m) => m.id)

    if (activeMatterIds.length === 0) {
      return NextResponse.json({
        timestamp: new Date().toISOString(),
        summary: {
          totalActive: 0,
          hardened: 0,
          soft: 0,
          integrityBreaches: 0,
        },
        matters: [],
      })
    }

    // ─── 2. Batch fetch genesis metadata ──────────────────────────────────────
    const { data: allGenesis } = await admin
      .from('matter_genesis_metadata')
      .select('matter_id, id, genesis_hash, is_compliant')
      .eq('tenant_id', auth.tenantId)

    const genesisMap = new Map(
      (allGenesis ?? []).map((g) => [
        g.matter_id,
        { id: g.id, genesisHash: g.genesis_hash, isCompliant: g.is_compliant },
      ]),
    )

    // ─── 3. Batch fetch latest trust balance per matter ───────────────────────
    //    Get the most recent trust_transaction per matter for its running_balance_cents.
    //    We fetch all transactions for active matters, ordered by created_at desc,
    //    then pick the first per matter.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const from = (table: string) => (admin as any).from(table)

    const { data: latestTrustTxns } = await from('trust_transactions')
      .select('matter_id, running_balance_cents, created_at')
      .eq('tenant_id', auth.tenantId)
      .in('matter_id', activeMatterIds)
      .order('created_at', { ascending: false })

    const trustBalanceMap = new Map<string, number>()
    for (const txn of latestTrustTxns ?? []) {
      // Only keep the first (most recent) per matter
      if (!trustBalanceMap.has(txn.matter_id)) {
        trustBalanceMap.set(txn.matter_id, txn.running_balance_cents ?? 0)
      }
    }

    // ─── 4. Verify integrity per matter (batch RPC calls) ─────────────────────
    const integrityMap = new Map<string, 'verified' | 'breach' | 'unchecked'>()

    await Promise.all(
      activeMatterIds.map(async (matterId) => {
        try {
          const { data, error } = await (admin as any).rpc(
            'verify_trust_ledger_audit_integrity',
            { p_matter_id: matterId },
          )
          if (error) {
            integrityMap.set(matterId, 'unchecked')
          } else {
            // RPC returns true for intact, false for breach
            integrityMap.set(matterId, data === true ? 'verified' : 'breach')
          }
        } catch {
          integrityMap.set(matterId, 'unchecked')
        }
      }),
    )

    // ─── 5. Assemble response ─────────────────────────────────────────────────
    let hardened = 0
    let soft = 0
    let integrityBreaches = 0

    const matterResults = (matters ?? []).map((m) => {
      const genesis = genesisMap.get(m.id)
      const category = genesis ? 'hardened' : 'soft'
      const integrityStatus = integrityMap.get(m.id) ?? 'unchecked'

      if (category === 'hardened') hardened++
      else soft++

      if (integrityStatus === 'breach') integrityBreaches++

      return {
        id: m.id,
        matterNumber: m.matter_number,
        title: m.title,
        status: m.status,
        category,
        genesisHash: genesis?.genesisHash ?? null,
        isCompliant: genesis?.isCompliant ?? null,
        trustBalance: trustBalanceMap.get(m.id) ?? 0,
        integrityStatus,
        createdAt: m.created_at,
      }
    })

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      summary: {
        totalActive: matterResults.length,
        hardened,
        soft,
        integrityBreaches,
      },
      matters: matterResults,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[FirmOversight] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/admin/firm-oversight')
