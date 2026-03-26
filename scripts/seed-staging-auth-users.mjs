#!/usr/bin/env node
/**
 * Seed Supabase Auth Users for Staging Validation
 *
 * Creates 5 auth users matching the staging-seed-lead-validation.sql fixture.
 * Uses the Supabase Admin API (service_role key) to create users with
 * confirmed emails (no email verification required).
 *
 * After creation, outputs the auth_user_id → email mapping and generates
 * an updated SQL snippet with the real auth_user_ids.
 *
 * Usage:
 *   node scripts/seed-staging-auth-users.mjs
 *
 * Environment:
 *   NEXT_PUBLIC_SUPABASE_URL    -  Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY   -  Service role key (admin access)
 *   STAGING_PASSWORD            -  Password for all test users (default: TestPass123!)
 *
 * Reads from: .env.local (if present)
 */

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
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  } catch {
    // .env.local not found  -  use existing env
  }
}

loadEnvLocal()

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PASSWORD = process.env.STAGING_PASSWORD || 'TestPass123!'

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// ─── Users to create ─────────────────────────────────────────────────────────

const USERS = [
  {
    email: 'admin@vanguardlaw.test',
    seedAlias: 'au000000-0000-0000-0000-000000000001',
    appUserId: 'u0000000-0000-0000-0000-000000000001',
    role: 'Admin (Tenant A)',
  },
  {
    email: 'lawyer@vanguardlaw.test',
    seedAlias: 'au000000-0000-0000-0000-000000000002',
    appUserId: 'u0000000-0000-0000-0000-000000000002',
    role: 'Lawyer (Tenant A)',
  },
  {
    email: 'paralegal@vanguardlaw.test',
    seedAlias: 'au000000-0000-0000-0000-000000000003',
    appUserId: 'u0000000-0000-0000-0000-000000000003',
    role: 'Paralegal (Tenant A)',
  },
  {
    email: 'clerk@vanguardlaw.test',
    seedAlias: 'au000000-0000-0000-0000-000000000004',
    appUserId: 'u0000000-0000-0000-0000-000000000004',
    role: 'Clerk (Tenant A)',
  },
  {
    email: 'admin@crossfieldlegal.test',
    seedAlias: 'au000000-0000-0000-0000-000000000010',
    appUserId: 'u0000000-0000-0000-0000-000000000010',
    role: 'Admin (Tenant B)',
  },
]

// ─── Create or fetch users ───────────────────────────────────────────────────

async function createOrGetUser(email) {
  // First, check if user already exists by listing with email filter
  const listRes = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=50`,
    {
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
      },
    }
  )

  if (listRes.ok) {
    const data = await listRes.json()
    const users = data.users || data
    if (Array.isArray(users)) {
      const existing = users.find(u => u.email === email)
      if (existing) {
        return { id: existing.id, created: false }
      }
    }
  }

  // Create new user
  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password: PASSWORD,
      email_confirm: true, // Auto-confirm email
    }),
  })

  if (!createRes.ok) {
    const err = await createRes.text()
    throw new Error(`Failed to create ${email}: ${createRes.status}  -  ${err}`)
  }

  const user = await createRes.json()
  return { id: user.id, created: true }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  Supabase Auth User Seeding')
  console.log('═══════════════════════════════════════════════════════════')
  console.log(`  Supabase: ${SUPABASE_URL}`)
  console.log(`  Password: ${PASSWORD.slice(0, 4)}${'*'.repeat(PASSWORD.length - 4)}`)
  console.log('')

  const results = []

  for (const user of USERS) {
    try {
      const result = await createOrGetUser(user.email)
      results.push({ ...user, authId: result.id, status: result.created ? 'CREATED' : 'EXISTS' })
      console.log(`  ${result.created ? '✓ Created' : '● Exists '}  ${user.email}  →  ${result.id}`)
    } catch (err) {
      console.error(`  ✗ Failed   ${user.email}  →  ${err.message}`)
      results.push({ ...user, authId: null, status: 'FAILED' })
    }
  }

  console.log('')

  // ─── Generate SQL update snippet ────────────────────────────────────────

  const successful = results.filter(r => r.authId)
  if (successful.length > 0) {
    console.log('── SQL Update Snippet ──')
    console.log('-- Run this AFTER staging-seed-lead-validation.sql to fix auth_user_ids:')
    console.log('')
    for (const r of successful) {
      console.log(`UPDATE users SET auth_user_id = '${r.authId}' WHERE id = '${r.appUserId}';`)
    }
    console.log('')
  }

  // ─── Generate env exports for validation script ─────────────────────────

  console.log('── Environment Variables for Validation Script ──')
  console.log('')
  console.log(`export SUPABASE_URL="${SUPABASE_URL}"`)
  console.log(`export SUPABASE_ANON_KEY="${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '(set manually)'}"`)

  for (const r of results) {
    if (!r.authId) continue
    const envPrefix = r.email === 'admin@vanguardlaw.test' ? 'ADMIN'
      : r.email === 'lawyer@vanguardlaw.test' ? 'LAWYER'
      : r.email === 'paralegal@vanguardlaw.test' ? 'PARALEGAL'
      : r.email === 'clerk@vanguardlaw.test' ? 'CLERK'
      : 'TENANT_B_ADMIN'
    console.log(`export ${envPrefix}_EMAIL="${r.email}"`)
    console.log(`export ${envPrefix}_PASSWORD="${PASSWORD}"`)
  }

  console.log('')

  // ─── Summary ───────────────────────────────────────────────────────────

  const created = results.filter(r => r.status === 'CREATED').length
  const exists = results.filter(r => r.status === 'EXISTS').length
  const failed = results.filter(r => r.status === 'FAILED').length

  console.log(`Summary: ${created} created, ${exists} already existed, ${failed} failed`)

  if (failed > 0) {
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
