'use client'

import { motion } from 'framer-motion'
import {
  Lock,
  MessageSquareText,
  UserPlus,
  Users,
  Brain,
  FileSignature,
  CreditCard,
  Trophy,
} from 'lucide-react'
import { STAGE_COLOURS, SOVEREIGN_STAGES, type StageId } from './golden-thread'
import type { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Blueprint Banner — Sovereign 7-Stage Pipeline (Settings View)
// ---------------------------------------------------------------------------
// Read-only banner that displays the hard-coded 7-stage master pipeline.
// Shows all 7 nodes with their corresponding hex codes (Blue → Emerald)
// so the user understands the colour-coding of their data.
// ---------------------------------------------------------------------------

const stageIcons: Record<StageId, ReactNode> = {
  inquiry:  <MessageSquareText className="w-3.5 h-3.5" />,
  contact:  <UserPlus className="w-3.5 h-3.5" />,
  meeting:  <Users className="w-3.5 h-3.5" />,
  strategy: <Brain className="w-3.5 h-3.5" />,
  retainer: <FileSignature className="w-3.5 h-3.5" />,
  payment:  <CreditCard className="w-3.5 h-3.5" />,
  won:      <Trophy className="w-3.5 h-3.5" />,
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

export function BlueprintBanner() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(16,185,129,0.04) 0%, rgba(16,185,129,0.01) 100%)',
        border: '1px solid rgba(16,185,129,0.12)',
      }}
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-emerald-500/[0.08] flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
          <Lock className="w-4 h-4 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground/90">
            Sovereign 7-Stage Master Pipeline Active
          </h3>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            This high-performance workflow is hard-coded for your firm&apos;s protection and speed.
          </p>
        </div>
      </div>

      {/* Stage Legend — 7 nodes with hex codes */}
      <div className="px-6 py-5">
        {/* Visual thread */}
        <div className="relative flex items-center justify-between mb-6">
          {/* Background connector */}
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[1px] bg-border/40" />

          {/* Gradient fill */}
          <div
            className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[1px]"
            style={{
              background: 'linear-gradient(90deg, #3B82F6, #2563EB, #0D9488, #059669, #10B981, #34D399, #6EE7B7)',
            }}
          />

          {/* Nodes */}
          {SOVEREIGN_STAGES.map((stage) => (
            <div key={stage} className="relative z-10 flex flex-col items-center gap-2">
              <div
                className="w-[10px] h-[10px] rounded-full ring-2"
                style={{
                  backgroundColor: STAGE_COLOURS[stage],
                  boxShadow: `0 0 8px ${STAGE_COLOURS[stage]}40`,
                  ['--tw-ring-color' as string]: `${STAGE_COLOURS[stage]}30`,
                }}
              />
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[9px] font-medium text-foreground/60 tracking-wider uppercase whitespace-nowrap">
                  {stageLabels[stage]}
                </span>
                <span
                  className="text-[8px] text-muted-foreground/40 font-mono tracking-wide"
                  style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
                >
                  {STAGE_COLOURS[stage]}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Legend grid — icon + name + colour swatch */}
        <div className="grid grid-cols-7 gap-2">
          {SOVEREIGN_STAGES.map((stage) => (
            <div
              key={stage}
              className="flex flex-col items-center gap-1.5 p-2.5 rounded-lg"
              style={{
                background: `${STAGE_COLOURS[stage]}08`,
                border: `1px solid ${STAGE_COLOURS[stage]}15`,
              }}
            >
              <span style={{ color: STAGE_COLOURS[stage] }}>{stageIcons[stage]}</span>
              <span className="text-[9px] font-medium text-foreground/50 text-center whitespace-nowrap">
                {stageLabels[stage]}
              </span>
            </div>
          ))}
        </div>

        {/* Read-only notice */}
        <p className="text-[11px] text-muted-foreground/40 text-center mt-4 italic">
          This pipeline cannot be modified. All leads progress through these 7 stages in order.
        </p>
      </div>
    </motion.div>
  )
}
