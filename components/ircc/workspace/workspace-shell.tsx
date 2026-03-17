'use client'

/**
 * WorkspaceShell — IRCC Filing Cockpit
 *
 * 4-column layout:
 *   Col 1 (72px / 240px): WorkspaceNavRail  — minimisable section nav
 *   Col 2 (flex-[2]):     SourceViewer      — source document viewer
 *   Col 3 (flex-[2]):     WorkbenchPanel    — IRCC field verification
 *   Col 4 (320px):        AuditorSidebar    — live completeness engine
 *
 * Sticky top header (UCI / App# / Stream / Lawyer)
 * Sticky bottom bar (stream + processing reference + status)
 */

import { useState } from 'react'
import type { Database } from '@/lib/types/database'
import type { MatterPersonProfile } from '@/lib/queries/matter-profiles'
import type { ImmigrationReadinessData } from '@/lib/queries/immigration-readiness'
import type { DocumentSlot } from '@/lib/queries/document-slots'
import { WorkspaceHeader } from './workspace-header'
import { WorkspaceNavRail } from './workspace-nav-rail'
import { SourceViewer } from './source-viewer'
import { WorkbenchPanel } from './workbench-panel'
import { AuditorSidebar } from './auditor-sidebar'
import { WorkspaceBottomBar } from './workspace-bottom-bar'

type Matter = Database['public']['Tables']['matters']['Row']

// ── Section types ─────────────────────────────────────────────────────────────

export type WorkspaceSection =
  | 'client_profile'
  | 'family_group'
  | 'imm_forms'
  | 'documents'
  | 'loe_builder'
  | 'fees'
  | 'biometrics'
  | 'submission'
  | 'notes'
  | 'audit_log'

// ── Props ─────────────────────────────────────────────────────────────────────

type MatterImmigration = Database['public']['Tables']['matter_immigration']['Row']

export interface WorkspaceShellProps {
  matterId: string
  tenantId: string
  matter: Matter
  immigrationData: MatterImmigration | null
  principalApplicant: MatterPersonProfile | null
  allPeople: MatterPersonProfile[]
  readinessData: ImmigrationReadinessData | null
  documentSlots: DocumentSlot[]
  currentUserId: string
  currentUserName: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WorkspaceShell({
  matterId,
  tenantId,
  matter,
  immigrationData,
  principalApplicant,
  allPeople,
  readinessData,
  documentSlots,
  currentUserId,
  currentUserName,
}: WorkspaceShellProps) {
  const [activeSection, setActiveSection] = useState<WorkspaceSection>('client_profile')
  const [navExpanded, setNavExpanded] = useState(true)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [pinnedDocumentId, setPinnedDocumentId] = useState<string | null>(null)

  // The active document is the pinned one, or the last selected
  const activeDocumentId = pinnedDocumentId ?? selectedDocumentId

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col overflow-hidden bg-background">

      {/* ── Sticky Top Header ─────────────────────────────────────────────── */}
      <WorkspaceHeader
        matter={matter}
        matterId={matterId}
        immigrationData={immigrationData}
        principalApplicant={principalApplicant}
      />

      {/* ── Main 4-Column Body ────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Column 1 — Nav Rail */}
        <WorkspaceNavRail
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          expanded={navExpanded}
          onToggleExpanded={() => setNavExpanded(v => !v)}
          allPeople={allPeople}
          readinessData={readinessData}
          documentSlots={documentSlots}
        />

        {/* Column 2 — Source Viewer */}
        <div className="flex-[2] min-w-0 border-r flex flex-col overflow-hidden">
          <SourceViewer
            matterId={matterId}
            documentSlots={documentSlots}
            activeDocumentId={activeDocumentId}
            pinnedDocumentId={pinnedDocumentId}
            onSelectDocument={setSelectedDocumentId}
            onPinDocument={setPinnedDocumentId}
          />
        </div>

        {/* Column 3 — Workbench */}
        <div className="flex-[2] min-w-0 border-r flex flex-col overflow-hidden">
          <WorkbenchPanel
            matterId={matterId}
            tenantId={tenantId}
            activeSection={activeSection}
            principalApplicant={principalApplicant}
            allPeople={allPeople}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
          />
        </div>

        {/* Column 4 — Auditor Sidebar */}
        <div className="w-80 shrink-0 flex flex-col overflow-hidden">
          <AuditorSidebar
            matterId={matterId}
            matter={matter}
            immigrationData={immigrationData}
            readinessData={readinessData}
            principalApplicant={principalApplicant}
            documentSlots={documentSlots}
          />
        </div>
      </div>

      {/* ── Sticky Bottom Bar ─────────────────────────────────────────────── */}
      <WorkspaceBottomBar
        matter={matter}
        readinessData={readinessData}
      />
    </div>
  )
}
