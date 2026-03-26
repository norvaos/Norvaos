/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * E-Sign Subsystem  -  State Machine & Transition Rules
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Defines the signing request lifecycle and enforces valid transitions.
 *
 * States:
 *   pending      -  request created, not yet sent
 *   sent         -  email delivered to signer
 *   viewed       -  signer opened the signing page
 *   signed       -  signer executed signature (terminal)
 *   declined     -  signer declined to sign (terminal)
 *   expired      -  request expired without action (terminal)
 *   cancelled    -  lawyer cancelled the request (terminal)
 *   superseded   -  replaced by a new request (terminal)
 */

// ─── Status Constants ────────────────────────────────────────────────────────

export const SIGNING_STATUSES = [
  'pending',
  'sent',
  'viewed',
  'signed',
  'declined',
  'expired',
  'cancelled',
  'superseded',
] as const

export type SigningStatus = (typeof SIGNING_STATUSES)[number]

export const TERMINAL_STATUSES: readonly SigningStatus[] = [
  'signed',
  'declined',
  'expired',
  'cancelled',
  'superseded',
]

// ─── Valid Transitions ───────────────────────────────────────────────────────

export const VALID_SIGNING_TRANSITIONS: Record<SigningStatus, readonly SigningStatus[]> = {
  pending:    ['sent', 'cancelled'],
  sent:       ['viewed', 'expired', 'cancelled', 'superseded'],
  viewed:     ['signed', 'declined', 'expired', 'cancelled', 'superseded'],
  signed:     [],
  declined:   [],
  expired:    [],
  cancelled:  [],
  superseded: [],
}

// ─── Event Types ─────────────────────────────────────────────────────────────

export const SIGNING_EVENT_TYPES = [
  'created',
  'sent',
  'viewed',
  'signed',
  'declined',
  'expired',
  'cancelled',
  'superseded',
  'reminder_sent',
  'resent',
] as const

export type SigningEventType = (typeof SIGNING_EVENT_TYPES)[number]

// ─── Actor Types ─────────────────────────────────────────────────────────────

export const ACTOR_TYPES = ['system', 'lawyer', 'signer'] as const
export type ActorType = (typeof ACTOR_TYPES)[number]

// ─── Signature Modes ─────────────────────────────────────────────────────────

export const SIGNATURE_MODES = ['drawn', 'typed'] as const
export type SignatureMode = (typeof SIGNATURE_MODES)[number]

// ─── Document Types ──────────────────────────────────────────────────────────

export const DOCUMENT_TYPES = [
  'retainer_agreement',
  'engagement_letter',
  'disengagement_letter',
  'authorization',
  'acknowledgement',
  'general',
] as const

export type SigningDocumentType = (typeof DOCUMENT_TYPES)[number]

// ─── Transition Validation ───────────────────────────────────────────────────

/**
 * Validates a signing request status transition. Throws if invalid.
 */
export function validateSigningTransition(
  currentStatus: SigningStatus,
  newStatus: SigningStatus
): void {
  const allowed = VALID_SIGNING_TRANSITIONS[currentStatus]
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(
      `Invalid signing transition: "${currentStatus}" → "${newStatus}"`
    )
  }
}

/**
 * Returns true if the given status is a terminal state (no further transitions).
 */
export function isTerminalStatus(status: SigningStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

/**
 * Default signing request expiry in days.
 */
export const DEFAULT_EXPIRY_DAYS = 7
