'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { SovereignStepper } from './sovereign-stepper'

interface SovereignIntakeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Optional override - if provided, called instead of router.push after intake completes */
  onComplete?: (contactId: string, leadId: string) => void
}

export function SovereignIntakeDialog({ open, onOpenChange, onComplete }: SovereignIntakeDialogProps) {
  const router = useRouter()
  const firstInputRef = useRef<HTMLDivElement>(null)

  // Focus trap: auto-focus the first input when child opens
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        const input = firstInputRef.current?.querySelector('input')
        input?.focus()
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [open])

  // Keyboard: Escape closes the child
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onOpenChange(false)
      }
    }
    window.addEventListener('keydown', onKeyDown, true) // capture phase
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, onOpenChange])

  // Render via portal at z-[9995] - above parent modal at z-[9990]
  const content = (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[9995] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          aria-modal="true"
          role="dialog"
        >
          {/* Backdrop - darker layer over the receded parent */}
          <motion.div
            className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Child modal shell - slides up from bottom */}
          <motion.div
            ref={firstInputRef}
            className="relative z-10 mx-4 flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-gray-200 dark:border-emerald-500/20 bg-white dark:bg-zinc-950/95 shadow-2xl max-h-[90vh]"
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.96 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-white/[0.06] px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white">
                  New Client Intake
                </h2>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-white/40">
                  Search for conflicts, create a contact and lead, then complete the compliance review.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 dark:text-white/40 transition-colors hover:bg-gray-100 dark:hover:bg-white/[0.06] hover:text-gray-700 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Stepper content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <SovereignStepper
                onComplete={(contactId, leadId) => {
                  onOpenChange(false)
                  if (onComplete) {
                    onComplete(contactId, leadId)
                  } else if (leadId) {
                    router.push(`/leads?command=${leadId}`)
                  } else {
                    router.push(`/contacts/${contactId}`)
                  }
                }}
                onCancel={() => onOpenChange(false)}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  // Portal to document.body to escape any parent overflow/z-index stacking context
  if (typeof document === 'undefined') return null
  return createPortal(content, document.body)
}
