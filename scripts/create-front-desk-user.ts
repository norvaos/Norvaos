/**
 * Script: Create Front Desk user
 *
 * Creates:
 * 1. A "Front Desk" role with front_desk:* permissions
 * 2. A Supabase Auth user (front@zia.ca / London@123)
 * 3. A users table record linked to the auth user + role
 *
 * Usage: npx tsx scripts/create-front-desk-user.ts
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load .env.local manually
const envPath = resolve(__dirname, '../.env.local')
const envContent = readFileSync(envPath, 'utf-8')
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) continue
  const key = trimmed.slice(0, eqIdx)
  const val = trimmed.slice(eqIdx + 1)
  process.env[key] = val
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const EMAIL = 'front@zia.ca'
const PASSWORD = 'London@123'
const FIRST_NAME = 'Front'
const LAST_NAME = 'Desk'

async function main() {
  // 1. Find the tenant (use the first/only tenant)
  const { data: tenants, error: tenantErr } = await admin
    .from('tenants')
    .select('id, name, settings')
    .limit(1)

  if (tenantErr || !tenants?.length) {
    console.error('No tenant found:', tenantErr?.message)
    process.exit(1)
  }

  const tenant = tenants[0]
  console.log(`Tenant: ${tenant.name} (${tenant.id})`)

  // 2. Check if "Front Desk" role already exists
  let roleId: string

  const { data: existingRole } = await admin
    .from('roles')
    .select('id')
    .eq('tenant_id', tenant.id)
    .eq('name', 'Front Desk')
    .single()

  if (existingRole) {
    roleId = existingRole.id
    console.log(`Front Desk role already exists: ${roleId}`)
  } else {
    // Create Front Desk role
    const { data: newRole, error: roleErr } = await admin
      .from('roles')
      .insert({
        tenant_id: tenant.id,
        name: 'Front Desk',
        description: 'Front desk staff — restricted console access with check-in, scheduling, and task management',
        is_system: true,
        permissions: {
          front_desk: { view: true, create: true, edit: true },
          check_ins: { view: true, create: true },
          contacts: { view: true, create: true },
          tasks: { view: true, create: true, edit: true },
          documents: { view: true, create: true },
          calendar: { view: true },
        },
      })
      .select('id')
      .single()

    if (roleErr || !newRole) {
      console.error('Failed to create role:', roleErr?.message)
      process.exit(1)
    }
    roleId = newRole.id
    console.log(`Created Front Desk role: ${roleId}`)
  }

  // 3. Enable front_desk_mode feature flag on tenant
  const currentSettings = (tenant.settings ?? {}) as Record<string, unknown>
  const featureFlags = (currentSettings.feature_flags ?? {}) as Record<string, boolean>

  if (!featureFlags.front_desk_mode) {
    await admin
      .from('tenants')
      .update({
        settings: {
          ...currentSettings,
          feature_flags: {
            ...featureFlags,
            front_desk_mode: true,
          },
        },
      })
      .eq('id', tenant.id)
    console.log('Enabled front_desk_mode feature flag')
  } else {
    console.log('front_desk_mode already enabled')
  }

  // 4. Check if auth user already exists
  const { data: existingUsers } = await admin.auth.admin.listUsers()
  const existingAuth = existingUsers?.users?.find((u) => u.email === EMAIL)

  let authUserId: string

  if (existingAuth) {
    authUserId = existingAuth.id
    console.log(`Auth user already exists: ${authUserId}`)
  } else {
    // Create auth user
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: {
        first_name: FIRST_NAME,
        last_name: LAST_NAME,
      },
    })

    if (authErr || !authData?.user) {
      console.error('Failed to create auth user:', authErr?.message)
      process.exit(1)
    }
    authUserId = authData.user.id
    console.log(`Created auth user: ${authUserId}`)
  }

  // 5. Check if app user already exists
  const { data: existingAppUser } = await admin
    .from('users')
    .select('id')
    .eq('auth_user_id', authUserId)
    .single()

  if (existingAppUser) {
    // Update role if needed
    await admin
      .from('users')
      .update({ role_id: roleId, first_name: FIRST_NAME, last_name: LAST_NAME })
      .eq('id', existingAppUser.id)
    console.log(`Updated existing app user: ${existingAppUser.id}`)
  } else {
    // Create app user
    const { data: newUser, error: userErr } = await admin
      .from('users')
      .insert({
        tenant_id: tenant.id,
        auth_user_id: authUserId,
        email: EMAIL,
        first_name: FIRST_NAME,
        last_name: LAST_NAME,
        role_id: roleId,
        is_active: true,
      })
      .select('id')
      .single()

    if (userErr || !newUser) {
      console.error('Failed to create app user:', userErr?.message)
      process.exit(1)
    }
    console.log(`Created app user: ${newUser.id}`)
  }

  console.log('\n✅ Front Desk user ready!')
  console.log(`   Email:    ${EMAIL}`)
  console.log(`   Password: ${PASSWORD}`)
  console.log(`   Role:     Front Desk`)
  console.log(`   URL:      http://localhost:3000/login`)
}

main().catch(console.error)
