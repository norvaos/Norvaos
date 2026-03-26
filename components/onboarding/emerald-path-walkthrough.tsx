'use client'

/**
 * Directive 044: Emerald Path Walkthrough
 *
 * A 3-step spotlight overlay that guides new users through the matter workspace.
 * Uses CSS mask-based spotlight (no external dependency) with emerald accent.
 *
 * Steps:
 *   1. Upload Zone  -  "Drop the Client's Passport here."
 *   2. Meeting Recorder  -  "Start your intake call here."
 *   3. Readiness Ring  -  "This is your Compliance Heartbeat."
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, Mic, Gauge, X, ArrowRight, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { EMERALD_PATH_STEPS, type WalkthroughStep } from '@/lib/services/onboarding-orchestrator'

// ── Types ────────────────────────────────────────────────────────────────────

interface EmeraldPathWalkthroughProps {
  onComplete: () => void
}

// ── Icon Map ─────────────────────────────────────────────────────────────────

const ICON_MAP = {
  upload: Upload,
  mic: Mic,
  gauge: Gauge,
} as const

// ── Component ────────────────────────────────────────────────────────────────

export function EmeraldPathWalkthrough({ onComplete }: EmeraldPathWalkthroughProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [visible, setVisible] = useState(false)

  const step = EMERALD_PATH_STEPS[currentStep]

  // Resolve target element position
  const updateTargetRect = useCallback(() => {
    if (!step) return
    const el = document.querySelector(step.target)
    if (el) {
      setTargetRect(el.getBoundingClientRect())
      setVisible(true)
    } else {
      // Target not found  -  skip to next or complete
      setVisible(false)
    }
  }, [step])

  useEffect(() => {
    // Small delay to let the DOM settle after navigation
    const timer = setTimeout(updateTargetRect, 500)
    window.addEventListener('resize', updateTargetRect)
    window.addEventListener('scroll', updateTargetRect, true)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', updateTargetRect)
      window.removeEventListener('scroll', updateTargetRect, true)
    }
  }, [updateTargetRect])

  const handleNext = useCallback(() => {
    if (currentStep < EMERALD_PATH_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1)
      setVisible(false)
    } else {
      onComplete()
    }
  }, [currentStep, onComplete])

  const handleSkip = useCallback(() => {
    onComplete()
  }, [onComplete])

  if (!step || !visible || !targetRect) return null

  const Icon = ICON_MAP[step.icon]
  const isLastStep = currentStep === EMERALD_PATH_STEPS.length - 1
  const padding = 12

  // Calculate tooltip position
  const tooltipStyle = getTooltipPosition(targetRect, step.placement, padding)

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* Backdrop with SVG mask for spotlight cutout */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
        <defs>
          <mask id="emerald-spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              x={targetRect.left - padding}
              y={targetRect.top - padding}
              width={targetRect.width + padding * 2}
              height={targetRect.height + padding * 2}
              rx="12"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.65)"
          mask="url(#emerald-spotlight-mask)"
        />
      </svg>

      {/* Emerald glow ring around target */}
      <div
        className="absolute rounded-xl ring-2 ring-emerald-400/60 animate-pulse pointer-events-none"
        style={{
          left: targetRect.left - padding,
          top: targetRect.top - padding,
          width: targetRect.width + padding * 2,
          height: targetRect.height + padding * 2,
        }}
      />

      {/* Tooltip card */}
      <div
        className={cn(
          'absolute z-10 w-[340px] p-5 rounded-2xl',
          'bg-black/80 backdrop-blur-3xl border border-emerald-500/30',
          'shadow-2xl shadow-emerald-900/20',
          'animate-in fade-in-0 slide-in-from-bottom-4 duration-300',
        )}
        style={tooltipStyle}
      >
        {/* Step indicator */}
        <div className="flex items-center gap-1.5 mb-3">
          {EMERALD_PATH_STEPS.map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i === currentStep
                  ? 'w-6 bg-emerald-400'
                  : i < currentStep
                    ? 'w-3 bg-emerald-600'
                    : 'w-3 bg-white/20',
              )}
            />
          ))}
        </div>

        {/* Icon + title */}
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-emerald-500/20 border border-emerald-500/30">
            <Icon className="h-4 w-4 text-emerald-400" />
          </div>
          <h3 className="text-sm font-semibold text-white">{step.title}</h3>
        </div>

        {/* Description */}
        <p className="text-xs text-white/70 leading-relaxed mb-4">
          {step.description}
        </p>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleSkip}
            className="text-[11px] text-white/40 hover:text-white/60 transition-colors"
          >
            Skip tour
          </button>
          <Button
            size="sm"
            onClick={handleNext}
            className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5"
          >
            {isLastStep ? (
              <>
                <CheckCircle2 className="h-3 w-3" />
                Got it
              </>
            ) : (
              <>
                Next
                <ArrowRight className="h-3 w-3" />
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Click-through layer  -  allows interaction with the spotlighted element */}
      <div
        className="absolute cursor-pointer"
        style={{
          left: targetRect.left - padding,
          top: targetRect.top - padding,
          width: targetRect.width + padding * 2,
          height: targetRect.height + padding * 2,
        }}
        onClick={handleNext}
      />

      {/* Skip button in corner */}
      <button
        onClick={handleSkip}
        className="absolute top-4 right-4 p-2 rounded-full bg-black/40 text-white/60 hover:text-white transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

// ── Tooltip Positioning ──────────────────────────────────────────────────────

function getTooltipPosition(
  rect: DOMRect,
  placement: WalkthroughStep['placement'],
  padding: number,
): React.CSSProperties {
  const tooltipWidth = 340
  const gap = 16

  switch (placement) {
    case 'right':
      return {
        left: rect.right + gap + padding,
        top: rect.top + rect.height / 2 - 80,
      }
    case 'left':
      return {
        left: rect.left - tooltipWidth - gap - padding,
        top: rect.top + rect.height / 2 - 80,
      }
    case 'bottom':
      return {
        left: rect.left + rect.width / 2 - tooltipWidth / 2,
        top: rect.bottom + gap + padding,
      }
    case 'top':
      return {
        left: rect.left + rect.width / 2 - tooltipWidth / 2,
        top: rect.top - 200 - gap - padding,
      }
  }
}

// ── Genesis Toast ────────────────────────────────────────────────────────────
// The "Genesis Sealed" toast shown before the walkthrough begins.

export function GenesisToast({ onStart }: { onStart: () => void }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9998] animate-in fade-in-0 slide-in-from-bottom-6 duration-500">
      <div
        className={cn(
          'flex items-center gap-4 px-6 py-4 rounded-2xl',
          'bg-black/70 backdrop-blur-3xl border border-emerald-500/30',
          'shadow-2xl shadow-emerald-900/30',
        )}
      >
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-white">Genesis Sealed.</p>
          <p className="text-xs text-white/60">
            I&apos;ve mapped the Emerald Path for this matter. Ready to begin?
          </p>
        </div>
        <Button
          size="sm"
          onClick={onStart}
          className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs ml-2"
        >
          Start Tour
        </Button>
      </div>
    </div>
  )
}
