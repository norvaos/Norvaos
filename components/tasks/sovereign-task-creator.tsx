'use client'

import { useCallback, useState } from 'react'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  CalendarIcon,
  Clock,
  Search,
  Check,
  ChevronsUpDown,
  AlertTriangle,
  Phone,
  FileStack,
  ClipboardList,
  RotateCcw,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { useCreateTask } from '@/lib/queries/tasks'
import { PRIORITIES } from '@/lib/utils/constants'
import { cn } from '@/lib/utils'
import { SovereignCreator, type SovereignCreatorStep } from '@/components/ui/sovereign-creator'
import { NorvaGuardianTooltip } from '@/components/ui/norva-guardian-tooltip'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

// ---------------------------------------------------------------------------
// Guardian help text
// ---------------------------------------------------------------------------

const TASK_HELP = {
  title: 'What needs to get done? Be specific so the team knows exactly how to help.',
  dueDate: 'When should this be finished? Pick a date and the team will get reminders.',
  priority: 'How urgent is this? "Critical" tasks show up at the top of everyone\'s list.',
  assignee: 'Who\'s responsible for this task? They\'ll see it on their dashboard and get notifications.',
  matter: 'Link this task to a case so it shows up in that case\'s task list.',
  verify: 'Review the task details. Once created, the assigned person will be notified immediately.',
} as const

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const inputCls = 'w-full rounded-xl border border-gray-200 dark:border-white/[0.1] bg-gray-50 dark:bg-white/[0.04] px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 outline-none transition-shadow focus:border-emerald-500/40 focus:shadow-[0_0_16px_rgba(16,185,129,0.1)] focus:ring-0'
const labelCls = 'mb-2 flex items-center text-xs font-medium uppercase tracking-widest text-gray-500 dark:text-white/50'

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface SovereignTaskCreatorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  matterId?: string
  contactId?: string
  onSuccess?: () => void
}

export function SovereignTaskCreator({
  open,
  onOpenChange,
  matterId: defaultMatterId,
  contactId: defaultContactId,
  onSuccess,
}: SovereignTaskCreatorProps) {
  const { tenant } = useTenant()
  const { appUser } = useUser()
  const createTask = useCreateTask()
  const tenantId = tenant?.id ?? ''

  // ── Form state ──
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState<string | null>(null)
  const [dueDateOpen, setDueDateOpen] = useState(false)
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium')
  const [assignedTo, setAssignedTo] = useState<string | null>(null)
  const [assigneeOpen, setAssigneeOpen] = useState(false)
  const [matterId, setMatterId] = useState<string | null>(defaultMatterId ?? null)
  const [matterOpen, setMatterOpen] = useState(false)
  const [matterSearch, setMatterSearch] = useState('')

  // ── Data hooks ──
  const { data: staffData } = useQuery({
    queryKey: ['staff', tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('users')
        .select('id, first_name, last_name, email')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('first_name')
      if (error) throw error
      return data
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 5,
  })

  const { data: mattersData } = useQuery({
    queryKey: ['matters', 'select', tenantId, matterSearch],
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('matters')
        .select('id, title, matter_number')
        .eq('tenant_id', tenantId)
        .in('status', ['intake', 'active', 'on_hold'])
        .order('updated_at', { ascending: false })
        .limit(20)
      if (matterSearch) {
        q = q.or(`title.ilike.%${matterSearch}%,matter_number.ilike.%${matterSearch}%`)
      }
      const { data, error } = await q
      if (error) throw error
      return data
    },
    enabled: !!tenantId,
  })

  const resetForm = useCallback(() => {
    setTitle('')
    setDescription('')
    setDueDate(null)
    setPriority('medium')
    setAssignedTo(null)
    setMatterId(defaultMatterId ?? null)
    setMatterSearch('')
  }, [defaultMatterId])

  // ── Validation ──
  const isStep1Valid = title.trim().length > 1

  // ── Submit ──
  const handleSubmit = useCallback(async () => {
    if (!tenant || !appUser) return

    try {
      await createTask.mutateAsync({
        tenant_id: tenant.id,
        title: title.trim(),
        description: description.trim() || undefined,
        matter_id: matterId ?? undefined,
        contact_id: defaultContactId ?? undefined,
        assigned_to: assignedTo ?? undefined,
        due_date: dueDate ?? undefined,
        priority,
        task_type: 'other',
        category: 'internal',
        visibility: 'everyone',
        status: 'not_started',
        created_via: 'manual',
        assigned_by: appUser.id,
        created_by: appUser.id,
      })

      toast.success('Task created successfully')
      resetForm()
      onOpenChange(false)
      onSuccess?.()
    } catch {
      toast.error('Failed to create task')
    }
  }, [tenant, appUser, title, description, matterId, defaultContactId, assignedTo, dueDate, priority, createTask, resetForm, onOpenChange, onSuccess])

  // ── Helpers ──
  const selectedAssignee = staffData?.find((s) => s.id === assignedTo)
  const selectedMatter = mattersData?.find((m) => m.id === matterId)

  const assigneeName = selectedAssignee
    ? [selectedAssignee.first_name, selectedAssignee.last_name].filter(Boolean).join(' ')
    : null

  // ── Step definitions ──
  const steps: SovereignCreatorStep[] = [
    {
      label: 'Task',
      isValid: isStep1Valid,
      content: (
        <div className="flex flex-col gap-5 pt-2">
          <div>
            <label className={labelCls}>
              What needs to be done?
              <NorvaGuardianTooltip fieldKey="contact" text={TASK_HELP.title} />
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Describe the task clearly  -  e.g. 'Collect passport copy from client'"
              className={inputCls}
              autoFocus
            />
          </div>

          <div>
            <label className={labelCls}>Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add any extra details the assignee might need"
              rows={3}
              className={cn(inputCls, 'resize-none')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>
                Due Date
                <NorvaGuardianTooltip fieldKey="contact" text={TASK_HELP.dueDate} />
              </label>
              <Popover open={dueDateOpen} onOpenChange={setDueDateOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(inputCls, 'flex items-center gap-2 text-left', !dueDate && 'text-gray-400 dark:text-white/25')}
                  >
                    <CalendarIcon className="h-4 w-4 shrink-0 text-emerald-400/60" />
                    {dueDate ? format(new Date(dueDate), 'MMM d, yyyy') : 'Pick a date'}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate ? new Date(dueDate) : undefined}
                    onSelect={(date) => {
                      setDueDate(date ? format(date, 'yyyy-MM-dd') : null)
                      setDueDateOpen(false)
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <label className={labelCls}>
                Priority
                <NorvaGuardianTooltip fieldKey="contact" text={TASK_HELP.priority} />
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {PRIORITIES.map((p) => (
                  <motion.button
                    key={p.value}
                    type="button"
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                    onClick={() => setPriority(p.value as typeof priority)}
                    className={cn(
                      'rounded-lg border px-2 py-2 text-xs font-medium transition-all',
                      priority === p.value
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 dark:text-emerald-300'
                        : 'border-gray-200 dark:border-white/[0.06] text-gray-500 dark:text-white/50 hover:border-gray-300 dark:hover:border-white/[0.12]',
                    )}
                  >
                    <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                    {p.label}
                  </motion.button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      label: 'Assign',
      isValid: true,
      content: (
        <div className="flex flex-col gap-5 pt-2">
          <div>
            <label className={labelCls}>
              <Users className="mr-1.5 h-3 w-3 text-emerald-500/60" />
              Assign To
              <NorvaGuardianTooltip fieldKey="contact" text={TASK_HELP.assignee} />
            </label>
            <div className="flex flex-wrap gap-2">
              {staffData?.map((member) => {
                const name = [member.first_name, member.last_name].filter(Boolean).join(' ') || member.email
                const initials = `${(member.first_name?.[0] ?? '').toUpperCase()}${(member.last_name?.[0] ?? '').toUpperCase()}`
                const selected = assignedTo === member.id

                return (
                  <motion.button
                    key={member.id}
                    type="button"
                    whileHover={{ scale: 1.05, y: -2 }}
                    whileTap={{ scale: 0.96 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                    onClick={() => setAssignedTo(selected ? null : member.id)}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-all',
                      selected
                        ? 'border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_16px_rgba(16,185,129,0.15)]'
                        : 'border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] hover:border-gray-300 dark:hover:border-white/[0.12]',
                    )}
                  >
                    <div className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold',
                      selected ? 'bg-emerald-500/30 text-emerald-400 dark:text-emerald-300' : 'bg-gray-100 dark:bg-white/[0.08] text-gray-500 dark:text-white/50',
                    )}>
                      {initials}
                    </div>
                    <span className={cn('text-xs font-medium', selected ? 'text-emerald-400 dark:text-emerald-300' : 'text-gray-600 dark:text-white/60')}>
                      {name}
                    </span>
                    {selected && <Check className="ml-1 h-3.5 w-3.5 text-emerald-500" />}
                  </motion.button>
                )
              })}
            </div>
          </div>

          <div>
            <label className={labelCls}>
              Link to Case (optional)
              <NorvaGuardianTooltip fieldKey="contact" text={TASK_HELP.matter} />
            </label>
            <Popover open={matterOpen} onOpenChange={setMatterOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(inputCls, 'flex items-center justify-between text-left')}
                >
                  <span className={cn('truncate', !matterId && 'text-gray-400 dark:text-white/25')}>
                    {selectedMatter?.title ?? (matterId ? 'Loading...' : 'Search for a case...')}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-gray-300 dark:text-white/20" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[340px] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Search cases..."
                    value={matterSearch}
                    onValueChange={setMatterSearch}
                  />
                  <CommandList>
                    <CommandEmpty>No cases found.</CommandEmpty>
                    <CommandItem
                      value="__none__"
                      onSelect={() => {
                        setMatterId(null)
                        setMatterOpen(false)
                      }}
                    >
                      <Check className={cn('mr-2 h-4 w-4', !matterId ? 'opacity-100' : 'opacity-0')} />
                      <span className="text-muted-foreground">None</span>
                    </CommandItem>
                    {mattersData?.map((m) => (
                      <CommandItem
                        key={m.id}
                        value={m.id}
                        onSelect={() => {
                          setMatterId(m.id)
                          setMatterOpen(false)
                        }}
                      >
                        <Check className={cn('mr-2 h-4 w-4', matterId === m.id ? 'opacity-100' : 'opacity-0')} />
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm">{m.title}</p>
                          {m.matter_number && <p className="text-xs text-muted-foreground">{m.matter_number}</p>}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      ),
    },
    {
      label: 'Confirm',
      isValid: isStep1Valid,
      content: (
        <div className="flex flex-col gap-5 pt-2">
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
            <div>
              <p className="text-sm font-medium text-emerald-400 dark:text-emerald-300">Ready to create</p>
              <p className="mt-1 text-xs text-emerald-600/80 dark:text-emerald-400/70">
                {TASK_HELP.verify}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] p-5">
            <h4 className="mb-3 text-[10px] font-medium uppercase tracking-widest text-gray-400 dark:text-white/40">
              Task Summary
            </h4>
            <div className="grid grid-cols-2 gap-y-2.5 gap-x-6 text-xs">
              <div className="text-gray-400 dark:text-white/40">Task</div>
              <div className="font-medium text-gray-700 dark:text-white/80">{title || 'Not entered'}</div>

              <div className="text-gray-400 dark:text-white/40">Priority</div>
              <div className="font-medium text-gray-700 dark:text-white/80 capitalize">{PRIORITIES.find((p) => p.value === priority)?.label ?? priority}</div>

              <div className="text-gray-400 dark:text-white/40">Due Date</div>
              <div className="font-medium text-gray-700 dark:text-white/80">
                {dueDate ? format(new Date(dueDate), 'MMM d, yyyy') : 'No deadline'}
              </div>

              <div className="text-gray-400 dark:text-white/40">Assigned To</div>
              <div className="font-medium text-gray-700 dark:text-white/80">{assigneeName ?? 'Unassigned'}</div>

              <div className="text-gray-400 dark:text-white/40">Case</div>
              <div className="font-medium text-gray-700 dark:text-white/80">{selectedMatter?.title ?? 'No case linked'}</div>
            </div>
          </div>
        </div>
      ),
    },
  ]

  return (
    <SovereignCreator
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm()
        onOpenChange(v)
      }}
      title="Norva Task Creator"
      subtitle="Assign work to your team"
      steps={steps}
      onSubmit={handleSubmit}
      isSubmitting={createTask.isPending}
      submitLabel="Create Task"
      submittingLabel="Creating..."
    />
  )
}
