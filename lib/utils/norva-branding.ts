/**
 * Norva Signature Branding — centralised brand vocabulary.
 *
 * All UI labels, toast messages, and feature names use these constants
 * to maintain brand consistency across the entire platform.
 */

// ── The Norva Lexicon ────────────────────────────────────────────────────────

export const NORVA = {
  /** Product name */
  name: 'NorvaOS',

  /** Feature brands */
  submissionEngine: 'Norva Submission Engine',
  documentBridge: 'Norva Document Bridge',
  intelligence: 'Norva Intelligence',
  vault: 'Norva Vault',
  ledger: 'Norva Ledger',
  timeline: 'Norva Timeline',
  gatekeeper: 'Norva Gatekeeper',
  wiki: 'Norva Knowledge Wiki',
  scheduler: 'Norva Scheduler',
  sentinel: 'Norva Sentinel',

  /** Feature descriptions (for Norva Whispers) */
  whispers: {
    submissionEngine:
      'The Norva Submission Engine packages your client\'s documents, forms, and cover letters into a complete IRCC-ready submission.',
    documentBridge:
      'The Norva Document Bridge securely transfers client files into your matter workspace. Every upload is versioned and tracked.',
    intelligence:
      'Norva Intelligence uses your Wiki Playbooks and matter data to draft professional letters. Every data point is source-attributed — no hallucinations.',
    vault:
      'The Norva Vault tracks every security event, PII access, and permission change. Full audit trail, always.',
    ledger:
      'The Norva Ledger manages trust accounting with bank-grade precision. C1 invariant: no negative client balances.',
    timeline:
      'The Norva Timeline shows every activity, event, and change across your matter — a complete operational history.',
    gatekeeper:
      'The Norva Gatekeeper validates incoming data at every stage. If a submission fails, it tells you exactly what\'s missing and where to fix it.',
    wiki:
      'The Norva Knowledge Wiki stores your firm\'s playbooks, SOPs, and reusable snippets. Your shared brain — searchable in under 100ms.',
    scheduler:
      'The Norva Scheduler replaces Calendly with native booking. Availability is dynamic — tasks and events automatically block slots.',
    sentinel:
      'The Norva Sentinel enforces 4-layer security: authentication, authorisation, tenant isolation, and data integrity.',
  },
} as const

// ── Actionable Error Solutions ───────────────────────────────────────────────

export const NORVA_SOLUTIONS: Record<string, { title: string; action: string }> = {
  // ── Immigration / Matter ────────────────────────────────────────────────────
  missing_passport:      { title: 'Passport Number Required', action: 'Go to the client profile and enter the passport details under Immigration Profile.' },
  missing_email:         { title: 'Email Address Required', action: 'Add the client\'s email in Contacts > Primary Email to proceed.' },
  missing_retainer:      { title: 'Retainer Not Signed', action: 'Send the retainer agreement via the Documents tab, then mark it as signed.' },
  missing_payment:       { title: 'Payment Not Received', action: 'Record the payment in the Billing tab or check the Norva Ledger for pending transactions.' },
  conflict_detected:     { title: 'Conflict of Interest Detected', action: 'Review the conflict details in the Norva Vault and resolve or document a waiver.' },
  document_expired:      { title: 'Document Has Expired', action: 'Request an updated document from the client via the Norva Document Bridge.' },
  submission_incomplete: { title: 'Submission Incomplete', action: 'The Norva Gatekeeper found missing items. Check the checklist for required documents.' },
  missing_contact:       { title: 'Primary Contact Required', action: 'Add a primary contact to this matter before starting the questionnaire. Go to the Details tab > People section.' },

  // ── Settings / Admin ────────────────────────────────────────────────────────
  save_failed:           { title: 'Save Failed', action: 'Check your connection and try again. If the issue persists, reload the page.' },
  seat_limit:            { title: 'Seat Limit Reached', action: 'Deactivate an unused user or upgrade your plan in Settings > Billing.' },
  duplicate_name:        { title: 'Name Already Exists', action: 'Choose a different name or rename the existing item to avoid conflicts.' },
  connection_failed:     { title: 'Connection Failed', action: 'Check your internet connection and try signing in again. If using OAuth, ensure pop-ups are not blocked.' },

  // ── Auth ────────────────────────────────────────────────────────────────────
  auth_failed:           { title: 'Authentication Error', action: 'Double-check your credentials and try again. If you forgot your password, use the "Forgot Password" link.' },
  invite_failed:         { title: 'Invitation Error', action: 'This invitation may have expired or already been used. Contact your firm administrator for a new invite.' },
}

// ── Actionable Toast Helper ──────────────────────────────────────────────────

/**
 * norvaToast — branded error toast with guided resolution.
 *
 * Usage:
 *   import { norvaToast } from '@/lib/utils/norva-branding'
 *   norvaToast('missing_contact')                      // dictionary lookup
 *   norvaToast('save_failed', err.message)             // with error detail
 *   norvaToast(null, 'Custom message', 'Try X then Y') // inline
 */
export function norvaToast(
  solutionKey: string | null,
  errorDetail?: string,
  inlineAction?: string,
) {
  // Lazy import to avoid circular deps — sonner is always loaded in client
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { toast } = require('sonner') as typeof import('sonner')

  if (solutionKey && NORVA_SOLUTIONS[solutionKey]) {
    const sol = NORVA_SOLUTIONS[solutionKey]
    toast.error(sol.title, {
      description: `${errorDetail ? errorDetail + ' — ' : ''}${sol.action}`,
      duration: 8000,
    })
  } else {
    toast.error(errorDetail ?? 'Something went wrong', {
      description: inlineAction ?? 'Check your connection and try again.',
      duration: 6000,
    })
  }
}
