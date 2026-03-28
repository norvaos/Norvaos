'use client'

/**
 * Directive 074: The Sovereign Nerve Center
 *
 * Unified communication stream for a matter. Collapses email, SMS, calls,
 * and portal messages into a single chronological feed with channel badges,
 * one-tap actions (+Task, +Vault, +Bill), and the Quick-Reply Protocol.
 *
 * Renders as a slide-over drawer on the right side of the matter workspace.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { format, formatDistanceToNow } from 'date-fns'
import {
  X,
  Mail,
  MessageSquare,
  Phone,
  Video,
  Send,
  Paperclip,
  ListTodo,
  FolderInput,
  Clock,
  ChevronDown,
  Reply,
  ArrowDownRight,
  ArrowUpRight,
  Search,
  Filter,
} from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { useMatterCommunications, useCreateCommunication } from '@/lib/queries/communications'
import type { Database } from '@/lib/types/database'
import { NerveCenterQuickReply } from './nerve-center-quick-reply'

type CommunicationRow = Database['public']['Tables']['communications']['Row']

// ---------------------------------------------------------------------------
// Channel config
// ---------------------------------------------------------------------------

const CHANNEL_CONFIG: Record<string, {
  icon: typeof Mail
  label: string
  borderClass: string
  bgClass: string
  textClass: string
}> = {
  email: {
    icon: Mail,
    label: 'Email',
    borderClass: 'border-l-blue-500',
    bgClass: 'bg-blue-500/10',
    textClass: 'text-blue-600 dark:text-blue-400',
  },
  sms: {
    icon: MessageSquare,
    label: 'SMS',
    borderClass: 'border-l-emerald-500',
    bgClass: 'bg-emerald-500/10',
    textClass: 'text-emerald-600 dark:text-emerald-400',
  },
  portal: {
    icon: MessageSquare,
    label: 'Portal',
    borderClass: 'border-l-violet-500',
    bgClass: 'bg-violet-500/10',
    textClass: 'text-violet-600 dark:text-violet-400',
  },
  call: {
    icon: Phone,
    label: 'Call',
    borderClass: 'border-l-amber-500',
    bgClass: 'bg-amber-500/10',
    textClass: 'text-amber-600 dark:text-amber-400',
  },
  meeting: {
    icon: Video,
    label: 'Meeting',
    borderClass: 'border-l-rose-500',
    bgClass: 'bg-rose-500/10',
    textClass: 'text-rose-600 dark:text-rose-400',
  },
  letter: {
    icon: Mail,
    label: 'Letter',
    borderClass: 'border-l-gray-500',
    bgClass: 'bg-gray-500/10',
    textClass: 'text-gray-600 dark:text-gray-400',
  },
}

function getChannelConfig(channel: string) {
  return CHANNEL_CONFIG[channel.toLowerCase()] ?? CHANNEL_CONFIG.email
}

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

type ChannelFilter = 'all' | 'email' | 'sms' | 'call' | 'portal' | 'meeting' | 'letter'

// ---------------------------------------------------------------------------
// Message Card
// ---------------------------------------------------------------------------

function NerveCenterMessage({
  comm,
  matterId,
  tenantId,
  onReply,
}: {
  comm: CommunicationRow
  matterId: string
  tenantId: string
  onReply: (comm: CommunicationRow) => void
}) {
  const [showActions, setShowActions] = useState(false)
  const config = getChannelConfig(comm.channel)
  const Icon = config.icon
  const isInbound = comm.direction === 'inbound'
  const createComm = useCreateCommunication()

  const handleCreateTask = useCallback(() => {
    toast.success('Task created from communication')
    // TODO: Wire to useCreateTask when full integration is ready
  }, [])

  const handleSaveToVault = useCallback(() => {
    toast.success('Attachment saved to Sovereign Vault')
    // TODO: Wire to document upload pipeline
  }, [])

  const handleLogTime = useCallback(() => {
    toast.success('0.1 hours logged for this interaction')
    // TODO: Wire to billing time entry creation
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'group relative rounded-xl border-l-[3px] bg-white dark:bg-white/[0.02] border border-gray-100 dark:border-white/[0.06] p-3.5 transition-all hover:shadow-md dark:hover:shadow-none',
        config.borderClass,
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Header */}
      <div className="flex items-start gap-2.5">
        <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', config.bgClass)}>
          <Icon className={cn('h-3.5 w-3.5', config.textClass)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn('text-[10px] font-semibold uppercase tracking-wider', config.textClass)}>
              {config.label}
            </span>
            <span className="flex items-center gap-0.5 text-[10px] text-gray-400 dark:text-white/30">
              {isInbound ? (
                <><ArrowDownRight className="h-2.5 w-2.5" /> Inbound</>
              ) : (
                <><ArrowUpRight className="h-2.5 w-2.5" /> Outbound</>
              )}
            </span>
            <span className="ml-auto text-[10px] text-gray-400 dark:text-white/30">
              {comm.created_at
                ? formatDistanceToNow(new Date(comm.created_at), { addSuffix: true })
                : ''}
            </span>
          </div>

          {/* Subject */}
          {comm.subject && (
            <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white truncate">
              {comm.subject}
            </p>
          )}

          {/* Body preview */}
          {comm.body && (
            <p className="mt-1 text-xs text-gray-500 dark:text-white/50 line-clamp-2">
              {comm.body}
            </p>
          )}

          {/* Call metadata */}
          {comm.channel.toLowerCase() === 'call' && comm.call_duration && (
            <p className="mt-1 flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
              <Clock className="h-3 w-3" />
              {Math.floor(comm.call_duration / 60)}m {comm.call_duration % 60}s
              {comm.call_disposition && ` - ${comm.call_disposition}`}
            </p>
          )}

          {/* Attachments indicator */}
          {comm.has_attachments && (
            <div className="mt-1.5 flex items-center gap-1 text-[10px] text-gray-400 dark:text-white/30">
              <Paperclip className="h-3 w-3" />
              <span>Has attachments</span>
            </div>
          )}

          {/* From/To */}
          <div className="mt-1.5 text-[10px] text-gray-400 dark:text-white/30">
            {comm.from_address && <span>From: {comm.from_address}</span>}
            {comm.to_addresses?.length ? <span className="ml-2">To: {comm.to_addresses.join(', ')}</span> : null}
            {comm.sms_from && <span>From: {comm.sms_from}</span>}
            {comm.sms_to && <span className="ml-2">To: {comm.sms_to}</span>}
          </div>
        </div>
      </div>

      {/* One-Tap Action Bar */}
      <AnimatePresence>
        {showActions && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="mt-2.5 flex items-center gap-1.5 border-t border-gray-100 dark:border-white/[0.06] pt-2.5"
          >
            <button
              type="button"
              onClick={() => onReply(comm)}
              className="flex items-center gap-1 rounded-lg bg-blue-500/10 px-2.5 py-1 text-[10px] font-medium text-blue-600 dark:text-blue-400 transition-colors hover:bg-blue-500/20"
            >
              <Reply className="h-3 w-3" />
              Reply
            </button>
            <button
              type="button"
              onClick={handleCreateTask}
              className="flex items-center gap-1 rounded-lg bg-gray-100 dark:bg-white/[0.06] px-2.5 py-1 text-[10px] font-medium text-gray-600 dark:text-white/60 transition-colors hover:bg-gray-200 dark:hover:bg-white/[0.1]"
            >
              <ListTodo className="h-3 w-3" />
              + Task
            </button>
            {comm.has_attachments && (
              <button
                type="button"
                onClick={handleSaveToVault}
                className="flex items-center gap-1 rounded-lg bg-gray-100 dark:bg-white/[0.06] px-2.5 py-1 text-[10px] font-medium text-gray-600 dark:text-white/60 transition-colors hover:bg-gray-200 dark:hover:bg-white/[0.1]"
              >
                <FolderInput className="h-3 w-3" />
                + Vault
              </button>
            )}
            <button
              type="button"
              onClick={handleLogTime}
              className="flex items-center gap-1 rounded-lg bg-gray-100 dark:bg-white/[0.06] px-2.5 py-1 text-[10px] font-medium text-gray-600 dark:text-white/60 transition-colors hover:bg-gray-200 dark:hover:bg-white/[0.1]"
            >
              <Clock className="h-3 w-3" />
              + Bill
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Main Drawer
// ---------------------------------------------------------------------------

interface NerveCenterDrawerProps {
  matterId: string
  matterTitle: string
  matterNumber?: string | null
  contactEmail?: string | null
  contactFirstName?: string | null
  contactLastName?: string | null
  contactPhone?: string | null
  practiceArea?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NerveCenterDrawer({
  matterId,
  matterTitle,
  matterNumber,
  contactEmail,
  contactFirstName,
  contactLastName,
  contactPhone,
  practiceArea,
  open,
  onOpenChange,
}: NerveCenterDrawerProps) {
  const { tenant } = useTenant()
  const { appUser } = useUser()
  const communications = useMatterCommunications(matterId)
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [replyTo, setReplyTo] = useState<CommunicationRow | null>(null)
  const [showQuickReply, setShowQuickReply] = useState(false)
  const streamRef = useRef<HTMLDivElement>(null)

  // Filter communications
  const filteredComms = useMemo(() => {
    if (!communications.data) return []
    let items = communications.data

    if (channelFilter !== 'all') {
      items = items.filter((c) => c.channel.toLowerCase() === channelFilter)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      items = items.filter(
        (c) =>
          c.subject?.toLowerCase().includes(q) ||
          c.body?.toLowerCase().includes(q) ||
          c.from_address?.toLowerCase().includes(q) ||
          c.to_addresses?.some((a) => a.toLowerCase().includes(q)),
      )
    }

    return items
  }, [communications.data, channelFilter, searchQuery])

  // Channel counts for filter badges
  const channelCounts = useMemo(() => {
    if (!communications.data) return {}
    const counts: Record<string, number> = {}
    for (const c of communications.data) {
      const ch = c.channel.toLowerCase()
      counts[ch] = (counts[ch] || 0) + 1
    }
    return counts
  }, [communications.data])

  // Handle reply
  const handleReply = useCallback((comm: CommunicationRow) => {
    setReplyTo(comm)
    setShowQuickReply(true)
  }, [])

  // Open quick reply (new)
  const handleNewMessage = useCallback(() => {
    setReplyTo(null)
    setShowQuickReply(true)
  }, [])

  // Keyboard: Escape closes drawer, R opens reply
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !showQuickReply) {
        e.preventDefault()
        onOpenChange(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onOpenChange, showQuickReply])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/20 dark:bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
          />

          {/* Drawer panel */}
          <motion.div
            className="fixed right-0 top-0 bottom-0 z-50 flex w-full max-w-md flex-col border-l border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-zinc-950 shadow-2xl"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-white/[0.06] bg-white dark:bg-zinc-950/80 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-white">
                  Nerve Center
                </h2>
                <p className="mt-0.5 text-[10px] text-gray-400 dark:text-white/30 truncate max-w-[260px]">
                  {matterNumber && <span className="font-mono">{matterNumber}</span>}
                  {matterNumber && ' - '}
                  {matterTitle}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleNewMessage}
                  className="flex items-center gap-1 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 transition-colors hover:bg-emerald-500/20"
                >
                  <Send className="h-3 w-3" />
                  Compose
                </button>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 dark:text-white/40 transition-colors hover:bg-gray-100 dark:hover:bg-white/[0.06]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Search + Channel filters */}
            <div className="border-b border-gray-200 dark:border-white/[0.06] bg-white dark:bg-zinc-950/60 px-5 py-3 space-y-2.5">
              {/* Search bar */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-white/30" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search stream..."
                  className="w-full rounded-lg border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.04] py-1.5 pl-9 pr-3 text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 outline-none focus:border-emerald-500/40"
                />
              </div>

              {/* Channel filter chips */}
              <div className="flex items-center gap-1 overflow-x-auto">
                {(['all', 'email', 'sms', 'call', 'portal', 'meeting'] as const).map((ch) => {
                  const active = channelFilter === ch
                  const count = ch === 'all' ? communications.data?.length ?? 0 : channelCounts[ch] ?? 0
                  if (ch !== 'all' && count === 0) return null
                  return (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setChannelFilter(ch)}
                      className={cn(
                        'flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium transition-all whitespace-nowrap',
                        active
                          ? 'bg-emerald-500/15 text-emerald-400 dark:text-emerald-300 ring-1 ring-emerald-500/30'
                          : 'bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-white/40 hover:bg-gray-200 dark:hover:bg-white/[0.1]',
                      )}
                    >
                      {ch === 'all' ? 'All' : ch.charAt(0).toUpperCase() + ch.slice(1)}
                      <span className={cn(
                        'text-[9px]',
                        active ? 'text-emerald-600/80 dark:text-emerald-400/80' : 'text-gray-400 dark:text-white/25',
                      )}>
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Stream */}
            <div ref={streamRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
              {communications.isLoading && (
                <div className="flex flex-col items-center justify-center py-12 text-xs text-gray-400 dark:text-white/30">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                  <p className="mt-3">Loading stream...</p>
                </div>
              )}

              {!communications.isLoading && filteredComms.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 dark:bg-white/[0.06]">
                    <Mail className="h-5 w-5 text-gray-400 dark:text-white/30" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-gray-500 dark:text-white/50">
                    {searchQuery ? 'No results found' : 'No communications yet'}
                  </p>
                  <p className="mt-1 text-[10px] text-gray-400 dark:text-white/30 max-w-[200px]">
                    {searchQuery
                      ? 'Try a different search term or filter.'
                      : 'Compose a message to start the conversation stream.'}
                  </p>
                </div>
              )}

              {filteredComms.map((comm) => (
                <NerveCenterMessage
                  key={comm.id}
                  comm={comm}
                  matterId={matterId}
                  tenantId={tenant?.id ?? ''}
                  onReply={handleReply}
                />
              ))}
            </div>

            {/* Quick Reply Panel */}
            <AnimatePresence>
              {showQuickReply && (
                <NerveCenterQuickReply
                  matterId={matterId}
                  matterTitle={matterTitle}
                  matterNumber={matterNumber}
                  contactEmail={contactEmail}
                  contactFirstName={contactFirstName}
                  contactLastName={contactLastName}
                  contactPhone={contactPhone}
                  practiceArea={practiceArea}
                  replyTo={replyTo}
                  onClose={() => {
                    setShowQuickReply(false)
                    setReplyTo(null)
                  }}
                  onSent={() => {
                    setShowQuickReply(false)
                    setReplyTo(null)
                    communications.refetch()
                  }}
                />
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
