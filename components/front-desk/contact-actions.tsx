'use client'

import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  StickyNote,
  Bell,
  Phone,
  Mail,
  Video,
  CalendarPlus,
  CalendarClock,
  CalendarX,
  ClipboardCheck,
  ListPlus,
  CheckSquare,
  PenSquare,
  Upload,
  UserPlus,
  CheckCircle2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ActionDialog, type ActionField } from '@/components/front-desk/action-dialog'
import type { FrontDeskConfig } from '@/lib/queries/front-desk-queries'
import { useTenant } from '@/lib/hooks/use-tenant'
import { createClient } from '@/lib/supabase/client'

// ─── Types ──────────────────────────────────────────────────────────────────

interface StaffMember {
  id: string
  name: string
}

interface ContactActionBarProps {
  contactId: string
  staffList: StaffMember[]
  config: FrontDeskConfig
  onCreateIntake?: () => void
}

interface ActionConfig {
  type: string
  label: string
  icon: React.ReactNode
  color: string
  fields: ActionField[]
  /** Build the mutation input from the form data. */
  buildInput?: (formData: Record<string, unknown>) => Record<string, unknown>
}

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * Contact Action Bar for Front Desk console.
 *
 * Provides 11 executor-backed action buttons grouped by function.
 * Each button opens an ActionDialog that validates input and submits
 * to /api/actions/[type] with source='front_desk'.
 *
 * Rule #1: All state changes go through the Action Executor.
 * Rule #2: No drag-and-drop. Action-driven only.
 * Rule #12: Compliance required fields enforced in each dialog.
 */
export function ContactActionBar({
  contactId,
  staffList,
  config,
  onCreateIntake,
}: ContactActionBarProps) {
  const [activeAction, setActiveAction] = useState<ActionConfig | null>(null)
  const [recentSuccess, setRecentSuccess] = useState<string | null>(null)
  const { tenant } = useTenant()

  // ─── Fetch contact's matters for linking ──────────────────────────────

  const { data: contactMatters } = useQuery({
    queryKey: ['front-desk', 'contact-matters', contactId],
    queryFn: async () => {
      const supabase = createClient()
      // Get matters linked to this contact via matter_contacts junction table
      const { data } = await supabase
        .from('matter_contacts')
        .select('matter_id, matters!inner(id, title, matter_number, status)')
        .eq('contact_id', contactId)
      return (data ?? []).map((mc) => {
        const m = mc.matters as unknown as { id: string; title: string | null; matter_number: string | null; status: string }
        return m
      }).filter((m) => m && ['active', 'pending'].includes(m.status))
    },
    enabled: !!contactId,
  })

  const matterOptions = [
    { value: '', label: 'No related matter' },
    ...(contactMatters ?? []).map((m) => ({
      value: m.id,
      label: `${m.matter_number ?? ''} — ${m.title ?? 'Untitled'}`.trim(),
    })),
  ]

  // ─── Fetch contact's open tasks for dropdown ────────────────────────────

  const { data: contactTasks } = useQuery({
    queryKey: ['front-desk', 'contact-tasks', contactId],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('tasks')
        .select('id, title, due_date, status')
        .eq('contact_id', contactId)
        .in('status', ['not_started', 'working_on_it', 'stuck'])
        .eq('is_deleted', false)
        .order('due_date', { ascending: true })
        .limit(20)
      return data ?? []
    },
    enabled: !!contactId,
  })

  const taskOptions = (contactTasks ?? []).map((t) => ({
    value: t.id,
    label: `${t.title}${t.due_date ? ` — due ${t.due_date}` : ''} (${t.status})`,
  }))

  // ─── Fetch contact's upcoming appointments for dropdown ───────────────

  const { data: contactAppointments } = useQuery({
    queryKey: ['front-desk', 'contact-appointments', contactId],
    queryFn: async () => {
      const supabase = createClient()
      const today = new Date().toISOString().split('T')[0]
      const { data } = await supabase
        .from('appointments')
        .select('id, appointment_date, start_time, status, user_id')
        .eq('contact_id', contactId)
        .eq('tenant_id', tenant!.id)
        .gte('appointment_date', today)
        .order('appointment_date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(20)
      return data ?? []
    },
    enabled: !!contactId && !!tenant?.id,
  })

  const appointmentOptions = (contactAppointments ?? []).map((a) => {
    const staffName = staffList.find((s) => s.id === a.user_id)?.name ?? 'Staff'
    return {
      value: a.id,
      label: `${a.appointment_date} ${a.start_time} — ${staffName} (${a.status})`,
    }
  })

  // ─── Staff options for select fields ────────────────────────────────────

  const staffOptions = staffList.map((s) => ({ value: s.id, label: s.name }))

  // ─── Mutation ───────────────────────────────────────────────────────────

  const actionMutation = useMutation({
    mutationFn: async ({
      actionType,
      input,
    }: {
      actionType: string
      input: Record<string, unknown>
    }) => {
      const res = await fetch(`/api/actions/${actionType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input,
          source: 'front_desk',
          idempotencyKey: `${actionType}:${contactId}:${Math.floor(Date.now() / 5000)}`,
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

  // ─── Action Definitions ─────────────────────────────────────────────────

  // Row 1: Communication
  const communicationActions: ActionConfig[] = [
    {
      type: 'front_desk_note',
      label: 'Add Note',
      icon: <StickyNote className="w-4 h-4" />,
      color: 'bg-slate-600 hover:bg-slate-700 text-white',
      fields: [
        {
          name: 'note',
          label: 'Note',
          type: 'textarea',
          placeholder: 'Enter note (min 5 characters)...',
          required: true,
          minLength: 5,
        },
      ],
      buildInput: (formData) => ({
        entityType: 'contact',
        entityId: contactId,
        ...formData,
      }),
    },
    {
      type: 'front_desk_notify_staff',
      label: 'Notify Staff',
      icon: <Bell className="w-4 h-4" />,
      color: 'bg-purple-600 hover:bg-purple-700 text-white',
      fields: [
        {
          name: 'recipientUserId',
          label: 'Recipient',
          type: 'select',
          required: true,
          options: staffOptions,
        },
        {
          name: 'message',
          label: 'Message',
          type: 'textarea',
          placeholder: 'Message to staff (min 5 characters)...',
          required: true,
          minLength: 5,
        },
      ],
      buildInput: (formData) => ({ ...formData }),
    },
    {
      type: 'front_desk_log_call',
      label: 'Log Call',
      icon: <Phone className="w-4 h-4" />,
      color: 'bg-green-600 hover:bg-green-700 text-white',
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
          ],
        },
        {
          name: 'durationMinutes',
          label: 'Duration (minutes)',
          type: 'text',
          placeholder: 'e.g. 15',
          required: false,
        },
        {
          name: 'notes',
          label: 'Notes',
          type: 'textarea',
          placeholder: 'Call notes (min 5 characters)...',
          required: true,
          minLength: 5,
        },
      ],
      buildInput: (formData) => ({
        contactId,
        ...formData,
        durationMinutes: formData.durationMinutes ? Number(formData.durationMinutes) : null,
      }),
    },
    {
      type: 'front_desk_log_email',
      label: 'Log Email',
      icon: <Mail className="w-4 h-4" />,
      color: 'bg-sky-600 hover:bg-sky-700 text-white',
      fields: [
        {
          name: 'direction',
          label: 'Direction',
          type: 'select',
          required: true,
          options: [
            { value: 'inbound', label: 'Received' },
            { value: 'outbound', label: 'Sent' },
          ],
        },
        {
          name: 'subject',
          label: 'Subject',
          type: 'text',
          placeholder: 'Email subject line',
          required: true,
        },
        {
          name: 'notes',
          label: 'Notes',
          type: 'textarea',
          placeholder: 'Summary or key details (min 5 characters)...',
          required: true,
          minLength: 5,
        },
      ],
      buildInput: (formData) => ({
        contactId,
        ...formData,
      }),
    },
    {
      type: 'front_desk_log_meeting',
      label: 'Log Meeting',
      icon: <Video className="w-4 h-4" />,
      color: 'bg-violet-600 hover:bg-violet-700 text-white',
      fields: [
        {
          name: 'meetingType',
          label: 'Meeting Type',
          type: 'select',
          required: true,
          options: [
            { value: 'in_person', label: 'In-Person' },
            { value: 'video', label: 'Video Call' },
            { value: 'phone', label: 'Phone Call' },
          ],
        },
        {
          name: 'durationMinutes',
          label: 'Duration (minutes)',
          type: 'text',
          placeholder: 'e.g. 30',
          required: false,
        },
        {
          name: 'attendees',
          label: 'Attendees (optional)',
          type: 'text',
          placeholder: 'e.g. John Smith, Jane Doe',
          required: false,
        },
        {
          name: 'notes',
          label: 'Notes',
          type: 'textarea',
          placeholder: 'Meeting notes (min 5 characters)...',
          required: true,
          minLength: 5,
        },
      ],
      buildInput: (formData) => ({
        contactId,
        ...formData,
        durationMinutes: formData.durationMinutes ? Number(formData.durationMinutes) : null,
      }),
    },
  ]

  // Time slot options for appointment booking
  const timeSlotOptions = (() => {
    const slots: { value: string; label: string }[] = []
    for (let h = 8; h < 18; h++) {
      for (const m of [0, 15, 30, 45]) {
        const hh = String(h).padStart(2, '0')
        const mm = String(m).padStart(2, '0')
        const period = h >= 12 ? 'PM' : 'AM'
        const displayHour = h % 12 || 12
        slots.push({
          value: `${hh}:${mm}`,
          label: `${displayHour}:${mm.padStart(2, '0')} ${period}`,
        })
      }
    }
    return slots
  })()

  // Room / boardroom options from config
  const roomOptions = [
    { value: '', label: 'No room assigned' },
    ...(config.rooms ?? []).map((r) => ({ value: r, label: r })),
  ]

  // Duration preset options
  const durationOptions = [
    { value: '15', label: '15 minutes' },
    { value: '30', label: '30 minutes' },
    { value: '60', label: '1 hour' },
    { value: '90', label: '1.5 hours' },
    { value: '120', label: '2 hours' },
  ]

  // Row 2: Appointments
  const appointmentActions: ActionConfig[] = [
    {
      type: 'front_desk_book_appointment',
      label: 'Book Appointment',
      icon: <CalendarPlus className="w-4 h-4" />,
      color: 'bg-blue-600 hover:bg-blue-700 text-white',
      fields: [
        {
          name: 'staffUserId',
          label: 'Staff Member',
          type: 'select',
          required: true,
          options: staffOptions,
        },
        {
          name: 'appointmentDate',
          label: 'Appointment Date',
          type: 'date',
          required: true,
        },
        {
          name: 'startTime',
          label: 'Start Time',
          type: 'select',
          required: true,
          options: timeSlotOptions,
        },
        {
          name: 'durationMinutes',
          label: 'Duration',
          type: 'select',
          required: true,
          options: durationOptions,
        },
        {
          name: 'matterId',
          label: 'Related Matter',
          type: 'select',
          required: false,
          options: matterOptions,
        },
        // Only show room selector if rooms are configured
        ...(config.rooms && config.rooms.length > 0 ? [{
          name: 'room',
          label: 'Meeting Room',
          type: 'select' as const,
          required: false,
          options: roomOptions,
        }] : []),
        {
          name: 'notes',
          label: 'Notes (optional)',
          type: 'textarea',
          placeholder: 'Any additional notes...',
          required: false,
        },
      ],
      buildInput: (formData) => ({
        contactId,
        ...formData,
        durationMinutes: Number(formData.durationMinutes) || 60,
        matterId: formData.matterId || undefined,
        room: formData.room || undefined,
      }),
    },
    // Only show Reschedule, Cancel/No-Show, Check In when contact has appointments
    ...(appointmentOptions.length > 0 ? [
      {
        type: 'front_desk_reschedule',
        label: 'Reschedule',
        icon: <CalendarClock className="w-4 h-4" />,
        color: 'bg-amber-600 hover:bg-amber-700 text-white',
        fields: [
          {
            name: 'appointmentId',
            label: 'Select Appointment',
            type: 'select' as const,
            required: true,
            options: appointmentOptions,
          },
          {
            name: 'newDate',
            label: 'New Date',
            type: 'date' as const,
            required: true,
          },
          {
            name: 'newStartTime',
            label: 'New Start Time',
            type: 'select' as const,
            required: true,
            options: timeSlotOptions,
          },
          {
            name: 'reason',
            label: 'Reason',
            type: 'textarea' as const,
            placeholder: 'Reason for rescheduling (min 5 characters)...',
            required: true,
            minLength: 5,
          },
        ],
        buildInput: (formData: Record<string, unknown>) => ({ ...formData }),
      },
      {
        type: 'front_desk_cancel_no_show',
        label: 'Cancel/No-Show',
        icon: <CalendarX className="w-4 h-4" />,
        color: 'bg-red-600 hover:bg-red-700 text-white',
        fields: [
          {
            name: 'appointmentId',
            label: 'Select Appointment',
            type: 'select' as const,
            required: true,
            options: appointmentOptions,
          },
          {
            name: 'action',
            label: 'Action',
            type: 'select' as const,
            required: true,
            options: [
              { value: 'cancel', label: 'Cancel' },
              { value: 'no_show', label: 'No-Show' },
            ],
          },
          {
            name: 'reason',
            label: 'Reason',
            type: 'textarea' as const,
            placeholder: 'Reason (min 5 characters)...',
            required: true,
            minLength: 5,
          },
        ],
        buildInput: (formData: Record<string, unknown>) => ({ ...formData }),
      },
      {
        type: 'front_desk_check_in',
        label: 'Check In',
        icon: <ClipboardCheck className="w-4 h-4" />,
        color: 'bg-emerald-600 hover:bg-emerald-700 text-white',
        fields: [
          {
            name: 'appointmentId',
            label: 'Select Appointment',
            type: 'select' as const,
            required: true,
            options: appointmentOptions,
          },
          {
            name: 'method',
            label: 'Check-In Method',
            type: 'select' as const,
            required: true,
            options: [
              { value: 'receptionist', label: 'Receptionist' },
              { value: 'kiosk', label: 'Kiosk' },
            ],
          },
          {
            name: 'notes',
            label: 'Notes (optional)',
            type: 'textarea' as const,
            placeholder: 'Any additional notes...',
            required: false,
          },
        ],
        buildInput: (formData: Record<string, unknown>) => ({ ...formData }),
      },
    ] as ActionConfig[] : []),
  ]

  // Row 3: Tasks
  const taskActions: ActionConfig[] = [
    {
      type: 'front_desk_create_task',
      label: 'Create Task',
      icon: <ListPlus className="w-4 h-4" />,
      color: 'bg-indigo-600 hover:bg-indigo-700 text-white',
      fields: [
        {
          name: 'title',
          label: 'Title',
          type: 'text',
          placeholder: 'Task title (min 5 characters)',
          required: true,
          minLength: 5,
        },
        {
          name: 'assignToUserId',
          label: 'Assign To',
          type: 'select',
          required: true,
          options: staffOptions,
        },
        {
          name: 'dueDate',
          label: 'Due Date',
          type: 'date',
          required: true,
        },
        {
          name: 'priority',
          label: 'Priority',
          type: 'select',
          required: true,
          options: [
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
            { value: 'urgent', label: 'Urgent' },
          ],
        },
        {
          name: 'reason',
          label: 'Reason / Description',
          type: 'textarea',
          placeholder: 'Why is this task needed? (min 10 characters)...',
          required: true,
          minLength: 10,
        },
      ],
      buildInput: (formData) => ({ ...formData }),
    },
    {
      type: 'front_desk_complete_task',
      label: 'Complete Task',
      icon: <CheckSquare className="w-4 h-4" />,
      color: 'bg-teal-600 hover:bg-teal-700 text-white',
      fields: [
        {
          name: 'taskId',
          label: 'Select Task',
          type: 'select',
          required: true,
          options: taskOptions.length > 0
            ? taskOptions
            : [{ value: '', label: 'No open tasks' }],
        },
        {
          name: 'outcomeCode',
          label: 'Outcome',
          type: 'select',
          required: true,
          options: [
            { value: 'completed', label: 'Completed' },
            { value: 'left_voicemail', label: 'Left Voicemail' },
            { value: 'client_will_call_back', label: 'Client Will Call Back' },
            { value: 'escalated', label: 'Escalated' },
          ],
        },
        {
          name: 'notes',
          label: 'Notes (optional)',
          type: 'textarea',
          placeholder: 'Any additional notes...',
          required: false,
        },
      ],
      buildInput: (formData) => ({ ...formData }),
    },
  ]

  // Row 4: Other
  const otherActions: ActionConfig[] = [
    {
      type: 'front_desk_request_contact_edit',
      label: 'Request Edit',
      icon: <PenSquare className="w-4 h-4" />,
      color: 'bg-orange-600 hover:bg-orange-700 text-white',
      fields: [
        {
          name: 'fieldToEdit',
          label: 'Field to Edit',
          type: 'select',
          required: true,
          options: [
            { value: 'phone', label: 'Phone' },
            { value: 'email', label: 'Email' },
            { value: 'name', label: 'Name' },
            { value: 'address', label: 'Address' },
            { value: 'other', label: 'Other' },
          ],
        },
        {
          name: 'requestedChanges',
          label: 'Requested Changes',
          type: 'textarea',
          placeholder: 'Describe the changes needed (min 10 characters)...',
          required: true,
          minLength: 10,
        },
      ],
      buildInput: (formData) => ({
        contactId,
        ...formData,
      }),
    },
    {
      type: 'front_desk_upload_document',
      label: 'Upload Document',
      icon: <Upload className="w-4 h-4" />,
      color: 'bg-cyan-600 hover:bg-cyan-700 text-white',
      fields: [
        {
          name: 'documentType',
          label: 'Document Type',
          type: 'text',
          placeholder: 'e.g. ID, passport, contract',
          required: true,
        },
        {
          name: 'fileName',
          label: 'File Name',
          type: 'text',
          placeholder: 'e.g. passport-scan.pdf',
          required: true,
        },
        {
          name: 'storagePath',
          label: 'Storage Path',
          type: 'text',
          placeholder: 'e.g. /uploads/contacts/...',
          required: true,
        },
      ],
      buildInput: (formData) => ({ ...formData }),
    },
  ]

  // ─── Submit Handler ─────────────────────────────────────────────────────

  function handleSubmit(data: Record<string, unknown>) {
    if (!activeAction) return

    const input = activeAction.buildInput
      ? activeAction.buildInput(data)
      : data

    actionMutation.mutate({ actionType: activeAction.type, input })
  }

  // ─── Render helpers ─────────────────────────────────────────────────────

  function renderActionButton(action: ActionConfig) {
    return (
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
    )
  }

  function renderGroup(label: string, actions: ActionConfig[]) {
    return (
      <div className="space-y-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
          {label}
        </span>
        <div className="flex flex-wrap gap-2">
          {actions.map(renderActionButton)}
        </div>
      </div>
    )
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  // ─── Filter groups by config ────────────────────────────────────────────

  const filteredOtherActions = otherActions.filter((a) => {
    if (a.type === 'front_desk_upload_document' && config.show_action_documents === false) return false
    return true
  })

  return (
    <div className="space-y-3">
      {renderGroup('Communication', communicationActions)}
      {config.show_action_appointments !== false && renderGroup('Appointments', appointmentActions)}
      {config.show_action_tasks !== false && renderGroup('Tasks', taskActions)}

      {/* Other group — includes the New Walk-In button */}
      <div className="space-y-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
          Other
        </span>
        <div className="flex flex-wrap gap-2">
          {filteredOtherActions.map(renderActionButton)}

          {/* New Walk-In — fires callback instead of opening a dialog */}
          {config.show_action_walk_in !== false && (
            <Button
              onClick={() => onCreateIntake?.()}
              className="bg-green-600 hover:bg-green-700 text-white"
              size="sm"
            >
              {recentSuccess === 'front_desk_create_intake' ? (
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
              ) : (
                <span className="mr-1.5">
                  <UserPlus className="w-4 h-4" />
                </span>
              )}
              New Walk-In
            </Button>
          )}
        </div>
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
