#!/usr/bin/env node

/**
 * Database Migration Runner for NorvaOS
 *
 * Usage:
 *   node scripts/migrate.mjs                    # Run pending migrations
 *   node scripts/migrate.mjs --status           # Show migration status
 *   node scripts/migrate.mjs --dry-run          # Show what would run (no changes)
 *
 * Reads migrations from scripts/migrations/ in order (sorted by filename).
 * Tracks applied migrations in the _migrations table.
 * Requires SUPABASE_DB_URL environment variable (direct Postgres connection).
 *
 * Environment:
 *   SUPABASE_DB_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres
 */

import { readdir, readFile } from 'fs/promises'
import { join, basename } from 'path'
import { createHash } from 'crypto'
import pg from 'pg'

const { Client } = pg

const MIGRATIONS_DIR = join(import.meta.dirname, 'migrations')

async function getClient() {
  const url = process.env.SUPABASE_DB_URL
  if (!url) {
    console.error('Error: SUPABASE_DB_URL environment variable is required')
    console.error('Format: postgresql://postgres:password@db.xxx.supabase.co:5432/postgres')
    process.exit(1)
  }
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  return client
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      checksum TEXT
    )
  `)
}

async function getAppliedMigrations(client) {
  const result = await client.query('SELECT name, applied_at FROM _migrations ORDER BY name')
  return new Map(result.rows.map(r => [r.name, r.applied_at]))
}

async function getMigrationFiles() {
  const files = await readdir(MIGRATIONS_DIR)
  return files
    .filter(f => f.endsWith('.sql') && !f.startsWith('000_'))
    .sort()
}

async function showStatus(client) {
  const applied = await getAppliedMigrations(client)
  const files = await getMigrationFiles()

  console.log('\n  Migration Status')
  console.log('  ' + '─'.repeat(60))

  for (const file of files) {
    const name = basename(file, '.sql')
    const appliedAt = applied.get(name)
    const status = appliedAt
      ? `✅ Applied ${appliedAt.toISOString().slice(0, 10)}`
      : '⏳ Pending'
    console.log(`  ${name.padEnd(35)} ${status}`)
  }

  const pending = files.filter(f => !applied.has(basename(f, '.sql')))
  console.log(`\n  Total: ${files.length} migrations, ${files.length - pending.length} applied, ${pending.length} pending\n`)
}

async function runMigrations(client, dryRun = false) {
  const applied = await getAppliedMigrations(client)
  const files = await getMigrationFiles()

  const pending = files.filter(f => !applied.has(basename(f, '.sql')))

  if (pending.length === 0) {
    console.log('\n  ✅ All migrations are up to date.\n')
    return
  }

  console.log(`\n  ${dryRun ? '(DRY RUN) ' : ''}Running ${pending.length} pending migration(s)...\n`)

  for (const file of pending) {
    const name = basename(file, '.sql')
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf-8')
    const checksum = createHash('sha256').update(sql).digest('hex').slice(0, 16)

    if (dryRun) {
      console.log(`  ⏭️  Would run: ${name} (${checksum})`)
      continue
    }

    try {
      console.log(`  ▶️  Running: ${name}...`)
      await client.query('BEGIN')
      await client.query(sql)
      await client.query(
        'INSERT INTO _migrations (name, checksum) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
        [name, checksum]
      )
      await client.query('COMMIT')
      console.log(`  ✅ Applied: ${name}`)
    } catch (err) {
      await client.query('ROLLBACK')
      console.error(`  ❌ Failed: ${name}`)
      console.error(`     ${err.message}`)
      process.exit(1)
    }
  }

  console.log(`\n  ✅ ${dryRun ? 'Dry run' : 'Migration'} complete.\n`)
}

// ─── Main ───────────────────────────────────────────────────────
const args = process.argv.slice(2)
const client = await getClient()

try {
  await ensureMigrationsTable(client)

  if (args.includes('--status')) {
    await showStatus(client)
  } else {
    await runMigrations(client, args.includes('--dry-run'))
  }
} finally {
  await client.end()
}
