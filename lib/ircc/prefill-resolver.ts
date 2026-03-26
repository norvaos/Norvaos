/**
 * IRCC Forms Engine  -  Prefill Resolver
 *
 * Resolves field values using the six-level precedence hierarchy defined in ADR-3.
 * This is a PURE LOGIC module  -  all database operations are injected via the
 * PrefillDataAccess interface.
 *
 * Precedence levels (highest to lowest):
 *   1. VERIFIED_MATTER_OVERRIDE  -  verified=true AND source='staff_entry' in this instance
 *   2. CURRENT_MATTER_ANSWER  -  source='staff_entry' or 'client_portal' in this instance
 *   3. CROSS_FORM_REUSE  -  answer from another form in the same matter
 *   4. VERIFIED_CANONICAL  -  canonical_profile_fields with verification_status='verified'
 *   5. UNVERIFIED_CANONICAL  -  canonical_profile_fields with verification_status != 'verified'
 *   6. CONTACT_FALLBACK  -  raw contact table fields
 *
 * ADR condition #1: When an unverified client_portal answer at level 2 would win
 * over a verified canonical value at level 4, the resolver sets has_conflict=true.
 * The level-2 value still "wins" (most recent user input), but the conflict flag
 * tells the UI to show a warning requiring staff resolution.
 */

import type {
  AnswerRecord,
  AnswerMap,
  PrecedenceLevel as PrecedenceLevelType,
  ResolvedValue,
  AlternativeValue,
  AnswerSource,
} from './types/answers'
import { PrecedenceLevel, SOURCE_TRUST_LEVEL } from './types/answers'

// ---------------------------------------------------------------------------
// DataAccess interface  -  injected by callers, no DB coupling here
// ---------------------------------------------------------------------------

/** Data access contract for the prefill resolver. Callers provide an implementation. */
export interface PrefillDataAccess {
  /** Get per-instance answers for a form instance. */
  getInstanceAnswers(instanceId: string): Promise<AnswerMap>

  /** Get canonical profile fields for a contact. */
  getCanonicalFields(contactId: string): Promise<
    Array<{
      id: string
      domain: string
      field_key: string
      value: unknown
      verification_status: 'pending' | 'verified' | 'client_submitted' | 'conflict'
      effective_from: string
      source: string
    }>
  >

  /** Get raw contact fields (name, email, phone, DOB, etc.). */
  getContactFields(contactId: string): Promise<Record<string, unknown>>

  /** Get cross-form reused answers from sibling instances in the same matter. */
  getCrossFormAnswers(
    matterId: string,
    instanceId: string,
    profilePaths: string[],
  ): Promise<Record<string, AnswerRecord>>
}

// ---------------------------------------------------------------------------
// Contact field mapping
// ---------------------------------------------------------------------------

/**
 * Maps canonical profile_path values to raw contact table column names.
 * Used for level 6 (CONTACT_FALLBACK) resolution.
 */
const CONTACT_FIELD_MAP: Record<string, string> = {
  'personal.family_name': 'last_name',
  'personal.given_name': 'first_name',
  'contact_info.email': 'email',
  'contact_info.telephone': 'phone',
  'personal.date_of_birth': 'date_of_birth',
  'personal.sex': 'gender',
  'personal.citizenship': 'nationality',
  'marital.status': 'marital_status',
  'personal.current_country_of_residence': 'country_of_residence',
  'personal.place_of_birth_country': 'country_of_birth',
}

/**
 * Map a canonical profile_path to a raw contact field name.
 *
 * @param profilePath - The canonical profile path (e.g. 'personal.family_name')
 * @returns The corresponding contact table column name, or null if no mapping exists
 *
 * @example
 * profilePathToContactField('personal.family_name') // 'last_name'
 * profilePathToContactField('contact_info.email')    // 'email'
 * profilePathToContactField('unknown.field')         // null
 */
export function profilePathToContactField(profilePath: string): string | null {
  return CONTACT_FIELD_MAP[profilePath] ?? null
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Builds a profile_path from a canonical field's domain and field_key. */
function canonicalToProfilePath(domain: string, fieldKey: string): string {
  return `${domain}.${fieldKey}`
}

/** Checks whether a value is non-null and non-undefined. */
function hasValue(v: unknown): boolean {
  return v !== null && v !== undefined
}

/**
 * Resolves a single field through the six-level precedence chain using
 * pre-fetched data. This is the core resolution logic used by both
 * resolveFieldValue (single) and resolveAllFields (batch).
 */
function resolveFromData(
  profilePath: string,
  instanceAnswers: AnswerMap,
  crossFormAnswers: Record<string, AnswerRecord>,
  canonicalFields: Array<{
    id: string
    domain: string
    field_key: string
    value: unknown
    verification_status: 'pending' | 'verified' | 'client_submitted' | 'conflict'
    effective_from: string
    source: string
  }>,
  contactFields: Record<string, unknown>,
): ResolvedValue {
  const alternatives: AlternativeValue[] = []
  let winner: {
    value: unknown
    precedence: PrecedenceLevelType
    source: AnswerSource | 'contact_field'
    verified: boolean
  } | null = null

  // Track whether we find specific values at specific levels for conflict detection
  let level2UnverifiedClientPortal: {
    value: unknown
    source: AnswerSource
  } | null = null
  let level4VerifiedCanonical: {
    value: unknown
  } | null = null

  // ── Level 1: VERIFIED_MATTER_OVERRIDE ──
  const instanceAnswer = instanceAnswers[profilePath]
  if (
    instanceAnswer &&
    hasValue(instanceAnswer.value) &&
    instanceAnswer.verified === true &&
    instanceAnswer.source === 'staff_entry'
  ) {
    const entry = {
      value: instanceAnswer.value,
      precedence: PrecedenceLevel.VERIFIED_MATTER_OVERRIDE,
      source: instanceAnswer.source as AnswerSource,
      verified: true,
    }
    if (!winner) winner = entry
    alternatives.push(entry)
  }

  // ── Level 2: CURRENT_MATTER_ANSWER ──
  if (
    instanceAnswer &&
    hasValue(instanceAnswer.value) &&
    (instanceAnswer.source === 'staff_entry' || instanceAnswer.source === 'client_portal')
  ) {
    // Only add at level 2 if it wasn't already captured at level 1
    const alreadyAtLevel1 =
      instanceAnswer.verified === true && instanceAnswer.source === 'staff_entry'

    if (!alreadyAtLevel1) {
      const entry = {
        value: instanceAnswer.value,
        precedence: PrecedenceLevel.CURRENT_MATTER_ANSWER,
        source: instanceAnswer.source as AnswerSource,
        verified: instanceAnswer.verified,
      }
      if (!winner) winner = entry
      alternatives.push(entry)

      // Track for ADR condition #1 conflict detection
      if (instanceAnswer.source === 'client_portal' && !instanceAnswer.verified) {
        level2UnverifiedClientPortal = {
          value: instanceAnswer.value,
          source: instanceAnswer.source,
        }
      }
    }
  }

  // ── Level 3: CROSS_FORM_REUSE ──
  const crossFormAnswer = crossFormAnswers[profilePath]
  if (crossFormAnswer && hasValue(crossFormAnswer.value)) {
    const entry = {
      value: crossFormAnswer.value,
      precedence: PrecedenceLevel.CROSS_FORM_REUSE,
      source: crossFormAnswer.source as AnswerSource,
      verified: crossFormAnswer.verified,
    }
    if (!winner) winner = entry
    alternatives.push(entry)
  }

  // ── Level 4 & 5: VERIFIED_CANONICAL / UNVERIFIED_CANONICAL ──
  const matchingCanonical = canonicalFields.filter(
    (f) => canonicalToProfilePath(f.domain, f.field_key) === profilePath,
  )

  // Sort by effective_from descending so the most recent canonical value wins
  // within each verification tier
  const sortedCanonical = [...matchingCanonical].sort(
    (a, b) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime(),
  )

  let addedVerifiedCanonical = false
  let addedUnverifiedCanonical = false

  for (const cf of sortedCanonical) {
    if (!hasValue(cf.value)) continue

    if (cf.verification_status === 'verified' && !addedVerifiedCanonical) {
      const entry = {
        value: cf.value,
        precedence: PrecedenceLevel.VERIFIED_CANONICAL,
        source: (cf.source || 'canonical_prefill') as AnswerSource,
        verified: true,
      }
      if (!winner) winner = entry
      alternatives.push(entry)
      addedVerifiedCanonical = true

      // Track for ADR condition #1 conflict detection
      level4VerifiedCanonical = { value: cf.value }
    } else if (cf.verification_status !== 'verified' && !addedUnverifiedCanonical) {
      const entry = {
        value: cf.value,
        precedence: PrecedenceLevel.UNVERIFIED_CANONICAL,
        source: (cf.source || 'canonical_prefill') as AnswerSource,
        verified: false,
      }
      if (!winner) winner = entry
      alternatives.push(entry)
      addedUnverifiedCanonical = true
    }

    if (addedVerifiedCanonical && addedUnverifiedCanonical) break
  }

  // ── Level 6: CONTACT_FALLBACK ──
  const contactColumn = CONTACT_FIELD_MAP[profilePath]
  if (contactColumn) {
    const contactValue = contactFields[contactColumn]
    if (hasValue(contactValue)) {
      const entry = {
        value: contactValue,
        precedence: PrecedenceLevel.CONTACT_FALLBACK,
        source: 'contact_field' as const,
        verified: false,
      }
      if (!winner) winner = entry
      alternatives.push(entry)
    }
  }

  // ── No value found at any level ──
  if (!winner) {
    return {
      value: null,
      precedence: PrecedenceLevel.CONTACT_FALLBACK,
      source: 'contact_field',
      verified: false,
      alternatives: [],
      has_conflict: false,
    }
  }

  // ── ADR condition #1: Conflict detection ──
  // If the winner is at level 2 from an unverified client_portal source,
  // and a verified canonical value exists at level 4, flag a conflict.
  let hasConflict = false
  if (
    winner.precedence === PrecedenceLevel.CURRENT_MATTER_ANSWER &&
    level2UnverifiedClientPortal !== null &&
    level4VerifiedCanonical !== null
  ) {
    // Values differ  -  genuine conflict
    if (level2UnverifiedClientPortal.value !== level4VerifiedCanonical.value) {
      hasConflict = true
    }
  }

  // Build alternatives list excluding the winner (alternatives = all OTHER levels)
  const winnerAlternatives = alternatives.filter(
    (a) => a.precedence !== winner!.precedence || a.value !== winner!.value,
  )

  // Sort by precedence (lower number = higher priority)
  winnerAlternatives.sort((a, b) => a.precedence - b.precedence)

  return {
    value: winner.value,
    precedence: winner.precedence,
    source: winner.source,
    verified: winner.verified,
    alternatives: winnerAlternatives,
    has_conflict: hasConflict,
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve a single field value through the six-level precedence chain.
 *
 * Refined precedence (ADR condition #1): If the winning value at level 2 is
 * from an unverified client_portal source, and a verified value exists at level 4,
 * the result includes has_conflict=true. The caller decides how to handle this
 * (e.g., show a conflict indicator, require staff resolution).
 *
 * @param profilePath - The canonical field path (e.g. 'personal.family_name')
 * @param instanceId - The current form instance ID
 * @param contactId - The contact ID for canonical/contact lookups
 * @param matterId - The matter ID for cross-form lookups
 * @param dataAccess - Injected data access implementation
 * @returns The resolved value with precedence metadata, alternatives, and conflict flag
 */
export async function resolveFieldValue(
  profilePath: string,
  instanceId: string,
  contactId: string,
  matterId: string,
  dataAccess: PrefillDataAccess,
): Promise<ResolvedValue> {
  // Fetch all data in parallel
  const [instanceAnswers, canonicalFields, contactFields, crossFormAnswers] = await Promise.all([
    dataAccess.getInstanceAnswers(instanceId),
    dataAccess.getCanonicalFields(contactId),
    dataAccess.getContactFields(contactId),
    dataAccess.getCrossFormAnswers(matterId, instanceId, [profilePath]),
  ])

  return resolveFromData(profilePath, instanceAnswers, crossFormAnswers, canonicalFields, contactFields)
}

/**
 * Resolve all fields for a form instance at once (batch resolution).
 *
 * More efficient than calling resolveFieldValue per field because it makes
 * exactly one call per data source (instance answers, canonical fields,
 * cross-form answers, contact fields) and then resolves all paths in memory.
 *
 * @param profilePaths - All profile_paths to resolve
 * @param instanceId - The form instance ID
 * @param contactId - The contact ID
 * @param matterId - The matter ID
 * @param dataAccess - Injected data access implementation
 * @returns Map of profile_path to ResolvedValue
 */
export async function resolveAllFields(
  profilePaths: string[],
  instanceId: string,
  contactId: string,
  matterId: string,
  dataAccess: PrefillDataAccess,
): Promise<Record<string, ResolvedValue>> {
  if (profilePaths.length === 0) return {}

  // Single batch fetch for all data sources in parallel
  const [instanceAnswers, canonicalFields, contactFields, crossFormAnswers] = await Promise.all([
    dataAccess.getInstanceAnswers(instanceId),
    dataAccess.getCanonicalFields(contactId),
    dataAccess.getContactFields(contactId),
    dataAccess.getCrossFormAnswers(matterId, instanceId, profilePaths),
  ])

  // Resolve each path in memory using the pre-fetched data
  const result: Record<string, ResolvedValue> = {}
  for (const path of profilePaths) {
    result[path] = resolveFromData(path, instanceAnswers, crossFormAnswers, canonicalFields, contactFields)
  }

  return result
}

/**
 * Build the resolved profile for form generation (ADR-8).
 *
 * Returns a flat profile_path to value map using only non-stale, resolved values.
 * Identifies any required fields that have unresolved conflicts or missing values.
 *
 * @param resolvedFields - Map of profile_path to ResolvedValue (from resolveAllFields)
 * @param requiredPaths - Profile paths that must be present for generation
 * @returns Object containing the profile map, list of conflicting required paths,
 *          and list of missing required paths
 */
export function buildResolvedProfile(
  resolvedFields: Record<string, ResolvedValue>,
  requiredPaths: string[],
): { profile: Record<string, unknown>; conflicts: string[]; missing: string[] } {
  const profile: Record<string, unknown> = {}
  const conflicts: string[] = []
  const missing: string[] = []

  // Build profile from all resolved fields
  for (const [path, resolved] of Object.entries(resolvedFields)) {
    if (hasValue(resolved.value)) {
      profile[path] = resolved.value
    }
  }

  // Check required paths for conflicts and missing values
  for (const path of requiredPaths) {
    const resolved = resolvedFields[path]

    if (!resolved || !hasValue(resolved.value)) {
      missing.push(path)
      continue
    }

    if (resolved.has_conflict) {
      conflicts.push(path)
    }
  }

  return { profile, conflicts, missing }
}
