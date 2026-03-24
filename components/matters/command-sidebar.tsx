'use client'

/**
 * CommandSidebar — always-visible left panel in the matter command centre.
 *
 * Shows: primary client, matter identity, quick stats, retainer, portal, recent activity.
 * Supports quick-add task inline and direct tab/sheet navigation from stat tiles.
 */

import { useState, useCallback } from 'react'
import {
  FileText,
  ListTodo,
  CalendarDays,
  CreditCard,
  Link2,
  Copy,
  ExternalLink,
  CheckCircle2,
  Plus,
  RotateCcw,
  Loader2,
  User,
  Mail,
  Phone,
  X,
  Check,
  StickyNote,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn, formatCents } from '@/lib/utils'
import { formatDate } from '@/lib/utils/formatters'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

import { useDocumentSlots } from '@/lib/queries/document-slots'
import { useMatterDeadlines } from '@/lib/queries/matter-types'
import { useActivities } from '@/lib/queries/activities'
import { usePortalLinks, useCreatePortalLink, useRevokePortalLink } from '@/lib/queries/portal-links'
import { useCreateTask } from '@/lib/queries/tasks'
import { useCreateNote } from '@/lib/queries/notes'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
// createClient used by usePrimaryContact and useMatterTaskCount hooks above

// ── Retainer hook ─────────────────────────────────────────────────────────────

function useSidebarRetainer(matterId: string) {
  return useQuery({
    queryKey: ['retainer-summary', matterId],
    queryFn: async () => {
      const res = await fetch(`/api/matters/${matterId}/retainer-summary`)
      if (!res.ok) return null
      const data = await res.json()
      return data.retainerSummary ?? null
    },
    enabled: !!matterId,
    staleTime: 30_000,
  })
}

// ── Task count hook ───────────────────────────────────────────────────────────

function useMatterTaskCount(matterId: string, tenantId: string) {
  return useQuery({
    queryKey: ['matter-task-count', matterId],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('tasks')
        .select('id, status')
        .eq('matter_id', matterId)
        .eq('tenant_id', tenantId)
      if (!data) return { open: 0, total: 0 }
      const open = data.filter((t) => t.status !== 'done' && t.status !== 'cancelled').length
      return { open, total: data.length }
    },
    enabled: !!matterId && !!tenantId,
    staleTime: 30_000,
  })
}

// ── Primary contact hook ──────────────────────────────────────────────────────

function usePrimaryContact(matterId: string) {
  return useQuery({
    queryKey: ['matter-primary-contact', matterId],
    queryFn: async () => {
      const supabase = createClient()
      const { data: mc } = await supabase
        .from('matter_contacts')
        .select('contact_id, is_primary')
        .eq('matter_id', matterId)
        .eq('is_primary', true)
        .maybeSingle()
      if (!mc) return null
      const { data: contact } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email_primary, phone_primary')
        .eq('id', mc.contact_id)
        .maybeSingle()
      if (!contact) return null
      return {
        id: contact.id,
        name: [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Client',
        email: contact.email_primary,
        phone: contact.phone_primary,
      }
    },
    enabled: !!matterId,
    staleTime: 60_000,
  })
}

// ── Section header ────────────────────────────────────────────────────────────

function SidebarSection({ title, children, className, action }: {
  title: string
  children: React.ReactNode
  className?: string
  action?: React.ReactNode
}) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{title}</p>
        {action}
      </div>
      {children}
    </div>
  )
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({
  icon: Icon,
  label,
  value,
  color,
  onClick,
  onAdd,
}: {
  icon: React.ElementType
  label: string
  value: React.ReactNode
  color?: string
  onClick?: () => void
  onAdd?: () => void
}) {
  return (
    <div className="relative group flex flex-col items-start rounded-md border bg-white p-2 hover:bg-slate-50 transition-colors">
      <button className="absolute inset-0 rounded-md" onClick={onClick} />
      <div className="flex items-center gap-1 text-muted-foreground mb-1 w-full">
        <Icon className="h-3 w-3 shrink-0" />
        <span className="text-[10px] uppercase tracking-wide flex-1">{label}</span>
        {onAdd && (
          <button
            className="relative z-10 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground rounded"
            onClick={(e) => { e.stopPropagation(); onAdd() }}
            title={`Add ${label}`}
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>
      <span className={cn('text-sm font-semibold', color ?? 'text-slate-700')}>{value}</span>
    </div>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CommandSidebarProps {
  matterId: string
  tenantId: string
  userId: string
  matter: {
    matter_number?: string | null
    title: string
    opened_at?: string | null
    created_at: string
    responsible_lawyer_id?: string | null
    practice_area_id?: string | null
    status: string
  }
  users?: { id: string; first_name?: string | null; last_name?: string | null }[]
  practiceAreaName?: string | null
  /** Readiness data for immigration matters */
  formCompletionPct?: number | null
  docAccepted?: number
  docTotal?: number
  onOpenSheet: (key: string) => void
  onPortalDialogOpen: () => void
  /** Switch the main panel tab (documents, tasks, billing, etc.) */
  onMainTabChange?: (tab: string) => void
  className?: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CommandSidebar({
  matterId,
  tenantId,
  userId,
  matter,
  users,
  practiceAreaName,
  formCompletionPct,
  docAccepted,
  docTotal,
  onOpenSheet,
  onPortalDialogOpen,
  onMainTabChange,
  className,
}: CommandSidebarProps) {
  const router = useRouter()

  const { data: retainer, isLoading: retainerLoading } = useSidebarRetainer(matterId)
  const { data: taskCount } = useMatterTaskCount(matterId, tenantId)
  const { data: deadlines } = useMatterDeadlines(tenantId, matterId)
  const { data: slots } = useDocumentSlots(matterId)
  const { data: activities } = useActivities({ tenantId, matterId, limit: 4 })
  const { data: portalLinks } = usePortalLinks(matterId)
  const { data: primaryContact } = usePrimaryContact(matterId)
  const createPortalLink = useCreatePortalLink()
  const revokePortalLink = useRevokePortalLink()
  const createTask = useCreateTask()
  const createNote = useCreateNote()

  // Quick-add task state
  const [isAddingTask, setIsAddingTask] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDueDate, setTaskDueDate] = useState('')

  // Quick note state
  const [isAddingNote, setIsAddingNote] = useState(false)
  const [noteText, setNoteText] = useState('')

  const activePortalLink = portalLinks?.[0]
  const portalUrl = activePortalLink
    ? (typeof window !== 'undefined' ? `${window.location.origin}/portal/${activePortalLink.token}` : `/portal/${activePortalLink.token}`)
    : null

  // Document stats — use passed-in values (from readiness data) or compute from slots
  const computedDocAccepted = docAccepted ?? slots?.filter((s) => s.status === 'accepted').length ?? 0
  const computedDocTotal = docTotal ?? slots?.length ?? 0

  // Upcoming deadlines (next 14 days, not completed)
  const now = new Date()
  const upcomingDeadlines = (deadlines ?? []).filter((d) => {
    if (!d.due_date || d.completed_at) return false
    const due = new Date(d.due_date)
    const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return diffDays >= 0 && diffDays <= 14
  }).length

  const responsibleLawyer = users?.find((u) => u.id === matter.responsible_lawyer_id)
  const lawyerName = responsibleLawyer
    ? `${responsibleLawyer.first_name ?? ''} ${responsibleLawyer.last_name ?? ''}`.trim()
    : null

  const handleCopyPortal = useCallback(() => {
    if (!portalUrl) return
    navigator.clipboard.writeText(portalUrl)
    toast.success('Portal link copied')
  }, [portalUrl])

  const handleSaveTask = useCallback(async () => {
    if (!taskTitle.trim()) return
    await createTask.mutateAsync({
      title: taskTitle.trim(),
      tenant_id: tenantId,
      matter_id: matterId,
      status: 'todo',
      priority: 'medium',
      due_date: taskDueDate || null,
      created_by: userId,
      assigned_to: userId,
    })
    setTaskTitle('')
    setTaskDueDate('')
    setIsAddingTask(false)
  }, [taskTitle, taskDueDate, tenantId, matterId, userId, createTask])

  const handleSaveNote = useCallback(async () => {
    if (!noteText.trim()) return
    await createNote.mutateAsync({
      content: noteText.trim(),
      tenant_id: tenantId,
      matter_id: matterId,
      user_id: userId,
    })
    setNoteText('')
    setIsAddingNote(false)
  }, [noteText, matterId, tenantId, userId, createNote])

  return (
    <div
      className={cn(
        'w-[260px] shrink-0 space-y-4 overflow-y-auto rounded-lg border bg-slate-50/60 p-3',
        className,
      )}
    >
      {/* ── Primary Client ── */}
      {primaryContact && (
        <>
          <SidebarSection title="Client">
            <div className="rounded-md border bg-white p-2.5 space-y-2">
              <div className="flex items-start gap-2">
                {/* Avatar initials */}
                <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                  <span className="text-xs font-semibold text-slate-600">
                    {primaryContact.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-800 truncate">{primaryContact.name}</p>
                  {primaryContact.email && (
                    <p className="text-[11px] text-muted-foreground truncate">{primaryContact.email}</p>
                  )}
                  {primaryContact.phone && (
                    <p className="text-[11px] text-muted-foreground">{primaryContact.phone}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {primaryContact.email && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 flex-1 text-[10px] gap-1"
                    onClick={() => {
                      navigator.clipboard.writeText(primaryContact.email!)
                      toast.success('Email copied')
                    }}
                  >
                    <Mail className="h-3 w-3" />
                    Copy Email
                  </Button>
                )}
                {primaryContact.phone && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] gap-1"
                    onClick={() => {
                      navigator.clipboard.writeText(primaryContact.phone!)
                      toast.success('Phone copied')
                    }}
                  >
                    <Phone className="h-3 w-3" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] gap-1"
                  onClick={() => router.push(`/contacts/${primaryContact.id}`)}
                >
                  <User className="h-3 w-3" />
                  View
                </Button>
              </div>
            </div>
          </SidebarSection>
          <Separator />
        </>
      )}

      {/* ── Matter Identity ── */}
      <SidebarSection title="Matter">
        <div className="space-y-1 text-xs">
          {matter.matter_number && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <FileText className="h-3 w-3 shrink-0" />
              <span className="font-mono">{matter.matter_number}</span>
            </div>
          )}
          {lawyerName && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="text-[10px] uppercase tracking-wide font-medium w-10 shrink-0">Lawyer</span>
              <span className="text-slate-700 truncate">{lawyerName}</span>
            </div>
          )}
          {practiceAreaName && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="text-[10px] uppercase tracking-wide font-medium w-10 shrink-0">Area</span>
              <span className="text-slate-700 truncate">{practiceAreaName}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="text-[10px] uppercase tracking-wide font-medium w-10 shrink-0">Opened</span>
            <span className="text-slate-700">{formatDate(matter.opened_at ?? matter.created_at)}</span>
          </div>
        </div>
      </SidebarSection>

      <Separator />

      {/* ── Quick Stats ── */}
      <SidebarSection title="At a Glance">
        <div className="grid grid-cols-2 gap-1.5">
          <StatTile
            icon={FileText}
            label="Docs"
            value={`${computedDocAccepted}/${computedDocTotal}`}
            color={
              computedDocTotal > 0 && computedDocAccepted === computedDocTotal
                ? 'text-emerald-600'
                : computedDocAccepted > 0
                  ? 'text-amber-600'
                  : 'text-slate-700'
            }
            onClick={() => onMainTabChange?.('documents') ?? onOpenSheet('documents')}
          />

          <StatTile
            icon={ListTodo}
            label="Tasks"
            value={`${taskCount?.open ?? '—'} open`}
            color={(taskCount?.open ?? 0) === 0 ? 'text-emerald-600' : 'text-slate-700'}
            onClick={() => onOpenSheet('tasks')}
            onAdd={() => setIsAddingTask(true)}
          />

          <StatTile
            icon={CalendarDays}
            label="Due (14d)"
            value={upcomingDeadlines}
            color={upcomingDeadlines > 0 ? 'text-amber-600' : 'text-emerald-600'}
            onClick={() => onOpenSheet('deadlines')}
            onAdd={() => onOpenSheet('deadlines')}
          />

          {formCompletionPct != null && (
            <StatTile
              icon={CheckCircle2}
              label="Forms"
              value={`${formCompletionPct}%`}
              color={
                formCompletionPct >= 80 ? 'text-emerald-600'
                : formCompletionPct >= 50 ? 'text-amber-600'
                : 'text-red-600'
              }
            />
          )}
        </div>

        {/* Inline quick-add task form */}
        {isAddingTask && (
          <div className="rounded-md border bg-white p-2 space-y-1.5 mt-1">
            <Input
              autoFocus
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="Task title…"
              className="h-7 text-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveTask()
                if (e.key === 'Escape') setIsAddingTask(false)
              }}
            />
            <Input
              type="date"
              value={taskDueDate}
              onChange={(e) => setTaskDueDate(e.target.value)}
              className="h-7 text-xs"
            />
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                className="h-6 flex-1 text-[11px]"
                onClick={handleSaveTask}
                disabled={!taskTitle.trim() || createTask.isPending}
              >
                {createTask.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[11px]"
                onClick={() => { setIsAddingTask(false); setTaskTitle(''); setTaskDueDate('') }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </SidebarSection>

      <Separator />

      {/* ── Financial Summary ── */}
      <SidebarSection title="Retainer">
        {retainerLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : retainer ? (
          <div className="rounded-md border bg-white p-2.5 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Total Agreed</span>
              <span className="font-medium">{formatCents(retainer.total_amount_cents)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Paid</span>
              <span className="font-semibold text-emerald-600">{formatCents(retainer.payment_amount * 100)}</span>
            </div>
            {retainer.total_amount_cents > 0 && (
              <div className="flex justify-between text-xs border-t pt-1.5">
                <span className="text-muted-foreground font-medium">Balance</span>
                <span className={cn(
                  'font-semibold',
                  (retainer.total_amount_cents - retainer.payment_amount * 100) > 0 ? 'text-amber-600' : 'text-emerald-600',
                )}>
                  {formatCents(retainer.total_amount_cents - retainer.payment_amount * 100)}
                </span>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-full text-[10px] text-muted-foreground hover:text-foreground"
              onClick={() => onMainTabChange?.('billing') ?? onOpenSheet('billing')}
            >
              <CreditCard className="mr-1 h-3 w-3" />
              Open Billing
            </Button>
          </div>
        ) : (
          <div className="rounded-md border border-dashed bg-white p-2.5 text-center">
            <p className="text-[11px] text-muted-foreground">No retainer on file</p>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 mt-1 text-[10px]"
              onClick={() => onMainTabChange?.('billing') ?? onOpenSheet('billing')}
            >
              <CreditCard className="mr-1 h-3 w-3" />
              Open Billing
            </Button>
          </div>
        )}
      </SidebarSection>

      <Separator />

      {/* ── Client Portal ── */}
      <SidebarSection title="Client Portal">
        {activePortalLink ? (
          <div className="rounded-md border bg-white p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 border text-[10px] font-medium">
                Active
              </Badge>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopyPortal} title="Copy portal link">
                  <Copy className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => window.open(portalUrl ?? '', '_blank')} title="Open portal">
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground truncate font-mono">
              {portalUrl?.replace(/^https?:\/\/[^/]+/, '')}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-full text-[10px] text-amber-600 hover:text-amber-700 hover:bg-amber-50"
              onClick={() => revokePortalLink.mutate({ id: activePortalLink.id, matterId })}
              disabled={revokePortalLink.isPending}
            >
              {revokePortalLink.isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <RotateCcw className="mr-1 h-3 w-3" />
              )}
              Revoke Access
            </Button>
          </div>
        ) : (
          <div className="rounded-md border border-dashed bg-white p-2.5 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Link2 className="h-3 w-3 text-muted-foreground" />
              <Badge variant="outline" className="text-[10px]">No Active Link</Badge>
            </div>
            <Button
              variant="default"
              size="sm"
              className="h-7 text-xs w-full mt-1"
              onClick={onPortalDialogOpen}
              disabled={createPortalLink.isPending}
            >
              {createPortalLink.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="mr-1.5 h-3.5 w-3.5" />
              )}
              Create Portal Link
            </Button>
          </div>
        )}
      </SidebarSection>

      <Separator />

      {/* ── Quick Note ── */}
      <SidebarSection
        title="Quick Note"
        action={
          !isAddingNote ? (
            <button
              className="text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setIsAddingNote(true)}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          ) : null
        }
      >
        {isAddingNote ? (
          <div className="space-y-1.5">
            <Textarea
              autoFocus
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Type a note…"
              className="text-xs min-h-[72px] resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Escape') setIsAddingNote(false)
              }}
            />
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                className="h-6 flex-1 text-[11px]"
                onClick={handleSaveNote}
                disabled={!noteText.trim() || createNote.isPending}
              >
                {createNote.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                Save Note
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[11px]"
                onClick={() => { setIsAddingNote(false); setNoteText('') }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ) : (
          <button
            className="w-full flex items-center gap-2 rounded-md border border-dashed bg-white p-2 text-muted-foreground hover:text-foreground hover:bg-slate-50 transition-colors"
            onClick={() => setIsAddingNote(true)}
          >
            <StickyNote className="h-3.5 w-3.5 shrink-0" />
            <span className="text-[11px]">Add a note…</span>
          </button>
        )}
      </SidebarSection>

      <Separator />

      {/* ── Recent Activity ── */}
      <SidebarSection title="Recent Activity">
        {activities && activities.length > 0 ? (
          <div className="space-y-2">
            {activities.slice(0, 4).map((a) => (
              <div key={a.id} className="flex items-start gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0 mt-1.5" />
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-700 leading-tight line-clamp-2">
                    {a.description ?? a.title ?? 'Activity recorded'}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {formatDate(a.created_at)}
                  </p>
                </div>
              </div>
            ))}
            <button
              onClick={() => onOpenSheet('history')}
              className="text-[10px] text-blue-600 hover:text-blue-800 underline"
            >
              View all history
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground italic">No activity yet.</p>
        )}
      </SidebarSection>
    </div>
  )
}
