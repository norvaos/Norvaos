'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, X, Zap, ArrowRight,
  MessageSquareText, UserPlus, Users, Brain,
  FileSignature, CreditCard, Trophy,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type StageId } from './golden-thread'

// ---------------------------------------------------------------------------
// Warp Search — Search-to-Action (Visual 7)
// ---------------------------------------------------------------------------
// Updated for the Sovereign 7-Stage Pipeline.
// Active missions show a pulsing Emerald icon next to the client name.
// ---------------------------------------------------------------------------

interface WarpResult {
  id: string
  name: string
  /** Active stage for this lead, or null if no active mission */
  activeGate: StageId | null
  /** Stage label for display */
  gateLabel?: string
  country?: string
  matterId?: string
}

// Demo data — in production this queries Supabase
const DEMO_RESULTS: WarpResult[] = [
  { id: '1', name: 'Amira Hassan', activeGate: 'contact', gateLabel: 'Contact', country: 'Pakistan', matterId: '2026-0347' },
  { id: '2', name: 'Rajesh Patel', activeGate: 'inquiry', gateLabel: 'Inquiry', country: 'India', matterId: '2026-0351' },
  { id: '3', name: 'Sofia Nguyen', activeGate: 'retainer', gateLabel: 'Retainer', country: 'Vietnam', matterId: '2026-0355' },
  { id: '4', name: 'Ahmed Al-Rashid', activeGate: 'meeting', gateLabel: 'Meeting', country: 'Iraq', matterId: '2026-0362' },
  { id: '5', name: 'Fatima Noor', activeGate: 'strategy', gateLabel: 'Strategy', country: 'Syria', matterId: '2026-0370' },
  { id: '6', name: 'Wei Zhang', activeGate: 'payment', gateLabel: 'Payment', country: 'China', matterId: '2026-0378' },
  { id: '7', name: 'Maria Chen', activeGate: null, country: 'China', matterId: '2025-0891' },
]

const stageIcons: Record<StageId, React.ReactNode> = {
  inquiry:  <MessageSquareText className="w-3.5 h-3.5" />,
  contact:  <UserPlus className="w-3.5 h-3.5" />,
  meeting:  <Users className="w-3.5 h-3.5" />,
  strategy: <Brain className="w-3.5 h-3.5" />,
  retainer: <FileSignature className="w-3.5 h-3.5" />,
  payment:  <CreditCard className="w-3.5 h-3.5" />,
  won:      <Trophy className="w-3.5 h-3.5" />,
}

interface WarpSearchProps {
  /** If true, renders as a full-screen overlay (triggered by ⌘K) */
  overlay?: boolean
  onClose?: () => void
}

export function WarpSearch({ overlay = false, onClose }: WarpSearchProps) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // Filter results
  const results = query.trim().length > 0
    ? DEMO_RESULTS.filter((r) =>
        r.name.toLowerCase().includes(query.toLowerCase()) ||
        r.matterId?.includes(query)
      )
    : []

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.()
    }
    if (overlay) {
      window.addEventListener('keydown', handler)
      inputRef.current?.focus()
      return () => window.removeEventListener('keydown', handler)
    }
  }, [overlay, onClose])

  const handleWarp = useCallback((result: WarpResult) => {
    if (result.activeGate) {
      // Warp directly into the Corridor at the active gate
      router.push(`/studio/workspace/${result.id}?gate=${result.activeGate}`)
    } else {
      // No active mission — go to matter workspace (legacy)
      router.push(`/matters/${result.id}`)
    }
    onClose?.()
  }, [router, onClose])

  const searchUI = (
    <div className="w-full max-w-xl mx-auto">
      {/* Search Input */}
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: focused ? '0 0 32px rgba(16, 185, 129, 0.1)' : 'none',
        }}
      >
        <div className="flex items-center px-5 py-4 gap-3">
          <Zap className="w-4 h-4 text-emerald-400/60 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 200)}
            placeholder="Warp to client…"
            className="flex-1 bg-transparent text-white/80 text-sm placeholder:text-white/25 focus:outline-none"
            autoComplete="off"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <X className="w-3 h-3 text-white/30" />
            </button>
          )}
          <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white/5 text-[10px] text-white/20 border border-white/5">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Results */}
      <AnimatePresence>
        {results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="mt-3 rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, rgba(30,30,42,0.98) 0%, rgba(22,22,31,0.98) 100%)',
              border: '1px solid rgba(255,255,255,0.06)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
            }}
          >
            <div className="py-2">
              {results.map((result, i) => (
                <motion.button
                  key={result.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => handleWarp(result)}
                  className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.04] transition-colors text-left group"
                >
                  {/* Avatar Placeholder */}
                  <div className="relative">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center border border-white/10 shrink-0"
                      style={{
                        background: result.activeGate
                          ? 'linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(16,185,129,0.04) 100%)'
                          : 'rgba(255,255,255,0.03)',
                      }}
                    >
                      <span className="text-[11px] font-semibold text-white/40">
                        {result.name.split(' ').map(w => w[0]).join('')}
                      </span>
                    </div>

                    {/* Emerald Pulse — Active Mission Indicator */}
                    {result.activeGate && (
                      <motion.div
                        className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400"
                        animate={{
                          boxShadow: [
                            '0 0 0px rgba(16, 185, 129, 0.4)',
                            '0 0 8px rgba(16, 185, 129, 0.7)',
                            '0 0 0px rgba(16, 185, 129, 0.4)',
                          ],
                        }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                      />
                    )}
                  </div>

                  {/* Client Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white/80 truncate group-hover:text-white/95 transition-colors">
                      {result.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {result.country && (
                        <span className="text-[11px] text-white/25">{result.country}</span>
                      )}
                      {result.matterId && (
                        <>
                          <span className="text-white/10 text-[10px]">·</span>
                          <span className="text-[11px] text-white/20">#{result.matterId}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Active Gate Badge */}
                  {result.activeGate ? (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 shrink-0">
                      <span className="text-emerald-400">{stageIcons[result.activeGate]}</span>
                      <span className="text-[10px] text-emerald-400 font-medium uppercase tracking-wider">
                        {result.gateLabel}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[11px] text-white/15 shrink-0">No Mission</span>
                  )}

                  <ArrowRight className="w-3.5 h-3.5 text-white/10 group-hover:text-emerald-400/50 transition-colors shrink-0" />
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty State */}
      <AnimatePresence>
        {query.trim().length > 0 && results.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-3 rounded-2xl p-6 text-center"
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.04)',
            }}
          >
            <Search className="w-5 h-5 text-white/15 mx-auto mb-2" />
            <p className="text-[12px] text-white/25">No clients match &ldquo;{query}&rdquo;</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )

  // Overlay mode (⌘K)
  if (overlay) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose?.()
        }}
      >
        <motion.div
          initial={{ y: -20, scale: 0.95 }}
          animate={{ y: 0, scale: 1 }}
          exit={{ y: -20, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-xl px-6"
        >
          {searchUI}
        </motion.div>
      </motion.div>
    )
  }

  return searchUI
}
