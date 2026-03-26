/**
 * Document Freshness Monitor  -  Directive 018/024 (NorvaOS)
 *
 * Stale-Date Monitor: checks whether documents (e.g., Police Certificates)
 * will still be valid at estimated processing completion. Pure TypeScript,
 * no external dependencies.
 */

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface FreshnessCheck {
  document_id: string
  document_type: string
  issue_date: string          // ISO date
  expiry_date: string | null  // ISO date, null = no expiry
  days_until_expiry: number
  estimated_processing_days: number
  will_expire_during_processing: boolean
  status: 'valid' | 'warning' | 'critical_stale' | 'expired'
  detail: string
}

export interface FreshnessReport {
  checks: FreshnessCheck[]
  hasStaleDocuments: boolean
  hasCriticalStale: boolean   // >150 days old = critical
  staleCounts: { valid: number; warning: number; critical_stale: number; expired: number }
}

// ---------------------------------------------------------------------------
// Processing time estimates (days)  -  Canadian immigration streams
// ---------------------------------------------------------------------------

export const PROCESSING_TIME_ESTIMATES: Record<string, number> = {
  study_permit: 84,                   // ~12 weeks
  work_permit: 56,                    // ~8 weeks
  express_entry: 180,                 // ~6 months
  pr_application: 365,                // ~12 months
  spousal_sponsorship_inland: 365,    // ~12 months
  spousal_sponsorship_outland: 450,   // ~15 months
  visitor_visa: 42,                   // ~6 weeks
  pgwp: 56,                           // ~8 weeks
  citizenship: 365,                   // ~12 months
  default: 180,                       // conservative default
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the number of calendar days between two ISO date strings. */
function daysBetween(from: string, to: string): number {
  const msPerDay = 86_400_000
  const a = new Date(from + 'T00:00:00Z')
  const b = new Date(to + 'T00:00:00Z')
  return Math.floor((b.getTime() - a.getTime()) / msPerDay)
}

/** Today's date as an ISO string (YYYY-MM-DD). */
function todayISO(): string {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Core check
// ---------------------------------------------------------------------------

/**
 * Evaluate the freshness of a single document against processing timelines.
 *
 * Status precedence (highest → lowest):
 *   expired → critical_stale → warning → valid
 */
export function checkDocumentFreshness(
  doc: {
    id: string
    document_type: string
    issue_date: string
    expiry_date: string | null
  },
  processingType?: string,
): FreshnessCheck {
  const today = todayISO()
  const estimatedDays =
    PROCESSING_TIME_ESTIMATES[processingType ?? 'default'] ??
    PROCESSING_TIME_ESTIMATES.default

  // If no expiry date, treat as perpetually valid.
  if (doc.expiry_date === null) {
    return {
      document_id: doc.id,
      document_type: doc.document_type,
      issue_date: doc.issue_date,
      expiry_date: null,
      days_until_expiry: Infinity,
      estimated_processing_days: estimatedDays,
      will_expire_during_processing: false,
      status: 'valid',
      detail: 'Document has no expiry date; treated as valid.',
    }
  }

  const daysUntilExpiry = daysBetween(today, doc.expiry_date)
  const daysSinceIssue = daysBetween(doc.issue_date, today)
  const willExpireDuringProcessing = daysUntilExpiry < estimatedDays

  // --- Status determination ---------------------------------------------------

  // 1. Already expired
  if (daysUntilExpiry < 0) {
    return {
      document_id: doc.id,
      document_type: doc.document_type,
      issue_date: doc.issue_date,
      expiry_date: doc.expiry_date,
      days_until_expiry: daysUntilExpiry,
      estimated_processing_days: estimatedDays,
      will_expire_during_processing: true,
      status: 'expired',
      detail: `Document expired ${Math.abs(daysUntilExpiry)} day(s) ago. Immediate renewal required.`,
    }
  }

  // 2. Critical stale  -  issued more than 150 days ago OR will expire during processing
  if (daysSinceIssue > 150 || willExpireDuringProcessing) {
    const reasons: string[] = []
    if (daysSinceIssue > 150) {
      reasons.push(`issued ${daysSinceIssue} days ago (exceeds 150-day threshold)`)
    }
    if (willExpireDuringProcessing) {
      reasons.push(
        `expires in ${daysUntilExpiry} day(s) but processing takes ~${estimatedDays} days`,
      )
    }
    return {
      document_id: doc.id,
      document_type: doc.document_type,
      issue_date: doc.issue_date,
      expiry_date: doc.expiry_date,
      days_until_expiry: daysUntilExpiry,
      estimated_processing_days: estimatedDays,
      will_expire_during_processing: willExpireDuringProcessing,
      status: 'critical_stale',
      detail: `Critical: ${reasons.join('; ')}. Renewal strongly recommended.`,
    }
  }

  // 3. Warning  -  expiry within 180 days
  if (daysUntilExpiry <= 180) {
    return {
      document_id: doc.id,
      document_type: doc.document_type,
      issue_date: doc.issue_date,
      expiry_date: doc.expiry_date,
      days_until_expiry: daysUntilExpiry,
      estimated_processing_days: estimatedDays,
      will_expire_during_processing: willExpireDuringProcessing,
      status: 'warning',
      detail: `Document expires in ${daysUntilExpiry} day(s). Consider renewal before submission.`,
    }
  }

  // 4. Valid
  return {
    document_id: doc.id,
    document_type: doc.document_type,
    issue_date: doc.issue_date,
    expiry_date: doc.expiry_date,
    days_until_expiry: daysUntilExpiry,
    estimated_processing_days: estimatedDays,
    will_expire_during_processing: willExpireDuringProcessing,
    status: 'valid',
    detail: `Document is valid for ${daysUntilExpiry} more day(s).`,
  }
}

// ---------------------------------------------------------------------------
// Aggregate report for an entire matter
// ---------------------------------------------------------------------------

/**
 * Run freshness checks across all documents attached to a matter and produce
 * an aggregated report.
 */
export function checkMatterDocumentFreshness(
  documents: Array<{
    id: string
    document_type: string
    issue_date: string
    expiry_date: string | null
  }>,
  processingType?: string,
): FreshnessReport {
  const checks = documents.map((doc) =>
    checkDocumentFreshness(doc, processingType),
  )

  const staleCounts = { valid: 0, warning: 0, critical_stale: 0, expired: 0 }
  for (const c of checks) {
    staleCounts[c.status]++
  }

  return {
    checks,
    hasStaleDocuments:
      staleCounts.warning > 0 ||
      staleCounts.critical_stale > 0 ||
      staleCounts.expired > 0,
    hasCriticalStale: staleCounts.critical_stale > 0 || staleCounts.expired > 0,
    staleCounts,
  }
}
