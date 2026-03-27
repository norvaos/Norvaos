#!/usr/bin/env node

/**
 * Directive 079: Migration Guard  -  Add-Only Enforcement
 *
 * Analyses SQL migration files and classifies each operation:
 *   - SAFE:        CREATE TABLE, CREATE INDEX, ADD COLUMN, INSERT
 *   - ADDITIVE:    ALTER TABLE ADD, CREATE POLICY, CREATE FUNCTION
 *   - DESTRUCTIVE: DROP TABLE, DROP COLUMN, ALTER COLUMN TYPE, DELETE, TRUNCATE
 *   - BLOCKED:     DROP TABLE (on core tables), TRUNCATE, ALTER COLUMN (type change)
 *
 * Usage:
 *   node scripts/migration-guard.mjs                    # Check all pending migrations
 *   node scripts/migration-guard.mjs --file 221-foo.sql # Check a specific file
 *   node scripts/migration-guard.mjs --strict           # Block ALL destructive ops
 *
 * Exit codes:
 *   0 = All migrations are safe/additive
 *   1 = Destructive migration found (blocked in strict mode)
 *   2 = Error
 */

import { readdir, readFile } from 'fs/promises'
import { join, basename } from 'path'

const MIGRATIONS_DIR = join(import.meta.dirname, 'migrations')

// Core tables that must NEVER be dropped
const PROTECTED_TABLES = [
  'users', 'tenants', 'contacts', 'matters', 'documents',
  'leads', 'tasks', 'notes', 'invoices', 'billing_entries',
  'sentinel_audit_log', 'portal_links', 'signing_requests',
  '_migrations', '_release_log',
]

// Patterns and their classifications
const DESTRUCTIVE_PATTERNS = [
  { pattern: /DROP\s+TABLE/i, type: 'DROP_TABLE', severity: 'blocked' },
  { pattern: /TRUNCATE/i, type: 'TRUNCATE', severity: 'blocked' },
  { pattern: /DROP\s+COLUMN/i, type: 'DROP_COLUMN', severity: 'destructive' },
  { pattern: /ALTER\s+COLUMN\s+\w+\s+TYPE/i, type: 'ALTER_COLUMN_TYPE', severity: 'destructive' },
  { pattern: /DELETE\s+FROM\s+(?!_migration)/i, type: 'DELETE_DATA', severity: 'destructive' },
  { pattern: /ALTER\s+TABLE\s+\w+\s+RENAME/i, type: 'RENAME_TABLE', severity: 'destructive' },
  { pattern: /DROP\s+INDEX/i, type: 'DROP_INDEX', severity: 'destructive' },
  { pattern: /DROP\s+POLICY/i, type: 'DROP_POLICY', severity: 'destructive' },
  { pattern: /DROP\s+FUNCTION/i, type: 'DROP_FUNCTION', severity: 'destructive' },
]

const ADDITIVE_PATTERNS = [
  { pattern: /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS/i, type: 'CREATE_TABLE' },
  { pattern: /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i, type: 'ADD_COLUMN' },
  { pattern: /ADD\s+COLUMN/i, type: 'ADD_COLUMN' },
  { pattern: /CREATE\s+INDEX/i, type: 'CREATE_INDEX' },
  { pattern: /CREATE\s+POLICY/i, type: 'CREATE_POLICY' },
  { pattern: /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION/i, type: 'CREATE_FUNCTION' },
  { pattern: /INSERT\s+INTO/i, type: 'INSERT_DATA' },
  { pattern: /ALTER\s+TABLE\s+\w+\s+ENABLE\s+ROW\s+LEVEL/i, type: 'ENABLE_RLS' },
  { pattern: /ALTER\s+TABLE\s+\w+\s+ADD\s+(?:CONSTRAINT|CHECK)/i, type: 'ADD_CONSTRAINT' },
  { pattern: /CREATE\s+TYPE/i, type: 'CREATE_TYPE' },
  { pattern: /GRANT/i, type: 'GRANT' },
]

function analyseMigration(sql, filename) {
  const operations = []
  let classification = 'safe'

  // Strip SQL comments
  const cleaned = sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')

  // Check destructive patterns first
  for (const { pattern, type, severity } of DESTRUCTIVE_PATTERNS) {
    const matches = cleaned.match(new RegExp(pattern.source, 'gi'))
    if (matches) {
      for (const match of matches) {
        // Check if it's a protected table
        const tableMatch = match.match(/(?:TABLE|FROM)\s+(?:IF\s+EXISTS\s+)?(\w+)/i)
        const tableName = tableMatch?.[1]?.toLowerCase()
        const isProtected = tableName && PROTECTED_TABLES.includes(tableName)

        operations.push({
          type,
          severity: isProtected ? 'blocked' : severity,
          match: match.trim().slice(0, 80),
          table: tableName || null,
          protected: isProtected,
        })

        if (severity === 'blocked' || isProtected) {
          classification = 'blocked'
        } else if (classification !== 'blocked') {
          classification = 'destructive'
        }
      }
    }
  }

  // Check additive patterns
  for (const { pattern, type } of ADDITIVE_PATTERNS) {
    const matches = cleaned.match(new RegExp(pattern.source, 'gi'))
    if (matches) {
      for (const match of matches) {
        operations.push({
          type,
          severity: 'additive',
          match: match.trim().slice(0, 80),
        })

        if (classification === 'safe') {
          classification = 'additive'
        }
      }
    }
  }

  return { filename, classification, operations }
}

async function main() {
  const args = process.argv.slice(2)
  const strictMode = args.includes('--strict')
  const specificFile = args.find(a => a.startsWith('--file='))?.split('=')[1]
    || (args.includes('--file') ? args[args.indexOf('--file') + 1] : null)

  let files
  if (specificFile) {
    files = [specificFile]
  } else {
    const allFiles = await readdir(MIGRATIONS_DIR)
    files = allFiles
      .filter(f => f.endsWith('.sql') && !f.startsWith('000_'))
      .sort()
  }

  console.log('\n🛡️  Directive 079: Migration Guard')
  console.log(`   Mode: ${strictMode ? 'STRICT (blocks all destructive)' : 'STANDARD (warns on destructive)'}`)
  console.log(`   Files: ${files.length}\n`)

  let hasBlocker = false
  let hasDestructive = false
  const results = []

  for (const file of files) {
    const filePath = join(MIGRATIONS_DIR, file)
    const sql = await readFile(filePath, 'utf-8')
    const result = analyseMigration(sql, file)
    results.push(result)

    const icon = {
      safe: '✅',
      additive: '🟢',
      destructive: '⚠️',
      blocked: '🚫',
    }[result.classification]

    if (result.classification === 'blocked') {
      hasBlocker = true
      console.log(`${icon}  ${file}  →  BLOCKED`)
      for (const op of result.operations.filter(o => o.severity === 'blocked')) {
        console.log(`     ├─ ${op.type}: ${op.match}${op.protected ? ' (PROTECTED TABLE)' : ''}`)
      }
    } else if (result.classification === 'destructive') {
      hasDestructive = true
      console.log(`${icon}  ${file}  →  DESTRUCTIVE`)
      for (const op of result.operations.filter(o => o.severity === 'destructive')) {
        console.log(`     ├─ ${op.type}: ${op.match}`)
      }
    } else if (result.operations.length > 0) {
      // Only log non-trivial migrations
      const opTypes = [...new Set(result.operations.map(o => o.type))]
      console.log(`${icon}  ${file}  →  ${result.classification.toUpperCase()} [${opTypes.join(', ')}]`)
    }
  }

  // Summary
  const counts = {
    safe: results.filter(r => r.classification === 'safe').length,
    additive: results.filter(r => r.classification === 'additive').length,
    destructive: results.filter(r => r.classification === 'destructive').length,
    blocked: results.filter(r => r.classification === 'blocked').length,
  }

  console.log('\n───────────────────────────────────────')
  console.log(`📊 Summary: ${counts.safe} safe, ${counts.additive} additive, ${counts.destructive} destructive, ${counts.blocked} blocked`)

  if (hasBlocker) {
    console.log('\n🚫 BLOCKED: Migrations contain operations on protected tables.')
    console.log('   Remove DROP TABLE / TRUNCATE on core tables before proceeding.\n')
    process.exit(1)
  }

  if (hasDestructive && strictMode) {
    console.log('\n⚠️  BLOCKED (strict mode): Destructive migrations detected.')
    console.log('   Use Phase 1 (Add) + Phase 2 (Release) pattern instead.\n')
    process.exit(1)
  }

  if (hasDestructive) {
    console.log('\n⚠️  WARNING: Destructive migrations detected. Use --strict to block.\n')
  } else {
    console.log('\n✅ All migrations pass the guard.\n')
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('Migration guard error:', err)
  process.exit(2)
})
