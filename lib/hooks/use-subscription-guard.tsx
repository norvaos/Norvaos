'use client'

import { useMemo } from 'react'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useSubscription } from '@/lib/queries/billing'
import { PLAN_TIERS, type PlanTier } from '@/lib/config/version'

interface SubscriptionGuardResult {
  /** Whether the subscription is in a usable state (active or trialing) */
  isActive: boolean
  /** Whether the user is on a trial */
  isTrial: boolean
  /** Whether the trial has expired */
  isTrialExpired: boolean
  /** Whether the subscription is past due (payment failed) */
  isPastDue: boolean
  /** Whether the subscription is cancelled */
  isCancelled: boolean
  /** The current plan tier */
  planTier: PlanTier
  /** Plan display name */
  planName: string
  /** Days remaining in trial (null if not trialing) */
  trialDaysRemaining: number | null
  /** Whether we're still loading subscription data */
  isLoading: boolean
  /** Check if a specific feature is available on the current plan */
  hasFeature: (feature: string) => boolean
  /** Check a numeric limit for the current plan (-1 = unlimited) */
  getLimit: (key: 'maxUsers' | 'maxStorageGb' | 'maxMatters' | 'maxContacts') => number
}

/**
 * Hook that provides subscription status and feature access checks.
 * Use this in layouts or pages to gate features based on the active plan.
 *
 * Example:
 * ```tsx
 * const { isActive, hasFeature, isTrial } = useSubscriptionGuard()
 * if (!isActive) return <SubscriptionExpiredBanner />
 * if (!hasFeature('email_sync')) return <UpgradePrompt feature="Email Sync" />
 * ```
 */
export function useSubscriptionGuard(): SubscriptionGuardResult {
  const { tenant, isLoading: tenantLoading } = useTenant()
  const { data: subscription, isLoading: subLoading } = useSubscription(tenant?.id || '')

  return useMemo(() => {
    const isLoading = tenantLoading || subLoading

    if (!tenant) {
      return {
        isActive: false,
        isTrial: false,
        isTrialExpired: false,
        isPastDue: false,
        isCancelled: false,
        planTier: 'trial' as PlanTier,
        planName: 'Trial',
        trialDaysRemaining: null,
        isLoading,
        hasFeature: () => false,
        getLimit: () => 0,
      }
    }

    const tier = (tenant.subscription_tier || 'trial') as PlanTier
    const status = tenant.subscription_status || 'trialing'
    const plan = PLAN_TIERS[tier] || PLAN_TIERS.trial

    // Trial calculations
    const isTrial = status === 'trialing' || tier === 'trial'
    let trialDaysRemaining: number | null = null
    let isTrialExpired = false

    if (isTrial && tenant.trial_ends_at) {
      const now = new Date()
      const trialEnd = new Date(tenant.trial_ends_at)
      const diffMs = trialEnd.getTime() - now.getTime()
      trialDaysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
      isTrialExpired = diffMs <= 0
    }

    const isActive = status === 'active' || (isTrial && !isTrialExpired)
    const isPastDue = status === 'past_due'
    const isCancelled = status === 'cancelled'

    const hasFeature = (feature: string): boolean => {
      if (!isActive && !isPastDue) return false
      return (plan.features as readonly string[]).includes(feature)
    }

    const getLimit = (key: 'maxUsers' | 'maxStorageGb' | 'maxMatters' | 'maxContacts'): number => {
      return plan[key] ?? 0
    }

    return {
      isActive,
      isTrial,
      isTrialExpired,
      isPastDue,
      isCancelled,
      planTier: tier,
      planName: plan.name,
      trialDaysRemaining,
      isLoading,
      hasFeature,
      getLimit,
    }
  }, [tenant, subscription, tenantLoading, subLoading])
}
