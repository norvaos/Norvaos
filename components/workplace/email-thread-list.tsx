'use client'

/**
 * EmailThreadList — Shows recent email threads for the current matter.
 *
 * Sorted by last_message_at. Displays subject, participants, last message
 * preview, and unread indicator.
 */

import { Mail, MailOpen, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useEmailThreads, type EmailThread } from '@/lib/queries/email'
import { formatDate } from '@/lib/utils/formatters'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EmailThreadListProps {
  tenantId: string
  matterId: string
  selectedThreadId?: string | null
  onSelectThread?: (thread: EmailThread) => void
}

// ── Component ──────────────────────────────────────────────────────────────────

export function EmailThreadList({
  tenantId,
  matterId,
  selectedThreadId,
  onSelectThread,
}: EmailThreadListProps) {
  const { data: threads, isLoading } = useEmailThreads(tenantId, {
    matterId,
    isArchived: false,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!threads || threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Mail className="h-8 w-8 text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground">No email threads for this matter.</p>
        <p className="text-xs text-muted-foreground mt-1">
          Emails will appear here once linked.
        </p>
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1">
      <div className="space-y-0.5">
        {threads.map((thread) => (
          <ThreadItem
            key={thread.id}
            thread={thread}
            isSelected={selectedThreadId === thread.id}
            onSelect={() => onSelectThread?.(thread)}
          />
        ))}
      </div>
    </ScrollArea>
  )
}

// ── Thread Item ────────────────────────────────────────────────────────────────

function ThreadItem({
  thread,
  isSelected,
  onSelect,
}: {
  thread: EmailThread
  isSelected: boolean
  onSelect: () => void
}) {
  const participantCount = thread.participant_emails?.length ?? 0
  const displayParticipants = thread.participant_emails?.slice(0, 2).join(', ') ?? ''
  const hasMore = participantCount > 2

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-lg transition-colors border border-transparent',
        isSelected
          ? 'bg-primary/5 border-primary/20'
          : 'hover:bg-accent/50'
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 shrink-0">
          {thread.message_count > 0 ? (
            <MailOpen className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Mail className="h-4 w-4 text-primary" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate flex-1">
              {thread.subject || '(No subject)'}
            </span>
            {thread.message_count > 1 && (
              <Badge variant="secondary" className="text-[10px] px-1 py-0 shrink-0">
                {thread.message_count}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {displayParticipants}
            {hasMore && ` +${participantCount - 2} more`}
          </p>
          {thread.last_message_at && (
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">
              {formatDate(thread.last_message_at)}
            </p>
          )}
        </div>
      </div>
    </button>
  )
}
