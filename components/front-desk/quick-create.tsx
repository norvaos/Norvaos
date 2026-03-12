'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { UserPlus, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useFrontDeskPracticeAreas, useFrontDeskConfig } from '@/lib/queries/front-desk-queries'
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
}

// ─── Component ──────────────────────────────────────────────────────────────

export function QuickCreate({ onCreated }: QuickCreateProps) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''

  const { data: practiceAreas } = useFrontDeskPracticeAreas(tenantId)
  const { data: config } = useFrontDeskConfig(tenantId)

  const [step, setStep] = useState<1 | 2>(1)
  const [step1Errors, setStep1Errors] = useState<Record<string, string>>({})
  const [step2Errors, setStep2Errors] = useState<Record<string, string>>({})

  // Step 1 fields
  const [step1, setStep1] = useState<Step1Data>({
    firstName: '',
    lastName: '',
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
  })

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
    onSuccess: () => {
      toast.success('Intake created successfully')
      resetForm()
      onCreated?.()
    },
    onError: (err: Error) => {
      toast.error(err.message)
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

    setStep1Errors(errors)
    return Object.keys(errors).length === 0
  }

  function validateStep2(): boolean {
    const errors: Record<string, string> = {}

    if (!step2.practiceAreaId) {
      errors.practiceAreaId = 'Practice area is required'
    }
    if (!step2.reason.trim()) {
      errors.reason = 'Reason is required'
    } else if (step2.reason.trim().length < 10) {
      errors.reason = 'Reason must be at least 10 characters'
    }

    setStep2Errors(errors)
    return Object.keys(errors).length === 0
  }

  // ─── Handlers ───────────────────────────────────────────────────────────

  function handleNext() {
    if (validateStep1()) {
      setStep(2)
    }
  }

  function handleBack() {
    setStep(1)
    setStep2Errors({})
  }

  function handleSubmit() {
    if (!validateStep2()) return
    createMutation.mutate()
  }

  function resetForm() {
    setStep(1)
    setStep1({
      firstName: '',
      lastName: '',
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
    })
    setStep1Errors({})
    setStep2Errors({})
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

  // ─── Derived ────────────────────────────────────────────────────────────

  const languages = config?.languages ?? ['English', 'French']
  const sources = config?.sources ?? ['Walk-in', 'Phone', 'Website', 'Referral', 'Other']

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Quick Create
          </div>
          <Badge variant="secondary" className="text-xs">
            Step {step} of 2
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent>
        {step === 1 ? (
          /* ────────────────── Step 1: Minimal Intake ────────────────── */
          <div className="space-y-4">
            {/* First Name */}
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

            {/* Last Name */}
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

            {/* Phone */}
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

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="qc-email">Email</Label>
              <Input
                id="qc-email"
                type="email"
                value={step1.email}
                onChange={(e) => updateStep1('email', e.target.value)}
                placeholder="Email (optional)"
              />
            </div>

            {/* Preferred Contact Method */}
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

            {/* Language */}
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
                  {languages.map((lang) => (
                    <SelectItem key={lang} value={lang}>
                      {lang}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Source */}
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
                  {sources.map((src) => (
                    <SelectItem key={src} value={src}>
                      {src}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Appointment Requested */}
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
              <Label htmlFor="qc-appointment" className="cursor-pointer">
                Appointment Requested?
              </Label>
              <Switch
                id="qc-appointment"
                checked={step1.appointmentRequested}
                onCheckedChange={(checked) =>
                  updateStep1('appointmentRequested', checked === true)
                }
              />
            </div>

            {/* Next Button */}
            <Button onClick={handleNext} className="w-full">
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        ) : (
          /* ────────────────── Step 2: Classification ────────────────── */
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

            {/* Brief Reason */}
            <div className="space-y-1.5">
              <Label htmlFor="qc-reason">
                Brief Reason <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="qc-reason"
                value={step2.reason}
                onChange={(e) => updateStep2('reason', e.target.value)}
                placeholder="Brief description of their enquiry (min 10 characters)..."
                rows={3}
              />
              {step2Errors.reason && (
                <p className="text-xs text-red-600">{step2Errors.reason}</p>
              )}
            </div>

            {/* Back + Submit Buttons */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={createMutation.isPending}
                className="flex-1"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={handleSubmit}
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
      </CardContent>
    </Card>
  )
}
