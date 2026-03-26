'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Search, ChevronRight, ChevronLeft, Scale, Briefcase, DollarSign, Clock, Users, Sparkles, Check, HelpCircle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { useUIStore } from '@/lib/stores/ui-store'
import { useCreateMatter } from '@/lib/queries/matters'
import { useMatterTypes } from '@/lib/queries/matter-types'
import { CANADIAN_TAX_RATES } from '@/lib/config/tax-rates'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/database'
import { cn } from '@/lib/utils'
import { NorvaGuardianTooltip } from '@/components/ui/norva-guardian-tooltip'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Contact = Database['public']['Tables']['contacts']['Row']
type PracticeArea = Database['public']['Tables']['practice_areas']['Row']

interface StaffMember {
  id: string
  first_name: string | null
  last_name: string | null
  email: string
  avatar_url: string | null
  role_id: string | null
  is_active: boolean
}

type BillingType = 'flat_fee' | 'hourly' | 'retainer'

type Step = 1 | 2 | 3

// ---------------------------------------------------------------------------
// Internal hooks
// ---------------------------------------------------------------------------

function useContactSearch(tenantId: string, searchTerm: string) {
  return useQuery({
    queryKey: ['contacts', 'search', tenantId, searchTerm],
    queryFn: async () => {
      if (!searchTerm || searchTerm.length < 2) return []
      const supabase = createClient()
      const term = `%${searchTerm}%`
      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email_primary, organization_name, phone_primary')
        .eq('tenant_id', tenantId)
        .or(`first_name.ilike.${term},last_name.ilike.${term},email_primary.ilike.${term},organization_name.ilike.${term}`)
        .eq('is_active', true)
        .limit(8)
      if (error) throw error
      return data as Contact[]
    },
    enabled: !!tenantId && searchTerm.length >= 2,
    staleTime: 1000 * 30,
  })
}

function usePracticeAreas(tenantId: string) {
  return useQuery({
    queryKey: ['practice_areas', tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('practice_areas')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_enabled', true)
        .order('name')
      if (error) throw error
      return data as PracticeArea[]
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 5,
  })
}

function useStaff(tenantId: string) {
  return useQuery({
    queryKey: ['staff', tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, avatar_url, role_id, is_active')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('first_name')
      if (error) throw error
      return data as StaffMember[]
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 5,
  })
}

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StepIndicator({ currentStep }: { currentStep: Step }) {
  const steps = [1, 2, 3] as const
  const labels = ['Norva Contact', 'Norva Details', 'Norva Team']

  return (
    <div className="flex items-center justify-center gap-3 pb-6">
      {steps.map((s, i) => (
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
              {s < currentStep ? <Check className="h-4 w-4" /> : s}
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
                'mb-5 h-px w-12 transition-colors',
                s < currentStep ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-white/10',
              )}
            />
          )}
        </div>
      ))}
    </div>
  )
}

function ReadinessRing({ percentage }: { percentage: number }) {
  const radius = 18
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percentage / 100) * circumference

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-12 w-12">
        <svg className="h-12 w-12 -rotate-90" viewBox="0 0 44 44">
          <circle cx="22" cy="22" r={radius} fill="none" className="stroke-gray-200 dark:stroke-white/[0.08]" strokeWidth="3" />
          <circle
            cx="22"
            cy="22"
            r={radius}
            fill="none"
            stroke="rgb(16,185,129)"
            strokeWidth="3"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
          {percentage}%
        </span>
      </div>
      <span className="text-xs font-medium tracking-wide text-gray-500 dark:text-white/60">Initiation Readiness</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Practice area icon mapping (fallback to Scale)
// ---------------------------------------------------------------------------

const PRACTICE_ICONS: Record<string, typeof Scale> = {
  immigration: Briefcase,
  'real estate': Scale,
  'family law': Users,
  corporate: Briefcase,
  litigation: Scale,
}

function getPracticeIcon(name: string) {
  const key = name.toLowerCase()
  for (const [match, Icon] of Object.entries(PRACTICE_ICONS)) {
    if (key.includes(match)) return Icon
  }
  return Scale
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface SovereignInitiationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultContactId?: string
  onSuccess?: (matterId: string) => void
}

export function SovereignInitiationModal({
  open,
  onOpenChange,
  defaultContactId,
  onSuccess,
}: SovereignInitiationModalProps) {
  const { tenant } = useTenant()
  const { appUser } = useUser()
  const activePracticeFilter = useUIStore((s) => s.activePracticeFilter)
  const createMatter = useCreateMatter()

  // ---- Step state ----
  const [step, setStep] = useState<Step>(1)
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward')

  // ---- Step 1: Identity Anchor ----
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedContactId, setSelectedContactId] = useState<string | null>(defaultContactId ?? null)
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [title, setTitle] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // ---- Step 2: Logic Gate ----
  const [practiceAreaId, setPracticeAreaId] = useState<string | null>(
    activePracticeFilter !== 'all' ? activePracticeFilter : null,
  )
  const [matterTypeId, setMatterTypeId] = useState<string | null>(null)
  const [billingType, setBillingType] = useState<BillingType>('hourly')
  const [feeAmount, setFeeAmount] = useState<string>('')

  // ---- Step 3: Command Assignment ----
  const [responsibleLawyerId, setResponsibleLawyerId] = useState<string | null>(appUser?.id ?? null)

  // ---- General ----
  const [isSubmitting, setIsSubmitting] = useState(false)

  const tenantId = tenant?.id ?? ''

  // ---- Data hooks ----
  const contactSearch = useContactSearch(tenantId, searchTerm)
  const practiceAreas = usePracticeAreas(tenantId)
  const matterTypes = useMatterTypes(tenantId, practiceAreaId)
  const staff = useStaff(tenantId)

  // ---- Reset on open ----
  useEffect(() => {
    if (open) {
      setStep(1)
      setDirection('forward')
      setSearchTerm('')
      setSelectedContactId(defaultContactId ?? null)
      setSelectedContact(null)
      setTitle('')
      setPracticeAreaId(activePracticeFilter !== 'all' ? activePracticeFilter : null)
      setMatterTypeId(null)
      setBillingType('hourly')
      setFeeAmount('')
      setResponsibleLawyerId(appUser?.id ?? null)
      setIsSubmitting(false)
    }
  }, [open, defaultContactId, activePracticeFilter, appUser?.id])

  // ---- Focus search on step 1 ----
  useEffect(() => {
    if (open && step === 1) {
      setTimeout(() => searchInputRef.current?.focus(), 200)
    }
  }, [open, step])

  // ---- Navigation ----
  const goForward = useCallback(() => {
    setDirection('forward')
    setStep((prev) => Math.min(prev + 1, 3) as Step)
  }, [])

  const goBack = useCallback(() => {
    setDirection('backward')
    setStep((prev) => Math.max(prev - 1, 1) as Step)
  }, [])

  // ---- Close guard ----
  const hasData = !!(selectedContactId || title || practiceAreaId || matterTypeId)

  function handleClose() {
    if (step === 1 && !hasData) {
      onOpenChange(false)
      return
    }
    // Simple confirmation for now - can be replaced with a proper dialog later
    if (window.confirm('Discard this matter initiation? Unsaved data will be lost.')) {
      onOpenChange(false)
    }
  }

  // ---- Contact selection ----
  function handleSelectContact(contact: Contact) {
    setSelectedContactId(contact.id)
    setSelectedContact(contact)
    setSearchTerm('')
    // Auto-suggest title
    const lastName = contact.last_name ?? contact.first_name ?? 'Client'
    if (!title) {
      setTitle(`${lastName} - `)
    }
  }

  // ---- Readiness calculation ----
  const readiness = useMemo(() => {
    let score = 0
    const total = 5
    if (selectedContactId) score++
    if (title.trim().length > 2) score++
    if (practiceAreaId) score++
    if (billingType) score++
    if (responsibleLawyerId) score++
    return Math.round((score / total) * 100)
  }, [selectedContactId, title, practiceAreaId, billingType, responsibleLawyerId])

  // ---- Submit ----
  async function handleInitiate() {
    if (!tenant || !appUser || isSubmitting) return
    setIsSubmitting(true)

    try {
      const result = await createMatter.mutateAsync({
        tenant_id: tenant.id,
        title: title.trim(),
        practice_area_id: practiceAreaId || null,
        matter_type_id: matterTypeId || null,
        contact_id: selectedContactId || null,
        responsible_lawyer_id: responsibleLawyerId || null,
        billing_type: billingType,
        hourly_rate: billingType === 'hourly' && feeAmount ? parseFloat(feeAmount) : null,
        estimated_value: billingType === 'flat_fee' && feeAmount ? parseFloat(feeAmount) : null,
        status: 'active',
        priority: 'normal',
        created_by: appUser.id,
      })

      onOpenChange(false)
      onSuccess?.(result.id)
    } catch {
      // Error is handled by useCreateMatter's onError
    } finally {
      setIsSubmitting(false)
    }
  }

  // ---- Keyboard ----
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, hasData])

  if (!open) return null

  // ---- Animation helpers ----
  const enterVariant = direction === 'forward' ? 'enterRight' : 'enterLeft'
  const exitVariant = direction === 'forward' ? 'exitLeft' : 'exitRight'

  const canProceedStep1 = !!(selectedContactId && title.trim().length > 2)
  const canProceedStep2 = !!practiceAreaId
  const canInitiate = canProceedStep1 && canProceedStep2 && !!responsibleLawyerId

  // ===========================================================================
  // Render
  // ===========================================================================

  return (
    <motion.div
      className="fixed inset-0 z-[9990] flex items-center justify-center"
      variants={backdropVariants}
      initial="hidden"
      animate="visible"
      exit="hidden"
      transition={{ duration: 0.25 }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 dark:bg-black/70 backdrop-blur-2xl"
        onClick={handleClose}
      />

      {/* Modal shell */}
      <motion.div
        className="relative z-10 mx-4 flex w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-zinc-950/95 shadow-2xl backdrop-blur-xl"
        variants={modalVariants}
        initial="hidden"
        animate="visible"
        exit="hidden"
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-white/[0.06] px-8 pt-7 pb-0">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white">Start New Case</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-white/40">We&apos;ll walk you through it — step by step</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
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
        <div className="relative min-h-[360px] overflow-hidden px-8 pb-6">
          <AnimatePresence mode="wait" custom={direction}>
            {/* ============================================================ */}
            {/* STEP 1: Identity Anchor                                      */}
            {/* ============================================================ */}
            {step === 1 && (
              <motion.div
                key="step-1"
                variants={slideVariants}
                initial={enterVariant}
                animate="center"
                exit={exitVariant}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-col gap-6"
              >
                {/* Contact search */}
                <div>
                  <label className="mb-2 flex items-center text-xs font-medium uppercase tracking-widest text-gray-500 dark:text-white/50">
                    Contact
                    <NorvaGuardianTooltip fieldKey="contact" />
                  </label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-emerald-400/60" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Type a name or email — if they're in the system, we'll find them"
                      className="w-full rounded-xl border border-emerald-500/30 bg-gray-50 dark:bg-white/[0.04] py-3.5 pl-12 pr-4 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 outline-none transition-shadow focus:border-emerald-500/60 focus:shadow-[0_0_20px_rgba(16,185,129,0.15)] focus:ring-0"
                    />
                  </div>

                  {/* Search results dropdown */}
                  {searchTerm.length >= 2 && (
                    <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-zinc-900/90 backdrop-blur-xl shadow-lg dark:shadow-none">
                      {contactSearch.isLoading && (
                        <div className="px-4 py-3 text-xs text-gray-400 dark:text-white/40">Searching...</div>
                      )}
                      {contactSearch.data?.length === 0 && !contactSearch.isLoading && (
                        <div className="px-4 py-3 text-xs text-gray-400 dark:text-white/40">No contacts found</div>
                      )}
                      {contactSearch.data?.map((contact) => (
                        <button
                          key={contact.id}
                          type="button"
                          onClick={() => handleSelectContact(contact)}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-emerald-500/10"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                            {(contact.first_name?.[0] ?? '').toUpperCase()}
                            {(contact.last_name?.[0] ?? '').toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                              {contact.first_name} {contact.last_name}
                            </p>
                            <p className="truncate text-xs text-gray-500 dark:text-white/40">
                              {contact.email_primary}
                              {contact.organization_name ? ` - ${contact.organization_name}` : ''}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Selected contact badge */}
                  {selectedContact && (
                    <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/30 text-[10px] font-bold text-emerald-300">
                        {(selectedContact.first_name?.[0] ?? '').toUpperCase()}
                        {(selectedContact.last_name?.[0] ?? '').toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                        {selectedContact.first_name} {selectedContact.last_name}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedContactId(null)
                          setSelectedContact(null)
                        }}
                        className="ml-auto text-emerald-500/60 dark:text-emerald-400/60 transition-colors hover:text-emerald-600 dark:hover:text-emerald-300"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Matter title */}
                <div>
                  <label className="mb-2 flex items-center text-xs font-medium uppercase tracking-widest text-gray-500 dark:text-white/50">
                    Case Name
                    <NorvaGuardianTooltip fieldKey="caseTitle" />
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Type the client's last name, then the case type (e.g. Khan — Spousal Sponsorship)"
                    className="w-full rounded-xl border border-gray-200 dark:border-white/[0.1] bg-gray-50 dark:bg-white/[0.04] px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 outline-none transition-shadow focus:border-emerald-500/40 focus:shadow-[0_0_16px_rgba(16,185,129,0.1)] focus:ring-0"
                  />
                </div>
              </motion.div>
            )}

            {/* ============================================================ */}
            {/* STEP 2: Logic Gate                                           */}
            {/* ============================================================ */}
            {step === 2 && (
              <motion.div
                key="step-2"
                variants={slideVariants}
                initial={enterVariant}
                animate="center"
                exit={exitVariant}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="grid grid-cols-1 gap-5 md:grid-cols-2"
              >
                {/* Left card: Practice area + matter type */}
                <div className="rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.04] p-5 backdrop-blur-xl">
                  <h3 className="mb-4 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-gray-500 dark:text-white/50">
                    <Scale className="h-3.5 w-3.5 text-emerald-500/60 dark:text-emerald-400/60" />
                    Practice Area
                    <NorvaGuardianTooltip fieldKey="practiceArea" />
                  </h3>

                  <div className="grid grid-cols-2 gap-2">
                    {practiceAreas.data?.map((pa) => {
                      const Icon = getPracticeIcon(pa.name)
                      const selected = practiceAreaId === pa.id
                      return (
                        <motion.button
                          key={pa.id}
                          type="button"
                          whileHover={{ scale: 1.04, y: -2 }}
                          whileTap={{ scale: 0.97 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                          onClick={() => {
                            setPracticeAreaId(pa.id)
                            setMatterTypeId(null)
                          }}
                          className={cn(
                            'flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-center transition-all',
                            selected
                              ? 'border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_16px_rgba(16,185,129,0.2)]'
                              : 'border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] hover:border-gray-300 dark:hover:border-white/[0.12] hover:bg-gray-50 dark:hover:bg-white/[0.04]',
                          )}
                        >
                          <Icon className={cn('h-4 w-4', selected ? 'text-emerald-500 dark:text-emerald-400' : 'text-gray-400 dark:text-white/40')} />
                          <span className={cn('text-xs font-medium', selected ? 'text-emerald-600 dark:text-emerald-300' : 'text-gray-600 dark:text-white/60')}>
                            {pa.name}
                          </span>
                        </motion.button>
                      )
                    })}
                  </div>

                  {/* Matter types for selected practice area */}
                  {practiceAreaId && matterTypes.data && matterTypes.data.length > 0 && (
                    <div className="mt-4 border-t border-gray-200 dark:border-white/[0.06] pt-4">
                      <h4 className="mb-2 flex items-center text-[10px] font-medium uppercase tracking-widest text-gray-400 dark:text-white/40">
                        Case Type
                        <NorvaGuardianTooltip fieldKey="matterType" />
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {matterTypes.data.map((mt) => {
                          const selected = matterTypeId === mt.id
                          return (
                            <motion.button
                              key={mt.id}
                              type="button"
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                              onClick={() => setMatterTypeId(mt.id)}
                              className={cn(
                                'rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                                selected
                                  ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                  : 'border-gray-200 dark:border-white/[0.06] text-gray-500 dark:text-white/50 hover:border-gray-300 dark:hover:border-white/[0.12] hover:text-gray-700 dark:hover:text-white/70',
                              )}
                            >
                              {mt.name}
                            </motion.button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right card: Billing configuration */}
                <div className="rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.04] p-5 backdrop-blur-xl">
                  <h3 className="mb-4 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-gray-500 dark:text-white/50">
                    <DollarSign className="h-3.5 w-3.5 text-emerald-500/60 dark:text-emerald-400/60" />
                    Billing Setup
                    <NorvaGuardianTooltip fieldKey="billingType" />
                  </h3>

                  {/* Billing type toggle */}
                  <div className="flex gap-1.5 rounded-xl bg-gray-100 dark:bg-white/[0.04] p-1">
                    {([
                      { value: 'flat_fee' as BillingType, label: 'Flat Fee', icon: DollarSign },
                      { value: 'hourly' as BillingType, label: 'Hourly', icon: Clock },
                      { value: 'retainer' as BillingType, label: 'Retainer', icon: Briefcase },
                    ]).map(({ value, label, icon: BIcon }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setBillingType(value)}
                        className={cn(
                          'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-all',
                          billingType === value
                            ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 shadow-sm'
                            : 'text-gray-400 dark:text-white/40 hover:text-gray-600 dark:hover:text-white/60',
                        )}
                      >
                        <BIcon className="h-3 w-3" />
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Fee amount */}
                  <div className="mt-5">
                    <label className="mb-2 flex items-center text-[10px] font-medium uppercase tracking-widest text-gray-400 dark:text-white/40">
                      {billingType === 'hourly' ? 'Hourly Rate ($)' : billingType === 'flat_fee' ? 'Flat Fee ($)' : 'Retainer Amount ($)'}
                      <NorvaGuardianTooltip fieldKey="feeAmount" />
                    </label>
                    <div className="relative">
                      <DollarSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300 dark:text-white/20" />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={feeAmount}
                        onChange={(e) => setFeeAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full rounded-xl border border-gray-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] py-2.5 pl-9 pr-4 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/20 outline-none transition-shadow focus:border-emerald-500/40 focus:shadow-[0_0_12px_rgba(16,185,129,0.08)] focus:ring-0"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ============================================================ */}
            {/* STEP 3: Command Assignment                                   */}
            {/* ============================================================ */}
            {step === 3 && (
              <motion.div
                key="step-3"
                variants={slideVariants}
                initial={enterVariant}
                animate="center"
                exit={exitVariant}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-col gap-6"
              >
                <div>
                  <h3 className="mb-4 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-gray-500 dark:text-white/50">
                    <Users className="h-3.5 w-3.5 text-emerald-500/60 dark:text-emerald-400/60" />
                    Lead Lawyer
                    <NorvaGuardianTooltip fieldKey="responsibleLawyer" />
                  </h3>

                  {/* Horizontal scroll of team avatars */}
                  <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
                    {staff.data?.map((member) => {
                      const selected = responsibleLawyerId === member.id
                      const initials = `${(member.first_name?.[0] ?? '').toUpperCase()}${(member.last_name?.[0] ?? '').toUpperCase()}`
                      const displayName = [member.first_name, member.last_name].filter(Boolean).join(' ') || member.email

                      return (
                        <motion.button
                          key={member.id}
                          type="button"
                          whileHover={{ scale: 1.05, y: -3 }}
                          whileTap={{ scale: 0.96 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                          onClick={() => setResponsibleLawyerId(member.id)}
                          className={cn(
                            'group flex shrink-0 flex-col items-center gap-2 rounded-2xl border px-5 py-4 transition-all',
                            selected
                              ? 'border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.2)]'
                              : 'border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] hover:border-gray-300 dark:hover:border-white/[0.12] hover:bg-gray-50 dark:hover:bg-white/[0.04]',
                          )}
                        >
                          <div
                            className={cn(
                              'relative flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold transition-all',
                              selected
                                ? 'bg-emerald-500/30 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-400/60 sovereign-sparkle'
                                : 'bg-gray-100 dark:bg-white/[0.08] text-gray-500 dark:text-white/50 group-hover:bg-gray-200 dark:group-hover:bg-white/[0.12]',
                            )}
                          >
                            {member.avatar_url ? (
                              <img
                                src={member.avatar_url}
                                alt={displayName}
                                className="h-full w-full rounded-full object-cover"
                              />
                            ) : (
                              initials
                            )}
                            {selected && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white"
                              >
                                <Check className="h-3 w-3" />
                              </motion.div>
                            )}
                          </div>
                          <span className={cn('max-w-[80px] truncate text-xs font-medium', selected ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-500 dark:text-white/60')}>
                            {displayName}
                          </span>
                        </motion.button>
                      )
                    })}

                    {staff.isLoading && (
                      <div className="flex items-center px-4 text-xs text-gray-400 dark:text-white/30">Loading team...</div>
                    )}
                  </div>
                </div>

                {/* Summary */}
                <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] p-4">
                  <h4 className="mb-3 text-[10px] font-medium uppercase tracking-widest text-gray-400 dark:text-white/40">
                    Initiation Summary
                  </h4>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-6 text-xs">
                    <div className="text-gray-400 dark:text-white/40">Contact</div>
                    <div className="font-medium text-gray-700 dark:text-white/80">
                      {selectedContact
                        ? `${selectedContact.first_name ?? ''} ${selectedContact.last_name ?? ''}`.trim()
                        : 'Not selected'}
                    </div>
                    <div className="text-gray-400 dark:text-white/40">Title</div>
                    <div className="font-medium text-gray-700 dark:text-white/80">{title || 'Not set'}</div>
                    <div className="text-gray-400 dark:text-white/40">Practice Area</div>
                    <div className="font-medium text-gray-700 dark:text-white/80">
                      {practiceAreas.data?.find((pa) => pa.id === practiceAreaId)?.name ?? 'Not selected'}
                    </div>
                    <div className="text-gray-400 dark:text-white/40">Billing</div>
                    <div className="font-medium text-gray-700 dark:text-white/80">
                      {billingType === 'flat_fee' ? 'Flat Fee' : billingType === 'hourly' ? 'Hourly' : 'Retainer'}
                      {feeAmount ? ` - $${parseFloat(feeAmount).toFixed(2)}` : ''}
                    </div>
                  </div>
                </div>

                {/* Readiness ring */}
                <div className="flex items-center justify-between">
                  <ReadinessRing percentage={readiness} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 dark:border-white/[0.06] px-8 py-5">
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={goBack}
                className="flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-white/[0.1] bg-gray-50 dark:bg-white/[0.04] px-4 py-2 text-xs font-medium text-gray-500 dark:text-white/60 transition-colors hover:bg-gray-100 dark:hover:bg-white/[0.08] hover:text-gray-700 dark:hover:text-white"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Back
              </button>
            )}
          </div>

          <div>
            {step < 3 && (
              <button
                type="button"
                onClick={goForward}
                disabled={step === 1 ? !canProceedStep1 : !canProceedStep2}
                className={cn(
                  'flex items-center gap-1.5 rounded-xl px-5 py-2 text-xs font-semibold tracking-wide uppercase transition-all',
                  (step === 1 ? canProceedStep1 : canProceedStep2)
                    ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40'
                    : 'cursor-not-allowed bg-gray-100 dark:bg-white/[0.06] text-gray-300 dark:text-white/20',
                )}
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}

            {step === 3 && (
              <button
                type="button"
                onClick={handleInitiate}
                disabled={!canInitiate || isSubmitting}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-6 py-2.5 text-xs font-bold uppercase tracking-widest transition-all',
                  canInitiate && !isSubmitting
                    ? 'border-emerald-500/50 bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] hover:text-emerald-500 dark:hover:text-emerald-300'
                    : 'cursor-not-allowed border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-zinc-900 text-gray-300 dark:text-white/20',
                )}
              >
                {isSubmitting ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                    </motion.div>
                    Initiating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Initiate Matter
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Sovereign Sparkle CSS animation (injected once) */}
      <style jsx global>{`
        @keyframes sovereign-sparkle {
          0%, 100% {
            box-shadow: 0 0 6px rgba(16, 185, 129, 0.3), 0 0 12px rgba(16, 185, 129, 0.1);
          }
          50% {
            box-shadow: 0 0 12px rgba(16, 185, 129, 0.5), 0 0 24px rgba(16, 185, 129, 0.2);
          }
        }
        .sovereign-sparkle {
          animation: sovereign-sparkle 2s ease-in-out infinite;
        }
      `}</style>
    </motion.div>
  )
}
