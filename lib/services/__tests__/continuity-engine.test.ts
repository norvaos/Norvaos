/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Directives 018 / 024 — Continuity Engine & Document Freshness Tests
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Tests the Asymmetric Shield logic:
 *   1. Chronological gap detection (address + personal history)
 *   2. Overlap detection
 *   3. Continuity report generation
 *   4. Document freshness / stale-date monitoring
 */

import { describe, it, expect } from 'vitest'

// ─── Directive 018: Continuity Engine ────────────────────────────────────────

import {
  checkChronologicalGaps,
  checkOverlaps,
  generateContinuityReport,
  type DateRange,
} from '@/lib/utils/continuity'

describe('Directive 018: Continuity Engine — Gap Detection', () => {

  describe('checkChronologicalGaps', () => {
    it('returns gapless for continuous dates', () => {
      const ranges: DateRange[] = [
        { start_date: '2026-01-01', end_date: '2026-01-31' },
        { start_date: '2026-02-01', end_date: '2026-02-28' },
      ]
      const result = checkChronologicalGaps(ranges)
      expect(result.gaps).toHaveLength(0)
      expect(result.isGapless).toBe(true)
    })

    it('detects a 1-day gap', () => {
      const ranges: DateRange[] = [
        { start_date: '2026-01-01', end_date: '2026-01-30' },
        { start_date: '2026-02-01', end_date: '2026-02-28' },
      ]
      const result = checkChronologicalGaps(ranges)
      expect(result.isGapless).toBe(false)
      expect(result.gaps).toHaveLength(1)
      expect(result.gaps[0].gap_days).toBe(1)
      expect(result.gaps[0].gap_start).toBe('2026-01-31')
      expect(result.gaps[0].gap_end).toBe('2026-01-31')
    })

    it('detects a multi-day gap', () => {
      const ranges: DateRange[] = [
        { start_date: '2026-01-01', end_date: '2026-01-15' },
        { start_date: '2026-02-01', end_date: '2026-02-28' },
      ]
      const result = checkChronologicalGaps(ranges)
      expect(result.isGapless).toBe(false)
      expect(result.gaps).toHaveLength(1)
      expect(result.gaps[0].gap_days).toBe(16)
    })

    it('handles single entry', () => {
      const ranges: DateRange[] = [
        { start_date: '2026-01-01', end_date: '2026-06-30' },
      ]
      const result = checkChronologicalGaps(ranges)
      expect(result.isGapless).toBe(true)
      expect(result.gaps).toHaveLength(0)
    })

    it('handles empty array', () => {
      const result = checkChronologicalGaps([])
      expect(result.isGapless).toBe(true)
      expect(result.gaps).toHaveLength(0)
      expect(result.verifiedRanges).toBe(0)
    })

    it('sorts entries by start_date regardless of input order', () => {
      const ranges: DateRange[] = [
        { start_date: '2026-06-01', end_date: '2026-06-30' },
        { start_date: '2026-01-01', end_date: '2026-01-31' },
        { start_date: '2026-02-01', end_date: '2026-05-31' },
      ]
      const result = checkChronologicalGaps(ranges)
      expect(result.isGapless).toBe(true)
      expect(result.gaps).toHaveLength(0)
    })

    it('detects multiple gaps', () => {
      const ranges: DateRange[] = [
        { start_date: '2026-01-01', end_date: '2026-01-15' },
        { start_date: '2026-02-01', end_date: '2026-02-15' },
        { start_date: '2026-03-01', end_date: '2026-03-31' },
      ]
      const result = checkChronologicalGaps(ranges)
      expect(result.isGapless).toBe(false)
      expect(result.gaps).toHaveLength(2)
    })

    it('adjacent dates (end=Jan 31, start=Feb 1) → no gap', () => {
      const ranges: DateRange[] = [
        { start_date: '2026-01-01', end_date: '2026-01-31' },
        { start_date: '2026-02-01', end_date: '2026-02-28' },
      ]
      const result = checkChronologicalGaps(ranges)
      expect(result.isGapless).toBe(true)
    })

    it('same-day overlap is not a gap', () => {
      const ranges: DateRange[] = [
        { start_date: '2026-01-01', end_date: '2026-02-01' },
        { start_date: '2026-02-01', end_date: '2026-03-31' },
      ]
      const result = checkChronologicalGaps(ranges)
      expect(result.isGapless).toBe(true)
    })

    it('reports totalDarkDays correctly', () => {
      const ranges: DateRange[] = [
        { start_date: '2026-01-01', end_date: '2026-01-15' },
        { start_date: '2026-02-01', end_date: '2026-02-28' },
      ]
      const result = checkChronologicalGaps(ranges)
      expect(result.totalDarkDays).toBe(16)
    })
  })

  // ── checkOverlaps ─────────────────────────────────────────────────────

  describe('checkOverlaps', () => {
    it('returns no overlaps for non-overlapping ranges', () => {
      const ranges: DateRange[] = [
        { start_date: '2026-01-01', end_date: '2026-01-31' },
        { start_date: '2026-02-01', end_date: '2026-02-28' },
      ]
      const result = checkOverlaps(ranges)
      expect(result.hasOverlaps).toBe(false)
      expect(result.overlaps).toHaveLength(0)
    })

    it('detects overlapping ranges', () => {
      const ranges: DateRange[] = [
        { start_date: '2026-01-01', end_date: '2026-03-31' },
        { start_date: '2026-02-01', end_date: '2026-04-30' },
      ]
      const result = checkOverlaps(ranges)
      expect(result.hasOverlaps).toBe(true)
      expect(result.overlaps).toHaveLength(1)
    })

    it('handles contained ranges', () => {
      const ranges: DateRange[] = [
        { start_date: '2026-01-01', end_date: '2026-12-31' },
        { start_date: '2026-03-01', end_date: '2026-06-30' },
      ]
      const result = checkOverlaps(ranges)
      expect(result.hasOverlaps).toBe(true)
      expect(result.overlaps.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ── generateContinuityReport ──────────────────────────────────────────

  describe('generateContinuityReport', () => {
    it('fully continuous address + personal → isFullyContinuous = true, 0 blockers', () => {
      const addressHistory: DateRange[] = [
        { start_date: '2021-01-01', end_date: '2023-12-31' },
        { start_date: '2024-01-01', end_date: '2026-03-26' },
      ]
      const personalHistory: DateRange[] = [
        { start_date: '2020-01-01', end_date: '2026-03-26' },
      ]
      const report = generateContinuityReport(addressHistory, personalHistory)
      expect(report.isFullyContinuous).toBe(true)
      expect(report.blockers).toHaveLength(0)
      expect(report.totalGaps).toBe(0)
    })

    it('address gap → blocker string includes gap details', () => {
      const addressHistory: DateRange[] = [
        { start_date: '2021-01-01', end_date: '2022-06-30' },
        { start_date: '2023-01-01', end_date: '2026-03-26' },
      ]
      const personalHistory: DateRange[] = [
        { start_date: '2020-01-01', end_date: '2026-03-26' },
      ]
      const report = generateContinuityReport(addressHistory, personalHistory)
      expect(report.isFullyContinuous).toBe(false)
      expect(report.blockers.length).toBeGreaterThanOrEqual(1)
      const addressBlocker = report.blockers.find((b: string) =>
        b.toLowerCase().includes('address')
      )
      expect(addressBlocker).toBeDefined()
    })

    it('personal gap → blocker string', () => {
      const addressHistory: DateRange[] = [
        { start_date: '2020-01-01', end_date: '2026-03-26' },
      ]
      const personalHistory: DateRange[] = [
        { start_date: '2020-01-01', end_date: '2022-12-31' },
        { start_date: '2024-01-01', end_date: '2026-03-26' },
      ]
      const report = generateContinuityReport(addressHistory, personalHistory)
      expect(report.isFullyContinuous).toBe(false)
      expect(report.blockers.length).toBeGreaterThanOrEqual(1)
    })

    it('both gaps → totalGaps = sum', () => {
      const addressHistory: DateRange[] = [
        { start_date: '2021-01-01', end_date: '2022-06-30' },
        { start_date: '2023-01-01', end_date: '2026-03-26' },
      ]
      const personalHistory: DateRange[] = [
        { start_date: '2020-01-01', end_date: '2022-12-31' },
        { start_date: '2024-01-01', end_date: '2026-03-26' },
      ]
      const report = generateContinuityReport(addressHistory, personalHistory)
      expect(report.isFullyContinuous).toBe(false)
      expect(report.totalGaps).toBeGreaterThanOrEqual(2)
    })
  })
})

// ─── Directive 024: Document Freshness — Stale-Date Monitor ─────────────────

import {
  checkDocumentFreshness,
  checkMatterDocumentFreshness,
  PROCESSING_TIME_ESTIMATES,
} from '@/lib/services/document-freshness'

describe('Directive 024: Document Freshness — Stale-Date Monitor', () => {
  const today = new Date()

  function daysFromNow(days: number): string {
    const d = new Date(today)
    d.setDate(d.getDate() + days)
    return d.toISOString().split('T')[0]
  }

  function daysAgo(days: number): string {
    return daysFromNow(-days)
  }

  it('valid document with distant expiry → status "valid"', () => {
    const result = checkDocumentFreshness({
      id: 'doc-1',
      document_type: 'police_certificate',
      issue_date: daysFromNow(0),
      expiry_date: daysFromNow(730),
    })
    expect(result.status).toBe('valid')
  })

  it('expired document → status "expired"', () => {
    const result = checkDocumentFreshness({
      id: 'doc-2',
      document_type: 'police_certificate',
      issue_date: daysAgo(400),
      expiry_date: daysAgo(30),
    })
    expect(result.status).toBe('expired')
  })

  it('document expiring within 180 days but not stale → status "warning"', () => {
    // Issue date is recent (within 150 days), expiry within 180 days,
    // and not expiring during default processing (180 days)
    // Must ensure: daysUntilExpiry > 0, daysSinceIssue <= 150, and daysUntilExpiry >= processingDays
    // Use visitor_visa (42 days processing) so 120 day expiry > processing time
    const result = checkDocumentFreshness({
      id: 'doc-3',
      document_type: 'police_certificate',
      issue_date: daysAgo(30),
      expiry_date: daysFromNow(120),
    }, 'visitor_visa') // 42 day processing — won't expire during processing
    expect(result.status).toBe('warning')
  })

  it('document >150 days old → status "critical_stale"', () => {
    const result = checkDocumentFreshness({
      id: 'doc-4',
      document_type: 'police_certificate',
      issue_date: daysAgo(160),
      expiry_date: daysFromNow(200),
    })
    expect(result.status).toBe('critical_stale')
  })

  it('document will expire during processing → status "critical_stale"', () => {
    const result = checkDocumentFreshness(
      {
        id: 'doc-5',
        document_type: 'police_certificate',
        issue_date: daysAgo(10),
        expiry_date: daysFromNow(90),
      },
      'pr_application', // 365 days estimated
    )
    expect(result.status).toBe('critical_stale')
  })

  it('null expiry_date → status "valid"', () => {
    const result = checkDocumentFreshness({
      id: 'doc-6',
      document_type: 'birth_certificate',
      issue_date: daysAgo(30),
      expiry_date: null,
    })
    expect(result.status).toBe('valid')
  })

  it('PROCESSING_TIME_ESTIMATES has expected keys', () => {
    expect(PROCESSING_TIME_ESTIMATES).toHaveProperty('study_permit')
    expect(PROCESSING_TIME_ESTIMATES).toHaveProperty('work_permit')
    expect(PROCESSING_TIME_ESTIMATES).toHaveProperty('express_entry')
    expect(PROCESSING_TIME_ESTIMATES).toHaveProperty('default')
    Object.values(PROCESSING_TIME_ESTIMATES).forEach((val) => {
      expect(typeof val).toBe('number')
      expect(val).toBeGreaterThan(0)
    })
  })

  it('checkMatterDocumentFreshness aggregates correctly', () => {
    const docs = [
      { id: 'a', document_type: 'x', issue_date: daysFromNow(0), expiry_date: daysFromNow(730) },
      { id: 'b', document_type: 'y', issue_date: daysAgo(160), expiry_date: daysFromNow(200) },
    ]
    const result = checkMatterDocumentFreshness(docs)
    expect(result.checks).toHaveLength(2)
    expect(result.staleCounts.valid).toBeGreaterThanOrEqual(1)
    expect(result.staleCounts.critical_stale).toBeGreaterThanOrEqual(1)
    expect(result.hasCriticalStale).toBe(true)
  })

  it('hasCriticalStale flag set when any doc is critical', () => {
    const docs = [
      { id: 'a', document_type: 'x', issue_date: daysFromNow(0), expiry_date: daysFromNow(730) },
      { id: 'b', document_type: 'y', issue_date: daysAgo(160), expiry_date: daysFromNow(200) },
    ]
    const result = checkMatterDocumentFreshness(docs)
    expect(result.hasCriticalStale).toBe(true)
  })

  it('>150 days old check uses issue_date not expiry_date', () => {
    const result = checkDocumentFreshness({
      id: 'doc-old',
      document_type: 'police_certificate',
      issue_date: daysAgo(160),
      expiry_date: daysFromNow(500),
    })
    expect(result.status).toBe('critical_stale')

    const result2 = checkDocumentFreshness({
      id: 'doc-new',
      document_type: 'police_certificate',
      issue_date: daysAgo(10),
      expiry_date: daysFromNow(500),
    })
    expect(result2.status).not.toBe('critical_stale')
  })
})
