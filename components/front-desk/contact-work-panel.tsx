'use client'

import { useState } from 'react'
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
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
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
  type FrontDeskTimelineEvent,
} from '@/lib/queries/front-desk-queries'
import { useTenant } from '@/lib/hooks/use-tenant'

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
  switch (activityType) {
    case 'call':
      return <Phone className="size-4 text-emerald-600" />
    case 'email':
      return <Mail className="size-4 text-blue-600" />
    case 'note':
      return <StickyNote className="size-4 text-amber-600" />
    case 'appointment':
      return <Calendar className="size-4 text-violet-600" />
    default:
      return <Activity className="size-4 text-slate-500" />
  }
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

  const { data: contact, isLoading: contactLoading } = useFrontDeskContact(contactId)
  const { data: timeline, isLoading: timelineLoading } = useFrontDeskTimeline(contactId)
  const { data: riskFlags } = useFrontDeskRiskFlags(contactId)
  const { data: staffList } = useFrontDeskStaffList(tenantId)
  const { data: config } = useFrontDeskConfig(tenantId)

  const isOpen = contactId !== null
  const isLoading = contactLoading

  // Derive display name
  const displayName = contact
    ? contact.preferred_name || [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unknown Contact'
    : ''

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent className="w-full sm:max-w-xl" side="right">
        <SheetHeader className="sr-only">
          <SheetTitle>{displayName || 'Contact Details'}</SheetTitle>
          <SheetDescription>Contact work panel for the front desk console.</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <ContactWorkPanelSkeleton />
        ) : contact ? (
          <ScrollArea className="h-full">
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
                  <DetailRow
                    label="Interaction Count"
                    value={
                      contact.interaction_count != null
                        ? String(contact.interaction_count)
                        : null
                    }
                  />
                </dl>
              </div>

              {/* ── Section 3: Timeline Summary ── */}
              <div className="space-y-2">
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

              {/* ── Call Outcome Quick Bar ── */}
              <CallOutcomeBar contactId={contactId!} />

              {/* ── Section 4: Action Bar ── */}
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

            </div>
          </ScrollArea>
        ) : (
          <div className="flex h-full items-center justify-center p-6">
            <p className="text-sm text-muted-foreground">Contact not found.</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
