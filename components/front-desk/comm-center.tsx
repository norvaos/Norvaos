'use client'

/**
 * =============================================================================
 * Front Desk Comm-Center — Tier 2: Global Communication Hub
 * =============================================================================
 * Directive: Communication Sovereignty — Two-Tier Communication Engine
 *
 * Global view of all incoming Microsoft 365 messages. Each email is auto-tagged
 * to the matching NorvaOS Contact/Lead via email address cross-reference.
 *
 * Unknown senders get a one-click [Initialize New Lead] button.
 *
 * Deep Midnight Glass aesthetic. Geist Sans body, Geist Mono metadata.
 * =============================================================================
 */

import { useState } from 'react'
import { formatDistanceToNow, format } from 'date-fns'
import { useGlobalInbox, type GlobalInboxEmail } from '@/lib/queries/global-inbox'
import { EmailComposeDialog } from '@/components/shared/email-compose-dialog'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Mail,
  Send,
  ArrowUpRight,
  ArrowDownLeft,
  Paperclip,
  Reply,
  Sparkles,
  UserPlus,
  User,
  Inbox,
  SendHorizontal,
  MailOpen,
  RefreshCw,
  ExternalLink,
} from 'lucide-react'

// ── Attachment Intelligence — Lean AI Protocol ───────────────────────────────

const HIGH_SECURITY_PATTERNS = [
  { pattern: /passport/i, suggestion: 'Possible passport document' },
  { pattern: /birth.?cert/i, suggestion: 'Possible birth certificate' },
  { pattern: /national.?id|identity.?card/i, suggestion: 'Possible identity document' },
  { pattern: /uci|unique.?client/i, suggestion: 'Possible UCI document' },
  { pattern: /driver.?li[cs]/i, suggestion: 'Possible identification document' },
]

function detectAttachmentIntent(subject: string): string | null {
  for (const { pattern, suggestion } of HIGH_SECURITY_PATTERNS) {
    if (pattern.test(subject)) return suggestion
  }
  return null
}

// ── Props ────────────────────────────────────────────────────────────────────

interface CommCenterProps {
  onInitializeLead?: (email: string, name: string) => void
  onNavigateToContact?: (contactId: string) => void
}

// ── Component ────────────────────────────────────────────────────────────────

export function CommCenter({
  onInitializeLead,
  onNavigateToContact,
}: CommCenterProps) {
  const [activeFolder, setActiveFolder] = useState<'inbox' | 'sentitems' | 'all'>('inbox')
  const [composeOpen, setComposeOpen] = useState(false)
  const [replyTo, setReplyTo] = useState<GlobalInboxEmail | undefined>(undefined)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const {
    data: emails,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useGlobalInbox({ folder: activeFolder })

  const handleReply = (email: GlobalInboxEmail) => {
    setReplyTo(email)
    setComposeOpen(true)
  }

  const handleCompose = () => {
    setReplyTo(undefined)
    setComposeOpen(true)
  }

  const toggleExpand = (emailId: string) => {
    setExpandedId((prev) => (prev === emailId ? null : emailId))
  }

  // Counts
  const totalEmails = emails?.length ?? 0
  const unknownCount = emails?.filter((e) => e.isUnknownSender).length ?? 0
  const taggedCount = totalEmails - unknownCount

  // ── Folder Tabs ─────────────────────────────────────────────────────────────

  const folders = [
    { key: 'inbox' as const, label: 'Inbox', icon: Inbox },
    { key: 'sentitems' as const, label: 'Sent', icon: SendHorizontal },
    { key: 'all' as const, label: 'All Mail', icon: MailOpen },
  ]

  // ── Loading State ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div
        className="rounded-xl border border-white/[0.08] p-5 space-y-4"
        style={{
          background: 'linear-gradient(180deg, rgba(2,6,23,0.92) 0%, rgba(2,6,23,0.96) 100%)',
          backdropFilter: 'blur(40px)',
        }}
      >
        <div className="flex items-center gap-2">
          <Mail className="size-4 text-emerald-400" />
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-400">
            Comm-Center
          </span>
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-lg bg-white/[0.04] border border-white/[0.06]"
            />
          ))}
        </div>
      </div>
    )
  }

  // ── Error State ───────────────────────────────────────────────────────────

  if (isError) {
    return (
      <div
        className="rounded-xl border border-white/[0.08] p-5 space-y-4"
        style={{
          background: 'linear-gradient(180deg, rgba(2,6,23,0.92) 0%, rgba(2,6,23,0.96) 100%)',
          backdropFilter: 'blur(40px)',
        }}
      >
        <div className="flex items-center gap-2">
          <Mail className="size-4 text-emerald-400" />
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-400">
            Comm-Center
          </span>
        </div>
        <div className="text-center py-12 rounded-lg border border-white/[0.06] bg-white/[0.02]">
          <Mail className="mx-auto size-10 text-zinc-700 mb-3" />
          <p className="text-sm font-sans font-semibold text-white">
            Microsoft 365 Not Connected
          </p>
          <p className="text-[10px] font-mono text-zinc-500 mt-1">
            Connect your Microsoft account in{' '}
            <a
              href="/settings"
              className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
            >
              Settings
            </a>{' '}
            to enable the Comm-Center.
          </p>
        </div>
      </div>
    )
  }

  // ── Main Render ───────────────────────────────────────────────────────────

  return (
    <div
      className="rounded-xl border border-white/[0.08] space-y-0 overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, rgba(2,6,23,0.92) 0%, rgba(2,6,23,0.96) 100%)',
        backdropFilter: 'blur(40px)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <Mail className="size-4 text-emerald-400" />
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-400">
            Comm-Center
          </span>
          {totalEmails > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-zinc-600">
                {totalEmails} messages
              </span>
              {unknownCount > 0 && (
                <span className="text-[9px] font-mono uppercase tracking-wider text-amber-400 border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 rounded">
                  {unknownCount} unknown
                </span>
              )}
              {taggedCount > 0 && (
                <span className="text-[9px] font-mono uppercase tracking-wider text-emerald-400/60">
                  {taggedCount} tagged
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-white/[0.08] bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08] hover:text-white font-mono text-[10px] uppercase tracking-wider h-7 px-2"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`size-3 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            size="sm"
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-[10px] uppercase tracking-wider shadow-lg shadow-emerald-500/20 h-7"
            onClick={handleCompose}
          >
            <Send className="size-3" />
            Compose
          </Button>
        </div>
      </div>

      {/* Folder Tabs */}
      <div className="flex border-b border-white/[0.06]">
        {folders.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveFolder(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-mono uppercase tracking-wider transition-colors ${
              activeFolder === key
                ? 'text-emerald-400 border-b-2 border-emerald-500 bg-emerald-500/[0.03]'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]'
            }`}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Email List */}
      {!emails || emails.length === 0 ? (
        <div className="text-center py-12">
          <Mail className="mx-auto size-10 text-zinc-700 mb-3" />
          <p className="text-sm font-sans font-semibold text-white">No messages</p>
          <p className="text-[10px] font-mono text-zinc-500 mt-1">
            Your {activeFolder === 'sentitems' ? 'sent' : activeFolder} is empty.
          </p>
        </div>
      ) : (
        <ScrollArea className="h-[600px]">
          <div className="divide-y divide-white/[0.04]">
            {emails.map((email) => {
              const isSent =
                activeFolder === 'sentitems' ||
                email.from.emailAddress.address.toLowerCase() !== email.toRecipients[0]?.emailAddress?.address?.toLowerCase()
              const isExpanded = expandedId === email.id
              const attachmentHint = email.hasAttachments
                ? detectAttachmentIntent(email.subject || '')
                : null
              const contact = email.matchedContact
              const isUnknown = email.isUnknownSender
              const senderAddress = email.from.emailAddress.address
              const senderName = email.from.emailAddress.name || senderAddress

              return (
                <div
                  key={email.id}
                  className={`transition-colors cursor-pointer ${
                    isExpanded ? 'bg-white/[0.03]' : 'hover:bg-white/[0.02]'
                  } ${!email.isRead ? 'bg-white/[0.01]' : ''}`}
                  onClick={() => toggleExpand(email.id)}
                >
                  {/* Main row */}
                  <div className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      {/* Contact tag / Unknown badge */}
                      <div className="flex-shrink-0 mt-0.5">
                        {contact ? (
                          <button
                            type="button"
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation()
                              onNavigateToContact?.(contact.id)
                            }}
                            title={`${contact.name} — ${contact.client_status || 'Contact'}`}
                          >
                            <User className="size-3.5" />
                          </button>
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400">
                            <UserPlus className="size-3.5" />
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {/* Unread dot */}
                          {!email.isRead && (
                            <span className="size-2 rounded-full bg-emerald-500 flex-shrink-0" />
                          )}

                          {/* Sender name */}
                          <span className="text-xs font-sans text-zinc-300 truncate font-medium">
                            {senderName}
                          </span>

                          {/* Auto-tag badge */}
                          {contact && (
                            <span className="text-[9px] font-mono uppercase tracking-wider text-emerald-400/60 flex-shrink-0">
                              {contact.client_status === 'lead' ? 'Lead' :
                               contact.client_status === 'client' ? 'Client' :
                               contact.client_status || 'Contact'}
                            </span>
                          )}

                          {/* Unknown sender badge */}
                          {isUnknown && (
                            <span className="text-[9px] font-mono uppercase tracking-wider text-amber-400 border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 rounded flex-shrink-0">
                              Unknown
                            </span>
                          )}

                          {email.hasAttachments && (
                            <Paperclip className="size-3 text-zinc-500 flex-shrink-0" />
                          )}

                          {email.importance === 'high' && (
                            <span className="text-[9px] font-mono uppercase tracking-wider text-red-400 border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 rounded">
                              High
                            </span>
                          )}
                        </div>

                        {/* Subject */}
                        <p className="text-sm font-sans font-medium text-white truncate mt-0.5">
                          {email.subject || '(No subject)'}
                        </p>

                        {/* Preview (collapsed only) */}
                        {!isExpanded && (
                          <p className="text-xs font-sans text-zinc-500 line-clamp-1 mt-0.5">
                            {email.bodyPreview}
                          </p>
                        )}

                        {/* Attachment AI hint */}
                        {attachmentHint && !isExpanded && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <Sparkles className="size-3 text-amber-400" />
                            <span className="text-[10px] font-mono text-amber-400/80">
                              {attachmentHint}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Timestamp */}
                      <div className="flex-shrink-0 text-right">
                        <span className="text-[10px] font-mono text-zinc-600 whitespace-nowrap">
                          {formatDistanceToNow(new Date(email.receivedDateTime), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Expanded view */}
                  {isExpanded && (
                    <div
                      className="border-t border-white/[0.06] px-4 pb-4 pt-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Recipients metadata */}
                      <div className="mb-3 space-y-0.5">
                        <p className="text-[10px] font-mono text-zinc-500">
                          <span className="text-zinc-600 uppercase tracking-wider">From:</span>{' '}
                          <span className="text-zinc-400">
                            {email.from.emailAddress.name} &lt;{email.from.emailAddress.address}&gt;
                          </span>
                        </p>
                        <p className="text-[10px] font-mono text-zinc-500">
                          <span className="text-zinc-600 uppercase tracking-wider">To:</span>{' '}
                          <span className="text-zinc-400">
                            {email.toRecipients
                              .map((r) => `${r.emailAddress.name} <${r.emailAddress.address}>`)
                              .join(', ')}
                          </span>
                        </p>
                        {email.ccRecipients.length > 0 && (
                          <p className="text-[10px] font-mono text-zinc-500">
                            <span className="text-zinc-600 uppercase tracking-wider">Cc:</span>{' '}
                            <span className="text-zinc-400">
                              {email.ccRecipients
                                .map((r) => `${r.emailAddress.name} <${r.emailAddress.address}>`)
                                .join(', ')}
                            </span>
                          </p>
                        )}
                        <p className="text-[10px] font-mono text-zinc-600">
                          <span className="uppercase tracking-wider">Date:</span>{' '}
                          <span className="text-zinc-500">
                            {format(new Date(email.receivedDateTime), 'PPpp')}
                          </span>
                        </p>
                        <p className="text-[10px] font-mono text-zinc-600">
                          <span className="uppercase tracking-wider">Via:</span>{' '}
                          <span className="text-zinc-500">Microsoft Outlook</span>
                        </p>
                      </div>

                      {/* Contact tag info or Initialize Lead */}
                      {contact ? (
                        <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] px-3 py-2">
                          <User className="size-3.5 text-emerald-400" />
                          <span className="text-[10px] font-mono text-emerald-400">
                            Tagged to {contact.name}
                          </span>
                          <span className="text-[9px] font-mono uppercase tracking-wider text-emerald-400/50 ml-1">
                            {contact.client_status || 'Contact'}
                          </span>
                          <button
                            type="button"
                            className="ml-auto text-emerald-400 hover:text-emerald-300 transition-colors"
                            onClick={() => onNavigateToContact?.(contact.id)}
                          >
                            <ExternalLink className="size-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.03] px-3 py-2">
                          <UserPlus className="size-3.5 text-amber-400" />
                          <span className="text-[10px] font-mono text-amber-400">
                            {senderName} is not in NorvaOS
                          </span>
                          {onInitializeLead && (
                            <Button
                              size="sm"
                              className="ml-auto gap-1.5 bg-amber-600 hover:bg-amber-500 text-white font-mono text-[9px] uppercase tracking-wider h-6 px-2"
                              onClick={() => onInitializeLead(senderAddress, senderName)}
                            >
                              <UserPlus className="size-3" />
                              Initialize New Lead
                            </Button>
                          )}
                        </div>
                      )}

                      {/* Email body */}
                      <div
                        className="prose prose-sm prose-invert max-w-none rounded-lg bg-white/[0.03] border border-white/[0.06] p-4 text-zinc-300 font-sans [&_a]:text-emerald-400 [&_a]:no-underline [&_a:hover]:underline"
                        dangerouslySetInnerHTML={{
                          __html: email.body.content,
                        }}
                      />

                      {/* Action bar */}
                      <div className="mt-3 flex items-center justify-between">
                        {/* Attachment AI hint in expanded view */}
                        {attachmentHint && (
                          <div className="flex items-center gap-1.5">
                            <Sparkles className="size-3 text-amber-400" />
                            <span className="text-[10px] font-mono text-amber-400/80">
                              {attachmentHint}
                            </span>
                          </div>
                        )}

                        <div className="ml-auto flex items-center gap-2">
                          {contact && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 border-white/[0.08] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] hover:text-white font-mono text-[10px] uppercase tracking-wider h-7"
                              onClick={() => onNavigateToContact?.(contact.id)}
                            >
                              <ExternalLink className="size-3" />
                              View Contact
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 font-mono text-[10px] uppercase tracking-wider h-7"
                            onClick={() => handleReply(email)}
                          >
                            <Reply className="size-3.5" />
                            Reply
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </ScrollArea>
      )}

      {/* Compose / Reply Dialog */}
      <EmailComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        replyTo={replyTo as any}
        contactEmail={replyTo?.from.emailAddress.address ?? ''}
        contactName={replyTo?.from.emailAddress.name ?? ''}
      />
    </div>
  )
}
