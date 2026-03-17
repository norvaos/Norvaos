/**
 * Readiness Engine — Composite Matter Readiness Score
 *
 * Computes a 0–100 score from 6 weighted domains:
 *   Documents      25%
 *   Questionnaire  20%
 *   Review         20%
 *   Forms          15%
 *   Billing        15%
 *   Submission      5%
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

// ── Documents (25%) ───────────────────────────────────────────────────────────

async function computeDocuments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  matterId: string,
  matterTypeId: string | null,
): Promise<ReadinessDomain> {
  const weight = 0.25

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

// ── Questionnaire (20%) ──────────────────────────────────────────────────────

async function computeQuestionnaire(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  matterId: string,
): Promise<ReadinessDomain> {
  const weight = 0.20

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

// ── Review (20%) ─────────────────────────────────────────────────────────────

async function computeReview(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  matterId: string,
): Promise<ReadinessDomain> {
  const weight = 0.20

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

// ── Forms (15%) ──────────────────────────────────────────────────────────────

async function computeForms(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  matterId: string,
): Promise<ReadinessDomain> {
  const weight = 0.15

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

// ── Billing (15%) ────────────────────────────────────────────────────────────

async function computeBilling(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  matterId: string,
): Promise<ReadinessDomain> {
  const weight = 0.15

  const { data: retainer } = await supabase
    .from('retainer_agreements')
    .select('status')
    .eq('matter_id', matterId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const status = retainer?.status ?? null

  let score = 0
  let label = 'none'

  if (status === 'signed') {
    score = 100
    label = 'signed'
  } else if (status === 'sent_for_signing') {
    score = 50
    label = 'sent for signing'
  } else if (status === 'draft') {
    score = 25
    label = 'draft'
  } else {
    score = 0
    label = 'none'
  }

  return buildDomain('Billing', score, weight, `Retainer: ${label}`)
}

// ── Submission (5%) ──────────────────────────────────────────────────────────

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

  const score = isFilingReady ? 100 : 0
  return buildDomain('Submission', score, weight, `Filing ready: ${isFilingReady ? 'yes' : 'no'}`)
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

  // All domains computed in parallel
  const [documents, questionnaire, review, forms, billing, submission] = await Promise.all([
    computeDocuments(supabase, matterId, matterTypeId),
    computeQuestionnaire(supabase, matterId),
    computeReview(supabase, matterId),
    computeForms(supabase, matterId),
    computeBilling(supabase, matterId),
    computeSubmission(supabase, matterId),
  ])

  const domains = [documents, questionnaire, review, forms, billing, submission]

  const total = Math.round(
    domains.reduce((sum, d) => sum + d.score * d.weight, 0),
  )

  // Focus area = domain with the lowest raw score
  const focus = domains.reduce((min, d) => (d.score < min.score ? d : min), domains[0])

  return {
    total,
    domains,
    focus_area: focus.name,
    level: scoreToLevel(total),
  }
}
