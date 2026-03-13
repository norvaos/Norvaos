'use client'

/**
 * CommandSidebar — always-visible left panel in the matter command centre.
 *
 * Shows: matter identity, quick stats, financial summary (retainer),
 * portal link status, and recent activity feed.
 */

import { useCallback } from 'react'
import {
  FileText,
  ListTodo,
  CalendarDays,
  CreditCard,
  Link2,
  Copy,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  RotateCcw,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils/formatters'
import { toast } from 'sonner'

import { useDocumentSlots } from '@/lib/queries/document-slots'
import { useMatterDeadlines } from '@/lib/queries/matter-types'
import { useActivities } from '@/lib/queries/activities'
import { usePortalLinks, useCreatePortalLink, useRevokePortalLink } from '@/lib/queries/portal-links'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// ── Retainer hook (lightweight) ──────────────────────────────────────────────

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

// ── Matter tasks count ────────────────────────────────────────────────────────

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
  primaryContactName?: string | null
  /** Readiness data for immigration matters */
  formCompletionPct?: number | null
  docAccepted?: number
  docTotal?: number
  onOpenSheet: (key: string) => void
  onPortalDialogOpen: () => void
  className?: string
}

// ── Currency formatter ───────────────────────────────────────────────────────

function formatCents(cents: number | null | undefined): string {
  if (!cents && cents !== 0) return '—'
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100)
}

// ── Section header ────────────────────────────────────────────────────────────

function SidebarSection({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-1">{title}</p>
      {children}
    </div>
  )
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
  className,
}: CommandSidebarProps) {
  const { data: retainer, isLoading: retainerLoading } = useSidebarRetainer(matterId)
  const { data: taskCount } = useMatterTaskCount(matterId, tenantId)
  const { data: deadlines } = useMatterDeadlines(tenantId, matterId)
  const { data: slots } = useDocumentSlots(matterId)
  const { data: activities } = useActivities({ tenantId, matterId, limit: 4 })
  const { data: portalLinks } = usePortalLinks(matterId)
  const createPortalLink = useCreatePortalLink()
  const revokePortalLink = useRevokePortalLink()

  const activePortalLink = portalLinks?.[0]
  const portalUrl = activePortalLink
    ? (typeof window !== 'undefined' ? `${window.location.origin}/portal/${activePortalLink.token}` : `/portal/${activePortalLink.token}`)
    : null

  // Compute document stats if not passed in (for non-immigration matters)
  const computedDocAccepted = docAccepted ?? slots?.filter((s) => s.status === 'accepted').length ?? 0
  const computedDocTotal = docTotal ?? slots?.length ?? 0

  // Upcoming deadlines (next 14 days)
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

  return (
    <div
      className={cn(
        'w-[260px] shrink-0 space-y-4 overflow-y-auto rounded-lg border bg-slate-50/60 p-3',
        className,
      )}
    >
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
              <span className="text-[10px] uppercase tracking-wide font-medium">Lawyer</span>
              <span className="text-slate-700 truncate">{lawyerName}</span>
            </div>
          )}
          {practiceAreaName && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="text-[10px] uppercase tracking-wide font-medium">Area</span>
              <span className="text-slate-700 truncate">{practiceAreaName}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="text-[10px] uppercase tracking-wide font-medium">Opened</span>
            <span className="text-slate-700">{formatDate(matter.opened_at ?? matter.created_at)}</span>
          </div>
        </div>
      </SidebarSection>

      <Separator />

      {/* ── Quick Stats ── */}
      <SidebarSection title="At a Glance">
        <div className="grid grid-cols-2 gap-1.5">
          {/* Documents */}
          <button
            onClick={() => onOpenSheet('documents')}
            className="flex flex-col items-start rounded-md border bg-white p-2 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-1 text-muted-foreground mb-1">
              <FileText className="h-3 w-3" />
              <span className="text-[10px] uppercase tracking-wide">Docs</span>
            </div>
            <span className={cn(
              'text-sm font-semibold',
              computedDocTotal > 0 && computedDocAccepted === computedDocTotal
                ? 'text-emerald-600'
                : computedDocAccepted > 0
                  ? 'text-amber-600'
                  : 'text-slate-700',
            )}>
              {computedDocAccepted}/{computedDocTotal}
            </span>
          </button>

          {/* Tasks */}
          <button
            onClick={() => onOpenSheet('tasks')}
            className="flex flex-col items-start rounded-md border bg-white p-2 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-1 text-muted-foreground mb-1">
              <ListTodo className="h-3 w-3" />
              <span className="text-[10px] uppercase tracking-wide">Tasks</span>
            </div>
            <span className={cn(
              'text-sm font-semibold',
              (taskCount?.open ?? 0) === 0 ? 'text-emerald-600' : 'text-slate-700',
            )}>
              {taskCount?.open ?? '—'} open
            </span>
          </button>

          {/* Deadlines */}
          <button
            onClick={() => onOpenSheet('deadlines')}
            className="flex flex-col items-start rounded-md border bg-white p-2 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-1 text-muted-foreground mb-1">
              <CalendarDays className="h-3 w-3" />
              <span className="text-[10px] uppercase tracking-wide">Due (14d)</span>
            </div>
            <span className={cn(
              'text-sm font-semibold',
              upcomingDeadlines > 0 ? 'text-amber-600' : 'text-emerald-600',
            )}>
              {upcomingDeadlines}
            </span>
          </button>

          {/* Forms */}
          {formCompletionPct != null && (
            <button
              className="flex flex-col items-start rounded-md border bg-white p-2 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-1 text-muted-foreground mb-1">
                <CheckCircle2 className="h-3 w-3" />
                <span className="text-[10px] uppercase tracking-wide">Forms</span>
              </div>
              <span className={cn(
                'text-sm font-semibold',
                formCompletionPct >= 80 ? 'text-emerald-600' : formCompletionPct >= 50 ? 'text-amber-600' : 'text-red-600',
              )}>
                {formCompletionPct}%
              </span>
            </button>
          )}
        </div>
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
              onClick={() => onOpenSheet('billing')}
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
              onClick={() => onOpenSheet('billing')}
            >
              <CreditCard className="mr-1 h-3 w-3" />
              Open Billing
            </Button>
          </div>
        )}
      </SidebarSection>

      <Separator />

      {/* ── Portal Link ── */}
      <SidebarSection title="Client Portal">
        {activePortalLink ? (
          <div className="rounded-md border bg-white p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 border text-[10px] font-medium">
                Active
              </Badge>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleCopyPortal}
                  title="Copy portal link"
                >
                  <Copy className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => window.open(portalUrl ?? '', '_blank')}
                  title="Open portal"
                >
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

      {/* ── Recent Activity ── */}
      <SidebarSection title="Recent Activity">
        {activities && activities.length > 0 ? (
          <div className="space-y-2">
            {activities.slice(0, 4).map((a) => (
              <div key={a.id} className="flex items-start gap-2">
                <div className="mt-0.5 h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0 mt-1.5" />
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
