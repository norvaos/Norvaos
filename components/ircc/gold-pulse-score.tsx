'use client'

/**
 * GoldPulseScore — Directive 8.2: Audit-Mirror Gold Pulse
 *
 * When a lawyer fixes an error and the readability/completeness score
 * improves, the score "Pulses Gold" with animation and displays:
 * "Filing Optimised for Rapid Triage."
 *
 * Zero-dependency animation: CSS keyframes only (0ms TBT).
 */

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

interface GoldPulseScoreProps {
  /** Current completion percentage (0–100) */
  score: number
  /** Total checks passed */
  passed: number
  /** Total checks */
  total: number
  /** Additional class names */
  className?: string
}

// ── Component ────────────────────────────────────────────────────────────────

export function GoldPulseScore({ score, passed, total, className }: GoldPulseScoreProps) {
  const prevScoreRef = useRef(score)
  const [isPulsing, setIsPulsing] = useState(false)
  const [showOptimised, setShowOptimised] = useState(false)
  const [deltaDisplay, setDeltaDisplay] = useState<number | null>(null)

  useEffect(() => {
    const prev = prevScoreRef.current
    prevScoreRef.current = score

    // Only pulse when score improves (not on initial mount)
    if (score > prev && prev > 0) {
      const delta = score - prev
      setDeltaDisplay(delta)
      setIsPulsing(true)
      setShowOptimised(true)

      // End pulse animation after 2s
      const pulseTimer = setTimeout(() => {
        setIsPulsing(false)
        setDeltaDisplay(null)
      }, 2000)

      // Hide "optimised" message after 4s
      const msgTimer = setTimeout(() => {
        setShowOptimised(false)
      }, 4000)

      return () => {
        clearTimeout(pulseTimer)
        clearTimeout(msgTimer)
      }
    }
  }, [score])

  const isComplete = score === 100
  const barColor = isComplete ? 'bg-green-500' : score >= 60 ? 'bg-amber-500' : 'bg-red-500'

  return (
    <div className={cn('px-3 py-1.5 border-b shrink-0', className)}>
      {/* Label row */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-muted-foreground">Filing readiness</span>
        <span className="text-[10px] font-medium">{passed}/{total} checks</span>
      </div>

      {/* Progress bar with gold pulse */}
      <div className="relative">
        <div className={cn(
          'h-1.5 w-full rounded-full overflow-hidden transition-all',
          isPulsing ? 'bg-amber-100' : 'bg-muted'
        )}>
          <div
            className={cn(
              'h-full rounded-full transition-all duration-700',
              isPulsing ? 'gold-pulse-bar' : barColor,
            )}
            style={{ width: `${score}%` }}
          />
        </div>

        {/* Delta badge — floats above bar on improvement */}
        {deltaDisplay !== null && (
          <span className="absolute -top-4 right-0 text-[10px] font-bold text-amber-600 gold-pulse-float">
            +{deltaDisplay}%
          </span>
        )}
      </div>

      {/* Score display with pulse ring */}
      <div className="flex items-center justify-between mt-1.5">
        <div className="flex items-center gap-1.5">
          <span className={cn(
            'relative inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all duration-300',
            isPulsing
              ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white gold-pulse-ring'
              : isComplete
                ? 'bg-green-100 text-green-700'
                : score >= 60
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-red-50 text-red-700'
          )}>
            {score}
          </span>

          {/* Optimised message */}
          {showOptimised && (
            <span className="text-[10px] font-semibold text-amber-600 gold-pulse-fade-in">
              Filing Optimised for Rapid Triage
            </span>
          )}

          {isComplete && !showOptimised && (
            <span className="text-[10px] font-medium text-green-600">
              All checks passed
            </span>
          )}
        </div>
      </div>

      {/* Inline CSS keyframes — zero-dependency */}
      <style jsx>{`
        .gold-pulse-bar {
          background: linear-gradient(90deg, #d4a843, #f5d98a, #d4a843);
          background-size: 200% 100%;
          animation: goldShimmer 1.5s ease-in-out;
        }
        .gold-pulse-ring {
          animation: goldRing 1.5s ease-out;
          box-shadow: 0 0 0 0 rgba(212, 168, 67, 0.4);
        }
        .gold-pulse-float {
          animation: floatUp 1.5s ease-out forwards;
        }
        .gold-pulse-fade-in {
          animation: fadeSlideIn 0.4s ease-out;
        }

        @keyframes goldShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes goldRing {
          0% { box-shadow: 0 0 0 0 rgba(212, 168, 67, 0.6); }
          50% { box-shadow: 0 0 0 6px rgba(212, 168, 67, 0.2); }
          100% { box-shadow: 0 0 0 10px rgba(212, 168, 67, 0); }
        }
        @keyframes floatUp {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-12px); }
        }
        @keyframes fadeSlideIn {
          0% { opacity: 0; transform: translateX(-4px); }
          100% { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}
