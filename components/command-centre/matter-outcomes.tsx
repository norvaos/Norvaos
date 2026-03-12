'use client'

import { useState } from 'react'
import { useCommandCentre } from './command-centre-context'
import { MeetingOutcomeDialog, type OutcomeConfig } from './panels/meeting-outcome-dialog'
import { Button } from '@/components/ui/button'
import {
  CalendarClock,
  XCircle,
  ClipboardCheck,
  FileStack,
  UserX,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Outcome configurations ─────────────────────────────────────────

const OUTCOME_CONFIGS: (OutcomeConfig & {
  icon: React.ReactNode
  color: string
})[] = [
  {
    type: 'follow_up_required',
    label: 'Follow-Up Required',
    description: 'Schedule a follow-up with reason and assignee.',
    icon: <CalendarClock className="h-3.5 w-3.5" />,
    color: 'bg-amber-600 hover:bg-amber-700 text-white',
    fields: [
      {
        name: 'followUpDate',
        label: 'Follow-Up Date',
        type: 'date',
        required: true,
      },
      {
        name: 'reason',
        label: 'Reason',
        type: 'textarea',
        required: true,
        placeholder: 'Why is follow-up needed? (min 10 characters)',
        minLength: 10,
      },
    ],
  },
  {
    type: 'declined',
    label: 'Declined',
    description: 'Record that the client has declined to proceed.',
    icon: <XCircle className="h-3.5 w-3.5" />,
    color: 'bg-red-600 hover:bg-red-700 text-white',
    fields: [
      {
        name: 'declineReason',
        label: 'Reason',
        type: 'select',
        required: true,
        options: [
          { value: 'cost', label: 'Cost too high' },
          { value: 'timeline', label: 'Timeline too long' },
          { value: 'chose_another', label: 'Chose another firm' },
          { value: 'not_proceeding', label: 'Not proceeding with case' },
          { value: 'other', label: 'Other' },
        ],
      },
      {
        name: 'notes',
        label: 'Additional Notes',
        type: 'textarea',
        required: true,
        placeholder: 'Details about the decline (min 10 characters)...',
        minLength: 10,
      },
    ],
  },
  {
    type: 'consultation_complete',
    label: 'Consultation Complete',
    description: 'Record the consultation summary and next steps.',
    icon: <ClipboardCheck className="h-3.5 w-3.5" />,
    color: 'bg-violet-600 hover:bg-violet-700 text-white',
    fields: [
      {
        name: 'summary',
        label: 'Consultation Summary',
        type: 'textarea',
        required: true,
        placeholder: 'Summary of the consultation (min 20 characters)...',
        minLength: 20,
      },
    ],
  },
  {
    type: 'additional_docs_needed',
    label: 'Additional Docs Needed',
    description: 'Record documents needed from the client.',
    icon: <FileStack className="h-3.5 w-3.5" />,
    color: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    fields: [
      {
        name: 'documentList',
        label: 'Documents Needed',
        type: 'textarea',
        required: true,
        placeholder: 'List required documents (one per line)...',
        minLength: 5,
      },
      {
        name: 'notes',
        label: 'Notes (optional)',
        type: 'textarea',
        required: false,
        placeholder: 'Additional context for the document request...',
      },
    ],
  },
  {
    type: 'no_show',
    label: 'No Show',
    description: 'Record that the client did not attend the meeting.',
    icon: <UserX className="h-3.5 w-3.5" />,
    color: 'bg-slate-600 hover:bg-slate-700 text-white',
    fields: [
      {
        name: 'notes',
        label: 'Notes (optional)',
        type: 'textarea',
        required: false,
        placeholder: 'Any additional context...',
      },
    ],
  },
]

// ─── Component ──────────────────────────────────────────────────────

/**
 * Meeting outcome buttons for matter-mode Command Centre.
 *
 * Rule #15: Command Centre outcomes drive everything.
 * Structured buttons only, not freeform stage edits.
 * Each maps to an action with stage update, task creation, reminders.
 * Must be idempotent or guarded against double-submit.
 *
 * Rule #1: All state changes go through the Action Executor.
 */
export function MatterOutcomes() {
  const { matter, lead, contact, entityType } = useCommandCentre()
  const [activeOutcome, setActiveOutcome] = useState<(typeof OUTCOME_CONFIGS)[number] | null>(null)

  // Only show for matter mode
  if (entityType !== 'matter' || !matter) return null

  return (
    <>
      <div className="px-4 py-2 flex items-center gap-2 overflow-x-auto">
        {OUTCOME_CONFIGS.map((config) => (
          <Button
            key={config.type}
            size="sm"
            className={cn('h-8 text-xs gap-1.5 shrink-0', config.color)}
            onClick={() => setActiveOutcome(config)}
          >
            {config.icon}
            <span className="hidden md:inline">{config.label}</span>
          </Button>
        ))}
      </div>

      {/* Meeting Outcome Dialog */}
      {activeOutcome && (
        <MeetingOutcomeDialog
          config={activeOutcome}
          matterId={matter.id}
          leadId={lead?.id}
          contactId={contact?.id}
          isOpen={!!activeOutcome}
          onClose={() => setActiveOutcome(null)}
        />
      )}
    </>
  )
}
