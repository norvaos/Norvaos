#!/usr/bin/env node
/**
 * Seed Staging Application Data via Supabase REST API
 *
 * Equivalent to staging-seed-lead-validation.sql but uses the Supabase JS
 * client with service_role key (bypasses RLS). This avoids needing psql.
 *
 * Usage:
 *   node scripts/seed-staging-data.mjs
 *
 * Prerequisites:
 *   - Auth users created via seed-staging-auth-users.mjs
 *   - .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── Load .env.local ─────────────────────────────────────────────────────────
function loadEnvLocal() {
  try {
    const envPath = resolve(__dirname, '..', '.env.local')
    const content = readFileSync(envPath, 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx < 0) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const value = trimmed.slice(eqIdx + 1).trim()
      if (!process.env[key]) process.env[key] = value
    }
  } catch { /* ignore */ }
}

loadEnvLocal()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hoursAgo(h) { return new Date(Date.now() - h * 3600_000).toISOString() }
function daysAgo(d) { return new Date(Date.now() - d * 86400_000).toISOString() }
function hoursFromNow(h) { return new Date(Date.now() + h * 3600_000).toISOString() }
function dateOnly(iso) { return iso.split('T')[0] }

async function upsert(table, data, onConflict = 'id') {
  const { error } = await supabase.from(table).upsert(data, { onConflict, ignoreDuplicates: false })
  if (error) {
    console.error(`  ✗ ${table}: ${error.message}`)
    throw error
  }
  const count = Array.isArray(data) ? data.length : 1
  console.log(`  ✓ ${table}: ${count} row(s)`)
}

async function updateRow(table, id, data) {
  const { error } = await supabase.from(table).update(data).eq('id', id)
  if (error) {
    console.error(`  ✗ ${table} update ${id}: ${error.message}`)
    throw error
  }
}

// ─── Static IDs ──────────────────────────────────────────────────────────────

const TENANT_A = 'a0000000-0000-0000-0000-000000000001'
const TENANT_B = 'b0000000-0000-0000-0000-000000000002'
const PA_A = 'fa000000-0000-0000-0000-000000000001'
const PA_B = 'fa000000-0000-0000-0000-000000000002'

const ROLES = {
  adminA:     '10000000-0000-0000-0000-000000000001',
  lawyerA:    '10000000-0000-0000-0000-000000000002',
  paralegalA: '10000000-0000-0000-0000-000000000003',
  clerkA:     '10000000-0000-0000-0000-000000000004',
  adminB:     '10000000-0000-0000-0000-000000000005',
}

const USERS = {
  admin:     '20000000-0000-0000-0000-000000000001',
  lawyer:    '20000000-0000-0000-0000-000000000002',
  paralegal: '20000000-0000-0000-0000-000000000003',
  clerk:     '20000000-0000-0000-0000-000000000004',
  tenantB:   '20000000-0000-0000-0000-000000000010',
}

// Auth user IDs from seed-staging-auth-users.mjs output
const AUTH_USERS = {
  admin:     'e0ee5d26-196e-4998-9d6b-73e57a411e56',
  lawyer:    'b9ab5619-124d-471a-a3a6-8f8fae474aca',
  paralegal: '3ec66848-3401-450a-96d0-2262ab2c4bd8',
  clerk:     '2a4f850b-6e4b-41bd-860f-7d4198191a1c',
  tenantB:   'a6d1b590-e046-4c9c-a4aa-d444cec0aada',
}

const LEADS = {
  L1:  '30000000-0000-0000-0000-000000000001',
  L2:  '30000000-0000-0000-0000-000000000002',
  L3:  '30000000-0000-0000-0000-000000000003',
  L4:  '30000000-0000-0000-0000-000000000004',
  L5:  '30000000-0000-0000-0000-000000000005',
  L6:  '30000000-0000-0000-0000-000000000006',
  L7:  '30000000-0000-0000-0000-000000000007',
  L8:  '30000000-0000-0000-0000-000000000008',
  L9:  '30000000-0000-0000-0000-000000000009',
  L10: '30000000-0000-0000-0000-000000000010',
  L11: '30000000-0000-0000-0000-000000000011',
  L12: '30000000-0000-0000-0000-000000000012',
  L13: '30000000-0000-0000-0000-000000000013',
  LB:  '30000000-0000-0000-0000-000000000020',
}

const CONTACTS = Object.fromEntries(
  Array.from({ length: 13 }, (_, i) => [`C${i + 1}`, `c0000000-0000-0000-0000-00000000000${(i + 1).toString().padStart(1, '0')}`])
)
// Fix: zero-pad to 4 digits for the last hex segment
for (let i = 1; i <= 13; i++) {
  CONTACTS[`C${i}`] = `c0000000-0000-0000-0000-0000000000${i.toString().padStart(2, '0')}`
}
CONTACTS.CB = 'c0000000-0000-0000-0000-000000000020'

// ─── Seed Data ───────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  Staging Application Data Seeding')
  console.log('═══════════════════════════════════════════════════════════')
  console.log(`  Supabase: ${SUPABASE_URL}`)
  console.log('')

  // ── Cleanup: Remove mutation data from prior validation runs ──
  // Order matters: delete child tables before parents (FK constraints)
  console.log('── Cleanup: removing prior validation data ──')
  const tenantIds = [TENANT_A, TENANT_B]

  // Phase 1: Delete tables that DON'T have inbound FKs from leads
  const cleanupTablesPhase1 = [
    'activities',
    'lead_milestone_tasks',
    'lead_milestone_groups',
    'lead_reopen_records',
    'lead_workflow_executions',
    'lead_stage_history',
    'lead_communication_events',
    'lead_consultations',
    'lead_retainer_packages',
    'lead_qualification_decisions',
    'lead_ai_insights',
    'workspace_workflow_config',
  ]
  for (const table of cleanupTablesPhase1) {
    for (const tid of tenantIds) {
      const { error } = await supabase.from(table).delete().eq('tenant_id', tid)
      if (error && !error.message.includes('0 rows')) {
        console.log(`    ⚠  ${table} cleanup: ${error.message}`)
      }
    }
  }

  // Phase 2: Null out FK columns on leads that reference intake_profiles and closure_records
  for (const tid of tenantIds) {
    await supabase.from('leads').update({ intake_profile_id: null, closure_record_id: null, converted_matter_id: null }).eq('tenant_id', tid)
  }

  // Phase 3: Now safe to delete intake_profiles and closure_records
  for (const table of ['lead_intake_profiles', 'lead_closure_records']) {
    for (const tid of tenantIds) {
      const { error } = await supabase.from(table).delete().eq('tenant_id', tid)
      if (error && !error.message.includes('0 rows')) {
        console.log(`    ⚠  ${table} cleanup: ${error.message}`)
      }
    }
  }

  // Phase 4: Clean matter child tables before deleting matters (FK constraints)
  for (const matterChild of ['matter_people']) {
    for (const tid of tenantIds) {
      const { error } = await supabase.from(matterChild).delete().eq('tenant_id', tid)
      if (error && !error.message.includes('0 rows')) {
        console.log(`    ⚠  ${matterChild} cleanup: ${error.message}`)
      }
    }
  }

  // Phase 5: Clean matters (converted_matter_id already nulled above)
  for (const tid of tenantIds) {
    await supabase.from('matters').delete().eq('tenant_id', tid)
  }

  // Phase 6: Clean leads (all FK refs cleared above)
  for (const tid of tenantIds) {
    await supabase.from('leads').delete().eq('tenant_id', tid)
  }

  // Phase 7: Clean contacts
  for (const tid of tenantIds) {
    await supabase.from('contacts').delete().eq('tenant_id', tid)
  }
  console.log('  ✓ Prior data cleaned for both tenants')
  console.log('')

  // 1. Tenants
  console.log('── Tenants ──')
  await upsert('tenants', [
    { id: TENANT_A, name: 'Vanguard Law', slug: 'vanguard-law', subscription_tier: 'professional', subscription_status: 'active', max_users: 10 },
    { id: TENANT_B, name: 'Crossfield Legal', slug: 'crossfield-legal', subscription_tier: 'starter', subscription_status: 'active', max_users: 5 },
  ])

  // Ensure max_users is large enough (in case tenant already existed with default max_users=1)
  await updateRow('tenants', TENANT_A, { max_users: 10 })
  await updateRow('tenants', TENANT_B, { max_users: 5 })
  console.log('  ✓ max_users updated for both tenants')

  // 1b. Pipelines & Stages
  console.log('── Pipelines ──')
  await upsert('pipelines', [
    { id: 'e1000000-0000-0000-0000-000000000001', tenant_id: TENANT_A, name: 'Lead Intake', pipeline_type: 'lead', is_default: true, is_active: true },
    { id: 'e1000000-0000-0000-0000-000000000002', tenant_id: TENANT_B, name: 'Lead Intake', pipeline_type: 'lead', is_default: true, is_active: true },
  ])

  console.log('── Pipeline Stages ──')
  await upsert('pipeline_stages', [
    { id: 'e2000000-0000-0000-0000-000000000001', tenant_id: TENANT_A, pipeline_id: 'e1000000-0000-0000-0000-000000000001', name: 'New', sort_order: 0 },
    { id: 'e2000000-0000-0000-0000-000000000002', tenant_id: TENANT_A, pipeline_id: 'e1000000-0000-0000-0000-000000000001', name: 'In Progress', sort_order: 1 },
    { id: 'e2000000-0000-0000-0000-000000000003', tenant_id: TENANT_A, pipeline_id: 'e1000000-0000-0000-0000-000000000001', name: 'Won', sort_order: 2, is_win_stage: true },
    { id: 'e2000000-0000-0000-0000-000000000004', tenant_id: TENANT_A, pipeline_id: 'e1000000-0000-0000-0000-000000000001', name: 'Lost', sort_order: 3, is_lost_stage: true },
    // Tenant B
    { id: 'e2000000-0000-0000-0000-000000000010', tenant_id: TENANT_B, pipeline_id: 'e1000000-0000-0000-0000-000000000002', name: 'New', sort_order: 0 },
  ])

  // 2. Practice Areas
  console.log('── Practice Areas ──')
  await upsert('practice_areas', [
    { id: PA_A, tenant_id: TENANT_A, name: 'Immigration' },
    { id: PA_B, tenant_id: TENANT_B, name: 'Family Law' },
  ])

  // 3. Roles
  console.log('── Roles ──')
  await upsert('roles', [
    { id: ROLES.adminA, tenant_id: TENANT_A, name: 'Admin', permissions: { all: true }, is_system: true },
    {
      id: ROLES.lawyerA, tenant_id: TENANT_A, name: 'Lawyer', is_system: true,
      permissions: {
        contacts: { view: true, create: true, edit: true, delete: false },
        matters: { view: true, create: true, edit: true, delete: false },
        leads: { view: true, create: true, edit: true, delete: false },
        tasks: { view: true, create: true, edit: true, delete: true },
        conflicts: { view: true, create: true, approve: true },
      },
    },
    {
      id: ROLES.paralegalA, tenant_id: TENANT_A, name: 'Paralegal', is_system: true,
      permissions: {
        contacts: { view: true }, matters: { view: true },
        leads: { view: true }, tasks: { view: true, create: true, edit: true },
      },
    },
    {
      id: ROLES.clerkA, tenant_id: TENANT_A, name: 'Clerk', is_system: false,
      permissions: {
        contacts: { view: true }, matters: { view: true }, leads: { view: true },
      },
    },
    { id: ROLES.adminB, tenant_id: TENANT_B, name: 'Admin', permissions: { all: true }, is_system: true },
  ])

  // 4. Users
  console.log('── Users ──')
  await upsert('users', [
    { id: USERS.admin, tenant_id: TENANT_A, auth_user_id: AUTH_USERS.admin, email: 'admin@vanguardlaw.test', first_name: 'Alex', last_name: 'Admin', role_id: ROLES.adminA, is_active: true },
    { id: USERS.lawyer, tenant_id: TENANT_A, auth_user_id: AUTH_USERS.lawyer, email: 'lawyer@vanguardlaw.test', first_name: 'Laura', last_name: 'Lawyer', role_id: ROLES.lawyerA, is_active: true },
    { id: USERS.paralegal, tenant_id: TENANT_A, auth_user_id: AUTH_USERS.paralegal, email: 'paralegal@vanguardlaw.test', first_name: 'Pat', last_name: 'Paralegal', role_id: ROLES.paralegalA, is_active: true },
    { id: USERS.clerk, tenant_id: TENANT_A, auth_user_id: AUTH_USERS.clerk, email: 'clerk@vanguardlaw.test', first_name: 'Chris', last_name: 'Clerk', role_id: ROLES.clerkA, is_active: true },
    { id: USERS.tenantB, tenant_id: TENANT_B, auth_user_id: AUTH_USERS.tenantB, email: 'admin@crossfieldlegal.test', first_name: 'Bob', last_name: 'Admin', role_id: ROLES.adminB, is_active: true },
  ])

  // 5. Contacts
  console.log('── Contacts ──')
  const contactNames = [
    ['Alice', 'NewInquiry'], ['Bob', 'ContactAttempted'], ['Carol', 'Qualified'],
    ['Dave', 'ConsulBooked'], ['Eve', 'ConsulCompleted'], ['Frank', 'RetainerSent'],
    ['Grace', 'PaymentPending'], ['Henry', 'ReadyToConvert'], ['Iris', 'Converted'],
    ['Jack', 'ClosedNoResp'], ['Karen', 'ClosedRetainer'], ['Leo', 'ClosedDeclined'],
    ['Mia', 'ClosedNotFit'],
  ]
  const contacts = contactNames.map(([first, last], i) => ({
    id: CONTACTS[`C${i + 1}`],
    tenant_id: TENANT_A,
    first_name: first,
    last_name: last,
    email_primary: `${first.toLowerCase()}@example.com`,
    phone_primary: `+1416555${(1001 + i).toString()}`,
    contact_type: 'individual',
    source: i % 3 === 0 ? 'website' : i % 3 === 1 ? 'referral' : 'google_ads',
    is_active: true,
  }))
  contacts.push({
    id: CONTACTS.CB,
    tenant_id: TENANT_B,
    first_name: 'Zara', last_name: 'IsolationTest',
    email_primary: 'zara@crossfield.test', phone_primary: '+14165559999',
    contact_type: 'individual', source: 'website', is_active: true,
  })
  await upsert('contacts', contacts)

  // 6. Leads
  console.log('── Leads ──')
  const leadData = [
    { id: LEADS.L1, stage: 'new_inquiry', temp: 'warm', val: 5000, qual: 'pending', conf: 'not_run', consul: 'not_booked', ret: 'not_sent', pay: 'not_requested', closed: false, assigned: USERS.admin, stageAge: 0.08, createAge: 0.08 },
    { id: LEADS.L2, stage: 'contact_attempted', temp: 'warm', val: 8000, qual: 'pending', conf: 'not_run', consul: 'not_booked', ret: 'not_sent', pay: 'not_requested', closed: false, assigned: USERS.lawyer, stageAge: 1, createAge: 3 },
    { id: LEADS.L3, stage: 'contacted_qualification_complete', temp: 'hot', val: 12000, qual: 'qualified', conf: 'cleared', consul: 'not_booked', ret: 'not_sent', pay: 'not_requested', closed: false, assigned: USERS.lawyer, stageAge: 2, createAge: 5 },
    { id: LEADS.L4, stage: 'consultation_booked', temp: 'hot', val: 10000, qual: 'qualified', conf: 'cleared', consul: 'booked', ret: 'not_sent', pay: 'not_requested', closed: false, assigned: USERS.lawyer, stageAge: 3, createAge: 7 },
    { id: LEADS.L5, stage: 'consultation_completed', temp: 'hot', val: 15000, qual: 'qualified', conf: 'cleared', consul: 'completed', ret: 'not_sent', pay: 'not_requested', closed: false, assigned: USERS.lawyer, stageAge: 5, createAge: 10 },
    { id: LEADS.L6, stage: 'retainer_sent', temp: 'hot', val: 20000, qual: 'qualified', conf: 'cleared', consul: 'completed', ret: 'sent', pay: 'not_requested', closed: false, assigned: USERS.lawyer, stageAge: 7, createAge: 14 },
    { id: LEADS.L7, stage: 'retainer_signed_payment_pending', temp: 'hot', val: 25000, qual: 'qualified', conf: 'cleared', consul: 'completed', ret: 'signed', pay: 'requested', closed: false, assigned: USERS.lawyer, stageAge: 8, createAge: 16 },
    { id: LEADS.L8, stage: 'retained_active_matter', temp: 'hot', val: 30000, qual: 'qualified', conf: 'cleared', consul: 'completed', ret: 'signed', pay: 'paid', closed: false, assigned: USERS.lawyer, stageAge: 10, createAge: 20 },
    { id: LEADS.L9, stage: 'converted', temp: 'hot', val: 35000, qual: 'qualified', conf: 'cleared', consul: 'completed', ret: 'signed', pay: 'paid', closed: false, assigned: USERS.lawyer, stageAge: 12, createAge: 25, status: 'converted' },
    { id: LEADS.L10, stage: 'closed_no_response', temp: 'cold', val: 3000, qual: 'pending', conf: 'not_run', consul: 'not_booked', ret: 'not_sent', pay: 'not_requested', closed: true, assigned: USERS.admin, stageAge: 15, createAge: 30, status: 'lost' },
    { id: LEADS.L11, stage: 'closed_retainer_not_signed', temp: 'warm', val: 18000, qual: 'qualified', conf: 'cleared', consul: 'completed', ret: 'sent', pay: 'not_requested', closed: true, assigned: USERS.lawyer, stageAge: 14, createAge: 28, status: 'lost' },
    { id: LEADS.L12, stage: 'closed_client_declined', temp: 'warm', val: 10000, qual: 'qualified', conf: 'cleared', consul: 'completed', ret: 'not_sent', pay: 'not_requested', closed: true, assigned: USERS.lawyer, stageAge: 12, createAge: 24, status: 'lost' },
    { id: LEADS.L13, stage: 'closed_not_a_fit', temp: 'cold', val: 2000, qual: 'not_qualified', conf: 'not_run', consul: 'not_booked', ret: 'not_sent', pay: 'not_requested', closed: true, assigned: USERS.admin, stageAge: 20, createAge: 35, status: 'lost' },
  ]

  const leads = leadData.map((l, i) => ({
    id: l.id,
    tenant_id: TENANT_A,
    contact_id: CONTACTS[`C${i + 1}`],
    pipeline_id: 'e1000000-0000-0000-0000-000000000001',
    stage_id: l.closed ? 'e2000000-0000-0000-0000-000000000004' : (l.stage === 'converted' ? 'e2000000-0000-0000-0000-000000000003' : 'e2000000-0000-0000-0000-000000000001'),
    practice_area_id: PA_A,
    temperature: l.temp,
    status: l.status || 'open',
    estimated_value: l.val,
    current_stage: l.stage,
    qualification_status: l.qual,
    conflict_status: l.conf,
    consultation_status: l.consul,
    retainer_status: l.ret,
    payment_status: l.pay,
    is_closed: l.closed,
    assigned_to: l.assigned,
    stage_entered_at: daysAgo(l.stageAge),
    created_at: daysAgo(l.createAge),
  }))

  // Tenant B lead
  leads.push({
    id: LEADS.LB,
    tenant_id: TENANT_B,
    contact_id: CONTACTS.CB,
    pipeline_id: 'e1000000-0000-0000-0000-000000000002',
    stage_id: 'e2000000-0000-0000-0000-000000000010',
    practice_area_id: PA_B,
    temperature: 'warm',
    status: 'open',
    estimated_value: 5000,
    current_stage: 'new_inquiry',
    qualification_status: 'pending',
    conflict_status: 'not_run',
    consultation_status: 'not_booked',
    retainer_status: 'not_sent',
    payment_status: 'not_requested',
    is_closed: false,
    assigned_to: USERS.tenantB,
    stage_entered_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  })

  await upsert('leads', leads)

  // 7. Converted matter for L9
  console.log('── Converted Matter ──')
  await upsert('matters', [{
    id: '40000000-0000-0000-0000-000000000001',
    tenant_id: TENANT_A,
    title: 'Iris Converted - Immigration Case',
    status: 'active',
    practice_area_id: PA_A,
    responsible_lawyer_id: USERS.lawyer,
    originating_lead_id: LEADS.L9,
    date_opened: dateOnly(daysAgo(12)),
    created_at: daysAgo(12),
  }])

  // Link L9 to matter
  await updateRow('leads', LEADS.L9, {
    converted_matter_id: '40000000-0000-0000-0000-000000000001',
    converted_at: daysAgo(12),
  })
  console.log('  ✓ L9 linked to converted matter')

  // 8. Communication Events for L2
  console.log('── Communication Events ──')
  await upsert('lead_communication_events', [
    {
      id: 'ce000000-0000-0000-0000-000000000001', tenant_id: TENANT_A,
      lead_id: LEADS.L2, channel: 'call', direction: 'outbound',
      actor_user_id: USERS.admin, actor_type: 'user',
      subject: 'Initial call attempt', body_preview: 'Called, no answer. Left voicemail.',
      counts_as_contact_attempt: true, occurred_at: daysAgo(2),
    },
    {
      id: 'ce000000-0000-0000-0000-000000000002', tenant_id: TENANT_A,
      lead_id: LEADS.L2, channel: 'email', direction: 'outbound',
      actor_user_id: USERS.admin, actor_type: 'user',
      subject: 'Follow-up email', body_preview: 'Sent follow-up email regarding inquiry.',
      counts_as_contact_attempt: true, occurred_at: daysAgo(1),
    },
  ])

  // 9. Consultations
  console.log('── Consultations ──')
  await upsert('lead_consultations', [
    {
      id: '5c000000-0000-0000-0000-000000000001', tenant_id: TENANT_A,
      lead_id: LEADS.L4, status: 'booked',
      scheduled_at: hoursFromNow(25), duration_minutes: 60,
      consultation_type: 'virtual', conducted_by: USERS.lawyer,
    },
    {
      id: '5c000000-0000-0000-0000-000000000002', tenant_id: TENANT_A,
      lead_id: LEADS.L5, status: 'completed',
      scheduled_at: daysAgo(4), duration_minutes: 45,
      consultation_type: 'phone', conducted_by: USERS.lawyer,
      outcome: 'send_retainer', outcome_notes: 'Good candidate, proceed with retainer.',
    },
    {
      id: '5c000000-0000-0000-0000-000000000003', tenant_id: TENANT_A,
      lead_id: LEADS.L12, status: 'completed',
      scheduled_at: daysAgo(14), duration_minutes: 30,
      consultation_type: 'phone', conducted_by: USERS.lawyer,
      outcome: 'client_declined', outcome_notes: 'Client decided not to proceed.',
    },
  ])

  // 10. Retainer Packages
  console.log('── Retainer Packages ──')
  await upsert('lead_retainer_packages', [
    {
      id: '60000000-0000-0000-0000-000000000001', tenant_id: TENANT_A,
      lead_id: LEADS.L6, status: 'sent', amount_requested: 5000,
      payment_status: 'not_requested', sent_at: daysAgo(6),
    },
    {
      id: '60000000-0000-0000-0000-000000000002', tenant_id: TENANT_A,
      lead_id: LEADS.L7, status: 'signed', amount_requested: 8000,
      payment_status: 'requested', sent_at: daysAgo(10), signed_at: daysAgo(8),
    },
    {
      id: '60000000-0000-0000-0000-000000000003', tenant_id: TENANT_A,
      lead_id: LEADS.L8, status: 'signed', amount_requested: 10000,
      payment_status: 'paid', sent_at: daysAgo(15), signed_at: daysAgo(12),
    },
  ])

  // 11. Intake Profile for L8
  console.log('── Intake Profile ──')
  await upsert('lead_intake_profiles', [{
    id: '70000000-0000-0000-0000-000000000001', tenant_id: TENANT_A,
    lead_id: LEADS.L8, mandatory_fields_complete: true,
    urgency_level: 'medium', jurisdiction: 'Ontario',
  }])
  await updateRow('leads', LEADS.L8, { intake_profile_id: '70000000-0000-0000-0000-000000000001' })
  console.log('  ✓ L8 linked to intake profile')

  // 12. Qualification Decisions
  console.log('── Qualification Decisions ──')
  await upsert('lead_qualification_decisions', [
    {
      id: '80000000-0000-0000-0000-000000000001', tenant_id: TENANT_A,
      lead_id: LEADS.L3, status: 'qualified', notes: 'Strong case, proceed.',
      decided_by: USERS.lawyer, decided_at: daysAgo(3),
    },
    {
      id: '80000000-0000-0000-0000-000000000002', tenant_id: TENANT_A,
      lead_id: LEADS.L13, status: 'not_qualified', notes: 'Outside our practice area.',
      decided_by: USERS.lawyer, decided_at: daysAgo(22),
    },
  ])

  // 13. Closure Records for L10-L13
  console.log('── Closure Records ──')
  const closureRecords = [
    { id: 'c1000000-0000-0000-0000-000000000001', lead_id: LEADS.L10, closed_stage: 'closed_no_response', reason_code: 'no_response_after_attempts', reason_text: 'Multiple contact attempts, no response.', closed_by: USERS.admin, closed_at: daysAgo(15) },
    { id: 'c1000000-0000-0000-0000-000000000002', lead_id: LEADS.L11, closed_stage: 'closed_retainer_not_signed', reason_code: 'retainer_not_signed_after_followup', reason_text: 'Client did not return signed retainer.', closed_by: USERS.lawyer, closed_at: daysAgo(14) },
    { id: 'c1000000-0000-0000-0000-000000000003', lead_id: LEADS.L12, closed_stage: 'closed_client_declined', reason_code: 'client_declined_after_consultation', reason_text: 'Client chose another firm.', closed_by: USERS.lawyer, closed_at: daysAgo(12) },
    { id: 'c1000000-0000-0000-0000-000000000004', lead_id: LEADS.L13, closed_stage: 'closed_not_a_fit', reason_code: 'not_our_practice_area', reason_text: 'Outside practice area scope.', closed_by: USERS.admin, closed_at: daysAgo(20) },
  ]
  await upsert('lead_closure_records', closureRecords.map(r => ({ ...r, tenant_id: TENANT_A })))

  // Link closure records to leads
  const closureLinks = [
    [LEADS.L10, 'c1000000-0000-0000-0000-000000000001'],
    [LEADS.L11, 'c1000000-0000-0000-0000-000000000002'],
    [LEADS.L12, 'c1000000-0000-0000-0000-000000000003'],
    [LEADS.L13, 'c1000000-0000-0000-0000-000000000004'],
  ]
  for (const [leadId, closureId] of closureLinks) {
    await updateRow('leads', leadId, { closure_record_id: closureId })
  }
  console.log('  ✓ Closure records linked to leads')

  // 14. Workspace Workflow Config
  console.log('── Workspace Config ──')
  await upsert('workspace_workflow_config', [{
    id: 'ec000000-0000-0000-0000-000000000001',
    tenant_id: TENANT_A,
    contact_attempt_cadence_days: [1, 3, 7],
    retainer_followup_cadence_days: [2, 5, 10],
    auto_closure_after_days: 30,
    consultation_reminder_hours: [24, 4],
  }])

  // 15. Idempotency Ledger
  console.log('── Idempotency Ledger ──')
  await upsert('lead_workflow_executions', [{
    id: 'fe000000-0000-0000-0000-000000000001',
    tenant_id: TENANT_A,
    lead_id: LEADS.L8,
    execution_type: 'stage_advance',
    execution_key: `stage:${LEADS.L8}:retained_active_matter`,
    actor_user_id: USERS.lawyer,
    metadata: { from_stage: 'retainer_signed_payment_pending', to_stage: 'retained_active_matter' },
  }])

  // 16. Stage History
  console.log('── Stage History ──')
  await upsert('lead_stage_history', [
    {
      id: 'd0000000-0000-0000-0000-000000000001', tenant_id: TENANT_A,
      lead_id: LEADS.L2, from_stage: null, to_stage: 'new_inquiry',
      actor_user_id: USERS.admin, actor_type: 'system',
      reason: 'Lead created', changed_at: daysAgo(3),
    },
    {
      id: 'd0000000-0000-0000-0000-000000000002', tenant_id: TENANT_A,
      lead_id: LEADS.L2, from_stage: 'new_inquiry', to_stage: 'contact_attempted',
      actor_user_id: USERS.admin, actor_type: 'user',
      reason: 'First outbound call made', changed_at: daysAgo(2),
    },
  ])

  // ─── Summary ──────────────────────────────────────────────────────────

  console.log('')
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  Seed complete:')
  console.log('  - 2 tenants (Vanguard Law + Crossfield Legal)')
  console.log('  - 5 users (4 Tenant A + 1 Tenant B)')
  console.log('  - 14 leads (13 at all stages + 1 isolation)')
  console.log('  - 2 communication events, 3 consultations, 3 retainer packages')
  console.log('  - 4 closure records, 2 qualification decisions, 1 intake profile')
  console.log('  - 1 converted matter, 1 workspace config, 1 idempotency entry')
  console.log('  - 2 stage history entries')
  console.log('═══════════════════════════════════════════════════════════')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
