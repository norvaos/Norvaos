/**
 * Run migration 008 using pg module with direct Supabase connection.
 * Usage: node scripts/run-migration-008.mjs
 */

import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Supabase direct connection (session mode)
// Format: postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
const CONNECTION_STRINGS = [
  // Session mode pooler (port 5432)
  'postgresql://postgres.ztsjvsutlrfisnrwdwfl:MyOakville@143@aws-0-ca-central-1.pooler.supabase.com:5432/postgres',
  // Transaction mode pooler (port 6543)
  'postgresql://postgres.ztsjvsutlrfisnrwdwfl:MyOakville@143@aws-0-ca-central-1.pooler.supabase.com:6543/postgres',
  // Direct connection (no pooler)
  'postgresql://postgres:MyOakville@143@db.ztsjvsutlrfisnrwdwfl.supabase.co:5432/postgres',
]

async function tryConnect(connStr) {
  const client = new pg.Client({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  })
  await client.connect()
  return client
}

async function main() {
  console.log('=== Migration 008: Immigration Practice Operating System ===\n')

  // Read the SQL file
  const sqlPath = join(__dirname, 'migrations', '008-immigration-system.sql')
  const sql = readFileSync(sqlPath, 'utf-8')

  let client = null

  for (const connStr of CONNECTION_STRINGS) {
    const maskedStr = connStr.replace(/:[^:@]+@/, ':***@')
    console.log(`Trying: ${maskedStr}`)
    try {
      client = await tryConnect(connStr)
      console.log('  ✓ Connected!\n')
      break
    } catch (err) {
      console.log(`  ✗ Failed: ${err.message}\n`)
    }
  }

  if (!client) {
    // Try with explicit config object (URL-encoding the password)
    console.log('Trying explicit config with URL-encoded password...')
    try {
      client = new pg.Client({
        host: 'aws-0-ca-central-1.pooler.supabase.com',
        port: 5432,
        database: 'postgres',
        user: 'postgres.ztsjvsutlrfisnrwdwfl',
        password: 'MyOakville@143',
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
      })
      await client.connect()
      console.log('  ✓ Connected!\n')
    } catch (err) {
      console.log(`  ✗ Failed: ${err.message}\n`)

      console.log('\n=== Could not connect to database ===')
      console.log('Please run the migration SQL manually via the Supabase Dashboard SQL Editor:')
      console.log('1. Go to https://supabase.com/dashboard/project/ztsjvsutlrfisnrwdwfl/sql/new')
      console.log('2. Paste the contents of scripts/migrations/008-immigration-system.sql')
      console.log('3. Click "Run"')
      process.exit(1)
    }
  }

  try {
    console.log('Running migration...')
    await client.query(sql)
    console.log('✓ Migration completed successfully!\n')

    // Get the tenant ID
    console.log('Looking up tenant...')
    const tenantResult = await client.query('SELECT id, name FROM tenants LIMIT 5')
    console.log('Tenants found:', tenantResult.rows)

    if (tenantResult.rows.length > 0) {
      const tenantId = tenantResult.rows[0].id
      console.log(`\nSeeding immigration defaults for tenant: ${tenantId}`)
      await client.query('SELECT seed_immigration_defaults($1)', [tenantId])
      console.log('✓ Seed data inserted!\n')

      // Verify
      const caseTypes = await client.query(
        'SELECT name, slug FROM immigration_case_types WHERE tenant_id = $1 ORDER BY sort_order',
        [tenantId]
      )
      console.log('Immigration case types created:')
      for (const ct of caseTypes.rows) {
        console.log(`  • ${ct.name} (${ct.slug})`)
      }
    }

    // Check for zia@oakvillelegal.ca user
    console.log('\nChecking for zia@oakvillelegal.ca auth user...')
    const authUser = await client.query(
      "SELECT id, email FROM auth.users WHERE email = 'zia@oakvillelegal.ca'"
    )
    if (authUser.rows.length > 0) {
      console.log(`Found auth user: ${authUser.rows[0].id}`)

      // Check if matching users table entry exists
      const appUser = await client.query(
        "SELECT id FROM users WHERE auth_user_id = $1",
        [authUser.rows[0].id]
      )
      if (appUser.rows.length === 0 && tenantResult.rows.length > 0) {
        console.log('Creating matching users table row...')
        const tenantId = tenantResult.rows[0].id
        await client.query(
          `INSERT INTO users (tenant_id, auth_user_id, email, first_name, last_name, role, is_active)
           VALUES ($1, $2, 'zia@oakvillelegal.ca', 'Zia', 'Waseer', 'admin', true)
           ON CONFLICT DO NOTHING`,
          [tenantId, authUser.rows[0].id]
        )
        console.log('✓ User row created for zia@oakvillelegal.ca')
      } else if (appUser.rows.length > 0) {
        console.log('✓ User row already exists')
      }
    } else {
      console.log('zia@oakvillelegal.ca not found in auth.users')
    }

  } catch (err) {
    console.error('Migration error:', err.message)
    if (err.detail) console.error('Detail:', err.detail)
    if (err.hint) console.error('Hint:', err.hint)
  } finally {
    await client.end()
  }
}

main().catch(console.error)
