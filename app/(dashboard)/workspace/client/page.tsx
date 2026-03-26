'use client'

import { useQuery } from '@tanstack/react-query'
import { User, FileText, Calendar, DollarSign } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { formatDate, formatCurrency } from '@/lib/utils/formatters'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const supabase = createClient()

export default function ClientWorkspace() {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''
  const { appUser, authUser } = useUser()
  const userId = appUser?.id ?? ''

  // Find the contact linked to the current auth user's email
  const { data: linkedContact } = useQuery({
    queryKey: ['workspace-cl-contact', tenantId, authUser?.email],
    queryFn: async () => {
      if (!authUser?.email) return null
      const { data } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email_primary')
        .eq('tenant_id', tenantId)
        .eq('email_primary', authUser.email)
        .maybeSingle()
      return data
    },
    enabled: !!tenantId && !!authUser?.email,
  })

  const contactId = linkedContact?.id ?? ''

  // Client's active matters  -  scoped to matters where this contact appears in matter_contacts.
  // This enforces that authenticated clients only see their own matters.
  const { data: clientMatters = [] } = useQuery({
    queryKey: ['workspace-cl-matters', tenantId, contactId],
    queryFn: async () => {
      if (!contactId) return []
      // Fetch matter IDs linked to this contact via matter_contacts junction table
      const { data: links } = await supabase
        .from('matter_contacts')
        .select('matter_id')
        .eq('contact_id', contactId)
      const matterIds = (links ?? []).map((r) => r.matter_id).filter(Boolean) as string[]
      if (matterIds.length === 0) return []
      const { data } = await supabase
        .from('matters')
        .select('id, title, matter_number, status, intake_status, stage_id, created_at')
        .eq('tenant_id', tenantId)
        .in('id', matterIds)
        .neq('status', 'closed_lost')
        .limit(5)
      return data ?? []
    },
    enabled: !!tenantId && !!contactId,
  })

  // Stage state for first active matter
  const primaryMatter = clientMatters[0]
  const { data: stageState } = useQuery({
    queryKey: ['workspace-cl-stage', primaryMatter?.id],
    queryFn: async () => {
      if (!primaryMatter) return null
      const { data } = await supabase
        .from('matter_stage_state')
        .select('id, current_stage_id, stage_history, matter_stages!matter_stage_state_current_stage_id_fkey(name, sort_order)')
        .eq('matter_id', primaryMatter.id)
        .maybeSingle()
      return data
    },
    enabled: !!primaryMatter?.id,
  })

  // Outstanding document slots for client's matters
  const matterIds = clientMatters.map((m) => m.id)
  const { data: outstandingDocs = [] } = useQuery({
    queryKey: ['workspace-cl-docs', tenantId, ...matterIds],
    queryFn: async () => {
      if (matterIds.length === 0) return []
      const { data } = await supabase
        .from('document_slots')
        .select('id, slot_name, status, matter_id, updated_at, matters(title)')
        .eq('tenant_id', tenantId)
        .in('matter_id', matterIds)
        .neq('status', 'accepted')
        .neq('status', 'empty')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(15)
      return data ?? []
    },
    enabled: !!tenantId && matterIds.length > 0,
  })

  // Upcoming appointments for client's matters (next 30 days)
  const { data: upcomingAppts = [] } = useQuery({
    queryKey: ['workspace-cl-appointments', tenantId, contactId],
    queryFn: async () => {
      if (!contactId) return []
      const today = new Date().toISOString().split('T')[0]
      const in30 = new Date()
      in30.setDate(in30.getDate() + 30)
      const in30Str = in30.toISOString().split('T')[0]
      const { data } = await supabase
        .from('appointments')
        .select('id, guest_name, start_time, end_time, status, appointment_date')
        .eq('tenant_id', tenantId)
        .eq('contact_id', contactId)
        .gte('appointment_date', today)
        .lte('appointment_date', in30Str)
        .order('appointment_date')
        .limit(10)
      return data ?? []
    },
    enabled: !!tenantId && !!contactId,
  })

  // Invoices for client's matters
  const { data: invoices = [] } = useQuery({
    queryKey: ['workspace-cl-invoices', tenantId, ...matterIds],
    queryFn: async () => {
      if (matterIds.length === 0) return []
      const { data } = await supabase
        .from('invoices')
        .select('id, invoice_number, status, total_amount, balance_due, due_date, currency_code')
        .eq('tenant_id', tenantId)
        .in('matter_id', matterIds)
        .not('status', 'in', '("draft","cancelled","void")')
        .order('due_date')
        .limit(10)
      return data ?? []
    },
    enabled: !!tenantId && matterIds.length > 0,
  })

  const statusColour = (status: string | null) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-700'
      case 'overdue': return 'bg-red-100 text-red-700'
      case 'sent': return 'bg-blue-100 text-blue-700'
      case 'viewed': return 'bg-purple-100 text-purple-700'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  const apptStatusColour = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-green-100 text-green-700'
      case 'pending': return 'bg-yellow-100 text-yellow-700'
      case 'cancelled': return 'bg-red-100 text-red-700'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentStage = stageState?.matter_stages as any

  // If the user's email could not be matched to a contact record, show a clear empty state.
  // This prevents accidentally showing another client's matters if the contact link is missing.
  if (!linkedContact && !!tenantId && !!authUser?.email) {
    return (
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <User className="size-6 text-primary" />
            Client Portal
          </h1>
        </div>
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6 pb-6 text-center">
            <p className="text-sm font-medium text-amber-900">
              Your account is not yet linked to any matters.
            </p>
            <p className="text-sm text-amber-700 mt-1">
              Please contact your lawyer to have your account linked to your file.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <User className="size-6 text-primary" />
          Client Portal
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your matter status, documents, appointments, and invoices.
        </p>
      </div>

      {/* No matters linked to this contact */}
      {linkedContact && clientMatters.length === 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6 pb-6 text-center">
            <p className="text-sm font-medium text-amber-900">
              Your account is not yet linked to any matters.
            </p>
            <p className="text-sm text-amber-700 mt-1">
              Please contact your lawyer to have your account linked to your file.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Matter Status Summary */}
      {primaryMatter && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-foreground">{primaryMatter.title}</h2>
                {primaryMatter.matter_number && (
                  <p className="text-xs text-muted-foreground">{primaryMatter.matter_number}</p>
                )}
                {currentStage && (
                  <p className="text-sm mt-1">
                    Current Stage: <span className="font-medium">{currentStage.name}</span>
                  </p>
                )}
              </div>
              <Badge variant="secondary" className="shrink-0">
                {primaryMatter.status ?? 'active'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Outstanding Document Requests */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <FileText className="size-4 text-primary" />
                Document Requests
              </span>
              <Badge variant={outstandingDocs.length > 0 ? 'destructive' : 'secondary'}>
                {outstandingDocs.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {outstandingDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No outstanding document requests.
              </p>
            ) : (
              <ul className="space-y-2">
                {outstandingDocs.map((slot) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const matter = slot.matters as any
                  return (
                    <li key={slot.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{slot.slot_name}</p>
                        <p className="text-xs text-muted-foreground">{matter?.title ?? ''}</p>
                      </div>
                      <Badge variant="outline" className="ml-2 shrink-0 text-xs">
                        {slot.status}
                      </Badge>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Appointments */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Calendar className="size-4 text-primary" />
                Upcoming Appointments
              </span>
              <Badge variant="secondary">{upcomingAppts.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingAppts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No upcoming appointments in the next 30 days.
              </p>
            ) : (
              <ul className="space-y-2">
                {upcomingAppts.map((appt) => (
                  <li key={appt.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{formatDate(appt.appointment_date)}</p>
                      <p className="text-xs text-muted-foreground">
                        {appt.start_time} – {appt.end_time}
                      </p>
                    </div>
                    <span className={cn('ml-2 rounded-full px-2 py-0.5 text-xs font-medium shrink-0', apptStatusColour(appt.status))}>
                      {appt.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Invoice Status */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <DollarSign className="size-4 text-primary" />
                Invoice Status
              </span>
              <Badge variant="secondary">{invoices.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No invoices to show.
              </p>
            ) : (
              <ul className="space-y-2">
                {invoices.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{inv.invoice_number ?? inv.id.slice(0, 8)}</p>
                      <p className="text-xs text-muted-foreground">
                        Due {inv.due_date ? formatDate(inv.due_date) : ' - '}
                      </p>
                    </div>
                    <div className="ml-2 flex items-center gap-2 shrink-0">
                      <span className="font-medium text-sm">
                        {formatCurrency(inv.balance_due ?? inv.total_amount ?? 0, inv.currency_code ?? 'CAD')}
                      </span>
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', statusColour(inv.status))}>
                        {inv.status}
                      </span>
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
