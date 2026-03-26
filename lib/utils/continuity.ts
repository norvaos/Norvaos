/**
 * Continuity Engine  -  Directive 018, NorvaOS
 *
 * Detects chronological gaps and overlaps in personal, address, and
 * employment history timelines. Used by IRCC form workflows to ensure
 * applicants provide gap-free histories before submission.
 *
 * All dates are ISO strings (YYYY-MM-DD). Pure functions, no side effects.
 */

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface DateRange {
  id?: string;
  label?: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
}

export interface DarkPeriod {
  gap_start: string;  // day after end_date of record N
  gap_end: string;    // day before start_date of record N+1
  gap_days: number;
  between: [string, string]; // [label of record N, label of record N+1]
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Parse an ISO date string into a Date at midnight UTC. */
function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Format a Date as "Mon D YYYY" (e.g. "Feb 1 2026"). */
function formatHuman(date: Date): string {
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()} ${date.getUTCFullYear()}`;
}

/** Format a Date back to ISO YYYY-MM-DD. */
function toISO(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Add a number of days to a Date (returns a new Date). */
function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/** Whole-day difference between two Dates. */
function daysBetween(a: Date, b: Date): number {
  const MS_PER_DAY = 86_400_000;
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/** Sort entries by start_date ascending, then by end_date ascending. */
function sortByStart(entries: DateRange[]): DateRange[] {
  return [...entries].sort((a, b) => {
    const diff = parseDate(a.start_date).getTime() - parseDate(b.start_date).getTime();
    if (diff !== 0) return diff;
    return parseDate(a.end_date).getTime() - parseDate(b.end_date).getTime();
  });
}

// ---------------------------------------------------------------------------
// Core exports
// ---------------------------------------------------------------------------

/**
 * Detect chronological gaps in a sorted timeline.
 *
 * A gap exists when end_date of record N + 1 day < start_date of record N+1.
 * Consecutive dates (e.g. Jan 31 -> Feb 1) are NOT considered a gap.
 */
export function checkChronologicalGaps(entries: DateRange[]): {
  gaps: DarkPeriod[];
  isGapless: boolean;
  totalDarkDays: number;
  verifiedRanges: number;
} {
  if (entries.length === 0) {
    return { gaps: [], isGapless: true, totalDarkDays: 0, verifiedRanges: 0 };
  }

  const sorted = sortByStart(entries);
  const gaps: DarkPeriod[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    const currentEnd = parseDate(current.end_date);
    const nextStart = parseDate(next.start_date);

    // The day immediately after the current record ends
    const dayAfterEnd = addDays(currentEnd, 1);

    // If dayAfterEnd < nextStart, there is a gap
    if (dayAfterEnd.getTime() < nextStart.getTime()) {
      const gapStart = dayAfterEnd;
      const gapEnd = addDays(nextStart, -1);
      const gapDays = daysBetween(gapStart, gapEnd) + 1; // inclusive count

      gaps.push({
        gap_start: toISO(gapStart),
        gap_end: toISO(gapEnd),
        gap_days: gapDays,
        between: [
          current.label ?? current.id ?? `Record ${i}`,
          next.label ?? next.id ?? `Record ${i + 1}`,
        ],
      });
    }
  }

  const totalDarkDays = gaps.reduce((sum, g) => sum + g.gap_days, 0);

  return {
    gaps,
    isGapless: gaps.length === 0,
    totalDarkDays,
    verifiedRanges: sorted.length,
  };
}

/**
 * Detect overlapping date ranges.
 *
 * Two ranges overlap when one starts before the other ends.
 */
export function checkOverlaps(entries: DateRange[]): {
  overlaps: { range_a: string; range_b: string; overlap_days: number }[];
  hasOverlaps: boolean;
} {
  if (entries.length < 2) {
    return { overlaps: [], hasOverlaps: false };
  }

  const sorted = sortByStart(entries);
  const overlaps: { range_a: string; range_b: string; overlap_days: number }[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];

      const aEnd = parseDate(a.end_date);
      const bStart = parseDate(b.start_date);
      const bEnd = parseDate(b.end_date);

      // If b starts after a ends, no overlap (and no further j will overlap either)
      if (bStart.getTime() > aEnd.getTime()) break;

      // Overlap exists  -  calculate days
      const overlapEnd = aEnd.getTime() < bEnd.getTime() ? aEnd : bEnd;
      const overlapDays = daysBetween(bStart, overlapEnd) + 1; // inclusive

      if (overlapDays > 0) {
        overlaps.push({
          range_a: a.label ?? a.id ?? `Record ${i}`,
          range_b: b.label ?? b.id ?? `Record ${j}`,
          overlap_days: overlapDays,
        });
      }
    }
  }

  return { overlaps, hasOverlaps: overlaps.length > 0 };
}

/**
 * Generate a combined continuity report for address and personal histories.
 *
 * Any gap produces a human-readable blocker string suitable for display in
 * the Norva Ledger submission checklist.
 */
export function generateContinuityReport(
  addressHistory: DateRange[],
  personalHistory: DateRange[],
): {
  address: ReturnType<typeof checkChronologicalGaps>;
  personal: ReturnType<typeof checkChronologicalGaps>;
  isFullyContinuous: boolean;
  totalGaps: number;
  blockers: string[];
} {
  const address = checkChronologicalGaps(addressHistory);
  const personal = checkChronologicalGaps(personalHistory);

  const blockers: string[] = [];

  for (const gap of address.gaps) {
    const start = formatHuman(parseDate(gap.gap_start));
    const end = formatHuman(parseDate(gap.gap_end));
    const dayLabel = gap.gap_days === 1 ? 'day' : 'days';
    blockers.push(
      `Address gap: ${gap.gap_days} ${dayLabel} (${start} \u2013 ${end}) between '${gap.between[0]}' and '${gap.between[1]}'`,
    );
  }

  for (const gap of personal.gaps) {
    const start = formatHuman(parseDate(gap.gap_start));
    const end = formatHuman(parseDate(gap.gap_end));
    const dayLabel = gap.gap_days === 1 ? 'day' : 'days';
    blockers.push(
      `Personal gap: ${gap.gap_days} ${dayLabel} (${start} \u2013 ${end}) between '${gap.between[0]}' and '${gap.between[1]}'`,
    );
  }

  const totalGaps = address.gaps.length + personal.gaps.length;

  return {
    address,
    personal,
    isFullyContinuous: totalGaps === 0,
    totalGaps,
    blockers,
  };
}
