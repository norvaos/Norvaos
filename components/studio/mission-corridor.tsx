'use client'

import { useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GoldenThread, type Gate, type GateStatus, SOVEREIGN_STAGES, type StageId } from './golden-thread'
import { GateAConflict } from './gate-a-conflict'
import { GateBMeeting } from './gate-b-meeting'
import { GateCCapture } from './gate-c-capture'
import { GateDRetainer } from './gate-d-retainer'
import {
  MessageSquareText,
  UserPlus,
  Users,
  Brain,
  FileSignature,
  CreditCard,
  Trophy,
  CheckCircle2,
  ArrowRight,
  Clock,
  Send,
} from 'lucide-react'
import type { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Mission Corridor — Visual 7 Orchestrator (Vision 2035)
// ---------------------------------------------------------------------------
// Manages the 7-stage pipeline state, transitions between stages with
// conveyor-belt animation, and connects the Golden Thread to the active panel.
//
// Stages: INQUIRY → CONTACT → MEETING → STRATEGY → RETAINER → PAYMENT → WON
//
// Gate A–D panels are mapped to their closest stages. Stages without a
// dedicated full panel get a streamlined "Quick Action" card.
// ---------------------------------------------------------------------------

const stageIcons: Record<StageId, ReactNode> = {
  inquiry:  <MessageSquareText className="w-4 h-4" />,
  contact:  <UserPlus className="w-4 h-4" />,
  meeting:  <Users className="w-4 h-4" />,
  strategy: <Brain className="w-4 h-4" />,
  retainer: <FileSignature className="w-4 h-4" />,
  payment:  <CreditCard className="w-4 h-4" />,
  won:      <Trophy className="w-4 h-4" />,
}

const stageLabels: Record<StageId, string> = {
  inquiry:  'Inquiry',
  contact:  'Contact',
  meeting:  'Meeting',
  strategy: 'Strategy',
  retainer: 'Retainer',
  payment:  'Payment',
  won:      'Won',
}

const stageDescriptions: Record<StageId, string> = {
  inquiry:  'A new inquiry has arrived. Review the request and initiate contact.',
  contact:  'Verify identity documents and capture client information.',
  meeting:  'Schedule and complete the initial consultation.',
  strategy: 'Define the legal strategy and case approach.',
  retainer: 'Prepare and send the retainer agreement for signature.',
  payment:  'Process the initial trust deposit or retainer payment.',
  won:      'All stages cleared. Matter is open and active.',
}

// Conveyor-belt transition constants
const PANEL_INITIAL = { opacity: 0, y: 40, scale: 0.98 } as const
const PANEL_ANIMATE = { opacity: 1, y: 0, scale: 1 } as const
const PANEL_EXIT = { opacity: 0, y: -60, scale: 0.97 } as const
const PANEL_ENTER_TRANSITION = { duration: 0.6, ease: [0.25, 0.1, 0.25, 1], delay: 0.15 } as const

interface MissionCorridorProps {
  /** Stage to start at. Default: first non-completed stage */
  initialGate?: StageId
  /** Pre-completed stages (e.g., from server state) */
  completedGates?: StageId[]
  clientName?: string
  matterId?: string
}

// ---------------------------------------------------------------------------
// Quick Action Stage — streamlined panel for stages without full Gate UIs
// ---------------------------------------------------------------------------
function QuickActionStage({
  stageId,
  onComplete,
}: {
  stageId: StageId
  onComplete: () => void
}) {
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
            <span className="text-emerald-400">{stageIcons[stageId]}</span>
            <span className="text-[11px] text-emerald-400 font-semibold tracking-widest uppercase">
              {stageLabels[stageId]} &middot; Active
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-white/90 tracking-tight">
            {stageLabels[stageId]}
          </h1>
          <p className="text-white/35 text-sm mt-2 max-w-md mx-auto leading-relaxed">
            {stageDescriptions[stageId]}
          </p>
        </motion.div>

        {/* Strategy stage gets a "Smart Pause" hint */}
        {stageId === 'strategy' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="rounded-2xl p-5 mb-6"
            style={{
              background: 'linear-gradient(135deg, rgba(251,191,36,0.04) 0%, rgba(251,191,36,0.01) 100%)',
              border: '1px solid rgba(251,191,36,0.12)',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Clock className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-amber-400/80">Smart Pause Available</p>
                <p className="text-[12px] text-white/30 mt-0.5">
                  Snooze this lead for follow-up. The system will remind you at the scheduled time.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Payment stage gets an amount entry */}
        {stageId === 'payment' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="rounded-2xl p-5 mb-6"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                <CreditCard className="w-4 h-4 text-white/30" />
              </div>
              <p className="text-sm font-medium text-white/60">Trust Deposit</p>
            </div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/25 text-sm">$</span>
              <input
                type="text"
                placeholder="0.00"
                className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-8 pr-4 py-3 text-white/80 text-sm placeholder:text-white/20 focus:outline-none focus:border-emerald-500/30 transition-colors"
              />
            </div>
          </motion.div>
        )}

        {/* The Primary Action — Complete Stage */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <motion.button
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.985 }}
            onClick={onComplete}
            className="w-full relative rounded-2xl p-6 flex items-center justify-center gap-3 overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            }}
          >
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
              Complete {stageLabels[stageId]} &amp; Proceed
            </span>
            <ArrowRight className="w-4 h-4 text-white/70 relative z-10 ml-1" />
          </motion.button>
        </motion.div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Map stages → which panel component to render
// ---------------------------------------------------------------------------
// Stages with dedicated Gate panels use them; others get QuickActionStage.
const STAGE_TO_GATE: Partial<Record<StageId, 'a' | 'b' | 'c' | 'd'>> = {
  inquiry:  'a',  // Conflict check / initial review
  meeting:  'b',  // Consultation scheduling
  contact:  'c',  // Identity capture
  retainer: 'd',  // Agreement execution
}

export function MissionCorridor({
  initialGate,
  completedGates = [],
  clientName = 'New Client',
  matterId = '—',
}: MissionCorridorProps) {
  const startGate = useMemo(() => {
    if (initialGate) return initialGate
    const first = SOVEREIGN_STAGES.find((g) => !completedGates.includes(g))
    return first ?? 'won'
  }, [initialGate, completedGates])

  const [activeStage, setActiveStage] = useState<StageId>(startGate)
  const [completed, setCompleted] = useState<Set<StageId>>(new Set(completedGates))

  // Build gate config for the Golden Thread
  const gates: Gate[] = useMemo(() => {
    return SOVEREIGN_STAGES.map((id) => {
      let status: GateStatus = 'locked'
      if (completed.has(id)) status = 'completed'
      else if (id === activeStage) status = 'active'
      return { id, label: stageLabels[id], icon: stageIcons[id], status }
    })
  }, [activeStage, completed])

  const advanceStage = useCallback(() => {
    setCompleted((prev) => new Set([...prev, activeStage]))
    const idx = SOVEREIGN_STAGES.indexOf(activeStage)
    const next = SOVEREIGN_STAGES[idx + 1]
    if (next) {
      setActiveStage(next)
    }
  }, [activeStage])

  const handleGateClick = useCallback((gateId: string) => {
    // Read-only review — corridor only moves forward
  }, [])

  const allComplete = completed.size === SOVEREIGN_STAGES.length

  // Determine which panel to render
  const gateMapping = STAGE_TO_GATE[activeStage]

  return (
    <div className="flex flex-col flex-1">
      <GoldenThread gates={gates} onGateClick={handleGateClick} />

      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          {!allComplete && gateMapping === 'a' && (
            <motion.div key="gate-a" initial={PANEL_INITIAL} animate={PANEL_ANIMATE} exit={PANEL_EXIT} transition={PANEL_ENTER_TRANSITION} className="absolute inset-0">
              <GateAConflict onComplete={advanceStage} />
            </motion.div>
          )}
          {!allComplete && gateMapping === 'b' && (
            <motion.div key="gate-b" initial={PANEL_INITIAL} animate={PANEL_ANIMATE} exit={PANEL_EXIT} transition={PANEL_ENTER_TRANSITION} className="absolute inset-0">
              <GateBMeeting onComplete={advanceStage} />
            </motion.div>
          )}
          {!allComplete && gateMapping === 'c' && (
            <motion.div key="gate-c" initial={PANEL_INITIAL} animate={PANEL_ANIMATE} exit={PANEL_EXIT} transition={PANEL_ENTER_TRANSITION} className="absolute inset-0">
              <GateCCapture />
            </motion.div>
          )}
          {!allComplete && gateMapping === 'd' && (
            <motion.div key="gate-d" initial={PANEL_INITIAL} animate={PANEL_ANIMATE} exit={PANEL_EXIT} transition={PANEL_ENTER_TRANSITION} className="absolute inset-0">
              <GateDRetainer onComplete={advanceStage} />
            </motion.div>
          )}
          {!allComplete && !gateMapping && (
            <motion.div key={`stage-${activeStage}`} initial={PANEL_INITIAL} animate={PANEL_ANIMATE} exit={PANEL_EXIT} transition={PANEL_ENTER_TRANSITION} className="absolute inset-0">
              <QuickActionStage stageId={activeStage} onComplete={advanceStage} />
            </motion.div>
          )}

          {/* Mission Complete */}
          {allComplete && (
            <motion.div
              key="complete"
              initial={PANEL_INITIAL} animate={PANEL_ANIMATE} exit={PANEL_EXIT} transition={PANEL_ENTER_TRANSITION}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className="text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.2 }}
                  className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center"
                  style={{
                    background: 'radial-gradient(circle, rgba(16,185,129,0.2) 0%, rgba(16,185,129,0.05) 100%)',
                    border: '2px solid rgba(16,185,129,0.3)',
                    boxShadow: '0 0 40px rgba(16,185,129,0.2)',
                  }}
                >
                  <Trophy className="w-8 h-8 text-emerald-400" />
                </motion.div>
                <h2 className="text-2xl font-semibold text-white/90 mb-2">
                  Mission Complete
                </h2>
                <p className="text-white/35 text-sm max-w-sm mx-auto">
                  All seven stages cleared. Matter #{matterId} is now open and active in Norva Ledger.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
