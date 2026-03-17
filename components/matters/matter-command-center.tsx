'use client'

/**
 * MatterCommandCenter — unified matter workspace layout.
 *
 * Replaces the legacy tabbed layout and augments the immigration workspace
 * with a persistent left sidebar and always-visible action toolbar.
 *
 * Layout:
 *   [CommandToolbar]
 *   [SecondaryAccessBar]          ← deep editing sheets
 *   ┌──────────────┬─────────────────────────────────────────┐
 *   │ CommandSidebar│  Main Panel                            │
 *   │  (260px)      │  Non-immigration: 6 clean tabs         │
 *   │               │  Immigration: existing 4 workflow secs │
 *   └──────────────┴─────────────────────────────────────────┘
 */

import { useState, useCallback, type ReactNode } from 'react'
import { Shield } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RequirePermission } from '@/components/require-permission'
import { CommandToolbar } from '@/components/matters/command-toolbar'
import { CommandSidebar } from '@/components/matters/command-sidebar'
import { DocumentHubTab } from '@/components/matters/document-hub-tab'
import { SendToClientDialog } from '@/components/matters/send-to-client-dialog'
import { DocumentUpload } from '@/components/shared/document-upload'
import { DocumentList } from '@/components/document-engine/document-list'
import { ActivityTimeline } from '@/components/shared/activity-timeline'
import { NotesEditor } from '@/components/shared/notes-editor'
import { MatterComments } from '@/components/matters/matter-comments'
import { BillingTab } from '@/components/matters/tabs/billing-tab'
import { TasksTab } from '@/components/matters/tabs/tasks-tab'
import { DeadlinesTab } from '@/components/matters/tabs/deadlines-tab'
import { OverviewTab } from '@/components/matters/tabs/overview-tab'
import { FormsTab } from '@/components/matters/tabs/forms-tab'
import { MilestonesTab } from '@/components/matters/tabs/milestones-tab'
import { ClientNotificationsTab } from '@/components/matters/client-notifications-tab'
import type { Database } from '@/lib/types/database'

type Matter = Database['public']['Tables']['matters']['Row']
type UserRow = Database['public']['Tables']['users']['Row']
type PracticeArea = Database['public']['Tables']['practice_areas']['Row']
type MatterImmigration = Database['public']['Tables']['matter_immigration']['Row']

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MatterCommandCenterProps {
  matterId: string
  tenantId: string
  userId: string
  matter: Matter
  users: UserRow[] | undefined
  practiceArea: PracticeArea | undefined
  primaryContactId: string | null | undefined
  enforcementEnabled: boolean
  isImmigrationWorkspace: boolean
  hasImmigration: boolean
  showCaseDetails: boolean
  intake: { intake_status: string } | null | undefined
  immigrationData: MatterImmigration | null | undefined
  /** Readiness metrics for sidebar */
  formCompletionPct?: number | null
  docAccepted?: number
  docTotal?: number
  /** For sidebar retainer */
  activePortalLink: { id: string; token: string; expires_at: string } | null | undefined
  onedriveAvailable: boolean
  syncingOneDrive: boolean
  /** The immigration workspace sections to render (pass as children) */
  immigrationWorkspaceContent?: ReactNode
  /** The secondary access bar component (already configured with sheet content) */
  secondaryAccessBar?: ReactNode
  /** Callbacks */
  onOpenSheet: (key: string) => void
  onPortalDialogOpen: () => void
  onDocRequestOpen: () => void
  onEdit: () => void
  onArchive: () => void
  onDelete: () => void
  onSyncOneDrive: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MatterCommandCenter({
  matterId,
  tenantId,
  userId,
  matter,
  users,
  practiceArea,
  primaryContactId,
  enforcementEnabled,
  isImmigrationWorkspace,
  intake,
  immigrationData,
  formCompletionPct,
  docAccepted,
  docTotal,
  onedriveAvailable,
  syncingOneDrive,
  immigrationWorkspaceContent,
  secondaryAccessBar,
  onOpenSheet,
  onPortalDialogOpen,
  onDocRequestOpen,
  onEdit,
  onArchive,
  onDelete,
  onSyncOneDrive,
}: MatterCommandCenterProps) {
  const [docSearchQuery, setDocSearchQuery] = useState('')
  const [sendToClientOpen, setSendToClientOpen] = useState(false)
  const [sendToClientTab, setSendToClientTab] = useState<'email' | 'portal'>('email')
  const [activeMainTab, setActiveMainTab] = useState('overview')

  const handleSendToClient = useCallback((tab?: 'docRequest' | 'email' | 'portal') => {
    if (tab === 'docRequest') {
      onDocRequestOpen()
      return
    }
    setSendToClientTab(tab === 'portal' ? 'portal' : 'email')
    setSendToClientOpen(true)
  }, [onDocRequestOpen])

  const handleAddDocument = useCallback(() => {
    setActiveMainTab('documents')
  }, [])

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <CommandToolbar
        matterId={matterId}
        tenantId={tenantId}
        portalActive={false}
        enforcementEnabled={enforcementEnabled}
        onedriveAvailable={onedriveAvailable}
        docSearchQuery={docSearchQuery}
        onDocSearchChange={setDocSearchQuery}
        onOpenSheet={onOpenSheet}
        onAddDocument={handleAddDocument}
        onSendToClient={handleSendToClient}
        onEdit={onEdit}
        onArchive={onArchive}
        onDelete={onDelete}
        onSyncOneDrive={onSyncOneDrive}
        syncingOneDrive={syncingOneDrive}
      />

      {/* Secondary Access Bar (deep sheets) */}
      {secondaryAccessBar}

      {/* Split-pane: Sidebar + Main */}
      <div className="flex gap-3 items-start">
        {/* Sidebar */}
        <CommandSidebar
          matterId={matterId}
          tenantId={tenantId}
          userId={userId}
          matter={{
            matter_number: matter.matter_number,
            title: matter.title,
            opened_at: null,
            created_at: matter.created_at ?? '',
            responsible_lawyer_id: matter.responsible_lawyer_id,
            practice_area_id: matter.practice_area_id ?? '',
            status: matter.status ?? '',
          }}
          users={users}
          practiceAreaName={practiceArea?.name ?? null}
          formCompletionPct={formCompletionPct}
          docAccepted={docAccepted}
          docTotal={docTotal}
          onOpenSheet={onOpenSheet}
          onPortalDialogOpen={onPortalDialogOpen}
          onMainTabChange={setActiveMainTab}
          className="sticky top-3 self-start"
        />

        {/* Main Panel */}
        <div className="flex-1 min-w-0">
          {isImmigrationWorkspace ? (
            /* Immigration workspace: keep existing 4 workflow sections */
            <div className="space-y-3">
              {immigrationWorkspaceContent}
            </div>
          ) : (
            /* Non-immigration: 6 clean tabs */
            <Tabs value={activeMainTab} onValueChange={setActiveMainTab} className="space-y-3">
              <TabsList className="flex-wrap">
                <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
                <TabsTrigger value="documents" className="text-xs">Documents</TabsTrigger>
                <TabsTrigger value="tasks" className="text-xs">Tasks & Deadlines</TabsTrigger>
                <TabsTrigger value="billing" className="text-xs">Billing</TabsTrigger>
                <TabsTrigger value="forms" className="text-xs">Forms</TabsTrigger>
                <TabsTrigger value="activity" className="text-xs">Activity</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <OverviewTab
                  matter={matter}
                  users={users}
                  practiceArea={practiceArea}
                  tenantId={tenantId}
                  matterId={matterId}
                  hasImmigration={false}
                  immigrationData={immigrationData ?? undefined}
                />
              </TabsContent>

              <TabsContent value="documents" className="space-y-4">
                {enforcementEnabled && intake?.intake_status === 'incomplete' ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center rounded-lg border border-dashed border-amber-300 bg-amber-50/50">
                    <Shield className="size-8 text-amber-400 mb-3" />
                    <h3 className="text-sm font-medium text-amber-700">Documents Locked</h3>
                    <p className="text-sm text-amber-600 mt-1 max-w-md">
                      Complete the Core Data Card before uploading documents.
                    </p>
                  </div>
                ) : enforcementEnabled ? (
                  <DocumentHubTab
                    matterId={matterId}
                    tenantId={tenantId}
                    enforcementEnabled={enforcementEnabled}
                    externalSearchQuery={docSearchQuery}
                  />
                ) : (
                  <>
                    <DocumentUpload entityType="matter" entityId={matterId} tenantId={tenantId} />
                    <DocumentList matterId={matterId} contactId={primaryContactId ?? undefined} />
                  </>
                )}
              </TabsContent>

              <TabsContent value="tasks" className="space-y-4">
                <TasksTab
                  matterId={matterId}
                  tenantId={tenantId}
                  users={users}
                  practiceAreaId={matter.practice_area_id ?? null}
                  contactId={primaryContactId ?? undefined}
                />
                <DeadlinesTab
                  matterId={matterId}
                  tenantId={tenantId}
                  practiceAreaId={matter.practice_area_id ?? null}
                />
              </TabsContent>

              <TabsContent value="billing" className="space-y-4">
                <RequirePermission entity="billing" action="view" variant="inline">
                  <BillingTab matterId={matterId} tenantId={tenantId} matter={matter} />
                </RequirePermission>
              </TabsContent>

              <TabsContent value="forms" className="space-y-4">
                <FormsTab matterId={matterId} matterStatus={matter.status ?? undefined} />
              </TabsContent>

              <TabsContent value="activity" className="space-y-4">
                <MilestonesTab matterId={matterId} tenantId={tenantId} />
                <NotesEditor tenantId={tenantId} matterId={matterId} />
                <MatterComments matterId={matterId} tenantId={tenantId} />
                <ActivityTimeline
                  tenantId={tenantId}
                  matterId={matterId}
                  entityType="matter"
                  entityId={matterId}
                />
                <ClientNotificationsTab matterId={matterId} tenantId={tenantId} />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>

      {/* Send to Client Dialog */}
      <SendToClientDialog
        open={sendToClientOpen}
        onOpenChange={setSendToClientOpen}
        matterId={matterId}
        tenantId={tenantId}
        userId={userId}
        defaultTab={sendToClientTab}
      />
    </div>
  )
}
