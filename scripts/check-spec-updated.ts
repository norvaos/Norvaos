#!/usr/bin/env npx tsx
/**
 * CI Blocking Script: Core Enforcement Spec Gate
 * ═══════════════════════════════════════════════
 *
 * Runs in CI on every PR. Reads the canonical sensitive surfaces registry
 * from docs/enforcement/sensitive-surfaces.json (single source of truth)
 * and enforces test coverage for any change to those surfaces.
 *
 * DETERMINISTIC: All diff operations target committed state only (HEAD).
 * The script never reads uncommitted or untracked files.
 *
 * Exit codes:
 *   0  — PR does not touch sensitive surfaces, or it includes test updates
 *   1  — PR touches sensitive surfaces WITHOUT test coverage or waiver
 *
 * Policy:
 *   - Tests are MANDATORY when sensitive surfaces change.
 *   - Spec-only updates do NOT replace the test requirement.
 *   - No commit-message bypass exists.
 *   - The only alternative to tests is a waiver entry in
 *     docs/enforcement/waivers.md (requires CODEOWNERS approval).
 *   - Version discipline: bumping CORE_ENFORCEMENT_SPEC_VERSION requires
 *     co-updating the spec doc and registry.
 *   - Enforcement impact declaration required in commit messages when
 *     sensitive surfaces are touched.
 *
 * Usage:
 *   npx tsx scripts/check-spec-updated.ts
 *   npx tsx scripts/check-spec-updated.ts --base main
 */

import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// ── Configuration ───────────────────────────────────────────────────────────

const ROOT = resolve(__dirname, '..')
const REGISTRY_PATH = resolve(ROOT, 'docs/enforcement/sensitive-surfaces.json')
const WAIVERS_PATH = 'docs/enforcement/waivers.md'

/** Enforcement test file patterns — these count as "test coverage". */
const ENFORCEMENT_TEST_PATTERNS = [
  'lib/utils/__tests__/enforcement-regression.test.ts',
  'lib/utils/__tests__/permission-wiring.test.ts',
  'lib/utils/__tests__/billing-acceptance.test.tsx',
  'lib/utils/__tests__/rls-billing-regression.test.ts',
  'components/__tests__/require-permission.test.tsx',
]

function isEnforcementTestFile(file: string): boolean {
  // Exact match on known enforcement test files
  if (ENFORCEMENT_TEST_PATTERNS.some((p) => file.endsWith(p) || file === p)) return true
  // Any API test under app/api/**/__tests__/**
  if (file.match(/^app\/api\/.*\/__tests__\//)) return true
  // Any .test.ts(x) file
  if (file.match(/\.test\.(ts|tsx)$/)) return true
  return false
}

// ── Registry Loader ─────────────────────────────────────────────────────────

interface SurfaceEntry {
  path: string
  category: string
  reason: string
  required_controls: string[]
}

interface Registry {
  version: string
  surfaces: SurfaceEntry[]
}

function loadRegistry(): Registry {
  if (!existsSync(REGISTRY_PATH)) {
    console.error('  FATAL: sensitive-surfaces.json not found at:')
    console.error(`  ${REGISTRY_PATH}`)
    process.exit(1)
  }
  const raw = readFileSync(REGISTRY_PATH, 'utf-8')
  const registry = JSON.parse(raw) as Registry
  if (!registry.version || !Array.isArray(registry.surfaces) || registry.surfaces.length === 0) {
    console.error('  FATAL: sensitive-surfaces.json is malformed or empty.')
    process.exit(1)
  }
  return registry
}

// ── Waiver Validation (machine-parsable JSON) ──────────────────────────────

interface WaiverEntry {
  id: string
  files: string[]
  reason: string
  reviewer: string
  created_at: string
  expires_at: string
}

interface WaiverValidation {
  valid: boolean
  reason?: string
}

function parseWaivers(content: string): WaiverEntry[] {
  const match = content.match(
    /<!-- ACTIVE_WAIVERS_BEGIN -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- ACTIVE_WAIVERS_END -->/
  )
  if (!match) return []
  try {
    const parsed = JSON.parse(match[1])
    if (!Array.isArray(parsed)) return []
    return parsed as WaiverEntry[]
  } catch {
    return []
  }
}

function validateWaiver(changedFiles: string[], touchedSensitive: string[]): WaiverValidation {
  // 1. waivers.md must be modified in this PR
  const waiversChanged = changedFiles.some((f) => f.endsWith(WAIVERS_PATH) || f === WAIVERS_PATH)
  if (!waiversChanged) {
    return { valid: false, reason: 'waivers.md was not modified in this PR' }
  }

  // 2. Parse JSON block from waivers.md
  const waiversPath = resolve(ROOT, WAIVERS_PATH)
  if (!existsSync(waiversPath)) {
    return { valid: false, reason: 'waivers.md does not exist' }
  }
  const content = readFileSync(waiversPath, 'utf-8')
  const waivers = parseWaivers(content)
  if (waivers.length === 0) {
    return { valid: false, reason: 'no machine-parsable waivers found (JSON array is empty or malformed)' }
  }

  // 3. Validate each waiver entry
  const now = new Date()
  for (const waiver of waivers) {
    // Required fields
    if (!waiver.id || typeof waiver.id !== 'string') {
      return { valid: false, reason: `waiver missing or invalid 'id' field` }
    }
    if (!Array.isArray(waiver.files) || waiver.files.length === 0) {
      return { valid: false, reason: `waiver ${waiver.id}: 'files' must be a non-empty array` }
    }
    if (!waiver.reason || typeof waiver.reason !== 'string') {
      return { valid: false, reason: `waiver ${waiver.id}: missing or invalid 'reason'` }
    }
    if (!waiver.reviewer || typeof waiver.reviewer !== 'string') {
      return { valid: false, reason: `waiver ${waiver.id}: missing or invalid 'reviewer'` }
    }
    if (!waiver.created_at || typeof waiver.created_at !== 'string') {
      return { valid: false, reason: `waiver ${waiver.id}: missing or invalid 'created_at'` }
    }
    if (!waiver.expires_at || typeof waiver.expires_at !== 'string') {
      return { valid: false, reason: `waiver ${waiver.id}: missing or invalid 'expires_at'` }
    }

    // Date validation
    const createdAt = new Date(waiver.created_at)
    const expiresAt = new Date(waiver.expires_at)
    if (isNaN(createdAt.getTime())) {
      return { valid: false, reason: `waiver ${waiver.id}: created_at '${waiver.created_at}' is not a valid date` }
    }
    if (isNaN(expiresAt.getTime())) {
      return { valid: false, reason: `waiver ${waiver.id}: expires_at '${waiver.expires_at}' is not a valid date` }
    }

    // Expiry must not be in the past
    if (expiresAt.getTime() < now.getTime()) {
      return { valid: false, reason: `waiver ${waiver.id}: expired on ${waiver.expires_at}` }
    }

    // Expiry must not be more than 14 days from created_at
    const diffDays = (expiresAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
    if (diffDays > 14) {
      return { valid: false, reason: `waiver ${waiver.id}: expires_at exceeds 14-day limit from created_at (${diffDays.toFixed(0)} days)` }
    }

    // Waiver files must be a subset of files actually in the diff
    for (const waiverFile of waiver.files) {
      const inDiff = changedFiles.some((f) => f.endsWith(waiverFile) || f === waiverFile)
      if (!inDiff) {
        return { valid: false, reason: `waiver ${waiver.id}: file '${waiverFile}' is not in the PR diff` }
      }
    }
  }

  // 4. Every touched sensitive file must be covered by at least one valid waiver
  const coveredFiles = new Set(waivers.flatMap((w) => w.files))
  for (const file of touchedSensitive) {
    const covered =
      coveredFiles.has(file) ||
      Array.from(coveredFiles).some((cf) => file.endsWith(cf))
    if (!covered) {
      return { valid: false, reason: `no waiver covers sensitive file: ${file}` }
    }
  }

  return { valid: true }
}

// ── Version Discipline ──────────────────────────────────────────────────────

function checkVersionDiscipline(changedFiles: string[]): void {
  const versionTsChanged = changedFiles.some((f) => f.endsWith('lib/config/version.ts'))
  if (!versionTsChanged) return // No version change — nothing to check

  const specChanged = changedFiles.some((f) => f.endsWith('docs/core-enforcement-spec-v1.md'))
  const registryChanged = changedFiles.some((f) => f.endsWith('docs/enforcement/sensitive-surfaces.json'))

  if (!specChanged || !registryChanged) {
    console.error('  !! VERSION DISCIPLINE VIOLATION !!')
    console.error('  ')
    console.error('  lib/config/version.ts changed but:')
    if (!specChanged) console.error('    - docs/core-enforcement-spec-v1.md was NOT updated')
    if (!registryChanged) console.error('    - docs/enforcement/sensitive-surfaces.json was NOT updated')
    console.error('  ')
    console.error('  All three files must be updated together when CORE_ENFORCEMENT_SPEC_VERSION changes.')
    console.error('  This ensures version.ts, the spec document, and the registry stay in sync.')
    console.error('')
    process.exit(1)
  }
}

// ── Enforcement Impact Declaration ──────────────────────────────────────────

function checkEnforcementImpactDeclaration(baseBranch: string): boolean {
  try {
    const mergeBase = execSync(`git merge-base ${baseBranch} HEAD`, {
      encoding: 'utf-8',
    }).trim()
    const log = execSync(`git log --format=%B ${mergeBase}..HEAD`, {
      encoding: 'utf-8',
    })
    return log.includes('Enforcement impact:')
  } catch {
    // If we can't read the log, skip the check
    return true
  }
}

// ── Git Helpers ─────────────────────────────────────────────────────────────

function getChangedFiles(baseBranch: string): string[] {
  try {
    const mergeBase = execSync(`git merge-base ${baseBranch} HEAD`, {
      encoding: 'utf-8',
    }).trim()
    // DETERMINISTIC: compare merge-base to HEAD (committed only, not working tree)
    const diff = execSync(`git diff --name-only ${mergeBase} HEAD`, {
      encoding: 'utf-8',
    })
    return diff.trim().split('\n').filter(Boolean)
  } catch {
    try {
      // Fallback: three-dot diff (committed only)
      const diff = execSync(`git diff --name-only ${baseBranch}...HEAD`, {
        encoding: 'utf-8',
      })
      return diff.trim().split('\n').filter(Boolean)
    } catch {
      console.warn('  Warning: Could not determine base branch diff. Checking staged changes only.')
      // Final fallback: staged changes only (deterministic)
      const diff = execSync('git diff --name-only --cached HEAD', {
        encoding: 'utf-8',
      })
      return diff.trim().split('\n').filter(Boolean)
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2)
  const baseIdx = args.indexOf('--base')
  const baseBranch = baseIdx !== -1 && args[baseIdx + 1] ? args[baseIdx + 1] : 'main'

  console.log(`\n  Core Enforcement Spec Gate`)
  console.log(`  ════════════════════════════════════`)
  console.log(`  Base branch: ${baseBranch}`)

  // Load canonical registry
  const registry = loadRegistry()
  const sensitivePaths = registry.surfaces.map((s) => s.path)
  console.log(`  Registry: ${sensitivePaths.length} sensitive surfaces (v${registry.version})\n`)

  const changedFiles = getChangedFiles(baseBranch)

  if (changedFiles.length === 0) {
    console.log('  No changed files detected. Passing.\n')
    process.exit(0)
  }

  // ── Version discipline gate ───────────────────────────────────────────
  checkVersionDiscipline(changedFiles)

  // ── Find which sensitive surfaces were touched ────────────────────────
  const touchedSensitive = changedFiles.filter((file) =>
    sensitivePaths.some((surface) => file.endsWith(surface) || file === surface)
  )

  if (touchedSensitive.length === 0) {
    console.log('  No enforcement-sensitive surfaces modified. Passing.\n')
    process.exit(0)
  }

  console.log(`  Sensitive surfaces touched (${touchedSensitive.length}):`)
  for (const file of touchedSensitive) {
    const entry = registry.surfaces.find((s) => file.endsWith(s.path))
    console.log(`    - ${file} [${entry?.category}]`)
  }
  console.log()

  // ── Check 1: enforcement test files updated? ──────────────────────────
  const testFiles = changedFiles.filter(isEnforcementTestFile)
  if (testFiles.length > 0) {
    console.log(`  Enforcement test files also modified (${testFiles.length}):`)
    for (const file of testFiles) {
      console.log(`    + ${file}`)
    }
    // ── Enforcement impact declaration (warning only) ─────────────────
    if (!checkEnforcementImpactDeclaration(baseBranch)) {
      console.warn('\n  ⚠ WARNING: No "Enforcement impact:" declaration found in commit messages.')
      console.warn('  Consider adding to your commit: "Enforcement impact: none" or')
      console.warn('  "Enforcement impact: modifies invariant(s): <description>"\n')
    }
    console.log('\n  Gate PASSED: Enforcement-sensitive changes have test coverage.\n')
    process.exit(0)
  }

  // ── Check 2: valid waiver? ────────────────────────────────────────────
  const waiver = validateWaiver(changedFiles, touchedSensitive)
  if (waiver.valid) {
    // ── Enforcement impact declaration (warning only) ─────────────────
    if (!checkEnforcementImpactDeclaration(baseBranch)) {
      console.warn('  ⚠ WARNING: No "Enforcement impact:" declaration found in commit messages.\n')
    }
    console.log('  Waiver found and validated. Passing with waiver.\n')
    process.exit(0)
  }

  // ── FAIL — no tests, no valid waiver ──────────────────────────────────
  console.error('  !! GATE FAILED !!')
  console.error('  ')
  console.error('  You touched sensitive enforcement surfaces but did NOT')
  console.error('  update enforcement tests or add a valid waiver.')
  console.error('  ')
  console.error('  Touched surfaces:')
  for (const file of touchedSensitive) {
    console.error(`    - ${file}`)
  }
  console.error('  ')
  console.error('  To fix, do ONE of:')
  console.error('    1. Update or add an enforcement test file:')
  for (const p of ENFORCEMENT_TEST_PATTERNS.slice(0, 4)) {
    console.error(`       - ${p}`)
  }
  console.error('       - or any *.test.ts(x) file')
  console.error('    2. Add a waiver entry to docs/enforcement/waivers.md')
  console.error('       (requires CODEOWNERS approval, expires in 14 days)')
  console.error('       Format: machine-parsable JSON between ACTIVE_WAIVERS markers')
  if (!waiver.valid && waiver.reason) {
    console.error(`       Waiver check failed: ${waiver.reason}`)
  }
  console.error('  ')
  console.error('  NOTE: Spec-only updates do NOT satisfy this gate.')
  console.error('        Tests are mandatory. No commit-message bypass exists.')
  console.error('')

  // ── Enforcement impact declaration check (additional warning) ─────────
  if (!checkEnforcementImpactDeclaration(baseBranch)) {
    console.error('  ALSO: No "Enforcement impact:" declaration found in commit messages.')
    console.error('  PR template requires: "Enforcement impact: none" or')
    console.error('  "Enforcement impact: modifies invariant(s): ____"')
    console.error('')
  }

  process.exit(1)
}

main()
