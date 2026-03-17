'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useFieldArray } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Loader2,
  Plus,
  Trash2,
  Building2,
  Layers,
  Hash,
  Shield,
  Mail,
  CalendarDays,
  HardDrive,
  Workflow,
  FileStack,
  Fingerprint,
  Globe,
  Bell,
  CreditCard,
  Database,
  ClipboardCheck,
  SkipForward,
  AlertTriangle,
  Info,
  ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { WizardAnswers, TenantOnboardingWizardRow } from '@/lib/types/database'

// ─── Step metadata ────────────────────────────────────────────────────────────

const STEPS = [
  { index: 0,  key: 'firmProfile',        label: 'Firm Profile',        icon: Building2,      skippable: false },
  { index: 1,  key: 'practiceModel',      label: 'Practice Model',      icon: Layers,         skippable: false },
  { index: 2,  key: 'matterNumbering',    label: 'Matter Numbering',    icon: Hash,           skippable: false },
  { index: 3,  key: 'rolesSetup',         label: 'Roles',               icon: Shield,         skippable: true  },
  { index: 4,  key: 'emailSetup',         label: 'Email',               icon: Mail,           skippable: true  },
  { index: 5,  key: 'calendarSetup',      label: 'Calendar',            icon: CalendarDays,   skippable: true  },
  { index: 6,  key: 'storageSetup',       label: 'Storage',             icon: HardDrive,      skippable: true  },
  { index: 7,  key: 'workflowSetup',      label: 'Workflows',           icon: Workflow,       skippable: true  },
  { index: 8,  key: 'documentTemplates',  label: 'Templates',           icon: FileStack,      skippable: true  },
  { index: 9,  key: 'customFields',       label: 'Custom Fields',       icon: Fingerprint,    skippable: true  },
  { index: 10, key: 'portalSetup',        label: 'Client Portal',       icon: Globe,          skippable: true  },
  { index: 11, key: 'notificationSetup',  label: 'Notifications',       icon: Bell,           skippable: true  },
  { index: 12, key: 'billingSetup',       label: 'Billing & Trust',     icon: CreditCard,     skippable: true  },
  { index: 13, key: 'dataImport',         label: 'Data Import',         icon: Database,       skippable: true  },
  { index: 14, key: 'review',             label: 'Review & Activate',   icon: ClipboardCheck, skippable: false },
]

const COLOUR_SWATCHES = [
  '#6366f1', '#3b82f6', '#10b981', '#f59e0b',
  '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4',
  '#84cc16', '#f97316', '#14b8a6', '#6b7280',
]

const WORKING_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

// ─── Zod schemas (one per step) ───────────────────────────────────────────────

const firmProfileSchema = z.object({
  firmName:        z.string().min(1, 'Firm name is required').max(200),
  address:         z.string().max(300).optional(),
  phone:           z.string().max(50).optional(),
  website:         z.string().max(200).optional(),
  primaryColour:   z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().or(z.literal('')),
  secondaryColour: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().or(z.literal('')),
  accentColour:    z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().or(z.literal('')),
})

const practiceModelSchema = z.object({
  practiceAreas: z.array(z.object({
    name:   z.string().min(1, 'Name required').max(100),
    colour: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex colour'),
  })).min(1, 'Add at least one practice area'),
})

const matterNumberingSchema = z.object({
  prefix:         z.string().min(1, 'Prefix required').max(20),
  format:         z.enum(['PREFIX-YEAR-SEQ', 'PREFIX-SEQ', 'YEAR-SEQ', 'SEQ']),
  startingNumber: z.number().int().min(1).max(999999),
  separator:      z.enum(['-', '/']),
})

const rolesSetupSchema = z.object({
  useStandardRoles: z.boolean(),
  standardRoles:    z.array(z.string()),
})

const emailSetupSchema = z.object({
  replyToAddress:        z.string().email().optional().or(z.literal('')),
  senderName:            z.string().max(100).optional(),
  emailSignatureEnabled: z.boolean(),
})

const calendarSetupSchema = z.object({
  workingDays:              z.array(z.string()).min(1, 'Select at least one working day'),
  workingHoursStart:        z.string(),
  workingHoursEnd:          z.string(),
  appointmentBufferMinutes: z.number().int().min(0).max(120),
})

const storageSetupSchema = z.object({
  retentionYears:          z.number().int().min(1).max(100),
  defaultFolderStructure:  z.enum(['matter-based', 'client-based', 'flat']),
})

const workflowSetupSchema = z.object({
  autoCreateTasksOnStageAdvance:  z.boolean(),
  autoCloseMatterOnTerminalStage: z.boolean(),
  deadlineReminderDays:           z.array(z.number()),
})

const documentTemplatesSchema = z.object({
  seedTemplates: z.boolean(),
  templateSet:   z.enum(['immigration', 'family-law', 'real-estate', 'general', 'none']),
})

const customFieldsSchema = z.object({
  enableCustomFields: z.boolean(),
})

const portalSetupSchema = z.object({
  enabled:        z.boolean(),
  portalName:     z.string().max(100).optional(),
  welcomeMessage: z.string().max(1000).optional(),
})

const notificationSetupSchema = z.object({
  emailNotificationsEnabled: z.boolean(),
  deadlineReminderDays:      z.array(z.number()),
  taskDueReminderEnabled:    z.boolean(),
})

const billingSetupSchema = z.object({
  billingEnabled:           z.boolean(),
  trustAccountingEnabled:   z.boolean(),
  currency:                 z.string().min(1),
  defaultPaymentTermDays:   z.number().int().min(1).max(365),
  invoicePrefix:            z.string().max(20).optional(),
})

const dataImportSchema = z.object({
  importIntent: z.enum(['none', 'import-later', 'request-help']),
})

type FirmProfileValues     = z.infer<typeof firmProfileSchema>
type PracticeModelValues   = z.infer<typeof practiceModelSchema>
type MatterNumberingValues = z.infer<typeof matterNumberingSchema>
type RolesSetupValues      = z.infer<typeof rolesSetupSchema>
type EmailSetupValues      = z.infer<typeof emailSetupSchema>
type CalendarSetupValues   = z.infer<typeof calendarSetupSchema>
type StorageSetupValues    = z.infer<typeof storageSetupSchema>
type WorkflowSetupValues   = z.infer<typeof workflowSetupSchema>
type DocTemplatesValues    = z.infer<typeof documentTemplatesSchema>
type CustomFieldsValues    = z.infer<typeof customFieldsSchema>
type PortalSetupValues     = z.infer<typeof portalSetupSchema>
type NotificationValues    = z.infer<typeof notificationSetupSchema>
type BillingSetupValues    = z.infer<typeof billingSetupSchema>
type DataImportValues      = z.infer<typeof dataImportSchema>

// ─── Main wizard page ─────────────────────────────────────────────────────────

export default function OnboardingWizardPage() {
  const router = useRouter()
  const [step, setStep]         = useState(0)
  const [answers, setAnswers]   = useState<WizardAnswers>({})
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [activating, setActivating] = useState(false)

  // Load saved state on mount
  useEffect(() => {
    fetch('/api/onboarding/wizard')
      .then((r) => r.json())
      .then((d) => {
        const w = d.wizard as TenantOnboardingWizardRow | null
        if (w) {
          setAnswers((w.answers as WizardAnswers) ?? {})
          setStep(w.current_step ?? 0)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Save a step's data to the DB
  const saveStep = useCallback(async (
    stepKey: keyof WizardAnswers,
    stepData: unknown,
    nextStep: number,
  ) => {
    setSaving(true)
    try {
      const res = await fetch('/api/onboarding/wizard', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_step: nextStep, step_key: stepKey, step_data: stepData, mode: 'custom' }),
      })
      if (!res.ok) throw new Error('Failed to save progress')
      setAnswers((prev) => ({ ...prev, [stepKey]: stepData }))
      setStep(nextStep)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      toast.error('Could not save progress. Please try again.')
    } finally {
      setSaving(false)
    }
  }, [])

  const skipStep = useCallback(async (stepKey: keyof WizardAnswers) => {
    const nextStep = step + 1
    setSaving(true)
    try {
      await fetch('/api/onboarding/wizard', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_step: nextStep, step_key: stepKey, step_data: null, mode: 'custom' }),
      })
      setStep(nextStep)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      toast.error('Could not skip step.')
    } finally {
      setSaving(false)
    }
  }, [step])

  const goBack = () => {
    if (step > 0) {
      setStep(step - 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handleActivate = async () => {
    setActivating(true)
    try {
      const res = await fetch('/api/onboarding/wizard/activate', { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Activation failed')
      if (body.success) {
        toast.success('Your workspace is configured and ready.')
        router.push('/')
      } else {
        const failedList = (body.failed as Array<{action: string; error: string}>)
          .map((f) => f.action).join(', ')
        toast.error(`Some steps could not be applied: ${failedList}. Retry activation.`)
      }
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setActivating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <button
            className="text-xs text-slate-400 hover:text-slate-600"
            onClick={() => router.push('/onboarding')}
          >
            ← Setup
          </button>
          <span className="text-xs text-slate-300">/</span>
          <span className="text-xs text-slate-500">Custom Setup</span>
        </div>
        <h1 className="text-xl font-bold text-slate-900">Custom Setup Wizard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Step {step + 1} of {STEPS.length} — {STEPS[step].label}
        </p>
      </div>

      {/* Step progress bar */}
      <WizardProgressBar currentStep={step} />

      {/* Step panels */}
      <div className="mt-6">
        {step === 0  && <StepFirmProfile      answers={answers} saving={saving} onSave={(d) => saveStep('firmProfile',       d, 1)} />}
        {step === 1  && <StepPracticeModel    answers={answers} saving={saving} onSave={(d) => saveStep('practiceModel',     d, 2)} onBack={goBack} />}
        {step === 2  && <StepMatterNumbering  answers={answers} saving={saving} onSave={(d) => saveStep('matterNumbering',   d, 3)} onBack={goBack} />}
        {step === 3  && <StepRoles            answers={answers} saving={saving} onSave={(d) => saveStep('rolesSetup',        d, 4)} onBack={goBack} onSkip={() => skipStep('rolesSetup')} />}
        {step === 4  && <StepEmail            answers={answers} saving={saving} onSave={(d) => saveStep('emailSetup',        d, 5)} onBack={goBack} onSkip={() => skipStep('emailSetup')} />}
        {step === 5  && <StepCalendar         answers={answers} saving={saving} onSave={(d) => saveStep('calendarSetup',     d, 6)} onBack={goBack} onSkip={() => skipStep('calendarSetup')} />}
        {step === 6  && <StepStorage          answers={answers} saving={saving} onSave={(d) => saveStep('storageSetup',      d, 7)} onBack={goBack} onSkip={() => skipStep('storageSetup')} />}
        {step === 7  && <StepWorkflows        answers={answers} saving={saving} onSave={(d) => saveStep('workflowSetup',     d, 8)} onBack={goBack} onSkip={() => skipStep('workflowSetup')} />}
        {step === 8  && <StepDocTemplates     answers={answers} saving={saving} onSave={(d) => saveStep('documentTemplates', d, 9)} onBack={goBack} onSkip={() => skipStep('documentTemplates')} />}
        {step === 9  && <StepCustomFields     answers={answers} saving={saving} onSave={(d) => saveStep('customFields',      d, 10)} onBack={goBack} onSkip={() => skipStep('customFields')} />}
        {step === 10 && <StepPortal           answers={answers} saving={saving} onSave={(d) => saveStep('portalSetup',       d, 11)} onBack={goBack} onSkip={() => skipStep('portalSetup')} />}
        {step === 11 && <StepNotifications    answers={answers} saving={saving} onSave={(d) => saveStep('notificationSetup', d, 12)} onBack={goBack} onSkip={() => skipStep('notificationSetup')} />}
        {step === 12 && <StepBilling          answers={answers} saving={saving} onSave={(d) => saveStep('billingSetup',      d, 13)} onBack={goBack} onSkip={() => skipStep('billingSetup')} />}
        {step === 13 && <StepDataImport       answers={answers} saving={saving} onSave={(d) => saveStep('dataImport',        d, 14)} onBack={goBack} onSkip={() => skipStep('dataImport')} />}
        {step === 14 && <StepReview           answers={answers} activating={activating} onActivate={handleActivate} onBack={goBack} onEditStep={setStep} />}
      </div>
    </div>
  )
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function WizardProgressBar({ currentStep }: { currentStep: number }) {
  const pct = Math.round(((currentStep) / (STEPS.length - 1)) * 100)
  return (
    <div>
      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-1.5 rounded-full bg-indigo-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {STEPS.map((s) => (
          <span
            key={s.index}
            className={cn(
              'text-[10px]',
              s.index < currentStep  ? 'text-emerald-600 font-medium' :
              s.index === currentStep ? 'text-indigo-600 font-semibold' :
              'text-slate-300'
            )}
          >
            {s.index < currentStep ? '✓' : s.index === currentStep ? '▶' : '○'} {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Step action footer ───────────────────────────────────────────────────────

function StepFooter({
  saving,
  onBack,
  onSkip,
  submitLabel = 'Save & Continue',
}: {
  saving: boolean
  onBack?: () => void
  onSkip?: () => void
  submitLabel?: string
}) {
  return (
    <div className="flex items-center justify-between pt-4">
      <Button type="button" variant="ghost" size="sm" onClick={onBack} disabled={!onBack}>
        <ChevronLeft className="mr-1 h-4 w-4" />
        Back
      </Button>
      <div className="flex gap-2">
        {onSkip && (
          <Button type="button" variant="outline" size="sm" onClick={onSkip} disabled={saving}>
            <SkipForward className="mr-1.5 h-3.5 w-3.5" />
            Skip
          </Button>
        )}
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ChevronRight className="mr-2 h-4 w-4" />}
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}

// ─── Step container ───────────────────────────────────────────────────────────

function StepCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
      <div>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {children}
    </div>
  )
}

// ─── Step 0: Firm Profile ─────────────────────────────────────────────────────

function StepFirmProfile({ answers, saving, onSave }: {
  answers: WizardAnswers; saving: boolean; onSave: (d: FirmProfileValues) => void
}) {
  const form = useForm<FirmProfileValues>({
    resolver: zodResolver(firmProfileSchema),
    defaultValues: {
      firmName:        answers.firmProfile?.firmName        ?? '',
      address:         answers.firmProfile?.address         ?? '',
      phone:           answers.firmProfile?.phone           ?? '',
      website:         answers.firmProfile?.website         ?? '',
      primaryColour:   answers.firmProfile?.primaryColour   ?? '#6366f1',
      secondaryColour: answers.firmProfile?.secondaryColour ?? '#3b82f6',
      accentColour:    answers.firmProfile?.accentColour    ?? '#10b981',
    },
  })

  return (
    <StepCard title="Step 1 of 15 — Firm Profile & Branding" description="Your firm name, contact details, and brand colours.">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
          <FormField control={form.control} name="firmName" render={({ field }) => (
            <FormItem>
              <FormLabel>Firm Name <span className="text-destructive">*</span></FormLabel>
              <FormControl><Input placeholder="e.g. Waseer Law Office" autoFocus {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="address" render={({ field }) => (
            <FormItem>
              <FormLabel>Office Address</FormLabel>
              <FormControl><Input placeholder="123 Legal Street, Toronto, ON M5H 1A1" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="phone" render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl><Input placeholder="+1 (416) 555-0100" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="website" render={({ field }) => (
              <FormItem>
                <FormLabel>Website</FormLabel>
                <FormControl><Input placeholder="https://example.com" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>

          <Separator />
          <p className="text-xs font-medium text-slate-600">Brand Colours</p>
          <div className="grid grid-cols-3 gap-3">
            {(['primaryColour', 'secondaryColour', 'accentColour'] as const).map((colKey, i) => (
              <FormField key={colKey} control={form.control} name={colKey} render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs capitalize">{['Primary', 'Secondary', 'Accent'][i]}</FormLabel>
                  <FormControl>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={field.value || '#6366f1'}
                        onChange={(e) => field.onChange(e.target.value)}
                        className="h-8 w-10 cursor-pointer rounded border p-0.5"
                      />
                      <Input value={field.value} onChange={field.onChange} className="font-mono text-xs" maxLength={7} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            ))}
          </div>

          <StepFooter saving={saving} />
        </form>
      </Form>
    </StepCard>
  )
}

// ─── Step 1: Practice Model ───────────────────────────────────────────────────

function StepPracticeModel({ answers, saving, onSave, onBack }: {
  answers: WizardAnswers; saving: boolean; onSave: (d: PracticeModelValues) => void; onBack: () => void
}) {
  const form = useForm<PracticeModelValues>({
    resolver: zodResolver(practiceModelSchema),
    defaultValues: {
      practiceAreas: answers.practiceModel?.practiceAreas?.length
        ? answers.practiceModel.practiceAreas
        : [{ name: '', colour: '#6366f1' }],
    },
  })
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'practiceAreas' })

  return (
    <StepCard title="Step 2 of 15 — Practice Model" description="Add the practice areas your firm operates in. You can add more later.">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
          <div className="space-y-3">
            {fields.map((field, idx) => (
              <div key={field.id} className="flex items-start gap-2">
                <div className="flex-1 grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <FormField control={form.control} name={`practiceAreas.${idx}.name`} render={({ field: f }) => (
                      <FormItem>
                        {idx === 0 && <FormLabel className="text-xs">Name</FormLabel>}
                        <FormControl><Input placeholder="e.g. Immigration" {...f} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <div>
                    <FormField control={form.control} name={`practiceAreas.${idx}.colour`} render={({ field: f }) => (
                      <FormItem>
                        {idx === 0 && <FormLabel className="text-xs">Colour</FormLabel>}
                        <FormControl>
                          <div className="flex gap-1 flex-wrap">
                            {COLOUR_SWATCHES.slice(0, 6).map((c) => (
                              <button key={c} type="button"
                                className={cn('h-6 w-6 rounded-full border-2 transition-transform hover:scale-110',
                                  f.value === c ? 'border-slate-900' : 'border-transparent')}
                                style={{ backgroundColor: c }}
                                onClick={() => f.onChange(c)}
                              />
                            ))}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </div>
                {fields.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" className="mt-6 h-8 w-8 text-slate-400 hover:text-destructive"
                    onClick={() => remove(idx)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => append({ name: '', colour: '#6366f1' })}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Practice Area
          </Button>
          <StepFooter saving={saving} onBack={onBack} />
        </form>
      </Form>
    </StepCard>
  )
}

// ─── Step 2: Matter Numbering ─────────────────────────────────────────────────

function StepMatterNumbering({ answers, saving, onSave, onBack }: {
  answers: WizardAnswers; saving: boolean; onSave: (d: MatterNumberingValues) => void; onBack: () => void
}) {
  const form = useForm<MatterNumberingValues>({
    resolver: zodResolver(matterNumberingSchema),
    defaultValues: {
      prefix:         answers.matterNumbering?.prefix         ?? 'M',
      format:         answers.matterNumbering?.format         ?? 'PREFIX-YEAR-SEQ',
      startingNumber: answers.matterNumbering?.startingNumber ?? 1,
      separator:      answers.matterNumbering?.separator      ?? '-',
    },
  })
  const prefix    = form.watch('prefix')
  const format    = form.watch('format')
  const separator = form.watch('separator')
  const startNum  = form.watch('startingNumber')

  const preview = (() => {
    const p  = prefix    || 'M'
    const y  = '2026'
    const s  = String(startNum || 1).padStart(3, '0')
    const sep = separator || '-'
    switch (format) {
      case 'PREFIX-YEAR-SEQ': return `${p}${sep}${y}${sep}${s}`
      case 'PREFIX-SEQ':      return `${p}${sep}${s}`
      case 'YEAR-SEQ':        return `${y}${sep}${s}`
      case 'SEQ':             return s
      default:                return `${p}${sep}${y}${sep}${s}`
    }
  })()

  return (
    <StepCard title="Step 3 of 15 — Matter Numbering" description="Choose how matter reference numbers are generated.">
      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
        <p className="text-xs text-amber-800">
          <strong>Choose carefully.</strong> Matter numbers are stamped on all files, invoices, and communications. Changing the format after matters are created requires manual renumbering.
        </p>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="prefix" render={({ field }) => (
              <FormItem>
                <FormLabel>Prefix <span className="text-destructive">*</span></FormLabel>
                <FormControl><Input placeholder="M" {...field} /></FormControl>
                <FormDescription>Short code identifying your firm or file type.</FormDescription>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="startingNumber" render={({ field }) => (
              <FormItem>
                <FormLabel>Starting Number</FormLabel>
                <FormControl>
                  <Input type="number" min={1} value={field.value}
                    onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 1)} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="format" render={({ field }) => (
              <FormItem>
                <FormLabel>Format</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="PREFIX-YEAR-SEQ">PREFIX-YEAR-SEQ</SelectItem>
                    <SelectItem value="PREFIX-SEQ">PREFIX-SEQ</SelectItem>
                    <SelectItem value="YEAR-SEQ">YEAR-SEQ</SelectItem>
                    <SelectItem value="SEQ">Sequential only</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="separator" render={({ field }) => (
              <FormItem>
                <FormLabel>Separator</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="-">Hyphen  ( - )</SelectItem>
                    <SelectItem value="/">Slash   ( / )</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
          </div>
          <div className="rounded-md bg-slate-50 border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500 mb-1">Preview</p>
            <p className="text-lg font-mono font-semibold text-slate-900">{preview}</p>
          </div>
          <StepFooter saving={saving} onBack={onBack} />
        </form>
      </Form>
    </StepCard>
  )
}

// ─── Step 3: Roles ────────────────────────────────────────────────────────────

const AVAILABLE_ROLES = ['Admin', 'Lawyer', 'Paralegal', 'Receptionist', 'Billing'] as const

function StepRoles({ answers, saving, onSave, onBack, onSkip }: {
  answers: WizardAnswers; saving: boolean;
  onSave: (d: RolesSetupValues) => void; onBack: () => void; onSkip: () => void
}) {
  const form = useForm<RolesSetupValues>({
    resolver: zodResolver(rolesSetupSchema),
    defaultValues: {
      useStandardRoles: answers.rolesSetup?.useStandardRoles ?? true,
      standardRoles:    answers.rolesSetup?.standardRoles    ?? ['Lawyer', 'Paralegal', 'Receptionist', 'Billing'],
    },
  })
  const useStandard = form.watch('useStandardRoles')
  const selectedRoles = form.watch('standardRoles')

  const toggleRole = (role: string) => {
    const cur = form.getValues('standardRoles')
    if (cur.includes(role)) form.setValue('standardRoles', cur.filter((r) => r !== role))
    else form.setValue('standardRoles', [...cur, role])
  }

  const ROLE_SUMMARIES: Record<string, string> = {
    Admin:        'Full access to all modules and settings',
    Lawyer:       'Contacts, matters, leads, tasks, documents, communications, reports, conflicts',
    Paralegal:    'Contacts, matters (view/edit), tasks, documents, communications, conflicts',
    Receptionist: 'Contacts (create), matters (view), leads (view), tasks, front desk, check-ins',
    Billing:      'Billing module, trust accounting, reports, analytics',
  }

  return (
    <StepCard title="Step 4 of 15 — Roles & Permissions" description="Seed standard system roles with preset permission sets. You can customise permissions later in Settings.">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
          <FormField control={form.control} name="useStandardRoles" render={({ field }) => (
            <FormItem className="flex items-start gap-3">
              <FormControl>
                <Checkbox id="useStandardRoles" checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
              </FormControl>
              <div>
                <Label htmlFor="useStandardRoles" className="font-medium">Seed standard roles automatically</Label>
                <p className="text-xs text-slate-500 mt-0.5">Creates system roles with pre-configured permission sets. You can customise them later from Settings → Roles.</p>
              </div>
            </FormItem>
          )} />

          {useStandard && (
            <div className="pl-6 space-y-2">
              <p className="text-xs font-medium text-slate-600">Select which roles to create:</p>
              {AVAILABLE_ROLES.map((role) => (
                <div key={role} className="flex items-start gap-2">
                  <Checkbox
                    id={`role-${role}`}
                    disabled={role === 'Admin'}
                    checked={role === 'Admin' || selectedRoles.includes(role)}
                    onCheckedChange={() => role !== 'Admin' && toggleRole(role)}
                    className="mt-0.5"
                  />
                  <div>
                    <Label htmlFor={`role-${role}`} className="text-sm font-medium">
                      {role}
                      {role === 'Admin' && <span className="ml-1.5 text-xs text-slate-400">(always created)</span>}
                    </Label>
                    <p className="text-xs text-slate-400">{ROLE_SUMMARIES[role]}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <StepFooter saving={saving} onBack={onBack} onSkip={onSkip} />
        </form>
      </Form>
    </StepCard>
  )
}

// ─── Step 4: Email Setup ──────────────────────────────────────────────────────

function StepEmail({ answers, saving, onSave, onBack, onSkip }: {
  answers: WizardAnswers; saving: boolean;
  onSave: (d: EmailSetupValues) => void; onBack: () => void; onSkip: () => void
}) {
  const form = useForm<EmailSetupValues>({
    resolver: zodResolver(emailSetupSchema),
    defaultValues: {
      replyToAddress:        answers.emailSetup?.replyToAddress        ?? '',
      senderName:            answers.emailSetup?.senderName            ?? '',
      emailSignatureEnabled: answers.emailSetup?.emailSignatureEnabled ?? false,
    },
  })
  return (
    <StepCard title="Step 5 of 15 — Email Setup" description="Configure how automated emails appear to clients.">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
          <FormField control={form.control} name="replyToAddress" render={({ field }) => (
            <FormItem>
              <FormLabel>Reply-To Address</FormLabel>
              <FormControl><Input type="email" placeholder="office@example.com" {...field} /></FormControl>
              <FormDescription>Clients reply to this address. Leave blank to use the platform default.</FormDescription>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="senderName" render={({ field }) => (
            <FormItem>
              <FormLabel>Sender Name</FormLabel>
              <FormControl><Input placeholder="Waseer Law Office" {...field} /></FormControl>
              <FormDescription>Displayed in the &ldquo;From&rdquo; field of client emails.</FormDescription>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="emailSignatureEnabled" render={({ field }) => (
            <FormItem className="flex items-start gap-3">
              <FormControl>
                <Checkbox id="emailSig" checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
              </FormControl>
              <Label htmlFor="emailSig" className="text-sm font-normal">Enable per-user email signatures</Label>
            </FormItem>
          )} />
          <StepFooter saving={saving} onBack={onBack} onSkip={onSkip} />
        </form>
      </Form>
    </StepCard>
  )
}

// ─── Step 5: Calendar Setup ───────────────────────────────────────────────────

function StepCalendar({ answers, saving, onSave, onBack, onSkip }: {
  answers: WizardAnswers; saving: boolean;
  onSave: (d: CalendarSetupValues) => void; onBack: () => void; onSkip: () => void
}) {
  const form = useForm<CalendarSetupValues>({
    resolver: zodResolver(calendarSetupSchema),
    defaultValues: {
      workingDays:              answers.calendarSetup?.workingDays              ?? ['monday','tuesday','wednesday','thursday','friday'],
      workingHoursStart:        answers.calendarSetup?.workingHoursStart        ?? '09:00',
      workingHoursEnd:          answers.calendarSetup?.workingHoursEnd          ?? '17:00',
      appointmentBufferMinutes: answers.calendarSetup?.appointmentBufferMinutes ?? 15,
    },
  })
  const selectedDays = form.watch('workingDays')

  const toggleDay = (day: string) => {
    const cur = form.getValues('workingDays')
    if (cur.includes(day)) form.setValue('workingDays', cur.filter((d) => d !== day), { shouldValidate: true })
    else form.setValue('workingDays', [...cur, day], { shouldValidate: true })
  }

  return (
    <StepCard title="Step 6 of 15 — Calendar Setup" description="Set your firm's default working hours and appointment preferences.">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
          <div>
            <FormLabel className="text-sm">Working Days</FormLabel>
            <div className="mt-2 flex flex-wrap gap-2">
              {WORKING_DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={cn(
                    'rounded-md border px-3 py-1 text-xs font-medium capitalize transition-colors',
                    selectedDays.includes(day)
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  )}
                >
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
            {form.formState.errors.workingDays && (
              <p className="mt-1 text-xs text-destructive">{form.formState.errors.workingDays.message}</p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField control={form.control} name="workingHoursStart" render={({ field }) => (
              <FormItem>
                <FormLabel>Start Time</FormLabel>
                <FormControl><Input type="time" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="workingHoursEnd" render={({ field }) => (
              <FormItem>
                <FormLabel>End Time</FormLabel>
                <FormControl><Input type="time" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="appointmentBufferMinutes" render={({ field }) => (
              <FormItem>
                <FormLabel>Buffer (min)</FormLabel>
                <FormControl>
                  <Input type="number" min={0} max={120} value={field.value}
                    onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
          <StepFooter saving={saving} onBack={onBack} onSkip={onSkip} />
        </form>
      </Form>
    </StepCard>
  )
}

// ─── Step 6: Storage ──────────────────────────────────────────────────────────

function StepStorage({ answers, saving, onSave, onBack, onSkip }: {
  answers: WizardAnswers; saving: boolean;
  onSave: (d: StorageSetupValues) => void; onBack: () => void; onSkip: () => void
}) {
  const form = useForm<StorageSetupValues>({
    resolver: zodResolver(storageSetupSchema),
    defaultValues: {
      retentionYears:         answers.storageSetup?.retentionYears         ?? 7,
      defaultFolderStructure: answers.storageSetup?.defaultFolderStructure ?? 'matter-based',
    },
  })
  return (
    <StepCard title="Step 7 of 15 — Drive & Storage" description="Configure document retention and default folder structure.">
      <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
        <Info className="h-4 w-4 shrink-0 text-slate-500 mt-0.5" />
        <p className="text-xs text-slate-600">
          Retention period drives reminders to archive closed matter files — documents are <strong>never automatically deleted</strong>. Law societies in Canada typically require 7–10 years. Check your jurisdiction&rsquo;s rules.
        </p>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
          <FormField control={form.control} name="retentionYears" render={({ field }) => (
            <FormItem>
              <FormLabel>Document Retention Period (years)</FormLabel>
              <FormControl>
                <Input type="number" min={1} max={100} value={field.value}
                  onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 7)} />
              </FormControl>
              <FormDescription>How long documents are retained before archival. 7 years is the standard for Canadian law firms.</FormDescription>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="defaultFolderStructure" render={({ field }) => (
            <FormItem>
              <FormLabel>Default Folder Structure</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="matter-based">Matter-based (documents grouped by matter)</SelectItem>
                  <SelectItem value="client-based">Client-based (documents grouped by client)</SelectItem>
                  <SelectItem value="flat">Flat (all documents in one folder)</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <StepFooter saving={saving} onBack={onBack} onSkip={onSkip} />
        </form>
      </Form>
    </StepCard>
  )
}

// ─── Step 7: Workflows ────────────────────────────────────────────────────────

function StepWorkflows({ answers, saving, onSave, onBack, onSkip }: {
  answers: WizardAnswers; saving: boolean;
  onSave: (d: WorkflowSetupValues) => void; onBack: () => void; onSkip: () => void
}) {
  const form = useForm<WorkflowSetupValues>({
    resolver: zodResolver(workflowSetupSchema),
    defaultValues: {
      autoCreateTasksOnStageAdvance:  answers.workflowSetup?.autoCreateTasksOnStageAdvance  ?? true,
      autoCloseMatterOnTerminalStage: answers.workflowSetup?.autoCloseMatterOnTerminalStage ?? true,
      deadlineReminderDays:           answers.workflowSetup?.deadlineReminderDays           ?? [7, 3, 1],
    },
  })

  const REMINDER_OPTIONS = [14, 7, 5, 3, 2, 1]
  const selected = form.watch('deadlineReminderDays')
  const toggleReminder = (n: number) => {
    const cur = form.getValues('deadlineReminderDays')
    if (cur.includes(n)) form.setValue('deadlineReminderDays', cur.filter((d) => d !== n))
    else form.setValue('deadlineReminderDays', [...cur, n].sort((a, b) => b - a))
  }

  return (
    <StepCard title="Step 8 of 15 — Workflows & Automation" description="Configure automatic behaviour when matters advance through their stages.">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
          <FormField control={form.control} name="autoCreateTasksOnStageAdvance" render={({ field }) => (
            <FormItem className="flex items-start gap-3">
              <FormControl>
                <Checkbox id="autoTasks" checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
              </FormControl>
              <div>
                <Label htmlFor="autoTasks" className="font-medium text-sm">Auto-create tasks on stage advance</Label>
                <p className="text-xs text-slate-500 mt-0.5">When a matter moves to a new stage, automatically create tasks from the workflow template for that stage.</p>
              </div>
            </FormItem>
          )} />
          <FormField control={form.control} name="autoCloseMatterOnTerminalStage" render={({ field }) => (
            <FormItem className="flex items-start gap-3">
              <FormControl>
                <Checkbox id="autoClose" checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
              </FormControl>
              <div>
                <Label htmlFor="autoClose" className="font-medium text-sm">Auto-close matter on terminal stage</Label>
                <p className="text-xs text-slate-500 mt-0.5">When a matter reaches a terminal pipeline stage, automatically mark it as closed.</p>
              </div>
            </FormItem>
          )} />
          <div>
            <FormLabel className="text-sm">Deadline Reminder Days</FormLabel>
            <p className="text-xs text-slate-500 mt-0.5 mb-2">Send reminders this many days before a deadline.</p>
            <div className="flex flex-wrap gap-2">
              {REMINDER_OPTIONS.map((n) => (
                <button key={n} type="button" onClick={() => toggleReminder(n)}
                  className={cn('rounded-md border px-3 py-1 text-xs font-medium transition-colors',
                    selected.includes(n) ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  )}>
                  {n}d
                </button>
              ))}
            </div>
          </div>
          <StepFooter saving={saving} onBack={onBack} onSkip={onSkip} />
        </form>
      </Form>
    </StepCard>
  )
}

// ─── Step 8: Document Templates ───────────────────────────────────────────────

function StepDocTemplates({ answers, saving, onSave, onBack, onSkip }: {
  answers: WizardAnswers; saving: boolean;
  onSave: (d: DocTemplatesValues) => void; onBack: () => void; onSkip: () => void
}) {
  const form = useForm<DocTemplatesValues>({
    resolver: zodResolver(documentTemplatesSchema),
    defaultValues: {
      seedTemplates: answers.documentTemplates?.seedTemplates ?? false,
      templateSet:   answers.documentTemplates?.templateSet   ?? 'none',
    },
  })
  const seed = form.watch('seedTemplates')
  return (
    <StepCard title="Step 9 of 15 — Document Templates" description="Optionally seed your document library with standard templates for your practice area.">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
          <FormField control={form.control} name="seedTemplates" render={({ field }) => (
            <FormItem className="flex items-start gap-3">
              <FormControl>
                <Checkbox id="seedTpl" checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
              </FormControl>
              <div>
                <Label htmlFor="seedTpl" className="font-medium text-sm">Seed with standard templates</Label>
                <p className="text-xs text-slate-500 mt-0.5">Pre-load a curated set of document templates for your primary practice area.</p>
              </div>
            </FormItem>
          )} />
          {seed && (
            <FormField control={form.control} name="templateSet" render={({ field }) => (
              <FormItem>
                <FormLabel>Template Set</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="immigration">Immigration</SelectItem>
                    <SelectItem value="family-law">Family Law</SelectItem>
                    <SelectItem value="real-estate">Real Estate</SelectItem>
                    <SelectItem value="general">General / Civil</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
          )}
          <StepFooter saving={saving} onBack={onBack} onSkip={onSkip} />
        </form>
      </Form>
    </StepCard>
  )
}

// ─── Step 9: Custom Fields ────────────────────────────────────────────────────

function StepCustomFields({ answers, saving, onSave, onBack, onSkip }: {
  answers: WizardAnswers; saving: boolean;
  onSave: (d: CustomFieldsValues) => void; onBack: () => void; onSkip: () => void
}) {
  const form = useForm<CustomFieldsValues>({
    resolver: zodResolver(customFieldsSchema),
    defaultValues: { enableCustomFields: answers.customFields?.enableCustomFields ?? false },
  })
  return (
    <StepCard title="Step 10 of 15 — Custom Fields" description="Enable custom fields to capture additional information on matters and contacts.">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
          <FormField control={form.control} name="enableCustomFields" render={({ field }) => (
            <FormItem className="flex items-start gap-3">
              <FormControl>
                <Checkbox id="customFlds" checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
              </FormControl>
              <div>
                <Label htmlFor="customFlds" className="font-medium text-sm">Enable custom fields</Label>
                <p className="text-xs text-slate-500 mt-0.5">Allows administrators to define additional fields per matter type. Field schemas are configured in Settings → Matter Types.</p>
              </div>
            </FormItem>
          )} />
          <StepFooter saving={saving} onBack={onBack} onSkip={onSkip} />
        </form>
      </Form>
    </StepCard>
  )
}

// ─── Step 10: Client Portal ───────────────────────────────────────────────────

function StepPortal({ answers, saving, onSave, onBack, onSkip }: {
  answers: WizardAnswers; saving: boolean;
  onSave: (d: PortalSetupValues) => void; onBack: () => void; onSkip: () => void
}) {
  const form = useForm<PortalSetupValues>({
    resolver: zodResolver(portalSetupSchema),
    defaultValues: {
      enabled:        answers.portalSetup?.enabled        ?? true,
      portalName:     answers.portalSetup?.portalName     ?? '',
      welcomeMessage: answers.portalSetup?.welcomeMessage ?? '',
    },
  })
  const enabled = form.watch('enabled')
  return (
    <StepCard title="Step 11 of 15 — Client Portal" description="The client portal lets clients access documents, sign forms, and communicate with your firm.">
      <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
        <Info className="h-4 w-4 shrink-0 text-slate-500 mt-0.5" />
        <p className="text-xs text-slate-600">
          Each matter automatically gets a unique, secure portal link. Clients access shared files and communications without needing a login account. No custom domain or DNS setup required.
        </p>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
          <FormField control={form.control} name="enabled" render={({ field }) => (
            <FormItem className="flex items-start gap-3">
              <FormControl>
                <Checkbox id="portalOn" checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
              </FormControl>
              <div>
                <Label htmlFor="portalOn" className="font-medium text-sm">Enable client portal</Label>
                <p className="text-xs text-slate-500 mt-0.5">Clients receive a unique portal link per matter to access shared documents and communications.</p>
              </div>
            </FormItem>
          )} />
          {enabled && (
            <>
              <FormField control={form.control} name="portalName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Portal Name</FormLabel>
                  <FormControl><Input placeholder="e.g. Client Portal" {...field} /></FormControl>
                  <FormDescription>Displayed on the portal login page.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="welcomeMessage" render={({ field }) => (
                <FormItem>
                  <FormLabel>Welcome Message</FormLabel>
                  <FormControl><Textarea placeholder="Welcome to your secure client portal..." rows={3} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </>
          )}
          <StepFooter saving={saving} onBack={onBack} onSkip={onSkip} />
        </form>
      </Form>
    </StepCard>
  )
}

// ─── Step 11: Notifications ───────────────────────────────────────────────────

function StepNotifications({ answers, saving, onSave, onBack, onSkip }: {
  answers: WizardAnswers; saving: boolean;
  onSave: (d: NotificationValues) => void; onBack: () => void; onSkip: () => void
}) {
  const form = useForm<NotificationValues>({
    resolver: zodResolver(notificationSetupSchema),
    defaultValues: {
      emailNotificationsEnabled: answers.notificationSetup?.emailNotificationsEnabled ?? true,
      deadlineReminderDays:      answers.notificationSetup?.deadlineReminderDays      ?? [7, 3, 1],
      taskDueReminderEnabled:    answers.notificationSetup?.taskDueReminderEnabled    ?? true,
    },
  })
  const REMINDER_OPTIONS = [14, 7, 5, 3, 2, 1]
  const selected = form.watch('deadlineReminderDays')
  const toggleReminder = (n: number) => {
    const cur = form.getValues('deadlineReminderDays')
    if (cur.includes(n)) form.setValue('deadlineReminderDays', cur.filter((d) => d !== n))
    else form.setValue('deadlineReminderDays', [...cur, n].sort((a, b) => b - a))
  }
  return (
    <StepCard title="Step 12 of 15 — Notifications & Reminders" description="Configure default notification behaviour for deadline and task reminders.">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
          <FormField control={form.control} name="emailNotificationsEnabled" render={({ field }) => (
            <FormItem className="flex items-start gap-3">
              <FormControl>
                <Checkbox id="emailNotif" checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
              </FormControl>
              <Label htmlFor="emailNotif" className="text-sm font-medium">Enable email notifications for all users</Label>
            </FormItem>
          )} />
          <FormField control={form.control} name="taskDueReminderEnabled" render={({ field }) => (
            <FormItem className="flex items-start gap-3">
              <FormControl>
                <Checkbox id="taskRemind" checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
              </FormControl>
              <Label htmlFor="taskRemind" className="text-sm font-medium">Enable task due-date reminders</Label>
            </FormItem>
          )} />
          <div>
            <FormLabel className="text-sm">Deadline Reminder Days (days before deadline)</FormLabel>
            <div className="mt-2 flex flex-wrap gap-2">
              {REMINDER_OPTIONS.map((n) => (
                <button key={n} type="button" onClick={() => toggleReminder(n)}
                  className={cn('rounded-md border px-3 py-1 text-xs font-medium transition-colors',
                    selected.includes(n) ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  )}>
                  {n}d
                </button>
              ))}
            </div>
          </div>
          <StepFooter saving={saving} onBack={onBack} onSkip={onSkip} />
        </form>
      </Form>
    </StepCard>
  )
}

// ─── Step 12: Billing & Trust ─────────────────────────────────────────────────

function StepBilling({ answers, saving, onSave, onBack, onSkip }: {
  answers: WizardAnswers; saving: boolean;
  onSave: (d: BillingSetupValues) => void; onBack: () => void; onSkip: () => void
}) {
  const form = useForm<BillingSetupValues>({
    resolver: zodResolver(billingSetupSchema),
    defaultValues: {
      billingEnabled:           answers.billingSetup?.billingEnabled           ?? true,
      trustAccountingEnabled:   answers.billingSetup?.trustAccountingEnabled   ?? false,
      currency:                 answers.billingSetup?.currency                 ?? 'CAD',
      defaultPaymentTermDays:   answers.billingSetup?.defaultPaymentTermDays   ?? 30,
      invoicePrefix:            answers.billingSetup?.invoicePrefix            ?? 'INV',
    },
  })
  return (
    <StepCard title="Step 13 of 15 — Billing & Trust" description="Configure billing preferences and trust accounting settings.">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
          <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2.5">
            <Info className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
            <p className="text-xs text-blue-800">
              <strong>Trust accounting</strong> activates a separate regulated ledger for client funds held in trust. Enable only if your firm actively holds client trust funds — it requires law society compliance and stricter reporting. You can enable it later from Settings → Billing.
            </p>
          </div>
          <div className="flex gap-6">
            <FormField control={form.control} name="billingEnabled" render={({ field }) => (
              <FormItem className="flex items-center gap-2">
                <FormControl>
                  <Checkbox id="billOn" checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <Label htmlFor="billOn" className="text-sm font-medium">Enable billing module</Label>
              </FormItem>
            )} />
            <FormField control={form.control} name="trustAccountingEnabled" render={({ field }) => (
              <FormItem className="flex items-center gap-2">
                <FormControl>
                  <Checkbox id="trustOn" checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <Label htmlFor="trustOn" className="text-sm font-medium">Enable trust accounting</Label>
              </FormItem>
            )} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField control={form.control} name="currency" render={({ field }) => (
              <FormItem>
                <FormLabel>Currency</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="CAD">CAD — Canadian Dollar</SelectItem>
                    <SelectItem value="USD">USD — US Dollar</SelectItem>
                    <SelectItem value="GBP">GBP — British Pound</SelectItem>
                    <SelectItem value="EUR">EUR — Euro</SelectItem>
                    <SelectItem value="AUD">AUD — Australian Dollar</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="defaultPaymentTermDays" render={({ field }) => (
              <FormItem>
                <FormLabel>Payment Terms (days)</FormLabel>
                <FormControl>
                  <Input type="number" min={1} value={field.value}
                    onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 30)} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="invoicePrefix" render={({ field }) => (
              <FormItem>
                <FormLabel>Invoice Prefix</FormLabel>
                <FormControl><Input placeholder="INV" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
          <StepFooter saving={saving} onBack={onBack} onSkip={onSkip} />
        </form>
      </Form>
    </StepCard>
  )
}

// ─── Step 13: Data Import ─────────────────────────────────────────────────────

function StepDataImport({ answers, saving, onSave, onBack, onSkip }: {
  answers: WizardAnswers; saving: boolean;
  onSave: (d: DataImportValues) => void; onBack: () => void; onSkip: () => void
}) {
  const form = useForm<DataImportValues>({
    resolver: zodResolver(dataImportSchema),
    defaultValues: { importIntent: answers.dataImport?.importIntent ?? 'none' },
  })
  const intent = form.watch('importIntent')
  const OPTIONS = [
    { value: 'none',        label: 'Start fresh',        description: 'No data to import — start with a blank workspace.' },
    { value: 'import-later',label: 'Import later',        description: 'I have legacy data to migrate but will do it after initial setup.' },
    { value: 'request-help',label: 'Request import help', description: 'I need assistance migrating data from another system.' },
  ] as const
  return (
    <StepCard title="Step 14 of 15 — Data Import" description="Let us know if you plan to migrate data from an existing system.">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSave)} className="space-y-3">
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => form.setValue('importIntent', opt.value)}
              className={cn(
                'w-full rounded-lg border px-4 py-3 text-left transition-colors',
                intent === opt.value ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'
              )}
            >
              <p className={cn('text-sm font-medium', intent === opt.value ? 'text-indigo-700' : 'text-slate-800')}>
                {opt.label}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{opt.description}</p>
            </button>
          ))}
          <StepFooter saving={saving} onBack={onBack} onSkip={onSkip} />
        </form>
      </Form>
    </StepCard>
  )
}

// ─── Step 14: Review & Activate ───────────────────────────────────────────────

function StepReview({ answers, activating, onActivate, onBack, onEditStep }: {
  answers: WizardAnswers
  activating: boolean
  onActivate: () => void
  onBack: () => void
  onEditStep: (step: number) => void
}) {
  const sections: Array<{ stepIdx: number; label: string; lines: string[] }> = []

  if (answers.firmProfile?.firmName) {
    sections.push({ stepIdx: 0, label: 'Firm Profile', lines: [
      `Name: ${answers.firmProfile.firmName}`,
      answers.firmProfile.address ? `Address: ${answers.firmProfile.address}` : '',
      answers.firmProfile.phone   ? `Phone: ${answers.firmProfile.phone}` : '',
    ].filter(Boolean) })
  }

  if (answers.practiceModel?.practiceAreas?.length) {
    sections.push({ stepIdx: 1, label: 'Practice Areas', lines:
      answers.practiceModel.practiceAreas.map((pa) => pa.name)
    })
  }

  if (answers.matterNumbering) {
    const mn = answers.matterNumbering
    const sep = mn.separator ?? '-'
    const preview =
      mn.format === 'PREFIX-YEAR-SEQ' ? `${mn.prefix}${sep}YYYY${sep}NNN` :
      mn.format === 'PREFIX-SEQ'      ? `${mn.prefix}${sep}NNN` :
      mn.format === 'YEAR-SEQ'        ? `YYYY${sep}NNN` : 'NNN'
    sections.push({ stepIdx: 2, label: 'Matter Numbering', lines: [`Format: ${preview}`, `Starting at: ${mn.startingNumber}`] })
  }

  if (answers.rolesSetup) {
    sections.push({ stepIdx: 3, label: 'Roles', lines: answers.rolesSetup.useStandardRoles
      ? [`Standard roles: ${answers.rolesSetup.standardRoles.join(', ')}`]
      : ['Custom roles — configure in Settings after activation']
    })
  }

  if (answers.emailSetup) {
    const es = answers.emailSetup
    sections.push({ stepIdx: 4, label: 'Email', lines: [
      es.replyToAddress ? `Reply-to: ${es.replyToAddress}` : 'Reply-to: platform default',
      `Signatures: ${es.emailSignatureEnabled ? 'enabled' : 'disabled'}`,
    ] })
  }

  if (answers.calendarSetup) {
    const cs = answers.calendarSetup
    sections.push({ stepIdx: 5, label: 'Calendar', lines: [
      `Working days: ${cs.workingDays.map((d) => d.slice(0,3)).join(', ')}`,
      `Hours: ${cs.workingHoursStart} – ${cs.workingHoursEnd}`,
    ] })
  }

  if (answers.storageSetup) {
    const ss = answers.storageSetup
    sections.push({ stepIdx: 6, label: 'Storage', lines: [
      `Retention: ${ss.retentionYears} years`,
      `Folder structure: ${ss.defaultFolderStructure}`,
    ] })
  }

  if (answers.workflowSetup) {
    const ws = answers.workflowSetup
    sections.push({ stepIdx: 7, label: 'Workflows', lines: [
      `Auto-tasks: ${ws.autoCreateTasksOnStageAdvance ? 'on' : 'off'}`,
      `Auto-close: ${ws.autoCloseMatterOnTerminalStage ? 'on' : 'off'}`,
      `Deadline reminders: ${ws.deadlineReminderDays.join(', ')}d`,
    ] })
  }

  if (answers.documentTemplates) {
    const dt = answers.documentTemplates
    sections.push({ stepIdx: 8, label: 'Document Templates', lines: [
      dt.seedTemplates && dt.templateSet !== 'none'
        ? `Template set: ${dt.templateSet}`
        : 'No starter templates — add manually from Settings',
    ] })
  }

  if (answers.customFields) {
    sections.push({ stepIdx: 9, label: 'Custom Fields', lines: [
      answers.customFields.enableCustomFields ? 'Custom fields enabled' : 'Custom fields disabled',
    ] })
  }

  if (answers.portalSetup) {
    sections.push({ stepIdx: 10, label: 'Client Portal', lines: [
      `Portal: ${answers.portalSetup.enabled ? 'enabled' : 'disabled'}`,
      answers.portalSetup.portalName ? `Name: ${answers.portalSetup.portalName}` : '',
    ].filter(Boolean) })
  }

  if (answers.notificationSetup) {
    const ns = answers.notificationSetup
    sections.push({ stepIdx: 11, label: 'Notifications', lines: [
      `Email notifications: ${ns.emailNotificationsEnabled ? 'on' : 'off'}`,
      `Deadline reminders: ${ns.deadlineReminderDays.join(', ')}d before`,
      `Task reminders: ${ns.taskDueReminderEnabled ? 'on' : 'off'}`,
    ] })
  }

  if (answers.billingSetup) {
    const bs = answers.billingSetup
    sections.push({ stepIdx: 12, label: 'Billing & Trust', lines: [
      `Currency: ${bs.currency}`,
      `Payment terms: ${bs.defaultPaymentTermDays} days`,
      `Trust accounting: ${bs.trustAccountingEnabled ? 'enabled' : 'disabled'}`,
    ] })
  }

  if (answers.dataImport) {
    const intentLabel: Record<string, string> = {
      none:          'Start fresh',
      'import-later':'Import data later',
      'request-help':'Assistance requested',
    }
    sections.push({ stepIdx: 13, label: 'Data Import', lines: [intentLabel[answers.dataImport.importIntent] ?? answers.dataImport.importIntent] })
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-6">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Step 15 of 15 — Review & Activate</h3>
        <p className="mt-1 text-sm text-slate-500">
          Review your configuration before applying it. Click <strong>Edit</strong> on any section to make changes.
        </p>
      </div>

      {sections.length === 0 && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-4">
          <p className="text-sm text-amber-700">No configuration steps have been completed yet. Go back and complete at least the first three steps (Firm Profile, Practice Model, Matter Numbering).</p>
        </div>
      )}

      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {sections.map((sec) => (
          <div key={sec.label} className="flex items-start gap-3 px-4 py-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900">{sec.label}</p>
              {sec.lines.map((line) => (
                <p key={line} className="text-xs text-slate-500">{line}</p>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs text-indigo-600 hover:text-indigo-700 h-7 px-2"
              onClick={() => onEditStep(sec.stepIdx)}
            >
              Edit
            </Button>
          </div>
        ))}
      </div>

      {/* Skipped steps notice */}
      {(() => {
        const skippedLabels = STEPS
          .filter((s) => s.index < 14 && s.skippable && !answers[s.key as keyof WizardAnswers])
          .map((s) => s.label)
        return skippedLabels.length > 0 ? (
          <div className="rounded-md bg-slate-50 border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">
              <strong>Skipped / using defaults:</strong>{' '}
              {skippedLabels.join(', ')} — system defaults will be applied automatically on activation.
            </p>
          </div>
        ) : null
      })()}

      {/* Post-activation next steps */}
      <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-4 space-y-2">
        <p className="text-xs font-semibold text-indigo-800 uppercase tracking-wide">After activation — your next steps</p>
        <ul className="space-y-1.5">
          {[
            { label: 'Invite your team members',          path: 'Settings → Team' },
            { label: 'Review role permissions',           path: 'Settings → Roles' },
            { label: 'Customise matter types & stages',  path: 'Settings → Matter Types' },
            { label: 'Add document templates',           path: 'Settings → Templates' },
            ...(answers.portalSetup?.enabled ? [{ label: 'Test the client portal with a matter', path: 'Any matter → Portal tab' }] : []),
            ...(answers.dataImport?.importIntent === 'request-help' ? [{ label: 'Follow up on your data import request', path: 'We will contact you' }] : []),
            ...(answers.dataImport?.importIntent === 'import-later' ? [{ label: 'Schedule your data migration', path: 'Settings → Data Import' }] : []),
          ].map((item) => (
            <li key={item.label} className="flex items-start gap-2">
              <ArrowRight className="h-3 w-3 shrink-0 text-indigo-400 mt-0.5" />
              <span className="text-xs text-indigo-800">
                {item.label} <span className="text-indigo-400">({item.path})</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={onActivate}
          disabled={activating || sections.length === 0}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {activating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
          Activate Workspace
        </Button>
      </div>
    </div>
  )
}
