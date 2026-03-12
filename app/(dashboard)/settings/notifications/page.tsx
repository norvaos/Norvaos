'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, Mail, Smartphone, Monitor, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/use-user'
import { usePushRegistration } from '@/lib/hooks/use-push-registration'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'

interface NotificationPrefs {
  email_notifications: boolean
  push_notifications: boolean
  task_reminders: boolean
  lead_assignments: boolean
  document_updates: boolean
}

const DEFAULT_PREFS: NotificationPrefs = {
  email_notifications: true,
  push_notifications: true,
  task_reminders: true,
  lead_assignments: true,
  document_updates: true,
}

const PREF_ITEMS: {
  key: keyof NotificationPrefs
  label: string
  description: string
  icon: typeof Bell
  section: 'channel' | 'event'
}[] = [
  {
    key: 'email_notifications',
    label: 'Email Notifications',
    description: 'Receive notifications via email',
    icon: Mail,
    section: 'channel',
  },
  {
    key: 'push_notifications',
    label: 'Push Notifications',
    description: 'Receive browser push notifications',
    icon: Smartphone,
    section: 'channel',
  },
  {
    key: 'task_reminders',
    label: 'Task Reminders',
    description: 'Get notified about task assignments and updates',
    icon: Bell,
    section: 'event',
  },
  {
    key: 'lead_assignments',
    label: 'Lead Assignments',
    description: 'Get notified when leads are assigned to you',
    icon: Monitor,
    section: 'event',
  },
  {
    key: 'document_updates',
    label: 'Document Updates',
    description: 'Get notified when documents are uploaded or updated',
    icon: Bell,
    section: 'event',
  },
]

export default function NotificationPreferencesPage() {
  const { appUser } = useUser()
  const queryClient = useQueryClient()
  const { isSupported: pushSupported, isSubscribed: pushActive, subscribe: subscribePush } = usePushRegistration()
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS)
  const [dirty, setDirty] = useState(false)

  const { data: savedPrefs, isLoading } = useQuery({
    queryKey: ['settings', 'notification-prefs', appUser?.id],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('users')
        .select('notification_prefs')
        .eq('id', appUser!.id)
        .single()
      if (error) throw error
      return (data?.notification_prefs as NotificationPrefs | null) ?? DEFAULT_PREFS
    },
    enabled: !!appUser,
  })

  useEffect(() => {
    if (savedPrefs) {
      setPrefs({ ...DEFAULT_PREFS, ...savedPrefs })
    }
  }, [savedPrefs])

  const saveMutation = useMutation({
    mutationFn: async (newPrefs: NotificationPrefs) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('users')
        .update({ notification_prefs: newPrefs as unknown as Record<string, boolean> })
        .eq('id', appUser!.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'notification-prefs'] })
      setDirty(false)
      toast.success('Notification preferences saved')
    },
    onError: () => {
      toast.error('Failed to save preferences')
    },
  })

  const handleToggle = (key: keyof NotificationPrefs) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }))
    setDirty(true)
  }

  const handleSave = () => {
    saveMutation.mutate(prefs)
  }

  const handleEnablePush = async () => {
    const success = await subscribePush()
    if (success) {
      toast.success('Push notifications enabled')
    } else {
      toast.error('Failed to enable push notifications. Check browser permissions.')
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  const channelItems = PREF_ITEMS.filter((i) => i.section === 'channel')
  const eventItems = PREF_ITEMS.filter((i) => i.section === 'event')

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Notification Preferences</h1>
          <p className="text-sm text-muted-foreground">
            Control how and when you receive notifications.
          </p>
        </div>
        <Button onClick={handleSave} disabled={!dirty || saveMutation.isPending} size="sm">
          {saveMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save
        </Button>
      </div>

      {/* Channels */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Notification Channels</CardTitle>
          <CardDescription>Choose how you want to be notified.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {channelItems.map((item) => {
            const Icon = item.icon
            return (
              <div key={item.key} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                </div>
                <Switch
                  checked={prefs[item.key]}
                  onCheckedChange={() => handleToggle(item.key)}
                />
              </div>
            )
          })}

          {/* Push status */}
          {pushSupported && !pushActive && prefs.push_notifications && (
            <>
              <Separator />
              <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs text-amber-800">
                  Push notifications are enabled but your browser hasn&apos;t been registered yet.
                </p>
                <Button size="sm" variant="outline" onClick={handleEnablePush}>
                  Enable
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Event types */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Event Types</CardTitle>
          <CardDescription>Select which events trigger notifications.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {eventItems.map((item) => {
            const Icon = item.icon
            return (
              <div key={item.key} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                </div>
                <Switch
                  checked={prefs[item.key]}
                  onCheckedChange={() => handleToggle(item.key)}
                />
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
