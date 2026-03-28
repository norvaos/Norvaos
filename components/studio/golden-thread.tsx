'use client'

import { motion } from 'framer-motion'
import {
  Check,
  MessageSquareText,
  UserPlus,
  Users,
  Brain,
  FileSignature,
  CreditCard,
  Trophy,
} from 'lucide-react'
import type { ReactNode } from 'react'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

// ---------------------------------------------------------------------------
// Golden Thread — Visual 7 (Vision 2035)
// ---------------------------------------------------------------------------
// 7 circular nodes (8px default, 10px active) across the 800px corridor.
// Connected by a 1px solid line.
//
// Completed: Emerald Green fill + Checkmark
// Active:    Emerald Pulse (2.5s breathing glow)
// Future:    Faint Charcoal outline (low contrast)
// ---------------------------------------------------------------------------

export type GateStatus = 'completed' | 'active' | 'locked'

export interface Gate {
  id: string
  label: string
  icon: ReactNode
  status: GateStatus
}

// ── Sovereign 7-Stage Master Pipeline ──
export const SOVEREIGN_STAGES = [
  'inquiry',
  'contact',
  'meeting',
  'strategy',
  'retainer',
  'payment',
  'won',
] as const

export type StageId = (typeof SOVEREIGN_STAGES)[number]

const stageIcons: Record<StageId, ReactNode> = {
  inquiry:  <MessageSquareText className="w-3 h-3" />,
  contact:  <UserPlus className="w-3 h-3" />,
  meeting:  <Users className="w-3 h-3" />,
  strategy: <Brain className="w-3 h-3" />,
  retainer: <FileSignature className="w-3 h-3" />,
  payment:  <CreditCard className="w-3 h-3" />,
  won:      <Trophy className="w-3 h-3" />,
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

/** SOP Descriptions — hard-coded action briefs for each sovereign stage */
export const stageDescriptions: Record<StageId, string> = {
  inquiry:  'New inbound mission. Action: Run Conflict Check & Risk Assessment. Initial qualification starts here.',
  contact:  'Outreach initiated. Goal: Secure the Strategy Meeting. Establishing the trust bridge.',
  meeting:  'Appointment confirmed. Prep the case file. Ensure the Principal has the Strategy Brief ready.',
  strategy: 'The Decision Point. Analyze the legal path. Action: Issue Retainer or activate Smart Pause (Nurture).',
  retainer: 'Agreement dispatched. System is performing automated follow-ups for signature.',
  payment:  'Agreement signed. Waiting for Trust Deposit or Stripe clearance before work begins.',
  won:      'Mission Successful. File converted to Active Matter. Handoff to Legal Team.',
}

/** Stage colour spectrum — Blue to Emerald (for Blueprint Banner legend) */
export const STAGE_COLOURS: Record<StageId, string> = {
  inquiry:  '#3B82F6', // blue-500
  contact:  '#2563EB', // blue-600
  meeting:  '#0D9488', // teal-600
  strategy: '#059669', // emerald-600
  retainer: '#10B981', // emerald-500
  payment:  '#34D399', // emerald-400
  won:      '#6EE7B7', // emerald-300
}

export function buildDefaultGates(activeStage: StageId = 'inquiry'): Gate[] {
  const activeIdx = SOVEREIGN_STAGES.indexOf(activeStage)
  return SOVEREIGN_STAGES.map((id, i) => {
    let status: GateStatus = 'locked'
    if (i < activeIdx) status = 'completed'
    else if (i === activeIdx) status = 'active'
    return { id, label: stageLabels[id], icon: stageIcons[id], status }
  })
}

interface GoldenThreadProps {
  gates?: Gate[]
  /** Callback when a completed gate node is clicked */
  onGateClick?: (gateId: string) => void
}

/**
 * Compute how far along the thread line should glow (emerald fill).
 */
function computeProgress(gates: Gate[]): number {
  const total = gates.length
  if (total <= 1) return 0
  const activeIdx = gates.findIndex((g) => g.status === 'active')
  const completedCount = gates.filter((g) => g.status === 'completed').length
  if (activeIdx === -1) return completedCount === total ? 100 : 0
  return (activeIdx / (total - 1)) * 100
}

export function GoldenThread({ gates = buildDefaultGates(), onGateClick }: GoldenThreadProps) {
  const progress = computeProgress(gates)

  return (
    <TooltipProvider delayDuration={200}>
      <div className="w-full px-6 py-5">
        <div className="max-w-3xl mx-auto">
          {/* Thread Line */}
          <div className="relative flex items-center justify-between">
            {/* Background Track — 1px solid connector */}
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[1px] bg-white/[0.08]" />

            {/* Completed Segment — Emerald Glow */}
            <motion.div
              className="absolute left-0 top-1/2 -translate-y-1/2 h-[1px]"
              style={{
                background: 'linear-gradient(90deg, #10b981, #34d399, #6ee7b7)',
                boxShadow: '0 0 8px rgba(16, 185, 129, 0.35)',
              }}
              initial={{ width: '0%' }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
            />

            {/* 7 Gate Nodes */}
            {gates.map((gate) => {
              const description = stageDescriptions[gate.id as StageId]
              return (
                <Tooltip key={gate.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="relative z-10 flex flex-col items-center gap-1.5 bg-transparent border-none"
                      style={{ cursor: gate.status === 'completed' && onGateClick ? 'pointer' : 'default' }}
                      onClick={() => gate.status === 'completed' && onGateClick?.(gate.id)}
                      disabled={gate.status === 'locked'}
                    >
                      {/* ── Active Node: Emerald Pulse ── */}
                      {gate.status === 'active' ? (
                        <motion.div
                          className="w-[10px] h-[10px] rounded-full border border-emerald-400 flex items-center justify-center"
                          style={{
                            background: 'radial-gradient(circle, rgba(16,185,129,0.5) 0%, rgba(16,185,129,0.15) 100%)',
                          }}
                          animate={{
                            boxShadow: [
                              '0 0 0px rgba(16, 185, 129, 0.3), 0 0 6px rgba(16, 185, 129, 0.15)',
                              '0 0 10px rgba(16, 185, 129, 0.5), 0 0 20px rgba(16, 185, 129, 0.2)',
                              '0 0 0px rgba(16, 185, 129, 0.3), 0 0 6px rgba(16, 185, 129, 0.15)',
                            ],
                          }}
                          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                        />
                      ) : gate.status === 'completed' ? (
                        /* ── Completed Node: Emerald Fill + Check ── */
                        <div className="w-[8px] h-[8px] rounded-full bg-emerald-500 flex items-center justify-center ring-2 ring-emerald-500/20" />
                      ) : (
                        /* ── Future Node: Faint Charcoal outline ── */
                        <div className="w-[8px] h-[8px] rounded-full border border-white/[0.12] bg-white/[0.03]" />
                      )}

                      {/* Label — compact for 7 nodes */}
                      <span
                        className={`text-[9px] font-medium tracking-wider uppercase whitespace-nowrap ${
                          gate.status === 'active'
                            ? 'text-emerald-400'
                            : gate.status === 'completed'
                              ? 'text-emerald-500/60'
                              : 'text-white/20'
                        }`}
                      >
                        {gate.label}
                      </span>
                    </button>
                  </TooltipTrigger>
                  {description && (
                    <TooltipContent
                      side="bottom"
                      sideOffset={8}
                      className="max-w-[260px] rounded-lg border border-emerald-500/30 bg-zinc-950/90 backdrop-blur-md px-3.5 py-3 text-xs leading-relaxed text-white/80 shadow-lg shadow-emerald-900/30"
                    >
                      <p className="font-semibold text-emerald-400 uppercase tracking-wider text-[10px] mb-1.5">{gate.label}</p>
                      <p className="text-white/70">{description}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              )
            })}
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
