'use client'

/**
 * Directive 074: Sovereign Quick-Reply Protocol
 *
 * Template-powered reply panel with variable injection,
 * keyboard shortcuts, and multi-channel toggle (Email / SMS).
 *
 * Keyboard workflow:
 *   R       - Open reply (handled by parent)
 *   /reply  - Open template overlay
 *   Enter   - Select highlighted template
 *   Cmd+Enter - Send immediately
 *   Escape  - Close panel
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  X,
  Send,
  Mail,
  MessageSquare,
  ChevronDown,
  Sparkles,
  FileText,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { useCommunicationTemplates, useCreateCommunication } from '@/lib/queries/communications'
import { injectTemplateVariables, stripForSMS, type TemplateContext } from '@/lib/utils/template-injector'
import type { Database } from '@/lib/types/database'

type CommunicationRow = Database['public']['Tables']['communications']['Row']
type TemplateRow = Database['public']['Tables']['communication_templates']['Row']

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface NerveCenterQuickReplyProps {
  matterId: string
  matterTitle: string
  matterNumber?: string | null
  contactEmail?: string | null
  contactFirstName?: string | null
  contactLastName?: string | null
  contactPhone?: string | null
  practiceArea?: string | null
  replyTo: CommunicationRow | null
  onClose: () => void
  onSent: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NerveCenterQuickReply({
  matterId,
  matterTitle,
  matterNumber,
  contactEmail,
  contactFirstName,
  contactLastName,
  contactPhone,
  practiceArea,
  replyTo,
  onClose,
  onSent,
}: NerveCenterQuickReplyProps) {
  const { tenant } = useTenant()
  const { appUser } = useUser()
  const createComm = useCreateCommunication()
  const templates = useCommunicationTemplates(tenant?.id ?? '')

  const [channel, setChannel] = useState<'email' | 'sms'>('email')
  const [subject, setSubject] = useState(replyTo?.subject ? `Re: ${replyTo.subject}` : '')
  const [body, setBody] = useState('')
  const [showTemplates, setShowTemplates] = useState(false)
  const [templateSearch, setTemplateSearch] = useState('')
  const [highlightedIdx, setHighlightedIdx] = useState(0)

  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const templateSearchRef = useRef<HTMLInputElement>(null)

  // Template context for variable injection
  const templateCtx = useMemo<TemplateContext>(() => ({
    client: {
      firstName: contactFirstName,
      lastName: contactLastName,
      email: contactEmail,
      phone: contactPhone,
    },
    matter: {
      id: matterId,
      title: matterTitle,
      matterNumber: matterNumber ?? undefined,
      practiceArea: practiceArea ?? undefined,
    },
    firm: {
      name: tenant?.name ?? 'The Firm',
    },
    user: {
      firstName: appUser?.first_name,
      lastName: appUser?.last_name,
      email: appUser?.email,
    },
  }), [contactFirstName, contactLastName, contactEmail, contactPhone, matterId, matterTitle, matterNumber, practiceArea, tenant?.name, appUser])

  // Filter templates by search
  const filteredTemplates = useMemo(() => {
    if (!templates.data) return []
    if (!templateSearch.trim()) return templates.data
    const q = templateSearch.toLowerCase()
    return templates.data.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q),
    )
  }, [templates.data, templateSearch])

  // Auto-focus body textarea
  useEffect(() => {
    const timer = setTimeout(() => bodyRef.current?.focus(), 200)
    return () => clearTimeout(timer)
  }, [])

  // Watch for /reply trigger in body text
  useEffect(() => {
    if (body.trim() === '/reply') {
      setBody('')
      setShowTemplates(true)
      setTimeout(() => templateSearchRef.current?.focus(), 100)
    }
  }, [body])

  // Apply template
  const applyTemplate = useCallback((template: TemplateRow) => {
    const injectedSubject = injectTemplateVariables(template.subject, templateCtx)
    const injectedBody = injectTemplateVariables(template.body, templateCtx)

    setSubject(injectedSubject)
    setBody(channel === 'sms' ? stripForSMS(injectedBody) : injectedBody)
    setShowTemplates(false)
    setTemplateSearch('')

    // Focus body after injection
    setTimeout(() => bodyRef.current?.focus(), 100)
  }, [templateCtx, channel])

  // Send message
  const handleSend = useCallback(async () => {
    if (!tenant?.id || !appUser || createComm.isPending) return
    if (!body.trim()) {
      toast.error('Message body cannot be empty')
      return
    }

    try {
      await createComm.mutateAsync({
        tenant_id: tenant.id,
        matter_id: matterId,
        channel: channel === 'email' ? 'Email' : 'SMS',
        direction: 'outbound',
        status: 'sent',
        subject: channel === 'email' ? subject : null,
        body: body.trim(),
        from_address: channel === 'email' ? appUser.email : undefined,
        to_addresses: channel === 'email' && contactEmail ? [contactEmail] : undefined,
        sms_from: channel === 'sms' ? (tenant as any).phone ?? undefined : undefined,
        sms_to: channel === 'sms' ? contactPhone ?? undefined : undefined,
        created_by: appUser.id,
        thread_id: replyTo?.thread_id ?? replyTo?.id ?? undefined,
      })
      toast.success(`${channel === 'email' ? 'Email' : 'SMS'} sent successfully`)
      onSent()
    } catch {
      toast.error('Failed to send message')
    }
  }, [tenant, appUser, matterId, channel, subject, body, contactEmail, contactPhone, replyTo, createComm, onSent])

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Cmd/Ctrl + Enter = Send
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSend()
        return
      }

      // Escape = close
      if (e.key === 'Escape') {
        e.preventDefault()
        if (showTemplates) {
          setShowTemplates(false)
        } else {
          onClose()
        }
        return
      }

      // Template overlay navigation
      if (showTemplates) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setHighlightedIdx((i) => Math.min(i + 1, filteredTemplates.length - 1))
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          setHighlightedIdx((i) => Math.max(i - 1, 0))
        } else if (e.key === 'Enter' && filteredTemplates[highlightedIdx]) {
          e.preventDefault()
          applyTemplate(filteredTemplates[highlightedIdx])
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleSend, onClose, showTemplates, filteredTemplates, highlightedIdx, applyTemplate])

  return (
    <motion.div
      initial={{ y: '100%', opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: '100%', opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="border-t border-gray-200 dark:border-white/[0.08] bg-white dark:bg-zinc-950 px-4 pb-4 pt-3"
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
            {replyTo ? 'Reply' : 'New Message'}
          </span>
          {replyTo?.subject && (
            <span className="text-[10px] text-gray-400 dark:text-white/25 truncate max-w-[180px]">
              Re: {replyTo.subject}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Template trigger */}
          <button
            type="button"
            onClick={() => {
              setShowTemplates(!showTemplates)
              if (!showTemplates) setTimeout(() => templateSearchRef.current?.focus(), 100)
            }}
            className="flex items-center gap-1 rounded-lg bg-violet-500/10 px-2 py-1 text-[10px] font-medium text-violet-600 dark:text-violet-400 transition-colors hover:bg-violet-500/20"
          >
            <FileText className="h-3 w-3" />
            Templates
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-full text-gray-400 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Template Overlay */}
      {showTemplates && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3"
        >
          <input
            ref={templateSearchRef}
            type="text"
            value={templateSearch}
            onChange={(e) => {
              setTemplateSearch(e.target.value)
              setHighlightedIdx(0)
            }}
            placeholder="Search templates... (e.g. ircc-ack)"
            className="w-full rounded-lg border border-violet-500/20 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:border-violet-500/40"
          />
          <div className="mt-2 max-h-32 overflow-y-auto space-y-0.5">
            {filteredTemplates.length === 0 && (
              <p className="py-2 text-center text-[10px] text-gray-400 dark:text-white/30">
                No templates found
              </p>
            )}
            {filteredTemplates.map((t, i) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors',
                  i === highlightedIdx
                    ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300'
                    : 'text-gray-600 dark:text-white/60 hover:bg-violet-500/10',
                )}
              >
                <FileText className="h-3 w-3 shrink-0 text-violet-500/60" />
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-medium">{t.name}</span>
                  <span className="ml-2 text-[9px] text-gray-400 dark:text-white/25">{t.category}</span>
                </div>
                <span className="text-[9px] font-mono text-gray-400 dark:text-white/20">{t.slug}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[9px] text-violet-500/60 text-center">
            Arrow keys to navigate, Enter to select
          </p>
        </motion.div>
      )}

      {/* Subject line (email only) */}
      {channel === 'email' && (
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className="mb-2 w-full rounded-lg border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.04] px-3 py-2 text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 outline-none focus:border-emerald-500/40"
        />
      )}

      {/* Body */}
      <textarea
        ref={bodyRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={`Type your message... (type /reply for templates, ${navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+Enter to send)`}
        rows={4}
        className="w-full resize-none rounded-lg border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.04] px-3 py-2 text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 outline-none focus:border-emerald-500/40"
      />

      {/* Footer: Channel toggle + Send */}
      <div className="mt-2.5 flex items-center justify-between">
        {/* Channel toggle */}
        <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 dark:bg-white/[0.06] p-0.5">
          <button
            type="button"
            onClick={() => setChannel('email')}
            className={cn(
              'flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-medium transition-all',
              channel === 'email'
                ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-400 dark:text-white/40 hover:text-gray-600',
            )}
          >
            <Mail className="h-3 w-3" />
            Email
          </button>
          <button
            type="button"
            onClick={() => {
              setChannel('sms')
              // Auto-strip salutations when switching to SMS
              if (body.includes('Dear') || body.includes('Regards')) {
                setBody(stripForSMS(body))
              }
            }}
            className={cn(
              'flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-medium transition-all',
              channel === 'sms'
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'text-gray-400 dark:text-white/40 hover:text-gray-600',
            )}
          >
            <MessageSquare className="h-3 w-3" />
            SMS
          </button>
        </div>

        {/* Send button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!body.trim() || createComm.isPending}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-all',
            body.trim() && !createComm.isPending
              ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:bg-emerald-600'
              : 'cursor-not-allowed bg-gray-200 dark:bg-white/[0.06] text-gray-400 dark:text-white/20',
          )}
        >
          {createComm.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Send className="h-3 w-3" />
          )}
          Send
        </button>
      </div>

      {/* Keyboard hint */}
      <p className="mt-2 text-center text-[9px] text-gray-400 dark:text-white/20">
        {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter to send
        {' | '}
        /reply for templates
        {' | '}
        Esc to close
      </p>
    </motion.div>
  )
}
