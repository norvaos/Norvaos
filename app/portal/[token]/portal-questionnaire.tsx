'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import type { IntakeField, FormSection } from '@/lib/types/intake-field'
import { evaluateCondition } from '@/lib/utils/condition-evaluator'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TenantDateInput } from '@/components/ui/tenant-date-input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import type { PortalLocale } from '@/lib/utils/portal-translations'

// ─── Types ──────────────────────────────────────────────────────────────────

interface PortalQuestionnaireProps {
  token: string
  fields: IntakeField[]
  sections?: FormSection[]
  language?: PortalLocale
  primaryColor?: string
  existingResponses?: Record<string, unknown> | null
  alreadySubmitted?: boolean
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PortalQuestionnaire({
  token,
  fields,
  sections = [],
  language = 'en',
  primaryColor = '#2563eb',
  existingResponses,
  alreadySubmitted = false,
}: PortalQuestionnaireProps) {
  const isFr = language === 'fr'

  const [values, setValues] = useState<Record<string, unknown>>(() => {
    if (existingResponses) return { ...existingResponses }
    // Pre-populate booleans with false
    const initial: Record<string, unknown> = {}
    for (const f of fields) {
      if (f.field_type === 'boolean') initial[f.id] = false
    }
    return initial
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [currentStep, setCurrentStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(alreadySubmitted)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Check for existing responses on mount
  useEffect(() => {
    if (existingResponses && Object.keys(existingResponses).length > 0) {
      setValues(existingResponses as Record<string, unknown>)
    }
  }, [existingResponses])

  // ── Section / step helpers ──────────────────────────────────
  const sortedSections = useMemo(
    () => [...sections].sort((a, b) => a.sort_order - b.sort_order),
    [sections]
  )

  const isMultiStep = sortedSections.length > 0

  // Fields visible based on conditions
  const isFieldVisible = useCallback(
    (field: IntakeField) => {
      if (!field.condition) return true
      return evaluateCondition(field.condition, values as Record<string, string | string[]>)
    },
    [values]
  )

  // Fields for the current step
  const currentFields = useMemo(() => {
    if (!isMultiStep) return fields.filter(isFieldVisible)
    const section = sortedSections[currentStep]
    if (!section) return []
    return fields
      .filter((f) => f.section_id === section.id)
      .filter(isFieldVisible)
      .sort((a, b) => a.sort_order - b.sort_order)
  }, [fields, isMultiStep, sortedSections, currentStep, isFieldVisible])

  const totalSteps = isMultiStep ? sortedSections.length : 1
  const isLastStep = currentStep >= totalSteps - 1

  // ── Field change handler ────────────────────────────────────
  const handleChange = (fieldId: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[fieldId]
      return next
    })
  }

  // ── Validation ──────────────────────────────────────────────
  const validateStep = (): boolean => {
    const newErrors: Record<string, string> = {}
    for (const field of currentFields) {
      if (!field.is_required) continue
      if (!isFieldVisible(field)) continue
      const val = values[field.id]
      if (val === undefined || val === null || val === '' || (typeof val === 'boolean' && false)) {
        // Booleans are always valid (false is a valid answer for required boolean)
        if (field.field_type === 'boolean') continue
        newErrors[field.id] = isFr ? 'Ce champ est requis' : 'This field is required'
      }
      // Email validation
      if (field.field_type === 'email' && val && typeof val === 'string') {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
          newErrors[field.id] = isFr ? 'Adresse courriel invalide' : 'Invalid email address'
        }
      }
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // ── Navigation ──────────────────────────────────────────────
  const handleNext = () => {
    if (!validateStep()) return
    if (isLastStep) {
      handleSubmit()
    } else {
      setCurrentStep((s) => s + 1)
    }
  }

  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep((s) => s - 1)
  }

  // ── Submit ──────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validateStep()) return
    setSubmitting(true)
    setSubmitError(null)

    try {
      const res = await fetch(`/api/portal/${token}/questionnaire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responses: values }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        setSubmitError(data.error || (isFr ? 'Erreur lors de la soumission' : 'Failed to submit'))
        return
      }

      setSubmitted(true)
    } catch {
      setSubmitError(isFr ? 'Erreur réseau' : 'Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Submitted state ─────────────────────────────────────────
  if (submitted) {
    return (
      <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-lg p-6 text-center">
        <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
        <p className="text-sm font-medium text-emerald-400">
          {isFr ? 'Questionnaire soumis avec succès !' : 'Questionnaire submitted successfully!'}
        </p>
        <p className="text-xs text-green-600 mt-1">
          {isFr
            ? 'Vos réponses ont été enregistrées. Votre avocat les examinera.'
            : 'Your responses have been saved. Your lawyer will review them.'}
        </p>
      </div>
    )
  }

  // ── Progress ────────────────────────────────────────────────
  const progressPercent = isMultiStep
    ? Math.round(((currentStep + 1) / totalSteps) * 100)
    : 100

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      {isMultiStep && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              {isFr ? 'Étape' : 'Step'} {currentStep + 1} {isFr ? 'sur' : 'of'} {totalSteps}
            </span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%`, backgroundColor: primaryColor }}
            />
          </div>
          {/* Section title */}
          {sortedSections[currentStep] && (
            <div>
              <h3 className="text-sm font-medium text-slate-800">
                {sortedSections[currentStep].title}
              </h3>
              {sortedSections[currentStep].description && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {sortedSections[currentStep].description}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Fields */}
      <div className="space-y-4">
        {currentFields.map((field) => (
          <FieldRenderer
            key={field.id}
            field={field}
            value={values[field.id]}
            error={errors[field.id]}
            onChange={(val) => handleChange(field.id, val)}
            language={language}
          />
        ))}
      </div>

      {/* Submit error */}
      {submitError && (
        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-950/30 border border-red-500/20 rounded-md p-3">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {submitError}
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex items-center justify-between pt-2">
        {isMultiStep && currentStep > 0 ? (
          <Button variant="outline" size="sm" onClick={handlePrev}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            {isFr ? 'Précédent' : 'Previous'}
          </Button>
        ) : (
          <div />
        )}

        <Button
          size="sm"
          onClick={handleNext}
          disabled={submitting}
          style={{ backgroundColor: isLastStep ? primaryColor : undefined }}
          className={!isLastStep ? '' : 'text-white hover:opacity-90'}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              {isFr ? 'Envoi...' : 'Submitting...'}
            </>
          ) : isLastStep ? (
            <>
              {isFr ? 'Soumettre le questionnaire' : 'Submit Questionnaire'}
            </>
          ) : (
            <>
              {isFr ? 'Suivant' : 'Next'}
              <ChevronRight className="h-4 w-4 ml-1" />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

// ─── Field Renderer ─────────────────────────────────────────────────────────

function FieldRenderer({
  field,
  value,
  error,
  onChange,
  language,
}: {
  field: IntakeField
  value: unknown
  error?: string
  onChange: (value: unknown) => void
  language: PortalLocale
}) {
  const stringValue = value != null ? String(value) : ''

  return (
    <div className="space-y-1.5">
      <Label htmlFor={field.id} className="text-sm font-medium text-slate-700">
        {field.label}
        {field.is_required && field.field_type !== 'boolean' && (
          <span className="text-red-500 ml-0.5">*</span>
        )}
      </Label>

      {field.description && (
        <p className="text-xs text-slate-500">{field.description}</p>
      )}

      {/* Render by field type */}
      {field.field_type === 'text' && (
        <Input
          id={field.id}
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={cn(error && 'border-red-500/30')}
        />
      )}

      {field.field_type === 'email' && (
        <Input
          id={field.id}
          type="email"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || 'your@email.com'}
          className={cn(error && 'border-red-500/30')}
        />
      )}

      {field.field_type === 'phone' && (
        <Input
          id={field.id}
          type="tel"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || '+1 555 000 0000'}
          className={cn(error && 'border-red-500/30')}
        />
      )}

      {field.field_type === 'number' && (
        <Input
          id={field.id}
          type="number"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || '0'}
          className={cn(error && 'border-red-500/30')}
        />
      )}

      {field.field_type === 'date' && (
        <TenantDateInput
          id={field.id}
          value={stringValue}
          onChange={(iso) => onChange(iso)}
          className={cn(error && 'border-red-500/30')}
        />
      )}

      {field.field_type === 'textarea' && (
        <Textarea
          id={field.id}
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className={cn('resize-none', error && 'border-red-500/30')}
        />
      )}

      {field.field_type === 'boolean' && (
        <div className="flex items-center gap-2 pt-0.5">
          <Checkbox
            id={field.id}
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked === true)}
          />
          <Label htmlFor={field.id} className="text-sm text-slate-600 cursor-pointer">
            {language === 'fr' ? 'Oui' : 'Yes'}
          </Label>
        </div>
      )}

      {field.field_type === 'select' && (
        <Select
          value={stringValue}
          onValueChange={(v) => onChange(v)}
        >
          <SelectTrigger id={field.id} className={cn(error && 'border-red-500/30')}>
            <SelectValue placeholder={language === 'fr' ? 'Sélectionner...' : 'Select...'} />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {field.field_type === 'url' && (
        <Input
          id={field.id}
          type="url"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || 'https://...'}
          className={cn(error && 'border-red-500/30')}
        />
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      )}
    </div>
  )
}
