'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface SovereignConfettiProps {
  trigger: boolean
  duration?: number // ms, default 3000
}

export function SovereignConfetti({ trigger, duration = 3000 }: SovereignConfettiProps) {
  const [particles, setParticles] = useState<Array<{
    id: number
    left: number    // 0-100 %
    delay: number   // 0-500 ms
    color: string
    size: number    // 4-10 px
    rotation: number // 0-360 deg
  }>>([])
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!trigger) return
    // Generate particles
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4']
    const newParticles = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 500,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 4 + Math.random() * 6,
      rotation: Math.random() * 360,
    }))
    setParticles(newParticles)
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), duration)
    return () => clearTimeout(timer)
  }, [trigger, duration])

  if (!visible) return null

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute animate-confetti-fall"
          style={{
            left: `${p.left}%`,
            top: '-10px',
            width: `${p.size}px`,
            height: `${p.size * 0.6}px`,
            backgroundColor: p.color,
            borderRadius: '2px',
            transform: `rotate(${p.rotation}deg)`,
            animationDelay: `${p.delay}ms`,
            animationDuration: `${1500 + Math.random() * 1500}ms`,
          }}
        />
      ))}
      {/* Add the keyframes via a style tag */}
      <style jsx>{`
        @keyframes confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        .animate-confetti-fall {
          animation: confetti-fall linear forwards;
        }
      `}</style>
    </div>
  )
}
