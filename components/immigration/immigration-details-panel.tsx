'use client'

import { useState, useCallback, useRef, useEffect, type ReactNode } from 'react'
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
} from '@/lib/utils/constants'
import { formatDate, formatCurrency } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
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
  FileText,
  GraduationCap,
  Heart,
  Languages,
  Plane,
  Scale,
  Shield,
  User,
  Wallet,
} from 'lucide-react'


import { CrsCalculatorSheet } from './crs-calculator-sheet'
import type { Database } from '@/lib/types/database'

type MatterImmigration = Database['public']['Tables']['matter_immigration']['Row']

interface ImmigrationDetailsPanelProps {
  matterId: string
  tenantId: string
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
// Section Component
// ============================================================================

interface SectionProps {
  icon: React.ElementType
  title: string
  children: React.ReactNode
  columns?: 2 | 3 | 4
}

function Section({ icon: Icon, title, children, columns = 3 }: SectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>
      <div
        className={cn(
          'grid gap-x-6 gap-y-3',
          columns === 2 && 'grid-cols-1 sm:grid-cols-2',
          columns === 3 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
          columns === 4 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
        )}
      >
        {children}
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function ImmigrationDetailsPanel({ matterId, tenantId }: ImmigrationDetailsPanelProps) {
  const { data: immigration, isLoading } = useMatterImmigration(matterId)
  const createImmigration = useCreateMatterImmigration()
  const updateImmigration = useUpdateMatterImmigration()
  const { data: caseTypes } = useCaseTypes(tenantId)
  const [showCrsCalculator, setShowCrsCalculator] = useState(false)
  const handleFieldSave = useCallback(
    (key: string, value: string | boolean | number | null) => {
      if (!immigration) return
      updateImmigration.mutate({
        matterId,
        [key]: value,
      })
    },
    [immigration, updateImmigration, matterId]
  )

  const handleTextSave = useCallback(
    (key: string, value: string | null) => {
      handleFieldSave(key, value)
    },
    [handleFieldSave]
  )

  const handleNumberSave = useCallback(
    (key: string, value: string | null) => {
      handleFieldSave(key, value ? Number(value) : null)
    },
    [handleFieldSave]
  )

  const handleBooleanSave = useCallback(
    (key: string, value: boolean) => {
      handleFieldSave(key, value)
    },
    [handleFieldSave]
  )

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

  const caseTypeOptions = (caseTypes ?? []).map((ct) => ({
    value: ct.id,
    label: ct.name,
  }))

  return (
    <div className="space-y-6">
      {/* Case Information */}
      <Section icon={FileText} title="Case Information" columns={3}>
        <InlineSelectField
          label="Case Type"
          value={immigration.case_type_id}
          fieldKey="case_type_id"
          options={caseTypeOptions}
          onSave={handleTextSave}
          placeholder="Select case type"
        />
        <InlineTextField
          label="Application Number"
          value={immigration.application_number}
          fieldKey="application_number"
          onSave={handleTextSave}
          placeholder="e.g., E012345678"
        />
        <InlineTextField
          label="UCI Number"
          value={immigration.uci_number}
          fieldKey="uci_number"
          onSave={handleTextSave}
          placeholder="e.g., 1234-5678"
        />
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
      </Section>

      <Separator />

      {/* Client Immigration Profile */}
      <Section icon={User} title="Client Immigration Profile" columns={3}>
        <InlineTextField
          label="Country of Citizenship"
          value={immigration.country_of_citizenship}
          fieldKey="country_of_citizenship"
          onSave={handleTextSave}
        />
        <InlineTextField
          label="Country of Residence"
          value={immigration.country_of_residence}
          fieldKey="country_of_residence"
          onSave={handleTextSave}
        />
        <InlineSelectField
          label="Current Visa Status"
          value={immigration.current_visa_status}
          fieldKey="current_visa_status"
          options={VISA_STATUSES}
          onSave={handleTextSave}
          placeholder="Select status"
        />
        <InlineTextField
          label="Visa Expiry"
          value={immigration.current_visa_expiry}
          fieldKey="current_visa_expiry"
          onSave={handleTextSave}
          type="date"
        />
        <InlineTextField
          label="Passport Number"
          value={immigration.passport_number}
          fieldKey="passport_number"
          onSave={handleTextSave}
        />
        <InlineTextField
          label="Passport Expiry"
          value={immigration.passport_expiry}
          fieldKey="passport_expiry"
          onSave={handleTextSave}
          type="date"
        />
      </Section>

      <Separator />

      {/* Key Dates */}
      <Section icon={CalendarDays} title="Key Dates" columns={3}>
        <InlineTextField
          label="Date Filed"
          value={immigration.date_filed}
          fieldKey="date_filed"
          onSave={handleTextSave}
          type="date"
        />
        <InlineTextField
          label="Biometrics Date"
          value={immigration.date_biometrics}
          fieldKey="date_biometrics"
          onSave={handleTextSave}
          type="date"
        />
        <InlineTextField
          label="Medical Exam Date"
          value={immigration.date_medical}
          fieldKey="date_medical"
          onSave={handleTextSave}
          type="date"
        />
        <InlineTextField
          label="Interview Date"
          value={immigration.date_interview}
          fieldKey="date_interview"
          onSave={handleTextSave}
          type="date"
        />
        <InlineTextField
          label="Decision Date"
          value={immigration.date_decision}
          fieldKey="date_decision"
          onSave={handleTextSave}
          type="date"
        />
        <InlineTextField
          label="Landing Date"
          value={immigration.date_landing}
          fieldKey="date_landing"
          onSave={handleTextSave}
          type="date"
        />
      </Section>

      <Separator />

      {/* Background */}
      <Section icon={Shield} title="Background" columns={2}>
        <InlineBooleanField
          label="Prior Refusals"
          value={immigration.prior_refusals}
          fieldKey="prior_refusals"
          onSave={handleBooleanSave}
          detailsFieldKey="prior_refusal_details"
          detailsValue={immigration.prior_refusal_details}
          onDetailsSave={handleTextSave}
        />
        <InlineBooleanField
          label="Criminal Record"
          value={immigration.has_criminal_record}
          fieldKey="has_criminal_record"
          onSave={handleBooleanSave}
          detailsFieldKey="criminal_record_details"
          detailsValue={immigration.criminal_record_details}
          onDetailsSave={handleTextSave}
        />
        <InlineBooleanField
          label="Medical Issues"
          value={immigration.has_medical_issues}
          fieldKey="has_medical_issues"
          onSave={handleBooleanSave}
          detailsFieldKey="medical_issue_details"
          detailsValue={immigration.medical_issue_details}
          onDetailsSave={handleTextSave}
        />
      </Section>

      <Separator />

      {/* Language & Education */}
      <Section icon={Languages} title="Language & Education" columns={3}>
        <InlineSelectField
          label="Language Test Type"
          value={immigration.language_test_type}
          fieldKey="language_test_type"
          options={LANGUAGE_TEST_TYPES}
          onSave={handleTextSave}
          placeholder="Select test type"
        />
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
      </Section>

      <Separator />

      {/* Employment */}
      <Section icon={Briefcase} title="Employment" columns={3}>
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
          label="Provincial Nominee Program"
          value={immigration.provincial_nominee_program}
          fieldKey="provincial_nominee_program"
          onSave={handleTextSave}
          placeholder="e.g., OINP"
        />
      </Section>

      <Separator />

      {/* Family */}
      <Section icon={Heart} title="Family" columns={3}>
        <InlineBooleanField
          label="Spouse Included"
          value={immigration.spouse_included}
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
      </Section>

      <Separator />

      {/* Retainer */}
      <Section icon={Wallet} title="Retainer & Fees" columns={3}>
        <InlineBooleanField
          label="Retainer Signed"
          value={immigration.retainer_signed}
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
      </Section>
    </div>
  )
}
