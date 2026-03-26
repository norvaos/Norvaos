import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { withTiming } from '@/lib/middleware/request-timing'
import type { RuleType } from '@/lib/types/database'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Hash Helper ───────────────────────────────────────────────────────────────

function sortedStringify(value: unknown): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return JSON.stringify(value)
  }
  const sorted = Object.keys(value as Record<string, unknown>).sort()
  const parts = sorted.map(
    (k) => `${JSON.stringify(k)}:${sortedStringify((value as Record<string, unknown>)[k])}`
  )
  return `{${parts.join(',')}}`
}

function hashObject(data: Record<string, unknown>): string {
  const stable = sortedStringify(data)
  return createHash('sha256').update(stable).digest('hex')
}

// ── Drift Response Types ──────────────────────────────────────────────────────

interface DriftedMatter {
  matter_id: string
  matter_number: string | null
  drifted_rules: RuleType[]
}

interface DriftResponse {
  matters: DriftedMatter[]
  checked_at: string
  total_drifted: number
}

// ── Route Handler ─────────────────────────────────────────────────────────────

/**
 * GET /api/admin/rule-snapshots/drift
 *
 * Admin-only endpoint that identifies matters where the current matter_type
 * config differs from the snapshot captured at matter creation.
 *
 * Returns: { matters: [{ matter_id, matter_number, drifted_rules }] }
 */
async function handleGet(_request: Request) {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()

    // Require admin-level permission: settings:edit is the admin gate in NorvaOS
    if (!auth.role?.is_system) {
      // Non-system roles must have explicit settings:edit permission
      const perms = auth.role?.permissions ?? {}
      const settingsPerms = (perms['settings'] ?? {}) as Record<string, boolean>
      if (!settingsPerms['edit']) {
        return NextResponse.json(
          { success: false, error: 'Admin access required' },
          { status: 403 }
        )
      }
    }

    // Fetch all snapshots for the tenant (rule_type = matter_type_config only for now  - 
    // the config hash is the canonical drift signal for all 6 rule types).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: snapshots, error: snapshotErr } = await (admin as any)
      .from('matter_rule_snapshots')
      .select('matter_id, rule_type, version_hash, snapshot_data')
      .eq('tenant_id', auth.tenantId)

    if (snapshotErr) {
      console.error('[drift] Snapshot fetch error:', snapshotErr)
      return NextResponse.json({ success: false, error: 'Failed to fetch snapshots' }, { status: 500 })
    }

    if (!snapshots || snapshots.length === 0) {
      const response: DriftResponse = { matters: [], checked_at: new Date().toISOString(), total_drifted: 0 }
      return NextResponse.json(response, { status: 200 })
    }

    // Collect unique matter_ids
    const matterIds: string[] = [...new Set<string>(snapshots.map((s: { matter_id: string }) => s.matter_id))]

    // Fetch matter numbers for the drifted matters
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: matters } = await (admin as any)
      .from('matters')
      .select('id, matter_number, matter_type_id')
      .in('id', matterIds)
      .eq('tenant_id', auth.tenantId)

    const matterMap = new Map<string, { matter_number: string | null; matter_type_id: string | null }>(
      (matters ?? []).map((m: { id: string; matter_number: string | null; matter_type_id: string | null }) => [
        m.id,
        { matter_number: m.matter_number, matter_type_id: m.matter_type_id },
      ])
    )

    // Collect unique matter_type_ids and fetch current configs
    const matterTypeIds: string[] = [
      ...new Set<string>(
        (matters ?? [])
          .map((m: { matter_type_id: string | null }) => m.matter_type_id)
          .filter((id: string | null): id is string => id != null)
      ),
    ]

    // Fetch current matter_type configs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: matterTypes } = matterTypeIds.length > 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? await (admin as any)
          .from('matter_types')
          .select('*')
          .in('id', matterTypeIds)
      : { data: [] }

    const matterTypeHashMap = new Map<string, string>(
      (matterTypes ?? []).map((mt: Record<string, unknown>) => [
        mt['id'] as string,
        hashObject(mt),
      ])
    )

    // Build per-matter snapshot lookup: matter_id → { rule_type → snapshot }
    const snapshotsByMatter = new Map<string, Map<string, { version_hash: string; snapshot_data: Record<string, unknown> }>>()
    for (const snap of snapshots as Array<{ matter_id: string; rule_type: string; version_hash: string; snapshot_data: Record<string, unknown> }>) {
      if (!snapshotsByMatter.has(snap.matter_id)) {
        snapshotsByMatter.set(snap.matter_id, new Map())
      }
      snapshotsByMatter.get(snap.matter_id)!.set(snap.rule_type, {
        version_hash: snap.version_hash,
        snapshot_data: snap.snapshot_data,
      })
    }

    // Evaluate drift per matter
    const driftedMatters: DriftedMatter[] = []

    for (const [matterId, ruleSnapshots] of snapshotsByMatter) {
      const matterInfo = matterMap.get(matterId)
      if (!matterInfo?.matter_type_id) continue

      const currentMatterTypeHash = matterTypeHashMap.get(matterInfo.matter_type_id)
      if (!currentMatterTypeHash) continue

      const driftedRules: RuleType[] = []

      // Check matter_type_config drift (primary signal)
      const matterTypeConfigSnap = ruleSnapshots.get('matter_type_config')
      if (matterTypeConfigSnap && matterTypeConfigSnap.version_hash !== currentMatterTypeHash) {
        driftedRules.push('matter_type_config')
        // Treat SLA, billing, and form pack as drifted when config drifts
        if (ruleSnapshots.has('sla_config'))       driftedRules.push('sla_config')
        if (ruleSnapshots.has('billing_config'))    driftedRules.push('billing_config')
        if (ruleSnapshots.has('form_pack_config'))  driftedRules.push('form_pack_config')
      }

      if (driftedRules.length > 0) {
        driftedMatters.push({
          matter_id:     matterId,
          matter_number: matterInfo.matter_number,
          drifted_rules: driftedRules,
        })
      }
    }

    const response: DriftResponse = {
      matters:       driftedMatters,
      checked_at:    new Date().toISOString(),
      total_drifted: driftedMatters.length,
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    console.error('[rule-snapshots/drift] Error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/admin/rule-snapshots/drift')
