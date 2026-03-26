'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Guardian Lexicon  -  help text for every field in the initiation modal
// ---------------------------------------------------------------------------

export const GUARDIAN_HELP_TEXT = {
  contact:
    'This is the person (or organisation) the case is about. Start typing their name  -  if they\'re already in the system, they\'ll appear automatically.',
  caseTitle:
    'A short name for this case. Usually the client\'s last name followed by a dash and the case type. Example: "Khan  -  Spousal Sponsorship".',
  practiceArea:
    'Pick the area of law this case falls under. This determines which case types and deadlines are available.',
  matterType:
    'The specific type of case within the practice area. This sets up the right document checklist and workflow stages.',
  billingType:
    'How you\'ll charge the client. Flat Fee = one fixed price. Hourly = bill by the hour. Retainer = upfront deposit drawn down over time.',
  feeAmount:
    'Enter the dollar amount for this billing arrangement. You can always change this later in the case settings.',
  responsibleLawyer:
    'The lawyer who owns this case. They\'ll see it on their dashboard and receive all notifications. You can add more team members later.',
  summary:
    'Review everything before you create the case. Once initiated, the case will appear on your dashboard and the client portal.',
} as const

// ---------------------------------------------------------------------------
// Tooltip component
// ---------------------------------------------------------------------------

interface NorvaGuardianTooltipProps {
  fieldKey: keyof typeof GUARDIAN_HELP_TEXT
  /** Optional custom text (overrides GUARDIAN_HELP_TEXT lookup) */
  text?: string
  className?: string
  iconClassName?: string
}

export function NorvaGuardianTooltip({ fieldKey, text, className, iconClassName }: NorvaGuardianTooltipProps) {
  const [open, setOpen] = useState(false)
  const content = text ?? GUARDIAN_HELP_TEXT[fieldKey]

  return (
    <span className={cn('relative inline-flex items-center', className)}>
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault()
          setOpen((v) => !v)
        }}
        className={cn(
          'ml-1.5 inline-flex items-center justify-center rounded-full text-gray-400 dark:text-white/30 transition-colors hover:text-emerald-500 dark:hover:text-emerald-400 focus:outline-none',
          iconClassName,
        )}
        aria-label="Help"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 w-64 rounded-xl border border-gray-200 dark:border-emerald-500/20 bg-white dark:bg-zinc-900 px-3.5 py-2.5 text-[11px] leading-relaxed text-gray-700 dark:text-white/80 shadow-lg dark:shadow-xl"
          >
            {content}
            {/* Caret */}
            <div className="absolute left-1/2 top-full -translate-x-1/2 h-0 w-0 border-x-[6px] border-t-[6px] border-x-transparent border-t-white dark:border-t-zinc-900" />
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  )
}
