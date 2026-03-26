/**
 * Deterministic Readiness Calculator  -  Directive 050
 *
 * PURE FUNCTION: zero side effects, zero AI calls, zero network requests.
 * Computes the Sovereign Score from structured input data.
 *
 * Formula:
 *   Score = (D × 0.60) + (F × 0.30) + (C × 0.10)
 *
 * Where:
 *   D = Document Completeness (60%)  -  % of required slots with status 'accepted' or 'uploaded'
 *   F = Forensic Metadata (30%)      -  % of uploaded docs with BOTH expiry_date AND issue_date filled
 *   C = Client Pulse (10%)           -  100 if portal_last_login within 7 days, else 0
 *
 * Slots with status = 'not_applicable' are excluded from denominators entirely.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DocumentSlotInput {
  id: string
  slot_name: string
  slot_slug: string
  is_required: boolean
  is_active: boolean
  status: string                // 'pending' | 'uploaded' | 'accepted' | 'rejected' | 'not_applicable' | etc.
  expiry_date: string | null
  issue_date: string | null
  current_document_id: string | null
}

export interface ReadinessInput {
  slots: DocumentSlotInput[]
  portalLastLogin: string | null  // ISO timestamp or null
  nowIso?: string                 // Override for deterministic testing; defaults to Date.now()
}

export interface ReadinessBreakdown {
  documents: number       // 0–100 raw D score
  forensic: number        // 0–100 raw F score
  clientPulse: number     // 0 or 100
}

export interface ReadinessOutput {
  score: number                     // 0–100 composite
  breakdown: ReadinessBreakdown
  missingDocs: string[]             // slot_name of required docs not yet accepted/uploaded
  missingMetadata: string[]         // slot_name of uploaded docs missing expiry_date or issue_date
}

// ── Weights ───────────────────────────────────────────────────────────────────

const WEIGHT_DOCUMENTS = 0.60
const WEIGHT_FORENSIC  = 0.30
const WEIGHT_CLIENT    = 0.10

/** Portal login is considered "active" if within this many days. */
const CLIENT_PULSE_WINDOW_DAYS = 7

// ── Matter Type Default Requirements ──────────────────────────────────────────

/**
 * Default required document slugs per matter type.
 * These are used to seed document_slot_templates when a matter is created.
 * The calculator itself operates on the actual slots passed in, but
 * consumers can reference this map for validation or UI hints.
 */
export const MatterTypeRequirements: Record<string, {
  label: string
  requiredDocs: string[]
}> = {
  'spousal-sponsorship': {
    label: 'Spousal Sponsorship',
    requiredDocs: [
      'marriage-certificate',
      'proof-of-relationship',
      'sponsor-id',
      'sponsored-person-id',
      'police-clearance-sponsor',
      'police-clearance-sponsored',
      'medical-exam',
      'photos-of-relationship',
      'sponsor-income-proof',
      'communication-evidence',
    ],
  },
  'work-permit': {
    label: 'Work Permit',
    requiredDocs: [
      'passport',
      'lmia-or-exemption',
      'job-offer-letter',
      'resume-cv',
      'educational-credentials',
      'police-clearance',
      'medical-exam',
      'proof-of-funds',
    ],
  },
  'permanent-residence': {
    label: 'Permanent Residence',
    requiredDocs: [
      'passport',
      'language-test-results',
      'educational-credential-assessment',
      'police-clearance',
      'medical-exam',
      'proof-of-funds',
      'reference-letters',
      'photos',
    ],
  },
  'refugee-claim': {
    label: 'Refugee Claim',
    requiredDocs: [
      'basis-of-claim-form',
      'identity-document',
      'country-condition-evidence',
      'personal-narrative',
      'police-clearance',
      'medical-exam',
    ],
  },
  'family-law': {
    label: 'Family Law',
    requiredDocs: [
      'marriage-certificate',
      'financial-disclosure',
      'parenting-plan',
      'property-valuation',
      'income-tax-returns',
      'identification',
    ],
  },
  'real-estate': {
    label: 'Real Estate',
    requiredDocs: [
      'agreement-of-purchase-sale',
      'title-search',
      'survey-certificate',
      'property-tax-certificate',
      'identification',
      'mortgage-commitment',
    ],
  },
  'corporate': {
    label: 'Corporate',
    requiredDocs: [
      'articles-of-incorporation',
      'shareholder-agreement',
      'minute-book',
      'corporate-bylaws',
      'identification-directors',
      'financial-statements',
    ],
  },
  'general': {
    label: 'General',
    requiredDocs: [
      'identification',
      'retainer-agreement',
    ],
  },
}

// ── Calculator ────────────────────────────────────────────────────────────────

/**
 * Calculate the deterministic readiness score from structured data.
 * This function is pure: same input always produces same output.
 */
export function calculateReadinessScore(input: ReadinessInput): ReadinessOutput {
  const now = input.nowIso ? new Date(input.nowIso).getTime() : Date.now()

  // ── Filter active slots, excluding 'not_applicable' ──────────────────────
  const activeSlots = input.slots.filter(
    (s) => s.is_active && s.status !== 'not_applicable',
  )

  // ── D: Document Completeness (60%) ───────────────────────────────────────
  const requiredSlots = activeSlots.filter((s) => s.is_required)
  const completedStatuses = new Set(['accepted', 'uploaded'])
  const completedRequired = requiredSlots.filter((s) => completedStatuses.has(s.status))

  const missingDocs = requiredSlots
    .filter((s) => !completedStatuses.has(s.status))
    .map((s) => s.slot_name)

  const documentScore = requiredSlots.length > 0
    ? (completedRequired.length / requiredSlots.length) * 100
    : 100 // No required slots configured  -  treat as satisfied

  // ── F: Forensic Metadata (30%) ───────────────────────────────────────────
  // Only consider slots that have a document uploaded (i.e. have current_document_id or status uploaded/accepted)
  const uploadedSlots = activeSlots.filter(
    (s) => s.current_document_id !== null || s.status === 'uploaded' || s.status === 'accepted',
  )
  const forensicComplete = uploadedSlots.filter(
    (s) => s.expiry_date !== null && s.issue_date !== null,
  )

  const missingMetadata = uploadedSlots
    .filter((s) => s.expiry_date === null || s.issue_date === null)
    .map((s) => s.slot_name)

  const forensicScore = uploadedSlots.length > 0
    ? (forensicComplete.length / uploadedSlots.length) * 100
    : 100 // No uploaded docs  -  no forensic penalty

  // ── C: Client Pulse (10%) ────────────────────────────────────────────────
  let clientPulseScore = 0
  if (input.portalLastLogin) {
    const loginMs = new Date(input.portalLastLogin).getTime()
    const daysSinceLogin = (now - loginMs) / (1000 * 60 * 60 * 24)
    if (daysSinceLogin <= CLIENT_PULSE_WINDOW_DAYS) {
      clientPulseScore = 100
    }
  }

  // ── Composite ────────────────────────────────────────────────────────────
  const rawScore =
    (documentScore * WEIGHT_DOCUMENTS) +
    (forensicScore * WEIGHT_FORENSIC) +
    (clientPulseScore * WEIGHT_CLIENT)

  const score = Math.round(rawScore)

  return {
    score,
    breakdown: {
      documents: Math.round(documentScore),
      forensic: Math.round(forensicScore),
      clientPulse: clientPulseScore,
    },
    missingDocs,
    missingMetadata,
  }
}
