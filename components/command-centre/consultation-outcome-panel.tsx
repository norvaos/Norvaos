'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useCommandCentre } from './command-centre-context'
import { useCommandPermissions } from '@/lib/hooks/use-command-permissions'
import { useMatterTypes } from '@/lib/queries/matter-types'
import { useDefaultRetainerFeeTemplate } from '@/lib/queries/retainer-fee-templates'
import { useQueryClient } from '@tanstack/react-query'
import { leadKeys } from '@/lib/queries/leads'
import {
  useLeadRetainerPackages,
  leadWorkflowKeys,
  useRecordRetainerPayment,
} from '@/lib/queries/lead-workflow'
import {
  useSigningRequestsForLead,
  useSendRetainerForESign,
  useResendLeadESign,
  useCancelLeadESign,
  useSendESignReminder,
} from '@/lib/queries/esign'
import {
  CONSULTATION_OUTCOMES,
  PERSON_SCOPES,
  DECLINE_REASONS,
  NOT_FIT_REASONS,
  REFERRAL_REASONS,
  FOLLOW_UP_TYPES,
  type ConsultationOutcomeValue,
} from '@/lib/utils/constants'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import {
  Trophy,
  Clock,
  XCircle,
  Ban,
  ExternalLink,
  UserX,
  CalendarPlus,
  Loader2,
  CheckCircle2,
  ChevronLeft,
  AlertTriangle,
  ArrowDown,
  Eye,
  FileText,
  CreditCard,
  Send,
  CircleDot,
  Printer,
  FileSignature,
  Bell,
  RotateCcw,
  Download,
  Pencil,
  DollarSign,
  Upload,
  Briefcase,
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

// ─── Icon map ───────────────────────────────────────────────────────────

const ICON_MAP = {
  Trophy,
  Clock,
  XCircle,
  Ban,
  ExternalLink,
  UserX,
  CalendarPlus,
} as const

// ─── Types ──────────────────────────────────────────────────────────────

interface CommandSummaryData {
  outcomeLabel: string
  commandSummary: string[]
  currentStatus: Record<string, string>
}

// ─── Component ──────────────────────────────────────────────────────────

export function ConsultationOutcomePanel() {
  const {
    lead,
    contact,
    stages,
    tenantId,
    userId,
    entityId,
    users,
    practiceAreas,
    isConverted,
  } = useCommandCentre()

  const router = useRouter()
  const queryClient = useQueryClient()
  const { canMarkRetained, canCloseLost } = useCommandPermissions()

  // ── State ─────────────────────────────────────────────────────
  const [selectedOutcome, setSelectedOutcome] = useState<ConsultationOutcomeValue | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [summary, setSummary] = useState<CommandSummaryData | null>(null)

  // ── Form state (send_retainer fields auto-populated from lead) ─
  // send_retainer — reads from lead.matter_type_id / lead.person_scope when available
  const [matterTypeId, setMatterTypeId] = useState(lead?.matter_type_id ?? '')
  const [personScope, setPersonScope] = useState<'single' | 'joint'>(
    (lead?.person_scope as 'single' | 'joint') ?? 'single'
  )
  const [responsibleLawyerId, setResponsibleLawyerId] = useState(
    lead?.responsible_lawyer_id ?? userId
  )
  const [billingType, setBillingType] = useState('flat_fee')
  // follow_up_later / book_follow_up
  const [followUpDate, setFollowUpDate] = useState('')
  const [followUpOwner, setFollowUpOwner] = useState(userId)
  const [followUpType, setFollowUpType] = useState<'phone' | 'in_person' | 'video'>('phone')
  const [leadTemperature, setLeadTemperature] = useState('')
  // client_declined / not_a_fit / referred_out
  const [declineReason, setDeclineReason] = useState('')
  const [declineDetails, setDeclineDetails] = useState('')
  const [notFitReason, setNotFitReason] = useState('')
  const [notFitDetails, setNotFitDetails] = useState('')
  const [referredToName, setReferredToName] = useState('')
  const [referralReason, setReferralReason] = useState('')
  // shared
  const [consultationNotes, setConsultationNotes] = useState('')

  // ── Data queries ──────────────────────────────────────────────
  const { data: matterTypes } = useMatterTypes(tenantId)
  const { data: defaultTemplate } = useDefaultRetainerFeeTemplate(
    tenantId,
    matterTypeId || undefined,
    personScope
  )

  // ── Retainer packages (for persistent status card) ───────────
  const { data: retainerPackages } = useLeadRetainerPackages(lead?.id ?? '')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const latestRetainer = ((retainerPackages as any[])?.find((p: any) => p.status !== 'cancelled') ?? null) as {
    id: string
    status: string
    payment_status: string
    total_amount_cents: number | null
    payment_amount: number | null
    payment_method: string | null
    signing_method: string | null
  } | null
  const hasRetainerPackage = !!latestRetainer

  // ── Payment balance derivation ──────────────────────────────
  const paymentBalance = useMemo(() => {
    if (!latestRetainer) return null
    const totalOwed = Number(latestRetainer.total_amount_cents ?? 0)
    const totalPaid = Number(latestRetainer.payment_amount ?? 0)
    const balance = Math.max(totalOwed - totalPaid, 0)
    return { totalOwed, totalPaid, balance }
  }, [latestRetainer])

  // ── Signing requests + retainer lifecycle mutations ─────────
  const { data: signingRequests } = useSigningRequestsForLead(lead?.id ?? '')
  const activeSigningReq = useMemo(() => {
    if (!signingRequests?.length) return null
    return signingRequests.find((r) => r.status !== 'superseded') ?? null
  }, [signingRequests])

  const sendForESign = useSendRetainerForESign()
  const resendESign = useResendLeadESign()
  const cancelESign = useCancelLeadESign()
  const sendReminder = useSendESignReminder()
  const recordPayment = useRecordRetainerPayment()

  // ── Retainer state derivation (matches builder logic) ───────
  const retainerState = useMemo((): 'draft' | 'saved' | 'sent' | 'viewed' | 'signed' | 'partial' | 'paid' => {
    if (!latestRetainer) return 'draft'
    if (latestRetainer.payment_status === 'paid' || latestRetainer.status === 'fully_retained') return 'paid'
    if (latestRetainer.payment_status === 'partial') return 'partial'
    if (latestRetainer.status === 'signed') return 'signed'
    if (latestRetainer.status === 'sent' && activeSigningReq) {
      if (activeSigningReq.status === 'signed') return 'signed'
      if (activeSigningReq.status === 'viewed') return 'viewed'
      return 'sent'
    }
    if (latestRetainer.status === 'sent') return 'sent'
    return 'saved'
  }, [latestRetainer, activeSigningReq])

  // ── E-sign dialog state ─────────────────────────────────────
  const [esignDialogOpen, setEsignDialogOpen] = useState(false)
  const [esignSignerName, setEsignSignerName] = useState('')
  const [esignSignerEmail, setEsignSignerEmail] = useState('')
  const [esignSending, setEsignSending] = useState(false)

  // ── Payment dialog state ────────────────────────────────────
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('e_transfer')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentRef, setPaymentRef] = useState('')

  // ── Conversion confirmation state ──────────────────────────────
  // Shows before the final manual action (payment or paper-sign upload)
  // that would trigger auto-conversion to a matter.
  // Not shown for e-sign + online payment flows (those convert automatically).
  const [conversionConfirmOpen, setConversionConfirmOpen] = useState(false)
  const [pendingConversionAction, setPendingConversionAction] = useState<'payment' | 'upload' | null>(null)

  // ── Conversion blocked dialog state ─────────────────────────────
  // Shown when auto-conversion fails due to missing fields.
  const [conversionBlockedOpen, setConversionBlockedOpen] = useState(false)
  const [conversionBlockedMessage, setConversionBlockedMessage] = useState('')
  const [isRetryingConversion, setIsRetryingConversion] = useState(false)

  // ── Retry conversion ────────────────────────────────────────────
  // Called from the "Convert to Matter" button after user fixes missing fields.
  const retryConversion = useCallback(async () => {
    if (!lead?.id || !latestRetainer?.id) return
    setIsRetryingConversion(true)
    try {
      const res = await fetch('/api/retainer/retry-conversion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, retainerPackageId: latestRetainer.id }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Conversion failed')
        return
      }

      if (data.matterId && data.matterNumber) {
        toast.success(`Matter ${data.matterNumber} created`, {
          description: 'Lead has been converted to an active matter.',
          duration: 5000,
        })
        setConversionBlockedOpen(false)
        setConversionBlockedMessage('')
        // Navigate to the matter page
        router.push(`/matters/${data.matterId}`)
      } else if (data.conversionError) {
        setConversionBlockedMessage(data.conversionError)
        setConversionBlockedOpen(true)
      }

      // Refresh everything
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.retainerPackages(lead.id) })
      queryClient.invalidateQueries({ queryKey: leadKeys.detail(lead.id) })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    } catch {
      toast.error('Failed to retry conversion')
    } finally {
      setIsRetryingConversion(false)
    }
  }, [lead?.id, latestRetainer?.id, queryClient])

  // ── Find or create consultation ───────────────────────────────
  const getOrCreateConsultation = useCallback(async () => {
    if (!lead) return null
    const supabase = createClient()

    // Try to find the latest non-completed consultation
    const { data: existing } = await supabase
      .from('lead_consultations')
      .select('id, status, outcome')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing && !existing.outcome) {
      return existing.id
    }

    // Create a new consultation record
    const { data: newConsult } = await supabase
      .from('lead_consultations')
      .insert({
        tenant_id: tenantId,
        lead_id: lead.id,
        status: 'completed',
        conducted_by: userId,
      })
      .select('id')
      .single()

    return newConsult?.id ?? null
  }, [lead, tenantId, userId])

  // ── Lawyers ───────────────────────────────────────────────────
  const lawyers = useMemo(
    () => users.filter((u) => u.is_active),
    [users]
  )

  // ── Permission checks ────────────────────────────────────────
  const canSelectOutcome = useCallback(
    (outcome: ConsultationOutcomeValue) => {
      if (outcome === 'send_retainer' && !canMarkRetained) return false
      if (['client_declined', 'not_a_fit', 'referred_out'].includes(outcome) && !canCloseLost) return false
      return true
    },
    [canMarkRetained, canCloseLost]
  )

  // ── Reset form (re-reads from lead to preserve Core Data) ────
  const resetForm = useCallback(() => {
    setSelectedOutcome(null)
    setMatterTypeId(lead?.matter_type_id ?? '')
    setPersonScope((lead?.person_scope as 'single' | 'joint') ?? 'single')
    setResponsibleLawyerId(lead?.responsible_lawyer_id ?? userId)
    setBillingType('flat_fee')
    setFollowUpDate('')
    setFollowUpOwner(userId)
    setFollowUpType('phone')
    setLeadTemperature('')
    setDeclineReason('')
    setDeclineDetails('')
    setNotFitReason('')
    setNotFitDetails('')
    setReferredToName('')
    setReferralReason('')
    setConsultationNotes('')
  }, [userId, lead?.matter_type_id, lead?.person_scope, lead?.responsible_lawyer_id])

  // ── Validate current form ─────────────────────────────────────
  const isFormValid = useMemo(() => {
    if (!selectedOutcome) return false

    switch (selectedOutcome) {
      case 'send_retainer':
        return !!(lead?.practice_area_id && matterTypeId && responsibleLawyerId && billingType && consultationNotes.trim())
      case 'follow_up_later':
        return !!(followUpDate && followUpOwner && consultationNotes.trim())
      case 'client_declined':
        return !!(
          declineReason &&
          consultationNotes.trim() &&
          (declineReason !== 'Other' || declineDetails.trim())
        )
      case 'not_a_fit':
        return !!(
          notFitReason &&
          consultationNotes.trim() &&
          (notFitReason !== 'Other' || notFitDetails.trim())
        )
      case 'referred_out':
        return !!(referredToName.trim() && referralReason && consultationNotes.trim())
      case 'no_show':
        return true
      case 'book_follow_up':
        return !!(followUpType && followUpDate && followUpOwner)
      default:
        return false
    }
  }, [
    selectedOutcome, lead?.practice_area_id, matterTypeId, responsibleLawyerId, billingType,
    consultationNotes, followUpDate, followUpOwner, followUpType,
    declineReason, declineDetails, notFitReason, notFitDetails,
    referredToName, referralReason,
  ])

  // ── Submit handler ────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!selectedOutcome || !lead || isSubmitting) return

    setIsSubmitting(true)
    try {
      const consultationId = await getOrCreateConsultation()
      if (!consultationId) {
        toast.error('Failed to create consultation record')
        return
      }

      // Build payload per outcome
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: Record<string, any> = {
        leadId: lead.id,
        consultationId,
        outcome: selectedOutcome,
      }

      switch (selectedOutcome) {
        case 'send_retainer':
          payload.matterTypeId = matterTypeId
          payload.personScope = personScope
          payload.responsibleLawyerId = responsibleLawyerId
          payload.billingType = billingType
          payload.consultationNotes = consultationNotes
          if (defaultTemplate) {
            payload.retainerFeeTemplateId = defaultTemplate.id
          }
          break
        case 'follow_up_later':
          payload.followUpDate = followUpDate
          payload.followUpOwner = followUpOwner
          payload.consultationNotes = consultationNotes
          if (leadTemperature) payload.leadTemperature = leadTemperature
          break
        case 'client_declined':
          payload.declineReason = declineReason
          payload.declineDetails = declineDetails || undefined
          payload.consultationNotes = consultationNotes
          break
        case 'not_a_fit':
          payload.notFitReason = notFitReason
          payload.notFitDetails = notFitDetails || undefined
          payload.consultationNotes = consultationNotes
          break
        case 'referred_out':
          payload.referredToName = referredToName
          payload.referralReason = referralReason
          payload.consultationNotes = consultationNotes
          break
        case 'no_show':
          break
        case 'book_follow_up':
          payload.followUpType = followUpType
          payload.followUpDate = followUpDate
          payload.followUpOwner = followUpOwner
          break
      }

      const res = await fetch('/api/command/record-consultation-outcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Failed to record outcome')
        return
      }

      // Show command summary
      setSummary({
        outcomeLabel: data.outcomeLabel,
        commandSummary: data.commandSummary,
        currentStatus: data.currentStatus,
      })

      // Invalidate queries to refresh UI
      queryClient.invalidateQueries({ queryKey: leadKeys.detail(lead.id) })
      queryClient.invalidateQueries({ queryKey: leadKeys.all })
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.retainerPackages(lead.id) })

      toast.success(`Outcome recorded: ${data.outcomeLabel}`)
    } catch (err) {
      console.error('[consultation-outcome] Error:', err)
      toast.error('Failed to record outcome')
    } finally {
      setIsSubmitting(false)
    }
  }, [
    selectedOutcome, lead, isSubmitting, getOrCreateConsultation,
    matterTypeId, personScope, responsibleLawyerId, billingType,
    consultationNotes, followUpDate, followUpOwner, followUpType,
    leadTemperature, declineReason, declineDetails, notFitReason,
    notFitDetails, referredToName, referralReason, defaultTemplate,
    queryClient,
  ])

  // ── Helper: scroll to retainer builder ──────────────────────────
  const scrollToRetainerBuilder = useCallback(() => {
    const el = document.getElementById('retainer-builder-section')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      el.classList.add('ring-2', 'ring-blue-400', 'ring-offset-2', 'rounded-lg')
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-blue-400', 'ring-offset-2', 'rounded-lg')
      }, 2000)
    }
  }, [])

  // ── Helper: extract filename from Content-Disposition header ──
  const extractFilename = useCallback((res: Response, fallback: string) => {
    const disposition = res.headers.get('Content-Disposition')
    if (disposition) {
      const match = disposition.match(/filename="?([^";\n]+)"?/)
      if (match?.[1]) return match[1]
    }
    return fallback
  }, [])

  // ── Helper: open retainer PDF preview ─────────────────────────
  const [isLoadingPdf, setIsLoadingPdf] = useState(false)
  const openRetainerPdf = useCallback(async () => {
    if (!lead?.id) return
    setIsLoadingPdf(true)
    try {
      const res = await fetch('/api/retainer/preview-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to generate PDF' }))
        toast.error(data.error || 'Failed to generate retainer PDF')
        return
      }
      const blob = await res.blob()
      const filename = extractFilename(res, 'Retainer-Agreement.pdf')
      // Use a download link to preserve the proper filename
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch {
      toast.error('Failed to generate retainer PDF')
    } finally {
      setIsLoadingPdf(false)
    }
  }, [lead?.id, extractFilename])

  // ── Helper: print retainer for in-person signing ─────────────
  const [isPrintingPdf, setIsPrintingPdf] = useState(false)
  const printRetainerPdf = useCallback(async () => {
    if (!lead?.id || !latestRetainer?.id) return
    setIsPrintingPdf(true)
    try {
      const res = await fetch('/api/retainer/preview-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, markAsSent: true }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to generate PDF' }))
        toast.error(data.error || 'Failed to generate retainer PDF')
        return
      }
      const blob = await res.blob()
      const filename = extractFilename(res, 'Retainer-Agreement.pdf')
      const namedBlob = new File([blob], filename, { type: 'application/pdf' })
      const url = URL.createObjectURL(namedBlob)
      // Open in new window and auto-trigger print
      const printWindow = window.open(url, '_blank')
      if (printWindow) {
        printWindow.addEventListener('load', () => {
          printWindow.print()
        })
      }
      setTimeout(() => URL.revokeObjectURL(url), 120000)

      // Invalidate queries to refresh the UI status (server already marked as sent)
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.retainerPackages(lead.id) })
    } catch {
      toast.error('Failed to generate retainer PDF')
    } finally {
      setIsPrintingPdf(false)
    }
  }, [lead?.id, latestRetainer?.id, queryClient, extractFilename])

  // ── Helper: cancel retainer ─────────────────────────────────────
  const [isCancelling, setIsCancelling] = useState(false)
  const cancelRetainer = useCallback(async () => {
    if (!lead?.id || !latestRetainer) return
    const confirmed = window.confirm(
      'Cancel this retainer package? The lead will remain in the pipeline but the retainer will be voided.'
    )
    if (!confirmed) return

    setIsCancelling(true)
    try {
      const supabase = createClient()
      // Get the actual retainer package ID
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pkgId = (latestRetainer as any).id
      if (!pkgId) {
        toast.error('No retainer package ID found')
        return
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase
        .from('lead_retainer_packages') as any)
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', pkgId)

      if (error) throw error

      // Update lead's retainer_status
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase
        .from('leads') as any)
        .update({
          retainer_status: 'cancelled',
          next_required_action: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', lead.id)

      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.retainerPackages(lead.id) })
      queryClient.invalidateQueries({ queryKey: leadKeys.detail(lead.id) })
      toast.success('Retainer cancelled')
    } catch (err) {
      console.error('[consultation-outcome] Cancel retainer error:', err)
      toast.error('Failed to cancel retainer')
    } finally {
      setIsCancelling(false)
    }
  }, [lead?.id, latestRetainer, queryClient])

  // ── Helper: open e-sign dialog ─────────────────────────────────
  const openESignDialog = useCallback(() => {
    setEsignSignerName(
      contact ? `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() : ''
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setEsignSignerEmail((contact as any)?.email ?? '')
    setEsignDialogOpen(true)
  }, [contact])

  const handleSendForESign = useCallback(async () => {
    if (!lead?.id || !latestRetainer?.id || !esignSignerName.trim() || !esignSignerEmail.trim()) return
    setEsignSending(true)
    try {
      await sendForESign.mutateAsync({
        retainerPackageId: latestRetainer.id,
        leadId: lead.id,
        signerName: esignSignerName.trim(),
        signerEmail: esignSignerEmail.trim(),
        signerContactId: contact?.id ?? null,
      })
      setEsignDialogOpen(false)
    } catch {
      // Error handled by mutation onError
    } finally {
      setEsignSending(false)
    }
  }, [lead?.id, latestRetainer?.id, esignSignerName, esignSignerEmail, contact, sendForESign])

  // ── Helper: record payment ──────────────────────────────────────
  const executeRecordPayment = useCallback(() => {
    if (!lead?.id || !latestRetainer?.id || !paymentAmount) return
    recordPayment.mutate({
      leadId: lead.id,
      retainerPackageId: latestRetainer.id,
      amount: Math.round(parseFloat(paymentAmount) * 100),
      paymentMethod,
      reference: paymentRef || undefined,
    }, {
      onSuccess: (data) => {
        setPaymentDialogOpen(false)
        setPaymentAmount('')
        setPaymentRef('')
        // Navigate to matter if conversion succeeded
        if (data.matterId) {
          toast.success('Matter created', { description: 'Payment recorded and lead converted to matter.', duration: 5000 })
          router.push(`/matters/${data.matterId}`)
        } else if (data.conversionError) {
          // Show conversion blocked dialog if conversion failed
          setConversionBlockedMessage(data.conversionError)
          setConversionBlockedOpen(true)
        }
      },
    })
  }, [lead?.id, latestRetainer?.id, paymentAmount, paymentMethod, paymentRef, recordPayment])

  const handleRecordPayment = useCallback(() => {
    if (!lead?.id || !latestRetainer?.id || !paymentAmount) return
    // Show confirmation if retainer is already signed (paper flow) — this payment would trigger matter creation
    const isSignedPaper = latestRetainer.status === 'signed' && latestRetainer.signing_method === 'paper'
    if (isSignedPaper) {
      setPendingConversionAction('payment')
      setConversionConfirmOpen(true)
      return
    }
    executeRecordPayment()
  }, [lead?.id, latestRetainer, paymentAmount, executeRecordPayment])

  // ── Helper: upload signed copy (paper signing with verification) ──
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploadingSigned, setIsUploadingSigned] = useState(false)
  const [paperSignDialogOpen, setPaperSignDialogOpen] = useState(false)
  const [verificationCode, setVerificationCode] = useState('')
  const [selectedSignedFile, setSelectedSignedFile] = useState<File | null>(null)

  const executeUploadSignedCopy = useCallback(async () => {
    if (!lead?.id || !latestRetainer?.id) return
    if (!verificationCode.trim()) {
      toast.error('Please enter the verification code from the printed retainer')
      return
    }
    setIsUploadingSigned(true)
    try {
      const formData = new FormData()
      formData.append('retainerPackageId', latestRetainer.id)
      formData.append('leadId', lead.id)
      formData.append('verificationCode', verificationCode.trim())
      if (selectedSignedFile) {
        formData.append('file', selectedSignedFile)
      }

      const res = await fetch('/api/retainer/mark-paper-signed', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to upload' }))
        toast.error(data.error || 'Failed to upload signed document')
        return
      }

      const data = await res.json()
      queryClient.invalidateQueries({ queryKey: leadWorkflowKeys.retainerPackages(lead.id) })
      queryClient.invalidateQueries({ queryKey: leadKeys.detail(lead.id) })
      queryClient.invalidateQueries({ queryKey: ['leads'] }) // Refresh leads list/kanban

      if (data.matterId && data.matterNumber) {
        toast.success(`Retainer signed — Matter ${data.matterNumber} created`, {
          description: 'Lead has been converted to an active matter.',
          duration: 5000,
        })
        // Navigate to the matter page
        router.push(`/matters/${data.matterId}`)
      } else if (data.conversionError) {
        toast.success('Retainer marked as signed on paper')
        // Show blocking dialog instead of a dismissible toast
        setConversionBlockedMessage(data.conversionError)
        setConversionBlockedOpen(true)
      } else {
        toast.success('Retainer marked as signed on paper')
      }

      // Reset dialog state
      setPaperSignDialogOpen(false)
      setVerificationCode('')
      setSelectedSignedFile(null)
    } catch {
      toast.error('Failed to upload signed document')
    } finally {
      setIsUploadingSigned(false)
    }
  }, [lead?.id, latestRetainer?.id, verificationCode, selectedSignedFile, queryClient])

  const handleUploadSignedCopy = useCallback(() => {
    if (!lead?.id || !latestRetainer?.id) return
    if (!verificationCode.trim()) {
      toast.error('Please enter the verification code from the printed retainer')
      return
    }
    // Show confirmation if payment was already received — this upload would trigger matter creation
    const paymentReceived = latestRetainer.payment_status === 'paid' || latestRetainer.payment_status === 'partial'
    if (paymentReceived) {
      setPendingConversionAction('upload')
      setConversionConfirmOpen(true)
      return
    }
    executeUploadSignedCopy()
  }, [lead?.id, latestRetainer, verificationCode, executeUploadSignedCopy])

  // Handle confirmed conversion action
  const handleConversionConfirmed = useCallback(() => {
    setConversionConfirmOpen(false)
    if (pendingConversionAction === 'payment') {
      executeRecordPayment()
    } else if (pendingConversionAction === 'upload') {
      executeUploadSignedCopy()
    }
    setPendingConversionAction(null)
  }, [pendingConversionAction, executeRecordPayment, executeUploadSignedCopy])

  // Don't render for converted leads or matter mode
  if (!lead || isConverted) return null

  // ── Command Summary view ──────────────────────────────────────
  if (summary) {
    return (
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
          <span className="font-semibold text-sm text-slate-900">
            Consultation Completed — {summary.outcomeLabel}
          </span>
        </div>

        <div className="bg-slate-50 rounded-lg p-3 space-y-1.5">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            System Actions
          </p>
          {summary.commandSummary.map((line, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-slate-700">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
              <span>{line}</span>
            </div>
          ))}
        </div>

        {Object.keys(summary.currentStatus).length > 0 && (
          <div className="bg-blue-50 rounded-lg p-3 space-y-1.5">
            <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">
              Current Status
            </p>
            {Object.entries(summary.currentStatus).map(([key, value]) => (
              <div key={key} className="text-sm text-slate-700">
                <span className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}: </span>
                {value}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          {selectedOutcome === 'send_retainer' && (
            <Button size="sm" className="text-xs gap-1.5" onClick={() => { setSummary(null); resetForm() }}>
              <ArrowDown className="h-3.5 w-3.5" /> Build Fee Package
            </Button>
          )}
          {selectedOutcome !== 'send_retainer' && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => { setSummary(null); resetForm() }}
            >
              Done
            </Button>
          )}
        </div>
      </div>
    )
  }

  // ── Outcome selection grid (no outcome selected yet) ──────────
  if (!selectedOutcome) {
    return (
      <div className="px-4 py-2 space-y-3">
        {/* ── Retainer Action Hub — single source of truth for all retainer lifecycle actions ── */}
        {hasRetainerPackage && (
          <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2.5">
            {/* Header row: title + status badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-semibold text-slate-900">Retainer Package</span>
              </div>
              <Badge
                variant="secondary"
                className={cn('text-[10px] h-5', {
                  'bg-slate-100 text-slate-600': retainerState === 'draft' || retainerState === 'saved',
                  'bg-blue-100 text-blue-700': retainerState === 'sent' || retainerState === 'viewed',
                  'bg-amber-100 text-amber-700': retainerState === 'signed',
                  'bg-orange-100 text-orange-700': retainerState === 'partial',
                  'bg-green-100 text-green-700': retainerState === 'paid',
                })}
              >
                {retainerState === 'draft' && 'Draft'}
                {retainerState === 'saved' && 'Saved'}
                {retainerState === 'sent' && 'Sent'}
                {retainerState === 'viewed' && 'Viewed'}
                {retainerState === 'signed' && 'Signed'}
                {retainerState === 'partial' && 'Partial Payment'}
                {retainerState === 'paid' && 'Fully Retained'}
              </Badge>
            </div>

            {/* Metrics row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="flex items-center gap-2">
                <Send className="h-3.5 w-3.5 text-slate-400" />
                <div>
                  <p className="text-[10px] font-medium text-slate-500 uppercase">Retainer</p>
                  <p className="text-xs font-medium text-slate-800">
                    {retainerState === 'draft' && 'Not yet saved'}
                    {retainerState === 'saved' && 'Saved — not sent'}
                    {retainerState === 'sent' && 'Sent — awaiting signature'}
                    {retainerState === 'viewed' && 'Viewed by lead'}
                    {retainerState === 'signed' && 'Signed'}
                    {retainerState === 'partial' && 'Retained — partial payment'}
                    {retainerState === 'paid' && 'Fully retained'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CreditCard className="h-3.5 w-3.5 text-slate-400" />
                <div>
                  <p className="text-[10px] font-medium text-slate-500 uppercase">Payment</p>
                  <p className="text-xs font-medium text-slate-800">
                    {latestRetainer.payment_status === 'not_requested' && 'Not requested'}
                    {latestRetainer.payment_status === 'requested' && 'Requested'}
                    {latestRetainer.payment_status === 'partial' && (
                      <>Partial — {paymentBalance ? `$${(paymentBalance.totalPaid / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 })} paid` : ''}</>
                    )}
                    {latestRetainer.payment_status === 'paid' && 'Paid in full'}
                    {latestRetainer.payment_status === 'waived' && 'Waived'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CircleDot className="h-3.5 w-3.5 text-slate-400" />
                <div>
                  <p className="text-[10px] font-medium text-slate-500 uppercase">
                    {retainerState === 'partial' ? 'Balance' : 'Amount'}
                  </p>
                  <p className="text-xs font-medium text-slate-800">
                    {retainerState === 'partial' && paymentBalance ? (
                      <span className="text-orange-700">
                        ${(paymentBalance.balance / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 })} remaining
                      </span>
                    ) : (
                      latestRetainer.total_amount_cents
                        ? `$${(Number(latestRetainer.total_amount_cents) / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 })}`
                        : '—'
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* ── State-based action buttons ──────────────────────── */}
            <TooltipProvider delayDuration={300}>
              <div className="flex items-center gap-2 flex-wrap">

                {/* DRAFT — no fees yet */}
                {retainerState === 'draft' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" className="h-7 text-xs gap-1.5" onClick={scrollToRetainerBuilder}>
                        <ArrowDown className="h-3 w-3" /> Build Fees
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Scroll to the fee builder to set up the retainer package</TooltipContent>
                  </Tooltip>
                )}

                {/* SAVED — fees built, ready to send or collect payment */}
                {retainerState === 'saved' && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700"
                          onClick={openESignDialog}
                        >
                          <FileSignature className="h-3 w-3" /> Send for E-Sign
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Send retainer to the lead for electronic signature</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={printRetainerPdf} disabled={isPrintingPdf}>
                          {isPrintingPdf ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
                          Print & Sign on Paper
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Print retainer for in-person signing</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1.5 text-green-700 border-green-200 hover:bg-green-50"
                          onClick={() => setPaperSignDialogOpen(true)}
                          disabled={isUploadingSigned}
                        >
                          {isUploadingSigned ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                          Upload Signed Copy
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Upload a scanned copy and enter the verification code from the printed retainer</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1.5"
                          onClick={() => {
                            if (latestRetainer.total_amount_cents) {
                              setPaymentAmount((Number(latestRetainer.total_amount_cents) / 100).toFixed(2))
                            }
                            setPaymentDialogOpen(true)
                          }}
                        >
                          <DollarSign className="h-3 w-3" /> Record Payment
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Record a payment received from the lead</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={openRetainerPdf} disabled={isLoadingPdf}>
                          {isLoadingPdf ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                          View
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Preview the retainer agreement PDF</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={scrollToRetainerBuilder}>
                          <Pencil className="h-3 w-3" /> Edit Fees
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Modify the fee breakdown in the retainer builder</TooltipContent>
                    </Tooltip>
                  </>
                )}

                {/* SENT / VIEWED — waiting for signature */}
                {(retainerState === 'sent' || retainerState === 'viewed') && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={openRetainerPdf} disabled={isLoadingPdf}>
                          {isLoadingPdf ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                          View
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Preview the retainer agreement PDF</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={printRetainerPdf} disabled={isPrintingPdf}>
                          {isPrintingPdf ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
                          Print
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Print the retainer agreement</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1.5 text-green-700 border-green-200 hover:bg-green-50"
                          onClick={() => setPaperSignDialogOpen(true)}
                          disabled={isUploadingSigned}
                        >
                          {isUploadingSigned ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                          Upload Signed Copy
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Upload a scanned copy and enter the verification code from the printed retainer</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1.5"
                          onClick={() => {
                            if (latestRetainer.total_amount_cents) {
                              setPaymentAmount((Number(latestRetainer.total_amount_cents) / 100).toFixed(2))
                            }
                            setPaymentDialogOpen(true)
                          }}
                        >
                          <DollarSign className="h-3 w-3" /> Record Payment
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Record a payment received from the lead</TooltipContent>
                    </Tooltip>
                    {activeSigningReq && (
                      <>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm" variant="outline" className="h-7 text-xs gap-1"
                              onClick={() => sendReminder.mutate({ signingRequestId: activeSigningReq.id, leadId: lead!.id })}
                              disabled={sendReminder.isPending}
                            >
                              <Bell className="h-3 w-3" /> Remind
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Send a reminder to the lead to sign</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm" variant="outline" className="h-7 text-xs gap-1"
                              onClick={() => resendESign.mutate({ signingRequestId: activeSigningReq.id, leadId: lead!.id })}
                              disabled={resendESign.isPending}
                            >
                              <RotateCcw className="h-3 w-3" /> Resend
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Resend the signing request to the lead</TooltipContent>
                        </Tooltip>
                      </>
                    )}
                  </>
                )}

                {/* SIGNED — record payment */}
                {retainerState === 'signed' && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1.5 bg-green-600 hover:bg-green-700"
                          onClick={() => {
                            // Pre-fill amount from retainer total
                            if (latestRetainer.total_amount_cents) {
                              setPaymentAmount((Number(latestRetainer.total_amount_cents) / 100).toFixed(2))
                            }
                            setPaymentDialogOpen(true)
                          }}
                        >
                          <DollarSign className="h-3 w-3" /> Record Payment
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Record a payment to complete the retainer</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={openRetainerPdf} disabled={isLoadingPdf}>
                          {isLoadingPdf ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                          View
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Preview the retainer agreement PDF</TooltipContent>
                    </Tooltip>
                    {activeSigningReq?.status === 'signed' && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" asChild>
                            <a href={`/api/esign/requests/${activeSigningReq.id}/signed`} target="_blank" rel="noopener noreferrer">
                              <Download className="h-3 w-3" /> Signed PDF
                            </a>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Download the signed retainer PDF</TooltipContent>
                      </Tooltip>
                    )}
                  </>
                )}

                {/* PARTIAL — payment received but balance remaining */}
                {retainerState === 'partial' && (
                  <>
                    {/* Signing options — only if retainer is not yet signed (payment came first) */}
                    {latestRetainer.status !== 'signed' && activeSigningReq?.status !== 'signed' && (
                      <>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              className="h-7 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700"
                              onClick={openESignDialog}
                            >
                              <FileSignature className="h-3 w-3" /> Send for E-Sign
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Send retainer to the lead for electronic signature</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={printRetainerPdf} disabled={isPrintingPdf}>
                              {isPrintingPdf ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
                              Print & Sign
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Print retainer for in-person signing</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1.5 text-green-700 border-green-200 hover:bg-green-50"
                              onClick={() => setPaperSignDialogOpen(true)}
                              disabled={isUploadingSigned}
                            >
                              {isUploadingSigned ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                              Upload Signed Copy
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Upload a scanned copy and enter the verification code from the printed retainer</TooltipContent>
                        </Tooltip>
                      </>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1.5 bg-orange-600 hover:bg-orange-700"
                          onClick={() => {
                            // Pre-fill with remaining balance
                            if (paymentBalance) {
                              setPaymentAmount((paymentBalance.balance / 100).toFixed(2))
                            }
                            setPaymentDialogOpen(true)
                          }}
                        >
                          <DollarSign className="h-3 w-3" /> Record Additional Payment
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Record an additional payment towards the balance</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={openRetainerPdf} disabled={isLoadingPdf}>
                          {isLoadingPdf ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                          View
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Preview the retainer agreement PDF</TooltipContent>
                    </Tooltip>
                    {(activeSigningReq?.status === 'signed' || latestRetainer.status === 'signed') && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" asChild>
                            <a href={activeSigningReq?.status === 'signed' ? `/api/esign/requests/${activeSigningReq.id}/signed` : '#'} target="_blank" rel="noopener noreferrer">
                              <Download className="h-3 w-3" /> Signed PDF
                            </a>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Download the signed retainer PDF</TooltipContent>
                      </Tooltip>
                    )}
                  </>
                )}

                {/* PAID — fully retained */}
                {retainerState === 'paid' && (
                  <>
                    <Badge className="bg-green-100 text-green-700 text-xs gap-1 h-7 px-2.5">
                      <CheckCircle2 className="h-3 w-3" /> Fully Retained
                    </Badge>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={openRetainerPdf} disabled={isLoadingPdf}>
                          {isLoadingPdf ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                          View
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Preview the retainer agreement PDF</TooltipContent>
                    </Tooltip>
                    {/* Signing options — if retainer not yet signed but payment already recorded */}
                    {latestRetainer.status !== 'signed' && activeSigningReq?.status !== 'signed' && (
                      <>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={printRetainerPdf} disabled={isPrintingPdf}>
                              {isPrintingPdf ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
                              Print & Sign
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Print retainer for in-person signing</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1.5 text-green-700 border-green-200 hover:bg-green-50"
                              onClick={() => setPaperSignDialogOpen(true)}
                              disabled={isUploadingSigned}
                            >
                              {isUploadingSigned ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                              Upload Signed Copy
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Upload a scanned copy and enter the verification code from the printed retainer</TooltipContent>
                        </Tooltip>
                      </>
                    )}
                    {activeSigningReq?.status === 'signed' && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" asChild>
                            <a href={`/api/esign/requests/${activeSigningReq.id}/signed`} target="_blank" rel="noopener noreferrer">
                              <Download className="h-3 w-3" /> Signed PDF
                            </a>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Download the signed retainer PDF</TooltipContent>
                      </Tooltip>
                    )}
                  </>
                )}

                {/* Cancel — available in all pre-completion states */}
                {retainerState !== 'paid' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={cancelRetainer}
                        disabled={isCancelling}
                      >
                        {isCancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3" />}
                        Cancel
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Cancel this retainer package</TooltipContent>
                  </Tooltip>
                )}

                {/* Convert to Matter — shown when retainer is signed/paid but lead not yet converted */}
                {(retainerState === 'signed' || retainerState === 'partial' || retainerState === 'paid') && !isConverted && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        className="h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                        onClick={retryConversion}
                        disabled={isRetryingConversion}
                      >
                        {isRetryingConversion ? <Loader2 className="h-3 w-3 animate-spin" /> : <Briefcase className="h-3 w-3" />}
                        Convert to Matter
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Convert this lead to an active matter</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </TooltipProvider>

            {/* ── E-Sign dialog (inline) ──────────────────────────── */}
            {esignDialogOpen && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-blue-800">Send Retainer for E-Signature</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-blue-700">Signer Name *</Label>
                    <Input
                      value={esignSignerName}
                      onChange={(e) => setEsignSignerName(e.target.value)}
                      placeholder="Full name"
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-blue-700">Signer Email *</Label>
                    <Input
                      value={esignSignerEmail}
                      onChange={(e) => setEsignSignerEmail(e.target.value)}
                      placeholder="email@example.com"
                      type="email"
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="h-7 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700"
                    onClick={handleSendForESign}
                    disabled={esignSending || !esignSignerName.trim() || !esignSignerEmail.trim()}
                  >
                    {esignSending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                    {esignSending ? 'Sending…' : 'Send'}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEsignDialogOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* ── Paper Sign Verification Dialog ─────────────────── */}
            {paperSignDialogOpen && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-3">
                <p className="text-xs font-semibold text-green-800">Verify & Upload Signed Retainer</p>
                <p className="text-[11px] text-green-700">
                  Enter the verification code printed on the retainer document footer, then upload the scanned signed copy.
                </p>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-green-700">Verification Code *</Label>
                    <Input
                      placeholder="RET-XXXX-XXXX"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.toUpperCase())}
                      className="h-8 text-xs bg-white font-mono tracking-wider"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-green-700">Signed Document (optional)</Label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      className="text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-green-100 file:text-green-700 hover:file:bg-green-200"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) setSelectedSignedFile(file)
                      }}
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => {
                    setPaperSignDialogOpen(false)
                    setVerificationCode('')
                    setSelectedSignedFile(null)
                  }}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                    disabled={!verificationCode.trim() || isUploadingSigned}
                    onClick={handleUploadSignedCopy}
                  >
                    {isUploadingSigned ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                    Verify & Mark Signed
                  </Button>
                </div>
              </div>
            )}

            {/* ── Payment dialog (inline) ──────────────────────────── */}
            {paymentDialogOpen && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-green-800">Record Payment</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-green-700">Method *</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger className="h-8 text-xs bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="e_transfer">E-Transfer</SelectItem>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="credit_card">Credit Card</SelectItem>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-green-700">Amount ($) *</Label>
                    <Input
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="0.00"
                      type="number"
                      step="0.01"
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-green-700">Reference</Label>
                    <Input
                      value={paymentRef}
                      onChange={(e) => setPaymentRef(e.target.value)}
                      placeholder="e.g. transfer #"
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="h-7 text-xs gap-1.5 bg-green-600 hover:bg-green-700"
                    onClick={handleRecordPayment}
                    disabled={recordPayment.isPending || !paymentAmount || parseFloat(paymentAmount) <= 0}
                  >
                    {recordPayment.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <DollarSign className="h-3 w-3" />}
                    {recordPayment.isPending ? 'Recording…' : 'Record'}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPaymentDialogOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* ── Conversion Confirmation Dialog ────────────────── */}
            <AlertDialog open={conversionConfirmOpen} onOpenChange={(open) => {
              setConversionConfirmOpen(open)
              if (!open) setPendingConversionAction(null)
            }}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    Confirm Lead Conversion
                  </AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-3 text-sm text-slate-600">
                      <p>
                        Both the signed retainer and payment have been received. Completing this action will trigger the following:
                      </p>
                      <ul className="space-y-1.5 ml-1">
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                          <span>A new <strong className="text-slate-800">matter</strong> will be created from this lead</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                          <span>A <strong className="text-slate-800">document checklist</strong> will be sent to the client</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                          <span>A <strong className="text-slate-800">client portal</strong> will be created</span>
                        </li>
                      </ul>
                      <p className="text-amber-600 font-medium text-xs pt-1">
                        This action cannot be undone.
                      </p>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleConversionConfirmed}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    Confirm & Convert to Matter
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* ── Conversion Blocked Dialog ── */}
            <AlertDialog open={conversionBlockedOpen} onOpenChange={setConversionBlockedOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    Matter Could Not Be Created
                  </AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-3 text-sm text-slate-600">
                      <p>
                        The following steps must be completed before this lead can be converted to a matter:
                      </p>
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-sm">
                        <ul className="list-disc list-inside space-y-1">
                          {conversionBlockedMessage.split('\n').map((reason, i) => (
                            <li key={i} className="font-medium">{reason}</li>
                          ))}
                        </ul>
                      </div>
                      <p className="text-slate-500 text-xs">
                        Complete the steps above, then click <strong>Convert to Matter</strong> to retry.
                      </p>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Got it</AlertDialogCancel>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {/* Hide outcome grid once retainer package exists — only show if no active retainer */}
        {!hasRetainerPackage && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {CONSULTATION_OUTCOMES.map((o) => {
              const IconComp = ICON_MAP[o.icon as keyof typeof ICON_MAP]
              const disabled = !canSelectOutcome(o.value)

              return (
                <TooltipProvider key={o.value}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => setSelectedOutcome(o.value)}
                        className={cn(
                          'flex flex-col items-center gap-1.5 p-2.5 rounded-lg border transition-all text-center',
                          'hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm',
                          'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-slate-200',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1'
                        )}
                      >
                        {IconComp && (
                          <IconComp
                            className="h-5 w-5"
                            style={{ color: o.color }}
                          />
                        )}
                        <span className="text-xs font-medium text-slate-700 leading-tight">
                          {o.label}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[200px]">
                      {o.description}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── Inline form for selected outcome ──────────────────────────
  const outcomeInfo = CONSULTATION_OUTCOMES.find((o) => o.value === selectedOutcome)!

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Header with back button */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-slate-500"
          onClick={resetForm}
          disabled={isSubmitting}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Badge
          variant="secondary"
          className="text-xs gap-1.5"
          style={{
            backgroundColor: `${outcomeInfo.color}15`,
            color: outcomeInfo.color,
            borderColor: `${outcomeInfo.color}40`,
          }}
        >
          {outcomeInfo.label}
        </Badge>
        <span className="text-xs text-slate-500">{outcomeInfo.description}</span>
      </div>

      <Separator />

      {/* Form fields per outcome */}
      <div className="space-y-3">
        {/* ── SEND RETAINER form ──────────────────────────────── */}
        {selectedOutcome === 'send_retainer' && (
          <>
            {/* Practice area required warning */}
            {!lead?.practice_area_id && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                Please select a <strong>Practice Area</strong> in the Core Data card above before sending the retainer.
              </div>
            )}

            {/* Pre-filled from Core Data notice */}
            {lead?.matter_type_id && (
              <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                Matter type and person scope pre-filled from Core Data. You can override below if needed.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Matter Type *
                  {lead?.matter_type_id && <span className="text-green-600 ml-1">(from Core Data)</span>}
                </Label>
                <Select value={matterTypeId} onValueChange={setMatterTypeId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select matter type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {matterTypes?.map((mt) => (
                      <SelectItem key={mt.id} value={mt.id}>
                        {mt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">
                  Person Scope *
                  {lead?.person_scope && lead.person_scope !== 'single' && (
                    <span className="text-green-600 ml-1">(from Core Data)</span>
                  )}
                </Label>
                <Select
                  value={personScope}
                  onValueChange={(v) => setPersonScope(v as 'single' | 'joint')}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERSON_SCOPES.map((ps) => (
                      <SelectItem key={ps.value} value={ps.value}>
                        {ps.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Responsible Lawyer *</Label>
                <Select value={responsibleLawyerId} onValueChange={setResponsibleLawyerId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select lawyer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {lawyers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.first_name} {u.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Billing Type *</Label>
                <Select value={billingType} onValueChange={setBillingType}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flat_fee">Flat Fee</SelectItem>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="contingency">Contingency</SelectItem>
                    <SelectItem value="retainer">Retainer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Default template indicator */}
            {matterTypeId && (
              <div className="text-xs text-slate-500 bg-slate-50 rounded p-2">
                {defaultTemplate ? (
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    Default fee template: <strong>{defaultTemplate.name}</strong> (will be auto-applied)
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    No default fee template for this matter type ({personScope}). Manual fee entry will be required.
                  </span>
                )}
              </div>
            )}

            {/* Missing Core Data warning */}
            {!lead?.matter_type_id && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                Tip: Set the matter type in Core Data below so it auto-fills here next time.
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Consultation Notes *</Label>
              <Textarea
                value={consultationNotes}
                onChange={(e) => setConsultationNotes(e.target.value)}
                placeholder="Key discussion points, lead requirements, next steps..."
                rows={3}
                className="text-sm"
              />
            </div>
          </>
        )}

        {/* ── FOLLOW UP LATER form ───────────────────────────── */}
        {selectedOutcome === 'follow_up_later' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Follow-up Date *</Label>
                <Input
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Follow-up Owner *</Label>
                <Select value={followUpOwner} onValueChange={setFollowUpOwner}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {lawyers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.first_name} {u.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Temperature</Label>
                <Select value={leadTemperature} onValueChange={setLeadTemperature}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Update temperature..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hot">Hot</SelectItem>
                    <SelectItem value="warm">Warm</SelectItem>
                    <SelectItem value="cold">Cold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Consultation Notes *</Label>
              <Textarea
                value={consultationNotes}
                onChange={(e) => setConsultationNotes(e.target.value)}
                placeholder="What was discussed, why the lead needs time..."
                rows={3}
                className="text-sm"
              />
            </div>
          </>
        )}

        {/* ── LEAD DECLINED form ────────────────────────────── */}
        {selectedOutcome === 'client_declined' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Decline Reason *</Label>
                <Select value={declineReason} onValueChange={setDeclineReason}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select reason..." />
                  </SelectTrigger>
                  <SelectContent>
                    {DECLINE_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {declineReason === 'Other' && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Details *</Label>
                  <Input
                    value={declineDetails}
                    onChange={(e) => setDeclineDetails(e.target.value)}
                    placeholder="Specify reason..."
                    className="h-9 text-sm"
                  />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Consultation Notes *</Label>
              <Textarea
                value={consultationNotes}
                onChange={(e) => setConsultationNotes(e.target.value)}
                placeholder="Summary of the consultation..."
                rows={3}
                className="text-sm"
              />
            </div>
          </>
        )}

        {/* ── NOT A FIT form ─────────────────────────────────── */}
        {selectedOutcome === 'not_a_fit' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Reason *</Label>
                <Select value={notFitReason} onValueChange={setNotFitReason}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select reason..." />
                  </SelectTrigger>
                  <SelectContent>
                    {NOT_FIT_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {notFitReason === 'Other' && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Details *</Label>
                  <Input
                    value={notFitDetails}
                    onChange={(e) => setNotFitDetails(e.target.value)}
                    placeholder="Specify reason..."
                    className="h-9 text-sm"
                  />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Consultation Notes *</Label>
              <Textarea
                value={consultationNotes}
                onChange={(e) => setConsultationNotes(e.target.value)}
                placeholder="Summary of the consultation..."
                rows={3}
                className="text-sm"
              />
            </div>
          </>
        )}

        {/* ── REFERRED OUT form ──────────────────────────────── */}
        {selectedOutcome === 'referred_out' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Referred To *</Label>
                <Input
                  value={referredToName}
                  onChange={(e) => setReferredToName(e.target.value)}
                  placeholder="Firm or lawyer name..."
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Referral Reason *</Label>
                <Select value={referralReason} onValueChange={setReferralReason}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select reason..." />
                  </SelectTrigger>
                  <SelectContent>
                    {REFERRAL_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Consultation Notes *</Label>
              <Textarea
                value={consultationNotes}
                onChange={(e) => setConsultationNotes(e.target.value)}
                placeholder="Summary of the consultation..."
                rows={3}
                className="text-sm"
              />
            </div>
          </>
        )}

        {/* ── NO SHOW — confirmation only ────────────────────── */}
        {selectedOutcome === 'no_show' && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            <div className="flex items-start gap-2">
              <UserX className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">
                  Mark {contact?.first_name ?? 'this lead'} as No-Show?
                </p>
                <p className="text-xs mt-1 text-amber-700">
                  A high-priority follow-up task will be created for tomorrow.
                  The lead will remain at its current pipeline stage.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── BOOK FOLLOW-UP form ────────────────────────────── */}
        {selectedOutcome === 'book_follow_up' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Type *</Label>
              <Select
                value={followUpType}
                onValueChange={(v) => setFollowUpType(v as 'phone' | 'in_person' | 'video')}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FOLLOW_UP_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Date *</Label>
              <Input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">With *</Label>
              <Select value={followUpOwner} onValueChange={setFollowUpOwner}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {lawyers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.first_name} {u.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* ── Submit buttons ──────────────────────────────────── */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          onClick={resetForm}
          disabled={isSubmitting}
          className="text-xs"
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!isFormValid || isSubmitting}
          className="text-xs gap-1.5"
          style={{
            backgroundColor: outcomeInfo.color,
            borderColor: outcomeInfo.color,
          }}
        >
          {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Confirm {outcomeInfo.label}
        </Button>
      </div>
    </div>
  )
}
