'use client'

/**
 * SovereignContactModal  -  Directive 076 (Rebuilt)
 *
 * Two-step Sovereign contact creation:
 *   Step 1: Conflict Search (LSO/CICC regulatory gate)
 *   Step 2: Contact Details (identity, digital, location, source)
 *
 * Matches the Sovereign glass/emerald styling of SovereignInitiationModal.
 * Required fields: First Name, Last Name, Address, Country, Province/State
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod/v4'
import { zodResolver } from '@hookform/resolvers/zod'
import { motion, AnimatePresence } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { contactKeys, useCreateContact } from '@/lib/queries/contacts'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useLeadSources } from '@/lib/queries/leads'
import { NorvaGuardianTooltip } from '@/components/ui/norva-guardian-tooltip'
import { resolveDefaultPipelineAndStage } from '@/lib/services/pipeline-resolver'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  X,
  Loader2,
  AlertTriangle,
  User,
  Building2,
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Search,
  Check,
  ChevronRight,
  ChevronLeft,
  Link2,
  Users,
  Plus,
  ChevronDown,
  MapPin,
  Mail,
  Phone,
  CalendarDays,
} from 'lucide-react'

// ── Schema ────────────────────────────────────────────────────────────────────

const contactSchema = z.object({
  contact_type: z.enum(['individual', 'organization']),
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  organization_name: z.string().optional().or(z.literal('')),
  email_primary: z.string().email('Invalid email').optional().or(z.literal('')),
  phone_primary: z.string().max(30).optional().or(z.literal('')),
  date_of_birth: z.string().optional().or(z.literal('')),
  address_line1: z.string().min(1, 'Address is required'),
  city: z.string().optional().or(z.literal('')),
  country: z.string().min(1, 'Country is required for compliance'),
  province_state: z.string().min(1, 'Jurisdiction required for compliance'),
  postal_code: z.string().optional().or(z.literal('')),
  source: z.string().optional(),
})

type ContactFormValues = z.infer<typeof contactSchema>

// ── Canadian Provinces ────────────────────────────────────────────────────────

const CANADIAN_PROVINCES = [
  { code: 'AB', name: 'Alberta' },
  { code: 'BC', name: 'British Columbia' },
  { code: 'MB', name: 'Manitoba' },
  { code: 'NB', name: 'New Brunswick' },
  { code: 'NL', name: 'Newfoundland and Labrador' },
  { code: 'NS', name: 'Nova Scotia' },
  { code: 'NT', name: 'Northwest Territories' },
  { code: 'NU', name: 'Nunavut' },
  { code: 'ON', name: 'Ontario' },
  { code: 'PE', name: 'Prince Edward Island' },
  { code: 'QC', name: 'Quebec' },
  { code: 'SK', name: 'Saskatchewan' },
  { code: 'YT', name: 'Yukon' },
]

// ── Conflict Resolution Reasons (LSO/CICC Standard) ──────────────────────────

const CONFLICT_REASONS = [
  'Confirmed different Date of Birth (DOB).',
  'Confirmed different residential address.',
  'Middle name/Initial mismatch.',
  'Existing contact is a different individual with a common name.',
  'Visual verification from Government ID confirms no relation.',
] as const

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 1 | 2
type ScanState = 'idle' | 'loading' | 'clear' | 'conflict' | 'resolved'

interface NameMatch {
  id: string
  first_name: string
  last_name: string
  email_primary: string | null
}

// ── Animation variants ────────────────────────────────────────────────────────

const slideVariants = {
  enterRight: { x: 80, opacity: 0 },
  enterLeft: { x: -80, opacity: 0 },
  center: { x: 0, opacity: 1 },
  exitLeft: { x: -80, opacity: 0 },
  exitRight: { x: 80, opacity: 0 },
}

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
}

const modalVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0 },
}

// ── Step Indicator (Sovereign) ────────────────────────────────────────────────

function StepIndicator({ currentStep }: { currentStep: Step }) {
  const steps = [1, 2] as const
  const labels = ['Conflict Search', 'Contact Details']
  const icons = [Shield, User]

  return (
    <div className="flex items-center justify-center gap-3 pb-6">
      {steps.map((s, i) => {
        const Icon = s < currentStep ? Check : icons[i]
        return (
          <div key={s} className="flex items-center gap-3">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-all duration-300',
                  s < currentStep && 'border-emerald-500 bg-emerald-500 text-white',
                  s === currentStep && 'border-emerald-500 bg-emerald-500/20 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.4)]',
                  s > currentStep && 'border-gray-300 text-gray-400 dark:border-white/20 dark:text-white/30',
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <span
                className={cn(
                  'text-[10px] font-medium tracking-wide uppercase transition-colors',
                  s <= currentStep ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-white/30',
                )}
              >
                {labels[i]}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  'mb-5 h-px w-16 transition-colors',
                  s < currentStep ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-white/10',
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ContactCreationResult {
  contactId: string
  contactName: string
  email: string | null
  leadCreated: boolean
}

export interface SovereignContactModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  matterId?: string | null
  onSuccess?: (contactId: string, result?: ContactCreationResult) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SovereignContactModal({
  open,
  onOpenChange,
  matterId,
  onSuccess,
}: SovereignContactModalProps) {
  const { tenant } = useTenant()
  const { appUser } = useUser()
  const createContact = useCreateContact()
  const queryClient = useQueryClient()
  const { data: leadSources } = useLeadSources(tenant?.id ?? '')
  const firstInputRef = useRef<HTMLInputElement>(null)

  // ── Step state ──
  const [step, setStep] = useState<Step>(1)
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward')
  const [saving, setSaving] = useState(false)

  // ── Step 1: Conflict search state ──
  const [conflictFirstName, setConflictFirstName] = useState('')
  const [conflictLastName, setConflictLastName] = useState('')
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [matches, setMatches] = useState<NameMatch[]>([])
  const [scanError, setScanError] = useState<string | null>(null)
  const [conflictCleared, setConflictCleared] = useState(false)
  const [conflictResolution, setConflictResolution] = useState<'none' | 'linked' | 'declared_no_conflict'>('none')
  const [existingContactId, setExistingContactId] = useState<string | null>(null)

  // Resolution UI
  const [justifyingMatchId, setJustifyingMatchId] = useState<string | null>(null)
  const [selectedReasons, setSelectedReasons] = useState<string[]>([])
  const [showAdditionalNotes, setShowAdditionalNotes] = useState(false)
  const [additionalNotes, setAdditionalNotes] = useState('')
  const [resolutionLoading, setResolutionLoading] = useState(false)
  const [resolvedMatch, setResolvedMatch] = useState<NameMatch | null>(null)

  const justificationSatisfied = selectedReasons.length > 0
  const fullJustification = [
    ...selectedReasons,
    ...(additionalNotes.trim() ? [`Additional: ${additionalNotes.trim()}`] : []),
  ].join(' | ')

  // ── Form (Step 2) ──
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      contact_type: 'individual',
      first_name: '',
      last_name: '',
      organization_name: '',
      email_primary: '',
      phone_primary: '',
      date_of_birth: '',
      address_line1: '',
      city: '',
      country: 'CA',
      province_state: '',
      postal_code: '',
      source: '',
    },
  })

  const contactType = watch('contact_type')
  const country = watch('country')

  // ── Reset on open/close ──
  useEffect(() => {
    if (open) {
      setStep(1)
      setDirection('forward')
      setSaving(false)
      setConflictFirstName('')
      setConflictLastName('')
      setScanState('idle')
      setMatches([])
      setScanError(null)
      setConflictCleared(false)
      setConflictResolution('none')
      setExistingContactId(null)
      setJustifyingMatchId(null)
      setSelectedReasons([])
      setShowAdditionalNotes(false)
      setAdditionalNotes('')
      setResolutionLoading(false)
      setResolvedMatch(null)
      reset()
    }
  }, [open, reset])

  // Focus first input when step changes
  useEffect(() => {
    if (open && step === 1) {
      setTimeout(() => firstInputRef.current?.focus(), 200)
    }
  }, [open, step])

  // Escape key
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onOpenChange(false)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, onOpenChange])

  // ── Navigation ──
  const goForward = useCallback(() => {
    setDirection('forward')
    setStep(2)
    // Pre-fill names from conflict search
    setValue('first_name', conflictFirstName.trim())
    setValue('last_name', conflictLastName.trim())
  }, [conflictFirstName, conflictLastName, setValue])

  const goBack = useCallback(() => {
    setDirection('backward')
    setStep(1)
  }, [])

  // ── Conflict Search ──
  const canSearch = conflictFirstName.trim().length > 0 && conflictLastName.trim().length > 0

  const runConflictScan = useCallback(async () => {
    if (!conflictFirstName.trim() || !conflictLastName.trim() || !tenant?.id) return

    setScanError(null)
    setScanState('loading')
    setMatches([])
    setJustifyingMatchId(null)
    setSelectedReasons([])
    setShowAdditionalNotes(false)
    setAdditionalNotes('')
    setResolvedMatch(null)

    try {
      const supabase = createClient()
      const safeFirst = conflictFirstName.trim().replace(/[%_(),.]/g, '')
      const safeLast = conflictLastName.trim().replace(/[%_(),.]/g, '')

      if (!safeFirst && !safeLast) {
        setScanState('clear')
        setConflictCleared(true)
        setConflictResolution('none')
        return
      }

      const { data: nameMatches, error: queryError } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email_primary')
        .eq('tenant_id', tenant.id)
        .or(`first_name.ilike.%${safeFirst}%,last_name.ilike.%${safeLast}%`)
        .limit(10)

      if (queryError) throw queryError

      if (!nameMatches || nameMatches.length === 0) {
        setScanState('clear')
        setMatches([])
        setConflictCleared(true)
        setConflictResolution('none')
        setExistingContactId(null)
      } else {
        setScanState('conflict')
        setMatches(nameMatches as NameMatch[])
        setConflictCleared(false)
        setConflictResolution('none')
        setExistingContactId(null)
      }
    } catch (err) {
      console.error('[SovereignContactModal] conflict scan failed', err)
      setScanState('clear')
      setConflictCleared(true)
      setConflictResolution('none')
    }
  }, [conflictFirstName, conflictLastName, tenant?.id])

  // Reset scan when names change
  const handleNameChange = useCallback((field: 'first' | 'last', value: string) => {
    if (field === 'first') setConflictFirstName(value)
    else setConflictLastName(value)

    if (scanState !== 'idle' && scanState !== 'loading') {
      setScanState('idle')
      setResolvedMatch(null)
      setJustifyingMatchId(null)
      setSelectedReasons([])
      setAdditionalNotes('')
      setShowAdditionalNotes(false)
      setConflictCleared(false)
      setConflictResolution('none')
      setExistingContactId(null)
    }
  }, [scanState])

  // ── Link to Existing ──
  const handleLinkToExisting = useCallback(async (match: NameMatch) => {
    if (!tenant?.id || !appUser?.id) return
    setResolutionLoading(true)
    setScanError(null)

    try {
      const supabase = createClient()
      await supabase.from('audit_logs').insert({
        tenant_id: tenant.id,
        user_id: appUser.id,
        entity_type: 'conflict_resolution',
        action: 'link_to_existing',
        changes: { matched_contact_id: match.id },
        metadata: {
          first_name: conflictFirstName.trim(),
          last_name: conflictLastName.trim(),
          source: 'sovereign_contact_modal',
        },
      })

      setResolvedMatch(match)
      setScanState('resolved')
      setConflictCleared(true)
      setExistingContactId(match.id)
      setConflictResolution('linked')

      toast.success(`Linked to existing contact: ${match.first_name} ${match.last_name}`)
      // Close modal since we linked to existing
      onSuccess?.(match.id)
      onOpenChange(false)
    } catch (err) {
      console.error('[SovereignContactModal] link failed', err)
      setScanError('Failed to log conflict resolution. Please try again.')
    } finally {
      setResolutionLoading(false)
    }
  }, [tenant?.id, appUser?.id, conflictFirstName, conflictLastName, onSuccess, onOpenChange])

  // ── Declare No Conflict ──
  const handleDeclareNoConflict = useCallback(async (match: NameMatch) => {
    if (!tenant?.id || !appUser?.id || !justificationSatisfied) return
    setResolutionLoading(true)
    setScanError(null)

    try {
      const supabase = createClient()
      await supabase.from('audit_logs').insert({
        tenant_id: tenant.id,
        user_id: appUser.id,
        entity_type: 'conflict_resolution',
        action: 'declare_no_conflict',
        changes: {
          matched_contact_id: match.id,
          justification: fullJustification,
          selected_reasons: selectedReasons,
          additional_notes: additionalNotes.trim() || null,
        },
        metadata: {
          first_name: conflictFirstName.trim(),
          last_name: conflictLastName.trim(),
          source: 'sovereign_contact_modal',
        },
      })

      setResolvedMatch(match)
      setScanState('resolved')
      setJustifyingMatchId(null)
      setConflictCleared(true)
      setExistingContactId(null)
      setConflictResolution('declared_no_conflict')
    } catch (err) {
      console.error('[SovereignContactModal] declare-no-conflict failed', err)
      setScanError('Failed to log conflict resolution. Please try again.')
    } finally {
      setResolutionLoading(false)
    }
  }, [tenant?.id, appUser?.id, justificationSatisfied, fullJustification, selectedReasons, additionalNotes, conflictFirstName, conflictLastName])

  // ── Submit (Step 2) ──
  const onSubmit = useCallback(async (values: ContactFormValues) => {
    if (!tenant || !appUser) return
    setSaving(true)

    try {
      const result = await createContact.mutateAsync({
        tenant_id: tenant.id,
        contact_type: values.contact_type,
        first_name: values.contact_type === 'individual' ? values.first_name : null,
        last_name: values.contact_type === 'individual' ? values.last_name : null,
        organization_name: values.contact_type === 'organization' ? values.organization_name || null : null,
        email_primary: values.email_primary || null,
        phone_primary: values.phone_primary || null,
        date_of_birth: values.date_of_birth || null,
        address_line1: values.address_line1 || null,
        city: values.city || null,
        country: values.country || null,
        province_state: values.province_state || null,
        postal_code: values.postal_code || null,
        source: values.source || null,
        created_by: appUser.id,
      })

      // Auto-link to matter if matterId provided
      if (matterId && result.id) {
        const supabase = createClient()
        await supabase.from('matter_contacts').insert({
          matter_id: matterId,
          contact_id: result.id,
          tenant_id: tenant.id,
          role: 'client',
          is_primary: false,
        })
        queryClient.invalidateQueries({ queryKey: ['matter-contacts', matterId] })
      }

      // Auto-create lead in default Lead Intake Pipeline (unless matter-linked)
      let leadCreated = false
      if (!matterId && result.id) {
        try {
          const supabase = createClient()
          const { pipelineId, stageId } = await resolveDefaultPipelineAndStage(supabase, tenant.id)

          const { data: newLead } = await supabase
            .from('leads')
            .insert({
              tenant_id: tenant.id,
              contact_id: result.id,
              pipeline_id: pipelineId,
              stage_id: stageId,
              stage_entered_at: new Date().toISOString(),
              assigned_to: appUser.id,
              source: values.source || 'Direct Entry',
              source_detail: 'Sovereign Contact Modal',
              status: 'open',
              temperature: 'warm',
            })
            .select('id')
            .single()

          if (newLead) {
            leadCreated = true
            queryClient.invalidateQueries({ queryKey: ['leads'] })
            toast.success('Lead created in intake pipeline')
          }
        } catch (leadErr) {
          // Non-blocking  -  contact is already created, lead creation is best-effort
          console.error('[SovereignContactModal] Auto-lead creation failed:', leadErr)
        }
      }

      // Build contact name for the post-creation hub
      const contactName = values.contact_type === 'individual'
        ? `${values.first_name} ${values.last_name}`.trim()
        : values.organization_name || 'Unknown'

      // Fire onSuccess — the layout handler will close the modal and open the PostContactHub.
      if (onSuccess) {
        onSuccess(result.id, {
          contactId: result.id,
          contactName,
          email: values.email_primary || null,
          leadCreated,
        })
      } else {
        // Fallback: close modal if no onSuccess handler provided
        onOpenChange(false)
      }
    } catch {
      // Error handled by mutation's onError
    } finally {
      setSaving(false)
    }
  }, [tenant, appUser, createContact, matterId, queryClient, onSuccess, onOpenChange])

  // ── Animation helpers ──
  const enterVariant = direction === 'forward' ? 'enterRight' : 'enterLeft'
  const exitVariant = direction === 'forward' ? 'exitLeft' : 'exitRight'

  // ── Readiness ──
  const canProceedStep1 = conflictCleared
  const canInitiate = conflictCleared && !saving

  // ── Portal content ──
  const content = (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[9995] flex items-center justify-center"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={{ duration: 0.25 }}
          aria-modal="true"
          role="dialog"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 dark:bg-black/70 backdrop-blur-2xl"
            onClick={() => onOpenChange(false)}
          />

          {/* Modal */}
          <motion.div
            className="relative z-10 mx-auto flex w-[calc(100%-2rem)] max-w-2xl flex-col rounded-3xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-zinc-950/95 shadow-2xl backdrop-blur-xl max-h-[90vh]"
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-white/[0.06] px-8 pt-7 pb-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white">
                    New Contact
                  </h2>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-white/40">
                    Sovereign Identity Creation  -  step by step
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 dark:text-white/40 transition-colors hover:bg-gray-100 dark:hover:bg-white/[0.06] hover:text-gray-700 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Step indicator */}
            <div className="px-8 pt-6">
              <StepIndicator currentStep={step} />
            </div>

            {/* Step content */}
            <div className="relative min-h-[340px] overflow-y-auto overflow-x-hidden px-8 pb-6 flex-1">
              <AnimatePresence mode="wait" custom={direction}>
                {/* ════════════════════════════════════════════════════════════ */}
                {/* STEP 1: Conflict Search                                     */}
                {/* ════════════════════════════════════════════════════════════ */}
                {step === 1 && (
                  <motion.div
                    key="step-1"
                    variants={slideVariants}
                    initial={enterVariant}
                    animate="center"
                    exit={exitVariant}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="flex flex-col gap-5"
                  >
                    {/* Regulatory banner */}
                    <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-950/30 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                      <span>
                        <strong>Regulatory Requirement:</strong> A conflict search must be completed before collecting personal data.
                        <NorvaGuardianTooltip fieldKey="conflictSearch" />
                      </span>
                    </div>

                    {/* Name inputs */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-xs font-medium uppercase tracking-widest text-gray-500 dark:text-white/50">
                          First Name
                        </label>
                        <div className="relative">
                          <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-400/60" />
                          <input
                            ref={firstInputRef}
                            type="text"
                            value={conflictFirstName}
                            onChange={(e) => handleNameChange('first', e.target.value)}
                            placeholder="Enter first name"
                            disabled={scanState === 'loading'}
                            className="w-full rounded-xl border border-emerald-500/30 bg-gray-50 dark:bg-white/[0.04] py-3 pl-10 pr-4 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 outline-none transition-shadow focus:border-emerald-500/60 focus:shadow-[0_0_20px_rgba(16,185,129,0.15)] focus:ring-0"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium uppercase tracking-widest text-gray-500 dark:text-white/50">
                          Last Name
                        </label>
                        <div className="relative">
                          <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-400/60" />
                          <input
                            type="text"
                            value={conflictLastName}
                            onChange={(e) => handleNameChange('last', e.target.value)}
                            placeholder="Enter last name"
                            disabled={scanState === 'loading'}
                            className="w-full rounded-xl border border-emerald-500/30 bg-gray-50 dark:bg-white/[0.04] py-3 pl-10 pr-4 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 outline-none transition-shadow focus:border-emerald-500/60 focus:shadow-[0_0_20px_rgba(16,185,129,0.15)] focus:ring-0"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Search button */}
                    <Button
                      onClick={runConflictScan}
                      disabled={!canSearch || scanState === 'loading'}
                      className="w-full gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white py-3 h-auto font-medium"
                    >
                      {scanState === 'loading' ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Scanning for Conflicts...
                        </>
                      ) : (
                        <>
                          <Search className="h-4 w-4" />
                          Search for Conflicts
                        </>
                      )}
                    </Button>

                    {/* Error */}
                    {scanError && (
                      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 rounded-xl border border-red-500/20 bg-red-950/30 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
                        {scanError}
                      </div>
                    )}

                    {/* Clear result */}
                    {scanState === 'clear' && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col items-center gap-3 rounded-xl border border-green-200 bg-emerald-950/30 p-6 text-center dark:border-green-800 dark:bg-green-950/40"
                      >
                        <ShieldCheck className="h-10 w-10 text-green-600 dark:text-green-400" />
                        <p className="text-sm font-medium text-green-800 dark:text-green-200">
                          No conflicts found for{' '}
                          <strong>{conflictFirstName.trim()} {conflictLastName.trim()}</strong>
                        </p>
                        <Badge variant="outline" className="border-green-300 text-emerald-400 dark:border-green-700 dark:text-green-300">
                          Cleared
                        </Badge>
                      </motion.div>
                    )}

                    {/* Resolved result */}
                    {scanState === 'resolved' && resolvedMatch && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col items-center gap-3 rounded-xl border border-green-200 bg-emerald-950/30 p-6 text-center dark:border-green-800 dark:bg-green-950/40"
                      >
                        <ShieldCheck className="h-10 w-10 text-green-600 dark:text-green-400" />
                        <p className="text-sm font-medium text-green-800 dark:text-green-200">
                          Conflict Resolved
                        </p>
                        <p className="text-xs text-emerald-400 dark:text-green-300">
                          {conflictResolution === 'linked' ? (
                            <>Linked to existing contact: <strong>{resolvedMatch.first_name} {resolvedMatch.last_name}</strong></>
                          ) : (
                            <>Declared no conflict with <strong>{resolvedMatch.first_name} {resolvedMatch.last_name}</strong></>
                          )}
                        </p>
                        <Badge variant="outline" className="border-green-300 text-emerald-400 dark:border-green-700 dark:text-green-300">
                          {conflictResolution === 'linked' ? 'Linked to Existing' : 'No Conflict Declared'}
                        </Badge>
                      </motion.div>
                    )}

                    {/* Conflict matches */}
                    {scanState === 'conflict' && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-4"
                      >
                        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-950/30 p-4 dark:border-amber-800 dark:bg-amber-950/40">
                          <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-amber-600 dark:text-amber-400" />
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                              Potential conflicts detected
                            </p>
                            <p className="text-xs text-amber-400 dark:text-amber-300">
                              Resolve each match before proceeding.
                            </p>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {matches.map((match) => (
                            <div key={match.id} className="rounded-xl border border-gray-200 dark:border-white/[0.08] p-4 text-sm space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                                    {(match.first_name?.[0] ?? '').toUpperCase()}
                                    {(match.last_name?.[0] ?? '').toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="font-medium text-gray-900 dark:text-white">
                                      {match.first_name} {match.last_name}
                                    </p>
                                    {match.email_primary && (
                                      <p className="text-xs text-gray-500 dark:text-white/40">{match.email_primary}</p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                                    onClick={() => handleLinkToExisting(match)}
                                    disabled={resolutionLoading}
                                  >
                                    {resolutionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                                    Link
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-1.5 rounded-lg"
                                    onClick={() => {
                                      setJustifyingMatchId(justifyingMatchId === match.id ? null : match.id)
                                      setSelectedReasons([])
                                      setAdditionalNotes('')
                                      setShowAdditionalNotes(false)
                                    }}
                                    disabled={resolutionLoading}
                                  >
                                    <ShieldX className="h-3.5 w-3.5" />
                                    Not Same Person
                                  </Button>
                                </div>
                              </div>

                              {/* Resolution reasons */}
                              {justifyingMatchId === match.id && (
                                <div className="animate-in fade-in slide-in-from-top-2 duration-200 space-y-3 border-t border-gray-200 dark:border-white/[0.06] pt-3">
                                  <label className="text-xs font-medium text-gray-500 dark:text-white/50">
                                    Select reason(s) this is not the same person:
                                  </label>
                                  <div className="space-y-2">
                                    {CONFLICT_REASONS.map((reason) => (
                                      <label key={reason} className="flex items-start gap-2 cursor-pointer group">
                                        <Checkbox
                                          checked={selectedReasons.includes(reason)}
                                          onCheckedChange={(checked) => {
                                            setSelectedReasons((prev) =>
                                              checked ? [...prev, reason] : prev.filter((r) => r !== reason)
                                            )
                                          }}
                                          className="mt-0.5"
                                        />
                                        <span className="text-sm text-gray-700 dark:text-white/70 group-hover:text-gray-900 dark:group-hover:text-white leading-tight">
                                          {reason}
                                        </span>
                                      </label>
                                    ))}
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="gap-1.5 text-xs text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white px-0"
                                    onClick={() => setShowAdditionalNotes(!showAdditionalNotes)}
                                  >
                                    {showAdditionalNotes ? <ChevronDown className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                                    {showAdditionalNotes ? 'Hide details' : 'Add specific details / Other reason'}
                                  </Button>
                                  {showAdditionalNotes && (
                                    <Textarea
                                      placeholder="Optional: provide additional context..."
                                      value={additionalNotes}
                                      onChange={(e) => setAdditionalNotes(e.target.value)}
                                      rows={2}
                                      className="text-sm rounded-lg"
                                    />
                                  )}
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-500 dark:text-white/40">
                                      {selectedReasons.length === 0
                                        ? 'Select at least one reason'
                                        : `${selectedReasons.length} reason${selectedReasons.length > 1 ? 's' : ''} selected`}
                                    </span>
                                    <Button
                                      size="sm"
                                      disabled={!justificationSatisfied || resolutionLoading}
                                      onClick={() => handleDeclareNoConflict(match)}
                                      className={cn(
                                        'gap-1.5 rounded-lg transition-colors',
                                        justificationSatisfied && 'bg-violet-600 hover:bg-violet-700 text-white',
                                      )}
                                    >
                                      {resolutionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                                      Confirm No Conflict
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        <Badge variant="outline" className="border-amber-300 text-amber-400 dark:border-amber-700 dark:text-amber-300">
                          Resolution Required
                        </Badge>
                      </motion.div>
                    )}
                  </motion.div>
                )}

                {/* ════════════════════════════════════════════════════════════ */}
                {/* STEP 2: Contact Details                                     */}
                {/* ════════════════════════════════════════════════════════════ */}
                {step === 2 && (
                  <motion.div
                    key="step-2"
                    variants={slideVariants}
                    initial={enterVariant}
                    animate="center"
                    exit={exitVariant}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <form
                      id="contact-form"
                      onSubmit={handleSubmit(onSubmit)}
                      className="flex flex-col gap-6"
                    >
                      {/* ── Section: Identity ──────────────────────────────── */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15">
                            <User className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <span className="text-xs font-semibold uppercase tracking-widest text-emerald-400 dark:text-emerald-400">Identity</span>
                          <NorvaGuardianTooltip fieldKey="contactName" />
                        </div>

                        {/* Contact Type Toggle */}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setValue('contact_type', 'individual')}
                            className={cn(
                              'flex items-center gap-2.5 rounded-xl border-2 px-5 py-3 text-sm font-medium transition-all',
                              contactType === 'individual'
                                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 dark:text-emerald-300 shadow-[0_0_16px_rgba(16,185,129,0.15)]'
                                : 'border-gray-200 dark:border-white/10 text-gray-500 dark:text-white/40 hover:border-emerald-500/40 hover:bg-emerald-500/5',
                            )}
                          >
                            <User className="h-4 w-4" />
                            Individual
                          </button>
                          <button
                            type="button"
                            onClick={() => setValue('contact_type', 'organization')}
                            className={cn(
                              'flex items-center gap-2.5 rounded-xl border-2 px-5 py-3 text-sm font-medium transition-all',
                              contactType === 'organization'
                                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 dark:text-emerald-300 shadow-[0_0_16px_rgba(16,185,129,0.15)]'
                                : 'border-gray-200 dark:border-white/10 text-gray-500 dark:text-white/40 hover:border-emerald-500/40 hover:bg-emerald-500/5',
                            )}
                          >
                            <Building2 className="h-4 w-4" />
                            Organisation
                          </button>
                        </div>

                        {/* Name Fields */}
                        {contactType === 'individual' ? (
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <label className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white/50">First Name *</label>
                              <div className="relative">
                                <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500/50" />
                                <input
                                  {...register('first_name')}
                                  placeholder="First name"
                                  disabled={saving}
                                  className={cn(
                                    'w-full rounded-xl border bg-gray-50 dark:bg-white/[0.04] pl-10 pr-4 py-3.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 outline-none transition-all focus:border-emerald-500/60 focus:shadow-[0_0_20px_rgba(16,185,129,0.15)] focus:ring-0',
                                    errors.first_name ? 'border-red-400' : 'border-emerald-500/30 dark:border-white/[0.1]',
                                  )}
                                />
                              </div>
                              {errors.first_name && (
                                <p className="text-xs text-red-500">{errors.first_name.message}</p>
                              )}
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white/50">Last Name *</label>
                              <div className="relative">
                                <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500/50" />
                                <input
                                  {...register('last_name')}
                                  placeholder="Last name"
                                  disabled={saving}
                                  className={cn(
                                    'w-full rounded-xl border bg-gray-50 dark:bg-white/[0.04] pl-10 pr-4 py-3.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 outline-none transition-all focus:border-emerald-500/60 focus:shadow-[0_0_20px_rgba(16,185,129,0.15)] focus:ring-0',
                                    errors.last_name ? 'border-red-400' : 'border-emerald-500/30 dark:border-white/[0.1]',
                                  )}
                                />
                              </div>
                              {errors.last_name && (
                                <p className="text-xs text-red-500">{errors.last_name.message}</p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white/50">Organisation Name *</label>
                            <div className="relative">
                              <Building2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500/50" />
                              <input
                                {...register('organization_name')}
                                placeholder="Organisation name"
                                disabled={saving}
                                className="w-full rounded-xl border border-emerald-500/30 dark:border-white/[0.1] bg-gray-50 dark:bg-white/[0.04] pl-10 pr-4 py-3.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 outline-none transition-all focus:border-emerald-500/60 focus:shadow-[0_0_20px_rgba(16,185,129,0.15)] focus:ring-0"
                              />
                            </div>
                          </div>
                        )}

                        {/* Date of Birth */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white/50">Date of Birth</label>
                          <div className="relative">
                            <CalendarDays className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500/50" />
                            <input
                              type="date"
                              {...register('date_of_birth')}
                              disabled={saving}
                              className="w-full rounded-xl border border-emerald-500/30 dark:border-white/[0.1] bg-gray-50 dark:bg-white/[0.04] pl-10 pr-4 py-3.5 text-sm text-gray-900 dark:text-white outline-none transition-all focus:border-emerald-500/60 focus:shadow-[0_0_20px_rgba(16,185,129,0.15)] focus:ring-0"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Divider */}
                      <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />

                      {/* ── Section: Digital ───────────────────────────────── */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15">
                            <Mail className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <span className="text-xs font-semibold uppercase tracking-widest text-emerald-400 dark:text-emerald-400">Digital</span>
                          <NorvaGuardianTooltip fieldKey="contactEmail" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white/50">Email</label>
                            <div className="relative">
                              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500/50" />
                              <input
                                type="email"
                                {...register('email_primary')}
                                placeholder="email@example.com"
                                disabled={saving}
                                className={cn(
                                  'w-full rounded-xl border bg-gray-50 dark:bg-white/[0.04] pl-10 pr-4 py-3.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 outline-none transition-all focus:border-emerald-500/60 focus:shadow-[0_0_20px_rgba(16,185,129,0.15)] focus:ring-0',
                                  errors.email_primary ? 'border-red-400' : 'border-emerald-500/30 dark:border-white/[0.1]',
                                )}
                              />
                            </div>
                            {errors.email_primary && (
                              <p className="text-xs text-red-500">{errors.email_primary.message}</p>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white/50">Phone</label>
                            <div className="relative">
                              <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500/50" />
                              <input
                                {...register('phone_primary')}
                                placeholder="+1 (416) 555-0100"
                                disabled={saving}
                                className="w-full rounded-xl border border-emerald-500/30 dark:border-white/[0.1] bg-gray-50 dark:bg-white/[0.04] pl-10 pr-4 py-3.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 outline-none transition-all focus:border-emerald-500/60 focus:shadow-[0_0_20px_rgba(16,185,129,0.15)] focus:ring-0"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Divider */}
                      <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />

                      {/* ── Section: Location ──────────────────────────────── */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15">
                            <MapPin className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <span className="text-xs font-semibold uppercase tracking-widest text-emerald-400 dark:text-emerald-400">Location</span>
                          <NorvaGuardianTooltip fieldKey="contactAddress" />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white/50">Address *</label>
                          <div className="relative">
                            <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500/50" />
                            <input
                              {...register('address_line1')}
                              placeholder="123 Main Street"
                              disabled={saving}
                              className={cn(
                                'w-full rounded-xl border bg-gray-50 dark:bg-white/[0.04] pl-10 pr-4 py-3.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 outline-none transition-all focus:border-emerald-500/60 focus:shadow-[0_0_20px_rgba(16,185,129,0.15)] focus:ring-0',
                                errors.address_line1 ? 'border-amber-400' : 'border-emerald-500/30 dark:border-white/[0.1]',
                              )}
                            />
                          </div>
                          {errors.address_line1 && (
                            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">{errors.address_line1.message}</p>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white/50">City</label>
                            <input
                              {...register('city')}
                              placeholder="Toronto"
                              disabled={saving}
                              className="w-full rounded-xl border border-emerald-500/30 dark:border-white/[0.1] bg-gray-50 dark:bg-white/[0.04] px-4 py-3.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 outline-none transition-all focus:border-emerald-500/60 focus:shadow-[0_0_20px_rgba(16,185,129,0.15)] focus:ring-0"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white/50">
                              {country === 'CA' ? 'Postal Code' : 'Postal / ZIP Code'}
                            </label>
                            <input
                              {...register('postal_code')}
                              placeholder={country === 'CA' ? 'M5V 2T6' : 'Postal / ZIP code'}
                              disabled={saving}
                              className="w-full rounded-xl border border-emerald-500/30 dark:border-white/[0.1] bg-gray-50 dark:bg-white/[0.04] px-4 py-3.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 outline-none transition-all focus:border-emerald-500/60 focus:shadow-[0_0_20px_rgba(16,185,129,0.15)] focus:ring-0"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          {/* Country */}
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white/50">Country *</label>
                            <Select
                              value={country || 'CA'}
                              onValueChange={(val) => {
                                setValue('country', val, { shouldValidate: true })
                                if (val !== 'CA') {
                                  setValue('province_state', '', { shouldValidate: true })
                                }
                              }}
                              disabled={saving}
                            >
                              <SelectTrigger className={cn(
                                'w-full rounded-xl border bg-gray-50 dark:bg-white/[0.04] h-auto py-3.5 px-4 text-sm transition-all focus:border-emerald-500/60 focus:shadow-[0_0_20px_rgba(16,185,129,0.15)]',
                                errors.country ? 'border-amber-400' : 'border-emerald-500/30 dark:border-white/[0.1]',
                              )}>
                                <SelectValue placeholder="Select country" />
                              </SelectTrigger>
                              <SelectContent className="z-[9996]">
                                <SelectItem value="CA">Canada</SelectItem>
                                <SelectItem value="US">United States</SelectItem>
                                <SelectItem value="GB">United Kingdom</SelectItem>
                                <SelectItem value="IN">India</SelectItem>
                                <SelectItem value="PK">Pakistan</SelectItem>
                                <SelectItem value="PH">Philippines</SelectItem>
                                <SelectItem value="CN">China</SelectItem>
                                <SelectItem value="NG">Nigeria</SelectItem>
                                <SelectItem value="IR">Iran</SelectItem>
                                <SelectItem value="MX">Mexico</SelectItem>
                                <SelectItem value="BR">Brazil</SelectItem>
                                <SelectItem value="FR">France</SelectItem>
                                <SelectItem value="DE">Germany</SelectItem>
                                <SelectItem value="AE">United Arab Emirates</SelectItem>
                                <SelectItem value="SA">Saudi Arabia</SelectItem>
                                <SelectItem value="OTHER">Other</SelectItem>
                              </SelectContent>
                            </Select>
                            {errors.country && (
                              <p className="text-xs font-medium text-amber-600 dark:text-amber-400">{errors.country.message}</p>
                            )}
                          </div>

                          {/* Province / State */}
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white/50 flex items-center">
                              {country === 'CA' ? 'Province' : 'Province / State'} *
                              <NorvaGuardianTooltip fieldKey="contactJurisdiction" />
                            </label>
                            {country === 'CA' ? (
                              <Select
                                value={watch('province_state') || ''}
                                onValueChange={(val) => setValue('province_state', val, { shouldValidate: true })}
                                disabled={saving}
                              >
                                <SelectTrigger className={cn(
                                  'w-full rounded-xl border bg-gray-50 dark:bg-white/[0.04] h-auto py-3.5 px-4 text-sm transition-all focus:border-emerald-500/60 focus:shadow-[0_0_20px_rgba(16,185,129,0.15)]',
                                  errors.province_state ? 'border-amber-400' : 'border-emerald-500/30 dark:border-white/[0.1]',
                                )}>
                                  <SelectValue placeholder="Select province" />
                                </SelectTrigger>
                                <SelectContent className="z-[9996]">
                                  {CANADIAN_PROVINCES.map((p) => (
                                    <SelectItem key={p.code} value={p.code}>
                                      {p.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <input
                                {...register('province_state')}
                                placeholder="Province or state"
                                disabled={saving}
                                className={cn(
                                  'w-full rounded-xl border bg-gray-50 dark:bg-white/[0.04] px-4 py-3.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 outline-none transition-all focus:border-emerald-500/60 focus:shadow-[0_0_20px_rgba(16,185,129,0.15)] focus:ring-0',
                                  errors.province_state ? 'border-amber-400' : 'border-emerald-500/30 dark:border-white/[0.1]',
                                )}
                              />
                            )}
                            {errors.province_state && (
                              <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                                <AlertTriangle className="inline h-3 w-3 mr-1 -mt-0.5" />
                                {errors.province_state.message}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Divider */}
                      <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />

                      {/* ── Section: Source ─────────────────────────────────── */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15">
                            <Users className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <span className="text-xs font-semibold uppercase tracking-widest text-emerald-400 dark:text-emerald-400">Source</span>
                          <NorvaGuardianTooltip fieldKey="contactSource" />
                        </div>
                        <Select
                          value={watch('source') || ''}
                          onValueChange={(val) => setValue('source', val)}
                          disabled={saving}
                        >
                          <SelectTrigger className="w-full rounded-xl border border-emerald-500/30 dark:border-white/[0.1] bg-gray-50 dark:bg-white/[0.04] h-auto py-3.5 px-4 text-sm transition-all focus:border-emerald-500/60 focus:shadow-[0_0_20px_rgba(16,185,129,0.15)]">
                            <SelectValue placeholder="How did they find you?" />
                          </SelectTrigger>
                          <SelectContent className="z-[9996]">
                            {(leadSources ?? []).map((src) => (
                              <SelectItem key={src.id} value={src.name}>
                                {src.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-gray-200 dark:border-white/[0.06] px-8 py-4">
              {step === 1 ? (
                <>
                  <div />
                  <Button
                    onClick={goForward}
                    disabled={!canProceedStep1}
                    className={cn(
                      'gap-2 rounded-xl px-6 py-2.5 h-auto font-medium transition-all',
                      canProceedStep1
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/30'
                        : '',
                    )}
                  >
                    Continue to Details
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={goBack}
                    disabled={saving}
                    className="gap-2 rounded-xl"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    type="submit"
                    form="contact-form"
                    disabled={saving}
                    className="gap-2 rounded-xl px-6 py-2.5 h-auto font-medium bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/30"
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    <ShieldCheck className="h-4 w-4" />
                    Save Contact
                  </Button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  if (typeof document === 'undefined') return null
  return createPortal(content, document.body)
}
