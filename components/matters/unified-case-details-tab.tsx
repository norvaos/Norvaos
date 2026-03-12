'use client'

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Unified Case Details Tab
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Replaces the separate Core Data, Immigration, IRCC Intake, IMM 5257E, and
 * IRCC Forms tabs with a single dynamic tab whose sections are controlled by
 * the matter_type_section_config table.
 *
 * Each section renders an existing component wrapped in a collapsible card.
 * Sections that are disabled in the config are hidden.
 */

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, LayoutList } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMatterTypeSectionConfig, useMatterTypeFormIds } from '@/lib/queries/ircc-forms'
import { useMatterImmigration, useCaseStages } from '@/lib/queries/immigration'
import { SECTION_DEFINITIONS } from './case-detail-sections'
import type { FieldVisibility, CustomFieldDef } from '@/lib/types/ircc-forms'
import { SectionCustomFields } from '@/components/matters/section-custom-fields'

// Existing components — imported lazily per section to avoid circular deps
import { CoreDataCardTab } from '@/components/matters/core-data-card-tab'
import { ImmigrationDetailsPanel } from '@/components/immigration/immigration-details-panel'
import { CaseInsightsPanel } from '@/components/immigration/case-insights-panel'
import { DocumentStatusPanel } from '@/components/immigration/document-status-panel'
import { IRCCIntakeTab } from '@/app/(dashboard)/matters/[id]/ircc-intake-tab'
import { IRCCFormsTab } from '@/app/(dashboard)/matters/[id]/ircc-forms-tab'

// ── Props ─────────────────────────────────────────────────────────────────────

interface UnifiedCaseDetailsTabProps {
  matterId: string
  tenantId: string
  matterTypeId: string | null
  contactId: string | null
  caseTypeId: string | null
  /** When set, the IRCC questionnaire navigates to the section/field matching this profile_path */
  navigateToProfilePath?: string | null
}

// ── Collapsible Section Wrapper ──────────────────────────────────────────────

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
  sectionKey,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
  /** Optional key used as a scroll target for cross-component navigation */
  sectionKey?: string
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-lg border bg-white shadow-sm" data-section-key={sectionKey}>
      <button
        type="button"
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-slate-50/50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
        )}
        <span className="text-sm font-semibold text-slate-900">{title}</span>
      </button>
      {open && (
        <div className="border-t px-5 py-4">
          {children}
        </div>
      )}
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

export function UnifiedCaseDetailsTab(props: UnifiedCaseDetailsTabProps) {
  if (!props.matterTypeId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center rounded-lg border border-dashed">
        <LayoutList className="h-10 w-10 text-slate-300" />
        <p className="mt-3 text-sm font-medium text-slate-600">No matter type assigned</p>
        <p className="mt-1 text-sm text-slate-400">
          Assign a matter type to this matter to configure which sections appear here.
        </p>
      </div>
    )
  }
  return <UnifiedCaseDetailsInner {...props} matterTypeId={props.matterTypeId} />
}

function UnifiedCaseDetailsInner({
  matterId,
  tenantId,
  matterTypeId,
  contactId,
  caseTypeId,
  navigateToProfilePath,
}: UnifiedCaseDetailsTabProps & { matterTypeId: string }) {
  // Fetch section configuration for this matter type
  const { data: sectionConfig, isLoading: configLoading } = useMatterTypeSectionConfig(matterTypeId)

  // Immigration data for CaseInsightsPanel
  const { data: immigrationData } = useMatterImmigration(matterId)
  const { data: immigrationStages } = useCaseStages(immigrationData?.case_type_id ?? '')

  // Build enabled sections list (sorted by sort_order)
  const enabledSections = useMemo(() => {
    if (!sectionConfig || sectionConfig.length === 0) {
      // If no config exists yet, show all sections (graceful fallback)
      return SECTION_DEFINITIONS.map((s, idx) => ({
        key: s.key,
        label: s.label,
        sortOrder: idx,
        fieldConfig: null as Record<string, FieldVisibility> | null,
        customFields: null as CustomFieldDef[] | null,
      }))
    }

    return sectionConfig
      .filter((c) => c.is_enabled)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => ({
        key: c.section_key,
        label: c.section_label,
        sortOrder: c.sort_order,
        fieldConfig: c.field_config ?? null,
        customFields: c.custom_fields ?? null,
      }))
  }, [sectionConfig])

  if (configLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg border bg-slate-50" />
        ))}
      </div>
    )
  }

  if (enabledSections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center rounded-lg border border-dashed">
        <LayoutList className="h-10 w-10 text-slate-300" />
        <p className="mt-3 text-sm font-medium text-slate-600">
          No sections configured
        </p>
        <p className="mt-1 text-sm text-slate-400">
          Enable sections in Settings → Matter Types to customize this view.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {enabledSections.map((section) => (
        <SectionRenderer
          key={section.key}
          sectionKey={section.key}
          label={section.label}
          matterId={matterId}
          tenantId={tenantId}
          matterTypeId={matterTypeId}
          contactId={contactId}
          caseTypeId={caseTypeId}
          immigrationData={immigrationData}
          immigrationStages={immigrationStages}
          fieldConfig={section.fieldConfig}
          customFields={section.customFields}
          navigateToProfilePath={section.key === 'ircc_questionnaire' ? navigateToProfilePath : undefined}
        />
      ))}
    </div>
  )
}

// ── Section Renderer ────────────────────────────────────────────────────────
// Renders the appropriate existing component for each section key.

function SectionRenderer({
  sectionKey,
  label,
  matterId,
  tenantId,
  matterTypeId,
  contactId,
  caseTypeId,
  immigrationData,
  immigrationStages,
  fieldConfig,
  customFields,
  navigateToProfilePath,
}: {
  sectionKey: string
  label: string
  matterId: string
  tenantId: string
  matterTypeId: string
  contactId: string | null
  caseTypeId: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  immigrationData: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  immigrationStages: any[] | undefined
  fieldConfig: Record<string, FieldVisibility> | null
  customFields: CustomFieldDef[] | null
  /** Passed to IRCC questionnaire for deep field navigation */
  navigateToProfilePath?: string | null
}) {
  // Helper: render custom fields block if defined
  const customFieldsBlock = customFields && customFields.length > 0 ? (
    <SectionCustomFields
      matterId={matterId}
      sectionKey={sectionKey}
      customFields={customFields}
    />
  ) : null

  switch (sectionKey) {
    // ── Core Data Sections ──────────────────────────────
    case 'processing_info':
    case 'people_dependents':
    case 'risk_assessment':
      // CoreDataCardTab is a monolithic component — render it fully
      // for any core data section key. It renders all 3 sections internally.
      // We only render it once (on the first core data key we encounter)
      if (sectionKey === 'processing_info') {
        return (
          <CollapsibleSection title="Core Data" defaultOpen>
            <CoreDataCardTab matterId={matterId} tenantId={tenantId} fieldConfig={fieldConfig} />
            {customFieldsBlock}
          </CollapsibleSection>
        )
      }
      // Skip rendering for people_dependents and risk_assessment since
      // they're part of the monolithic CoreDataCardTab
      return null

    // ── Immigration Sections ────────────────────────────
    case 'visa_details':
    case 'application_dates':
    case 'language_education':
    case 'employment_work':
    case 'family_sponsorship':
      // ImmigrationDetailsPanel is a monolithic component for all immigration fields.
      // Render only once (on the first immigration key we encounter).
      if (sectionKey === 'visa_details') {
        return (
          <CollapsibleSection title="Immigration Details" defaultOpen>
            <ImmigrationDetailsPanel matterId={matterId} tenantId={tenantId} fieldConfig={fieldConfig} />
            {customFieldsBlock}
          </CollapsibleSection>
        )
      }
      return null

    case 'case_insights':
      return (
        <CollapsibleSection title={label} defaultOpen>
          <CaseInsightsPanel
            matterId={matterId}
            tenantId={tenantId}
            stageEnteredAt={immigrationData?.stage_entered_at}
            currentStageName={
              immigrationStages?.find(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (s: any) => s.id === immigrationData?.current_stage_id
              )?.name
            }
          />
          {customFieldsBlock}
        </CollapsibleSection>
      )

    case 'document_checklist':
      return (
        <CollapsibleSection title={label} defaultOpen>
          <DocumentStatusPanel matterId={matterId} tenantId={tenantId} />
          {customFieldsBlock}
        </CollapsibleSection>
      )

    // ── IRCC Sections ───────────────────────────────────
    case 'ircc_questionnaire':
      return (
        <CollapsibleSection title={label} defaultOpen sectionKey="ircc_questionnaire">
          <IRCCIntakeTab
            matterId={matterId}
            contactId={contactId}
            tenantId={tenantId}
            matterTypeId={matterTypeId}
            initialProfilePath={navigateToProfilePath}
          />
          {customFieldsBlock}
        </CollapsibleSection>
      )

    case 'ircc_forms_generation':
      return (
        <CollapsibleSection title={label} defaultOpen>
          <IRCCFormsTab
            matterId={matterId}
            contactId={contactId}
            tenantId={tenantId}
            caseTypeId={caseTypeId}
          />
          {customFieldsBlock}
        </CollapsibleSection>
      )

    default:
      return null
  }
}
