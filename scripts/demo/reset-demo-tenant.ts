/**
 * reset-demo-tenant.ts
 *
 * Deletes all demo data for a tenant and optionally reseeds it.
 * Safe to run multiple times (idempotent delete + reseed).
 *
 * ALL DATA DELETED IS SCOPED TO DEMO_TENANT_ID — no other tenants are affected.
 *
 * Usage:
 *   DEMO_TENANT_ID=<uuid> SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> \
 *   npx ts-node scripts/demo/reset-demo-tenant.ts [--delete-only]
 *
 * Flags:
 *   --delete-only   Delete demo data only; skip reseeding
 */

import { createClient } from '@supabase/supabase-js'
import { execSync } from 'child_process'

// ─── Config ──────────────────────────────────────────────────────────────────

const DEMO_TENANT_ID = process.env.DEMO_TENANT_ID
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DELETE_ONLY = process.argv.includes('--delete-only')

if (!DEMO_TENANT_ID || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: DEMO_TENANT_ID, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY are required')
  process.exit(1)
}

// Safety guard
if (!DEMO_TENANT_ID.includes('demo') && process.env.ALLOW_NON_DEMO_TENANT !== 'true') {
  console.error(
    'ERROR: DEMO_TENANT_ID does not contain "demo". Set ALLOW_NON_DEMO_TENANT=true to override.',
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// Tables to clear (order matters for FK constraints — child tables first)
const TABLES_TO_CLEAR = [
  'time_entries',
  'calendar_events',
  'tasks',
  'matters',
  'contacts',
] as const

// ─── Reset ───────────────────────────────────────────────────────────────────

async function reset(): Promise<void> {
  console.log(`\nResetting demo tenant: ${DEMO_TENANT_ID}`)

  // Capture before-counts
  console.log('\nBefore counts:')
  const beforeCounts: Record<string, number> = {}
  for (const table of TABLES_TO_CLEAR) {
    const { count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', DEMO_TENANT_ID!)
    beforeCounts[table] = count ?? 0
    console.log(`  ${table}: ${beforeCounts[table]}`)
  }

  // Delete in dependency order
  console.log('\nDeleting demo data...')
  for (const table of TABLES_TO_CLEAR) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('tenant_id', DEMO_TENANT_ID!)

    if (error) {
      console.error(`  ERROR deleting from ${table}: ${error.message}`)
    } else {
      console.log(`  ✓ Cleared ${table}`)
    }
  }

  // Capture after-counts
  console.log('\nAfter counts (should all be 0):')
  for (const table of TABLES_TO_CLEAR) {
    const { count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', DEMO_TENANT_ID!)
    const remaining = count ?? 0
    const ok = remaining === 0
    console.log(`  ${ok ? '✓' : '✗'} ${table}: ${remaining} remaining`)
  }

  if (DELETE_ONLY) {
    console.log('\nDelete-only mode — skipping reseed')
    console.log('Reset COMPLETE')
    process.exit(0)
  }

  // Reseed
  console.log('\nReseeding...')
  try {
    execSync(
      `npx ts-node ${__dirname}/seed-demo-tenant.ts`,
      {
        env: { ...process.env },
        stdio: 'inherit',
      },
    )
    console.log('\nReset + reseed COMPLETE')
  } catch (err) {
    console.error('ERROR during reseed:', err)
    process.exit(1)
  }
}

reset().catch((err) => {
  console.error('Unexpected error during reset:', err)
  process.exit(1)
})
