'use client'

import { useState, useRef, useMemo, useCallback } from 'react'
import {
  Loader2,
  CheckCircle2,
  Paperclip,
  X,
  Upload,
  ChevronLeft,
  ChevronRight,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TenantDateInput } from '@/components/ui/tenant-date-input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { evaluateCondition } from '@/lib/utils/condition-evaluator'
import type { IntakeField, IntakeFormSettings, FormSection } from '@/lib/types/intake-field'
import type { Database } from '@/lib/types/database'

type IntakeForm = Database['public']['Tables']['intake_forms']['Row']

interface Props {
  form: IntakeForm
  utmParams: {
    utm_source: string | null
    utm_medium: string | null
    utm_campaign: string | null
  }
  /** When true, shows a preview banner and disables actual submission. */
  preview?: boolean
  /** When true, removes branding footer and uses compact layout for iframe embedding. */
  embed?: boolean
}

// ==========================================================================
// Main component
// ==========================================================================

export default function PublicFormRenderer({ form, utmParams, preview = false, embed = false }: Props) {
  const fields = useMemo(
    () =>
      ((Array.isArray(form.fields) ? form.fields : []) as unknown as IntakeField[]).sort(
        (a, b) => a.sort_order - b.sort_order,
      ),
    [form.fields],
  )

  const settings = useMemo(
    () =>
      (form.settings && typeof form.settings === 'object'
        ? form.settings
        : {}) as IntakeFormSettings,
    [form.settings],
  )

  const sections = useMemo(
    () =>
      (settings.sections ?? []).sort((a, b) => a.sort_order - b.sort_order),
    [settings.sections],
  )

  const isMultiStep = sections.length > 0

  // ---- state ----
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [files, setFiles] = useState<Record<string, File>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward')

  // ---- visible sections (respecting conditions) ----
  const visibleSections = useMemo(
    () => sections.filter((s) => evaluateCondition(s.condition, values)),
    [sections, values],
  )

  // ---- helpers ----
  function updateValue(fieldId: string, value: unknown) {
    setValues((prev) => ({ ...prev, [fieldId]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[fieldId]
      return next
    })
  }

  function updateFile(fieldId: string, file: File | null) {
    if (file) {
      setFiles((prev) => ({ ...prev, [fieldId]: file }))
      setValues((prev) => ({ ...prev, [fieldId]: file.name }))
    } else {
      setFiles((prev) => {
        const next = { ...prev }
        delete next[fieldId]
        return next
      })
      setValues((prev) => {
        const next = { ...prev }
        delete next[fieldId]
        return next
      })
    }
    setErrors((prev) => {
      const next = { ...prev }
      delete next[fieldId]
      return next
    })
  }

  /** Get visible fields for a given section (or all fields if no sections). */
  const getVisibleFields = useCallback(
    (sectionId?: string) => {
      const pool = sectionId
        ? fields.filter((f) => f.section_id === sectionId)
        : fields
      return pool.filter((f) => evaluateCondition(f.condition, values))
    },
    [fields, values],
  )

  /** Validate fields for a given section (or all if no sections). */
  function validateFields(targetFields: IntakeField[]): boolean {
    const newErrors: Record<string, string> = {}
    for (const field of targetFields) {
      // Skip hidden fields
      if (!evaluateCondition(field.condition, values)) continue

      const val = values[field.id]

      // File field
      if (field.field_type === 'file') {
        if (field.is_required && !files[field.id]) {
          newErrors[field.id] = `${field.label} is required`
        }
        continue
      }

      // Required check
      if (field.is_required) {
        if (field.field_type === 'select' || field.field_type === 'multi_select') {
          if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
            const obj = val as { selected: string; custom?: string }
            if (!obj.selected || (obj.selected === '__other__' && !obj.custom?.trim())) {
              newErrors[field.id] = `${field.label} is required`
            }
          } else if (Array.isArray(val)) {
            if (val.length === 0) newErrors[field.id] = `${field.label} is required`
          } else if (!val || (typeof val === 'string' && !val.trim())) {
            newErrors[field.id] = `${field.label} is required`
          }
        } else if (field.field_type === 'boolean') {
          if (val !== true) {
            newErrors[field.id] = `${field.label} is required`
          }
        } else if (!val || (typeof val === 'string' && !val.trim())) {
          newErrors[field.id] = `${field.label} is required`
        }
      }

      // Email validation
      if (field.field_type === 'email' && val && typeof val === 'string' && val.trim()) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim())) {
          newErrors[field.id] = 'Please enter a valid email address'
        }
      }

      // URL validation
      if (field.field_type === 'url' && val && typeof val === 'string' && val.trim()) {
        try {
          new URL(val.trim())
        } catch {
          newErrors[field.id] = 'Please enter a valid URL'
        }
      }
    }
    setErrors((prev) => ({ ...prev, ...newErrors }))
    return Object.keys(newErrors).length === 0
  }

  // ---- navigation ----
  function handleNext() {
    if (!isMultiStep) return
    const section = visibleSections[currentStep]
    if (!section) return
    const sectionFields = getVisibleFields(section.id)
    if (!validateFields(sectionFields)) return
    setDirection('forward')
    setCurrentStep((s) => Math.min(s, visibleSections.length - 1) + 1)
  }

  function handlePrev() {
    setDirection('backward')
    setCurrentStep((s) => Math.max(0, s - 1))
  }

  // ---- submit ----
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Validate current step (or all fields for single-page)
    if (isMultiStep) {
      const section = visibleSections[currentStep]
      if (section) {
        const sectionFields = getVisibleFields(section.id)
        if (!validateFields(sectionFields)) return
      }
    } else {
      if (!validateFields(getVisibleFields())) return
    }

    if (preview) {
      setErrors({ _form: 'Submission is disabled in preview mode.' })
      return
    }

    setSubmitting(true)
    try {
      const hasFiles = Object.keys(files).length > 0

      let res: Response
      if (hasFiles) {
        const formData = new FormData()
        formData.append('data', JSON.stringify(values))
        formData.append('utm_source', utmParams.utm_source ?? '')
        formData.append('utm_medium', utmParams.utm_medium ?? '')
        formData.append('utm_campaign', utmParams.utm_campaign ?? '')
        for (const [fieldId, file] of Object.entries(files)) {
          formData.append(`file_${fieldId}`, file)
        }
        res = await fetch(`/api/forms/${form.slug}/submit`, {
          method: 'POST',
          body: formData,
        })
      } else {
        res = await fetch(`/api/forms/${form.slug}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: values, ...utmParams }),
        })
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Submission failed')
      }

      // Notify parent window in embed mode
      if (embed && typeof window !== 'undefined' && window.parent !== window) {
        window.parent.postMessage({ type: 'norvaos-form-submitted', formSlug: form.slug }, '*')
      }

      if (settings.redirect_url) {
        window.location.href = settings.redirect_url
        return
      }

      setSubmitted(true)
    } catch (err) {
      setErrors({
        _form: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  // ---- keep currentStep in bounds when sections hide ----
  const clampedStep = Math.min(currentStep, Math.max(0, visibleSections.length - 1))
  if (clampedStep !== currentStep && isMultiStep) {
    setCurrentStep(clampedStep)
  }

  // ---- submitted state ----
  if (submitted) {
    return (
      <div className={cn('bg-slate-50 flex items-center justify-center p-4', embed ? 'min-h-[300px]' : 'min-h-screen')}>
        <div className="w-full max-w-lg text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-slate-900">Submitted!</h1>
          <p className="mt-2 text-slate-600">
            {settings.success_message || "Thank you for your submission. We'll be in touch soon."}
          </p>
        </div>
      </div>
    )
  }

  // ---- single-page form (backward compatible) ----
  if (!isMultiStep) {
    return (
      <div className={cn('bg-slate-50 flex items-start justify-center p-4', embed ? 'pt-4' : 'min-h-screen pt-12')}>
        <div className="w-full max-w-lg">
          {preview && (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-center text-sm font-medium text-amber-800">
              Preview Mode  -  This form is not published yet
            </div>
          )}
          <div className="rounded-xl border bg-white shadow-sm p-6 sm:p-8">
            <h1 className="text-2xl font-semibold text-slate-900">{form.name}</h1>
            {form.description && (
              <p className="mt-2 text-sm text-slate-600">{form.description}</p>
            )}
            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              {getVisibleFields().map((field) => (
                <FieldRenderer
                  key={field.id}
                  field={field}
                  value={values[field.id]}
                  file={files[field.id] ?? null}
                  error={errors[field.id]}
                  onChange={(val) => updateValue(field.id, val)}
                  onFileChange={(file) => updateFile(field.id, file)}
                />
              ))}
              {errors._form && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  {errors._form}
                </p>
              )}
              <Button type="submit" className="w-full" size="lg" disabled={submitting || preview}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {preview ? 'Submit (Disabled in Preview)' : 'Submit'}
              </Button>
            </form>
          </div>
          {!embed && <p className="mt-4 text-center text-xs text-slate-400">Powered by NorvaOS</p>}
        </div>
      </div>
    )
  }

  // ---- multi-step wizard ----
  const activeSection = visibleSections[clampedStep]
  const isLastStep = clampedStep === visibleSections.length - 1
  const stepFields = activeSection ? getVisibleFields(activeSection.id) : []

  return (
    <div className={cn('bg-slate-50 flex items-start justify-center p-4', embed ? 'pt-4' : 'min-h-screen pt-8 sm:pt-12')}>
      <div className="w-full max-w-lg">
        {preview && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-center text-sm font-medium text-amber-800">
            Preview Mode  -  This form is not published yet
          </div>
        )}
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">{form.name}</h1>
          {form.description && (
            <p className="mt-1 text-sm text-slate-500">{form.description}</p>
          )}
        </div>

        {/* Progress bar */}
        <StepProgress
          steps={visibleSections}
          currentStep={clampedStep}
        />

        {/* Form card */}
        <div className="mt-6 rounded-xl border bg-white shadow-sm overflow-hidden">
          <form onSubmit={handleSubmit}>
            <div
              key={activeSection?.id ?? 'empty'}
              className={cn(
                'p-6 sm:p-8 animate-in fade-in duration-300',
                direction === 'forward' ? 'slide-in-from-right-4' : 'slide-in-from-left-4',
              )}
            >
              {/* Section header */}
              {activeSection && (
                <div className="mb-6">
                  <h2 className="text-lg font-semibold text-slate-900">
                    {activeSection.title}
                  </h2>
                  {activeSection.description && (
                    <p className="mt-1 text-sm text-slate-500">
                      {activeSection.description}
                    </p>
                  )}
                </div>
              )}

              {/* Fields */}
              <div className="space-y-5">
                {stepFields.map((field) => (
                  <FieldRenderer
                    key={field.id}
                    field={field}
                    value={values[field.id]}
                    file={files[field.id] ?? null}
                    error={errors[field.id]}
                    onChange={(val) => updateValue(field.id, val)}
                    onFileChange={(file) => updateFile(field.id, file)}
                  />
                ))}
              </div>

              {errors._form && (
                <p className="mt-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  {errors._form}
                </p>
              )}
            </div>

            {/* Navigation */}
            <div className="border-t bg-slate-50/50 px-6 py-4 sm:px-8 flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={handlePrev}
                disabled={clampedStep === 0}
                className={clampedStep === 0 ? 'invisible' : ''}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Button>

              <span className="text-xs text-slate-400">
                Step {clampedStep + 1} of {visibleSections.length}
              </span>

              {isLastStep ? (
                <Button type="submit" disabled={submitting || preview}>
                  {submitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-1 h-4 w-4" />
                  )}
                  {preview ? 'Submit (Disabled)' : 'Submit'}
                </Button>
              ) : (
                <Button type="button" onClick={handleNext}>
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              )}
            </div>
          </form>
        </div>

        {!embed && <p className="mt-4 text-center text-xs text-slate-400">Powered by NorvaOS</p>}
      </div>
    </div>
  )
}

// ==========================================================================
// Step progress indicator
// ==========================================================================

function StepProgress({
  steps,
  currentStep,
}: {
  steps: FormSection[]
  currentStep: number
}) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {steps.map((step, i) => {
        const isCompleted = i < currentStep
        const isCurrent = i === currentStep
        return (
          <div key={step.id} className="flex items-center gap-1.5">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-all duration-300',
                isCompleted && 'bg-emerald-500 text-white',
                isCurrent && 'bg-slate-900 text-white ring-4 ring-slate-900/10',
                !isCompleted && !isCurrent && 'bg-slate-200 text-slate-500',
              )}
            >
              {isCompleted ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  'h-0.5 w-6 sm:w-10 rounded-full transition-colors duration-300',
                  i < currentStep ? 'bg-emerald-500' : 'bg-slate-200',
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ==========================================================================
// Field Renderer
// ==========================================================================

function FieldRenderer({
  field,
  value,
  file,
  error,
  onChange,
  onFileChange,
}: {
  field: IntakeField
  value: unknown
  file: File | null
  error?: string
  onChange: (value: unknown) => void
  onFileChange: (file: File | null) => void
}) {
  const strValue = typeof value === 'string' ? value : ''
  const boolValue = typeof value === 'boolean' ? value : false
  const fileInputRef = useRef<HTMLInputElement>(null)

  // "Other" support on select fields
  const isOtherSelect = field.field_type === 'select' && field.allow_other
  const selectObj =
    isOtherSelect && typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as { selected: string; custom?: string })
      : null
  const selectValue = selectObj ? selectObj.selected : typeof value === 'string' ? value : ''
  const otherText = selectObj?.custom ?? ''
  const showOtherInput = isOtherSelect && selectValue === '__other__'

  // "Other" support on multi_select fields
  const isOtherMulti = field.field_type === 'multi_select' && field.allow_other

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">
        {field.label}
        {field.is_required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {field.description && (
        <p className="mt-0.5 text-xs text-slate-500">{field.description}</p>
      )}

      <div className="mt-1.5">
        {field.field_type === 'text' && (
          <Input
            placeholder={field.placeholder}
            value={strValue}
            onChange={(e) => onChange(e.target.value)}
          />
        )}

        {field.field_type === 'email' && (
          <Input
            type="email"
            placeholder={field.placeholder ?? 'you@example.com'}
            value={strValue}
            onChange={(e) => onChange(e.target.value)}
          />
        )}

        {field.field_type === 'phone' && (
          <Input
            type="tel"
            placeholder={field.placeholder ?? '+1 (555) 000-0000'}
            value={strValue}
            onChange={(e) => onChange(e.target.value)}
          />
        )}

        {field.field_type === 'url' && (
          <Input
            type="url"
            placeholder={field.placeholder ?? 'https://'}
            value={strValue}
            onChange={(e) => onChange(e.target.value)}
          />
        )}

        {field.field_type === 'textarea' && (
          <Textarea
            rows={3}
            placeholder={field.placeholder}
            value={strValue}
            onChange={(e) => onChange(e.target.value)}
          />
        )}

        {field.field_type === 'number' && (
          <Input
            type="number"
            placeholder={field.placeholder}
            value={strValue}
            onChange={(e) => onChange(e.target.value)}
          />
        )}

        {field.field_type === 'date' && (
          <TenantDateInput
            value={strValue}
            onChange={(iso) => onChange(iso)}
          />
        )}

        {field.field_type === 'boolean' && (
          <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
            <Switch
              checked={boolValue}
              onCheckedChange={(checked) => onChange(checked)}
            />
            <span className="text-sm text-slate-700">Yes</span>
          </div>
        )}

        {field.field_type === 'select' && (
          <div className="space-y-2">
            <Select
              value={selectValue}
              onValueChange={(v) => {
                if (isOtherSelect) {
                  onChange({ selected: v, custom: v === '__other__' ? otherText : undefined })
                } else {
                  onChange(v)
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={field.placeholder ?? 'Select an option'} />
              </SelectTrigger>
              <SelectContent>
                {field.options?.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
                {isOtherSelect && <SelectItem value="__other__">Other</SelectItem>}
              </SelectContent>
            </Select>
            {showOtherInput && (
              <Input
                placeholder="Please specify..."
                value={otherText}
                onChange={(e) =>
                  onChange({ selected: '__other__', custom: e.target.value })
                }
              />
            )}
          </div>
        )}

        {field.field_type === 'multi_select' && (
          <div className="space-y-1.5">
            {field.options?.map((opt) => {
              const selected = Array.isArray(value) ? (value as string[]) : []
              const isChecked = selected.includes(opt.value)
              return (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {
                      const next = isChecked
                        ? selected.filter((v: string) => v !== opt.value)
                        : [...selected, opt.value]
                      onChange(next)
                    }}
                    className="rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-700">{opt.label}</span>
                </label>
              )
            })}
            {isOtherMulti &&
              (() => {
                const selected = Array.isArray(value) ? (value as string[]) : []
                const isOtherChecked = selected.includes('__other__')
                return (
                  <>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isOtherChecked}
                        onChange={() => {
                          const next = isOtherChecked
                            ? selected.filter((v: string) => v !== '__other__')
                            : [...selected, '__other__']
                          onChange(next)
                        }}
                        className="rounded border-slate-300"
                      />
                      <span className="text-sm text-slate-700">Other</span>
                    </label>
                    {isOtherChecked && (
                      <Input
                        placeholder="Please specify..."
                        className="ml-6"
                        onChange={(e) => {
                          const next = [
                            ...selected.filter((v: string) => v !== '__other__'),
                            '__other__',
                          ]
                          const idx = next.indexOf('__other__')
                          if (idx >= 0) {
                            next[idx] = `__other__:${e.target.value}`
                          }
                          onChange(next)
                        }}
                      />
                    )}
                  </>
                )
              })()}
          </div>
        )}

        {field.field_type === 'file' && (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept={field.accept || undefined}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                onFileChange(f)
              }}
            />
            {file ? (
              <div className="flex items-center gap-2 rounded-lg border px-3 py-2.5">
                <Paperclip className="h-4 w-4 text-slate-500 shrink-0" />
                <span className="text-sm text-slate-700 truncate flex-1">{file.name}</span>
                <span className="text-xs text-slate-400 shrink-0">
                  {(file.size / 1024).toFixed(0)} KB
                </span>
                <button
                  type="button"
                  className="text-slate-400 hover:text-red-500"
                  onClick={() => {
                    onFileChange(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500 hover:border-slate-400 hover:text-slate-700 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-5 w-5" />
                <span>Click to upload{field.accept ? ` (${field.accept})` : ''}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  )
}
