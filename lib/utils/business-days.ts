/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Business Day Utility
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Provides deterministic business-day calculations for the lead automation
 * scheduler. Skips weekends (Saturday=6, Sunday=0). Timezone-aware so that
 * "business day" is evaluated relative to the tenant's local timezone.
 *
 * Future: integrate with workspace holiday calendar.
 */

/**
 * Add N business days to a date, skipping weekends.
 * Returns a new Date object in the specified timezone context.
 */
export function addBusinessDays(date: Date, days: number, timezone: string): Date {
  if (days < 0) throw new Error('addBusinessDays does not support negative offsets')
  if (days === 0) return new Date(date)

  // Work in the tenant's local timezone to avoid DST edge cases
  const result = toTimezoneDate(date, timezone)
  let remaining = days

  while (remaining > 0) {
    result.setDate(result.getDate() + 1)
    const dayOfWeek = result.getDay()
    // Skip Saturday (6) and Sunday (0)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      remaining--
    }
  }

  return result
}

/**
 * Count the number of business days between two dates (exclusive of end).
 * Both dates are interpreted in the specified timezone.
 */
export function businessDaysBetween(start: Date, end: Date, timezone: string): number {
  const startLocal = toTimezoneDate(start, timezone)
  const endLocal = toTimezoneDate(end, timezone)

  if (endLocal <= startLocal) return 0

  let count = 0
  const cursor = new Date(startLocal)

  while (cursor < endLocal) {
    cursor.setDate(cursor.getDate() + 1)
    const dayOfWeek = cursor.getDay()
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++
    }
  }

  return count
}

/**
 * Check whether a given date is a business day (not Saturday or Sunday).
 */
export function isBusinessDay(date: Date, timezone: string): boolean {
  const local = toTimezoneDate(date, timezone)
  const dayOfWeek = local.getDay()
  return dayOfWeek !== 0 && dayOfWeek !== 6
}

/**
 * Get the next business day on or after the given date.
 */
export function nextBusinessDay(date: Date, timezone: string): Date {
  const local = toTimezoneDate(date, timezone)
  while (!isBusinessDay(local, timezone)) {
    local.setDate(local.getDate() + 1)
  }
  return local
}

/**
 * Convert a Date to a timezone-aware local date representation.
 * Uses Intl.DateTimeFormat for accurate timezone conversion.
 */
function toTimezoneDate(date: Date, timezone: string): Date {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })

    const parts = formatter.formatToParts(date)
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0'

    return new Date(
      parseInt(get('year'), 10),
      parseInt(get('month'), 10) - 1,
      parseInt(get('day'), 10),
      parseInt(get('hour'), 10),
      parseInt(get('minute'), 10),
      parseInt(get('second'), 10)
    )
  } catch {
    // Fallback: if timezone is invalid, use UTC
    return new Date(date)
  }
}
