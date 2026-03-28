'use client'

/**
 * =============================================================================
 * Communication Stream — Tier 1: Contextual Stream
 * =============================================================================
 * Directive: Communication Sovereignty — Two-Tier Communication Engine
 *
 * Deep Midnight Glass vertical timeline. Filters Microsoft 365 messages by the
 * specific email address associated with the open Contact/Matter.
 *
 * No email bodies stored in NorvaOS — streamed directly from Microsoft Graph.
 *
 * Incoming: Deep Midnight Glass bubble
 * Outgoing: Emerald-bordered bubble
 * Typography: Geist Sans body, Geist Mono timestamps/metadata
 * =============================================================================
 */

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { useEmailStream, type GraphEmail } from '@/lib/queries/email-stream'
import { EmailComposeDialog } from '@/components/shared/email-compose-dialog'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import {
  Mail,
  Send,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  Paperclip,
  Reply,
  FileDown,
  Sparkles,
} from 'lucide-react'

// ── Attachment Intelligence — Lean AI Protocol ───────────────────────────────

const HIGH_SECURITY_PATTERNS = [
  { pattern: /passport/i, suggestion: 'Link to Passport Number field?' },
  { pattern: /birth.?cert/i, suggestion: 'Link to Date of Birth field?' },
  { pattern: /national.?id|identity.?card/i, suggestion: 'Link to National ID field?' },
  { pattern: /uci|unique.?client/i, suggestion: 'Link to UCI field?' },
  { pattern: /driver.?li[cs]/i, suggestion: 'Link to identification documents?' },
]

function detectAttachmentIntent(subject: string): string | null {
  for (const { pattern, suggestion } of HIGH_SECURITY_PATTERNS) {
    if (pattern.test(subject)) return suggestion
  }
  return null
}

// ── Props ────────────────────────────────────────────────────────────────────

interface CommunicationStreamProps {
  contactEmail: string
  contactName: string
  matterId?: string
  contactId?: string
  leadId?: string
}

// ── Component ────────────────────────────────────────────────────────────────

export function CommunicationStream({
  contactEmail,
  contactName,
  matterId,
  contactId,
  leadId,
}: CommunicationStreamProps) {
  const [composeOpen, setComposeOpen] = useState(false)
  const [replyTo, setReplyTo] = useState<GraphEmail | undefined>(undefined)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const {
    data: emails,
    isLoading,
    isError,
  } = useEmailStream(contactEmail)

  // Filter emails client-side
  const filteredEmails = emails?.filter((email) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      email.subject?.toLowerCase().includes(q) ||
      email.bodyPreview?.toLowerCase().includes(q) ||
      email.from?.emailAddress?.name?.toLowerCase().includes(q)
    )
  }) ?? []

  const handleReply = (email: GraphEmail) => {
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

  // ── Loading State ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="size-4 text-emerald-400" />
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-400">
              Communication Stream
            </span>
          </div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-white/[0.04] border border-white/[0.06]" />
          ))}
        </div>
      </div>
    )
  }

  // ── Error State ────────────────────────────────────────────────────────────

  if (isError) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="size-4 text-emerald-400" />
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-400">
            Communication Stream
          </span>
        </div>
        <div
          className="text-center py-12 rounded-xl border border-white/[0.06]"
          style={{ background: 'rgba(2,6,23,0.6)' }}
        >
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
            to view emails.
          </p>
        </div>
      </div>
    )
  }

  // ── Main Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="size-4 text-emerald-400" />
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-400">
            Communication Stream
          </span>
          {emails && emails.length > 0 && (
            <span className="text-[10px] font-mono text-zinc-600">
              {emails.length} messages
            </span>
          )}
        </div>
        <Button
          size="sm"
          className="gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-[10px] uppercase tracking-wider shadow-lg shadow-emerald-500/20"
          onClick={handleCompose}
        >
          <Send className="size-3.5" />
          Compose
        </Button>
      </div>

      {/* Search input */}
      {emails && emails.length > 0 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search emails..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      )}

      {/* Email timeline */}
      {!emails || emails.length === 0 ? (
        <div
          className="text-center py-12 rounded-xl border border-white/[0.06]"
          style={{ background: 'rgba(2,6,23,0.6)' }}
        >
          <Mail className="mx-auto size-10 text-zinc-700 mb-3" />
          <p className="text-sm font-sans font-semibold text-white">No emails found</p>
          <p className="text-[10px] font-mono text-zinc-500 mt-1">
            Emails exchanged with {contactName} will appear here.
          </p>
        </div>
      ) : (
        <ScrollArea className="h-[600px] pr-2">
          <div className="space-y-2">
            {filteredEmails.map((email) => {
              const isSent =
                email.from.emailAddress.address.toLowerCase() !==
                contactEmail.toLowerCase()
              const isExpanded = expandedId === email.id
              const attachmentHint = email.hasAttachments
                ? detectAttachmentIntent(email.subject || '')
                : null

              return (
                <div
                  key={email.id}
                  className={`rounded-lg border transition-all cursor-pointer ${
                    isSent
                      ? 'border-emerald-500/20 bg-emerald-500/[0.03] hover:bg-emerald-500/[0.06]'
                      : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                  }`}
                  onClick={() => toggleExpand(email.id)}
                >
                  {/* Collapsed card */}
                  <div className="p-3">
                    <div className="flex items-start gap-3">
                      {/* Direction indicator */}
                      <div
                        className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border ${
                          isSent
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                            : 'border-white/[0.08] bg-white/[0.04] text-zinc-400'
                        }`}
                      >
                        {isSent ? (
                          <ArrowUpRight className="size-4" />
                        ) : (
                          <ArrowDownLeft className="size-4" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {/* Unread indicator */}
                          {!email.isRead && (
                            <span className="size-2 rounded-full bg-emerald-500 flex-shrink-0" />
                          )}
                          <span className="text-xs font-sans text-zinc-400 truncate">
                            {email.from.emailAddress.name ||
                              email.from.emailAddress.address}
                          </span>
                          {email.hasAttachments && (
                            <Paperclip className="size-3.5 text-zinc-500 flex-shrink-0" />
                          )}
                          {email.importance === 'high' && (
                            <span className="text-[9px] font-mono uppercase tracking-wider text-red-400 border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 rounded">
                              High
                            </span>
                          )}
                          {isSent && (
                            <span className="text-[9px] font-mono uppercase tracking-wider text-emerald-400/60">
                              Sent
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-sans font-medium text-white truncate mt-0.5">
                          {email.subject || '(No subject)'}
                        </p>
                        {!isExpanded && (
                          <p className="text-xs font-sans text-zinc-500 line-clamp-2 mt-0.5">
                            {email.bodyPreview}
                          </p>
                        )}

                        {/* Attachment Intelligence — Lean AI suggestion */}
                        {attachmentHint && !isExpanded && (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <Sparkles className="size-3 text-amber-400" />
                            <span className="text-[10px] font-mono text-amber-400/80">
                              {attachmentHint}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Timestamp */}
                      <span className="text-[10px] font-mono text-zinc-600 flex-shrink-0 whitespace-nowrap">
                        {formatDistanceToNow(
                          new Date(email.receivedDateTime),
                          { addSuffix: true }
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Expanded view */}
                  {isExpanded && (
                    <div
                      className="border-t border-white/[0.06] px-3 pb-3 pt-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Recipients — Geist Mono metadata */}
                      <div className="mb-2 space-y-0.5">
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
                              .map(r => `${r.emailAddress.name} <${r.emailAddress.address}>`)
                              .join(', ')}
                          </span>
                        </p>
                        {email.ccRecipients.length > 0 && (
                          <p className="text-[10px] font-mono text-zinc-500">
                            <span className="text-zinc-600 uppercase tracking-wider">Cc:</span>{' '}
                            <span className="text-zinc-400">
                              {email.ccRecipients
                                .map(r => `${r.emailAddress.name} <${r.emailAddress.address}>`)
                                .join(', ')}
                            </span>
                          </p>
                        )}
                        <p className="text-[10px] font-mono text-zinc-600">
                          <span className="uppercase tracking-wider">Via:</span>{' '}
                          <span className="text-zinc-500">Microsoft Outlook</span>
                        </p>
                      </div>

                      {/* Email body — Geist Sans for reading */}
                      <div
                        className="prose prose-sm prose-invert max-w-none rounded-lg bg-white/[0.03] border border-white/[0.06] p-4 text-zinc-300 font-sans [&_a]:text-emerald-400 [&_a]:no-underline [&_a:hover]:underline"
                        dangerouslySetInnerHTML={{
                          __html: email.body.content,
                        }}
                      />

                      {/* Action bar */}
                      <div className="mt-3 flex items-center justify-between">
                        {/* Attach to Matter — one-click document import */}
                        {email.hasAttachments && matterId && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 border-white/[0.08] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] hover:text-white font-mono text-[10px] uppercase tracking-wider"
                            onClick={() => {
                              // Phase 2: Implement Graph API attachment download → Supabase upload
                              // For now, this button signals the intent
                              window.alert('Attachment import from Microsoft Graph — coming in Phase 2')
                            }}
                          >
                            <FileDown className="size-3.5" />
                            Attach to Matter
                          </Button>
                        )}

                        {/* Attachment AI hint in expanded view */}
                        {attachmentHint && (
                          <div className="flex items-center gap-1.5">
                            <Sparkles className="size-3 text-amber-400" />
                            <span className="text-[10px] font-mono text-amber-400/80">
                              {attachmentHint}
                            </span>
                          </div>
                        )}

                        <div className="ml-auto">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 font-mono text-[10px] uppercase tracking-wider"
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
        replyTo={replyTo}
        contactEmail={contactEmail}
        contactName={contactName}
        matterId={matterId}
        contactId={contactId}
        leadId={leadId}
      />
    </div>
  )
}
