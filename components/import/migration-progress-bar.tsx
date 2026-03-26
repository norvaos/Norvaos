'use client'

/**
 * Migration Progress Bar — Clio-Escape Demo Widget (Directive 7.2)
 *
 * Dramatic real-time stats display for the onboarding demo.
 * Simulates a Clio → NorvaOS data migration with animated counters:
 *   "342 Passports Secured" · "89 Trust Balances Reconciled" · "12 Critical Deadlines Captured"
 *
 * Props:
 *   - demoMode: true = auto-simulate with fake data (default)
 *   - stats:    real stats from an actual import batch (overrides demo)
 *   - onComplete: callback when simulation finishes
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Progress } from '@/components/ui/progress'
import {
  Shield,
  Landmark,
  AlertTriangle,
  Users,
  FileText,
  FolderOpen,
  CheckCircle2,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'

// ── Types ────────────────────────────────────────────────────────────────────

export interface MigrationStat {
  key: string
  label: string
  target: number
  icon: React.ComponentType<{ className?: string }>
  colour: string
  suffix?: string
}

export interface MigrationProgressBarProps {
  /** Auto-simulate with demo data */
  demoMode?: boolean
  /** Override stats for real import */
  stats?: MigrationStat[]
  /** Overall progress 0-100 */
  progress?: number
  /** Phase label */
  phase?: string
  /** Callback when simulation is complete */
  onComplete?: () => void
}

// ── Animated Number Hook ─────────────────────────────────────────────────────

function useAnimatedNumber(target: number, durationMs = 1200) {
  const [current, setCurrent] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (target === 0) { setCurrent(0); return }
    const start = performance.now()
    const from = 0

    function tick(now: number) {
      const elapsed = now - start
      const progress = Math.min(elapsed / durationMs, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCurrent(Math.round(from + (target - from) * eased))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [target, durationMs])

  return current
}

// ── Demo Simulation Data ─────────────────────────────────────────────────────

const DEMO_STATS: MigrationStat[] = [
  { key: 'contacts', label: 'Contacts Imported', target: 1247, icon: Users, colour: 'text-blue-500' },
  { key: 'matters', label: 'Matters Migrated', target: 486, icon: FolderOpen, colour: 'text-indigo-500' },
  { key: 'passports', label: 'Passports Secured', target: 342, icon: Shield, colour: 'text-emerald-500' },
  { key: 'trust', label: 'Trust Balances Reconciled', target: 89, icon: Landmark, colour: 'text-amber-500', suffix: ' accounts' },
  { key: 'deadlines', label: 'Critical Deadlines Captured', target: 12, icon: AlertTriangle, colour: 'text-red-500' },
  { key: 'documents', label: 'Documents Indexed', target: 3891, icon: FileText, colour: 'text-purple-500' },
]

const DEMO_PHASES = [
  { label: 'Connecting to Clio...', duration: 1500 },
  { label: 'Extracting contacts & matters...', duration: 3000 },
  { label: 'Securing identity documents...', duration: 2500 },
  { label: 'Reconciling trust accounts...', duration: 2000 },
  { label: 'Capturing deadlines & expiries...', duration: 1500 },
  { label: 'Indexing documents...', duration: 2500 },
  { label: 'Finalising migration...', duration: 1000 },
]

// ── Stat Counter Card ────────────────────────────────────────────────────────

function StatCounter({
  stat,
  value,
  active,
}: {
  stat: MigrationStat
  value: number
  active: boolean
}) {
  const Icon = stat.icon

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border p-3 transition-all duration-500',
        active
          ? 'border-primary/30 bg-primary/5 shadow-sm'
          : value > 0
            ? 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-900/20'
            : 'border-muted bg-muted/30 opacity-50'
      )}
    >
      <div className={cn('shrink-0', stat.colour)}>
        <Icon className="size-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-2xl font-bold tabular-nums leading-none">
          {value.toLocaleString()}
          {stat.suffix && <span className="text-sm font-normal text-muted-foreground">{stat.suffix}</span>}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 truncate">{stat.label}</div>
      </div>
      {value >= stat.target && (
        <CheckCircle2 className="size-4 text-green-500 shrink-0 animate-in fade-in duration-500" />
      )}
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function MigrationProgressBar({
  demoMode = true,
  stats: externalStats,
  progress: externalProgress,
  phase: externalPhase,
  onComplete,
}: MigrationProgressBarProps) {
  const stats = externalStats ?? DEMO_STATS

  // ── Demo simulation state ──────────────────────────────────────────────
  const [demoProgress, setDemoProgress] = useState(0)
  const [demoPhase, setDemoPhase] = useState('')
  const [demoValues, setDemoValues] = useState<Record<string, number>>({})
  const [isComplete, setIsComplete] = useState(false)
  const [activeStatKey, setActiveStatKey] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runSimulation = useCallback(() => {
    let elapsed = 0
    const totalDuration = DEMO_PHASES.reduce((sum, p) => sum + p.duration, 0)

    // Tick through phases
    let phaseIndex = 0
    let phaseStart = 0

    function advancePhase() {
      if (phaseIndex >= DEMO_PHASES.length) {
        setDemoProgress(100)
        setDemoPhase('Migration complete!')
        setIsComplete(true)
        setActiveStatKey(null)
        onComplete?.()
        return
      }

      const currentPhase = DEMO_PHASES[phaseIndex]
      setDemoPhase(currentPhase.label)

      // Map phases to stat activations
      const statMapping: Record<number, string[]> = {
        0: [],
        1: ['contacts', 'matters'],
        2: ['passports'],
        3: ['trust'],
        4: ['deadlines'],
        5: ['documents'],
        6: [],
      }

      const activeStats = statMapping[phaseIndex] ?? []
      if (activeStats.length > 0) {
        setActiveStatKey(activeStats[0])
      }

      // Gradually increase stat values during this phase
      const tickInterval = 50
      const ticks = currentPhase.duration / tickInterval
      let tick = 0

      const interval = setInterval(() => {
        tick++
        const phasePct = tick / ticks

        // Update progress
        const phaseProgressStart = DEMO_PHASES.slice(0, phaseIndex).reduce((s, p) => s + p.duration, 0)
        const globalPct = ((phaseProgressStart + currentPhase.duration * phasePct) / totalDuration) * 100
        setDemoProgress(Math.min(Math.round(globalPct), 99))

        // Update stat values for active stats
        if (activeStats.length > 0) {
          setDemoValues((prev) => {
            const next = { ...prev }
            for (const key of activeStats) {
              const stat = DEMO_STATS.find((s) => s.key === key)
              if (stat) {
                next[key] = Math.round(stat.target * Math.min(phasePct * 1.1, 1))
              }
            }
            return next
          })
        }

        if (tick >= ticks) {
          clearInterval(interval)
          // Ensure final values are set
          setDemoValues((prev) => {
            const next = { ...prev }
            for (const key of activeStats) {
              const stat = DEMO_STATS.find((s) => s.key === key)
              if (stat) next[key] = stat.target
            }
            return next
          })
          phaseIndex++
          timerRef.current = setTimeout(advancePhase, 300)
        }
      }, tickInterval)
    }

    advancePhase()
  }, [onComplete])

  useEffect(() => {
    if (demoMode) {
      // Small delay before starting
      timerRef.current = setTimeout(runSimulation, 800)
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current)
      }
    }
  }, [demoMode, runSimulation])

  // ── Resolve values ─────────────────────────────────────────────────────
  const progress = demoMode ? demoProgress : (externalProgress ?? 0)
  const phase = demoMode ? demoPhase : (externalPhase ?? '')

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isComplete ? (
            <Sparkles className="size-5 text-yellow-500" />
          ) : (
            <Loader2 className="size-5 text-primary animate-spin" />
          )}
          <h3 className="font-semibold text-lg">
            {isComplete ? 'Migration Complete' : 'Migrating from Clio'}
          </h3>
        </div>
        {isComplete && (
          <Badge
            variant="outline"
            className="gap-1 border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-400"
          >
            <CheckCircle2 className="size-3" />
            All Data Secured
          </Badge>
        )}
      </div>

      {/* Phase label */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">{phase}</span>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <Progress
          value={progress}
          className={cn('h-2 transition-all duration-300', isComplete && '[&>div]:bg-green-500')}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{progress}%</span>
          {!isComplete && <span>Processing...</span>}
        </div>
      </div>

      {/* Stat counters grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {stats.map((stat) => {
          const value = demoMode ? (demoValues[stat.key] ?? 0) : stat.target
          return (
            <StatCounter
              key={stat.key}
              stat={stat}
              value={value}
              active={activeStatKey === stat.key}
            />
          )
        })}
      </div>

      {/* Completion celebration */}
      {isComplete && (
        <div className="rounded-lg border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 p-4 dark:border-green-800 dark:from-green-900/20 dark:to-emerald-900/20">
          <div className="flex items-start gap-3">
            <Shield className="size-5 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-green-800 dark:text-green-300">
                Your data is safe with Norva.
              </p>
              <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                All contacts, matters, trust balances, and deadlines have been securely migrated.
                Your practice is ready to go.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
