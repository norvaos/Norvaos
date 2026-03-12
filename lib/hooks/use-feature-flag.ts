'use client'

import { useTenant } from './use-tenant'
import { isFeatureEnabled, getEffectiveFeatures } from '@/lib/config/features'

export function useFeatureFlag(flag: string): boolean {
  const { tenant } = useTenant()
  if (!tenant?.feature_flags) return false
  return isFeatureEnabled(flag, tenant.feature_flags)
}

export function useFeatureFlags(): Record<string, boolean> {
  const { tenant } = useTenant()
  return getEffectiveFeatures(tenant?.feature_flags ?? {})
}
