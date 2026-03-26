/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Front Desk KPI Definitions & Threshold Logic
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 14 KPIs with server-side computation and color-coded thresholds.
 * KPI values are computed in Postgres (compute_shift_kpis, compute_checkin_response_times).
 * This file defines the KPI metadata, targets, and threshold evaluation.
 *
 * KPI Immutability: Past-day KPIs are deterministic because the source tables
 * (workflow_actions, front_desk_events) block UPDATE/DELETE at DB level.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type KpiColor = 'green' | 'amber' | 'red' | 'grey'

export type KpiDirection = 'higher_is_better' | 'lower_is_better'

export interface KpiDefinition {
  /** Unique key matching the compute_shift_kpis JSONB field */
  key: string
  /** Human-readable label */
  label: string
  /** Description for tooltips */
  description: string
  /** Unit of measurement */
  unit: string
  /** Target value (green threshold) */
  target: number
  /** Amber threshold  -  value at which color changes from green to amber */
  amberThreshold: number
  /** Red threshold  -  value at which color changes from amber to red */
  redThreshold: number
  /** Whether higher or lower values are better */
  direction: KpiDirection
  /** Category for grouping in UI */
  category: 'volume' | 'efficiency' | 'quality' | 'productivity'
}

export interface KpiValue {
  /** KPI definition key */
  key: string
  /** Human-readable label */
  label: string
  /** Computed numeric value */
  value: number | null
  /** Display string (e.g. "12.5", "3h 24m") */
  displayValue: string
  /** Color based on threshold evaluation */
  color: KpiColor
  /** Unit */
  unit: string
  /** Target value */
  target: number
  /** Category */
  category: KpiDefinition['category']
}

// ─── KPI Registry ───────────────────────────────────────────────────────────

export const KPI_DEFINITIONS: KpiDefinition[] = [
  // ── Volume KPIs ──
  {
    key: 'total_actions',
    label: 'Total Meaningful Actions',
    description: 'Total completed actions during the shift (excludes heartbeats, views)',
    unit: 'actions',
    target: 40,
    amberThreshold: 20,
    redThreshold: 10,
    direction: 'higher_is_better',
    category: 'volume',
  },
  {
    key: 'actions_per_hour',
    label: 'Actions Per Hour',
    description: 'Average meaningful actions per hour on shift',
    unit: 'actions/hr',
    target: 8,
    amberThreshold: 4,
    redThreshold: 2,
    direction: 'higher_is_better',
    category: 'volume',
  },
  {
    key: 'check_ins_processed',
    label: 'Check-Ins Processed',
    description: 'Number of client check-ins processed during the shift',
    unit: 'check-ins',
    target: 10,
    amberThreshold: 5,
    redThreshold: 2,
    direction: 'higher_is_better',
    category: 'volume',
  },
  {
    key: 'calls_logged',
    label: 'Calls Logged',
    description: 'Phone calls logged with outcome and notes',
    unit: 'calls',
    target: 15,
    amberThreshold: 8,
    redThreshold: 3,
    direction: 'higher_is_better',
    category: 'volume',
  },
  {
    key: 'tasks_completed',
    label: 'Tasks Completed',
    description: 'Tasks marked as completed during the shift',
    unit: 'tasks',
    target: 10,
    amberThreshold: 5,
    redThreshold: 2,
    direction: 'higher_is_better',
    category: 'volume',
  },
  {
    key: 'intakes_created',
    label: 'Intakes Created',
    description: 'New client intakes created (walk-ins, referrals)',
    unit: 'intakes',
    target: 5,
    amberThreshold: 2,
    redThreshold: 0,
    direction: 'higher_is_better',
    category: 'volume',
  },
  {
    key: 'appointments_managed',
    label: 'Appointments Managed',
    description: 'Appointments booked, rescheduled, or cancelled/no-showed',
    unit: 'appointments',
    target: 8,
    amberThreshold: 4,
    redThreshold: 1,
    direction: 'higher_is_better',
    category: 'volume',
  },

  // ── Efficiency KPIs ──
  {
    key: 'checkin_response_avg',
    label: 'Check-In Response Time (Avg)',
    description: 'Average minutes from check-in to first staff notification',
    unit: 'min',
    target: 3,
    amberThreshold: 5,
    redThreshold: 10,
    direction: 'lower_is_better',
    category: 'efficiency',
  },
  {
    key: 'checkin_response_p95',
    label: 'Check-In Response Time (P95)',
    description: '95th percentile check-in to notification time',
    unit: 'min',
    target: 5,
    amberThreshold: 10,
    redThreshold: 15,
    direction: 'lower_is_better',
    category: 'efficiency',
  },

  // ── Quality KPIs ──
  {
    key: 'notes_created',
    label: 'Notes Created',
    description: 'Contact notes added during the shift',
    unit: 'notes',
    target: 10,
    amberThreshold: 5,
    redThreshold: 1,
    direction: 'higher_is_better',
    category: 'quality',
  },
  {
    key: 'emails_logged',
    label: 'Emails Logged',
    description: 'Email communications logged during the shift',
    unit: 'emails',
    target: 5,
    amberThreshold: 2,
    redThreshold: 0,
    direction: 'higher_is_better',
    category: 'quality',
  },

  // ── Productivity KPIs ──
  {
    key: 'idle_time_ratio',
    label: 'Idle Time Ratio',
    description: 'Percentage of shift spent idle (no actions or events for 10+ minutes)',
    unit: '%',
    target: 10,
    amberThreshold: 20,
    redThreshold: 35,
    direction: 'lower_is_better',
    category: 'productivity',
  },
  {
    key: 'active_time_minutes',
    label: 'Active Time',
    description: 'Total minutes actively working (shift duration minus idle time)',
    unit: 'min',
    target: 420,
    amberThreshold: 300,
    redThreshold: 180,
    direction: 'higher_is_better',
    category: 'productivity',
  },
  {
    key: 'shift_duration_minutes',
    label: 'Shift Duration',
    description: 'Total shift length in minutes',
    unit: 'min',
    target: 480,
    amberThreshold: 360,
    redThreshold: 120,
    direction: 'higher_is_better',
    category: 'productivity',
  },
]

// ─── Lookup ──────────────────────────────────────────────────────────────────

const KPI_MAP = new Map(KPI_DEFINITIONS.map((d) => [d.key, d]))

export function getKpiDefinition(key: string): KpiDefinition | undefined {
  return KPI_MAP.get(key)
}

// ─── Threshold Evaluation ────────────────────────────────────────────────────

/**
 * Evaluates a KPI value against its thresholds and returns the color.
 *
 * For "higher_is_better" KPIs:
 *   value >= target         → green
 *   value >= amberThreshold → amber
 *   value < redThreshold    → red
 *
 * For "lower_is_better" KPIs:
 *   value <= target         → green
 *   value <= amberThreshold → amber
 *   value > redThreshold    → red
 *
 * null/undefined values always return grey.
 */
export function evaluateThreshold(
  value: number | null | undefined,
  def: KpiDefinition
): KpiColor {
  if (value == null) return 'grey'

  if (def.direction === 'higher_is_better') {
    if (value >= def.target) return 'green'
    if (value >= def.amberThreshold) return 'amber'
    return 'red'
  } else {
    // lower_is_better
    if (value <= def.target) return 'green'
    if (value <= def.amberThreshold) return 'amber'
    return 'red'
  }
}

// ─── Format KPI Values ──────────────────────────────────────────────────────

/**
 * Takes raw KPI data from Postgres and enriches it with display values,
 * colors, and threshold evaluation.
 */
export function buildKpiValues(
  shiftKpis: Record<string, number | null>,
  responseTimesKpis?: { avg_minutes: number | null; p95_minutes: number | null }
): KpiValue[] {
  const results: KpiValue[] = []

  for (const def of KPI_DEFINITIONS) {
    let rawValue: number | null = null

    // Map response time KPIs from separate function
    if (def.key === 'checkin_response_avg' && responseTimesKpis) {
      rawValue = responseTimesKpis.avg_minutes
    } else if (def.key === 'checkin_response_p95' && responseTimesKpis) {
      rawValue = responseTimesKpis.p95_minutes
    } else {
      rawValue = shiftKpis[def.key] ?? null
    }

    const color = evaluateThreshold(rawValue, def)
    const displayValue = formatKpiValue(rawValue, def)

    results.push({
      key: def.key,
      label: def.label,
      value: rawValue,
      displayValue,
      color,
      unit: def.unit,
      target: def.target,
      category: def.category,
    })
  }

  return results
}

/**
 * Format a KPI value for display.
 */
function formatKpiValue(value: number | null, def: KpiDefinition): string {
  if (value == null) return ' - '

  if (def.unit === 'min' && value >= 60) {
    const hours = Math.floor(value / 60)
    const mins = Math.round(value % 60)
    return `${hours}h ${mins}m`
  }

  if (def.unit === '%') {
    return `${value.toFixed(1)}%`
  }

  if (def.unit === 'actions/hr') {
    return value.toFixed(1)
  }

  // Integer metrics
  if (Number.isInteger(value)) {
    return String(value)
  }

  return value.toFixed(1)
}
