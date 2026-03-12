// ============================================================================
// Date-Split Detector — Group fragmented Year/Month/Day fields into unified dates
// ============================================================================
// IRCC XFA forms split date fields into separate Year/Month/Day inputs.
// This module detects those groups so the upload/rescan/backfill pipeline can:
//   1. Set `date_split` on each component field (year/month/day)
//   2. Assign a shared `profile_path` for the unified date value
//   3. Mark month/day fields as `is_client_visible: false`
//   4. Mark the year field as `field_type: 'date'`
// The questionnaire then renders one DatePicker per group.
// The existing xfa-filler-db.ts handles splitting YYYY-MM-DD back for PDF fill.
// ============================================================================

import { deriveClientLabel } from '@/lib/ircc/xfa-label-utils'
import type { DateSplitPart, IrccFieldType } from '@/lib/types/ircc-forms'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DateGroup {
  /** Common XFA path prefix, e.g. "Part1.SponsorResidency.q1.From" */
  baseXfaPath: string
  /** Index of the year field in the original fields array */
  yearFieldIdx: number
  /** Index of the month field */
  monthFieldIdx: number
  /** Index of the day field (undefined if the form only has Yr+MM) */
  dayFieldIdx?: number
  /** Human-readable label for the unified date field */
  label: string
  /** Shared profile_path for storing the unified YYYY-MM-DD value */
  profilePath: string
}

// ── Suffix Patterns ─────────────────────────────────────────────────────────
// Each entry maps a year/month/day suffix to its role.
// We try year-first since finding a year suffix is the trigger for a group.

interface SuffixSet {
  yearSuffix: string
  monthSuffix: string
  daySuffix: string | null // null = no day component expected
}

/**
 * Known date-split suffix patterns in IRCC XFA forms.
 * Order matters: more specific patterns first to avoid false matches.
 */
const SUFFIX_SETS: SuffixSet[] = [
  // Compound suffixes (e.g. IssueDateYr, ExpiryDateYr, DOBYear)
  { yearSuffix: 'IssueDateYr', monthSuffix: 'IssueDateMM', daySuffix: 'IssueDateDD' },
  { yearSuffix: 'ExpiryDateYr', monthSuffix: 'ExpiryDateMM', daySuffix: 'ExpiryDateDD' },
  { yearSuffix: 'DOBYear', monthSuffix: 'DOBMonth', daySuffix: 'DOBDay' },
  // Standard suffixes (FromYr, ToYr, etc.)
  { yearSuffix: 'FromYr', monthSuffix: 'FromMM', daySuffix: 'FromDD' },
  { yearSuffix: 'ToYr', monthSuffix: 'ToMM', daySuffix: 'ToDD' },
  // Year/Month only patterns (some forms don't have day)
  { yearSuffix: 'Year', monthSuffix: 'Month', daySuffix: 'Day' },
  { yearSuffix: 'Yr', monthSuffix: 'MM', daySuffix: 'DD' },
]

// ── Detection ───────────────────────────────────────────────────────────────

/**
 * Detect date-split field groups from a list of scanned fields.
 *
 * Scans all XFA paths for known year/month/day suffix patterns, then
 * groups them into DateGroup objects with a shared profile_path.
 *
 * @param fields - Array of scanned fields with xfa_path and suggested_label
 * @returns Array of detected date groups
 */
export function detectDateGroups(
  fields: Array<{ xfa_path: string; suggested_label: string | null }>,
): DateGroup[] {
  const groups: DateGroup[] = []
  const usedIndices = new Set<number>()

  // Build a lookup from xfa_path → index for fast matching
  const pathIndex = new Map<string, number>()
  for (let i = 0; i < fields.length; i++) {
    pathIndex.set(fields[i].xfa_path, i)
  }

  // For each field, check if it's a "year" field that starts a date group
  for (let i = 0; i < fields.length; i++) {
    if (usedIndices.has(i)) continue

    const xfaPath = fields[i].xfa_path
    const lastDot = xfaPath.lastIndexOf('.')
    if (lastDot < 0) continue

    const prefix = xfaPath.substring(0, lastDot + 1) // includes trailing dot
    const lastSegment = xfaPath.substring(lastDot + 1)

    for (const suffixSet of SUFFIX_SETS) {
      if (lastSegment !== suffixSet.yearSuffix) continue

      // Found a year field — look for matching month and day
      const monthPath = prefix + suffixSet.monthSuffix
      const monthIdx = pathIndex.get(monthPath)
      if (monthIdx === undefined) continue // No month match → not a date group

      // Day is optional (some forms only have Yr + MM)
      let dayIdx: number | undefined
      if (suffixSet.daySuffix) {
        const dayPath = prefix + suffixSet.daySuffix
        dayIdx = pathIndex.get(dayPath)
      }

      // Compute the base XFA path (strip the year suffix to get the common root)
      // e.g. "Part1.SponsorResidency.q1.FromYr" → base = "Part1.SponsorResidency.q1.From"
      const baseXfaPath = xfaPath.substring(0, xfaPath.length - suffixSet.yearSuffix.length)

      // Generate a shared profile_path for the unified date value
      const profilePath = generateDateProfilePath(baseXfaPath)

      // Derive a clean label (using the base path context, not the Yr-specific label)
      const label = deriveDateLabel(baseXfaPath, xfaPath, fields[i].suggested_label)

      groups.push({
        baseXfaPath,
        yearFieldIdx: i,
        monthFieldIdx: monthIdx,
        dayFieldIdx: dayIdx,
        label,
        profilePath,
      })

      // Mark all component indices as used
      usedIndices.add(i)
      usedIndices.add(monthIdx)
      if (dayIdx !== undefined) usedIndices.add(dayIdx)

      break // Found a match — stop checking suffix sets for this field
    }
  }

  return groups
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generate a profile_path from a date group's base XFA path.
 * e.g. "Part1.SponsorResidency.q1.From" → "dynamic.part1_sponsorresidency_q1_from_date"
 */
function generateDateProfilePath(baseXfaPath: string): string {
  const sanitized = baseXfaPath
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase()

  return `dynamic.${sanitized}_date`
}

/**
 * Derive a human-readable label for a date group.
 * Uses the base path to get context-aware wording from deriveClientLabel.
 */
function deriveDateLabel(
  baseXfaPath: string,
  yearXfaPath: string,
  suggestedLabel: string | null,
): string {
  // Try deriving from the full year path first (PATH_PATTERN_OVERRIDES may match)
  const yearLabel = deriveClientLabel(yearXfaPath, null, suggestedLabel)

  // If the year label ends with "(Year)" or similar suffix, strip it for the unified label
  const stripped = yearLabel
    .replace(/\s*\(Year\)\s*$/i, '')
    .replace(/\s*\(Yr\)\s*$/i, '')
    .trim()

  if (stripped && stripped !== yearLabel) {
    return stripped
  }

  // Fall back to base path derivation with a "Date" context
  // Strip common date prefixes from the last segment to get a clean label
  const parts = baseXfaPath.split('.')
  const lastPart = parts[parts.length - 1] || ''

  // Map common base names to readable labels
  const baseLabelMap: Record<string, string> = {
    From: 'Start date',
    To: 'End date',
    DOB: 'Date of birth',
    IssueDate: 'Date issued',
    ExpiryDate: 'Expiry date',
    DateOfMarriage: 'Date of marriage',
    DateSigned: 'Date signed',
  }

  if (baseLabelMap[lastPart]) {
    return baseLabelMap[lastPart]
  }

  // Use the yearLabel as-is if we couldn't improve it
  return yearLabel
}

/**
 * Build a map from field index → date-split metadata for use during field insertion.
 * Returns the date_split value ('year' | 'month' | 'day'), the shared profile_path,
 * whether the field should be client-visible (only the year/primary is visible),
 * and the field_type override.
 */
export interface DateSplitFieldMeta {
  date_split: DateSplitPart
  profile_path: string
  is_client_visible: boolean
  field_type: IrccFieldType | null // 'date' for the primary, null for hidden components
  label: string
}

export function buildDateSplitMap(
  groups: DateGroup[],
): Map<number, DateSplitFieldMeta> {
  const map = new Map<number, DateSplitFieldMeta>()

  for (const group of groups) {
    // Year field = primary (visible, renders as DatePicker)
    map.set(group.yearFieldIdx, {
      date_split: 'year',
      profile_path: group.profilePath,
      is_client_visible: true,
      field_type: 'date',
      label: group.label,
    })

    // Month field = hidden component
    map.set(group.monthFieldIdx, {
      date_split: 'month',
      profile_path: group.profilePath,
      is_client_visible: false,
      field_type: null,
      label: group.label,
    })

    // Day field = hidden component (if present)
    if (group.dayFieldIdx !== undefined) {
      map.set(group.dayFieldIdx, {
        date_split: 'day',
        profile_path: group.profilePath,
        is_client_visible: false,
        field_type: null,
        label: group.label,
      })
    }
  }

  return map
}
