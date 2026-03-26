'use client'

import { useState, useMemo, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus,
  GripVertical,
  Pencil,
  Trash2,
  Loader2,
  Asterisk,
  FileCheck2,
  FolderOpen,
} from 'lucide-react'

import { useTenant } from '@/lib/hooks/use-tenant'
import {
  useCaseTypes,
  useChecklistTemplates,
  useCreateChecklistTemplate,
  useUpdateChecklistTemplate,
  useDeleteChecklistTemplate,
  useReorderChecklistTemplates,
} from '@/lib/queries/immigration'
import { CHECKLIST_CATEGORIES } from '@/lib/utils/constants'
import { cn } from '@/lib/utils'
import type { Database } from '@/lib/types/database'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
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

type ChecklistTemplate = Database['public']['Tables']['checklist_templates']['Row']
type ImmigrationCaseType = Database['public']['Tables']['immigration_case_types']['Row']

// ---------- Zod schemas ----------

const templateSchema = z.object({
  document_name: z.string().min(1, 'Document name is required').max(200),
  description: z.string().max(500).optional().or(z.literal('')),
  category: z.string().min(1, 'Category is required'),
  is_required: z.boolean(),
})
type TemplateFormValues = z.infer<typeof templateSchema>

// ==========================================================
// Sortable Template Row
// ==========================================================

function SortableTemplateRow({
  template,
  onEdit,
  onDelete,
}: {
  template: ChecklistTemplate
  onEdit: (t: ChecklistTemplate) => void
  onDelete: (t: ChecklistTemplate) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: template.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const categoryLabel =
    CHECKLIST_CATEGORIES.find((c) => c.value === template.category)?.label ?? template.category

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-white px-3 py-2.5 transition-shadow',
        isDragging && 'z-50 shadow-lg ring-2 ring-primary/20'
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-slate-400 hover:text-slate-600"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-slate-900">
            {template.document_name}
          </span>
          {template.is_required && (
            <Asterisk className="h-3 w-3 text-red-500 flex-shrink-0" />
          )}
          <Badge variant="secondary" className="text-[10px] shrink-0">
            {categoryLabel}
          </Badge>
        </div>
        {template.description && (
          <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
            {template.description}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600"
          onClick={() => onEdit(template)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
          onClick={() => onDelete(template)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ==========================================================
// Template Dialog (Create + Edit)
// ==========================================================

function TemplateDialog({
  open,
  onOpenChange,
  tenantId,
  caseTypeId,
  template,
  nextSortOrder,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantId: string
  caseTypeId: string
  template?: ChecklistTemplate | null
  nextSortOrder: number
}) {
  const createMutation = useCreateChecklistTemplate()
  const updateMutation = useUpdateChecklistTemplate()
  const isEditing = !!template

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: template
      ? {
          document_name: template.document_name,
          description: template.description ?? '',
          category: template.category,
          is_required: template.is_required,
        }
      : {
          document_name: '',
          description: '',
          category: 'general',
          is_required: false,
        },
  })

  // Reset form when template changes
  useEffect(() => {
    if (template) {
      form.reset({
        document_name: template.document_name,
        description: template.description ?? '',
        category: template.category,
        is_required: template.is_required,
      })
    } else {
      form.reset({
        document_name: '',
        description: '',
        category: 'general',
        is_required: false,
      })
    }
  }, [template, form])

  function onSubmit(values: TemplateFormValues) {
    if (isEditing && template) {
      updateMutation.mutate(
        {
          id: template.id,
          caseTypeId,
          document_name: values.document_name,
          description: values.description || null,
          category: values.category,
          is_required: values.is_required,
        },
        { onSuccess: () => onOpenChange(false) }
      )
    } else {
      createMutation.mutate(
        {
          tenant_id: tenantId,
          case_type_id: caseTypeId,
          document_name: values.document_name,
          description: values.description || null,
          category: values.category,
          is_required: values.is_required,
          sort_order: nextSortOrder,
        },
        { onSuccess: () => onOpenChange(false) }
      )
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Document Template' : 'Add Document Template'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the document template details.'
              : 'Add a new document to request from clients for this case type.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="document_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Document Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Valid Passport" {...field} />
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
                      placeholder="Brief instructions for the client..."
                      className="resize-none"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CHECKLIST_CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
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
              name="is_required"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0">Required document</FormLabel>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isEditing ? 'Save Changes' : 'Add Template'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// ==========================================================
// Delete Confirmation Dialog
// ==========================================================

function DeleteConfirmDialog({
  open,
  onOpenChange,
  template,
  caseTypeId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: ChecklistTemplate | null
  caseTypeId: string
}) {
  const deleteMutation = useDeleteChecklistTemplate()

  function handleDelete() {
    if (!template) return
    deleteMutation.mutate(
      { id: template.id, caseTypeId },
      { onSuccess: () => onOpenChange(false) }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Document Template</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &ldquo;{template?.document_name}&rdquo;? This will not
            affect existing matter checklists that were already initialized from this template.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==========================================================
// Main Page
// ==========================================================

export default function DocumentTemplatesPage() {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''

  const { data: caseTypes, isLoading: caseTypesLoading } = useCaseTypes(tenantId)

  const [selectedCaseTypeId, setSelectedCaseTypeId] = useState<string | null>(null)

  // Auto-select first case type
  useEffect(() => {
    if (caseTypes && caseTypes.length > 0 && !selectedCaseTypeId) {
      setSelectedCaseTypeId(caseTypes[0].id)
    }
  }, [caseTypes, selectedCaseTypeId])

  const { data: templates, isLoading: templatesLoading } = useChecklistTemplates(
    selectedCaseTypeId ?? ''
  )
  const reorderMutation = useReorderChecklistTemplates()

  // Dialog state
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<ChecklistTemplate | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingTemplate, setDeletingTemplate] = useState<ChecklistTemplate | null>(null)

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Group templates by category
  const groupedTemplates = useMemo(() => {
    if (!templates) return []
    const grouped = new Map<string, ChecklistTemplate[]>()
    for (const t of templates) {
      const cat = t.category || 'general'
      if (!grouped.has(cat)) grouped.set(cat, [])
      grouped.get(cat)!.push(t)
    }
    const categoryOrder = CHECKLIST_CATEGORIES.map((c) => c.value)
    return [...grouped.entries()].sort(
      (a, b) =>
        categoryOrder.indexOf(a[0] as (typeof categoryOrder)[number]) -
        categoryOrder.indexOf(b[0] as (typeof categoryOrder)[number])
    )
  }, [templates])

  const selectedCaseType = caseTypes?.find((ct) => ct.id === selectedCaseTypeId)

  function handleEdit(template: ChecklistTemplate) {
    setEditingTemplate(template)
    setTemplateDialogOpen(true)
  }

  function handleDelete(template: ChecklistTemplate) {
    setDeletingTemplate(template)
    setDeleteDialogOpen(true)
  }

  function handleAddNew() {
    setEditingTemplate(null)
    setTemplateDialogOpen(true)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !templates || !selectedCaseTypeId) return

    const oldIndex = templates.findIndex((t) => t.id === active.id)
    const newIndex = templates.findIndex((t) => t.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(templates, oldIndex, newIndex)
    const updates = reordered.map((t, i) => ({ id: t.id, sort_order: i }))
    reorderMutation.mutate({ templates: updates, caseTypeId: selectedCaseTypeId })
  }

  const nextSortOrder = (templates?.length ?? 0)

  // Loading
  if (caseTypesLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Document Templates</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage which documents are requested from clients for each immigration case type.
          </p>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Left: Case type list */}
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50">
            <h2 className="text-sm font-medium text-slate-700">Case Types</h2>
          </div>
          <ScrollArea className="h-[calc(100vh-280px)]">
            <div className="p-2 space-y-0.5">
              {(!caseTypes || caseTypes.length === 0) ? (
                <p className="text-sm text-slate-500 p-3 text-center">
                  No case types configured.
                </p>
              ) : (
                caseTypes.map((ct) => (
                  <button
                    key={ct.id}
                    type="button"
                    onClick={() => setSelectedCaseTypeId(ct.id)}
                    className={cn(
                      'w-full text-left rounded-md px-3 py-2.5 text-sm transition-colors',
                      selectedCaseTypeId === ct.id
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-slate-700 hover:bg-slate-50'
                    )}
                  >
                    <span className="truncate block">{ct.name}</span>
                    {ct.description && (
                      <span className="text-xs text-slate-500 line-clamp-1 mt-0.5 block">
                        {ct.description}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </Card>

        {/* Right: Templates for selected case type */}
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
            <div>
              <h2 className="text-sm font-medium text-slate-700">
                {selectedCaseType
                  ? `${selectedCaseType.name}  -  Document Templates`
                  : 'Select a case type'}
              </h2>
              {templates && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {templates.length} template{templates.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            {selectedCaseTypeId && (
              <Button size="sm" onClick={handleAddNew}>
                <Plus className="h-4 w-4 mr-1" />
                Add Document
              </Button>
            )}
          </div>

          <ScrollArea className="h-[calc(100vh-280px)]">
            {!selectedCaseTypeId ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FolderOpen className="h-12 w-12 text-slate-300 mb-3" />
                <p className="text-sm text-slate-500">Select a case type to manage its document templates.</p>
              </div>
            ) : templatesLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !templates || templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FileCheck2 className="h-12 w-12 text-slate-300 mb-3" />
                <h3 className="text-sm font-medium text-slate-900">No document templates</h3>
                <p className="text-sm text-slate-500 mt-1 max-w-sm">
                  Add document templates that will be requested from clients for this case type.
                </p>
                <Button className="mt-4" size="sm" onClick={handleAddNew}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add First Template
                </Button>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {groupedTemplates.map(([category, catTemplates]) => {
                  const catLabel =
                    CHECKLIST_CATEGORIES.find((c) => c.value === category)?.label ?? category

                  return (
                    <div key={category}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                          {catLabel}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          {catTemplates.length}
                        </Badge>
                      </div>

                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext
                          items={catTemplates.map((t) => t.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="space-y-1.5">
                            {catTemplates.map((template) => (
                              <SortableTemplateRow
                                key={template.id}
                                template={template}
                                onEdit={handleEdit}
                                onDelete={handleDelete}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    </div>
                  )
                })}
              </div>
            )}
          </ScrollArea>
        </Card>
      </div>

      {/* Template Dialog */}
      {selectedCaseTypeId && (
        <TemplateDialog
          open={templateDialogOpen}
          onOpenChange={setTemplateDialogOpen}
          tenantId={tenantId}
          caseTypeId={selectedCaseTypeId}
          template={editingTemplate}
          nextSortOrder={nextSortOrder}
        />
      )}

      {/* Delete Confirmation */}
      {selectedCaseTypeId && (
        <DeleteConfirmDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          template={deletingTemplate}
          caseTypeId={selectedCaseTypeId}
        />
      )}
    </div>
  )
}
