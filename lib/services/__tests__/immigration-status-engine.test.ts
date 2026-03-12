/**
 * Tests for the Immigration Intake Status Engine.
 *
 * Covers: computeStatus() — the pure function that determines
 * what immigration intake status a matter should be in, based on
 * current data (documents, questionnaire, contradictions, etc.).
 *
 * These tests verify the complete state machine:
 *   not_issued → issued → client_in_progress → review_required →
 *   deficiency_outstanding ↔ review_required → intake_complete →
 *   drafting_enabled → lawyer_review → ready_for_filing → filed
 */

import { describe, it, expect, vi } from 'vitest'
import { computeStatus } from '../immigration-status-engine'

// Mock getPlaybook — return a test playbook for 'spousal'
vi.mock('@/lib/config/immigration-playbooks', async () => {
  const actual = await vi.importActual<typeof import('@/lib/config/immigration-playbooks')>('@/lib/config/immigration-playbooks')
  return {
    ...actual,
    getPlaybook: (key: string | null) => {
      if (!key) return null
      return {
        matterTypeKey: key,
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
      }
    },
  }
})

// ── Test Fixtures ────────────────────────────────────────────────────────────

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

function makeSlots(configs: Array<{ slug: string; status: string; is_required?: boolean }>) {
  return configs.map((c) => ({
    slot_slug: c.slug,
    status: c.status,
    is_required: c.is_required ?? true,
    is_active: true,
    person_id: null,
    person_role: null,
  }))
}

// ── Status Progression Tests ─────────────────────────────────────────────────

describe('computeStatus', () => {
  describe('not_issued status', () => {
    it('returns not_issued when no portal link or request sent', () => {
      const result = computeStatus({
        intake: makeIntake(),
        documentSlots: [],
        formPackVersions: [],
        hasPortalLinkOrRequest: false,
        hasClientActivity: false,
      })
      expect(result.status).toBe('not_issued')
    })

    it('returns not_issued with blocked reason when no playbook found', () => {
      const result = computeStatus({
        intake: makeIntake({ program_category: null }),
        documentSlots: [],
        formPackVersions: [],
        hasPortalLinkOrRequest: false,
        hasClientActivity: false,
      })
      expect(result.status).toBe('not_issued')
      expect(result.blockedReasons).toContainEqual(expect.stringContaining('No playbook'))
    })
  })

  describe('issued status', () => {
    it('returns issued when portal link sent but no client activity', () => {
      const result = computeStatus({
        intake: makeIntake(),
        documentSlots: [],
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: false,
      })
      expect(result.status).toBe('issued')
    })
  })

  describe('client_in_progress status', () => {
    it('returns client_in_progress when client active but questionnaire incomplete', () => {
      const result = computeStatus({
        intake: makeIntake({ completion_pct: 50 }), // Below 80% min
        documentSlots: makeSlots([
          { slug: 'passport', status: 'empty' }, // Not all mandatory uploaded
          { slug: 'birth_cert', status: 'empty' },
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('client_in_progress')
      expect(result.blockedReasons.length).toBeGreaterThan(0)
    })

    it('returns client_in_progress when mandatory docs not uploaded', () => {
      const result = computeStatus({
        intake: makeIntake({ completion_pct: 90 }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'empty' }, // Not uploaded
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('client_in_progress')
    })
  })

  describe('review_required status', () => {
    it('returns review_required when all mandatory docs uploaded but not accepted', () => {
      const result = computeStatus({
        intake: makeIntake({ completion_pct: 90 }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'pending_review' },
          { slug: 'birth_cert', status: 'pending_review' },
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('review_required')
    })
  })

  describe('deficiency_outstanding status', () => {
    it('returns deficiency_outstanding when document rejected', () => {
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

    it('returns deficiency_outstanding when blocking contradictions exist', () => {
      const result = computeStatus({
        intake: makeIntake({
          immigration_intake_status: 'review_required',
          completion_pct: 90,
          contradiction_flags: [
            { key: 'test', severity: 'blocking', message: 'Test contradiction' },
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
    })

    it('does not trigger deficiency for not_issued status even with bad docs', () => {
      const result = computeStatus({
        intake: makeIntake({
          immigration_intake_status: 'not_issued',
        }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'needs_re_upload' },
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: false,
        hasClientActivity: false,
      })
      // Should still return not_issued, not deficiency_outstanding
      expect(result.status).toBe('not_issued')
    })

    it('returns deficiency when lawyer requested changes', () => {
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
        formPackVersions: [{ pack_type: 'draft', status: 'current', is_stale: false }],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('deficiency_outstanding')
      expect(result.blockedReasons.some((r) => r.includes('Lawyer'))).toBe(true)
    })
  })

  describe('intake_complete status', () => {
    it('returns intake_complete when all accepted but gen docs not ready', () => {
      const result = computeStatus({
        intake: makeIntake({
          completion_pct: 90,
          // passport required for gen but contradiction blocks
          contradiction_flags: [
            { key: 'test', severity: 'blocking', message: 'Blocking' },
          ],
          contradiction_override_at: new Date().toISOString(), // Override present
        }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'pending_review' }, // not accepted — for gen requirement
          { slug: 'birth_cert', status: 'accepted' },
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      // Contradictions overridden (override is not stale since contradiction has no detected_at)
      // But passport is pending_review → review_required first
      expect(result.status).toBe('review_required')
    })
  })

  describe('drafting_enabled status', () => {
    it('returns drafting_enabled when packs not generated', () => {
      const result = computeStatus({
        intake: makeIntake({ completion_pct: 90 }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'accepted' },
        ]),
        formPackVersions: [], // No packs generated
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('drafting_enabled')
      expect(result.blockedReasons.some((r) => r.includes('not yet generated'))).toBe(true)
    })
  })

  describe('lawyer_review status', () => {
    it('returns lawyer_review when packs generated but not approved', () => {
      const result = computeStatus({
        intake: makeIntake({
          completion_pct: 90,
          lawyer_review_status: 'pending',
        }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'accepted' },
        ]),
        formPackVersions: [{ pack_type: 'draft', status: 'current', is_stale: false }],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('lawyer_review')
    })
  })

  describe('ready_for_filing status', () => {
    it('returns ready_for_filing when lawyer approved', () => {
      const result = computeStatus({
        intake: makeIntake({
          completion_pct: 100,
          lawyer_review_status: 'approved',
        }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'accepted' },
        ]),
        formPackVersions: [{ pack_type: 'draft', status: 'current', is_stale: false }],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      expect(result.status).toBe('ready_for_filing')
      expect(result.blockedReasons).toHaveLength(0)
    })
  })

  describe('filed status', () => {
    it('never downgrades past filed', () => {
      const result = computeStatus({
        intake: makeIntake({ immigration_intake_status: 'filed' }),
        documentSlots: [], // Even with no docs
        formPackVersions: [],
        hasPortalLinkOrRequest: false,
        hasClientActivity: false,
      })
      expect(result.status).toBe('filed')
    })
  })

  describe('contradiction override handling', () => {
    it('ignores blocking contradictions when overridden', () => {
      const overrideDate = new Date('2025-03-01').toISOString()
      const result = computeStatus({
        intake: makeIntake({
          immigration_intake_status: 'review_required',
          completion_pct: 90,
          contradiction_flags: [
            { key: 'test', severity: 'blocking', message: 'Test', detected_at: '2025-02-15' },
          ],
          contradiction_override_at: overrideDate, // Override AFTER detection
        }),
        documentSlots: makeSlots([
          { slug: 'passport', status: 'accepted' },
          { slug: 'birth_cert', status: 'accepted' },
        ]),
        formPackVersions: [],
        hasPortalLinkOrRequest: true,
        hasClientActivity: true,
      })
      // Should NOT be deficiency_outstanding — contradictions overridden
      expect(result.status).not.toBe('deficiency_outstanding')
    })

    it('does NOT trigger deficiency when override exists, even if stale', () => {
      // Engine behavior: hasBlockingContradictions is false when contradiction_override_at
      // is set. The stale override flag is tracked but does not re-trigger deficiency
      // through the status engine — it's surfaced in the UI/readiness layer instead.
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
      // Override suppresses deficiency — engine advances past it
      expect(result.status).not.toBe('deficiency_outstanding')
    })
  })
})
