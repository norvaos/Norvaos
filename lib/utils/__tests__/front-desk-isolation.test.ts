/**
 * Front Desk Isolation  -  Regression Test
 *
 * Ensures the front desk console cannot access restricted surfaces,
 * bypass the action executor, or leak sensitive data.
 *
 * Run: npx vitest run lib/utils/__tests__/front-desk-isolation.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, resolve } from 'path'

const ROOT = resolve(__dirname, '../../..')

/** Recursively find all .ts and .tsx files in a directory */
function findFiles(dir: string, ext = /\.(ts|tsx)$/): string[] {
  if (!existsSync(dir)) return []

  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      files.push(...findFiles(fullPath, ext))
    } else if (entry.isFile() && ext.test(entry.name)) {
      files.push(fullPath)
    }
  }
  return files
}

/** Read file content as string */
function read(filePath: string): string {
  return readFileSync(filePath, 'utf-8')
}

const FRONT_DESK_COMPONENTS = join(ROOT, 'components/front-desk')
const FRONT_DESK_QUERIES = join(ROOT, 'lib/queries/front-desk.ts')
const FRONT_DESK_PAGES = join(ROOT, 'app/(front-desk)')

describe('Front Desk Isolation', () => {
  // ─── Rule 1: No imports from dashboard query hooks ──────────────

  it('front desk components do NOT import from lib/queries/contacts', () => {
    const files = findFiles(FRONT_DESK_COMPONENTS)
    for (const file of files) {
      const content = read(file)
      expect(content).not.toMatch(/from\s+['"]@\/lib\/queries\/contacts/i)
    }
  })

  it('front desk components do NOT import from lib/queries/leads', () => {
    const files = findFiles(FRONT_DESK_COMPONENTS)
    for (const file of files) {
      const content = read(file)
      expect(content).not.toMatch(/from\s+['"]@\/lib\/queries\/leads/i)
    }
  })

  it('front desk components do NOT import from lib/queries/matters', () => {
    const files = findFiles(FRONT_DESK_COMPONENTS)
    for (const file of files) {
      const content = read(file)
      expect(content).not.toMatch(/from\s+['"]@\/lib\/queries\/matters/i)
    }
  })

  // ─── Rule 2: No billing hook imports ──────────────────────────

  it('front desk components do NOT import billing hooks', () => {
    const files = findFiles(FRONT_DESK_COMPONENTS)
    for (const file of files) {
      const content = read(file)
      expect(content).not.toMatch(/from\s+['"]@\/lib\/queries\/billing/i)
      expect(content).not.toMatch(/from\s+['"]@\/lib\/hooks\/use-can-view-billing/i)
      expect(content).not.toMatch(/from\s+['"]@\/lib\/stripe/i)
    }
  })

  // ─── Rule 3: No createAdminClient in client components ──────────

  it('front desk components do NOT use createAdminClient', () => {
    const files = findFiles(FRONT_DESK_COMPONENTS)
    for (const file of files) {
      const content = read(file)
      expect(content).not.toMatch(/createAdminClient/)
    }
  })

  // ─── Rule 4: All mutations go through /api/actions/* ──────────

  it('front desk components only mutate via /api/actions/', () => {
    const files = findFiles(FRONT_DESK_COMPONENTS)
    for (const file of files) {
      const content = read(file)

      // Check for direct supabase writes (insert, update, delete, upsert)
      // Allow supabase reads (select, from, rpc for read-only)
      const hasDirectWrites = /\.(?:insert|update|delete|upsert)\s*\(/.test(content)
      if (hasDirectWrites) {
        // Only the query layer should do reads. Components should NOT do writes.
        const relative = file.replace(ROOT, '')
        expect(hasDirectWrites).toBe(false)
      }
    }
  })

  it('front desk page components only mutate via /api/actions/', () => {
    const files = findFiles(FRONT_DESK_PAGES)
    for (const file of files) {
      // Skip layout (it's server-side with admin client for auth)
      if (file.includes('layout.tsx')) continue

      const content = read(file)
      const hasDirectWrites = /supabase\s*\.\s*from\s*\([^)]+\)\s*\.\s*(?:insert|update|delete|upsert)/.test(content)
      if (hasDirectWrites) {
        const relative = file.replace(ROOT, '')
        throw new Error(`Page file ${relative} contains direct Supabase writes. Use /api/actions/ instead.`)
      }
    }
  })

  // ─── Rule 5: No select('*') in front desk query layer ──────────

  it('front desk query layer does NOT use select("*")', () => {
    if (!existsSync(FRONT_DESK_QUERIES)) return

    const content = read(FRONT_DESK_QUERIES)
    expect(content).not.toMatch(/\.select\s*\(\s*['"]?\*['"]?\s*[,)]/)
    // Also check for .select('*') without count
    expect(content).not.toMatch(/\.select\s*\(\s*'\*'\s*\)/)
  })

  // ─── Rule 6: Sub-pages are deleted (everything on home screen) ─

  it('no front desk sub-pages exist (consolidated to home screen)', () => {
    const subPageDirs = [
      join(ROOT, 'app/(front-desk)/front-desk/leads'),
      join(ROOT, 'app/(front-desk)/front-desk/calls'),
      join(ROOT, 'app/(front-desk)/front-desk/check-ins'),
    ]

    for (const dir of subPageDirs) {
      expect(existsSync(dir)).toBe(false)
    }
  })

  // ─── Rule 7: Header has no Leads/Check-Ins/Calls nav ──────────

  it('front desk header does not link to deleted sub-pages', () => {
    const headerFile = join(FRONT_DESK_COMPONENTS, 'front-desk-header.tsx')
    if (!existsSync(headerFile)) return

    const content = read(headerFile)
    expect(content).not.toMatch(/front-desk\/leads/)
    expect(content).not.toMatch(/front-desk\/check-ins/)
    expect(content).not.toMatch(/front-desk\/calls/)
  })

  // ─── Rule 8: All front desk actions have allowedSources ────────

  it('all front desk action files specify allowedSources', () => {
    const actionsDir = join(ROOT, 'lib/services/actions/frontdesk')
    if (!existsSync(actionsDir)) return

    const files = findFiles(actionsDir)
    expect(files.length).toBeGreaterThan(0)

    for (const file of files) {
      const content = read(file)
      expect(content).toMatch(/allowedSources/)
    }
  })

  // ─── Rule 9: Action registry has all front desk actions (17 total) ────

  it('action registry includes all 17 front desk actions', () => {
    const registryFile = join(ROOT, 'lib/services/actions/index.ts')
    const content = read(registryFile)

    const expectedActions = [
      'front_desk_note',
      'front_desk_complete_task',
      'front_desk_create_intake',
      'front_desk_book_appointment',
      'front_desk_reschedule',
      'front_desk_cancel_no_show',
      'front_desk_upload_document',
      'front_desk_create_task',
      'front_desk_request_contact_edit',
      'front_desk_notify_staff',
      'front_desk_check_in',
      'lawyer_acknowledge_checkin',
      'front_desk_log_call',
      'front_desk_log_email',
      'front_desk_log_meeting',
      'front_desk_start_shift',
      'front_desk_end_shift',
    ]

    for (const action of expectedActions) {
      expect(content).toContain(action)
    }
  })

  // ─── Rule 9b: Shift actions have correct configuration ──────

  it('shift action files use entityType "shift"', () => {
    const startShift = join(ROOT, 'lib/services/actions/frontdesk/front-desk-start-shift.ts')
    const endShift = join(ROOT, 'lib/services/actions/frontdesk/front-desk-end-shift.ts')

    for (const file of [startShift, endShift]) {
      const content = read(file)
      expect(content).toMatch(/entityType:\s*['"]shift['"]/)
      expect(content).toMatch(/allowedSources:\s*\[['"]front_desk['"]\]/)
    }
  })

  // ─── Rule 10: Route locking in dashboard layout ───────────────

  it('dashboard layout includes front desk route locking', () => {
    const layoutFile = join(ROOT, 'app/(dashboard)/layout.tsx')
    const content = read(layoutFile)

    // Should import useUserRole
    expect(content).toMatch(/useUserRole/)
    // Should check front_desk:view
    expect(content).toMatch(/front_desk/)
    // Should redirect to /front-desk
    expect(content).toMatch(/\/front-desk/)
  })

  // ─── Rule 10b: Middleware route hardening ──────────────────────

  it('middleware blocks dashboard routes for front desk users', () => {
    const middlewareFile = join(ROOT, 'lib/supabase/middleware.ts')
    const content = read(middlewareFile)

    // Should contain front desk route blocking logic
    expect(content).toMatch(/front_desk/)
    expect(content).toMatch(/\/front-desk/)
  })

  // ─── Rule 11: Action executor resolves shift_id ───────────────

  it('action executor contains shift_id resolution for front_desk source', () => {
    const executorFile = join(ROOT, 'lib/services/action-executor.ts')
    const content = read(executorFile)

    // Should look up active shift when source is front_desk
    expect(content).toMatch(/front_desk_shifts/)
    expect(content).toMatch(/resolvedShiftId/)
    expect(content).toMatch(/p_shift_id/)
  })

  // ─── Rule 12: KPI definitions file exists with 14 KPIs ────────

  it('KPI definitions file has 14 KPI definitions', () => {
    const kpiFile = join(ROOT, 'lib/services/front-desk-kpis.ts')
    const content = read(kpiFile)

    // Count KPI definitions by counting key: entries in the array
    const keyMatches = content.match(/key:\s*['"]/g)
    expect(keyMatches?.length).toBe(14)

    // Should have threshold evaluation function
    expect(content).toMatch(/evaluateThreshold/)
    expect(content).toMatch(/buildKpiValues/)
  })

  // ─── Rule 13: Admin KPI route requires admin role ──────────────

  it('admin KPI route checks for Admin role', () => {
    const adminRoute = join(ROOT, 'app/api/admin/front-desk-kpis/route.ts')
    const content = read(adminRoute)

    expect(content).toMatch(/Admin/)
    expect(content).toMatch(/403/)
  })

  // ─── Rule 14: Event logging API validates event types ─────────

  it('event logging endpoint validates event_type', () => {
    const eventsRoute = join(ROOT, 'app/api/front-desk/events/route.ts')
    const content = read(eventsRoute)

    // Should validate against known event types
    expect(content).toMatch(/queue_viewed/)
    expect(content).toMatch(/heartbeat/)
    expect(content).toMatch(/idle_gap/)
  })

  // ─── Rule 15: Migration 050 creates required tables ───────────

  it('migration 050 creates shifts and events tables', () => {
    const migrationFile = join(ROOT, 'scripts/migrations/050-front-desk-shifts-events.sql')
    const content = read(migrationFile)

    expect(content).toMatch(/CREATE TABLE.*front_desk_shifts/)
    expect(content).toMatch(/CREATE TABLE.*front_desk_events/)
    expect(content).toMatch(/shift_id.*UUID.*REFERENCES.*front_desk_shifts/)
    expect(content).toMatch(/auto_end_stale_shifts/)
    expect(content).toMatch(/execute_action_atomic/)
  })

  // ─── Rule 16: Admin KPI dashboard does not import front desk queries ──

  it('admin KPI queries are in separate file from front desk queries', () => {
    const adminQueryFile = join(ROOT, 'lib/queries/admin-kpi-queries.ts')
    const content = read(adminQueryFile)

    // Should not import useFrontDeskSearch, useFrontDeskContact, etc.
    expect(content).not.toMatch(/useFrontDeskSearch/)
    expect(content).not.toMatch(/useFrontDeskContact/)
    expect(content).not.toMatch(/useFrontDeskTimeline/)
  })
})
