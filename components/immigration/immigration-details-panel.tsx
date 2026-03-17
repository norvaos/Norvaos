'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  useMatterImmigration,
  useCreateMatterImmigration,
  useUpdateMatterImmigration,
  useCaseTypes,
} from '@/lib/queries/immigration'
import {
  VISA_STATUSES,
  LANGUAGE_TEST_TYPES,
  ECA_STATUSES,
  IMMIGRATION_PROGRAM_LEVELS,
  WORK_PERMIT_TYPES,
  STUDY_LEVELS,
  SPONSOR_RELATIONSHIPS,
  SPONSOR_STATUSES,
} from '@/lib/utils/constants'
import { formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Briefcase,
  Calculator,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  FileText,
  GraduationCap,
  Heart,
  Languages,
  Plane,
  Shield,
  User,
  Wallet,
  BookOpen,
  Building2,
  Users,
} from 'lucide-react'

import { CrsCalculatorSheet } from './crs-calculator-sheet'
import type { Database } from '@/lib/types/database'

type MatterImmigration = Database['public']['Tables']['matter_immigration']['Row']

interface ImmigrationDetailsPanelProps {
  matterId: string
  tenantId: string
  /** Per-field visibility overrides from matter type section config */
  fieldConfig?: Record<string, { visible: boolean }> | null
}

// ============================================================================
// Inline Editable Field Components
// ============================================================================

interface InlineTextFieldProps {
  label: string
  value: string | null | undefined
  fieldKey: string
  onSave: (key: string, value: string | null) => void
  type?: 'text' | 'date' | 'number'
  placeholder?: string
}

function InlineTextField({
  label,
  value,
  fieldKey,
  onSave,
  type = 'text',
  placeholder = 'Not set',
}: InlineTextFieldProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(value ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isEditing])

  const handleSave = useCallback(() => {
    const trimmed = editValue.trim()
    onSave(fieldKey, trimmed || null)
    setIsEditing(false)
  }, [editValue, fieldKey, onSave])

  const handleCancel = useCallback(() => {
    setEditValue(value ?? '')
    setIsEditing(false)
  }, [value])

  const displayValue = type === 'date' && value ? formatDate(value) : value

  if (isEditing) {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-slate-500">{label}</Label>
        <Input
          ref={inputRef}
          type={type}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave()
            if (e.key === 'Escape') handleCancel()
          }}
          className="h-8 text-sm"
          placeholder={placeholder}
        />
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs text-slate-500">{label}</Label>
      <button
        type="button"
        onClick={() => {
          setEditValue(value ?? '')
          setIsEditing(true)
        }}
        className="block w-full text-left text-sm text-slate-900 hover:bg-slate-50 rounded px-2 py-1 -mx-2 transition-colors cursor-text min-h-[28px]"
      >
        {displayValue || <span className="text-slate-400 italic">{placeholder}</span>}
      </button>
    </div>
  )
}

interface InlineSelectFieldProps {
  label: string
  value: string | null | undefined
  fieldKey: string
  options: readonly { value: string; label: string }[]
  onSave: (key: string, value: string | null) => void
  placeholder?: string
  allowClear?: boolean
}

function InlineSelectField({
  label,
  value,
  fieldKey,
  options,
  onSave,
  placeholder = 'Not set',
  allowClear = true,
}: InlineSelectFieldProps) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-slate-500">{label}</Label>
      <Select
        value={value ?? ''}
        onValueChange={(val) => onSave(fieldKey, val === '__clear__' ? null : val)}
      >
        <SelectTrigger size="sm" className="h-8 text-sm">
          <SelectValue placeholder={<span className="text-slate-400 italic">{placeholder}</span>} />
        </SelectTrigger>
        <SelectContent>
          {allowClear && (
            <SelectItem value="__clear__">
              <span className="text-slate-400 italic">Clear selection</span>
            </SelectItem>
          )}
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

interface InlineBooleanFieldProps {
  label: string
  value: boolean
  fieldKey: string
  onSave: (key: string, value: boolean) => void
  detailsFieldKey?: string
  detailsValue?: string | null
  onDetailsSave?: (key: string, value: string | null) => void
}

function InlineBooleanField({
  label,
  value,
  fieldKey,
  onSave,
  detailsFieldKey,
  detailsValue,
  onDetailsSave,
}: InlineBooleanFieldProps) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-slate-500">{label}</Label>
      <div className="flex items-center gap-2">
        <Select
          value={value ? 'yes' : 'no'}
          onValueChange={(val) => onSave(fieldKey, val === 'yes')}
        >
          <SelectTrigger size="sm" className="h-8 text-sm w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="yes">Yes</SelectItem>
            <SelectItem value="no">No</SelectItem>
          </SelectContent>
        </Select>
        {value && detailsFieldKey && onDetailsSave && (
          <div className="flex-1">
            <InlineTextField
              label=""
              value={detailsValue}
              fieldKey={detailsFieldKey}
              onSave={onDetailsSave}
              placeholder="Enter details..."
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Language Score Sub-fields (IELTS / CELPIP / TEF L/R/W/S)
// ============================================================================

function LanguageScoreFields({
  scores,
  fieldKey,
  onSave,
}: {
  scores: Record<string, number> | null
  fieldKey: string
  onSave: (key: string, value: string | boolean | number | Record<string, number> | null) => void
}) {
  const bands = ['listening', 'reading', 'writing', 'speaking'] as const
  const current = (scores ?? {}) as Record<string, number>

  const handleBandSave = useCallback(
    (band: string, val: string | null) => {
      const draft: Record<string, number> = {}
      for (const [k, v] of Object.entries(current)) {
        if (v !== undefined && v !== null) draft[k] = v
      }
      if (val) {
        draft[band] = Number(val)
      } else {
        delete draft[band]
      }
      onSave(fieldKey, Object.keys(draft).length > 0 ? draft : null)
    },
    [current, fieldKey, onSave],
  )

  return (
    <div className="grid grid-cols-4 gap-2">
      {bands.map((band) => (
        <InlineTextField
          key={band}
          label={band.charAt(0).toUpperCase() + band.slice(1)}
          value={current[band]?.toString() ?? null}
          fieldKey={band}
          onSave={handleBandSave}
          type="number"
          placeholder="—"
        />
      ))}
    </div>
  )
}

// ============================================================================
// Collapsible Section with Completion Indicator
// ============================================================================

interface CollapsibleSectionProps {
  icon: React.ElementType
  title: string
  children: React.ReactNode
  columns?: 2 | 3 | 4
  filledCount?: number
  totalCount?: number
  defaultOpen?: boolean
}

function CollapsibleSection({
  icon: Icon,
  title,
  children,
  columns = 3,
  filledCount,
  totalCount,
  defaultOpen = true,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const hasCompletion = filledCount !== undefined && totalCount !== undefined && totalCount > 0
  const pct = hasCompletion ? Math.round((filledCount / totalCount) * 100) : 0
  const progressColor =
    pct >= 80
      ? '[&_[data-slot=progress-indicator]]:bg-green-500'
      : pct >= 40
        ? '[&_[data-slot=progress-indicator]]:bg-amber-500'
        : '[&_[data-slot=progress-indicator]]:bg-red-400'

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 group"
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
        )}
        <Icon className="h-4 w-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-900 group-hover:text-slate-700">{title}</h3>

        {hasCompletion && (
          <div className="flex items-center gap-2 ml-auto">
            <Progress value={pct} className={cn('h-1.5 w-16', progressColor)} />
            <span className="text-[10px] text-slate-400 tabular-nums">{filledCount}/{totalCount}</span>
          </div>
        )}
      </button>

      {isOpen && (
        <div
          className={cn(
            'grid gap-x-6 gap-y-3 pl-6',
            columns === 2 && 'grid-cols-1 sm:grid-cols-2',
            columns === 3 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
            columns === 4 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
          )}
        >
          {children}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Completion Helpers
// ============================================================================

function countFilled(immigration: MatterImmigration, keys: (keyof MatterImmigration)[]) {
  let filled = 0
  for (const key of keys) {
    const val = immigration[key]
    if (val !== null && val !== undefined && val !== '' && val !== 0 && val !== false) {
      filled++
    }
  }
  return filled
}

/** Detect case type category from the case type name */
function detectCategory(
  caseTypeName: string | undefined | null,
  programCategory: string | null,
): 'study' | 'work' | 'express_entry' | 'family' | 'visitor' | 'citizenship' | 'other' {
  if (programCategory === 'citizenship') return 'citizenship'

  const name = (caseTypeName ?? '').toLowerCase()
  if (name.includes('study') || name.includes('student')) return 'study'
  if (name.includes('work') || name.includes('lmia') || name.includes('pgwp')) return 'work'
  if (name.includes('express entry') || name.includes('ee ') || name.includes('pnp') || name.includes('economic')) return 'express_entry'
  if (name.includes('family') || name.includes('spousal') || name.includes('sponsor') || name.includes('parent')) return 'family'
  if (name.includes('visitor') || name.includes('trv') || name.includes('super visa')) return 'visitor'
  if (name.includes('citizen')) return 'citizenship'
  return 'other'
}

// ============================================================================
// Main Component
// ============================================================================

export function ImmigrationDetailsPanel({ matterId, tenantId, fieldConfig }: ImmigrationDetailsPanelProps) {
  const { data: immigration, isLoading } = useMatterImmigration(matterId)
  const createImmigration = useCreateMatterImmigration()
  const updateImmigration = useUpdateMatterImmigration()
  const { data: caseTypes } = useCaseTypes(tenantId)
  const [showCrsCalculator, setShowCrsCalculator] = useState(false)

  /** Check if a field should be visible (defaults to true when no config) */
  const isFieldVisible = useCallback(
    (fieldKey: string): boolean => {
      if (!fieldConfig) return true
      return fieldConfig[fieldKey]?.visible !== false
    },
    [fieldConfig],
  )

  const handleFieldSave = useCallback(
    (key: string, value: string | boolean | number | Record<string, number> | null) => {
      if (!immigration) return
      updateImmigration.mutate({
        matterId,
        [key]: value,
      })
    },
    [immigration, updateImmigration, matterId],
  )

  const handleTextSave = useCallback(
    (key: string, value: string | null) => {
      handleFieldSave(key, value)
    },
    [handleFieldSave],
  )

  const handleNumberSave = useCallback(
    (key: string, value: string | null) => {
      handleFieldSave(key, value ? Number(value) : null)
    },
    [handleFieldSave],
  )

  const handleBooleanSave = useCallback(
    (key: string, value: boolean) => {
      handleFieldSave(key, value)
    },
    [handleFieldSave],
  )

  // Determine case type category for conditional sections
  const caseTypeName = useMemo(() => {
    if (!immigration?.case_type_id || !caseTypes) return null
    const ct = caseTypes.find((c) => c.id === immigration.case_type_id)
    return ct?.name ?? null
  }, [immigration?.case_type_id, caseTypes])

  const category = useMemo(
    () => detectCategory(caseTypeName, immigration?.program_category ?? null),
    [caseTypeName, immigration?.program_category],
  )

  // Section completion counts
  const caseInfoCompletion = useMemo(() => {
    if (!immigration) return { filled: 0, total: 4 }
    return {
      filled: countFilled(immigration, ['case_type_id', 'application_number', 'uci_number', 'program_category']),
      total: 4,
    }
  }, [immigration])

  const profileCompletion = useMemo(() => {
    if (!immigration) return { filled: 0, total: 6 }
    return {
      filled: countFilled(immigration, ['country_of_citizenship', 'country_of_residence', 'current_visa_status', 'current_visa_expiry', 'passport_number', 'passport_expiry']),
      total: 6,
    }
  }, [immigration])

  const datesCompletion = useMemo(() => {
    if (!immigration) return { filled: 0, total: 6 }
    return {
      filled: countFilled(immigration, ['date_filed', 'date_biometrics', 'date_medical', 'date_interview', 'date_decision', 'date_landing']),
      total: 6,
    }
  }, [immigration])

  const langCompletion = useMemo(() => {
    if (!immigration) return { filled: 0, total: 3 }
    const scores = immigration.language_test_scores as Record<string, number> | null
    const hasScores = scores && Object.keys(scores).length > 0
    return {
      filled: countFilled(immigration, ['language_test_type', 'education_credential', 'eca_status']) + (hasScores ? 1 : 0),
      total: 4,
    }
  }, [immigration])

  const employmentCompletion = useMemo(() => {
    if (!immigration) return { filled: 0, total: 3 }
    const keys: (keyof MatterImmigration)[] = ['work_experience_years', 'canadian_work_experience_years', 'employer_name']
    if (category === 'work') keys.push('job_title', 'lmia_number', 'job_offer_noc')
    return { filled: countFilled(immigration, keys), total: keys.length }
  }, [immigration, category])

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-full" />
        <Separator />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-8 w-full" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Empty state
  if (!immigration) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Plane className="h-12 w-12 text-slate-300 mb-3" />
        <h3 className="text-sm font-medium text-slate-900">No immigration data</h3>
        <p className="text-sm text-slate-500 mt-1 max-w-sm">
          Immigration details have not been set up for this matter yet.
        </p>
        <Button
          className="mt-4"
          onClick={() => {
            createImmigration.mutate({
              tenant_id: tenantId,
              matter_id: matterId,
            })
          }}
          disabled={createImmigration.isPending}
        >
          <FileText className="h-4 w-4 mr-2" />
          {createImmigration.isPending ? 'Setting up...' : 'Set Up Immigration Details'}
        </Button>
      </div>
    )
  }

  // Filter out any case types with empty/null IDs to avoid Radix SelectItem errors
  const caseTypeOptions = (caseTypes ?? [])
    .filter((ct) => ct.id && ct.id.length > 0)
    .map((ct) => ({
      value: ct.id,
      label: ct.name || ct.slug || ct.id,
    }))

  return (
    <div className="space-y-4">
      {/* Case Information */}
      <CollapsibleSection
        icon={FileText}
        title="Case Information"
        columns={3}
        filledCount={caseInfoCompletion.filled}
        totalCount={caseInfoCompletion.total}
      >
        {isFieldVisible('case_type_id') && (
          <InlineSelectField
            label="Case Type"
            value={immigration.case_type_id}
            fieldKey="case_type_id"
            options={caseTypeOptions}
            onSave={handleTextSave}
            placeholder="Select case type"
          />
        )}
        {isFieldVisible('program_category') && (
          <InlineSelectField
            label="Program Category"
            value={immigration.program_category}
            fieldKey="program_category"
            options={IMMIGRATION_PROGRAM_LEVELS}
            onSave={handleTextSave}
            placeholder="Select category"
          />
        )}
        {isFieldVisible('application_number') && (
          <InlineTextField
            label="Application Number"
            value={immigration.application_number}
            fieldKey="application_number"
            onSave={handleTextSave}
            placeholder="e.g., E012345678"
          />
        )}
        {isFieldVisible('uci_number') && (
          <InlineTextField
            label="UCI Number"
            value={immigration.uci_number}
            fieldKey="uci_number"
            onSave={handleTextSave}
            placeholder="e.g., 1234-5678"
          />
        )}
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">CRS Score</Label>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-900">
              {immigration.crs_score ?? '—'}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowCrsCalculator(true)}
            >
              <Calculator className="h-3.5 w-3.5 mr-1" />
              Calculate
            </Button>
          </div>
        </div>
        <CrsCalculatorSheet
          open={showCrsCalculator}
          onOpenChange={setShowCrsCalculator}
          immigration={immigration}
          matterId={matterId}
        />
      </CollapsibleSection>

      <Separator />

      {/* Client Immigration Profile */}
      <CollapsibleSection
        icon={User}
        title="Client Immigration Profile"
        columns={3}
        filledCount={profileCompletion.filled}
        totalCount={profileCompletion.total}
      >
        {isFieldVisible('country_of_citizenship') && (
          <InlineTextField
            label="Country of Citizenship"
            value={immigration.country_of_citizenship}
            fieldKey="country_of_citizenship"
            onSave={handleTextSave}
          />
        )}
        {isFieldVisible('country_of_residence') && (
          <InlineTextField
            label="Country of Residence"
            value={immigration.country_of_residence}
            fieldKey="country_of_residence"
            onSave={handleTextSave}
          />
        )}
        {isFieldVisible('current_visa_status') && (
          <InlineSelectField
            label="Current Visa Status"
            value={immigration.current_visa_status}
            fieldKey="current_visa_status"
            options={VISA_STATUSES}
            onSave={handleTextSave}
            placeholder="Select status"
          />
        )}
        {isFieldVisible('current_visa_expiry') && (
          <InlineTextField
            label="Visa Expiry"
            value={immigration.current_visa_expiry}
            fieldKey="current_visa_expiry"
            onSave={handleTextSave}
            type="date"
          />
        )}
        {isFieldVisible('passport_number') && (
          <InlineTextField
            label="Passport Number"
            value={immigration.passport_number}
            fieldKey="passport_number"
            onSave={handleTextSave}
          />
        )}
        {isFieldVisible('passport_expiry') && (
          <InlineTextField
            label="Passport Expiry"
            value={immigration.passport_expiry}
            fieldKey="passport_expiry"
            onSave={handleTextSave}
            type="date"
          />
        )}
      </CollapsibleSection>

      <Separator />

      {/* Study Permit Fields — only visible for study cases */}
      {(category === 'study' || category === 'other') && (
        <>
          <CollapsibleSection
            icon={BookOpen}
            title="Study Permit Details"
            columns={3}
            defaultOpen={category === 'study'}
          >
            <InlineTextField
              label="Study Program"
              value={immigration.study_program}
              fieldKey="study_program"
              onSave={handleTextSave}
              placeholder="e.g., Computer Science"
            />
            <InlineSelectField
              label="Study Level"
              value={immigration.study_level}
              fieldKey="study_level"
              options={STUDY_LEVELS}
              onSave={handleTextSave}
              placeholder="Select level"
            />
            <InlineTextField
              label="DLI Number"
              value={immigration.dli_number}
              fieldKey="dli_number"
              onSave={handleTextSave}
              placeholder="e.g., O19359205222"
            />
            <InlineTextField
              label="Study Duration (Months)"
              value={immigration.study_duration_months?.toString() ?? null}
              fieldKey="study_duration_months"
              onSave={handleNumberSave}
              type="number"
              placeholder="e.g., 24"
            />
            <InlineBooleanField
              label="Letter of Acceptance"
              value={immigration.letter_of_acceptance ?? false}
              fieldKey="letter_of_acceptance"
              onSave={handleBooleanSave}
            />
          </CollapsibleSection>
          <Separator />
        </>
      )}

      {/* Work Permit Fields — only visible for work cases */}
      {(category === 'work' || category === 'other') && (
        <>
          <CollapsibleSection
            icon={Building2}
            title="Work Permit Details"
            columns={3}
            defaultOpen={category === 'work'}
            filledCount={employmentCompletion.filled}
            totalCount={employmentCompletion.total}
          >
            <InlineSelectField
              label="Work Permit Type"
              value={immigration.work_permit_type}
              fieldKey="work_permit_type"
              options={WORK_PERMIT_TYPES}
              onSave={handleTextSave}
              placeholder="Select type"
            />
            <InlineTextField
              label="Employer Name"
              value={immigration.employer_name}
              fieldKey="employer_name"
              onSave={handleTextSave}
            />
            <InlineTextField
              label="Job Title"
              value={immigration.job_title}
              fieldKey="job_title"
              onSave={handleTextSave}
              placeholder="e.g., Software Developer"
            />
            <InlineTextField
              label="LMIA Number"
              value={immigration.lmia_number}
              fieldKey="lmia_number"
              onSave={handleTextSave}
              placeholder="e.g., TF12345"
            />
            <InlineTextField
              label="NOC Code"
              value={immigration.job_offer_noc}
              fieldKey="job_offer_noc"
              onSave={handleTextSave}
              placeholder="e.g., 21232"
            />
            <InlineTextField
              label="Work Experience (Years)"
              value={immigration.work_experience_years?.toString() ?? null}
              fieldKey="work_experience_years"
              onSave={handleNumberSave}
              type="number"
              placeholder="e.g., 5"
            />
            <InlineTextField
              label="Canadian Work Experience (Years)"
              value={immigration.canadian_work_experience_years?.toString() ?? null}
              fieldKey="canadian_work_experience_years"
              onSave={handleNumberSave}
              type="number"
              placeholder="e.g., 2"
            />
          </CollapsibleSection>
          <Separator />
        </>
      )}

      {/* Express Entry Fields — only visible for EE cases */}
      {(category === 'express_entry' || category === 'other') && (
        <>
          <CollapsibleSection
            icon={Briefcase}
            title="Express Entry / Economic Immigration"
            columns={3}
            defaultOpen={category === 'express_entry'}
          >
            <InlineTextField
              label="Work Experience (Years)"
              value={immigration.work_experience_years?.toString() ?? null}
              fieldKey="work_experience_years"
              onSave={handleNumberSave}
              type="number"
              placeholder="e.g., 5"
            />
            <InlineTextField
              label="Canadian Work Experience (Years)"
              value={immigration.canadian_work_experience_years?.toString() ?? null}
              fieldKey="canadian_work_experience_years"
              onSave={handleNumberSave}
              type="number"
              placeholder="e.g., 2"
            />
            <InlineTextField
              label="NOC Code"
              value={immigration.job_offer_noc}
              fieldKey="job_offer_noc"
              onSave={handleTextSave}
              placeholder="e.g., 21232"
            />
            <InlineTextField
              label="Employer Name"
              value={immigration.employer_name}
              fieldKey="employer_name"
              onSave={handleTextSave}
            />
            <InlineTextField
              label="Provincial Nominee Program"
              value={immigration.provincial_nominee_program}
              fieldKey="provincial_nominee_program"
              onSave={handleTextSave}
              placeholder="e.g., OINP"
            />
          </CollapsibleSection>
          <Separator />
        </>
      )}

      {/* Family / Spousal Sponsorship — only visible for family cases */}
      {(category === 'family' || category === 'other') && (
        <>
          <CollapsibleSection
            icon={Users}
            title="Family / Spousal Sponsorship"
            columns={3}
            defaultOpen={category === 'family'}
          >
            <InlineTextField
              label="Sponsor Name"
              value={immigration.sponsor_name}
              fieldKey="sponsor_name"
              onSave={handleTextSave}
              placeholder="Full name of sponsor"
            />
            <InlineSelectField
              label="Sponsor Relationship"
              value={immigration.sponsor_relationship}
              fieldKey="sponsor_relationship"
              options={SPONSOR_RELATIONSHIPS}
              onSave={handleTextSave}
              placeholder="Select relationship"
            />
            <InlineSelectField
              label="Sponsor Status"
              value={immigration.sponsor_status}
              fieldKey="sponsor_status"
              options={SPONSOR_STATUSES}
              onSave={handleTextSave}
              placeholder="Select status"
            />
            <InlineTextField
              label="Relationship Start Date"
              value={immigration.relationship_start_date}
              fieldKey="relationship_start_date"
              onSave={handleTextSave}
              type="date"
            />
            <InlineBooleanField
              label="Spouse Included"
              value={immigration.spouse_included ?? false}
              fieldKey="spouse_included"
              onSave={handleBooleanSave}
            />
            <InlineTextField
              label="Number of Dependents"
              value={immigration.dependents_count?.toString() ?? '0'}
              fieldKey="dependents_count"
              onSave={handleNumberSave}
              type="number"
              placeholder="0"
            />
          </CollapsibleSection>
          <Separator />
        </>
      )}

      {/* Key Dates */}
      <CollapsibleSection
        icon={CalendarDays}
        title="Key Dates"
        columns={3}
        filledCount={datesCompletion.filled}
        totalCount={datesCompletion.total}
      >
        {isFieldVisible('date_filed') && (
          <InlineTextField
            label="Date Filed"
            value={immigration.date_filed}
            fieldKey="date_filed"
            onSave={handleTextSave}
            type="date"
          />
        )}
        {isFieldVisible('date_biometrics') && (
          <InlineTextField
            label="Biometrics Date"
            value={immigration.date_biometrics}
            fieldKey="date_biometrics"
            onSave={handleTextSave}
            type="date"
          />
        )}
        {isFieldVisible('date_medical') && (
          <InlineTextField
            label="Medical Exam Date"
            value={immigration.date_medical}
            fieldKey="date_medical"
            onSave={handleTextSave}
            type="date"
          />
        )}
        {isFieldVisible('date_interview') && (
          <InlineTextField
            label="Interview Date"
            value={immigration.date_interview}
            fieldKey="date_interview"
            onSave={handleTextSave}
            type="date"
          />
        )}
        {isFieldVisible('date_decision') && (
          <InlineTextField
            label="Decision Date"
            value={immigration.date_decision}
            fieldKey="date_decision"
            onSave={handleTextSave}
            type="date"
          />
        )}
        {isFieldVisible('date_landing') && (
          <InlineTextField
            label="Landing Date"
            value={immigration.date_landing}
            fieldKey="date_landing"
            onSave={handleTextSave}
            type="date"
          />
        )}
      </CollapsibleSection>

      <Separator />

      {/* Background */}
      <CollapsibleSection icon={Shield} title="Background" columns={2} defaultOpen={false}>
        <InlineBooleanField
          label="Prior Refusals"
          value={immigration.prior_refusals ?? false}
          fieldKey="prior_refusals"
          onSave={handleBooleanSave}
          detailsFieldKey="prior_refusal_details"
          detailsValue={immigration.prior_refusal_details}
          onDetailsSave={handleTextSave}
        />
        <InlineBooleanField
          label="Criminal Record"
          value={immigration.has_criminal_record ?? false}
          fieldKey="has_criminal_record"
          onSave={handleBooleanSave}
          detailsFieldKey="criminal_record_details"
          detailsValue={immigration.criminal_record_details}
          onDetailsSave={handleTextSave}
        />
        <InlineBooleanField
          label="Medical Issues"
          value={immigration.has_medical_issues ?? false}
          fieldKey="has_medical_issues"
          onSave={handleBooleanSave}
          detailsFieldKey="medical_issue_details"
          detailsValue={immigration.medical_issue_details}
          onDetailsSave={handleTextSave}
        />
      </CollapsibleSection>

      <Separator />

      {/* Language & Education */}
      <CollapsibleSection
        icon={Languages}
        title="Language & Education"
        columns={3}
        filledCount={langCompletion.filled}
        totalCount={langCompletion.total}
      >
        <InlineSelectField
          label="Language Test Type"
          value={immigration.language_test_type}
          fieldKey="language_test_type"
          options={LANGUAGE_TEST_TYPES}
          onSave={handleTextSave}
          placeholder="Select test type"
        />
        {immigration.language_test_type && (
          <div className="sm:col-span-2">
            <Label className="text-xs text-slate-500 mb-1 block">
              {immigration.language_test_type.toUpperCase()} Scores (L / R / W / S)
            </Label>
            <LanguageScoreFields
              scores={immigration.language_test_scores as Record<string, number> | null}
              fieldKey="language_test_scores"
              onSave={handleFieldSave}
            />
          </div>
        )}

        {/* Second language test for CRS bilingual bonus */}
        {(category === 'express_entry' || category === 'other') && (
          <>
            <InlineSelectField
              label="Second Language Test"
              value={immigration.second_language_test_type}
              fieldKey="second_language_test_type"
              options={LANGUAGE_TEST_TYPES}
              onSave={handleTextSave}
              placeholder="For CRS bilingual bonus"
            />
            {immigration.second_language_test_type && (
              <div className="sm:col-span-2">
                <Label className="text-xs text-slate-500 mb-1 block">
                  {immigration.second_language_test_type.toUpperCase()} Scores (L / R / W / S)
                </Label>
                <LanguageScoreFields
                  scores={immigration.second_language_test_scores as Record<string, number> | null}
                  fieldKey="second_language_test_scores"
                  onSave={handleFieldSave}
                />
              </div>
            )}
          </>
        )}

        <InlineTextField
          label="Education Credential"
          value={immigration.education_credential}
          fieldKey="education_credential"
          onSave={handleTextSave}
          placeholder="e.g., Bachelor's Degree"
        />
        <InlineSelectField
          label="ECA Status"
          value={immigration.eca_status}
          fieldKey="eca_status"
          options={ECA_STATUSES}
          onSave={handleTextSave}
          placeholder="Select ECA status"
        />
      </CollapsibleSection>

      <Separator />

      {/* Employment — show for visitor/general cases that don't have a specific work section */}
      {category !== 'work' && category !== 'express_entry' && (
        <>
          <CollapsibleSection icon={Briefcase} title="Employment" columns={3} defaultOpen={false}>
            <InlineTextField
              label="Work Experience (Years)"
              value={immigration.work_experience_years?.toString() ?? null}
              fieldKey="work_experience_years"
              onSave={handleNumberSave}
              type="number"
              placeholder="e.g., 5"
            />
            <InlineTextField
              label="Canadian Work Experience (Years)"
              value={immigration.canadian_work_experience_years?.toString() ?? null}
              fieldKey="canadian_work_experience_years"
              onSave={handleNumberSave}
              type="number"
              placeholder="e.g., 2"
            />
            <InlineTextField
              label="Employer Name"
              value={immigration.employer_name}
              fieldKey="employer_name"
              onSave={handleTextSave}
            />
          </CollapsibleSection>
          <Separator />
        </>
      )}

      {/* Family — show for non-family cases (family cases have the dedicated section above) */}
      {category !== 'family' && (
        <>
          <CollapsibleSection icon={Heart} title="Family" columns={3} defaultOpen={false}>
            <InlineBooleanField
              label="Spouse Included"
              value={immigration.spouse_included ?? false}
              fieldKey="spouse_included"
              onSave={handleBooleanSave}
            />
            <InlineTextField
              label="Number of Dependents"
              value={immigration.dependents_count?.toString() ?? '0'}
              fieldKey="dependents_count"
              onSave={handleNumberSave}
              type="number"
              placeholder="0"
            />
          </CollapsibleSection>
          <Separator />
        </>
      )}

      {/* Retainer */}
      <CollapsibleSection icon={Wallet} title="Retainer & Fees" columns={3} defaultOpen={false}>
        <InlineBooleanField
          label="Retainer Signed"
          value={immigration.retainer_signed ?? false}
          fieldKey="retainer_signed"
          onSave={handleBooleanSave}
        />
        <InlineTextField
          label="Retainer Signed Date"
          value={immigration.retainer_signed_at}
          fieldKey="retainer_signed_at"
          onSave={handleTextSave}
          type="date"
        />
        <InlineTextField
          label="Retainer Amount"
          value={immigration.retainer_amount?.toString() ?? null}
          fieldKey="retainer_amount"
          onSave={handleNumberSave}
          type="number"
          placeholder="e.g., 5000"
        />
        <InlineTextField
          label="Government Fees"
          value={immigration.government_fees?.toString() ?? null}
          fieldKey="government_fees"
          onSave={handleNumberSave}
          type="number"
          placeholder="e.g., 1325"
        />
      </CollapsibleSection>
    </div>
  )
}
