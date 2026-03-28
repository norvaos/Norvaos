'use client'

import { useState, useEffect, useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { z } from 'zod/v4'
import {
  Plus,
  Zap,
  Pencil,
  Trash2,
  Loader2,
  MoreHorizontal,
  History,
  Activity,
  ArrowRight,
} from 'lucide-react'

import { useTenant } from '@/lib/hooks/use-tenant'
import {
  useAutomationRules,
  useAutomationExecutionCounts,
  useAutomationExecutionLog,
  useCreateAutomationRule,
  useUpdateAutomationRule,
  useDeleteAutomationRule,
  useToggleAutomationRule,
  type AutomationRule,
} from '@/lib/queries/automations'
import { useMatterTypes } from '@/lib/queries/matter-types'
import {
  AUTOMATION_TRIGGER_TYPES,
  AUTOMATION_ACTION_TYPES,
  PRIORITIES,
  DEADLINE_TYPES,
} from '@/lib/utils/constants'
import { formatDate } from '@/lib/utils/formatters'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/shared/empty-state'
import { ScrollArea } from '@/components/ui/scroll-area'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const automationRuleSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(500).optional(),
  trigger_type: z.string().min(1, 'Trigger type is required'),
  action_type: z.string().min(1, 'Action type is required'),
  is_active: z.boolean().default(true),
  sort_order: z.coerce.number().int().min(0).default(0),
  matter_type_id: z.string().nullable().optional(),
  // Trigger config fields
  tc_to_stage_name: z.string().optional(),
  tc_days_before: z.coerce.number().int().min(1).optional(),
  tc_checklist_category: z.string().optional(),
  // Action config fields
  ac_title: z.string().optional(),
  ac_description: z.string().optional(),
  ac_priority: z.string().optional(),
  ac_due_days_offset: z.coerce.number().int().min(0).optional(),
  ac_assigned_to: z.string().optional(),
  ac_deadline_type: z.string().optional(),
  ac_message: z.string().optional(),
  ac_notify_role: z.string().optional(),
  ac_subject: z.string().optional(),
  ac_body: z.string().optional(),
  ac_template: z.string().optional(),
})

type AutomationFormValues = z.infer<typeof automationRuleSchema>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTriggerLabel(value: string): string {
  return AUTOMATION_TRIGGER_TYPES.find((t) => t.value === value)?.label ?? value
}

function getActionLabel(value: string): string {
  return AUTOMATION_ACTION_TYPES.find((a) => a.value === value)?.label ?? value
}

/** Build trigger_config JSONB from flat form fields */
function buildTriggerConfig(values: AutomationFormValues): Record<string, unknown> {
  const config: Record<string, unknown> = {}
  if (values.trigger_type === 'stage_change') {
    if (values.tc_to_stage_name) config.to_stage_name = values.tc_to_stage_name
  }
  if (
    values.trigger_type === 'deadline_approaching' ||
    values.trigger_type === 'deadline_critical'
  ) {
    if (values.tc_days_before) config.days_before = values.tc_days_before
  }
  if (values.trigger_type === 'checklist_item_approved') {
    if (values.tc_checklist_category) config.checklist_category = values.tc_checklist_category
  }
  return config
}

/** Build action_config JSONB from flat form fields */
function buildActionConfig(values: AutomationFormValues): Record<string, unknown> {
  const config: Record<string, unknown> = {}
  switch (values.action_type) {
    case 'create_task':
      if (values.ac_title) config.title = values.ac_title
      if (values.ac_description) config.description = values.ac_description
      if (values.ac_priority) config.priority = values.ac_priority
      if (values.ac_due_days_offset !== undefined) config.due_days_offset = values.ac_due_days_offset
      if (values.ac_assigned_to) config.assigned_to = values.ac_assigned_to
      break
    case 'create_deadline':
      if (values.ac_title) config.title = values.ac_title
      if (values.ac_deadline_type) config.deadline_type = values.ac_deadline_type
      if (values.ac_priority) config.priority = values.ac_priority
      if (values.ac_due_days_offset !== undefined) config.due_days_offset = values.ac_due_days_offset
      break
    case 'log_activity':
      if (values.ac_title) config.title = values.ac_title
      if (values.ac_description) config.description = values.ac_description
      break
    case 'send_notification':
      if (values.ac_title) config.title = values.ac_title
      if (values.ac_message) config.message = values.ac_message
      if (values.ac_priority) config.priority = values.ac_priority
      if (values.ac_notify_role) config.notify_role = values.ac_notify_role
      break
    case 'send_client_email':
      if (values.ac_subject) config.subject = values.ac_subject
      if (values.ac_body) config.body = values.ac_body
      if (values.ac_template) config.template = values.ac_template
      break
  }
  return config
}

/** Flatten trigger_config JSONB into form values */
function flattenTriggerConfig(
  triggerType: string,
  config: Record<string, unknown>
): Partial<AutomationFormValues> {
  const flat: Partial<AutomationFormValues> = {}
  if (triggerType === 'stage_change') {
    flat.tc_to_stage_name = (config.to_stage_name as string) || ''
  }
  if (triggerType === 'deadline_approaching' || triggerType === 'deadline_critical') {
    flat.tc_days_before = (config.days_before as number) || undefined
  }
  if (triggerType === 'checklist_item_approved') {
    flat.tc_checklist_category = (config.checklist_category as string) || ''
  }
  return flat
}

/** Flatten action_config JSONB into form values */
function flattenActionConfig(
  actionType: string,
  config: Record<string, unknown>
): Partial<AutomationFormValues> {
  const flat: Partial<AutomationFormValues> = {}
  switch (actionType) {
    case 'create_task':
      flat.ac_title = (config.title as string) || ''
      flat.ac_description = (config.description as string) || ''
      flat.ac_priority = (config.priority as string) || 'medium'
      flat.ac_due_days_offset = (config.due_days_offset as number) || 0
      flat.ac_assigned_to = (config.assigned_to as string) || ''
      break
    case 'create_deadline':
      flat.ac_title = (config.title as string) || ''
      flat.ac_deadline_type = (config.deadline_type as string) || 'custom'
      flat.ac_priority = (config.priority as string) || 'medium'
      flat.ac_due_days_offset = (config.due_days_offset as number) || 7
      break
    case 'log_activity':
      flat.ac_title = (config.title as string) || ''
      flat.ac_description = (config.description as string) || ''
      break
    case 'send_notification':
      flat.ac_title = (config.title as string) || ''
      flat.ac_message = (config.message as string) || ''
      flat.ac_priority = (config.priority as string) || 'normal'
      flat.ac_notify_role = (config.notify_role as string) || 'responsible_lawyer'
      break
    case 'send_client_email':
      flat.ac_subject = (config.subject as string) || ''
      flat.ac_body = (config.body as string) || ''
      flat.ac_template = (config.template as string) || 'general'
      break
  }
  return flat
}

// ---------------------------------------------------------------------------
// Dynamic Trigger Config Fields
// ---------------------------------------------------------------------------

function TriggerConfigFields({ control }: { control: any }) {
  const triggerType = useWatch({ control, name: 'trigger_type' })

  if (triggerType === 'stage_change') {
    return (
      <FormField
        control={control}
        name="tc_to_stage_name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Target Stage Name</FormLabel>
            <FormControl>
              <Input placeholder="e.g. Document Review" {...field} value={field.value ?? ''} />
            </FormControl>
            <FormDescription>Leave empty to match any stage change</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    )
  }

  if (triggerType === 'deadline_approaching' || triggerType === 'deadline_critical') {
    return (
      <FormField
        control={control}
        name="tc_days_before"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Days Before Deadline</FormLabel>
            <FormControl>
              <Input type="number" min={1} placeholder="7" {...field} value={field.value ?? ''} />
            </FormControl>
            <FormDescription>
              Trigger when deadline is this many days away
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    )
  }

  if (triggerType === 'checklist_item_approved') {
    return (
      <FormField
        control={control}
        name="tc_checklist_category"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Checklist Category</FormLabel>
            <FormControl>
              <Input placeholder="e.g. identity" {...field} value={field.value ?? ''} />
            </FormControl>
            <FormDescription>Leave empty to match any category</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    )
  }

  // matter_created  -  no config
  return null
}

// ---------------------------------------------------------------------------
// Dynamic Action Config Fields
// ---------------------------------------------------------------------------

function ActionConfigFields({ control }: { control: any }) {
  const actionType = useWatch({ control, name: 'action_type' })

  if (actionType === 'create_task') {
    return (
      <div className="space-y-3">
        <FormField
          control={control}
          name="ac_title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Task Title</FormLabel>
              <FormControl>
                <Input placeholder="Review documents" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="ac_description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Task Description</FormLabel>
              <FormControl>
                <Textarea placeholder="Optional description..." {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={control}
            name="ac_priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Priority</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || 'medium'}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="ac_due_days_offset"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Due In (days)</FormLabel>
                <FormControl>
                  <Input type="number" min={0} placeholder="0" {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>
    )
  }

  if (actionType === 'create_deadline') {
    return (
      <div className="space-y-3">
        <FormField
          control={control}
          name="ac_title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Deadline Title</FormLabel>
              <FormControl>
                <Input placeholder="Submit filing" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={control}
            name="ac_deadline_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Deadline Type</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || 'custom'}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {DEADLINE_TYPES.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="ac_priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Priority</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || 'medium'}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={control}
          name="ac_due_days_offset"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Due In (days)</FormLabel>
              <FormControl>
                <Input type="number" min={0} placeholder="7" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    )
  }

  if (actionType === 'log_activity') {
    return (
      <div className="space-y-3">
        <FormField
          control={control}
          name="ac_title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Activity Title</FormLabel>
              <FormControl>
                <Input placeholder="Stage advanced" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="ac_description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Activity Description</FormLabel>
              <FormControl>
                <Textarea placeholder="Optional description..." {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    )
  }

  if (actionType === 'send_notification') {
    return (
      <div className="space-y-3">
        <FormField
          control={control}
          name="ac_title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notification Title</FormLabel>
              <FormControl>
                <Input
                  placeholder="Deadline approaching for {matter_title}"
                  {...field}
                  value={field.value ?? ''}
                />
              </FormControl>
              <FormDescription>Use {'{matter_title}'} as placeholder</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="ac_message"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Message</FormLabel>
              <FormControl>
                <Textarea placeholder="Optional message body..." {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={control}
            name="ac_priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Priority</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || 'normal'}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="ac_notify_role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notify</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || 'responsible_lawyer'}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="responsible_lawyer">Responsible Lawyer</SelectItem>
                    <SelectItem value="originating_lawyer">Originating Lawyer</SelectItem>
                    <SelectItem value="all">All Assigned Lawyers</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>
    )
  }

  if (actionType === 'send_client_email') {
    return (
      <div className="space-y-3">
        <FormField
          control={control}
          name="ac_template"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email Template</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || 'general'}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="general">General Notification</SelectItem>
                  <SelectItem value="stage_change">Stage Change</SelectItem>
                  <SelectItem value="document_request">Document Request</SelectItem>
                  <SelectItem value="deadline_alert">Deadline Alert</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="ac_subject"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email Subject</FormLabel>
              <FormControl>
                <Input placeholder="Update on your case" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="ac_body"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email Body</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Optional email body content..."
                  rows={3}
                  {...field}
                  value={field.value ?? ''}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    )
  }

  return null
}

// ---------------------------------------------------------------------------
// Automation Form Dialog (Create / Edit)
// ---------------------------------------------------------------------------

function AutomationFormDialog({
  open,
  onOpenChange,
  tenantId,
  rule,
  matterTypes,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantId: string
  rule?: AutomationRule | null
  matterTypes: { id: string; name: string }[]
}) {
  const isEditing = !!rule
  const createRule = useCreateAutomationRule()
  const updateRule = useUpdateAutomationRule()

  const defaultValues = useMemo<AutomationFormValues>(() => {
    if (rule) {
      const tc = (rule.trigger_config ?? {}) as Record<string, unknown>
      const ac = (rule.action_config ?? {}) as Record<string, unknown>
      return {
        name: rule.name,
        description: rule.description ?? '',
        trigger_type: rule.trigger_type,
        action_type: rule.action_type,
        is_active: rule.is_active,
        sort_order: rule.sort_order,
        matter_type_id: rule.matter_type_id ?? null,
        ...flattenTriggerConfig(rule.trigger_type, tc),
        ...flattenActionConfig(rule.action_type, ac),
      }
    }
    return {
      name: '',
      description: '',
      trigger_type: '',
      action_type: '',
      is_active: true,
      sort_order: 0,
      matter_type_id: null,
    }
  }, [rule])

  const form = useForm<AutomationFormValues>({
    resolver: standardSchemaResolver(automationRuleSchema) as any,
    defaultValues,
  })

  useEffect(() => {
    if (open) {
      form.reset(defaultValues)
    }
  }, [open, defaultValues, form])

  function onSubmit(values: AutomationFormValues) {
    const triggerConfig = buildTriggerConfig(values) as any
    const actionConfig = buildActionConfig(values) as any

    if (isEditing && rule) {
      updateRule.mutate(
        {
          id: rule.id,
          tenantId,
          updates: {
            name: values.name,
            description: values.description || null,
            trigger_type: values.trigger_type,
            trigger_config: triggerConfig,
            action_type: values.action_type,
            action_config: actionConfig,
            is_active: values.is_active,
            sort_order: values.sort_order,
            matter_type_id: values.matter_type_id || null,
          },
        },
        { onSuccess: () => onOpenChange(false) }
      )
    } else {
      createRule.mutate(
        {
          tenant_id: tenantId,
          name: values.name,
          description: values.description || null,
          trigger_type: values.trigger_type,
          trigger_config: triggerConfig,
          action_type: values.action_type,
          action_config: actionConfig,
          is_active: values.is_active,
          sort_order: values.sort_order,
          matter_type_id: values.matter_type_id || null,
        },
        { onSuccess: () => onOpenChange(false) }
      )
    }
  }

  const isPending = createRule.isPending || updateRule.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Automation Rule' : 'Create Automation Rule'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the trigger, action, and configuration for this rule.'
              : 'Define a trigger and action to automate a workflow.'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4 -mr-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} id="automation-form" className="space-y-4 pb-2">
              {/* Name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rule Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Auto-create review task on stage change" {...field} />
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
                        placeholder="Optional description..."
                        rows={2}
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Trigger Type */}
              <div className="space-y-3 rounded-lg border p-4">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Zap className="h-4 w-4 text-blue-500" />
                  Trigger
                </h4>
                <FormField
                  control={form.control}
                  name="trigger_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>When this happens...</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ''}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select trigger" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {AUTOMATION_TRIGGER_TYPES.map((t) => (
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
                <TriggerConfigFields control={form.control} />
              </div>

              {/* Action Type */}
              <div className="space-y-3 rounded-lg border p-4">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4 text-green-500" />
                  Action
                </h4>
                <FormField
                  control={form.control}
                  name="action_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Do this...</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ''}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select action" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {AUTOMATION_ACTION_TYPES.map((a) => (
                            <SelectItem key={a.value} value={a.value}>
                              {a.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <ActionConfigFields control={form.control} />
              </div>

              {/* Scope & Settings */}
              <div className="space-y-3 rounded-lg border p-4">
                <h4 className="text-sm font-medium">Scope &amp; Settings</h4>
                <FormField
                  control={form.control}
                  name="matter_type_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Matter Type (optional)</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
                        value={field.value ?? '__none__'}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="All matter types" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">All matter types</SelectItem>
                          {matterTypes.map((mt) => (
                            <SelectItem key={mt.id} value={mt.id}>
                              {mt.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Restrict this rule to a specific matter type
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="sort_order"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sort Order</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} {...field} value={field.value ?? 0} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="is_active"
                    render={({ field }) => (
                      <FormItem className="flex flex-col justify-end">
                        <FormLabel>Active</FormLabel>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                          <span className="text-sm text-muted-foreground">
                            {field.value ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </form>
          </Form>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" form="automation-form" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? 'Save Changes' : 'Create Rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Execution Log Panel (Sheet)
// ---------------------------------------------------------------------------

function ExecutionLogPanel({
  open,
  onOpenChange,
  tenantId,
  rule,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantId: string
  rule: AutomationRule | null
}) {
  const { data: logs, isLoading } = useAutomationExecutionLog(tenantId, rule?.id ?? null)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Execution Log</SheetTitle>
          <SheetDescription>
            Recent executions for &ldquo;{rule?.name}&rdquo;
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !logs || logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No executions recorded yet
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-200px)]">
              <div className="space-y-3 pr-4">
                {logs.map((log) => (
                  <Card key={log.id} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {log.matters?.title || log.matter_id}
                        </p>
                        {log.matters?.matter_number && (
                          <p className="text-xs text-muted-foreground">
                            #{log.matters.matter_number}
                          </p>
                        )}
                      </div>
                      <Badge variant="secondary" className="shrink-0 text-xs">
                        {log.trigger_event}
                      </Badge>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {new Date(log.executed_at).toLocaleString()}
                    </div>
                    {log.actions_executed && (
                      <details className="mt-2">
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                          View actions
                        </summary>
                        <pre className="mt-1 text-xs bg-muted rounded p-2 overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(log.actions_executed, null, 2)}
                        </pre>
                      </details>
                    )}
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Automation Card
// ---------------------------------------------------------------------------

function AutomationCard({
  rule,
  tenantId,
  executionCount,
  onEdit,
  onDelete,
  onViewLog,
}: {
  rule: AutomationRule
  tenantId: string
  executionCount: number
  onEdit: () => void
  onDelete: () => void
  onViewLog: () => void
}) {
  const toggleRule = useToggleAutomationRule()

  return (
    <Card className={`p-4 ${!rule.is_active ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold truncate">{rule.name}</h3>
            <Switch
              checked={rule.is_active}
              onCheckedChange={(checked) =>
                toggleRule.mutate({ id: rule.id, tenantId, isActive: checked })
              }
              className="shrink-0"
            />
          </div>
          {rule.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{rule.description}</p>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onViewLog}>
              <History className="mr-2 h-4 w-4" />
              View Log
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Trigger → Action flow */}
      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
        <Badge variant="secondary" className="bg-blue-950/30 text-blue-400 border-blue-200">
          {getTriggerLabel(rule.trigger_type)}
        </Badge>
        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
        <Badge variant="secondary" className="bg-emerald-950/30 text-emerald-400 border-green-200">
          {getActionLabel(rule.action_type)}
        </Badge>
      </div>

      {/* Footer info */}
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {executionCount > 0
            ? `${executionCount} execution${executionCount !== 1 ? 's' : ''} (30d)`
            : 'No executions'}
        </span>
        <span>{formatDate(rule.created_at)}</span>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AutomationsSettingsPage() {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''

  // State
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<AutomationRule | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AutomationRule | null>(null)
  const [logTarget, setLogTarget] = useState<AutomationRule | null>(null)

  // Queries
  const { data: rules, isLoading } = useAutomationRules(tenantId)
  const { data: matterTypesData } = useMatterTypes(tenantId)
  const matterTypes = useMemo(
    () => (matterTypesData ?? []).map((mt) => ({ id: mt.id, name: mt.name })),
    [matterTypesData]
  )

  const ruleIds = useMemo(() => (rules ?? []).map((r) => r.id), [rules])
  const { data: executionCounts } = useAutomationExecutionCounts(tenantId, ruleIds)

  // Mutations
  const deleteRule = useDeleteAutomationRule()

  // Handlers
  function handleCreate() {
    setEditTarget(null)
    setFormOpen(true)
  }

  function handleEdit(rule: AutomationRule) {
    setEditTarget(rule)
    setFormOpen(true)
  }

  if (!tenantId) return null

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Automation Rules</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Create rules to automate repetitive tasks when triggers fire.
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Create Rule
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && (!rules || rules.length === 0) && (
        <EmptyState
          icon={Zap}
          title="No automation rules"
          description="Create your first rule to automate tasks, notifications, and more."
          actionLabel="Create Rule"
          onAction={handleCreate}
        />
      )}

      {/* Card grid */}
      {!isLoading && rules && rules.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rules.map((rule) => (
            <AutomationCard
              key={rule.id}
              rule={rule}
              tenantId={tenantId}
              executionCount={executionCounts?.[rule.id] ?? 0}
              onEdit={() => handleEdit(rule)}
              onDelete={() => setDeleteTarget(rule)}
              onViewLog={() => setLogTarget(rule)}
            />
          ))}
        </div>
      )}

      {/* Form Dialog */}
      <AutomationFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        tenantId={tenantId}
        rule={editTarget}
        matterTypes={matterTypes}
      />

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleteTarget?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this automation rule and its configuration.
              Execution history will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deleteTarget &&
                deleteRule.mutate(
                  { id: deleteTarget.id, tenantId },
                  { onSuccess: () => setDeleteTarget(null) }
                )
              }
              disabled={deleteRule.isPending}
            >
              {deleteRule.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Execution Log Sheet */}
      <ExecutionLogPanel
        open={!!logTarget}
        onOpenChange={(open) => {
          if (!open) setLogTarget(null)
        }}
        tenantId={tenantId}
        rule={logTarget}
      />
    </div>
  )
}
