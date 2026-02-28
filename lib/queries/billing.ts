import { useQuery, useMutation } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Subscription {
  id: string
  tenant_id: string
  stripe_subscription_id: string | null
  stripe_customer_id: string | null
  plan_tier: string
  status: string
  billing_interval: string
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  cancelled_at: string | null
  trial_ends_at: string | null
  created_at: string
  updated_at: string
}

export interface BillingInvoice {
  id: string
  tenant_id: string
  stripe_invoice_id: string | null
  amount: number
  currency: string
  status: string
  invoice_url: string | null
  invoice_pdf: string | null
  period_start: string | null
  period_end: string | null
  created_at: string
}

export interface PlanFeature {
  id: string
  plan_tier: string
  feature_key: string
  enabled: boolean
  limit_value: number | null
}

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const billingKeys = {
  subscription: (tenantId: string) => ['subscription', tenantId] as const,
  invoices: (tenantId: string) => ['billing-invoices', tenantId] as const,
  planFeatures: (planTier: string) => ['plan-features', planTier] as const,
  featureAccess: (tenantId: string, featureKey: string) =>
    ['feature-access', tenantId, featureKey] as const,
}

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * Fetches the subscription record for a tenant.
 */
export function useSubscription(tenantId: string) {
  return useQuery({
    queryKey: billingKeys.subscription(tenantId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('tenant_id', tenantId)
        .single()

      if (error) throw error
      return data as Subscription
    },
    enabled: !!tenantId,
  })
}

/**
 * Fetches invoice history for a tenant, ordered by most recent first.
 */
export function useBillingInvoices(tenantId: string) {
  return useQuery({
    queryKey: billingKeys.invoices(tenantId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('billing_invoices')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      return data as BillingInvoice[]
    },
    enabled: !!tenantId,
  })
}

/**
 * Fetches features for a given plan tier.
 */
export function usePlanFeatures(planTier: string) {
  return useQuery({
    queryKey: billingKeys.planFeatures(planTier),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('plan_features')
        .select('*')
        .eq('plan_tier', planTier)

      if (error) throw error
      return data as PlanFeature[]
    },
    enabled: !!planTier,
  })
}

/**
 * Checks if a tenant has access to a specific feature based on their plan.
 * Resolves the tenant's subscription_tier, then looks up the feature in plan_features.
 */
export function useCheckFeatureAccess(tenantId: string, featureKey: string) {
  return useQuery({
    queryKey: billingKeys.featureAccess(tenantId, featureKey),
    queryFn: async () => {
      const supabase = createClient()

      // Step 1: Get the tenant's current subscription tier
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select('subscription_tier')
        .eq('id', tenantId)
        .single()

      if (tenantError) throw tenantError

      const tier = tenant.subscription_tier

      // Step 2: Check if the feature exists for this tier
      const { data: feature, error: featureError } = await supabase
        .from('plan_features')
        .select('*')
        .eq('plan_tier', tier)
        .eq('feature_key', featureKey)
        .single()

      if (featureError && featureError.code !== 'PGRST116') {
        // PGRST116 = "no rows returned" — means feature not found for this tier
        throw featureError
      }

      if (!feature) {
        return { hasAccess: false, limit: null }
      }

      return {
        hasAccess: feature.enabled,
        limit: feature.limit_value,
      }
    },
    enabled: !!tenantId && !!featureKey,
  })
}

// ─── Mutations ──────────────────────────────────────────────────────────────

/**
 * Creates a Stripe Checkout session and redirects the user to Stripe.
 */
export function useCreateCheckout() {
  return useMutation({
    mutationFn: async (params: { planTier: string; interval: string }) => {
      const response = await fetch('/api/billing/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create checkout session')
      }

      return response.json() as Promise<{ url: string }>
    },
    onSuccess: (data) => {
      window.location.href = data.url
    },
  })
}

/**
 * Creates a Stripe Customer Portal session and redirects the user.
 */
export function useCreatePortalSession() {
  return useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/billing/create-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create portal session')
      }

      return response.json() as Promise<{ url: string }>
    },
    onSuccess: (data) => {
      window.location.href = data.url
    },
  })
}
