'use client'

import { ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { LeadSummaryCard } from './lead-summary-card'
import { StageActivityFeed } from './stage-activity-feed'
import { LeadAiInsightsCard } from './lead-ai-insights-card'
import { ConsultationCard } from './consultation-card'
import { RetainerCard } from './retainer-card'
import { QualificationCard } from './qualification-card'
import { isStageAtOrPast } from './lead-workflow-helpers'
import { LEAD_STAGES } from '@/lib/config/lead-workflow-definitions'
import { ScreeningAnswersPanel } from '@/components/shared/screening-answers-panel'
import type {
  Lead,
  Contact,
  PracticeArea,
  UserRow,
  LeadStageHistoryRow,
  Activity,
  LeadAiInsightRow,
  LeadConsultationRow,
  LeadRetainerPackageRow,
  LeadQualificationDecisionRow,
} from './lead-workflow-types'

// ─── Component ──────────────────────────────────────────────────────────────

interface CentrePanelProps {
  lead: Lead
  contact: Contact | null | undefined
  practiceArea: PracticeArea | null | undefined
  users: UserRow[] | undefined
  isReadOnly: boolean

  // Stage history + activities
  stageHistory: LeadStageHistoryRow[] | undefined
  activities: Activity[] | undefined
  isStageHistoryLoading: boolean

  // AI insights
  insights: LeadAiInsightRow[] | undefined
  isInsightsLoading: boolean
  onGenerateInsights: () => void
  onAcceptInsight: (insightId: string) => void
  isGenerating?: boolean
  isAccepting?: boolean

  // Conditional data
  consultations: LeadConsultationRow[] | undefined
  retainerPackages: LeadRetainerPackageRow[] | undefined
  qualificationDecisions: LeadQualificationDecisionRow[] | undefined
}

export function CentrePanel({
  lead,
  contact,
  practiceArea,
  users,
  isReadOnly,
  stageHistory,
  activities,
  isStageHistoryLoading,
  insights,
  isInsightsLoading,
  onGenerateInsights,
  onAcceptInsight,
  isGenerating,
  isAccepting,
  consultations,
  retainerPackages,
  qualificationDecisions,
}: CentrePanelProps) {
  const currentStage = lead.current_stage ?? ''

  // Visibility rules from the plan
  const showQualification =
    isStageAtOrPast(currentStage, LEAD_STAGES.CONTACTED_QUALIFICATION_COMPLETE) ||
    (qualificationDecisions && qualificationDecisions.length > 0)

  const showConsultation =
    isStageAtOrPast(currentStage, LEAD_STAGES.CONSULTATION_BOOKED) ||
    (consultations && consultations.length > 0)

  const showRetainer =
    isStageAtOrPast(currentStage, LEAD_STAGES.RETAINER_SENT) ||
    (retainerPackages && retainerPackages.length > 0)

  const showLinkedMatter = !!lead.converted_matter_id

  return (
    <div className="space-y-4 p-4">
      {/* Linked matter card (converted leads) */}
      {showLinkedMatter && (
        <Card className="border-green-200 bg-green-50/30">
          <CardContent className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-medium text-green-800">
                This lead has been converted to a matter
              </p>
              <p className="text-xs text-green-600">
                Matter ID: {lead.converted_matter_id}
              </p>
            </div>
            <Button variant="outline" size="sm" asChild className="border-green-200 text-green-700">
              <a href={`/matters/${lead.converted_matter_id}`}>
                <ExternalLink className="mr-1 h-3 w-3" />
                Open Matter
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Lead Summary */}
      <LeadSummaryCard
        lead={lead}
        contact={contact}
        practiceArea={practiceArea}
        users={users}
      />

      {/* Screening Answers (from front desk intake) */}
      <ScreeningAnswersPanel
        customIntakeData={lead.custom_intake_data as Record<string, unknown> | null}
        defaultCollapsed={false}
      />

      {/* Qualification */}
      {showQualification && qualificationDecisions && qualificationDecisions.length > 0 && (
        <QualificationCard
          decision={qualificationDecisions[0]}
          users={users}
        />
      )}

      {/* Consultation */}
      {showConsultation && consultations && consultations.length > 0 && (
        <ConsultationCard
          consultation={consultations[0]}
          users={users}
        />
      )}

      {/* Retainer */}
      {showRetainer && retainerPackages && retainerPackages.length > 0 && (
        <RetainerCard retainer={retainerPackages[0]} />
      )}

      {/* AI Insights */}
      <LeadAiInsightsCard
        insights={insights ?? []}
        isReadOnly={isReadOnly}
        onGenerate={onGenerateInsights}
        onAccept={onAcceptInsight}
        isGenerating={isGenerating}
        isAccepting={isAccepting}
      />

      {/* Stage & Activity Feed */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {isStageHistoryLoading ? (
            <ActivitySkeleton />
          ) : (
            <StageActivityFeed
              stageHistory={stageHistory ?? []}
              activities={activities ?? []}
              users={users}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function ActivitySkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="h-7 w-7 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      ))}
    </div>
  )
}
