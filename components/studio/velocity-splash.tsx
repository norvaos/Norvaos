'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageSquareText,
  UserPlus,
  Users,
  Brain,
  FileSignature,
  CreditCard,
  Trophy,
  ArrowRight,
  Zap,
  Clock,
} from 'lucide-react'
import type { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Velocity Splash — The 3-Second Handshake (Visual 7)
// ---------------------------------------------------------------------------
// Updated for the Sovereign 7-Stage Master Pipeline:
//   INQUIRY ⇢ CONTACT ⇢ MEETING ⇢ STRATEGY ⇢ RETAINER ⇢ PAYMENT ⇢ WON
//
// Phase 1 (0.0–1.0s): Dark charcoal. Emerald Line draws across centre.
// Phase 2 (1.0–2.5s): Seven nodes pulse into existence with Geist Mono labels.
//         "Smart Pause" snooze icon beneath STRATEGY node.
//         Text: "SYSTEM READY. FACTORY ONLINE."
// Phase 3 (2.5–3.0s): Dissolves to "Start Your First Mission" CTA.
// ---------------------------------------------------------------------------

type Phase = 0 | 1 | 2 | 3

interface StageNode {
  id: string
  label: string
  icon: ReactNode
  /** 0-1 position along the thread */
  position: number
  /** Show the "Smart Pause" snooze hint */
  showSnooze?: boolean
}

const STAGE_NODES: StageNode[] = [
  { id: '1', label: 'Inquiry',  icon: <MessageSquareText className="w-3 h-3" />, position: 0 },
  { id: '2', label: 'Contact',  icon: <UserPlus className="w-3 h-3" />,         position: 1 / 6 },
  { id: '3', label: 'Meeting',  icon: <Users className="w-3 h-3" />,            position: 2 / 6 },
  { id: '4', label: 'Strategy', icon: <Brain className="w-3 h-3" />,            position: 3 / 6, showSnooze: true },
  { id: '5', label: 'Retainer', icon: <FileSignature className="w-3 h-3" />,    position: 4 / 6 },
  { id: '6', label: 'Payment',  icon: <CreditCard className="w-3 h-3" />,       position: 5 / 6 },
  { id: '7', label: 'Won',      icon: <Trophy className="w-3 h-3" />,           position: 1 },
]

interface VelocitySplashProps {
  onComplete?: () => void
  skip?: boolean
}

export function VelocitySplash({ onComplete, skip = false }: VelocitySplashProps) {
  const [phase, setPhase] = useState<Phase>(0)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (skip) {
      setDismissed(true)
      return
    }

    const t1 = setTimeout(() => setPhase(1), 100)
    const t2 = setTimeout(() => setPhase(2), 1000)
    const t3 = setTimeout(() => setPhase(3), 2500)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [skip])

  const handleStart = useCallback(() => {
    setDismissed(true)
    setTimeout(() => onComplete?.(), 500)
  }, [onComplete])

  if (skip && dismissed) return null

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          key="velocity-splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{
            background: 'linear-gradient(180deg, #0c0c14 0%, #0f0f17 50%, #0b0b12 100%)',
          }}
        >
          {/* ═══ Phase 1: The Golden Thread Line ═══ */}
          <div className="relative w-full max-w-3xl mx-auto px-16">
            {/* The Thread — thin emerald line */}
            <div className="relative h-[1px] w-full">
              <div className="absolute inset-0 bg-white/[0.03] rounded-full" />
              <motion.div
                className="absolute top-0 left-0 h-full rounded-full"
                style={{
                  background: 'linear-gradient(90deg, #3B82F6, #0D9488, #10b981, #34d399, #6ee7b7)',
                  boxShadow: '0 0 16px rgba(16, 185, 129, 0.35), 0 0 48px rgba(16, 185, 129, 0.1)',
                }}
                initial={{ width: '0%' }}
                animate={phase >= 1 ? { width: '100%' } : { width: '0%' }}
                transition={{ duration: 0.9, ease: [0.25, 0.1, 0.25, 1] }}
              />
            </div>

            {/* ═══ Phase 2: 7 Stage Nodes pulse into existence ═══ */}
            <div className="absolute left-16 right-16 top-1/2 -translate-y-1/2">
              {STAGE_NODES.map((node, i) => (
                <AnimatePresence key={node.id}>
                  {phase >= 2 && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        duration: 0.35,
                        delay: i * 0.08,
                        ease: [0.25, 0.1, 0.25, 1],
                      }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2.5"
                      style={{ left: `${node.position * 100}%`, top: '0' }}
                    >
                      {/* Node circle — 8px */}
                      <motion.div
                        className="w-[8px] h-[8px] rounded-full border border-emerald-500/40"
                        style={{
                          background: 'radial-gradient(circle, rgba(16,185,129,0.3) 0%, rgba(16,185,129,0.08) 100%)',
                        }}
                        animate={{
                          boxShadow: [
                            '0 0 0px rgba(16, 185, 129, 0.2), 0 0 4px rgba(16, 185, 129, 0.1)',
                            '0 0 8px rgba(16, 185, 129, 0.4), 0 0 16px rgba(16, 185, 129, 0.15)',
                            '0 0 0px rgba(16, 185, 129, 0.2), 0 0 4px rgba(16, 185, 129, 0.1)',
                          ],
                        }}
                        transition={{
                          duration: 2.5,
                          repeat: Infinity,
                          ease: 'easeInOut',
                          delay: i * 0.2,
                        }}
                      />

                      {/* Stage label — Geist Mono */}
                      <motion.span
                        initial={{ opacity: 0, y: 3 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 + i * 0.08, duration: 0.25 }}
                        className="text-[9px] text-white/20 font-medium tracking-[0.15em] uppercase whitespace-nowrap"
                        style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
                      >
                        {node.label}
                      </motion.span>

                      {/* Smart Pause hint — snooze icon beneath STRATEGY */}
                      {node.showSnooze && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.6, duration: 0.4 }}
                          className="flex items-center gap-1 -mt-0.5"
                        >
                          <Clock className="w-[9px] h-[9px] text-amber-400/30" />
                          <span
                            className="text-[7px] text-amber-400/25 tracking-wider uppercase"
                            style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
                          >
                            Snooze
                          </span>
                        </motion.div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              ))}
            </div>

            {/* ═══ Phase 2: "SYSTEM READY. FACTORY ONLINE." ═══ */}
            <AnimatePresence>
              {phase >= 2 && phase < 3 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5, delay: 0.5 }}
                  className="absolute left-0 right-0 -bottom-24 text-center"
                >
                  <p
                    className="text-[12px] text-emerald-400/40 tracking-[0.3em] uppercase"
                    style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
                  >
                    System Ready. Factory Online.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ═══ Phase 3: "Start Your First Mission" CTA ═══ */}
            <AnimatePresence>
              {phase >= 3 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
                  className="absolute left-0 right-0 -bottom-36 flex flex-col items-center gap-4"
                >
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="text-[11px] text-white/15 tracking-[0.2em] uppercase"
                    style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
                  >
                    System Ready. Factory Online.
                  </motion.p>

                  {/* THE PRIMARY CTA — Emerald Pulse */}
                  <motion.button
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleStart}
                    className="relative rounded-2xl px-10 py-5 flex items-center gap-3 overflow-hidden"
                    style={{
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    }}
                  >
                    <motion.div
                      className="absolute inset-0 rounded-2xl"
                      animate={{
                        boxShadow: [
                          'inset 0 0 0px rgba(255,255,255,0), 0 4px 24px rgba(16, 185, 129, 0.3), 0 0 0px rgba(16, 185, 129, 0)',
                          'inset 0 0 30px rgba(255,255,255,0.1), 0 8px 56px rgba(16, 185, 129, 0.5), 0 0 100px rgba(16, 185, 129, 0.15)',
                          'inset 0 0 0px rgba(255,255,255,0), 0 4px 24px rgba(16, 185, 129, 0.3), 0 0 0px rgba(16, 185, 129, 0)',
                        ],
                      }}
                      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <Zap className="w-5 h-5 text-white relative z-10" />
                    <span className="text-white font-semibold text-base relative z-10 tracking-wide">
                      Start Your First Mission
                    </span>
                    <ArrowRight className="w-4 h-4 text-white/70 relative z-10 ml-1" />
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* NorvaOS Sigil — bottom centre */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: phase >= 1 ? 1 : 0 }}
            transition={{ duration: 1, delay: 0.5 }}
            className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-2"
          >
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(16,185,129,0.1) 100%)',
                border: '1px solid rgba(16,185,129,0.15)',
              }}
            >
              <span className="text-emerald-400/50 font-bold text-[9px]">N</span>
            </div>
            <span className="text-white/15 text-[11px] font-medium tracking-wider">
              NORVA<span className="text-emerald-400/30">OS</span>
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
