import type { Database } from '@/lib/types/database'

type CalendarEventRow = Database['public']['Tables']['calendar_events']['Row']

// ── Types ───────────────────────────────────────────────────────────────────

export interface RecurrenceRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  interval: number
  count?: number
  until?: string // ISO date 'yyyy-MM-dd'
  byDay?: string[] // 'MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'
}

// Day-of-week mapping: JS Date.getDay() => RRULE day code
const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const
const DAY_CODE_TO_INDEX: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
}

const DAY_LABELS: Record<string, string> = {
  MO: 'Mon',
  TU: 'Tue',
  WE: 'Wed',
  TH: 'Thu',
  FR: 'Fri',
  SA: 'Sat',
  SU: 'Sun',
}

// ── Parse RRULE ─────────────────────────────────────────────────────────────

/**
 * Parse an RRULE string into a structured object.
 * Example: "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR"
 */
export function parseRRule(rrule: string): RecurrenceRule {
  const parts = rrule.split(';')
  const result: RecurrenceRule = {
    freq: 'WEEKLY',
    interval: 1,
  }

  for (const part of parts) {
    const [key, value] = part.split('=')
    if (!key || !value) continue

    switch (key.toUpperCase()) {
      case 'FREQ':
        result.freq = value.toUpperCase() as RecurrenceRule['freq']
        break
      case 'INTERVAL':
        result.interval = parseInt(value, 10) || 1
        break
      case 'COUNT':
        result.count = parseInt(value, 10)
        break
      case 'UNTIL':
        // Handle both 'yyyy-MM-dd' and 'yyyyMMdd' formats
        result.until = value.includes('-') ? value : `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
        break
      case 'BYDAY':
        result.byDay = value.split(',').map((d) => d.trim().toUpperCase())
        break
    }
  }

  return result
}

// ── Build RRULE ─────────────────────────────────────────────────────────────

/**
 * Build an RRULE string from structured parts.
 */
export function buildRRule(rule: RecurrenceRule): string {
  const parts: string[] = [`FREQ=${rule.freq}`, `INTERVAL=${rule.interval}`]

  if (rule.byDay && rule.byDay.length > 0) {
    parts.push(`BYDAY=${rule.byDay.join(',')}`)
  }
  if (rule.count !== undefined && rule.count > 0) {
    parts.push(`COUNT=${rule.count}`)
  }
  if (rule.until) {
    parts.push(`UNTIL=${rule.until}`)
  }

  return parts.join(';')
}

// ── Date helpers (pure arithmetic, no external deps) ────────────────────────

/** Parse 'yyyy-MM-dd' to a Date object at midnight UTC */
function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Format a Date to 'yyyy-MM-dd' */
function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Add N days to a Date */
function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

/** Add N months to a Date (clamping day if needed) */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date)
  const targetMonth = result.getMonth() + months
  result.setMonth(targetMonth)
  // If day overflowed (e.g. Jan 31 + 1 month = Mar 3), clamp to last day of target month
  if (result.getMonth() !== ((targetMonth % 12) + 12) % 12) {
    result.setDate(0) // set to last day of previous month
  }
  return result
}

/** Add N years to a Date */
function addYears(date: Date, years: number): Date {
  const result = new Date(date)
  result.setFullYear(result.getFullYear() + years)
  // Handle Feb 29 leap year edge case
  if (result.getMonth() !== date.getMonth()) {
    result.setDate(0)
  }
  return result
}

/** Get duration in milliseconds between two ISO datetime strings */
function getDurationMs(startIso: string, endIso: string): number {
  return new Date(endIso).getTime() - new Date(startIso).getTime()
}

/** Replace the date portion of an ISO string, preserving the time portion */
function replaceIsoDate(isoString: string, newDate: string): string {
  const timePart = isoString.includes('T') ? isoString.split('T')[1] : '00:00:00'
  return `${newDate}T${timePart}`
}

// ── Expand Recurrence ───────────────────────────────────────────────────────

/**
 * Generate all occurrence dates for a recurring event within [rangeStart, rangeEnd].
 * Returns virtual copies of the event row with adjusted dates.
 */
export function expandRecurrence(
  event: CalendarEventRow,
  rangeStart: string, // 'yyyy-MM-dd'
  rangeEnd: string // 'yyyy-MM-dd'
): CalendarEventRow[] {
  if (!event.recurrence_rule) return [event]

  const rule = parseRRule(event.recurrence_rule)
  const eventStartDate = event.start_at.split('T')[0]
  const baseDate = parseDate(eventStartDate)
  const rangeStartDate = parseDate(rangeStart)
  const rangeEndDate = parseDate(rangeEnd)
  const durationMs = getDurationMs(event.start_at, event.end_at)

  // Parse exception dates that should be skipped
  const exceptionDates = new Set(
    (event.recurrence_exception_dates ?? []).map((d) => d.split('T')[0])
  )

  const results: CalendarEventRow[] = []
  let occurrenceCount = 0
  // Safety limit to prevent infinite loops
  const MAX_OCCURRENCES = 500

  if (rule.freq === 'WEEKLY' && rule.byDay && rule.byDay.length > 0) {
    // Weekly with BYDAY: iterate day-by-day within each week period
    const targetDays = new Set(rule.byDay.map((d) => DAY_CODE_TO_INDEX[d]))
    let currentWeekStart = new Date(baseDate)
    // Align to the start of the week (Sunday)
    currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay())

    outer: while (occurrenceCount < MAX_OCCURRENCES) {
      // Check each day of the week
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const candidate = addDays(currentWeekStart, dayOffset)
        const candidateStr = formatDate(candidate)

        // Must be on or after the event's original start date
        if (candidate < baseDate) continue
        // Must be on or before rangeEnd
        if (candidate > rangeEndDate) break outer
        // Must be on a target day
        if (!targetDays.has(candidate.getDay())) continue
        // Check UNTIL
        if (rule.until && candidateStr > rule.until) break outer
        // Check COUNT
        if (rule.count !== undefined && occurrenceCount >= rule.count) break outer
        // Skip exception dates
        if (exceptionDates.has(candidateStr)) {
          occurrenceCount++
          continue
        }

        occurrenceCount++

        // Only include if within rangeStart
        if (candidate >= rangeStartDate) {
          const newStartAt = replaceIsoDate(event.start_at, candidateStr)
          const newEndAt = new Date(new Date(newStartAt).getTime() + durationMs).toISOString()

          results.push({
            ...event,
            id: `${event.id}-recurrence-${occurrenceCount}`,
            start_at: newStartAt,
            end_at: newEndAt.includes('T')
              ? `${newEndAt.split('T')[0]}T${newEndAt.split('T')[1]}`
              : newEndAt,
          })
        }
      }

      // Advance by interval weeks
      currentWeekStart = addDays(currentWeekStart, 7 * rule.interval)
    }
  } else {
    // DAILY, WEEKLY (no BYDAY), MONTHLY, YEARLY
    let current = new Date(baseDate)

    while (occurrenceCount < MAX_OCCURRENCES) {
      const currentStr = formatDate(current)

      // Past range end?
      if (current > rangeEndDate) break
      // Past UNTIL?
      if (rule.until && currentStr > rule.until) break
      // Past COUNT?
      if (rule.count !== undefined && occurrenceCount >= rule.count) break

      occurrenceCount++

      // Only include if within range and not an exception
      if (current >= rangeStartDate && !exceptionDates.has(currentStr)) {
        const newStartAt = replaceIsoDate(event.start_at, currentStr)
        const endDate = new Date(new Date(newStartAt).getTime() + durationMs)
        const endDateStr = formatDate(endDate)
        const endTimePart = event.end_at.includes('T') ? event.end_at.split('T')[1] : '23:59:59'
        const newEndAt = `${endDateStr}T${endTimePart}`

        results.push({
          ...event,
          id: `${event.id}-recurrence-${occurrenceCount}`,
          start_at: newStartAt,
          end_at: newEndAt,
        })
      }

      // Advance to next occurrence
      switch (rule.freq) {
        case 'DAILY':
          current = addDays(current, rule.interval)
          break
        case 'WEEKLY':
          current = addDays(current, 7 * rule.interval)
          break
        case 'MONTHLY':
          current = addMonths(current, rule.interval)
          break
        case 'YEARLY':
          current = addYears(current, rule.interval)
          break
      }
    }
  }

  return results
}

// ── Describe Recurrence ─────────────────────────────────────────────────────

/**
 * Generate a human-readable description of an RRULE string.
 * Examples:
 *   "Every day"
 *   "Every week on Mon, Wed, Fri"
 *   "Every 2 weeks"
 *   "Every month"
 *   "Every year"
 */
export function describeRecurrence(rrule: string): string {
  const rule = parseRRule(rrule)

  let base = ''
  const freqLabel: Record<string, string> = {
    DAILY: 'day',
    WEEKLY: 'week',
    MONTHLY: 'month',
    YEARLY: 'year',
  }

  const unit = freqLabel[rule.freq] ?? rule.freq.toLowerCase()

  if (rule.interval === 1) {
    base = `Every ${unit}`
  } else {
    base = `Every ${rule.interval} ${unit}s`
  }

  // Add day-of-week details for weekly
  if (rule.freq === 'WEEKLY' && rule.byDay && rule.byDay.length > 0) {
    const dayLabels = rule.byDay.map((d) => DAY_LABELS[d] ?? d)
    base += ` on ${dayLabels.join(', ')}`
  }

  // Add end condition
  const suffixes: string[] = []
  if (rule.count !== undefined) {
    suffixes.push(`${rule.count} times`)
  }
  if (rule.until) {
    const untilDate = parseDate(rule.until)
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ]
    suffixes.push(`until ${months[untilDate.getMonth()]} ${untilDate.getDate()}, ${untilDate.getFullYear()}`)
  }

  if (suffixes.length > 0) {
    base += `, ${suffixes.join(', ')}`
  }

  return base
}

// ── Preset helpers for UI ───────────────────────────────────────────────────

export type RecurrencePreset = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'

/** Get a preset label for display */
export function getPresetLabel(preset: RecurrencePreset): string {
  switch (preset) {
    case 'none':
      return 'Does not repeat'
    case 'daily':
      return 'Daily'
    case 'weekly':
      return 'Weekly'
    case 'monthly':
      return 'Monthly'
    case 'yearly':
      return 'Yearly'
    case 'custom':
      return 'Custom'
  }
}

/** Build an RRULE from a preset selection */
export function buildRRuleFromPreset(
  preset: RecurrencePreset,
  options?: {
    byDay?: string[]
    interval?: number
    freq?: RecurrenceRule['freq']
  }
): string | null {
  if (preset === 'none') return null

  switch (preset) {
    case 'daily':
      return buildRRule({ freq: 'DAILY', interval: 1 })
    case 'weekly':
      return buildRRule({
        freq: 'WEEKLY',
        interval: 1,
        byDay: options?.byDay,
      })
    case 'monthly':
      return buildRRule({ freq: 'MONTHLY', interval: 1 })
    case 'yearly':
      return buildRRule({ freq: 'YEARLY', interval: 1 })
    case 'custom':
      return buildRRule({
        freq: options?.freq ?? 'WEEKLY',
        interval: options?.interval ?? 1,
        byDay: options?.byDay,
      })
  }
}

/** Determine the preset from an existing RRULE string */
export function detectPreset(rrule: string | null): RecurrencePreset {
  if (!rrule) return 'none'
  const rule = parseRRule(rrule)

  if (rule.freq === 'DAILY' && rule.interval === 1 && !rule.byDay?.length) return 'daily'
  if (rule.freq === 'WEEKLY' && rule.interval === 1 && !rule.byDay?.length) return 'weekly'
  if (rule.freq === 'MONTHLY' && rule.interval === 1 && !rule.byDay?.length) return 'monthly'
  if (rule.freq === 'YEARLY' && rule.interval === 1 && !rule.byDay?.length) return 'yearly'
  if (rule.freq === 'WEEKLY' && rule.interval === 1 && rule.byDay?.length) return 'weekly'

  return 'custom'
}
