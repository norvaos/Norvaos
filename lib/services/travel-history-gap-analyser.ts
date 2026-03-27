/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Travel History Gap Analyser  -  IRCC 10-Year Compliance
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * IRCC requires a COMPLETE 10-year address and travel history with zero
 * unexplained gaps. Even a 1-month gap can trigger a procedural fairness
 * letter or outright refusal.
 *
 * This engine scans a travel_history array (from matter_people.profile_data
 * or contacts.immigration_data) and returns:
 *   - A sorted, normalised timeline
 *   - All gaps (with severity: ok / warning / critical)
 *   - Whether the 10-year window is fully covered
 *
 * Pure function  -  no side effects, no DB, no I/O.
 * Called from the Readiness Matrix sidebar and the form wizard.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface TravelHistoryEntry {
  /** ISO date string (YYYY-MM-DD or YYYY-MM) */
  from_date: string
  /** ISO date string (YYYY-MM-DD or YYYY-MM). Null = "present" / ongoing */
  to_date: string | null
  /** Country code or name */
  country: string
  /** City (optional) */
  city?: string
  /** Immigration status during this period */
  status?: string
}

export interface TravelGap {
  /** Start of the gap (day after previous entry ends) */
  gapStart: string
  /** End of the gap (day before next entry starts) */
  gapEnd: string
  /** Duration in days */
  days: number
  /** Severity based on gap length */
  severity: 'ok' | 'warning' | 'critical'
  /** Human-readable label */
  label: string
}

export interface NormalisedPeriod {
  /** Normalised start date (always YYYY-MM-DD) */
  startDate: string
  /** Normalised end date (always YYYY-MM-DD) */
  endDate: string
  /** Original entry data */
  entry: TravelHistoryEntry
}

export interface TravelHistoryAnalysis {
  /** Sorted, normalised periods */
  periods: NormalisedPeriod[]
  /** All detected gaps (including zero-day overlaps are excluded) */
  gaps: TravelGap[]
  /** Only gaps with severity 'warning' or 'critical' */
  actionableGaps: TravelGap[]
  /** Whether the full 10-year window is accounted for */
  isComplete: boolean
  /** Coverage percentage (0-100) */
  coveragePct: number
  /** The 10-year window boundaries used for analysis */
  windowStart: string
  windowEnd: string
  /** Total days in the window */
  totalWindowDays: number
  /** Total days covered by entries */
  coveredDays: number
  /** Total number of entries analysed */
  entryCount: number
}

// ── Constants ────────────────────────────────────────────────────────────────

/** IRCC requires 10 years of history */
const HISTORY_YEARS = 10

/** Gap thresholds (in days) */
const GAP_WARNING_DAYS = 14 // 2 weeks  -  amber
const GAP_CRITICAL_DAYS = 30 // 1 month  -  red (IRCC rejection risk)

// ── Main Analyser ────────────────────────────────────────────────────────────

/**
 * Analyse a travel history array for IRCC compliance.
 *
 * @param entries - Array of travel history entries from profile data
 * @param referenceDate - The "today" date for computing the 10-year window.
 *                        Defaults to current date. Pass a fixed date for testing.
 * @returns Complete analysis with gaps, coverage, and actionable items
 */
export function analyseTravelHistory(
  entries: TravelHistoryEntry[],
  referenceDate?: string,
): TravelHistoryAnalysis {
  const today = referenceDate
    ? normaliseDate(referenceDate)
    : new Date().toISOString().split('T')[0]

  const windowEnd = today
  const windowStartDate = new Date(today)
  windowStartDate.setFullYear(windowStartDate.getFullYear() - HISTORY_YEARS)
  const windowStart = windowStartDate.toISOString().split('T')[0]

  const totalWindowDays = daysBetween(windowStart, windowEnd)

  // Handle empty history
  if (!entries || entries.length === 0) {
    return {
      periods: [],
      gaps: [{
        gapStart: windowStart,
        gapEnd: windowEnd,
        days: totalWindowDays,
        severity: 'critical',
        label: `No travel history provided (${HISTORY_YEARS}-year gap)`,
      }],
      actionableGaps: [{
        gapStart: windowStart,
        gapEnd: windowEnd,
        days: totalWindowDays,
        severity: 'critical',
        label: `No travel history provided (${HISTORY_YEARS}-year gap)`,
      }],
      isComplete: false,
      coveragePct: 0,
      windowStart,
      windowEnd,
      totalWindowDays,
      coveredDays: 0,
      entryCount: 0,
    }
  }

  // 1. Normalise and sort entries by start date
  const periods: NormalisedPeriod[] = entries
    .map((entry) => ({
      startDate: normaliseDate(entry.from_date),
      endDate: entry.to_date ? normaliseDate(entry.to_date) : today,
      entry,
    }))
    // Clamp to the 10-year window
    .map((p) => ({
      ...p,
      startDate: p.startDate < windowStart ? windowStart : p.startDate,
      endDate: p.endDate > windowEnd ? windowEnd : p.endDate,
    }))
    // Remove entries entirely outside the window
    .filter((p) => p.startDate <= windowEnd && p.endDate >= windowStart)
    // Sort by start date, then by end date (longer periods first)
    .sort((a, b) => {
      const startCmp = a.startDate.localeCompare(b.startDate)
      if (startCmp !== 0) return startCmp
      return b.endDate.localeCompare(a.endDate) // Longer period first
    })

  // 2. Merge overlapping periods to compute actual coverage
  const merged = mergePeriods(periods)

  // 3. Detect gaps between merged periods and the window boundaries
  const gaps: TravelGap[] = []

  // Gap before first entry
  if (merged.length > 0 && merged[0].startDate > windowStart) {
    const gapDays = daysBetween(windowStart, merged[0].startDate)
    if (gapDays > 0) {
      gaps.push(createGap(windowStart, addDays(merged[0].startDate, -1), gapDays))
    }
  }

  // Gaps between entries
  for (let i = 0; i < merged.length - 1; i++) {
    const currentEnd = merged[i].endDate
    const nextStart = merged[i + 1].startDate
    const gapStart = addDays(currentEnd, 1)

    if (gapStart < nextStart) {
      const gapDays = daysBetween(gapStart, nextStart)
      if (gapDays > 0) {
        gaps.push(createGap(gapStart, addDays(nextStart, -1), gapDays))
      }
    }
  }

  // Gap after last entry
  if (merged.length > 0) {
    const lastEnd = merged[merged.length - 1].endDate
    if (lastEnd < windowEnd) {
      const gapStart = addDays(lastEnd, 1)
      const gapDays = daysBetween(gapStart, windowEnd)
      if (gapDays > 0) {
        gaps.push(createGap(gapStart, windowEnd, gapDays))
      }
    }
  }

  // 4. Compute coverage
  const coveredDays = merged.reduce(
    (sum, p) => sum + daysBetween(p.startDate, p.endDate) + 1,
    0,
  )
  const coveragePct = totalWindowDays > 0
    ? Math.min(100, Math.round((coveredDays / totalWindowDays) * 100))
    : 100

  const actionableGaps = gaps.filter((g) => g.severity !== 'ok')

  return {
    periods,
    gaps,
    actionableGaps,
    isComplete: actionableGaps.length === 0 && coveragePct >= 99,
    coveragePct,
    windowStart,
    windowEnd,
    totalWindowDays,
    coveredDays,
    entryCount: entries.length,
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalise a date string to YYYY-MM-DD format.
 * Handles: YYYY-MM-DD, YYYY-MM, YYYY, and ISO 8601 with time component.
 */
function normaliseDate(dateStr: string): string {
  if (!dateStr) return '1900-01-01' // Fallback for missing dates

  // Strip time component if present
  const clean = dateStr.split('T')[0]

  // YYYY-MM-DD: already normalised
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean

  // YYYY-MM: assume first day of month
  if (/^\d{4}-\d{2}$/.test(clean)) return `${clean}-01`

  // YYYY: assume January 1
  if (/^\d{4}$/.test(clean)) return `${clean}-01-01`

  // Last resort: try Date parsing
  const parsed = new Date(dateStr)
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0]
  }

  return '1900-01-01'
}

/** Calculate days between two YYYY-MM-DD date strings (inclusive of start, exclusive of end). */
function daysBetween(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00Z')
  const e = new Date(end + 'T00:00:00Z')
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)))
}

/** Add N days to a YYYY-MM-DD string. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

/** Create a TravelGap with automatic severity classification. */
function createGap(start: string, end: string, days: number): TravelGap {
  let severity: TravelGap['severity'] = 'ok'
  let label = `${days}-day gap`

  if (days >= GAP_CRITICAL_DAYS) {
    severity = 'critical'
    const months = Math.round(days / 30)
    label = months >= 12
      ? `${Math.round(months / 12)}-year unexplained gap  -  IRCC will reject`
      : `${months}-month unexplained gap  -  IRCC will reject`
  } else if (days >= GAP_WARNING_DAYS) {
    severity = 'warning'
    label = `${days}-day gap  -  requires explanation`
  }

  return { gapStart: start, gapEnd: end, days, severity, label }
}

/**
 * Merge overlapping/contiguous periods into a minimal covering set.
 * Input must be sorted by startDate.
 */
function mergePeriods(
  periods: NormalisedPeriod[],
): Array<{ startDate: string; endDate: string }> {
  if (periods.length === 0) return []

  const merged: Array<{ startDate: string; endDate: string }> = [
    { startDate: periods[0].startDate, endDate: periods[0].endDate },
  ]

  for (let i = 1; i < periods.length; i++) {
    const last = merged[merged.length - 1]
    const current = periods[i]

    // Overlap or contiguous: extend the current merged period
    // (current.startDate <= addDays(last.endDate, 1) means they touch or overlap)
    if (current.startDate <= addDays(last.endDate, 1)) {
      if (current.endDate > last.endDate) {
        last.endDate = current.endDate
      }
    } else {
      // No overlap: start a new merged period
      merged.push({ startDate: current.startDate, endDate: current.endDate })
    }
  }

  return merged
}
