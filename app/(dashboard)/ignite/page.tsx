'use client'

/**
 * /ignite  -  The "Ignition" Ceremony
 * Session A: "Prestige" Architect
 *
 * This is not a form; it's a ritual.
 *   - Dark-mode, high-contrast screen
 *   - Norva Sovereign Terms in typewriter effect
 *   - "Ignite" button with "Liquid Progress" fill (3-second Intent-Lock)
 *   - 3D canvas confetti (Emerald, Gold, Silver) + haptic vibration on completion
 *   - SHA-256 signature hash written to firm_global_audit_ledger as Block 0
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import confetti from 'canvas-confetti'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { Shield, Sparkles, Loader2, CheckCircle2, Flame } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Constants ───────────────────────────────────────────────────────────────

const INTENT_LOCK_MS = 3000
const TOS_VERSION = '1.0.0'

const EMERALD_GREEN = '#50C878'
const SOVEREIGN_GOLD = '#D4AF37'
const SOVEREIGN_SILVER = '#C0C0C0'

// ── Typewriter Lines ────────────────────────────────────────────────────────

const MANIFESTO_LINES = [
  'The Fortress is standing.',
  'The Sentinel is awake.',
  'The Shield is raised.',
  '',
  'Every matter is sealed with SHA-256 mathematical finality.',
  'Every trust dollar is tracked on an immutable ledger.',
  'Every conflict is resolved before the first handshake.',
  '',
  'The Norva Sovereign Genesis Block cannot be altered,',
  'cannot be forged, cannot be denied.',
  '',
  'This is not software.',
  'This is a Digital Constitution.',
  '',
  'By igniting this Fortress, you accept the Norva Sovereign',
  'Terms of Service and bind your firm to the highest standard',
  'of compliance that technology can enforce.',
  '',
  'The math is perfect. The Shield is absolute.',
]

// ── SHA-256 Hash Generator ──────────────────────────────────────────────────

async function generateIgnitionHash(userId: string, timestamp: string): Promise<string> {
  const payload = `IGNITION:${userId}:${timestamp}:${TOS_VERSION}`
  const encoder = new TextEncoder()
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(payload))
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ── 3D Sovereign Confetti ───────────────────────────────────────────────────

function fireSovereignIgnitionConfetti() {
  const colours = [EMERALD_GREEN, SOVEREIGN_GOLD, SOVEREIGN_SILVER, '#22c55e', '#fbbf24', '#e5e7eb']

  // Wave 1: Left burst
  confetti({
    particleCount: 60,
    spread: 80,
    origin: { x: 0.2, y: 0.7 },
    colors: colours,
    gravity: 0.7,
    decay: 0.93,
    startVelocity: 30,
    ticks: 100,
    shapes: ['circle', 'square'],
  })

  // Wave 2: Right burst
  setTimeout(() => {
    confetti({
      particleCount: 60,
      spread: 80,
      origin: { x: 0.8, y: 0.7 },
      colors: colours,
      gravity: 0.7,
      decay: 0.93,
      startVelocity: 30,
      ticks: 100,
      shapes: ['circle', 'square'],
    })
  }, 150)

  // Wave 3: Centre starburst
  setTimeout(() => {
    confetti({
      particleCount: 100,
      spread: 360,
      origin: { x: 0.5, y: 0.5 },
      colors: colours,
      gravity: 0.5,
      decay: 0.9,
      startVelocity: 40,
      ticks: 120,
      shapes: ['star'],
      scalar: 1.3,
    })
  }, 400)

  // Wave 4: Rain of gold from top
  setTimeout(() => {
    confetti({
      particleCount: 80,
      spread: 180,
      origin: { x: 0.5, y: 0 },
      colors: [SOVEREIGN_GOLD, SOVEREIGN_SILVER, '#fbbf24'],
      gravity: 1.2,
      decay: 0.95,
      startVelocity: 15,
      ticks: 150,
      shapes: ['circle'],
      scalar: 0.8,
    })
  }, 700)

  // Haptic vibration (if supported)
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate([100, 50, 200, 50, 100])
  }
}

// ── Typewriter Hook ─────────────────────────────────────────────────────────

function useTypewriter(lines: string[], speed: number = 35) {
  const [displayedLines, setDisplayedLines] = useState<string[]>([])
  const [currentLine, setCurrentLine] = useState(0)
  const [currentChar, setCurrentChar] = useState(0)
  const [isComplete, setIsComplete] = useState(false)

  useEffect(() => {
    if (currentLine >= lines.length) {
      setIsComplete(true)
      return
    }

    const line = lines[currentLine]

    // Empty lines appear instantly
    if (line === '') {
      setDisplayedLines((prev) => [...prev, ''])
      setCurrentLine((prev) => prev + 1)
      setCurrentChar(0)
      return
    }

    if (currentChar >= line.length) {
      setDisplayedLines((prev) => [...prev, line])
      setCurrentLine((prev) => prev + 1)
      setCurrentChar(0)
      return
    }

    const timer = setTimeout(() => {
      setCurrentChar((prev) => prev + 1)
    }, speed)

    return () => clearTimeout(timer)
  }, [currentLine, currentChar, lines, speed])

  const partialLine = currentLine < lines.length
    ? lines[currentLine].slice(0, currentChar)
    : ''

  return { displayedLines, partialLine, isComplete }
}

// ── Check if already ignited ────────────────────────────────────────────────

function useIgnitionStatus(tenantId: string) {
  return useQuery({
    queryKey: ['ignition-status', tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await (supabase as any)
        .from('firm_global_audit_ledger')
        .select('id, details')
        .eq('tenant_id', tenantId)
        .eq('event_type', 'SOVEREIGN_IGNITION')
        .limit(1)
        .maybeSingle()

      return { ignited: !!data, hash: data?.details?.ignition_hash ?? null }
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 5,
  })
}

// ── Ignite Mutation ─────────────────────────────────────────────────────────

function useIgnite() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ tenantId }: { tenantId: string }) => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const timestamp = new Date().toISOString()
      const ignitionHash = await generateIgnitionHash(user.id, timestamp)

      const { error } = await (supabase as any)
        .from('firm_global_audit_ledger')
        .insert({
          tenant_id: tenantId,
          event_type: 'SOVEREIGN_IGNITION',
          severity: 'info',
          details: {
            ignition_hash: ignitionHash,
            ignited_by: user.id,
            ignited_at: timestamp,
            tos_version: TOS_VERSION,
            ceremony_complete: true,
            block_number: 0,
          },
        })

      if (error) throw error

      return { ignitionHash, timestamp }
    },
    onSuccess: (_data, variables) => {
      fireSovereignIgnitionConfetti()
      queryClient.invalidateQueries({ queryKey: ['ignition-status', variables.tenantId] })
    },
  })
}

// ── Liquid Progress Button ──────────────────────────────────────────────────

function LiquidIgniteButton({
  onComplete,
  disabled,
  isPending,
}: {
  onComplete: () => void
  disabled: boolean
  isPending: boolean
}) {
  const [holding, setHolding] = useState(false)
  const [progress, setProgress] = useState(0)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number>(0)

  const startHold = useCallback(() => {
    if (disabled || isPending) return
    setHolding(true)
    startTimeRef.current = Date.now()

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current
      const pct = Math.min((elapsed / INTENT_LOCK_MS) * 100, 100)
      setProgress(pct)

      if (pct >= 100) {
        if (intervalRef.current) clearInterval(intervalRef.current)
        setHolding(false)
        onComplete()
      }
    }, 16) // ~60fps
  }, [disabled, isPending, onComplete])

  const stopHold = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setHolding(false)
    setProgress(0)
  }, [])

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  return (
    <button
      type="button"
      onMouseDown={startHold}
      onMouseUp={stopHold}
      onMouseLeave={stopHold}
      onTouchStart={startHold}
      onTouchEnd={stopHold}
      disabled={disabled || isPending}
      className={cn(
        'relative overflow-hidden rounded-2xl px-12 py-5 text-lg font-bold tracking-wider uppercase transition-all duration-300',
        'border-2',
        disabled || isPending
          ? 'border-white/10 text-white/20 cursor-not-allowed'
          : holding
            ? 'border-amber-400/60 text-white scale-[0.98]'
            : 'border-emerald-500/30 text-white hover:border-emerald-500/50 hover:scale-[1.02]',
        'select-none',
      )}
    >
      {/* Liquid fill background */}
      <div
        className="absolute inset-0 transition-all duration-100"
        style={{
          background: holding
            ? `linear-gradient(90deg, rgba(80, 200, 120, 0.25) 0%, rgba(212, 175, 55, 0.35) ${progress}%, transparent ${progress}%)`
            : 'transparent',
        }}
      />

      {/* Shimmer on idle */}
      {!holding && !disabled && !isPending && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent animate-shimmer" />
      )}

      {/* Text */}
      <span className="relative z-10 flex items-center justify-center gap-3">
        {isPending ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Sealing...
          </>
        ) : holding ? (
          <>
            <Flame className="h-5 w-5 text-amber-400" />
            Hold to Ignite  -  {Math.round(progress)}%
          </>
        ) : (
          <>
            <Flame className="h-5 w-5" />
            Hold to Ignite the Fortress
          </>
        )}
      </span>
    </button>
  )
}

// ── Page Component ──────────────────────────────────────────────────────────

export default function IgnitePage() {
  const { tenant } = useTenant()
  const { fullName } = useUser()
  const tenantId = tenant?.id ?? ''

  const { data: status, isLoading: statusLoading } = useIgnitionStatus(tenantId)
  const igniteMutation = useIgnite()
  const { displayedLines, partialLine, isComplete } = useTypewriter(MANIFESTO_LINES, 30)

  const isIgnited = status?.ignited ?? false

  const handleIgnite = useCallback(() => {
    if (!tenantId || igniteMutation.isPending) return
    igniteMutation.mutate({ tenantId })
  }, [tenantId, igniteMutation])

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black overflow-hidden">
      {/* Subtle background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/20 via-transparent to-violet-950/20 pointer-events-none" />

      {/* Floating particles background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-emerald-500/5"
            style={{
              width: `${2 + Math.random() * 4}px`,
              height: `${2 + Math.random() * 4}px`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animation: `float-particle ${8 + Math.random() * 12}s ease-in-out infinite ${Math.random() * 5}s`,
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-2xl w-full px-6 text-center space-y-10">
        {/* Header */}
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Shield className="h-8 w-8 text-emerald-500/60" />
            <h1 className="text-2xl font-bold text-white/90 tracking-tight">
              Norva Sovereign Ignition
            </h1>
            <Shield className="h-8 w-8 text-emerald-500/60" />
          </div>
          <p className="text-xs text-white/30 uppercase tracking-[0.3em]">
            {tenant?.name ?? 'Fortress'} • {fullName}
          </p>
        </div>

        {/* Typewriter Manifesto */}
        <div className="text-left max-w-lg mx-auto space-y-0.5 min-h-[320px]">
          {displayedLines.map((line, idx) => (
            <p
              key={idx}
              className={cn(
                'font-mono text-sm leading-relaxed transition-opacity duration-300',
                line === ''
                  ? 'h-4' // spacer
                  : line.startsWith('This is not') || line.startsWith('This is a')
                    ? 'text-amber-400/90 font-bold'
                    : line.startsWith('The math')
                      ? 'text-emerald-400/90 font-bold'
                      : 'text-white/50',
              )}
            >
              {line}
            </p>
          ))}

          {/* Currently typing line */}
          {!isComplete && partialLine && (
            <p className="font-mono text-sm leading-relaxed text-white/70">
              {partialLine}
              <span className="inline-block w-0.5 h-4 bg-emerald-400 ml-0.5 animate-pulse" />
            </p>
          )}
        </div>

        {/* Ignite Button / Completion State */}
        {statusLoading ? (
          <Loader2 className="h-6 w-6 animate-spin text-white/20 mx-auto" />
        ) : isIgnited || igniteMutation.isSuccess ? (
          <div className="space-y-4 animate-in fade-in duration-1000">
            <div className="flex items-center justify-center gap-3">
              <Sparkles className="h-6 w-6 text-amber-400 animate-sovereign-sparkle" />
              <span className="text-lg font-bold text-emerald-400">
                The Fortress is Ignited
              </span>
              <Sparkles className="h-6 w-6 text-amber-400 animate-sovereign-sparkle" />
            </div>
            {(igniteMutation.data?.ignitionHash ?? status?.hash) && (
              <p className="text-[10px] font-mono text-white/20 break-all max-w-md mx-auto">
                Ignition Hash: {igniteMutation.data?.ignitionHash ?? status?.hash}
              </p>
            )}
            <CheckCircle2 className="h-10 w-10 text-emerald-500/40 mx-auto" />
          </div>
        ) : (
          <div className="space-y-3">
            <LiquidIgniteButton
              onComplete={handleIgnite}
              disabled={!isComplete}
              isPending={igniteMutation.isPending}
            />
            {!isComplete && (
              <p className="text-[10px] text-white/20">
                Read the manifesto to unlock the Ignition
              </p>
            )}
          </div>
        )}

        {/* Close / Return link */}
        <a
          href="/"
          className="inline-block text-xs text-white/20 hover:text-white/40 transition-colors mt-6"
        >
          Return to Dashboard
        </a>
      </div>
    </div>
  )
}
