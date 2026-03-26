// ============================================================================
// Feature Registry  -  Platform defaults + tier-based entitlements
// ============================================================================
// Three-tier SaaS model: Starter (60%), Professional (80%), Enterprise (100%)
// Each tier unlocks a cumulative set of features.
//
// Resolution order:
//   1. Per-tenant overrides (tenants.feature_flags JSONB)  -  highest priority
//   2. Tier entitlements (subscription_tier → TIER_FEATURES)
//   3. Platform defaults (PLATFORM_FEATURE_DEFAULTS)  -  lowest priority
// ============================================================================

export type SubscriptionTier = 'starter' | 'professional' | 'enterprise'

// ── Platform defaults  -  baseline for ALL tenants regardless of tier ────────
export const PLATFORM_FEATURE_DEFAULTS: Record<string, boolean> = {
  chat: true,
  portal: true,
  document_engine: true,
  risk_engine: true,
  notifications_email: true,
  notifications_push: false,
  billing: false,
  front_desk_mode: true,
}

// ── Tier-based feature entitlements (60 / 80 / 100) ─────────────────────────
// Starter  = ~60% of features  -  core practice management
// Professional = ~80%  -  adds automation, integrations, advanced reporting
// Enterprise = 100%  -  full platform, white-label, API access, AI suite

export const TIER_FEATURES: Record<SubscriptionTier, Record<string, boolean>> = {
  // ── Starter (~60%)  -  Core law firm essentials ──
  starter: {
    // Included
    matters: true,
    contacts: true,
    tasks: true,
    calendar: true,
    documents: true,
    document_engine: true,
    chat: true,
    portal: true,
    notifications_email: true,
    front_desk_mode: true,
    risk_engine: true,
    basic_reporting: true,
    // Excluded
    notifications_push: false,
    billing: false,
    workflow_automation: false,
    custom_fields: false,
    advanced_reporting: false,
    api_access: false,
    white_label: false,
    ai_drafting: false,
    ai_transcription: false,
    ai_ocr: false,
    multi_office: false,
    sla_tracking: false,
    client_portal_branding: false,
    bulk_operations: false,
    audit_export: false,
    priority_support: false,
  },

  // ── Professional (~80%)  -  Automation + integrations ──
  professional: {
    // Everything in Starter
    matters: true,
    contacts: true,
    tasks: true,
    calendar: true,
    documents: true,
    document_engine: true,
    chat: true,
    portal: true,
    notifications_email: true,
    front_desk_mode: true,
    risk_engine: true,
    basic_reporting: true,
    // Professional additions
    notifications_push: true,
    billing: true,
    workflow_automation: true,
    custom_fields: true,
    advanced_reporting: true,
    ai_drafting: true,
    ai_transcription: true,
    ai_ocr: true,
    sla_tracking: true,
    client_portal_branding: true,
    bulk_operations: true,
    // Still excluded
    api_access: false,
    white_label: false,
    multi_office: false,
    audit_export: false,
    priority_support: false,
  },

  // ── Enterprise (100%)  -  Everything unlocked ──
  enterprise: {
    matters: true,
    contacts: true,
    tasks: true,
    calendar: true,
    documents: true,
    document_engine: true,
    chat: true,
    portal: true,
    notifications_email: true,
    notifications_push: true,
    front_desk_mode: true,
    risk_engine: true,
    basic_reporting: true,
    billing: true,
    workflow_automation: true,
    custom_fields: true,
    advanced_reporting: true,
    api_access: true,
    white_label: true,
    ai_drafting: true,
    ai_transcription: true,
    ai_ocr: true,
    multi_office: true,
    sla_tracking: true,
    client_portal_branding: true,
    bulk_operations: true,
    audit_export: true,
    priority_support: true,
  },
}

// ── Tier metadata for UI display ────────────────────────────────────────────

export const TIER_META: Record<SubscriptionTier, {
  label: string
  coverage: number
  colour: string
  description: string
}> = {
  starter: {
    label: 'Starter',
    coverage: 60,
    colour: '#3B82F6',
    description: 'Core practice management for solo and small firms',
  },
  professional: {
    label: 'Professional',
    coverage: 80,
    colour: '#8B5CF6',
    description: 'Automation, AI tools, and advanced integrations',
  },
  enterprise: {
    label: 'Enterprise',
    coverage: 100,
    colour: '#F59E0B',
    description: 'Full platform with white-label, API access, and priority support',
  },
}

/**
 * Get features available for a subscription tier.
 * Falls back to 'starter' for unknown tiers.
 */
export function getTierFeatures(tier: string | null | undefined): Record<string, boolean> {
  const normalised = (tier?.toLowerCase() ?? 'starter') as SubscriptionTier
  return TIER_FEATURES[normalised] ?? TIER_FEATURES.starter
}

/**
 * Compute effective feature flags for a tenant.
 *
 * Resolution: platform defaults → tier entitlements → per-tenant overrides.
 * Per-tenant overrides always win (allows granting Enterprise features to
 * a Starter firm for demos, or disabling a broken feature for one tenant).
 */
export function getEffectiveFeatures(
  tenantFlags: Record<string, boolean>,
  subscriptionTier?: string | null,
): Record<string, boolean> {
  const tierFeatures = getTierFeatures(subscriptionTier)
  return {
    ...PLATFORM_FEATURE_DEFAULTS,
    ...tierFeatures,
    ...tenantFlags,
  }
}

/**
 * Check if a specific feature is enabled for a tenant.
 */
export function isFeatureEnabled(
  flag: string,
  tenantFlags: Record<string, boolean>,
  subscriptionTier?: string | null,
): boolean {
  return getEffectiveFeatures(tenantFlags, subscriptionTier)[flag] ?? false
}

/**
 * Get the list of features a tenant would gain by upgrading from their
 * current tier to the target tier. Useful for upsell prompts.
 */
export function getUpgradeGains(
  currentTier: SubscriptionTier,
  targetTier: SubscriptionTier,
): string[] {
  const current = TIER_FEATURES[currentTier]
  const target = TIER_FEATURES[targetTier]
  return Object.keys(target).filter((key) => target[key] && !current[key])
}

/**
 * Count features enabled vs total for a given tier.
 * Returns { enabled, total, percentage }.
 */
export function getTierCoverage(tier: SubscriptionTier): {
  enabled: number
  total: number
  percentage: number
} {
  const features = TIER_FEATURES[tier]
  const entries = Object.values(features)
  const enabled = entries.filter(Boolean).length
  return {
    enabled,
    total: entries.length,
    percentage: Math.round((enabled / entries.length) * 100),
  }
}
