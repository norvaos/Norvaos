'use client'

import { useQuery } from '@tanstack/react-query'
import { Scale, AlertTriangle, Calendar, ShieldAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { formatDate } from '@/lib/utils/formatters'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import Link from 'next/link'

const supabase = createClient()

export default function LawyerWorkspace() {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''
  const { appUser } = useUser()
  const userId = appUser?.id ?? ''

  // Files awaiting lawyer review
  const { data: awaitingReview = [] } = useQuery({
    queryKey: ['workspace-lw-awaiting', tenantId, userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('matters')
        .select('id, title, matter_number, intake_status, risk_level, status, created_at, responsible_lawyer_id')
        .eq('tenant_id', tenantId)
        .or('intake_status.eq.awaiting_lawyer_review,risk_level.eq.critical')
        .neq('status', 'closed_won')
        .neq('status', 'closed_lost')
        .order('created_at', { ascending: false })
        .limit(20)
      return data ?? []
    },
    enabled: !!tenantId,
  })

  // Matter intake rows where lawyer review is pending
  const { data: reviewQueue = [] } = useQuery({
    queryKey: ['workspace-lw-review-queue', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('matter_intake')
        .select('id, matter_id, lawyer_review_status, intake_status, risk_level, risk_score, updated_at, matters(title, matter_number)')
        .eq('tenant_id', tenantId)
        .or('lawyer_review_status.is.null,lawyer_review_status.eq.pending')
        .order('updated_at', { ascending: false })
        .limit(20)
      return data ?? []
    },
    enabled: !!tenantId,
  })

  // Upcoming deadlines in next 14 days
  const { data: upcomingDeadlines = [] } = useQuery({
    queryKey: ['workspace-lw-deadlines', tenantId, userId],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0]
      const in14 = new Date()
      in14.setDate(in14.getDate() + 14)
      const in14Str = in14.toISOString().split('T')[0]
      const { data } = await supabase
        .from('matter_deadlines')
        .select('id, title, due_date, status, priority, matter_id, matters(title, matter_number, responsible_lawyer_id)')
        .eq('tenant_id', tenantId)
        .gte('due_date', today)
        .lte('due_date', in14Str)
        .neq('status', 'completed')
        .neq('status', 'waived')
        .order('due_date')
        .limit(20)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).filter((d) => (d.matters as any)?.responsible_lawyer_id === userId)
    },
    enabled: !!tenantId && !!userId,
  })

  // Open risk flags for assigned matters
  const { data: riskFlags = [] } = useQuery({
    queryKey: ['workspace-lw-risk-flags', tenantId, userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('matter_risk_flags')
        .select('id, flag_type, severity, status, detected_at, matter_id, matters(title, matter_number, responsible_lawyer_id)')
        .eq('tenant_id', tenantId)
        .eq('status', 'open')
        .order('severity')
        .order('detected_at', { ascending: false })
        .limit(20)
      return (data ?? []).filter((f) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (f.matters as any)?.responsible_lawyer_id === userId
      })
    },
    enabled: !!tenantId && !!userId,
  })

  const severityColour = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-950/40 text-red-400 border-red-500/20'
      case 'high': return 'bg-orange-950/40 text-orange-400 border-orange-500/20'
      case 'medium': return 'bg-yellow-950/40 text-yellow-400 border-yellow-500/20'
      default: return 'bg-gray-100 text-gray-600 border-gray-200'
    }
  }

  const intakeColour = (status: string | null) => {
    switch (status) {
      case 'awaiting_lawyer_review': return 'bg-orange-950/40 text-orange-400'
      case 'approved': return 'bg-emerald-950/40 text-emerald-400'
      case 'rejected': return 'bg-red-950/40 text-red-400'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Scale className="size-6 text-primary" />
          Lawyer Workspace
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Files awaiting review, upcoming deadlines, and risk flags.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Files Awaiting Approval */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Scale className="size-4 text-primary" />
                Files Awaiting Approval
              </span>
              <Badge variant={awaitingReview.length > 0 ? 'destructive' : 'secondary'}>
                {awaitingReview.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {awaitingReview.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No files awaiting approval.
              </p>
            ) : (
              <ul className="space-y-2">
                {awaitingReview.map((m) => (
                  <li key={m.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <Link href={`/matters/${m.id}`} className="font-medium truncate hover:underline block">
                        {m.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">{m.matter_number ?? ''}</p>
                    </div>
                    <span className={cn('ml-2 rounded-full px-2 py-0.5 text-xs font-medium shrink-0', intakeColour(m.intake_status))}>
                      {m.intake_status ?? 'no status'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Intake Review Queue */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-500" />
                Intake Review Queue
              </span>
              <Badge variant={reviewQueue.length > 0 ? 'destructive' : 'secondary'}>
                {reviewQueue.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {reviewQueue.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No intake reviews pending.
              </p>
            ) : (
              <ul className="space-y-2">
                {reviewQueue.map((row) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const matter = row.matters as any
                  return (
                    <li key={row.id} className="rounded-md border px-3 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <Link href={`/matters/${row.matter_id}`} className="font-medium truncate hover:underline">
                          {matter?.title ?? row.matter_id}
                        </Link>
                        <Badge variant="outline" className="ml-2 text-xs shrink-0">
                          Risk: {row.risk_level ?? 'unknown'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Score: {row.risk_score ?? 'N/A'} · Updated {formatDate(row.updated_at)}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Deadlines */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Calendar className="size-4 text-primary" />
                Deadlines (Next 14 Days)
              </span>
              <Badge variant={upcomingDeadlines.length > 0 ? 'destructive' : 'secondary'}>
                {upcomingDeadlines.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingDeadlines.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No upcoming deadlines.
              </p>
            ) : (
              <ul className="space-y-2">
                {upcomingDeadlines.map((d) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const matter = d.matters as any
                  return (
                    <li key={d.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{d.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {matter?.title ?? ''} · Due {formatDate(d.due_date)}
                        </p>
                      </div>
                      <Badge
                        variant={d.priority === 'critical' || d.priority === 'high' ? 'destructive' : 'secondary'}
                        className="ml-2 shrink-0 text-xs"
                      >
                        {d.priority ?? 'normal'}
                      </Badge>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Risk Flags */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <ShieldAlert className="size-4 text-red-500" />
                Open Risk Flags
              </span>
              <Badge variant={riskFlags.length > 0 ? 'destructive' : 'secondary'}>
                {riskFlags.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {riskFlags.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No open risk flags.
              </p>
            ) : (
              <ul className="space-y-2">
                {riskFlags.map((flag) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const matter = flag.matters as any
                  return (
                    <li key={flag.id} className={cn('rounded-md border px-3 py-2 text-sm', severityColour(flag.severity))}>
                      <div className="flex items-center justify-between">
                        <p className="font-medium truncate">
                          {matter?.title ?? flag.matter_id}
                        </p>
                        <Badge variant="outline" className="ml-2 text-xs shrink-0">
                          {flag.severity}
                        </Badge>
                      </div>
                      <p className="text-xs mt-0.5 opacity-80">
                        {flag.flag_type} · Detected {formatDate(flag.detected_at)}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
