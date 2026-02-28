/**
 * Deadline Risk Scoring Engine
 *
 * Pure functions for quantifying deadline risk across immigration matters.
 * Zero React / Supabase dependencies — consumed by UI components and cron jobs.
 *
 * Scoring formula:
 *   Urgency (exponential curve based on days remaining)
 *   x Priority multiplier (high/urgent 1.0, medium 0.7, low 0.4)
 *   x Type criticality (visa_expiry 1.0 ... custom 0.5)
 *   Overdue deadlines receive an elevated base score with additional penalty.
 *
 * Risk levels: low (0-25), moderate (26-50), high (51-75), critical (76-100)
 */

import { differenceInDays } from 'date-fns'

// ── Types ───────────────────────────────────────────────────────────────────────

export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical'

export interface RiskFactor {
  label: string
  weight: number
  category: 'urgency' | 'priority' | 'type_criticality' | 'overdue_penalty'
}

export interface DeadlineRiskScore {
  score: number // 0-100
  level: RiskLevel
  factors: RiskFactor[]
}

export interface MatterRiskSummary {
  overallScore: number // 0-100 weighted average
  overallLevel: RiskLevel
  deadlineScores: Array<{
    deadlineId: string
    title: string
    dueDate: string
    score: number
    level: RiskLevel
    factors: RiskFactor[]
  }>
  highestRiskDeadline: { id: string; title: string; score: number } | null
  activeCount: number
  criticalCount: number // score > 75
  highCount: number // score 51-75
}

/** Minimal deadline shape accepted by the engine (subset of DB row). */
export interface DeadlineInput {
  id: string
  title: string
  due_date: string // ISO date string
  status: string
  priority: string
  deadline_type: string
}

// ── Lookup Tables ───────────────────────────────────────────────────────────────

const PRIORITY_MULTIPLIER: Record<string, number> = {
  urgent: 1.0,
  high: 1.0,
  medium: 0.7,
  low: 0.4,
}

const TYPE_CRITICALITY: Record<string, number> = {
  visa_expiry: 1.0,
  hearing: 0.95,
  biometrics: 0.9,
  medical: 0.85,
  filing: 0.8,
  ircc_submission: 0.8,
  document_request: 0.6,
  custom: 0.5,
}

/** Max look-ahead in days — anything further out gets urgency 0. */
const URGENCY_HORIZON_DAYS = 60

// ── Core Scoring ────────────────────────────────────────────────────────────────

/**
 * Compute urgency on an exponential curve (0-100).
 * Returns 0 at 60+ days, ~25 at 30 days, ~69 at 15 days, 100 at 0 days.
 * Overdue deadlines always return 100.
 */
function computeUrgency(daysUntilDue: number): number {
  if (daysUntilDue < 0) return 100
  if (daysUntilDue >= URGENCY_HORIZON_DAYS) return 0

  const ratio = (URGENCY_HORIZON_DAYS - daysUntilDue) / URGENCY_HORIZON_DAYS
  return 100 * ratio * ratio // quadratic curve
}

/**
 * Compute overdue penalty score (90-100 range).
 * Increases by 1 per day overdue up to 10 extra days.
 */
function computeOverduePenalty(
  daysOverdue: number,
  priorityMul: number,
  typeCrit: number,
): number {
  const base = 90 + Math.min(daysOverdue, 10)
  return Math.min(100, base * priorityMul * typeCrit)
}

// ── Public API ──────────────────────────────────────────────────────────────────

/**
 * Classify a numeric score into a risk level.
 */
export function classifyRiskLevel(score: number): RiskLevel {
  if (score > 75) return 'critical'
  if (score > 50) return 'high'
  if (score > 25) return 'moderate'
  return 'low'
}

/**
 * UI config for each risk level — colors follow the existing codebase palette.
 */
export function getRiskLevelConfig(level: RiskLevel): {
  label: string
  text: string
  bg: string
  border: string
  barColor: string
} {
  switch (level) {
    case 'critical':
      return {
        label: 'Critical',
        text: 'text-red-700',
        bg: 'bg-red-50',
        border: 'border-red-200',
        barColor: 'bg-red-500',
      }
    case 'high':
      return {
        label: 'High',
        text: 'text-orange-700',
        bg: 'bg-orange-50',
        border: 'border-orange-200',
        barColor: 'bg-orange-500',
      }
    case 'moderate':
      return {
        label: 'Moderate',
        text: 'text-amber-700',
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        barColor: 'bg-amber-500',
      }
    case 'low':
      return {
        label: 'Low',
        text: 'text-green-700',
        bg: 'bg-green-50',
        border: 'border-green-200',
        barColor: 'bg-green-500',
      }
  }
}

/**
 * Calculate the risk score for a single deadline.
 */
export function calculateDeadlineRiskScore(
  deadline: DeadlineInput,
  now?: Date,
): DeadlineRiskScore {
  const today = now ?? new Date()
  const dueDate = new Date(deadline.due_date)
  const daysUntilDue = differenceInDays(dueDate, today)

  const priorityMul = PRIORITY_MULTIPLIER[deadline.priority] ?? 0.7
  const typeCrit = TYPE_CRITICALITY[deadline.deadline_type] ?? 0.5

  const factors: RiskFactor[] = []

  // Urgency factor
  const urgency = computeUrgency(daysUntilDue)
  factors.push({
    label:
      daysUntilDue < 0
        ? `${Math.abs(daysUntilDue)}d overdue`
        : daysUntilDue === 0
          ? 'Due today'
          : `${daysUntilDue}d remaining`,
    weight: urgency,
    category: 'urgency',
  })

  // Priority factor
  factors.push({
    label: `${deadline.priority} priority`,
    weight: priorityMul * 100,
    category: 'priority',
  })

  // Type criticality factor
  factors.push({
    label: `${deadline.deadline_type.replace(/_/g, ' ')} type`,
    weight: typeCrit * 100,
    category: 'type_criticality',
  })

  let score: number

  if (daysUntilDue < 0) {
    // Overdue — elevated base with penalty
    const penalty = computeOverduePenalty(Math.abs(daysUntilDue), priorityMul, typeCrit)
    factors.push({
      label: `Overdue penalty (+${Math.abs(daysUntilDue)}d)`,
      weight: penalty,
      category: 'overdue_penalty',
    })
    score = penalty
  } else {
    // Standard composite: urgency x priority x type criticality
    score = urgency * priorityMul * typeCrit
  }

  score = Math.min(100, Math.round(score))

  return {
    score,
    level: classifyRiskLevel(score),
    factors,
  }
}

/**
 * Calculate an aggregate risk summary for a set of deadlines (typically per-matter).
 * Completed/dismissed deadlines are excluded from scoring.
 */
export function calculateMatterRiskSummary(
  deadlines: DeadlineInput[],
  now?: Date,
): MatterRiskSummary {
  const TERMINAL_STATUSES = ['completed', 'dismissed']

  const activeDeadlines = deadlines.filter(
    (d) => !TERMINAL_STATUSES.includes(d.status),
  )

  if (activeDeadlines.length === 0) {
    return {
      overallScore: 0,
      overallLevel: 'low',
      deadlineScores: [],
      highestRiskDeadline: null,
      activeCount: 0,
      criticalCount: 0,
      highCount: 0,
    }
  }

  const scored = activeDeadlines.map((d) => {
    const result = calculateDeadlineRiskScore(d, now)
    return {
      deadlineId: d.id,
      title: d.title,
      dueDate: d.due_date,
      score: result.score,
      level: result.level,
      factors: result.factors,
    }
  })

  // Weighted average: weight each deadline by its type criticality
  let totalWeight = 0
  let weightedSum = 0
  for (const s of scored) {
    const dl = activeDeadlines.find((d) => d.id === s.deadlineId)!
    const typeCrit = TYPE_CRITICALITY[dl.deadline_type] ?? 0.5
    weightedSum += s.score * typeCrit
    totalWeight += typeCrit
  }

  const overallScore =
    totalWeight > 0 ? Math.min(100, Math.round(weightedSum / totalWeight)) : 0

  // Find highest risk deadline
  const sorted = [...scored].sort((a, b) => b.score - a.score)
  const highest = sorted[0]

  const criticalCount = scored.filter((s) => s.score > 75).length
  const highCount = scored.filter((s) => s.score > 50 && s.score <= 75).length

  return {
    overallScore,
    overallLevel: classifyRiskLevel(overallScore),
    deadlineScores: scored,
    highestRiskDeadline: highest
      ? { id: highest.deadlineId, title: highest.title, score: highest.score }
      : null,
    activeCount: activeDeadlines.length,
    criticalCount,
    highCount,
  }
}

/**
 * Return the priority multiplier for a given priority value.
 * Useful for external callers (e.g. cron) that need the raw multiplier.
 */
export function getPriorityMultiplier(priority: string): number {
  return PRIORITY_MULTIPLIER[priority] ?? 0.7
}

/**
 * Return the type criticality for a given deadline type.
 * Useful for external callers (e.g. cron) that need the raw value.
 */
export function getTypeCriticality(deadlineType: string): number {
  return TYPE_CRITICALITY[deadlineType] ?? 0.5
}
