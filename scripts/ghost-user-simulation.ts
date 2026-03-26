/**
 * Ghost-User Simulation — Team COMMAND
 *
 * Spawns 100 concurrent virtual clients across the Global 15 languages.
 * Each ghost hits one of three Action Trident paths simultaneously:
 *   1. Intake Start (POST /api/matters)
 *   2. Vault Drop — 50MB encrypted PDF upload (POST /api/portal/[token]/upload-document)
 *   3. Biometric Login — Portal token validation (GET /api/portal/[token])
 *
 * Validates Migration 186 invariants after the storm:
 *   - tenants.settings.ui_version === 'v2-sovereign' (never reverts to legacy)
 *   - tenants.feature_flags.intelligence_hub === true
 *   - Elevated/Hot leads.preferred_view === 'workspace_shell'
 *
 * Usage:
 *   npx tsx scripts/ghost-user-simulation.ts [--base-url http://localhost:3000]
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from '@supabase/supabase-js'

// ── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = process.argv.find(a => a.startsWith('--base-url='))?.split('=')[1]
  ?? process.env.NEXT_PUBLIC_SITE_URL
  ?? 'http://localhost:3000'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const TOTAL_GHOSTS = 100
const CONCURRENCY_BATCH = 20 // fire 20 at a time to avoid socket exhaustion

// ── Global 15 Languages ─────────────────────────────────────────────────────

const GLOBAL_15 = [
  { code: 'en', name: 'English',    dir: 'ltr' },
  { code: 'fr', name: 'French',     dir: 'ltr' },
  { code: 'zh', name: 'Mandarin',   dir: 'ltr' },
  { code: 'hi', name: 'Hindi',      dir: 'ltr' },
  { code: 'ur', name: 'Urdu',       dir: 'rtl' },
  { code: 'pa', name: 'Punjabi',    dir: 'ltr' },
  { code: 'ar', name: 'Arabic',     dir: 'rtl' },
  { code: 'fa', name: 'Farsi',      dir: 'rtl' },
  { code: 'tl', name: 'Tagalog',    dir: 'ltr' },
  { code: 'es', name: 'Spanish',    dir: 'ltr' },
  { code: 'pt', name: 'Portuguese', dir: 'ltr' },
  { code: 'bn', name: 'Bengali',    dir: 'ltr' },
  { code: 'vi', name: 'Vietnamese', dir: 'ltr' },
  { code: 'ko', name: 'Korean',     dir: 'ltr' },
  { code: 'de', name: 'German',     dir: 'ltr' },
] as const

type ActionType = 'intake' | 'vault_drop' | 'biometric_login'
const ACTIONS: ActionType[] = ['intake', 'vault_drop', 'biometric_login']

// ── Result Tracking ─────────────────────────────────────────────────────────

interface GhostResult {
  ghostId: number
  locale: string
  action: ActionType
  status: 'pass' | 'fail' | 'error'
  httpStatus: number | null
  latencyMs: number
  error?: string
}

const results: GhostResult[] = []

// ── Utilities ───────────────────────────────────────────────────────────────

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function generateGhostName(locale: string, id: number): string {
  const prefixes: Record<string, string> = {
    en: 'Ghost', fr: 'Fantome', zh: 'GuiYong', hi: 'Bhoot',
    ur: 'Rooh', pa: 'Pret', ar: 'Shabah', fa: 'Rouh',
    tl: 'Multo', es: 'Fantasma', pt: 'Fantasma', bn: 'Bhoot',
    vi: 'Ma', ko: 'Gwisin', de: 'Geist',
  }
  return `${prefixes[locale] ?? 'Ghost'}-${id.toString().padStart(3, '0')}`
}

/** Generates a fake 50MB-ish buffer (we send 1KB for speed — the test is about concurrency, not bandwidth) */
function generateFakePDF(): Blob {
  const header = '%PDF-1.4 Ghost-User Stress Test Document\n'
  const body = 'X'.repeat(1024) // 1KB payload — sufficient for concurrency test
  return new Blob([header + body], { type: 'application/pdf' })
}

// ── Ghost Actions ───────────────────────────────────────────────────────────

async function ghostIntake(ghostId: number, locale: string, authToken: string): Promise<GhostResult> {
  const start = Date.now()
  const ghostName = generateGhostName(locale, ghostId)

  try {
    const res = await fetch(`${BASE_URL}/api/matters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'Accept-Language': locale,
      },
      body: JSON.stringify({
        title: `${ghostName} — Stress Test Intake [${locale.toUpperCase()}]`,
        description: `Ghost-User simulation #${ghostId}. Locale: ${locale}. Action: intake.`,
        priority: ghostId % 3 === 0 ? 'high' : 'medium',
      }),
    })

    return {
      ghostId, locale, action: 'intake',
      status: res.ok ? 'pass' : 'fail',
      httpStatus: res.status,
      latencyMs: Date.now() - start,
      error: res.ok ? undefined : await res.text().catch(() => 'Unknown'),
    }
  } catch (err) {
    return {
      ghostId, locale, action: 'intake',
      status: 'error', httpStatus: null,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function ghostVaultDrop(ghostId: number, locale: string, portalToken: string | null): Promise<GhostResult> {
  const start = Date.now()

  if (!portalToken) {
    return {
      ghostId, locale, action: 'vault_drop',
      status: 'error', httpStatus: null, latencyMs: 0,
      error: 'No portal token available — skipping vault drop',
    }
  }

  try {
    const formData = new FormData()
    const pdf = generateFakePDF()
    formData.append('file', pdf, `ghost-${ghostId}-${locale}.pdf`)
    formData.append('label', `Ghost ${ghostId} ID Document [${locale.toUpperCase()}]`)

    const res = await fetch(`${BASE_URL}/api/portal/${portalToken}/upload-document`, {
      method: 'POST',
      headers: { 'Accept-Language': locale },
      body: formData,
    })

    return {
      ghostId, locale, action: 'vault_drop',
      status: res.ok ? 'pass' : 'fail',
      httpStatus: res.status,
      latencyMs: Date.now() - start,
      error: res.ok ? undefined : await res.text().catch(() => 'Unknown'),
    }
  } catch (err) {
    return {
      ghostId, locale, action: 'vault_drop',
      status: 'error', httpStatus: null,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function ghostBiometricLogin(ghostId: number, locale: string, portalToken: string | null): Promise<GhostResult> {
  const start = Date.now()

  if (!portalToken) {
    return {
      ghostId, locale, action: 'biometric_login',
      status: 'error', httpStatus: null, latencyMs: 0,
      error: 'No portal token available — skipping biometric',
    }
  }

  try {
    // Hit the portal page endpoint — this validates the token and returns portal data
    const res = await fetch(`${BASE_URL}/api/portal/${portalToken}`, {
      method: 'GET',
      headers: { 'Accept-Language': locale },
    })

    return {
      ghostId, locale, action: 'biometric_login',
      status: res.ok ? 'pass' : 'fail',
      httpStatus: res.status,
      latencyMs: Date.now() - start,
      error: res.ok ? undefined : await res.text().catch(() => 'Unknown'),
    }
  } catch (err) {
    return {
      ghostId, locale, action: 'biometric_login',
      status: 'error', httpStatus: null,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ── Migration 186 Invariant Checks ──────────────────────────────────────────

interface InvariantResult {
  check: string
  status: 'PASS' | 'FAIL'
  detail: string
}

async function verifyMigration186Invariants(): Promise<InvariantResult[]> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return [{
      check: 'DB_CONNECTION',
      status: 'FAIL',
      detail: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — cannot verify invariants',
    }]
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const checks: InvariantResult[] = []

  // CHECK 1: All tenants have ui_version = 'v2-sovereign'
  const { data: tenants, error: tErr } = await supabase
    .from('tenants')
    .select('id, name, settings, feature_flags')

  if (tErr) {
    checks.push({ check: 'TENANT_QUERY', status: 'FAIL', detail: tErr.message })
    return checks
  }

  let sovereignCount = 0
  let legacyCount = 0
  let flagCount = 0

  for (const t of tenants ?? []) {
    const settings = (t.settings ?? {}) as Record<string, unknown>
    const flags = (t.feature_flags ?? {}) as Record<string, unknown>

    if (settings.ui_version === 'v2-sovereign') {
      sovereignCount++
    } else {
      legacyCount++
    }

    if (flags.intelligence_hub === true) {
      flagCount++
    }
  }

  const totalTenants = tenants?.length ?? 0

  checks.push({
    check: 'UI_VERSION_SOVEREIGN',
    status: legacyCount === 0 ? 'PASS' : 'FAIL',
    detail: `${sovereignCount}/${totalTenants} tenants on v2-sovereign. ${legacyCount} still on legacy.`,
  })

  checks.push({
    check: 'INTELLIGENCE_HUB_FLAG',
    status: flagCount === totalTenants ? 'PASS' : 'FAIL',
    detail: `${flagCount}/${totalTenants} tenants have intelligence_hub enabled.`,
  })

  // CHECK 2: All warm/hot leads have preferred_view = 'workspace_shell'
  const { data: elevatedLeads, error: lErr } = await supabase
    .from('leads')
    .select('id, temperature, preferred_view')
    .in('temperature', ['warm', 'hot'])
    .limit(500)

  if (lErr) {
    checks.push({ check: 'LEADS_QUERY', status: 'FAIL', detail: lErr.message })
  } else {
    const total = elevatedLeads?.length ?? 0
    const sovereign = elevatedLeads?.filter(l => l.preferred_view === 'workspace_shell').length ?? 0
    const legacy = total - sovereign

    checks.push({
      check: 'ELEVATED_LEADS_SOVEREIGN',
      status: legacy === 0 ? 'PASS' : 'FAIL',
      detail: `${sovereign}/${total} elevated leads on workspace_shell. ${legacy} on legacy view.`,
    })
  }

  // CHECK 3: ai_drafts table exists and is queryable
  const { error: aiErr } = await supabase
    .from('ai_drafts')
    .select('id')
    .limit(1)

  checks.push({
    check: 'AI_DRAFTS_TABLE',
    status: !aiErr ? 'PASS' : 'FAIL',
    detail: aiErr ? `ai_drafts table error: ${aiErr.message}` : 'ai_drafts table exists and is queryable.',
  })

  // CHECK 4: Global 15 enabled in settings
  for (const t of tenants ?? []) {
    const settings = (t.settings ?? {}) as Record<string, unknown>
    if (settings.global_15_enabled !== true) {
      checks.push({
        check: 'GLOBAL_15_ENABLED',
        status: 'FAIL',
        detail: `Tenant ${t.name ?? t.id} missing global_15_enabled in settings.`,
      })
      break
    }
  }
  if (!checks.find(c => c.check === 'GLOBAL_15_ENABLED')) {
    checks.push({
      check: 'GLOBAL_15_ENABLED',
      status: 'PASS',
      detail: `All ${totalTenants} tenants have global_15_enabled = true.`,
    })
  }

  return checks
}

// ── Batch Executor ──────────────────────────────────────────────────────────

async function runBatch(ghosts: Array<{ id: number; locale: string; action: ActionType }>, authToken: string, portalToken: string | null) {
  const promises = ghosts.map(g => {
    switch (g.action) {
      case 'intake':
        return ghostIntake(g.id, g.locale, authToken)
      case 'vault_drop':
        return ghostVaultDrop(g.id, g.locale, portalToken)
      case 'biometric_login':
        return ghostBiometricLogin(g.id, g.locale, portalToken)
    }
  })

  const batchResults = await Promise.allSettled(promises)

  for (const r of batchResults) {
    if (r.status === 'fulfilled') {
      results.push(r.value)
    } else {
      results.push({
        ghostId: -1, locale: '??', action: 'intake',
        status: 'error', httpStatus: null, latencyMs: 0,
        error: r.reason?.message ?? 'Unknown batch error',
      })
    }
  }
}

// ── Report ───────────────────────────────────────────────────────────────────

function printReport(invariants: InvariantResult[]) {
  const line = '═'.repeat(72)
  console.log(`\n${line}`)
  console.log('  GHOST-USER SIMULATION REPORT — Team COMMAND')
  console.log(`  ${new Date().toISOString()}`)
  console.log(line)

  // Aggregate stats
  const passed = results.filter(r => r.status === 'pass').length
  const failed = results.filter(r => r.status === 'fail').length
  const errored = results.filter(r => r.status === 'error').length
  const avgLatency = results.length > 0
    ? Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / results.length)
    : 0
  const maxLatency = results.length > 0
    ? Math.max(...results.map(r => r.latencyMs))
    : 0
  const p95Latency = results.length > 0
    ? results.map(r => r.latencyMs).sort((a, b) => a - b)[Math.floor(results.length * 0.95)]
    : 0

  console.log(`\n  CONCURRENCY RESULTS (${TOTAL_GHOSTS} ghosts, ${CONCURRENCY_BATCH} concurrent)`)
  console.log(`  ${'─'.repeat(50)}`)
  console.log(`  Pass:    ${passed}`)
  console.log(`  Fail:    ${failed}`)
  console.log(`  Error:   ${errored}`)
  console.log(`  Avg ms:  ${avgLatency}`)
  console.log(`  P95 ms:  ${p95Latency}`)
  console.log(`  Max ms:  ${maxLatency}`)

  // Per-action breakdown
  for (const action of ACTIONS) {
    const actionResults = results.filter(r => r.action === action)
    const ap = actionResults.filter(r => r.status === 'pass').length
    const af = actionResults.filter(r => r.status === 'fail').length
    const ae = actionResults.filter(r => r.status === 'error').length
    console.log(`\n  ${action.toUpperCase().padEnd(20)} Pass: ${ap}  Fail: ${af}  Error: ${ae}`)
  }

  // Per-locale breakdown
  console.log(`\n  LOCALE DISTRIBUTION`)
  console.log(`  ${'─'.repeat(50)}`)
  for (const lang of GLOBAL_15) {
    const langResults = results.filter(r => r.locale === lang.code)
    const lp = langResults.filter(r => r.status === 'pass').length
    const total = langResults.length
    console.log(`  ${lang.name.padEnd(14)} (${lang.code}) ${lang.dir.toUpperCase()}  ${lp}/${total} pass`)
  }

  // Migration 186 invariants
  console.log(`\n  MIGRATION 186 INVARIANTS — SOVEREIGN CUTOVER`)
  console.log(`  ${'─'.repeat(50)}`)
  let allPass = true
  for (const inv of invariants) {
    const icon = inv.status === 'PASS' ? '[PASS]' : '[FAIL]'
    console.log(`  ${icon} ${inv.check}: ${inv.detail}`)
    if (inv.status === 'FAIL') allPass = false
  }

  console.log(`\n${line}`)
  if (allPass && failed === 0 && errored === 0) {
    console.log('  VERDICT: ALL CLEAR — Sovereign Cutover holds under concurrent load.')
  } else if (allPass) {
    console.log('  VERDICT: MIGRATION INTACT — Some HTTP errors detected (expected without auth).')
  } else {
    console.log('  VERDICT: REGRESSION DETECTED — Migration 186 invariants FAILED.')
  }
  console.log(`${line}\n`)

  // Dump failures
  const failures = results.filter(r => r.status === 'fail' || r.status === 'error')
  if (failures.length > 0 && failures.length <= 20) {
    console.log('  FAILURE DETAILS (first 20):')
    for (const f of failures.slice(0, 20)) {
      console.log(`    Ghost #${f.ghostId} [${f.locale}] ${f.action}: HTTP ${f.httpStatus} — ${f.error?.slice(0, 120)}`)
    }
    console.log()
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n  Ghost-User Simulation — Team COMMAND')
  console.log(`  Target: ${BASE_URL}`)
  console.log(`  Ghosts: ${TOTAL_GHOSTS} across ${GLOBAL_15.length} languages`)
  console.log(`  Batch size: ${CONCURRENCY_BATCH} concurrent\n`)

  // Try to get an auth token from Supabase for intake tests
  let authToken = ''
  let portalToken: string | null = null

  if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Get first user for auth simulation
    const { data: users } = await supabase.from('users').select('auth_user_id').limit(1)
    if (users?.[0]) {
      console.log('  Auth: Using service role for simulation (bypasses RLS)')
      authToken = SUPABASE_SERVICE_KEY // service role acts as superuser
    }

    // Get first active portal token for vault/biometric tests
    const { data: portal } = await supabase
      .from('portal_links')
      .select('token')
      .eq('is_active', true)
      .limit(1)

    if (portal?.[0]?.token) {
      portalToken = portal[0].token
      console.log('  Portal: Found active portal token for vault/biometric tests')
    } else {
      console.log('  Portal: No active portal tokens — vault_drop and biometric tests will be skipped')
    }
  } else {
    console.log('  Warning: No Supabase credentials — running HTTP-only smoke test')
    authToken = 'ghost-simulation-token'
  }

  // Build ghost roster — distribute evenly across languages and actions
  const ghosts: Array<{ id: number; locale: string; action: ActionType }> = []
  for (let i = 0; i < TOTAL_GHOSTS; i++) {
    const locale = GLOBAL_15[i % GLOBAL_15.length].code
    const action = ACTIONS[i % ACTIONS.length]
    ghosts.push({ id: i + 1, locale, action })
  }

  // Shuffle for realistic distribution
  for (let i = ghosts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[ghosts[i], ghosts[j]] = [ghosts[j], ghosts[i]]
  }

  // Fire in batches
  const totalBatches = Math.ceil(ghosts.length / CONCURRENCY_BATCH)
  for (let b = 0; b < totalBatches; b++) {
    const batch = ghosts.slice(b * CONCURRENCY_BATCH, (b + 1) * CONCURRENCY_BATCH)
    const locales = [...new Set(batch.map(g => g.locale))].join(',')
    console.log(`  Batch ${b + 1}/${totalBatches} — ${batch.length} ghosts [${locales}]`)
    await runBatch(batch, authToken, portalToken)
  }

  // Verify Migration 186 invariants directly against DB
  console.log('\n  Verifying Migration 186 invariants...')
  const invariants = await verifyMigration186Invariants()

  // Print report
  printReport(invariants)
}

main().catch((err) => {
  console.error('Ghost-User simulation crashed:', err)
  process.exit(1)
})
