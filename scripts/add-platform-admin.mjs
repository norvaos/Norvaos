#!/usr/bin/env node
/**
 * Add a user to the platform_admins table (Super Admin Portal access).
 *
 * Usage:
 *   node scripts/add-platform-admin.mjs <email>
 *
 * Example:
 *   node scripts/add-platform-admin.mjs zia@zia.ca
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.')
  console.error('Run with: source .env.local && node scripts/add-platform-admin.mjs <email>')
  process.exit(1)
}

const email = process.argv[2]
if (!email) {
  console.error('Usage: node scripts/add-platform-admin.mjs <email>')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  // 1. Find the user in auth.users
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers()
  if (listError) {
    console.error('Failed to list users:', listError.message)
    process.exit(1)
  }

  const user = users.find((u) => u.email === email)
  if (!user) {
    console.error(`No auth user found with email: ${email}`)
    console.error('Available users:', users.map((u) => u.email).join(', '))
    process.exit(1)
  }

  console.log(`Found user: ${user.email} (${user.id})`)

  // 2. Check if already a platform admin
  const { data: existing } = await supabase
    .from('platform_admins')
    .select('id, revoked_at')
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .single()

  if (existing) {
    console.log('✅ User is already a platform admin.')
    process.exit(0)
  }

  // 3. Insert into platform_admins
  const { data, error } = await supabase
    .from('platform_admins')
    .insert({
      user_id: user.id,
      email: user.email,
      granted_by: 'cli-script',
    })
    .select()
    .single()

  if (error) {
    console.error('Failed to insert platform admin:', error.message)
    process.exit(1)
  }

  console.log('✅ Platform admin access granted!')
  console.log(`   ID: ${data.id}`)
  console.log(`   Email: ${data.email}`)
  console.log(`   Granted at: ${data.granted_at}`)
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
