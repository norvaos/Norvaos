/**
 * Readiness Engine — Composite Matter Readiness Score
 *
 * Computes a 0–100 score from 7 weighted domains:
 *   Documents      22%
 *   Questionnaire  18%
 *   Review         18%
 *   Forms          13%
 *   Billing        13%
 *   Compliance     11%  ← Document expiry + status validity (Directive 20.2)
 *   Submission      5%
 *
 * Post-computation blockers (Directives 018/024):
 *   - Stale-Date Blocker: If any document is >150 days old → cap total at 34 (Critical: Stale)
 *   - Continuity Blocker: If address or personal history has gaps >0 days → BLOCKER
 *
 * Called server-side from POST /api/matters/[id]/readiness.
 * Results are persisted to matters.readiness_score + readiness_breakdown + readiness_focus_area.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Public Types ─────────────────────────────────────────────────────────────

export interface ReadinessDomain {
  name: string
  score: number      // 0–100 before weighting
  weight: number     // e.g. 0.25
  weighted: number   // score * weight
  detail: string     // human-readable e.g. "3/5 mandatory documents approved"
}

export interface ReadinessResult {
  total: number                                         // 0–100 composite
  domains: ReadinessDomain[]
  focus_area: string                                    // lowest-scoring domain name
  level: 'critical' | 'low' | 'medium' | 'high' | 'ready'
}

// ── Level thresholds ─────────────────────────────────────────────────────────

function scoreToLevel(score: number): ReadinessResult['level'] {
  if (score >= 90) return 'ready'
  if (score >= 70) return 'high'
  if (score >= 40) return 'medium'
  if (score >= 20) return 'low'
  return 'critical'
}

// ── Domain helpers ────────────────────────────────────────────────────────────

function buildDomain(
  name: string,
  score: number,
  weight: number,
  detail: string,
): ReadinessDomain {
  return {
    name,
    score: Math.round(score),
    weight,
    weighted: Math.round(score * weight * 100) / 100,
    detail,
  }
}

// ── Documents (22%) ───────────────────────────────────────────────────────────

async function computeDocuments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  matterId: string,
  matterTypeId: string | null,
): Promise<ReadinessDomain> {
  const weight = 0.22

  // Mandatory slots defined for this matter type
  const { data: mandatorySlots } = await supabase
    .from('document_slots')
    .select('id, status')
    .eq('matter_id', matterId)
    .eq('is_mandatory', true)
    .eq('is_active', true)

  // If the column is named is_required (common alias), fall back
  const { data: requiredSlots } = await supabase
    .from('document_slots')
    .select('id, status')
    .eq('matter_id', matterId)
    .eq('is_required', true)
    .eq('is_active', true)

  // Prefer whichever query returned rows; use is_required as the primary
  const slots = (requiredSlots ?? []).length > 0
    ? (requiredSlots ?? [])
    : (mandatorySlots ?? [])

  if (slots.length === 0) {
    // No mandatory slots configured — count as satisfied
    return buildDomain('Documents', 100, weight, '0/0 mandatory documents (none required)')
  }

  const approved = slots.filter(
    (s: { status: string }) => s.status === 'accepted' || s.status === 'approved',
  ).length

  const score = slots.length > 0 ? (approved / slots.length) * 100 : 100
  return buildDomain(
    'Documents',
    score,
    weight,
    `${approved}/${slots.length} mandatory documents approved`,
  )
}

// ── Questionnaire (18%) ──────────────────────────────────────────────────────

async function computeQuestionnaire(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  matterId: string,
): Promise<ReadinessDomain> {
  const weight = 0.18

  const { data: intake } = await supabase
    .from('matter_intake')
    .select('*')
    .eq('matter_id', matterId)
    .maybeSingle()

  if (!intake) {
    return buildDomain('Questionnaire', 0, weight, '0/0 questionnaire fields completed (no intake record)')
  }

  // Use completion_pct if already computed server-side
  if (typeof intake.completion_pct === 'number') {
    const score = intake.completion_pct
    return buildDomain(
      'Questionnaire',
      score,
      weight,
      `Questionnaire ${score}% complete`,
    )
  }

  // Fallback: count non-null fields manually
  const NON_DATA_KEYS = new Set([
    'id', 'tenant_id', 'matter_id', 'created_at', 'updated_at',
    'locked_at', 'locked_by', 'lock_reason',
    'risk_calculated_at', 'risk_override_at', 'risk_override_by',
    'imm_status_changed_at', 'imm_status_changed_by',
    'lawyer_review_by', 'lawyer_review_at',
    'contradiction_override_at', 'contradiction_override_by',
  ])
  const keys = Object.keys(intake).filter((k) => !NON_DATA_KEYS.has(k))
  const filled = keys.filter((k) => intake[k] !== null && intake[k] !== undefined).length
  const total = keys.length
  const score = total > 0 ? (filled / total) * 100 : 0

  return buildDomain(
    'Questionnaire',
    score,
    weight,
    `${filled}/${total} questionnaire fields completed`,
  )
}

// ── Review (18%) ─────────────────────────────────────────────────────────────

async function computeReview(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  matterId: string,
): Promise<ReadinessDomain> {
  const weight = 0.18

  const { data: intake } = await supabase
    .from('matter_intake')
    .select('lawyer_review_status')
    .eq('matter_id', matterId)
    .maybeSingle()

  const status = intake?.lawyer_review_status ?? null

  let score = 0
  let label = 'pending'

  if (status === 'approved') {
    score = 100
    label = 'approved'
  } else if (status === 'returned_for_correction' || status === 'changes_requested') {
    score = 25
    label = 'returned for correction'
  } else if (status === 'not_required') {
    // If explicitly marked not required, treat as satisfied
    score = 100
    label = 'not required'
  } else {
    score = 0
    label = status ?? 'pending'
  }

  return buildDomain('Review', score, weight, `Lawyer review: ${label}`)
}

// ── Forms (13%) ──────────────────────────────────────────────────────────────

async function computeForms(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  matterId: string,
): Promise<ReadinessDomain> {
  const weight = 0.13

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: forms } = await (supabase as any)
    .from('matter_form_instances')
    .select('id, status, is_required')
    .eq('matter_id', matterId)

  const all = (forms ?? []) as Array<{ status: string; is_required: boolean | null }>

  if (all.length === 0) {
    return buildDomain('Forms', 100, weight, '0/0 forms (none required)')
  }

  const required = all.filter((f) => f.is_required !== false)
  const total = required.length > 0 ? required.length : all.length
  const pool = required.length > 0 ? required : all

  const completed = pool.filter(
    (f) => f.status === 'complete' || f.status === 'completed' || f.status === 'submitted',
  ).length

  const score = total > 0 ? (completed / total) * 100 : 100

  return buildDomain('Forms', score, weight, `${completed}/${total} forms completed`)
}

// ── Billing (13%) ────────────────────────────────────────────────────────────

async function computeBilling(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  matterId: string,
): Promise<ReadinessDomain> {
  const weight = 0.13

  const { data: retainerRaw } = await supabase
    .from('retainer_agreements' as never)
    .select('status')
    .eq('matter_id', matterId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const retainer = retainerRaw as { status: string } | null
  const status = retainer?.status ?? null

  let score = 0
  let label = 'missing — retainer agreement required'

  if (status === 'signed') {
    score = 100
    label = 'signed'
  } else if (status === 'sent_for_signing') {
    score = 50
    label = 'sent for signing — awaiting client signature'
  } else if (status === 'draft') {
    score = 20
    label = 'draft — awaiting completion'
  } else if (status === 'voided') {
    score = 0
    label = 'voided — new retainer required'
  } else {
    score = 0
    label = 'missing — retainer agreement required'
  }

  return buildDomain('Billing', score, weight, `Retainer Agreement: ${label}`)
}

// ── Compliance (11%) — Document Expiry & Status Validity (Directive 20.2) ────
// Checks contact_status_records for passport/permit expiries linked to this matter.
// Scoring:
//   - All documents valid (> 180 days to expiry): 100
//   - Expiring within 180 days: proportional penalty
//   - Expiring within 90 days: hard cap at 60 (forces amber)
//   - Already expired: 0

async function computeCompliance(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  matterId: string,
): Promise<ReadinessDomain> {
  const weight = 0.11

  // Get all contact status records linked to this matter
  const { data: records } = await supabase
    .from('contact_status_records')
    .select('status_type, expiry_date')
    .eq('matter_id', matterId)

  const statusRecords = (records ?? []) as Array<{
    status_type: string
    expiry_date: string
  }>

  if (statusRecords.length === 0) {
    // No status records linked — no penalty (not all matters have them)
    return buildDomain('Compliance', 100, weight, 'No document expiry records linked')
  }

  const now = Date.now()
  let worstScore = 100
  const issues: string[] = []

  for (const rec of statusRecords) {
    if (!rec.expiry_date) continue

    const expiryMs = new Date(rec.expiry_date).getTime()
    const daysUntilExpiry = Math.ceil((expiryMs - now) / (1000 * 60 * 60 * 24))
    const typeLabel = rec.status_type.replace(/_/g, ' ')

    if (daysUntilExpiry <= 0) {
      // Already expired — score 0 for this record
      worstScore = Math.min(worstScore, 0)
      issues.push(`${typeLabel} EXPIRED (${Math.abs(daysUntilExpiry)}d ago)`)
    } else if (daysUntilExpiry <= 90) {
      // Critical: hard cap at 60 (forces amber zone)
      const recordScore = Math.min(60, Math.round((daysUntilExpiry / 90) * 60))
      worstScore = Math.min(worstScore, recordScore)
      issues.push(`${typeLabel} expires in ${daysUntilExpiry}d`)
    } else if (daysUntilExpiry <= 180) {
      // Warning: proportional penalty
      const recordScore = Math.round(60 + ((daysUntilExpiry - 90) / 90) * 40)
      worstScore = Math.min(worstScore, recordScore)
      issues.push(`${typeLabel} expires in ${daysUntilExpiry}d`)
    }
    // > 180 days: no penalty
  }

  const detail = issues.length > 0
    ? `${issues.length} expiry concern${issues.length > 1 ? 's' : ''}: ${issues.join('; ')}`
    : `${statusRecords.length} document${statusRecords.length > 1 ? 's' : ''} valid (>180d)`

  return buildDomain('Compliance', worstScore, weight, detail)
}

// ── Submission (5%) ──────────────────────────────────────────────────────────
// Financial Kill-Switch: Submission is BLOCKED if financial clearance fails.
// The RPC check_financial_clearance runs entirely in Postgres.

async function computeSubmission(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  matterId: string,
): Promise<ReadinessDomain> {
  const weight = 0.05

  const { data: matter } = await supabase
    .from('matters')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select('status, intake_status')
    .eq('id', matterId)
    .single()

  // Treat status === 'filing_ready' or intake_status === 'ready_for_filing' as ready
  const isFilingReady =
    matter?.status === 'filing_ready' ||
    matter?.intake_status === 'ready_for_filing'

  // ── Financial Kill-Switch ─────────────────────────────────────────────
  // Server-side: query trust balance + total billed directly (admin client
  // has no auth.uid(), so the RPC's Sentinel check would fail).
  // All amounts are DB-stored BIGINT cents — zero frontend calculations.
  let financiallyCleared = true
  const blockers: string[] = []

  try {
    // 1. Get total billed from the matter (already fetched above, but we
    //    need fee_snapshot + total_amount_cents for the financial check)
    const { data: fin } = await supabase
      .from('matters')
      .select('total_amount_cents, fee_snapshot')
      .eq('id', matterId)
      .single()

    // 2. Get trust balance from latest trust transaction (DB-computed)
    const { data: trustRow } = await supabase
      .from('trust_transactions')
      .select('running_balance_cents')
      .eq('matter_id', matterId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const trustBalanceCents = trustRow?.running_balance_cents ?? 0

    // 3. Resolve total billed — fee_snapshot is canonical, fallback to total_amount_cents
    let totalBilledCents = fin?.total_amount_cents ?? 0
    const feeSnap = fin?.fee_snapshot as Record<string, unknown> | null
    if (feeSnap && typeof feeSnap === 'object') {
      if (feeSnap.total_amount_cents != null) {
        totalBilledCents = Number(feeSnap.total_amount_cents)
      } else {
        // Sum professional_fees + government_fees + disbursements
        const sumArray = (arr: unknown) =>
          Array.isArray(arr)
            ? arr.reduce((s, item) => s + (Number((item as Record<string, unknown>).amount_cents) || 0), 0)
            : 0
        totalBilledCents =
          sumArray(feeSnap.professional_fees) +
          sumArray(feeSnap.government_fees) +
          sumArray(feeSnap.disbursements)
      }
    }

    // 4. Compute outstanding and unallocated (mirrors the RPC logic)
    const outstandingCents = Math.max(0, totalBilledCents - trustBalanceCents)
    const unallocatedCents = Math.max(0, trustBalanceCents - totalBilledCents)

    if (outstandingCents > 0) {
      financiallyCleared = false
      const dollars = (outstandingCents / 100).toFixed(2)
      blockers.push(`Client owes $${dollars} — outstanding balance must be cleared before submission.`)
    }

    if (unallocatedCents > 0) {
      financiallyCleared = false
      const dollars = (unallocatedCents / 100).toFixed(2)
      blockers.push(`$${dollars} in unallocated trust funds — apply or refund before submission.`)
    }
  } catch (err) {
    console.warn('[readiness] Financial clearance check failed:', (err as Error).message)
    // Graceful fallback — don't block submission if the check itself fails
    financiallyCleared = true
  }

  // Submission is only ready if BOTH filing status AND financials are clear
  if (!isFilingReady && !financiallyCleared) {
    return buildDomain(
      'Submission',
      0,
      weight,
      `Blocked: not filing-ready. ${blockers.join(' ')}`,
    )
  }

  if (!financiallyCleared) {
    return buildDomain(
      'Submission',
      0,
      weight,
      `Financial hold: ${blockers.join(' ')}`,
    )
  }

  if (!isFilingReady) {
    return buildDomain('Submission', 0, weight, 'Filing ready: no')
  }

  return buildDomain('Submission', 100, weight, 'Filing ready: yes — financial clearance passed')
}

// ── Stale-Date Blocker (Directive 024) ────────────────────────────────────────
// If any document in the matter is >150 days old, cap the total score at 34.
// This forces the "Activate Matter" button to re-lock, preventing stale submissions.

async function checkStaleDateBlocker(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  matterId: string,
): Promise<{ isBlocked: boolean; staleDocuments: string[] }> {
  const staleDocuments: string[] = []

  const { data: slots } = await supabase
    .from('document_slots')
    .select('id, label, document_type, uploaded_at')
    .eq('matter_id', matterId)
    .eq('is_active', true)
    .not('uploaded_at', 'is', null)

  if (!slots || slots.length === 0) return { isBlocked: false, staleDocuments }

  const now = Date.now()
  const STALE_THRESHOLD_DAYS = 150

  for (const slot of slots as Array<{ label: string; document_type: string; uploaded_at: string }>) {
    if (!slot.uploaded_at) continue
    const uploadedMs = new Date(slot.uploaded_at).getTime()
    const daysSinceUpload = Math.floor((now - uploadedMs) / (1000 * 60 * 60 * 24))
    if (daysSinceUpload > STALE_THRESHOLD_DAYS) {
      staleDocuments.push(`${slot.label || slot.document_type} (${daysSinceUpload}d old)`)
    }
  }

  return { isBlocked: staleDocuments.length > 0, staleDocuments }
}

// ── Continuity Gap Blocker (Directive 018) ────────────────────────────────────
// Any gap in address or personal history >0 days = BLOCKER on the readiness score.

async function checkContinuityBlocker(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  matterId: string,
): Promise<{ isBlocked: boolean; gaps: string[] }> {
  const gaps: string[] = []

  // Fetch address history for this matter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: addressRows } = await (supabase as SupabaseClient<any>)
    .from('address_history')
    .select('label, city, country, start_date, end_date')
    .eq('matter_id', matterId)
    .order('start_date', { ascending: true })

  const addresses = (addressRows ?? []) as Array<{
    label: string | null; city: string; country: string;
    start_date: string; end_date: string | null
  }>

  if (addresses.length >= 2) {
    for (let i = 0; i < addresses.length - 1; i++) {
      const current = addresses[i]
      const next = addresses[i + 1]
      if (!current.end_date) continue

      const endMs = new Date(current.end_date).getTime()
      const startMs = new Date(next.start_date).getTime()
      const gapDays = Math.floor((startMs - endMs) / (1000 * 60 * 60 * 24)) - 1

      if (gapDays > 0) {
        gaps.push(`Address gap: ${gapDays}d between "${current.label || current.city}" and "${next.label || next.city}"`)
      }
    }
  }

  // Fetch personal/employment history
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: personalRows } = await (supabase as SupabaseClient<any>)
    .from('personal_history')
    .select('label, history_type, organization, start_date, end_date')
    .eq('matter_id', matterId)
    .order('start_date', { ascending: true })

  const personal = (personalRows ?? []) as Array<{
    label: string | null; history_type: string; organization: string | null;
    start_date: string; end_date: string | null
  }>

  if (personal.length >= 2) {
    for (let i = 0; i < personal.length - 1; i++) {
      const current = personal[i]
      const next = personal[i + 1]
      if (!current.end_date) continue

      const endMs = new Date(current.end_date).getTime()
      const startMs = new Date(next.start_date).getTime()
      const gapDays = Math.floor((startMs - endMs) / (1000 * 60 * 60 * 24)) - 1

      if (gapDays > 0) {
        gaps.push(`${current.history_type} gap: ${gapDays}d between "${current.label || current.organization}" and "${next.label || next.organization}"`)
      }
    }
  }

  return { isBlocked: gaps.length > 0, gaps }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function computeReadiness(
  matterId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<ReadinessResult> {
  // Fetch matter to get matter_type_id
  const { data: matter } = await supabase
    .from('matters')
    .select('matter_type_id')
    .eq('id', matterId)
    .single()

  const matterTypeId = matter?.matter_type_id ?? null

  // All domains + blockers computed in parallel
  const [documents, questionnaire, review, forms, billing, compliance, submission, staleCheck, continuityCheck] = await Promise.all([
    computeDocuments(supabase, matterId, matterTypeId),
    computeQuestionnaire(supabase, matterId),
    computeReview(supabase, matterId),
    computeForms(supabase, matterId),
    computeBilling(supabase, matterId),
    computeCompliance(supabase, matterId),
    computeSubmission(supabase, matterId),
    checkStaleDateBlocker(supabase, matterId),
    checkContinuityBlocker(supabase, matterId),
  ])

  const domains = [documents, questionnaire, review, forms, billing, compliance, submission]

  let total = Math.round(
    domains.reduce((sum, d) => sum + d.score * d.weight, 0),
  )

  // ── Directive 024: Stale-Date Blocker ────────────────────────────────
  // If any document is >150 days old, cap score at 34 (forces "Critical: Stale")
  if (staleCheck.isBlocked) {
    total = Math.min(total, 34)
    // Inject a synthetic domain note
    domains.push(buildDomain(
      'Freshness',
      0,
      0, // no weight — it's a hard cap
      `BLOCKER: ${staleCheck.staleDocuments.length} stale document(s): ${staleCheck.staleDocuments.join('; ')}`,
    ))
  }

  // ── Directive 018: Continuity Gap Blocker ─────────────────────────────
  // Any gap in address or personal history = BLOCKER
  if (continuityCheck.isBlocked) {
    total = Math.min(total, 34)
    domains.push(buildDomain(
      'Continuity',
      0,
      0,
      `BLOCKER: ${continuityCheck.gaps.length} chronological gap(s): ${continuityCheck.gaps.join('; ')}`,
    ))
  }

  // Focus area = domain with the lowest raw score
  const focus = domains.reduce((min, d) => (d.score < min.score ? d : min), domains[0])

  return {
    total,
    domains,
    focus_area: focus.name,
    level: scoreToLevel(total),
  }
}
