'use client'

/**
 * ZoneD — Main Workspace
 *
 * 10-tab strip giving access to every facet of the matter.
 * Tabs (in order):
 *   1. Details       — UnifiedCaseDetailsTab (core + immigration fields)
 *   2. Documents     — DocumentSlotPanel (file requirements + upload)
 *   3. Forms         — FormsTab (IRCC form instances)
 *   4. Questionnaire — ImmigrationReadiness → QuestionsWorkflowSection
 *   5. Review        — ImmigrationReadiness → ReviewBlockersWorkflowSection
 *   6. Billing       — BillingTab (time, invoices, retainer)
 *   7. Communications— stub (Sprint 7)
 *   8. Correspondence— stub (Sprint 4)
 *   9. Tasks         — TasksTab
 *  10. Notes         — NotesEditor + ActivityTimeline
 *
 * Spec ref: Section 3 — Zone D: Main Workspace
 */

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { UnifiedCaseDetailsTab } from '@/components/matters/unified-case-details-tab'
import { DocumentsTab }           from '@/components/shell/tabs/DocumentsTab'
import { FormsTab }               from '@/components/matters/tabs/forms-tab'
import { BillingTab }             from '@/components/shell/tabs/BillingTab'
import { TasksTab }               from '@/components/matters/tabs/tasks-tab'
import { NotesEditor }            from '@/components/shared/notes-editor'
import { ActivityTimeline }       from '@/components/shared/activity-timeline'
import { QuestionsWorkflowSection }     from '@/components/matters/workflow/questions-section'
import { ReviewBlockersWorkflowSection } from '@/components/matters/workflow/review-blockers-section'
import { useImmigrationReadiness }      from '@/lib/queries/immigration-readiness'
import { CommunicationsTab }      from '@/components/shell/tabs/CommunicationsTab'
import { CorrespondenceTab }      from '@/components/shell/tabs/CorrespondenceTab'
import type { Database } from '@/lib/types/database'

type Matter = Database['public']['Tables']['matters']['Row']

// ── Types ─────────────────────────────────────────────────────────────────────

type TabId =
  | 'details'
  | 'documents'
  | 'forms'
  | 'questionnaire'
  | 'review'
  | 'billing'
  | 'communications'
  | 'correspondence'
  | 'tasks'
  | 'notes'

const TABS: { id: TabId; label: string }[] = [
  { id: 'details',        label: 'Details'        },
  { id: 'documents',      label: 'Documents'      },
  { id: 'forms',          label: 'Forms'          },
  { id: 'questionnaire',  label: 'Questionnaire'  },
  { id: 'review',         label: 'Review'         },
  { id: 'billing',        label: 'Billing'        },
  { id: 'communications', label: 'Communications' },
  { id: 'correspondence', label: 'Correspondence' },
  { id: 'tasks',          label: 'Tasks'          },
  { id: 'notes',          label: 'Notes'          },
]

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ZoneDProps {
  matter: Matter
  tenantId: string
  initialTab?: TabId
}

// ── Internal wrappers for readiness-dependent tabs ───────────────────────────

/**
 * Questionnaire tab — fetches readiness data internally so ZoneD
 * doesn't need to fetch it at the outer level.
 */
function QuestionnaireTabContent({
  matterId,
  onNavigateToField,
}: {
  matterId: string
  onNavigateToField?: (profilePath: string) => void
}) {
  const { data: readinessData } = useImmigrationReadiness(matterId)
  return (
    <div className="p-4">
      <QuestionsWorkflowSection
        readinessData={readinessData}
        defaultExpanded={true}
        onNavigateToField={onNavigateToField}
      />
    </div>
  )
}

/**
 * Review tab — same pattern. onNavigateToSection switches the parent tab.
 */
function ReviewTabContent({
  matterId,
  onNavigateToSection,
  onNavigateToField,
}: {
  matterId: string
  onNavigateToSection: (section: 'questions' | 'documents' | 'formPacks') => void
  onNavigateToField?: (profilePath: string) => void
}) {
  const { data: readinessData } = useImmigrationReadiness(matterId)
  return (
    <div className="p-4">
      <ReviewBlockersWorkflowSection
        readinessData={readinessData}
        matterId={matterId}
        defaultExpanded={true}
        onNavigateToSection={onNavigateToSection}
        onNavigateToField={onNavigateToField}
      />
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

// Valid tab IDs as a Set for fast O(1) validation
const TAB_IDS = new Set<TabId>(TABS.map(t => t.id))

function hashToTab(hash: string): TabId | null {
  const id = hash.replace(/^#/, '') as TabId
  return TAB_IDS.has(id) ? id : null
}

export function ZoneD({ matter, tenantId, initialTab = 'details' }: ZoneDProps) {
  // Priority: initialTab prop (from ?tab= searchParam) > URL hash > 'details'
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    // initialTab is already validated upstream (only set when it's a known TabId)
    if (initialTab !== 'details') return initialTab
    if (typeof window !== 'undefined') {
      const fromHash = hashToTab(window.location.hash)
      if (fromHash) return fromHash
    }
    return initialTab
  })

  // Sync hash → tab when user navigates back/forward
  useEffect(() => {
    function onHashChange() {
      const fromHash = hashToTab(window.location.hash)
      if (fromHash) setActiveTab(fromHash)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // When tab changes, push the new hash without a full navigation
  const handleTabChange = useCallback((value: string) => {
    const tab = value as TabId
    setActiveTab(tab)
    // replaceState keeps the history stack clean — no extra back-button entries
    window.history.replaceState(null, '', `#${tab}`)
  }, [])

  // Map from readiness section names → tab IDs for ReviewBlockers navigation
  const handleNavigateToSection = useCallback(
    (section: 'questions' | 'documents' | 'formPacks') => {
      const map: Record<string, TabId> = {
        questions: 'questionnaire',
        documents: 'documents',
        formPacks: 'forms',
      }
      const target = map[section]
      if (target) handleTabChange(target)
    },
    [handleTabChange],
  )

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="flex-1 flex flex-col overflow-hidden"
      >
        {/* ── Tab strip ─────────────────────────────────────────────────── */}
        <TabsList className="flex-none w-full justify-start rounded-none border-b bg-card px-2 h-9 gap-0 overflow-x-auto">
          {TABS.map(tab => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className={cn(
                'text-[11px] px-3 py-1.5 rounded-none border-b-2 border-transparent',
                'data-[state=active]:border-primary data-[state=active]:bg-transparent',
                'data-[state=active]:text-foreground data-[state=active]:shadow-none',
                'text-muted-foreground hover:text-foreground transition-colors',
                'whitespace-nowrap',
              )}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── Tab panels (each scrolls independently) ────────────────────── */}

        {/* 1 — Details */}
        <TabsContent value="details" className="flex-1 overflow-y-auto m-0 p-0">
          <UnifiedCaseDetailsTab
            matterId={matter.id}
            tenantId={tenantId}
            matterTypeId={matter.matter_type_id ?? null}
            contactId={null}
            caseTypeId={matter.case_type_id ?? null}
          />
        </TabsContent>

        {/* 2 — Documents */}
        <TabsContent value="documents" className="flex-1 overflow-y-auto m-0 p-0">
          <DocumentsTab
            matterId={matter.id}
            tenantId={tenantId}
            matterNumber={matter.matter_number ?? ''}
            matterTypeId={matter.matter_type_id ?? null}
            enforcementEnabled={true}
          />
        </TabsContent>

        {/* 3 — Forms */}
        <TabsContent value="forms" className="flex-1 overflow-y-auto m-0 p-0">
          <FormsTab
            matterId={matter.id}
            matterStatus={matter.status ?? undefined}
          />
        </TabsContent>

        {/* 4 — Questionnaire */}
        <TabsContent value="questionnaire" className="flex-1 overflow-y-auto m-0 p-0">
          <QuestionnaireTabContent matterId={matter.id} />
        </TabsContent>

        {/* 5 — Review */}
        <TabsContent value="review" className="flex-1 overflow-y-auto m-0 p-0">
          <ReviewTabContent
            matterId={matter.id}
            onNavigateToSection={handleNavigateToSection}
          />
        </TabsContent>

        {/* 6 — Billing */}
        <TabsContent value="billing" className="flex-1 overflow-y-auto m-0 p-0">
          <BillingTab
            matterId={matter.id}
            tenantId={tenantId}
            matter={matter}
          />
        </TabsContent>

        {/* 7 — Communications */}
        <TabsContent value="communications" className="flex-1 overflow-y-auto m-0 p-0">
          <CommunicationsTab matterId={matter.id} tenantId={tenantId} />
        </TabsContent>

        {/* 8 — Correspondence */}
        <TabsContent value="correspondence" className="flex-1 overflow-y-auto m-0 p-0">
          <CorrespondenceTab matterId={matter.id} tenantId={tenantId} />
        </TabsContent>

        {/* 9 — Tasks */}
        <TabsContent value="tasks" className="flex-1 overflow-y-auto m-0 p-0">
          <TasksTab
            matterId={matter.id}
            tenantId={tenantId}
            users={undefined}
            practiceAreaId={matter.practice_area_id ?? null}
            contactId={undefined}
          />
        </TabsContent>

        {/* 10 — Notes */}
        <TabsContent value="notes" className="flex-1 overflow-y-auto m-0 p-0">
          <div className="grid grid-rows-[auto_1fr] gap-0 h-full">
            <div className="border-b p-4">
              <NotesEditor tenantId={tenantId} matterId={matter.id} />
            </div>
            <div className="overflow-y-auto">
              <ActivityTimeline tenantId={tenantId} matterId={matter.id} />
            </div>
          </div>
        </TabsContent>

      </Tabs>
    </div>
  )
}
