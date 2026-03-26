'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Phone, PhoneOff, Mail, MessageSquare, Loader2, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ActionDialog, type ActionField } from '@/components/front-desk/action-dialog'

interface LeadActionPanelProps {
  leadId: string
}

interface ActionConfig {
  type: string
  label: string
  icon: React.ReactNode
  color: string
  fields: ActionField[]
}

/**
 * Action bar for a lead in Front Desk Mode.
 *
 * Rule #2: No drag-and-drop. Action-driven only.
 * Rule #11: Front Desk cannot manually move stages.
 * Rule #12: Compliance required fields  -  enforced in each dialog.
 * Rule #1: All state changes go through the Action Executor.
 *
 * Each button opens a structured dialog → validates → submits to
 * /api/actions/[type] with source='front_desk'.
 */
export function LeadActionPanel({ leadId }: LeadActionPanelProps) {
  const [activeAction, setActiveAction] = useState<ActionConfig | null>(null)
  const [recentSuccess, setRecentSuccess] = useState<string | null>(null)

  const actionMutation = useMutation({
    mutationFn: async ({ actionType, input }: { actionType: string; input: Record<string, unknown> }) => {
      const res = await fetch(`/api/actions/${actionType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { leadId, ...input },
          source: 'front_desk',
          idempotencyKey: `${actionType}:${leadId}:${Math.floor(Date.now() / 5000)}`,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Action failed')
      }

      return res.json()
    },
    onSuccess: (_, vars) => {
      setActiveAction(null)
      setRecentSuccess(vars.actionType)
      toast.success('Action completed successfully')
      setTimeout(() => setRecentSuccess(null), 3000)
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const ACTIONS: ActionConfig[] = [
    {
      type: 'mark_contacted',
      label: 'Mark as Contacted',
      icon: <Phone className="w-4 h-4" />,
      color: 'bg-emerald-600 hover:bg-emerald-700 text-white',
      fields: [
        {
          name: 'callNotes',
          label: 'Call Notes',
          type: 'textarea',
          placeholder: 'Summary of the conversation (min 10 characters)...',
          required: true,
          minLength: 10,
        },
        {
          name: 'outcome',
          label: 'Outcome',
          type: 'select',
          required: true,
          options: [
            { value: 'connected', label: 'Connected' },
            { value: 'no_answer', label: 'No Answer' },
            { value: 'voicemail', label: 'Voicemail' },
            { value: 'busy', label: 'Busy' },
            { value: 'wrong_number', label: 'Wrong Number' },
            { value: 'follow_up_needed', label: 'Follow Up Needed' },
          ],
        },
        {
          name: 'nextFollowUp',
          label: 'Next Follow Up (optional)',
          type: 'datetime',
          required: false,
        },
      ],
    },
    {
      type: 'log_call',
      label: 'Log Call',
      icon: <Phone className="w-4 h-4" />,
      color: 'bg-blue-600 hover:bg-blue-700 text-white',
      fields: [
        {
          name: 'direction',
          label: 'Direction',
          type: 'select',
          required: true,
          options: [
            { value: 'inbound', label: 'Inbound' },
            { value: 'outbound', label: 'Outbound' },
          ],
        },
        {
          name: 'outcome',
          label: 'Outcome',
          type: 'select',
          required: true,
          options: [
            { value: 'connected', label: 'Connected' },
            { value: 'no_answer', label: 'No Answer' },
            { value: 'voicemail', label: 'Voicemail' },
            { value: 'busy', label: 'Busy' },
            { value: 'wrong_number', label: 'Wrong Number' },
            { value: 'follow_up_needed', label: 'Follow Up Needed' },
          ],
        },
        {
          name: 'durationMinutes',
          label: 'Duration (minutes)',
          type: 'number',
          required: false,
        },
        {
          name: 'notes',
          label: 'Notes',
          type: 'textarea',
          placeholder: 'Call notes (min 10 characters)...',
          required: true,
          minLength: 10,
        },
      ],
    },
    {
      type: 'send_follow_up',
      label: 'Send Follow-Up',
      icon: <Mail className="w-4 h-4" />,
      color: 'bg-violet-600 hover:bg-violet-700 text-white',
      fields: [
        {
          name: 'method',
          label: 'Method',
          type: 'select',
          required: true,
          options: [
            { value: 'email', label: 'Email' },
            { value: 'sms', label: 'SMS' },
          ],
        },
        {
          name: 'subject',
          label: 'Subject (for email)',
          type: 'text',
          required: false,
        },
        {
          name: 'customMessage',
          label: 'Message',
          type: 'textarea',
          placeholder: 'Custom message (min 10 characters)...',
          required: false,
          minLength: 10,
        },
      ],
    },
    {
      type: 'mark_no_answer',
      label: 'Mark No Answer',
      icon: <PhoneOff className="w-4 h-4" />,
      color: 'bg-amber-600 hover:bg-amber-700 text-white',
      fields: [
        {
          name: 'notes',
          label: 'Notes (optional)',
          type: 'textarea',
          placeholder: 'Any additional notes...',
          required: false,
        },
      ],
    },
  ]

  function handleSubmit(data: Record<string, unknown>) {
    if (!activeAction) return
    actionMutation.mutate({ actionType: activeAction.type, input: data })
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Actions</h3>
      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((action) => (
          <Button
            key={action.type}
            onClick={() => setActiveAction(action)}
            className={action.color}
            size="sm"
          >
            {recentSuccess === action.type ? (
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
            ) : (
              <span className="mr-1.5">{action.icon}</span>
            )}
            {action.label}
          </Button>
        ))}
      </div>

      {/* Action Dialog */}
      {activeAction && (
        <ActionDialog
          title={activeAction.label}
          fields={activeAction.fields}
          isOpen={!!activeAction}
          isSubmitting={actionMutation.isPending}
          onClose={() => setActiveAction(null)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  )
}
