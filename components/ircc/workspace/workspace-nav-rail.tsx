'use client'

/**
 * WorkspaceNavRail — Column 1
 *
 * Minimisable vertical nav rail (72px collapsed / 240px expanded).
 * Each section shows a completion badge:
 *   grey  = not started
 *   blue  = in progress (has data, not all verified)
 *   green = complete (all key fields verified)
 *   red   = blocked (required item missing or flagged)
 */

import {
  User2,
  Users,
  FileText,
  FolderOpen,
  ScrollText,
  Banknote,
  Stethoscope,
  History,
  StickyNote,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { WorkspaceSection } from './workspace-shell'
import type { MatterPersonProfile } from '@/lib/queries/matter-profiles'
import type { ImmigrationReadinessData } from '@/lib/queries/immigration-readiness'
import type { DocumentSlot } from '@/lib/queries/document-slots'

// ── Badge status ──────────────────────────────────────────────────────────────

type BadgeStatus = 'not_started' | 'in_progress' | 'complete' | 'blocked'

function badgeClass(status: BadgeStatus): string {
  switch (status) {
    case 'not_started': return 'bg-muted text-muted-foreground'
    case 'in_progress': return 'bg-blue-100 text-blue-700'
    case 'complete':    return 'bg-green-100 text-green-700'
    case 'blocked':     return 'bg-red-100 text-red-700'
  }
}

function badgeDot(status: BadgeStatus): string {
  switch (status) {
    case 'not_started': return 'bg-zinc-400'
    case 'in_progress': return 'bg-blue-500'
    case 'complete':    return 'bg-green-500'
    case 'blocked':     return 'bg-red-500'
  }
}

// ── Section definitions ───────────────────────────────────────────────────────

interface NavSection {
  key: WorkspaceSection
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const NAV_SECTIONS: NavSection[] = [
  { key: 'client_profile', label: 'Client Profile',    icon: User2 },
  { key: 'family_group',   label: 'Family Group',      icon: Users },
  { key: 'imm_forms',      label: 'IMM Forms',         icon: FileText },
  { key: 'documents',      label: 'Documents',         icon: FolderOpen },
  { key: 'loe_builder',    label: 'LoE Builder',       icon: ScrollText },
  { key: 'fees',           label: 'Fees',              icon: Banknote },
  { key: 'biometrics',     label: 'Biometrics / Medical', icon: Stethoscope },
  { key: 'submission',     label: 'Submission History', icon: History },
  { key: 'notes',          label: 'Notes',             icon: StickyNote },
  { key: 'audit_log',      label: 'Audit Log',         icon: ClipboardList },
]

// ── Compute section badge status ──────────────────────────────────────────────

function computeSectionStatus(
  section: WorkspaceSection,
  allPeople: MatterPersonProfile[],
  readinessData: ImmigrationReadinessData | null,
  documentSlots: DocumentSlot[],
): BadgeStatus {
  const pa = allPeople.find(p => p.person_role === 'principal_applicant')

  switch (section) {
    case 'client_profile': {
      if (!pa) return 'not_started'
      const profile = pa.profile_data as Record<string, unknown>
      const ver = (profile._ver ?? {}) as Record<string, { v: boolean }>
      const keyFields = ['personal.family_name', 'personal.given_name', 'personal.date_of_birth', 'passport.number']
      const hasAny = keyFields.some(f => !!profile[f])
      if (!hasAny) return 'not_started'
      const allVerified = keyFields.every(f => ver[f]?.v === true)
      return allVerified ? 'complete' : 'in_progress'
    }

    case 'documents': {
      if (!documentSlots.length) return 'not_started'
      const mandatory = documentSlots.filter(s => s.is_required)
      const blocked   = mandatory.filter(s => !s.current_document_id)
      if (blocked.length > 0) return 'blocked'
      return 'complete'
    }

    case 'fees': {
      // Red if readiness data shows fee issues
      if (readinessData?.blockedReasons?.some(r => r.toLowerCase().includes('fee'))) return 'blocked'
      return 'not_started'
    }

    case 'family_group': {
      const hasFamily = allPeople.length > 1
      return hasFamily ? 'in_progress' : 'not_started'
    }

    default:
      return 'not_started'
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface WorkspaceNavRailProps {
  activeSection: WorkspaceSection
  onSectionChange: (section: WorkspaceSection) => void
  expanded: boolean
  onToggleExpanded: () => void
  allPeople: MatterPersonProfile[]
  readinessData: ImmigrationReadinessData | null
  documentSlots: DocumentSlot[]
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WorkspaceNavRail({
  activeSection,
  onSectionChange,
  expanded,
  onToggleExpanded,
  allPeople,
  readinessData,
  documentSlots,
}: WorkspaceNavRailProps) {
  return (
    <TooltipProvider>
      <div
        className={cn(
          'flex flex-col shrink-0 border-r bg-card transition-all duration-200 overflow-hidden',
          expanded ? 'w-[240px]' : 'w-[72px]'
        )}
      >
        {/* Toggle button */}
        <div className="flex items-center justify-end px-2 py-2 border-b">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onToggleExpanded}
            aria-label={expanded ? 'Collapse nav' : 'Expand nav'}
          >
            {expanded
              ? <ChevronLeft className="h-4 w-4" />
              : <ChevronRight className="h-4 w-4" />
            }
          </Button>
        </div>

        {/* Sections */}
        <div className="flex flex-col gap-0.5 p-1.5 flex-1 overflow-y-auto">
          {NAV_SECTIONS.map((section) => {
            const Icon = section.icon
            const isActive = activeSection === section.key
            const status = computeSectionStatus(section.key, allPeople, readinessData, documentSlots)

            const btn = (
              <button
                key={section.key}
                onClick={() => onSectionChange(section.key)}
                className={cn(
                  'flex items-center gap-2.5 w-full rounded-lg px-2 py-2 text-left transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <div className="relative shrink-0">
                  <Icon className={cn('h-4 w-4', isActive && 'text-primary')} />
                  {/* Status dot */}
                  <span
                    className={cn(
                      'absolute -top-1 -right-1 h-2 w-2 rounded-full border border-background',
                      badgeDot(status)
                    )}
                  />
                </div>
                {expanded && (
                  <span className="text-xs font-medium leading-tight truncate">
                    {section.label}
                  </span>
                )}
              </button>
            )

            // Wrap with tooltip when collapsed
            if (!expanded) {
              return (
                <Tooltip key={section.key} delayDuration={300}>
                  <TooltipTrigger asChild>{btn}</TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    <div className="flex items-center gap-2">
                      <span>{section.label}</span>
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', badgeClass(status))}>
                        {status.replace('_', ' ')}
                      </span>
                    </div>
                  </TooltipContent>
                </Tooltip>
              )
            }

            return btn
          })}
        </div>
      </div>
    </TooltipProvider>
  )
}
