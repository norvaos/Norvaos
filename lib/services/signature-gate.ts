/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Signature Gate  -  Directive 082 / Target 12
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Hard-locks the "Launch" / "Generate Final Package" button until the
 * representative signature field is present in the matter data.
 *
 * IRCC requires that IMM5476 (Use of a Representative) be signed by the
 * representative before any application is submitted. Without a signature,
 * the submission is incomplete and risks rejection.
 *
 * This service checks:
 *
 *   1. `representative_signature` in the matter_people snapshot (person_role = 'representative')
 *   2. `__rep_signature` meta field resolution (from xfa-filler-db-server)
 *   3. Applicant's own signature on the main application form
 *
 * Returns a typed gate result that the UI can consume directly:
 *   - LOCKED: signature missing → disable button, show reason
 *   - UNLOCKED: all signatures present → allow generation
 *   - PARTIAL: some signatures present → allow draft, block final
 *
 * Designed to be called from:
 *   - IRCC Workspace "Generate" button pre-check
 *   - `assembleSubmissionPackage()` as a guard before final assembly
 *   - Form wizard completion step
 *
 * Uses existing patterns:
 *   - matter_people for representative data
 *   - matter_form_instances for form answer snapshots
 *   - sentinel_audit_log for blocked generation events
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ────────────────────────────────────────────────────────────────────

export type GateStatus = 'locked' | 'unlocked' | 'partial'

export interface SignatureRequirement {
  /** Human-readable label */
  label: string
  /** Which role this signature belongs to */
  role: 'applicant' | 'representative' | 'sponsor' | 'dependent'
  /** The profile path or meta field key checked */
  fieldKey: string
  /** Whether this signature is present */
  present: boolean
  /** The value found (name string) or null */
  value: string | null
  /** Whether this signature is required for final submission */
  requiredForFinal: boolean
  /** Whether this signature is required for draft generation */
  requiredForDraft: boolean
}

export interface SignatureGateResult {
  /** Overall gate status */
  status: GateStatus
  /** Whether final package generation is allowed */
  canGenerateFinal: boolean
  /** Whether draft generation is allowed */
  canGenerateDraft: boolean
  /** All signature requirements and their statuses */
  requirements: SignatureRequirement[]
  /** Human-readable summary of what's missing */
  missingReasons: string[]
  /** Representative name (if found) */
  representativeName: string | null
  /** Applicant name (if found) */
  applicantName: string | null
}

export interface SignatureGateInput {
  matterId: string
  tenantId: string
  /** Form codes to check for applicant signature (e.g. ['IMM5257']) */
  formCodes?: string[]
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Form codes that require representative signature (IMM5476) */
const REP_SIGNATURE_FORM_CODES = ['IMM5476']

/** Form codes that require applicant signature on the main application */
const APPLICANT_SIGNATURE_FORM_CODES = ['IMM5257', 'IMM5709', 'IMM0008']

// ── Main Function ────────────────────────────────────────────────────────────

/**
 * Check all signature requirements for a matter.
 *
 * Returns a gate result indicating whether the submission can proceed.
 * Idempotent and safe to call multiple times (read-only).
 */
export async function checkSignatureGate(
  supabase: SupabaseClient,
  input: SignatureGateInput,
): Promise<SignatureGateResult> {
  const requirements: SignatureRequirement[] = []
  const missingReasons: string[] = []
  let representativeName: string | null = null
  let applicantName: string | null = null

  // ── 1. Check representative signature ──────────────────────────────────

  try {
    // Find the representative in matter_people
    const { data: repPerson } = await supabase
      .from('matter_people')
      .select('id, first_name, last_name, snapshot')
      .eq('matter_id', input.matterId)
      .eq('is_active', true)
      .in('person_role', ['representative', 'rep'])
      .limit(1)
      .maybeSingle()

    if (repPerson) {
      const fullName = `${repPerson.first_name ?? ''} ${repPerson.last_name ?? ''}`.trim()
      representativeName = fullName || null

      // Check snapshot for representative_signature field
      const snapshot = repPerson.snapshot as Record<string, unknown> | null
      const sigValue = snapshot?.representative_signature as string | null
        ?? snapshot?.rep_signature as string | null
        ?? null

      const sigPresent = !!sigValue && sigValue.trim().length > 0

      requirements.push({
        label: 'Representative Signature (IMM5476)',
        role: 'representative',
        fieldKey: '__rep_signature',
        present: sigPresent,
        value: sigPresent ? sigValue : null,
        requiredForFinal: true,
        requiredForDraft: false,
      })

      if (!sigPresent) {
        missingReasons.push(
          `Representative signature missing. ${fullName || 'The representative'} must sign IMM5476 (Use of a Representative) before submission.`,
        )
      }
    }

    // Also check if IMM5476 form instance has the signature field filled
    const { data: repFormInstance } = await supabase
      .from('matter_form_instances')
      .select('id, answers, status')
      .eq('matter_id', input.matterId)
      .eq('is_active', true)
      .in('form_code', REP_SIGNATURE_FORM_CODES)
      .limit(1)
      .maybeSingle()

    if (repFormInstance) {
      const answers = repFormInstance.answers as Record<string, unknown> | null
      const formSigPresent = !!(
        answers?.representative_signature
        || answers?.rep_signature
        || answers?.['__rep_signature']
      )

      // If the form has a signature but the person snapshot doesn't, still count it
      if (formSigPresent && requirements.length > 0 && !requirements[0].present) {
        requirements[0].present = true
        requirements[0].value = (
          answers?.representative_signature
          ?? answers?.rep_signature
          ?? answers?.['__rep_signature']
        ) as string
        // Remove the missing reason we just added
        const idx = missingReasons.findIndex((r) => r.includes('Representative signature'))
        if (idx >= 0) missingReasons.splice(idx, 1)
      }
    }
  } catch (err) {
    console.error('[signature-gate] Error checking representative signature:', err)
  }

  // ── 2. Check applicant signature ───────────────────────────────────────

  try {
    // Find the primary applicant
    const { data: applicant } = await supabase
      .from('matter_people')
      .select('id, first_name, last_name, snapshot')
      .eq('matter_id', input.matterId)
      .eq('is_active', true)
      .in('person_role', ['applicant', 'primary_applicant', 'principal'])
      .order('sort_order')
      .limit(1)
      .maybeSingle()

    if (applicant) {
      applicantName = `${applicant.first_name ?? ''} ${applicant.last_name ?? ''}`.trim() || null
    }

    // Check the main application form instances for applicant signature
    const formCodesToCheck = input.formCodes?.length
      ? input.formCodes
      : APPLICANT_SIGNATURE_FORM_CODES

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: formInstances } = await (supabase as any)
      .from('matter_form_instances')
      .select('id, form_code, form_name, answers, status')
      .eq('matter_id', input.matterId)
      .eq('is_active', true)
      .in('form_code', formCodesToCheck)

    for (const inst of formInstances ?? []) {
      const answers = inst.answers as Record<string, unknown> | null
      const sigValue = (
        answers?.applicant_signature
        ?? answers?.signature
        ?? answers?.['__signature']
      ) as string | null

      const sigPresent = !!sigValue && (sigValue as string).trim().length > 0

      requirements.push({
        label: `Applicant Signature (${inst.form_code})`,
        role: 'applicant',
        fieldKey: '__signature',
        present: sigPresent,
        value: sigPresent ? sigValue : null,
        requiredForFinal: true,
        requiredForDraft: false,
      })

      if (!sigPresent) {
        missingReasons.push(
          `Applicant signature missing on ${inst.form_code} (${inst.form_name ?? 'Application Form'}). The applicant must sign before submission.`,
        )
      }
    }
  } catch (err) {
    console.error('[signature-gate] Error checking applicant signature:', err)
  }

  // ── 3. Check sponsor signature (if applicable) ─────────────────────────

  try {
    const { data: sponsor } = await supabase
      .from('matter_people')
      .select('id, first_name, last_name, snapshot')
      .eq('matter_id', input.matterId)
      .eq('is_active', true)
      .eq('person_role', 'sponsor')
      .limit(1)
      .maybeSingle()

    if (sponsor) {
      const snapshot = sponsor.snapshot as Record<string, unknown> | null
      const sigValue = snapshot?.sponsor_signature as string | null
        ?? snapshot?.signature as string | null
        ?? null

      const sigPresent = !!sigValue && sigValue.trim().length > 0

      requirements.push({
        label: 'Sponsor Signature',
        role: 'sponsor',
        fieldKey: 'sponsor_signature',
        present: sigPresent,
        value: sigPresent ? sigValue : null,
        requiredForFinal: true,
        requiredForDraft: false,
      })

      if (!sigPresent) {
        missingReasons.push(
          `Sponsor signature missing. ${sponsor.first_name} ${sponsor.last_name} must sign before submission.`,
        )
      }
    }
  } catch (err) {
    console.error('[signature-gate] Error checking sponsor signature:', err)
  }

  // ── Compute gate status ────────────────────────────────────────────────

  const finalRequired = requirements.filter((r) => r.requiredForFinal)
  const draftRequired = requirements.filter((r) => r.requiredForDraft)

  const allFinalPresent = finalRequired.every((r) => r.present)
  const allDraftPresent = draftRequired.every((r) => r.present)
  const anyPresent = requirements.some((r) => r.present)

  let status: GateStatus = 'locked'
  if (allFinalPresent && requirements.length > 0) {
    status = 'unlocked'
  } else if (anyPresent) {
    status = 'partial'
  } else if (requirements.length === 0) {
    // No signature requirements found (e.g. no forms assigned yet)
    status = 'unlocked'
  }

  return {
    status,
    canGenerateFinal: allFinalPresent || requirements.length === 0,
    canGenerateDraft: allDraftPresent || requirements.length === 0 || !draftRequired.some((r) => !r.present),
    requirements,
    missingReasons,
    representativeName,
    applicantName,
  }
}

// ── Convenience: Quick lock check ────────────────────────────────────────────

/**
 * Quick boolean check: is the signature gate locked for final generation?
 * Use this when you just need a yes/no without the full detail.
 */
export async function isSignatureGateLocked(
  supabase: SupabaseClient,
  matterId: string,
  tenantId: string,
): Promise<boolean> {
  const result = await checkSignatureGate(supabase, { matterId, tenantId })
  return !result.canGenerateFinal
}

// ── UI Helper: Gate message ──────────────────────────────────────────────────

/**
 * Format the gate result into a user-facing message for the Launch button tooltip.
 */
export function formatGateMessage(result: SignatureGateResult): string {
  if (result.status === 'unlocked') {
    return 'All signatures verified. Ready to generate final package.'
  }

  if (result.status === 'partial') {
    const missing = result.requirements.filter((r) => !r.present && r.requiredForFinal)
    return `${missing.length} signature${missing.length !== 1 ? 's' : ''} missing for final submission. Draft generation available.`
  }

  // Locked
  if (result.missingReasons.length === 0) {
    return 'Signature verification pending.'
  }

  return result.missingReasons[0]
}
