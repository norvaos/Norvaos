/**
 * Enforcement Regression Test Suite
 * ═══════════════════════════════════
 *
 * Umbrella test that asserts all Core Enforcement Specification v1.0
 * invariants. This suite is NON-OPTIONAL and must pass before any release.
 *
 * Two types of assertions:
 *   1. Behavioural — imports actual functions and verifies enforcement logic
 *   2. Structural  — reads source files and verifies critical patterns exist
 *
 * The suite consumes docs/enforcement/sensitive-surfaces.json as the single
 * source of truth for the sensitive surfaces registry.
 *
 * See: docs/core-enforcement-spec-v1.md
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { resolve, relative } from 'path'

// ── Behavioural imports — actual enforcement functions ───────────────────────

import { hasPermission, canView, canCreate, canEdit, canDelete } from '@/lib/utils/permissions'
import { evaluateSlotCondition } from '@/lib/services/document-slot-engine'

const ROOT = resolve(__dirname, '../../..')

function readSource(relPath: string): string {
  const full = resolve(ROOT, relPath)
  if (!existsSync(full)) {
    throw new Error(`Enforcement spec file missing: ${relPath}`)
  }
  return readFileSync(full, 'utf-8')
}

function fileExists(relPath: string): boolean {
  return existsSync(resolve(ROOT, relPath))
}

// ── Registry loader ─────────────────────────────────────────────────────────

interface SurfaceEntry {
  path: string
  category: string
  reason: string
  required_controls: string[]
  gate_entity?: string
  gate_action?: string
}

interface Registry {
  version: string
  surfaces: SurfaceEntry[]
}

function loadRegistry(): Registry {
  const raw = readFileSync(resolve(ROOT, 'docs/enforcement/sensitive-surfaces.json'), 'utf-8')
  return JSON.parse(raw) as Registry
}

// ── Role fixtures for behavioural tests ─────────────────────────────────────

const ADMIN_ROLE = {
  id: 'role-admin',
  name: 'Admin',
  permissions: { all: true } as Record<string, Record<string, boolean>>,
  is_system: true,
}

const LAWYER_ROLE = {
  id: 'role-lawyer',
  name: 'Lawyer',
  permissions: {
    contacts: { view: true, create: true, edit: true, delete: false },
    matters: { view: true, create: true, edit: true, delete: false },
    tasks: { view: true, create: true, edit: true, delete: true },
    // billing is intentionally ABSENT
  },
  is_system: true,
}

const BILLING_CLERK_ROLE = {
  id: 'role-clerk',
  name: 'BillingClerk',
  permissions: {
    billing: { view: true, create: false, edit: false, delete: false },
  },
  is_system: false,
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Registry Consumption — JSON is valid, complete, and all paths exist
// ═══════════════════════════════════════════════════════════════════════════

describe('Enforcement Spec – Registry Consumption', () => {
  it('sensitive-surfaces.json exists', () => {
    expect(fileExists('docs/enforcement/sensitive-surfaces.json')).toBe(true)
  })

  it('registry is valid JSON with required fields', () => {
    const registry = loadRegistry()
    expect(registry.version).toBeDefined()
    expect(typeof registry.version).toBe('string')
    expect(registry.surfaces).toBeDefined()
    expect(Array.isArray(registry.surfaces)).toBe(true)
    expect(registry.surfaces.length).toBeGreaterThan(0)
  })

  it('every surface entry has required fields', () => {
    const registry = loadRegistry()
    for (const surface of registry.surfaces) {
      expect(surface.path).toBeDefined()
      expect(surface.category).toBeDefined()
      expect(surface.reason).toBeDefined()
      expect(surface.required_controls).toBeDefined()
      expect(Array.isArray(surface.required_controls)).toBe(true)
      expect(surface.required_controls.length).toBeGreaterThan(0)
    }
  })

  it('every surface path resolves to an existing file', () => {
    const registry = loadRegistry()
    const missing: string[] = []
    for (const surface of registry.surfaces) {
      if (!fileExists(surface.path)) {
        missing.push(surface.path)
      }
    }
    if (missing.length > 0) {
      throw new Error(
        `Registry references non-existent files:\n  ${missing.join('\n  ')}`
      )
    }
  })

  it('registry has at least 25 surfaces covering all categories', () => {
    const registry = loadRegistry()
    expect(registry.surfaces.length).toBeGreaterThanOrEqual(25)

    const categories = new Set(registry.surfaces.map((s) => s.category))
    expect(categories.has('billing')).toBe(true)
    expect(categories.has('stage_gating')).toBe(true)
    expect(categories.has('documents')).toBe(true)
    expect(categories.has('audit')).toBe(true)
  })

  it('registry contains exactly 34 surfaces (frozen count — spec review required to change)', () => {
    const registry = loadRegistry()
    if (registry.surfaces.length !== 34) {
      const message = registry.surfaces.length < 34
        ? `Registry has ${registry.surfaces.length} surfaces (expected 34). ` +
          `A surface may have been removed without spec review. ` +
          `To fix: restore the missing surface or bump CORE_ENFORCEMENT_SPEC_VERSION ` +
          `and update docs/core-enforcement-spec-v1.md Section 10.`
        : `Registry has ${registry.surfaces.length} surfaces (expected 34). ` +
          `A new surface was added without updating the frozen count. ` +
          `To fix: bump CORE_ENFORCEMENT_SPEC_VERSION, update the exact count ` +
          `in this test AND docs/core-enforcement-spec-v1.md Section 10, ` +
          `and get CODEOWNERS approval.`
      throw new Error(message)
    }
    expect(registry.surfaces.length).toBe(34)
  })

  it('no duplicate paths in registry', () => {
    const registry = loadRegistry()
    const paths = registry.surfaces.map((s) => s.path)
    const unique = new Set(paths)
    expect(unique.size).toBe(paths.length)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 2. Version Consistency — all three sources agree
// ═══════════════════════════════════════════════════════════════════════════

describe('Enforcement Spec – Version Consistency', () => {
  it('CORE_ENFORCEMENT_SPEC_VERSION exists in version.ts', () => {
    const source = readSource('lib/config/version.ts')
    expect(source).toContain('CORE_ENFORCEMENT_SPEC_VERSION')
  })

  it('all three version sources match', () => {
    // Source 1: version.ts constant
    const versionTs = readSource('lib/config/version.ts')
    const constMatch = versionTs.match(/CORE_ENFORCEMENT_SPEC_VERSION\s*=\s*['"]([^'"]+)['"]/)
    expect(constMatch).not.toBeNull()
    const tsVersion = constMatch![1]

    // Source 2: sensitive-surfaces.json version field
    const registry = loadRegistry()
    const jsonVersion = registry.version

    // Source 3: spec document header version
    const spec = readSource('docs/core-enforcement-spec-v1.md')
    const specMatch = spec.match(/\*\*Version\*\*:\s*`([^`]+)`/)
    expect(specMatch).not.toBeNull()
    const specVersion = specMatch![1]

    // All three must be equal
    expect(tsVersion).toBe(jsonVersion)
    expect(tsVersion).toBe(specVersion)
    expect(jsonVersion).toBe(specVersion)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 3. Billing Visibility — Behavioural Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Enforcement Spec – Billing Visibility (behavioural)', () => {
  // Direct function calls — no mocking, no rendering, real logic

  it('Admin hasPermission("billing", "view") returns true', () => {
    expect(hasPermission(ADMIN_ROLE, 'billing', 'view')).toBe(true)
  })

  it('Lawyer hasPermission("billing", "view") returns false', () => {
    expect(hasPermission(LAWYER_ROLE, 'billing', 'view')).toBe(false)
  })

  it('BillingClerk canView("billing") returns true', () => {
    expect(canView(BILLING_CLERK_ROLE, 'billing')).toBe(true)
  })

  it('Lawyer canView("billing") returns false', () => {
    expect(canView(LAWYER_ROLE, 'billing')).toBe(false)
  })

  it('null role always returns false for any permission', () => {
    expect(hasPermission(null, 'billing', 'view')).toBe(false)
    expect(hasPermission(undefined, 'billing', 'view')).toBe(false)
    expect(canView(null, 'billing')).toBe(false)
    expect(canCreate(null, 'billing')).toBe(false)
    expect(canEdit(null, 'billing')).toBe(false)
    expect(canDelete(null, 'billing')).toBe(false)
  })

  it('Lawyer can view matters but not billing', () => {
    expect(canView(LAWYER_ROLE, 'matters')).toBe(true)
    expect(canView(LAWYER_ROLE, 'billing')).toBe(false)
  })

  it('BillingClerk can view billing but not create/edit/delete', () => {
    expect(canView(BILLING_CLERK_ROLE, 'billing')).toBe(true)
    expect(canCreate(BILLING_CLERK_ROLE, 'billing')).toBe(false)
    expect(canEdit(BILLING_CLERK_ROLE, 'billing')).toBe(false)
    expect(canDelete(BILLING_CLERK_ROLE, 'billing')).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 4. Billing Visibility — Structural (wiring scan)
// ═══════════════════════════════════════════════════════════════════════════

describe('Enforcement Spec – Billing Visibility (structural)', () => {
  // Layer 1: UI gate exists
  it('RequirePermission component handles billing entity with "Billing Restricted"', () => {
    const source = readSource('components/require-permission.tsx')
    expect(source).toContain("entity === 'billing'")
    expect(source).toContain('Billing Restricted')
    expect(source).toContain('billing information')
  })

  // Layer 2: Server gate exists
  it('checkBillingPermission exists as shared service with 403 + audit', () => {
    const source = readSource('lib/services/billing-permission.ts')
    expect(source).toContain('checkBillingPermission')
    expect(source).toContain('billing:view')
  })

  it('checkBillingPermission emits structured 403 logs with required fields', () => {
    const source = readSource('lib/services/billing-permission.ts')
    expect(source).toContain('billing_permission_denied')
    expect(source).toContain('user_id')
    expect(source).toContain('role_name')
    expect(source).toContain('route')
    expect(source).toContain('timestamp')
    expect(source).toContain('BillingDeniedLog')
    expect(source).toContain('logBillingDenied')
  })

  it('invoice PDF route uses checkBillingPermission and logs denied audit', () => {
    const source = readSource('app/api/invoices/[id]/pdf/route.ts')
    expect(source).toContain('checkBillingPermission')
    expect(source).toContain('403')
    expect(source).toContain('invoice_pdf_download_denied')
  })

  // Layer 3: RLS exists
  it('billing RLS migration defines has_billing_view() SECURITY DEFINER', () => {
    const source = readSource('scripts/migrations/033-billing-rls-role-check.sql')
    expect(source).toContain('has_billing_view')
    expect(source).toMatch(/SECURITY\s+DEFINER/i)
    expect(source).toContain('invoices')
    expect(source).toContain('invoice_line_items')
    expect(source).toContain('payments')
  })

  // Gate wiring — check surfaces from registry that require RequirePermission
  const registry = loadRegistry()
  const billingGatedSurfaces = registry.surfaces.filter(
    (s) => s.gate_entity === 'billing' && s.required_controls.includes('RequirePermission')
  )

  for (const surface of billingGatedSurfaces) {
    it(`${surface.path} contains RequirePermission entity="billing"`, () => {
      const source = readSource(surface.path)
      expect(source).toContain('<RequirePermission')
      expect(source).toContain('entity="billing"')
      expect(source).toContain('action="view"')
    })
  }

  // Revenue hooks inside gated component
  it('reports page RevenueSection is separate with revenue hooks', () => {
    const source = readSource('app/(dashboard)/reports/page.tsx')
    expect(source).toMatch(/function\s+RevenueSection/)
    expect(source).toContain('useReportRevenueByPracticeArea')
    expect(source).toContain('canViewBilling')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 5. Conditions Evaluation — Behavioural (fail-closed)
// ═══════════════════════════════════════════════════════════════════════════

describe('Enforcement Spec – Conditions Evaluation (behavioural)', () => {
  // Direct calls to the actual evaluateSlotCondition function

  it('null conditions → true (unconditional slot)', () => {
    expect(evaluateSlotCondition(null, {}, {})).toBe(true)
    expect(evaluateSlotCondition(undefined as never, {}, {})).toBe(true)
  })

  it('valid "equals" condition passes', () => {
    const condition = { field: 'status', operator: 'equals', value: 'active' }
    expect(evaluateSlotCondition(condition as never, { status: 'active' }, {})).toBe(true)
  })

  it('valid "equals" condition fails on mismatch', () => {
    const condition = { field: 'status', operator: 'equals', value: 'active' }
    expect(evaluateSlotCondition(condition as never, { status: 'inactive' }, {})).toBe(false)
  })

  it('unknown operator → false (fail-closed)', () => {
    const condition = { field: 'status', operator: 'unknown_operator', value: 'x' }
    expect(evaluateSlotCondition(condition as never, { status: 'x' }, {})).toBe(false)
  })

  it('malformed condition (missing field) → false (fail-closed)', () => {
    const condition = { operator: 'equals', value: 'x' } // missing "field"
    expect(evaluateSlotCondition(condition as never, {}, {})).toBe(false)
  })

  it('malformed condition (missing operator) → false (fail-closed)', () => {
    const condition = { field: 'status', value: 'x' } // missing "operator"
    expect(evaluateSlotCondition(condition as never, {}, {})).toBe(false)
  })

  it('condition array with one failure → false (AND logic)', () => {
    const conditions = [
      { field: 'a', operator: 'equals', value: '1' },
      { field: 'b', operator: 'equals', value: '2' },
    ]
    // a=1 passes, b=wrong fails → overall false
    expect(evaluateSlotCondition(conditions as never, { a: '1', b: 'wrong' }, {})).toBe(false)
  })

  it('condition array with all passing → true', () => {
    const conditions = [
      { field: 'a', operator: 'equals', value: '1' },
      { field: 'b', operator: 'equals', value: '2' },
    ]
    expect(evaluateSlotCondition(conditions as never, { a: '1', b: '2' }, {})).toBe(true)
  })

  it('"exists" operator works correctly', () => {
    const condition = { field: 'name', operator: 'exists' }
    expect(evaluateSlotCondition(condition as never, { name: 'John' }, {})).toBe(true)
    expect(evaluateSlotCondition(condition as never, {}, {})).toBe(false)
  })

  it('"in" operator works correctly', () => {
    const condition = { field: 'status', operator: 'in', value: ['active', 'pending'] }
    expect(evaluateSlotCondition(condition as never, { status: 'active' }, {})).toBe(true)
    expect(evaluateSlotCondition(condition as never, { status: 'closed' }, {})).toBe(false)
  })

  it('intake source reads from intakeData', () => {
    const condition = { field: 'stream', operator: 'equals', value: 'express', source: 'intake' }
    expect(evaluateSlotCondition(condition as never, {}, { stream: 'express' })).toBe(true)
    expect(evaluateSlotCondition(condition as never, {}, { stream: 'regular' })).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 6. Stage Gating — Structural
// ═══════════════════════════════════════════════════════════════════════════

describe('Enforcement Spec – Stage Gating', () => {
  it('stage engine supports all 6 gating rule types', () => {
    const source = readSource('lib/services/stage-engine.ts')
    const rules = [
      'require_checklist_complete',
      'require_deadlines',
      'require_previous_stage',
      'require_intake_complete',
      'require_risk_review',
      'require_document_slots_complete',
    ]
    for (const rule of rules) {
      expect(source).toContain(rule)
    }
  })

  it('stage engine logs blocked attempts and returns failedRules', () => {
    const source = readSource('lib/services/stage-engine.ts')
    expect(source).toContain('stage_change_blocked')
    expect(source).toContain('failedRules')
    expect(source).toContain('success: false')
  })

  it('enforcement-enabled toggle is admin-only at DB level', () => {
    const source = readSource('scripts/migrations/027-enforcement-enabled-lockdown.sql')
    expect(source).toMatch(/restrict_enforcement_enabled/i)
    expect(source).toContain('Admin')
    expect(source).toContain('audit_logs')
  })

  it('stage engine has default baseline via getEffectiveGatingRules', () => {
    const source = readSource('lib/services/stage-engine.ts')
    expect(source).toContain('getEffectiveGatingRules')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 7. Document Slots — Structural
// ═══════════════════════════════════════════════════════════════════════════

describe('Enforcement Spec – Document Slots', () => {
  it('document_versions is SELECT + INSERT only (immutable)', () => {
    const source = readSource('scripts/migrations/028-document-engine.sql')
    expect(source).toContain('document_versions_select')
    expect(source).toContain('document_versions_insert')
    expect(source).toMatch(/immutable/i)
    expect(source).not.toMatch(/CREATE\s+POLICY\s+document_versions_update/i)
    expect(source).not.toMatch(/CREATE\s+POLICY\s+document_versions_delete/i)
  })

  it('upload_document_version RPC is transactional with audit', () => {
    const source = readSource('scripts/migrations/028-document-engine.sql')
    expect(source).toContain('upload_document_version')
    expect(source).toContain('document_versions')
    expect(source).toContain('audit_logs')
  })

  it('review_document_version RPC exists', () => {
    const m028 = readSource('scripts/migrations/028-document-engine.sql')
    let m032HasIt = false
    try {
      m032HasIt = readSource('scripts/migrations/032-fix-review-status-mapping.sql').includes('review_document_version')
    } catch { /* may not exist */ }
    expect(m028.includes('review_document_version') || m032HasIt).toBe(true)
  })

  it('slot engine exports generate and regenerate functions', () => {
    const source = readSource('lib/services/document-slot-engine.ts')
    expect(source).toContain('generateDocumentSlots')
    expect(source).toContain('regenerateDocumentSlots')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 8. Audit Immutability — Structural
// ═══════════════════════════════════════════════════════════════════════════

describe('Enforcement Spec – Audit Immutability', () => {
  it('audit_logs has immutability trigger (BEFORE UPDATE OR DELETE)', () => {
    const source = readSource('scripts/migrations/024-uee-phase-a-hardening.sql')
    expect(source).toContain('prevent_audit_log_mutation')
    expect(source).toContain('trg_audit_logs_immutable')
    expect(source).toMatch(/BEFORE\s+UPDATE\s+OR\s+DELETE\s+ON\s+audit_logs/i)
    expect(source).toContain('Audit logs are immutable')
    expect(source).toContain('RAISE EXCEPTION')
  })

  it('risk_override_history has same immutability trigger', () => {
    const source = readSource('scripts/migrations/024-uee-phase-a-hardening.sql')
    expect(source).toContain('trg_risk_override_history_immutable')
  })

  it('audit_logs has granular RLS: SELECT + INSERT only', () => {
    const source = readSource('scripts/migrations/024-uee-phase-a-hardening.sql')
    expect(source).toContain('audit_logs_select')
    expect(source).toContain('audit_logs_insert')
    expect(source).not.toMatch(/CREATE\s+POLICY\s+audit_logs_update/i)
    expect(source).not.toMatch(/CREATE\s+POLICY\s+audit_logs_delete/i)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 9. CI Gate — Structural
// ═══════════════════════════════════════════════════════════════════════════

describe('Enforcement Spec – CI Gate & Governance', () => {
  it('CI script exists and reads from sensitive-surfaces.json', () => {
    const source = readSource('scripts/check-spec-updated.ts')
    expect(source).toContain('sensitive-surfaces.json')
  })

  it('CI script has NO commit-message bypass', () => {
    const source = readSource('scripts/check-spec-updated.ts')
    expect(source).not.toContain('[no-enforcement-impact]')
    expect(source).not.toContain('hasOptOut')
  })

  it('CI script requires tests (not just spec updates)', () => {
    const source = readSource('scripts/check-spec-updated.ts')
    expect(source).toContain('isEnforcementTestFile')
    // The old "spec OR test" logic should not exist
    expect(source).not.toContain('isSpecOrTestFile')
  })

  it('CI script supports waiver mechanism with machine-parsable JSON', () => {
    const source = readSource('scripts/check-spec-updated.ts')
    expect(source).toContain('waivers.md')
    expect(source).toContain('validateWaiver')
    expect(source).toContain('ACTIVE_WAIVERS_BEGIN')
    expect(source).toContain('parseWaivers')
    expect(source).toContain('expires_at')
    expect(source).toContain('created_at')
    expect(source).toContain('reviewer')
  })

  it('waivers.md exists with machine-parsable JSON markers', () => {
    expect(fileExists('docs/enforcement/waivers.md')).toBe(true)
    const source = readSource('docs/enforcement/waivers.md')
    expect(source).toContain('ACTIVE_WAIVERS_BEGIN')
    expect(source).toContain('ACTIVE_WAIVERS_END')
  })

  it('CODEOWNERS exists and protects enforcement files', () => {
    expect(fileExists('CODEOWNERS')).toBe(true)
    const source = readSource('CODEOWNERS')
    expect(source).toContain('docs/enforcement/')
    expect(source).toContain('core-enforcement-spec-v1.md')
    expect(source).toContain('check-spec-updated.ts')
  })

  it('spec document references JSON registry (not inline list)', () => {
    const spec = readSource('docs/core-enforcement-spec-v1.md')
    expect(spec).toContain('sensitive-surfaces.json')
    expect(spec).toContain('registry is normative')
  })

  it('CI script uses committed-only diff (HEAD, not working tree)', () => {
    const source = readSource('scripts/check-spec-updated.ts')
    expect(source).toContain('DETERMINISTIC')
    expect(source).toContain('git diff --name-only ${mergeBase} HEAD')
  })

  it('CI script enforces version-bump discipline (version.ts → spec + registry)', () => {
    const source = readSource('scripts/check-spec-updated.ts')
    expect(source).toContain('checkVersionDiscipline')
    expect(source).toContain('core-enforcement-spec-v1.md')
    expect(source).toContain('sensitive-surfaces.json')
  })

  it('CI script checks enforcement impact declaration in commits', () => {
    const source = readSource('scripts/check-spec-updated.ts')
    expect(source).toContain('checkEnforcementImpactDeclaration')
    expect(source).toContain('Enforcement impact:')
  })

  it('PR template exists with enforcement impact field', () => {
    expect(fileExists('.github/pull_request_template.md')).toBe(true)
    const source = readSource('.github/pull_request_template.md')
    expect(source).toContain('Enforcement Impact')
    expect(source).toContain('Enforcement impact:')
  })

  it('CI workflow includes enforcement gate job', () => {
    expect(fileExists('.github/workflows/ci.yml')).toBe(true)
    const source = readSource('.github/workflows/ci.yml')
    expect(source).toContain('enforcement-gate')
    expect(source).toContain('check-spec-updated.ts')
  })

  it('spec document declares enforcement freeze with baseline commit', () => {
    const spec = readSource('docs/core-enforcement-spec-v1.md')
    expect(spec).toContain('FROZEN')
    expect(spec).toContain('enforcement-v1.0.0')
    expect(spec).toContain('Baseline commit')
    expect(spec).toContain('Enforcement Freeze Policy')
  })

  it('CODEOWNERS protects all frozen enforcement components', () => {
    const source = readSource('CODEOWNERS')
    expect(source).toContain('enforcement-v1.0.0')
    expect(source).toContain('require-permission.tsx')
    expect(source).toContain('billing-permission.ts')
    expect(source).toContain('stage-engine.ts')
    expect(source).toContain('document-slot-engine.ts')
    expect(source).toContain('033-billing-rls-role-check.sql')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 10. Registry Completeness — no unregistered sensitive files
// ═══════════════════════════════════════════════════════════════════════════

describe('Enforcement Spec – Registry Completeness', () => {
  // Patterns that indicate a file touches enforcement-sensitive logic
  const SENSITIVE_IMPORT_PATTERNS = [
    /@\/lib\/queries\/invoicing/,
    /@\/lib\/services\/billing-permission/,
    /@\/lib\/services\/document-slot-engine/,
    /@\/lib\/services\/stage-engine/,
  ]
  const SENSITIVE_CONTENT_PATTERNS = [
    /\.from\(['"]invoices['"]/,
    /\.from\(['"]payments['"]/,
    /\.from\(['"]invoice_line_items['"]/,
    /require_document_slots_complete/,
  ]

  function collectTsFiles(dir: string): string[] {
    const results: string[] = []
    if (!existsSync(dir)) return results
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = resolve(dir, entry.name)
      if (entry.isDirectory()) {
        // Skip test directories, node_modules, .next
        if (entry.name === '__tests__' || entry.name === 'node_modules' || entry.name === '.next') {
          continue
        }
        results.push(...collectTsFiles(fullPath))
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
        // Skip test files
        if (/\.test\.(ts|tsx)$/.test(entry.name)) continue
        results.push(fullPath)
      }
    }
    return results
  }

  it('every file matching sensitive patterns is listed in the registry', () => {
    const registry = loadRegistry()
    const registryPaths = new Set(registry.surfaces.map((s) => s.path))

    // Scan source directories
    const dirs = [
      resolve(ROOT, 'app'),
      resolve(ROOT, 'components'),
      resolve(ROOT, 'lib'),
    ]
    const allFiles = dirs.flatMap((d) => collectTsFiles(d))

    const unregistered: string[] = []

    for (const fullPath of allFiles) {
      const relPath = relative(ROOT, fullPath)
      const content = readFileSync(fullPath, 'utf-8')

      const matchesImport = SENSITIVE_IMPORT_PATTERNS.some((p) => p.test(content))
      const matchesContent = SENSITIVE_CONTENT_PATTERNS.some((p) => p.test(content))

      if (matchesImport || matchesContent) {
        // Check if this file is registered
        const inRegistry = registryPaths.has(relPath) ||
          Array.from(registryPaths).some((rp) => relPath.endsWith(rp))
        if (!inRegistry) {
          unregistered.push(relPath)
        }
      }
    }

    if (unregistered.length > 0) {
      throw new Error(
        `Found ${unregistered.length} file(s) matching sensitive patterns but NOT in the registry:\n` +
        unregistered.map((f) => `  - ${f}`).join('\n') +
        '\n\nTo fix: add each file to docs/enforcement/sensitive-surfaces.json and update tests.'
      )
    }
  })

  it('registry has no stale entries (all registered files still exist)', () => {
    const registry = loadRegistry()
    const stale: string[] = []
    for (const surface of registry.surfaces) {
      if (!fileExists(surface.path)) {
        stale.push(surface.path)
      }
    }
    if (stale.length > 0) {
      throw new Error(
        `Registry contains stale entries (files no longer exist):\n  ${stale.join('\n  ')}`
      )
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 11. RLS Cannot Be Bypassed — Structural (deep assertions on migration 033)
// ═══════════════════════════════════════════════════════════════════════════

describe('Enforcement Spec – RLS Cannot Be Bypassed', () => {
  const RLS_MIGRATION = 'scripts/migrations/033-billing-rls-role-check.sql'

  it('every billing table RLS policy references has_billing_view()', () => {
    const source = readSource(RLS_MIGRATION)
    const policyBlocks = source.split(/CREATE\s+POLICY/i).slice(1)
    expect(policyBlocks.length).toBe(3)
    for (const block of policyBlocks) {
      expect(block).toContain('has_billing_view()')
    }
  })

  it('no policy block omits has_billing_view() from USING or WITH CHECK', () => {
    const source = readSource(RLS_MIGRATION)
    // Split into individual policy blocks (text between CREATE POLICY and the next semicolon)
    const policyBlocks = source.split(/CREATE\s+POLICY/i).slice(1)
    expect(policyBlocks.length).toBe(3)
    for (const block of policyBlocks) {
      // Each block should have USING and WITH CHECK, both containing has_billing_view()
      expect(block).toMatch(/USING[\s\S]*?has_billing_view\(\)/i)
      expect(block).toMatch(/WITH\s+CHECK[\s\S]*?has_billing_view\(\)/i)
    }
  })

  it('old tenant-only policies are explicitly dropped for all 3 tables', () => {
    const source = readSource(RLS_MIGRATION)
    expect(source).toContain('DROP POLICY IF EXISTS tenant_isolation_invoices')
    expect(source).toContain('DROP POLICY IF EXISTS tenant_isolation_invoice_line_items')
    expect(source).toContain('DROP POLICY IF EXISTS tenant_isolation_payments')
  })

  it('has_billing_view() checks both Admin bypass and explicit billing:view', () => {
    const source = readSource(RLS_MIGRATION)
    expect(source).toContain("v_role_name = 'Admin'")
    expect(source).toContain("'billing'")
    expect(source).toContain("'view'")
  })

  it('all policies enforce tenant isolation alongside billing:view', () => {
    const source = readSource(RLS_MIGRATION)
    expect(source).toMatch(/invoices_billing_access[\s\S]*?tenant_id/)
    expect(source).toMatch(/payments_billing_access[\s\S]*?tenant_id/)
    // invoice_line_items joins through invoices (no direct tenant_id)
    expect(source).toMatch(/invoice_line_items_billing_access[\s\S]*?invoice_id\s+IN/)
  })
})
