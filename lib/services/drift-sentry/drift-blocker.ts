/**
 * Drift-Blocker  -  Cross-Squad Neural Link (Directive 1.5)
 *
 * Checks if there are unacknowledged case law alerts that should block
 * AI draft approval. When the Drift Sentry detects a Federal Court ruling
 * shift in the same category as a pending draft, the "Approve Draft" button
 * is replaced with a Critical Drift Overlay until the lawyer acknowledges.
 *
 * Flow:
 * 1. Fetch recent 'new' alerts from case_law_alerts for the tenant
 * 2. Cross-reference alert keywords with the draft's practice area / case type
 * 3. If overlap → return blocking alerts with severity
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { DRIFT_KEYWORDS } from './alert-scanner'

// ── Types ────────────────────────────────────────────────────────────────────

export interface DriftBlockStatus {
  /** Whether draft approval should be blocked */
  blocked: boolean
  /** Blocking alerts (empty if not blocked) */
  blockingAlerts: BlockingAlert[]
  /** Highest severity across all blocking alerts */
  severity: 'critical' | 'high' | 'moderate' | 'none'
  /** Timestamp of the check */
  checkedAt: string
}

export interface BlockingAlert {
  id: string
  title: string
  court: string
  citation: string | null
  relevanceScore: number
  keywords: string[]
  decisionDate: string | null
  /** How this alert relates to the current draft category */
  overlapKeywords: string[]
}

// ── Keyword mapping from case type to drift categories ──────────────────────

const CASE_TYPE_DRIFT_MAP: Record<string, string[]> = {
  // Immigration case types → relevant drift keywords
  work_permit: ['judicial review', 'procedural fairness', 'IRPA', 'IRCC policy', 'reasonableness'],
  study_permit: ['judicial review', 'procedural fairness', 'IRPA', 'IRCC policy'],
  pr_application: ['judicial review', 'procedural fairness', 'IRPA', 'Baker', 'Vavilov', 'reasonableness'],
  spousal_sponsorship: ['judicial review', 'procedural fairness', 'Baker', 'Vavilov', 'duty to disclose'],
  refugee_claim: ['judicial review', 'procedural fairness', 'natural justice', 'right to counsel', 'Vavilov'],
  judicial_review: ['judicial review', 'Vavilov', 'Dunsmuir', 'reasonableness', 'patent unreasonableness'],
  h_and_c: ['Baker', 'Vavilov', 'reasonableness', 'humanitarian'],
  lmia: ['IRCC policy', 'ministerial instructions', 'program delivery'],
}

/** Default keywords to check against if no specific case type mapping */
const DEFAULT_DRIFT_KEYWORDS = [
  ...DRIFT_KEYWORDS.immigration,
  ...DRIFT_KEYWORDS.procedural,
]

// ── Core blocker check ──────────────────────────────────────────────────────

/**
 * Check if there are drift alerts that should block AI draft approval.
 *
 * @param supabase   Authenticated Supabase client
 * @param tenantId   Tenant ID for scoping
 * @param caseType   Optional case type slug for targeted matching
 * @param draftType  Optional draft type for additional context
 */
export async function checkDriftBlock(
  supabase: SupabaseClient,
  tenantId: string,
  caseType?: string | null,
  draftType?: string,
): Promise<DriftBlockStatus> {
  const checkedAt = new Date().toISOString()

  // Fetch unacknowledged alerts (status = 'new') from last 30 days
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: alerts, error } = await (supabase as any)
    .from('case_law_alerts')
    .select('id, title, court, source_citation, relevance_score, keywords, decision_date, status')
    .eq('tenant_id', tenantId)
    .eq('status', 'new')
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .order('relevance_score', { ascending: false })
    .limit(20)

  if (error || !alerts || alerts.length === 0) {
    return { blocked: false, blockingAlerts: [], severity: 'none', checkedAt }
  }

  // Determine which keywords are relevant to this draft
  const relevantKeywords = caseType && CASE_TYPE_DRIFT_MAP[caseType]
    ? CASE_TYPE_DRIFT_MAP[caseType]
    : DEFAULT_DRIFT_KEYWORDS

  const relevantSet = new Set(relevantKeywords.map(k => k.toLowerCase()))

  // Cross-reference alerts with relevant keywords
  const blockingAlerts: BlockingAlert[] = []

  for (const alert of alerts as Array<{
    id: string
    title: string
    court: string | null
    source_citation: string | null
    relevance_score: number | null
    keywords: string[]
    decision_date: string | null
  }>) {
    const alertKeywords = (alert.keywords ?? []).map(k => k.toLowerCase())
    const overlapKeywords = alertKeywords.filter(k => relevantSet.has(k))

    // Also check if the alert title matches any relevant keywords
    const titleLower = alert.title.toLowerCase()
    for (const rk of relevantKeywords) {
      if (titleLower.includes(rk.toLowerCase()) && !overlapKeywords.includes(rk.toLowerCase())) {
        overlapKeywords.push(rk.toLowerCase())
      }
    }

    if (overlapKeywords.length > 0) {
      blockingAlerts.push({
        id: alert.id,
        title: alert.title,
        court: alert.court ?? 'Unknown Court',
        citation: alert.source_citation,
        relevanceScore: alert.relevance_score ?? 0,
        keywords: alert.keywords ?? [],
        decisionDate: alert.decision_date,
        overlapKeywords,
      })
    }
  }

  if (blockingAlerts.length === 0) {
    return { blocked: false, blockingAlerts: [], severity: 'none', checkedAt }
  }

  // Determine severity based on highest relevance score and court
  const maxScore = Math.max(...blockingAlerts.map(a => a.relevanceScore))
  const hasSCC = blockingAlerts.some(a => a.court.includes('Supreme Court'))
  const hasFCA = blockingAlerts.some(a => a.court.includes('Federal Court of Appeal'))

  let severity: DriftBlockStatus['severity'] = 'moderate'
  if (hasSCC || maxScore >= 8) severity = 'critical'
  else if (hasFCA || maxScore >= 5) severity = 'high'

  return {
    blocked: true,
    blockingAlerts,
    severity,
    checkedAt,
  }
}

/**
 * Acknowledge a drift alert  -  marks it as 'acknowledged' so it no longer
 * blocks draft approval.
 */
export async function acknowledgeDriftAlert(
  supabase: SupabaseClient,
  tenantId: string,
  alertId: string,
  acknowledgedBy: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('case_law_alerts')
    .update({
      status: 'acknowledged',
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: acknowledgedBy,
    })
    .eq('id', alertId)
    .eq('tenant_id', tenantId)

  if (error) {
    throw new Error(`Failed to acknowledge drift alert: ${error.message}`)
  }
}
