'use client'

/**
 * ZoneC  -  Left Rail
 *
 * Collapsible left sidebar (240px expanded, 40px collapsed).
 * Contains file context at a glance:
 *   - Matter type label
 *   - Responsible lawyer
 *   - Date opened + next deadline
 *   - Next action (most urgent open task)  -  wired to real tasks table
 *   - Risk flags panel   -  wired to matter_risk_flags with override flow
 *   - People panel       -  wired to matter_people + contacts join, with Sheet slide-over
 *   - Billing snapshot (billed / paid / trust)
 *
 * Spec ref: Section 3  -  Zone C: Left Rail
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, differenceInCalendarDays, isPast, parseISO } from 'date-fns'
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  User,
  AlertTriangle,
  Clock,
  Briefcase,
  DollarSign,
  Users,
  CheckCircle2,
  Mail,
  Phone,
  Building2,
  FileText,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { createClient } from '@/lib/supabase/client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useMatterRiskFlagsAll } from '@/lib/queries/stage-transitions'
import { useLatestRetainerAgreement } from '@/lib/queries/retainer-agreements'
import { useMatterSLA } from '@/lib/queries/sla'
import type { MatterSLATrackingRow } from '@/lib/types/database'
import { RetainerGenerationModal } from '@/components/retainer/RetainerGenerationModal'
import { toast } from 'sonner'
import type { Database } from '@/lib/types/database'

type Matter = Database['public']['Tables']['matters']['Row']
type ContactRow = Database['public']['Tables']['contacts']['Row']

// ── Derived types ─────────────────────────────────────────────────────────────

interface MatterPersonWithContact {
  id: string
  person_role: string
  is_active: boolean
  sort_order: number
  contact_id: string | null
  contacts: Pick<
    ContactRow,
    | 'id'
    | 'first_name'
    | 'last_name'
    | 'email_primary'
    | 'phone_primary'
    | 'organization_name'
    | 'address_line1'
    | 'address_line2'
    | 'city'
    | 'province_state'
    | 'postal_code'
    | 'country'
  > | null
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface ZoneCProps {
  matter: Matter
  tenantId: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeDate(dueDateStr: string): { label: string; isOverdue: boolean } {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = parseISO(dueDateStr)
  due.setHours(0, 0, 0, 0)
  const diff = differenceInCalendarDays(due, today)
  if (diff < 0) {
    const days = Math.abs(diff)
    return { label: `Overdue by ${days} day${days === 1 ? '' : 's'}`, isOverdue: true }
  }
  if (diff === 0) return { label: 'Due today', isOverdue: false }
  if (diff === 1) return { label: 'Due tomorrow', isOverdue: false }
  return { label: `Due in ${diff} days`, isOverdue: false }
}

/** Relative label for a full ISO timestamp (hours-aware). */
function relativeTimestamp(isoStr: string): { label: string; isOverdue: boolean } {
  const now = new Date()
  const due = parseISO(isoStr)
  const diffMs = due.getTime() - now.getTime()
  if (diffMs < 0) {
    const absDays = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60 * 24))
    const absHours = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60))
    if (absDays >= 1) return { label: `Overdue by ${absDays} day${absDays === 1 ? '' : 's'}`, isOverdue: true }
    return { label: `Overdue by ${absHours}h`, isOverdue: true }
  }
  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  if (hours < 1) return { label: 'Due in < 1 hour', isOverdue: false }
  if (hours < 24) return { label: `Due in ${hours}h`, isOverdue: false }
  const days = Math.floor(hours / 24)
  return { label: `Due in ${days} day${days === 1 ? '' : 's'}`, isOverdue: false }
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-950/30 text-red-400 border-red-500/30',
  elevated: 'bg-orange-950/30 text-orange-400 border-orange-500/30',
  advisory: 'bg-yellow-950/30 text-yellow-400 border-yellow-500/30',
  low:      'bg-blue-950/30 text-blue-400 border-blue-500/30',
}

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-red-950/300',
  elevated: 'bg-orange-400',
  advisory: 'bg-yellow-400',
  low:      'bg-blue-400',
}

const STATUS_STYLES: Record<string, string> = {
  open:         'bg-red-950/40 text-red-400',
  acknowledged: 'bg-yellow-950/40 text-yellow-400',
  overridden:   'bg-slate-100 text-slate-600',
  resolved:     'bg-emerald-950/40 text-emerald-400',
}

const PRIORITY_STYLES: Record<string, string> = {
  high:   'bg-red-950/40 text-red-400',
  medium: 'bg-amber-950/40 text-amber-400',
  low:    'bg-slate-100 text-slate-600',
}

function initials(firstName: string | null, lastName: string | null): string {
  return [firstName?.[0], lastName?.[0]].filter(Boolean).join('').toUpperCase() || '?'
}

// ── Component ────────────────────────────────────────────────────────────────

export function ZoneC({ matter, tenantId }: ZoneCProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [selectedContact, setSelectedContact] = useState<MatterPersonWithContact | null>(null)
  const [retainerModalOpen, setRetainerModalOpen] = useState(false)
  const router = useRouter()

  const supabase = createClient()
  const qc = useQueryClient()

  // Retainer status  -  used to label the action button
  const { data: latestRetainer } = useLatestRetainerAgreement(matter.id)

  // ── Responsible lawyer ──────────────────────────────────────────────────
  const { data: lawyer } = useQuery({
    queryKey: ['user_display', matter.responsible_lawyer_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('users')
        .select('id, first_name, last_name, email')
        .eq('id', matter.responsible_lawyer_id!)
        .single()
      return (data ?? null) as {
        id: string
        first_name: string | null
        last_name: string | null
        email: string
      } | null
    },
    enabled: !!matter.responsible_lawyer_id,
    staleTime: 10 * 60 * 1000,
  })

  // ── Next action  -  reads from matter.next_action_* columns ──────────────
  // Values are pre-computed by the Next Action Engine and stored on the matter row.
  // The "Refresh" button calls POST /api/matters/[id]/next-action to recompute.
  const [isRefreshingNextAction, setIsRefreshingNextAction] = useState(false)

  async function refreshNextAction() {
    setIsRefreshingNextAction(true)
    try {
      await fetch(`/api/matters/${matter.id}/next-action`, { method: 'POST' })
      qc.invalidateQueries({ queryKey: ['matter', matter.id] })
    } catch {
      toast.error('Failed to refresh next action')
    } finally {
      setIsRefreshingNextAction(false)
    }
  }

  // ── Active SLAs ─────────────────────────────────────────────────────────
  const { data: activeSLAs = [] } = useMatterSLA(matter.id)

  // ── Risk flags ──────────────────────────────────────────────────────────
  const { data: riskFlags = [] } = useMatterRiskFlagsAll(matter.id)

  const openFlags = riskFlags.filter(f => f.status === 'open' || f.status === 'acknowledged')
  const totalFlags = riskFlags.length

  const criticalCount = riskFlags.filter(f => f.severity === 'critical').length
  const elevatedCount = riskFlags.filter(f => f.severity === 'elevated').length

  // ── People ──────────────────────────────────────────────────────────────
  const { data: people = [] } = useQuery({
    queryKey: ['matter-people', matter.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('matter_people')
        .select('id, person_role, is_active, sort_order, contact_id, contacts(id, first_name, last_name, email_primary, phone_primary, organization_name, address_line1, address_line2, city, province_state, postal_code, country)')
        .eq('matter_id', matter.id)
        .eq('is_active', true)
        .order('sort_order')
      return (data ?? []) as MatterPersonWithContact[]
    },
    enabled: !!matter.id,
    staleTime: 2 * 60 * 1000,
  })

  // ── Derived ─────────────────────────────────────────────────────────────
  const lawyerName = lawyer
    ? [lawyer.first_name, lawyer.last_name].filter(Boolean).join(' ') || lawyer.email
    : null

  const nextDeadlineDate = matter.next_deadline ? new Date(matter.next_deadline) : null
  const isDeadlinePast   = nextDeadlineDate ? isPast(nextDeadlineDate) : false

  // ── Collapsed view ───────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div className="flex-none w-10 border-r bg-card flex flex-col items-center pt-2 gap-3">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground"
          title="Expand file details"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>

        {openFlags.length > 0 && (
          <div
            className={cn(
              'flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold',
              criticalCount > 0 ? 'bg-red-950/40 text-red-400' : 'bg-amber-950/40 text-amber-400',
            )}
            title={`${openFlags.length} open risk ${openFlags.length === 1 ? 'flag' : 'flags'}`}
          >
            {openFlags.length}
          </div>
        )}

        {matter.next_action_type && matter.next_action_type !== 'no_action' && (
          <span title={`Next action: ${matter.next_action_description ?? ''}`}>
            <Clock className={cn(
              'h-3.5 w-3.5',
              matter.next_action_escalation === 'critical' ? 'text-red-500' :
              matter.next_action_escalation === 'red'      ? 'text-red-400' :
              'text-amber-500',
            )} aria-hidden />
          </span>
        )}

        {people.length > 0 && (
          <span title={`${people.length} ${people.length === 1 ? 'person' : 'people'} on file`}>
            <Users className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          </span>
        )}
      </div>
    )
  }

  // ── Expanded view ────────────────────────────────────────────────────────
  return (
    <>
      <div className="flex-none w-60 border-r bg-card flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b flex-none">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            File Details
          </span>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground"
            title="Collapse left rail"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">

          {/* Matter type */}
          {matter.matter_type && (
            <MetaRow icon={<Briefcase className="h-3.5 w-3.5" />} label="Matter Type">
              <span className="text-xs">{matter.matter_type}</span>
            </MetaRow>
          )}

          {/* Responsible lawyer */}
          <MetaRow icon={<User className="h-3.5 w-3.5" />} label="Responsible Lawyer">
            <span className="text-xs">
              {lawyerName ?? <span className="text-muted-foreground italic">Unassigned</span>}
            </span>
          </MetaRow>

          {/* Date opened */}
          {matter.date_opened && (
            <MetaRow icon={<Calendar className="h-3.5 w-3.5" />} label="Opened">
              <span className="text-xs">
                {format(new Date(matter.date_opened), 'MMM d, yyyy')}
              </span>
            </MetaRow>
          )}

          {/* Next deadline */}
          {nextDeadlineDate && (
            <MetaRow icon={<Clock className="h-3.5 w-3.5" />} label="Next Deadline">
              <span className={cn('text-xs font-medium', isDeadlinePast ? 'text-red-600' : '')}>
                {format(nextDeadlineDate, 'MMM d, yyyy')}
                {isDeadlinePast && <span className="ml-1 text-[10px] text-red-500">overdue</span>}
              </span>
            </MetaRow>
          )}

          {/* ── Next Action panel ─────────────────────────────────────── */}
          <NextActionPanel
            actionType={matter.next_action_type ?? null}
            description={matter.next_action_description ?? null}
            dueAt={matter.next_action_due_at ?? null}
            escalation={(matter.next_action_escalation ?? 'none') as 'none' | 'amber' | 'red' | 'critical'}
            onRefresh={refreshNextAction}
            isRefreshing={isRefreshingNextAction}
          />

          {/* ── Risk Flags panel ──────────────────────────────────────── */}
          {totalFlags > 0 && (
            <RiskFlagsPanel
              flags={riskFlags}
              matterId={matter.id}
              criticalCount={criticalCount}
              elevatedCount={elevatedCount}
            />
          )}

          {/* ── SLA panel ─────────────────────────────────────────────── */}
          {activeSLAs.length > 0 && (
            <SLAPanel slas={activeSLAs} />
          )}

          {/* ── People panel ──────────────────────────────────────────── */}
          {people.length > 0 && (
            <PeoplePanel
              people={people}
              onSelectPerson={setSelectedContact}
            />
          )}

          {/* ── Retainer action ──────────────────────────────────────── */}
          {latestRetainer?.status !== 'signed' && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <FileText className="h-3 w-3" />
                Retainer
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full h-7 text-xs gap-1.5"
                onClick={() => setRetainerModalOpen(true)}
              >
                <FileText className="h-3 w-3" />
                {latestRetainer ? 'Continue Retainer' : 'Generate Retainer'}
              </Button>
            </div>
          )}
          {latestRetainer?.status === 'signed' && (
            <div className="rounded-md border border-emerald-500/20 bg-emerald-950/30 px-2.5 py-1.5 flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3 text-green-600 shrink-0" />
              <span className="text-[10px] text-green-800 font-medium">Retainer Signed</span>
            </div>
          )}

          {/* ── Billing snapshot ──────────────────────────────────────── */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              Billing
            </p>
            <div className="space-y-1 text-[10px]">
              <BillingRow label="Billed"  value={matter.total_billed}  colour="text-foreground" />
              <BillingRow label="Paid"    value={matter.total_paid}    colour="text-emerald-400" />
              {Number(matter.trust_balance ?? 0) > 0 && (
                <BillingRow label="Trust"   value={matter.trust_balance} colour="text-blue-400" />
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Contact detail sheet */}
      <Sheet open={!!selectedContact} onOpenChange={open => { if (!open) setSelectedContact(null) }}>
        <SheetContent side="left" className="w-80 sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>
              {selectedContact?.contacts
                ? [selectedContact.contacts.first_name, selectedContact.contacts.last_name]
                    .filter(Boolean).join(' ') || 'Contact'
                : 'Contact'}
            </SheetTitle>
            <SheetDescription>
              {selectedContact?.person_role
                ? selectedContact.person_role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                : ''}
            </SheetDescription>
          </SheetHeader>
          {selectedContact?.contacts && (
            <ContactDetailBody contact={selectedContact.contacts} />
          )}
          {selectedContact?.contacts?.id && (
            <div className="px-4 pb-4">
              <button
                type="button"
                onClick={() => router.push(`/contacts/${selectedContact.contacts!.id}`)}
                className="w-full text-center text-xs font-medium text-primary hover:underline py-2"
              >
                View Full Profile →
              </button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Retainer generation modal */}
      <RetainerGenerationModal
        open={retainerModalOpen}
        onOpenChange={setRetainerModalOpen}
        matter={matter}
        tenantId={tenantId}
      />
    </>
  )
}

// ── Next Action Panel ─────────────────────────────────────────────────────────

const ESCALATION_CARD: Record<string, string> = {
  none:     'border-border bg-card',
  amber:    'border-amber-500/30 bg-amber-950/30',
  red:      'border-red-500/30 bg-red-950/30',
  critical: 'border-red-400 bg-red-950/30',
}

const ESCALATION_LABEL: Record<string, string> = {
  none:     'text-muted-foreground',
  amber:    'text-amber-400',
  red:      'text-red-400',
  critical: 'text-red-400',
}

const ESCALATION_TEXT: Record<string, string> = {
  none:     'text-foreground',
  amber:    'text-amber-900',
  red:      'text-red-900',
  critical: 'text-red-900',
}

const OWNER_BADGE: Record<string, string> = {
  lawyer:          'bg-indigo-100 text-indigo-700',
  legal_assistant: 'bg-blue-950/40 text-blue-400',
  client:          'bg-emerald-950/40 text-emerald-400',
  billing:         'bg-yellow-950/40 text-yellow-400',
}

const ACTION_TYPE_LABEL: Record<string, string> = {
  critical_blocker: 'Critical Blocker',
  sla_breach:       'SLA Breach',
  overdue_task:     'Overdue Task',
  upcoming_deadline:'Upcoming Deadline',
  missing_document: 'Missing Document',
  pending_review:   'Pending Review',
  retainer_unsigned:'Retainer Unsigned',
  readiness_gap:    'Readiness Gap',
  no_action:        'Next Action',
}

function NextActionPanel({
  actionType,
  description,
  dueAt,
  escalation,
  onRefresh,
  isRefreshing,
}: {
  actionType: string | null
  description: string | null
  dueAt: string | null
  escalation: 'none' | 'amber' | 'red' | 'critical'
  onRefresh: () => void
  isRefreshing: boolean
}) {
  const rel = dueAt ? relativeTimestamp(dueAt) : null
  const label = actionType ? (ACTION_TYPE_LABEL[actionType] ?? 'Next Action') : 'Next Action'
  const isCritical = escalation === 'critical'

  return (
    <div className={cn('rounded-md border p-2.5 space-y-1.5', ESCALATION_CARD[escalation])}>
      {/* Header row */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5">
          {isCritical && (
            <span
              className="inline-block h-2 w-2 rounded-full bg-red-950/300 animate-pulse shrink-0"
              aria-hidden
            />
          )}
          <p className={cn('text-[10px] font-semibold uppercase tracking-wider', ESCALATION_LABEL[escalation])}>
            {label}
          </p>
        </div>
        <button
          type="button"
          title="Refresh next action"
          onClick={onRefresh}
          disabled={isRefreshing}
          className={cn(
            'p-0.5 rounded hover:bg-black/10 transition-colors disabled:opacity-50',
            ESCALATION_LABEL[escalation],
          )}
        >
          <RefreshCw className={cn('h-3 w-3', isRefreshing && 'animate-spin')} />
        </button>
      </div>

      {/* Description */}
      <p className={cn('text-xs line-clamp-3 leading-snug', ESCALATION_TEXT[escalation])}>
        {description ?? 'All caught up!'}
      </p>

      {/* Due at + owner row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {rel && (
          <span className={cn(
            'text-[10px] font-medium',
            rel.isOverdue ? 'text-red-600' : ESCALATION_LABEL[escalation],
          )}>
            {rel.label}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Risk Flags Panel ──────────────────────────────────────────────────────────

function RiskFlagsPanel({
  flags,
  matterId,
  criticalCount,
  elevatedCount,
}: {
  flags: import('@/lib/types/database').MatterRiskFlagRow[]
  matterId: string
  criticalCount: number
  elevatedCount: number
}) {
  const totalFlags = flags.length
  const supabase = createClient()
  const qc = useQueryClient()
  const [overrideId, setOverrideId] = useState<string | null>(null)
  const [overrideReason, setOverrideReason] = useState('')

  const overrideMutation = useMutation({
    mutationFn: async ({ flagId, reason }: { flagId: string; reason: string }) => {
      const { error } = await supabase
        .from('matter_risk_flags')
        .update({
          status: 'overridden',
          override_reason: reason,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', flagId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['matter_risk_flags', matterId] })
      qc.invalidateQueries({ queryKey: ['matter_risk_flags', matterId, 'count'] })
      setOverrideId(null)
      setOverrideReason('')
      toast.success('Risk flag overridden')
    },
    onError: () => toast.error('Failed to override risk flag'),
  })

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <AlertTriangle className="h-3 w-3 text-amber-500" />
        Risk Flags ({totalFlags})
      </p>

      {criticalCount > 0 && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-red-950/30 text-red-400 border-red-500/30 w-full justify-start gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-red-950/300 shrink-0" />
          {criticalCount} Critical
        </Badge>
      )}
      {elevatedCount > 0 && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-orange-950/30 text-orange-400 border-orange-500/30 w-full justify-start gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-orange-400 shrink-0" />
          {elevatedCount} Elevated
        </Badge>
      )}

      {flags.map(flag => (
        <div
          key={flag.id}
          className={cn(
            'rounded border p-2 space-y-1.5 text-[10px]',
            SEVERITY_STYLES[flag.severity] ?? 'bg-slate-50 text-slate-700 border-slate-200',
          )}
        >
          {/* Flag type + severity dot */}
          <div className="flex items-start gap-1.5">
            <span
              className={cn('mt-0.5 h-1.5 w-1.5 rounded-full shrink-0', SEVERITY_DOT[flag.severity] ?? 'bg-slate-400')}
            />
            <p className="font-medium leading-snug">
              {flag.flag_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </p>
          </div>

          {/* Severity + status badges */}
          <div className="flex items-center gap-1 flex-wrap pl-3">
            <span className="px-1 py-0.5 rounded font-semibold uppercase tracking-wider" style={{ fontSize: '9px' }}>
              {flag.severity}
            </span>
            <span
              className={cn(
                'px-1 py-0.5 rounded capitalize',
                STATUS_STYLES[flag.status] ?? 'bg-slate-100 text-slate-600',
              )}
              style={{ fontSize: '9px' }}
            >
              {flag.status}
            </span>
          </div>

          {/* Override flow  -  only for open/acknowledged flags */}
          {(flag.status === 'open' || flag.status === 'acknowledged') && (
            <div className="pl-3">
              {overrideId === flag.id ? (
                <div className="space-y-1">
                  <Input
                    value={overrideReason}
                    onChange={e => setOverrideReason(e.target.value)}
                    placeholder="Override reason…"
                    className="h-6 text-[10px] px-1.5"
                  />
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={!overrideReason.trim() || overrideMutation.isPending}
                      onClick={() => overrideMutation.mutate({ flagId: flag.id, reason: overrideReason.trim() })}
                      className="text-[10px] font-medium text-white bg-slate-700 hover:bg-slate-900 disabled:opacity-50 px-1.5 py-0.5 rounded transition-colors"
                    >
                      {overrideMutation.isPending ? 'Saving…' : 'Confirm'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setOverrideId(null); setOverrideReason('') }}
                      className="text-[10px] text-slate-500 hover:text-slate-700 px-1.5 py-0.5"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setOverrideId(flag.id)}
                  className="text-[10px] underline underline-offset-2 opacity-70 hover:opacity-100 transition-opacity"
                >
                  Override
                </button>
              )}
            </div>
          )}

          {/* Show existing override reason if overridden */}
          {flag.status === 'overridden' && flag.override_reason && (
            <p className="pl-3 opacity-70 italic leading-snug">
              Reason: {flag.override_reason}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

// ── People Panel ──────────────────────────────────────────────────────────────

function PeoplePanel({
  people,
  onSelectPerson,
}: {
  people: MatterPersonWithContact[]
  onSelectPerson: (p: MatterPersonWithContact) => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <Users className="h-3 w-3" />
        People ({people.length})
      </p>

      {people.map(person => {
        const contact = person.contacts
        const firstName = contact?.first_name ?? null
        const lastName  = contact?.last_name ?? null
        const fullName  = [firstName, lastName].filter(Boolean).join(' ') || 'Unknown'
        const roleLabel = person.person_role
          .replace(/_/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase())

        return (
          <button
            key={person.id}
            type="button"
            onClick={() => onSelectPerson(person)}
            className="w-full flex items-center gap-2 rounded-md p-1.5 hover:bg-accent transition-colors text-left group"
          >
            {/* Avatar */}
            <div className="flex-none w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[9px] font-semibold text-muted-foreground group-hover:bg-accent-foreground/10">
              {initials(firstName, lastName)}
            </div>
            {/* Info */}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium truncate leading-tight">{fullName}</p>
              <p className="text-[9px] text-muted-foreground truncate">{roleLabel}</p>
              {contact?.email_primary && (
                <p className="text-[9px] text-muted-foreground truncate">{contact.email_primary}</p>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ── Contact Detail Body (inside Sheet) ───────────────────────────────────────

function ContactDetailBody({
  contact,
}: {
  contact: MatterPersonWithContact['contacts'] & {}
}) {
  if (!contact) return null

  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unknown'
  const addressParts = [
    contact.address_line1,
    contact.address_line2,
    contact.city,
    contact.province_state,
    contact.postal_code,
    contact.country,
  ].filter(Boolean)

  return (
    <div className="px-4 pb-4 space-y-4 text-sm">
      {/* Full name + org */}
      <div>
        <p className="font-semibold text-base">{fullName}</p>
        {contact.organization_name && (
          <p className="text-muted-foreground flex items-center gap-1.5 mt-0.5">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            {contact.organization_name}
          </p>
        )}
      </div>

      {/* Email */}
      {contact.email_primary && (
        <div className="flex items-start gap-2">
          <Mail className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
          <span className="break-all">{contact.email_primary}</span>
        </div>
      )}

      {/* Phone */}
      {contact.phone_primary && (
        <div className="flex items-start gap-2">
          <Phone className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
          <span>{contact.phone_primary}</span>
        </div>
      )}

      {/* Address */}
      {addressParts.length > 0 && (
        <div className="flex items-start gap-2">
          <Calendar className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" aria-hidden />
          <address className="not-italic text-sm leading-relaxed">
            {addressParts.join(', ')}
          </address>
        </div>
      )}
    </div>
  )
}

// ── Helper components ─────────────────────────────────────────────────────────

function MetaRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="pl-5">{children}</div>
    </div>
  )
}

function BillingRow({
  label,
  value,
  colour,
}: {
  label: string
  value: string | number | null | undefined
  colour: string
}) {
  if (value === null || value === undefined) return null
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-medium tabular-nums', colour)}>
        ${Number(value).toLocaleString('en-CA', { minimumFractionDigits: 0 })}
      </span>
    </div>
  )
}

// ── SLA Panel ─────────────────────────────────────────────────────────────────

const SLA_LABELS: Record<string, string> = {
  CLIENT_RESPONSE:   'Client Response',
  DOCUMENT_REVIEW:   'Document Review',
  LAWYER_REVIEW:     'Lawyer Review',
  BILLING_CLEARANCE: 'Billing Clearance',
  FILING:            'Filing',
  IRCC_RESPONSE:     'IRCC Response',
}

const SLA_TOTAL_HOURS: Record<string, number> = {
  CLIENT_RESPONSE:   120,
  DOCUMENT_REVIEW:    24,
  LAWYER_REVIEW:      48,
  BILLING_CLEARANCE:  72,
  FILING:             48,
  IRCC_RESPONSE:     336,
}

function SLAPanel({ slas }: { slas: MatterSLATrackingRow[] }) {
  const now = Date.now()

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <Clock className="h-3 w-3 text-blue-500" />
        Active SLAs ({slas.length})
      </p>

      {slas.map(sla => {
        const isBreached = sla.status === 'breached'
        const dueMs      = new Date(sla.due_at).getTime()
        const startMs    = new Date(sla.started_at).getTime()
        const totalMs    = (SLA_TOTAL_HOURS[sla.sla_class] ?? 48) * 60 * 60 * 1000
        const elapsedMs  = Math.min(now - startMs, totalMs)
        const pct        = Math.min(Math.round((elapsedMs / totalMs) * 100), 100)
        const isAmber    = !isBreached && pct >= 80
        const remainingH = Math.max(0, Math.round((dueMs - now) / (1000 * 60 * 60)))
        const label      = SLA_LABELS[sla.sla_class] ?? sla.sla_class

        return (
          <div key={sla.id} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-foreground truncate pr-1">
                {label}
              </span>
              {isBreached ? (
                <span className="text-[10px] font-bold text-red-600 shrink-0">BREACHED</span>
              ) : (
                <span className={cn('text-[10px] shrink-0', isAmber ? 'text-amber-600 font-medium' : 'text-muted-foreground')}>
                  {remainingH}h left
                </span>
              )}
            </div>
            {/* Progress bar */}
            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  isBreached ? 'bg-red-950/300' : isAmber ? 'bg-amber-400' : 'bg-blue-400',
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
