'use client'

import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

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
  conflictSearch:
    'Regulatory requirement: A conflict search must be completed before collecting personal data. This protects both the firm and the client.',
  contactName:
    'Enter the person\'s legal name exactly as it appears on their government-issued ID. This is used for conflict checks and official correspondence.',
  contactType:
    'Individual = a person. Organisation = a company, trust, or entity. This determines which fields are required.',
  dateOfBirth:
    'Date of birth helps distinguish between contacts with similar names during conflict searches.',
  contactEmail:
    'Primary email address for client communication. Must be unique per contact in the system.',
  contactPhone:
    'Primary phone number including country code. Used for urgent notifications and appointment reminders.',
  contactAddress:
    'The client\'s current residential or business address. Required for regulatory compliance and service of documents.',
  contactJurisdiction:
    'The province or state where the client resides. This determines which regulatory body governs the engagement.',
  contactSource:
    'How the client found your firm. Tracking referral sources helps you understand which channels bring in the best clients.',
} as const

// ---------------------------------------------------------------------------
// Tooltip component — Radix Portal, z-9999, sovereign theme
// ---------------------------------------------------------------------------

interface NorvaGuardianTooltipProps {
  fieldKey: keyof typeof GUARDIAN_HELP_TEXT
  /** Optional custom text (overrides GUARDIAN_HELP_TEXT lookup) */
  text?: string
  className?: string
  iconClassName?: string
}

export function NorvaGuardianTooltip({ fieldKey, text, className, iconClassName }: NorvaGuardianTooltipProps) {
  const content = text ?? GUARDIAN_HELP_TEXT[fieldKey]

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              'ml-1.5 inline-flex items-center justify-center rounded-full text-gray-400 dark:text-white/30 transition-colors hover:text-emerald-500 dark:hover:text-emerald-400 focus:outline-none',
              iconClassName,
              className,
            )}
            aria-label="Help"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[260px] leading-relaxed">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
