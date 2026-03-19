/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Lead Conversion Gate — Legal/Compliance Gating Before Matter Creation
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Conversion is a controlled legal-operational state change, not a convenience
 * action. One lead → one matter. The originating lead is preserved, linked,
 * and auditable. Post-conversion, the lead becomes read-only.
 *
 * All gates must pass before conversion is allowed.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { ResolvedWorkflowConfig } from './workspace-config-service'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GateResult {
  gate: string
  label: string
  passed: boolean
  reason?: string
  /** Whether this gate is enabled in workspace config */
  enabled: boolean
}

export interface ConversionGateResult {
  canConvert: boolean
  blockedReasons: string[]
  gateResults: GateResult[]
}

// ─── Evaluate Conversion Gates ───────────────────────────────────────────────

/**
 * Evaluate all conversion gates for a lead.
 * Returns machine-readable gate results and human-readable blocked reasons.
 */
export async function evaluateConversionGates(
  supabase: SupabaseClient<Database>,
  leadId: string,
  tenantId: string,
  config: ResolvedWorkflowConfig
): Promise<ConversionGateResult> {
  const gates = config.activeConversionGates
  const results: GateResult[] = []

  // 1. Conflict Cleared
  if (gates.conflict_cleared) {
    const result = await checkConflictCleared(supabase, leadId, tenantId)
    results.push(result)
  }

  // 2. Retainer Signed
  if (gates.retainer_signed) {
    const result = await checkRetainerSigned(supabase, leadId)
    results.push(result)
  }

  // 3. Payment Received
  if (gates.payment_received) {
    const result = await checkPaymentReceived(supabase, leadId)
    results.push(result)
  }

  // 4. Intake Complete
  if (gates.intake_complete) {
    const result = await checkIntakeComplete(supabase, leadId)
    results.push(result)
  }

  // 5. ID Verification (if enabled)
  if (gates.id_verification) {
    const result = await checkIdVerification(supabase, leadId)
    results.push(result)
  }

  // 6. Required Documents (if enabled)
  if (gates.required_documents) {
    const result = await checkRequiredDocuments(supabase, leadId)
    results.push(result)
  }

  // 7. Lead not already converted (always enforced)
  const conversionCheck = await checkNotAlreadyConverted(supabase, leadId)
  results.push(conversionCheck)

  const blockedReasons = results
    .filter((r) => r.enabled && !r.passed)
    .map((r) => r.reason ?? r.label)

  return {
    canConvert: blockedReasons.length === 0,
    blockedReasons,
    gateResults: results,
  }
}

// ─── Individual Gate Checks ──────────────────────────────────────────────────

async function checkConflictCleared(
  supabase: SupabaseClient<Database>,
  leadId: string,
  tenantId: string
): Promise<GateResult> {
  // Check existing conflict engine results for the lead's contact
  const { data: lead } = await supabase
    .from('leads')
    .select('contact_id, conflict_status')
    .eq('id', leadId)
    .single()

  if (!lead) {
    return { gate: 'conflict_cleared', label: 'Conflict Check', passed: false, reason: 'Lead not found', enabled: true }
  }

  // auto_scan_complete = scan ran, score < 25, no significant matches
  // review_suggested   = score 25–49, minor matches, not blocking
  // cleared_by_lawyer  = lawyer reviewed and cleared
  // waiver_obtained    = waiver signed
  // review_required / conflict_confirmed / blocked = cannot convert
  const clearedStatuses = ['auto_scan_complete', 'review_suggested', 'cleared', 'cleared_by_lawyer', 'waiver_obtained']
  const status = lead.conflict_status ?? 'not_run'
  const passed = clearedStatuses.includes(status)

  const reasonMessages: Record<string, string> = {
    not_run: 'Conflict check has not been run yet. A scan will be run automatically when opening the matter.',
    review_required: 'Conflict check flagged potential conflicts. A lawyer must review before opening this matter.',
    conflict_confirmed: 'A conflict of interest has been confirmed. This matter cannot be opened.',
    blocked: 'This matter is blocked due to a confirmed conflict of interest.',
  }

  return {
    gate: 'conflict_cleared',
    label: 'Conflict Check',
    passed,
    reason: passed ? undefined : (reasonMessages[status] ?? `Conflict status "${status}" does not allow matter opening.`),
    enabled: true,
  }
}

async function checkRetainerSigned(
  supabase: SupabaseClient<Database>,
  leadId: string
): Promise<GateResult> {
  const { data: retainer } = await supabase
    .from('lead_retainer_packages')
    .select('status, signed_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const signedStatuses = ['signed', 'payment_pending', 'fully_retained']
  const passed = retainer ? signedStatuses.includes(retainer.status) : false

  return {
    gate: 'retainer_signed',
    label: 'Retainer Signed',
    passed,
    reason: passed ? undefined : retainer
      ? `Retainer status is "${retainer.status}" — the client must sign the retainer agreement before this lead can become a matter. Open the Retainer tab and send or re-send the retainer for signature.`
      : 'No retainer package found. Go to the Retainer tab, build a retainer package, send it to the client, and wait for them to sign.',
    enabled: true,
  }
}

async function checkPaymentReceived(
  supabase: SupabaseClient<Database>,
  leadId: string
): Promise<GateResult> {
  const { data: retainer } = await supabase
    .from('lead_retainer_packages')
    .select('payment_status')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const paidStatuses = ['paid', 'partial', 'waived']
  const passed = retainer ? paidStatuses.includes(retainer.payment_status) : false

  return {
    gate: 'payment_received',
    label: 'Payment Received',
    passed,
    reason: passed ? undefined : retainer
      ? `Payment status is "${retainer.payment_status}" — at least a partial payment must be recorded before opening a matter. Open the Retainer tab and click "Record Payment".`
      : 'No retainer package found. Go to the Retainer tab, build a retainer package, send it, and record payment once received.',
    enabled: true,
  }
}

async function checkIntakeComplete(
  supabase: SupabaseClient<Database>,
  leadId: string
): Promise<GateResult> {
  const { data: profile } = await supabase
    .from('lead_intake_profiles')
    .select('mandatory_fields_complete')
    .eq('lead_id', leadId)
    .maybeSingle()

  const passed = profile?.mandatory_fields_complete === true

  return {
    gate: 'intake_complete',
    label: 'Intake Complete',
    passed,
    reason: passed ? undefined : profile
      ? 'Mandatory intake fields are not complete.'
      : 'No intake profile found.',
    enabled: true,
  }
}

async function checkIdVerification(
  supabase: SupabaseClient<Database>,
  leadId: string
): Promise<GateResult> {
  const { data: retainer } = await supabase
    .from('lead_retainer_packages')
    .select('id_verification_status')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const passed = retainer?.id_verification_status === 'verified' || retainer?.id_verification_status === 'not_required'

  return {
    gate: 'id_verification',
    label: 'ID Verification',
    passed,
    reason: passed ? undefined : `ID verification status: "${retainer?.id_verification_status ?? 'unknown'}"`,
    enabled: true,
  }
}

async function checkRequiredDocuments(
  supabase: SupabaseClient<Database>,
  leadId: string
): Promise<GateResult> {
  const { data: retainer } = await supabase
    .from('lead_retainer_packages')
    .select('required_documents_status')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const passed = retainer?.required_documents_status === 'complete' || retainer?.required_documents_status === 'not_required'

  return {
    gate: 'required_documents',
    label: 'Required Documents',
    passed,
    reason: passed ? undefined : `Required documents status: "${retainer?.required_documents_status ?? 'unknown'}"`,
    enabled: true,
  }
}

async function checkNotAlreadyConverted(
  supabase: SupabaseClient<Database>,
  leadId: string
): Promise<GateResult> {
  const { data: lead } = await supabase
    .from('leads')
    .select('status, converted_matter_id')
    .eq('id', leadId)
    .single()

  const passed = lead?.status !== 'converted' && !lead?.converted_matter_id

  return {
    gate: 'not_already_converted',
    label: 'Not Already Converted',
    passed,
    reason: passed ? undefined : 'This lead has already been converted to a matter.',
    enabled: true,
  }
}
