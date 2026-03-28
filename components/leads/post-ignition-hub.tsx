'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { CalendarPlus, FileText, LinkIcon, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog as DialogPrimitive } from 'radix-ui'

// ---------------------------------------------------------------------------
// PostIgnitionHub — The Revenue Engine Switchboard
// ---------------------------------------------------------------------------
// Obsidian Glass overlay that appears after successful lead creation.
// Presents the "Golden Action" (Book Strategy Session) and secondary actions.
// Uses Radix Portal at z-[9999] — nothing can cover these buttons.
// ---------------------------------------------------------------------------

export interface IgnitionPayload {
  leadId: string
  leadName: string
  matterTypeName: string | null
  consultationFeeCents: number
}

interface PostIgnitionHubProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  payload: IgnitionPayload | null
}

export function PostIgnitionHub({ open, onOpenChange, payload }: PostIgnitionHubProps) {
  const router = useRouter()

  const navigateToLead = useCallback(() => {
    if (payload?.leadId) {
      onOpenChange(false)
      router.push(`/studio/workspace/${payload.leadId}?splash=1`)
    }
  }, [payload, onOpenChange, router])

  const handleBookSession = useCallback(() => {
    // Phase B: This will open the Sovereign Scheduler
    // For now, navigate to the lead workspace with booking intent
    if (payload?.leadId) {
      onOpenChange(false)
      router.push(`/studio/workspace/${payload.leadId}?action=book`)
    }
  }, [payload, onOpenChange, router])

  const handleLogBrief = useCallback(() => {
    if (payload?.leadId) {
      onOpenChange(false)
      router.push(`/studio/workspace/${payload.leadId}?action=intake`)
    }
  }, [payload, onOpenChange, router])

  const handleSendRetainer = useCallback(() => {
    if (payload?.leadId) {
      onOpenChange(false)
      router.push(`/studio/workspace/${payload.leadId}?action=retainer`)
    }
  }, [payload, onOpenChange, router])

  if (!payload) return null

  const feeFormatted = payload.consultationFeeCents > 0
    ? `$${(payload.consultationFeeCents / 100).toLocaleString('en-CA', { minimumFractionDigits: 0 })}`
    : null

  return (
    <AnimatePresence>
      {open && (
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
          <DialogPrimitive.Portal>
            <style>{`
              @keyframes hubPulse {
                0%, 100% { opacity: 0.3; }
                50% { opacity: 1; }
              }
            `}</style>
            {/* Overlay — obsidian glass */}
            <DialogPrimitive.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-xl"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              />
            </DialogPrimitive.Overlay>

            {/* Content — centered hub */}
            <DialogPrimitive.Content asChild>
              <motion.div
                className="fixed inset-0 z-[9999] flex items-center justify-center p-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.div
                  className="w-full max-w-lg"
                  initial={{ opacity: 0, scale: 0.92, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                >
                  {/* Emerald pulse line at top */}
                  <div
                    className="h-[2px] rounded-t-xl mx-8"
                    style={{
                      background: 'linear-gradient(90deg, transparent 0%, #10b981 30%, #34d399 50%, #10b981 70%, transparent 100%)',
                      animation: 'hubPulse 2.5s ease-in-out infinite',
                    }}
                  />

                  <div
                    className="rounded-xl border border-white/[0.08] p-8 shadow-2xl backdrop-blur-2xl"
                    style={{
                      background: 'linear-gradient(180deg, rgba(2,6,23,0.97) 0%, rgba(2,6,23,0.99) 100%)',
                      boxShadow: '0 0 80px rgba(16,185,129,0.06), 0 25px 50px rgba(0,0,0,0.6)',
                    }}
                  >
                    {/* Status badge */}
                    <div className="flex items-center gap-2 mb-4">
                      <span className="relative flex size-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full size-2 bg-emerald-500" />
                      </span>
                      <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-emerald-400">
                        Mission Initialised
                      </span>
                    </div>

                    {/* Header */}
                    <h2 className="text-xl font-bold font-mono text-white tracking-tight mb-1">
                      {payload.leadName}
                    </h2>
                    <p className="text-sm font-mono text-zinc-400 mb-8">
                      {payload.matterTypeName
                        ? `${payload.matterTypeName} — Select next objective.`
                        : 'Select next objective.'}
                    </p>

                    {/* Golden Action — Book Strategy Session */}
                    <Button
                      onClick={handleBookSession}
                      className="w-full h-14 mb-4 bg-emerald-600 hover:bg-emerald-500 text-white font-mono uppercase tracking-wider text-xs transition-all group relative overflow-hidden"
                      style={{
                        boxShadow: '0 0 30px rgba(16,185,129,0.2), 0 4px 15px rgba(16,185,129,0.12)',
                      }}
                    >
                      <div className="flex items-center justify-center gap-3 relative z-10">
                        <CalendarPlus className="size-5" strokeWidth={1.5} />
                        <span>
                          Book Strategy Session
                          {feeFormatted && (
                            <span className="ml-2 text-emerald-200/90">— {feeFormatted}</span>
                          )}
                        </span>
                        <ArrowRight className="size-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                      </div>
                      {/* Emerald shimmer on hover */}
                      <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-400/10 to-emerald-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                    </Button>

                    {/* Secondary Actions */}
                    <div className="grid grid-cols-2 gap-3 mb-6">
                      <button
                        onClick={handleLogBrief}
                        className="flex items-center gap-2.5 px-4 py-3 rounded-lg border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.10] transition-all group"
                      >
                        <FileText className="size-4 text-zinc-500 group-hover:text-zinc-300 transition-colors" strokeWidth={1.5} />
                        <span className="text-xs font-mono text-zinc-400 group-hover:text-zinc-200 uppercase tracking-wider transition-colors">
                          Log Intake Brief
                        </span>
                      </button>

                      <button
                        onClick={handleSendRetainer}
                        className="flex items-center gap-2.5 px-4 py-3 rounded-lg border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.10] transition-all group"
                      >
                        <LinkIcon className="size-4 text-zinc-500 group-hover:text-zinc-300 transition-colors" strokeWidth={1.5} />
                        <span className="text-xs font-mono text-zinc-400 group-hover:text-zinc-200 uppercase tracking-wider transition-colors">
                          Send Retainer
                        </span>
                      </button>
                    </div>

                    {/* Safety Exit */}
                    <button
                      onClick={navigateToLead}
                      className="w-full text-center py-2 text-[11px] font-mono text-zinc-600 hover:text-zinc-400 uppercase tracking-[0.15em] transition-colors"
                    >
                      Skip to Lead Corridor →
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      )}
    </AnimatePresence>
  )
}

