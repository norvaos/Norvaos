/**
 * =============================================================================
 * Directive 044: Onboarding Orchestrator
 * =============================================================================
 *
 * Manages the "Emerald Path" first-day walkthrough. After the Genesis Spark
 * clears, this orchestrator guides the user through their first matter
 * workspace with spotlight steps:
 *
 *   Step 1: Upload Zone  -  "Drop the Client's Passport here."
 *   Step 2: Meeting Recorder  -  "Start your intake call here."
 *   Step 3: Readiness Ring  -  "This is your Compliance Heartbeat."
 *
 * State is tracked per-user via has_completed_onboarding_walkthrough flag.
 * The orchestrator is stateless  -  it simply defines the step config and
 * checks whether the walkthrough should be shown.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface WalkthroughStep {
  id: string
  target: string          // CSS selector for the spotlight target
  title: string
  description: string
  placement: 'top' | 'bottom' | 'left' | 'right'
  icon: 'upload' | 'mic' | 'gauge'
}

export interface GhostDocumentDef {
  slot_name: string
  category: string
  is_required: boolean
}

// ── Walkthrough Steps ────────────────────────────────────────────────────────

export const EMERALD_PATH_STEPS: WalkthroughStep[] = [
  {
    id: 'upload-zone',
    target: '[data-walkthrough="upload-zone"]',
    title: 'The Forensic Scan',
    description:
      "Drop the Client's Passport here. I'll verify the identity and check for 0-Day gaps automatically.",
    placement: 'right',
    icon: 'upload',
  },
  {
    id: 'meeting-recorder',
    target: '[data-walkthrough="meeting-recorder"]',
    title: 'The Meeting Pulse',
    description:
      "Start your intake call here. My AI will transcribe the law and pull the facts into your task list.",
    placement: 'left',
    icon: 'mic',
  },
  {
    id: 'readiness-ring',
    target: '[data-walkthrough="readiness-ring"]',
    title: 'The Readiness Ring',
    description:
      "This is your Compliance Heartbeat. As we verify documents, this turns Gold. We hit 100 before we submit.",
    placement: 'bottom',
    icon: 'gauge',
  },
]

// ── Ghost Document Defaults ──────────────────────────────────────────────────
// Fallback configs for common matter types if no ghost_document_config is set
// on the matter_type record.

export const DEFAULT_GHOST_DOCUMENTS: Record<string, GhostDocumentDef[]> = {
  'spousal-sponsorship': [
    { slot_name: 'Passport (Principal)', category: 'identity', is_required: true },
    { slot_name: 'Passport (Spouse)', category: 'identity', is_required: true },
    { slot_name: 'Marriage Certificate', category: 'identity', is_required: true },
    { slot_name: 'Police Certificate (Principal)', category: 'legal', is_required: true },
    { slot_name: 'Police Certificate (Spouse)', category: 'legal', is_required: true },
    { slot_name: 'Proof of Relationship', category: 'correspondence', is_required: true },
    { slot_name: 'IMM 1344 - Sponsorship Agreement', category: 'immigration', is_required: true },
    { slot_name: 'Financial Proof (Sponsor)', category: 'financial', is_required: true },
    { slot_name: 'Photos Together', category: 'correspondence', is_required: false },
    { slot_name: 'Communication History', category: 'correspondence', is_required: false },
  ],
  'work-permit': [
    { slot_name: 'Passport', category: 'identity', is_required: true },
    { slot_name: 'LMIA / Job Offer', category: 'immigration', is_required: true },
    { slot_name: 'Employment Letter', category: 'financial', is_required: true },
    { slot_name: 'Education Credentials', category: 'identity', is_required: true },
    { slot_name: 'Police Certificate', category: 'legal', is_required: true },
    { slot_name: 'Resume / CV', category: 'other', is_required: false },
    { slot_name: 'Medical Exam Receipt', category: 'medical', is_required: false },
  ],
  'permanent-residence': [
    { slot_name: 'Passport', category: 'identity', is_required: true },
    { slot_name: 'Language Test Results', category: 'identity', is_required: true },
    { slot_name: 'Education Credential Assessment', category: 'identity', is_required: true },
    { slot_name: 'Police Certificate', category: 'legal', is_required: true },
    { slot_name: 'Medical Exam', category: 'medical', is_required: true },
    { slot_name: 'Employment References', category: 'financial', is_required: true },
    { slot_name: 'Proof of Funds', category: 'financial', is_required: true },
    { slot_name: 'Photos', category: 'identity', is_required: false },
  ],
  'refugee-claim': [
    { slot_name: 'Passport / Travel Document', category: 'identity', is_required: true },
    { slot_name: 'BOC (Basis of Claim)', category: 'immigration', is_required: true },
    { slot_name: 'Identity Documents', category: 'identity', is_required: true },
    { slot_name: 'Country Condition Evidence', category: 'legal', is_required: true },
    { slot_name: 'Personal Declaration', category: 'legal', is_required: true },
    { slot_name: 'Medical / Psychological Report', category: 'medical', is_required: false },
    { slot_name: 'News Articles / Reports', category: 'correspondence', is_required: false },
  ],
  'family-law': [
    { slot_name: 'Marriage Certificate', category: 'identity', is_required: true },
    { slot_name: 'Financial Statement', category: 'financial', is_required: true },
    { slot_name: 'Tax Returns (3 Years)', category: 'financial', is_required: true },
    { slot_name: 'Property Valuations', category: 'financial', is_required: false },
    { slot_name: 'Parenting Plan', category: 'legal', is_required: false },
    { slot_name: 'Separation Agreement', category: 'legal', is_required: false },
  ],
}

// ── Helper: resolve ghost docs for a matter type ─────────────────────────────

export function resolveGhostDocuments(
  matterTypeSlug: string | null,
  ghostDocumentConfig: GhostDocumentDef[] | null,
): GhostDocumentDef[] {
  // Use explicit config if set on the matter type
  if (ghostDocumentConfig && ghostDocumentConfig.length > 0) {
    return ghostDocumentConfig
  }

  // Fall back to built-in defaults
  if (matterTypeSlug) {
    const slug = matterTypeSlug.toLowerCase().replace(/\s+/g, '-')
    return DEFAULT_GHOST_DOCUMENTS[slug] ?? []
  }

  return []
}

// ── Helper: check if walkthrough should show ─────────────────────────────────

export function shouldShowWalkthrough(
  hasCompletedWalkthrough: boolean | null,
  matterHasGenesis: boolean,
): boolean {
  // Only show if genesis is sealed AND user hasn't completed walkthrough
  if (hasCompletedWalkthrough) return false
  if (!matterHasGenesis) return false
  return true
}
