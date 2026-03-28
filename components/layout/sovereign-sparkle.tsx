'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SovereignSparkleProps {
  firmName?: string
  onDismiss: () => void
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  colour: string
  alpha: number
  decay: number
}

const EMERALD = '#10b981'
const GOLD = '#f59e0b'
const PARTICLE_COUNT = 120
const AUTO_DISMISS_MS = 8000

export function SovereignSparkle({ firmName, onDismiss }: SovereignSparkleProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [showText, setShowText] = useState(false)
  const particlesRef = useRef<Particle[]>([])
  const animFrameRef = useRef<number>(0)

  const createParticle = useCallback((width: number, height: number): Particle => {
    const isEmerald = Math.random() > 0.4
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2 - 0.5,
      radius: Math.random() * 3 + 1,
      colour: isEmerald ? EMERALD : GOLD,
      alpha: Math.random() * 0.8 + 0.2,
      decay: Math.random() * 0.003 + 0.001,
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // Initialize particles
    particlesRef.current = Array.from({ length: PARTICLE_COUNT }, () =>
      createParticle(canvas.width, canvas.height)
    )

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (const p of particlesRef.current) {
        p.x += p.vx
        p.y += p.vy
        p.alpha -= p.decay

        if (p.alpha <= 0) {
          Object.assign(p, createParticle(canvas.width, canvas.height))
        }

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fillStyle = p.colour
        ctx.globalAlpha = p.alpha
        ctx.fill()

        // Glow effect
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius * 3, 0, Math.PI * 2)
        ctx.fillStyle = p.colour
        ctx.globalAlpha = p.alpha * 0.15
        ctx.fill()
      }
      ctx.globalAlpha = 1

      animFrameRef.current = requestAnimationFrame(animate)
    }

    animate()

    // Show text after 1 second
    const textTimer = setTimeout(() => setShowText(true), 1000)

    // Auto-dismiss after 8 seconds
    const dismissTimer = setTimeout(onDismiss, AUTO_DISMISS_MS)

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animFrameRef.current)
      clearTimeout(textTimer)
      clearTimeout(dismissTimer)
    }
  }, [createParticle, onDismiss])

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center cursor-pointer"
      onClick={onDismiss}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Escape' && onDismiss()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-xl" />

      {/* Canvas for particles */}
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* Central message */}
      <div
        className={cn(
          'relative z-10 max-w-lg text-center px-8 py-10 rounded-2xl bg-background/90 backdrop-blur-xl border border-border shadow-2xl transition-all duration-1000',
          showText ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4',
        )}
      >
        <div className="flex justify-center mb-6">
          <div className="rounded-full bg-emerald-500/20 p-4 ring-2 ring-emerald-500/40">
            <ShieldCheck className="h-12 w-12 text-emerald-500" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-foreground mb-2">
          Sovereign Fortress Active
        </h1>

        {firmName && (
          <p className="text-amber-500 font-medium text-sm mb-4">
            {firmName}
          </p>
        )}

        <p className="text-muted-foreground text-sm leading-relaxed">
          Your firm is now protected by NorvaOS Integrity. All matters are sealed,
          all ledgers are hashed, and your compliance is mathematically guaranteed.
        </p>

        <p className="mt-6 text-xs text-muted-foreground/60">
          Click anywhere to continue
        </p>
      </div>
    </div>
  )
}
