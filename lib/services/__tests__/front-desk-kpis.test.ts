/**
 * Front Desk KPI Threshold Logic Tests
 *
 * Tests the evaluateThreshold() function and buildKpiValues() with various
 * input combinations. Verifies that color coding matches the spec.
 *
 * Run: npx vitest run lib/services/__tests__/front-desk-kpis.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  evaluateThreshold,
  buildKpiValues,
  KPI_DEFINITIONS,
  getKpiDefinition,
  type KpiDefinition,
  type KpiColor,
} from '../front-desk-kpis'

describe('Front Desk KPI Definitions', () => {
  it('has 14 KPI definitions', () => {
    expect(KPI_DEFINITIONS.length).toBe(14)
  })

  it('all definitions have required fields', () => {
    for (const def of KPI_DEFINITIONS) {
      expect(def.key).toBeTruthy()
      expect(def.label).toBeTruthy()
      expect(def.unit).toBeTruthy()
      expect(typeof def.target).toBe('number')
      expect(typeof def.amberThreshold).toBe('number')
      expect(typeof def.redThreshold).toBe('number')
      expect(['higher_is_better', 'lower_is_better']).toContain(def.direction)
      expect(['volume', 'efficiency', 'quality', 'productivity']).toContain(def.category)
    }
  })

  it('keys are unique', () => {
    const keys = KPI_DEFINITIONS.map((d) => d.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('getKpiDefinition returns correct definition', () => {
    const def = getKpiDefinition('total_actions')
    expect(def).toBeDefined()
    expect(def?.label).toBe('Total Meaningful Actions')
  })

  it('getKpiDefinition returns undefined for unknown key', () => {
    expect(getKpiDefinition('nonexistent')).toBeUndefined()
  })
})

describe('evaluateThreshold  -  higher_is_better', () => {
  const def: KpiDefinition = {
    key: 'test_higher',
    label: 'Test Higher',
    description: 'test',
    unit: 'units',
    target: 40,
    amberThreshold: 20,
    redThreshold: 10,
    direction: 'higher_is_better',
    category: 'volume',
  }

  it('returns green when value >= target', () => {
    expect(evaluateThreshold(40, def)).toBe('green')
    expect(evaluateThreshold(100, def)).toBe('green')
  })

  it('returns amber when value >= amberThreshold but < target', () => {
    expect(evaluateThreshold(20, def)).toBe('amber')
    expect(evaluateThreshold(39, def)).toBe('amber')
  })

  it('returns red when value < amberThreshold', () => {
    expect(evaluateThreshold(19, def)).toBe('red')
    expect(evaluateThreshold(0, def)).toBe('red')
  })

  it('returns grey for null or undefined', () => {
    expect(evaluateThreshold(null, def)).toBe('grey')
    expect(evaluateThreshold(undefined, def)).toBe('grey')
  })
})

describe('evaluateThreshold  -  lower_is_better', () => {
  const def: KpiDefinition = {
    key: 'test_lower',
    label: 'Test Lower',
    description: 'test',
    unit: 'min',
    target: 3,
    amberThreshold: 5,
    redThreshold: 10,
    direction: 'lower_is_better',
    category: 'efficiency',
  }

  it('returns green when value <= target', () => {
    expect(evaluateThreshold(3, def)).toBe('green')
    expect(evaluateThreshold(0, def)).toBe('green')
    expect(evaluateThreshold(1.5, def)).toBe('green')
  })

  it('returns amber when value <= amberThreshold but > target', () => {
    expect(evaluateThreshold(4, def)).toBe('amber')
    expect(evaluateThreshold(5, def)).toBe('amber')
  })

  it('returns red when value > amberThreshold', () => {
    expect(evaluateThreshold(6, def)).toBe('red')
    expect(evaluateThreshold(15, def)).toBe('red')
  })

  it('returns grey for null', () => {
    expect(evaluateThreshold(null, def)).toBe('grey')
  })
})

describe('evaluateThreshold  -  real KPI definitions', () => {
  it('total_actions: 50 is green, 25 is amber, 5 is red', () => {
    const def = getKpiDefinition('total_actions')!
    expect(evaluateThreshold(50, def)).toBe('green')
    expect(evaluateThreshold(25, def)).toBe('amber')  // >= amber(20), < target(40)
    expect(evaluateThreshold(5, def)).toBe('red')
  })

  it('idle_time_ratio: 5% is green, 15% is amber, 40% is red', () => {
    const def = getKpiDefinition('idle_time_ratio')!
    expect(evaluateThreshold(5, def)).toBe('green')
    expect(evaluateThreshold(15, def)).toBe('amber')  // > target(10), <= amber(20)
    expect(evaluateThreshold(40, def)).toBe('red')
  })

  it('checkin_response_avg: 2min is green, 4min is amber, 12min is red', () => {
    const def = getKpiDefinition('checkin_response_avg')!
    expect(evaluateThreshold(2, def)).toBe('green')
    expect(evaluateThreshold(4, def)).toBe('amber')  // > target(3), <= amber(5)
    expect(evaluateThreshold(12, def)).toBe('red')
  })

  it('actions_per_hour: 10 is green, 5 is amber, 1 is red', () => {
    const def = getKpiDefinition('actions_per_hour')!
    expect(evaluateThreshold(10, def)).toBe('green')
    expect(evaluateThreshold(5, def)).toBe('amber')
    expect(evaluateThreshold(1, def)).toBe('red')
  })
})

describe('buildKpiValues', () => {
  it('returns 14 KPI values', () => {
    const mockShiftKpis: Record<string, number | null> = {
      total_actions: 45,
      actions_per_hour: 8.5,
      check_ins_processed: 12,
      calls_logged: 20,
      tasks_completed: 8,
      intakes_created: 3,
      appointments_managed: 6,
      notes_created: 15,
      emails_logged: 4,
      idle_time_ratio: 8.5,
      active_time_minutes: 440,
      shift_duration_minutes: 480,
    }

    const result = buildKpiValues(mockShiftKpis, {
      avg_minutes: 2.5,
      p95_minutes: 4.8,
    })

    expect(result.length).toBe(14)
  })

  it('assigns correct colors based on thresholds', () => {
    const mockShiftKpis: Record<string, number | null> = {
      total_actions: 50,     // green (>= 40)
      actions_per_hour: 3,   // amber (>= 4 but < 8)... wait 3 < 4 so red
      check_ins_processed: null,
    }

    const result = buildKpiValues(mockShiftKpis)

    const totalActions = result.find((k) => k.key === 'total_actions')
    expect(totalActions?.color).toBe('green')

    const actionsPerHour = result.find((k) => k.key === 'actions_per_hour')
    expect(actionsPerHour?.color).toBe('red') // 3 < 4 (amber threshold)

    const checkIns = result.find((k) => k.key === 'check_ins_processed')
    expect(checkIns?.color).toBe('grey') // null value
  })

  it('handles null response times gracefully', () => {
    const result = buildKpiValues({})
    const avgResponse = result.find((k) => k.key === 'checkin_response_avg')
    expect(avgResponse?.color).toBe('grey')
    expect(avgResponse?.displayValue).toBe(' - ')
  })

  it('formats time values correctly', () => {
    const result = buildKpiValues({
      shift_duration_minutes: 480,
      active_time_minutes: 90,
    })

    const duration = result.find((k) => k.key === 'shift_duration_minutes')
    expect(duration?.displayValue).toBe('8h 0m')

    const active = result.find((k) => k.key === 'active_time_minutes')
    expect(active?.displayValue).toBe('1h 30m')
  })

  it('formats percentage values correctly', () => {
    const result = buildKpiValues({ idle_time_ratio: 15.3 })
    const idle = result.find((k) => k.key === 'idle_time_ratio')
    expect(idle?.displayValue).toBe('15.3%')
  })

  it('categorizes KPIs correctly', () => {
    const result = buildKpiValues({})
    const categories = new Set(result.map((k) => k.category))
    expect(categories).toContain('volume')
    expect(categories).toContain('efficiency')
    expect(categories).toContain('quality')
    expect(categories).toContain('productivity')
  })
})
