/**
 * Permission wiring smoke tests.
 *
 * Static analysis guards that verify every known permission-gated surface
 * still imports and uses RequirePermission. This catches the most common
 * regression: someone removes the wrapper and forgets to re-add it.
 *
 * Also verifies the server-side API route contains the 403 denial path
 * so the server guard can't silently disappear.
 *
 * Section 2 ("Automated billing surface detection") scans app/ and
 * components/ for ANY .tsx file that imports from lib/queries/invoicing and
 * asserts that each file either:
 *   a) contains <RequirePermission entity="billing" …> itself, OR
 *   b) is on an explicit allowlist of files known to be rendered inside an
 *      ancestor RequirePermission boundary.
 *
 * Section 3 ("Direct Supabase billing query detection") scans ALL .ts/.tsx
 * files for raw .from('invoices'), .from('invoice_line_items'), or
 * .from('payments') calls. Each file must be either:
 *   a) A centralised query/hook file (allowlisted) consumed only through
 *      UI surfaces wrapped in RequirePermission, OR
 *   b) An API route with a server-side billing:view check (contains '403'
 *      and 'billing:view'), OR
 *   c) A test file (__tests__/).
 *
 * This means a developer can never add a new billing surface that slips
 * past the permission gate without either wrapping it properly or
 * deliberately adding it to the allowlist (which requires review).
 *
 * These tests read the actual source files  -  no mocking, no rendering.
 * They're cheap and run in < 10ms.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { resolve, relative } from 'path'

const ROOT = resolve(__dirname, '../../..')

function readSource(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), 'utf-8')
}

// ── Gated Surfaces  -  loaded from canonical JSON registry ─────────────────────
//
// The single source of truth is docs/enforcement/sensitive-surfaces.json.
// No duplicate lists. The registry entries that have gate_entity + gate_action
// + required_controls including "RequirePermission" or "server-403" are used
// for Section 1 wiring assertions.

interface RegistrySurface {
  path: string
  category: string
  reason: string
  required_controls: string[]
  gate_entity?: string
  gate_action?: string
}

interface Registry {
  version: string
  surfaces: RegistrySurface[]
}

function loadRegistry(): Registry {
  const regPath = resolve(ROOT, 'docs/enforcement/sensitive-surfaces.json')
  if (!existsSync(regPath)) {
    throw new Error('sensitive-surfaces.json not found  -  run "Create registry" first')
  }
  return JSON.parse(readFileSync(regPath, 'utf-8')) as Registry
}

const REGISTRY = loadRegistry()

// Derive GATED_SURFACES from registry entries that have gate info
const GATED_SURFACES = REGISTRY.surfaces
  .filter((s) => s.gate_entity && s.gate_action)
  .map((s) => ({
    name: `${s.path} (${s.reason})`,
    file: s.path,
    entity: s.gate_entity!,
    action: s.gate_action!,
    type: s.required_controls.includes('server-403')
      ? ('server-403' as const)
      : ('RequirePermission' as const),
  }))

// ── Section 1: Gated Surface Wiring Tests (derived from JSON registry) ──────

describe('Permission wiring – static analysis smoke tests', () => {
  for (const surface of GATED_SURFACES) {
    describe(surface.name, () => {
      const source = readSource(surface.file)

      if (surface.type === 'RequirePermission') {
        it(`imports RequirePermission`, () => {
          expect(source).toContain("import { RequirePermission }")
        })

        it(`wraps content with <RequirePermission entity="${surface.entity}" action="${surface.action}">`, () => {
          expect(source).toContain(`entity="${surface.entity}"`)
          expect(source).toContain(`action="${surface.action}"`)
          expect(source).toMatch(/<RequirePermission\s/)
        })
      }

      if (surface.type === 'server-403') {
        it('returns 403 with billing:view error message', () => {
          expect(source).toContain('403')
          expect(source).toContain('billing:view')
        })

        it('logs a denied audit event', () => {
          expect(source).toContain('invoice_pdf_download_denied')
          expect(source).toContain('logAuditServer')
        })
      }
    })
  }

  it('has at least 6 gated surfaces from registry', () => {
    expect(GATED_SURFACES.length).toBeGreaterThanOrEqual(6)
  })

  it('registry is the single source (no hardcoded surface list in this file)', () => {
    // This test documents that GATED_SURFACES is derived from JSON
    expect(REGISTRY.surfaces.length).toBeGreaterThanOrEqual(20)
  })
})

// ── Section 2: Automated Billing Surface Detection ───────────────────────────
//
// Scans the codebase for .tsx files that import from lib/queries/invoicing
// and ensures each one is either:
//   1. Self-guarded  -  the file contains <RequirePermission entity="billing"
//   2. Allowlisted   -  the file is rendered only inside an ancestor that
//      already has RequirePermission (verified by humans during PR review)
//
// If a NEW file imports billing hooks and is NOT in either bucket, the test
// fails with a clear message telling the developer what to do.

// ── Allowlist ────────────────────────────────────────────────────────────────
//
// Files listed here import from lib/queries/invoicing but do NOT need their
// own <RequirePermission entity="billing"> because a PARENT component in the
// render tree already gates them.
//
// RULES FOR ADDING TO THIS LIST:
//   1. You MUST add a comment explaining which ancestor provides the gate.
//   2. The allowlist max-count assertion (below) must be bumped when you add
//      an entry  -  this forces the addition to be deliberate and reviewable.
//   3. Prefer wrapping the file itself over adding to this list.

const BILLING_HOOK_ALLOWLIST: Record<string, string> = {
  // These time-tracking child components are rendered exclusively inside
  // app/(dashboard)/time-tracking/page.tsx which wraps its entire render
  // tree with <RequirePermission entity="billing" action="view">.
  'components/time-tracking/time-entry-form.tsx': 'Parent gate: app/(dashboard)/time-tracking/page.tsx',
  'components/time-tracking/time-entry-table.tsx': 'Parent gate: app/(dashboard)/time-tracking/page.tsx',
  'components/time-tracking/timer-widget.tsx': 'Parent gate: app/(dashboard)/time-tracking/page.tsx',
  // BillingTab is rendered exclusively inside app/(dashboard)/matters/[id]/page.tsx
  // which wraps the billing tab content with <RequirePermission entity="billing" action="view">.
  'components/matters/tabs/billing-tab.tsx': 'Parent gate: app/(dashboard)/matters/[id]/page.tsx',
  // BillingTab (shell) is rendered exclusively inside workspace pages
  // (app/(dashboard)/workspace/billing, /client, /partner) which are
  // wrapped in <RequirePermission entity="billing" action="view">.
  'components/shell/tabs/BillingTab.tsx': 'Parent gate: app/(dashboard)/workspace/* pages with RequirePermission',
}

// If this number needs to increase, you are adding a billing surface that
// is NOT self-guarded. Make sure a parent RequirePermission covers it, then
// bump this cap and add the file + justification to BILLING_HOOK_ALLOWLIST.
const BILLING_ALLOWLIST_MAX_COUNT = 5

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Recursively collect file paths under `dir`, relative to ROOT. */
function collectFiles(dir: string, extensions: string[]): string[] {
  const results: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return results
  }
  for (const entry of entries) {
    // Skip common non-source directories for speed
    if (entry === 'node_modules' || entry === '.next' || entry === '.git') continue
    const full = resolve(dir, entry)
    let stat
    try {
      stat = statSync(full)
    } catch {
      continue
    }
    if (stat.isDirectory()) {
      results.push(...collectFiles(full, extensions))
    } else if (extensions.some((ext) => entry.endsWith(ext))) {
      results.push(relative(ROOT, full))
    }
  }
  return results
}

function collectTsxFiles(dir: string): string[] {
  return collectFiles(dir, ['.tsx'])
}

/** Regex that matches import statements pulling from lib/queries/invoicing. */
const INVOICING_IMPORT_RE =
  /from\s+['"]@?\/?lib\/queries\/invoicing['"]/

/** Regex that matches <RequirePermission with entity="billing". */
const REQUIRE_PERMISSION_BILLING_RE =
  /<RequirePermission[\s\S]*?entity=["']billing["']/

function fileImportsBillingHooks(source: string): boolean {
  return INVOICING_IMPORT_RE.test(source)
}

function fileHasBillingPermissionGate(source: string): boolean {
  return REQUIRE_PERMISSION_BILLING_RE.test(source)
}

// ── Automated Detection Tests ────────────────────────────────────────────────

describe('Automated billing surface detection', () => {
  // Collect every .tsx file from app/ and components/
  const scanDirs = [resolve(ROOT, 'app'), resolve(ROOT, 'components')]
  const allTsxFiles = scanDirs.flatMap((d) => collectTsxFiles(d))

  // Find files that import billing hooks
  const billingFiles: { relPath: string; source: string }[] = []
  for (const relPath of allTsxFiles) {
    const source = readSource(relPath)
    if (fileImportsBillingHooks(source)) {
      billingFiles.push({ relPath, source })
    }
  }

  it('finds at least one billing surface (sanity check)', () => {
    // If this fails the scanner is broken  -  we know billing pages exist
    expect(billingFiles.length).toBeGreaterThanOrEqual(1)
  })

  // Per-file assertions
  for (const { relPath, source } of billingFiles) {
    const isAllowlisted = relPath in BILLING_HOOK_ALLOWLIST

    if (isAllowlisted) {
      // Allowlisted files: just confirm they're still importing billing hooks
      // (if the import is removed, the allowlist entry is stale)
      it(`[allowlisted] ${relPath} still imports billing hooks`, () => {
        expect(fileImportsBillingHooks(source)).toBe(true)
      })
    } else {
      // Non-allowlisted files MUST have their own RequirePermission gate
      it(`${relPath} has <RequirePermission entity="billing"> or is allowlisted`, () => {
        const hasSelfGate = fileHasBillingPermissionGate(source)
        if (!hasSelfGate) {
          // Provide an actionable failure message
          throw new Error(
            `\n` +
            `  UNGATED BILLING SURFACE DETECTED\n` +
            `  File: ${relPath}\n` +
            `\n` +
            `  This file imports from lib/queries/invoicing but does NOT\n` +
            `  contain <RequirePermission entity="billing">.\n` +
            `\n` +
            `  To fix, either:\n` +
            `    1. Wrap the billing UI in this file with:\n` +
            `       <RequirePermission entity="billing" action="view">\n` +
            `         ...billing content...\n` +
            `       </RequirePermission>\n` +
            `    2. If a PARENT component already provides the gate, add\n` +
            `       this file to BILLING_HOOK_ALLOWLIST in:\n` +
            `       lib/utils/__tests__/permission-wiring.test.ts\n` +
            `       with a comment explaining which ancestor guards it,\n` +
            `       and bump BILLING_ALLOWLIST_MAX_COUNT.\n`
          )
        }
      })
    }
  }

  // Guard against allowlist sprawl
  it(`allowlist has at most ${BILLING_ALLOWLIST_MAX_COUNT} entries (prevent sprawl)`, () => {
    const count = Object.keys(BILLING_HOOK_ALLOWLIST).length
    expect(count).toBeLessThanOrEqual(BILLING_ALLOWLIST_MAX_COUNT)
  })

  // Detect stale allowlist entries (file no longer imports billing hooks)
  for (const [allowedPath, reason] of Object.entries(BILLING_HOOK_ALLOWLIST)) {
    it(`allowlisted file "${allowedPath}" still exists and imports billing hooks`, () => {
      let source: string
      try {
        source = readSource(allowedPath)
      } catch {
        throw new Error(
          `Stale allowlist entry: "${allowedPath}" does not exist.\n` +
          `Reason was: ${reason}\n` +
          `Remove it from BILLING_HOOK_ALLOWLIST.`
        )
      }
      if (!fileImportsBillingHooks(source)) {
        throw new Error(
          `Stale allowlist entry: "${allowedPath}" no longer imports billing hooks.\n` +
          `Reason was: ${reason}\n` +
          `Remove it from BILLING_HOOK_ALLOWLIST.`
        )
      }
    })
  }
})

// ── Section 3: Direct Supabase Billing Query Detection ────────────────────
//
// Catches the deeper threat: someone bypasses the hook layer entirely and
// writes a raw `.from('invoices')` query in a new file. Every file that
// contains a direct Supabase query against invoices, invoice_line_items,
// or payments must be EITHER:
//
//   a) A centralised hook/query file (allowlisted)  -  consumed only through
//      UI surfaces already wrapped in RequirePermission.
//   b) An API route with a server-side billing:view check (must contain
//      both '403' and 'billing:view').
//   c) A test file (under __tests__/).
//
// If none of the above, the test fails with an actionable error.

/** Regex matching .from('invoices'), .from('invoice_line_items'), .from('payments') */
const DIRECT_BILLING_QUERY_RE =
  /\.from\(\s*['"](?:invoices|invoice_line_items|payments)['"]\s*\)/

// ── Direct Query Allowlist ────────────────────────────────────────────────
//
// Files listed here contain direct .from() calls against billing tables
// and are confirmed safe because they are ONLY consumed through guarded
// UI surfaces (RequirePermission) or server-side checked API routes.
//
// RULES:
//   1. Add a comment explaining WHY the file is safe.
//   2. Bump DIRECT_QUERY_ALLOWLIST_MAX_COUNT when adding entries.
//   3. Prefer centralising queries in lib/queries/invoicing.ts.

const DIRECT_QUERY_ALLOWLIST: Record<string, string> = {
  // Central billing hook file. All hooks are consumed by UI components
  // that are wrapped in <RequirePermission entity="billing">.
  // Additionally, RLS policies on invoices/invoice_line_items/payments
  // enforce has_billing_view() at the database level (migration 033).
  'lib/queries/invoicing.ts':
    'Central billing hooks  -  consumed only by RequirePermission-gated UI surfaces + RLS enforced',
  // Workspace pages  -  these pages are themselves wrapped in RequirePermission.
  // Direct queries are used for workspace-scoped summaries.
  'app/(dashboard)/workspace/billing/page.tsx':
    'Workspace billing page  -  self-gated via RequirePermission wrapper on the page',
  'app/(dashboard)/workspace/client/page.tsx':
    'Workspace client page  -  self-gated via RequirePermission wrapper on the page',
  'app/(dashboard)/workspace/partner/page.tsx':
    'Workspace partner page  -  self-gated via RequirePermission wrapper on the page',
  // Client portal page  -  protected by portal token auth (validatePortalToken),
  // not by internal RequirePermission (portal users are unauthenticated staff users).
  'app/portal/[token]/page.tsx':
    'Client portal  -  protected by validatePortalToken (portal-token-auth model)',
  // Shell BillingTab  -  parent-gated by workspace pages with RequirePermission.
  'components/shell/tabs/BillingTab.tsx':
    'Shell BillingTab  -  parent-gated by workspace pages with RequirePermission',
  // Service layer files  -  consumed exclusively by server-side API routes that
  // enforce billing:view or alternative auth (CRON_SECRET / portal token).
  'lib/services/analytics/analytics-service.ts':
    'Analytics service  -  server-side only, consumed by cron snapshot-revenue (CRON_SECRET) and gated analytics UI',
  'lib/services/analytics/collections-service.ts':
    'Collections analytics service  -  server-side only, consumed by gated analytics surfaces',
  'lib/services/billing/discount.service.ts':
    'Discount service  -  server-side only, consumed by billing API routes with checkBillingPermission',
  'lib/services/billing/invoice-state.service.ts':
    'Invoice state service  -  server-side only, consumed by billing API routes with checkBillingPermission',
  'lib/services/billing/payment-allocation.service.ts':
    'Payment allocation service  -  server-side only, consumed by billing API routes with checkBillingPermission',
  'lib/services/billing/payment-plan.service.ts':
    'Payment plan service  -  server-side only, consumed by billing API routes with checkBillingPermission',
  'lib/services/billing/trust-application.service.ts':
    'Trust application service  -  server-side only, consumed by billing API routes with checkBillingPermission',
  'lib/services/esign-service.ts':
    'E-sign service  -  server-side only, consumed by gated command routes (requirePermission)',
  'lib/services/invoice-email-service.ts':
    'Invoice email service  -  server-side only, consumed by billing API routes with checkBillingPermission',
  'lib/services/lead-conversion-executor.ts':
    'Lead conversion executor  -  server-side only, consumed by convert-and-retain command route (requirePermission matters:create)',
  // These API routes are protected by alternative auth mechanisms, not billing:view.
  // Cron routes: protected by CRON_SECRET (fail-closed  -  returns 500 if unset).
  'app/api/cron/aging-recalculation/route.ts':
    'Cron route  -  protected by CRON_SECRET, operates cross-tenant with admin client',
  'app/api/cron/invoice-reminders/route.ts':
    'Cron route  -  protected by CRON_SECRET, sends invoice reminders cross-tenant',
  'app/api/cron/overdue-detection/route.ts':
    'Cron route  -  protected by CRON_SECRET, marks overdue invoices cross-tenant',
  'app/api/cron/snapshot-revenue/route.ts':
    'Cron route  -  protected by CRON_SECRET, snapshots revenue metrics cross-tenant',
  'app/api/cron/update-invoice-aging/route.ts':
    'Cron route  -  protected by CRON_SECRET, updates aging fields cross-tenant',
  // Portal routes: protected by validatePortalToken (portal-token-auth model).
  'app/api/portal/[token]/billing/mark-sent/route.ts':
    'Portal route  -  protected by validatePortalToken, no internal user billing:view needed',
  'app/api/portal/[token]/billing/route.ts':
    'Portal route  -  protected by validatePortalToken, no internal user billing:view needed',
  'app/api/portal/[token]/summary/route.ts':
    'Portal route  -  protected by validatePortalToken, no internal user billing:view needed',
  // Command route: protected by requirePermission (matters:create).
  'app/api/command/convert-and-retain/route.ts':
    'Command route  -  protected by requirePermission(matters:create); billing queries via lead-conversion-executor',
  // Contact statement: protected by server-side auth (authenticateRequest).
  'app/api/contacts/[id]/statement/route.ts':
    'Statement API  -  protected by authenticateRequest + billing query scoped to contact',
}

// Cap prevents silent sprawl. To increase, add a justification to the
// allowlist entry AND bump this number. This forces PR review.
const DIRECT_QUERY_ALLOWLIST_MAX_COUNT = 27

describe('Direct Supabase billing query detection', () => {
  // Scan ALL .ts and .tsx files under app/, components/, lib/
  const scanDirs = [
    resolve(ROOT, 'app'),
    resolve(ROOT, 'components'),
    resolve(ROOT, 'lib'),
  ]
  const allSourceFiles = scanDirs.flatMap((d) => collectFiles(d, ['.ts', '.tsx']))

  // Find files containing direct billing table queries
  const directQueryFiles: { relPath: string; source: string }[] = []
  for (const relPath of allSourceFiles) {
    // Skip test files  -  they're allowed to query anything for testing
    if (relPath.includes('__tests__')) continue
    const source = readSource(relPath)
    if (DIRECT_BILLING_QUERY_RE.test(source)) {
      directQueryFiles.push({ relPath, source })
    }
  }

  it('finds at least one file with direct billing queries (sanity check)', () => {
    // We know lib/queries/invoicing.ts exists
    expect(directQueryFiles.length).toBeGreaterThanOrEqual(1)
  })

  // Per-file assertions
  for (const { relPath, source } of directQueryFiles) {
    const isAllowlisted = relPath in DIRECT_QUERY_ALLOWLIST
    const isApiRoute = relPath.startsWith('app/api/') && relPath.endsWith('route.ts')

    if (isAllowlisted) {
      it(`[allowlisted] ${relPath} still contains direct billing queries`, () => {
        expect(DIRECT_BILLING_QUERY_RE.test(source)).toBe(true)
      })
    } else if (isApiRoute) {
      // API routes must have their own server-side billing:view check
      it(`${relPath} has server-side billing:view check with 403`, () => {
        const has403 = source.includes('403')
        const hasBillingView = source.includes('billing:view')
        if (!has403 || !hasBillingView) {
          throw new Error(
            `\n` +
            `  UNGUARDED API ROUTE WITH BILLING QUERIES\n` +
            `  File: ${relPath}\n` +
            `\n` +
            `  This API route queries invoices/invoice_line_items/payments\n` +
            `  but does NOT contain a server-side billing:view permission\n` +
            `  check that returns 403.\n` +
            `\n` +
            `  To fix, add a billing:view permission check that returns\n` +
            `  a 403 response when denied. See:\n` +
            `    app/api/invoices/[id]/pdf/route.ts (checkBillingPermission)\n`
          )
        }
      })
    } else {
      // Neither allowlisted nor an API route  -  this is a raw billing query
      // in an unexpected location
      it(`${relPath} must not contain direct billing table queries`, () => {
        throw new Error(
          `\n` +
          `  DIRECT BILLING TABLE QUERY IN UNEXPECTED FILE\n` +
          `  File: ${relPath}\n` +
          `\n` +
          `  This file contains .from('invoices'), .from('invoice_line_items'),\n` +
          `  or .from('payments') but is NOT:\n` +
          `    - An allowlisted central query file\n` +
          `    - An API route with a billing:view server check\n` +
          `    - A test file\n` +
          `\n` +
          `  To fix, either:\n` +
          `    1. Move the query into lib/queries/invoicing.ts and use the\n` +
          `       hook from a RequirePermission-gated component.\n` +
          `    2. If this is an API route, add a billing:view permission\n` +
          `       check that returns 403 when denied.\n` +
          `    3. If intentional, add to DIRECT_QUERY_ALLOWLIST in:\n` +
          `       lib/utils/__tests__/permission-wiring.test.ts\n` +
          `       and bump DIRECT_QUERY_ALLOWLIST_MAX_COUNT.\n`
        )
      })
    }
  }

  // Guard against allowlist sprawl
  it(`direct query allowlist has at most ${DIRECT_QUERY_ALLOWLIST_MAX_COUNT} entries`, () => {
    const count = Object.keys(DIRECT_QUERY_ALLOWLIST).length
    expect(count).toBeLessThanOrEqual(DIRECT_QUERY_ALLOWLIST_MAX_COUNT)
  })

  // Detect stale allowlist entries
  for (const [allowedPath, reason] of Object.entries(DIRECT_QUERY_ALLOWLIST)) {
    it(`allowlisted file "${allowedPath}" still contains direct billing queries`, () => {
      let source: string
      try {
        source = readSource(allowedPath)
      } catch {
        throw new Error(
          `Stale allowlist entry: "${allowedPath}" does not exist.\n` +
          `Reason was: ${reason}\n` +
          `Remove it from DIRECT_QUERY_ALLOWLIST.`
        )
      }
      if (!DIRECT_BILLING_QUERY_RE.test(source)) {
        throw new Error(
          `Stale allowlist entry: "${allowedPath}" no longer contains billing queries.\n` +
          `Reason was: ${reason}\n` +
          `Remove it from DIRECT_QUERY_ALLOWLIST.`
        )
      }
    })
  }
})

// ── Section 4: Financial Field Rendering Detection ───────────────────────────
//
// Catches financial values (revenue, billed, paid, trust balance, etc.) being
// rendered in UI components or exported to CSV without a billing:view gate.
//
// Scans .tsx files in app/ and components/ for financial patterns (field names,
// revenue hooks, etc.) and verifies each file is either:
//   a) In the FINANCIAL_RENDER_ALLOWLIST (with a match-count cap), OR
//   b) Contains <RequirePermission entity="billing" …> self-gate
//
// This prevents adding a "Total Billed" InfoRow or revenue chart to any page
// without an accompanying billing:view permission check.

/** Patterns that indicate financial data rendering or querying */
const FINANCIAL_FIELD_PATTERNS = [
  /totalBilledInPeriod/,
  /total_billed/,
  /total_paid/,
  /trust_balance/,
  /useReportRevenueByPracticeArea/,
  /useReportRevenueByBillingType/,
  /useReportRevenueTrend/,
]

// ── Financial Render Allowlist ─────────────────────────────────────────────
//
// Files listed here are CONFIRMED to render financial data safely:
//   - Either wrapped in RequirePermission themselves, or
//   - A query/hook layer (not a UI surface)
//   - A utility (e.g. CSV export schemas)
//
// Value = max allowed match count across all FINANCIAL_FIELD_PATTERNS.
// If a file exceeds its cap, the test fails  -  forcing review.

const FINANCIAL_RENDER_ALLOWLIST: Record<string, { maxMatches: number; reason: string }> = {
  // Reports page: Revenue KPI conditionally rendered (canViewBilling),
  // RevenueSection child wrapped in RequirePermission, export strips financial field
  'app/(dashboard)/reports/page.tsx': {
    maxMatches: 14,
    reason: 'Revenue gated by RequirePermission + canViewBilling conditional rendering',
  },
  // Matter detail: sidebar financial rows wrapped in RequirePermission,
  // BillingTab wrapped in RequirePermission, BillingTab content also uses these fields
  'app/(dashboard)/matters/[id]/page.tsx': {
    maxMatches: 15,
    reason: 'Sidebar financial card + BillingTab both wrapped in RequirePermission',
  },
  // RetainerBuilder: entire component wrapped in RequirePermission
  'components/command-centre/panels/retainer-builder.tsx': {
    maxMatches: 6,
    reason: 'Wrapped in RequirePermission at component root',
  },
  // Query layer  -  not a UI surface
  'lib/queries/reports.ts': {
    maxMatches: 25,
    reason: 'Query/hook layer  -  consumed only by gated UI components',
  },
  // Query layer  -  not a UI surface
  'lib/queries/invoicing.ts': {
    maxMatches: 15,
    reason: 'Query/hook layer  -  consumed only by gated UI components + RLS enforced',
  },
  // CSV export column schemas  -  utility, not a UI surface
  'lib/utils/csv-export.ts': {
    maxMatches: 5,
    reason: 'Export utility  -  invoked only from gated report surfaces',
  },
  // TypeScript type definitions  -  not a UI surface, just field type declarations
  'lib/types/database.ts': {
    maxMatches: 17,
    reason: 'Type definitions only  -  Row/Insert/Update interfaces for billing tables',
  },
  // BillingTab: child component of matter detail page, parent-gated by
  // RequirePermission in app/(dashboard)/matters/[id]/page.tsx
  'components/matters/tabs/billing-tab.tsx': {
    maxMatches: 10,
    reason: 'Parent-gated by RequirePermission in matter detail page',
  },
  // Trust compliance analytics page  -  wrapped in RequirePermission (billing:view)
  'app/(dashboard)/analytics/trust-compliance/page.tsx': {
    maxMatches: 5,
    reason: 'Trust compliance page  -  self-gated via RequirePermission entity="billing"',
  },
  // API routes  -  server-side only, protected by alternative auth mechanisms
  'app/api/command/record-retainer-payment/route.ts': {
    maxMatches: 3,
    reason: 'Command route  -  protected by requirePermission; financial fields used for payment recording',
  },
  'app/api/contacts/[id]/statement/route.ts': {
    maxMatches: 5,
    reason: 'Statement API  -  protected by authenticateRequest; financial fields in statement output',
  },
  'app/api/cron/snapshot-revenue/route.ts': {
    maxMatches: 5,
    reason: 'Cron route  -  protected by CRON_SECRET; financial fields used for revenue snapshot',
  },
  'app/api/matters/[id]/retainer-summary/route.ts': {
    maxMatches: 3,
    reason: 'Retainer summary API  -  protected by authenticateRequest; financial summary fields',
  },
  'app/api/portal/[token]/trust/route.ts': {
    maxMatches: 5,
    reason: 'Portal trust route  -  protected by validatePortalToken; financial fields for trust display',
  },
  // UI components parent-gated by RequirePermission in ancestor pages
  'components/matters/tabs/trust-tab.tsx': {
    maxMatches: 5,
    reason: 'Trust tab  -  parent-gated by RequirePermission in matter detail page',
  },
  'components/shell/ZoneC.tsx': {
    maxMatches: 6,
    reason: 'Shell ZoneC  -  parent-gated by workspace pages with RequirePermission',
  },
  'components/shell/tabs/BillingTab.tsx': {
    maxMatches: 8,
    reason: 'Shell BillingTab  -  parent-gated by workspace pages with RequirePermission',
  },
  // Service layer files  -  server-side only, consumed by gated API routes
  'lib/services/analytics/analytics-service.ts': {
    maxMatches: 6,
    reason: 'Analytics service  -  server-side only, consumed by cron (CRON_SECRET) and gated UI',
  },
  'lib/services/analytics/collections-service.ts': {
    maxMatches: 9,
    reason: 'Collections service  -  server-side only, consumed by gated analytics surfaces',
  },
  'lib/services/billing/trust-application.service.ts': {
    maxMatches: 6,
    reason: 'Trust application service  -  server-side only, consumed by billing API routes with checkBillingPermission',
  },
  'lib/services/document-engine/instance-service.ts': {
    maxMatches: 3,
    reason: 'Document engine instance service  -  server-side only, financial fields in document template context',
  },
  'lib/services/document-engine/seed-templates.ts': {
    maxMatches: 8,
    reason: 'Document seed templates  -  server-side only, financial field names in template definitions',
  },
  // Partner pulse analytics pages  -  self-gated via RequirePermission entity="analytics"
  'app/(dashboard)/analytics/partner-pulse/page.tsx': {
    maxMatches: 5,
    reason: 'Partner pulse page  -  self-gated via RequirePermission entity="analytics"; financial KPIs',
  },
  'app/(dashboard)/analytics/partner-pulse/charts/revenue-by-pa-chart.tsx': {
    maxMatches: 2,
    reason: 'Revenue chart  -  parent-gated by partner-pulse page with RequirePermission',
  },
  // API routes  -  server-side only, protected by authenticateRequest + billing:view or server auth
  'app/api/analytics/conversion/route.ts': {
    maxMatches: 10,
    reason: 'Conversion analytics API  -  protected by authenticateRequest; financial fields in conversion metrics',
  },
  'app/api/matters/[id]/close/route.ts': {
    maxMatches: 2,
    reason: 'Matter close API  -  protected by authenticateRequest; trust_balance snapshot at close',
  },
  'app/api/matters/[id]/export-audit/route.ts': {
    maxMatches: 2,
    reason: 'Export audit API  -  protected by authenticateRequest; trust_balance in audit export',
  },
  'app/api/matters/[id]/financial-clearance/route.ts': {
    maxMatches: 3,
    reason: 'Financial clearance API  -  protected by authenticateRequest; billing fields for clearance check',
  },
  'app/api/matters/[id]/government-disbursement/route.ts': {
    maxMatches: 4,
    reason: 'Government disbursement API  -  protected by authenticateRequest; trust_balance for disbursement',
  },
  // UI components parent-gated by RequirePermission or conditional billing guards
  'components/dashboard/glass-fortress-matrix.tsx': {
    maxMatches: 3,
    reason: 'Glass fortress matrix  -  parent-gated by dashboard with conditional billing rendering',
  },
  'components/layout/header.tsx': {
    maxMatches: 3,
    reason: 'Header  -  trust_balance displayed conditionally based on billing permission context',
  },
  'components/matters/sovereign-seal.tsx': {
    maxMatches: 2,
    reason: 'Sovereign seal  -  parent-gated by matter detail shell; trust_balance in seal display',
  },
  'components/trust/government-disbursement-card.tsx': {
    maxMatches: 3,
    reason: 'Government disbursement card  -  parent-gated by matter detail trust tab with RequirePermission',
  },
  // Service layer files  -  server-side only, consumed by gated API routes or import pipelines
  'lib/services/clio/fetchers/trust-balances.ts': {
    maxMatches: 7,
    reason: 'Clio trust balance fetcher  -  server-side import service, not user-facing',
  },
  'lib/services/import/adapters/clio/trust-balances.ts': {
    maxMatches: 2,
    reason: 'Clio import adapter  -  server-side import pipeline, not user-facing',
  },
  'lib/services/trust-accounting/trust-reconciler.ts': {
    maxMatches: 8,
    reason: 'Trust reconciler  -  server-side reconciliation service, not user-facing',
  },
}

const FINANCIAL_ALLOWLIST_MAX_COUNT = 38

describe('Financial field rendering detection', () => {
  // Scan .tsx and .ts files in app/, components/, lib/
  const scanDirs = [
    resolve(ROOT, 'app'),
    resolve(ROOT, 'components'),
    resolve(ROOT, 'lib'),
  ]
  const allFiles = scanDirs.flatMap((d) => collectFiles(d, ['.ts', '.tsx']))

  // Find files containing financial field patterns
  const financialFiles: { relPath: string; source: string; matchCount: number }[] = []
  for (const relPath of allFiles) {
    // Skip test files
    if (relPath.includes('__tests__')) continue
    const source = readSource(relPath)
    let matchCount = 0
    for (const pattern of FINANCIAL_FIELD_PATTERNS) {
      const matches = source.match(new RegExp(pattern.source, 'g'))
      if (matches) matchCount += matches.length
    }
    if (matchCount > 0) {
      financialFiles.push({ relPath, source, matchCount })
    }
  }

  it('finds at least one file with financial field patterns (sanity check)', () => {
    expect(financialFiles.length).toBeGreaterThanOrEqual(1)
  })

  // Per-file assertions
  for (const { relPath, source, matchCount } of financialFiles) {
    const allowEntry = FINANCIAL_RENDER_ALLOWLIST[relPath]
    const isAllowlisted = !!allowEntry
    const isSelfGuarded = REQUIRE_PERMISSION_BILLING_RE.test(source)
    const isQueryLayer = relPath.startsWith('lib/queries/') || relPath.startsWith('lib/utils/')

    if (isAllowlisted) {
      it(`[allowlisted] ${relPath} has ≤${allowEntry.maxMatches} financial field matches (found ${matchCount})`, () => {
        if (matchCount > allowEntry.maxMatches) {
          throw new Error(
            `\n` +
            `  FINANCIAL FIELD COUNT EXCEEDED CAP\n` +
            `  File: ${relPath}\n` +
            `  Found: ${matchCount} matches, max allowed: ${allowEntry.maxMatches}\n` +
            `  Reason for allowlist: ${allowEntry.reason}\n` +
            `\n` +
            `  If this is intentional, bump maxMatches in\n` +
            `  FINANCIAL_RENDER_ALLOWLIST in permission-wiring.test.ts.\n`
          )
        }
      })
    } else if (isSelfGuarded || isQueryLayer) {
      // File either has its own RequirePermission gate or is a non-UI query layer
      it(`${relPath} is self-guarded or a query/utility layer (${matchCount} financial matches)`, () => {
        // Pass  -  the file is safe
        expect(true).toBe(true)
      })
    } else {
      // Unexpected file with financial data  -  fail
      it(`${relPath} must not render financial data without billing:view gate`, () => {
        throw new Error(
          `\n` +
          `  UNGATED FINANCIAL DATA DETECTED\n` +
          `  File: ${relPath}\n` +
          `  Financial field matches: ${matchCount}\n` +
          `\n` +
          `  This file references financial fields (total_billed, total_paid,\n` +
          `  trust_balance, revenue hooks, etc.) but does NOT contain\n` +
          `  <RequirePermission entity="billing"> and is not in the allowlist.\n` +
          `\n` +
          `  To fix, either:\n` +
          `    1. Wrap the financial UI with <RequirePermission entity="billing">\n` +
          `    2. Add to FINANCIAL_RENDER_ALLOWLIST with justification\n` +
          `       in permission-wiring.test.ts\n`
        )
      })
    }
  }

  // Guard against allowlist sprawl
  it(`financial render allowlist has at most ${FINANCIAL_ALLOWLIST_MAX_COUNT} entries`, () => {
    const count = Object.keys(FINANCIAL_RENDER_ALLOWLIST).length
    expect(count).toBeLessThanOrEqual(FINANCIAL_ALLOWLIST_MAX_COUNT)
  })
})
