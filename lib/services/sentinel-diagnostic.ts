/**
 * Sentinel Diagnostic Service  -  Session B: Support Integration
 *
 * Aggregates the Firm Health Matrix into a single JSON signature.
 * When a support ticket is opened, this signature is "Stamped" onto the ticket.
 * If the hash chain is broken → "SYSTEM BREACH DETECTED" status immediately.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ──────────────────────────────────────────────────────────────────

export type BreachStatus = 'INTEGRITY_VERIFIED' | 'SYSTEM_BREACH_DETECTED' | 'CHAIN_NOT_INITIALIZED'

export interface DiagnosticSignature {
  generated_at: string
  tenant_id: string
  signature_hash: string
  breach_status: BreachStatus
  matrix: {
    genesis_blocks: { total: number; compliant: number; revoked: number; sequence_violations: number }
    audit_chain: { entries: number; valid: boolean; broken_at_seq: number | null }
    trust_ledger: { total_transactions: number; last_audit_hash: string | null }
    conflict_engine: { total_scans: number; cleared: number; blocked: number }
    compliance_overrides: { active: number; revoked: number; total: number }
    sentinel_pulse: { active_triggers: number; shadow_matters: number }
    pii_scrub: { leads_scrubbed: number; leads_unscrubbed: number }
  }
  norva_version: string
}

// ─── Generate Diagnostic Payload ────────────────────────────────────────────

export async function generateDiagnosticSignature(
  tenantId: string,
): Promise<DiagnosticSignature> {
  const admin = createAdminClient()
  const sb = admin as SupabaseClient<any>

  // Run all queries in parallel for speed
  const [
    genesisResult,
    auditChainResult,
    trustResult,
    conflictResult,
    overrideResult,
    triggerResult,
    leadScrubResult,
  ] = await Promise.all([
    // Genesis blocks
    sb.from('matter_genesis_metadata')
      .select('is_compliant, is_revoked, has_sequence_violation')
      .eq('tenant_id', tenantId),

    // Audit chain
    sb.from('firm_global_audit_ledger')
      .select('chain_seq, event_hash, prev_hash')
      .eq('tenant_id', tenantId)
      .order('chain_seq', { ascending: true }),

    // Trust ledger
    sb.from('trust_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),

    // Conflict scans
    sb.from('global_conflict_results')
      .select('status')
      .eq('tenant_id', tenantId),

    // Compliance overrides
    sb.from('compliance_overrides')
      .select('is_active')
      .eq('tenant_id', tenantId),

    // Sentinel triggers
    sb.from('prospect_triggers')
      .select('status, shadow_matter_id')
      .eq('tenant_id', tenantId),

    // Lead PII scrub status
    sb.from('leads')
      .select('first_name, converted_matter_id')
      .eq('tenant_id', tenantId),
  ])

  // ── Process Genesis Blocks ─────────────────────────────────────────────
  const genesisRows = (genesisResult.data ?? []) as Array<{
    is_compliant: boolean; is_revoked: boolean; has_sequence_violation: boolean
  }>
  const genesisMatrix = {
    total: genesisRows.length,
    compliant: genesisRows.filter(r => r.is_compliant && !r.is_revoked).length,
    revoked: genesisRows.filter(r => r.is_revoked).length,
    sequence_violations: genesisRows.filter(r => r.has_sequence_violation).length,
  }

  // ── Process Audit Chain ────────────────────────────────────────────────
  const auditEntries = (auditChainResult.data ?? []) as Array<{
    chain_seq: number; event_hash: string; prev_hash: string
  }>

  let chainValid = true
  let brokenAtSeq: number | null = null

  if (auditEntries.length > 0) {
    if (auditEntries[0].prev_hash !== 'FIRM_SOVEREIGNTY_GENESIS_v1') {
      chainValid = false
      brokenAtSeq = 1
    } else {
      for (let i = 1; i < auditEntries.length; i++) {
        if (auditEntries[i].prev_hash !== auditEntries[i - 1].event_hash) {
          chainValid = false
          brokenAtSeq = auditEntries[i].chain_seq
          break
        }
      }
    }
  }

  const auditChain = {
    entries: auditEntries.length,
    valid: chainValid,
    broken_at_seq: brokenAtSeq,
  }

  // ── Trust Ledger ───────────────────────────────────────────────────────
  const trustLedger = {
    total_transactions: trustResult.count ?? 0,
    last_audit_hash: auditEntries.length > 0
      ? auditEntries[auditEntries.length - 1].event_hash
      : null,
  }

  // ── Conflict Engine ────────────────────────────────────────────────────
  const conflictRows = (conflictResult.data ?? []) as Array<{ status: string }>
  const conflictMatrix = {
    total_scans: conflictRows.length,
    cleared: conflictRows.filter(r => r.status === 'clear').length,
    blocked: conflictRows.filter(r => r.status === 'blocked').length,
  }

  // ── Compliance Overrides ───────────────────────────────────────────────
  const overrideRows = (overrideResult.data ?? []) as Array<{ is_active: boolean }>
  const overrideMatrix = {
    active: overrideRows.filter(r => r.is_active).length,
    revoked: overrideRows.filter(r => !r.is_active).length,
    total: overrideRows.length,
  }

  // ── Sentinel Pulse ─────────────────────────────────────────────────────
  const triggerRows = (triggerResult.data ?? []) as Array<{
    status: string; shadow_matter_id: string | null
  }>
  const sentinelPulse = {
    active_triggers: triggerRows.filter(r => r.status === 'active').length,
    shadow_matters: triggerRows.filter(r => r.shadow_matter_id != null).length,
  }

  // ── PII Scrub ─────────────────────────────────────────────────────────
  const leadRows = (leadScrubResult.data ?? []) as Array<{
    first_name: string | null; converted_matter_id: string | null
  }>
  const REDACTED = '[REDACTED  -  See Matter Record]'
  const piiScrub = {
    leads_scrubbed: leadRows.filter(r => r.first_name === REDACTED).length,
    leads_unscrubbed: leadRows.filter(r =>
      r.converted_matter_id != null && r.first_name !== REDACTED
    ).length,
  }

  // ── Determine Breach Status ────────────────────────────────────────────
  let breachStatus: BreachStatus
  if (auditEntries.length === 0) {
    breachStatus = 'CHAIN_NOT_INITIALIZED'
  } else if (!chainValid) {
    breachStatus = 'SYSTEM_BREACH_DETECTED'
  } else {
    breachStatus = 'INTEGRITY_VERIFIED'
  }

  // ── Build Matrix ──────────────────────────────────────────────────────
  const matrix = {
    genesis_blocks: genesisMatrix,
    audit_chain: auditChain,
    trust_ledger: trustLedger,
    conflict_engine: conflictMatrix,
    compliance_overrides: overrideMatrix,
    sentinel_pulse: sentinelPulse,
    pii_scrub: piiScrub,
  }

  // ── Compute signature hash ─────────────────────────────────────────────
  const payloadText = JSON.stringify({ tenant_id: tenantId, matrix, generated_at: new Date().toISOString() })
  let signatureHash: string

  if (typeof globalThis.crypto?.subtle !== 'undefined') {
    const encoder = new TextEncoder()
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(payloadText))
    signatureHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('')
  } else {
    const { createHash } = await import('crypto')
    signatureHash = createHash('sha256').update(payloadText).digest('hex')
  }

  return {
    generated_at: new Date().toISOString(),
    tenant_id: tenantId,
    signature_hash: signatureHash,
    breach_status: breachStatus,
    matrix,
    norva_version: '1.0.0-beta',
  }
}

// ─── Quick Breach Check ──────────────────────────────────────────────────────

export async function checkSystemBreach(
  supabase: SupabaseClient<any>,
  tenantId: string,
): Promise<{ breached: boolean; brokenAt?: number }> {
  const { data, error } = await supabase
    .from('firm_global_audit_ledger')
    .select('chain_seq, event_hash, prev_hash')
    .eq('tenant_id', tenantId)
    .order('chain_seq', { ascending: true })

  if (error || !data || data.length === 0) return { breached: false }

  const entries = data as Array<{ chain_seq: number; event_hash: string; prev_hash: string }>

  if (entries[0].prev_hash !== 'FIRM_SOVEREIGNTY_GENESIS_v1') {
    return { breached: true, brokenAt: 1 }
  }

  for (let i = 1; i < entries.length; i++) {
    if (entries[i].prev_hash !== entries[i - 1].event_hash) {
      return { breached: true, brokenAt: entries[i].chain_seq }
    }
  }

  return { breached: false }
}
