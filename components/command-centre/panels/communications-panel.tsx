'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useCommandCentre } from '../command-centre-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  MessageSquare,
  Phone,
  Mail,
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
} from 'lucide-react'

// ─── Hook ───────────────────────────────────────────────────────────

function useMatterCommunications(contactId: string | undefined, tenantId: string) {
  return useQuery({
    queryKey: ['matter-communications', contactId, tenantId],
    queryFn: async () => {
      if (!contactId) return []
      const supabase = createClient()

      // Get recent communication activities for this contact
      const { data, error } = await supabase
        .from('activities')
        .select('id, activity_type, title, description, metadata, created_at, user_id')
        .eq('tenant_id', tenantId)
        .eq('contact_id', contactId)
        .in('activity_type', [
          'call_logged',
          'lead_contacted',
          'follow_up_sent',
          'email_sent',
          'sms_sent',
          'note_added',
          'meeting_outcome',
        ])
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) throw error
      return data ?? []
    },
    enabled: !!contactId && !!tenantId,
    refetchInterval: 30_000,
  })
}

// ─── Activity type config ───────────────────────────────────────────

const ACTIVITY_ICONS: Record<string, { icon: React.ReactNode; color: string }> = {
  call_logged: { icon: <Phone className="h-3.5 w-3.5" />, color: 'text-blue-600' },
  lead_contacted: { icon: <Phone className="h-3.5 w-3.5" />, color: 'text-emerald-600' },
  follow_up_sent: { icon: <Mail className="h-3.5 w-3.5" />, color: 'text-violet-600' },
  email_sent: { icon: <Mail className="h-3.5 w-3.5" />, color: 'text-indigo-600' },
  sms_sent: { icon: <MessageSquare className="h-3.5 w-3.5" />, color: 'text-sky-600' },
  note_added: { icon: <MessageSquare className="h-3.5 w-3.5" />, color: 'text-slate-600' },
  meeting_outcome: { icon: <MessageSquare className="h-3.5 w-3.5" />, color: 'text-amber-600' },
}

// ─── Component ──────────────────────────────────────────────────────

/**
 * Communications Panel  -  recent calls, emails, messages for the matter's contact.
 *
 * Rule #19: No N+1  -  single query, no nested fetches.
 */
export function CommunicationsPanel() {
  const { contact, tenantId, entityType } = useCommandCentre()
  const { data: comms, isLoading } = useMatterCommunications(contact?.id, tenantId)

  if (entityType !== 'matter') return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-slate-700">
          <MessageSquare className="h-4 w-4" />
          Communications
          {comms && comms.length > 0 && (
            <Badge variant="secondary" className="ml-1 text-xs">
              {comms.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : !comms || comms.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">
            No communications recorded yet.
          </p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {comms.map((comm) => {
              const meta = (comm.metadata ?? {}) as Record<string, unknown>
              const direction = meta.direction as string | undefined
              const outcome = meta.outcome as string | undefined
              const actConfig = ACTIVITY_ICONS[comm.activity_type] ?? {
                icon: <MessageSquare className="h-3.5 w-3.5" />,
                color: 'text-slate-500',
              }

              return (
                <div key={comm.id} className="flex items-start gap-3 p-2 hover:bg-slate-50 rounded-md">
                  <div className={`mt-0.5 ${actConfig.color}`}>
                    {direction === 'inbound' ? (
                      <ArrowDownLeft className="h-3.5 w-3.5" />
                    ) : direction === 'outbound' ? (
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    ) : (
                      actConfig.icon
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-900 truncate">{comm.title}</p>
                    {comm.description && (
                      <p className="text-xs text-slate-500 truncate mt-0.5">{comm.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(comm.created_at ?? '').toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                      {outcome && (
                        <Badge variant="outline" className="text-xs py-0 h-5">
                          {outcome.replace(/_/g, ' ')}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
