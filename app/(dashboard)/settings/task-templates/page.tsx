'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
import { z } from 'zod/v4'
import { useQuery } from '@tanstack/react-query'
import {
  Plus,
  ArrowLeft,
  Pencil,
  Trash2,
  FileText,
  ListChecks,
  Loader2,
  MoreHorizontal,
} from 'lucide-react'

import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import {
  useTaskTemplates,
  useTaskTemplateItems,
  useCreateTaskTemplate,
  useUpdateTaskTemplate,
  useDeleteTaskTemplate,
  useCreateTemplateItem,
  useUpdateTemplateItem,
  useDeleteTemplateItem,
} from '@/lib/queries/task-templates'
import { PRIORITIES } from '@/lib/utils/constants'
import { createClient } from '@/lib/supabase/client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/shared/empty-state'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const templateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  practice_area_id: z.string().nullable().optional(),
})

type TemplateFormValues = z.infer<typeof templateSchema>

const templateItemSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(1000).optional(),
  priority: z.string().default('medium'),
  due_days_offset: z.coerce.number().int().min(0).nullable().optional(),
})

type TemplateItemFormValues = z.infer<typeof templateItemSchema>

// ---------------------------------------------------------------------------
// Helper: Priority badge
// ---------------------------------------------------------------------------

function PriorityBadge({ priority }: { priority: string }) {
  const found = PRIORITIES.find((p) => p.value === priority)
  if (!found) return <Badge variant="secondary">{priority}</Badge>
  return (
    <Badge
      variant="secondary"
      style={{
        backgroundColor: `${found.color}15`,
        color: found.color,
        borderColor: `${found.color}30`,
      }}
    >
      {found.label}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Template Form Dialog (Create / Edit)
// ---------------------------------------------------------------------------

function TemplateFormDialog({
  open,
  onOpenChange,
  tenantId,
  userId,
  template,
  practiceAreas,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantId: string
  userId: string
  template?: {
    id: string
    name: string
    description: string | null
    practice_area_id: string | null
  } | null
  practiceAreas: { id: string; name: string }[]
}) {
  const isEditing = !!template
  const createTemplate = useCreateTaskTemplate()
  const updateTemplate = useUpdateTaskTemplate()

  const form = useForm<TemplateFormValues>({
    resolver: standardSchemaResolver(templateSchema) as any,
    defaultValues: {
      name: template?.name ?? '',
      description: template?.description ?? '',
      practice_area_id: template?.practice_area_id ?? null,
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        name: template?.name ?? '',
        description: template?.description ?? '',
        practice_area_id: template?.practice_area_id ?? null,
      })
    }
  }, [open, template, form])

  function onSubmit(values: TemplateFormValues) {
    if (isEditing && template) {
      updateTemplate.mutate(
        {
          id: template.id,
          name: values.name,
          description: values.description || null,
          practice_area_id: values.practice_area_id || null,
        },
        {
          onSuccess: () => {
            onOpenChange(false)
            form.reset()
          },
        }
      )
    } else {
      createTemplate.mutate(
        {
          tenant_id: tenantId,
          name: values.name,
          description: values.description || undefined,
          practice_area_id: values.practice_area_id || null,
          created_by: userId,
        },
        {
          onSuccess: () => {
            onOpenChange(false)
            form.reset()
          },
        }
      )
    }
  }

  const isPending = createTemplate.isPending || updateTemplate.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Template' : 'Create Template'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the task template details.'
              : 'Create a new task template to standardize workflows.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. New Client Onboarding"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief description of this template..."
                      rows={3}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="practice_area_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Practice Area (optional)</FormLabel>
                  <Select
                    onValueChange={(v) =>
                      field.onChange(v === '__none__' ? null : v)
                    }
                    value={field.value ?? '__none__'}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select practice area" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {practiceAreas.map((pa) => (
                        <SelectItem key={pa.id} value={pa.id}>
                          {pa.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isEditing ? 'Save Changes' : 'Create Template'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Template Item Form Dialog (Add / Edit Item)
// ---------------------------------------------------------------------------

function TemplateItemFormDialog({
  open,
  onOpenChange,
  tenantId,
  templateId,
  item,
  existingItemCount,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantId: string
  templateId: string
  item?: {
    id: string
    title: string
    description: string | null
    priority: string | null
    due_days_offset: number | null
  } | null
  existingItemCount: number
}) {
  const isEditing = !!item
  const createItem = useCreateTemplateItem()
  const updateItem = useUpdateTemplateItem()

  const form = useForm<TemplateItemFormValues>({
    resolver: standardSchemaResolver(templateItemSchema) as any,
    defaultValues: {
      title: item?.title ?? '',
      description: item?.description ?? '',
      priority: item?.priority ?? 'medium',
      due_days_offset: item?.due_days_offset ?? null,
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        title: item?.title ?? '',
        description: item?.description ?? '',
        priority: item?.priority ?? 'medium',
        due_days_offset: item?.due_days_offset ?? null,
      })
    }
  }, [open, item, form])

  function onSubmit(values: TemplateItemFormValues) {
    if (isEditing && item) {
      updateItem.mutate(
        {
          id: item.id,
          templateId,
          title: values.title,
          description: values.description || null,
          priority: values.priority,
          due_days_offset: values.due_days_offset ?? null,
        },
        {
          onSuccess: () => {
            onOpenChange(false)
            form.reset()
          },
        }
      )
    } else {
      createItem.mutate(
        {
          tenant_id: tenantId,
          template_id: templateId,
          title: values.title,
          description: values.description || undefined,
          priority: values.priority,
          due_days_offset: values.due_days_offset ?? null,
          sort_order: existingItemCount + 1,
        },
        {
          onSuccess: () => {
            onOpenChange(false)
            form.reset()
          },
        }
      )
    }
  }

  const isPending = createItem.isPending || updateItem.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Item' : 'Add Item'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the template item details.'
              : 'Add a new task item to this template.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Send engagement letter"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Additional details for this task..."
                      rows={2}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select priority" />
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
                control={form.control}
                name="due_days_offset"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Due Days Offset</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        placeholder="e.g. 3"
                        value={field.value ?? ''}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isEditing ? 'Save Changes' : 'Add Item'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Delete Confirmation Dialog
// ---------------------------------------------------------------------------

function DeleteConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  isPending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  onConfirm: () => void
  isPending: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Template Detail View
// ---------------------------------------------------------------------------

function TemplateDetailView({
  template,
  tenantId,
  userId,
  practiceAreas,
  onBack,
}: {
  template: {
    id: string
    name: string
    description: string | null
    practice_area_id: string | null
  }
  tenantId: string
  userId: string
  practiceAreas: { id: string; name: string }[]
  onBack: () => void
}) {
  const { data: items, isLoading: itemsLoading } = useTaskTemplateItems(
    template.id
  )
  const deleteItem = useDeleteTemplateItem()

  const [editTemplateOpen, setEditTemplateOpen] = useState(false)
  const [itemFormOpen, setItemFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<{
    id: string
    title: string
    description: string | null
    priority: string | null
    due_days_offset: number | null
  } | null>(null)
  const [deleteItemTarget, setDeleteItemTarget] = useState<{
    id: string
    title: string
  } | null>(null)

  const practiceArea = practiceAreas.find(
    (pa) => pa.id === template.practice_area_id
  )

  function handleDeleteItem() {
    if (!deleteItemTarget) return
    deleteItem.mutate(
      { id: deleteItemTarget.id, templateId: template.id },
      {
        onSuccess: () => setDeleteItemTarget(null),
      }
    )
  }

  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 -ml-2 text-slate-600 hover:text-slate-900"
          onClick={onBack}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Templates
        </Button>
      </div>

      {/* Template info card */}
      <Card className="p-6">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-slate-900">
                {template.name}
              </h2>
              {practiceArea && (
                <Badge variant="secondary">{practiceArea.name}</Badge>
              )}
            </div>
            {template.description && (
              <p className="mt-2 text-sm text-slate-500">
                {template.description}
              </p>
            )}
            <p className="mt-2 text-xs text-slate-400">
              {items?.length ?? 0}{' '}
              {(items?.length ?? 0) === 1 ? 'item' : 'items'} in this template
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditTemplateOpen(true)}
          >
            <Pencil className="mr-1 h-3.5 w-3.5" />
            Edit
          </Button>
        </div>
      </Card>

      {/* Items section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Template Items
            </h3>
            <p className="text-sm text-slate-500">
              Tasks that will be created when this template is applied
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditingItem(null)
              setItemFormOpen(true)
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add Item
          </Button>
        </div>

        {itemsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : !items || items.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="No items yet"
            description="Add task items to this template. They will be created as tasks when the template is applied to a matter."
            actionLabel="Add Item"
            onAction={() => {
              setEditingItem(null)
              setItemFormOpen(true)
            }}
          />
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Due Days Offset</TableHead>
                  <TableHead className="w-[70px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div>
                        <span className="font-medium text-slate-900">
                          {item.title}
                        </span>
                        {item.description && (
                          <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">
                            {item.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <PriorityBadge priority={item.priority ?? 'medium'} />
                    </TableCell>
                    <TableCell>
                      {item.due_days_offset != null ? (
                        <span className="text-sm text-slate-700">
                          {item.due_days_offset}{' '}
                          {item.due_days_offset === 1 ? 'day' : 'days'}
                        </span>
                      ) : (
                        <span className="text-sm text-slate-400">--</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setEditingItem({
                                id: item.id,
                                title: item.title,
                                description: item.description,
                                priority: item.priority,
                                due_days_offset: item.due_days_offset,
                              })
                              setItemFormOpen(true)
                            }}
                          >
                            <Pencil className="mr-2 h-3.5 w-3.5" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600"
                            onClick={() =>
                              setDeleteItemTarget({
                                id: item.id,
                                title: item.title,
                              })
                            }
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {/* Edit template dialog */}
      <TemplateFormDialog
        open={editTemplateOpen}
        onOpenChange={setEditTemplateOpen}
        tenantId={tenantId}
        userId={userId}
        template={template}
        practiceAreas={practiceAreas}
      />

      {/* Add/Edit item dialog */}
      <TemplateItemFormDialog
        open={itemFormOpen}
        onOpenChange={(open) => {
          setItemFormOpen(open)
          if (!open) setEditingItem(null)
        }}
        tenantId={tenantId}
        templateId={template.id}
        item={editingItem}
        existingItemCount={items?.length ?? 0}
      />

      {/* Delete item confirmation */}
      <DeleteConfirmDialog
        open={!!deleteItemTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteItemTarget(null)
        }}
        title="Delete Item"
        description={`Are you sure you want to delete "${deleteItemTarget?.title ?? ''}"? This action cannot be undone.`}
        onConfirm={handleDeleteItem}
        isPending={deleteItem.isPending}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Template Card (List View)
// ---------------------------------------------------------------------------

function TemplateCard({
  template,
  practiceAreas,
  onSelect,
  onEdit,
  onDelete,
}: {
  template: {
    id: string
    name: string
    description: string | null
    practice_area_id: string | null
  }
  practiceAreas: { id: string; name: string }[]
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { data: items } = useTaskTemplateItems(template.id)
  const practiceArea = practiceAreas.find(
    (pa) => pa.id === template.practice_area_id
  )
  const itemCount = items?.length ?? 0

  return (
    <Card
      className="group cursor-pointer p-5 transition-all hover:shadow-sm hover:border-slate-300"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
              <FileText className="h-4 w-4 text-slate-500" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold text-slate-900">
                {template.name}
              </h3>
              {template.description && (
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {template.description}
                </p>
              )}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            {practiceArea && (
              <Badge variant="secondary" className="text-[10px]">
                {practiceArea.name}
              </Badge>
            )}
            <span className="text-xs text-slate-400">
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </span>
          </div>
        </div>
        <div
          className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600"
            onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-slate-400 hover:text-red-600"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function TaskTemplatesPage() {
  const { tenant, isLoading: tenantLoading } = useTenant()
  const { appUser, isLoading: userLoading } = useUser()
  const tenantId = tenant?.id ?? ''
  const userId = appUser?.id ?? ''

  const { data: templates, isLoading: templatesLoading } =
    useTaskTemplates(tenantId)
  const deleteTemplate = useDeleteTaskTemplate()

  const { data: practiceAreas } = useQuery({
    queryKey: ['practice_areas', tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('practice_areas')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .order('name')
      if (error) throw error
      return data as { id: string; name: string }[]
    },
    enabled: !!tenantId,
  })

  // View state
  const [view, setView] = useState<'list' | 'detail'>('list')
  const [selectedTemplate, setSelectedTemplate] = useState<{
    id: string
    name: string
    description: string | null
    practice_area_id: string | null
  } | null>(null)

  // Dialog states
  const [templateFormOpen, setTemplateFormOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<{
    id: string
    name: string
    description: string | null
    practice_area_id: string | null
  } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    name: string
  } | null>(null)

  // Keep selected template in sync with refreshed data
  useEffect(() => {
    if (selectedTemplate && templates) {
      const updated = templates.find((t) => t.id === selectedTemplate.id)
      if (updated) {
        setSelectedTemplate({
          id: updated.id,
          name: updated.name,
          description: updated.description,
          practice_area_id: updated.practice_area_id,
        })
      }
    }
  }, [templates, selectedTemplate?.id])

  function handleSelectTemplate(template: {
    id: string
    name: string
    description: string | null
    practice_area_id: string | null
  }) {
    setSelectedTemplate(template)
    setView('detail')
  }

  function handleDeleteTemplate() {
    if (!deleteTarget) return
    deleteTemplate.mutate(deleteTarget.id, {
      onSuccess: () => {
        setDeleteTarget(null)
        if (selectedTemplate?.id === deleteTarget.id) {
          setSelectedTemplate(null)
          setView('list')
        }
      },
    })
  }

  // Loading state
  if (tenantLoading || userLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-2 h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  // Detail view
  if (view === 'detail' && selectedTemplate) {
    return (
      <TemplateDetailView
        key={selectedTemplate.id}
        template={selectedTemplate}
        tenantId={tenantId}
        userId={userId}
        practiceAreas={practiceAreas ?? []}
        onBack={() => {
          setView('list')
          setSelectedTemplate(null)
        }}
      />
    )
  }

  // List view
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Task Templates
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Create reusable task templates to standardize workflows across
            matters
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingTemplate(null)
            setTemplateFormOpen(true)
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Create Template
        </Button>
      </div>

      {/* Template grid */}
      {templatesLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : !templates || templates.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No task templates"
          description="Create your first task template to standardize and automate task creation across matters."
          actionLabel="Create Template"
          onAction={() => {
            setEditingTemplate(null)
            setTemplateFormOpen(true)
          }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={{
                id: template.id,
                name: template.name,
                description: template.description,
                practice_area_id: template.practice_area_id,
              }}
              practiceAreas={practiceAreas ?? []}
              onSelect={() =>
                handleSelectTemplate({
                  id: template.id,
                  name: template.name,
                  description: template.description,
                  practice_area_id: template.practice_area_id,
                })
              }
              onEdit={() => {
                setEditingTemplate({
                  id: template.id,
                  name: template.name,
                  description: template.description,
                  practice_area_id: template.practice_area_id,
                })
                setTemplateFormOpen(true)
              }}
              onDelete={() =>
                setDeleteTarget({
                  id: template.id,
                  name: template.name,
                })
              }
            />
          ))}
        </div>
      )}

      {/* Create/Edit template dialog */}
      <TemplateFormDialog
        open={templateFormOpen}
        onOpenChange={(open) => {
          setTemplateFormOpen(open)
          if (!open) setEditingTemplate(null)
        }}
        tenantId={tenantId}
        userId={userId}
        template={editingTemplate}
        practiceAreas={practiceAreas ?? []}
      />

      {/* Delete template confirmation */}
      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete Template"
        description={`Are you sure you want to delete "${deleteTarget?.name ?? ''}"? This will deactivate the template and it will no longer be available for use.`}
        onConfirm={handleDeleteTemplate}
        isPending={deleteTemplate.isPending}
      />
    </div>
  )
}
