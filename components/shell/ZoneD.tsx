'use client'

/**
 * ZoneD  -  Main Workspace
 *
 * 12-tab strip giving access to every facet of the matter.
 * Tabs (in order):
 *   1. Overview       -  UnifiedCaseDetailsTab (core + immigration fields)
 *   2. Documents      -  DocumentSlotPanel (file requirements + upload)
 *   3. Intelligence   -  Norva Intelligence deep-work panel (Audit-Mirror + Ghost-Writer + Fact-Anchors)
 *   4. Forms          -  FormsTab (IRCC form instances)
 *   5. Questionnaire  -  ImmigrationReadiness → QuestionsWorkflowSection
 *   6. Review         -  ReviewTab (gate blockers + contradiction flags + lawyer sign-off)
 *   7. Billing        -  BillingTab (time, invoices, retainer)
 *   8. Communications -  stub (Sprint 7)
 *   9. Correspondence -  stub (Sprint 4)
 *  10. Tasks          -  TasksTab
 *  11. Notes          -  NotesEditor + ActivityTimeline
 *  12. IRCC Portal    -  Side-by-Side Engine (Field-to-Clip + Submission Checklist + Final Package)
 *
 * Spec ref: Section 3  -  Zone D: Main Workspace
 */

import { useState, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { Radio } from 'lucide-react'
import { NerveCenterDrawer } from '@/components/matters/nerve-center-drawer'
import { UnifiedCaseDetailsTab } from '@/components/matters/unified-case-details-tab'
import { DocumentsTab }           from '@/components/shell/tabs/DocumentsTab'
import { FormsTab }               from '@/components/shell/tabs/FormsTab'
import { BillingTab }             from '@/components/shell/tabs/BillingTab'
import { TasksTab }               from '@/components/matters/tabs/tasks-tab'
import { NotesEditor }            from '@/components/shared/notes-editor'
import { ActivityTimeline }       from '@/components/shared/activity-timeline'
import { IRCCIntakeTab }               from '@/app/(dashboard)/matters/[id]/ircc-intake-tab'
import { ReviewTab }              from '@/components/shell/tabs/ReviewTab'
import { CommunicationsTab }      from '@/components/shell/tabs/CommunicationsTab'
import { CorrespondenceTab }      from '@/components/shell/tabs/CorrespondenceTab'
import { LeadSnapshotTab }        from '@/components/shell/tabs/LeadSnapshotTab'
import { RulesAtOpeningPanel }    from '@/components/matters/rules-at-opening-panel'
import { IRCCSideBySideEngine }  from '@/components/ircc/sbs/ircc-sbs-engine'
import dynamic from 'next/dynamic'
import type { Database } from '@/lib/types/database'

const IntelligenceTabPanel = dynamic(
  () => import('@/components/matters/intelligence-tab').then(m => ({ default: m.IntelligenceTabPanel })),
  { ssr: false },
)

const DocumentArchivePanel = dynamic(
  () => import('@/components/matters/document-archive-panel').then(m => ({ default: m.DocumentArchivePanel })),
  { ssr: false },
)

type Matter = Database['public']['Tables']['matters']['Row']

// ── Types ─────────────────────────────────────────────────────────────────────

type TabId =
  | 'details'
  | 'documents'
  | 'intelligence'
  | 'forms'
  | 'questionnaire'
  | 'review'
  | 'billing'
  | 'communications'
  | 'correspondence'
  | 'tasks'
  | 'notes'
  | 'lead-snapshot'
  | 'ircc-portal'

const TABS: { id: TabId; label: string }[] = [
  { id: 'details',        label: 'Overview'       },
  { id: 'documents',      label: 'Documents'      },
  { id: 'intelligence',   label: 'Intelligence \u2726' },
  { id: 'forms',          label: 'Forms'          },
  { id: 'questionnaire',  label: 'Questionnaire'  },
  { id: 'review',         label: 'Review'         },
  { id: 'billing',        label: 'Billing'        },
  { id: 'communications', label: 'Communications' },
  { id: 'correspondence', label: 'Correspondence' },
  { id: 'tasks',          label: 'Tasks'          },
  { id: 'notes',          label: 'Notes'          },
  { id: 'lead-snapshot',   label: 'Intake History'   },
  { id: 'ircc-portal',    label: 'Submission Engine' },
]

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ZoneDProps {
  matter: Matter
  tenantId: string
  initialTab?: TabId
}

// ── Internal wrappers for readiness-dependent tabs ───────────────────────────

// QuestionnaireTabContent removed  -  Questionnaire tab now renders IRCCIntakeTab directly

// ── Component ─────────────────────────────────────────────────────────────────

// Valid tab IDs as a Set for fast O(1) validation
const TAB_IDS = new Set<TabId>(TABS.map(t => t.id))

function hashToTab(hash: string): TabId | null {
  const id = hash.replace(/^#/, '') as TabId
  return TAB_IDS.has(id) ? id : null
}

export function ZoneD({ matter, tenantId, initialTab = 'details' }: ZoneDProps) {
  // Fetch primary contact ID so the IRCC questionnaire and other contact-aware
  // sections in the Details tab can resolve the client correctly.
  const { data: primaryContactId } = useQuery({
    queryKey: ['matter-primary-contact', matter.id],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('matter_contacts')
        .select('contact_id')
        .eq('matter_id', matter.id)
        .eq('tenant_id', tenantId)
        .eq('is_primary', true)
        .maybeSingle()
      return data?.contact_id ?? null
    },
    enabled: !!matter.id && !!tenantId,
    staleTime: 60_000,
  })

  // ---- Directive 074: Nerve Center state ----
  const [nerveCenterOpen, setNerveCenterOpen] = useState(false)

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
    // replaceState keeps the history stack clean  -  no extra back-button entries
    window.history.replaceState(null, '', `#${tab}`)
  }, [])

  // Navigation handler for ReviewTab  -  maps section names to tab IDs
  const handleReviewNavigate = useCallback(
    (section: 'documents' | 'questionnaire' | 'forms') => {
      handleTabChange(section)
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
        <div className="flex-none flex items-center border-b bg-card">
          <TabsList className="flex-1 justify-start rounded-none px-2 h-9 gap-0 overflow-x-auto border-none">
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

          {/* Directive 074: Nerve Center toggle */}
          <button
            type="button"
            onClick={() => setNerveCenterOpen(true)}
            className={cn(
              'mr-3 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-all',
              nerveCenterOpen
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/30'
                : 'bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/40 hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400',
            )}
          >
            <Radio className="h-3 w-3" />
            Nerve Center
          </button>
        </div>

        {/* ── Tab panels (each scrolls independently) ────────────────────── */}

        {/* 1  -  Details */}
        <TabsContent value="details" className="flex-1 overflow-y-auto m-0 p-0">
          <div className="space-y-3 p-0">
            <UnifiedCaseDetailsTab
              matterId={matter.id}
              tenantId={tenantId}
              matterTypeId={matter.matter_type_id ?? null}
              contactId={primaryContactId ?? null}
              caseTypeId={matter.case_type_id ?? null}
            />
            {/* Rules at Opening  -  bottom of details tab */}
            <div className="px-4 pb-4">
              <RulesAtOpeningPanel
                matterId={matter.id}
                tenantId={tenantId}
                matterTypeId={matter.matter_type_id ?? null}
              />
            </div>
          </div>
        </TabsContent>

        {/* 2  -  Documents (Slots + Archive) */}
        <TabsContent value="documents" className="flex-1 overflow-y-auto m-0 p-0">
          <DocumentsTab
            matterId={matter.id}
            tenantId={tenantId}
            matterNumber={matter.matter_number ?? ''}
            matterTypeId={matter.matter_type_id ?? null}
            enforcementEnabled={true}
          />
          {/* Directive 22.2  -  Classifier-categorised file archive */}
          <div className="border-t">
            <DocumentArchivePanel
              matterId={matter.id}
              tenantId={tenantId}
            />
          </div>
        </TabsContent>

        {/* 3  -  Intelligence */}
        <TabsContent value="intelligence" className="flex-1 overflow-hidden m-0 p-0">
          <IntelligenceTabPanel
            matterId={matter.id}
            tenantId={tenantId}
          />
        </TabsContent>

        {/* 4  -  Forms */}
        <TabsContent value="forms" className="flex-1 overflow-y-auto m-0 p-0">
          <FormsTab
            matterId={matter.id}
            matterStatus={matter.status ?? undefined}
          />
        </TabsContent>

        {/* 4  -  Questionnaire */}
        <TabsContent value="questionnaire" className="flex-1 overflow-y-auto m-0 p-0">
          <IRCCIntakeTab
            matterId={matter.id}
            contactId={primaryContactId ?? null}
            tenantId={tenantId}
            matterTypeId={matter.matter_type_id ?? null}
          />
        </TabsContent>

        {/* 5  -  Review */}
        <TabsContent value="review" className="flex-1 overflow-y-auto m-0 p-0">
          <ReviewTab
            matterId={matter.id}
            tenantId={tenantId}
            onNavigateToSection={handleReviewNavigate}
          />
        </TabsContent>

        {/* 6  -  Billing */}
        <TabsContent value="billing" className="flex-1 overflow-y-auto m-0 p-0">
          <BillingTab
            matterId={matter.id}
            tenantId={tenantId}
            matter={matter}
          />
        </TabsContent>

        {/* 7  -  Communications */}
        <TabsContent value="communications" className="flex-1 overflow-y-auto m-0 p-0">
          <CommunicationsTab matterId={matter.id} tenantId={tenantId} />
        </TabsContent>

        {/* 8  -  Correspondence */}
        <TabsContent value="correspondence" className="flex-1 overflow-y-auto m-0 p-0">
          <CorrespondenceTab matterId={matter.id} tenantId={tenantId} />
        </TabsContent>

        {/* 9  -  Tasks */}
        <TabsContent value="tasks" className="flex-1 overflow-y-auto m-0 p-0">
          <TasksTab
            matterId={matter.id}
            tenantId={tenantId}
            users={undefined}
            practiceAreaId={matter.practice_area_id ?? null}
            contactId={undefined}
          />
        </TabsContent>

        {/* 10  -  Notes */}
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

        {/* 12  -  Lead Snapshot (Intake History) */}
        <TabsContent value="lead-snapshot" className="flex-1 overflow-y-auto m-0 p-0">
          <LeadSnapshotTab
            matterId={matter.id}
            tenantId={tenantId}
          />
        </TabsContent>

        {/* 11  -  IRCC Portal (Side-by-Side Engine) */}
        <TabsContent value="ircc-portal" className="flex-1 overflow-hidden m-0 p-0">
          <IRCCSideBySideEngine
            matterId={matter.id}
            tenantId={tenantId}
            contactId={primaryContactId ?? null}
          />
        </TabsContent>

      </Tabs>

      {/* Directive 074: Sovereign Nerve Center */}
      <NerveCenterDrawer
        matterId={matter.id}
        matterTitle={matter.title ?? ''}
        matterNumber={matter.matter_number}
        practiceArea={null}
        contactEmail={null}
        contactFirstName={null}
        contactLastName={null}
        contactPhone={null}
        open={nerveCenterOpen}
        onOpenChange={setNerveCenterOpen}
      />
    </div>
  )
}
