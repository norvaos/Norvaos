/**
 * Norva Sovereign Pilot Data-Wipe Script — Directive 029
 *
 * Usage: npx tsx scripts/admin/clear-test-data.ts
 *
 * Purges all trial data while preserving:
 *   1. The firm_global_audit_ledger Genesis Zero hash (foundational integrity)
 *   2. The tenant record itself
 *   3. The user accounts (auth.users)
 *   4. Practice areas and matter type configuration
 *
 * DANGEROUS: This is a destructive operation. Must be run manually.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function clearTestData() {
  console.log('═══════════════════════════════════════════════════')
  console.log('  NORVA SOVEREIGN — Pilot Data-Wipe Script')
  console.log('  Directive 029: Clear test data, preserve integrity')
  console.log('═══════════════════════════════════════════════════')
  console.log()

  // 1. Verify Genesis Zero exists (must be preserved)
  const { data: genesisZero } = await supabase
    .from('firm_global_audit_ledger')
    .select('id, event_hash, created_at')
    .eq('event_type', 'genesis_zero')
    .limit(1)
    .maybeSingle()

  if (genesisZero) {
    console.log(`✓ Genesis Zero found: ${genesisZero.event_hash.slice(0, 16)}...`)
    console.log(`  Created: ${genesisZero.created_at}`)
    console.log(`  This record will be PRESERVED.`)
  } else {
    console.log('⚠ No Genesis Zero found — proceeding without preservation guard.')
  }
  console.log()

  // 2. Define purge order (respect foreign keys)
  const PURGE_TABLES = [
    // Child records first
    'compliance_overrides',
    'matter_genesis_metadata',
    'trust_transactions',
    'trust_audit_log',
    'matter_form_instances',
    'matter_form_data',
    'document_slots',
    'matter_deadlines',
    'matter_comments',
    'matter_intake',
    'matter_custom_data',
    'matter_stage_state',
    'matter_contacts',
    'activities',
    'tasks',
    'notifications',
    'address_history',
    'personal_history',
    'prospect_triggers',
    'contact_status_records',
    'conflict_scans',
    'retainer_agreements',
    'signing_requests',
    'signing_events',
    'signing_documents',
    // Parent records
    'matters',
    'leads',
    'contacts',
  ]

  let totalDeleted = 0

  for (const table of PURGE_TABLES) {
    try {
      const { count, error } = await supabase
        .from(table)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000') // delete all (neq impossible UUID)
        .select('*', { count: 'exact', head: true })

      if (error) {
        // Some tables may not exist or may have RLS blocking — skip gracefully
        console.log(`  ⚠ ${table}: ${error.message}`)
      } else {
        const deleted = count ?? 0
        totalDeleted += deleted
        if (deleted > 0) {
          console.log(`  ✓ ${table}: ${deleted} records purged`)
        } else {
          console.log(`  · ${table}: already empty`)
        }
      }
    } catch (err) {
      console.log(`  ⚠ ${table}: skipped (${(err as Error).message})`)
    }
  }

  console.log()

  // 3. Clean firm_global_audit_ledger EXCEPT Genesis Zero
  if (genesisZero) {
    const { count: auditDeleted } = await supabase
      .from('firm_global_audit_ledger')
      .delete()
      .neq('event_type', 'genesis_zero')
      .select('*', { count: 'exact', head: true })

    console.log(`✓ Firm audit ledger: ${auditDeleted ?? 0} non-Genesis entries purged`)
    console.log(`✓ Genesis Zero PRESERVED: ${genesisZero.event_hash.slice(0, 16)}...`)
  }

  console.log()
  console.log('═══════════════════════════════════════════════════')
  console.log(`  WIPE COMPLETE: ${totalDeleted} total records purged`)
  console.log('  Firm foundational integrity intact.')
  console.log('  Ready for Pilot Firm #1 live data.')
  console.log('═══════════════════════════════════════════════════')
}

clearTestData().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
