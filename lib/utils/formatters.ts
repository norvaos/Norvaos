import { format, formatDistanceToNow, isToday, isYesterday, isPast, differenceInDays } from 'date-fns'

// ── Tenant date-format singleton ─────────────────────────────────────────────
// The TenantProvider calls setTenantDateFormat() once the tenant loads.
// All formatDate / formatDateTime calls automatically pick up the tenant's
// preference without needing any changes in the 80+ files that use them.

let _tenantDateFnsFormat = 'dd-MMM-yyyy' // safe fallback

/**
 * Convert the moment-style token string stored in the DB (e.g. "DD/MM/YYYY")
 * into a date-fns compatible token string (e.g. "dd/MM/yyyy").
 */
function toDateFnsTokens(fmt: string): string {
  // Process longer tokens first to avoid partial replacement collisions.
  return fmt
    .replace(/YYYY/g, 'yyyy') // 4-digit year
    .replace(/DD/g,   'dd')   // day of month (2-digit)
  // MM (month) and MMM (month abbrev) are identical in date-fns — no change needed.
}

/** Called by TenantProvider after the tenant data loads. */
export function setTenantDateFormat(tenantFormat: string): void {
  _tenantDateFnsFormat = toDateFnsTokens(tenantFormat)
}

// ── Formatting helpers ───────────────────────────────────────────────────────

export function formatDate(date: string | Date | null | undefined, dateFormat?: string): string {
  if (!date) return ''
  return format(new Date(date), dateFormat ?? _tenantDateFnsFormat)
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return ''
  return format(new Date(date), `${_tenantDateFnsFormat} h:mm a`)
}

export function formatRelativeDate(date: string | Date | null | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return formatDistanceToNow(d, { addSuffix: true })
}

export function formatCurrency(amount: number | null | undefined, currency = 'CAD'): string {
  if (amount == null) return ''
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
  }).format(amount)
}

export function formatFullName(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(' ')
}

export function formatInitials(firstName: string | null, lastName: string | null): string {
  const first = firstName?.charAt(0)?.toUpperCase() ?? ''
  const last = lastName?.charAt(0)?.toUpperCase() ?? ''
  return first + last || '?'
}

export function formatPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return ''
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
  }
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`
  }
  return phone
}

export function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const hrs = Math.floor(totalSec / 3600)
  const mins = Math.floor((totalSec % 3600) / 60)
  const secs = totalSec % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  if (hrs > 0) return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`
  return `${pad(mins)}:${pad(secs)}`
}

export function formatTimeHM(d: Date): string {
  return d.toLocaleTimeString('en-CA', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export function isOverdue(date: string | Date | null | undefined): boolean {
  if (!date) return false
  return isPast(new Date(date)) && !isToday(new Date(date))
}

export function daysInStage(stageEnteredAt: string | Date | null | undefined): number {
  if (!stageEnteredAt) return 0
  return differenceInDays(new Date(), new Date(stageEnteredAt))
}
