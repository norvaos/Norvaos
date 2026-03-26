'use client'

import { useState, useCallback, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { UserPlus, ArrowRight, ArrowLeft, Loader2, CheckCircle2, QrCode } from 'lucide-react'
import { toast } from 'sonner'
import { useTenant } from '@/lib/hooks/use-tenant'
import {
  useFrontDeskPracticeAreas,
  useFrontDeskConfig,
  useTenantKioskQuestions,
  useTenantKioskUrl,
  type TenantKioskQuestion,
} from '@/lib/queries/front-desk-queries'
import {
  DEFAULT_SCREENING_QUESTIONS as SHARED_SCREENING_QUESTIONS,
  evaluateScreeningCondition,
} from '@/lib/utils/screening-questions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

// ─── Types ──────────────────────────────────────────────────────────────────

interface QuickCreateProps {
  onCreated?: () => void
}

interface Step1Data {
  firstName: string
  lastName: string
  dateOfBirth: string
  phone: string
  email: string
  preferredContactMethod: string
  language: string
  source: string
  appointmentRequested: boolean
}

interface Step2Data {
  entityType: 'lead' | 'contact'
  practiceAreaId: string
  urgency: string
  reason: string
  retaining: boolean // contacts only: will they be retaining for services?
}

type FieldCondition = NonNullable<TenantKioskQuestion['condition']>

// ─── Country List ─────────────────────────────────────────────────────────────

const ALL_COUNTRIES = [
  'Afghanistan','Albania','Algeria','Andorra','Angola','Antigua and Barbuda','Argentina','Armenia',
  'Australia','Austria','Azerbaijan','Bahamas','Bahrain','Bangladesh','Barbados','Belarus','Belgium',
  'Belize','Benin','Bhutan','Bolivia','Bosnia and Herzegovina','Botswana','Brazil','Brunei',
  'Bulgaria','Burkina Faso','Burundi','Cabo Verde','Cambodia','Cameroon','Canada',
  'Central African Republic','Chad','Chile','China','Colombia','Comoros','Congo (Brazzaville)',
  'Congo (Kinshasa)','Costa Rica','Croatia','Cuba','Cyprus','Czech Republic','Denmark','Djibouti',
  'Dominica','Dominican Republic','Ecuador','Egypt','El Salvador','Equatorial Guinea','Eritrea',
  'Estonia','Eswatini','Ethiopia','Fiji','Finland','France','Gabon','Gambia','Georgia','Germany',
  'Ghana','Greece','Grenada','Guatemala','Guinea','Guinea-Bissau','Guyana','Haiti','Honduras',
  'Hungary','Iceland','India','Indonesia','Iran','Iraq','Ireland','Israel','Italy','Jamaica',
  'Japan','Jordan','Kazakhstan','Kenya','Kiribati','Kosovo','Kuwait','Kyrgyzstan','Laos','Latvia',
  'Lebanon','Lesotho','Liberia','Libya','Liechtenstein','Lithuania','Luxembourg','Madagascar',
  'Malawi','Malaysia','Maldives','Mali','Malta','Marshall Islands','Mauritania','Mauritius',
  'Mexico','Micronesia','Moldova','Monaco','Mongolia','Montenegro','Morocco','Mozambique',
  'Myanmar','Namibia','Nauru','Nepal','Netherlands','New Zealand','Nicaragua','Niger','Nigeria',
  'North Korea','North Macedonia','Norway','Oman','Pakistan','Palau','Palestine','Panama',
  'Papua New Guinea','Paraguay','Peru','Philippines','Poland','Portugal','Qatar','Romania',
  'Russia','Rwanda','Saint Kitts and Nevis','Saint Lucia','Saint Vincent and the Grenadines',
  'Samoa','San Marino','Sao Tome and Principe','Saudi Arabia','Senegal','Serbia','Seychelles',
  'Sierra Leone','Singapore','Slovakia','Slovenia','Solomon Islands','Somalia','South Africa',
  'South Korea','South Sudan','Spain','Sri Lanka','Sudan','Suriname','Sweden','Switzerland',
  'Syria','Taiwan','Tajikistan','Tanzania','Thailand','Timor-Leste','Togo','Tonga',
  'Trinidad and Tobago','Tunisia','Turkey','Turkmenistan','Tuvalu','Uganda','Ukraine',
  'United Arab Emirates','United Kingdom','United States','Uruguay','Uzbekistan','Vanuatu',
  'Vatican City','Venezuela','Vietnam','Yemen','Zambia','Zimbabwe',
]

// ─── Default Screening Questions ─────────────────────────────────────────────
// Imported from shared utils  -  single source of truth for the full question set.
// Cast to TenantKioskQuestion[] so the ScreeningQuestions renderer accepts them.

const DEFAULT_SCREENING_QUESTIONS = SHARED_SCREENING_QUESTIONS as unknown as TenantKioskQuestion[]

// ─── Condition Evaluator ─────────────────────────────────────────────────────
// Delegates to the shared utility so logic is consistent with the display panel.

function evaluateCondition(
  condition: FieldCondition,
  answers: Record<string, string | string[]>,
): boolean {
  return evaluateScreeningCondition(
    condition as Parameters<typeof evaluateScreeningCondition>[0],
    answers,
  )
}

// ─── Country Picker ───────────────────────────────────────────────────────────

function CountryPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [search, setSearch] = useState('')
  const filtered = ALL_COUNTRIES.filter((c) =>
    c.toLowerCase().includes(search.toLowerCase())
  )
  return (
    <div className="space-y-1.5">
      <Input
        value={search || value}
        onChange={(e) => { setSearch(e.target.value); if (!e.target.value) onChange('') }}
        placeholder="Search country…"
        className="h-9 text-sm"
      />
      {search && (
        <div className="border rounded-md max-h-36 overflow-y-auto bg-white shadow-sm">
          {filtered.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No matches</p>
          )}
          {filtered.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { onChange(c); setSearch('') }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors"
            >
              {c}
            </button>
          ))}
        </div>
      )}
      {value && !search && (
        <p className="text-xs text-green-700 font-medium">✓ {value}</p>
      )}
    </div>
  )
}

// ─── Screening Questions Renderer ────────────────────────────────────────────
// One question at a time  -  compact stepper with progress bar.

function ScreeningQuestions({
  questions,
  answers,
  onAnswer,
  onReady,       // called when all visible required questions are answered
  submitError,
}: {
  questions: TenantKioskQuestion[]
  answers: Record<string, string | string[]>
  onAnswer: (id: string, value: string | string[]) => void
  onReady?: (ready: boolean) => void
  submitError?: string | null
}) {
  const [qIndex, setQIndex] = useState(0)

  const visibleQuestions = questions.filter((q) => {
    if (!q.condition) return true
    return evaluateCondition(q.condition, answers)
  })

  // Keep index in bounds if visible questions shrink (conditional removal)
  const safeIndex = Math.min(qIndex, Math.max(visibleQuestions.length - 1, 0))
  const q = visibleQuestions[safeIndex]
  const total = visibleQuestions.length
  const isFirst = safeIndex === 0
  const isLast = safeIndex === total - 1

  const hasAnswer = (id: string) => {
    const a = answers[id]
    if (Array.isArray(a)) return a.length > 0
    return !!a
  }

  const currentAnswered = q ? hasAnswer(q.id) : false
  const allRequiredDone = visibleQuestions
    .filter((vq) => vq.is_required)
    .every((vq) => hasAnswer(vq.id))

  // Notify parent whenever readiness changes
  useEffect(() => {
    onReady?.(allRequiredDone)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRequiredDone])

  if (visibleQuestions.length === 0) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm text-muted-foreground italic">No screening questions configured.</p>
      </div>
    )
  }

  const goNext = () => { if (!isLast) setQIndex(safeIndex + 1) }
  const goPrev = () => { if (!isFirst) setQIndex(safeIndex - 1) }

  return (
    <div className="space-y-3">
      {/* Progress bar + counter */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-300"
            style={{ width: `${((safeIndex + 1) / total) * 100}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {safeIndex + 1} / {total}
        </span>
      </div>

      {/* Question card */}
      {q && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 space-y-3">
          {/* Label */}
          <div>
            <p className="text-sm font-medium text-foreground leading-snug">
              {q.label}
              {q.is_required && <span className="text-red-500 ml-1">*</span>}
            </p>
            {q.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{q.description}</p>
            )}
          </div>

          {/* Boolean */}
          {q.field_type === 'boolean' && (
            <div className="grid grid-cols-2 gap-2">
              {(['yes', 'no'] as const).map((val) => {
                const sel = answers[q.id] === val
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => { onAnswer(q.id, val); if (!isLast) setTimeout(goNext, 180) }}
                    className={`rounded-lg border-2 py-2.5 text-sm font-semibold transition-all ${
                      sel
                        ? val === 'yes'
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : 'border-red-400 bg-red-50 text-red-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {val === 'yes' ? 'Yes' : 'No'}
                  </button>
                )
              })}
            </div>
          )}

          {/* Select */}
          {q.field_type === 'select' && q.options && (
            <div className="flex flex-col gap-1">
              {q.options.map((opt) => {
                const sel = answers[q.id] === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { onAnswer(q.id, opt.value); if (!isLast) setTimeout(goNext, 180) }}
                    className={`w-full text-left rounded-md border px-3 py-2 text-sm transition-all ${
                      sel
                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {sel && <span className="mr-2 text-blue-500">✓</span>}
                    {opt.label}
                  </button>
                )
              })}
            </div>
          )}

          {/* Multi-select */}
          {q.field_type === 'multi_select' && q.options && (
            <div className="flex flex-col gap-1">
              {q.options.map((opt) => {
                const current = (answers[q.id] as string[] | undefined) ?? []
                const sel = current.includes(opt.value)
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onAnswer(q.id, sel ? current.filter((v) => v !== opt.value) : [...current, opt.value])
                    }}
                    className={`w-full text-left rounded-md border px-3 py-2 text-sm transition-all ${
                      sel
                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {sel && <span className="mr-2 text-blue-500">✓</span>}
                    {opt.label}
                  </button>
                )
              })}
            </div>
          )}

          {/* Text */}
          {q.field_type === 'text' && (
            <Input
              value={(answers[q.id] as string) ?? ''}
              onChange={(e) => onAnswer(q.id, e.target.value)}
              className="h-9 text-sm"
              placeholder="Type your answer…"
            />
          )}

          {/* Textarea */}
          {q.field_type === 'textarea' && (
            <Textarea
              value={(answers[q.id] as string) ?? ''}
              onChange={(e) => onAnswer(q.id, e.target.value)}
              rows={2}
              className="text-sm resize-none"
              placeholder="Type your answer…"
            />
          )}

          {/* Date */}
          {q.field_type === 'date' && (
            <Input
              type="date"
              value={(answers[q.id] as string) ?? ''}
              onChange={(e) => onAnswer(q.id, e.target.value)}
              className="h-9 text-sm"
            />
          )}

          {/* Country */}
          {q.field_type === 'country' && (
            <CountryPicker
              value={(answers[q.id] as string) ?? ''}
              onChange={(v) => onAnswer(q.id, v)}
            />
          )}
        </div>
      )}

      {/* Prev / Next navigation */}
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={goPrev}
          disabled={isFirst}
          className="text-xs"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          Prev
        </Button>

        {/* Answered dots */}
        <div className="flex gap-1 flex-wrap justify-center">
          {visibleQuestions.map((vq, i) => (
            <button
              key={vq.id}
              type="button"
              onClick={() => setQIndex(i)}
              className={`w-2 h-2 rounded-full transition-all ${
                i === safeIndex
                  ? 'bg-blue-500 scale-125'
                  : hasAnswer(vq.id)
                    ? 'bg-green-400'
                    : 'bg-slate-200'
              }`}
              title={vq.label}
            />
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={goNext}
          disabled={isLast}
          className="text-xs"
        >
          Next
          <ArrowRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </div>

      {/* Required unanswered reminder */}
      {submitError && (
        <p className="text-xs text-red-600 font-medium text-center">{submitError}</p>
      )}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function QuickCreate({ onCreated }: QuickCreateProps) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''

  const { data: practiceAreas } = useFrontDeskPracticeAreas(tenantId)
  const { data: config } = useFrontDeskConfig(tenantId)
  const { data: kioskQuestions } = useTenantKioskQuestions(tenantId)
  const { data: kioskUrl } = useTenantKioskUrl(tenantId)

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [step1Errors, setStep1Errors] = useState<Record<string, string>>({})
  const [step2Errors, setStep2Errors] = useState<Record<string, string>>({})
  const [screeningErrors, setScreeningErrors] = useState<string | null>(null)
  const [screeningAnswers, setScreeningAnswers] = useState<Record<string, string | string[]>>({})

  // Step 1 fields
  const [step1, setStep1] = useState<Step1Data>({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    phone: '',
    email: '',
    preferredContactMethod: 'phone',
    language: 'English',
    source: '',
    appointmentRequested: false,
  })

  // Step 2 fields
  const [step2, setStep2] = useState<Step2Data>({
    entityType: 'lead',
    practiceAreaId: '',
    urgency: 'medium',
    reason: '',
    retaining: false,
  })

  // ─── Derived ────────────────────────────────────────────────────────────

  const languages = config?.languages ?? [
    'English',
    'French',
    'Arabic',
    'Punjabi',
    'Urdu',
    'Hindi',
    'Mandarin',
    'Cantonese',
    'Tagalog',
    'Portuguese',
    'Spanish',
    'Italian',
    'Polish',
    'Romanian',
    'Tamil',
    'Bengali',
    'Gujarati',
    'Korean',
    'Vietnamese',
    'Persian (Farsi)',
    'Turkish',
    'Somali',
    'Amharic',
    'Russian',
    'Ukrainian',
    'Greek',
    'Tigrinya',
    'Swahili',
    'Pashto',
    'Other',
  ]
  const sources = config?.sources ?? ['Walk-in', 'Phone', 'Website', 'Referral', 'Other']

  // Show screening if: lead (always) or contact who is retaining
  const showScreening = step2.entityType === 'lead' || step2.retaining

  // Total step count for badge
  const totalSteps =
    step2.entityType === 'lead'
      ? 4
      : step2.retaining
        ? 3
        : 2

  // ─── Mutation ───────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/actions/front_desk_create_intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: {
            firstName: step1.firstName.trim(),
            lastName: step1.lastName.trim(),
            dateOfBirth: step1.dateOfBirth.trim() || undefined,
            phone: step1.phone.trim(),
            email: step1.email.trim() || undefined,
            preferredContactMethod: step1.preferredContactMethod,
            language: step1.language,
            source: step1.source,
            appointmentRequested: step1.appointmentRequested,
            entityType: step2.entityType,
            practiceAreaId: step2.practiceAreaId,
            urgency: step2.urgency,
            reason: step2.reason.trim(),
            screeningAnswers: Object.keys(screeningAnswers).length > 0 ? screeningAnswers : undefined,
          },
          source: 'front_desk',
          idempotencyKey: `front_desk_create_intake:${Date.now()}`,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to create intake')
      }

      return res.json()
    },
  })

  // ─── Validation ─────────────────────────────────────────────────────────

  function validateStep1(): boolean {
    const errors: Record<string, string> = {}

    if (!step1.firstName.trim()) {
      errors.firstName = 'First name is required'
    }
    if (!step1.lastName.trim()) {
      errors.lastName = 'Last name is required'
    }
    if (!step1.phone.trim()) {
      errors.phone = 'Phone is required'
    } else if (step1.phone.trim().length < 7) {
      errors.phone = 'Phone must be at least 7 characters'
    }
    if (!step1.email.trim()) {
      errors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(step1.email.trim())) {
      errors.email = 'Enter a valid email address'
    }

    setStep1Errors(errors)
    return Object.keys(errors).length === 0
  }

  function validateStep2(): boolean {
    // practiceAreaId is optional  -  no required fields remain on this step
    setStep2Errors({})
    return true
  }

  function validateScreening(): boolean {
    const questions = (kioskQuestions && kioskQuestions.length > 0) ? kioskQuestions : DEFAULT_SCREENING_QUESTIONS
    const visibleQs = questions.filter((q) => {
      if (!q.condition) return true
      return evaluateCondition(q.condition, screeningAnswers)
    })
    const unanswered = visibleQs.filter((q) => {
      if (!q.is_required) return false
      const answer = screeningAnswers[q.id]
      if (Array.isArray(answer)) return answer.length === 0
      return !answer
    })

    if (unanswered.length > 0) {
      setScreeningErrors(`Please answer all required questions (${unanswered.length} remaining)`)
      return false
    }
    setScreeningErrors(null)
    return true
  }

  // ─── Handlers ───────────────────────────────────────────────────────────

  function handleNext() {
    if (validateStep1()) setStep(2)
  }

  function handleBackToStep1() {
    setStep(1)
    setStep2Errors({})
  }

  function handleBackToStep2() {
    setStep(2)
    setScreeningErrors(null)
  }

  async function handleStep2Continue() {
    if (!validateStep2()) return

    if (showScreening) {
      // Go to screening step
      setStep(3)
    } else {
      // No screening  -  submit now
      try {
        await createMutation.mutateAsync()
        toast.success('Intake created successfully')
        resetForm()
        onCreated?.()
      } catch (err) {
        toast.error((err as Error).message)
      }
    }
  }

  async function handleScreeningSubmit() {
    if (!validateScreening()) return

    try {
      await createMutation.mutateAsync()
      toast.success('Intake created successfully')
      if (step2.entityType === 'lead') {
        // Show QR code step for leads
        setStep(4)
      } else {
        resetForm()
        onCreated?.()
      }
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  function resetForm() {
    setStep(1)
    setStep1({
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      phone: '',
      email: '',
      preferredContactMethod: 'phone',
      language: 'English',
      source: '',
      appointmentRequested: false,
    })
    setStep2({
      entityType: 'lead',
      practiceAreaId: '',
      urgency: 'medium',
      reason: '',
      retaining: false,
    })
    setScreeningAnswers({})
    setStep1Errors({})
    setStep2Errors({})
    setScreeningErrors(null)
  }

  function handleDone() {
    resetForm()
    onCreated?.()
  }

  function updateStep1<K extends keyof Step1Data>(field: K, value: Step1Data[K]) {
    setStep1((prev) => ({ ...prev, [field]: value }))
    setStep1Errors((prev) => {
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  function updateStep2<K extends keyof Step2Data>(field: K, value: Step2Data[K]) {
    setStep2((prev) => ({ ...prev, [field]: value }))
    setStep2Errors((prev) => {
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  const handleAnswer = useCallback((id: string, value: string | string[]) => {
    setScreeningAnswers((prev) => ({ ...prev, [id]: value }))
    setScreeningErrors(null)
  }, [])

  // ─── Step badge label ────────────────────────────────────────────────────

  const stepBadgeLabel =
    step === 1
      ? 'Step 1'
      : `Step ${step} of ${totalSteps}`

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Quick Create
          </div>
          {step < 4 && (
            <Badge variant="secondary" className="text-xs">
              {stepBadgeLabel}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent>

        {/* ────────────────── Step 1: Personal Info ────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="qc-firstName">
                First Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="qc-firstName"
                value={step1.firstName}
                onChange={(e) => updateStep1('firstName', e.target.value)}
                placeholder="First name"
              />
              {step1Errors.firstName && (
                <p className="text-xs text-red-600">{step1Errors.firstName}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="qc-lastName">
                Last Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="qc-lastName"
                value={step1.lastName}
                onChange={(e) => updateStep1('lastName', e.target.value)}
                placeholder="Last name"
              />
              {step1Errors.lastName && (
                <p className="text-xs text-red-600">{step1Errors.lastName}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="qc-dob">Date of Birth</Label>
              <Input
                id="qc-dob"
                type="date"
                value={step1.dateOfBirth}
                onChange={(e) => updateStep1('dateOfBirth', e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="qc-phone">
                Phone <span className="text-red-500">*</span>
              </Label>
              <Input
                id="qc-phone"
                value={step1.phone}
                onChange={(e) => updateStep1('phone', e.target.value)}
                placeholder="Phone number"
              />
              {step1Errors.phone && (
                <p className="text-xs text-red-600">{step1Errors.phone}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="qc-email">
                Email <span className="text-red-500">*</span>
              </Label>
              <Input
                id="qc-email"
                type="email"
                value={step1.email}
                onChange={(e) => updateStep1('email', e.target.value)}
                placeholder="Email address"
              />
              {step1Errors.email && (
                <p className="text-xs text-red-600">{step1Errors.email}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Preferred Contact Method</Label>
              <Select
                value={step1.preferredContactMethod}
                onValueChange={(v) => updateStep1('preferredContactMethod', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Language</Label>
              <Select
                value={step1.language}
                onValueChange={(v) => updateStep1('language', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {languages.filter(Boolean).map((lang) => (
                    <SelectItem key={lang} value={lang}>
                      {lang}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Source / How They Heard About Us</Label>
              <Select
                value={step1.source}
                onValueChange={(v) => updateStep1('source', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {sources.filter(Boolean).map((src) => (
                    <SelectItem key={src} value={src}>
                      {src}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
              <Label htmlFor="qc-appointment" className="cursor-pointer">
                Appointment Requested?
              </Label>
              <Switch
                id="qc-appointment"
                checked={step1.appointmentRequested}
                onCheckedChange={(checked) => updateStep1('appointmentRequested', checked === true)}
              />
            </div>

            <Button onClick={handleNext} className="w-full">
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}

        {/* ────────────────── Step 2: Classification ────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Lead vs Contact */}
            <div className="space-y-1.5">
              <Label>Type</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => updateStep2('entityType', 'lead')}
                  className={`flex flex-col items-center gap-1 rounded-lg border-2 p-4 text-sm font-medium transition-colors ${
                    step2.entityType === 'lead'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <UserPlus className="w-5 h-5" />
                  Lead
                </button>
                <button
                  type="button"
                  onClick={() => updateStep2('entityType', 'contact')}
                  className={`flex flex-col items-center gap-1 rounded-lg border-2 p-4 text-sm font-medium transition-colors ${
                    step2.entityType === 'contact'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <UserPlus className="w-5 h-5" />
                  Contact
                </button>
              </div>
            </div>

            {/* Contact-only: retaining toggle */}
            {step2.entityType === 'contact' && (
              <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div>
                  <Label htmlFor="qc-retaining" className="cursor-pointer text-amber-800 font-medium">
                    Retaining for services?
                  </Label>
                  <p className="text-xs text-amber-600 mt-0.5">
                    Enable to collect screening information
                  </p>
                </div>
                <Switch
                  id="qc-retaining"
                  checked={step2.retaining}
                  onCheckedChange={(checked) => updateStep2('retaining', checked === true)}
                />
              </div>
            )}

            {/* Practice Area */}
            <div className="space-y-1.5">
              <Label>
                Practice Area <span className="text-red-500">*</span>
              </Label>
              <Select
                value={step2.practiceAreaId}
                onValueChange={(v) => updateStep2('practiceAreaId', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select practice area" />
                </SelectTrigger>
                <SelectContent>
                  {(practiceAreas ?? []).map((pa) => (
                    <SelectItem key={pa.id} value={pa.id}>
                      {pa.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {step2Errors.practiceAreaId && (
                <p className="text-xs text-red-600">{step2Errors.practiceAreaId}</p>
              )}
            </div>

            {/* Urgency */}
            <div className="space-y-1.5">
              <Label>Urgency</Label>
              <Select
                value={step2.urgency}
                onValueChange={(v) => updateStep2('urgency', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select urgency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Back + Continue */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleBackToStep1}
                disabled={createMutation.isPending}
                className="flex-1"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={handleStep2Continue}
                disabled={createMutation.isPending}
                className="flex-1"
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : showScreening ? (
                  <>
                    Next
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                ) : (
                  'Submit'
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ────────────────── Step 3: Screening Questions ──────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            <ScreeningQuestions
              questions={(kioskQuestions && kioskQuestions.length > 0) ? kioskQuestions : DEFAULT_SCREENING_QUESTIONS}
              answers={screeningAnswers}
              onAnswer={handleAnswer}
              onReady={(ready) => ready && setScreeningErrors(null)}
              submitError={screeningErrors}
            />

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleBackToStep2}
                disabled={createMutation.isPending}
                className="flex-1"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={handleScreeningSubmit}
                disabled={createMutation.isPending}
                className="flex-1"
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit'
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ────────────────── Step 4: QR Code (Leads only) ─────────────── */}
        {step === 4 && (
          <div className="space-y-5 text-center py-2">
            <div className="flex flex-col items-center gap-2">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
              <h3 className="text-base font-semibold text-foreground">
                Lead Created Successfully
              </h3>
              <p className="text-sm text-muted-foreground">
                {step1.firstName} {step1.lastName} has been added as a lead.
              </p>
            </div>

            {kioskUrl ? (
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-1.5 text-sm font-medium text-slate-700">
                  <QrCode className="w-4 h-4" />
                  Self Check-in QR Code
                </div>
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                      typeof window !== 'undefined'
                        ? `${window.location.origin}${kioskUrl}`
                        : kioskUrl
                    )}`}
                    alt="Self check-in QR code"
                    width={200}
                    height={200}
                    className="rounded-lg border border-slate-200 shadow-sm"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Show this QR code to the lead so they can complete their own self check-in.
                </p>
              </div>
            ) : (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  No kiosk configured. Set up a self check-in kiosk in Settings to enable QR codes.
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={handleDone} className="flex-1">
                Done
              </Button>
              <Button onClick={resetForm} className="flex-1">
                Create Another
              </Button>
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  )
}
