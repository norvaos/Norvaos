'use client'

import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'

// ---------------------------------------------------------------------------
// QuickIntakeButton — The "Ignition Point" (Vision 2035)
// ---------------------------------------------------------------------------
// Fixed bottom-right, 24px from edges, z-50.
// Emerald Pulse breathing glow — the single most dominant action element.
// Clicking it navigates to the workspace for a new lead intake.
// ---------------------------------------------------------------------------

interface QuickIntakeButtonProps {
  /** Override click behaviour (e.g. open a modal instead of navigating) */
  onClick?: () => void
}

export function QuickIntakeButton({ onClick }: QuickIntakeButtonProps) {
  const router = useRouter()

  const handleClick = () => {
    if (onClick) {
      onClick()
    } else {
      router.push('/studio/workspace/new?splash=1')
    }
  }

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.5, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
      onClick={handleClick}
      className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center"
      style={{
        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      }}
      aria-label="Start new intake"
    >
      {/* Breathing Pulse Ring */}
      <motion.div
        className="absolute inset-0 rounded-full"
        animate={{
          boxShadow: [
            '0 4px 16px rgba(16, 185, 129, 0.3), 0 0 0px rgba(16, 185, 129, 0)',
            '0 8px 40px rgba(16, 185, 129, 0.5), 0 0 60px rgba(16, 185, 129, 0.15)',
            '0 4px 16px rgba(16, 185, 129, 0.3), 0 0 0px rgba(16, 185, 129, 0)',
          ],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />

      <Plus className="w-6 h-6 text-white relative z-10" strokeWidth={2.5} />
    </motion.button>
  )
}
