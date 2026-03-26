'use client'

/**
 * PortalReadinessRing  -  "The Mirror"
 *
 * Circular SVG ring showing the client's overall readiness score (0–100).
 * Psychology: When the ring is at 65%, the client feels a natural urge to
 * push it to 100. The emerald glow reward loop drives self-service.
 *
 * Colour progression:
 *   0–33%  → Red (critical)
 *  34–66%  → Amber (in-progress)
 *  67–99%  → Emerald (almost there)
 *    100%  → Full emerald glow + pulse animation
 */

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface PortalReadinessRingProps {
  /** Overall readiness score 0–100 */
  score: number
  /** Firm's primary brand colour (used for the 100% glow) */
  accentColor?: string
  /** Size in pixels */
  size?: number
  /** Label below the number */
  label?: string
  /** Breakdown items to show below ring */
  breakdown?: Array<{
    label: string
    value: number
    max: number
    colour?: string
  }>
}

function getScoreColour(score: number): string {
  if (score >= 67) return '#10b981' // emerald-500
  if (score >= 34) return '#f59e0b' // amber-500
  return '#ef4444' // red-500
}

function getScoreLabel(score: number): string {
  if (score >= 100) return 'Ready to Submit'
  if (score >= 80) return 'Almost There'
  if (score >= 50) return 'Making Progress'
  if (score >= 20) return 'Getting Started'
  return 'Action Needed'
}

export function PortalReadinessRing({
  score,
  accentColor,
  size = 180,
  label,
  breakdown,
}: PortalReadinessRingProps) {
  const [animatedScore, setAnimatedScore] = useState(0)

  // Animate score from 0 to target on mount
  useEffect(() => {
    const duration = 1200
    const startTime = performance.now()
    const target = Math.min(score, 100)

    function animate(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setAnimatedScore(Math.round(target * eased))
      if (progress < 1) requestAnimationFrame(animate)
    }

    requestAnimationFrame(animate)
  }, [score])

  const strokeWidth = 10
  const radius = (size - strokeWidth * 2) / 2
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (animatedScore / 100) * circumference
  const colour = accentColor && score >= 100 ? accentColor : getScoreColour(animatedScore)
  const isComplete = score >= 100

  return (
    <div className="flex flex-col items-center">
      {/* Ring */}
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="-rotate-90"
          style={{
            filter: isComplete ? `drop-shadow(0 0 12px ${colour}60)` : undefined,
          }}
        >
          {/* Background track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={strokeWidth}
            opacity={0.3}
          />
          {/* Progress arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={colour}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
            style={{
              filter: `drop-shadow(0 0 6px ${colour}40)`,
            }}
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              'font-bold leading-none transition-colors',
              isComplete && 'animate-pulse',
            )}
            style={{
              fontSize: size * 0.22,
              color: colour,
            }}
          >
            {animatedScore}%
          </span>
          <span
            className="text-slate-500 font-medium mt-1"
            style={{ fontSize: Math.max(size * 0.065, 10) }}
          >
            {label ?? getScoreLabel(score)}
          </span>
        </div>
      </div>

      {/* Breakdown bars */}
      {breakdown && breakdown.length > 0 && (
        <div className="w-full mt-4 space-y-2 max-w-[260px]">
          {breakdown.map((item) => {
            const pct = item.max > 0 ? Math.round((item.value / item.max) * 100) : 0
            const barColour = item.colour ?? getScoreColour(pct)
            return (
              <div key={item.label}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs text-slate-600">{item.label}</span>
                  <span className="text-xs font-semibold" style={{ color: barColour }}>
                    {item.value}/{item.max}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: barColour,
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
