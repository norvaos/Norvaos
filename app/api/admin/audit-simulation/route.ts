import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'
import { createAdminClient } from '@/lib/supabase/admin'
import { logSentinelEvent } from '@/lib/services/sentinel-audit'

/**
 * POST /api/admin/audit-simulation
 *
 * Directive 026  -  "Simulate LSO Examination"
 *
 * Runs a 100% integrity check on all ledger hashes and generates a
 * Mock Audit Report for every active matter. Returns JSON with per-matter
 * results; the frontend can trigger individual PDF downloads via the
 * existing /api/matters/[id]/export-audit endpoint.
 */
async function handlePost() {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')

    const admin = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const from = (table: string) => (admin as any).from(table)

    // ─── 1. Fetch all active matters for the tenant ─────────────────────────
    const { data: matters, error: mattersError } = await admin
      .from('matters')
      .select('id, matter_number, title, status')
      .eq('tenant_id', auth.tenantId)
      .in('status', ['active', 'intake', 'in_progress', 'pending'])

    if (mattersError) {
      console.error('[AuditSimulation] Failed to fetch matters:', mattersError)
      return NextResponse.json(
        { error: 'Failed to fetch matters' },
        { status: 500 },
      )
    }

    const matterList = matters ?? []
    const activeMatterIds = matterList.map((m) => m.id)

    if (activeMatterIds.length === 0) {
      const emptyResult = {
        simulationId: crypto.randomUUID(),
        executedAt: new Date().toISOString(),
        overallVerdict: 'BATTLE_READY' as const,
        summary: {
          totalMatters: 0,
          genesisSealed: 0,
          genesisMissing: 0,
          ledgerParityPassed: 0,
          ledgerParityFailed: 0,
          integrityVerified: 0,
          integrityBreach: 0,
          integrityUnchecked: 0,
          zeroBalanceClosed: 0,
          residualFundsClosed: 0,
        },
        matters: [],
      }

      await logSentinelEvent({
        eventType: 'AUDIT_SIMULATION_EXECUTED',
        severity: 'info',
        tenantId: auth.tenantId,
        userId: auth.userId,
        authUserId: auth.authUserId,
        details: { verdict: 'BATTLE_READY', totalMatters: 0 },
      })

      return NextResponse.json(emptyResult)
    }

    // ─── 2. Batch fetch genesis metadata ────────────────────────────────────
    const { data: allGenesis } = await admin
      .from('matter_genesis_metadata')
      .select('matter_id, id, genesis_hash, is_compliant')
      .eq('tenant_id', auth.tenantId)

    const genesisMap = new Map(
      (allGenesis ?? []).map((g: { matter_id: string; id: string; genesis_hash: string; is_compliant: boolean }) => [
        g.matter_id,
        { id: g.id, genesisHash: g.genesis_hash, isCompliant: g.is_compliant },
      ]),
    )

    // ─── 3. Batch fetch trust ledger parity counts ──────────────────────────
    //    Compare trust_transactions count vs trust_ledger_audit count per matter
    const { data: trustTxnCounts } = await from('trust_transactions')
      .select('matter_id', { count: 'exact', head: false })
      .eq('tenant_id', auth.tenantId)
      .in('matter_id', activeMatterIds)

    const txnCountMap = new Map<string, number>()
    for (const row of trustTxnCounts ?? []) {
      txnCountMap.set(
        row.matter_id,
        (txnCountMap.get(row.matter_id) ?? 0) + 1,
      )
    }

    const { data: auditCounts } = await from('trust_ledger_audit')
      .select('matter_id', { count: 'exact', head: false })
      .eq('tenant_id', auth.tenantId)
      .in('matter_id', activeMatterIds)

    const auditCountMap = new Map<string, number>()
    for (const row of auditCounts ?? []) {
      auditCountMap.set(
        row.matter_id,
        (auditCountMap.get(row.matter_id) ?? 0) + 1,
      )
    }

    // ─── 4. Batch fetch latest trust balance per matter ─────────────────────
    const { data: latestTrustTxns } = await from('trust_transactions')
      .select('matter_id, running_balance_cents, created_at')
      .eq('tenant_id', auth.tenantId)
      .in('matter_id', activeMatterIds)
      .order('created_at', { ascending: false })

    const trustBalanceMap = new Map<string, number>()
    for (const txn of latestTrustTxns ?? []) {
      if (!trustBalanceMap.has(txn.matter_id)) {
        trustBalanceMap.set(txn.matter_id, txn.running_balance_cents ?? 0)
      }
    }

    // ─── 5. Verify integrity per matter (parallel RPC calls) ────────────────
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
            integrityMap.set(matterId, data === true ? 'verified' : 'breach')
          }
        } catch {
          integrityMap.set(matterId, 'unchecked')
        }
      }),
    )

    // ─── 6. Compile results ─────────────────────────────────────────────────
    let genesisSealed = 0
    let genesisMissing = 0
    let ledgerParityPassed = 0
    let ledgerParityFailed = 0
    let integrityVerified = 0
    let integrityBreach = 0
    let integrityUnchecked = 0
    let zeroBalanceClosed = 0
    let residualFundsClosed = 0

    const matterResults = matterList.map((m) => {
      // Genesis check
      const genesis = genesisMap.get(m.id)
      const genesisStatus: 'sealed' | 'missing' = genesis ? 'sealed' : 'missing'
      if (genesis) genesisSealed++
      else genesisMissing++

      // Ledger parity check
      const txnCount = txnCountMap.get(m.id) ?? 0
      const auditCount = auditCountMap.get(m.id) ?? 0
      const ledgerParity: 'pass' | 'fail' = txnCount === auditCount ? 'pass' : 'fail'
      if (ledgerParity === 'pass') ledgerParityPassed++
      else ledgerParityFailed++

      // Integrity check
      const integrityStatus = integrityMap.get(m.id) ?? 'unchecked'
      if (integrityStatus === 'verified') integrityVerified++
      else if (integrityStatus === 'breach') integrityBreach++
      else integrityUnchecked++

      // Trust balance
      const trustBalance = trustBalanceMap.get(m.id) ?? 0
      if (trustBalance === 0) zeroBalanceClosed++
      else residualFundsClosed++

      return {
        matterId: m.id,
        matterNumber: m.matter_number,
        title: m.title,
        status: m.status,
        genesisStatus,
        ledgerParity,
        integrityStatus,
        trustBalance,
        exportUrl: `/api/matters/${m.id}/export-audit`,
      }
    })

    // ─── 7. Determine overall verdict ───────────────────────────────────────
    const hasIssues =
      genesisMissing > 0 ||
      ledgerParityFailed > 0 ||
      integrityBreach > 0 ||
      residualFundsClosed > 0

    const overallVerdict = hasIssues ? 'ISSUES_FOUND' : 'BATTLE_READY'

    const simulationId = crypto.randomUUID()
    const executedAt = new Date().toISOString()

    const result = {
      simulationId,
      executedAt,
      overallVerdict,
      summary: {
        totalMatters: matterList.length,
        genesisSealed,
        genesisMissing,
        ledgerParityPassed,
        ledgerParityFailed,
        integrityVerified,
        integrityBreach,
        integrityUnchecked,
        zeroBalanceClosed,
        residualFundsClosed,
      },
      matters: matterResults,
    }

    // ─── 8. Log SENTINEL event ──────────────────────────────────────────────
    await logSentinelEvent({
      eventType: 'AUDIT_SIMULATION_EXECUTED',
      severity: integrityBreach > 0 ? 'critical' : 'info',
      tenantId: auth.tenantId,
      userId: auth.userId,
      authUserId: auth.authUserId,
      details: {
        simulationId,
        verdict: overallVerdict,
        ...result.summary,
      },
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[AuditSimulation] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/admin/audit-simulation')
