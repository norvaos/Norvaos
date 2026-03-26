'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Check,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  Clock,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { DatePicker } from '@/components/ui/date-picker'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  useFieldVerifications,
  useVerifyField,
  useBulkVerifyFields,
  useUnverifyField,
  isVerificationStale,
  isFieldLocked,
  isFieldRejected,
} from '@/lib/queries/field-verifications'
import { VerificationRejectDialog } from '@/components/ircc/verification-reject-dialog'
import {
  buildQuestionnaire,
  evaluateFieldCondition,
  validateSection,
  responsesToProfile,
  type Questionnaire,
  profileToResponses,
  profilePathGet,
} from '@/lib/ircc/questionnaire-engine'
import type {
  IRCCProfile,
  IRCCFieldMapping,
  IRCCFormSection,
} from '@/lib/types/ircc-profile'
import type { ValidationError } from '@/lib/ircc/questionnaire-engine'
import { RepeaterField } from '@/components/ircc/repeater-field'

// ── Countries ─────────────────────────────────────────────────────────────────

const COUNTRIES: { label: string; value: string }[] = [
  { label: 'Afghanistan', value: 'Afghanistan' },
  { label: 'Algeria', value: 'Algeria' },
  { label: 'Argentina', value: 'Argentina' },
  { label: 'Australia', value: 'Australia' },
  { label: 'Bangladesh', value: 'Bangladesh' },
  { label: 'Brazil', value: 'Brazil' },
  { label: 'Canada', value: 'Canada' },
  { label: 'Chile', value: 'Chile' },
  { label: 'China', value: 'China' },
  { label: 'Colombia', value: 'Colombia' },
  { label: 'Cuba', value: 'Cuba' },
  { label: 'Dominican Republic', value: 'Dominican Republic' },
  { label: 'Ecuador', value: 'Ecuador' },
  { label: 'Egypt', value: 'Egypt' },
  { label: 'El Salvador', value: 'El Salvador' },
  { label: 'Ethiopia', value: 'Ethiopia' },
  { label: 'France', value: 'France' },
  { label: 'Germany', value: 'Germany' },
  { label: 'Ghana', value: 'Ghana' },
  { label: 'Guatemala', value: 'Guatemala' },
  { label: 'Haiti', value: 'Haiti' },
  { label: 'Honduras', value: 'Honduras' },
  { label: 'India', value: 'India' },
  { label: 'Indonesia', value: 'Indonesia' },
  { label: 'Iran', value: 'Iran' },
  { label: 'Iraq', value: 'Iraq' },
  { label: 'Ireland', value: 'Ireland' },
  { label: 'Israel', value: 'Israel' },
  { label: 'Italy', value: 'Italy' },
  { label: 'Jamaica', value: 'Jamaica' },
  { label: 'Japan', value: 'Japan' },
  { label: 'Jordan', value: 'Jordan' },
  { label: 'Kenya', value: 'Kenya' },
  { label: 'Lebanon', value: 'Lebanon' },
  { label: 'Malaysia', value: 'Malaysia' },
  { label: 'Mexico', value: 'Mexico' },
  { label: 'Morocco', value: 'Morocco' },
  { label: 'Nepal', value: 'Nepal' },
  { label: 'Netherlands', value: 'Netherlands' },
  { label: 'New Zealand', value: 'New Zealand' },
  { label: 'Nigeria', value: 'Nigeria' },
  { label: 'Pakistan', value: 'Pakistan' },
  { label: 'Peru', value: 'Peru' },
  { label: 'Philippines', value: 'Philippines' },
  { label: 'Poland', value: 'Poland' },
  { label: 'Portugal', value: 'Portugal' },
  { label: 'Russia', value: 'Russia' },
  { label: 'Saudi Arabia', value: 'Saudi Arabia' },
  { label: 'South Africa', value: 'South Africa' },
  { label: 'South Korea', value: 'South Korea' },
  { label: 'Spain', value: 'Spain' },
  { label: 'Sri Lanka', value: 'Sri Lanka' },
  { label: 'Sudan', value: 'Sudan' },
  { label: 'Sweden', value: 'Sweden' },
  { label: 'Switzerland', value: 'Switzerland' },
  { label: 'Syria', value: 'Syria' },
  { label: 'Taiwan', value: 'Taiwan' },
  { label: 'Thailand', value: 'Thailand' },
  { label: 'Trinidad and Tobago', value: 'Trinidad and Tobago' },
  { label: 'Turkey', value: 'Turkey' },
  { label: 'Ukraine', value: 'Ukraine' },
  { label: 'United Arab Emirates', value: 'United Arab Emirates' },
  { label: 'United Kingdom', value: 'United Kingdom' },
  { label: 'United States', value: 'United States' },
  { label: 'Venezuela', value: 'Venezuela' },
  { label: 'Vietnam', value: 'Vietnam' },
]

// Labels are now resolved centrally in deriveClientLabel() (xfa-label-utils.ts).
// The questionnaire engine passes pre-resolved labels via field.label.
// No need for a local override map.

// ── Props ─────────────────────────────────────────────────────────────────────

interface IRCCQuestionnaireProps {
  /** IRCC form codes to include in this questionnaire, e.g. ['IMM5257', 'IMM5406'] */
  formCodes: string[]
  /** Pre-fill data from an existing profile */
  existingProfile: Partial<IRCCProfile>
  /** Called when the user navigates between steps (auto-save) */
  onSave: (profile: Partial<IRCCProfile>) => void | Promise<void>
  /** Called when the user completes the final step */
  onComplete: (profile: Partial<IRCCProfile>) => void | Promise<void>
  /** When true, all fields are disabled and save/complete actions are hidden */
  readOnly?: boolean
  /** Additional CSS class names */
  className?: string
  /**
   * When set, the questionnaire jumps to the section containing this
   * profile_path and scrolls to the specific field. Used by "Go to Field"
   * navigation from workflow blocker items.
   */
  initialProfilePath?: string | null
  /**
   * Pre-built questionnaire sections from the DB engine.
   * When provided, skips the registry-based buildQuestionnaire() call.
   */
  prebuiltQuestionnaire?: Questionnaire | null
  /**
   * Matter ID  -  enables field-level verification badges and actions.
   * When provided, verifications are loaded and shown next to each field.
   */
  matterId?: string | null
  /**
   * When true, shows "Verify" and "Verify All" buttons (lawyer-level sign-off).
   * Should be false for client-facing portal view.
   */
  canVerify?: boolean
  /**
   * When true, enables portal-mode rendering:
   *   - Verified fields are rendered as disabled with a "Verified by Law Firm" badge
   *   - Rejected fields have a red border and show the rejection reason
   *   - Pending/submitted fields remain editable
   */
  portalMode?: boolean
  /**
   * Called when a client clicks "Fixed It" on a rejected field in portal mode.
   * The parent component handles the API call to re-submit.
   */
  onFieldResubmit?: (profilePath: string) => void | Promise<void>
}

// ── Component ─────────────────────────────────────────────────────────────────

export function IRCCQuestionnaire({
  formCodes,
  existingProfile,
  onSave,
  onComplete,
  readOnly = false,
  className,
  initialProfilePath,
  prebuiltQuestionnaire,
  matterId,
  canVerify = false,
  portalMode = false,
  onFieldResubmit,
}: IRCCQuestionnaireProps) {
  // Build the questionnaire from form codes + existing data
  // If prebuiltQuestionnaire is provided (from DB engine), use it directly
  const registryQuestionnaire = useMemo(
    () => prebuiltQuestionnaire ?? buildQuestionnaire(formCodes, existingProfile),
    [formCodes, existingProfile, prebuiltQuestionnaire],
  )
  const questionnaire = registryQuestionnaire

  const { sections } = questionnaire

  // Collect all field mappings across sections for profileToResponses
  const allFields = useMemo(
    () => sections.flatMap((s) => s.fields as IRCCFieldMapping[]),
    [sections],
  )

  // ── Local State ───────────────────────────────────────────────────────────

  const [currentStep, setCurrentStep] = useState(0)
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    profileToResponses(existingProfile, allFields),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)

  // ── Rejection dialog state ─────────────────────────────────────────────
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectTarget, setRejectTarget] = useState<{ profilePath: string; label: string } | null>(null)

  // ── Field Verifications ──────────────────────────────────────────────────
  const { data: verifications = {} } = useFieldVerifications(matterId)
  const verifyField = useVerifyField(matterId ?? '')
  const bulkVerify = useBulkVerifyFields(matterId ?? '')
  const unverifyField = useUnverifyField(matterId ?? '')

  // Ensure step is within bounds if sections change
  useEffect(() => {
    if (currentStep >= sections.length && sections.length > 0) {
      setCurrentStep(sections.length - 1)
    }
  }, [currentStep, sections.length])

  // ── Deep navigation: jump to the section + field matching initialProfilePath ──
  const lastNavigatedPath = useRef<string | null>(null)

  useEffect(() => {
    if (!initialProfilePath || initialProfilePath === lastNavigatedPath.current) return
    lastNavigatedPath.current = initialProfilePath

    // Find which section contains a field with this profile_path
    const targetIndex = sections.findIndex((section) =>
      section.fields.some((f) => f.profile_path === initialProfilePath),
    )

    if (targetIndex === -1) return // Field not found in any section

    // Navigate to that section's step immediately
    setErrors({})
    setCurrentStep(targetIndex)

    // Scroll and highlight the target field.
    // Must wait for: (a) sheet slide-in animation (~500ms), (b) step re-render.
    // We poll every 100ms up to 1.5s so the timing is robust regardless of
    // how fast the animation finishes or the sheet was already open.
    let attempts = 0
    const MAX_ATTEMPTS = 15

    function tryScrollToField() {
      attempts++
      const fieldElement = document.getElementById(initialProfilePath as string)

      if (fieldElement) {
        // Find the nearest scrollable ancestor (our overflow-y-auto sheet div)
        let scrollContainer: HTMLElement | null = fieldElement.parentElement
        while (scrollContainer && scrollContainer !== document.body) {
          const overflow = window.getComputedStyle(scrollContainer).overflowY
          if (overflow === 'auto' || overflow === 'scroll') break
          scrollContainer = scrollContainer.parentElement
        }

        if (scrollContainer && scrollContainer !== document.body) {
          // Calculate offset of field relative to scroll container
          const fieldRect = fieldElement.getBoundingClientRect()
          const containerRect = scrollContainer.getBoundingClientRect()
          const offset = fieldRect.top - containerRect.top + scrollContainer.scrollTop - 80 // 80px padding from top
          scrollContainer.scrollTo({ top: offset, behavior: 'smooth' })
        } else {
          // Fallback: native scrollIntoView
          fieldElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }

        // Highlight the field row
        const wrapper = fieldElement.closest('[data-profile-path]') ?? fieldElement.parentElement
        if (wrapper) {
          ;(wrapper as HTMLElement).classList.add('ring-2', 'ring-blue-400', 'ring-offset-2', 'rounded-md')
          setTimeout(() => {
            ;(wrapper as HTMLElement).classList.remove('ring-2', 'ring-blue-400', 'ring-offset-2', 'rounded-md')
          }, 2500)
        }

        // Focus for immediate editing
        fieldElement.focus({ preventScroll: true })
        return // Done
      }

      // Element not in DOM yet  -  retry
      if (attempts < MAX_ATTEMPTS) {
        setTimeout(tryScrollToField, 100)
      }
    }

    // Start polling after a short initial delay (let step state update + first render)
    setTimeout(tryScrollToField, 200)
  }, [initialProfilePath, sections])

  // ── Derived ───────────────────────────────────────────────────────────────

  const currentSection = sections[currentStep] as IRCCFormSection | undefined
  const isFirstStep = currentStep === 0
  const isLastStep = currentStep === sections.length - 1
  const totalSteps = sections.length

  // Calculate overall progress based on filled fields
  const overallProgress = useMemo(() => {
    let filled = 0
    let total = 0
    for (const section of sections) {
      for (const field of section.fields) {
        if (!evaluateFieldCondition(field, values)) continue
        total++
        const val = values[field.profile_path]
        if (isValueFilled(val, field.field_type)) filled++
      }
    }
    return total > 0 ? Math.round((filled / total) * 100) : 0
  }, [sections, values])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const updateValue = useCallback((profilePath: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [profilePath]: value }))
    // Clear any error for this field
    setErrors((prev) => {
      if (!prev[profilePath]) return prev
      const next = { ...prev }
      delete next[profilePath]
      return next
    })
  }, [])

  const buildProfile = useCallback((): Partial<IRCCProfile> => {
    return responsesToProfile(values, existingProfile)
  }, [values, existingProfile])

  const handleValidateAndProceed = useCallback(
    async (direction: 'next' | 'complete') => {
      if (!currentSection) return

      // Validate the current section
      const validationErrors = validateSection(
        currentSection as IRCCFormSection,
        values,
      )

      if (validationErrors.length > 0) {
        const errorMap: Record<string, string> = {}
        for (const err of validationErrors) {
          errorMap[err.profile_path] = err.message
        }
        setErrors(errorMap)
        return
      }

      setErrors({})
      const profile = buildProfile()

      if (direction === 'complete') {
        setIsSaving(true)
        try {
          await onComplete(profile)
        } finally {
          setIsSaving(false)
        }
      } else {
        // Auto-save on step navigation
        setIsSaving(true)
        try {
          await onSave(profile)
        } finally {
          setIsSaving(false)
        }
        setCurrentStep((s) => Math.min(s + 1, totalSteps - 1))
      }
    },
    [currentSection, values, buildProfile, onComplete, onSave, totalSteps],
  )

  const handlePrevious = useCallback(async () => {
    if (isFirstStep) return
    // Auto-save before going back
    const profile = buildProfile()
    setIsSaving(true)
    try {
      await onSave(profile)
    } finally {
      setIsSaving(false)
    }
    setErrors({})
    setCurrentStep((s) => Math.max(s - 1, 0))
  }, [isFirstStep, buildProfile, onSave])

  const handleStepClick = useCallback(
    (stepIndex: number) => {
      // Allow clicking on any step for navigation (no validation on click)
      if (stepIndex === currentStep) return
      setErrors({})
      setCurrentStep(stepIndex)
    },
    [currentStep],
  )

  // ── Render ────────────────────────────────────────────────────────────────

  if (sections.length === 0) {
    return (
      <div className={cn('py-12 text-centre', className)}>
        <p className="text-muted-foreground text-sm">
          No questionnaire sections found for the selected forms.
        </p>
      </div>
    )
  }

  return (
    <div className={cn('space-y-8', className)}>
      {/* Overall progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-foreground">Your progress</span>
          <span className="text-muted-foreground tabular-nums">{overallProgress}%</span>
        </div>
        <Progress value={overallProgress} className="h-1.5" />
      </div>

      {/* Step progress  -  segmented bar with labels */}
      <div className="space-y-2">
        <div
          className="flex gap-1"
          role="progressbar"
          aria-label="Questionnaire progress"
          aria-valuenow={currentStep + 1}
          aria-valuemax={totalSteps}
        >
          {sections.map((section, index) => {
            const isComplete = isSectionComplete(section, values)
            const isCurrent = index === currentStep
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => handleStepClick(index)}
                className={cn(
                  'relative h-2 flex-1 rounded-full transition-colors',
                  isComplete
                    ? 'bg-primary'
                    : isCurrent
                      ? 'bg-primary/50'
                      : 'bg-muted',
                )}
                aria-label={`Step ${index + 1}: ${section.title}${isComplete ? ' (complete)' : isCurrent ? ' (current)' : ''}`}
              >
                {isComplete && (
                  <span className="absolute -top-0.5 right-0.5 flex size-3 items-center justify-center rounded-full bg-primary">
                    <Check className="size-2 text-primary-foreground" strokeWidth={3} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
        {/* Section labels */}
        <div className="flex gap-1">
          {sections.map((section, index) => {
            const isCurrent = index === currentStep
            return (
              <span
                key={section.id}
                className={cn(
                  'flex-1 truncate text-center text-[10px] leading-tight',
                  isCurrent
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {section.title}
              </span>
            )
          })}
        </div>
        <p className="text-muted-foreground text-sm">
          Step {currentStep + 1} of {totalSteps}
        </p>
      </div>

      {/* Current section header */}
      {currentSection && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl font-semibold tracking-tight">
              {currentSection.title}
            </h2>
            {canVerify && matterId && (() => {
              const sectionFields = currentSection.fields.filter(
                (f) => evaluateFieldCondition(f, values) && values[f.profile_path] != null && values[f.profile_path] !== ''
              )
              if (sectionFields.length === 0) return null
              const allVerified = sectionFields.every((f) => {
                const v = verifications[f.profile_path]
                return v && !isVerificationStale(v, values[f.profile_path])
              })
              return (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  disabled={allVerified || bulkVerify.isPending}
                  onClick={() => {
                    bulkVerify.mutate(
                      sectionFields.map((f) => ({ profile_path: f.profile_path, verified_value: values[f.profile_path] }))
                    )
                  }}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {allVerified ? 'All Verified' : 'Verify All'}
                </Button>
              )
            })()}
          </div>
          {currentSection.description && (
            <p className="text-muted-foreground text-sm leading-relaxed">
              {currentSection.description}
            </p>
          )}
        </div>
      )}

      {/* Read-only banner */}
      {readOnly && (
        <div className="rounded-md border border-muted bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground">
          This questionnaire has been submitted and is view-only.
        </div>
      )}

      {/* Fields  -  grouped by XFA subsection */}
      {currentSection && (
        <div className="space-y-4">
          {groupFieldsBySubsection(currentSection.fields).map((group, groupIdx) => (
            <div
              key={group.key}
              className="rounded-lg border border-border bg-card p-5 shadow-sm md:p-6"
            >
              {group.label && groupIdx > 0 && (
                <p className="text-muted-foreground mb-4 text-xs font-medium uppercase tracking-wider">
                  {group.label}
                </p>
              )}
              <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
                {group.fields.map((field) => {
                  // Evaluate conditional visibility
                  if (!evaluateFieldCondition(field, values)) return null

                  const fieldError = errors[field.profile_path]
                  const fieldValue = values[field.profile_path]

                  // Repeater fields span the full width
                  const isFullWidth =
                    field.field_type === 'repeater' ||
                    field.field_type === 'textarea' ||
                    field.field_type === 'boolean'

                  return (
                    <div
                      key={field.profile_path}
                      data-profile-path={field.profile_path}
                      className={cn(
                        'space-y-1.5',
                        isFullWidth && 'md:col-span-2',
                        field.show_when && 'animate-in fade-in duration-200',
                      )}
                    >
                      {field.field_type !== 'repeater' &&
                        field.field_type !== 'boolean' && (
                          <div className="flex items-center gap-2">
                            <Label htmlFor={field.profile_path} className="text-sm font-medium">
                              {field.label}
                              {field.is_required && (
                                <span className="text-destructive ml-0.5">*</span>
                              )}
                            </Label>
                            {matterId && (() => {
                              const v = verifications[field.profile_path]
                              if (!v) return null

                              // Portal mode: show "Verified by Law Firm" or "Needs Correction"
                              if (portalMode) {
                                if (isFieldLocked(v)) {
                                  return (
                                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-green-300 text-green-700 bg-green-50 gap-0.5">
                                      <ShieldCheck className="h-2.5 w-2.5" />
                                      Verified by Law Firm
                                    </Badge>
                                  )
                                }
                                if (isFieldRejected(v)) {
                                  return (
                                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-red-300 text-red-700 bg-red-50 gap-0.5">
                                      <AlertCircle className="h-2.5 w-2.5" />
                                      Needs Correction
                                    </Badge>
                                  )
                                }
                                return null
                              }

                              // Staff mode: show verified/stale badges
                              const stale = isVerificationStale(v, fieldValue)
                              return stale ? (
                                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-amber-300 text-amber-700 bg-amber-50 gap-0.5">
                                  <ShieldAlert className="h-2.5 w-2.5" />
                                  Stale
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-green-300 text-green-700 bg-green-50 gap-0.5">
                                  <ShieldCheck className="h-2.5 w-2.5" />
                                  Verified
                                </Badge>
                              )
                            })()}
                          </div>
                        )}

                      {(() => {
                        const fv = verifications[field.profile_path]
                        const fieldDisabled = readOnly || (portalMode && isFieldLocked(fv))
                        const fieldRejected = portalMode && isFieldRejected(fv)
                        return (
                          <div className={cn(fieldRejected && 'rounded-md border-2 border-red-500 p-2')}>
                            {renderField(field, fieldValue, fieldDisabled, values, (val) =>
                              updateValue(field.profile_path, val),
                              fieldError,
                            )}
                            {fieldRejected && fv?.rejection_reason && (
                              <div className="mt-1.5 space-y-1.5">
                                <p className="flex items-center gap-1 text-xs font-medium text-red-600">
                                  <AlertCircle className="size-3 shrink-0" />
                                  {fv.rejection_reason}
                                </p>
                                {onFieldResubmit && (
                                  <button
                                    type="button"
                                    className="flex items-center gap-1 rounded-md border border-green-300 bg-green-50 px-2.5 py-1 text-[11px] font-medium text-green-700 hover:bg-green-100 transition-colors"
                                    onClick={() => onFieldResubmit(field.profile_path)}
                                  >
                                    <Check className="h-3 w-3" />
                                    Fixed It  -  Ready for Review
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })()}

                      {field.description &&
                        field.field_type !== 'repeater' && (
                          <p className="text-muted-foreground text-xs">
                            {field.description}
                          </p>
                        )}

                      {field.max_length != null &&
                        typeof fieldValue === 'string' &&
                        fieldValue.length > field.max_length * 0.8 && (
                          <p
                            className={cn(
                              'text-xs tabular-nums',
                              fieldValue.length > field.max_length
                                ? 'text-destructive'
                                : 'text-muted-foreground',
                            )}
                          >
                            {fieldValue.length}/{field.max_length} characters
                          </p>
                        )}

                      {fieldError && (
                        <p className="text-destructive flex items-center gap-1 text-xs font-medium" role="alert">
                          <AlertCircle className="size-3 shrink-0" />
                          {fieldError}
                        </p>
                      )}

                      {canVerify && matterId && field.field_type !== 'repeater' && (() => {
                        const v = verifications[field.profile_path]
                        const hasValue = fieldValue != null && fieldValue !== ''
                        if (!hasValue) return null

                        // Waiting for Client: field was rejected, awaiting client correction
                        if (v?.verification_status === 'rejected') {
                          return (
                            <div className="flex items-center gap-2">
                              <span className="flex items-center gap-1 text-[11px] text-amber-600 font-medium">
                                <Clock className="h-3 w-3 animate-pulse" />
                                Waiting for Client
                              </span>
                              <button
                                type="button"
                                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
                                disabled={unverifyField.isPending}
                                onClick={() => unverifyField.mutate(field.profile_path)}
                              >
                                <ShieldOff className="h-3 w-3" />
                                Clear
                              </button>
                            </div>
                          )
                        }

                        // Re-submitted by client: ready for re-review
                        if (v?.verification_status === 'submitted') {
                          return (
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-blue-300 text-blue-700 bg-blue-50 gap-0.5">
                                <Clock className="h-2.5 w-2.5" />
                                Re-submitted
                              </Badge>
                              <button
                                type="button"
                                className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 transition-colors font-medium"
                                disabled={verifyField.isPending}
                                onClick={() => verifyField.mutate({ profile_path: field.profile_path, verified_value: fieldValue })}
                              >
                                <ShieldCheck className="h-3 w-3" />
                                Verify
                              </button>
                            </div>
                          )
                        }

                        const isVerified = v && !isVerificationStale(v, fieldValue)
                        if (isVerified) {
                          return (
                            <button
                              type="button"
                              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
                              disabled={unverifyField.isPending}
                              onClick={() => unverifyField.mutate(field.profile_path)}
                            >
                              <ShieldOff className="h-3 w-3" />
                              Unverify
                            </button>
                          )
                        }
                        return (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 transition-colors font-medium"
                              disabled={verifyField.isPending}
                              onClick={() => verifyField.mutate({ profile_path: field.profile_path, verified_value: fieldValue })}
                            >
                              <ShieldCheck className="h-3 w-3" />
                              Verify
                            </button>
                            <button
                              type="button"
                              className="flex items-center gap-1 text-[11px] text-red-500 hover:text-red-700 transition-colors"
                              onClick={() => {
                                setRejectTarget({ profilePath: field.profile_path, label: field.label })
                                setRejectDialogOpen(true)
                              }}
                            >
                              <XCircle className="h-3 w-3" />
                              Reject
                            </button>
                          </div>
                        )
                      })()}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between border-t border-border pt-6">
        <Button
          type="button"
          variant="outline"
          disabled={isFirstStep || isSaving}
          onClick={handlePrevious}
        >
          <ChevronLeft className="size-4" />
          Previous
        </Button>

        {isLastStep ? (
          readOnly ? (
            <div />
          ) : (
            <Button
              type="button"
              disabled={isSaving}
              onClick={() => handleValidateAndProceed('complete')}
              className="min-w-[160px]"
            >
              {isSaving ? 'Submitting...' : 'Submit Questionnaire'}
              <Check className="size-4" />
            </Button>
          )
        ) : (
          <Button
            type="button"
            disabled={isSaving}
            onClick={() => handleValidateAndProceed('next')}
            className="min-w-[140px]"
          >
            {isSaving ? 'Saving...' : 'Save & Continue'}
            <ChevronRight className="size-4" />
          </Button>
        )}
      </div>

      {/* Rejection dialog  -  opened from per-field Reject button */}
      {canVerify && matterId && rejectTarget && (
        <VerificationRejectDialog
          matterId={matterId}
          targets={[{
            type: 'field' as const,
            profile_path: rejectTarget.profilePath,
            verified_value: values[rejectTarget.profilePath],
          }]}
          itemLabel={rejectTarget.label}
          open={rejectDialogOpen}
          onOpenChange={setRejectDialogOpen}
          onRejected={() => setRejectTarget(null)}
        />
      )}
    </div>
  )
}

// ── Field Renderer ──────────────────────────────────────────────────────────

function renderField(
  field: IRCCFieldMapping,
  value: unknown,
  readOnly: boolean,
  _allValues: Record<string, unknown>,
  onChange: (value: unknown) => void,
  error?: string,
): React.ReactNode {
  const stringValue = value != null ? String(value) : ''
  const hasError = !!error

  switch (field.field_type) {
    case 'text':
    case 'phone':
      return (
        <Input
          id={field.profile_path}
          type={field.field_type === 'phone' ? 'tel' : 'text'}
          value={stringValue}
          placeholder={field.placeholder}
          disabled={readOnly}
          aria-invalid={hasError || undefined}
          maxLength={field.max_length ?? undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      )

    case 'email':
      return (
        <Input
          id={field.profile_path}
          type="email"
          value={stringValue}
          placeholder={field.placeholder ?? 'name@example.com'}
          disabled={readOnly}
          aria-invalid={hasError || undefined}
          maxLength={field.max_length ?? undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      )

    case 'number':
      return (
        <Input
          id={field.profile_path}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={stringValue}
          placeholder={field.placeholder}
          disabled={readOnly}
          aria-invalid={hasError || undefined}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '') {
              onChange(null)
            } else if (/^\d*\.?\d*$/.test(raw)) {
              onChange(Number(raw))
            }
          }}
        />
      )

    case 'date':
      return (
        <DatePicker
          id={field.profile_path}
          value={stringValue}
          onChange={(val) => onChange(val)}
          placeholder={field.placeholder || 'Select a date'}
          disabled={readOnly}
        />
      )

    case 'textarea':
      return (
        <Textarea
          id={field.profile_path}
          value={stringValue}
          placeholder={field.placeholder}
          disabled={readOnly}
          rows={3}
          aria-invalid={hasError || undefined}
          maxLength={field.max_length ?? undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      )

    case 'select':
      return (
        <Select
          value={stringValue || undefined}
          onValueChange={(val) => onChange(val)}
          disabled={readOnly}
        >
          <SelectTrigger id={field.profile_path} className="w-full" aria-invalid={hasError || undefined}>
            <SelectValue placeholder={field.placeholder || 'Select...'} />
          </SelectTrigger>
          <SelectContent position="popper" className="max-h-[300px]">
            {(field.options ?? [])
              .filter((opt) => opt.value && opt.value.length > 0)
              .map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      )

    case 'country':
      return (
        <Select
          value={stringValue || undefined}
          onValueChange={(val) => onChange(val)}
          disabled={readOnly}
        >
          <SelectTrigger id={field.profile_path} className="w-full" aria-invalid={hasError || undefined}>
            <SelectValue placeholder={field.placeholder || 'Select a country...'} />
          </SelectTrigger>
          <SelectContent position="popper" className="max-h-[300px]">
            {COUNTRIES.map((country) => (
              <SelectItem key={country.value} value={country.value}>
                {country.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )

    case 'boolean': {
      const boolStr = value === true ? 'yes' : value === false ? 'no' : ''
      return (
        <div className="space-y-2.5">
          <Label className="text-sm font-medium">
            {field.label}
            {field.is_required && (
              <span className="text-destructive ml-0.5">*</span>
            )}
          </Label>
          <RadioGroup
            id={field.profile_path}
            value={boolStr}
            onValueChange={(val) => onChange(val === 'yes')}
            disabled={readOnly}
            className="flex gap-6"
            aria-invalid={hasError || undefined}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="yes" id={`${field.profile_path}-yes`} />
              <Label
                htmlFor={`${field.profile_path}-yes`}
                className="cursor-pointer text-sm font-normal"
              >
                Yes
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="no" id={`${field.profile_path}-no`} />
              <Label
                htmlFor={`${field.profile_path}-no`}
                className="cursor-pointer text-sm font-normal"
              >
                No
              </Label>
            </div>
          </RadioGroup>
        </div>
      )
    }

    case 'repeater': {
      const arrayValue = Array.isArray(value) ? value : []
      const subFields = deriveRepeaterSubFields(field)

      return (
        <RepeaterField
          label={field.label}
          description={field.description}
          fields={subFields}
          value={arrayValue as Record<string, unknown>[]}
          onChange={(items) => onChange(items)}
          isRequired={field.is_required}
          readOnly={readOnly}
        />
      )
    }

    default:
      return (
        <Input
          id={field.profile_path}
          type="text"
          value={stringValue}
          placeholder={field.placeholder}
          disabled={readOnly}
          aria-invalid={hasError || undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      )
  }
}

// ── Repeater Sub-Field Derivation ───────────────────────────────────────────

/**
 * Derive sub-field definitions for a repeater field based on known IRCC
 * profile structures. Maps the profile_path to the appropriate sub-fields
 * for children, siblings, education history, employment history, etc.
 */
function deriveRepeaterSubFields(field: IRCCFieldMapping): IRCCFieldMapping[] {
  const path = field.profile_path

  // If the field has options defined, use them as sub-field labels
  // (a convention where options carry sub-field metadata)
  if (field.options && field.options.length > 0) {
    return field.options.map((opt, index) => ({
      profile_path: `${path}.${opt.value}`,
      ircc_field_name: '',
      label: opt.label,
      field_type: inferFieldType(opt.value),
      is_required: false,
      sort_order: index,
      form_source: field.form_source,
    }))
  }

  // Otherwise, derive from known IRCC profile structures
  if (path.includes('children') || path.includes('siblings')) {
    return familyMemberSubFields(path, field.form_source)
  }

  if (path.includes('education') && path.includes('history')) {
    return educationSubFields(path, field.form_source)
  }

  if (path.includes('employment') && path.includes('history')) {
    return employmentSubFields(path, field.form_source)
  }

  if (path.includes('previous_countries')) {
    return previousCountrySubFields(path, field.form_source)
  }

  if (path.includes('previous_marriages')) {
    return previousMarriageSubFields(path, field.form_source)
  }

  if (path.includes('other_names')) {
    return otherNameSubFields(path, field.form_source)
  }

  if (path.includes('contacts_in_canada')) {
    return contactInCanadaSubFields(path, field.form_source)
  }

  // Fallback: generic text fields
  return [
    {
      profile_path: `${path}.value`,
      ircc_field_name: '',
      label: 'Value',
      field_type: 'text',
      is_required: false,
      sort_order: 0,
      form_source: field.form_source,
    },
  ]
}

function familyMemberSubFields(
  basePath: string,
  formSource: string,
): IRCCFieldMapping[] {
  return [
    { profile_path: `${basePath}.family_name`, ircc_field_name: '', label: 'Family name', field_type: 'text', is_required: true, sort_order: 0, form_source: formSource },
    { profile_path: `${basePath}.given_name`, ircc_field_name: '', label: 'Given name', field_type: 'text', is_required: true, sort_order: 1, form_source: formSource },
    { profile_path: `${basePath}.date_of_birth`, ircc_field_name: '', label: 'Date of birth', field_type: 'date', is_required: false, sort_order: 2, form_source: formSource },
    { profile_path: `${basePath}.country_of_birth`, ircc_field_name: '', label: 'Country of birth', field_type: 'country', options: COUNTRIES, is_required: false, sort_order: 3, form_source: formSource },
    { profile_path: `${basePath}.address`, ircc_field_name: '', label: 'Address', field_type: 'text', is_required: false, sort_order: 4, form_source: formSource },
    { profile_path: `${basePath}.marital_status`, ircc_field_name: '', label: 'Marital status', field_type: 'select', options: [
      { label: 'Single', value: 'single' },
      { label: 'Married', value: 'married' },
      { label: 'Common-law', value: 'common_law' },
      { label: 'Divorced', value: 'divorced' },
      { label: 'Widowed', value: 'widowed' },
      { label: 'Separated', value: 'separated' },
    ], is_required: false, sort_order: 5, form_source: formSource },
    { profile_path: `${basePath}.occupation`, ircc_field_name: '', label: 'Occupation', field_type: 'text', is_required: false, sort_order: 6, form_source: formSource },
    { profile_path: `${basePath}.relationship`, ircc_field_name: '', label: 'Relationship', field_type: 'text', is_required: false, sort_order: 7, form_source: formSource },
  ]
}

function educationSubFields(
  basePath: string,
  formSource: string,
): IRCCFieldMapping[] {
  return [
    { profile_path: `${basePath}.from_date`, ircc_field_name: '', label: 'From date', field_type: 'date', is_required: false, sort_order: 0, form_source: formSource },
    { profile_path: `${basePath}.to_date`, ircc_field_name: '', label: 'To date', field_type: 'date', is_required: false, sort_order: 1, form_source: formSource },
    { profile_path: `${basePath}.institution`, ircc_field_name: '', label: 'Institution', field_type: 'text', is_required: true, sort_order: 2, form_source: formSource },
    { profile_path: `${basePath}.city`, ircc_field_name: '', label: 'City', field_type: 'text', is_required: false, sort_order: 3, form_source: formSource },
    { profile_path: `${basePath}.country`, ircc_field_name: '', label: 'Country', field_type: 'country', options: COUNTRIES, is_required: false, sort_order: 4, form_source: formSource },
    { profile_path: `${basePath}.field_of_study`, ircc_field_name: '', label: 'Field of study', field_type: 'text', is_required: false, sort_order: 5, form_source: formSource },
    { profile_path: `${basePath}.diploma_degree`, ircc_field_name: '', label: 'Diploma / degree', field_type: 'text', is_required: false, sort_order: 6, form_source: formSource },
  ]
}

function employmentSubFields(
  basePath: string,
  formSource: string,
): IRCCFieldMapping[] {
  return [
    { profile_path: `${basePath}.from_date`, ircc_field_name: '', label: 'From date', field_type: 'date', is_required: false, sort_order: 0, form_source: formSource },
    { profile_path: `${basePath}.to_date`, ircc_field_name: '', label: 'To date', field_type: 'date', is_required: false, sort_order: 1, form_source: formSource },
    { profile_path: `${basePath}.employer`, ircc_field_name: '', label: 'Employer', field_type: 'text', is_required: true, sort_order: 2, form_source: formSource },
    { profile_path: `${basePath}.title`, ircc_field_name: '', label: 'Title / position', field_type: 'text', is_required: false, sort_order: 3, form_source: formSource },
    { profile_path: `${basePath}.city`, ircc_field_name: '', label: 'City', field_type: 'text', is_required: false, sort_order: 4, form_source: formSource },
    { profile_path: `${basePath}.country`, ircc_field_name: '', label: 'Country', field_type: 'country', options: COUNTRIES, is_required: false, sort_order: 5, form_source: formSource },
    { profile_path: `${basePath}.activity_type`, ircc_field_name: '', label: 'Activity type', field_type: 'select', options: [
      { label: 'Employed', value: 'employed' },
      { label: 'Self-employed', value: 'self_employed' },
      { label: 'Unemployed', value: 'unemployed' },
      { label: 'Retired', value: 'retired' },
      { label: 'Student', value: 'student' },
    ], is_required: false, sort_order: 6, form_source: formSource },
  ]
}

function previousCountrySubFields(
  basePath: string,
  formSource: string,
): IRCCFieldMapping[] {
  return [
    { profile_path: `${basePath}.country`, ircc_field_name: '', label: 'Country', field_type: 'country', options: COUNTRIES, is_required: true, sort_order: 0, form_source: formSource },
    { profile_path: `${basePath}.from_date`, ircc_field_name: '', label: 'From date', field_type: 'date', is_required: false, sort_order: 1, form_source: formSource },
    { profile_path: `${basePath}.to_date`, ircc_field_name: '', label: 'To date', field_type: 'date', is_required: false, sort_order: 2, form_source: formSource },
    { profile_path: `${basePath}.immigration_status`, ircc_field_name: '', label: 'Immigration status', field_type: 'text', is_required: false, sort_order: 3, form_source: formSource },
  ]
}

function previousMarriageSubFields(
  basePath: string,
  formSource: string,
): IRCCFieldMapping[] {
  return [
    { profile_path: `${basePath}.spouse_family_name`, ircc_field_name: '', label: 'Spouse family name', field_type: 'text', is_required: true, sort_order: 0, form_source: formSource },
    { profile_path: `${basePath}.spouse_given_name`, ircc_field_name: '', label: 'Spouse given name', field_type: 'text', is_required: true, sort_order: 1, form_source: formSource },
    { profile_path: `${basePath}.type`, ircc_field_name: '', label: 'Type', field_type: 'select', options: [
      { label: 'Marriage', value: 'marriage' },
      { label: 'Common-law', value: 'common_law' },
    ], is_required: false, sort_order: 2, form_source: formSource },
    { profile_path: `${basePath}.from_date`, ircc_field_name: '', label: 'From date', field_type: 'date', is_required: false, sort_order: 3, form_source: formSource },
    { profile_path: `${basePath}.to_date`, ircc_field_name: '', label: 'To date', field_type: 'date', is_required: false, sort_order: 4, form_source: formSource },
  ]
}

function otherNameSubFields(
  basePath: string,
  formSource: string,
): IRCCFieldMapping[] {
  return [
    { profile_path: `${basePath}.family_name`, ircc_field_name: '', label: 'Family name', field_type: 'text', is_required: true, sort_order: 0, form_source: formSource },
    { profile_path: `${basePath}.given_name`, ircc_field_name: '', label: 'Given name', field_type: 'text', is_required: true, sort_order: 1, form_source: formSource },
    { profile_path: `${basePath}.name_type`, ircc_field_name: '', label: 'Name type', field_type: 'select', options: [
      { label: 'Maiden name', value: 'maiden' },
      { label: 'Alias', value: 'alias' },
      { label: 'Nickname', value: 'nickname' },
    ], is_required: false, sort_order: 2, form_source: formSource },
  ]
}

function contactInCanadaSubFields(
  basePath: string,
  formSource: string,
): IRCCFieldMapping[] {
  return [
    { profile_path: `${basePath}.name`, ircc_field_name: '', label: 'Name', field_type: 'text', is_required: true, sort_order: 0, form_source: formSource },
    { profile_path: `${basePath}.relationship`, ircc_field_name: '', label: 'Relationship', field_type: 'text', is_required: false, sort_order: 1, form_source: formSource },
    { profile_path: `${basePath}.address`, ircc_field_name: '', label: 'Address', field_type: 'text', is_required: false, sort_order: 2, form_source: formSource },
    { profile_path: `${basePath}.invitation_obtained`, ircc_field_name: '', label: 'Invitation obtained', field_type: 'boolean', is_required: false, sort_order: 3, form_source: formSource },
  ]
}

/**
 * Infer a basic field type from a sub-field key name.
 */
function inferFieldType(
  key: string,
): IRCCFieldMapping['field_type'] {
  if (key.includes('date') || key === 'from_date' || key === 'to_date') return 'date'
  if (key.includes('email')) return 'email'
  if (key.includes('phone') || key.includes('telephone')) return 'phone'
  if (key.includes('country')) return 'country'
  if (key === 'invitation_obtained') return 'boolean'
  return 'text'
}

// ── Subsection Grouping ─────────────────────────────────────────────────────

interface FieldGroup {
  key: string
  label: string | null
  fields: IRCCFieldMapping[]
}

/**
 * Group fields within a section by their XFA question-number segment (q1, q2, etc.)
 * to create visual subsections. Fields without a question number or with the same
 * question number are grouped together. If all fields share the same group, no
 * subsection labels are shown.
 */
function groupFieldsBySubsection(fields: IRCCFieldMapping[]): FieldGroup[] {
  const groups: FieldGroup[] = []
  let currentKey = ''
  let currentFields: IRCCFieldMapping[] = []

  for (const field of fields) {
    const groupKey = extractQuestionGroup(field.ircc_field_name || field.profile_path)

    if (groupKey !== currentKey && currentFields.length > 0) {
      groups.push({ key: currentKey || 'default', label: null, fields: currentFields })
      currentFields = []
    }
    currentKey = groupKey
    currentFields.push(field)
  }

  if (currentFields.length > 0) {
    groups.push({ key: currentKey || 'default', label: null, fields: currentFields })
  }

  // If there's only one group, don't show subsection separators
  if (groups.length <= 1) return groups

  return groups
}

/**
 * Extract the question group segment from an XFA path or profile path.
 * e.g. "Part1.SponsorDetails.q1.FamilyName" → "q1"
 * Falls back to empty string if no question segment found.
 */
function extractQuestionGroup(path: string): string {
  const parts = path.split('.')
  const qSegment = parts.find((p) => /^q\d+$/i.test(p))
  return qSegment || ''
}

// ── Utility Helpers ─────────────────────────────────────────────────────────

/**
 * Check whether a value is considered "filled" for progress tracking.
 */
function isValueFilled(value: unknown, fieldType: string): boolean {
  if (value === undefined || value === null) return false
  if (fieldType === 'boolean') return value === true || value === false
  if (fieldType === 'number') return typeof value === 'number' && !isNaN(value)
  if (fieldType === 'repeater') return Array.isArray(value) && value.length > 0
  if (typeof value === 'string') return value.trim().length > 0
  return false
}

/**
 * Check whether all required visible fields in a section are filled.
 * If no required fields exist, the section is only "complete" when at least
 * one visible field has a value (prevents empty sections showing as done).
 */
function isSectionComplete(
  section: { fields: IRCCFieldMapping[] },
  values: Record<string, unknown>,
): boolean {
  const visibleFields = section.fields.filter((f) => evaluateFieldCondition(f, values))
  const visibleRequired = visibleFields.filter((f) => f.is_required)

  if (visibleRequired.length > 0) {
    // Standard check: all required fields must be filled
    return visibleRequired.every((f) =>
      isValueFilled(values[f.profile_path], f.field_type),
    )
  }

  // No required fields  -  section is "complete" only if at least one field is filled
  if (visibleFields.length === 0) return true // empty section edge case
  return visibleFields.some((f) =>
    isValueFilled(values[f.profile_path], f.field_type),
  )
}
