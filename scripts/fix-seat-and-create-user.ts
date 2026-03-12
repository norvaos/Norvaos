import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(__dirname, '../.env.local')
const envContent = readFileSync(envPath, 'utf-8')
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (trimmed.length === 0 || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) continue
  process.env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1)
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function go() {
  // Bump max_users to 10
  const { error: tenantErr } = await admin
    .from('tenants')
    .update({ max_users: 10 })
    .eq('id', 'da1788a2-8baa-4aa5-9733-97510944afac')

  if (tenantErr) {
    console.error('Failed to bump max_users:', tenantErr.message)
    process.exit(1)
  }
  console.log('Bumped max_users to 10')

  // Create the user
  const { data, error } = await admin
    .from('users')
    .insert({
      tenant_id: 'da1788a2-8baa-4aa5-9733-97510944afac',
      auth_user_id: '51b9c796-f376-46f7-b27d-13cbf6dff6c0',
      email: 'front@zia.ca',
      first_name: 'Front',
      last_name: 'Desk',
      role_id: '2d8a8b19-4097-47d8-bd35-ea2cbc4a6697',
      is_active: true,
    })
    .select('id')
    .single()

  if (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }
  console.log('Created app user:', data.id)
  console.log('\nDone! Login with front@zia.ca / London@123')
}

go()
