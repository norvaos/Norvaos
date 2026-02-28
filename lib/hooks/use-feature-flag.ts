'use client'

import { useTenant } from './use-tenant'

export function useFeatureFlag(flag: string): boolean {
  const { tenant } = useTenant()
  if (!tenant?.feature_flags) return false
  return tenant.feature_flags[flag] === true
}

export function useFeatureFlags(): Record<string, boolean> {
  const { tenant } = useTenant()
  return tenant?.feature_flags ?? {}
}
