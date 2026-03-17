import { describe, it, expect } from 'vitest'
import { computeJRDeadline, validateRefusalInput } from '../refusal-engine'

describe('refusal-engine', () => {
  describe('computeJRDeadline', () => {
    it('computes inland deadline as decision_date + 15 days', () => {
      const result = computeJRDeadline('2026-01-01', 'inland')
      expect(result).toBe('2026-01-16')
    })

    it('computes outside_canada deadline as decision_date + 60 days', () => {
      const result = computeJRDeadline('2026-01-01', 'outside_canada')
      expect(result).toBe('2026-03-02')
    })

    it('handles month boundary correctly', () => {
      // Jan 20 + 15 = Feb 4
      const result = computeJRDeadline('2026-01-20', 'inland')
      expect(result).toBe('2026-02-04')
    })

    it('handles year boundary correctly', () => {
      // Dec 25 + 15 = Jan 9 of next year
      const result = computeJRDeadline('2026-12-25', 'inland')
      expect(result).toBe('2027-01-09')
    })

    it('returns ISO date string', () => {
      const result = computeJRDeadline('2026-03-17', 'inland')
      // Must match YYYY-MM-DD pattern
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('handles full ISO timestamp input (uses date part only)', () => {
      // Should strip time portion and compute from date only
      const result = computeJRDeadline('2026-01-01T00:00:00.000Z', 'inland')
      expect(result).toBe('2026-01-16')
    })
  })

  describe('validateRefusalInput', () => {
    it('returns valid for correct input', () => {
      const result = validateRefusalInput({
        item_date: '2026-03-17',
        jr_basis: 'inland',
      })
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('returns valid for outside_canada basis', () => {
      const result = validateRefusalInput({
        item_date: '2026-03-17',
        jr_basis: 'outside_canada',
        notes: 'Client was abroad',
      })
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('returns invalid when jr_basis missing', () => {
      const result = validateRefusalInput({
        item_date: '2026-03-17',
        jr_basis: undefined as unknown as 'inland',
      })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('jr_basis is required')
    })

    it('returns invalid when jr_basis is not inland or outside_canada', () => {
      const result = validateRefusalInput({
        item_date: '2026-03-17',
        jr_basis: 'overseas' as unknown as 'inland',
      })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('jr_basis must be "inland" or "outside_canada"')
    })

    it('returns invalid when item_date missing', () => {
      const result = validateRefusalInput({
        item_date: undefined as unknown as string,
        jr_basis: 'inland',
      })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('item_date is required')
    })

    it('returns invalid when item_date is not a valid date', () => {
      const result = validateRefusalInput({
        item_date: 'not-a-date',
        jr_basis: 'inland',
      })
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('item_date is not a valid date')
    })

    it('accumulates multiple errors', () => {
      const result = validateRefusalInput({
        item_date: undefined as unknown as string,
        jr_basis: undefined as unknown as 'inland',
      })
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThanOrEqual(2)
    })
  })
})
