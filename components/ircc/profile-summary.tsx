'use client'

import { useMemo } from 'react'
import {
  User,
  Globe,
  Heart,
  FileText,
  MapPin,
  Users,
  Plane,
  GraduationCap,
  Briefcase,
  ShieldAlert,
  Languages,
  ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildQuestionnaire, profilePathGet, type Questionnaire } from '@/lib/ircc/questionnaire-engine'
import type { IRCCProfile, IRCCFieldMapping } from '@/lib/types/ircc-profile'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

// ── Section Icons ──────────────────────────────────────────────────────────────

const SECTION_ICONS: Record<string, React.ElementType> = {
  imm5257_visa_type: Plane,
  imm5257_personal_details: User,
  imm5257_marital_status: Heart,
  imm5257_language: Languages,
  imm5257_passport: FileText,
  imm5257_contact_info: MapPin,
  imm5257_details_of_visit: Plane,
  imm5257_education: GraduationCap,
  imm5257_employment: Briefcase,
  imm5257_background: ShieldAlert,
  imm5406_applicant_details: User,
  imm5406_spouse: Heart,
  imm5406_parents: Users,
  imm5406_children: Users,
  imm5406_siblings: Users,
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface ProfileSummaryProps {
  formCodes: string[]
  profile: Partial<IRCCProfile>
  className?: string
  /** Pre-built questionnaire from the DB engine. When provided, bypasses hardcoded registry. */
  prebuiltQuestionnaire?: Questionnaire | null
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ProfileSummary({ formCodes, profile, className, prebuiltQuestionnaire }: ProfileSummaryProps) {
  const questionnaire = useMemo(
    () => prebuiltQuestionnaire ?? buildQuestionnaire(formCodes, profile),
    [formCodes, profile, prebuiltQuestionnaire],
  )

  const profileObj = profile as unknown as Record<string, unknown>

  return (
    <div className={cn('space-y-3', className)}>
      {/* Overall Stats */}
      <div className="flex items-center gap-4 rounded-lg bg-muted/40 px-4 py-3">
        <div className="flex-1">
          <p className="text-sm font-medium">
            {questionnaire.filled_fields} of {questionnaire.total_fields} fields completed
          </p>
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-primary transition-all"
              style={{ width: `${questionnaire.progress_percent}%` }}
            />
          </div>
        </div>
        <span className="text-lg font-semibold text-primary">
          {questionnaire.progress_percent}%
        </span>
      </div>

      {/* Sections */}
      {questionnaire.sections.map((section) => {
        const Icon = SECTION_ICONS[section.id] ?? Globe
        const filledInSection = section.filled_count
        const totalInSection = section.fields.length
        const hasData = filledInSection > 0

        return (
          <Collapsible key={section.id} defaultOpen={hasData}>
            <div className="rounded-lg border bg-card">
              <CollapsibleTrigger className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors rounded-lg group">
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{section.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {filledInSection}/{totalInSection} fields
                  </p>
                </div>
                {hasData ? (
                  <span className="inline-flex items-center rounded-full bg-emerald-950/30 px-2 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-500/20">
                    {filledInSection} filled
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-500 border border-slate-200">
                    Empty
                  </span>
                )}
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="border-t px-4 py-3">
                  {hasData ? (
                    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                      {section.fields.map((field) => {
                        const rawValue = profilePathGet(profileObj, field.profile_path)
                        const displayValue = formatValue(rawValue, field)
                        if (!displayValue) return null

                        return (
                          <div key={field.profile_path} className={cn(
                            'py-1.5',
                            (field.field_type === 'repeater' || field.field_type === 'textarea') && 'sm:col-span-2',
                          )}>
                            <dt className="text-xs font-medium text-muted-foreground">
                              {field.label}
                            </dt>
                            <dd className="mt-0.5 text-sm text-foreground">
                              {field.field_type === 'repeater' ? (
                                <RepeaterDisplay value={rawValue} />
                              ) : (
                                displayValue
                              )}
                            </dd>
                          </div>
                        )
                      })}
                    </dl>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      No information provided for this section.
                    </p>
                  )}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        )
      })}
    </div>
  )
}

// ── Repeater Display ───────────────────────────────────────────────────────────

function RepeaterDisplay({ value }: { value: unknown }) {
  if (!Array.isArray(value) || value.length === 0) return null

  return (
    <div className="space-y-2 mt-1">
      {value.map((item, idx) => {
        if (typeof item !== 'object' || item === null) {
          return (
            <div key={idx} className="text-sm">
              {idx + 1}. {String(item)}
            </div>
          )
        }

        const entries = Object.entries(item as Record<string, unknown>).filter(
          ([, v]) => v != null && v !== '',
        )
        if (entries.length === 0) return null

        return (
          <div
            key={idx}
            className="rounded-md border bg-muted/20 px-3 py-2 text-sm"
          >
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Entry {idx + 1}
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {entries.map(([key, val]) => (
                <div key={key}>
                  <span className="text-xs text-muted-foreground">
                    {formatFieldKey(key)}:
                  </span>{' '}
                  <span className="text-xs font-medium">
                    {val === true ? 'Yes' : val === false ? 'No' : String(val)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Formatting Helpers ─────────────────────────────────────────────────────────

function formatValue(value: unknown, field: IRCCFieldMapping): string {
  if (value == null) return ''

  switch (field.field_type) {
    case 'boolean':
      if (value === true) return 'Yes'
      if (value === false) return 'No'
      return ''

    case 'select': {
      if (field.options && typeof value === 'string') {
        const option = field.options.find((o) => o.value === value)
        if (option) return option.label
      }
      return String(value)
    }

    case 'number':
      if (typeof value === 'number' && !isNaN(value)) return String(value)
      return ''

    case 'repeater':
      if (!Array.isArray(value) || value.length === 0) return ''
      return `${value.length} entries` // placeholder  -  rendered by RepeaterDisplay

    case 'date':
      if (typeof value === 'string' && value) {
        // Try to format nicely
        try {
          const d = new Date(value + 'T00:00:00')
          if (!isNaN(d.getTime())) {
            return d.toLocaleDateString('en-CA', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })
          }
        } catch {
          // Fall through to raw string
        }
        return value
      }
      return ''

    default:
      if (typeof value === 'string') return value.trim() || ''
      if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => `${formatFieldKey(k)}: ${v}`)
          .join(', ')
        return entries || ''
      }
      return String(value)
  }
}

function formatFieldKey(key: string): string {
  return key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
