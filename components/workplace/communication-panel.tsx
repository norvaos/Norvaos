'use client'

/**
 * CommunicationPanel (Zone 3) — Persistent email/communication panel.
 *
 * Shows email thread list, thread view, compose/reply, and quick action buttons.
 * Collapsible with toggle.
 */

import { useState, useCallback } from 'react'
import {
  Mail,
  Plus,
  ListTodo,
  StickyNote,
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/lib/stores/ui-store'
import { useEmailMessages, type EmailThread, type EmailMessage } from '@/lib/queries/email'
import { formatDate } from '@/lib/utils/formatters'
import { EmailThreadList } from './email-thread-list'
import { EmailCompose } from './email-compose'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CommunicationPanelProps {
  matterId: string
  matterNumber?: string | null
  tenantId: string
  onCreateTask?: () => void
  onCreateNote?: () => void
  onCreateReminder?: () => void
  onCreateAppointment?: () => void
}

// ── Component ──────────────────────────────────────────────────────────────────

export function CommunicationPanel({
  matterId,
  matterNumber,
  tenantId,
  onCreateTask,
  onCreateNote,
  onCreateReminder,
  onCreateAppointment,
}: CommunicationPanelProps) {
  const collapsed = useUIStore((s) => s.communicationPanelCollapsed)
  const toggleCollapsed = useUIStore((s) => s.toggleCommunicationPanel)

  const [view, setView] = useState<'list' | 'thread' | 'compose'>('list')
  const [selectedThread, setSelectedThread] = useState<EmailThread | null>(null)

  const handleSelectThread = useCallback((thread: EmailThread) => {
    setSelectedThread(thread)
    setView('thread')
  }, [])

  const handleCompose = useCallback(() => {
    setSelectedThread(null)
    setView('compose')
  }, [])

  const handleBack = useCallback(() => {
    setView('list')
    setSelectedThread(null)
  }, [])

  // Collapsed state — just show expand button
  if (collapsed) {
    return (
      <div className="w-10 shrink-0 border-l bg-card flex flex-col items-center py-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={toggleCollapsed}
          title="Expand communication panel"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="mt-2 -rotate-90 whitespace-nowrap text-[10px] text-muted-foreground tracking-wider">
          COMMS
        </div>
      </div>
    )
  }

  return (
    <div className="w-[380px] shrink-0 border-l bg-card flex flex-col h-full hidden lg:flex">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
        {view !== 'list' && (
          <Button variant="ghost" size="icon" className="size-7" onClick={handleBack}>
            <ArrowLeft className="size-3.5" />
          </Button>
        )}
        <Mail className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium flex-1">
          {view === 'compose' ? 'New Email' : view === 'thread' ? (selectedThread?.subject ?? 'Thread') : 'Communications'}
        </span>
        <Button variant="ghost" size="icon" className="size-7" onClick={handleCompose} title="Compose">
          <Plus className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={toggleCollapsed}
          title="Collapse panel"
        >
          <ChevronRight className="size-3.5" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {view === 'list' && (
          <EmailThreadList
            tenantId={tenantId}
            matterId={matterId}
            selectedThreadId={selectedThread?.id}
            onSelectThread={handleSelectThread}
          />
        )}

        {view === 'thread' && selectedThread && (
          <ThreadView
            thread={selectedThread}
            matterId={matterId}
            matterNumber={matterNumber}
          />
        )}

        {view === 'compose' && (
          <div className="p-3">
            <EmailCompose
              matterId={matterId}
              matterNumber={matterNumber}
              replyToThread={selectedThread}
              onSent={handleBack}
              onCancel={handleBack}
              compact
            />
          </div>
        )}
      </div>

      {/* Quick action buttons */}
      <div className="border-t px-3 py-2 shrink-0">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground mr-1">Quick:</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={onCreateTask}
          >
            <ListTodo className="h-3 w-3" />
            Task
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={onCreateNote}
          >
            <StickyNote className="h-3 w-3" />
            Note
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={onCreateReminder}
          >
            <Bell className="h-3 w-3" />
            Reminder
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={onCreateAppointment}
          >
            <CalendarDays className="h-3 w-3" />
            Appt
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Thread View ────────────────────────────────────────────────────────────────

function ThreadView({
  thread,
  matterId,
  matterNumber,
}: {
  thread: EmailThread
  matterId: string
  matterNumber?: string | null
}) {
  const { data: messages, isLoading } = useEmailMessages(thread.id)
  const [replying, setReplying] = useState(false)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {(messages ?? []).map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </div>
      </ScrollArea>

      {/* Reply bar */}
      <div className="border-t p-3 shrink-0">
        {replying ? (
          <EmailCompose
            matterId={matterId}
            matterNumber={matterNumber}
            replyToThread={thread}
            replyToMessageId={messages?.[messages.length - 1]?.message_id}
            onSent={() => setReplying(false)}
            onCancel={() => setReplying(false)}
            compact
          />
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => setReplying(true)}
          >
            Reply
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Message Bubble ─────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: EmailMessage }) {
  const isOutbound = message.direction === 'outbound'

  return (
    <div
      className={cn(
        'rounded-lg border p-3 text-sm',
        isOutbound
          ? 'bg-primary/5 border-primary/20 ml-4'
          : 'bg-muted/30 mr-4'
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs font-medium truncate">
          {message.from_name ?? message.from_address ?? 'Unknown'}
        </span>
        <span className="text-[10px] text-muted-foreground shrink-0">
          {message.received_at ? formatDate(message.received_at) : ''}
        </span>
      </div>
      <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
        {message.body_text?.slice(0, 500) ?? '(No text content)'}
        {(message.body_text?.length ?? 0) > 500 && '...'}
      </p>
      {message.has_attachments && (
        <Badge variant="outline" className="text-[10px] mt-2">
          Attachments
        </Badge>
      )}
    </div>
  )
}
