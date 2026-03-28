'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Loader2, Mail, Phone, User, Briefcase, Signal, UserPlus } from 'lucide-react'
import { useUser } from '@/lib/hooks/use-user'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUIStore } from '@/lib/stores/ui-store'
import { usePipelines } from '@/lib/queries/pipelines'
import { usePipelineStages } from '@/lib/queries/pipelines'
import { useMatterTypes } from '@/lib/queries/matter-types'
import { useLeadSources } from '@/lib/queries/leads'
import { useCreateContact } from '@/lib/queries/contacts'
import { useCreateLead } from '@/lib/queries/leads'
import { PostIgnitionHub, type IgnitionPayload } from '@/components/leads/post-ignition-hub'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

// ---------------------------------------------------------------------------
// Emerald FAB — Floating Action Button with Breathing Pulse
// ---------------------------------------------------------------------------

export function EmeraldFAB() {
  const [modalOpen, setModalOpen] = useState(false)
  const [prefillName, setPrefillName] = useState('')
  const [hubOpen, setHubOpen] = useState(false)
  const [hubPayload, setHubPayload] = useState<IgnitionPayload | null>(null)

  // Listen for 'create-lead-quick' from Zustand (triggered by ⌘K palette)
  const activeModal = useUIStore((s) => s.activeModal)
  const modalData = useUIStore((s) => s.modalData)
  const closeModal = useUIStore((s) => s.closeModal)

  useEffect(() => {
    if (activeModal === 'create-lead-quick') {
      const name = (modalData?.prefillName as string) ?? ''
      setPrefillName(name)
      setModalOpen(true)
      closeModal()
    }
  }, [activeModal, modalData, closeModal])

  const openModal = useUIStore((s) => s.openModal)
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)

  return (
    <>
      {/* FAB Stack — bottom-left, clears sidebar */}
      <div
        className="fixed bottom-6 z-50 flex flex-col-reverse items-center gap-3 transition-[left] duration-300"
        style={{ left: sidebarCollapsed ? 'calc(72px + 1.5rem)' : 'calc(16rem + 1.5rem)' }}
      >
        {/* Primary: Quick Lead (bottom) */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                onClick={() => setModalOpen(true)}
                className="flex items-center justify-center size-14 rounded-full bg-emerald-600 text-white shadow-lg hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                animate={{
                  scale: [1, 1.02, 1],
                  boxShadow: [
                    '0 0 0 0 rgba(16, 185, 129, 0)',
                    '0 0 16px 4px rgba(16, 185, 129, 0.35)',
                    '0 0 0 0 rgba(16, 185, 129, 0)',
                  ],
                }}
                transition={{
                  duration: 2.5,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
                aria-label="Create new lead"
              >
                <Plus className="size-6" strokeWidth={2.5} />
              </motion.button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              <p className="font-semibold">Sovereign Ignition</p>
              <p className="text-[10px] opacity-80">Quick lead — contact + pipeline in 10 seconds</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Secondary: New Contact (above) */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                onClick={() => openModal('create-contact')}
                className="flex items-center justify-center size-11 rounded-full bg-indigo-600 text-white shadow-md hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 transition-colors"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3, duration: 0.3 }}
                aria-label="Create new contact"
              >
                <UserPlus className="size-4.5" strokeWidth={2} />
              </motion.button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              <p className="font-semibold">New Contact</p>
              <p className="text-[10px] opacity-80">Full identity creation with conflict search</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <QuickLeadModal
        open={modalOpen}
        onOpenChange={(v) => { setModalOpen(v); if (!v) setPrefillName('') }}
        prefillName={prefillName}
        onIgnition={(payload) => {
          setModalOpen(false)
          setPrefillName('')
          setHubPayload(payload)
          setHubOpen(true)
        }}
      />

      <PostIgnitionHub
        open={hubOpen}
        onOpenChange={setHubOpen}
        payload={hubPayload}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Email validation
// ---------------------------------------------------------------------------

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ---------------------------------------------------------------------------
// Ignition Modal — Obsidian Theme, Schema-Driven, Zero Placeholders
// ---------------------------------------------------------------------------

function QuickLeadModal({
  open,
  onOpenChange,
  prefillName = '',
  onIgnition,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  prefillName?: string
  onIgnition?: (payload: IgnitionPayload) => void
}) {
  const router = useRouter()
  const { appUser } = useUser()
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''
  // userId used inline via appUser?.id ?? null

  // Form state
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [matterTypeId, setMatterTypeId] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Prefill from ⌘K search query
  useEffect(() => {
    if (open && prefillName) {
      const parts = prefillName.split(/\s+/)
      setFirstName(parts[0] ?? '')
      setLastName(parts.slice(1).join(' '))
    }
  }, [open, prefillName])

  // Data hooks — schema-driven, zero placeholders
  const { data: pipelines, isLoading: pipelinesLoading } = usePipelines(tenantId, 'lead')
  const defaultPipeline = pipelines?.[0]
  const { data: stages, isLoading: stagesLoading } = usePipelineStages(defaultPipeline?.id ?? '')
  const { data: matterTypes } = useMatterTypes(tenantId)
  const { data: leadSources } = useLeadSources(tenantId)

  const createContact = useCreateContact()
  const createLead = useCreateLead()

  // Schema readiness — if DB pipeline/stages aren't loaded, disable submit
  const schemaReady = !pipelinesLoading && !stagesLoading && !!defaultPipeline && !!stages?.length

  const resetForm = useCallback(() => {
    setFirstName('')
    setLastName('')
    setEmail('')
    setEmailError(null)
    setPhone('')
    setMatterTypeId('')
    setSourceId('')
    setError(null)
  }, [])

  // Real-time email validation
  const validateEmail = useCallback((value: string) => {
    if (!value.trim()) {
      setEmailError('Email is required')
      return false
    }
    if (!EMAIL_REGEX.test(value.trim())) {
      setEmailError('Enter a valid email address')
      return false
    }
    setEmailError(null)
    return true
  }, [])

  const handleSubmit = useCallback(async () => {
    const trimmedFirst = firstName.trim()
    const trimmedEmail = email.trim()

    if (!trimmedFirst) {
      setError('Satellite Link Interrupted — First name is required.')
      return
    }
    if (!trimmedEmail || !validateEmail(trimmedEmail)) {
      setError('Satellite Link Interrupted — Valid email is required for the Sovereign Pipeline.')
      return
    }
    if (!schemaReady) {
      setError('Satellite Link Interrupted — Stage 1 not initialised. Contact admin.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      // Step 1: Create contact with email
      const contact = await createContact.mutateAsync({
        tenant_id: tenantId,
        first_name: trimmedFirst,
        last_name: lastName.trim() || null,
        email_primary: trimmedEmail,
        phone_primary: phone.trim() || null,
        contact_type: 'individual',
        client_status: 'lead',
      })

      // Step 2: Create lead — stage_id resolved from DB (Stage 1 = Inquiry)
      const firstStage = stages![0]
      const selectedSource = leadSources?.find(s => s.id === sourceId)

      const lead = await createLead.mutateAsync({
        tenant_id: tenantId,
        contact_id: contact.id,
        pipeline_id: defaultPipeline!.id,
        stage_id: firstStage.id,
        temperature: 'warm',
        status: 'open',
        matter_type_id: matterTypeId || null,
        source: selectedSource?.name ?? null,
        created_by: appUser?.id ?? null,
      })

      // Step 3: Hand off to PostIgnitionHub (Revenue Engine)
      const selectedMatterType = matterTypes?.find(mt => mt.id === matterTypeId)
      const leadName = [trimmedFirst, lastName.trim()].filter(Boolean).join(' ')

      onOpenChange(false)
      resetForm()

      if (onIgnition) {
        onIgnition({
          leadId: lead.id,
          leadName,
          matterTypeName: selectedMatterType?.name ?? null,
          consultationFeeCents: selectedMatterType?.consultation_fee_cents ?? 0,
        })
      } else {
        // Fallback: direct navigation if no hub callback
        router.push(`/studio/workspace/${lead.id}?splash=1`)
      }
    } catch (err: unknown) {
      console.error('[SOVEREIGN_IGNITION_ERROR]', err)
      const msg = err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: string }).message)
          : JSON.stringify(err)
      setError(`Satellite Link Interrupted — ${msg}`)
    } finally {
      setSubmitting(false)
    }
  }, [
    firstName, lastName, email, phone, matterTypeId, sourceId, tenantId,
    defaultPipeline, stages, leadSources, matterTypes, createContact, createLead, appUser,
    onOpenChange, onIgnition, resetForm, router, schemaReady, validateEmail,
  ])

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v) }}>
      <DialogContent
        className="sm:max-w-md border border-border bg-background shadow-2xl backdrop-blur-xl font-mono"
      >
        {/* ── Emerald Pulse Line ── */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px] rounded-t-lg"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, #10b981 30%, #34d399 50%, #10b981 70%, transparent 100%)',
            animation: 'emeraldPulse 3s ease-in-out infinite',
          }}
        />
        <style>{`
          @keyframes emeraldPulse {
            0%, 100% { opacity: 0.4; }
            50% { opacity: 1; }
          }
        `}</style>

        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-foreground font-mono">
            Sovereign Ignition
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground font-mono">
            Identity. Contact. Origin. — 10-second capture.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Name Row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ql-first" className="text-xs font-medium text-foreground/70 font-mono uppercase tracking-wider flex items-center gap-1.5">
                <User className="size-3 text-muted-foreground" />
                First Name <span className="text-emerald-500">*</span>
              </Label>
              <Input
                id="ql-first"
                placeholder="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
                className="font-mono text-foreground placeholder:text-muted-foreground focus:border-emerald-500 focus:ring-emerald-500/20"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ql-last" className="text-xs font-medium text-foreground/70 font-mono uppercase tracking-wider flex items-center gap-1.5">
                Last Name
              </Label>
              <Input
                id="ql-last"
                placeholder="Last name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
                className="font-mono text-foreground placeholder:text-muted-foreground focus:border-emerald-500 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          {/* Email — Mandatory */}
          <div className="space-y-1.5">
            <Label htmlFor="ql-email" className="text-xs font-medium text-foreground/70 font-mono uppercase tracking-wider flex items-center gap-1.5">
              <Mail className="size-3 text-muted-foreground" />
              Email <span className="text-emerald-500">*</span>
            </Label>
            <Input
              id="ql-email"
              placeholder="client@example.com"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (emailError) validateEmail(e.target.value)
              }}
              onBlur={() => { if (email.trim()) validateEmail(email) }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
              className={`font-mono text-foreground placeholder:text-muted-foreground focus:ring-emerald-500/20 ${
                emailError ? 'border-red-500 focus:border-red-500' : 'focus:border-emerald-500'
              }`}
            />
            {emailError && (
              <p className="text-[11px] text-red-500 dark:text-red-400 font-mono">{emailError}</p>
            )}
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <Label htmlFor="ql-phone" className="text-xs font-medium text-foreground/70 font-mono uppercase tracking-wider flex items-center gap-1.5">
              <Phone className="size-3 text-muted-foreground" />
              Phone
            </Label>
            <Input
              id="ql-phone"
              placeholder="+1 (555) 000-0000"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
              className="font-mono text-foreground placeholder:text-muted-foreground focus:border-emerald-500 focus:ring-emerald-500/20"
            />
          </div>

          {/* Case Type — Schema-driven from matter_types table */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground/70 font-mono uppercase tracking-wider flex items-center gap-1.5">
                <Briefcase className="size-3 text-muted-foreground" />
                Case Type
              </Label>
              <Select value={matterTypeId} onValueChange={setMatterTypeId}>
                <SelectTrigger className="font-mono text-foreground focus:ring-emerald-500/20">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {(matterTypes ?? []).map((mt) => (
                    <SelectItem key={mt.id} value={mt.id} className="font-mono">
                      {mt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Lead Source — Schema-driven from lead_sources table */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground/70 font-mono uppercase tracking-wider flex items-center gap-1.5">
                <Signal className="size-3 text-muted-foreground" />
                Source
              </Label>
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger className="font-mono text-foreground focus:ring-emerald-500/20">
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {(leadSources ?? []).map((src) => (
                    <SelectItem key={src.id} value={src.id} className="font-mono">
                      {src.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Error — Sovereign Alert */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-sm text-red-600 dark:text-red-300 bg-red-500/5 dark:bg-red-950/40 border border-red-500/30 dark:border-red-800/50 rounded-md px-3 py-2"
              >
                <p className="font-mono text-[11px] text-red-500 dark:text-red-400/80 mb-0.5 uppercase tracking-widest">SOVEREIGN ALERT</p>
                <span className="font-mono text-xs">{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Schema Status Warning */}
          {!schemaReady && !pipelinesLoading && !stagesLoading && (
            <div className="text-xs font-mono text-amber-600 dark:text-amber-400/80 bg-amber-500/5 dark:bg-amber-950/30 border border-amber-500/30 dark:border-amber-800/30 rounded-md px-3 py-2">
              Pipeline not initialised — submit disabled until Stage 1 is available.
            </div>
          )}

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={submitting || !firstName.trim() || !email.trim() || !schemaReady}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20 shadow-lg disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none disabled:cursor-not-allowed font-mono uppercase tracking-wider text-xs transition-all"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Initialising...
              </>
            ) : (
              <>
                <Plus className="size-4 mr-2" />
                Ignite Mission &amp; Open Corridor
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
