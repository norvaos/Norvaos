'use client'

/**
 * QuestionnaireRenderer — Renders a form instance's questionnaire
 * using the new per-instance answer engine.
 *
 * Fetches form fields/sections from the DB and current answers from the
 * matter_form_instances table. Groups fields into collapsible sections,
 * evaluates show_when conditions for conditional visibility, and auto-saves
 * on blur with debouncing.
 *
 * Staff mode: shows all fields, verification controls, source badges.
 * Client mode: shows only is_client_visible fields, no verification.
 */

import { useState, useCallback, useMemo, useRef } from 'react'
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { useIrccFormFields, useIrccFormSections } from '@/lib/queries/ircc-forms'
import {
  useInstanceAnswers,
  useSaveAnswers,
  useVerifyAnswer,
} from '@/lib/queries/answer-engine'
import { evaluateCondition, normalizeLegacyCondition } from '@/lib/ircc/condition-engine'
import type { IrccFormField, IrccFormSection } from '@/lib/types/ircc-forms'
import type { AnswerMap, AnswerRecord, AnswerSource } from '@/lib/ircc/types/answers'
import type { FieldCondition, LegacyShowWhen } from '@/lib/ircc/types/conditions'
import { FieldInput } from './field-input'

// ── Props ─────────────────────────────────────────────────────────────────────

export interface QuestionnaireRendererProps {
  instanceId: string
  formId: string
  matterId: string
  tenantId: string
  mode: 'staff' | 'client'
  readOnly?: boolean
  onAnswerChange?: (profilePath: string, value: unknown) => void
}

// ── Helper: Build flat answer values map for condition evaluation ────────────

function buildValuesMap(answers: AnswerMap): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const [path, record] of Object.entries(answers)) {
    values[path] = record.value
  }
  return values
}

// ── Helper: Determine if a field should be visible ───────────────────────────

function isFieldVisible(
  field: IrccFormField,
  mode: 'staff' | 'client',
  valuesMap: Record<string, unknown>,
): boolean {
  // Hide meta fields always
  if (field.is_meta_field) return false

  // Hide unmapped fields always
  if (!field.is_mapped) return false

  // Client mode: hide fields not marked client-visible
  if (mode === 'client' && !field.is_client_visible) return false

  // Evaluate show_when condition if present
  if (field.show_when) {
    const condition = normalizeLegacyCondition(
      field.show_when as LegacyShowWhen | FieldCondition | null,
    )
    if (condition && !evaluateCondition(condition, valuesMap)) {
      return false
    }
  }

  return true
}

// ── Helper: Derive a FieldInput-compatible field object ─────────────────────

function toFieldInputField(field: IrccFormField, mode: 'staff' | 'client') {
  return {
    id: field.id,
    profile_path: field.profile_path ?? '',
    label: field.label ?? field.suggested_label ?? field.xfa_path,
    field_type: field.field_type ?? 'text',
    options: field.options ?? undefined,
    placeholder: field.placeholder ?? undefined,
    description: field.description ?? undefined,
    is_required: mode === 'client' ? field.is_client_required : field.is_required,
    max_length: field.max_length ?? undefined,
  }
}

// ── Section Header Component ────────────────────────────────────────────────

interface SectionHeaderProps {
  title: string
  description?: string | null
  filledCount: number
  totalCount: number
  staleCount: number
  conflictCount: number
  isOpen: boolean
}

function SectionHeader({
  title,
  filledCount,
  totalCount,
  staleCount,
  conflictCount,
  isOpen,
}: SectionHeaderProps) {
  const pct = totalCount === 0 ? 0 : Math.round((filledCount / totalCount) * 100)

  return (
    <div className="flex items-center gap-2 w-full py-2 px-2 hover:bg-muted/50 rounded-lg transition-colors">
      {isOpen ? (
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      ) : (
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      )}
      <span className="text-xs font-semibold flex-1 text-left">{title}</span>
      <div className="flex items-center gap-1.5">
        {/* Completion badge */}
        <Badge
          variant="outline"
          className={cn(
            'text-[10px] py-0 px-1.5 leading-4 border',
            pct === 100
              ? 'border-green-300 text-green-700 bg-green-50'
              : pct > 0
                ? 'border-blue-300 text-blue-700 bg-blue-50'
                : 'border-zinc-200 text-muted-foreground',
          )}
        >
          {filledCount}/{totalCount}
        </Badge>

        {/* Stale count badge */}
        {staleCount > 0 && (
          <Badge
            variant="outline"
            className="text-[10px] py-0 px-1.5 leading-4 border-amber-300 text-amber-700 bg-amber-50"
          >
            {staleCount} stale
          </Badge>
        )}

        {/* Conflict count badge */}
        {conflictCount > 0 && (
          <Badge
            variant="outline"
            className="text-[10px] py-0 px-1.5 leading-4 border-red-300 text-red-700 bg-red-50"
          >
            {conflictCount} conflict{conflictCount > 1 ? 's' : ''}
          </Badge>
        )}
      </div>
    </div>
  )
}

// ── Section Stats Computation ───────────────────────────────────────────────

interface SectionStats {
  filledCount: number
  totalCount: number
  staleCount: number
  conflictCount: number
}

function computeSectionStats(
  visibleFields: IrccFormField[],
  answers: AnswerMap,
): SectionStats {
  let filledCount = 0
  let staleCount = 0
  let conflictCount = 0

  for (const field of visibleFields) {
    const profilePath = field.profile_path
    if (!profilePath) continue

    const answerRecord = answers[profilePath]
    if (answerRecord) {
      if (answerRecord.value != null && answerRecord.value !== '') {
        filledCount++
      }
      if (answerRecord.stale) {
        staleCount++
      }
    }
  }

  return {
    filledCount,
    totalCount: visibleFields.length,
    staleCount,
    conflictCount,
  }
}

// ── Main Component ──────────────────────────────────────────────────────────

export function QuestionnaireRenderer({
  instanceId,
  formId,
  matterId,
  tenantId,
  mode,
  readOnly = false,
  onAnswerChange,
}: QuestionnaireRendererProps) {
  // ── Data Fetching ───────────────────────────────────────────────────────

  const { data: allFields, isLoading: fieldsLoading } = useIrccFormFields(formId)
  const { data: allSections, isLoading: sectionsLoading } = useIrccFormSections(formId)
  const { data: answers, isLoading: answersLoading } = useInstanceAnswers(instanceId)
  const saveAnswersMutation = useSaveAnswers()
  const verifyAnswerMutation = useVerifyAnswer()

  // ── Local State ─────────────────────────────────────────────────────────

  // Track local edits before they are saved (profile_path -> value)
  const [localEdits, setLocalEdits] = useState<Record<string, unknown>>({})
  // Track collapsed sections
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  // Debounce timer refs keyed by profile_path
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // ── Derived Data ────────────────────────────────────────────────────────

  const answerMap = answers ?? ({} as AnswerMap)

  // Build a merged values map: answers + local edits (local edits take priority)
  const valuesMap = useMemo(() => {
    const base = buildValuesMap(answerMap)
    // Override with local edits
    for (const [path, value] of Object.entries(localEdits)) {
      base[path] = value
    }
    return base
  }, [answerMap, localEdits])

  // Sort sections by sort_order
  const sortedSections = useMemo(() => {
    if (!allSections) return []
    return [...allSections].sort((a, b) => a.sort_order - b.sort_order)
  }, [allSections])

  // Group fields by section_id
  const fieldsBySection = useMemo(() => {
    if (!allFields) return new Map<string | null, IrccFormField[]>()
    const map = new Map<string | null, IrccFormField[]>()
    for (const field of allFields) {
      const key = field.section_id
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(field)
    }
    return map
  }, [allFields])

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleChange = useCallback(
    (profilePath: string, value: unknown) => {
      setLocalEdits((prev) => ({ ...prev, [profilePath]: value }))
      onAnswerChange?.(profilePath, value)
    },
    [onAnswerChange],
  )

  const handleBlur = useCallback(
    (profilePath: string) => {
      // Clear any existing debounce timer for this path
      if (debounceTimers.current[profilePath]) {
        clearTimeout(debounceTimers.current[profilePath])
      }

      // Debounce the save by 500ms
      debounceTimers.current[profilePath] = setTimeout(() => {
        const localValue = localEdits[profilePath]

        // Only save if there is a local edit for this path
        if (localValue === undefined) return

        // Determine the current answer value
        const currentAnswer = answerMap[profilePath]
        const currentValue = currentAnswer?.value

        // Skip save if value hasn't actually changed
        if (localValue === currentValue) {
          // Clean up the local edit
          setLocalEdits((prev) => {
            const next = { ...prev }
            delete next[profilePath]
            return next
          })
          return
        }

        const source: AnswerSource = mode === 'client' ? 'client_portal' : 'staff_entry'

        saveAnswersMutation.mutate(
          {
            instanceId,
            updates: { [profilePath]: localValue },
            source,
          },
          {
            onSuccess: () => {
              // Clear the local edit on successful save
              setLocalEdits((prev) => {
                const next = { ...prev }
                delete next[profilePath]
                return next
              })
            },
          },
        )

        delete debounceTimers.current[profilePath]
      }, 500)
    },
    [localEdits, answerMap, instanceId, mode, saveAnswersMutation],
  )

  const handleVerify = useCallback(
    (profilePath: string) => {
      verifyAnswerMutation.mutate({
        instanceId,
        profilePath,
        verifiedBy: tenantId, // The caller should pass proper user context; tenantId as fallback
      })
    },
    [instanceId, tenantId, verifyAnswerMutation],
  )

  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }, [])

  // ── Loading State ───────────────────────────────────────────────────────

  if (fieldsLoading || sectionsLoading || answersLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Loading questionnaire...</p>
      </div>
    )
  }

  if (!allFields || allFields.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground p-6">
        <p className="text-sm font-medium">No fields configured</p>
        <p className="text-xs opacity-60 text-center max-w-60">
          This form has no field mappings yet. Configure fields in the Form Library.
        </p>
      </div>
    )
  }

  // ── Render Sections ─────────────────────────────────────────────────────

  // Collect section IDs that we have already rendered
  const renderedSectionIds = new Set<string>()

  const sectionElements: React.ReactNode[] = []

  for (const section of sortedSections) {
    const sectionFields = fieldsBySection.get(section.id) ?? []
    const visibleFields = sectionFields.filter((f) =>
      isFieldVisible(f, mode, valuesMap),
    )

    if (visibleFields.length === 0) continue

    renderedSectionIds.add(section.id)
    const stats = computeSectionStats(visibleFields, answerMap)
    const isOpen = !collapsedSections.has(section.id)

    sectionElements.push(
      <Collapsible
        key={section.id}
        open={isOpen}
        onOpenChange={() => toggleSection(section.id)}
        className="mb-2"
      >
        <CollapsibleTrigger asChild>
          <button type="button" className="w-full">
            <SectionHeader
              title={section.title}
              description={section.description}
              filledCount={stats.filledCount}
              totalCount={stats.totalCount}
              staleCount={stats.staleCount}
              conflictCount={stats.conflictCount}
              isOpen={isOpen}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-2 pb-1">
            {section.description && (
              <p className="text-[11px] text-muted-foreground mb-2 leading-relaxed">
                {section.description}
              </p>
            )}
            {visibleFields.map((field) => {
              const profilePath = field.profile_path ?? ''
              const answerRecord = answerMap[profilePath]
              // Use local edit value if present, otherwise answer value
              const displayValue =
                profilePath in localEdits
                  ? localEdits[profilePath]
                  : answerRecord?.value ?? null

              return (
                <FieldInput
                  key={field.id}
                  field={toFieldInputField(field, mode)}
                  value={displayValue}
                  answer={answerRecord}
                  onChange={(val) => handleChange(profilePath, val)}
                  onBlur={() => handleBlur(profilePath)}
                  readOnly={readOnly}
                  showVerification={mode === 'staff'}
                  onVerify={() => handleVerify(profilePath)}
                  isVerified={answerRecord?.verified ?? false}
                />
              )
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>,
    )
  }

  // ── Unsectioned Fields ──────────────────────────────────────────────────
  // Fields with no section_id or section_id not in our sections list

  const unsectionedFields = (allFields ?? []).filter((f) => {
    if (f.section_id && renderedSectionIds.has(f.section_id)) return false
    if (f.section_id && sortedSections.some((s) => s.id === f.section_id)) return false
    return isFieldVisible(f, mode, valuesMap)
  })

  if (unsectionedFields.length > 0) {
    const unsectionedId = '__unsectioned__'
    const stats = computeSectionStats(unsectionedFields, answerMap)
    const isOpen = !collapsedSections.has(unsectionedId)

    sectionElements.push(
      <Collapsible
        key={unsectionedId}
        open={isOpen}
        onOpenChange={() => toggleSection(unsectionedId)}
        className="mb-2"
      >
        <CollapsibleTrigger asChild>
          <button type="button" className="w-full">
            <SectionHeader
              title="Other Fields"
              filledCount={stats.filledCount}
              totalCount={stats.totalCount}
              staleCount={stats.staleCount}
              conflictCount={stats.conflictCount}
              isOpen={isOpen}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-2 pb-1">
            {unsectionedFields.map((field) => {
              const profilePath = field.profile_path ?? ''
              const answerRecord = answerMap[profilePath]
              const displayValue =
                profilePath in localEdits
                  ? localEdits[profilePath]
                  : answerRecord?.value ?? null

              return (
                <FieldInput
                  key={field.id}
                  field={toFieldInputField(field, mode)}
                  value={displayValue}
                  answer={answerRecord}
                  onChange={(val) => handleChange(profilePath, val)}
                  onBlur={() => handleBlur(profilePath)}
                  readOnly={readOnly}
                  showVerification={mode === 'staff'}
                  onVerify={() => handleVerify(profilePath)}
                  isVerified={answerRecord?.verified ?? false}
                />
              )
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>,
    )
  }

  // ── Final Render ────────────────────────────────────────────────────────

  return (
    <ScrollArea className="h-full">
      <div className="p-3">
        {sectionElements.length > 0 ? (
          sectionElements
        ) : (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
            <p className="text-sm font-medium">No visible fields</p>
            <p className="text-xs opacity-60 text-center max-w-52">
              All fields in this form are hidden by conditions or visibility settings.
            </p>
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
