// ============================================================================
// Smart Case Insights Engine
// Rule-based analysis of immigration case health, readiness, and risk factors.
// Pure functions — no React, no Supabase, no external API calls.
// ============================================================================

import { differenceInDays, isPast, isToday } from 'date-fns'
import type { Database } from '@/lib/types/database'

// ─── External Types ─────────────────────────────────────────────────────────────

type MatterImmigration = Database['public']['Tables']['matter_immigration']['Row']
type MatterChecklistItem = Database['public']['Tables']['matter_checklist_items']['Row']
type MatterDeadline = Database['public']['Tables']['matter_deadlines']['Row']
type CaseStageDefinition = Database['public']['Tables']['case_stage_definitions']['Row']

// ─── Insight Types ──────────────────────────────────────────────────────────────

export type InsightSeverity = 'critical' | 'warning' | 'info' | 'success'
export type InsightCategory = 'document' | 'deadline' | 'crs' | 'eligibility' | 'stage' | 'expiry'

export interface Insight {
  id: string
  severity: InsightSeverity
  category: InsightCategory
  title: string
  description: string
  action?: string
}

export interface ReadinessScore {
  score: number
  label: string
  detail: string
}

export interface ReadinessBreakdown {
  documents: ReadinessScore
  deadlines: ReadinessScore
  profile: ReadinessScore
  overall: number
}

export interface CrsAnalysis {
  score: number
  recentCutoff: number
  gap: number
  status: 'competitive' | 'borderline' | 'needs_improvement'
  quickWins: { label: string; points: number }[]
}

export interface CaseInsights {
  readiness: ReadinessBreakdown
  insights: Insight[]
  crsAnalysis: CrsAnalysis | null
}

/** @deprecated Use CaseDataV2 with document slots instead */
export interface CaseData {
  immigration: MatterImmigration
  checklistItems: MatterChecklistItem[]
  deadlines: MatterDeadline[]
  stages: CaseStageDefinition[]
}

// ─── V2 Types (document-slot-based) ──────────────────────────────────────────

/** Lightweight summary of a document slot for the insights engine */
export interface DocumentSlotSummary {
  id: string
  slot_name: string
  is_required: boolean
  status: string // 'empty' | 'pending_review' | 'accepted' | 'needs_re_upload' | 'rejected'
  current_version: number
  created_at: string
}

/** V2 input — uses document_slots instead of checklist items */
export interface CaseDataV2 {
  immigration: MatterImmigration
  documentSlots: DocumentSlotSummary[]
  deadlines: MatterDeadline[]
  stages: CaseStageDefinition[]
}

// ─── Severity Priority (for sorting) ────────────────────────────────────────────

const SEVERITY_ORDER: Record<InsightSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  success: 3,
}

// ─── Main Entry Point ───────────────────────────────────────────────────────────

/** @deprecated Use analyzeCaseInsightsV2 with document slots instead */
export function analyzeCaseInsights(data: CaseData): CaseInsights {
  const readiness = analyzeReadiness(data)
  const crsAnalysis = analyzeCrsCompetitiveness(data.immigration)

  const insights: Insight[] = [
    ...analyzeDocuments(data.checklistItems),
    ...analyzeDeadlines(data.deadlines),
    ...analyzeExpiringDocuments(data.immigration),
    ...analyzeEligibilityRisks(data.immigration),
    ...analyzeStageReadiness(data),
    ...analyzeCrsInsights(crsAnalysis),
    ...generateRecommendations(data),
  ]

  // Sort by severity (critical first), then alphabetically
  insights.sort((a, b) => {
    const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (severityDiff !== 0) return severityDiff
    return a.title.localeCompare(b.title)
  })

  return { readiness, insights, crsAnalysis }
}

// ─── Readiness Calculation ──────────────────────────────────────────────────────

function analyzeReadiness(data: CaseData): ReadinessBreakdown {
  const docs = analyzeDocumentReadiness(data.checklistItems)
  const deadlines = analyzeDeadlineReadiness(data.deadlines)
  const profile = analyzeProfileReadiness(data.immigration, data.stages)

  // Weighted average: documents 40%, deadlines 30%, profile 30%
  const overall = Math.round(docs.score * 0.4 + deadlines.score * 0.3 + profile.score * 0.3)

  return { documents: docs, deadlines, profile, overall }
}

function analyzeDocumentReadiness(items: MatterChecklistItem[]): ReadinessScore {
  const required = items.filter((i) => i.is_required)
  if (required.length === 0) {
    return { score: 100, label: 'No required docs', detail: 'No documents required' }
  }

  const approved = required.filter((i) => i.status === 'approved').length
  const received = required.filter((i) => i.status === 'received').length
  const missing = required.filter((i) => i.status === 'missing').length
  const score = Math.round(((approved + received * 0.5) / required.length) * 100)

  const detail = `${approved} approved, ${received} received, ${missing} missing of ${required.length} required`
  return { score, label: `${approved}/${required.length}`, detail }
}

function analyzeDeadlineReadiness(deadlines: MatterDeadline[]): ReadinessScore {
  if (deadlines.length === 0) {
    return { score: 100, label: 'No deadlines', detail: 'No deadlines set' }
  }

  const completed = deadlines.filter((d) => d.status === 'completed').length
  const overdue = deadlines.filter(
    (d) => d.status !== 'completed' && d.status !== 'dismissed' && isPast(new Date(d.due_date)) && !isToday(new Date(d.due_date)),
  ).length
  const score = Math.round((completed / deadlines.length) * 100)

  const detail = `${completed} completed, ${overdue} overdue of ${deadlines.length} total`
  return { score, label: `${completed}/${deadlines.length}`, detail }
}

/** Core fields required across all immigration case types */
const PROFILE_BASE_FIELDS: (keyof MatterImmigration)[] = [
  'date_of_birth',
  'country_of_citizenship',
  'passport_number',
  'passport_expiry',
  'current_visa_status',
]

/** Case-type-specific fields that add to the base list */
const PROFILE_FIELDS_BY_CATEGORY: Record<string, (keyof MatterImmigration)[]> = {
  study: ['study_program', 'dli_number', 'study_level', 'letter_of_acceptance'],
  work: ['employer_name', 'job_title', 'lmia_number', 'job_offer_noc', 'work_experience_years'],
  express_entry: [
    'language_test_type', 'education_credential', 'eca_status',
    'work_experience_years', 'canadian_work_experience_years', 'crs_score',
  ],
  family: ['sponsor_name', 'sponsor_relationship', 'sponsor_status', 'relationship_start_date'],
  visitor: ['language_test_type'],
}

function detectCaseCategory(immigration: MatterImmigration, stages: CaseStageDefinition[]): string {
  const pc = immigration.program_category
  if (pc === 'citizenship') return 'citizenship'

  // Try to detect from stage or other indicators
  const hasLmia = !!immigration.lmia_number || !!immigration.employer_name
  const hasCrs = !!immigration.crs_score
  const hasSponsor = !!immigration.sponsor_name
  const hasStudy = !!immigration.study_program || !!immigration.dli_number

  if (hasStudy) return 'study'
  if (hasSponsor) return 'family'
  if (hasCrs) return 'express_entry'
  if (hasLmia) return 'work'
  if (pc === 'temp_resident') return 'visitor'
  if (pc === 'perm_resident') return 'express_entry'
  return 'visitor'
}

function analyzeProfileReadiness(immigration: MatterImmigration, stages: CaseStageDefinition[] = []): ReadinessScore {
  const cat = detectCaseCategory(immigration, stages)
  const extraFields = PROFILE_FIELDS_BY_CATEGORY[cat] ?? []
  const allFields = [...PROFILE_BASE_FIELDS, ...extraFields]
  // Deduplicate
  const uniqueFields = [...new Set(allFields)]

  let filled = 0
  for (const field of uniqueFields) {
    const val = immigration[field]
    if (val !== null && val !== undefined && val !== '' && val !== 0 && val !== false) {
      filled++
    }
  }

  // Also check language_test_scores JSONB if language_test_type exists
  if (immigration.language_test_type) {
    const scores = immigration.language_test_scores as Record<string, number> | null
    const hasFourBands = scores &&
      scores.listening && scores.reading && scores.writing && scores.speaking
    if (hasFourBands) filled++
    // +1 total for language scores
    uniqueFields.push('language_test_scores' as keyof MatterImmigration)
  }

  const total = uniqueFields.length
  const score = total > 0 ? Math.round((filled / total) * 100) : 100
  const detail = `${filled} of ${total} key fields completed`
  return { score, label: `${filled}/${total}`, detail }
}

// ─── Document Insights ──────────────────────────────────────────────────────────

function analyzeDocuments(items: MatterChecklistItem[]): Insight[] {
  const insights: Insight[] = []
  const today = new Date()

  for (const item of items) {
    if (!item.is_required) continue

    // Missing required documents
    if (item.status === 'missing') {
      insights.push({
        id: `doc-missing-${item.id}`,
        severity: 'warning',
        category: 'document',
        title: `${item.document_name} — not yet requested`,
        description: 'Required document has not been requested from the client.',
        action: 'Request this document from the client',
      })
    }

    // Long-pending requested documents (>30 days)
    if (item.status === 'requested' && item.requested_at) {
      const daysSince = differenceInDays(today, new Date(item.requested_at))
      if (daysSince > 30) {
        insights.push({
          id: `doc-overdue-${item.id}`,
          severity: 'critical',
          category: 'document',
          title: `${item.document_name} — overdue`,
          description: `Requested ${daysSince} days ago but not yet received.`,
          action: 'Follow up with client on this document',
        })
      } else if (daysSince > 14) {
        insights.push({
          id: `doc-pending-${item.id}`,
          severity: 'warning',
          category: 'document',
          title: `${item.document_name} — pending ${daysSince} days`,
          description: `Requested ${daysSince} days ago, still awaiting receipt.`,
          action: 'Consider sending a reminder to the client',
        })
      }
    }
  }

  return insights
}

// ─── Deadline Insights ──────────────────────────────────────────────────────────

function analyzeDeadlines(deadlines: MatterDeadline[]): Insight[] {
  const insights: Insight[] = []
  const today = new Date()

  for (const deadline of deadlines) {
    if (deadline.status === 'completed' || deadline.status === 'dismissed') continue

    const due = new Date(deadline.due_date)
    const days = differenceInDays(due, today)

    if (isPast(due) && !isToday(due)) {
      insights.push({
        id: `deadline-overdue-${deadline.id}`,
        severity: 'critical',
        category: 'deadline',
        title: `${deadline.title} — ${Math.abs(days)} days overdue`,
        description: `This deadline was due on ${formatShortDate(deadline.due_date)} and has not been completed.`,
        action: 'Address immediately or mark as complete',
      })
    } else if (days <= 7) {
      insights.push({
        id: `deadline-urgent-${deadline.id}`,
        severity: 'warning',
        category: 'deadline',
        title: `${deadline.title} — ${days === 0 ? 'due today' : `${days} days remaining`}`,
        description: `Due on ${formatShortDate(deadline.due_date)}.`,
        action: 'Prioritize completion this week',
      })
    }
  }

  return insights
}

// ─── Expiry Checks ──────────────────────────────────────────────────────────────

function analyzeExpiringDocuments(immigration: MatterImmigration): Insight[] {
  const insights: Insight[] = []
  const today = new Date()

  // Passport expiry
  if (immigration.passport_expiry) {
    const expiry = new Date(immigration.passport_expiry)
    const days = differenceInDays(expiry, today)

    if (days < 0) {
      insights.push({
        id: 'passport-expired',
        severity: 'critical',
        category: 'expiry',
        title: 'Passport has expired',
        description: `Expired ${Math.abs(days)} days ago. A valid passport is required for all immigration applications.`,
        action: 'Urgently arrange passport renewal',
      })
    } else if (days <= 90) {
      insights.push({
        id: 'passport-expiring-soon',
        severity: 'critical',
        category: 'expiry',
        title: `Passport expires in ${days} days`,
        description: 'Many processes require at least 6 months validity. Renewal should be initiated immediately.',
        action: 'Begin passport renewal process',
      })
    } else if (days <= 180) {
      insights.push({
        id: 'passport-expiring',
        severity: 'warning',
        category: 'expiry',
        title: `Passport expires in ${days} days`,
        description: 'Consider initiating renewal to maintain 6+ months validity for processing.',
        action: 'Plan passport renewal',
      })
    }
  }

  // Visa / permit expiry
  if (immigration.current_visa_expiry) {
    const expiry = new Date(immigration.current_visa_expiry)
    const days = differenceInDays(expiry, today)

    if (days < 0) {
      insights.push({
        id: 'visa-expired',
        severity: 'critical',
        category: 'expiry',
        title: 'Visa/permit has expired',
        description: `Expired ${Math.abs(days)} days ago. Client may be out of status.`,
        action: 'Assess status restoration options immediately',
      })
    } else if (days <= 30) {
      insights.push({
        id: 'visa-expiring-soon',
        severity: 'critical',
        category: 'expiry',
        title: `Visa/permit expires in ${days} days`,
        description: 'Immediate action required to maintain legal status.',
        action: 'File extension or change of status application',
      })
    } else if (days <= 90) {
      insights.push({
        id: 'visa-expiring',
        severity: 'warning',
        category: 'expiry',
        title: `Visa/permit expires in ${days} days`,
        description: 'Plan extension or transition to maintain continuous status.',
        action: 'Prepare status extension application',
      })
    }
  }

  return insights
}

// ─── Eligibility Risk Flags ─────────────────────────────────────────────────────

function analyzeEligibilityRisks(immigration: MatterImmigration): Insight[] {
  const insights: Insight[] = []

  if (immigration.has_criminal_record) {
    insights.push({
      id: 'risk-criminal-record',
      severity: 'critical',
      category: 'eligibility',
      title: 'Criminal record on file',
      description: 'Inadmissibility assessment required. May need criminal rehabilitation application.',
      action: 'Conduct inadmissibility review and prepare rehabilitation if needed',
    })
  }

  if (immigration.prior_refusals) {
    insights.push({
      id: 'risk-prior-refusal',
      severity: 'warning',
      category: 'eligibility',
      title: 'Prior refusal on file',
      description: immigration.prior_refusal_details || 'Previous application was refused. Explanation letter may be needed.',
      action: 'Prepare a detailed explanation letter addressing prior refusal reasons',
    })
  }

  if (immigration.has_medical_issues) {
    insights.push({
      id: 'risk-medical-issues',
      severity: 'warning',
      category: 'eligibility',
      title: 'Medical issues flagged',
      description: immigration.medical_issue_details || 'Medical conditions may affect application processing or admissibility.',
      action: 'Obtain medical assessment and documentation',
    })
  }

  // Missing language test
  const langScores = immigration.language_test_scores as unknown as {
    listening?: number; reading?: number; writing?: number; speaking?: number
  } | null
  const hasLangScores = langScores &&
    (langScores.listening || langScores.reading || langScores.writing || langScores.speaking)

  if (!immigration.language_test_type && !hasLangScores) {
    insights.push({
      id: 'risk-no-language-test',
      severity: 'warning',
      category: 'eligibility',
      title: 'No language test results',
      description: 'Language proficiency test results are required for Express Entry and most immigration programs.',
      action: 'Schedule IELTS, CELPIP, or TEF language test',
    })
  }

  // ECA not completed
  if (immigration.eca_status && immigration.eca_status !== 'completed') {
    insights.push({
      id: 'risk-eca-pending',
      severity: 'info',
      category: 'eligibility',
      title: `ECA ${immigration.eca_status === 'in_progress' ? 'in progress' : 'not started'}`,
      description: 'Educational Credential Assessment is required for foreign education points in Express Entry.',
      action: immigration.eca_status === 'not_started'
        ? 'Initiate ECA application with WES or designated organization'
        : 'Monitor ECA processing status',
    })
  }

  return insights
}

// ─── Stage Readiness ────────────────────────────────────────────────────────────

function analyzeStageReadiness(data: CaseData): Insight[] {
  const insights: Insight[] = []
  const { immigration, checklistItems, stages } = data

  if (!immigration.current_stage_id || stages.length === 0) return insights

  // Find current stage
  const currentStageIndex = stages.findIndex((s) => s.id === immigration.current_stage_id)
  if (currentStageIndex === -1) return insights

  const currentStage = stages[currentStageIndex]

  // Check if current stage requires checklist complete
  if (currentStage.requires_checklist_complete) {
    const required = checklistItems.filter((i) => i.is_required)
    const approved = required.filter((i) => i.status === 'approved')
    if (required.length > 0 && approved.length < required.length) {
      const remaining = required.length - approved.length
      insights.push({
        id: 'stage-checklist-gate',
        severity: 'info',
        category: 'stage',
        title: `${remaining} document${remaining !== 1 ? 's' : ''} needed for next stage`,
        description: `Current stage "${currentStage.name}" requires all checklist items approved before advancing.`,
        action: 'Complete remaining document approvals',
      })
    }
  }

  // Check if next stage exists (not at terminal stage)
  if (!currentStage.is_terminal && currentStageIndex < stages.length - 1) {
    const nextStage = stages[currentStageIndex + 1]
    if (nextStage) {
      // Time in current stage
      const enteredAt = new Date(immigration.stage_entered_at)
      const daysInStage = differenceInDays(new Date(), enteredAt)
      if (daysInStage > 30) {
        insights.push({
          id: 'stage-stalled',
          severity: 'info',
          category: 'stage',
          title: `${daysInStage} days in "${currentStage.name}"`,
          description: `Case has been in the current stage for over a month. Next stage: "${nextStage.name}".`,
          action: 'Review if case is ready to advance',
        })
      }
    }
  }

  return insights
}

// ─── CRS Competitiveness ────────────────────────────────────────────────────────

// Recent Express Entry general draw cutoffs (approximate, updated periodically)
const RECENT_GENERAL_CUTOFF = 530
const RECENT_PNP_CUTOFF = 500

export function analyzeCrsCompetitiveness(immigration: MatterImmigration): CrsAnalysis | null {
  if (!immigration.crs_score || immigration.crs_score === 0) return null

  const score = immigration.crs_score
  const cutoff = RECENT_GENERAL_CUTOFF
  const gap = score - cutoff

  let status: CrsAnalysis['status']
  if (gap >= 20) {
    status = 'competitive'
  } else if (gap >= -20) {
    status = 'borderline'
  } else {
    status = 'needs_improvement'
  }

  // Quick wins — check which boosters aren't being used
  const quickWins: CrsAnalysis['quickWins'] = []

  if (!immigration.provincial_nominee_program) {
    quickWins.push({ label: 'Provincial Nomination (PNP)', points: 600 })
  }

  if (!immigration.job_offer_noc) {
    quickWins.push({ label: 'LMIA-supported job offer (TEER 0/1)', points: 200 })
  }

  const langScores = immigration.language_test_scores as unknown as {
    listening?: number; reading?: number; writing?: number; speaking?: number
  } | null
  // Suggest second language if no indication of bilingual
  if (langScores && (langScores.listening || langScores.reading)) {
    quickWins.push({ label: 'French language proficiency (CLB 7+)', points: 50 })
  }

  if (!immigration.education_credential?.toLowerCase().includes('canadian')) {
    quickWins.push({ label: 'Canadian education credential (3+ yr)', points: 30 })
  }

  return { score, recentCutoff: cutoff, gap, status, quickWins }
}

// ─── CRS-Specific Insights ──────────────────────────────────────────────────────

function analyzeCrsInsights(crsAnalysis: CrsAnalysis | null): Insight[] {
  if (!crsAnalysis) return []
  const insights: Insight[] = []

  if (crsAnalysis.status === 'needs_improvement') {
    insights.push({
      id: 'crs-below-cutoff',
      severity: 'warning',
      category: 'crs',
      title: `CRS score ${Math.abs(crsAnalysis.gap)} points below recent cutoff`,
      description: `Current score: ${crsAnalysis.score}. Recent general draw cutoff: ~${crsAnalysis.recentCutoff}.`,
      action: crsAnalysis.quickWins.length > 0
        ? `Consider: ${crsAnalysis.quickWins.slice(0, 2).map((w) => `${w.label} (+${w.points})`).join(', ')}`
        : 'Explore options to increase CRS score',
    })
  } else if (crsAnalysis.status === 'borderline') {
    insights.push({
      id: 'crs-borderline',
      severity: 'info',
      category: 'crs',
      title: 'CRS score is near the draw cutoff',
      description: `Score ${crsAnalysis.score} is within ${Math.abs(crsAnalysis.gap)} points of the ~${crsAnalysis.recentCutoff} cutoff.`,
      action: 'Small improvements could make this application competitive',
    })
  }

  return insights
}

// ─── Recommendations ────────────────────────────────────────────────────────────

function generateRecommendations(data: CaseData): Insight[] {
  const insights: Insight[] = []
  const { immigration, checklistItems, stages } = data

  // All docs approved — success
  const requiredItems = checklistItems.filter((i) => i.is_required)
  if (requiredItems.length > 0 && requiredItems.every((i) => i.status === 'approved')) {
    insights.push({
      id: 'rec-docs-complete',
      severity: 'success',
      category: 'document',
      title: 'All required documents approved',
      description: `All ${requiredItems.length} required documents have been approved.`,
    })
  }

  // Retainer not signed
  if (!immigration.retainer_signed) {
    insights.push({
      id: 'rec-retainer',
      severity: 'info',
      category: 'eligibility',
      title: 'Retainer agreement not yet signed',
      description: 'Retainer should be signed before significant work begins.',
      action: 'Send retainer agreement to client for signature',
    })
  }

  // Application not yet filed but case is well progressed
  if (!immigration.date_filed && requiredItems.length > 0) {
    const approvedPct = requiredItems.filter((i) => i.status === 'approved').length / requiredItems.length
    if (approvedPct >= 0.8) {
      insights.push({
        id: 'rec-ready-to-file',
        severity: 'success',
        category: 'stage',
        title: 'Case may be ready for filing',
        description: `${Math.round(approvedPct * 100)}% of required documents are approved. Consider preparing the submission.`,
        action: 'Review application package and prepare for filing',
      })
    }
  }

  // Pathway recommendation based on profile data
  const pathwayInsight = analyzeStrongestPathway(immigration)
  if (pathwayInsight) insights.push(pathwayInsight)

  // Stage duration tracking — average comparison
  if (immigration.current_stage_id && stages.length > 0) {
    const stageHistory = (Array.isArray(immigration.stage_history) ? immigration.stage_history : []) as Array<{
      stage_id: string; stage_name: string; entered_at: string; exited_at?: string
    }>
    const currentStage = stages.find((s) => s.id === immigration.current_stage_id)
    if (currentStage && stageHistory.length > 0) {
      // Compute average days across completed stages
      let totalDays = 0
      let completedStages = 0
      for (const entry of stageHistory) {
        if (entry.exited_at) {
          totalDays += differenceInDays(new Date(entry.exited_at), new Date(entry.entered_at))
          completedStages++
        }
      }
      const avgDays = completedStages > 0 ? Math.round(totalDays / completedStages) : 0

      // Current stage duration
      const currentDays = differenceInDays(new Date(), new Date(immigration.stage_entered_at))
      if (avgDays > 0 && currentDays > avgDays * 1.5 && currentDays > 14) {
        insights.push({
          id: 'stage-over-average',
          severity: 'warning',
          category: 'stage',
          title: `In "${currentStage.name}" for ${currentDays} days (avg: ${avgDays} days)`,
          description: `This stage is taking significantly longer than the average across previous stages.`,
          action: 'Review if there are blockers preventing stage advancement',
        })
      }
    }
  }

  return insights
}

/**
 * Analyze profile data to suggest the strongest immigration pathway.
 * Returns a single insight with pathway recommendation.
 */
function analyzeStrongestPathway(immigration: MatterImmigration): Insight | null {
  const indicators: { pathway: string; score: number; reason: string }[] = []

  // Express Entry indicators
  const hasCrs = immigration.crs_score && immigration.crs_score > 0
  const hasLangScores = immigration.language_test_type != null
  const hasCanadianExp = (immigration.canadian_work_experience_years ?? 0) > 0
  const hasPnp = !!immigration.provincial_nominee_program

  if (hasCrs || hasPnp) {
    let eeScore = 0
    if (hasCrs && immigration.crs_score! >= 450) eeScore += 3
    else if (hasCrs) eeScore += 1
    if (hasCanadianExp) eeScore += 2
    if (hasLangScores) eeScore += 1
    if (hasPnp) eeScore += 4
    if ((immigration.eca_status ?? '') === 'completed') eeScore += 1
    indicators.push({ pathway: 'Express Entry', score: eeScore, reason: hasPnp ? 'Provincial nomination provides significant advantage' : `CRS score: ${immigration.crs_score}` })
  }

  // Family sponsorship indicators
  if (immigration.sponsor_name || immigration.sponsor_relationship) {
    let famScore = 3
    if (immigration.sponsor_status === 'citizen') famScore += 2
    else if (immigration.sponsor_status === 'permanent_resident') famScore += 1
    if (immigration.relationship_start_date) famScore += 1
    indicators.push({ pathway: 'Family Sponsorship', score: famScore, reason: `Sponsor: ${immigration.sponsor_name || 'identified'}` })
  }

  // Work permit indicators
  if (immigration.employer_name || immigration.lmia_number) {
    let wpScore = 2
    if (immigration.lmia_number) wpScore += 2
    if (immigration.job_offer_noc) wpScore += 1
    indicators.push({ pathway: 'Work Permit', score: wpScore, reason: `Employer: ${immigration.employer_name || 'identified'}` })
  }

  // Study permit indicators
  if (immigration.study_program || immigration.dli_number) {
    let spScore = 2
    if (immigration.dli_number) spScore += 1
    if (immigration.letter_of_acceptance) spScore += 2
    indicators.push({ pathway: 'Study Permit', score: spScore, reason: `Program: ${immigration.study_program || 'identified'}` })
  }

  if (indicators.length === 0) return null

  // Sort by score descending
  indicators.sort((a, b) => b.score - a.score)
  const best = indicators[0]

  // Only show if there's a clear strongest pathway
  if (best.score < 3) return null

  return {
    id: 'pathway-recommendation',
    severity: 'info',
    category: 'eligibility',
    title: `Strongest pathway: ${best.pathway}`,
    description: `Based on the profile data, ${best.pathway} appears to be the most viable option. ${best.reason}.`,
    action: indicators.length > 1
      ? `Also consider: ${indicators.slice(1, 3).map((i) => i.pathway).join(', ')}`
      : undefined,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// V2 — Document-slot-based analysis
// ═══════════════════════════════════════════════════════════════════════════════

/** V2 entry point — uses document_slots instead of checklist items */
export function analyzeCaseInsightsV2(data: CaseDataV2): CaseInsights {
  const readiness = analyzeReadinessV2(data)
  const crsAnalysis = analyzeCrsCompetitiveness(data.immigration)

  const insights: Insight[] = [
    ...analyzeDocumentsV2(data.documentSlots),
    ...analyzeDeadlines(data.deadlines),
    ...analyzeExpiringDocuments(data.immigration),
    ...analyzeEligibilityRisks(data.immigration),
    ...analyzeStageReadinessV2(data),
    ...analyzeCrsInsights(crsAnalysis),
    ...generateRecommendationsV2(data),
  ]

  // Sort by severity (critical first), then alphabetically
  insights.sort((a, b) => {
    const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (severityDiff !== 0) return severityDiff
    return a.title.localeCompare(b.title)
  })

  return { readiness, insights, crsAnalysis }
}

// ─── V2 Readiness Calculation ─────────────────────────────────────────────────

function analyzeReadinessV2(data: CaseDataV2): ReadinessBreakdown {
  const docs = analyzeDocumentReadinessV2(data.documentSlots)
  const deadlines = analyzeDeadlineReadiness(data.deadlines)
  const profile = analyzeProfileReadiness(data.immigration, data.stages)

  // Weighted average: documents 40%, deadlines 30%, profile 30%
  const overall = Math.round(docs.score * 0.4 + deadlines.score * 0.3 + profile.score * 0.3)

  return { documents: docs, deadlines, profile, overall }
}

function analyzeDocumentReadinessV2(slots: DocumentSlotSummary[]): ReadinessScore {
  const required = slots.filter((s) => s.is_required)
  if (required.length === 0) {
    return { score: 100, label: 'No required docs', detail: 'No required document slots configured' }
  }

  // Scoring: accepted = 1.0, pending_review = 0.5, all others = 0
  let creditSum = 0
  let accepted = 0
  let pendingReview = 0
  let empty = 0
  let needsReUpload = 0
  let rejected = 0

  for (const slot of required) {
    switch (slot.status) {
      case 'accepted':
        creditSum += 1.0
        accepted++
        break
      case 'pending_review':
        creditSum += 0.5
        pendingReview++
        break
      case 'needs_re_upload':
        needsReUpload++
        break
      case 'rejected':
        rejected++
        break
      default: // 'empty' or any unknown
        empty++
        break
    }
  }

  const score = Math.round((creditSum / required.length) * 100)

  const parts: string[] = []
  if (accepted > 0) parts.push(`${accepted} accepted`)
  if (pendingReview > 0) parts.push(`${pendingReview} pending review`)
  if (needsReUpload > 0) parts.push(`${needsReUpload} need re-upload`)
  if (rejected > 0) parts.push(`${rejected} rejected`)
  if (empty > 0) parts.push(`${empty} empty`)
  const detail = `${parts.join(', ')} of ${required.length} required`

  return { score, label: `${accepted}/${required.length}`, detail }
}

// ─── V2 Document Insights ─────────────────────────────────────────────────────

function analyzeDocumentsV2(slots: DocumentSlotSummary[]): Insight[] {
  const insights: Insight[] = []
  const today = new Date()

  for (const slot of slots) {
    if (!slot.is_required) continue

    // Empty required document — not yet uploaded
    if (slot.status === 'empty') {
      const daysSinceCreated = differenceInDays(today, new Date(slot.created_at))

      if (daysSinceCreated > 30) {
        // Escalate to critical if empty for >30 days
        insights.push({
          id: `doc-empty-critical-${slot.id}`,
          severity: 'critical',
          category: 'document',
          title: `${slot.slot_name} — not uploaded (${daysSinceCreated} days)`,
          description: `Required document has not been uploaded for over ${daysSinceCreated} days since the slot was created.`,
          action: 'Urgently request this document from the client',
        })
      } else {
        insights.push({
          id: `doc-empty-${slot.id}`,
          severity: 'warning',
          category: 'document',
          title: `${slot.slot_name} — not yet uploaded`,
          description: 'Required document has not been uploaded by the client.',
          action: 'Request this document from the client',
        })
      }
    }

    // Needs re-upload
    if (slot.status === 'needs_re_upload') {
      insights.push({
        id: `doc-reupload-${slot.id}`,
        severity: 'warning',
        category: 'document',
        title: `${slot.slot_name} — re-upload requested`,
        description: 'This document was reviewed and requires a new upload from the client.',
        action: 'Follow up with client to upload a corrected document',
      })
    }

    // Rejected
    if (slot.status === 'rejected') {
      insights.push({
        id: `doc-rejected-${slot.id}`,
        severity: 'critical',
        category: 'document',
        title: `${slot.slot_name} — rejected`,
        description: 'This required document was rejected during review. A replacement is needed.',
        action: 'Contact client to provide the correct document',
      })
    }
  }

  return insights
}

// ─── V2 Stage Readiness ───────────────────────────────────────────────────────

function analyzeStageReadinessV2(data: CaseDataV2): Insight[] {
  const insights: Insight[] = []
  const { immigration, documentSlots, stages } = data

  if (!immigration.current_stage_id || stages.length === 0) return insights

  const currentStageIndex = stages.findIndex((s) => s.id === immigration.current_stage_id)
  if (currentStageIndex === -1) return insights

  const currentStage = stages[currentStageIndex]

  // Check if current stage requires checklist/documents complete
  if (currentStage.requires_checklist_complete) {
    const required = documentSlots.filter((s) => s.is_required)
    const accepted = required.filter((s) => s.status === 'accepted')
    if (required.length > 0 && accepted.length < required.length) {
      const remaining = required.length - accepted.length
      insights.push({
        id: 'stage-docs-gate',
        severity: 'info',
        category: 'stage',
        title: `${remaining} document${remaining !== 1 ? 's' : ''} needed for next stage`,
        description: `Current stage "${currentStage.name}" requires all documents accepted before advancing.`,
        action: 'Complete remaining document reviews',
      })
    }
  }

  // Check if next stage exists (not at terminal stage)
  if (!currentStage.is_terminal && currentStageIndex < stages.length - 1) {
    const nextStage = stages[currentStageIndex + 1]
    if (nextStage) {
      const enteredAt = new Date(immigration.stage_entered_at)
      const daysInStage = differenceInDays(new Date(), enteredAt)
      if (daysInStage > 30) {
        insights.push({
          id: 'stage-stalled',
          severity: 'info',
          category: 'stage',
          title: `${daysInStage} days in "${currentStage.name}"`,
          description: `Case has been in the current stage for over a month. Next stage: "${nextStage.name}".`,
          action: 'Review if case is ready to advance',
        })
      }
    }
  }

  return insights
}

// ─── V2 Recommendations ──────────────────────────────────────────────────────

function generateRecommendationsV2(data: CaseDataV2): Insight[] {
  const insights: Insight[] = []
  const { immigration, documentSlots, stages } = data

  // All required docs accepted — success
  const requiredSlots = documentSlots.filter((s) => s.is_required)
  if (requiredSlots.length > 0 && requiredSlots.every((s) => s.status === 'accepted')) {
    insights.push({
      id: 'rec-docs-complete',
      severity: 'success',
      category: 'document',
      title: 'All required documents accepted',
      description: `All ${requiredSlots.length} required documents have been accepted.`,
    })
  }

  // Retainer not signed
  if (!immigration.retainer_signed) {
    insights.push({
      id: 'rec-retainer',
      severity: 'info',
      category: 'eligibility',
      title: 'Retainer agreement not yet signed',
      description: 'Retainer should be signed before significant work begins.',
      action: 'Send retainer agreement to client for signature',
    })
  }

  // Application not yet filed but case is well progressed
  if (!immigration.date_filed && requiredSlots.length > 0) {
    const acceptedPct = requiredSlots.filter((s) => s.status === 'accepted').length / requiredSlots.length
    if (acceptedPct >= 0.8) {
      insights.push({
        id: 'rec-ready-to-file',
        severity: 'success',
        category: 'stage',
        title: 'Case may be ready for filing',
        description: `${Math.round(acceptedPct * 100)}% of required documents are accepted. Consider preparing the submission.`,
        action: 'Review application package and prepare for filing',
      })
    }
  }

  // Pathway recommendation
  const pathwayInsight = analyzeStrongestPathway(immigration)
  if (pathwayInsight) insights.push(pathwayInsight)

  // Stage duration tracking
  if (immigration.current_stage_id && stages.length > 0) {
    const stageHistory = (Array.isArray(immigration.stage_history) ? immigration.stage_history : []) as Array<{
      stage_id: string; stage_name: string; entered_at: string; exited_at?: string
    }>
    const currentStage = stages.find((s) => s.id === immigration.current_stage_id)
    if (currentStage && stageHistory.length > 0) {
      let totalDays = 0
      let completedStages = 0
      for (const entry of stageHistory) {
        if (entry.exited_at) {
          totalDays += differenceInDays(new Date(entry.exited_at), new Date(entry.entered_at))
          completedStages++
        }
      }
      const avgDays = completedStages > 0 ? Math.round(totalDays / completedStages) : 0

      const currentDays = differenceInDays(new Date(), new Date(immigration.stage_entered_at))
      if (avgDays > 0 && currentDays > avgDays * 1.5 && currentDays > 14) {
        insights.push({
          id: 'stage-over-average',
          severity: 'warning',
          category: 'stage',
          title: `In "${currentStage.name}" for ${currentDays} days (avg: ${avgDays} days)`,
          description: `This stage is taking significantly longer than the average across previous stages.`,
          action: 'Review if there are blockers preventing stage advancement',
        })
      }
    }
  }

  return insights
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatShortDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-CA', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}
