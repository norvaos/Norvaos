'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTasks, useCompleteTask, useUpdateTask, useDeleteTask } from '@/lib/queries/tasks'
import { useUser } from '@/lib/hooks/use-user'
import { toast } from 'sonner'
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Calendar,
  CheckSquare,
  Clock,
  StickyNote,
  CheckCircle2,
  Circle,
  Mail,
  Video,
  Users,
  FileText,
  Bell,
  UserPlus,
  Activity,
  Send,
  Loader2,
  Pin,
  PinOff,
  Pencil,
  Trash2,
  MoreHorizontal,
  AlertTriangle,
  ClipboardList,
} from 'lucide-react'
import { ScreeningAnswersPanel } from '@/components/shared/screening-answers-panel'

// ─── Props ────────────────────────────────────────────────────────────────────

interface ContactFullProfileProps {
  contactId: string | null
  contactName: string
  tenantId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultTab?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    const diffMs = Date.now() - date.getTime()
    const diffMin = Math.floor(diffMs / 60_000)
    const diffHr = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHr / 24)
    if (diffMin < 1) return 'Just now'
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffHr < 24) return `${diffHr}h ago`
    if (diffDay < 7) return `${diffDay}d ago`
    if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`
    return date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return ''
  }
}

// ─── Activity type → icon + colour + label ────────────────────────────────────

type ActivityMeta = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any
  colour: string
  label: string
}

function getActivityMeta(
  activityType: string,
  metadata: Record<string, unknown>,
): ActivityMeta {
  const direction = metadata.direction as string | undefined
  const meetingType = metadata.meeting_type as string | undefined

  switch (activityType) {
    case 'front_desk_call_logged':
      return {
        icon: direction === 'inbound' ? PhoneIncoming : PhoneOutgoing,
        colour:
          direction === 'inbound'
            ? 'text-green-600 bg-green-50'
            : 'text-blue-600 bg-blue-50',
        label: direction === 'inbound' ? 'Inbound Call' : 'Outbound Call',
      }
    case 'front_desk_email_logged':
      return { icon: Mail, colour: 'text-blue-600 bg-blue-50', label: 'Email Logged' }
    case 'front_desk_meeting_logged':
      return {
        icon:
          meetingType === 'video'
            ? Video
            : meetingType === 'phone'
              ? Phone
              : Users,
        colour: 'text-violet-600 bg-violet-50',
        label:
          meetingType === 'video'
            ? 'Video Meeting'
            : meetingType === 'phone'
              ? 'Phone Meeting'
              : 'In-Person Meeting',
      }
    case 'front_desk_note':
      return { icon: StickyNote, colour: 'text-amber-600 bg-amber-50', label: 'Note Logged' }
    case 'appointment_booked_front_desk':
    case 'appointment_booked':
      return { icon: Calendar, colour: 'text-violet-600 bg-violet-50', label: 'Appointment Booked' }
    case 'appointment_rescheduled':
      return { icon: Calendar, colour: 'text-amber-600 bg-amber-50', label: 'Appointment Rescheduled' }
    case 'appointment_cancelled':
      return { icon: Calendar, colour: 'text-red-600 bg-red-50', label: 'Appointment Cancelled' }
    case 'client_checked_in_front_desk':
    case 'client_checked_in':
      return {
        icon: CheckCircle2,
        colour: 'text-green-600 bg-green-50',
        label: 'Checked In',
      }
    case 'task_created_front_desk':
    case 'task_created':
      return {
        icon: CheckSquare,
        colour: 'text-indigo-600 bg-indigo-50',
        label: 'Task Created',
      }
    case 'task_completed_front_desk':
    case 'task_completed':
      return {
        icon: CheckCircle2,
        colour: 'text-green-600 bg-green-50',
        label: 'Task Completed',
      }
    case 'document_uploaded_front_desk':
    case 'document_uploaded':
      return {
        icon: FileText,
        colour: 'text-cyan-600 bg-cyan-50',
        label: 'Document Uploaded',
      }
    case 'staff_notified':
      return { icon: Bell, colour: 'text-purple-600 bg-purple-50', label: 'Staff Notified' }
    case 'intake_created':
      return {
        icon: UserPlus,
        colour: 'text-emerald-600 bg-emerald-50',
        label: 'Intake Created',
      }
    default:
      return {
        icon: Activity,
        colour: 'text-slate-500 bg-slate-50',
        label: activityType.replace(/_/g, ' '),
      }
  }
}

// ─── Notes Tab ────────────────────────────────────────────────────────────────
// Fetches notes scoped to this contact AND to any leads linked to this contact.
// Uses direct Supabase queries (not the shared useNotes hook) to support OR filter.

function NotesTab({ contactId, tenantId }: { contactId: string; tenantId: string }) {
  const { appUser } = useUser()
  const qc = useQueryClient()
  const [newNote, setNewNote] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Step 1  -  fetch lead IDs for this contact (used to widen note query)
  const { data: leadIds = [] } = useQuery({
    queryKey: ['full-profile-lead-ids', contactId],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('leads')
        .select('id')
        .eq('contact_id', contactId)
      return (data ?? []).map((l) => l.id)
    },
    enabled: !!contactId,
    staleTime: 60_000,
  })

  // Step 2  -  notes: contact_id = X  OR  lead_id IN (leadIds)
  const notesKey = ['full-profile-notes', contactId, leadIds.join(',')]
  const { data: notes, isLoading } = useQuery({
    queryKey: notesKey,
    queryFn: async () => {
      const supabase = createClient()
      let query = supabase
        .from('notes')
        .select(
          'id, content, is_pinned, note_type, user_id, contact_id, lead_id, created_at, updated_at, tenant_id',
        )
        .eq('tenant_id', tenantId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100)

      if (leadIds.length > 0) {
        // Include notes scoped to this contact OR any of its leads
        query = (query as ReturnType<typeof query.eq>).or(
          `contact_id.eq.${contactId},lead_id.in.(${leadIds.join(',')})`,
        )
      } else {
        query = query.eq('contact_id', contactId)
      }

      const { data, error } = await query
      if (error) throw error
      return data ?? []
    },
    enabled: !!contactId,
    staleTime: 30_000,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['full-profile-notes', contactId] })
    qc.invalidateQueries({ queryKey: ['notes'] })
  }

  const createMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch('/api/actions/front_desk_note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'front_desk',
          payload: { action: 'create', contact_id: contactId, content },
        }),
      })
      if (!res.ok) throw new Error('Failed to add note')
      return res.json()
    },
    onSuccess: () => {
      invalidate()
      toast.success('Note added')
    },
    onError: () => toast.error('Failed to add note'),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const res = await fetch('/api/actions/front_desk_note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'front_desk',
          payload: { action: 'update', note_id: id, content },
        }),
      })
      if (!res.ok) throw new Error('Failed to update note')
    },
    onSuccess: () => {
      invalidate()
      setEditingId(null)
      setEditContent('')
    },
    onError: () => toast.error('Failed to update note'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch('/api/actions/front_desk_note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'front_desk',
          payload: { action: 'delete', note_id: id },
        }),
      })
      if (!res.ok) throw new Error('Failed to delete note')
    },
    onSuccess: () => {
      invalidate()
      setDeleteId(null)
      toast.success('Note deleted')
    },
    onError: () => toast.error('Failed to delete note'),
  })

  const pinMutation = useMutation({
    mutationFn: async ({ id, is_pinned }: { id: string; is_pinned: boolean }) => {
      const res = await fetch('/api/actions/front_desk_note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'front_desk',
          payload: { action: 'pin', note_id: id, is_pinned: !is_pinned },
        }),
      })
      if (!res.ok) throw new Error('Failed to update note')
    },
    onSuccess: () => invalidate(),
    onError: () => toast.error('Failed to update note'),
  })

  async function handleCreate() {
    if (!newNote.trim()) return
    await createMutation.mutateAsync(newNote.trim())
    setNewNote('')
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Compose ── */}
      <div className="flex gap-2">
        <Textarea
          placeholder="Write a note… (Ctrl+Enter to save)"
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void handleCreate()
          }}
          rows={2}
          className="resize-none"
        />
        <Button
          size="icon"
          onClick={() => void handleCreate()}
          disabled={!newNote.trim() || createMutation.isPending}
          className="self-end flex-shrink-0"
        >
          {createMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </div>

      {/* ── List ── */}
      {!notes || notes.length === 0 ? (
        <div className="py-12 text-center">
          <StickyNote className="mx-auto size-8 text-slate-300 mb-2" />
          <p className="text-sm text-muted-foreground">No notes yet</p>
          <p className="text-xs text-muted-foreground mt-1">Write one above to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className={`p-3 rounded-lg border ${
                note.is_pinned ? 'border-amber-200 bg-amber-50/50' : 'bg-background border-border'
              }`}
            >
              {editingId === note.id ? (
                <div className="space-y-2">
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={3}
                    className="resize-none"
                    autoFocus
                  />
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingId(null)
                        setEditContent('')
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        updateMutation.mutate({ id: editingId, content: editContent.trim() })
                      }
                      disabled={!editContent.trim() || updateMutation.isPending}
                    >
                      {updateMutation.isPending && (
                        <Loader2 className="mr-1 size-3 animate-spin" />
                      )}
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap flex-1">
                      {note.content}
                    </p>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            pinMutation.mutate({ id: note.id, is_pinned: note.is_pinned })
                          }
                        >
                          {note.is_pinned ? (
                            <>
                              <PinOff className="mr-2 size-4" />
                              Unpin
                            </>
                          ) : (
                            <>
                              <Pin className="mr-2 size-4" />
                              Pin
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setEditingId(note.id)
                            setEditContent(note.content)
                          }}
                        >
                          <Pencil className="mr-2 size-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => setDeleteId(note.id)}
                        >
                          <Trash2 className="mr-2 size-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
                    {note.is_pinned && <Pin className="size-3 text-amber-500" />}
                    <span>{relativeTime(note.created_at)}</span>
                    {/* Badge indicating note came from a lead */}
                    {note.lead_id && !note.contact_id && (
                      <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-[10px] font-medium">
                        Lead note
                      </span>
                    )}
                    {note.updated_at !== note.created_at && <span>(edited)</span>}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Delete confirmation ── */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Note</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this note? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Activity Tab ─────────────────────────────────────────────────────────────
// Shows ALL activities for this contact. Direct query  -  no ActivityTimeline,
// no audit-log dependency, no Object.keys(null) crash.

function ActivityTab({ contactId, tenantId }: { contactId: string; tenantId: string }) {
  const { data: usersMap } = useQuery({
    queryKey: ['full-profile-users', tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('users')
        .select('id, first_name, last_name')
        .eq('tenant_id', tenantId)
      return Object.fromEntries(
        (data ?? []).map((u) => [
          u.id,
          [u.first_name, u.last_name].filter(Boolean).join(' '),
        ]),
      ) as Record<string, string>
    },
    enabled: !!tenantId,
    staleTime: 300_000,
  })

  const { data: activities, isLoading } = useQuery({
    queryKey: ['full-profile-activity', contactId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('activities')
        .select('id, activity_type, title, description, created_at, metadata, user_id')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(150)
      if (error) throw error
      return data ?? []
    },
    enabled: !!contactId,
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-9 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!activities || activities.length === 0) {
    return (
      <div className="py-16 text-center">
        <Activity className="mx-auto size-8 text-slate-300 mb-2" />
        <p className="text-sm text-muted-foreground">No activity logged yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Calls, emails, meetings and check-ins will appear here
        </p>
      </div>
    )
  }

  const outcomeLabels: Record<string, string> = {
    connected: 'Connected',
    no_answer: 'No Answer',
    voicemail: 'Voicemail',
    busy: 'Busy',
    wrong_number: 'Wrong #',
  }
  const outcomeColours: Record<string, string> = {
    connected: 'bg-green-100 text-green-700',
    no_answer: 'bg-slate-100 text-slate-600',
    voicemail: 'bg-blue-100 text-blue-700',
    busy: 'bg-orange-100 text-orange-700',
    wrong_number: 'bg-red-100 text-red-600',
  }

  return (
    <div className="divide-y divide-border">
      {activities.map((activity) => {
        // Safe metadata extraction  -  never crashes on null
        const meta = activity.metadata != null
          ? (activity.metadata as Record<string, unknown>)
          : {}

        const { icon: Icon, colour, label } = getActivityMeta(activity.activity_type, meta)
        const staffName = activity.user_id
          ? ((usersMap ?? {})[activity.user_id] ?? 'Staff')
          : 'Staff'

        const isCall = activity.activity_type === 'front_desk_call_logged'
        const isEmail = activity.activity_type === 'front_desk_email_logged'
        const isMeeting = activity.activity_type === 'front_desk_meeting_logged'

        const outcome = meta.outcome as string | undefined
        const durationMin = meta.duration_minutes as number | undefined
        const callNotes = meta.notes as string | undefined
        const tags = Array.isArray(meta.quick_action_tags)
          ? (meta.quick_action_tags as string[])
          : []
        const subject = meta.subject as string | undefined
        const meetingType = meta.meeting_type as string | undefined

        return (
          <div key={activity.id} className="flex items-start gap-3 py-3.5">
            {/* Icon bubble */}
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${colour}`}
            >
              <Icon className="size-4" />
            </div>

            <div className="flex-1 min-w-0">
              {/* Header row */}
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                <span className="text-sm font-medium">{label}</span>

                {isCall && outcome && (
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      outcomeColours[outcome] ?? 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {outcomeLabels[outcome] ?? outcome}
                  </span>
                )}

                {durationMin != null && (
                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                    <Clock className="size-3" />
                    {durationMin}m
                  </span>
                )}

                {isEmail && subject && (
                  <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                    "{subject}"
                  </span>
                )}

                {isMeeting && meetingType && (
                  <span className="text-xs text-muted-foreground capitalize">
                    {meetingType.replace('_', ' ')}
                  </span>
                )}
              </div>

              {/* Call notes */}
              {isCall && callNotes && (
                <p className="text-sm text-slate-700 mb-1.5 whitespace-pre-wrap">{callNotes}</p>
              )}

              {/* Call quick-action tags */}
              {isCall && tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {tags.map((tag, i) => (
                    <span
                      key={i}
                      className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Generic description for non-call activities */}
              {!isCall && activity.description && (
                <p className="text-sm text-muted-foreground mb-1 line-clamp-3">
                  {activity.description}
                </p>
              )}

              {/* Footer */}
              <p className="text-xs text-muted-foreground">
                {staffName} · {relativeTime(activity.created_at)}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Tasks Tab ────────────────────────────────────────────────────────────────

function TasksTab({ contactId, tenantId }: { contactId: string; tenantId: string }) {
  const { appUser } = useUser()
  const { data: tasksResult, isLoading } = useTasks({
    tenantId,
    contactId,
    showCompleted: true,
    pageSize: 50,
    sortBy: 'due_date',
    sortDirection: 'asc',
  })
  const completeTask = useCompleteTask()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()

  const [deletingId, setDeletingId] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 items-start">
            <Skeleton className="size-5 rounded-full shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  const tasks = tasksResult?.tasks ?? []

  if (tasks.length === 0) {
    return (
      <div className="py-16 text-center">
        <CheckSquare className="mx-auto size-8 text-slate-300 mb-2" />
        <p className="text-sm text-muted-foreground">No tasks linked to this contact</p>
      </div>
    )
  }

  const statusColours: Record<string, string> = {
    done: 'bg-green-100 text-green-700',
    not_started: 'bg-slate-100 text-slate-600',
    working_on_it: 'bg-blue-100 text-blue-700',
    stuck: 'bg-red-100 text-red-600',
    cancelled: 'bg-slate-100 text-slate-400',
  }

  const priorityDot: Record<string, string> = {
    critical: 'bg-red-500',
    high: 'bg-orange-400',
    medium: 'bg-yellow-400',
    low: 'bg-slate-300',
  }

  const today = new Date().toISOString().split('T')[0]
  const userId = appUser?.id ?? ''

  function handleToggle(taskId: string, isDone: boolean) {
    if (isDone) {
      // Reopen the task
      updateTask.mutate({ id: taskId, status: 'not_started' })
    } else {
      // Complete the task
      completeTask.mutate({ id: taskId, userId })
    }
  }

  function handleDelete(taskId: string) {
    deleteTask.mutate(
      { id: taskId, userId },
      { onSuccess: () => setDeletingId(null) },
    )
  }

  return (
    <>
      <div className="divide-y divide-border">
        {tasks.map((task) => {
          const isDone = task.status === 'done' || task.status === 'cancelled'
          const isOverdue = !isDone && !!task.due_date && task.due_date < today
          const isToggling =
            (completeTask.isPending || updateTask.isPending) &&
            (completeTask.variables as { id: string } | undefined)?.id === task.id

          return (
            <div key={task.id} className="flex items-start gap-3 py-3 group">
              {/* Clickable done toggle */}
              <button
                type="button"
                title={isDone ? 'Reopen task' : 'Mark as done'}
                disabled={isToggling}
                onClick={() => handleToggle(task.id, isDone)}
                className="mt-0.5 shrink-0 transition-transform hover:scale-110 disabled:opacity-50"
              >
                {isToggling ? (
                  <Loader2 className="size-5 animate-spin text-slate-400" />
                ) : isDone ? (
                  <CheckCircle2 className="size-5 text-green-500 hover:text-green-600" />
                ) : (
                  <Circle className="size-5 text-slate-300 hover:text-green-400" />
                )}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-1.5">
                  {task.priority && (
                    <span
                      className={`mt-1.5 inline-block size-2 rounded-full shrink-0 ${
                        priorityDot[task.priority] ?? 'bg-slate-300'
                      }`}
                    />
                  )}
                  <p
                    className={`text-sm font-medium leading-snug ${
                      isDone ? 'line-through text-muted-foreground' : 'text-foreground'
                    }`}
                  >
                    {task.title}
                  </p>
                </div>
                {task.description && !isDone && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {task.description}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  {task.status && (
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded font-medium capitalize ${
                        statusColours[task.status] ?? 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {task.status.replace(/_/g, ' ')}
                    </span>
                  )}
                  {task.due_date && (
                    <span
                      className={`text-xs ${
                        isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'
                      }`}
                    >
                      {isOverdue ? '⚠ ' : ''}Due{' '}
                      {new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-CA', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions dropdown  -  always visible on touch, visible on hover for desktop */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-accent"
                  >
                    <MoreHorizontal className="size-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {!isDone ? (
                    <DropdownMenuItem
                      onClick={() => completeTask.mutate({ id: task.id, userId })}
                    >
                      <CheckCircle2 className="size-4 mr-2 text-green-600" />
                      Mark as Done
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onClick={() => updateTask.mutate({ id: task.id, status: 'not_started' })}
                    >
                      <Circle className="size-4 mr-2 text-slate-500" />
                      Reopen Task
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => updateTask.mutate({ id: task.id, status: 'working_on_it' })}
                  >
                    <Clock className="size-4 mr-2 text-blue-600" />
                    In Progress
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => updateTask.mutate({ id: task.id, status: 'stuck' })}
                  >
                    <AlertTriangle className="size-4 mr-2 text-red-600" />
                    Mark Stuck
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setDeletingId(task.id)}
                  >
                    <Trash2 className="size-4 mr-2" />
                    Delete Task
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        })}
      </div>

      {/* Delete confirmation */}
      <Dialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Task?</DialogTitle>
            <DialogDescription>This task will be removed. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteTask.isPending}
              onClick={() => deletingId && handleDelete(deletingId)}
            >
              {deleteTask.isPending ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Appointments Tab ─────────────────────────────────────────────────────────

function AppointmentsTab({ contactId }: { contactId: string }) {
  const { data: appointments, isLoading } = useQuery({
    queryKey: ['full-profile-appts', contactId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('appointments')
        .select('id, appointment_date, start_time, end_time, status, user_id, duration_minutes')
        .eq('contact_id', contactId)
        .order('appointment_date', { ascending: false })
        .limit(50)
      if (error) throw error

      const userIds = [
        ...new Set((data ?? []).map((a) => a.user_id).filter(Boolean)),
      ] as string[]
      let staffMap: Record<string, string> = {}
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, first_name, last_name')
          .in('id', userIds)
        staffMap = Object.fromEntries(
          (users ?? []).map((u) => [
            u.id,
            [u.first_name, u.last_name].filter(Boolean).join(' '),
          ]),
        )
      }
      return (data ?? []).map((a) => ({
        ...a,
        staff_name: a.user_id ? staffMap[a.user_id] ?? 'Staff' : null,
      }))
    },
    enabled: !!contactId,
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-md" />
        ))}
      </div>
    )
  }

  if (!appointments || appointments.length === 0) {
    return (
      <div className="py-16 text-center">
        <Calendar className="mx-auto size-8 text-slate-300 mb-2" />
        <p className="text-sm text-muted-foreground">No appointments found</p>
      </div>
    )
  }

  const statusColours: Record<string, string> = {
    confirmed: 'bg-blue-100 text-blue-700',
    checked_in: 'bg-green-100 text-green-700',
    completed: 'bg-slate-100 text-slate-600',
    cancelled: 'bg-red-100 text-red-600',
    no_show: 'bg-orange-100 text-orange-700',
    pending: 'bg-amber-100 text-amber-700',
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="divide-y divide-border">
      {appointments.map((appt) => {
        const isUpcoming = (appt.appointment_date ?? '') >= today
        const d = appt.appointment_date
          ? new Date(appt.appointment_date + 'T00:00:00')
          : null

        return (
          <div key={appt.id} className="flex items-center gap-3 py-3">
            <div
              className={`flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg border text-center ${
                isUpcoming ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-slate-50'
              }`}
            >
              <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground leading-none">
                {d ? d.toLocaleDateString('en-US', { month: 'short' }) : '---'}
              </span>
              <span className="text-sm font-bold leading-none">{d ? d.getDate() : '-'}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                <span
                  className={`text-xs px-1.5 py-0.5 rounded font-medium capitalize ${
                    statusColours[appt.status] ?? 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {appt.status.replace(/_/g, ' ')}
                </span>
                {isUpcoming && (
                  <span className="text-xs text-blue-600 font-medium">Upcoming</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {appt.start_time ?? 'Time TBD'}
                {appt.staff_name ? ` · ${appt.staff_name}` : ''}
                {appt.duration_minutes ? ` · ${appt.duration_minutes}m` : ''}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Screening Tab ────────────────────────────────────────────────────────────

function ScreeningTab({ contactId, tenantId }: { contactId: string; tenantId: string }) {
  // Fetch the most recent open (or any) lead for this contact that has intake data
  const { data: lead, isLoading } = useQuery({
    queryKey: ['full-profile-screening', contactId],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('leads')
        .select('id, custom_intake_data, created_at, tenant_id')
        .eq('contact_id', contactId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data
    },
    enabled: !!contactId && !!tenantId,
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <div className="space-y-3 p-1">
        <div className="h-4 bg-muted rounded animate-pulse w-32" />
        <div className="h-20 bg-muted rounded animate-pulse w-full" />
      </div>
    )
  }

  if (!lead) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-muted-foreground italic">No leads linked to this contact.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <ScreeningAnswersPanel
        customIntakeData={lead.custom_intake_data as Record<string, unknown> | null}
        defaultCollapsed={false}
      />
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ContactFullProfile({
  contactId,
  contactName,
  tenantId,
  open,
  onOpenChange,
  defaultTab = 'notes',
}: ContactFullProfileProps) {
  const [tab, setTab] = useState(defaultTab)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full sm:max-w-2xl overflow-hidden flex flex-col"
        side="right"
      >
        <SheetHeader className="pb-3 shrink-0 border-b">
          <SheetTitle className="text-base font-semibold truncate pr-8">
            {contactName}
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Full history  -  notes, all activity, tasks &amp; appointments
          </SheetDescription>
        </SheetHeader>

        {contactId ? (
          <Tabs
            value={tab}
            onValueChange={setTab}
            className="flex flex-col flex-1 min-h-0 pt-2"
          >
            <TabsList className="shrink-0 grid w-full grid-cols-5 h-9">
              <TabsTrigger value="notes" className="text-xs">
                <StickyNote className="size-3 mr-1" />
                Notes
              </TabsTrigger>
              <TabsTrigger value="activity" className="text-xs">
                <Activity className="size-3 mr-1" />
                Activity
              </TabsTrigger>
              <TabsTrigger value="tasks" className="text-xs">
                <CheckSquare className="size-3 mr-1" />
                Tasks
              </TabsTrigger>
              <TabsTrigger value="appointments" className="text-xs">
                <Calendar className="size-3 mr-1" />
                Appts
              </TabsTrigger>
              <TabsTrigger value="screening" className="text-xs">
                <ClipboardList className="size-3 mr-1" />
                Screening
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 min-h-0 overflow-y-auto mt-4 px-0.5">
              <TabsContent value="notes" className="mt-0">
                <NotesTab contactId={contactId} tenantId={tenantId} />
              </TabsContent>

              <TabsContent value="activity" className="mt-0">
                <ActivityTab contactId={contactId} tenantId={tenantId} />
              </TabsContent>

              <TabsContent value="tasks" className="mt-0">
                <TasksTab contactId={contactId} tenantId={tenantId} />
              </TabsContent>

              <TabsContent value="appointments" className="mt-0">
                <AppointmentsTab contactId={contactId} />
              </TabsContent>

              <TabsContent value="screening" className="mt-0">
                <ScreeningTab contactId={contactId} tenantId={tenantId} />
              </TabsContent>
            </div>
          </Tabs>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">No contact selected.</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
