/**
 * Blue-Green Deployment Configuration  -  Directive 041
 *
 * Blue  = current live version (stable, serving all users)
 * Green = next version (staging, tested by Principal + dev team)
 *
 * Deployment slots:
 *   - Production (Blue):  norvaos.ca / sparkly-kelpie-27e16b.netlify.app
 *   - Staging (Green):    staging.norvaos.ca / [staging-site].netlify.app
 *
 * The "switch" promotes Green → Blue by swapping Netlify deploy aliases
 * or DNS pointers. Zero-downtime, instant rollback by re-swapping.
 *
 * Environment detection:
 *   NEXT_PUBLIC_DEPLOY_SLOT = 'blue' | 'green'
 *   NEXT_PUBLIC_DEPLOY_ENV  = 'production' | 'staging' | 'development'
 */

export type DeploySlot = 'blue' | 'green'
export type DeployEnv = 'production' | 'staging' | 'development'

export interface DeploymentInfo {
  slot: DeploySlot
  env: DeployEnv
  version: string
  buildSha: string
  isStaging: boolean
  isProduction: boolean
}

export function getDeploymentInfo(): DeploymentInfo {
  const slot = (process.env.NEXT_PUBLIC_DEPLOY_SLOT as DeploySlot) ?? 'blue'
  const env = (process.env.NEXT_PUBLIC_DEPLOY_ENV as DeployEnv) ?? detectEnv()
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? '1.0.0'
  const buildSha = process.env.NEXT_PUBLIC_BUILD_SHA ?? 'dev'

  return {
    slot,
    env,
    version,
    buildSha,
    isStaging: env === 'staging' || slot === 'green',
    isProduction: env === 'production' && slot === 'blue',
  }
}

function detectEnv(): DeployEnv {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname
    if (hostname.includes('staging') || hostname.includes('green')) return 'staging'
    if (hostname === 'localhost' || hostname === '127.0.0.1') return 'development'
    return 'production'
  }

  // Server-side
  if (process.env.NODE_ENV === 'development') return 'development'
  if (process.env.NEXT_PUBLIC_DEPLOY_ENV) return process.env.NEXT_PUBLIC_DEPLOY_ENV as DeployEnv
  return 'production'
}

/**
 * Staging banner text for the Green slot.
 * Returns null if not in staging.
 */
export function getStagingBanner(): string | null {
  const info = getDeploymentInfo()
  if (!info.isStaging) return null
  return `STAGING (Green Slot)  -  v${info.version} @ ${info.buildSha.slice(0, 7)}`
}

/**
 * Environment-specific Supabase project mapping.
 * Blue and Green can point to the same DB (shared data) or separate
 * Supabase projects (isolated staging data).
 */
export const SLOT_CONFIG = {
  blue: {
    label: 'Production (Blue)',
    colour: '#3B82F6',
    supabaseUrlEnv: 'NEXT_PUBLIC_SUPABASE_URL',
    supabaseAnonKeyEnv: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  },
  green: {
    label: 'Staging (Green)',
    colour: '#22C55E',
    supabaseUrlEnv: 'NEXT_PUBLIC_SUPABASE_URL_STAGING',
    supabaseAnonKeyEnv: 'NEXT_PUBLIC_SUPABASE_ANON_KEY_STAGING',
  },
} as const
