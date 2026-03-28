'use client'

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, ArrowLeft, Upload, Mic, Shield, BarChart3, Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Slide definitions
// ---------------------------------------------------------------------------

interface Slide {
  title: string
  subtitle: string
  body: string
  icon: typeof Upload
  gradient: string
  accentColor: string
}

const SLIDES: Slide[] = [
  {
    title: 'Welcome to Norva',
    subtitle: 'Your Sovereign Legal OS',
    body: 'Norva is your firm\'s command centre  -  cases, documents, billing, and client communication, all in one place. Let\'s take a quick tour.',
    icon: Sparkles,
    gradient: 'from-emerald-600/30 to-emerald-400/10',
    accentColor: 'emerald',
  },
  {
    title: 'The Upload Zone',
    subtitle: 'Documents, Sorted Automatically',
    body: 'Drag and drop any file into a case. Norva\'s Auto-Filer names it, sorts it into the right folder, and tracks it against the document checklist  -  so nothing gets lost.',
    icon: Upload,
    gradient: 'from-blue-600/30 to-blue-400/10',
    accentColor: 'blue',
  },
  {
    title: 'The Meeting Recorder',
    subtitle: 'Whisper Captures Every Word',
    body: 'Hit record during a client call. Norva transcribes the conversation, extracts action items, and files the summary directly into the case  -  hands-free.',
    icon: Mic,
    gradient: 'from-violet-600/30 to-violet-400/10',
    accentColor: 'violet',
  },
  {
    title: 'The Fortress',
    subtitle: 'Your Client Portal',
    body: 'Each client gets a branded portal where they upload documents, fill questionnaires, pay invoices, and track progress  -  without calling your office.',
    icon: Shield,
    gradient: 'from-amber-600/30 to-amber-400/10',
    accentColor: 'amber',
  },
  {
    title: 'The Dashboard',
    subtitle: 'See Everything at a Glance',
    body: 'Your dashboard shows case velocity, upcoming deadlines, revenue metrics, and stagnation alerts  -  so you always know where to focus.',
    icon: BarChart3,
    gradient: 'from-rose-600/30 to-rose-400/10',
    accentColor: 'rose',
  },
]

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
}

const slideVariants = {
  enterRight: { x: 100, opacity: 0 },
  enterLeft: { x: -100, opacity: 0 },
  center: { x: 0, opacity: 1 },
  exitLeft: { x: -100, opacity: 0 },
  exitRight: { x: 100, opacity: 0 },
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SovereignWalkthroughProps {
  open: boolean
  onComplete: () => void
}

export function SovereignWalkthrough({ open, onComplete }: SovereignWalkthroughProps) {
  const [current, setCurrent] = useState(0)
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward')

  const isLast = current === SLIDES.length - 1
  const isFirst = current === 0

  const goNext = useCallback(() => {
    if (isLast) {
      onComplete()
      return
    }
    setDirection('forward')
    setCurrent((c) => c + 1)
  }, [isLast, onComplete])

  const goBack = useCallback(() => {
    if (isFirst) return
    setDirection('backward')
    setCurrent((c) => c - 1)
  }, [isFirst])

  // Keyboard navigation
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'Enter') goNext()
      if (e.key === 'ArrowLeft') goBack()
      if (e.key === 'Escape') onComplete()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, goNext, goBack, onComplete])

  // Reset on open
  useEffect(() => {
    if (open) {
      setCurrent(0)
      setDirection('forward')
    }
  }, [open])

  if (!open) return null

  const slide = SLIDES[current]
  const SlideIcon = slide.icon
  const enterVariant = direction === 'forward' ? 'enterRight' : 'enterLeft'
  const exitVariant = direction === 'forward' ? 'exitLeft' : 'exitRight'

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      variants={backdropVariants}
      initial="hidden"
      animate="visible"
      exit="hidden"
      transition={{ duration: 0.3 }}
    >
      {/* Full-screen blur backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-xl" />

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 30 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 mx-4 flex w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-border bg-background/95 shadow-2xl backdrop-blur-xl"
      >
        {/* Skip button */}
        <button
          type="button"
          onClick={onComplete}
          className="absolute right-4 top-4 z-20 rounded-full px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Skip Tour
        </button>

        {/* Icon hero area */}
        <div className={cn('flex items-center justify-center py-12 bg-gradient-to-b', slide.gradient)}>
          <motion.div
            key={current}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-background/50 backdrop-blur-lg"
          >
            <SlideIcon className="h-10 w-10 text-foreground/80" />
          </motion.div>
        </div>

        {/* Slide content */}
        <div className="relative min-h-[180px] px-8 pt-6 pb-4">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={current}
              variants={slideVariants}
              initial={enterVariant}
              animate="center"
              exit={exitVariant}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-emerald-500">
                {slide.subtitle}
              </p>
              <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-foreground">
                {slide.title}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {slide.body}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer: dots + navigation */}
        <div className="flex items-center justify-between px-8 pb-7 pt-2">
          {/* Dot indicators */}
          <div className="flex gap-1.5">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setDirection(i > current ? 'forward' : 'backward')
                  setCurrent(i)
                }}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300',
                  i === current
                    ? 'w-6 bg-emerald-500'
                    : 'w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50',
                )}
              />
            ))}
          </div>

          {/* Nav buttons */}
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                type="button"
                onClick={goBack}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}

            <button
              type="button"
              onClick={goNext}
              className={cn(
                'flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-semibold uppercase tracking-wide transition-all',
                isLast
                  ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40'
                  : 'bg-muted text-foreground/80 hover:bg-muted/80 hover:text-foreground',
              )}
            >
              {isLast ? (
                <>
                  Get Started
                  <Sparkles className="h-3.5 w-3.5" />
                </>
              ) : (
                <>
                  Next
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
