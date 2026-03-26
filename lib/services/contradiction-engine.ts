/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Immigration Contradiction Engine
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Pure-function engine that evaluates intake data for inconsistencies.
 * Returns typed contradiction flags stored in matter_intake.contradiction_flags.
 *
 * Design:
 *   - NO side effects (no DB, no fetch, no I/O)
 *   - Each rule is a named function for testability
 *   - Contradictions are either 'warning' (informational) or 'blocking' (prevents drafting)
 *   - Blocking contradictions can be overridden by a lawyer
 *
 * Called from revalidateIntake() after validation/risk scoring.
 */

import type { ContradictionRuleKey, ImmigrationPlaybook } from '@/lib/config/immigration-playbooks'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ContradictionFlag {
  /** Unique rule key for programmatic handling */
  key: ContradictionRuleKey
  /** Blocking = prevents drafting/filing; warning = informational */
  severity: 'warning' | 'blocking'
  /** Human-readable description */
  message: string
  /** Person ID if contradiction is person-scoped */
  person_id?: string
  /** Field that triggered the contradiction */
  field?: string
  /** When this contradiction was detected */
  detected_at: string
}

export interface ContradictionContext {
  people: PersonRow[]
  immigration: ImmigrationRow | null
  documentSlots: SlotRow[]
  playbook: ImmigrationPlaybook
}

interface PersonRow {
  id: string
  person_role: string
  first_name: string | null
  last_name: string | null
  date_of_birth: string | null
  nationality: string | null
  passport_number: string | null
  passport_expiry: string | null
  marital_status: string | null
  number_of_dependents: number
  criminal_charges: boolean
  criminal_details: string | null
  inadmissibility_flag: boolean
  inadmissibility_details: string | null
  immigration_status: string | null
  status_expiry_date: string | null
  is_active: boolean
}

interface ImmigrationRow {
  prior_refusals: boolean | null
  prior_refusal_details: string | null
  has_criminal_record: boolean | null
  criminal_record_details: string | null
  spouse_included: boolean | null
}

interface SlotRow {
  slot_slug: string
  status: string
  is_required: boolean
  is_active: boolean
  person_id: string | null
  category: string
}

// ── Rule Functions ───────────────────────────────────────────────────────────

const SPOUSE_STATUSES = ['married', 'common_law']
const now = () => new Date().toISOString()

function checkMarriedNoSpouse(ctx: ContradictionContext): ContradictionFlag | null {
  const pa = ctx.people.find((p) => p.person_role === 'principal_applicant' && p.is_active)
  if (!pa) return null

  const isMarried = pa.marital_status && SPOUSE_STATUSES.includes(pa.marital_status)
  if (!isMarried) return null

  const hasSpouse = ctx.people.some((p) => p.person_role === 'spouse' && p.is_active)
  if (hasSpouse) return null

  return {
    key: 'married_no_spouse',
    severity: 'blocking',
    message: `Principal applicant's marital status is "${pa.marital_status}" but no spouse has been added to the matter.`,
    field: 'marital_status',
    detected_at: now(),
  }
}

function checkDependentDeclaredNoInfo(ctx: ContradictionContext): ContradictionFlag | null {
  const pa = ctx.people.find((p) => p.person_role === 'principal_applicant' && p.is_active)
  if (!pa || pa.number_of_dependents === 0) return null

  const dependents = ctx.people.filter((p) => p.person_role === 'dependent' && p.is_active)
  if (dependents.length >= pa.number_of_dependents) return null

  return {
    key: 'dependent_declared_no_info',
    severity: 'blocking',
    message: `${pa.number_of_dependents} dependent(s) declared but only ${dependents.length} dependent record(s) exist on the matter.`,
    field: 'number_of_dependents',
    detected_at: now(),
  }
}

function checkPriorRefusalInconsistent(ctx: ContradictionContext): ContradictionFlag | null {
  if (!ctx.immigration) return null
  if (!ctx.immigration.prior_refusals) return null

  const hasDetails = ctx.immigration.prior_refusal_details &&
    ctx.immigration.prior_refusal_details.trim().length > 0
  if (hasDetails) return null

  return {
    key: 'prior_refusal_inconsistent',
    severity: 'blocking',
    message: 'Prior refusal disclosed but no refusal details have been provided.',
    field: 'prior_refusal_details',
    detected_at: now(),
  }
}

function checkPassportIncomplete(ctx: ContradictionContext): ContradictionFlag[] {
  const flags: ContradictionFlag[] = []

  for (const person of ctx.people.filter((p) => p.is_active)) {
    const hasNumber = person.passport_number && person.passport_number.trim().length > 0
    const hasExpiry = person.passport_expiry && person.passport_expiry.trim().length > 0

    if (hasNumber && !hasExpiry) {
      flags.push({
        key: 'passport_incomplete',
        severity: 'blocking',
        message: `${person.first_name} ${person.last_name}: Passport number provided but expiry date is missing.`,
        person_id: person.id,
        field: 'passport_expiry',
        detected_at: now(),
      })
    } else if (!hasNumber && hasExpiry) {
      flags.push({
        key: 'passport_incomplete',
        severity: 'blocking',
        message: `${person.first_name} ${person.last_name}: Passport expiry provided but passport number is missing.`,
        person_id: person.id,
        field: 'passport_number',
        detected_at: now(),
      })
    }
  }

  return flags
}

function checkPersonMissingRequiredDocs(ctx: ContradictionContext): ContradictionFlag[] {
  const flags: ContradictionFlag[] = []

  for (const person of ctx.people.filter((p) => p.is_active)) {
    const personSlots = ctx.documentSlots.filter(
      (s) => s.person_id === person.id && s.is_required && s.is_active
    )
    const emptySlots = personSlots.filter((s) => s.status === 'empty')

    if (emptySlots.length > 0) {
      flags.push({
        key: 'person_missing_required_docs',
        severity: 'warning',
        message: `${person.first_name} ${person.last_name} (${person.person_role}): ${emptySlots.length} required document(s) not yet uploaded.`,
        person_id: person.id,
        detected_at: now(),
      })
    }
  }

  return flags
}

function checkSpouseNoRelationshipDocs(ctx: ContradictionContext): ContradictionFlag | null {
  if (ctx.playbook.matterTypeKey !== 'spousal') return null

  const hasSpouse = ctx.people.some((p) => p.person_role === 'spouse' && p.is_active)
  if (!hasSpouse) return null

  const relationshipSlots = ctx.documentSlots.filter(
    (s) => s.category === 'relationship' && s.is_required && s.is_active
  )
  const allEmpty = relationshipSlots.length > 0 &&
    relationshipSlots.every((s) => s.status === 'empty')

  if (!allEmpty) return null

  return {
    key: 'spouse_no_relationship_docs',
    severity: 'blocking',
    message: 'Spousal sponsorship requires relationship evidence but no relationship documents have been uploaded.',
    detected_at: now(),
  }
}

function checkExpiredPassport(ctx: ContradictionContext): ContradictionFlag[] {
  const flags: ContradictionFlag[] = []
  const today = new Date()

  for (const person of ctx.people.filter((p) => p.is_active && p.passport_expiry)) {
    const expiry = new Date(person.passport_expiry!)
    if (expiry < today) {
      flags.push({
        key: 'expired_passport',
        severity: 'blocking',
        message: `${person.first_name} ${person.last_name}: Passport expired on ${person.passport_expiry}.`,
        person_id: person.id,
        field: 'passport_expiry',
        detected_at: now(),
      })
    }
  }

  return flags
}

function checkStatusExpiryApproaching(ctx: ContradictionContext): ContradictionFlag[] {
  const flags: ContradictionFlag[] = []
  const today = new Date()
  const ninetyDaysFromNow = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000)

  for (const person of ctx.people.filter((p) => p.is_active && p.status_expiry_date)) {
    const expiry = new Date(person.status_expiry_date!)
    if (expiry < ninetyDaysFromNow) {
      const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
      flags.push({
        key: 'status_expiry_approaching',
        severity: daysLeft <= 0 ? 'blocking' : 'warning',
        message: daysLeft <= 0
          ? `${person.first_name} ${person.last_name}: Immigration status has expired.`
          : `${person.first_name} ${person.last_name}: Immigration status expires in ${daysLeft} day(s).`,
        person_id: person.id,
        field: 'status_expiry_date',
        detected_at: now(),
      })
    }
  }

  return flags
}

function checkCriminalNoDetails(ctx: ContradictionContext): ContradictionFlag[] {
  const flags: ContradictionFlag[] = []

  for (const person of ctx.people.filter((p) => p.is_active && p.criminal_charges)) {
    if (!person.criminal_details || person.criminal_details.trim().length === 0) {
      flags.push({
        key: 'criminal_no_details',
        severity: 'blocking',
        message: `${person.first_name} ${person.last_name}: Criminal charges disclosed but no details provided.`,
        person_id: person.id,
        field: 'criminal_details',
        detected_at: now(),
      })
    }
  }

  return flags
}

function checkInadmissibilityNoDetails(ctx: ContradictionContext): ContradictionFlag[] {
  const flags: ContradictionFlag[] = []

  for (const person of ctx.people.filter((p) => p.is_active && p.inadmissibility_flag)) {
    if (!person.inadmissibility_details || person.inadmissibility_details.trim().length === 0) {
      flags.push({
        key: 'inadmissibility_no_details',
        severity: 'blocking',
        message: `${person.first_name} ${person.last_name}: Inadmissibility flagged but no details provided.`,
        person_id: person.id,
        field: 'inadmissibility_details',
        detected_at: now(),
      })
    }
  }

  return flags
}

// ── Rule Registry ────────────────────────────────────────────────────────────

type RuleFn = (ctx: ContradictionContext) => ContradictionFlag | ContradictionFlag[] | null

const RULE_REGISTRY: Record<ContradictionRuleKey, RuleFn> = {
  married_no_spouse: checkMarriedNoSpouse,
  dependent_declared_no_info: checkDependentDeclaredNoInfo,
  prior_refusal_inconsistent: checkPriorRefusalInconsistent,
  passport_incomplete: checkPassportIncomplete,
  person_missing_required_docs: checkPersonMissingRequiredDocs,
  spouse_no_relationship_docs: checkSpouseNoRelationshipDocs,
  expired_passport: checkExpiredPassport,
  status_expiry_approaching: checkStatusExpiryApproaching,
  criminal_no_details: checkCriminalNoDetails,
  inadmissibility_no_details: checkInadmissibilityNoDetails,
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Evaluate all contradiction rules specified in the playbook.
 * Returns an array of detected contradictions (may be empty).
 *
 * Pure function  -  no side effects. Caller is responsible for persisting.
 */
export function evaluateContradictions(ctx: ContradictionContext): ContradictionFlag[] {
  const flags: ContradictionFlag[] = []

  for (const ruleKey of ctx.playbook.contradictionRules) {
    const ruleFn = RULE_REGISTRY[ruleKey]
    if (!ruleFn) continue

    try {
      const result = ruleFn(ctx)
      if (!result) continue
      if (Array.isArray(result)) {
        flags.push(...result)
      } else {
        flags.push(result)
      }
    } catch {
      // Fail-open for individual rules  -  log but don't block
      console.error(`[CONTRADICTION] Rule "${ruleKey}" threw an error`)
    }
  }

  return flags
}
