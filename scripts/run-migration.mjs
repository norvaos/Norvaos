import pg from 'pg'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Accept a migration file path as CLI argument
const fileArg = process.argv[2]
if (!fileArg) {
  console.error('Usage: node scripts/run-migration.mjs <path-to-sql-file>')
  console.error('Requires env vars: SUPABASE_DB_USER, SUPABASE_DB_PASSWORD, SUPABASE_DB_HOST, SUPABASE_DIRECT_HOST')
  process.exit(1)
}
const sqlPath = resolve(fileArg)
console.log(`📄 Migration file: ${sqlPath}`)
const sql = readFileSync(sqlPath, 'utf-8')

const user = process.env.SUPABASE_DB_USER
const password = process.env.SUPABASE_DB_PASSWORD
const poolerHost = process.env.SUPABASE_DB_HOST || 'aws-0-ca-central-1.pooler.supabase.com'
const directHost = process.env.SUPABASE_DIRECT_HOST

if (!user || !password) {
  console.error('Missing required env vars: SUPABASE_DB_USER, SUPABASE_DB_PASSWORD')
  console.error('Set these in .env.local  -  see .env.example for the required keys')
  process.exit(1)
}

const configs = [
  {
    label: 'Pooler session mode (port 5432)',
    host: poolerHost,
    port: 5432,
    user,
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  },
  {
    label: 'Pooler transaction mode (port 6543)',
    host: poolerHost,
    port: 6543,
    user,
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  },
  ...(directHost ? [{
    label: 'Direct connection',
    host: directHost,
    port: 5432,
    user: 'postgres',
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  }] : []),
]

async function tryConnect(config) {
  const { label, ...connConfig } = config
  console.log(`\nTrying: ${label}...`)
  const client = new pg.Client(connConfig)
  try {
    await client.connect()
    console.log(`  ✓ Connected via ${label}`)
    return client
  } catch (err) {
    console.log(`  ✗ Failed: ${err.message}`)
    return null
  }
}

async function main() {
  let client = null
  for (const config of configs) {
    client = await tryConnect(config)
    if (client) break
  }

  if (!client) {
    console.error('\n❌ Could not connect to database with any configuration.')
    process.exit(1)
  }

  console.log('\nRunning migration...')
  try {
    await client.query(sql)
    console.log('✅ Migration completed successfully!')
  } catch (err) {
    console.error('❌ Migration failed:', err.message)
    if (err.position) {
      const pos = parseInt(err.position)
      const snippet = sql.substring(Math.max(0, pos - 100), pos + 100)
      console.error('Near:', snippet)
    }
  } finally {
    await client.end()
  }
}

main()
