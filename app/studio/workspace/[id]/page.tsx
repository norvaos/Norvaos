'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { AnimatePresence } from 'framer-motion'
import { MissionCorridor } from '@/components/studio/mission-corridor'
import { CommBubble } from '@/components/studio/comm-bubble'
import { HighContextAvatar } from '@/components/studio/high-context-avatar'
import { WarpSearch } from '@/components/studio/warp-search'
import { VelocitySplash } from '@/components/studio/velocity-splash'
import { QuickIntakeButton } from '@/components/studio/quick-intake-button'
import { SOVEREIGN_STAGES, type StageId } from '@/components/studio/golden-thread'

// ---------------------------------------------------------------------------
// The Infinite Corridor — Zero-Chrome Workspace (Visual 7)
// ---------------------------------------------------------------------------
// Route: /studio/workspace/[id]
//
// ZERO-CHROME POLICY:
//   ✗ No top-nav, side-nav, footer
//   ✓ 7-Node Golden Thread is the "North Star"
//   ✓ Single centred column, max-width 800px
//
// SOVEREIGN 7-STAGE PIPELINE:
//   INQUIRY → CONTACT → MEETING → STRATEGY → RETAINER → PAYMENT → WON
// ---------------------------------------------------------------------------

export default function WorkspacePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const leadId = params.id as string

  // Parse ?gate= query param for Warp Search entry
  const gateParam = searchParams.get('gate') as StageId | null
  const initialGate: StageId | undefined =
    gateParam && (SOVEREIGN_STAGES as readonly string[]).includes(gateParam)
      ? gateParam
      : undefined

  // Compute pre-completed stages from the initial gate
  const completedGates: StageId[] = initialGate
    ? (SOVEREIGN_STAGES.slice(0, SOVEREIGN_STAGES.indexOf(initialGate)) as StageId[])
    : []

  // Velocity Splash — first-time or zero-leads state
  // ?splash=1 forces the splash (for demo/testing); otherwise check leads.count
  const showSplashParam = searchParams.get('splash') === '1'
  const isFirstMission = !initialGate && completedGates.length === 0
  const [splashActive, setSplashActive] = useState(showSplashParam || isFirstMission)

  // Warp Search overlay (⌘K)
  const [showWarpSearch, setShowWarpSearch] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowWarpSearch((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: 'linear-gradient(180deg, #0f0f17 0%, #12121c 40%, #0e0e15 100%)',
      }}
    >
      {/* ─── Top Bar — Minimal Identity (Zero-Chrome) ─── */}
      <div className="flex items-center justify-between px-8 pt-6 pb-0">
        {/* NorvaOS Sigil */}
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

        {/* Client Avatar + Matter ID */}
        <div className="flex items-center gap-6">
          {/* Warp Search Trigger */}
          <button
            onClick={() => setShowWarpSearch(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/5 hover:border-white/15 transition-all group"
          >
            <span className="text-[11px] text-white/20 group-hover:text-white/40 transition-colors">
              Warp
            </span>
            <kbd className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white/5 text-[10px] text-white/15 border border-white/5">
              ⌘K
            </kbd>
          </button>

          <span className="text-[11px] text-white/20 tracking-wider uppercase">
            Matter #{leadId?.slice(0, 4) ?? '—'}
          </span>

          <HighContextAvatar
            name="Amira Hassan"
            country="Pakistan"
            caseType="Spousal Sponsorship"
            hasActiveMission
          />
        </div>
      </div>

      {/* ─── The Infinite Corridor ─── */}
      <MissionCorridor
        initialGate={initialGate}
        completedGates={completedGates}
        clientName="Amira Hassan"
        matterId={leadId ?? '—'}
      />

      {/* ─── Floating Comm Bubble ─── */}
      <CommBubble />

      {/* ─── Warp Search Overlay ─── */}
      <AnimatePresence>
        {showWarpSearch && (
          <WarpSearch overlay onClose={() => setShowWarpSearch(false)} />
        )}
      </AnimatePresence>

      {/* ─── QuickIntakeButton — Ignition Point (bottom-right, z-50) ─── */}
      <QuickIntakeButton />

      {/* ─── Velocity Splash — The 3-Second Handshake ─── */}
      <VelocitySplash
        skip={!splashActive}
        onComplete={() => setSplashActive(false)}
      />
    </div>
  )
}
