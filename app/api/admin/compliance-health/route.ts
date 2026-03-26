import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'
import { getRegionStatus } from '@/lib/supabase/region-guard'

/**
 * GET /api/admin/compliance-health
 *
 * Directive 006 — "In-House" Compliance Dashboard API
 *
 * Returns real-time health checks for:
 *   1. Region Lock — verifying ca-central-1
 *   2. Encryption Status — sampling PII columns for ciphertext
 *   3. Audit Parity — comparing trust_transactions vs trust_ledger_audit counts
 *   4. Sentinel Summary — recent security events
 */
async function handleGet() {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'view')

    const admin = createAdminClient()

    // Run all checks in parallel
    const [regionCheck, encryptionCheck, auditParity, sentinelSummary, hardeningIntegrity] =
      await Promise.all([
        checkRegion(),
        checkEncryption(admin, auth.tenantId),
        checkAuditParity(admin, auth.tenantId),
        checkSentinelSummary(admin, auth.tenantId),
        checkHardeningIntegrity(admin, auth.tenantId),
      ])

    // Compute overall health
    const checks = [regionCheck, encryptionCheck, auditParity]
    const overallStatus = checks.every((c) => c.status === 'pass')
      ? 'COMPLIANT'
      : checks.some((c) => c.status === 'fail')
        ? 'CRITICAL'
        : 'WARNING'

    return NextResponse.json({
      overallStatus,
      timestamp: new Date().toISOString(),
      checks: {
        regionLock: regionCheck,
        encryptionStatus: encryptionCheck,
        auditParity,
        sentinelSummary,
        hardeningIntegrity,
      },
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[ComplianceHealth] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── Check 1: Region Lock ──────────────────────────────────────────────────

async function checkRegion() {
  const region = getRegionStatus()
  return {
    name: 'Region Lock',
    status: region.verified ? 'pass' as const : 'fail' as const,
    details: {
      detected: region.region,
      required: region.required,
      environment: region.environment,
    },
    message: region.verified
      ? `Database confirmed in ${region.region ?? 'development mode'}`
      : `VIOLATION: Database region "${region.region}" is not ${region.required}`,
  }
}

// ─── Check 2: Encryption Status ────────────────────────────────────────────

async function checkEncryption(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
) {
  // Sample up to 5 contacts and check if encrypted columns contain ciphertext
  // Ciphertext format: hex:hex:hex (iv:authTag:ciphertext)
  const CIPHERTEXT_PATTERN = /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/i

  const { data: contacts, error } = await admin
    .from('contacts')
    .select('id, first_name, first_name_encrypted, last_name, last_name_encrypted, passport_number_encrypted')
    .eq('tenant_id', tenantId)
    .not('first_name', 'is', null)
    .limit(5)

  if (error) {
    return {
      name: 'PII Encryption',
      status: 'warn' as const,
      details: { error: error.message },
      message: 'Could not verify encryption status',
    }
  }

  if (!contacts || contacts.length === 0) {
    return {
      name: 'PII Encryption',
      status: 'pass' as const,
      details: { sampleSize: 0 },
      message: 'No contacts to verify (empty tenant)',
    }
  }

  let encryptedCount = 0
  let totalCheckable = 0
  const issues: string[] = []

  for (const c of contacts) {
    // Check if first_name has an encrypted counterpart
    if (c.first_name) {
      totalCheckable++
      const enc = (c as Record<string, unknown>).first_name_encrypted
      if (enc && typeof enc === 'string' && (CIPHERTEXT_PATTERN.test(enc) || enc.length > 40)) {
        encryptedCount++
      } else if (!enc) {
        issues.push(`Contact ${c.id}: first_name_encrypted is NULL`)
      }
    }

    if ((c as Record<string, unknown>).last_name) {
      totalCheckable++
      const enc = (c as Record<string, unknown>).last_name_encrypted
      if (enc && typeof enc === 'string' && (CIPHERTEXT_PATTERN.test(enc) || enc.length > 40)) {
        encryptedCount++
      } else if (!enc) {
        issues.push(`Contact ${c.id}: last_name_encrypted is NULL`)
      }
    }
  }

  const coverage = totalCheckable > 0 ? Math.round((encryptedCount / totalCheckable) * 100) : 100

  return {
    name: 'PII Encryption',
    status: coverage >= 90 ? 'pass' as const : coverage >= 50 ? 'warn' as const : 'fail' as const,
    details: {
      sampleSize: contacts.length,
      encryptedFields: encryptedCount,
      totalCheckable,
      coveragePercent: coverage,
      issues: issues.slice(0, 5),
    },
    message: coverage >= 90
      ? `${coverage}% of sampled PII fields are encrypted`
      : `WARNING: Only ${coverage}% of sampled PII fields are encrypted`,
  }
}

// ─── Check 3: Audit Parity ─────────────────────────────────────────────────

async function checkAuditParity(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const from = (table: string) => (admin as any).from(table)

  // Count trust_transactions
  const { count: txnCount, error: txnErr } = await from('trust_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)

  // Count trust_ledger_audit
  const { count: auditCount, error: auditErr } = await from('trust_ledger_audit')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)

  // Count trust_audit_log (legacy)
  const { count: legacyAuditCount } = await from('trust_audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)

  if (txnErr || auditErr) {
    return {
      name: 'Audit Parity',
      status: 'warn' as const,
      details: {
        error: txnErr?.message || auditErr?.message,
      },
      message: 'Could not verify audit parity (table may not exist yet — run migration 200)',
    }
  }

  const transactions = txnCount ?? 0
  const audits = auditCount ?? 0
  const isParity = transactions === audits

  return {
    name: 'Audit Parity',
    status: isParity ? 'pass' as const : 'fail' as const,
    details: {
      trustTransactions: transactions,
      trustLedgerAudit: audits,
      trustAuditLog: legacyAuditCount ?? 0,
      delta: transactions - audits,
    },
    message: isParity
      ? `Perfect parity: ${transactions} transactions = ${audits} audit entries`
      : `MISMATCH: ${transactions} transactions vs ${audits} audit entries (delta: ${transactions - audits})`,
  }
}

// ─── Check 4: Sentinel Summary ─────────────────────────────────────────────

async function checkSentinelSummary(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const from = (table: string) => (admin as any).from(table)

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Get recent events grouped by severity
  const { data: recentEvents } = await from('sentinel_audit_log')
    .select('id, event_type, severity, created_at')
    .eq('tenant_id', tenantId)
    .gte('created_at', twentyFourHoursAgo)
    .order('created_at', { ascending: false })
    .limit(100)

  const events = (recentEvents ?? []) as Array<{
    id: string
    event_type: string
    severity: string
    created_at: string
  }>

  const bySeverity = {
    breach: events.filter((e) => e.severity === 'breach').length,
    critical: events.filter((e) => e.severity === 'critical').length,
    warning: events.filter((e) => e.severity === 'warning').length,
    info: events.filter((e) => e.severity === 'info').length,
  }

  const byType: Record<string, number> = {}
  for (const e of events) {
    byType[e.event_type] = (byType[e.event_type] ?? 0) + 1
  }

  return {
    name: 'Sentinel Summary (24h)',
    totalEvents: events.length,
    bySeverity,
    byType,
    latestEvent: events[0] ?? null,
  }
}

// ─── Check 5: Data Hardening Integrity (Directive 019) ────────────────────

async function checkHardeningIntegrity(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const from = (table: string) => (admin as any).from(table)

  // 1. Gaps Closed — count of document slots that went from 'empty' to 'accepted'
  //    (slots with current_version > 0 and status = 'accepted' are closed gaps)
  const { count: gapsClosed } = await from('document_slots')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'accepted')
    .eq('is_required', true)
    .gt('current_version', 0)

  // 2. Total required gaps (all required slots)
  const { count: totalGaps } = await from('document_slots')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('is_required', true)
    .eq('is_active', true)

  // 3. Inconsistencies Pre-empted — SENTINEL events where OCR/manual mismatch was flagged
  //    Look for OCR_MISMATCH, CONTRADICTION_DETECTED, FIELD_VERIFICATION_MISMATCH events
  const { count: inconsistenciesPreempted } = await from('sentinel_audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .in('event_type', ['OCR_MISMATCH', 'CONTRADICTION_DETECTED', 'FIELD_VERIFICATION_MISMATCH', 'DATA_CORRECTION'])

  // 4. Genesis blocks sealed
  const { count: genesisSealed } = await from('matter_genesis_metadata')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)

  // 5. Compliant genesis blocks
  const { count: genesisCompliant } = await from('matter_genesis_metadata')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('is_compliant', true)

  // 6. Documents with verified integrity
  const { count: docsVerified } = await from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('tamper_status', 'verified')

  // 7. Documents with tamper detected
  const { count: docsTampered } = await from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('tamper_status', 'tampered')

  return {
    name: 'Data Hardening Integrity',
    totalGapsClosed: gapsClosed ?? 0,
    totalGaps: totalGaps ?? 0,
    gapClosureRate: (totalGaps ?? 0) > 0
      ? Math.round(((gapsClosed ?? 0) / (totalGaps ?? 1)) * 100)
      : 100,
    inconsistenciesPreempted: inconsistenciesPreempted ?? 0,
    genesisBlocksSealed: genesisSealed ?? 0,
    genesisBlocksCompliant: genesisCompliant ?? 0,
    documentsVerified: docsVerified ?? 0,
    documentsTampered: docsTampered ?? 0,
  }
}

export const GET = withTiming(handleGet, 'GET /api/admin/compliance-health')
