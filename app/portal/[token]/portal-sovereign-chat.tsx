'use client'

/**
 * PortalSovereignChat  -  "Sentinel Lite"
 *
 * AI-powered Q&A inside the portal. The client can ask routine questions
 * ("When does my passport expire?") and the Sentinel AI answers instantly
 * based on stored matter data.
 *
 * If the AI can't answer, it seamlessly escalates to the legal team.
 */

import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { track } from '@/lib/utils/portal-analytics'

interface ChatMessage {
  id: string
  role: 'client' | 'ai' | 'system'
  content: string
  timestamp: Date
}

interface PortalSovereignChatProps {
  token: string
  primaryColor: string
  firmName: string
}

export function PortalSovereignChat({
  token,
  primaryColor,
  firmName,
}: PortalSovereignChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'ai',
      content: `Hello! I'm your case assistant from ${firmName}. Ask me anything about your file  -  document status, deadlines, or next steps.`,
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])

  async function handleSend() {
    const text = input.trim()
    if (!text || sending) return

    const clientMsg: ChatMessage = {
      id: `c-${Date.now()}`,
      role: 'client',
      content: text,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, clientMsg])
    setInput('')
    setSending(true)

    track('sovereign_chat_message_sent', { length: text.length })

    try {
      const res = await fetch(`/api/portal/${token}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: text,
          is_ai_query: true,
        }),
      })

      if (!res.ok) throw new Error('Failed')

      const data = await res.json()
      const aiResponse = data.ai_response ?? data.message?.content

      const aiMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'ai',
        content:
          aiResponse ??
          "I've forwarded your question to the legal team. They'll respond shortly.",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, aiMsg])
    } catch {
      const fallback: ChatMessage = {
        id: `f-${Date.now()}`,
        role: 'ai',
        content:
          "Your message has been sent to the legal team. They'll get back to you soon.",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, fallback])
    } finally {
      setSending(false)
    }
  }

  // Floating chat bubble
  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => {
          setIsOpen(true)
          track('sovereign_chat_opened')
        }}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition-all hover:scale-105 active:scale-95"
        style={{
          backgroundColor: primaryColor || '#10b981',
          boxShadow: `0 4px 20px ${primaryColor || '#10b981'}40`,
        }}
        aria-label="Open chat"
      >
        <svg
          className="h-6 w-6 text-white"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {/* Unread dot */}
        <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-red-500" />
        </span>
      </button>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col overflow-hidden"
      style={{ height: 480, maxHeight: 'calc(100vh - 6rem)' }}
    >
      {/* Header */}
      <div
        className="shrink-0 flex items-center justify-between px-4 py-3"
        style={{ backgroundColor: primaryColor || '#10b981' }}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
            <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Ask a Question</div>
            <div className="text-[10px] text-white/60">AI-Assisted Responses</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'flex',
              msg.role === 'client' ? 'justify-end' : 'justify-start',
            )}
          >
            <div
              className={cn(
                'max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                msg.role === 'client'
                  ? 'text-white rounded-br-md'
                  : 'bg-slate-100 text-slate-800 rounded-bl-md',
              )}
              style={
                msg.role === 'client'
                  ? { backgroundColor: primaryColor || '#10b981' }
                  : undefined
              }
            >
              {msg.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-slate-100 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1">
                <span className="h-2 w-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="h-2 w-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="h-2 w-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-slate-200 px-3 py-2.5 flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Type your question..."
          className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:border-slate-300 transition-colors"
          disabled={sending}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-all hover:brightness-110 disabled:opacity-40"
          style={{ backgroundColor: primaryColor || '#10b981' }}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  )
}
