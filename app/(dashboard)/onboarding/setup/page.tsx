'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Building2,
  Layers,
  UserPlus,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Loader2,
  SkipForward,
} from 'lucide-react'

import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { logAudit } from '@/lib/queries/audit-logs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { cn } from '@/lib/utils'

// ─── Timezones ────────────────────────────────────────────────────────────────

const TIMEZONES = [
  { value: 'America/St_Johns', label: "St. John's (NST/NDT)" },
  { value: 'America/Halifax', label: 'Halifax (AST/ADT)' },
  { value: 'America/Toronto', label: 'Toronto / Ottawa (EST/EDT)' },
  { value: 'America/New_York', label: 'New York (EST/EDT)' },
  { value: 'America/Winnipeg', label: 'Winnipeg (CST/CDT)' },
  { value: 'America/Chicago', label: 'Chicago (CST/CDT)' },
  { value: 'America/Edmonton', label: 'Edmonton (MST/MDT)' },
  { value: 'America/Denver', label: 'Denver (MST/MDT)' },
  { value: 'America/Vancouver', label: 'Vancouver (PST/PDT)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT)' },
  { value: 'America/Anchorage', label: 'Anchorage (AKST/AKDT)' },
  { value: 'Pacific/Honolulu', label: 'Honolulu (HST)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Asia/Kolkata', label: 'Kolkata (IST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
  { value: 'Pacific/Auckland', label: 'Auckland (NZST/NZDT)' },
]

// ─── Colour swatches ──────────────────────────────────────────────────────────

const COLOUR_SWATCHES = [
  '#6366f1', '#3b82f6', '#10b981', '#f59e0b',
  '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4',
  '#84cc16', '#f97316', '#14b8a6', '#6b7280',
]

// ─── Step schemas ─────────────────────────────────────────────────────────────

const step1Schema = z.object({
  firmName: z.string().min(1, 'Firm name is required').max(200),
  address: z.string().max(300).optional(),
  phone: z.string().max(50).optional(),
  timezone: z.string().min(1, 'Timezone is required'),
})

const step2Schema = z.object({
  name: z.string().min(1, 'Practice area name is required').max(100),
  description: z.string().max(500).optional(),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex colour'),
})

const step3Schema = z.object({
  email: z.string().email('Invalid email address'),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
})

type Step1Values = z.infer<typeof step1Schema>
type Step2Values = z.infer<typeof step2Schema>
type Step3Values = z.infer<typeof step3Schema>

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Office Profile', icon: Building2 },
  { label: 'Practice Area', icon: Layers },
  { label: 'Invite Team', icon: UserPlus },
  { label: 'Done', icon: CheckCircle2 },
]

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((step, idx) => {
        const StepIcon = step.icon
        const isCompleted = idx < current
        const isActive = idx === current
        return (
          <div key={idx} className="flex items-center">
            <div
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-medium transition-colors',
                isCompleted && 'border-emerald-500 bg-emerald-500 text-white',
                isActive && 'border-indigo-600 bg-indigo-600 text-white',
                !isCompleted && !isActive && 'border-slate-200 bg-white text-slate-400'
              )}
            >
              {isCompleted ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <StepIcon className="h-4 w-4" />
              )}
            </div>
            <div className="hidden sm:flex flex-col items-start ml-2 mr-4">
              <span
                className={cn(
                  'text-xs font-medium',
                  isActive ? 'text-indigo-600' : isCompleted ? 'text-emerald-600' : 'text-slate-400'
                )}
              >
                Step {idx + 1}
              </span>
              <span
                className={cn(
                  'text-xs',
                  isActive ? 'text-slate-900 font-medium' : 'text-slate-500'
                )}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={cn(
                  'h-px w-6 sm:w-8 shrink-0',
                  idx < current ? 'bg-emerald-400' : 'bg-slate-200'
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Summary ─────────────────────────────────────────────────────────────────

interface SetupSummary {
  firmName?: string
  timezone?: string
  practiceAreaName?: string
  invitedEmails: string[]
  step2Skipped: boolean
  step3Skipped: boolean
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SetupWizardPage() {
  const router = useRouter()
  const { tenant, refreshTenant } = useTenant()
  const { appUser } = useUser()
  const tenantId = tenant?.id ?? ''

  const [currentStep, setCurrentStep] = useState(0)
  const [summary, setSummary] = useState<SetupSummary>({
    invitedEmails: [],
    step2Skipped: false,
    step3Skipped: false,
  })

  // ── Step 1 ─────────────────────────────────────────────────────────────────

  const step1Form = useForm<Step1Values>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      firmName: tenant?.name ?? '',
      address: '',
      phone: '',
      timezone: tenant?.timezone ?? 'America/Toronto',
    },
  })

  const [step1Loading, setStep1Loading] = useState(false)

  async function onStep1Submit(values: Step1Values) {
    setStep1Loading(true)
    try {
      const res = await fetch('/api/settings/firm', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.firmName,
          timezone: values.timezone,
          address_line1: values.address || undefined,
          office_phone: values.phone || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? 'Failed to save office profile')
      }

      await refreshTenant()

      if (appUser && tenantId) {
        logAudit({
          tenantId,
          userId: appUser.id,
          entityType: 'onboarding',
          entityId: tenantId,
          action: 'setup_wizard_step1_office_profile_saved',
          changes: { firm_name: values.firmName, timezone: values.timezone },
        })
      }

      setSummary((prev) => ({
        ...prev,
        firmName: values.firmName,
        timezone: values.timezone,
      }))
      setCurrentStep(1)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setStep1Loading(false)
    }
  }

  // ── Step 2 ─────────────────────────────────────────────────────────────────

  const step2Form = useForm<Step2Values>({
    resolver: zodResolver(step2Schema),
    defaultValues: {
      name: '',
      description: '',
      colour: '#6366f1',
    },
  })

  const [step2Loading, setStep2Loading] = useState(false)

  async function onStep2Submit(values: Step2Values) {
    setStep2Loading(true)
    try {
      const res = await fetch('/api/settings/practice-areas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name,
          color: values.colour,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? 'Failed to create practice area')
      }

      if (appUser && tenantId) {
        logAudit({
          tenantId,
          userId: appUser.id,
          entityType: 'onboarding',
          entityId: tenantId,
          action: 'setup_wizard_step2_practice_area_created',
          changes: { name: values.name },
        })
      }

      setSummary((prev) => ({
        ...prev,
        practiceAreaName: values.name,
        step2Skipped: false,
      }))
      setCurrentStep(2)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setStep2Loading(false)
    }
  }

  function skipStep2() {
    if (appUser && tenantId) {
      logAudit({
        tenantId,
        userId: appUser.id,
        entityType: 'onboarding',
        entityId: tenantId,
        action: 'setup_wizard_step2_skipped',
      })
    }
    setSummary((prev) => ({ ...prev, step2Skipped: true }))
    setCurrentStep(2)
  }

  // ── Step 3 ─────────────────────────────────────────────────────────────────

  const step3Form = useForm<Step3Values>({
    resolver: zodResolver(step3Schema),
    defaultValues: { email: '', firstName: '', lastName: '' },
  })

  const [step3Loading, setStep3Loading] = useState(false)
  const [invitedEmails, setInvitedEmails] = useState<string[]>([])

  async function onStep3Submit(values: Step3Values) {
    setStep3Loading(true)
    try {
      const res = await fetch('/api/settings/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: values.email,
          first_name: values.firstName,
          last_name: values.lastName,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? 'Failed to send invitation')
      }

      if (appUser && tenantId) {
        logAudit({
          tenantId,
          userId: appUser.id,
          entityType: 'onboarding',
          entityId: tenantId,
          action: 'setup_wizard_step3_user_invited',
          changes: { email: values.email },
        })
      }

      const newInvited = [...invitedEmails, values.email]
      setInvitedEmails(newInvited)
      setSummary((prev) => ({ ...prev, invitedEmails: newInvited, step3Skipped: false }))
      step3Form.reset()
      toast.success(`Invitation sent to ${values.email}.`)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setStep3Loading(false)
    }
  }

  function finishStep3() {
    if (appUser && tenantId) {
      logAudit({
        tenantId,
        userId: appUser.id,
        entityType: 'onboarding',
        entityId: tenantId,
        action: 'setup_wizard_step3_completed',
        changes: { invited_count: invitedEmails.length },
      })
    }
    if (invitedEmails.length === 0) {
      setSummary((prev) => ({ ...prev, step3Skipped: true }))
    }
    setCurrentStep(3)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const selectedColour = step2Form.watch('colour')

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Office Setup</h2>
        <p className="mt-1 text-sm text-slate-500">
          Let&rsquo;s get your NorvaOS workspace configured. This takes about 3 minutes.
        </p>
      </div>

      <StepIndicator current={currentStep} />

      {/* ── Step 1: Office Profile ────────────────────────────────────────── */}
      {currentStep === 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Step 1 of 4 — Office Profile</h3>
            <p className="mt-1 text-sm text-slate-500">
              Set your firm name, contact details, and timezone.
            </p>
          </div>

          <Form {...step1Form}>
            <form onSubmit={step1Form.handleSubmit(onStep1Submit)} className="space-y-4">
              <FormField
                control={step1Form.control}
                name="firmName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Firm Name <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Waseer Law Office" autoFocus {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={step1Form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Office Address</FormLabel>
                    <FormControl>
                      <Input placeholder="123 Legal Street, Toronto, ON" {...field} />
                    </FormControl>
                    <FormDescription>Optional — can be set later in Firm Settings.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={step1Form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Office Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="+1 (416) 555-0100" {...field} />
                    </FormControl>
                    <FormDescription>Optional — can be set later in Firm Settings.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={step1Form.control}
                name="timezone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Timezone <span className="text-destructive">*</span></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select timezone" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TIMEZONES.map((tz) => (
                          <SelectItem key={tz.value} value={tz.value}>
                            {tz.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={step1Loading}>
                  {step1Loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ChevronRight className="mr-2 h-4 w-4" />
                  )}
                  Save &amp; Continue
                </Button>
              </div>
            </form>
          </Form>
        </div>
      )}

      {/* ── Step 2: Practice Area ─────────────────────────────────────────── */}
      {currentStep === 1 && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Step 2 of 4 — Your First Practice Area</h3>
            <p className="mt-1 text-sm text-slate-500">
              Practice areas organise your matters. You can add more later.
            </p>
          </div>

          <Form {...step2Form}>
            <form onSubmit={step2Form.handleSubmit(onStep2Submit)} className="space-y-4">
              <FormField
                control={step2Form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Immigration" autoFocus {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={step2Form.control}
                name="colour"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Colour</FormLabel>
                    <FormControl>
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {COLOUR_SWATCHES.map((colour) => (
                            <button
                              key={colour}
                              type="button"
                              className={cn(
                                'h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1',
                                field.value === colour
                                  ? 'border-slate-900 scale-110'
                                  : 'border-transparent'
                              )}
                              style={{ backgroundColor: colour }}
                              onClick={() => field.onChange(colour)}
                              aria-label={`Select colour ${colour}`}
                            />
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-7 w-7 shrink-0 rounded-full border"
                            style={{ backgroundColor: selectedColour }}
                          />
                          <Input
                            placeholder="#6366f1"
                            value={field.value}
                            onChange={field.onChange}
                            className="h-8 font-mono text-xs w-32"
                            maxLength={7}
                          />
                        </div>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-center justify-between pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentStep(0)}
                  className="text-slate-500"
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Back
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={skipStep2}
                  >
                    <SkipForward className="mr-1.5 h-4 w-4" />
                    Skip
                  </Button>
                  <Button type="submit" disabled={step2Loading}>
                    {step2Loading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <ChevronRight className="mr-2 h-4 w-4" />
                    )}
                    Save &amp; Continue
                  </Button>
                </div>
              </div>
            </form>
          </Form>
        </div>
      )}

      {/* ── Step 3: Invite Team ───────────────────────────────────────────── */}
      {currentStep === 2 && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Step 3 of 4 — Invite Your Team</h3>
            <p className="mt-1 text-sm text-slate-500">
              Send invitations to your team members. You can invite more from Settings later.
            </p>
          </div>

          {invitedEmails.length > 0 && (
            <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3">
              <p className="text-xs font-medium text-emerald-700 mb-1">
                {invitedEmails.length} invitation{invitedEmails.length !== 1 ? 's' : ''} sent:
              </p>
              <ul className="space-y-0.5">
                {invitedEmails.map((email) => (
                  <li key={email} className="text-xs text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {email}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Form {...step3Form}>
            <form onSubmit={step3Form.handleSubmit(onStep3Submit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={step3Form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder="Jane" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={step3Form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder="Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={step3Form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="jane.doe@example.com" type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-center justify-between pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentStep(1)}
                  className="text-slate-500"
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Back
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={finishStep3}
                  >
                    {invitedEmails.length > 0 ? 'Done Inviting' : 'Skip'}
                  </Button>
                  <Button type="submit" disabled={step3Loading}>
                    {step3Loading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <UserPlus className="mr-2 h-4 w-4" />
                    )}
                    Send Invite
                  </Button>
                </div>
              </div>
            </form>
          </Form>
        </div>
      )}

      {/* ── Step 4: Done ──────────────────────────────────────────────────── */}
      {currentStep === 3 && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-5 text-center">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-9 w-9 text-emerald-600" />
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-slate-900">Your workspace is ready!</h3>
            <p className="mt-1 text-sm text-slate-500">
              Here&rsquo;s a summary of what was set up during this session.
            </p>
          </div>

          <div className="rounded-md bg-slate-50 border border-slate-200 p-4 text-left space-y-2">
            <SummaryRow
              label="Firm name"
              value={summary.firmName ?? tenant?.name ?? '—'}
            />
            <SummaryRow
              label="Timezone"
              value={summary.timezone ?? tenant?.timezone ?? '—'}
            />
            <SummaryRow
              label="Practice area"
              value={summary.step2Skipped ? 'Skipped' : (summary.practiceAreaName ?? '—')}
              muted={summary.step2Skipped}
            />
            <SummaryRow
              label="Team invitations"
              value={
                summary.step3Skipped
                  ? 'Skipped'
                  : summary.invitedEmails.length > 0
                    ? `${summary.invitedEmails.length} sent`
                    : '—'
              }
              muted={summary.step3Skipped}
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Button
              variant="outline"
              onClick={() => router.push('/settings/onboarding')}
            >
              View Setup Checklist
            </Button>
            <Button onClick={() => router.push('/')}>
              Go to Dashboard
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Summary row ──────────────────────────────────────────────────────────────

function SummaryRow({
  label,
  value,
  muted = false,
}: {
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={cn('font-medium', muted ? 'text-slate-400 italic' : 'text-slate-900')}>
        {value}
      </span>
    </div>
  )
}
