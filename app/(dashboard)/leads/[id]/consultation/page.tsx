'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  Phone,
  Mail,
  ArrowLeft,
  CheckCircle2,
  CalendarClock,
  XCircle,
  ArrowUpRight,
  Clock,
  ThumbsDown,
  Copy,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { createClient } from '@/lib/supabase/client'
import { leadKeys } from '@/lib/queries/leads'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { DatePicker } from '@/components/ui/date-picker'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import type { LeadOutcome } from '@/lib/types/database'

// ── Types ────────────────────────────────────────────────────────────────────

interface ContactRow {
  id: string
  first_name: string | null
  last_name: string | null
  email_primary: string | null
  phone_primary: string | null
  source: string | null
  organization_name: string | null
}

interface LeadRow {
  id: string
  tenant_id: string
  contact_id: string
  status: string | null
  source: string | null
  notes: string | null
  practice_area_id: string | null
}

interface PriorOutcomeRow {
  id: string
  outcome: string
  outcome_at: string
  notes: string | null
  follow_up_date: string | null
  referral_target: string | null
}

interface MatterCountRow {
  id: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NOT_QUALIFIED_REASONS = [
  { value: 'Income', label: 'Income  -  Does not meet financial threshold' },
  { value: 'Criminal', label: 'Criminal  -  Inadmissibility concerns' },
  { value: 'Status', label: 'Status  -  Immigration status issue' },
  { value: 'Age', label: 'Age  -  Age requirement not met' },
  { value: 'Policy', label: 'Policy  -  Firm policy conflict' },
  { value: 'Other', label: 'Other' },
]

const OUTCOME_BUTTONS: {
  outcome: LeadOutcome
  label: string
  icon: React.ElementType
  className: string
  description: string
}[] = [
  {
    outcome: 'RETAIN',
    label: 'Retain',
    icon: CheckCircle2,
    className: 'border-emerald-500/20 text-emerald-400 hover:bg-emerald-950/30 hover:border-emerald-400',
    description: 'Client retained  -  generate retainer agreement',
  },
  {
    outcome: 'FOLLOW_UP',
    label: 'Follow Up',
    icon: CalendarClock,
    className: 'border-blue-500/20 text-blue-400 hover:bg-blue-950/30 hover:border-blue-400',
    description: 'Schedule a follow-up task',
  },
  {
    outcome: 'NOT_QUALIFIED',
    label: 'Not Qualified',
    icon: XCircle,
    className: 'border-orange-500/20 text-orange-400 hover:bg-orange-950/30 hover:border-orange-400',
    description: 'Client does not qualify',
  },
  {
    outcome: 'REFERRED_OUT',
    label: 'Referred Out',
    icon: ArrowUpRight,
    className: 'border-purple-500/20 text-purple-400 hover:bg-purple-950/30 hover:border-purple-400',
    description: 'Refer to another firm',
  },
  {
    outcome: 'NO_SHOW',
    label: 'No Show',
    icon: Clock,
    className: 'border-amber-500/20 text-amber-400 hover:bg-amber-950/30 hover:border-amber-400',
    description: 'Client did not attend',
  },
  {
    outcome: 'DECLINED',
    label: 'Declined',
    icon: ThumbsDown,
    className: 'border-red-500/20 text-red-400 hover:bg-red-950/30 hover:border-red-400',
    description: 'Client declined to retain',
  },
  {
    outcome: 'DUPLICATE',
    label: 'Duplicate',
    icon: Copy,
    className: 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-400',
    description: 'Merge with existing contact',
  },
]

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useLead(id: string) {
  return useQuery({
    queryKey: leadKeys.detail(id),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('leads')
        .select('id, tenant_id, contact_id, status, source, notes, practice_area_id')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as LeadRow
    },
    enabled: !!id,
  })
}

function useContact(contactId: string | undefined) {
  return useQuery({
    queryKey: ['contacts', contactId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email_primary, phone_primary, source, organization_name')
        .eq('id', contactId!)
        .single()
      if (error) throw error
      return data as ContactRow
    },
    enabled: !!contactId,
  })
}

function useLeadOutcomes(leadId: string) {
  return useQuery({
    queryKey: ['lead_outcomes', leadId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('lead_outcomes')
        .select('id, outcome, outcome_at, notes, follow_up_date, referral_target')
        .eq('lead_id', leadId)
        .order('outcome_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as PriorOutcomeRow[]
    },
    enabled: !!leadId,
  })
}

function useLinkedMattersCount(contactId: string | undefined) {
  return useQuery({
    queryKey: ['matters_count', contactId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matters')
        .select('id')
        .eq('contact_id', contactId!)
      if (error) throw error
      return (data ?? []) as MatterCountRow[]
    },
    enabled: !!contactId,
  })
}

function useContactSearch(query: string, tenantId: string) {
  return useQuery({
    queryKey: ['contact_search', tenantId, query],
    queryFn: async () => {
      if (!query.trim()) return []
      const supabase = createClient()
      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email_primary')
        .eq('tenant_id', tenantId)
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email_primary.ilike.%${query}%`)
        .limit(10)
      if (error) throw error
      return (data ?? []) as ContactRow[]
    },
    enabled: !!tenantId && query.trim().length > 1,
  })
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ConsultationPage() {
  const params = useParams()
  const leadId = params.id as string
  const router = useRouter()
  const queryClient = useQueryClient()

  const { tenant } = useTenant()
  const { appUser } = useUser()

  const tenantId = tenant?.id ?? ''
  const userId = appUser?.id ?? ''

  const { data: lead, isLoading: leadLoading } = useLead(leadId)
  const { data: contact, isLoading: contactLoading } = useContact(lead?.contact_id)
  const { data: priorOutcomes } = useLeadOutcomes(leadId)
  const { data: linkedMatters } = useLinkedMattersCount(lead?.contact_id)

  // Notes auto-save state
  const [notes, setNotes] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Seed notes from DB once
  useEffect(() => {
    if (lead?.notes !== undefined && notes === '') {
      setNotes(lead?.notes ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.notes])

  // Auto-save notes every 5 seconds after last change
  const saveNotes = useCallback(async (value: string) => {
    if (!leadId) return
    setNotesSaving(true)
    try {
      const supabase = createClient()
      await supabase.from('leads').update({ notes: value }).eq('id', leadId)
    } finally {
      setNotesSaving(false)
    }
  }, [leadId])

  const handleNotesChange = (value: string) => {
    setNotes(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => saveNotes(value), 5000)
  }

  // Dialog states
  const [activeDialog, setActiveDialog] = useState<LeadOutcome | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // FOLLOW_UP
  const [followUpDate, setFollowUpDate] = useState('')
  const [followUpNote, setFollowUpNote] = useState('')

  // NOT_QUALIFIED
  const [nqReason, setNqReason] = useState('')

  // REFERRED_OUT
  const [firmName, setFirmName] = useState('')

  // DECLINED
  const [declinedNote, setDeclinedNote] = useState('')

  // NO_SHOW
  const [showReschedule, setShowReschedule] = useState(false)

  // DUPLICATE
  const [contactQuery, setContactQuery] = useState('')
  const [canonicalContactId, setCanonicalContactId] = useState('')
  const { data: contactSearchResults } = useContactSearch(contactQuery, tenantId)

  const openDialog = (outcome: LeadOutcome) => {
    setActiveDialog(outcome)
    setSubmitting(false)
  }
  const closeDialog = () => setActiveDialog(null)

  // ── Shared outcome recorder ──────────────────────────────────────────────

  const recordOutcome = useMutation({
    mutationFn: async (payload: {
      outcome: LeadOutcome
      notes?: string | null
      follow_up_date?: string | null
      referral_target?: string | null
      duplicate_of?: string | null
      newStatus: string
    }) => {
      const supabase = createClient()

      await supabase.from('lead_outcomes').insert({
        tenant_id: tenantId,
        lead_id: leadId,
        outcome: payload.outcome,
        notes: payload.notes ?? null,
        follow_up_date: payload.follow_up_date ?? null,
        referral_target: payload.referral_target ?? null,
        duplicate_of: payload.duplicate_of ?? null,
        actioned_by: userId || null,
      })

      await supabase
        .from('leads')
        .update({ status: payload.newStatus })
        .eq('id', leadId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadKeys.lists() })
      queryClient.invalidateQueries({ queryKey: leadKeys.detail(leadId) })
      queryClient.invalidateQueries({ queryKey: ['lead_outcomes', leadId] })
    },
    onError: () => {
      toast.error('Failed to record outcome. Please try again.')
    },
  })

  // ── Outcome handlers ─────────────────────────────────────────────────────

  const handleRetain = async () => {
    setSubmitting(true)
    try {
      await recordOutcome.mutateAsync({
        outcome: 'RETAIN',
        newStatus: 'converted',
      })
      toast.success('Lead retained  -  redirecting to new matter')
      router.push(`/matters/new?lead=${leadId}`)
    } finally {
      setSubmitting(false)
      closeDialog()
    }
  }

  const handleFollowUp = async () => {
    if (!followUpDate) {
      toast.error('Please select a follow-up date.')
      return
    }
    setSubmitting(true)
    try {
      const supabase = createClient()
      const contactName = contact
        ? [contact.first_name, contact.last_name].filter(Boolean).join(' ')
        : 'Lead'

      await supabase.from('tasks').insert({
        tenant_id: tenantId,
        matter_id: null,
        contact_id: lead?.contact_id ?? null,
        title: `Follow up: ${contactName}`,
        due_date: followUpDate,
        category: 'follow_up',
        status: 'todo',
        task_type: 'general',
        created_by: userId || null,
        notes: followUpNote || null,
      })

      await recordOutcome.mutateAsync({
        outcome: 'FOLLOW_UP',
        notes: followUpNote || null,
        follow_up_date: followUpDate,
        newStatus: 'follow_up',
      })
      toast.success('Follow-up task created')
      closeDialog()
    } finally {
      setSubmitting(false)
    }
  }

  const handleNotQualified = async () => {
    if (!nqReason) {
      toast.error('Please select a reason.')
      return
    }
    setSubmitting(true)
    try {
      await recordOutcome.mutateAsync({
        outcome: 'NOT_QUALIFIED',
        notes: nqReason,
        newStatus: 'closed_lost',
      })
      toast.success('Lead closed  -  not qualified')
      closeDialog()
      router.push('/leads')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReferredOut = async () => {
    if (!firmName.trim()) {
      toast.error('Please enter the referring firm name.')
      return
    }
    setSubmitting(true)
    try {
      await recordOutcome.mutateAsync({
        outcome: 'REFERRED_OUT',
        referral_target: firmName.trim(),
        newStatus: 'referred',
      })
      toast.success('Lead referred out')
      closeDialog()
      router.push('/leads')
    } finally {
      setSubmitting(false)
    }
  }

  const handleNoShow = async () => {
    setSubmitting(true)
    try {
      await recordOutcome.mutateAsync({
        outcome: 'NO_SHOW',
        newStatus: 'follow_up',
      })
      toast.success('No-show recorded')
      closeDialog()
      if (showReschedule) {
        router.push(`/leads?reschedule=${leadId}`)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeclined = async () => {
    setSubmitting(true)
    try {
      await recordOutcome.mutateAsync({
        outcome: 'DECLINED',
        notes: declinedNote || null,
        newStatus: 'closed_lost',
      })
      toast.success('Lead declined')
      closeDialog()
    } finally {
      setSubmitting(false)
    }
  }

  const handleDuplicate = async () => {
    if (!canonicalContactId) {
      toast.error('Please select the canonical contact.')
      return
    }
    setSubmitting(true)
    try {
      await recordOutcome.mutateAsync({
        outcome: 'DUPLICATE',
        duplicate_of: canonicalContactId,
        newStatus: 'duplicate',
      })
      toast.success('Duplicate recorded')
      closeDialog()
      router.push(`/contacts/${canonicalContactId}`)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const contactName = contact
    ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unknown'
    : ' - '

  const initials = contact
    ? [contact.first_name?.[0], contact.last_name?.[0]].filter(Boolean).join('').toUpperCase()
    : '?'

  const isLoading = leadLoading || contactLoading

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b bg-white">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/leads')}
          className="gap-1.5 text-slate-500"
        >
          <ArrowLeft className="h-4 w-4" />
          Leads
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <span className="text-sm font-medium text-slate-700">Consultation Workspace</span>
        <Badge variant="outline" className="ml-auto text-[10px]">
          {format(new Date(), 'MMMM d, yyyy  -  h:mm a')}
        </Badge>
      </div>

      {/* Body  -  3-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Rail ── */}
        <aside className="w-[250px] shrink-0 border-r bg-slate-50/60 overflow-y-auto p-4 space-y-5">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          ) : (
            <>
              {/* Contact summary */}
              <div className="flex flex-col items-center text-center gap-2 pt-2">
                <Avatar className="h-14 w-14">
                  <AvatarFallback className="bg-blue-950/40 text-blue-400 text-lg font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-semibold text-slate-800 leading-tight">{contactName}</p>
                  {contact?.organization_name && (
                    <p className="text-[11px] text-slate-500 mt-0.5">{contact.organization_name}</p>
                  )}
                </div>
              </div>

              {/* Contact details */}
              <div className="space-y-1.5">
                {contact?.phone_primary && (
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span>{contact.phone_primary}</span>
                  </div>
                )}
                {contact?.email_primary && (
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{contact.email_primary}</span>
                  </div>
                )}
              </div>

              {/* Lead source badge */}
              {lead?.source && (
                <div>
                  <p className="text-[10px] uppercase font-semibold text-slate-400 mb-1 tracking-wide">Source</p>
                  <Badge variant="secondary" className="text-[11px]">
                    {lead.source}
                  </Badge>
                </div>
              )}

              <Separator />

              {/* Linked matters */}
              <div>
                <p className="text-[10px] uppercase font-semibold text-slate-400 mb-1 tracking-wide">Linked Matters</p>
                <p className="text-sm font-medium text-slate-700">
                  {linkedMatters?.length ?? 0}
                </p>
              </div>

              {/* Prior consultations */}
              {priorOutcomes && priorOutcomes.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase font-semibold text-slate-400 mb-2 tracking-wide">
                    Prior Consultations
                  </p>
                  <div className="space-y-1.5">
                    {priorOutcomes.map((o) => (
                      <div key={o.id} className="text-[11px] bg-white rounded border border-slate-100 p-2">
                        <p className="font-medium text-slate-700">{o.outcome.replace('_', ' ')}</p>
                        <p className="text-slate-400">
                          {format(new Date(o.outcome_at), 'MMM d, yyyy')}
                        </p>
                        {o.notes && (
                          <p className="text-slate-500 mt-0.5 truncate">{o.notes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </aside>

        {/* ── Main area ── */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Consultation Notes */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-slate-800">Consultation Notes</h2>
              {notesSaving && (
                <span className="flex items-center gap-1 text-[11px] text-slate-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving…
                </span>
              )}
            </div>
            <Textarea
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Enter consultation notes here… (auto-saves after 5 seconds)"
              className="min-h-[200px] resize-y text-sm"
            />
          </section>

          {/* Immigration Assessment panel  -  shown if lead has intake data */}
          {lead?.practice_area_id && (
            <section className="bg-blue-950/30/60 border border-blue-100 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-400 mb-2">Immigration Assessment</h3>
              <p className="text-xs text-blue-600">
                Questionnaire data and risk factors will appear here when an intake form is linked to this lead.
              </p>
            </section>
          )}
        </main>

        {/* ── Right Panel  -  7 Outcome Buttons ── */}
        <aside className="w-[230px] shrink-0 border-l bg-white overflow-y-auto p-4">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Consultation Outcome
          </h3>
          <div className="space-y-2">
            {OUTCOME_BUTTONS.map(({ outcome, label, icon: Icon, className, description }) => (
              <button
                key={outcome}
                onClick={() => openDialog(outcome)}
                disabled={isLoading}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                  className
                )}
                title={description}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </aside>
      </div>

      {/* ── Dialogs ── */}

      {/* RETAIN */}
      <Dialog open={activeDialog === 'RETAIN'} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retain Client</DialogTitle>
            <DialogDescription>
              This will mark the lead as converted and take you to the new matter form.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Retain <strong>{contactName}</strong>? A new matter will be created from this lead.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleRetain} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Retain &amp; Create Matter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* FOLLOW UP */}
      <Dialog open={activeDialog === 'FOLLOW_UP'} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Follow Up</DialogTitle>
            <DialogDescription>
              A task will be created and the lead status will be set to follow-up.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="followUpDate">Follow-up Date</Label>
              <DatePicker
                id="followUpDate"
                value={followUpDate}
                onChange={setFollowUpDate}
                placeholder="Select a date"
                minDate={new Date()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="followUpNote">Note (optional)</Label>
              <Textarea
                id="followUpNote"
                value={followUpNote}
                onChange={(e) => setFollowUpNote(e.target.value)}
                placeholder="Reason for follow-up…"
                className="min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleFollowUp} disabled={submitting || !followUpDate}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Follow-up Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* NOT QUALIFIED */}
      <Dialog open={activeDialog === 'NOT_QUALIFIED'} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Not Qualified</DialogTitle>
            <DialogDescription>
              Select the reason this lead does not qualify. The lead will be closed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="nqReason">Reason</Label>
            <Select value={nqReason} onValueChange={setNqReason}>
              <SelectTrigger id="nqReason">
                <SelectValue placeholder="Select a reason…" />
              </SelectTrigger>
              <SelectContent>
                {NOT_QUALIFIED_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={handleNotQualified}
              disabled={submitting || !nqReason}
              variant="destructive"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Close Lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* REFERRED OUT */}
      <Dialog open={activeDialog === 'REFERRED_OUT'} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Referred Out</DialogTitle>
            <DialogDescription>
              Enter the firm or lawyer this lead is being referred to.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="firmName">Referring Firm / Lawyer</Label>
            <Input
              id="firmName"
              value={firmName}
              onChange={(e) => setFirmName(e.target.value)}
              placeholder="e.g. Smith &amp; Associates"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleReferredOut} disabled={submitting || !firmName.trim()}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Record Referral
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* NO SHOW */}
      <Dialog open={activeDialog === 'NO_SHOW'} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>No Show</DialogTitle>
            <DialogDescription>
              The client did not attend the consultation. Would you like to reschedule?
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowReschedule(!showReschedule)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
                showReschedule
                  ? 'border-blue-400 bg-blue-950/30 text-blue-400'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300'
              )}
            >
              <CalendarClock className="h-4 w-4" />
              {showReschedule ? 'Will reschedule' : 'Reschedule appointment?'}
            </button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleNoShow} disabled={submitting} variant="destructive">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Record No Show
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DECLINED */}
      <Dialog open={activeDialog === 'DECLINED'} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Client Declined</DialogTitle>
            <DialogDescription>
              The client has declined to retain. Add an optional note below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="declinedNote">Note (optional)</Label>
            <Textarea
              id="declinedNote"
              value={declinedNote}
              onChange={(e) => setDeclinedNote(e.target.value)}
              placeholder="e.g. Client chose to self-represent"
              className="min-h-[80px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleDeclined} disabled={submitting} variant="destructive">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Record Declined
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DUPLICATE */}
      <Dialog open={activeDialog === 'DUPLICATE'} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Duplicate</DialogTitle>
            <DialogDescription>
              Search for the canonical contact this lead should be merged with.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="contactQuery">Search Contacts</Label>
              <Input
                id="contactQuery"
                value={contactQuery}
                onChange={(e) => setContactQuery(e.target.value)}
                placeholder="Name or email…"
              />
            </div>
            {contactSearchResults && contactSearchResults.length > 0 && (
              <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                {contactSearchResults.map((c) => {
                  const name = ([c.first_name, c.last_name].filter(Boolean).join(' ') || c.email_primary) ?? ' - '
                  const isSelected = canonicalContactId === c.id
                  return (
                    <button
                      key={c.id}
                      onClick={() => setCanonicalContactId(c.id)}
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm transition-colors',
                        isSelected ? 'bg-blue-950/30 text-blue-400 font-medium' : 'hover:bg-slate-50 text-slate-700'
                      )}
                    >
                      <p className="font-medium">{name}</p>
                      {c.email_primary && (
                        <p className="text-[11px] text-slate-400">{c.email_primary}</p>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
            {canonicalContactId && (
              <p className="text-xs text-blue-600">
                Selected contact ID: {canonicalContactId}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleDuplicate} disabled={submitting || !canonicalContactId}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Mark as Duplicate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
