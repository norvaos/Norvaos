/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Immigration Readiness Matrix Engine
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Pure-function engine that computes the 6 readiness domains from playbook
 * rules, profile data (contacts.immigration_data), people rows, and document
 * slots.
 *
 * Design:
 *   - NO side effects (no DB, no fetch, no I/O)
 *   - Each domain aggregates questionnaire field rules + document rules
 *   - Separate drafting vs filing blocker lists
 *   - Lawyer review triggers evaluated from people + immigration data
 *
 * Called from useImmigrationReadiness() hook and enforcePlaybookGenerationRules().
 */

import type {
  ImmigrationPlaybook,
  ReadinessDomain,
  PersonRoleScope,
  LawyerReviewTrigger,
} from '@/lib/config/immigration-playbooks'
import { profilePathGet } from '@/lib/ircc/questionnaire-engine'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ReadinessMatrix {
  /** Readiness broken down by 6 domains */
  domains: Record<ReadinessDomain, DomainReadiness>
  /** Weighted average across all domains */
  overallPct: number
  /** Whether overallPct >= playbook.readinessThreshold */
  meetsThreshold: boolean
  /** Blockers that prevent form pack generation */
  draftingBlockers: BlockerDetail[]
  /** Blockers that prevent filing */
  filingBlockers: BlockerDetail[]
  /** All blockers across all domains (flattened) */
  allBlockers: BlockerDetail[]
  /** Whether any lawyer review trigger fired */
  lawyerReviewTriggered: boolean
  /** Human-readable reasons for lawyer review */
  lawyerReviewReasons: string[]
}

export interface DomainReadiness {
  domain: ReadinessDomain
  label: string
  completionPct: number
  totalRules: number
  satisfiedRules: number
  /** Question-only rule counts (excludes document rules) */
  questionTotalRules: number
  questionSatisfiedRules: number
  blockers: BlockerDetail[]
}

export interface BlockerDetail {
  type: 'question' | 'document'
  /** profile_path for questions, slot_slug for documents */
  identifier: string
  /** Human-readable label */
  label: string
  blocks_drafting: boolean
  blocks_filing: boolean
  person_role_scope: PersonRoleScope
  person_name?: string
  /** Which readiness domain this blocker belongs to */
  domain?: ReadinessDomain
}

export interface ReadinessMatrixContext {
  playbook: ImmigrationPlaybook
  /** contacts.immigration_data  -  questionnaire profile JSONB */
  profile: Record<string, unknown> | null
  people: ReadinessPersonRow[]
  documentSlots: ReadinessSlotRow[]
  immigration: ReadinessImmigrationRow | null
}

export interface ReadinessPersonRow {
  id: string
  person_role: string
  first_name: string | null
  last_name: string | null
  criminal_charges: boolean
  inadmissibility_flag: boolean
  previous_marriage?: boolean
  is_active: boolean
  [key: string]: unknown
}

export interface ReadinessSlotRow {
  slot_slug: string
  status: string
  is_required: boolean
  is_active: boolean
  person_id: string | null
  person_role: string | null
}

export interface ReadinessImmigrationRow {
  prior_refusals: boolean | null
  has_criminal_record: boolean | null
  spouse_included: boolean | null
  [key: string]: unknown
}

// ── Domain Labels ────────────────────────────────────────────────────────────

export const DOMAIN_LABELS: Record<ReadinessDomain, string> = {
  client_identity: 'Client Identity',
  family_composition: 'Family Composition',
  immigration_history: 'Immigration History',
  program_eligibility: 'Programme-Specific Eligibility',
  evidence: 'Supporting Evidence',
  review_risk: 'Review / Risk',
}

const ALL_DOMAINS: ReadinessDomain[] = [
  'client_identity',
  'family_composition',
  'immigration_history',
  'program_eligibility',
  'evidence',
  'review_risk',
]

// ── Main Computation ─────────────────────────────────────────────────────────

/**
 * Compute the readiness matrix for a matter based on its playbook rules.
 * Returns null if the playbook has no matrix rules defined.
 *
 * Pure function  -  no side effects. Caller is responsible for fetching data.
 */
export function computeReadinessMatrix(
  ctx: ReadinessMatrixContext
): ReadinessMatrix | null {
  const { playbook, profile, documentSlots } = ctx

  // Guard: no matrix rules → return null (backward compatible)
  if (!playbook.questionnaireFieldRules || playbook.questionnaireFieldRules.length === 0) {
    return null
  }

  // Init domain accumulators
  const domainAccum: Record<ReadinessDomain, {
    total: number
    satisfied: number
    qTotal: number
    qSatisfied: number
    blockers: BlockerDetail[]
  }> = {} as Record<ReadinessDomain, { total: number; satisfied: number; qTotal: number; qSatisfied: number; blockers: BlockerDetail[] }>

  for (const d of ALL_DOMAINS) {
    domainAccum[d] = { total: 0, satisfied: 0, qTotal: 0, qSatisfied: 0, blockers: [] }
  }

  // ── Evaluate questionnaire field rules ─────────────────────────────────

  for (const rule of playbook.questionnaireFieldRules) {
    // Skip role-specific rules when no person of that role exists
    if (rule.person_role_scope && !['pa', 'all'].includes(rule.person_role_scope)) {
      const hasPersonWithRole = ctx.people.some(
        (p) => p.person_role === rule.person_role_scope && p.is_active
      )
      if (!hasPersonWithRole) continue
    }

    const domain = domainAccum[rule.readiness_domain]
    domain.total++
    domain.qTotal++

    const value = profile ? profilePathGet(profile, rule.profile_path) : undefined
    const isFilled = isFieldFilled(value)

    if (isFilled) {
      domain.satisfied++
      domain.qSatisfied++
    } else {
      const blocker: BlockerDetail = {
        type: 'question',
        identifier: rule.profile_path,
        label: rule.label,
        blocks_drafting: rule.blocks_drafting,
        blocks_filing: rule.blocks_filing,
        person_role_scope: rule.person_role_scope,
        domain: rule.readiness_domain,
      }
      domain.blockers.push(blocker)
    }
  }

  // ── Evaluate document rules (person-scoped) ──────────────────────────

  if (playbook.documentRules) {
    for (const rule of playbook.documentRules) {
      const domain = domainAccum[rule.readiness_domain]

      if (rule.person_role_scope === 'all') {
        // Scope 'all': every active person must have an accepted slot
        const activePeople = ctx.people.filter((p) => p.is_active)
        if (activePeople.length === 0) {
          // No people  -  fall back to matter-level (person_id null)
          domain.total++
          const slot = documentSlots.find(
            (s) => s.slot_slug === rule.slot_slug && s.is_active && s.person_id === null
          )
          if (slot?.status === 'accepted') {
            domain.satisfied++
          } else {
            domain.blockers.push({
              type: 'document', identifier: rule.slot_slug, label: rule.label,
              blocks_drafting: rule.blocks_drafting, blocks_filing: rule.blocks_filing,
              person_role_scope: rule.person_role_scope, domain: rule.readiness_domain,
            })
          }
        } else {
          // One sub-rule per person (person_name displayed as badge, not in label)
          for (const person of activePeople) {
            domain.total++
            const slot = documentSlots.find(
              (s) => s.slot_slug === rule.slot_slug && s.is_active && s.person_id === person.id
            )
            const personName = [person.first_name, person.last_name].filter(Boolean).join(' ') || person.person_role
            if (slot?.status === 'accepted') {
              domain.satisfied++
            } else {
              domain.blockers.push({
                type: 'document', identifier: rule.slot_slug,
                label: rule.label,
                blocks_drafting: rule.blocks_drafting, blocks_filing: rule.blocks_filing,
                person_role_scope: rule.person_role_scope, person_name: personName,
                domain: rule.readiness_domain,
              })
            }
          }
        }
      } else if (rule.person_role_scope === 'pa') {
        // Scope 'pa': match principal_applicant slot or matter-level (null)
        domain.total++
        const slot = documentSlots.find(
          (s) => s.slot_slug === rule.slot_slug && s.is_active
            && (s.person_role === 'principal_applicant' || s.person_id === null)
        )
        if (slot?.status === 'accepted') {
          domain.satisfied++
        } else {
          domain.blockers.push({
            type: 'document', identifier: rule.slot_slug, label: rule.label,
            blocks_drafting: rule.blocks_drafting, blocks_filing: rule.blocks_filing,
            person_role_scope: rule.person_role_scope, domain: rule.readiness_domain,
          })
        }
      } else {
        // Specific role: 'spouse', 'dependent', 'co_sponsor'
        const hasPersonWithRole = ctx.people.some(
          (p) => p.person_role === rule.person_role_scope && p.is_active
        )
        if (!hasPersonWithRole) continue // No person of this role  -  skip rule entirely

        domain.total++
        const matchingSlots = documentSlots.filter(
          (s) => s.slot_slug === rule.slot_slug && s.is_active && s.person_role === rule.person_role_scope
        )
        const anyAccepted = matchingSlots.some((s) => s.status === 'accepted')
        if (anyAccepted) {
          domain.satisfied++
        } else {
          const matchingPerson = ctx.people.find(
            (p) => p.person_role === rule.person_role_scope && p.is_active
          )
          const personName = matchingPerson
            ? [matchingPerson.first_name, matchingPerson.last_name].filter(Boolean).join(' ') || rule.person_role_scope
            : rule.person_role_scope
          domain.blockers.push({
            type: 'document', identifier: rule.slot_slug, label: rule.label,
            blocks_drafting: rule.blocks_drafting, blocks_filing: rule.blocks_filing,
            person_role_scope: rule.person_role_scope, person_name: personName,
            domain: rule.readiness_domain,
          })
        }
      }
    }
  }

  // ── Build domain results ───────────────────────────────────────────────

  const domains = {} as Record<ReadinessDomain, DomainReadiness>
  let totalRulesGlobal = 0
  let satisfiedRulesGlobal = 0

  for (const d of ALL_DOMAINS) {
    const acc = domainAccum[d]
    totalRulesGlobal += acc.total
    satisfiedRulesGlobal += acc.satisfied

    domains[d] = {
      domain: d,
      label: DOMAIN_LABELS[d],
      completionPct: acc.total > 0
        ? Math.round((acc.satisfied / acc.total) * 100)
        : 100,
      totalRules: acc.total,
      satisfiedRules: acc.satisfied,
      questionTotalRules: acc.qTotal,
      questionSatisfiedRules: acc.qSatisfied,
      blockers: acc.blockers,
    }
  }

  // ── Overall percentage (weighted by rule count per domain) ─────────────

  const overallPct = totalRulesGlobal > 0
    ? Math.round((satisfiedRulesGlobal / totalRulesGlobal) * 100)
    : 100

  const threshold = playbook.readinessThreshold ?? 85

  // ── Separate drafting vs filing blockers ────────────────────────────────

  const allBlockers = ALL_DOMAINS.flatMap((d) => domainAccum[d].blockers)
  const draftingBlockers = allBlockers.filter((b) => b.blocks_drafting)
  const filingBlockers = allBlockers.filter((b) => b.blocks_filing)

  // ── Evaluate lawyer review triggers ────────────────────────────────────

  const triggerResults = playbook.lawyerReviewTriggers
    ? evaluateLawyerReviewTriggers(
        playbook.lawyerReviewTriggers,
        ctx.people.find((p) => p.person_role === 'principal_applicant' && p.is_active) ?? null,
        ctx.immigration
      )
    : []

  return {
    domains,
    overallPct,
    meetsThreshold: overallPct >= threshold,
    draftingBlockers,
    filingBlockers,
    allBlockers,
    lawyerReviewTriggered: triggerResults.length > 0,
    lawyerReviewReasons: triggerResults.map((t) => t.message),
  }
}

// ── Lawyer Review Trigger Evaluation ─────────────────────────────────────────

/**
 * Evaluate lawyer review triggers against people and immigration data.
 * Pure function  -  no side effects.
 */
export function evaluateLawyerReviewTriggers(
  triggers: LawyerReviewTrigger[],
  paPersonRow: ReadinessPersonRow | Record<string, unknown> | null | undefined,
  immigrationRow: ReadinessImmigrationRow | Record<string, unknown> | null
): Array<{ key: string; message: string }> {
  const results: Array<{ key: string; message: string }> = []

  for (const trigger of triggers) {
    const source = trigger.condition_source === 'people'
      ? (paPersonRow as Record<string, unknown> | null)
      : (immigrationRow as Record<string, unknown> | null)

    if (!source) continue

    // Support dot-notation for nested fields
    const value = trigger.condition_field.includes('.')
      ? profilePathGet(source as Record<string, unknown>, trigger.condition_field)
      : source[trigger.condition_field]

    let fired = false

    switch (trigger.condition_operator) {
      case 'truthy':
        fired = !!value
        break
      case 'equals':
        fired = value === trigger.condition_value
        break
      case 'gt':
        fired = typeof value === 'number' && typeof trigger.condition_value === 'number'
          && value > trigger.condition_value
        break
      case 'lt':
        fired = typeof value === 'number' && typeof trigger.condition_value === 'number'
          && value < trigger.condition_value
        break
      case 'in':
        fired = Array.isArray(trigger.condition_value)
          && trigger.condition_value.includes(value)
        break
    }

    if (fired) {
      results.push({ key: trigger.key, message: trigger.message })
    }
  }

  return results
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Check if a profile field value is considered "filled".
 * null, undefined, empty string, and empty objects are NOT filled.
 */
function isFieldFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return true
  if (typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(
      (v) => v !== null && v !== undefined && v !== ''
    )
  }
  return true
}
