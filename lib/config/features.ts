// ============================================================================
// Feature Registry  -  Platform defaults + per-tenant overrides
// ============================================================================
// Effective features = PLATFORM_FEATURE_DEFAULTS merged with tenant.feature_flags.
// Central control without an admin panel: change defaults here to affect all tenants.
// Per-tenant overrides stored in tenants.feature_flags JSONB.
// ============================================================================

export const PLATFORM_FEATURE_DEFAULTS: Record<string, boolean> = {
  chat: true,
  portal: true,
  document_engine: true,
  risk_engine: true,
  notifications_email: true,
  notifications_push: false,
  billing: false,
  // Front Desk is on by default for all tenants  -  no per-tenant DB flag needed.
  front_desk_mode: true,
}

/**
 * Compute effective feature flags for a tenant by merging platform defaults
 * with tenant-specific overrides.
 */
export function getEffectiveFeatures(
  tenantFlags: Record<string, boolean>
): Record<string, boolean> {
  return { ...PLATFORM_FEATURE_DEFAULTS, ...tenantFlags }
}

/**
 * Check if a specific feature is enabled for a tenant.
 * Falls back to platform default if tenant has no override.
 */
export function isFeatureEnabled(
  flag: string,
  tenantFlags: Record<string, boolean>
): boolean {
  return getEffectiveFeatures(tenantFlags)[flag] ?? false
}
