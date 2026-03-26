"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import confetti from "canvas-confetti"
import { ArrowRight } from "lucide-react"

interface InitiationSuccessProps {
  matterTitle: string
  matterNumber: string
  clientName: string
  onComplete: () => void
}

function generateFakeHash(): string {
  const chars = "0123456789abcdef"
  let hash = ""
  for (let i = 0; i < 64; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)]
  }
  return hash
}

export function InitiationSuccess({
  matterTitle,
  matterNumber,
  clientName,
  onComplete,
}: InitiationSuccessProps) {
  const [phase, setPhase] = useState(0)
  const [typedHash, setTypedHash] = useState("")
  const hashRef = useRef(generateFakeHash())
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasCompletedRef = useRef(false)

  const handleComplete = useCallback(() => {
    if (hasCompletedRef.current) return
    hasCompletedRef.current = true
    if (autoDismissRef.current) clearTimeout(autoDismissRef.current)
    onComplete()
  }, [onComplete])

  // Phase sequencing
  useEffect(() => {
    // Phase 1 - The Weld (0ms)
    setPhase(1)
    navigator.vibrate?.([100, 50, 100])

    // Phase 2 - The Bloom (400ms)
    const t2 = setTimeout(() => setPhase(2), 400)

    // Phase 3 - Genesis Block Reveal (1200ms)
    const t3 = setTimeout(() => setPhase(3), 1200)

    return () => {
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [])

  // Confetti bursts during Phase 2
  useEffect(() => {
    if (phase < 2) return

    // Burst 1 - Emerald from left
    confetti({
      particleCount: 40,
      colors: ["#10b981", "#059669"],
      spread: 60,
      origin: { x: 0.2, y: 0.5 },
      gravity: 0.8,
      ticks: 120,
    })

    // Burst 2 - Gold from right
    setTimeout(() => {
      confetti({
        particleCount: 20,
        colors: ["#f59e0b", "#fbbf24"],
        spread: 60,
        origin: { x: 0.8, y: 0.5 },
        gravity: 0.8,
        ticks: 120,
      })
    }, 150)

    // Burst 3 - Centre starburst
    setTimeout(() => {
      confetti({
        particleCount: 30,
        shapes: ["star"],
        colors: ["#10b981", "#fbbf24", "#ffffff"],
        spread: 360,
        origin: { x: 0.5, y: 0.45 },
        startVelocity: 25,
        gravity: 0.6,
        ticks: 150,
      })
    }, 300)
  }, [phase])

  // SHA-256 hash typing effect during Phase 3
  useEffect(() => {
    if (phase < 3) return
    const full = hashRef.current
    let idx = 0
    const interval = setInterval(() => {
      idx++
      setTypedHash(full.slice(0, idx))
      if (idx >= full.length) clearInterval(interval)
    }, 18)
    return () => clearInterval(interval)
  }, [phase])

  // Auto-dismiss 5s after Phase 3 appears
  useEffect(() => {
    if (phase < 3) return
    autoDismissRef.current = setTimeout(handleComplete, 5000)
    return () => {
      if (autoDismissRef.current) clearTimeout(autoDismissRef.current)
    }
  }, [phase, handleComplete])

  // Truncated display hash
  const displayHash =
    typedHash.length > 16
      ? `${typedHash.slice(0, 8)}...${typedHash.slice(-8)}`
      : typedHash

  return (
    <motion.div
      className="fixed inset-0 z-[9995] flex items-center justify-center overflow-hidden"
      initial={{ backgroundColor: "rgba(0, 10, 5, 1)" }}
      animate={{
        backgroundColor:
          phase >= 2 ? "rgba(0, 10, 5, 0.3)" : "rgba(0, 10, 5, 1)",
      }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    >
      {/* Phase 1 - The Weld: emerald dot */}
      <AnimatePresence>
        {phase >= 1 && phase < 3 && (
          <motion.div
            className="absolute w-4 h-4 rounded-full bg-emerald-500"
            initial={{ scale: 0, opacity: 1 }}
            animate={
              phase === 1
                ? { scale: 1, opacity: 1 }
                : { scale: 20, opacity: 0 }
            }
            exit={{ opacity: 0 }}
            transition={
              phase === 1
                ? { type: "spring", stiffness: 300, damping: 15 }
                : { duration: 0.8, ease: "easeOut" }
            }
          />
        )}
      </AnimatePresence>

      {/* Phase 3 - Genesis Block card */}
      <AnimatePresence>
        {phase >= 3 && (
          <motion.div
            className="relative z-10 w-full max-w-md mx-4"
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="rounded-2xl border border-emerald-500/20 bg-white/5 backdrop-blur-xl shadow-2xl shadow-emerald-900/30 p-8">
              {/* Genesis Sealed badge */}
              <div className="flex items-center justify-center mb-6">
                <motion.div
                  className="px-4 py-1.5 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-500 text-xs font-semibold uppercase tracking-widest text-white"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2, duration: 0.4 }}
                >
                  Genesis Sealed
                </motion.div>
              </div>

              {/* Matter title */}
              <motion.h2
                className="text-2xl font-bold text-white text-center mb-2 leading-tight"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.35, duration: 0.5 }}
              >
                {matterTitle}
              </motion.h2>

              {/* Client name */}
              <motion.p
                className="text-emerald-400/70 text-center text-sm mb-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.45, duration: 0.5 }}
              >
                {clientName}
              </motion.p>

              {/* Matter number */}
              <motion.div
                className="flex items-center justify-center gap-2 mb-5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.55, duration: 0.5 }}
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="font-mono text-sm text-emerald-300 tracking-wide">
                  {matterNumber}
                </span>
              </motion.div>

              {/* Rotating cube + SHA hash */}
              <motion.div
                className="flex items-center justify-center gap-3 mb-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.65, duration: 0.5 }}
              >
                <motion.div
                  className="w-4 h-4 border border-emerald-500/60 rounded-sm"
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 4,
                    ease: "linear",
                    repeat: Infinity,
                  }}
                />
                <span className="font-mono text-[11px] text-white/40 truncate max-w-[280px]">
                  SHA-256: {displayHash}
                </span>
              </motion.div>

              {/* Divider */}
              <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent mb-6" />

              {/* Enter Workspace button */}
              <motion.button
                onClick={handleComplete}
                className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-sm font-semibold tracking-wide cursor-pointer transition-all hover:from-emerald-500 hover:to-emerald-400 hover:shadow-lg hover:shadow-emerald-500/25 active:scale-[0.98]"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8, duration: 0.5 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Enter Workspace
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
