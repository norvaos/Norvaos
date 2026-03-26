'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import {
  Bell,
  CheckCircle2,
  CheckCheck,
  ListTodo,
  UserPlus,
  RefreshCw,
  FileText,
  Briefcase,
} from 'lucide-react'

import { useUser } from '@/lib/hooks/use-user'
import {
  useNotifications,
  useUnreadNotificationCount,
  useMarkNotificationAsRead,
  useMarkAllNotificationsAsRead,
  notificationKeys,
} from '@/lib/queries/notifications'
import { useRealtime } from '@/lib/hooks/use-realtime'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

function getNotificationIcon(type: string | null) {
  switch (type) {
    case 'task_assigned':
      return UserPlus
    case 'task_completed':
      return CheckCircle2
    case 'task_updated':
      return RefreshCw
    case 'document_uploaded':
      return FileText
    case 'matter_updated':
      return Briefcase
    default:
      return ListTodo
  }
}

function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    gain.gain.setValueAtTime(0.18, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.6)
  } catch {
    // Audio context unavailable  -  skip silently
  }
}

function showNotificationToast(title: string, message: string, _isFrontDesk: boolean) {
  playChime()
  toast(title, {
    description: message || undefined,
    duration: Infinity,      // stays until the user manually dismisses it
    position: 'top-right',
  })
}

export function NotificationBell() {
  const { appUser } = useUser()
  const userId = appUser?.id ?? ''
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  const queryClient = useQueryClient()

  // Track the latest notification ID we've already shown a popup for
  const seenLatestIdRef = useRef<string | null>(null)
  // Track whether this is the initial load (don't popup for pre-existing notifications)
  const initialLoadDoneRef = useRef(false)

  // Prevent hydration mismatch
  useEffect(() => { setMounted(true) }, [])

  const { data: notifications, isLoading } = useNotifications(userId)
  const { data: unreadCount } = useUnreadNotificationCount(userId)
  const markAsRead = useMarkNotificationAsRead()
  const markAllAsRead = useMarkAllNotificationsAsRead()

  // ── Polling-based new notification detector ──────────────────────────────
  // Watches the notification list (polled every 6s). On the first load, records
  // the latest ID as "already seen". On subsequent polls, if a new unread
  // notification appears at the top, shows a popup immediately.
  useEffect(() => {
    if (!notifications || notifications.length === 0) return

    const latest = notifications[0]

    if (!initialLoadDoneRef.current) {
      // First load  -  record the current latest ID and suppress popup
      seenLatestIdRef.current = latest.id
      initialLoadDoneRef.current = true
      return
    }

    // If the latest notification is new and unread, show popup
    if (latest.id !== seenLatestIdRef.current && !latest.is_read) {
      seenLatestIdRef.current = latest.id
      const title   = latest.title ?? 'New Notification'
      const message = latest.message ?? ''
      const isFrontDesk = latest.notification_type?.startsWith('front_desk') ?? false
      showNotificationToast(title, message, isFrontDesk)
    }
  }, [notifications])

  // ── Realtime as a faster secondary path ──────────────────────────────────
  // Even if the polling catches it within 6s, Realtime can fire immediately.
  // The seenLatestIdRef guard prevents double-popups.
  useRealtime<Record<string, unknown>>({
    table: 'notifications',
    filter: `user_id=eq.${userId}`,
    event: 'INSERT',
    enabled: !!userId && initialLoadDoneRef.current,
    onInsert: (payload) => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.list(userId) })
      queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount(userId) })
      // Popup will fire via the useEffect above when the query updates,
      // OR fire immediately here if the query hasn't updated yet
      const id = payload.id as string | undefined
      if (id && id !== seenLatestIdRef.current) {
        seenLatestIdRef.current = id
        const title   = (payload.title   as string | undefined) ?? 'New Notification'
        const message = (payload.message as string | undefined) ?? ''
        const isFrontDesk = (payload.notification_type as string | undefined)?.startsWith('front_desk') ?? false
        showNotificationToast(title, message, isFrontDesk)
      }
    },
  })

  function handleNotificationClick(notification: {
    id: string
    entity_type: string | null
    entity_id: string | null
    is_read: boolean | null
  }) {
    // Mark as read if not already
    if (!notification.is_read) {
      markAsRead.mutate({ id: notification.id, userId })
    }

    // Navigate to entity if available
    if (notification.entity_type && notification.entity_id) {
      switch (notification.entity_type) {
        case 'task':
          router.push('/tasks')
          break
        case 'matter':
          router.push(`/matters/${notification.entity_id}`)
          break
        case 'contact':
          router.push(`/contacts/${notification.entity_id}`)
          break
        case 'lead':
          router.push(`/command/lead/${notification.entity_id}`)
          break
      }
      setOpen(false)
    }
  }

  function handleMarkAllRead() {
    markAllAsRead.mutate(userId)
  }

  // SSR placeholder  -  identical layout, no Radix Popover (avoids hydration ID mismatch)
  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="relative h-9 w-9">
        <Bell className="h-5 w-5" />
        <span className="sr-only">Notifications</span>
      </Button>
    )
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        // Auto-mark all as read when the panel is closed after being opened
        if (!next && (unreadCount ?? 0) > 0) {
          markAllAsRead.mutate(userId)
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className="h-5 w-5" />
          {(unreadCount ?? 0) > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {(unreadCount ?? 0) > 99 ? '99+' : unreadCount}
            </span>
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="end" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-sm">Notifications</h3>
          {(unreadCount ?? 0) > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={handleMarkAllRead}
              disabled={markAllAsRead.isPending}
            >
              <CheckCheck className="mr-1 h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        {/* Notification list */}
        <ScrollArea className="max-h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
          ) : !notifications || notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Bell className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                You&apos;ll be notified about task assignments and updates
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => {
                const Icon = getNotificationIcon(notification.notification_type)
                return (
                  <button
                    key={notification.id}
                    type="button"
                    className={cn(
                      'w-full flex gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors',
                      !notification.is_read && 'bg-primary/5'
                    )}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      !notification.is_read ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                    )}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        'text-sm leading-snug',
                        !notification.is_read && 'font-medium'
                      )}>
                        {notification.title}
                      </p>
                      {notification.message && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {notification.message}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(notification.created_at ?? ''), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                    {!notification.is_read && (
                      <div className="shrink-0 pt-1">
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
