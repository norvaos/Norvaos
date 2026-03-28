'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  getTranslations,
  t,
  type PortalLocale,
} from '@/lib/utils/portal-translations'
import { track } from '@/lib/utils/portal-analytics'

// ── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string
  content: string
  author_name: string
  author_type: string // 'user' | 'client'
  created_at: string
  parent_id: string | null
}

interface PortalMessagesProps {
  token: string
  primaryColor?: string
  language?: PortalLocale
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string, tr: ReturnType<typeof getTranslations>): string {
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHr = Math.floor(diffMin / 60)
    const diffDays = Math.floor(diffHr / 24)

    if (diffSec < 60) return tr.messages_time_just_now
    if (diffMin < 60) return t(tr.messages_time_minutes_ago, { count: diffMin })
    if (diffHr < 24) return t(tr.messages_time_hours_ago, { count: diffHr })
    if (diffDays < 7) return t(tr.messages_time_days_ago, { count: diffDays })

    return date.toLocaleDateString('en-CA', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    })
  } catch {
    return ''
  }
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

// ── Loading Spinner ──────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="h-5 w-5 animate-spin text-slate-400"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export function PortalMessages({ token, primaryColor, language = 'en' }: PortalMessagesProps) {
  const tr = getTranslations(language)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [isSending, setIsSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sectionOpenedRef = useRef(false)

  const accent = primaryColor || '#2563eb'

  // Scroll to bottom of messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/${token}/messages`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Request failed (${res.status})`)
      }
      const json = await res.json()
      setMessages(json.messages ?? [])
      setError(null)
    } catch (err) {
      console.error('[portal-messages] Fetch error:', err)
      if (!messages.length) {
        setError(err instanceof Error ? err.message : tr.messages_error_title)
      }
    }
  }, [token, messages.length])

  // Initial load
  useEffect(() => {
    async function initialFetch() {
      setIsLoading(true)
      await fetchMessages()
      setIsLoading(false)
    }
    initialFetch()
    // Track section opened (once per session)
    if (!sectionOpenedRef.current) {
      sectionOpenedRef.current = true
      track('message_section_opened', { unread_count: 0 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // Scroll to bottom when messages change
  useEffect(() => {
    if (!isLoading && messages.length > 0) {
      scrollToBottom()
    }
  }, [messages.length, isLoading, scrollToBottom])

  // Adaptive polling: 5s when tab is visible, 30s when hidden
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>

    function startPolling() {
      clearInterval(interval)
      const delay = document.hidden ? 30_000 : 5_000
      interval = setInterval(fetchMessages, delay)
    }

    startPolling()
    document.addEventListener('visibilitychange', startPolling)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', startPolling)
    }
  }, [fetchMessages])

  // Send message
  const handleSend = useCallback(async () => {
    if (!content.trim() || isSending) return

    const messageContent = content.trim()
    track('message_sent', { message_length: messageContent.length })
    setIsSending(true)

    // Optimistic update
    const optimisticMsg: Message = {
      id: `temp-${Date.now()}`,
      content: messageContent,
      author_name: tr.messages_you,
      author_type: 'client',
      created_at: new Date().toISOString(),
      parent_id: null,
    }
    setMessages((prev) => [...prev, optimisticMsg])
    setContent('')

    try {
      const res = await fetch(`/api/portal/${token}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: messageContent }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || tr.error_send_message)
      }

      const json = await res.json()

      // Replace optimistic message with real one
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticMsg.id ? json.message : m)),
      )
    } catch (err) {
      console.error('[portal-messages] Send error:', err)
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id))
      setContent(messageContent) // Restore the content
      setError(tr.error_send_message)
    } finally {
      setIsSending(false)
    }
  }, [content, isSending, token])

  // Keyboard shortcut: Ctrl/Cmd + Enter to send
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  // ── Loading State ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3">
          <Spinner />
          <span className="text-sm text-slate-500">{tr.messages_loading}</span>
        </div>
      </div>
    )
  }

  // ── Error State (initial load only) ────────────────────────────────────────

  if (error && messages.length === 0) {
    return (
      <div>
        <div className="rounded-2xl border border-red-500/20/60 bg-gradient-to-br from-red-50 to-white p-6 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-950/40 shadow-sm">
            <svg
              className="h-5 w-5 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
              />
            </svg>
          </div>
          <p className="text-sm font-bold text-red-400">{tr.messages_error_title}</p>
          <p className="mt-1 text-sm text-red-600">{error}</p>
        </div>
      </div>
    )
  }

  // ── Main Render ────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col -mx-4 -mb-4">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ maxHeight: '400px', minHeight: '200px' }}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl shadow-sm" style={{ backgroundColor: `${accent}10` }}>
              <svg
                className="h-6 w-6"
                style={{ color: accent }}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
                />
              </svg>
            </div>
            <p className="text-sm font-bold text-slate-700">{tr.messages_empty_title}</p>
            <p className="mt-1 text-sm text-slate-500">
              {tr.messages_empty_description}
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isClient = msg.author_type === 'client'

            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isClient ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* Avatar */}
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold shadow-sm ${
                    isClient
                      ? 'text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                  style={isClient ? { background: `linear-gradient(135deg, ${accent}, ${accent}cc)` } : undefined}
                >
                  {getInitials(msg.author_name)}
                </div>

                {/* Bubble */}
                <div
                  className={`max-w-[75%] ${isClient ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`flex items-center gap-2 mb-1 ${
                      isClient ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <span className="text-xs font-medium text-slate-700">
                      {isClient ? tr.messages_you : msg.author_name}
                    </span>
                    <span className="text-xs text-slate-400">
                      {formatRelativeTime(msg.created_at, tr)}
                    </span>
                  </div>
                  <div
                    className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                      isClient
                        ? 'rounded-br-md text-white'
                        : 'rounded-bl-md bg-slate-50/80 text-slate-800 border border-slate-100'
                    }`}
                    style={isClient ? { background: `linear-gradient(135deg, ${accent}, ${accent}dd)` } : undefined}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Send error banner */}
      {error && messages.length > 0 && (
        <div className="mx-4 mb-2 rounded-lg border border-amber-500/20 bg-amber-950/30 px-4 py-2 text-sm text-amber-400">
          {error}
          <button
            className="ml-2 font-medium underline"
            onClick={() => setError(null)}
          >
            {tr.messages_dismiss}
          </button>
        </div>
      )}

      {/* Compose Area */}
      <div className="border-t border-slate-200/60 px-4 py-4 bg-gradient-to-t from-slate-50/50 to-transparent">
        <div className="flex gap-3">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={tr.messages_placeholder}
            rows={2}
            className="flex-1 resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder-slate-400 outline-none transition-all focus:border-slate-300 focus:ring-1 focus:ring-slate-300"
            disabled={isSending}
          />
          <button
            onClick={handleSend}
            disabled={!content.trim() || isSending}
            className="flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-xl text-white transition-all disabled:opacity-40 shadow-lg hover:brightness-110 active:scale-95"
            style={{
              background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
              boxShadow: `0 4px 12px ${accent}30`,
            }}
            title={tr.messages_send_title}
          >
            {isSending ? (
              <svg
                className="h-4 w-4 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : (
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
                />
              </svg>
            )}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          {tr.messages_send_hint}
        </p>
      </div>
    </div>
  )
}
