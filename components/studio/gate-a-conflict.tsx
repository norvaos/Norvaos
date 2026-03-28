'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Shield,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Search,
  User,
  Building2,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Gate A — Conflict Check (Vision 2035)
// ---------------------------------------------------------------------------
// Step 1: Enter opposing party name
// Step 2: System scans → shows result (clear / flagged)
// Step 3: Operator confirms → gate clears
// ---------------------------------------------------------------------------

type ConflictStep = 'search' | 'scanning' | 'result' | 'cleared'

// Shared slide-in transition values
const SLIDE_IN = {
  initial: { opacity: 0, y: 20, height: 0 },
  animate: { opacity: 1, y: 0, height: 'auto' },
  exit: { opacity: 0, y: -8, height: 0 },
  transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] },
} as const

interface GateAConflictProps {
  onComplete?: () => void
}

export function GateAConflict({ onComplete }: GateAConflictProps) {
  const [step, setStep] = useState<ConflictStep>('search')
  const [searchQuery, setSearchQuery] = useState('')

  const handleSearch = () => {
    if (!searchQuery.trim()) return
    setStep('scanning')
    // Simulate scan
    setTimeout(() => setStep('result'), 2000)
  }

  const handleClear = () => {
    setStep('cleared')
    setTimeout(() => onComplete?.(), 800)
  }

  return (
    <div className="flex-1 flex items-start justify-center px-8 pt-4 pb-20">
      <div className="w-full max-w-2xl">
        {/* Mission Banner */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-4">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] text-emerald-400 font-semibold tracking-widest uppercase">
              Gate A &middot; Active
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-white/90 tracking-tight">
            Conflict Check
          </h1>
          <p className="text-white/35 text-sm mt-2 max-w-md mx-auto leading-relaxed">
            Search for opposing parties to verify no conflicts of interest exist before proceeding.
          </p>
        </motion.div>

        {/* The Corridor */}
        <div className="space-y-4">
          {/* Step 1: Search Input */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="rounded-2xl p-5"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                <span className="text-[12px] font-bold text-white/30">1</span>
              </div>
              <p className="text-sm font-medium text-white/60">Opposing Party</p>
            </div>

            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Enter name or organisation..."
                  className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white/80 text-sm placeholder:text-white/20 focus:outline-none focus:border-emerald-500/30 transition-colors"
                />
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSearch}
                disabled={!searchQuery.trim()}
                className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-white/50 text-sm font-medium hover:border-emerald-500/20 hover:text-white/70 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Scan
              </motion.button>
            </div>
          </motion.div>

          {/* Scanning Animation */}
          <AnimatePresence>
            {step === 'scanning' && (
              <motion.div
                initial={SLIDE_IN.initial}
                animate={SLIDE_IN.animate}
                exit={SLIDE_IN.exit}
                transition={SLIDE_IN.transition}
                className="rounded-2xl p-6 flex items-center justify-center gap-4"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="w-8 h-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-400"
                />
                <div>
                  <p className="text-sm text-white/60 font-medium">Scanning Norva Ledger…</p>
                  <p className="text-[11px] text-white/25 mt-0.5">
                    Checking contacts, matters, and opposing parties
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Result: No Conflict */}
          <AnimatePresence>
            {(step === 'result' || step === 'cleared') && (
              <motion.div
                initial={SLIDE_IN.initial}
                animate={SLIDE_IN.animate}
                exit={SLIDE_IN.exit}
                transition={SLIDE_IN.transition}
                className="rounded-2xl p-5"
                style={{
                  background: 'linear-gradient(135deg, rgba(16,185,129,0.05) 0%, rgba(16,185,129,0.01) 100%)',
                  border: '1px solid rgba(16,185,129,0.15)',
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-emerald-400/90">No Conflicts Found</p>
                    <p className="text-[12px] text-white/30 mt-0.5">
                      &ldquo;{searchQuery}&rdquo; has no matches across all tenant records
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* The Primary Action — Clear Gate */}
          <AnimatePresence>
            {step === 'result' && (
              <motion.div
                initial={{ opacity: 0, y: 20, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
                className="pt-2"
              >
                <motion.button
                  whileHover={{ scale: 1.015 }}
                  whileTap={{ scale: 0.985 }}
                  onClick={handleClear}
                  className="w-full relative rounded-2xl p-6 flex items-center justify-center gap-3 overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  }}
                >
                  {/* Breathing Pulse Ring */}
                  <motion.div
                    className="absolute inset-0 rounded-2xl"
                    animate={{
                      boxShadow: [
                        'inset 0 0 0px rgba(255,255,255,0), 0 4px 24px rgba(16, 185, 129, 0.3), 0 0 0px rgba(16, 185, 129, 0)',
                        'inset 0 0 30px rgba(255,255,255,0.08), 0 8px 48px rgba(16, 185, 129, 0.5), 0 0 80px rgba(16, 185, 129, 0.15)',
                        'inset 0 0 0px rgba(255,255,255,0), 0 4px 24px rgba(16, 185, 129, 0.3), 0 0 0px rgba(16, 185, 129, 0)',
                      ],
                    }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <CheckCircle2 className="w-5 h-5 text-white relative z-10" />
                  <span className="text-white font-semibold text-base relative z-10">
                    Clear Conflict &amp; Proceed
                  </span>
                  <ArrowRight className="w-4 h-4 text-white/70 relative z-10 ml-1" />
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
