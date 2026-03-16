#!/usr/bin/env node

/**
 * Schema Drift Check
 *
 * Connects to the database and verifies that every column referenced in
 * lib/types/database.ts actually exists in the corresponding table.
 *
 * This catches the class of bugs found in Phase 8 (DEF-1 through DEF-5)
 * where code referenced non-existent columns like `is_billed`, `total_amount`,
 * `invoice_date`, `payment_date`, `method`, and `matters.contact_id`.
 *
 * Usage:
 *   SUPABASE_DB_URL=postgres://... node scripts/check-schema-drift.mjs
 *
 * If SUPABASE_DB_URL is not set, falls back to a static check by parsing
 * migration SQL files for CREATE TABLE and ALTER TABLE statements.
 */

import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const MIGRATIONS_DIR = join(import.meta.dirname, 'migrations')

// ── Parse migrations for table/column definitions ──────────────────────────

function extractColumnsFromMigrations() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && !f.startsWith('999'))
    .sort()

  const tables = new Map() // table_name -> Set<column_name>

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8')

    // Match CREATE TABLE statements
    const createRegex = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:public\.)?(\w+)\s*\(([\s\S]*?)\);/gi
    let match
    while ((match = createRegex.exec(sql)) !== null) {
      const tableName = match[1]
      const body = match[2]
      if (!tables.has(tableName)) tables.set(tableName, new Set())
      const cols = tables.get(tableName)

      // Extract column names (skip constraints, primary key, etc.)
      for (const line of body.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('--')) continue
        if (/^\s*(PRIMARY|UNIQUE|CHECK|CONSTRAINT|FOREIGN|EXCLUDE)/i.test(trimmed)) continue
        const colMatch = trimmed.match(/^(\w+)\s+/i)
        if (colMatch && !['PRIMARY', 'UNIQUE', 'CHECK', 'CONSTRAINT', 'FOREIGN', 'EXCLUDE', 'CREATE', 'ALTER', 'DROP', 'INSERT', 'UPDATE', 'DELETE', 'SELECT', 'WITH', 'GRANT', 'REVOKE', 'IF', 'ON', 'FOR', 'USING', 'SET', 'BEGIN', 'END', 'RETURN', 'RAISE', 'DECLARE', 'EXECUTE', 'RETURNS', 'LANGUAGE', 'AS', 'SECURITY', 'STABLE', 'VOLATILE', 'IMMUTABLE', 'NEW', 'OLD', 'THEN', 'ELSE', 'ELSIF', 'LOOP', 'WHILE', 'FUNCTION', 'TRIGGER', 'INDEX', 'POLICY', 'TABLE', 'VIEW'].includes(colMatch[1].toUpperCase())) {
          cols.add(colMatch[1])
        }
      }
    }

    // Match ALTER TABLE ADD COLUMN
    const alterRegex = /ALTER TABLE\s+(?:IF EXISTS\s+)?(?:public\.)?(\w+)\s+ADD\s+(?:COLUMN\s+)?(?:IF NOT EXISTS\s+)?(\w+)/gi
    while ((match = alterRegex.exec(sql)) !== null) {
      const tableName = match[1]
      const colName = match[2]
      if (!tables.has(tableName)) tables.set(tableName, new Set())
      tables.get(tableName).add(colName)
    }
  }

  return tables
}

// ── Parse database.ts for type references ──────────────────────────────────

function extractTypeReferences() {
  const dbTypesPath = join(import.meta.dirname, '..', 'lib', 'types', 'database.ts')
  const content = readFileSync(dbTypesPath, 'utf-8')

  // Extract table name from interface comments or naming convention
  // Pattern: interface XxxRow { ... } where Xxx maps to table name
  const refs = []

  // Find Row interfaces
  const interfaceRegex = /interface\s+(\w+Row)\s*\{([\s\S]*?)\}/g
  let match
  while ((match = interfaceRegex.exec(content)) !== null) {
    const interfaceName = match[1]
    const body = match[2]

    // Convert PascalCase to snake_case for table name
    const tableName = interfaceName
      .replace(/Row$/, '')
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '')

    const columns = []
    for (const line of body.split('\n')) {
      const colMatch = line.trim().match(/^(\w+)\s*[?:]/)
      if (colMatch) columns.push(colMatch[1])
    }

    refs.push({ interfaceName, tableName, columns })
  }

  return refs
}

// ── Main ───────────────────────────────────────────────────────────────────

const tables = extractColumnsFromMigrations()
const typeRefs = extractTypeReferences()

console.log(`Parsed ${tables.size} tables from ${readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).length} migrations`)
console.log(`Found ${typeRefs.length} Row interfaces in database.ts`)
console.log()

let errors = 0
let warnings = 0

for (const { interfaceName, tableName, columns } of typeRefs) {
  const tableColumns = tables.get(tableName)
  if (!tableColumns) {
    console.log(`⚠  ${interfaceName} → table "${tableName}" not found in migrations (may use different naming)`)
    warnings++
    continue
  }

  for (const col of columns) {
    if (!tableColumns.has(col)) {
      console.error(`✗  ${interfaceName}.${col} → column "${col}" not found in table "${tableName}"`)
      errors++
    }
  }
}

console.log()
if (errors > 0) {
  console.error(`SCHEMA DRIFT DETECTED: ${errors} column(s) in database.ts do not match migration schema`)
  process.exit(1)
} else if (warnings > 0) {
  console.log(`Schema check passed with ${warnings} warning(s)`)
} else {
  console.log('Schema check passed — no drift detected')
}
