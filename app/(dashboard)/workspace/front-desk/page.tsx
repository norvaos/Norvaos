'use client'

import { useQuery } from '@tanstack/react-query'
import { PhoneCall, UserPlus, Bell, Phone, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import { formatDate } from '@/lib/utils/formatters'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const supabase = createClient()

export default function FrontDeskWorkspace() {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''

  // Today's consultations (appointments)
  const { data: todayAppointments = [] } = useQuery({
    queryKey: ['workspace-fd-today-appointments', tenantId],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0]
      const { data } = await supabase
        .from('appointments')
        .select('id, guest_name, guest_email, guest_phone, start_time, end_time, status, appointment_date')
        .eq('tenant_id', tenantId)
        .eq('appointment_date', today)
        .order('start_time')
      return data ?? []
    },
    enabled: !!tenantId,
  })

  // New leads queue
  const { data: newLeads = [] } = useQuery({
    queryKey: ['workspace-fd-new-leads', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('leads')
        .select('id, status, created_at, source, contacts(first_name, last_name, email_primary)')
        .eq('tenant_id', tenantId)
        .in('status', ['new', 'uncontacted', 'cold'])
        .order('created_at', { ascending: false })
        .limit(10)
      return data ?? []
    },
    enabled: !!tenantId,
  })

  // Follow-up tasks due today or overdue
  const { data: followUps = [] } = useQuery({
    queryKey: ['workspace-fd-followups', tenantId],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0]
      const { data } = await supabase
        .from('tasks')
        .select('id, title, due_date, priority, status, assigned_to')
        .eq('tenant_id', tenantId)
        .eq('category', 'follow_up')
        .lte('due_date', today)
        .not('status', 'in', '("done","completed")')
        .order('due_date')
        .limit(15)
      return data ?? []
    },
    enabled: !!tenantId,
  })

  // Recent phone/call activities
  const { data: phoneLogs = [] } = useQuery({
    queryKey: ['workspace-fd-phone-log', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('activities')
        .select('id, title, description, activity_type, created_at, contact_id')
        .eq('tenant_id', tenantId)
        .ilike('activity_type', '%call%')
        .order('created_at', { ascending: false })
        .limit(10)
      return data ?? []
    },
    enabled: !!tenantId,
  })

  const statusColour = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-emerald-950/40 text-emerald-400'
      case 'pending': return 'bg-yellow-950/40 text-yellow-400'
      case 'cancelled': return 'bg-red-950/40 text-red-400'
      case 'completed': return 'bg-blue-950/40 text-blue-400'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <PhoneCall className="size-6 text-primary" />
          Front Desk Workspace
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Today&apos;s consultations, leads, and follow-up actions at a glance.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Today's Consultations */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Clock className="size-4 text-primary" />
                Today&apos;s Consultations
              </span>
              <Badge variant="secondary">{todayAppointments.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {todayAppointments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No consultations scheduled for today.
              </p>
            ) : (
              <ul className="space-y-2">
                {todayAppointments.map((appt) => (
                  <li key={appt.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{appt.guest_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {appt.start_time} – {appt.end_time}
                      </p>
                    </div>
                    <span className={cn('ml-2 rounded-full px-2 py-0.5 text-xs font-medium shrink-0', statusColour(appt.status))}>
                      {appt.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* New Leads Queue */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <UserPlus className="size-4 text-primary" />
                New Leads Queue
              </span>
              <Badge variant="secondary">{newLeads.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {newLeads.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No new leads to show.
              </p>
            ) : (
              <ul className="space-y-2">
                {newLeads.map((lead) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const contact = lead.contacts as any
                  const displayName = contact
                    ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email_primary
                    : 'Unknown'
                  return (
                    <li key={lead.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{displayName}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(lead.created_at)} · {lead.source ?? 'Unknown source'}
                        </p>
                      </div>
                      <Badge variant="outline" className="ml-2 shrink-0 text-xs">
                        {lead.status}
                      </Badge>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Follow-up Actions Due */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Bell className="size-4 text-primary" />
                Follow-up Actions Due
              </span>
              <Badge variant={followUps.length > 0 ? 'destructive' : 'secondary'}>
                {followUps.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {followUps.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No follow-up actions due.
              </p>
            ) : (
              <ul className="space-y-2">
                {followUps.map((task) => (
                  <li key={task.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{task.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Due {formatDate(task.due_date)}
                      </p>
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

        {/* Phone Log */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Phone className="size-4 text-primary" />
                Recent Phone Log
              </span>
              <Badge variant="secondary">{phoneLogs.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {phoneLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No phone activity to show.
              </p>
            ) : (
              <ul className="space-y-2">
                {phoneLogs.map((log) => (
                  <li key={log.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{log.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(log.created_at)} · {log.activity_type}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
