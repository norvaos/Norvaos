'use client'

import { useUserRole } from './use-user-role'
import { canView } from '@/lib/utils/permissions'

/**
 * Client-side convenience hook for billing:view permission.
 *
 * Returns `canViewBilling` (boolean) and `isLoading`.
 * Use `canViewBilling` to:
 *   - Conditionally render financial UI (revenue KPIs, charts, totals)
 *   - Gate react-query hooks via `enabled: canViewBilling`
 *   - Strip financial fields from CSV exports
 *
 * Inherits the 5-minute staleTime cache from useUserRole().
 */
export function useCanViewBilling() {
  const { role, isLoading } = useUserRole()
  return {
    canViewBilling: canView(role, 'billing'),
    isLoading,
  }
}
