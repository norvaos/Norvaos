'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import type { Json } from '@/lib/types/database'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

interface ChannelConfig {
  in_app: boolean
  email: boolean
  push: boolean
}

type TriggerMap = Record<string, ChannelConfig>

const EVENT_TYPES = [
  { key: 'stage_change', label: 'Stage Changes', description: 'When a matter advances to a new stage' },
  { key: 'task_assigned', label: 'Task Assignments', description: 'When a task is assigned to a team member' },
  { key: 'task_completed', label: 'Task Completed', description: 'When a task is marked complete' },
  { key: 'document_uploaded', label: 'Norva Document Bridge', description: 'When a document arrives via the Document Bridge' },
  { key: 'new_message', label: 'New Messages', description: 'When a new chat message is sent' },
  { key: 'deadline_approaching', label: 'Deadline Alerts', description: 'When a deadline is approaching' },
  { key: 'matter_updated', label: 'Matter Updates', description: 'When matter details are changed' },
]

const CHANNELS = [
  { key: 'in_app' as const, label: 'In-App' },
  { key: 'email' as const, label: 'Email' },
  { key: 'push' as const, label: 'Push' },
]

const DEFAULT_TRIGGERS: TriggerMap = {
  stage_change:         { in_app: true, email: true,  push: false },
  task_assigned:        { in_app: true, email: true,  push: true  },
  task_completed:       { in_app: true, email: false, push: false },
  document_uploaded:    { in_app: true, email: false, push: false },
  new_message:          { in_app: true, email: true,  push: true  },
  deadline_approaching: { in_app: true, email: true,  push: true  },
  matter_updated:       { in_app: true, email: false, push: false },
}

export function TenantNotificationTriggers() {
  const { tenant } = useTenant()
  const queryClient = useQueryClient()
  const [triggers, setTriggers] = useState<TriggerMap>(DEFAULT_TRIGGERS)
  const [dirty, setDirty] = useState(false)

  const { data: savedTriggers, isLoading } = useQuery({
    queryKey: ['settings', 'notification-triggers', tenant?.id],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('tenants')
        .select('settings')
        .eq('id', tenant!.id)
        .single()
      if (error) throw error
      const settings = (data?.settings as Record<string, unknown>) ?? {}
      return (settings.notification_triggers as TriggerMap | undefined) ?? DEFAULT_TRIGGERS
    },
    enabled: !!tenant,
  })

  useEffect(() => {
    if (savedTriggers) {
      // Merge saved with defaults to ensure all events are present
      const merged = { ...DEFAULT_TRIGGERS }
      for (const [key, value] of Object.entries(savedTriggers)) {
        if (merged[key]) {
          merged[key] = { ...merged[key], ...value }
        }
      }
      setTriggers(merged)
    }
  }, [savedTriggers])

  const saveMutation = useMutation({
    mutationFn: async (newTriggers: TriggerMap) => {
      const supabase = createClient()

      // Read current settings first to preserve other fields
      const { data: current } = await supabase
        .from('tenants')
        .select('settings')
        .eq('id', tenant!.id)
        .single()

      const existingSettings = (current?.settings as Record<string, unknown>) ?? {}

      const { error } = await supabase
        .from('tenants')
        .update({
          settings: { ...existingSettings, notification_triggers: newTriggers } as unknown as Json,
        })
        .eq('id', tenant!.id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'notification-triggers'] })
      setDirty(false)
      toast.success('Notification triggers saved')
    },
    onError: () => {
      toast.error('Failed to save notification triggers')
    },
  })

  const handleToggle = (eventKey: string, channel: keyof ChannelConfig) => {
    setTriggers((prev) => ({
      ...prev,
      [eventKey]: {
        ...prev[eventKey],
        [channel]: !prev[eventKey][channel],
      },
    }))
    setDirty(true)
  }

  if (isLoading || !tenant) return null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm">Notification Triggers</CardTitle>
          <CardDescription>
            Configure which events send notifications and through which channels for your entire firm.
          </CardDescription>
        </div>
        <Button
          size="sm"
          onClick={() => saveMutation.mutate(triggers)}
          disabled={!dirty || saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="mr-2 h-3.5 w-3.5" />
          )}
          Save
        </Button>
      </CardHeader>
      <CardContent>
        {/* Header row */}
        <div className="mb-2 grid grid-cols-[1fr_60px_60px_60px] gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Event</span>
          {CHANNELS.map((ch) => (
            <span key={ch.key} className="text-center">{ch.label}</span>
          ))}
        </div>

        {/* Event rows */}
        <div className="space-y-3">
          {EVENT_TYPES.map((event) => (
            <div
              key={event.key}
              className="grid grid-cols-[1fr_60px_60px_60px] items-center gap-2"
            >
              <div>
                <p className="text-sm font-medium">{event.label}</p>
                <p className="text-xs text-muted-foreground">{event.description}</p>
              </div>
              {CHANNELS.map((ch) => (
                <div key={ch.key} className="flex justify-center">
                  <Switch
                    checked={triggers[event.key]?.[ch.key] ?? false}
                    onCheckedChange={() => handleToggle(event.key, ch.key)}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
