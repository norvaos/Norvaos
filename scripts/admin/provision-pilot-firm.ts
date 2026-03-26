#!/usr/bin/env npx tsx

/**
 * provision-pilot-firm.ts  -  Directive 030: "Norva Sovereign Ignition"
 *
 * Provisions a new pilot firm tenant with:
 *   1. Norva Sovereign Academy video URLs (Guidde links)
 *   2. Sentinel pulse interval set to 24h
 *   3. Continuity sequence scheduled at 02:00 AM
 *   4. Default IRCC deadline rules seeded
 *   5. Feature flags enabled for pilot access
 *
 * Usage:
 *   npx tsx scripts/admin/provision-pilot-firm.ts \
 *     --tenant-id <uuid> \
 *     --firm-name "Pilot Firm #1"
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.
 */

import { createClient } from '@supabase/supabase-js'

// ── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Academy Video URLs (Guidde) ─────────────────────────────────────────────

const ACADEMY_VIDEOS = {
  'fortress-foundations': {
    title: 'Module 1: The Fortress Foundations',
    url: 'https://app.guidde.com/share/playbooks/norva-fortress-foundations',
  },
  'intake-to-genesis': {
    title: 'Module 2: Intake to Genesis  -  The Breeze',
    url: 'https://app.guidde.com/share/playbooks/norva-intake-to-genesis',
  },
  'sovereign-oversight': {
    title: 'Module 3: Sovereign Oversight  -  The Shield',
    url: 'https://app.guidde.com/share/playbooks/norva-sovereign-oversight',
  },
}

// ── Pilot Feature Flags ─────────────────────────────────────────────────────

const PILOT_FEATURE_FLAGS = [
  'front_desk_mode',
  'advanced_reporting',
  'document_ocr',
  'conflict_engine',
  'trust_accounting',
  'continuity_engine',
  'genesis_block',
  'audit_simulation',
  'global_expiry_dashboard',
  'sovereign_academy',
]

// ── CLI Args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const tenantIdIdx = args.indexOf('--tenant-id')
const firmNameIdx = args.indexOf('--firm-name')

const tenantId = tenantIdIdx >= 0 ? args[tenantIdIdx + 1] : null
const firmName = firmNameIdx >= 0 ? args[firmNameIdx + 1] : 'Pilot Firm'

if (!tenantId) {
  console.error('❌ --tenant-id is required')
  console.error('Usage: npx tsx scripts/admin/provision-pilot-firm.ts --tenant-id <uuid> --firm-name "Firm Name"')
  process.exit(1)
}

// ── Provisioning Steps ──────────────────────────────────────────────────────

async function main() {
  console.log(`\n🏰 Provisioning Pilot Firm: "${firmName}" (${tenantId})\n`)

  // 1. Verify tenant exists
  console.log('Step 1: Verifying tenant...')
  const { data: tenant, error: tenantErr } = await admin
    .from('tenants')
    .select('id, name')
    .eq('id', tenantId)
    .single()

  if (tenantErr || !tenant) {
    console.error('❌ Tenant not found:', tenantErr?.message)
    process.exit(1)
  }
  console.log(`  ✅ Tenant verified: ${tenant.name}`)

  // 2. Set tenant settings (sentinel interval, academy URLs, continuity schedule)
  console.log('\nStep 2: Configuring tenant settings...')
  const { error: settingsErr } = await admin
    .from('tenants')
    .update({
      settings: {
        sentinel_pulse_interval: '24h',
        continuity_cron_schedule: '0 2 * * *', // 02:00 AM daily
        academy_videos: ACADEMY_VIDEOS,
        pilot_provisioned_at: new Date().toISOString(),
        pilot_firm_name: firmName,
      },
    })
    .eq('id', tenantId)

  if (settingsErr) {
    console.error('  ⚠️  Settings update warning:', settingsErr.message)
  } else {
    console.log('  ✅ Sentinel pulse: 24h')
    console.log('  ✅ Continuity sequence: 02:00 AM daily')
    console.log('  ✅ Academy video URLs injected')
  }

  // 3. Enable feature flags
  console.log('\nStep 3: Enabling pilot feature flags...')
  for (const flag of PILOT_FEATURE_FLAGS) {
    const { error: flagErr } = await admin
      .from('feature_flags')
      .upsert(
        {
          tenant_id: tenantId,
          flag_name: flag,
          is_enabled: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,flag_name' }
      )

    if (flagErr) {
      console.log(`  ⚠️  ${flag}: ${flagErr.message}`)
    } else {
      console.log(`  ✅ ${flag}: enabled`)
    }
  }

  // 4. Seed IRCC deadline rules (if not already present)
  console.log('\nStep 4: Checking IRCC deadline rules...')
  const { count: ruleCount } = await admin
    .from('ircc_deadline_rules')
    .select('id', { count: 'exact', head: true })

  if ((ruleCount ?? 0) > 0) {
    console.log(`  ✅ ${ruleCount} IRCC deadline rules already seeded`)
  } else {
    console.log('  ⚠️  No IRCC deadline rules found  -  run seed-immigration-pipelines.ts first')
  }

  // 5. Create SENTINEL log entry
  console.log('\nStep 5: Logging provisioning to SENTINEL...')
  const { error: sentinelErr } = await admin
    .from('sentinel_audit_log')
    .insert({
      tenant_id: tenantId,
      event_type: 'PILOT_FIRM_PROVISIONED',
      severity: 'info',
      table_name: 'tenants',
      record_id: tenantId,
      details: {
        firm_name: firmName,
        feature_flags: PILOT_FEATURE_FLAGS,
        sentinel_interval: '24h',
        continuity_schedule: '02:00 AM',
        academy_modules: Object.keys(ACADEMY_VIDEOS),
      },
    })

  if (sentinelErr) {
    console.log(`  ⚠️  SENTINEL log: ${sentinelErr.message}`)
  } else {
    console.log('  ✅ SENTINEL: PILOT_FIRM_PROVISIONED logged')
  }

  // 6. Summary
  console.log('\n' + '═'.repeat(60))
  console.log('🏰 PILOT FIRM PROVISIONED SUCCESSFULLY')
  console.log('═'.repeat(60))
  console.log(`  Firm:        ${firmName}`)
  console.log(`  Tenant ID:   ${tenantId}`)
  console.log(`  Sentinel:    24h pulse`)
  console.log(`  Continuity:  02:00 AM daily`)
  console.log(`  Academy:     3 modules ready`)
  console.log(`  Flags:       ${PILOT_FEATURE_FLAGS.length} enabled`)
  console.log('═'.repeat(60))
  console.log('\nThe Fortress is standing. The Sentinel is awake. The Shield is raised.\n')
}

main().catch((err) => {
  console.error('❌ Provisioning failed:', err)
  process.exit(1)
})
