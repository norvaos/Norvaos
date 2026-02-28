import { format, formatDistanceToNow, isToday, isYesterday, isPast, differenceInDays } from 'date-fns'

export function formatDate(date: string | Date | null | undefined, dateFormat = 'dd-MM-yyyy'): string {
  if (!date) return ''
  return format(new Date(date), dateFormat)
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return ''
  return format(new Date(date), 'dd-MM-yyyy h:mm a')
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

export function isOverdue(date: string | Date | null | undefined): boolean {
  if (!date) return false
  return isPast(new Date(date)) && !isToday(new Date(date))
}

export function daysInStage(stageEnteredAt: string | Date | null | undefined): number {
  if (!stageEnteredAt) return 0
  return differenceInDays(new Date(), new Date(stageEnteredAt))
}
