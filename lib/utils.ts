import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a value stored in cents to a CAD currency string.
 * e.g. 288500 → "$2,885.00"
 */
const cadFormatter = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return '—'
  return cadFormatter.format(cents / 100)
}
