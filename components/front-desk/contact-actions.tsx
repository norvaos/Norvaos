'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  StickyNote,
  Bell,
  Mail,
  Video,
  CalendarPlus,
  CalendarClock,
  CalendarX,
  ClipboardCheck,
  ListPlus,
  PenSquare,
  Upload,
  UserPlus,
  CheckCircle2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ActionDialog, type ActionField } from '@/components/front-desk/action-dialog'
import { LogMeetingDialog } from '@/components/front-desk/log-meeting-dialog'
import { UploadDocumentDialog } from '@/components/front-desk/upload-document-dialog'
import { CreateTaskDialog } from '@/components/front-desk/create-task-dialog'
import { NotifyStaffDialog } from '@/components/front-desk/notify-staff-dialog'
import type { FrontDeskConfig } from '@/lib/queries/front-desk-queries'
import { frontDeskKeys } from '@/lib/queries/front-desk-queries'
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
  const [logMeetingOpen, setLogMeetingOpen]   = useState(false)
  const [uploadDocOpen, setUploadDocOpen]     = useState(false)
  const [createTaskOpen, setCreateTaskOpen]   = useState(false)
  const [notifyStaffOpen, setNotifyStaffOpen] = useState(false)
  const { tenant } = useTenant()
  const queryClient = useQueryClient()

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
    { value: '__none', label: 'No related matter' },
    ...(contactMatters ?? []).map((m) => ({
      value: m.id,
      label: `${m.matter_number ?? ''} — ${m.title ?? 'Untitled'}`.trim(),
    })),
  ]

  // ─── Fetch contact name (for meeting attendee pre-fill) ────────────────

  const { data: contactDetail } = useQuery({
    queryKey: ['front-desk', 'contact-name', contactId],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('contacts')
        .select('first_name, last_name, preferred_name')
        .eq('id', contactId)
        .single()
      if (!data) return ''
      return data.preferred_name || [data.first_name, data.last_name].filter(Boolean).join(' ') || ''
    },
    enabled: !!contactId,
    staleTime: 60_000,
  })

  const contactName = contactDetail ?? ''

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
  // Note: Notify Staff uses dedicated NotifyStaffDialog (not listed here)
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
    // Log Meeting uses its own dedicated dialog (LogMeetingDialog)
    // — it is NOT in the communicationActions array; the button is rendered separately below.
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
    { value: '__none', label: 'No room assigned' },
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
        matterId: (formData.matterId && formData.matterId !== '__none') ? formData.matterId : undefined,
        room: (formData.room && formData.room !== '__none') ? formData.room : undefined,
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

  // Row 3: Tasks — handled via dedicated CreateTaskDialog (see below)
  const taskActions: ActionConfig[] = []

  // Build "current value" hints for Request Edit
  const { data: contactFull } = useQuery({
    queryKey: ['front-desk', 'contact-full', contactId],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('contacts')
        .select('first_name, last_name, preferred_name, phone_primary, phone_secondary, email_primary, email_secondary')
        .eq('id', contactId)
        .single()
      return data
    },
    enabled: !!contactId,
    staleTime: 60_000,
  })

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
          label: 'Field to Update',
          type: 'select',
          required: true,
          options: [
            {
              value: 'phone',
              label: `Phone${contactFull?.phone_primary ? ` (current: ${contactFull.phone_primary})` : ''}`,
            },
            {
              value: 'email',
              label: `Email${contactFull?.email_primary ? ` (current: ${contactFull.email_primary})` : ''}`,
            },
            {
              value: 'name',
              label: `Name (current: ${[contactFull?.first_name, contactFull?.last_name].filter(Boolean).join(' ') || '—'})`,
            },
            { value: 'address', label: 'Address' },
            { value: 'other',   label: 'Other field' },
          ],
        },
        {
          name: 'requestedChanges',
          label: 'New Value / Description of Change',
          type: 'textarea',
          placeholder: 'Enter the corrected value or describe the change needed (min 10 characters)...',
          required: true,
          minLength: 10,
        },
      ],
      buildInput: (formData) => ({
        contactId,
        ...formData,
      }),
    },
    // Upload Document uses its own dedicated dialog (UploadDocumentDialog)
  ]

  // ─── Upload Document Mutation ─────────────────────────────────────────────

  const uploadDocMutation = useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      const res = await fetch('/api/actions/front_desk_upload_document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input,
          source: 'front_desk',
          idempotencyKey: `front_desk_upload_document:${contactId}:${Math.floor(Date.now() / 5000)}`,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Action failed')
      }
      return res.json()
    },
    onSuccess: () => {
      setUploadDocOpen(false)
      setRecentSuccess('front_desk_upload_document')
      toast.success('Document saved')
      queryClient.invalidateQueries({ queryKey: frontDeskKeys.all })
      setTimeout(() => setRecentSuccess(null), 3000)
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  // ─── Log Meeting Mutation ─────────────────────────────────────────────────

  const logMeetingMutation = useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      const res = await fetch('/api/actions/front_desk_log_meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input,
          source: 'front_desk',
          idempotencyKey: `front_desk_log_meeting:${contactId}:${Math.floor(Date.now() / 5000)}`,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Action failed')
      }
      return res.json()
    },
    onSuccess: () => {
      setLogMeetingOpen(false)
      setRecentSuccess('front_desk_log_meeting')
      toast.success('Meeting logged successfully')
      queryClient.invalidateQueries({ queryKey: frontDeskKeys.all })
      setTimeout(() => setRecentSuccess(null), 3000)
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  // ─── Create Task Mutation ─────────────────────────────────────────────────

  const createTaskMutation = useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      const res = await fetch('/api/actions/front_desk_create_task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input,
          source: 'front_desk',
          idempotencyKey: `front_desk_create_task:${contactId}:${Math.floor(Date.now() / 5000)}`,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Action failed')
      }
      return res.json()
    },
    onSuccess: () => {
      setCreateTaskOpen(false)
      setRecentSuccess('front_desk_create_task')
      toast.success('Task created successfully')
      queryClient.invalidateQueries({ queryKey: frontDeskKeys.all })
      setTimeout(() => setRecentSuccess(null), 3000)
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  // ─── Notify Staff Mutation ────────────────────────────────────────────────

  const notifyStaffMutation = useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      const res = await fetch('/api/actions/front_desk_notify_staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input,
          source: 'front_desk',
          idempotencyKey: `front_desk_notify_staff:${contactId}:${Math.floor(Date.now() / 5000)}`,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Action failed')
      }
      return res.json()
    },
    onSuccess: () => {
      setNotifyStaffOpen(false)
      setRecentSuccess('front_desk_notify_staff')
      toast.success('Staff notified')
      queryClient.invalidateQueries({ queryKey: frontDeskKeys.all })
      setTimeout(() => setRecentSuccess(null), 3000)
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

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

  // otherActions now only contains Request Edit (Upload Document has its own dialog)
  const filteredOtherActions = otherActions

  return (
    <div className="space-y-3">
      {/* Communication group — Log Meeting button is rendered here outside the generic list */}
      <div className="space-y-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
          Communication
        </span>
        <div className="flex flex-wrap gap-2">
          {communicationActions.map(renderActionButton)}
          {/* Notify Staff — dedicated dialog */}
          <Button
            onClick={() => setNotifyStaffOpen(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white"
            size="sm"
          >
            {recentSuccess === 'front_desk_notify_staff' ? (
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
            ) : (
              <span className="mr-1.5"><Bell className="w-4 h-4" /></span>
            )}
            Notify Staff
          </Button>
          {/* Log Meeting — dedicated dialog */}
          <Button
            onClick={() => setLogMeetingOpen(true)}
            className="bg-violet-600 hover:bg-violet-700 text-white"
            size="sm"
          >
            {recentSuccess === 'front_desk_log_meeting' ? (
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
            ) : (
              <span className="mr-1.5"><Video className="w-4 h-4" /></span>
            )}
            Log Meeting
          </Button>
        </div>
      </div>

      {config.show_action_appointments !== false && renderGroup('Appointments', appointmentActions)}

      {/* Tasks group — uses dedicated CreateTaskDialog */}
      {config.show_action_tasks !== false && (
        <div className="space-y-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Tasks
          </span>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setCreateTaskOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              size="sm"
            >
              {recentSuccess === 'front_desk_create_task' ? (
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
              ) : (
                <span className="mr-1.5"><ListPlus className="w-4 h-4" /></span>
              )}
              Create Task
            </Button>
          </div>
        </div>
      )}

      {/* Other group — includes Upload Document, Request Edit, and New Walk-In */}
      <div className="space-y-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
          Other
        </span>
        <div className="flex flex-wrap gap-2">
          {filteredOtherActions.map(renderActionButton)}

          {/* Upload Document — dedicated dialog */}
          {config.show_action_documents !== false && (
            <Button
              onClick={() => setUploadDocOpen(true)}
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
              size="sm"
            >
              {recentSuccess === 'front_desk_upload_document' ? (
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
              ) : (
                <span className="mr-1.5"><Upload className="w-4 h-4" /></span>
              )}
              Upload Document
            </Button>
          )}

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

      {/* Notify Staff Dialog */}
      <NotifyStaffDialog
        isOpen={notifyStaffOpen}
        isSubmitting={notifyStaffMutation.isPending}
        staffOptions={staffOptions}
        onClose={() => setNotifyStaffOpen(false)}
        onSubmit={(data) => notifyStaffMutation.mutate(data as unknown as Record<string, unknown>)}
      />

      {/* Create Task Dialog */}
      <CreateTaskDialog
        isOpen={createTaskOpen}
        isSubmitting={createTaskMutation.isPending}
        staffOptions={staffOptions}
        matterOptions={matterOptions}
        onClose={() => setCreateTaskOpen(false)}
        onSubmit={(data) => createTaskMutation.mutate({
          ...data,
          contactId,
        })}
      />

      {/* Log Meeting Dialog */}
      <LogMeetingDialog
        isOpen={logMeetingOpen}
        isSubmitting={logMeetingMutation.isPending}
        contactName={contactName}
        contactId={contactId}
        matterOptions={matterOptions}
        onClose={() => setLogMeetingOpen(false)}
        onSubmit={(data) => logMeetingMutation.mutate(data as unknown as Record<string, unknown>)}
      />

      {/* Upload Document Dialog */}
      <UploadDocumentDialog
        isOpen={uploadDocOpen}
        isSubmitting={uploadDocMutation.isPending}
        contactId={contactId}
        contactName={contactName}
        matterOptions={matterOptions}
        onClose={() => setUploadDocOpen(false)}
        onSubmit={(data) => uploadDocMutation.mutate(data as unknown as Record<string, unknown>)}
      />
    </div>
  )
}
