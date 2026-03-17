'use client'

import { useQuery } from '@tanstack/react-query'
import { FileText, AlertTriangle, CheckSquare, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { formatDate } from '@/lib/utils/formatters'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import Link from 'next/link'

const supabase = createClient()

export default function LegalAssistantWorkspace() {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''
  const { appUser } = useUser()
  const userId = appUser?.id ?? ''

  // Assigned matters grouped by stage
  const { data: assignedMatters = [] } = useQuery({
    queryKey: ['workspace-la-matters', tenantId, userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('matters')
        .select('id, title, matter_number, status, stage_id, intake_status, responsible_lawyer_id, created_at')
        .eq('tenant_id', tenantId)
        .neq('status', 'closed_lost')
        .neq('status', 'closed_won')
        .order('created_at', { ascending: false })
        .limit(30)
      return data ?? []
    },
    enabled: !!tenantId,
  })

  // Group matters by status/stage
  const mattersByStage = assignedMatters.reduce<Record<string, typeof assignedMatters>>((acc, m) => {
    const key = m.status ?? 'unknown'
    if (!acc[key]) acc[key] = []
    acc[key].push(m)
    return acc
  }, {})

  // Document slots pending review
  const { data: pendingSlots = [] } = useQuery({
    queryKey: ['workspace-la-doc-slots', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('document_slots')
        .select('id, slot_name, status, matter_id, updated_at, matters(title, matter_number)')
        .eq('tenant_id', tenantId)
        .eq('status', 'pending_review')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(20)
      return data ?? []
    },
    enabled: !!tenantId,
  })

  // Tasks due today or overdue for this user
  const { data: dueTasks = [] } = useQuery({
    queryKey: ['workspace-la-tasks', tenantId, userId],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0]
      const { data } = await supabase
        .from('tasks')
        .select('id, title, due_date, priority, status, matter_id')
        .eq('tenant_id', tenantId)
        .eq('assigned_to', userId)
        .lte('due_date', today)
        .not('status', 'in', '("done","completed")')
        .order('due_date')
        .limit(20)
      return data ?? []
    },
    enabled: !!tenantId && !!userId,
  })

  // SLA warnings — matters in current stage approaching breach
  const { data: slaWarnings = [] } = useQuery({
    queryKey: ['workspace-la-sla', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('matter_stage_state')
        .select('id, matter_id, entered_at, matters(title, matter_number), current_stage_id, matter_stages!matter_stage_state_current_stage_id_fkey(name, sla_days)')
        .eq('tenant_id', tenantId)
        .not('entered_at', 'is', null)
        .limit(20)
      // Filter client-side for SLA approaching
      const now = new Date()
      return (data ?? []).filter((row) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stage = row.matter_stages as any
        const slaDays = stage?.sla_days
        if (!slaDays || !row.entered_at) return false
        const enteredAt = new Date(row.entered_at)
        const breachAt = new Date(enteredAt.getTime() + slaDays * 86400000)
        const daysUntilBreach = (breachAt.getTime() - now.getTime()) / 86400000
        return daysUntilBreach >= 0 && daysUntilBreach <= 3
      })
    },
    enabled: !!tenantId,
  })

  const stageColour = (status: string) => {
    switch (status) {
      case 'open': return 'bg-blue-100 text-blue-700'
      case 'active': return 'bg-green-100 text-green-700'
      case 'pending': return 'bg-yellow-100 text-yellow-700'
      case 'on_hold': return 'bg-orange-100 text-orange-700'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <FileText className="size-6 text-primary" />
          Legal Assistant Workspace
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Assigned matters, document reviews, and task deadlines.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Assigned Matters by Stage */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <FileText className="size-4 text-primary" />
                Matters by Status
              </span>
              <Badge variant="secondary">{assignedMatters.length} active</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {assignedMatters.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No active matters to show.
              </p>
            ) : (
              <div className="flex flex-wrap gap-4">
                {Object.entries(mattersByStage).map(([stage, matters]) => (
                  <div key={stage} className="min-w-[160px] rounded-lg border px-4 py-3 text-center">
                    <p className={cn('rounded-full px-2 py-0.5 text-xs font-medium inline-block mb-1', stageColour(stage))}>
                      {stage}
                    </p>
                    <p className="text-2xl font-bold">{matters.length}</p>
                    <p className="text-xs text-muted-foreground mt-1 space-y-0.5">
                      {matters.slice(0, 3).map((m) => (
                        <span key={m.id} className="block truncate max-w-[140px]">
                          <Link href={`/matters/${m.id}`} className="hover:underline">
                            {m.matter_number ?? m.title}
                          </Link>
                        </span>
                      ))}
                      {matters.length > 3 && (
                        <span className="text-muted-foreground">+{matters.length - 3} more</span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Document Slots Pending Review */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <FileText className="size-4 text-primary" />
                Documents Pending Review
              </span>
              <Badge variant={pendingSlots.length > 0 ? 'destructive' : 'secondary'}>
                {pendingSlots.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingSlots.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No documents pending review.
              </p>
            ) : (
              <ul className="space-y-2">
                {pendingSlots.map((slot) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const matter = slot.matters as any
                  return (
                    <li key={slot.id} className="rounded-md border px-3 py-2 text-sm">
                      <p className="font-medium truncate">{slot.slot_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {matter?.title ?? 'Unknown matter'} · Uploaded {formatDate(slot.updated_at)}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Tasks Due Today */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <CheckSquare className="size-4 text-primary" />
                Tasks Due Today / Overdue
              </span>
              <Badge variant={dueTasks.length > 0 ? 'destructive' : 'secondary'}>
                {dueTasks.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dueTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No tasks due today.
              </p>
            ) : (
              <ul className="space-y-2">
                {dueTasks.map((task) => (
                  <li key={task.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{task.title}</p>
                      <p className="text-xs text-muted-foreground">Due {formatDate(task.due_date)}</p>
                    </div>
                    <Badge
                      variant={task.priority === 'high' || task.priority === 'urgent' ? 'destructive' : 'secondary'}
                      className="ml-2 shrink-0 text-xs"
                    >
                      {task.priority ?? 'normal'}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* SLA Warnings */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-500" />
                SLA Warnings (approaching breach within 3 days)
              </span>
              <Badge variant={slaWarnings.length > 0 ? 'destructive' : 'secondary'}>
                {slaWarnings.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {slaWarnings.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No SLA warnings to show.
              </p>
            ) : (
              <ul className="space-y-2">
                {slaWarnings.map((row) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const matter = row.matters as any
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const stage = row.matter_stages as any
                  return (
                    <li key={row.id} className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {matter?.title ?? row.matter_id}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Stage: {stage?.name ?? 'Unknown'} · Entered {formatDate(row.entered_at)} · SLA {stage?.sla_days ?? '?'} days
                        </p>
                      </div>
                      <AlertTriangle className="ml-2 size-4 shrink-0 text-amber-500" />
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
