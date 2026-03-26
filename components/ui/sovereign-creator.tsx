'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, ChevronRight, ChevronLeft, Check, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSovereignGuard } from '@/components/ui/sovereign-guard'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SovereignCreatorStep {
  /** Label shown in the step indicator */
  label: string
  /** Optional icon component for the step indicator */
  icon?: React.ComponentType<{ className?: string }>
  /** The form content for this step */
  content: React.ReactNode
  /** Whether this step's data is complete (enables the Next button) */
  isValid: boolean
}

export interface SovereignCreatorProps {
  /** Whether the modal is open */
  open: boolean
  /** Called when the modal should close */
  onOpenChange: (open: boolean) => void
  /** Title shown in the header (e.g. "Norva Task Creator") */
  title: string
  /** Subtitle shown below the title */
  subtitle?: string
  /** The wizard steps */
  steps: SovereignCreatorStep[]
  /** Called when the user clicks the final action button */
  onSubmit: () => void | Promise<void>
  /** Whether submission is in progress */
  isSubmitting?: boolean
  /** Label for the final submit button (default: "Create") */
  submitLabel?: string
  /** Label for the submit button while loading (default: "Creating...") */
  submittingLabel?: string
  /** Whether to warn before discarding partially-filled forms */
  warnOnDiscard?: boolean
}

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

const slideVariants = {
  enterRight: { x: 80, opacity: 0 },
  enterLeft: { x: -80, opacity: 0 },
  center: { x: 0, opacity: 1 },
  exitLeft: { x: -80, opacity: 0 },
  exitRight: { x: 80, opacity: 0 },
}

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
}

const modalVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0 },
}

// ---------------------------------------------------------------------------
// Step Indicator
// ---------------------------------------------------------------------------

function CreatorStepIndicator({
  steps,
  currentStep,
}: {
  steps: SovereignCreatorStep[]
  currentStep: number
}) {
  return (
    <div className="flex items-center justify-center gap-3 pb-6">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-all duration-300',
                i < currentStep && 'border-emerald-500 bg-emerald-500 text-white',
                i === currentStep && 'border-emerald-500 bg-emerald-500/20 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.4)]',
                i > currentStep && 'border-gray-300 text-gray-400 dark:border-white/20 dark:text-white/30',
              )}
            >
              {i < currentStep ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span
              className={cn(
                'text-[10px] font-medium tracking-wide uppercase transition-colors',
                i <= currentStep ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-white/30',
              )}
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={cn(
                'mb-5 h-px w-12 transition-colors',
                i < currentStep ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-white/10',
              )}
            />
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function SovereignCreator({
  open,
  onOpenChange,
  title,
  subtitle,
  steps,
  onSubmit,
  isSubmitting = false,
  submitLabel = 'Create',
  submittingLabel = 'Creating...',
  warnOnDiscard = true,
}: SovereignCreatorProps) {
  const guard = useSovereignGuard()
  const [currentStep, setCurrentStep] = useState(0)
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward')

  const isLastStep = currentStep === steps.length - 1
  const isFirstStep = currentStep === 0
  const currentStepData = steps[currentStep]

  // Reset on open
  useEffect(() => {
    if (open) {
      setCurrentStep(0)
      setDirection('forward')
    }
  }, [open])

  // Navigation
  const goForward = useCallback(() => {
    if (isLastStep) return
    setDirection('forward')
    setCurrentStep((prev) => prev + 1)
  }, [isLastStep])

  const goBack = useCallback(() => {
    if (isFirstStep) return
    setDirection('backward')
    setCurrentStep((prev) => prev - 1)
  }, [isFirstStep])

  // Close guard
  const hasAnyData = useMemo(() => steps.some((s) => s.isValid), [steps])

  const handleClose = useCallback(async () => {
    if (warnOnDiscard && hasAnyData) {
      const keepBuilding = await guard.confirm({
        variant: 'discard',
        title: 'Hold on...',
        message: "You've started building this record. If you leave now, the Fortress will lose this progress. Should we stay and finish?",
        confirmLabel: 'Keep Building',
        cancelLabel: 'Discard Progress',
      })
      if (keepBuilding) return // User chose to stay
    }
    onOpenChange(false)
  }, [warnOnDiscard, hasAnyData, onOpenChange, guard])

  // Handle final submit
  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return
    await onSubmit()
  }, [isSubmitting, onSubmit])

  // Keyboard
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, handleClose])

  if (!open) return null

  const enterVariant = direction === 'forward' ? 'enterRight' : 'enterLeft'
  const exitVariant = direction === 'forward' ? 'exitLeft' : 'exitRight'

  return (
    <motion.div
      className="fixed inset-0 z-[9990] flex items-center justify-center"
      variants={backdropVariants}
      initial="hidden"
      animate="visible"
      exit="hidden"
      transition={{ duration: 0.25 }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 dark:bg-black/70 backdrop-blur-2xl"
        onClick={handleClose}
      />

      {/* Modal shell */}
      <motion.div
        className="relative z-10 mx-4 flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-zinc-950/95 shadow-2xl backdrop-blur-xl"
        variants={modalVariants}
        initial="hidden"
        animate="visible"
        exit="hidden"
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Identity Header ── */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-white/[0.06] px-8 pt-7 pb-0">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-xs text-gray-500 dark:text-white/40">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 dark:text-white/40 transition-colors hover:bg-gray-100 dark:hover:bg-white/[0.06] hover:text-gray-700 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Step Indicator ── */}
        {steps.length > 1 && (
          <div className="px-8 pt-6">
            <CreatorStepIndicator steps={steps} currentStep={currentStep} />
          </div>
        )}

        {/* ── Central Command (Form Content) ── */}
        <div className="relative min-h-[320px] max-h-[60vh] overflow-y-auto px-8 pb-6">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentStep}
              variants={slideVariants}
              initial={enterVariant}
              animate="center"
              exit={exitVariant}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              {currentStepData?.content}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── Sticky Sovereign Footer ── */}
        <div className="sticky bottom-0 z-10 flex items-center justify-between border-t border-gray-200 dark:border-white/[0.06] bg-white/95 dark:bg-zinc-950/95 backdrop-blur-lg px-8 py-5">
          <div>
            {!isFirstStep && (
              <button
                type="button"
                onClick={goBack}
                className="flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-white/[0.1] bg-gray-50 dark:bg-white/[0.04] px-4 py-2 text-xs font-medium text-gray-500 dark:text-white/60 transition-colors hover:bg-gray-100 dark:hover:bg-white/[0.08] hover:text-gray-700 dark:hover:text-white"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Back
              </button>
            )}
          </div>

          <div>
            {!isLastStep && (
              <button
                type="button"
                onClick={goForward}
                disabled={!currentStepData?.isValid}
                className={cn(
                  'flex items-center gap-1.5 rounded-xl px-5 py-2 text-xs font-semibold tracking-wide uppercase transition-all',
                  currentStepData?.isValid
                    ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40'
                    : 'cursor-not-allowed bg-gray-100 dark:bg-white/[0.06] text-gray-300 dark:text-white/20',
                )}
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}

            {isLastStep && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!currentStepData?.isValid || isSubmitting}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-6 py-2.5 text-xs font-bold uppercase tracking-widest transition-all',
                  currentStepData?.isValid && !isSubmitting
                    ? 'border-emerald-500/50 bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] hover:text-emerald-500 dark:hover:text-emerald-300'
                    : 'cursor-not-allowed border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-zinc-900 text-gray-300 dark:text-white/20',
                )}
              >
                {isSubmitting ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                    </motion.div>
                    {submittingLabel}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    {submitLabel}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
