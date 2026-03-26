/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Region Guard  -  Directive 005.3 "Compliance Kill Switch"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Validates that the Supabase connection resolves to the verified
 * ca-central-1 (Canada) region. If it does not, the application throws
 * a CRITICAL_COMPLIANCE_ERROR and halts.
 *
 * We do NOT "assume" compliance; we enforce it at the boot level.
 *
 * This guard is called once at server startup (module-level) and cached.
 * Subsequent calls return the cached result without re-checking.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export class CriticalComplianceError extends Error {
  constructor(message: string) {
    super(`CRITICAL_COMPLIANCE_ERROR: ${message}`)
    this.name = 'CriticalComplianceError'
  }
}

// ─── Region validation ────────────────────────────────────────────────────

const REQUIRED_REGION = 'ca-central-1'

/** Cached verification result  -  null means not yet checked. */
let _verified: boolean | null = null
let _detectedRegion: string | null = null

/**
 * Extracts the region from the Supabase project URL.
 *
 * Supabase URLs follow the pattern:
 *   https://<project-ref>.supabase.co  (hosted)
 *   The pooler/direct connection strings contain the region:
 *     aws-0-ca-central-1.pooler.supabase.com
 *
 * We also accept an explicit SUPABASE_REGION env var as authoritative.
 */
export function detectSupabaseRegion(): string | null {
  // 1. Explicit override  -  most reliable
  const explicit = process.env.SUPABASE_REGION
  if (explicit) return explicit.toLowerCase()

  // 2. Parse from SUPABASE_DB_URL / DATABASE_URL (pooler string)
  const dbUrl =
    process.env.SUPABASE_DB_URL ||
    process.env.DATABASE_URL ||
    ''
  const poolerMatch = dbUrl.match(/aws-\d+-([a-z]+-[a-z]+-\d+)\.pooler/)
  if (poolerMatch) return poolerMatch[1]

  // 3. Parse from NEXT_PUBLIC_SUPABASE_URL
  //    Supabase project URLs don't contain region directly, but the
  //    project dashboard API does. Fall back to the URL hostname.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

  // Check for region in the URL (some self-hosted / custom domains)
  const regionMatch = supabaseUrl.match(/([a-z]+-[a-z]+-\d+)/)
  if (regionMatch) return regionMatch[1]

  return null
}

/**
 * Verifies the Supabase region is ca-central-1.
 *
 * Returns the detected region string for dashboard display.
 * Throws CriticalComplianceError if region is wrong.
 *
 * In development (localhost), logs a warning but does NOT throw,
 * since local Supabase instances don't have region strings.
 */
export function enforceRegionCompliance(): {
  region: string | null
  verified: boolean
  environment: 'production' | 'development'
} {
  if (_verified !== null) {
    return {
      region: _detectedRegion,
      verified: _verified,
      environment: isDevelopment() ? 'development' : 'production',
    }
  }

  const region = detectSupabaseRegion()
  _detectedRegion = region

  const isDev = isDevelopment()

  if (!region) {
    // No region detected
    if (isDev) {
      // Dev/local  -  warn but allow
      console.warn(
        '[RegionGuard] WARNING: Could not detect Supabase region. ' +
        'Set SUPABASE_REGION=ca-central-1 in .env to suppress this warning.',
      )
      _verified = true
      return { region: null, verified: true, environment: 'development' }
    }

    // Production with no region  -  BLOCK
    _verified = false
    throw new CriticalComplianceError(
      'Could not verify database region. ' +
      'Set SUPABASE_REGION=ca-central-1 or ensure DATABASE_URL contains the region. ' +
      'Canadian data residency (PIPEDA) requires verified ca-central-1 hosting.',
    )
  }

  if (region !== REQUIRED_REGION) {
    _verified = false
    throw new CriticalComplianceError(
      `Database region is "${region}"  -  expected "${REQUIRED_REGION}". ` +
      'All NorvaOS data must reside in Canada (ca-central-1) per PIPEDA compliance. ' +
      'Refusing to start. Contact infrastructure team.',
    )
  }

  // Region verified
  _verified = true
  console.log(`[RegionGuard] Region verified: ${region} ✓`)
  return { region, verified: true, environment: isDev ? 'development' : 'production' }
}

/**
 * Non-throwing version for the compliance dashboard.
 * Returns current status without enforcing.
 */
export function getRegionStatus(): {
  region: string | null
  verified: boolean
  required: string
  environment: 'production' | 'development'
} {
  const region = _detectedRegion ?? detectSupabaseRegion()
  return {
    region,
    verified: region === REQUIRED_REGION || (isDevelopment() && region === null),
    required: REQUIRED_REGION,
    environment: isDevelopment() ? 'development' : 'production',
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function isDevelopment(): boolean {
  const url = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  return (
    url.includes('localhost') ||
    url.includes('127.0.0.1') ||
    process.env.NODE_ENV === 'development'
  )
}
