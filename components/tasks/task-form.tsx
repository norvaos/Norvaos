'use client'

import { useEffect, useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarIcon,
  Clock,
  Loader2,
  Search,
  Check,
  ChevronsUpDown,
  Plus,
} from 'lucide-react'
import { format } from 'date-fns'
import { formatDate } from '@/lib/utils/formatters'

import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import { taskSchema, type TaskFormValues } from '@/lib/schemas/task'
import { PRIORITIES, TASK_TYPES, TASK_CATEGORIES, TASK_VISIBILITIES } from '@/lib/utils/constants'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { SovereignContactModal } from '@/components/contacts/sovereign-contact-modal'
import { MatterForm } from '@/components/matters/matter-form'
import { useCreateMatter } from '@/lib/queries/matters'
import type { MatterFormValues } from '@/lib/schemas/matter'
import { toast } from 'sonner'

interface TaskFormProps {
  mode: 'create' | 'edit'
  defaultValues?: Partial<TaskFormValues>
  onSubmit: (values: TaskFormValues) => void
  isLoading?: boolean
  matterId?: string
  contactId?: string
}

export function TaskForm({
  mode,
  defaultValues,
  onSubmit,
  isLoading = false,
  matterId,
  contactId,
}: TaskFormProps) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''

  const [matterOpen, setMatterOpen] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const [dueDateOpen, setDueDateOpen] = useState(false)
  const [startDateOpen, setStartDateOpen] = useState(false)
  const [matterSearch, setMatterSearch] = useState('')
  const [contactSearch, setContactSearch] = useState('')
  const [showCreateContact, setShowCreateContact] = useState(false)
  const [showCreateMatter, setShowCreateMatter] = useState(false)

  const createMatter = useCreateMatter()

  const form = useForm<TaskFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: standardSchemaResolver(taskSchema) as any,
    defaultValues: {
      title: '',
      description: '',
      matter_id: matterId ?? null,
      contact_id: contactId ?? null,
      assigned_to: null,
      due_date: null,
      due_time: null,
      start_date: null,
      priority: 'medium',
      estimated_minutes: null,
      follow_up_days: null,
      task_type: 'other',
      category: 'internal',
      reminder_date: null,
      is_billable: false,
      completion_note: null,
      visibility: 'everyone',
      ...defaultValues,
    },
  })

  useEffect(() => {
    if (defaultValues) {
      form.reset({
        title: '',
        description: '',
        matter_id: matterId ?? null,
        contact_id: contactId ?? null,
        assigned_to: null,
        due_date: null,
        due_time: null,
        start_date: null,
        priority: 'medium',
        estimated_minutes: null,
        follow_up_days: null,
        task_type: 'other',
        category: 'internal',
        reminder_date: null,
        is_billable: false,
        completion_note: null,
        visibility: 'everyone',
        ...defaultValues,
      })
    }
  }, [defaultValues, matterId, contactId, form])

  // Fetch matters for searchable select
  const { data: mattersData, isLoading: mattersLoading } = useQuery({
    queryKey: ['matters', 'select', tenantId, matterSearch],
    queryFn: async () => {
      const supabase = createClient()
      let query = supabase
        .from('matters')
        .select('id, title, matter_number')
        .eq('tenant_id', tenantId)
        .in('status', ['intake', 'active', 'on_hold'])
        .order('title', { ascending: true })
        .limit(50)

      if (matterSearch) {
        query = query.or(`title.ilike.%${matterSearch}%,matter_number.ilike.%${matterSearch}%`)
      }

      const { data, error } = await query
      if (error) throw error
      return data
    },
    enabled: !!tenantId,
  })

  // Fetch contacts for searchable select
  const { data: contactsData, isLoading: contactsLoading } = useQuery({
    queryKey: ['contacts', 'select', tenantId, contactSearch],
    queryFn: async () => {
      const supabase = createClient()
      let query = supabase
        .from('contacts')
        .select('id, first_name, last_name, organization_name, email_primary')
        .eq('tenant_id', tenantId)
        .eq('is_archived', false)
        .order('last_name', { ascending: true })
        .limit(50)

      if (contactSearch) {
        query = query.or(
          `first_name.ilike.%${contactSearch}%,last_name.ilike.%${contactSearch}%,email_primary.ilike.%${contactSearch}%,organization_name.ilike.%${contactSearch}%`
        )
      }

      const { data, error } = await query
      if (error) throw error
      return data
    },
    enabled: !!tenantId,
  })

  // Fetch users for assignment
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['users', 'select', tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, avatar_url')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('first_name', { ascending: true })

      if (error) throw error
      return data
    },
    enabled: !!tenantId,
  })

  const matters = useMemo(() => mattersData ?? [], [mattersData])
  const contacts = useMemo(() => contactsData ?? [], [contactsData])
  const users = useMemo(() => usersData ?? [], [usersData])

  function getContactDisplayName(contact: { first_name: string | null; last_name: string | null; organization_name: string | null; email_primary: string | null }) {
    const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ')
    return name || contact.organization_name || contact.email_primary || 'Unnamed contact'
  }

  function getUserDisplayName(user: { first_name: string | null; last_name: string | null; email: string }) {
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ')
    return name || user.email
  }


  async function handleCreateMatter(values: MatterFormValues) {
    try {
      const result = await createMatter.mutateAsync({
        ...values,
        tenant_id: tenantId,
      })
      form.setValue('matter_id', result.id)
      setShowCreateMatter(false)
      toast.success('Matter created and linked')
    } catch {
      // Error handled by mutation
    }
  }

  function handleFormSubmit(values: TaskFormValues) {
    onSubmit(values)
  }

  const selectedMatter = matters.find((m) => m.id === form.watch('matter_id'))
  const selectedContact = contacts.find((c) => c.id === form.watch('contact_id'))

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
        {/* Title */}
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="Enter task title" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Description */}
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Add details about this task..."
                  className="min-h-[80px] resize-y"
                  {...field}
                  value={field.value ?? ''}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Matter (searchable select) */}
          <FormField
            control={form.control}
            name="matter_id"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Matter</FormLabel>
                <Popover open={matterOpen} onOpenChange={setMatterOpen}>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={matterOpen}
                        className={cn(
                          'w-full justify-between font-normal',
                          !field.value && 'text-muted-foreground'
                        )}
                        disabled={!!matterId}
                      >
                        <span className="truncate min-w-0">
                          {field.value
                            ? selectedMatter
                              ? selectedMatter.title
                              : 'Loading...'
                            : 'Select matter'}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Search matters..."
                        value={matterSearch}
                        onValueChange={setMatterSearch}
                      />
                      <CommandList>
                        <CommandEmpty>
                          {mattersLoading ? 'Loading...' : 'No matters found.'}
                        </CommandEmpty>
                        <CommandGroup>
                          {matters.map((matter) => (
                            <CommandItem
                              key={matter.id}
                              value={matter.id}
                              onSelect={() => {
                                field.onChange(matter.id === field.value ? null : matter.id)
                                setMatterOpen(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  field.value === matter.id ? 'opacity-100' : 'opacity-0'
                                )}
                              />
                              <div className="flex flex-col">
                                <span className="text-sm">{matter.title}</span>
                                {matter.matter_number && (
                                  <span className="text-xs text-muted-foreground">
                                    {matter.matter_number}
                                  </span>
                                )}
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                        <Separator />
                        <CommandGroup>
                          <CommandItem
                            onSelect={() => {
                              setShowCreateMatter(true)
                              setMatterOpen(false)
                            }}
                            className="text-blue-600"
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Create New Matter
                          </CommandItem>
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Contact (searchable select) */}
          <FormField
            control={form.control}
            name="contact_id"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Contact</FormLabel>
                <Popover open={contactOpen} onOpenChange={setContactOpen}>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={contactOpen}
                        className={cn(
                          'w-full justify-between font-normal',
                          !field.value && 'text-muted-foreground'
                        )}
                      >
                        {field.value
                          ? selectedContact
                            ? getContactDisplayName(selectedContact)
                            : 'Loading...'
                          : 'Select contact'}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Search contacts..."
                        value={contactSearch}
                        onValueChange={setContactSearch}
                      />
                      <CommandList>
                        <CommandEmpty>
                          {contactsLoading ? 'Loading...' : 'No contacts found.'}
                        </CommandEmpty>
                        <CommandGroup>
                          {contacts.map((contact) => (
                            <CommandItem
                              key={contact.id}
                              value={contact.id}
                              onSelect={() => {
                                field.onChange(contact.id === field.value ? null : contact.id)
                                setContactOpen(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  field.value === contact.id ? 'opacity-100' : 'opacity-0'
                                )}
                              />
                              <span className="text-sm">{getContactDisplayName(contact)}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                        <Separator />
                        <CommandGroup>
                          <CommandItem
                            onSelect={() => {
                              setShowCreateContact(true)
                              setContactOpen(false)
                            }}
                            className="text-blue-600"
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Create New Contact
                          </CommandItem>
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Assigned To  -  Staff or Client */}
          <FormItem>
            <FormLabel>Assigned To</FormLabel>
            {/* Mode toggle */}
            <div className="flex rounded-lg border border-input overflow-hidden mb-1">
              <button
                type="button"
                onClick={() => {
                  form.setValue('category', 'internal')
                }}
                className={cn(
                  'flex-1 px-3 py-1.5 text-sm font-medium transition-colors',
                  form.watch('category') !== 'client_facing'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                )}
              >
                Team Member
              </button>
              <button
                type="button"
                onClick={() => {
                  form.setValue('category', 'client_facing')
                  form.setValue('assigned_to', null)
                }}
                className={cn(
                  'flex-1 px-3 py-1.5 text-sm font-medium transition-colors',
                  form.watch('category') === 'client_facing'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                )}
              >
                Client
              </button>
            </div>

            {form.watch('category') === 'client_facing' ? (
              <p className="text-xs text-muted-foreground">
                This task will appear in the client&apos;s portal. The linked contact is the assignee.
              </p>
            ) : (
              <FormField
                control={form.control}
                name="assigned_to"
                render={({ field }) => (
                  <FormItem>
                    <Select
                      value={field.value ?? ''}
                      onValueChange={(value) => field.onChange(value || null)}
                    >
                      <FormControl>
                        <SelectTrigger className={cn(!field.value && 'text-muted-foreground')}>
                          <SelectValue placeholder="Select team member" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {usersLoading ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin" />
                          </div>
                        ) : (
                          users.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {getUserDisplayName(user)}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </FormItem>

          {/* Priority */}
          <FormField
            control={form.control}
            name="priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Priority</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: p.color }}
                          />
                          {p.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Task Type */}
          <FormField
            control={form.control}
            name="task_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Task Type</FormLabel>
                <Select value={field.value ?? 'other'} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TASK_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Category  -  hidden when client_facing (controlled by Assigned To toggle) */}
          {form.watch('category') !== 'client_facing' && (
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select value={field.value ?? 'internal'} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TASK_CATEGORIES.filter((c) => c.value !== 'client_facing').map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: c.color }}
                            />
                            {c.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Due Date */}
          <FormField
            control={form.control}
            name="due_date"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Due Date</FormLabel>
                <Popover open={dueDateOpen} onOpenChange={setDueDateOpen}>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !field.value && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {field.value ? formatDate(field.value) : 'Pick a date'}
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value ? new Date(field.value) : undefined}
                      onSelect={(date) => {
                        field.onChange(date ? format(date, 'yyyy-MM-dd') : null)
                        setDueDateOpen(false)
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Due Time */}
          <FormField
            control={form.control}
            name="due_time"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Due Time</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="time"
                      className="pl-9"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Start Date */}
          <FormField
            control={form.control}
            name="start_date"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Start Date</FormLabel>
                <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !field.value && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {field.value ? formatDate(field.value) : 'Pick a date'}
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value ? new Date(field.value) : undefined}
                      onSelect={(date) => {
                        field.onChange(date ? format(date, 'yyyy-MM-dd') : null)
                        setStartDateOpen(false)
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Estimated Minutes */}
          <FormField
            control={form.control}
            name="estimated_minutes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Estimated Time (minutes)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    placeholder="e.g. 30"
                    {...field}
                    value={field.value ?? ''}
                    onChange={(e) => {
                      const val = e.target.value
                      field.onChange(val === '' ? null : Number(val))
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Follow-up Days */}
        <FormField
          control={form.control}
          name="follow_up_days"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Follow-up Days</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  placeholder="e.g. 7"
                  {...field}
                  value={field.value ?? ''}
                  onChange={(e) => {
                    const val = e.target.value
                    field.onChange(val === '' ? null : Number(val))
                  }}
                />
              </FormControl>
              <FormDescription>
                Automatically creates a follow-up task this many days after completion.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Reminder Date */}
          <FormField
            control={form.control}
            name="reminder_date"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Reminder Date</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !field.value && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {field.value ? formatDate(field.value) : 'Set reminder'}
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value ? new Date(field.value) : undefined}
                      onSelect={(date) => {
                        field.onChange(date ? format(date, 'yyyy-MM-dd') : null)
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Visibility */}
          <FormField
            control={form.control}
            name="visibility"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Visibility</FormLabel>
                <Select value={field.value ?? 'everyone'} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select visibility" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TASK_VISIBILITIES.map((v) => (
                      <SelectItem key={v.value} value={v.value}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Billable */}
        <FormField
          control={form.control}
          name="is_billable"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <FormControl>
                <Checkbox
                  checked={field.value ?? false}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Billable Task</FormLabel>
                <FormDescription>
                  Mark this task as billable for invoicing purposes.
                </FormDescription>
              </div>
            </FormItem>
          )}
        />

        {/* Completion Note (only show in edit mode) */}
        {mode === 'edit' && (
          <FormField
            control={form.control}
            name="completion_note"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Completion Note</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Add a note when completing this task..."
                    className="min-h-[60px] resize-y"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormDescription>
                  Required when marking this task as complete.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Submit */}
        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'create' ? 'Create Task' : 'Save Changes'}
          </Button>
        </div>
      </form>

      {/* Universal Contact Modal  -  Directive 076 */}
      <SovereignContactModal
        open={showCreateContact}
        onOpenChange={setShowCreateContact}
        onSuccess={(contactId) => {
          form.setValue('contact_id', contactId)
        }}
      />

      {/* Create Matter Dialog */}
      <Dialog open={showCreateMatter} onOpenChange={setShowCreateMatter}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Matter</DialogTitle>
            <DialogDescription>
              Add a new matter to link to this task.
            </DialogDescription>
          </DialogHeader>
          <MatterForm
            mode="create"
            onSubmit={handleCreateMatter}
            isLoading={createMatter.isPending}
          />
        </DialogContent>
      </Dialog>
    </Form>
  )
}
