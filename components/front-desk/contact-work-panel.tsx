'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  User,
  Phone,
  Mail,
  Calendar,
  StickyNote,
  Activity,
  Clock,
  Shield,
  AlertTriangle,
  Bell,
  Briefcase,
  MapPin,
  Globe,
  ChevronDown,
  ChevronUp,
  FileText,
  Download,
  Eye,
  Pin,
  Send,
  Maximize2,
  Loader2,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useDocumentSignedUrl } from '@/lib/queries/documents'
import { DocumentViewer } from '@/components/shared/document-viewer'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ContactActionBar } from './contact-actions'
import { CallOutcomeBar } from './call-outcome-bar'
import {
  useFrontDeskContact,
  useFrontDeskTimeline,
  useFrontDeskRiskFlags,
  useFrontDeskStaffList,
  useFrontDeskConfig,
  useFrontDeskInteractionBreakdown,
  type FrontDeskTimelineEvent,
} from '@/lib/queries/front-desk-queries'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useNotes, useCreateNote } from '@/lib/queries/notes'
import { useUser } from '@/lib/hooks/use-user'
import { ScreeningAnswersPanel } from '@/components/shared/screening-answers-panel'
import { formatRelativeDate } from '@/lib/utils/formatters'
import { ContactFullProfile } from './contact-full-profile'

// ─── Props ───────────────────────────────────────────────────────────────────

interface ContactWorkPanelProps {
  contactId: string | null // null = closed
  onClose: () => void
  onCreateIntake?: () => void // to open quick create wizard
}

// ─── Risk Flag Configuration ─────────────────────────────────────────────────

const RISK_FLAG_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  do_not_contact: {
    label: 'Do Not Contact',
    className: 'bg-red-100 text-red-800 border-red-200',
    icon: <AlertTriangle className="size-3" />,
  },
  billing_restricted: {
    label: 'Billing Restricted',
    className: 'bg-amber-100 text-amber-800 border-amber-200',
    icon: <Shield className="size-3" />,
  },
  id_verification_required: {
    label: 'ID Verification Required',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: <Shield className="size-3" />,
  },
  vip: {
    label: 'VIP',
    className: 'bg-purple-100 text-purple-800 border-purple-200',
    icon: <User className="size-3" />,
  },
  special_needs: {
    label: 'Special Needs',
    className: 'bg-cyan-100 text-cyan-800 border-cyan-200',
    icon: <User className="size-3" />,
  },
}

// ─── Activity Type Icon Mapping ──────────────────────────────────────────────

function getActivityIcon(activityType: string) {
  if (activityType.includes('call')) return <Phone className="size-4 text-emerald-600" />
  if (activityType.includes('email')) return <Mail className="size-4 text-blue-600" />
  if (activityType.includes('note')) return <StickyNote className="size-4 text-amber-600" />
  if (activityType.includes('meeting')) return <Calendar className="size-4 text-violet-600" />
  if (activityType.includes('appointment')) return <Calendar className="size-4 text-violet-600" />
  if (activityType.includes('notif') || activityType.includes('staff')) return <Bell className="size-4 text-purple-600" />
  if (activityType.includes('task')) return <Activity className="size-4 text-indigo-600" />
  if (activityType.includes('document')) return <Activity className="size-4 text-cyan-600" />
  return <Activity className="size-4 text-slate-500" />
}

// ─── Relative Time Formatter ─────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffSec < 60) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`
  return date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── DOB Masked Display ──────────────────────────────────────────────────────

function MaskedDateOfBirth({ dob }: { dob: string }) {
  // Format: show only the day, mask year and month for privacy
  const parts = dob.split('-') // YYYY-MM-DD
  const dayPart = parts[2] ?? '??'
  const masked = `\u25CF\u25CF\u25CF\u25CF-\u25CF\u25CF-${dayPart}`

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help">{masked}</span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{dob}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ─── Loading Skeleton ────────────────────────────────────────────────────────

function ContactWorkPanelSkeleton() {
  return (
    <div className="space-y-6 p-6">
      {/* Identity header skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-7 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-24" />
        </div>
      </div>

      {/* Contact details skeleton */}
      <div className="space-y-4">
        <Skeleton className="h-5 w-32" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Timeline skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-36" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>

      {/* Action bar skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-24" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
    </div>
  )
}

// ─── Detail Row ──────────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </dt>
      <dd className="text-sm text-foreground">
        {value || <span className="text-muted-foreground italic">--</span>}
      </dd>
    </div>
  )
}

// ─── Timeline Event Row ──────────────────────────────────────────────────────

function TimelineEventRow({ event }: { event: FrontDeskTimelineEvent }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
        {getActivityIcon(event.activity_type)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{event.title}</p>
        {event.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{event.description}</p>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="size-3" />
        <span>{formatRelativeTime(event.created_at)}</span>
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ContactWorkPanel({ contactId, onClose, onCreateIntake }: ContactWorkPanelProps) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''
  const [meetingBreakdownOpen, setMeetingBreakdownOpen] = useState(false)
  const [mattersExpanded, setMattersExpanded] = useState(false)
  const [appointmentsExpanded, setAppointmentsExpanded] = useState(false)
  const [docsExpanded, setDocsExpanded] = useState(true) // open by default so docs are visible
  const [viewingDoc, setViewingDoc] = useState<{
    storagePath: string
    fileName: string
    fileType: string | null
    storageBucket: string | null
  } | null>(null)
  const getSignedUrl = useDocumentSignedUrl()
  const [fullProfileOpen, setFullProfileOpen] = useState(false)
  const [fullProfileTab, setFullProfileTab] = useState('notes')
  const [notesExpanded, setNotesExpanded] = useState(false)
  const [quickNote, setQuickNote] = useState('')
  const { appUser } = useUser()
  const createNote = useCreateNote()
  const { data: contactNotes } = useNotes({
    tenantId,
    contactId: contactId ?? undefined,
  })

  const { data: contact, isLoading: contactLoading } = useFrontDeskContact(contactId)
  const { data: timeline, isLoading: timelineLoading } = useFrontDeskTimeline(contactId)
  const { data: riskFlags } = useFrontDeskRiskFlags(contactId)
  const { data: staffList } = useFrontDeskStaffList(tenantId)
  const { data: config } = useFrontDeskConfig(tenantId)
  const { data: interactions } = useFrontDeskInteractionBreakdown(contactId)

  // Screening answers — fetch the most recent lead for this contact
  const { data: screeningLead } = useQuery({
    queryKey: ['front-desk', 'panel-screening', contactId ?? ''],
    queryFn: async () => {
      if (!contactId || !tenantId) return null
      const supabase = createClient()
      const { data } = await supabase
        .from('leads')
        .select('id, custom_intake_data')
        .eq('contact_id', contactId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data
    },
    enabled: !!contactId && !!tenantId,
    staleTime: 60_000,
  })

  // Expanded info: contact's matters
  const { data: contactMatters } = useQuery({
    queryKey: ['front-desk', 'panel-matters', contactId ?? ''],
    queryFn: async () => {
      if (!contactId) return []
      const supabase = createClient()
      const { data } = await supabase
        .from('matter_contacts')
        .select('matter_id, matters!inner(id, title, matter_number, status, created_at)')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false, referencedTable: 'matters' })
        .limit(10)
      return (data ?? []).map((mc) => {
        const m = mc.matters as unknown as { id: string; title: string | null; matter_number: string | null; status: string; created_at: string }
        return m
      })
    },
    enabled: !!contactId,
    staleTime: 30_000,
  })

  // Expanded info: documents uploaded for this contact
  const { data: contactDocuments } = useQuery({
    queryKey: ['front-desk', 'panel-documents', contactId ?? ''],
    queryFn: async () => {
      if (!contactId) return []
      const supabase = createClient()
      const { data } = await supabase
        .from('documents')
        .select('id, file_name, file_type, document_type, category, storage_path, storage_bucket, created_at, file_size')
        .eq('contact_id', contactId)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
        .limit(20)
      return data ?? []
    },
    enabled: !!contactId,
    staleTime: 30_000,
  })

  // Expanded info: contact's upcoming appointments
  const { data: contactAppointments } = useQuery({
    queryKey: ['front-desk', 'panel-appointments', contactId ?? ''],
    queryFn: async () => {
      if (!contactId) return []
      const supabase = createClient()
      const today = new Date().toISOString().split('T')[0]
      const { data } = await supabase
        .from('appointments')
        .select('id, appointment_date, start_time, status, user_id')
        .eq('contact_id', contactId)
        .gte('appointment_date', today)
        .order('appointment_date', { ascending: true })
        .limit(5)
      // Resolve staff names
      const userIds = [...new Set((data ?? []).map((a) => a.user_id).filter(Boolean))] as string[]
      let staffMap: Record<string, string> = {}
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, first_name, last_name')
          .in('id', userIds)
        staffMap = Object.fromEntries(
          (users ?? []).map((u) => [u.id, [u.first_name, u.last_name].filter(Boolean).join(' ')])
        )
      }
      return (data ?? []).map((a) => ({
        ...a,
        staff_name: a.user_id ? staffMap[a.user_id] ?? 'Unknown' : null,
      }))
    },
    enabled: !!contactId,
    staleTime: 30_000,
  })

  function inferFileType(fileName: string): string | null {
    const ext = fileName.split('.').pop()?.toLowerCase()
    if (ext === 'pdf') return 'application/pdf'
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
    if (ext === 'png') return 'image/png'
    if (ext === 'gif') return 'image/gif'
    if (ext === 'webp') return 'image/webp'
    return null
  }

  function getCleanDocPath(storagePath: string, bucket: string): string {
    return storagePath.startsWith(`${bucket}/`)
      ? storagePath.slice(bucket.length + 1)
      : storagePath
  }

  async function handleSaveQuickNote() {
    if (!quickNote.trim() || !contactId || !appUser) return
    await createNote.mutateAsync({
      tenant_id: tenantId,
      contact_id: contactId,
      user_id: appUser.id,
      content: quickNote.trim(),
    })
    setQuickNote('')
  }

  const isOpen = contactId !== null
  const isLoading = contactLoading

  // Derive display name
  const displayName = contact
    ? contact.preferred_name || [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unknown Contact'
    : ''

  return (
    <>
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent className="w-full sm:max-w-xl overflow-hidden flex flex-col" side="right">
        <SheetHeader className="sr-only">
          <SheetTitle>{displayName || 'Contact Details'}</SheetTitle>
          <SheetDescription>Contact work panel for the front desk console.</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex-1 min-h-0 overflow-auto">
            <ContactWorkPanelSkeleton />
          </div>
        ) : contact ? (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="space-y-6 p-6">

              {/* ── Section 1: Identity Header ── */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <User className="size-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-foreground truncate">
                      {displayName}
                    </h2>
                  </div>
                </div>

                {/* Contact type + risk flag badges */}
                <div className="flex flex-wrap items-center gap-1.5 pl-[52px]">
                  {contact.contact_type && (
                    <Badge variant="secondary" className="text-xs capitalize">
                      {contact.contact_type}
                    </Badge>
                  )}
                  {(riskFlags ?? []).map((flag) => {
                    const flagConfig = RISK_FLAG_CONFIG[flag]
                    if (!flagConfig) return null
                    return (
                      <Badge
                        key={flag}
                        variant="outline"
                        className={`text-xs ${flagConfig.className}`}
                      >
                        {flagConfig.icon}
                        {flagConfig.label}
                      </Badge>
                    )
                  })}
                </div>

                {/* View Full Profile link */}
                <button
                  type="button"
                  onClick={() => { setFullProfileTab('notes'); setFullProfileOpen(true) }}
                  className="pl-[52px] flex items-center gap-1 text-xs text-primary hover:underline mt-0.5"
                >
                  <Maximize2 className="size-3" />
                  View Full Profile
                </button>
              </div>

              {/* ── Section 2: Contact Details ── */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Contact Details
                </h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <DetailRow
                    label="Phone Primary"
                    value={contact.phone_primary}
                  />
                  <DetailRow
                    label="Phone Secondary"
                    value={contact.phone_secondary}
                  />
                  <DetailRow
                    label="Email Primary"
                    value={contact.email_primary}
                  />
                  <DetailRow
                    label="Email Secondary"
                    value={contact.email_secondary}
                  />
                  <DetailRow
                    label="Date of Birth"
                    value={
                      contact.date_of_birth ? (
                        <MaskedDateOfBirth dob={contact.date_of_birth} />
                      ) : null
                    }
                  />
                  <DetailRow
                    label="Contact Type"
                    value={
                      contact.contact_type ? (
                        <span className="capitalize">{contact.contact_type}</span>
                      ) : null
                    }
                  />
                  <DetailRow
                    label="Language"
                    value={
                      (contact.custom_fields?.language as string) ?? null
                    }
                  />
                  <DetailRow
                    label="Last Contacted"
                    value={
                      contact.last_contacted_at
                        ? formatRelativeTime(contact.last_contacted_at)
                        : null
                    }
                  />
                </dl>
              </div>

              {/* ── Section 2b: Extended Contact Info ── */}
              {(() => {
                const cf = (contact.custom_fields ?? {}) as Record<string, string | undefined>
                const hasExtra = cf.address || cf.nationality || cf.country_of_birth || cf.file_number || contact.engagement_score != null
                if (!hasExtra) return null
                return (
                  <div className="space-y-1.5">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                      {cf.address && (
                        <DetailRow
                          label="Address"
                          value={
                            <span className="flex items-center gap-1">
                              <MapPin className="size-3 text-muted-foreground" />
                              {cf.address}
                            </span>
                          }
                        />
                      )}
                      {cf.nationality && (
                        <DetailRow
                          label="Nationality"
                          value={
                            <span className="flex items-center gap-1">
                              <Globe className="size-3 text-muted-foreground" />
                              {cf.nationality}
                            </span>
                          }
                        />
                      )}
                      {cf.country_of_birth && (
                        <DetailRow label="Country of Birth" value={cf.country_of_birth} />
                      )}
                      {cf.file_number && (
                        <DetailRow label="File Number" value={cf.file_number} />
                      )}
                      {contact.engagement_score != null && (
                        <DetailRow label="Engagement Score" value={String(contact.engagement_score)} />
                      )}
                    </dl>
                  </div>
                )
              })()}

              {/* ── Active Matters ── */}
              {(contactMatters ?? []).length > 0 && (
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => setMattersExpanded((v) => !v)}
                    className="w-full flex items-center justify-between text-sm font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <Briefcase className="size-3.5" />
                      Matters ({contactMatters!.length})
                    </span>
                    {mattersExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                  </button>
                  {mattersExpanded && (
                    <div className="space-y-1.5">
                      {contactMatters!.map((m) => (
                        <div key={m.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm bg-background">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{m.title || 'Untitled Matter'}</p>
                            {m.matter_number && (
                              <p className="text-xs text-muted-foreground">{m.matter_number}</p>
                            )}
                          </div>
                          <span className={`ml-2 shrink-0 text-xs px-1.5 py-0.5 rounded font-medium capitalize ${
                            m.status === 'active' ? 'bg-green-100 text-green-700' :
                            m.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                            m.status === 'closed_won' ? 'bg-slate-100 text-slate-600' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {m.status.replace('_', ' ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Upcoming Appointments ── */}
              {(contactAppointments ?? []).length > 0 && (
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => setAppointmentsExpanded((v) => !v)}
                    className="w-full flex items-center justify-between text-sm font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <Calendar className="size-3.5" />
                      Upcoming Appointments ({contactAppointments!.length})
                    </span>
                    {appointmentsExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                  </button>
                  {appointmentsExpanded && (
                    <div className="space-y-1.5">
                      {contactAppointments!.map((a) => (
                        <div key={a.id} className="rounded-md border px-3 py-2 text-sm bg-background">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{a.appointment_date}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium capitalize ${
                              a.status === 'confirmed' ? 'bg-blue-100 text-blue-700' :
                              a.status === 'checked_in' ? 'bg-green-100 text-green-700' :
                              a.status === 'completed' ? 'bg-slate-100 text-slate-600' :
                              'bg-amber-100 text-amber-700'
                            }`}>
                              {a.status.replace('_', ' ')}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {a.start_time} · {a.staff_name}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Interaction Summary — compact horizontal strip ── */}
              {interactions && interactions.total > 0 && (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Interactions</span>
                    <span className="text-xs font-bold text-slate-600">{interactions.total} total</span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {interactions.inbound_calls > 0 && (
                      <span className="text-xs text-emerald-700">📲 {interactions.inbound_calls} in</span>
                    )}
                    {interactions.outbound_calls > 0 && (
                      <span className="text-xs text-teal-700">📞 {interactions.outbound_calls} out</span>
                    )}
                    {interactions.no_answer > 0 && (
                      <span className="text-xs text-amber-700">🔕 {interactions.no_answer} no ans</span>
                    )}
                    {interactions.voicemail > 0 && (
                      <span className="text-xs text-blue-700">📬 {interactions.voicemail} vm</span>
                    )}
                    {interactions.busy > 0 && (
                      <span className="text-xs text-orange-700">🔴 {interactions.busy} busy</span>
                    )}
                    {interactions.emails > 0 && (
                      <span className="text-xs text-indigo-700">✉️ {interactions.emails} email</span>
                    )}
                    {interactions.meetings > 0 && (
                      <button
                        type="button"
                        onClick={() => setMeetingBreakdownOpen((v) => !v)}
                        className="text-xs text-violet-700 hover:text-violet-900 underline-offset-2 hover:underline"
                      >
                        🗓 {interactions.meetings} mtg{meetingBreakdownOpen ? ' ▲' : ' ▼'}
                      </button>
                    )}
                  </div>
                  {meetingBreakdownOpen && interactions.meetings > 0 && (
                    <div className="mt-1.5 flex gap-3 pl-1 border-t border-violet-100 pt-1.5">
                      {interactions.meetings_in_person > 0 && (
                        <span className="text-[11px] text-violet-600">🤝 {interactions.meetings_in_person} in-person</span>
                      )}
                      {interactions.meetings_video > 0 && (
                        <span className="text-[11px] text-violet-600">💻 {interactions.meetings_video} video</span>
                      )}
                      {interactions.meetings_phone > 0 && (
                        <span className="text-[11px] text-violet-600">☎️ {interactions.meetings_phone} phone</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Call Outcome Quick Bar ── */}
              <CallOutcomeBar contactId={contactId!} />

              {/* ── Section 3: Action Bar ── */}
              <div className="border-t pt-4">
                <ContactActionBar
                  contactId={contactId!}
                  staffList={staffList ?? []}
                  config={config ?? {
                    allowed_templates: [],
                    allowed_appointment_types: [],
                    free_text_follow_up: false,
                    override_booking_permission: false,
                    new_leads_require_id_scan: false,
                    languages: ['English', 'French'],
                    sources: ['Walk-in', 'Phone', 'Website', 'Referral', 'Other'],
                    default_task_bundle: [],
                    task_chains: {},
                    rooms: [],
                    show_schedule: true,
                    show_tasks: true,
                    show_check_ins: true,
                    show_quick_create: true,
                    show_stats_bar: true,
                    show_action_appointments: true,
                    show_action_tasks: true,
                    show_action_documents: true,
                    show_action_walk_in: true,
                  }}
                  onCreateIntake={onCreateIntake}
                />
              </div>

              {/* ── Documents ── */}
              <div className="space-y-1.5 border-t pt-4">
                <button
                  type="button"
                  onClick={() => setDocsExpanded((v) => !v)}
                  className="w-full flex items-center justify-between text-sm font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <FileText className="size-3.5" />
                    Documents ({(contactDocuments ?? []).length})
                  </span>
                  {docsExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                </button>
                {docsExpanded && (
                  (contactDocuments ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground italic px-1">No documents uploaded yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {(contactDocuments ?? []).map((doc) => {
                        const d = doc as typeof doc & { category?: string | null }
                        const docLabel = d.document_type ?? d.category ?? 'Document'

                        return (
                          <div key={doc.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm bg-background group">
                            <FileText className="size-4 shrink-0 text-cyan-600" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate text-sm">{doc.file_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {docLabel}
                                {doc.file_size ? ` · ${(doc.file_size / 1024).toFixed(0)} KB` : ''}
                                {doc.created_at ? ` · ${new Date(doc.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                title="View document"
                                onClick={() => {
                                  const bucket = doc.storage_bucket ?? 'documents'
                                  // Pass the raw storage_path so the API can find the DB record.
                                  // The API strips the bucket prefix when calling storage.download().
                                  const d = doc as typeof doc & { file_type?: string | null }
                                  setViewingDoc({
                                    storagePath: doc.storage_path ?? '',
                                    fileName: doc.file_name,
                                    fileType: d.file_type ?? inferFileType(doc.file_name),
                                    storageBucket: bucket,
                                  })
                                }}
                                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                              >
                                <Eye className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Download"
                                onClick={async () => {
                                  const bucket = doc.storage_bucket ?? 'documents'
                                  const cleanPath = getCleanDocPath(doc.storage_path ?? '', bucket)
                                  const url = await getSignedUrl.mutateAsync({ storagePath: cleanPath, bucket })
                                  const a = document.createElement('a')
                                  a.href = url
                                  a.download = doc.file_name
                                  a.click()
                                }}
                                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                              >
                                <Download className="size-3.5" />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                )}
              </div>

              {/* ── Quick Notes ── */}
              <div className="space-y-1.5 border-t pt-4">
                <button
                  type="button"
                  onClick={() => setNotesExpanded((v) => !v)}
                  className="w-full flex items-center justify-between text-sm font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <StickyNote className="size-3.5" />
                    Notes ({(contactNotes ?? []).length})
                  </span>
                  {notesExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                </button>

                {notesExpanded && (
                  <div className="space-y-3">
                    {/* Quick compose */}
                    <div className="flex gap-2">
                      <textarea
                        value={quickNote}
                        onChange={(e) => setQuickNote(e.target.value)}
                        placeholder="Write a note… (Ctrl+Enter to save)"
                        rows={2}
                        className="flex-1 text-sm resize-none rounded-md border border-input bg-background px-3 py-2 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            void handleSaveQuickNote()
                          }
                        }}
                      />
                      <button
                        type="button"
                        disabled={!quickNote.trim() || createNote.isPending}
                        onClick={() => void handleSaveQuickNote()}
                        className="self-end flex-shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {createNote.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Send className="size-4" />
                        )}
                      </button>
                    </div>

                    {/* Recent notes (max 4) */}
                    {(contactNotes ?? []).length === 0 ? (
                      <p className="text-xs text-muted-foreground italic px-1">
                        No notes yet. Write one above.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {(contactNotes ?? []).slice(0, 4).map((note) => (
                          <div
                            key={note.id}
                            className={`rounded-md border px-3 py-2 text-sm ${
                              note.is_pinned
                                ? 'border-amber-200 bg-amber-50/60'
                                : 'bg-background border-border'
                            }`}
                          >
                            <div className="flex items-start gap-1.5">
                              {note.is_pinned && (
                                <Pin className="size-3 text-amber-500 mt-0.5 shrink-0" />
                              )}
                              <p className="text-sm text-foreground line-clamp-3 flex-1 whitespace-pre-wrap">
                                {note.content}
                              </p>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatRelativeDate(note.created_at)}
                            </p>
                          </div>
                        ))}
                        {(contactNotes ?? []).length > 4 && (
                          <button
                            type="button"
                            onClick={() => {
                              setFullProfileTab('notes')
                              setFullProfileOpen(true)
                            }}
                            className="text-xs text-primary hover:underline"
                          >
                            View all {(contactNotes ?? []).length} notes →
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Section 4: Screening Answers ── */}
              {screeningLead && (
                <div className="border-t pt-4">
                  <ScreeningAnswersPanel
                    customIntakeData={screeningLead.custom_intake_data as Record<string, unknown> | null}
                    defaultCollapsed={false}
                  />
                </div>
              )}

              {/* ── Section 5: Recent Activity (bottom) ── */}
              <div className="space-y-2 border-t pt-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Recent Activity
                </h3>
                {timelineLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <Skeleton className="size-8 rounded-full" />
                        <div className="flex-1 space-y-1">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : timeline && timeline.length > 0 ? (
                  <div className="divide-y divide-border">
                    {timeline.map((event) => (
                      <TimelineEventRow key={event.id} event={event} />
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                    <Activity className="size-4" />
                    <span>No recent activity</span>
                  </div>
                )}
              </div>

            </div>
          </div>
        ) : (
          <div className="flex flex-1 min-h-0 items-center justify-center p-6">
            <p className="text-sm text-muted-foreground">Contact not found.</p>
          </div>
        )}
      </SheetContent>
    </Sheet>

    {/* ── In-app Document Viewer ── */}
    {viewingDoc && (
      <DocumentViewer
        storagePath={viewingDoc.storagePath}
        fileName={viewingDoc.fileName}
        fileType={viewingDoc.fileType}
        storageBucket={viewingDoc.storageBucket ?? undefined}
        open={!!viewingDoc}
        onOpenChange={(open) => { if (!open) setViewingDoc(null) }}
      />
    )}

    {/* ── Full Profile Sheet ── */}
    <ContactFullProfile
      contactId={contactId}
      contactName={displayName}
      tenantId={tenantId}
      open={fullProfileOpen}
      onOpenChange={setFullProfileOpen}
      defaultTab={fullProfileTab}
    />
  </>
  )
}
