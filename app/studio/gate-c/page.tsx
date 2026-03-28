'use client'

import { GoldenThread } from '@/components/studio/golden-thread'
import { GateCCapture } from '@/components/studio/gate-c-capture'
import { CommBubble } from '@/components/studio/comm-bubble'

export default function GateCPage() {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: 'linear-gradient(180deg, #0f0f17 0%, #12121c 40%, #0e0e15 100%)',
      }}
    >
      {/* Top Bar — Minimal Identity */}
      <div className="flex items-center justify-between px-8 pt-6 pb-0">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)',
            }}
          >
            <span className="text-white font-bold text-[11px]">N</span>
          </div>
          <span className="text-white/40 text-[13px] font-medium tracking-wider">
            NORVA<span className="text-emerald-400/60">OS</span>
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-[11px] text-white/20 tracking-wider uppercase">
            Matter #2026-0347
          </span>
          <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
            <span className="text-[11px] text-white/40 font-medium">ZW</span>
          </div>
        </div>
      </div>

      {/* Golden Thread — The Only Navigation */}
      <GoldenThread />

      {/* The Infinite Corridor — Gate C Workspace */}
      <GateCCapture />

      {/* Floating Comm Bubble */}
      <CommBubble />
    </div>
  )
}
