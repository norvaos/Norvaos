/**
 * risk-flag-engine.ts
 *
 * 12-type risk flag auto-detection engine.
 * Reads matter_immigration + matter_intake and writes to matter_risk_flags.
 * Called on every successful stage advance (fire-and-forget).
 * Can also be invoked in bulk via POST /api/matters/risk-flags/evaluate-all.
 *
 * Flag types (12):
 *  1.  PRIOR_REFUSAL                -  prior_refusals === true
 *  2.  STATUS_EXPIRY_IMMINENT       -  current_visa_expiry within 60 days
 *  3.  INADMISSIBILITY_INDICATOR    -  has_medical_issues === true
 *  4.  CRIMINAL_RECORD              -  has_criminal_record === true
 *  5.  TRAVEL_HISTORY_GAP           -  passport present but no country_of_residence
 *  6.  MISREPRESENTATION_RISK       -  intake contradiction_flags array non-empty
 *  7.  DOCUMENT_AUTHENTICITY        -  handled downstream by document rejection handler
 *  8.  FINANCIAL_INSUFFICIENCY      -  retainer_amount proxy < $500
 *  9.  MEDICAL_INADMISSIBILITY      -  covered by INADMISSIBILITY_INDICATOR (deduped)
 * 10.  RELATIONSHIP_GENUINENESS     -  sponsor_relationship set but no relationship_start_date
 * 11.  MINOR_INVOLVED               -  dependents_count > 0
 * 12.  CONCURRENT_APPLICATION       -  prior_refusals + active application_number
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// ── Public types ─────────────────────────────────────────────────────────────

export type RiskFlagType =
  | 'PRIOR_REFUSAL'
  | 'STATUS_EXPIRY_IMMINENT'
  | 'INADMISSIBILITY_INDICATOR'
  | 'CRIMINAL_RECORD'
  | 'TRAVEL_HISTORY_GAP'
  | 'MISREPRESENTATION_RISK'
  | 'DOCUMENT_AUTHENTICITY'
  | 'FINANCIAL_INSUFFICIENCY'
  | 'MEDICAL_INADMISSIBILITY'
  | 'RELATIONSHIP_GENUINENESS'
  | 'MINOR_INVOLVED'
  | 'CONCURRENT_APPLICATION'

// ── Internal types ────────────────────────────────────────────────────────────

interface DetectedFlag {
  flagType: RiskFlagType
  severity: 'low' | 'medium' | 'high' | 'critical'
  evidence: Record<string, unknown>
  suggestedAction: string
}

// ── Detection logic ───────────────────────────────────────────────────────────

function detectFlags(
  immigration: Record<string, unknown> | null,
  intake: Record<string, unknown> | null,
): DetectedFlag[] {
  const flags: DetectedFlag[] = []
  if (!immigration && !intake) return flags

  // 1. PRIOR_REFUSAL ────────────────────────────────────────────────────────
  if (immigration?.prior_refusals === true) {
    flags.push({
      flagType: 'PRIOR_REFUSAL',
      severity: 'high',
      evidence: {
        prior_refusals: true,
        details: immigration.prior_refusal_details ?? null,
      },
      suggestedAction:
        'Review refusal reasons. Prepare detailed response addressing prior refusal in cover letter.',
    })
  }

  // 2. STATUS_EXPIRY_IMMINENT ───────────────────────────────────────────────
  if (immigration?.current_visa_expiry) {
    const expiry = new Date(immigration.current_visa_expiry as string)
    const daysUntilExpiry = Math.floor(
      (expiry.getTime() - Date.now()) / 86_400_000,
    )
    if (daysUntilExpiry <= 60 && daysUntilExpiry >= 0) {
      flags.push({
        flagType: 'STATUS_EXPIRY_IMMINENT',
        severity: daysUntilExpiry <= 14 ? 'critical' : 'high',
        evidence: {
          current_visa_expiry: immigration.current_visa_expiry,
          days_remaining: daysUntilExpiry,
        },
        suggestedAction: `Status expires in ${daysUntilExpiry} days. File bridging application or extension immediately.`,
      })
    }
  }

  // 3. INADMISSIBILITY_INDICATOR (medical) ──────────────────────────────────
  if (immigration?.has_medical_issues === true) {
    flags.push({
      flagType: 'INADMISSIBILITY_INDICATOR',
      severity: 'high',
      evidence: {
        has_medical_issues: true,
        details: immigration.medical_issue_details ?? null,
      },
      suggestedAction:
        'Medical inadmissibility risk. Obtain upfront medical assessment and prepare A38 response strategy.',
    })
  }

  // 4. CRIMINAL_RECORD ──────────────────────────────────────────────────────
  if (immigration?.has_criminal_record === true) {
    flags.push({
      flagType: 'CRIMINAL_RECORD',
      severity: 'critical',
      evidence: {
        has_criminal_record: true,
        details: immigration.criminal_record_details ?? null,
      },
      suggestedAction:
        'Criminal inadmissibility. Assess eligibility for rehabilitation, TRP, or legal opinion letter.',
    })
  }

  // 5. TRAVEL_HISTORY_GAP ───────────────────────────────────────────────────
  // Proxy: passport present but country_of_residence absent suggests incomplete travel history
  if (immigration?.passport_number && !immigration?.country_of_residence) {
    flags.push({
      flagType: 'TRAVEL_HISTORY_GAP',
      severity: 'medium',
      evidence: {
        passport_present: true,
        country_of_residence: null,
      },
      suggestedAction:
        'Ensure complete travel history is documented. Gaps may trigger officer scrutiny.',
    })
  }

  // 6. MISREPRESENTATION_RISK ───────────────────────────────────────────────
  const contradictions = (intake?.contradiction_flags as unknown[]) ?? []
  if (Array.isArray(contradictions) && contradictions.length > 0) {
    flags.push({
      flagType: 'MISREPRESENTATION_RISK',
      severity: 'critical',
      evidence: {
        contradiction_count: contradictions.length,
        contradictions,
      },
      suggestedAction:
        'Resolve all contradictions before filing. Misrepresentation carries a 5-year bar.',
    })
  }

  // 7. DOCUMENT_AUTHENTICITY ────────────────────────────────────────────────
  // Intentionally not auto-detected here  -  handled downstream by the document
  // rejection handler which has access to reviewer decisions.

  // 8. FINANCIAL_INSUFFICIENCY ──────────────────────────────────────────────
  // Proxy: retainer_amount < $500 signals potential financial insufficiency risk
  if (
    immigration?.retainer_amount !== undefined &&
    immigration?.retainer_amount !== null &&
    (immigration.retainer_amount as number) < 500
  ) {
    flags.push({
      flagType: 'FINANCIAL_INSUFFICIENCY',
      severity: 'medium',
      evidence: { retainer_amount: immigration.retainer_amount },
      suggestedAction:
        'Review client financial documentation for sufficiency requirements.',
    })
  }

  // 9. MEDICAL_INADMISSIBILITY ──────────────────────────────────────────────
  // Covered by INADMISSIBILITY_INDICATOR above  -  deduplication intentional.

  // 10. RELATIONSHIP_GENUINENESS ────────────────────────────────────────────
  if (immigration?.sponsor_relationship && !immigration?.relationship_start_date) {
    flags.push({
      flagType: 'RELATIONSHIP_GENUINENESS',
      severity: 'medium',
      evidence: {
        sponsor_relationship: immigration.sponsor_relationship,
        relationship_start_date: null,
      },
      suggestedAction:
        'Document relationship history thoroughly. Missing start date triggers genuineness review.',
    })
  }

  // 11. MINOR_INVOLVED ──────────────────────────────────────────────────────
  if (
    immigration?.dependents_count !== undefined &&
    immigration?.dependents_count !== null &&
    (immigration.dependents_count as number) > 0
  ) {
    flags.push({
      flagType: 'MINOR_INVOLVED',
      severity: 'low',
      evidence: { dependents_count: immigration.dependents_count },
      suggestedAction:
        'Ensure custodial documents and additional consent forms are included for minors.',
    })
  }

  // 12. CONCURRENT_APPLICATION ──────────────────────────────────────────────
  // Proxy: prior refusal + active application_number → potential concurrent filing
  if (immigration?.prior_refusals === true && immigration?.application_number) {
    flags.push({
      flagType: 'CONCURRENT_APPLICATION',
      severity: 'high',
      evidence: {
        application_number: immigration.application_number,
        prior_refusals: true,
      },
      suggestedAction:
        'Disclose any concurrent or prior applications. Non-disclosure is misrepresentation.',
    })
  }

  return flags
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Evaluate all 12 risk flag types for a matter and upsert results into
 * matter_risk_flags.  Existing open flags of the same type are updated in
 * place; new flags are inserted.  Closed/resolved flags are never reopened.
 *
 * This function is intentionally fire-and-forget safe  -  it captures all
 * per-flag errors internally and returns a summary rather than throwing.
 */
export async function evaluateRiskFlags(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  matterId: string,
): Promise<{ evaluated: number; flagged: number; errors: string[] }> {
  const errors: string[] = []

  // Fetch immigration and intake rows in parallel
  const [{ data: immigration }, { data: intake }] = await Promise.all([
    supabase
      .from('matter_immigration')
      .select('*')
      .eq('matter_id', matterId)
      .maybeSingle(),
    supabase
      .from('matter_intake')
      .select('*')
      .eq('matter_id', matterId)
      .maybeSingle(),
  ])

  const detected = detectFlags(
    immigration as Record<string, unknown> | null,
    intake as Record<string, unknown> | null,
  )

  let flagged = 0

  for (const flag of detected) {
    try {
      // Check if an open flag of this type already exists
      const { data: existing } = await supabase
        .from('matter_risk_flags')
        .select('id')
        .eq('matter_id', matterId)
        .eq('flag_type', flag.flagType)
        .eq('status', 'open')
        .maybeSingle()

      if (existing) {
        // Update evidence on the existing open flag
        await supabase
          .from('matter_risk_flags')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update({
            evidence: flag.evidence as any,
            suggested_action: flag.suggestedAction,
            updated_at: new Date().toISOString(),
          } as any)
          .eq('id', existing.id)
      } else {
        // Insert a new auto-detected flag
        await supabase
          .from('matter_risk_flags')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert({
            tenant_id: tenantId,
            matter_id: matterId,
            flag_type: flag.flagType,
            severity: flag.severity,
            auto_detected: true,
            detected_at: new Date().toISOString(),
            status: 'open',
            evidence: flag.evidence as any,
            suggested_action: flag.suggestedAction,
          } as any)
        flagged++
      }
    } catch (e) {
      errors.push(`${flag.flagType}: ${e}`)
    }
  }

  return { evaluated: detected.length, flagged, errors }
}
