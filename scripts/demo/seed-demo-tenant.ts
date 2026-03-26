/**
 * seed-demo-tenant.ts
 *
 * Seeds a demo tenant with synthetic data for sales demonstrations.
 *
 * ALL DATA IS SYNTHETIC  -  NOT REAL CLIENT DATA
 *
 * Usage:
 *   DEMO_TENANT_ID=<uuid> SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> \
 *   npx ts-node scripts/demo/seed-demo-tenant.ts
 *
 * Prerequisites:
 *   - A demo tenant must exist in the tenants table (created via Supabase dashboard)
 *   - Service role key is required (bypasses RLS)
 *   - NEVER run against a production tenant ID
 */

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { generateFullDemoDataset } from './generators/index'

// ─── Config ──────────────────────────────────────────────────────────────────

const DEMO_TENANT_ID = process.env.DEMO_TENANT_ID
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!DEMO_TENANT_ID) {
  console.error('ERROR: DEMO_TENANT_ID environment variable is required')
  process.exit(1)
}
if (!SUPABASE_URL) {
  console.error('ERROR: SUPABASE_URL environment variable is required')
  process.exit(1)
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY environment variable is required')
  process.exit(1)
}

// Safety guard: reject obvious production tenant patterns
if (!DEMO_TENANT_ID.includes('demo') && process.env.ALLOW_NON_DEMO_TENANT !== 'true') {
  console.error(
    'ERROR: DEMO_TENANT_ID does not contain "demo". ' +
    'If this is intentional, set ALLOW_NON_DEMO_TENANT=true.',
  )
  process.exit(1)
}

// ─── Supabase Admin Client ────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// ─── Manifest ─────────────────────────────────────────────────────────────────

interface SeedManifest {
  tenant_id: string
  seeded_at: string
  counts: Record<string, number>
  status: 'success' | 'partial' | 'failed'
  errors: string[]
}

function writeManifest(manifest: SeedManifest): void {
  try {
    const dir = join(__dirname, 'manifests')
    mkdirSync(dir, { recursive: true })
    const filename = `seed-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    writeFileSync(join(dir, filename), JSON.stringify(manifest, null, 2))
    console.log(`Manifest written: manifests/${filename}`)
  } catch (err) {
    console.warn('Warning: could not write manifest:', err)
  }
}

// ─── Seed ────────────────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  const manifest: SeedManifest = {
    tenant_id: DEMO_TENANT_ID!,
    seeded_at: new Date().toISOString(),
    counts: {},
    status: 'success',
    errors: [],
  }

  console.log(`\nSeeding demo tenant: ${DEMO_TENANT_ID}`)
  console.log('ALL DATA IS SYNTHETIC  -  NOT REAL CLIENT DATA\n')

  const dataset = await generateFullDemoDataset(DEMO_TENANT_ID!)

  // Insert contacts
  console.log(`Inserting ${dataset.contacts.length} contacts...`)
  const { error: contactsErr } = await supabase.from('contacts').insert(dataset.contacts)
  if (contactsErr) {
    manifest.errors.push(`contacts: ${contactsErr.message}`)
    manifest.status = 'partial'
    console.error('  ERROR inserting contacts:', contactsErr.message)
  } else {
    manifest.counts.contacts = dataset.contacts.length
    console.log(`  ✓ ${dataset.contacts.length} contacts inserted`)
  }

  // Insert matters
  console.log(`Inserting ${dataset.matters.length} matters...`)
  const { error: mattersErr } = await supabase.from('matters').insert(dataset.matters)
  if (mattersErr) {
    manifest.errors.push(`matters: ${mattersErr.message}`)
    manifest.status = 'partial'
    console.error('  ERROR inserting matters:', mattersErr.message)
  } else {
    manifest.counts.matters = dataset.matters.length
    console.log(`  ✓ ${dataset.matters.length} matters inserted`)
  }

  // Insert tasks
  console.log(`Inserting ${dataset.tasks.length} tasks...`)
  const { error: tasksErr } = await supabase.from('tasks').insert(dataset.tasks)
  if (tasksErr) {
    manifest.errors.push(`tasks: ${tasksErr.message}`)
    manifest.status = 'partial'
    console.error('  ERROR inserting tasks:', tasksErr.message)
  } else {
    manifest.counts.tasks = dataset.tasks.length
    console.log(`  ✓ ${dataset.tasks.length} tasks inserted`)
  }

  // Insert calendar events
  console.log(`Inserting ${dataset.calendarEvents.length} calendar events...`)
  const { error: calErr } = await supabase.from('calendar_events').insert(dataset.calendarEvents)
  if (calErr) {
    manifest.errors.push(`calendar_events: ${calErr.message}`)
    manifest.status = 'partial'
    console.error('  ERROR inserting calendar events:', calErr.message)
  } else {
    manifest.counts.calendar_events = dataset.calendarEvents.length
    console.log(`  ✓ ${dataset.calendarEvents.length} calendar events inserted`)
  }

  // Insert time entries
  console.log(`Inserting ${dataset.timeEntries.length} time entries...`)
  const { error: timeErr } = await supabase.from('time_entries').insert(dataset.timeEntries)
  if (timeErr) {
    manifest.errors.push(`time_entries: ${timeErr.message}`)
    manifest.status = 'partial'
    console.error('  ERROR inserting time entries:', timeErr.message)
  } else {
    manifest.counts.time_entries = dataset.timeEntries.length
    console.log(`  ✓ ${dataset.timeEntries.length} time entries inserted`)
  }

  // Validation  -  query back row counts
  console.log('\nValidating row counts...')
  for (const [table, expectedCount] of Object.entries(manifest.counts)) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', DEMO_TENANT_ID!)

    if (error) {
      console.warn(`  WARN: could not validate ${table}: ${error.message}`)
    } else {
      const ok = (count ?? 0) >= expectedCount
      console.log(`  ${ok ? '✓' : '✗'} ${table}: ${count} rows (expected >= ${expectedCount})`)
    }
  }

  writeManifest(manifest)

  if (manifest.status === 'failed') {
    console.error('\nSeed FAILED  -  see errors above')
    process.exit(1)
  } else if (manifest.status === 'partial') {
    console.warn('\nSeed PARTIAL  -  some tables had errors')
    process.exit(0)
  } else {
    console.log('\nSeed COMPLETE  -  demo tenant ready')
    process.exit(0)
  }
}

seed().catch((err) => {
  console.error('Unexpected error during seed:', err)
  process.exit(1)
})
