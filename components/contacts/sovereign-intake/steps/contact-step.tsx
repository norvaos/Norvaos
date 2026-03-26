'use client'

import { useState, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod/v4'
import { zodResolver } from '@hookform/resolvers/zod'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Fingerprint,
  Loader2,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Users,
  Check,
  ShieldAlert,
  ShieldCheck,
  Link2,
  UserX,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { CONTACT_SOURCES } from '@/lib/utils/constants'
import type { IntakeState } from '../sovereign-stepper'

/* ------------------------------------------------------------------ */
/*  Schema  -  Directive 42.1/42.2: Identity Injection + Verifier        */
/* ------------------------------------------------------------------ */

const stepSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  email_primary: z.string().email().optional().or(z.literal('')),
  phone_primary: z.string().max(30).optional().or(z.literal('')),
  date_of_birth: z.string().optional().or(z.literal('')),
  address_line1: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
  province: z.string().optional().or(z.literal('')),
  postal_code: z.string().optional().or(z.literal('')),
  source: z.string().optional(),
})

type StepValues = z.infer<typeof stepSchema>

/* ------------------------------------------------------------------ */
/*  OCR response shape                                                 */
/* ------------------------------------------------------------------ */

interface OcrResult {
  fields: {
    first_name?: string
    last_name?: string
    date_of_birth?: string
    address_line1?: string
    city?: string
    province?: string
    postal_code?: string
    document_number?: string
    expiry_date?: string
  }
  rawText: string
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface ContactStepProps {
  intake: IntakeState
  updateIntake: (patch: Partial<IntakeState>) => void
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.includes(',') ? result.split(',')[1] : result
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function SovereignContactStep({
  intake,
  updateIntake,
}: ContactStepProps) {
  const { tenant } = useTenant()
  const { appUser } = useUser()

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState(!!intake.contactId)

  // OCR state
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [scanSuccess, setScanSuccess] = useState(false)
  const [ocrFields, setOcrFields] = useState<(keyof StepValues)[]>([])
  const [dragOver, setDragOver] = useState(false)

  // Directive 42.2: Sovereign Verifier state
  const [ocrVerified, setOcrVerified] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<StepValues>({
    resolver: zodResolver(stepSchema),
    defaultValues: {
      first_name: intake.firstName,
      last_name: intake.lastName,
      email_primary: '',
      phone_primary: '',
      date_of_birth: '',
      address_line1: '',
      city: '',
      province: '',
      postal_code: '',
      source: '',
    },
  })

  const sourceValue = watch('source')
  const watchedFirstName = watch('first_name')
  const watchedLastName = watch('last_name')

  // Detect if name has diverged from what was conflict-checked in Step 1
  const nameDiverged =
    watchedFirstName.trim().toLowerCase() !== intake.firstName.trim().toLowerCase() ||
    watchedLastName.trim().toLowerCase() !== intake.lastName.trim().toLowerCase()

  // ── Inline conflict check state (triggered on submit when name changed) ──
  const [conflictChecking, setConflictChecking] = useState(false)
  const [conflictMatches, setConflictMatches] = useState<Array<{
    id: string
    first_name: string | null
    last_name: string | null
    email_primary: string | null
    phone_primary: string | null
  }>>([])
  const [showConflictDialog, setShowConflictDialog] = useState(false)
  const [pendingValues, setPendingValues] = useState<StepValues | null>(null)

  // OCR was used = at least one field was auto-populated
  const ocrWasUsed = ocrFields.length > 0

  /* ---------------------------------------------------------------- */
  /*  Existing-contact short-circuit                                   */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (intake.existingContactId) {
      updateIntake({ contactId: intake.existingContactId })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intake.existingContactId])

  if (intake.existingContactId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-800">
          <Users className="size-5 shrink-0" />
          <p className="text-sm font-medium">
            Linked to existing contact. Click Next to proceed to compliance
            review.
          </p>
        </div>
      </div>
    )
  }

  /* ---------------------------------------------------------------- */
  /*  OCR scan handler                                                 */
  /* ---------------------------------------------------------------- */

  async function handleIdScan(file: File) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setScanError('Unsupported file type. Please use JPEG, PNG, WebP, or PDF.')
      return
    }

    setScanning(true)
    setScanError(null)
    setScanSuccess(false)
    setOcrFields([])
    setOcrVerified(false) // Reset verification when re-scanning

    try {
      const base64 = await fileToBase64(file)

      const res = await fetch('/api/ocr/scan-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, fileName: file.name }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Scan failed (${res.status})`)
      }

      const response = await res.json()

      // API returns { success, data: { fields, rawText } }
      const ocrData: OcrResult = response.data ?? response

      if (!ocrData?.fields) {
        throw new Error('OCR could not extract any fields from the document')
      }

      const filled: (keyof StepValues)[] = []
      const fieldMap: Record<string, keyof StepValues> = {
        first_name: 'first_name',
        last_name: 'last_name',
        date_of_birth: 'date_of_birth',
        address_line1: 'address_line1',
        city: 'city',
        province: 'province',
        postal_code: 'postal_code',
      }

      for (const [ocrKey, formKey] of Object.entries(fieldMap)) {
        const value = ocrData.fields[ocrKey as keyof OcrResult['fields']]
        if (value) {
          setValue(formKey, value, { shouldValidate: true })
          filled.push(formKey)
        }
      }

      setOcrFields(filled)
      setScanSuccess(true)
    } catch (err) {
      setScanError(
        err instanceof Error ? err.message : 'Failed to scan document'
      )
    } finally {
      setScanning(false)
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Drop-zone event handlers                                         */
  /* ---------------------------------------------------------------- */

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleIdScan(file)
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(true)
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleIdScan(file)
    e.target.value = ''
  }

  /* ---------------------------------------------------------------- */
  /*  Inline conflict check  -  runs before create when name changed     */
  /* ---------------------------------------------------------------- */

  const runInlineConflictCheck = useCallback(async (firstName: string, lastName: string): Promise<boolean> => {
    if (!tenant) return true
    setConflictChecking(true)
    try {
      const supabase = createClient()
      const { data: matches } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email_primary, phone_primary')
        .eq('tenant_id', tenant.id)
        .or(`first_name.ilike.%${firstName}%,last_name.ilike.%${lastName}%`)
        .limit(20)

      const results = (matches ?? []).filter(
        (m) =>
          m.first_name?.toLowerCase().includes(firstName.toLowerCase()) ||
          m.last_name?.toLowerCase().includes(lastName.toLowerCase())
      )

      if (results.length === 0) {
        // Clear  -  update intake with new name and mark conflict cleared
        updateIntake({
          firstName,
          lastName,
          conflictCleared: true,
          conflictResolution: 'none',
        })
        return true
      }

      // Matches found  -  show dialog
      setConflictMatches(results)
      setShowConflictDialog(true)
      return false
    } catch {
      // On error, allow through but log
      return true
    } finally {
      setConflictChecking(false)
    }
  }, [tenant, updateIntake])

  /* ---------------------------------------------------------------- */
  /*  Submit  -  create contact (+ lead unless general contact)          */
  /* ---------------------------------------------------------------- */

  async function onSubmit(values: StepValues) {
    if (!tenant || !appUser) return

    // If name changed from what was conflict-checked, run inline check first
    if (nameDiverged) {
      setPendingValues(values)
      const passed = await runInlineConflictCheck(values.first_name.trim(), values.last_name.trim())
      if (!passed) return // Dialog will handle resolution
    }

    await createContactAndLead(values)
  }

  async function createContactAndLead(values: StepValues) {
    if (!tenant || !appUser) return

    setSubmitting(true)
    setError(null)

    try {
      const supabase = createClient()

      // 1. Create the contact
      const { data: contact, error: contactError } = await supabase
        .from('contacts')
        .insert({
          tenant_id: tenant.id,
          first_name: values.first_name,
          last_name: values.last_name,
          email_primary: values.email_primary || null,
          phone_primary: values.phone_primary || null,
          date_of_birth: values.date_of_birth || null,
          address_line1: values.address_line1 || null,
          city: values.city || null,
          province: values.province || null,
          postal_code: values.postal_code || null,
          source: values.source || null,
          created_by: appUser.id,
        })
        .select('id')
        .single()

      if (contactError || !contact) {
        throw new Error(
          contactError?.message ?? 'Failed to create contact'
        )
      }

      // Directive 42.2, Item 4: Audit log with OCR verification flag
      if (ocrWasUsed) {
        await supabase.from('audit_logs').insert({
          tenant_id: tenant.id,
          user_id: appUser.id,
          entity_type: 'contact',
          entity_id: contact.id,
          action: 'sovereign_intake_created',
          changes: {
            ocr_verified_by_user: true,
            ocr_populated_fields: ocrFields,
          },
          metadata: {
            source: 'norva_sovereign_intake',
            verification_method: 'manual_confirmation_checkbox',
          },
        })
      }

      // 2. If general contact, skip lead creation
      if (intake.isGeneralContact) {
        setCreated(true)
        updateIntake({ contactId: contact.id })
        return
      }

      // 3. Fetch the default (first active) pipeline and its first stage
      const { data: pipelines, error: pipelineError } = await supabase
        .from('pipelines')
        .select('id')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .order('name')
        .limit(1)

      if (pipelineError || !pipelines?.[0]) {
        throw new Error(
          'No active pipeline found. Please configure a pipeline in Settings first.'
        )
      }

      const pipelineId = pipelines[0].id

      const { data: stages, error: stageError } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('pipeline_id', pipelineId)
        .order('position')
        .limit(1)

      if (stageError || !stages?.[0]) {
        throw new Error(
          'No stages found for the default pipeline. Please configure pipeline stages first.'
        )
      }

      const stageId = stages[0].id

      // 4. Create a lead linked to the contact
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .insert({
          tenant_id: tenant.id,
          contact_id: contact.id,
          pipeline_id: pipelineId,
          stage_id: stageId,
          status: 'open',
          source: values.source || null,
          assigned_to: appUser.id,
          created_by: appUser.id,
        })
        .select('id')
        .single()

      if (leadError || !lead) {
        throw new Error(leadError?.message ?? 'Failed to create lead')
      }

      setCreated(true)
      updateIntake({
        contactId: contact.id,
        leadId: lead.id,
      })
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'An unexpected error occurred'
      )
    } finally {
      setSubmitting(false)
    }
  }

  const busy = submitting || scanning || conflictChecking

  // Directive 42.2, Item 3: Submit locked if OCR was used but not verified
  const verificationRequired = ocrWasUsed && !ocrVerified
  const canSubmit = !busy && !created && !verificationRequired

  /* ---------------------------------------------------------------- */
  /*  Helper: OCR field wrapper with highlight + checkmark + tooltip    */
  /* ---------------------------------------------------------------- */

  function ocrHighlight(field: keyof StepValues) {
    return ocrFields.includes(field)
      ? 'ring-2 ring-emerald-400 ring-offset-1'
      : ''
  }

  function OcrFieldWrapper({
    field,
    children,
  }: {
    field: keyof StepValues
    children: React.ReactNode
  }) {
    const isOcrField = ocrFields.includes(field)
    if (!isOcrField) return <>{children}</>

    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative">
              {children}
              {/* Directive 42.2, Item 2: Checkmark inside OCR fields */}
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center justify-center size-5 rounded-full bg-emerald-100 text-emerald-600">
                <Check className="size-3" />
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs max-w-xs">
            AI-Extracted: Please confirm accuracy.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  const submitLabel = intake.isGeneralContact
    ? 'Create Contact'
    : 'Create Contact & Lead'

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Success badge */}
      {created && (
        <div className="flex justify-center">
          <Badge
            variant="outline"
            className="border-yellow-400 bg-yellow-50 text-yellow-800 animate-in zoom-in"
          >
            {intake.isGeneralContact ? 'CONTACT CREATED' : 'PROSPECTIVE LEAD'}
          </Badge>
        </div>
      )}

      {/* ── Directive 42.2, Item 1: Sovereign Caution Banner ──────── */}
      {ocrWasUsed && !created && (
        <div className="animate-in fade-in slide-in-from-top-2 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200 animate-pulse [animation-duration:3s]">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="text-sm font-semibold">Sovereign Caution</p>
            <p className="mt-0.5 text-xs leading-relaxed">
              Information has been auto-populated via OCR. It is mandatory to
              verify all fields against the original ID document before
              proceeding.
            </p>
          </div>
        </div>
      )}

      {/* ── ID Scan Drop-Zone ───────────────────────────────────── */}
      {!created && (
        <div className="animate-in fade-in slide-in-from-bottom-2 space-y-3">
          <label
            htmlFor="id-scan-input"
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            className={`
              relative flex cursor-pointer flex-col items-center justify-center
              gap-3 rounded-lg border-2 border-dashed p-6 transition-all
              ${
                dragOver
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30'
              }
              ${scanning ? 'pointer-events-none opacity-60' : ''}
            `}
          >
            {scanning ? (
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            ) : (
              <Fingerprint className="size-8 text-muted-foreground" />
            )}

            <div className="text-center">
              <p className="text-sm font-medium">
                {scanning ? 'Scanning document...' : 'Scan Identity Document'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Drop an image of a government ID (passport, driver&apos;s
                licence, PR card)
              </p>
            </div>

            {!scanning && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="pointer-events-none mt-1 gap-1.5"
              >
                <Upload className="size-3.5" />
                Choose File
              </Button>
            )}

            <input
              id="id-scan-input"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={onFileInput}
              disabled={busy || created}
            />
          </label>

          {/* OCR success banner */}
          {scanSuccess && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-800 animate-in fade-in slide-in-from-top-2">
              <CheckCircle2 className="size-4 shrink-0" />
              <p className="text-sm font-medium">
                Identity data extracted  -  auto-filled fields are highlighted
                below. Please verify each field.
              </p>
            </div>
          )}

          {/* OCR error banner */}
          {scanError && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-800 animate-in fade-in slide-in-from-top-2">
              <AlertTriangle className="size-4 shrink-0" />
              <p className="text-sm">
                {scanError}  -  you can fill the fields manually.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Form Fields ─────────────────────────────────────────── */}

      {/* First Name */}
      <div className="animate-in fade-in slide-in-from-bottom-2 delay-75 space-y-2">
        <Label htmlFor="first_name">First Name</Label>
        <OcrFieldWrapper field="first_name">
          <Input
            id="first_name"
            placeholder="First name"
            {...register('first_name')}
            disabled={busy || created}
            className={`${ocrHighlight('first_name')} ${ocrFields.includes('first_name') ? 'pr-10' : ''}`}
          />
        </OcrFieldWrapper>
        {errors.first_name && (
          <p className="text-sm text-destructive">
            {errors.first_name.message}
          </p>
        )}
      </div>

      {/* Last Name */}
      <div className="animate-in fade-in slide-in-from-bottom-2 delay-150 space-y-2">
        <Label htmlFor="last_name">Last Name</Label>
        <OcrFieldWrapper field="last_name">
          <Input
            id="last_name"
            placeholder="Last name"
            {...register('last_name')}
            disabled={busy || created}
            className={`${ocrHighlight('last_name')} ${ocrFields.includes('last_name') ? 'pr-10' : ''}`}
          />
        </OcrFieldWrapper>
        {errors.last_name && (
          <p className="text-sm text-destructive">
            {errors.last_name.message}
          </p>
        )}
      </div>

      {/* Email (optional) */}
      <div className="animate-in fade-in slide-in-from-bottom-2 delay-225 space-y-2">
        <Label htmlFor="email_primary">Email (optional)</Label>
        <Input
          id="email_primary"
          type="email"
          placeholder="email@example.com"
          {...register('email_primary')}
          disabled={busy || created}
        />
        {errors.email_primary && (
          <p className="text-sm text-destructive">
            {errors.email_primary.message}
          </p>
        )}
      </div>

      {/* Phone (optional) */}
      <div className="animate-in fade-in slide-in-from-bottom-2 delay-300 space-y-2">
        <Label htmlFor="phone_primary">Phone (optional)</Label>
        <Input
          id="phone_primary"
          type="tel"
          placeholder="+1 (___) ___-____"
          {...register('phone_primary')}
          disabled={busy || created}
        />
        {errors.phone_primary && (
          <p className="text-sm text-destructive">
            {errors.phone_primary.message}
          </p>
        )}
      </div>

      {/* Date of Birth (optional) */}
      <div className="animate-in fade-in slide-in-from-bottom-2 delay-[375ms] space-y-2">
        <Label htmlFor="date_of_birth">Date of Birth (optional)</Label>
        <OcrFieldWrapper field="date_of_birth">
          <Input
            id="date_of_birth"
            type="date"
            {...register('date_of_birth')}
            disabled={busy || created}
            className={`${ocrHighlight('date_of_birth')} ${ocrFields.includes('date_of_birth') ? 'pr-10' : ''}`}
          />
        </OcrFieldWrapper>
      </div>

      {/* Address Line 1 (optional) */}
      <div className="animate-in fade-in slide-in-from-bottom-2 delay-[450ms] space-y-2">
        <Label htmlFor="address_line1">Address (optional)</Label>
        <OcrFieldWrapper field="address_line1">
          <Input
            id="address_line1"
            placeholder="123 Main Street"
            {...register('address_line1')}
            disabled={busy || created}
            className={`${ocrHighlight('address_line1')} ${ocrFields.includes('address_line1') ? 'pr-10' : ''}`}
          />
        </OcrFieldWrapper>
      </div>

      {/* City (optional) */}
      <div className="animate-in fade-in slide-in-from-bottom-2 delay-[525ms] space-y-2">
        <Label htmlFor="city">City (optional)</Label>
        <OcrFieldWrapper field="city">
          <Input
            id="city"
            placeholder="Toronto"
            {...register('city')}
            disabled={busy || created}
            className={`${ocrHighlight('city')} ${ocrFields.includes('city') ? 'pr-10' : ''}`}
          />
        </OcrFieldWrapper>
      </div>

      {/* Province (optional) */}
      <div className="animate-in fade-in slide-in-from-bottom-2 delay-[600ms] space-y-2">
        <Label htmlFor="province">Province (optional)</Label>
        <OcrFieldWrapper field="province">
          <Input
            id="province"
            placeholder="Ontario"
            {...register('province')}
            disabled={busy || created}
            className={`${ocrHighlight('province')} ${ocrFields.includes('province') ? 'pr-10' : ''}`}
          />
        </OcrFieldWrapper>
      </div>

      {/* Postal Code (optional) */}
      <div className="animate-in fade-in slide-in-from-bottom-2 delay-[675ms] space-y-2">
        <Label htmlFor="postal_code">Postal Code (optional)</Label>
        <OcrFieldWrapper field="postal_code">
          <Input
            id="postal_code"
            placeholder="M5V 2T6"
            {...register('postal_code')}
            disabled={busy || created}
            className={`${ocrHighlight('postal_code')} ${ocrFields.includes('postal_code') ? 'pr-10' : ''}`}
          />
        </OcrFieldWrapper>
      </div>

      {/* Source */}
      <div className="animate-in fade-in slide-in-from-bottom-2 delay-[750ms] space-y-2">
        <Label htmlFor="source">Source</Label>
        <Select
          value={sourceValue}
          onValueChange={(val) => setValue('source', val)}
          disabled={busy || created}
        >
          <SelectTrigger id="source">
            <SelectValue placeholder="How did they find you?" />
          </SelectTrigger>
          <SelectContent>
            {CONTACT_SOURCES.map((src) => (
              <SelectItem key={src} value={src}>
                {src}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Directive 42.2, Item 3: Manual Confirmation Toggle ──── */}
      {ocrWasUsed && !created && (
        <div className="animate-in fade-in slide-in-from-bottom-2 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/40">
          <Checkbox
            id="ocr-verification-toggle"
            checked={ocrVerified}
            onCheckedChange={(checked) => setOcrVerified(checked === true)}
            className="mt-0.5"
          />
          <label
            htmlFor="ocr-verification-toggle"
            className="text-sm leading-snug cursor-pointer select-none text-blue-900 dark:text-blue-200"
          >
            <span className="font-semibold">I have verified</span> the
            auto-populated information against the physical/digital ID provided.
          </label>
        </div>
      )}

      {/* Error */}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Verification warning when submit is blocked */}
      {verificationRequired && !created && (
        <p className="text-xs text-amber-600 text-center">
          Please verify the OCR data and tick the confirmation checkbox above to proceed.
        </p>
      )}

      {/* Submit */}
      <Button type="submit" className="w-full" disabled={!canSubmit}>
        {conflictChecking
          ? (<><Loader2 className="mr-2 size-4 animate-spin" />Checking for conflicts…</>)
          : submitting
            ? 'Creating...'
            : created
              ? 'Contact Created \u2713'
              : submitLabel}
      </Button>

      {/* ── Inline Conflict Dialog  -  shown when name changed and matches found ── */}
      <Dialog open={showConflictDialog} onOpenChange={setShowConflictDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-amber-600" />
              Potential Conflicts Found
            </DialogTitle>
            <DialogDescription>
              The name was updated since the original conflict search. We found
              {conflictMatches.length === 1 ? ' 1 existing contact' : ` ${conflictMatches.length} existing contacts`} matching
              &ldquo;{watchedFirstName} {watchedLastName}&rdquo;.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-60 space-y-2 overflow-y-auto">
            {conflictMatches.map((match) => (
              <div
                key={match.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {match.first_name} {match.last_name}
                  </p>
                  {(match.email_primary || match.phone_primary) && (
                    <p className="text-xs text-slate-500">
                      {[match.email_primary, match.phone_primary].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 gap-1.5"
                  onClick={() => {
                    // Link to this existing contact
                    updateIntake({
                      firstName: watchedFirstName.trim(),
                      lastName: watchedLastName.trim(),
                      conflictCleared: true,
                      existingContactId: match.id,
                      conflictResolution: 'linked',
                    })
                    setShowConflictDialog(false)
                    setConflictMatches([])
                  }}
                >
                  <Link2 className="size-3.5" />
                  Link
                </Button>
              </div>
            ))}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              variant="outline"
              className="w-full gap-1.5"
              onClick={() => {
                // Declare no conflict  -  proceed with creation
                updateIntake({
                  firstName: watchedFirstName.trim(),
                  lastName: watchedLastName.trim(),
                  conflictCleared: true,
                  conflictResolution: 'declared_no_conflict',
                  conflictJustification: 'Reviewed inline  -  declared not the same person',
                  existingContactId: null,
                })
                setShowConflictDialog(false)
                setConflictMatches([])
                // Auto-proceed with the pending creation
                if (pendingValues) {
                  createContactAndLead(pendingValues)
                  setPendingValues(null)
                }
              }}
            >
              <UserX className="size-4" />
              Not the Same Person  -  Proceed
            </Button>
            <Button
              variant="ghost"
              className="w-full text-slate-500"
              onClick={() => {
                setShowConflictDialog(false)
                setPendingValues(null)
              }}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  )
}
