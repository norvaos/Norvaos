'use client'

/**
 * Sovereign Feature Gate  -  Directive 075 + Admin Command 001
 *
 * Wraps any UI section in a feature-flag check. If the feature is disabled
 * for the current tenant, the children simply don't render (zero DOM).
 *
 * Directive 076 Hardening:
 *   - Realtime subscription on `tenants` table invalidates cache INSTANTLY
 *     when the Liaison toggles a flag in Sovereign Control.
 *   - No 5-minute delay  -  changes propagate in under 1 second.
 *
 * Usage:
 *   <SovereignFeature name="IRCC_PARSER">
 *     <IrccExtractionTool />
 *   </SovereignFeature>
 *
 *   <SovereignFeature name="hybrid_ai_ingest" fallback={<UpgradeBanner />}>
 *     <AiInternPanel />
 *   </SovereignFeature>
 */

import { type ReactNode, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/use-user'
import { getEffectiveFeatures } from '@/lib/config/features'
import { Lock, Sparkles } from 'lucide-react'

// ── Hook: fetch tenant config & resolve features ────────────────────────────

export function useTenantFeatures() {
  const { appUser } = useUser()
  const tenantId = appUser?.tenant_id
  const qc = useQueryClient()

  // ── Realtime subscription: instant cache invalidation (Directive 076) ──
  useEffect(() => {
    if (!tenantId) return

    const supabase = createClient()
    const channel = supabase
      .channel(`tenant-config-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tenants',
          filter: `id=eq.${tenantId}`,
        },
        () => {
          // Admin toggled a flag or changed status  -  refetch immediately
          qc.invalidateQueries({ queryKey: ['tenant-config', tenantId] })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tenantId, qc])

  return useQuery({
    queryKey: ['tenant-config', tenantId],
    queryFn: async () => {
      if (!tenantId) return null
      const supabase = createClient()
      const { data, error } = await supabase
        .from('tenants')
        .select('feature_flags, subscription_tier, status, subscription_status')
        .eq('id', tenantId)
        .single()

      if (error || !data) return null

      const raw = (data.feature_flags ?? {}) as Record<string, boolean>
      const effective = getEffectiveFeatures(raw, data.subscription_tier)

      return {
        raw,
        effective,
        subscription_tier: data.subscription_tier as string,
        status: data.status as string,
        subscription_status: data.subscription_status as string,
        is_active: data.status === 'active',
      }
    },
    enabled: !!tenantId,
    staleTime: 1000 * 30, // 30s stale (Realtime handles instant updates; this is the fallback)
    refetchOnWindowFocus: true, // Also refetch when tab regains focus
  })
}

// ── Guard Component ─────────────────────────────────────────────────────────

interface SovereignFeatureProps {
  /** Feature flag key  -  e.g. "hybrid_ai_ingest", "IRCC_PARSER", "voip_bridge" */
  name: string
  /** Optional fallback to show when feature is disabled (default: nothing) */
  fallback?: ReactNode
  /** Show a locked upgrade banner instead of nothing */
  showUpgradeBanner?: boolean
  children: ReactNode
}

export function SovereignFeature({ name, fallback, showUpgradeBanner, children }: SovereignFeatureProps) {
  const { data: config, isLoading } = useTenantFeatures()

  // While loading, render nothing (prevent flash)
  if (isLoading || !config) return null

  // Normalise key: accept both "IRCC_PARSER" and "ircc_parser"
  const normalisedKey = name.toLowerCase()
  const isEnabled = config.effective[normalisedKey] ?? false

  if (isEnabled) return <>{children}</>

  // Feature is disabled
  if (fallback) return <>{fallback}</>

  if (showUpgradeBanner) {
    return (
      <div className="rounded-2xl border border-amber-500/10 bg-gradient-to-r from-amber-500/[0.03] to-orange-500/[0.03] p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
            <Lock className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Feature Locked</p>
            <p className="text-xs text-white/40">
              <Sparkles className="inline h-3 w-3 mr-1 text-amber-400" />
              Upgrade your plan to unlock <span className="font-mono text-amber-400/70">{name}</span>
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Default: render nothing (component doesn't exist in their browser)
  return null
}

// ── Numeric Limit Check ─────────────────────────────────────────────────────

interface SovereignLimitProps {
  /** The feature flag key storing the numeric limit  -  e.g. "comm_template_max" */
  limitKey: string
  /** Current usage count */
  currentCount: number
  /** Fallback when at/over limit */
  fallback?: ReactNode
  children: ReactNode
}

export function SovereignLimit({ limitKey, currentCount, fallback, children }: SovereignLimitProps) {
  const { data: config } = useTenantFeatures()

  if (!config) return null

  const limit = config.raw[limitKey as keyof typeof config.raw]
  const numericLimit = typeof limit === 'number' ? limit : -1

  // -1 = unlimited
  if (numericLimit === -1 || currentCount < numericLimit) {
    return <>{children}</>
  }

  if (fallback) return <>{fallback}</>

  return (
    <div className="rounded-xl border border-amber-500/10 bg-amber-500/[0.03] p-4 text-center">
      <Lock className="mx-auto h-5 w-5 text-amber-400 mb-2" />
      <p className="text-xs text-amber-400/70">Limit reached ({currentCount}/{numericLimit}). Upgrade to increase.</p>
    </div>
  )
}
