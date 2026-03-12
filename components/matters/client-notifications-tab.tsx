'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useClientNotifications, clientNotificationKeys } from '@/lib/queries/client-notifications'
import { formatDate } from '@/lib/utils/formatters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Mail, Send, Loader2, AlertCircle, CheckCircle2, Clock, SkipForward } from 'lucide-react'
import { toast } from 'sonner'

interface ClientNotificationsTabProps {
  matterId: string
  tenantId: string
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof CheckCircle2 }> = {
  sent: { label: 'Sent', variant: 'default', icon: CheckCircle2 },
  pending: { label: 'Pending', variant: 'secondary', icon: Clock },
  failed: { label: 'Failed', variant: 'destructive', icon: AlertCircle },
  skipped: { label: 'Skipped', variant: 'outline', icon: SkipForward },
}

const TYPE_LABELS: Record<string, string> = {
  stage_change: 'Stage Change',
  document_request: 'Document Request',
  deadline_alert: 'Deadline Alert',
  general: 'General',
}

export function ClientNotificationsTab({ matterId, tenantId }: ClientNotificationsTabProps) {
  const { data: notifications, isLoading } = useClientNotifications(matterId)
  const queryClient = useQueryClient()
  const [sending, setSending] = useState(false)

  async function handleSendTestNotification() {
    setSending(true)
    try {
      const res = await fetch(`/api/matters/${matterId}/send-test-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Failed to send test notification')
        return
      }

      toast.success(`Test email sent to ${data.recipient_email}`)
      // Refresh the notifications list
      queryClient.invalidateQueries({ queryKey: clientNotificationKeys.byMatter(matterId) })
    } catch {
      toast.error('Failed to send test notification')
    } finally {
      setSending(false)
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Client Email Notifications
        </CardTitle>
        <Button onClick={handleSendTestNotification} disabled={sending} size="sm">
          {sending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          Send Test Notification
        </Button>
      </CardHeader>
      <CardContent>
        {!notifications || notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Mail className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              No email notifications have been sent for this matter yet.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Use the button above to send a test notification to the client.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notifications.map((notif) => {
                const statusConfig = STATUS_CONFIG[notif.status] ?? STATUS_CONFIG.pending
                const StatusIcon = statusConfig.icon

                return (
                  <TableRow key={notif.id}>
                    <TableCell>
                      <Badge variant={statusConfig.variant} className="gap-1">
                        <StatusIcon className="h-3 w-3" />
                        {statusConfig.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {TYPE_LABELS[notif.notification_type] ?? notif.notification_type}
                    </TableCell>
                    <TableCell className="text-sm max-w-[250px] truncate">
                      {notif.subject}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {notif.recipient_email ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {notif.sent_at ? formatDate(notif.sent_at) : formatDate(notif.created_at)}
                    </TableCell>
                    <TableCell className="text-sm text-destructive max-w-[200px] truncate">
                      {notif.error_message ?? '—'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
