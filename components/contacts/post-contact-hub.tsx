'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  UserCircle,
  Briefcase,
  CalendarPlus,
  StickyNote,
  ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog as DialogPrimitive } from 'radix-ui'

// ---------------------------------------------------------------------------
// PostContactHub — Sovereign Identity Switchboard
// ---------------------------------------------------------------------------
// Obsidian Glass overlay that appears after successful contact creation.
// Presents the "Golden Action" (Open New Matter) and secondary actions.
// Prevents dead storage — every contact enters with momentum.
// Uses Radix Portal at z-[9999] — nothing can cover these buttons.
// ---------------------------------------------------------------------------

export interface ContactPayload {
  contactId: string
  contactName: string
  email: string | null
  leadCreated: boolean
}

interface PostContactHubProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  payload: ContactPayload | null
}

export function PostContactHub({
  open,
  onOpenChange,
  payload,
}: PostContactHubProps) {
  const router = useRouter()

  const handleViewProfile = useCallback(() => {
    if (payload?.contactId) {
      onOpenChange(false)
      router.push(`/contacts/${payload.contactId}`)
    }
  }, [payload, onOpenChange, router])

  const handleOpenMatter = useCallback(() => {
    if (payload?.contactId) {
      onOpenChange(false)
      router.push(`/matters/new?contact=${payload.contactId}`)
    }
  }, [payload, onOpenChange, router])

  const handleBookConsultation = useCallback(() => {
    if (payload?.contactId) {
      onOpenChange(false)
      router.push(`/bookings?contact=${payload.contactId}&action=book`)
    }
  }, [payload, onOpenChange, router])

  const handleAddNote = useCallback(() => {
    if (payload?.contactId) {
      onOpenChange(false)
      router.push(`/contacts/${payload.contactId}?tab=interactions&action=note`)
    }
  }, [payload, onOpenChange, router])

  const handleSkip = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  if (!payload) return null

  return (
    <AnimatePresence>
      {open && (
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
          <DialogPrimitive.Portal>
            <style>{`
              @keyframes identityPulse {
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
                  {/* Indigo pulse line at top (contact = indigo, lead = emerald) */}
                  <div
                    className="h-[2px] rounded-t-xl mx-8"
                    style={{
                      background:
                        'linear-gradient(90deg, transparent 0%, #6366f1 30%, #818cf8 50%, #6366f1 70%, transparent 100%)',
                      animation: 'identityPulse 2.5s ease-in-out infinite',
                    }}
                  />

                  <div
                    className="rounded-xl border border-white/[0.08] p-8 shadow-2xl backdrop-blur-2xl"
                    style={{
                      background:
                        'linear-gradient(180deg, rgba(2,6,23,0.97) 0%, rgba(2,6,23,0.99) 100%)',
                      boxShadow:
                        '0 0 80px rgba(99,102,241,0.06), 0 25px 50px rgba(0,0,0,0.6)',
                    }}
                  >
                    {/* Status badge */}
                    <div className="flex items-center gap-2 mb-4">
                      <span className="relative flex size-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                        <span className="relative inline-flex rounded-full size-2 bg-indigo-500" />
                      </span>
                      <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-indigo-400">
                        Identity Registered
                      </span>
                    </div>

                    {/* Header */}
                    <h2 className="text-xl font-bold font-mono text-white tracking-tight mb-1">
                      {payload.contactName}
                    </h2>
                    <p className="text-sm font-mono text-zinc-400 mb-2">
                      {payload.email || 'No email provided'}
                    </p>

                    {/* Auto-lead badge */}
                    {payload.leadCreated && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-6">
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                        <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400">
                          Lead auto-created in pipeline
                        </span>
                      </div>
                    )}

                    <p className="text-sm font-mono text-zinc-500 mb-6">
                      Select next objective for this contact.
                    </p>

                    {/* Golden Action — Open New Matter */}
                    <Button
                      onClick={handleOpenMatter}
                      className="w-full h-14 mb-4 bg-indigo-600 hover:bg-indigo-500 text-white font-mono uppercase tracking-wider text-xs transition-all group relative overflow-hidden"
                      style={{
                        boxShadow:
                          '0 0 30px rgba(99,102,241,0.2), 0 4px 15px rgba(99,102,241,0.12)',
                      }}
                    >
                      <div className="flex items-center justify-center gap-3 relative z-10">
                        <Briefcase className="size-5" strokeWidth={1.5} />
                        <span>Open New Matter</span>
                        <ArrowRight className="size-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                      </div>
                      {/* Indigo shimmer on hover */}
                      <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-400/10 to-indigo-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                    </Button>

                    {/* Secondary Actions — 3-column grid */}
                    <div className="grid grid-cols-3 gap-3 mb-6">
                      <button
                        onClick={handleBookConsultation}
                        className="flex flex-col items-center gap-2 px-3 py-3.5 rounded-lg border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.10] transition-all group"
                      >
                        <CalendarPlus
                          className="size-4 text-zinc-500 group-hover:text-zinc-300 transition-colors"
                          strokeWidth={1.5}
                        />
                        <span className="text-[10px] font-mono text-zinc-400 group-hover:text-zinc-200 uppercase tracking-wider transition-colors text-center leading-tight">
                          Book Consultation
                        </span>
                      </button>

                      <button
                        onClick={handleAddNote}
                        className="flex flex-col items-center gap-2 px-3 py-3.5 rounded-lg border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.10] transition-all group"
                      >
                        <StickyNote
                          className="size-4 text-zinc-500 group-hover:text-zinc-300 transition-colors"
                          strokeWidth={1.5}
                        />
                        <span className="text-[10px] font-mono text-zinc-400 group-hover:text-zinc-200 uppercase tracking-wider transition-colors text-center leading-tight">
                          Add Note
                        </span>
                      </button>

                      <button
                        onClick={handleViewProfile}
                        className="flex flex-col items-center gap-2 px-3 py-3.5 rounded-lg border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.10] transition-all group"
                      >
                        <UserCircle
                          className="size-4 text-zinc-500 group-hover:text-zinc-300 transition-colors"
                          strokeWidth={1.5}
                        />
                        <span className="text-[10px] font-mono text-zinc-400 group-hover:text-zinc-200 uppercase tracking-wider transition-colors text-center leading-tight">
                          View Profile
                        </span>
                      </button>
                    </div>

                    {/* Safety Exit */}
                    <button
                      onClick={handleSkip}
                      className="w-full text-center py-2 text-[11px] font-mono text-zinc-600 hover:text-zinc-400 uppercase tracking-[0.15em] transition-colors"
                    >
                      Dismiss &mdash; Stay on Current Page &rarr;
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
