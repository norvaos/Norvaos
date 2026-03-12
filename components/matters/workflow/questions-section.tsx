'use client'

import { useState, useMemo } from 'react'
import { ClipboardList, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { SectionSummaryStrip } from './section-summary-strip'
import type { ImmigrationReadinessData } from '@/lib/queries/immigration-readiness'
import type { ReadinessDomain } from '@/lib/config/immigration-playbooks'
import { DOMAIN_LABELS } from '@/lib/services/readiness-matrix-engine'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface QuestionsWorkflowSectionProps {
  readinessData: ImmigrationReadinessData | null | undefined
  /** Controlled expand state (overrides internal state when provided) */
  isExpanded?: boolean
  /** Controlled toggle callback */
  onToggle?: () => void
  /** Fallback initial value when uncontrolled */
  defaultExpanded?: boolean
  onNavigateToField?: (profilePath: string) => void
}

// Map profile_path prefixes to questionnaire section IDs
function getQuestionnaireSection(profilePath: string): string {
  const prefix = profilePath.split('.')[0]
  const sectionMap: Record<string, string> = {
    personal_details: 'personal-information',
    passport: 'passport-travel-document',
    contact: 'contact-information',
    family: 'family-composition',
    immigration_history: 'immigration-history',
    background: 'background-admissibility',
    program: 'program-specific',
  }
  return sectionMap[prefix] ?? prefix
}

// Domain display order
const DOMAIN_ORDER: ReadinessDomain[] = [
  'client_identity',
  'family_composition',
  'immigration_history',
  'review_risk',
  'program_eligibility',
  'evidence',
]

// ── Component ──────────────────────────────────────────────────────────────────

export function QuestionsWorkflowSection({
  readinessData,
  isExpanded: controlledExpanded,
  onToggle: controlledToggle,
  defaultExpanded = false,
  onNavigateToField,
}: QuestionsWorkflowSectionProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded)
  const isExpanded = controlledExpanded ?? internalExpanded
  const handleToggle = controlledToggle ?? (() => setInternalExpanded((p) => !p))

  const matrix = readinessData?.readinessMatrix

  // Compute summary metrics from readiness matrix
  const questionBlockers = useMemo(
    () => matrix?.allBlockers.filter((b) => b.type === 'question') ?? [],
    [matrix]
  )

  const incompleteDomains = useMemo(() => {
    if (!matrix) return 0
    return DOMAIN_ORDER.filter((d) => {
      const domain = matrix.domains[d]
      return domain.totalRules > 0 && domain.completionPct < 100
    }).length
  }, [matrix])

  // Use question-specific counts from the readiness matrix (not form-level questionnaire.completionPct
  // and not domain.satisfiedRules which includes document rules).
  const matrixSatisfaction = useMemo(() => {
    if (!matrix) return 0
    let totalQ = 0
    let satisfiedQ = 0
    for (const d of DOMAIN_ORDER) {
      const domain = matrix.domains[d]
      totalQ += domain.questionTotalRules
      satisfiedQ += domain.questionSatisfiedRules
    }
    return totalQ > 0 ? Math.round((satisfiedQ / totalQ) * 100) : 100
  }, [matrix])

  const contradictionCount = readinessData?.contradictions.blockingCount ?? 0

  // Summary strip metrics
  const metrics = [
    {
      label: 'Fields satisfied',
      value: `${matrixSatisfaction}%`,
      color: matrixSatisfaction >= 100
        ? 'green' as const
        : matrixSatisfaction >= 60
          ? 'amber' as const
          : 'red' as const,
    },
    ...(incompleteDomains > 0
      ? [{ label: 'Sections incomplete', value: incompleteDomains, color: 'default' as const }]
      : []),
    ...(contradictionCount > 0
      ? [{ label: 'Contradictions', value: contradictionCount, color: 'red' as const }]
      : []),
  ]

  // Highlight items (first 2 missing field labels)
  const highlights = questionBlockers.slice(0, 2).map((b) => b.label)
  if (questionBlockers.length > 2) {
    highlights.push(`+${questionBlockers.length - 2} more`)
  }

  if (!readinessData || !matrix) return null

  return (
    <div>
      <SectionSummaryStrip
        title="Questions"
        icon={ClipboardList}
        metrics={metrics}
        highlights={isExpanded ? undefined : highlights}
        isExpanded={isExpanded}
        onToggle={handleToggle}
        badge={
          questionBlockers.length === 0
            ? { text: 'Complete', variant: 'default' }
            : questionBlockers.some((b) => b.blocks_drafting)
              ? { text: 'Blocks Drafting', variant: 'destructive' }
              : undefined
        }
      />

      {/* Expanded detail view */}
      {isExpanded && (
        <div className="mt-2 space-y-2 pl-7">
          {DOMAIN_ORDER.map((domainKey) => {
            const domain = matrix.domains[domainKey]
            if (domain.totalRules === 0) return null

            const domainQuestionBlockers = domain.blockers.filter(
              (b) => b.type === 'question'
            )
            const isComplete = domain.completionPct >= 100

            return (
              <Card key={domainKey} className={cn('border', isComplete && 'opacity-60')}>
                <CardContent className="p-3">
                  {/* Domain header */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{DOMAIN_LABELS[domainKey]}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px]',
                          isComplete
                            ? 'border-green-300 text-green-700 bg-green-50'
                            : 'border-slate-300 text-slate-600'
                        )}
                      >
                        {domain.satisfiedRules}/{domain.totalRules}
                      </Badge>
                    </div>
                    {/* Blocker indicators */}
                    <div className="flex items-center gap-1">
                      {domainQuestionBlockers.some((b) => b.blocks_drafting) && (
                        <Badge variant="destructive" className="text-[9px] px-1 py-0">
                          Blocks Drafting
                        </Badge>
                      )}
                      {domainQuestionBlockers.some((b) => b.blocks_filing && !b.blocks_drafting) && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-300 text-amber-700 bg-amber-50">
                          Blocks Filing
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Missing fields list */}
                  {domainQuestionBlockers.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {domainQuestionBlockers.map((blocker) => (
                        <div
                          key={blocker.identifier}
                          className="flex items-center justify-between gap-2 text-xs py-1 px-2 rounded bg-slate-50"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-slate-400">○</span>
                            <span className="text-slate-700 truncate">{blocker.label}</span>
                            {blocker.person_role_scope && blocker.person_role_scope !== 'pa' && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
                                {blocker.person_name ?? blocker.person_role_scope}
                              </Badge>
                            )}
                          </div>
                          {onNavigateToField && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 text-[10px] text-blue-600 hover:text-blue-800 px-1"
                              onClick={() => onNavigateToField(blocker.identifier)}
                            >
                              Complete in Questionnaire
                              <ChevronRight className="ml-0.5 h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Complete state */}
                  {isComplete && (
                    <p className="mt-1 text-xs text-green-600">All fields complete</p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
