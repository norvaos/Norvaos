import { formatInTimeZone } from 'date-fns-tz'

const FALLBACK_TZ = 'America/Toronto'

/** Format an ISO/date string in the tenant's timezone with any date-fns format pattern. */
export function formatInTz(
  date: string | Date,
  timezone: string | undefined,
  formatStr: string
): string {
  return formatInTimeZone(new Date(date), timezone || FALLBACK_TZ, formatStr)
}

/** Extract 'yyyy-MM-dd' in the tenant's timezone (handles day boundary correctly). */
export function toTenantDate(isoString: string, timezone?: string): string {
  return formatInTz(isoString, timezone, 'yyyy-MM-dd')
}

/** Extract 'HH:mm' in the tenant's timezone. */
export function toTenantTime(isoString: string, timezone?: string): string {
  return formatInTz(isoString, timezone, 'HH:mm')
}
