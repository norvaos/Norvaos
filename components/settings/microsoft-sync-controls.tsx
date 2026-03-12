'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Calendar, CheckSquare, Loader2, RefreshCw } from 'lucide-react'
import {
  useMicrosoftConnection,
  useUpdateMicrosoftSettings,
  useTriggerSync,
} from '@/lib/queries/microsoft-integration'
import { formatDistanceToNow } from 'date-fns'

interface MicrosoftSyncControlsProps {
  userId: string
}

export function MicrosoftSyncControls({ userId }: MicrosoftSyncControlsProps) {
  const { data: connection } = useMicrosoftConnection(userId)
  const updateSettings = useUpdateMicrosoftSettings()
  const triggerSync = useTriggerSync()

  if (!connection) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sync Settings</CardTitle>
        <CardDescription>
          Choose what to sync between NorvaOS and your Microsoft account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Calendar Sync */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <div>
              <Label htmlFor="calendar-sync" className="text-sm font-medium">
                Outlook Calendar
              </Label>
              <p className="text-xs text-muted-foreground">
                {connection.last_calendar_sync_at
                  ? `Last synced ${formatDistanceToNow(new Date(connection.last_calendar_sync_at), { addSuffix: true })}`
                  : 'Not synced yet'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {connection.calendar_sync_enabled && (
              <Button
                variant="ghost"
                size="sm"
                disabled={triggerSync.isPending}
                onClick={() => triggerSync.mutate('calendar')}
              >
                {triggerSync.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
            <Switch
              id="calendar-sync"
              checked={connection.calendar_sync_enabled}
              onCheckedChange={(checked) =>
                updateSettings.mutate({ calendar_sync_enabled: checked })
              }
              disabled={updateSettings.isPending}
            />
          </div>
        </div>

        <Separator />

        {/* Tasks Sync */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckSquare className="h-5 w-5 text-muted-foreground" />
            <div>
              <Label htmlFor="tasks-sync" className="text-sm font-medium">
                Microsoft To Do
              </Label>
              <p className="text-xs text-muted-foreground">
                {connection.last_tasks_sync_at
                  ? `Last synced ${formatDistanceToNow(new Date(connection.last_tasks_sync_at), { addSuffix: true })}`
                  : 'Not synced yet'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {connection.tasks_sync_enabled && (
              <Button
                variant="ghost"
                size="sm"
                disabled={triggerSync.isPending}
                onClick={() => triggerSync.mutate('tasks')}
              >
                {triggerSync.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
            <Switch
              id="tasks-sync"
              checked={connection.tasks_sync_enabled}
              onCheckedChange={(checked) =>
                updateSettings.mutate({ tasks_sync_enabled: checked })
              }
              disabled={updateSettings.isPending}
            />
          </div>
        </div>

        <Separator />

        {/* Sync All Button */}
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={triggerSync.isPending || (!connection.calendar_sync_enabled && !connection.tasks_sync_enabled)}
            onClick={() => triggerSync.mutate('all')}
          >
            {triggerSync.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sync All Now
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
