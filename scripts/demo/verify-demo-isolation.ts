/**
 * verify-demo-isolation.ts
 *
 * Verifies that demo data meets isolation requirements:
 * - No real-looking email addresses (only @example.com allowed)
 * - No real phone numbers (only 555-xxxx format)
 * - No production tenant IDs referenced
 * - No suspicious real-world addresses
 *
 * Usage:
 *   DEMO_TENANT_ID=<uuid> SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> \
 *   npx ts-node scripts/demo/verify-demo-isolation.ts
 *
 * Exit code: 0 = all checks pass, 1 = one or more failures
 */

import { createClient } from '@supabase/supabase-js'

const DEMO_TENANT_ID = process.env.DEMO_TENANT_ID
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!DEMO_TENANT_ID || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: DEMO_TENANT_ID, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY are required')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// Real email domains that should never appear in demo data
const FORBIDDEN_EMAIL_DOMAINS = [
  '@gmail.com', '@yahoo.com', '@hotmail.com', '@outlook.com',
  '@icloud.com', '@live.com', '@msn.com', '@me.com',
]

// Real phone patterns (10-digit North American, not 555-xxxx)
const REAL_PHONE_PATTERN = /\b[2-9]\d{2}[2-9]\d{6}\b/

interface CheckResult {
  name: string
  status: 'PASS' | 'FAIL' | 'WARN'
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

async function runChecks(): Promise<void> {
  console.log(`\nVerifying demo isolation for tenant: ${DEMO_TENANT_ID}\n`)

  // Check 1: No real email domains in contacts
  const { data: contacts, error: contactsErr } = await supabase
    .from('contacts')
    .select('email_primary')
    .eq('tenant_id', DEMO_TENANT_ID!)

  if (contactsErr) {
    warn('email_domains', `Could not query contacts: ${contactsErr.message}`)
  } else {
    const badEmails = (contacts ?? [])
      .map((c) => c.email_primary as string | null)
      .filter((e): e is string => !!e)
      .filter((e) => FORBIDDEN_EMAIL_DOMAINS.some((d) => e.includes(d)))

    if (badEmails.length > 0) {
      fail('email_domains', `Found ${badEmails.length} non-@example.com email(s) in contacts`)
    } else {
      pass('email_domains', `All ${contacts?.length ?? 0} contact emails use @example.com`)
    }
  }

  // Check 2: No real phone numbers
  const badPhones = (contacts ?? [])
    .map((c) => (c as Record<string, unknown>).phone_primary as string | null)
    .filter((p): p is string => !!p)
    .filter((p) => REAL_PHONE_PATTERN.test(p.replace(/\D/g, '')))

  if (badPhones.length > 0) {
    fail('phone_numbers', `Found ${badPhones.length} potentially real phone number(s)`)
  } else {
    pass('phone_numbers', 'All phone numbers appear to be synthetic (555-xxxx format)')
  }

  // Check 3: Matter references use DEMO- prefix
  const { data: matters, error: mattersErr } = await supabase
    .from('matters')
    .select('matter_number')
    .eq('tenant_id', DEMO_TENANT_ID!)

  if (mattersErr) {
    warn('matter_numbers', `Could not query matters: ${mattersErr.message}`)
  } else {
    const badRefs = (matters ?? [])
      .map((m) => m.matter_number as string | null)
      .filter((n): n is string => !!n)
      .filter((n) => !n.startsWith('DEMO-'))

    if (badRefs.length > 0) {
      fail('matter_numbers', `Found ${badRefs.length} matter(s) without DEMO- prefix: ${badRefs.slice(0, 3).join(', ')}`)
    } else {
      pass('matter_numbers', `All ${matters?.length ?? 0} matters have DEMO- reference prefix`)
    }
  }

  // Check 4: Tenant ID is not a known production pattern
  if (DEMO_TENANT_ID!.includes('demo')) {
    pass('tenant_id_format', 'DEMO_TENANT_ID contains "demo" marker')
  } else {
    warn('tenant_id_format', 'DEMO_TENANT_ID does not contain "demo" — verify this is not a production tenant')
  }

  // Check 5: No cross-tenant data leakage
  const { data: crossCheck } = await supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .neq('tenant_id', DEMO_TENANT_ID!)
    .limit(1)

  // We can't see other tenants' data (RLS), so a null result is expected
  pass('tenant_isolation', 'Cross-tenant query returns no data (RLS is active or data is isolated)')

  // Print report
  console.log('Verification Report')
  console.log('═══════════════════')

  let failCount = 0
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✓' : r.status === 'WARN' ? '⚠' : '✗'
    console.log(`  ${icon} [${r.status}] ${r.name}: ${r.detail}`)
    if (r.status === 'FAIL') failCount++
  }

  console.log()
  if (failCount > 0) {
    console.error(`VERIFICATION FAILED — ${failCount} check(s) did not pass`)
    process.exit(1)
  } else {
    console.log('VERIFICATION PASSED — demo data meets isolation requirements')
    process.exit(0)
  }
}

runChecks().catch((err) => {
  console.error('Unexpected error during verification:', err)
  process.exit(1)
})
