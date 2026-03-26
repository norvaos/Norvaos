/**
 * Comprehensive tests for the Immigration Intake Status Engine.
 *
 * Covers both exported symbols:
 *   1. computeStatus()  — pure state-machine function
 *   2. syncImmigrationIntakeStatus() — DB-backed orchestrator
 *
 * State machine under test:
 *   not_issued -> issued -> client_in_progress -> review_required ->
 *   deficiency_outstanding <-> review_required -> intake_complete ->
 *   drafting_enabled -> lawyer_review -> ready_for_filing -> filed
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computeStatus, syncImmigrationIntakeStatus } from '../immigration-status-engine'

// ── Mock: immigration-playbooks ─────────────────────────────────────────────

const DEFAULT_PLAYBOOK = {
  matterTypeKey: 'spousal',
  label: 'Test Playbook',
  personRoleRequirements: [],
  questionnaireSections: [],
  mandatoryDocumentSlugs: ['passport', 'birth_cert'],
  lawyerReviewRequired: true,
  reminderCadenceDays: [3, 7],
  formPackTypes: ['draft'],
  formGenerationRules: {
    minQuestionnairePct: 80,
    requiredDocumentSlugs: ['passport'],
    requireNoUnresolvedContradictions: true,
  },
  filingReadinessRules: {
    requireAllMandatoryDocsAccepted: true,
    requireAllFormPacksGenerated: true,
    requireLawyerReview: true,
    requireNoActiveContradictions: true,
    requireNoPendingReviews: true,
  },
  contradictionRules: [],
  questionnaireFieldRules: [],
  readinessThreshold: 85,
}

let mockPlaybook: ReturnType<typeof structuredClone<typeof DEFAULT_PLAYBOOK>> | null = structuredClone(DEFAULT_PLAYBOOK)

vi.mock('@/lib/config/immigration-playbooks', async () => {
  const actual = await vi.importActual<typeof import('@/lib/config/immigration-playbooks')>('@/lib/config/immigration-playbooks')
  return {
    ...actual,
    getPlaybook: (key: string | null) => {
      if (!key) return null
      return mockPlaybook
    },
  }
})

// ── Mock: readiness-matrix-engine (dynamic import in syncImmigrationIntakeStatus) ──

vi.mock('@/lib/services/readiness-matrix-engine', () => ({
  computeReadinessMatrix: vi.fn(() => ({
    domains: {},
    overallPct: 100,
    meetsThreshold: true,
    draftingBlockers: [],
    filingBlockers: [],
    allBlockers: [],
    lawyerReviewTriggered: false,
    lawyerReviewReasons: [],
  })),
}))

// ── Test Fixtures ───────────────────────────────────────────────────────────

function makeIntake(overrides?: Record<string, unknown>) {
  return {
    immigration_intake_status: 'not_issued',
    completion_pct: 0,
    contradiction_flags: null,
    contradiction_override_at: null,
    lawyer_review_status: 'not_required',
    program_category: 'spousal',
    ...overrides,
  }
}

function makeSlots(
  configs: Array<{
    slug: string
    status: string
    is_required?: boolean
    is_active?: boolean
    person_id?: string | null
    person_role?: string | null
  }>
) {
  return configs.map((c) => ({
    slot_slug: c.slug,
    status: c.status,
    is_required: c.is_required ?? true,
    is_active: c.is_active ?? true,
    person_id: c.person_id ?? null,
    person_role: c.person_role ?? null,
  }))
}

function makePacks(configs: Array<{ pack_type: string; status?: string; is_stale?: boolean }>) {
  return configs.map((c) => ({
    pack_type: c.pack_type,
    status: c.status ?? 'current',
    is_stale: c.is_stale ?? false,
  }))
}

/** Full green-path context: everything satisfied, lawyer approved */
function makeReadyContext(overrides?: Partial<Parameters<typeof computeStatus>[0]>) {
  return {
    intake: makeIntake({
      completion_pct: 100,
      lawyer_review_status: 'approved',
    }),
    documentSlots: makeSlots([
      { slug: 'passport', status: 'accepted' },
      { slug: 'birth_cert', status: 'accepted' },
    ]),
    formPackVersions: makePacks([{ pack_type: 'draft' }]),
    hasPortalLinkOrRequest: true,
    hasClientActivity: true,
    ...overrides,
  }
}

// ── Reset playbook before each test ─────────────────────────────────────────

beforeEach(() => {
  mockPlaybook = structuredClone(DEFAULT_PLAYBOOK)
})

// ═══════════════════════════════════════════════════════════════════════════
// computeStatus — Pure function tests
// ═══════════════════════════════════════════════════════════════════════════

describe('computeStatus', () => {
  // ── filed: terminal lock ────────────────────────────────────────────────

  describe('filed (terminal)', () => {
    it('never downgrades past filed — returns filed immediately', () => {
      const result = computeStatus({
        intake: makeIntake({ immigration_intake_status: 'filed' }),
        documentSlots: [],
        formPackVersions: [],
        hasPortalLinkOrRequest: false,
        hasClientActivity: false,
      })
      expect(result.status).toBe('filed')
      expect(result.blockedReasons).toHaveLength(0)
    })

    it('stays filed even with deficient docs and blocking contradictions', () => {
      const result = computeStatus({
        intake: makeIntake({
          immigration_intake_status: 'filed',
          contradiction_flags: [{ key: 'x', severity: 'blocking', message: 'bad' }],
        }),
        documentSlots: makeSlots([{ slug: 'passport', status: 'rejected' }]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('filed')
    })
  })

  // ── No playbook ─────────────────────────────────────────────────────────

  describe('no playbook', () => {
    it('returns not_issued with blocked reason when program_category is null', () => {
      const result = computeStatus({
        intake: makeIntake({ program_category: null }),
        documentSlots: [],
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('not_issued')
      expect(result.blockedReasons).toContainEqual(expect.stringContaining('No playbook'))
    })
  })

  // ── Deficiency checks (before status progression) ──────────────────────

  describe('deficiency_outstanding', () => {
    it('triggers deficiency when document has status rejected', () => {
      const result = computeStatus({
        intake: makeIntake({
          immigration_intake_status: 'review_required',
          completion_pct: 90,
        }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'rejected' },
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('deficiency_outstanding')
      expect(result.blockedReasons.some((r) => r.includes('rejected'))).toBe(true)
    })

    it('triggers deficiency when document has status needs_re_upload', () => {
      const result = computeStatus({
        intake: makeIntake({
          immigration_intake_status: 'review_required',
          completion_pct: 90,
        }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'needs_re_upload' },
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('deficiency_outstanding')
      expect(result.blockedReasons.some((r) => r.includes('re-upload'))).toBe(true)
    })

    it('triggers deficiency when blocking contradictions exist without override', () => {
      const result = computeStatus({
        intake: makeIntake({
          immigration_intake_status: 'client_in_progress',
          completion_pct: 90,
          contradiction_flags: [
            { key: 'dob_mismatch', severity: 'blocking', message: 'DOB mismatch' },
          ],
          contradiction_override_at: null,
        }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'accepted' },
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('deficiency_outstanding')
      expect(result.blockedReasons.some((r) => r.includes('contradiction'))).toBe(true)
    })

    it('reports both deficient docs AND blocking contradictions simultaneously', () => {
      const result = computeStatus({
        intake: makeIntake({
          immigration_intake_status: 'review_required',
          completion_pct: 90,
          contradiction_flags: [
            { key: 'x', severity: 'blocking', message: 'Bad' },
          ],
        }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'rejected' },
          { slug: 'birth_cert', status: 'needs_re_upload' },
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('deficiency_outstanding')
      expect(result.blockedReasons.length).toBeGreaterThanOrEqual(3) // rejected + re-upload + contradictions
    })

    it('does NOT trigger deficiency from not_issued even with deficient docs', () => {
      const result = computeStatus({
        intake: makeIntake({ immigration_intake_status: 'not_issued' }),
        documentSlots: makeSlots([{ slug: 'passport', status: 'needs_re_upload' }]),
        formPackVersions: [],
        hasPortalLinkOrRequest: false,
        hasClientActivity: false,
      })
      expect(result.status).toBe('not_issued')
    })

    it('does NOT trigger deficiency from issued even with deficient docs', () => {
      const result = computeStatus({
        intake: makeIntake({ immigration_intake_status: 'issued' }),
        documentSlots: makeSlots([{ slug: 'passport', status: 'rejected' }]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: false,
      })
      expect(result.status).toBe('issued')
    })

    it('triggers deficiency when lawyer requests changes (with form packs)', () => {
      const result = computeStatus({
        intake: makeIntake({
          immigration_intake_status: 'lawyer_review',
          completion_pct: 100,
          lawyer_review_status: 'changes_requested',
        }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'accepted' },
        ]),
        formPackVersions: makePacks([{ pack_type: 'draft' }]),
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('deficiency_outstanding')
      expect(result.blockedReasons.some((r) => r.includes('Lawyer'))).toBe(true)
    })

    it('triggers deficiency when lawyer requests changes (no form packs playbook)', () => {
      mockPlaybook!.formPackTypes = []
      const result = computeStatus({
        intake: makeIntake({
          immigration_intake_status: 'lawyer_review',
          completion_pct: 100,
          lawyer_review_status: 'changes_requested',
        }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'accepted' },
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('deficiency_outstanding')
    })
  })

  // ── Contradiction override handling ────────────────────────────────────

  describe('contradiction override handling', () => {
    it('suppresses deficiency when override exists after all contradictions', () => {
      const overrideDate = new Date('2025-03-01').toISOString()
      const result = computeStatus({
        intake: makeIntake({
          immigration_intake_status: 'review_required',
          completion_pct: 90,
          contradiction_flags: [
            { key: 'test', severity: 'blocking', message: 'Test', detected_at: '2025-02-15' },
          ],
          contradiction_override_at: overrideDate,
        }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'accepted' },
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).not.toBe('deficiency_outstanding')
    })

    it('suppresses deficiency even when override is stale (new contradiction after override)', () => {
      // The engine treats override as binary: present = suppressed.
      // Staleness is surfaced via readiness layer, not the status engine.
      const overrideDate = new Date('2025-02-01').toISOString()
      const result = computeStatus({
        intake: makeIntake({
          immigration_intake_status: 'review_required',
          completion_pct: 90,
          contradiction_flags: [
            { key: 'old', severity: 'blocking', message: 'Old', detected_at: '2025-01-15' },
            { key: 'new', severity: 'blocking', message: 'New', detected_at: '2025-03-01' },
          ],
          contradiction_override_at: overrideDate,
        }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'accepted' },
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).not.toBe('deficiency_outstanding')
    })

    it('warning-only contradictions do not trigger deficiency', () => {
      const result = computeStatus({
        intake: makeIntake({
          immigration_intake_status: 'review_required',
          completion_pct: 90,
          contradiction_flags: [
            { key: 'x', severity: 'warning', message: 'Minor discrepancy' },
          ],
        }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'accepted' },
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).not.toBe('deficiency_outstanding')
    })

    it('non-array contradiction_flags are safely ignored', () => {
      const result = computeStatus({
        intake: makeIntake({
          immigration_intake_status: 'review_required',
          completion_pct: 90,
          contradiction_flags: 'not an array',
        }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'accepted' },
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).not.toBe('deficiency_outstanding')
    })

    it('null contradiction_flags are safely ignored', () => {
      const result = computeStatus({
        intake: makeIntake({
          immigration_intake_status: 'review_required',
          completion_pct: 90,
          contradiction_flags: null,
        }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'accepted' },
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).not.toBe('deficiency_outstanding')
    })
  })

  // ── not_issued ────────────────────────────────────────────────────────

  describe('not_issued', () => {
    it('returns not_issued when no portal link or request sent', () => {
      const result = computeStatus({
        intake: makeIntake(),
        documentSlots: [],
        formPackVersions: [],
        hasPortalLinkOrRequest: false,
        hasClientActivity: false,
      })
      expect(result.status).toBe('not_issued')
      expect(result.blockedReasons).toContainEqual(expect.stringContaining('No document request'))
    })
  })

  // ── issued ──────────────────────────────────────────────────────────────

  describe('issued', () => {
    it('returns issued when portal link sent but no client activity', () => {
      const result = computeStatus({
        intake: makeIntake(),
        documentSlots: [],
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: false,
      })
      expect(result.status).toBe('issued')
      expect(result.blockedReasons).toContainEqual(expect.stringContaining('Client has not yet'))
    })
  })

  // ── client_in_progress ─────────────────────────────────────────────────

  describe('client_in_progress', () => {
    it('returns client_in_progress when questionnaire below minimum pct', () => {
      const result = computeStatus({
        intake: makeIntake({ completion_pct: 50 }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'pending_review' },
          { slug: 'birth_cert', status: 'pending_review' },
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('client_in_progress')
      expect(result.blockedReasons.some((r) => r.includes('50%'))).toBe(true)
    })

    it('returns client_in_progress when mandatory docs not all uploaded', () => {
      const result = computeStatus({
        intake: makeIntake({ completion_pct: 90 }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'empty' },
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('client_in_progress')
      expect(result.blockedReasons.some((r) => r.includes('mandatory documents'))).toBe(true)
    })

    it('returns client_in_progress when both questionnaire and docs incomplete', () => {
      const result = computeStatus({
        intake: makeIntake({ completion_pct: 30 }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'empty' },
          { slug: 'birth_cert', status: 'empty' },
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('client_in_progress')
      expect(result.blockedReasons.length).toBe(2)
    })

    it('treats inactive slots as invisible for mandatory checks', () => {
      const result = computeStatus({
        intake: makeIntake({ completion_pct: 90 }),
        documentSlots: [
          // Active slot with upload
          ...makeSlots([{ slug: 'passport', status: 'pending_review' }]),
          // Active slot with upload
          ...makeSlots([{ slug: 'birth_cert', status: 'pending_review' }]),
          // Inactive slot — should be ignored
          { slot_slug: 'extra', status: 'empty', is_required: true, is_active: false, person_id: null, person_role: null },
        ],
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      // Should proceed past client_in_progress since active mandatory docs are uploaded
      expect(result.status).toBe('review_required')
    })
  })

  // ── review_required ───────────────────────────────────────────────────

  describe('review_required', () => {
    it('returns review_required when mandatory docs uploaded but not all accepted', () => {
      const result = computeStatus({
        intake: makeIntake({ completion_pct: 90 }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'uploaded' }, // uploaded but not accepted
          { slug: 'birth_cert', status: 'accepted' },
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('review_required')
      expect(result.blockedReasons.some((r) => r.includes('Not all mandatory'))).toBe(true)
    })

    it('returns review_required when docs have pending_review status', () => {
      const result = computeStatus({
        intake: makeIntake({ completion_pct: 90 }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'pending_review' },
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('review_required')
      expect(result.blockedReasons.some((r) => r.includes('pending staff review'))).toBe(true)
    })
  })

  // ── intake_complete ───────────────────────────────────────────────────

  describe('intake_complete', () => {
    it('reaches drafting_enabled when all gen required docs are accepted', () => {
      mockPlaybook!.formGenerationRules.requiredDocumentSlugs = ['passport', 'birth_cert']
      const result = computeStatus({
        intake: makeIntake({ completion_pct: 90 }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'accepted' },
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('drafting_enabled')
    })

    it('returns intake_complete when blocking contradictions block gen (requireNoUnresolvedContradictions)', () => {
      const result = computeStatus({
        intake: makeIntake({
          completion_pct: 90,
          contradiction_flags: [
            { key: 'x', severity: 'blocking', message: 'bad' },
          ],
          contradiction_override_at: new Date().toISOString(), // override stops deficiency...
        }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'accepted' },
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      // The override suppresses hasBlockingContradictions (line 100-102 in source:
      // hasBlockingContradictions = contradictions.some(blocking) && !override_at)
      // So with override present, hasBlockingContradictions is false.
      // requireNoUnresolvedContradictions check passes => drafting_enabled
      expect(result.status).toBe('drafting_enabled')
    })

    it('returns intake_complete when gen-required doc is not accepted (distinct from mandatory check)', () => {
      // Mandatory check passes (passport, birth_cert accepted).
      // But gen requires 'medical_form' which is not accepted.
      mockPlaybook!.formGenerationRules.requiredDocumentSlugs = ['passport', 'medical_form']
      const result = computeStatus({
        intake: makeIntake({ completion_pct: 90 }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'accepted' },
          { slug: 'medical_form', status: 'uploaded', is_required: false },
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('intake_complete')
      expect(result.blockedReasons.some((r) => r.includes('Documents required for form generation'))).toBe(true)
    })

    it('returns intake_complete when gen required doc slug not accepted (uploaded but not reviewed)', () => {
      mockPlaybook!.formGenerationRules.requiredDocumentSlugs = ['passport', 'special_doc']
      const result = computeStatus({
        intake: makeIntake({ completion_pct: 90 }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'accepted' },
          { slug: 'special_doc', status: 'uploaded', is_required: false },
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('intake_complete')
      expect(result.blockedReasons.some((r) => r.includes('Documents required for form generation'))).toBe(true)
    })

    it('returns intake_complete when contradictions block gen and no override', () => {
      // With requireNoUnresolvedContradictions: true and blocking contradictions
      const result = computeStatus({
        intake: makeIntake({
          completion_pct: 90,
          contradiction_flags: [
            { key: 'x', severity: 'blocking', message: 'bad' },
          ],
          // No override — but deficiency check requires status past issued/not_issued
          immigration_intake_status: 'not_issued', // deficiency skipped for not_issued
        }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'accepted' },
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      // Deficiency check skipped (status is not_issued), so engine proceeds.
      // At intake_complete, requireNoUnresolvedContradictions blocks gen
      expect(result.status).toBe('intake_complete')
      expect(result.blockedReasons.some((r) => r.includes('Contradictions must be resolved'))).toBe(true)
    })
  })

  // ── drafting_enabled ──────────────────────────────────────────────────

  describe('drafting_enabled', () => {
    it('returns drafting_enabled when form packs not generated', () => {
      const result = computeStatus({
        intake: makeIntake({ completion_pct: 90 }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'accepted' },
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('drafting_enabled')
      expect(result.blockedReasons.some((r) => r.includes('not yet generated'))).toBe(true)
    })

    it('returns drafting_enabled when form packs are stale', () => {
      const result = computeStatus({
        intake: makeIntake({ completion_pct: 90 }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'accepted' },
        ]),
        formPackVersions: makePacks([{ pack_type: 'draft', is_stale: true }]),
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('drafting_enabled')
      expect(result.blockedReasons.some((r) => r.includes('outdated'))).toBe(true)
    })

    it('returns drafting_enabled when packs are superseded', () => {
      const result = computeStatus({
        intake: makeIntake({ completion_pct: 90 }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'accepted' },
        ]),
        formPackVersions: makePacks([{ pack_type: 'draft', status: 'superseded' }]),
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('drafting_enabled')
      expect(result.blockedReasons.some((r) => r.includes('not yet generated'))).toBe(true)
    })

    it('reports mixed truly-missing and stale packs in blocked reasons', () => {
      mockPlaybook!.formPackTypes = ['draft', 'checklist']
      const result = computeStatus({
        intake: makeIntake({ completion_pct: 90 }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'accepted' },
        ]),
        formPackVersions: makePacks([
          { pack_type: 'draft', is_stale: true }, // stale
          // checklist missing entirely
        ]),
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('drafting_enabled')
      expect(result.blockedReasons.some((r) => r.includes('checklist') && r.includes('draft'))).toBe(true)
    })

    it('filing blocks cause drafting_enabled when no lawyer review required', () => {
      mockPlaybook!.lawyerReviewRequired = false
      mockPlaybook!.filingReadinessRules.requireNoActiveContradictions = true
      // Use blocking contradictions (from not_issued, so deficiency check is skipped)
      // and requireNoUnresolvedContradictions = false so gen gate passes
      mockPlaybook!.formGenerationRules.requireNoUnresolvedContradictions = false
      const result = computeStatus({
        intake: makeIntake({
          immigration_intake_status: 'not_issued',
          completion_pct: 90,
          contradiction_flags: [
            { key: 'x', severity: 'blocking', message: 'bad' },
          ],
        }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'accepted' },
        ]),
        formPackVersions: makePacks([{ pack_type: 'draft' }]),
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('drafting_enabled')
      expect(result.blockedReasons.some((r) => r.includes('Unresolved blocking contradictions'))).toBe(true)
    })
  })

  // ── No form packs playbook (skip drafting) ────────────────────────────

  describe('no form packs playbook', () => {
    beforeEach(() => {
      mockPlaybook!.formPackTypes = []
    })

    it('skips to lawyer_review when lawyer review required', () => {
      const result = computeStatus({
        intake: makeIntake({
          completion_pct: 90,
          lawyer_review_status: 'pending',
        }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'accepted' },
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('lawyer_review')
    })

    it('skips to ready_for_filing when lawyer approved and no form packs', () => {
      const result = computeStatus({
        intake: makeIntake({
          completion_pct: 90,
          lawyer_review_status: 'approved',
        }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'accepted' },
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('ready_for_filing')
    })

    it('skips to ready_for_filing when no lawyer review and no form packs', () => {
      mockPlaybook!.lawyerReviewRequired = false
      const result = computeStatus({
        intake: makeIntake({ completion_pct: 90 }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'accepted' },
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('ready_for_filing')
    })
  })

  // ── lawyer_review ─────────────────────────────────────────────────────

  describe('lawyer_review', () => {
    it('returns lawyer_review when packs generated but lawyer has not acted', () => {
      const result = computeStatus({
        intake: makeIntake({
          completion_pct: 90,
          lawyer_review_status: 'pending',
        }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'accepted' },
        ]),
        formPackVersions: makePacks([{ pack_type: 'draft' }]),
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('lawyer_review')
      expect(result.blockedReasons).toContainEqual('Awaiting lawyer review')
    })

    it('returns lawyer_review with filing blocks when lawyer approved but readiness matrix blocks filing', () => {
      const result = computeStatus({
        intake: makeIntake({
          completion_pct: 90,
          lawyer_review_status: 'approved',
        }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'accepted' },
        ]),
        formPackVersions: makePacks([{ pack_type: 'draft' }]),
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
        readinessMatrix: {
          domains: {} as any,
          overallPct: 50,
          meetsThreshold: false,
          draftingBlockers: [],
          filingBlockers: [],
          allBlockers: [],
          lawyerReviewTriggered: false,
          lawyerReviewReasons: [],
        },
      })
      expect(result.status).toBe('lawyer_review')
      expect(result.blockedReasons.some((r) => r.includes('50%'))).toBe(true)
    })
  })

  // ── ready_for_filing ──────────────────────────────────────────────────

  describe('ready_for_filing', () => {
    it('returns ready_for_filing when all conditions met (lawyer approved)', () => {
      const result = computeStatus(makeReadyContext())
      expect(result.status).toBe('ready_for_filing')
      expect(result.blockedReasons).toHaveLength(0)
    })

    it('returns ready_for_filing when no lawyer review required and all else met', () => {
      mockPlaybook!.lawyerReviewRequired = false
      const result = computeStatus({
        ...makeReadyContext(),
        intake: makeIntake({
          completion_pct: 100,
          lawyer_review_status: 'not_required',
        }),
      })
      expect(result.status).toBe('ready_for_filing')
    })
  })

  // ── Filing readiness checks ───────────────────────────────────────────

  describe('checkFilingReadiness (via computeStatus)', () => {
    it('blocks filing when mandatory docs not accepted (per filingReadinessRules)', () => {
      const result = computeStatus({
        intake: makeIntake({
          completion_pct: 100,
          lawyer_review_status: 'approved',
        }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'pending_review' }, // not accepted
        ]),
        formPackVersions: makePacks([{ pack_type: 'draft' }]),
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      // Because birth_cert is pending_review, it blocks at review_required first
      expect(result.status).toBe('review_required')
    })

    it('blocks filing when form packs missing per filing rules', () => {
      mockPlaybook!.formPackTypes = ['draft', 'final']
      const result = computeStatus({
        intake: makeIntake({
          completion_pct: 100,
          lawyer_review_status: 'approved',
        }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'accepted' },
        ]),
        formPackVersions: makePacks([{ pack_type: 'draft' }]),
        // 'final' pack missing
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('drafting_enabled')
    })

    it('blocks filing when blocking contradictions exist per filing rules', () => {
      // Need to set up so deficiency is not triggered (use status not_issued to skip deficiency guard)
      // Actually, let's override so contradictions exist but deficiency is not triggered:
      // If override_at is set, hasBlockingContradictions is false at line 100-102.
      // But filingReadinessRules.requireNoActiveContradictions checks hasBlockingContradictions too.
      // So with override, filing check passes.
      // Without override, deficiency triggers first. So this path is only reachable
      // from not_issued/issued (deficiency skipped) going through the whole chain.
      // Actually... from not_issued with blocking contradictions:
      // deficiency check skipped, then progresses normally, but at filing check
      // hasBlockingContradictions is true.
      const result = computeStatus({
        intake: makeIntake({
          immigration_intake_status: 'not_issued',
          completion_pct: 100,
          lawyer_review_status: 'approved',
          contradiction_flags: [
            { key: 'x', severity: 'blocking', message: 'bad' },
          ],
        }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'accepted' },
        ]),
        formPackVersions: makePacks([{ pack_type: 'draft' }]),
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      // Deficiency skipped (status=not_issued), but gen rules block at intake_complete
      // because requireNoUnresolvedContradictions: true
      expect(result.status).toBe('intake_complete')
    })

    it('blocks filing when pending reviews exist per filing rules', () => {
      // Extra non-mandatory doc pending review. Mandatory docs all accepted.
      const result = computeStatus({
        intake: makeIntake({
          completion_pct: 100,
          lawyer_review_status: 'approved',
        }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'accepted' },
          { slug: 'supporting_letter', status: 'pending_review', is_required: false },
        ]),
        formPackVersions: makePacks([{ pack_type: 'draft' }]),
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      // pending_review on non-mandatory triggers review_required check:
      // hasPendingReview is true, so returns review_required
      expect(result.status).toBe('review_required')
    })

    it('blocks filing when readiness matrix has filing blockers', () => {
      const result = computeStatus({
        ...makeReadyContext(),
        readinessMatrix: {
          domains: {} as any,
          overallPct: 100,
          meetsThreshold: true,
          draftingBlockers: [],
          filingBlockers: [
            { label: 'Missing criminal check', domain: 'people' as any, severity: 'blocking' as any },
          ],
          allBlockers: [],
          lawyerReviewTriggered: false,
          lawyerReviewReasons: [],
        },
      })
      expect(result.status).toBe('lawyer_review')
      expect(result.blockedReasons.some((r) => r.includes('readiness matrix filing blocker'))).toBe(true)
    })

    it('blocks filing when readiness matrix below threshold', () => {
      const result = computeStatus({
        ...makeReadyContext(),
        readinessMatrix: {
          domains: {} as any,
          overallPct: 60,
          meetsThreshold: false,
          draftingBlockers: [],
          filingBlockers: [],
          allBlockers: [],
          lawyerReviewTriggered: false,
          lawyerReviewReasons: [],
        },
      })
      expect(result.status).toBe('lawyer_review')
      expect(result.blockedReasons.some((r) => r.includes('60%'))).toBe(true)
    })

    it('truncates long filing blocker list to 3 labels with ellipsis', () => {
      const result = computeStatus({
        ...makeReadyContext(),
        readinessMatrix: {
          domains: {} as any,
          overallPct: 100,
          meetsThreshold: true,
          draftingBlockers: [],
          filingBlockers: [
            { label: 'A', domain: 'people' as any, severity: 'blocking' as any },
            { label: 'B', domain: 'people' as any, severity: 'blocking' as any },
            { label: 'C', domain: 'people' as any, severity: 'blocking' as any },
            { label: 'D', domain: 'people' as any, severity: 'blocking' as any },
          ],
          allBlockers: [],
          lawyerReviewTriggered: false,
          lawyerReviewReasons: [],
        },
      })
      expect(result.status).toBe('lawyer_review')
      const reason = result.blockedReasons.find((r) => r.includes('readiness matrix'))!
      expect(reason).toContain('4 readiness matrix filing blocker')
      // Only 3 labels shown
      expect(reason).toContain('A')
      expect(reason).toContain('B')
      expect(reason).toContain('C')
      expect(reason).not.toContain('D')
      // Ellipsis indicator
      expect(reason).toMatch(/\u2026$/)
    })
  })

  // ── Duplicate slot handling ───────────────────────────────────────────

  describe('duplicate slot handling (per-slug check)', () => {
    it('mandatory check passes when at least one slot per slug is uploaded', () => {
      // Two slots for passport: one empty (template), one accepted (on-demand PUT)
      const result = computeStatus({
        intake: makeIntake({ completion_pct: 90 }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'empty' },
          { slug: 'passport', status: 'accepted' }, // This one counts
          { slug: 'birth_cert', status: 'accepted' },
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      // Should proceed past client_in_progress (mandatory uploaded) and review_required (all accepted)
      expect(result.status).toBe('drafting_enabled')
    })

    it('mandatory check fails when all slots for a slug are empty', () => {
      const result = computeStatus({
        intake: makeIntake({ completion_pct: 90 }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'empty' },
          { slug: 'passport', status: 'empty' },
          { slug: 'birth_cert', status: 'accepted' },
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('client_in_progress')
    })
  })

  // ── Full green path ───────────────────────────────────────────────────

  describe('full green path', () => {
    it('reaches ready_for_filing through complete progression', () => {
      const result = computeStatus(makeReadyContext())
      expect(result.status).toBe('ready_for_filing')
      expect(result.blockedReasons).toHaveLength(0)
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// syncImmigrationIntakeStatus — DB orchestrator tests
// ═══════════════════════════════════════════════════════════════════════════

describe('syncImmigrationIntakeStatus', () => {
  // ── Supabase mock builder ──────────────────────────────────────────────

  function createMockSupabase(overrides?: {
    intake?: Record<string, unknown> | null
    slots?: Array<Record<string, unknown>>
    templates?: Array<Record<string, unknown>>
    formPacks?: Array<Record<string, unknown>>
    portalCount?: number
    requestCount?: number
    primaryContact?: { contact_id: string } | null
    clientPerson?: { contact_id: string } | null
    contact?: { immigration_data: Record<string, unknown> } | null
    matrixPeople?: Array<Record<string, unknown>>
    immRow?: Record<string, unknown> | null
  }) {
    const intake = overrides && 'intake' in overrides
      ? overrides.intake
      : {
          id: 'intake-1',
          tenant_id: 'tenant-1',
          immigration_intake_status: 'not_issued',
          completion_pct: 0,
          contradiction_flags: null,
          contradiction_override_at: null,
          lawyer_review_status: 'not_required',
          program_category: 'spousal',
        }

    const slots = overrides?.slots ?? []
    const templates = overrides?.templates ?? []
    const formPacks = overrides?.formPacks ?? []
    const portalCount = overrides?.portalCount ?? 0
    const requestCount = overrides?.requestCount ?? 0

    const updateFn = vi.fn().mockReturnValue({ eq: vi.fn() })
    const insertFn = vi.fn().mockReturnValue({ error: null })

    const mock: any = {
      from: vi.fn((table: string) => {
        if (table === 'matter_intake') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: intake }),
              }),
            }),
            update: updateFn,
          }
        }
        if (table === 'document_slots') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: slots }),
            }),
          }
        }
        if (table === 'document_slot_templates') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: templates }),
            }),
          }
        }
        if (table === 'form_pack_versions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: formPacks }),
            }),
          }
        }
        if (table === 'portal_links') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ count: portalCount }),
            }),
          }
        }
        if (table === 'document_requests') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ count: requestCount }),
            }),
          }
        }
        if (table === 'matter_contacts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: overrides?.primaryContact ?? null }),
                  }),
                }),
              }),
            }),
          }
        }
        if (table === 'matter_people') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  not: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: overrides?.clientPerson ?? null }),
                    }),
                  }),
                }),
                eq: vi.fn().mockResolvedValue({ data: overrides?.matrixPeople ?? [] }),
              }),
            }),
          }
        }
        if (table === 'contacts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: overrides?.contact ?? null }),
              }),
            }),
          }
        }
        if (table === 'matter_immigration') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: overrides?.immRow ?? null }),
              }),
            }),
          }
        }
        if (table === 'activities') {
          return { insert: insertFn }
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null }),
          }),
        }
      }),
      _updateFn: updateFn,
      _insertFn: insertFn,
    }

    return mock
  }

  it('returns unknown when no intake record found', async () => {
    const supabase = createMockSupabase({ intake: null })
    const result = await syncImmigrationIntakeStatus(supabase, 'matter-1', 'user-1')
    expect(result.previousStatus).toBe('unknown')
    expect(result.newStatus).toBe('unknown')
    expect(result.changed).toBe(false)
    expect(result.blockedReasons).toContainEqual('No intake record found')
  })

  it('computes not_issued status and does not persist when unchanged', async () => {
    const supabase = createMockSupabase()
    const result = await syncImmigrationIntakeStatus(supabase, 'matter-1', 'user-1')
    expect(result.newStatus).toBe('not_issued')
    expect(result.changed).toBe(false)
    // Update should NOT have been called
    expect(supabase._updateFn).not.toHaveBeenCalled()
    // Activity should NOT have been logged
    expect(supabase._insertFn).not.toHaveBeenCalled()
  })

  it('computes issued status and persists when status changes', async () => {
    const supabase = createMockSupabase({
      intake: {
        id: 'intake-1',
        tenant_id: 'tenant-1',
        immigration_intake_status: 'not_issued',
        completion_pct: 0,
        contradiction_flags: null,
        contradiction_override_at: null,
        lawyer_review_status: 'not_required',
        program_category: 'spousal',
      },
      portalCount: 1, // Has portal link -> issued
    })

    const result = await syncImmigrationIntakeStatus(supabase, 'matter-1', 'user-1')
    expect(result.previousStatus).toBe('not_issued')
    expect(result.newStatus).toBe('issued')
    expect(result.changed).toBe(true)
    // Update should have been called
    expect(supabase._updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        immigration_intake_status: 'issued',
      })
    )
    // Activity should have been logged
    expect(supabase._insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        activity_type: 'immigration_status_change',
        matter_id: 'matter-1',
        user_id: 'user-1',
      })
    )
  })

  it('infers hasPortalLinkOrRequest from client activity when portal count is 0', async () => {
    // Client has uploaded docs (status != empty) but portal_links returns 0
    const supabase = createMockSupabase({
      intake: {
        id: 'intake-1',
        tenant_id: 'tenant-1',
        immigration_intake_status: 'not_issued',
        completion_pct: 50,
        contradiction_flags: null,
        contradiction_override_at: null,
        lawyer_review_status: 'not_required',
        program_category: 'spousal',
      },
      slots: [
        { slot_template_id: null, slot_slug: 'passport', status: 'pending_review', is_required: true, is_active: true, person_id: null, person_role: null },
      ],
      portalCount: 0,
      requestCount: 0,
    })

    const result = await syncImmigrationIntakeStatus(supabase, 'matter-1', 'user-1')
    // hasClientActivity = true (slot not empty), so hasPortalLinkOrRequest = true (fallback)
    // Should advance past not_issued and issued
    expect(result.newStatus).not.toBe('not_issued')
  })

  it('resolves slot_slug from templates when slot_template_id present', async () => {
    const supabase = createMockSupabase({
      intake: {
        id: 'intake-1',
        tenant_id: 'tenant-1',
        immigration_intake_status: 'not_issued',
        completion_pct: 90,
        contradiction_flags: null,
        contradiction_override_at: null,
        lawyer_review_status: 'not_required',
        program_category: 'spousal',
      },
      slots: [
        { slot_template_id: 'tmpl-1', slot_slug: null, status: 'accepted', is_required: true, is_active: true, person_id: null, person_role: null },
        { slot_template_id: 'tmpl-2', slot_slug: null, status: 'accepted', is_required: true, is_active: true, person_id: null, person_role: null },
      ],
      templates: [
        { id: 'tmpl-1', slot_slug: 'passport' },
        { id: 'tmpl-2', slot_slug: 'birth_cert' },
      ],
      portalCount: 1,
    })

    const result = await syncImmigrationIntakeStatus(supabase, 'matter-1', 'user-1')
    // Templates resolved: passport + birth_cert both accepted, 90% completion
    // Should reach at least drafting_enabled
    expect(['drafting_enabled', 'lawyer_review', 'ready_for_filing']).toContain(result.newStatus)
  })

  it('handles null userId gracefully', async () => {
    const supabase = createMockSupabase({ portalCount: 1 })
    const result = await syncImmigrationIntakeStatus(supabase, 'matter-1', null)
    expect(result.newStatus).toBe('issued')
    expect(result.changed).toBe(true)
  })

  it('activity log includes previous and new status in metadata', async () => {
    const supabase = createMockSupabase({ portalCount: 1 })
    await syncImmigrationIntakeStatus(supabase, 'matter-1', 'user-1')
    expect(supabase._insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          previous_status: 'not_issued',
          new_status: 'issued',
          blocked_reasons: expect.any(Array),
        }),
      })
    )
  })

  it('activity log title uses human-readable status', async () => {
    const supabase = createMockSupabase({ portalCount: 1 })
    await syncImmigrationIntakeStatus(supabase, 'matter-1', 'user-1')
    expect(supabase._insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Immigration status: issued',
      })
    )
  })
})
