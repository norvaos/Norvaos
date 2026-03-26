'use client'

import { useState, useCallback, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { frontDeskKeys, useFrontDeskStaffList, useFrontDeskConfig, useFrontDeskActiveShift } from '@/lib/queries/front-desk-queries'
import { GlobalSearch } from '@/components/front-desk/global-search'
import { TodaySchedule } from '@/components/front-desk/today-schedule'
import { LiveTasksQueue } from '@/components/front-desk/live-tasks-panel'
import { CheckInQueue } from '@/components/front-desk/check-in-queue'
import { QuickCreate } from '@/components/front-desk/quick-create'
import { ContactWorkPanel } from '@/components/front-desk/contact-work-panel'
import { StatsBar } from '@/components/front-desk/stats-bar'
import { NowStrip } from '@/components/front-desk/now-strip'
import { IdleAlert } from '@/components/front-desk/idle-alert'
import { useActivityTracker } from '@/lib/hooks/use-activity-tracker'
import { ActionDialog, type ActionField } from '@/components/front-desk/action-dialog'

/**
 * Front Desk Console  -  "One Window" Home Screen
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  [Stats Bar]                                                │
 * ├─────────────────────────────────────────────────────────────┤
 * │  [1] Global Search Bar (full width)                         │
 * ├───────────────────────────┬─────────────────────────────────┤
 * │  [2] Today's Schedule     │  [4] Check-in Queue             │
 * │  (appointments by staff)  │  (kiosk + walk-ins)             │
 * │                           │                                 │
 * ├───────────────────────────┤  [5] Quick Create               │
 * │  [3] Live Tasks Queue     │  (New Lead / New Contact)       │
 * │  (front desk work list)   │                                 │
 * └───────────────────────────┴─────────────────────────────────┘
 *
 * Rule #1:  All state changes go through the Action Executor.
 * Rule #2:  No drag-and-drop. Action-driven only.
 * Rule #10: Separate locked interface, no sidebar.
 * Rule #11: Front Desk cannot manually move stages.
 * Rule #12: Compliance required fields  -  enforced in each dialog.
 * Rule #19: No N+1  -  consolidated queries via front-desk query layer.
 */
export default function FrontDeskDashboard() {
  const { tenant } = useTenant()
  const { appUser } = useUser()
  const queryClient = useQueryClient()
  const tenantId = tenant?.id ?? ''
  const userId = appUser?.id ?? ''
  const { data: staffList } = useFrontDeskStaffList(tenantId)
  const { data: fdConfig } = useFrontDeskConfig(tenantId)
  // Shared with NowStrip  -  TanStack Query deduplicates, one network request
  const { data: activeShift } = useFrontDeskActiveShift(userId)

  const staffOptions = (staffList ?? []).map((s) => ({ value: s.id, label: s.name }))

  // ─── Contact Work Panel (right-side drawer) ─────────────────
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)

  // ─── Quick action dialogs ──────────────────────────────────
  const [activeDialog, setActiveDialog] = useState<{
    title: string
    actionType: string
    fields: ActionField[]
    prefill: Record<string, unknown>
  } | null>(null)

  const actionMutation = useMutation({
    mutationFn: async ({ actionType, input }: { actionType: string; input: Record<string, unknown> }) => {
      const res = await fetch(`/api/actions/${actionType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input,
          source: 'front_desk',
          idempotencyKey: `${actionType}:${Date.now()}`,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Action failed')
      }

      return res.json()
    },
    onSuccess: () => {
      setActiveDialog(null)
      toast.success('Action completed successfully')
      // Refresh relevant queries
      if (tenant?.id) {
        queryClient.invalidateQueries({ queryKey: frontDeskKeys.all })
      }
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  // ─── Schedule action handlers ──────────────────────────────

  const handleCheckIn = useCallback((appointmentId: string) => {
    setActiveDialog({
      title: 'Check In Client',
      actionType: 'front_desk_check_in',
      fields: [
        {
          name: 'method',
          label: 'Check-In Method',
          type: 'select',
          required: true,
          options: [
            { value: 'receptionist', label: 'Receptionist' },
            { value: 'kiosk', label: 'Kiosk' },
          ],
        },
        { name: 'notes', label: 'Notes (optional)', type: 'textarea', required: false },
      ],
      prefill: { appointmentId },
    })
  }, [])

  const handleAcknowledge = useCallback((appointmentId: string) => {
    // Direct action  -  no dialog needed, just acknowledge
    actionMutation.mutate({
      actionType: 'lawyer_acknowledge_checkin',
      input: { appointmentId },
    })
  }, [actionMutation])

  const handleNotifyStaff = useCallback((appointmentId: string, staffId: string) => {
    setActiveDialog({
      title: 'Notify Staff',
      actionType: 'front_desk_notify_staff',
      fields: [
        {
          name: 'recipientUserId',
          label: 'Staff Member',
          type: 'select',
          required: true,
          options: staffOptions.length > 0
            ? staffOptions
            : [{ value: '', label: 'No staff available' }],
        },
        {
          name: 'message',
          label: 'Message',
          type: 'select',
          required: true,
          options: [
            { value: 'Your client has arrived and is waiting at the front desk.', label: 'Client is here' },
            { value: 'Your client is running late for the appointment.', label: 'Client running late' },
            { value: 'Your client has cancelled the appointment last minute.', label: 'Last minute cancellation' },
            { value: 'Your client arrived early and is waiting.', label: 'Client arrived early' },
            { value: 'Your client is on the phone and will be ready shortly.', label: 'Client on phone' },
          ],
        },
        {
          name: 'customMessage',
          label: 'Or write a custom message',
          type: 'textarea',
          placeholder: 'Custom message (min 5 chars)...',
          required: false,
          minLength: 5,
        },
      ],
      prefill: { recipientUserId: staffId, appointmentId },
    })
  }, [staffOptions])

  const handleAddNote = useCallback((appointmentId: string) => {
    setActiveDialog({
      title: 'Add Note',
      actionType: 'front_desk_note',
      fields: [
        {
          name: 'note',
          label: 'Note',
          type: 'textarea',
          placeholder: 'Add a note about this appointment (min 5 chars)',
          required: true,
          minLength: 5,
        },
      ],
      prefill: { entityType: 'appointment', entityId: appointmentId },
    })
  }, [])

  // ─── Task action handlers ─────────────────────────────────

  const handleCompleteTask = useCallback((taskId: string) => {
    setActiveDialog({
      title: 'Complete Task',
      actionType: 'front_desk_complete_task',
      fields: [
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
        { name: 'notes', label: 'Notes (optional)', type: 'textarea', required: false },
      ],
      prefill: { taskId },
    })
  }, [])

  // ─── Check-in queue action handlers ───────────────────────

  const handleCheckInNotify = useCallback((checkInId: string) => {
    setActiveDialog({
      title: 'Notify Staff About Check-In',
      actionType: 'front_desk_notify_staff',
      fields: [
        {
          name: 'recipientUserId',
          label: 'Staff Member',
          type: 'select',
          required: true,
          options: staffOptions.length > 0
            ? staffOptions
            : [{ value: '', label: 'No staff available' }],
        },
        {
          name: 'message',
          label: 'Message',
          type: 'select',
          required: true,
          options: [
            { value: 'Your client has arrived and is waiting at the front desk.', label: 'Client is here' },
            { value: 'Your client is running late for the appointment.', label: 'Client running late' },
            { value: 'Your client has cancelled the appointment last minute.', label: 'Last minute cancellation' },
            { value: 'Your client arrived early and is waiting.', label: 'Client arrived early' },
            { value: 'Your client is on the phone and will be ready shortly.', label: 'Client on phone' },
          ],
        },
        {
          name: 'customMessage',
          label: 'Or write a custom message',
          type: 'textarea',
          placeholder: 'Custom message (min 5 chars)...',
          required: false,
          minLength: 5,
        },
      ],
      prefill: { checkInSessionId: checkInId },
    })
  }, [staffOptions])

  const handleCheckInComplete = useCallback((checkInId: string) => {
    setActiveDialog({
      title: 'Add Note for Check-In',
      actionType: 'front_desk_note',
      fields: [
        {
          name: 'note',
          label: 'Note',
          type: 'textarea',
          placeholder: 'Add a completion note (min 5 chars)',
          required: true,
          minLength: 5,
        },
      ],
      prefill: { entityType: 'check_in', entityId: checkInId },
    })
  }, [])

  // ─── Quick create / walk-in ───────────────────────────────

  const [showQuickCreate, setShowQuickCreate] = useState(false)

  const handleCreateWalkIn = useCallback(() => {
    setShowQuickCreate(true)
    // Scroll to quick create if needed
    document.getElementById('quick-create-zone')?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const handleCreated = useCallback(() => {
    if (tenant?.id) {
      queryClient.invalidateQueries({ queryKey: frontDeskKeys.all })
    }
  }, [tenant?.id, queryClient])

  // ─── Keyboard shortcut: Ctrl+N / Cmd+N → Quick Create ────
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        setShowQuickCreate(true)
        setTimeout(() => {
          const zone = document.getElementById('quick-create-zone')
          zone?.scrollIntoView({ behavior: 'smooth' })
          const firstInput = zone?.querySelector('input, select, textarea') as HTMLElement
          firstInput?.focus()
        }, 100)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // ─── Event logging helper (non-action events) ──────────────
  const logFrontDeskEvent = useCallback(
    async (eventType: string, eventData: Record<string, unknown> = {}) => {
      try {
        await fetch('/api/front-desk/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventType, eventData }),
        })
      } catch {
        // Non-fatal  -  fire and forget
      }
    },
    []
  )

  // Log queue_viewed on mount
  useEffect(() => {
    logFrontDeskEvent('queue_viewed')
  }, [logFrontDeskEvent])

  // Log contact_opened when a contact is selected
  useEffect(() => {
    if (selectedContactId) {
      logFrontDeskEvent('contact_opened', { contactId: selectedContactId })
    }
  }, [selectedContactId, logFrontDeskEvent])

  // ─── Activity tracker (productivity monitoring) ──────────
  const activityState = useActivityTracker({
    enabled: !!activeShift,
    onLogEvent: logFrontDeskEvent,
    onLongIdle: () => {
      // 30-min idle  -  the IdleAlert component handles the modal UI
    },
  })

  // ─── Dialog submission ────────────────────────────────────

  function handleDialogSubmit(formData: Record<string, unknown>) {
    if (!activeDialog) return

    const input = { ...activeDialog.prefill, ...formData }

    // Handle notify staff: use customMessage if provided, otherwise use selected message
    if (activeDialog.actionType === 'front_desk_notify_staff' && formData.customMessage) {
      input.message = formData.customMessage as string
      delete input.customMessage
    } else if (activeDialog.actionType === 'front_desk_notify_staff') {
      delete input.customMessage
    }

    actionMutation.mutate({
      actionType: activeDialog.actionType,
      input,
    })
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-4 space-y-4">
      {/* Idle Alert  -  shown when user is inactive */}
      <IdleAlert
        idleMinutes={activityState.idleMinutes}
        isIdle={activityState.isIdle}
        isLongIdle={activityState.isLongIdle}
        onDismiss={() => {
          // Clicking dismiss counts as activity  -  the tracker auto-resets
          // via its event listeners (click event fires markActive)
        }}
      />

      {/* Now Strip  -  live context bar */}
      {userId && <NowStrip userId={userId} />}

      {/* Stats Bar */}
      {fdConfig?.show_stats_bar !== false && <StatsBar />}

      {/* Zone 1  -  Global Search */}
      <GlobalSearch onSelectContact={setSelectedContactId} />

      {/* Main Grid: Left + Right columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left column  -  Schedule + Tasks */}
        <div className="space-y-4">
          {/* Zone 2  -  Today's Schedule */}
          {fdConfig?.show_schedule !== false && (
            <TodaySchedule
              onCheckIn={handleCheckIn}
              onNotifyStaff={handleNotifyStaff}
              onAddNote={handleAddNote}
              onAcknowledge={handleAcknowledge}
              onSelectContact={setSelectedContactId}
            />
          )}

          {/* Zone 3  -  Live Tasks Queue */}
          {fdConfig?.show_tasks !== false && (
            <LiveTasksQueue
              onCompleteTask={handleCompleteTask}
              onSelectContact={setSelectedContactId}
            />
          )}
        </div>

        {/* Right column  -  Check-ins + Quick Create */}
        <div className="space-y-4">
          {/* Zone 4  -  Check-in Queue */}
          {fdConfig?.show_check_ins !== false && (
            <CheckInQueue
              onNotifyStaff={handleCheckInNotify}
              onComplete={handleCheckInComplete}
              onCreateWalkIn={handleCreateWalkIn}
              onSelectContact={setSelectedContactId}
            />
          )}

          {/* Zone 5  -  Quick Create */}
          {fdConfig?.show_quick_create !== false && (
            <div id="quick-create-zone">
              <QuickCreate onCreated={handleCreated} />
            </div>
          )}
        </div>
      </div>

      {/* Contact Work Panel (right-side Sheet drawer) */}
      <ContactWorkPanel
        contactId={selectedContactId}
        onClose={() => setSelectedContactId(null)}
        onCreateIntake={() => {
          // Close the contact panel first, then open quick create
          setSelectedContactId(null)
          handleCreateWalkIn()
        }}
      />

      {/* Action Dialog (shared by all quick actions from Schedule/Tasks/Check-ins) */}
      {activeDialog && (
        <ActionDialog
          title={activeDialog.title}
          fields={activeDialog.fields}
          isOpen={!!activeDialog}
          isSubmitting={actionMutation.isPending}
          onClose={() => setActiveDialog(null)}
          onSubmit={handleDialogSubmit}
        />
      )}
    </div>
  )
}
