/**
 * Canonical matter status definitions for NorvaOS.
 *
 * All matter queries that filter "live/normal/business matters" MUST use
 * ACTIVE_MATTER_STATUSES or VISIBLE_MATTER_STATUSES  -  never hardcode status
 * strings in query call sites.
 *
 * Source of truth for real values: lib/utils/constants.ts → MATTER_STATUSES
 * Real statuses in production: intake | active | on_hold | closed_won | closed_lost | archived
 */

/** Statuses representing live, operationally active matters. */
export const ACTIVE_MATTER_STATUSES = ['intake', 'active', 'on_hold'] as const

/**
 * All statuses that should appear in normal business views.
 * Excludes 'import_reverted'  -  reverted import artifacts must never surface
 * in business-facing UIs or reports.
 */
export const VISIBLE_MATTER_STATUSES = [
  'intake',
  'active',
  'on_hold',
  'closed_won',
  'closed_lost',
  'archived',
] as const

/** Statuses that represent completed/resolved matters for reporting. */
export const CLOSED_MATTER_STATUSES = ['closed_won', 'closed_lost'] as const

/**
 * The status applied when an imported matter is rolled back.
 * This value must NOT appear in any business view, report, or active-matter query.
 */
export const IMPORT_REVERTED_STATUS = 'import_reverted' as const

/**
 * Returns true if a matter status represents a real business matter  - 
 * not an import artifact or reverted record.
 */
export function isBusinessMatter(status: string): boolean {
  return (VISIBLE_MATTER_STATUSES as readonly string[]).includes(status)
}

/**
 * Returns true if a matter was rolled back from an import batch.
 */
export function isImportReverted(status: string): boolean {
  return status === IMPORT_REVERTED_STATUS
}
