/**
 * verify-environment.ts
 *
 * Runs health checks on a NorvaOS tenant environment.
 * Use before go-live and during incident triage.
 *
 * Usage:
 *   TENANT_ID=<uuid> SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> \
 *   npx ts-node scripts/support/verify-environment.ts
 *
 *   # or pass tenant via flag:
 *   npx ts-node scripts/support/verify-environment.ts --tenant <uuid>
 *
 * Exit code: 0 = all checks pass (or warnings only), 1 = one or more FAIL
 *
 * Team 3 / Module 4 — Support and Implementation Tooling
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ─── Config ──────────────────────────────────────────────────────────────────

function getTenantId(): string | undefined {
  const flagIdx = process.argv.indexOf('--tenant')
  if (flagIdx !== -1) return process.argv[flagIdx + 1]
  return process.env.TENANT_ID
}

const TENANT_ID = getTenantId()
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
]

// ─── Output ──────────────────────────────────────────────────────────────────

type CheckStatus = 'PASS' | 'FAIL' | 'WARN' | 'SKIP'

interface CheckResult {
  name: string
  status: CheckStatus
  detail: string
}

const results: CheckResult[] = []

function pass(name: string, detail: string): void {
  results.push({ name, status: 'PASS', detail })
}
function fail(name: string, detail: string): void {
  results.push({ name, status: 'FAIL', detail })
}
function warn(name: string, detail: string): void {
  results.push({ name, status: 'WARN', detail })
}
function skip(name: string, detail: string): void {
  results.push({ name, status: 'SKIP', detail })
}

// ─── Checks ───────────────────────────────────────────────────────────────────

async function checkEnvVars(): Promise<void> {
  const missing = REQUIRED_ENV_VARS.filter((v) => !process.env[v])
  if (missing.length > 0) {
    fail('env_vars', `Missing required environment variables: ${missing.join(', ')}`)
  } else {
    pass('env_vars', `All ${REQUIRED_ENV_VARS.length} required env vars are set`)
  }

  // Optional but important vars
  if (!process.env.RESEND_API_KEY) {
    warn('env_resend', 'RESEND_API_KEY is not set — email delivery will fail')
  } else {
    pass('env_resend', 'RESEND_API_KEY is set')
  }

  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) {
    warn('env_sentry', 'SENTRY_DSN is not set — error tracking is disabled')
  } else {
    pass('env_sentry', 'Sentry DSN is configured')
  }
}

async function checkSupabaseConnectivity(supabase: SupabaseClient): Promise<void> {
  try {
    // Simple ping: fetch a single row from a known lightweight table
    const { error } = await supabase
      .from('users')
      .select('id')
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found — that's fine
      fail('supabase_connectivity', `Database query failed: ${error.message}`)
    } else {
      pass('supabase_connectivity', 'Supabase is reachable and responding')
    }
  } catch (err) {
    fail('supabase_connectivity', `Cannot reach Supabase: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function checkTenantExists(supabase: SupabaseClient, tenantId: string): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('tenants')
      .select('id, name, is_active')
      .eq('id', tenantId)
      .single()

    if (error || !data) {
      fail('tenant_exists', `Tenant ${tenantId} not found in tenants table`)
      return
    }

    if (!(data as Record<string, unknown>).is_active) {
      warn('tenant_exists', `Tenant ${(data as Record<string, unknown>).name} exists but is_active = false`)
    } else {
      pass('tenant_exists', `Tenant "${(data as Record<string, unknown>).name}" is active`)
    }
  } catch (err) {
    fail('tenant_exists', `Error checking tenant: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function checkEmailIntegration(supabase: SupabaseClient, tenantId: string): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('platform_connections')
      .select('platform, status')
      .eq('tenant_id', tenantId)
      .in('platform', ['microsoft', 'microsoft_365'])
      .limit(1)
      .single()

    if (error || !data) {
      warn('email_integration', 'No Microsoft 365 email connection found for this tenant')
    } else if ((data as Record<string, unknown>).status !== 'connected') {
      warn('email_integration', `Email connection exists but status = ${(data as Record<string, unknown>).status}`)
    } else {
      pass('email_integration', 'Microsoft 365 email integration is connected')
    }
  } catch {
    warn('email_integration', 'Could not check email integration — platform_connections table may not exist or is empty')
  }
}

async function checkStalledJobs(supabase: SupabaseClient, tenantId: string): Promise<void> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const { count, error } = await supabase
      .from('job_runs')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
      .lt('created_at', oneHourAgo)

    if (error) {
      warn('job_queue', `Could not check job queue: ${error.message}`)
      return
    }

    const stalled = count ?? 0
    if (stalled === 0) {
      pass('job_queue', 'No stalled jobs (pending > 1 hour)')
    } else if (stalled <= 5) {
      warn('job_queue', `${stalled} job(s) have been pending for over 1 hour — check worker health`)
    } else {
      fail('job_queue', `${stalled} stalled jobs — worker may be down`)
    }
  } catch (err) {
    warn('job_queue', `Job queue check failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function checkRlsActive(supabase: SupabaseClient, tenantId: string): Promise<void> {
  // Attempt to query with a fake tenant ID — should return 0 rows if RLS is enforced
  try {
    const fakeTenantId = '00000000-0000-0000-0000-000000000000'
    const { count } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', fakeTenantId)

    // With service role key, RLS is bypassed — so this checks schema only
    // With anon/user key, 0 rows confirms RLS is working
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      warn('rls_check', 'Using service role key — RLS bypass is expected. Run with anon key for a true RLS check.')
    } else if ((count ?? 0) === 0) {
      pass('rls_check', 'RLS is active — fake tenant query returned 0 rows')
    } else {
      fail('rls_check', `RLS may not be enforced — fake tenant query returned ${count} rows`)
    }
  } catch (err) {
    warn('rls_check', `RLS check failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  void tenantId // referenced to avoid lint warning
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\nNorvaOS — Environment Verification')
  console.log('═══════════════════════════════════')

  if (TENANT_ID) {
    console.log(`Tenant: ${TENANT_ID}`)
  } else {
    console.log('No TENANT_ID provided — skipping tenant-scoped checks')
  }

  console.log()

  // 1. Env vars (always runs)
  await checkEnvVars()

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    fail('supabase_config', 'SUPABASE_URL or key not set — cannot run database checks')
  } else {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false },
    })

    // 2. Connectivity
    await checkSupabaseConnectivity(supabase)

    if (TENANT_ID) {
      // 3–6. Tenant-scoped checks
      await checkTenantExists(supabase, TENANT_ID)
      await checkEmailIntegration(supabase, TENANT_ID)
      await checkStalledJobs(supabase, TENANT_ID)
      await checkRlsActive(supabase, TENANT_ID)
    } else {
      skip('tenant_checks', 'No TENANT_ID — tenant-scoped checks skipped')
    }
  }

  // ─── Report ───────────────────────────────────────────────────────────────

  console.log('Results')
  console.log('───────')

  let failCount = 0
  let warnCount = 0

  for (const r of results) {
    const icon =
      r.status === 'PASS' ? '✓' :
      r.status === 'WARN' ? '⚠' :
      r.status === 'SKIP' ? '–' : '✗'

    console.log(`  ${icon} [${r.status}] ${r.name}: ${r.detail}`)

    if (r.status === 'FAIL') failCount++
    if (r.status === 'WARN') warnCount++
  }

  console.log()

  if (failCount > 0) {
    console.error(`FAILED — ${failCount} check(s) failed, ${warnCount} warning(s)`)
    process.exit(1)
  } else if (warnCount > 0) {
    console.warn(`PASSED WITH WARNINGS — ${warnCount} warning(s) require attention`)
    process.exit(0)
  } else {
    console.log('ALL CHECKS PASSED')
    process.exit(0)
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
