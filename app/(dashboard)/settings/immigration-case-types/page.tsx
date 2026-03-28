'use client'

import { useState, useMemo } from 'react'
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
  Settings2,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  FileText,
  DollarSign,
  FileBox,
  FileStack,
  Search,
} from 'lucide-react'

import { useTenant } from '@/lib/hooks/use-tenant'
import {
  useAllCaseTypes,
  useCreateCaseType,
  useUpdateCaseType,
  useDeleteCaseType,
  useCaseStages,
  useCreateCaseStage,
  useUpdateCaseStage,
  useDeleteCaseStage,
  useReorderCaseStages,
  useChecklistTemplates,
  useCreateChecklistTemplate,
  useUpdateChecklistTemplate,
  useDeleteChecklistTemplate,
} from '@/lib/queries/immigration'
import { toast } from 'sonner'
import {
  useIrccForms,
  useStreamForms,
  useAddStreamForm,
  useRemoveStreamForm,
} from '@/lib/queries/ircc-forms'
import { useDocumentSlotTemplatesByCaseType } from '@/lib/queries/document-slot-templates'
import { useActiveLibraryEntries, useAddLibraryToCaseType } from '@/lib/queries/tenant-document-library'
import { cn } from '@/lib/utils'
import type { Database } from '@/lib/types/database'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
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

type ImmigrationCaseType = Database['public']['Tables']['immigration_case_types']['Row']
type CaseStageDefinition = Database['public']['Tables']['case_stage_definitions']['Row']
type ChecklistTemplate = Database['public']['Tables']['checklist_templates']['Row']

// ---------- Colour presets ----------

const STAGE_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#3b82f6',
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#f97316',
  '#64748b',
]

const BILLING_TYPES = [
  { value: 'flat_fee', label: 'Flat Fee' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'retainer', label: 'Retainer' },
  { value: 'contingency', label: 'Contingency' },
]

const BUNDLE_LABELS: Record<string, string> = {
  express_entry_pr: 'Express Entry PR',
  spousal_sponsorship: 'Spousal Sponsorship',
  work_permit: 'Work Permit',
  study_permit: 'Study Permit',
  visitor_visa_extension: 'Visitor Visa / Extension',
  refugee_claim: 'Refugee Claim',
  judicial_review: 'Judicial Review',
  citizenship: 'Citizenship',
  lmia: 'LMIA',
}

// ---------- Zod schemas ----------

const caseTypeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(150),
  description: z.string().max(500).optional().or(z.literal('')),
  default_billing_type: z.string().min(1, 'Billing type is required'),
  default_estimated_value: z.string().optional().or(z.literal('')),
})
type CaseTypeFormValues = z.infer<typeof caseTypeSchema>

const stageFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(150),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  description: z.string().max(500).optional().or(z.literal('')),
  is_terminal: z.boolean(),
  client_label: z.string().max(150).optional().or(z.literal('')),
  notify_client_on_stage_change: z.boolean(),
})
type StageFormValues = z.infer<typeof stageFormSchema>

const checklistSchema = z.object({
  document_name: z.string().min(1, 'Document name is required').max(250),
  description: z.string().max(500).optional().or(z.literal('')),
  category: z.string().min(1, 'Category is required').max(100),
  is_required: z.boolean(),
})
type ChecklistFormValues = z.infer<typeof checklistSchema>

// ==========================================================
// Sortable Stage Row
// ==========================================================

function SortableStageRow({
  stage,
  onEdit,
  onDelete,
}: {
  stage: CaseStageDefinition
  onEdit: (stage: CaseStageDefinition) => void
  onDelete: (stage: CaseStageDefinition) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

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

      <div
        className="h-4 w-4 shrink-0 rounded-full"
        style={{ backgroundColor: stage.color ?? '#6366f1' }}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-slate-900">
            {stage.name}
          </span>
          {stage.is_terminal && (
            <Badge variant="secondary" className="gap-1 text-[10px] text-orange-400 bg-orange-950/30 border-orange-200">
              <AlertTriangle className="h-3 w-3" />
              Terminal
            </Badge>
          )}
        </div>
        {stage.client_label && (
          <p className="text-xs text-slate-500 mt-0.5">
            Client sees: {stage.client_label}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600"
          onClick={() => onEdit(stage)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
          onClick={() => onDelete(stage)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ==========================================================
// Case Type Dialog (Create + Edit)
// ==========================================================

function CaseTypeDialog({
  open,
  onOpenChange,
  tenantId,
  caseType,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantId: string
  caseType?: ImmigrationCaseType | null
}) {
  const createMutation = useCreateCaseType()
  const updateMutation = useUpdateCaseType()
  const isEditing = !!caseType

  const form = useForm<CaseTypeFormValues>({
    resolver: zodResolver(caseTypeSchema),
    defaultValues: caseType
      ? {
          name: caseType.name,
          description: caseType.description ?? '',
          default_billing_type: caseType.default_billing_type ?? 'flat_fee',
          default_estimated_value: caseType.default_estimated_value != null
            ? String(caseType.default_estimated_value)
            : '',
        }
      : {
          name: '',
          description: '',
          default_billing_type: 'flat_fee',
          default_estimated_value: '',
        },
  })

  function onSubmit(values: CaseTypeFormValues) {
    const estimatedValue = values.default_estimated_value
      ? Number(values.default_estimated_value)
      : null

    if (isEditing && caseType) {
      updateMutation.mutate(
        {
          id: caseType.id,
          tenantId,
          updates: {
            name: values.name,
            description: values.description || null,
            default_billing_type: values.default_billing_type,
            default_estimated_value: estimatedValue,
          },
        },
        { onSuccess: () => onOpenChange(false) }
      )
    } else {
      createMutation.mutate(
        {
          tenant_id: tenantId,
          name: values.name,
          description: values.description || null,
          default_billing_type: values.default_billing_type,
          default_estimated_value: estimatedValue,
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

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Case Type' : 'Create Case Type'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the case type details.'
              : 'Add a new immigration case type.'}
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
                    <Input placeholder="e.g. Spousal Sponsorship" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="default_billing_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default Billing Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select billing type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {BILLING_TYPES.map((bt) => (
                        <SelectItem key={bt.value} value={bt.value}>
                          {bt.label}
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
              name="default_estimated_value"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default Estimated Value (optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="e.g. 5000"
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
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief description of this case type..."
                      rows={2}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? 'Save Changes' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// ==========================================================
// Delete Case Type Dialog
// ==========================================================

function DeleteCaseTypeDialog({
  open,
  onOpenChange,
  caseType,
  tenantId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  caseType: ImmigrationCaseType | null
  tenantId: string
}) {
  const deleteMutation = useDeleteCaseType()

  function handleDelete() {
    if (!caseType) return
    deleteMutation.mutate(
      { id: caseType.id, tenantId },
      { onSuccess: () => onOpenChange(false) }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete Case Type</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &ldquo;{caseType?.name}&rdquo;?
            Existing matters of this type will not be affected.
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
            {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==========================================================
// Stage Dialog (Create + Edit)
// ==========================================================

function CaseStageDialog({
  open,
  onOpenChange,
  tenantId,
  caseTypeId,
  stage,
  existingStagesCount,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantId: string
  caseTypeId: string
  stage?: CaseStageDefinition | null
  existingStagesCount: number
}) {
  const createMutation = useCreateCaseStage()
  const updateMutation = useUpdateCaseStage()
  const isEditing = !!stage

  const form = useForm<StageFormValues, unknown, StageFormValues>({
    resolver: zodResolver(stageFormSchema) as any,
    defaultValues: stage
      ? {
          name: stage.name,
          color: stage.color ?? '#6366f1',
          description: stage.description ?? '',
          is_terminal: stage.is_terminal,
          client_label: stage.client_label ?? '',
          notify_client_on_stage_change: stage.notify_client_on_stage_change ?? false,
        }
      : {
          name: '',
          color: '#6366f1',
          description: '',
          is_terminal: false,
          client_label: '',
          notify_client_on_stage_change: false,
        },
  })

  function onSubmit(values: StageFormValues) {
    const slug = values.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

    if (isEditing && stage) {
      updateMutation.mutate(
        {
          id: stage.id,
          caseTypeId,
          name: values.name,
          slug,
          color: values.color,
          description: values.description || null,
          is_terminal: values.is_terminal,
          client_label: values.client_label || null,
          notify_client_on_stage_change: values.notify_client_on_stage_change,
        },
        { onSuccess: () => onOpenChange(false) }
      )
    } else {
      createMutation.mutate(
        {
          tenant_id: tenantId,
          case_type_id: caseTypeId,
          name: values.name,
          slug,
          color: values.color,
          description: values.description || null,
          sort_order: existingStagesCount + 1,
          is_terminal: values.is_terminal,
          client_label: values.client_label || null,
          notify_client_on_stage_change: values.notify_client_on_stage_change,
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

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Stage' : 'Add Stage'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update stage settings.' : 'Add a new stage to this case type.'}
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
                    <Input placeholder="e.g. Document Collection" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Colour</FormLabel>
                  <div className="flex flex-wrap gap-2">
                    {STAGE_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={cn(
                          'h-7 w-7 rounded-full transition-all',
                          field.value === c
                            ? 'ring-2 ring-offset-2 ring-primary scale-110'
                            : 'hover:scale-105'
                        )}
                        style={{ backgroundColor: c }}
                        onClick={() => field.onChange(c)}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="client_label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client-Facing Label (optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Gathering Documents"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-4">
              <FormField
                control={form.control}
                name="is_terminal"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="text-sm">Terminal Stage</FormLabel>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notify_client_on_stage_change"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="text-sm">Notify Client</FormLabel>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief description of this stage..."
                      rows={2}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? 'Save Changes' : 'Add Stage'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// ==========================================================
// Delete Stage Dialog
// ==========================================================

function DeleteStageDialog({
  open,
  onOpenChange,
  stage,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  stage: CaseStageDefinition | null
}) {
  const deleteMutation = useDeleteCaseStage()

  function handleDelete() {
    if (!stage) return
    deleteMutation.mutate(
      { id: stage.id, caseTypeId: stage.case_type_id },
      { onSuccess: () => onOpenChange(false) }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete Stage</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &ldquo;{stage?.name}&rdquo;?
            Matters currently in this stage may be affected.
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
            {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete Stage
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==========================================================
// Checklist Template Dialog (Create + Edit)
// ==========================================================

function ChecklistDialog({
  open,
  onOpenChange,
  tenantId,
  caseTypeId,
  template,
  existingCount,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantId: string
  caseTypeId: string
  template?: ChecklistTemplate | null
  existingCount: number
}) {
  const createMutation = useCreateChecklistTemplate()
  const updateMutation = useUpdateChecklistTemplate()
  const isEditing = !!template

  const form = useForm<ChecklistFormValues>({
    resolver: zodResolver(checklistSchema),
    defaultValues: template
      ? {
          document_name: template.document_name,
          description: template.description ?? '',
          category: template.category ?? 'general',
          is_required: template.is_required,
        }
      : {
          document_name: '',
          description: '',
          category: 'general',
          is_required: true,
        },
  })

  function onSubmit(values: ChecklistFormValues) {
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
          sort_order: existingCount + 1,
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

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Document' : 'Add Document'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the document checklist item.'
              : 'Add a required document to this case type.'}
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
                    <Input placeholder="e.g. Marriage Certificate" {...field} />
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
                  <FormControl>
                    <Input placeholder="e.g. identity, relationship, financial" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_required"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <FormLabel className="text-sm font-medium">Required Document</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      Must be submitted before case completion
                    </p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
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
                      placeholder="Additional details or instructions..."
                      rows={2}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? 'Save Changes' : 'Add Document'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// ==========================================================
// Delete Checklist Dialog
// ==========================================================

function DeleteChecklistDialog({
  open,
  onOpenChange,
  template,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: ChecklistTemplate | null
}) {
  const deleteMutation = useDeleteChecklistTemplate()

  function handleDelete() {
    if (!template) return
    deleteMutation.mutate(
      { id: template.id, caseTypeId: template.case_type_id },
      { onSuccess: () => onOpenChange(false) }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete Document</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &ldquo;{template?.document_name}&rdquo;
            from the checklist?
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
            {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==========================================================
// Stages Section (expandable, with drag-to-reorder)
// ==========================================================

function StagesSection({
  caseTypeId,
  tenantId,
}: {
  caseTypeId: string
  tenantId: string
}) {
  const [expanded, setExpanded] = useState(true)
  const { data: stages, isLoading } = useCaseStages(caseTypeId)
  const reorderStages = useReorderCaseStages()

  const [stageFormOpen, setStageFormOpen] = useState(false)
  const [editingStage, setEditingStage] = useState<CaseStageDefinition | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CaseStageDefinition | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const stageIds = useMemo(() => (stages ?? []).map((s) => s.id), [stages])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !stages) return

    const oldIndex = stages.findIndex((s) => s.id === active.id)
    const newIndex = stages.findIndex((s) => s.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(stages, oldIndex, newIndex)
    const updates = reordered.map((s, i) => ({ id: s.id, sort_order: i + 1 }))
    reorderStages.mutate({ stages: updates, caseTypeId })
  }

  return (
    <div className="rounded-lg border bg-white">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50/50"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <span className="text-sm font-semibold text-slate-900">
            Pipeline Stages
          </span>
          <span className="text-xs text-slate-400 ml-2">
            {stages?.length ?? 0} {(stages?.length ?? 0) === 1 ? 'stage' : 'stages'}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t">
          {isLoading ? (
            <div className="space-y-2 pt-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : !stages || stages.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-slate-400">No stages yet</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => {
                  setEditingStage(null)
                  setStageFormOpen(true)
                }}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Stage
              </Button>
            </div>
          ) : (
            <>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={stageIds} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1.5 pt-2">
                    {stages.map((stage) => (
                      <SortableStageRow
                        key={stage.id}
                        stage={stage}
                        onEdit={(s) => {
                          setEditingStage(s)
                          setStageFormOpen(true)
                        }}
                        onDelete={(s) => setDeleteTarget(s)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => {
                  setEditingStage(null)
                  setStageFormOpen(true)
                }}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Stage
              </Button>
            </>
          )}

          <CaseStageDialog
            open={stageFormOpen}
            onOpenChange={(open) => {
              setStageFormOpen(open)
              if (!open) setEditingStage(null)
            }}
            tenantId={tenantId}
            caseTypeId={caseTypeId}
            stage={editingStage}
            existingStagesCount={stages?.length ?? 0}
          />

          <DeleteStageDialog
            open={!!deleteTarget}
            onOpenChange={(open) => {
              if (!open) setDeleteTarget(null)
            }}
            stage={deleteTarget}
          />
        </div>
      )}
    </div>
  )
}

// ==========================================================
// Checklist Section
// ==========================================================

function ChecklistSection({
  caseTypeId,
  tenantId,
}: {
  caseTypeId: string
  tenantId: string
}) {
  const [expanded, setExpanded] = useState(true)
  const { data: templates, isLoading } = useChecklistTemplates(caseTypeId)

  const [formOpen, setFormOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<ChecklistTemplate | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ChecklistTemplate | null>(null)

  // Group templates by category
  const grouped = useMemo(() => {
    if (!templates) return new Map<string, ChecklistTemplate[]>()
    const map = new Map<string, ChecklistTemplate[]>()
    for (const t of templates) {
      const cat = t.category || 'general'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(t)
    }
    return map
  }, [templates])

  return (
    <div className="rounded-lg border bg-white">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50/50"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <span className="text-sm font-semibold text-slate-900">
            Document Checklist
          </span>
          <span className="text-xs text-slate-400 ml-2">
            {templates?.length ?? 0} {(templates?.length ?? 0) === 1 ? 'document' : 'documents'}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t">
          {isLoading ? (
            <div className="space-y-2 pt-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : !templates || templates.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-slate-400">No documents yet</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => {
                  setEditingTemplate(null)
                  setFormOpen(true)
                }}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Document
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-3 pt-2">
                {Array.from(grouped.entries()).map(([category, items]) => (
                  <div key={category}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      {category}
                    </p>
                    <div className="space-y-1">
                      {items.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center gap-3 rounded-lg border bg-white px-3 py-2"
                        >
                          <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium text-slate-900">
                                {t.document_name}
                              </span>
                              {t.is_required && (
                                <Badge variant="secondary" className="text-[10px] text-red-400 bg-red-950/30 border-red-200">
                                  Required
                                </Badge>
                              )}
                            </div>
                            {t.description && (
                              <p className="text-xs text-slate-500 truncate mt-0.5">{t.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600"
                              onClick={() => {
                                setEditingTemplate(t)
                                setFormOpen(true)
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
                              onClick={() => setDeleteTarget(t)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => {
                  setEditingTemplate(null)
                  setFormOpen(true)
                }}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Document
              </Button>
            </>
          )}

          <ChecklistDialog
            open={formOpen}
            onOpenChange={(open) => {
              setFormOpen(open)
              if (!open) setEditingTemplate(null)
            }}
            tenantId={tenantId}
            caseTypeId={caseTypeId}
            template={editingTemplate}
            existingCount={templates?.length ?? 0}
          />

          <DeleteChecklistDialog
            open={!!deleteTarget}
            onOpenChange={(open) => {
              if (!open) setDeleteTarget(null)
            }}
            template={deleteTarget}
          />
        </div>
      )}
    </div>
  )
}

// ==========================================================
// Document Slot Templates Section (expandable)
// ==========================================================

function DocumentSlotTemplatesSection({
  caseTypeId,
  tenantId,
}: {
  caseTypeId: string
  tenantId: string
}) {
  const [expanded, setExpanded] = useState(true)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [filterTag, setFilterTag] = useState('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const { data: templates, isLoading } = useDocumentSlotTemplatesByCaseType(caseTypeId)
  const { data: libraryEntries } = useActiveLibraryEntries(tenantId)
  const addFromLibrary = useAddLibraryToCaseType()

  const existingSlugs = useMemo(() => {
    if (!templates) return new Set<string>()
    return new Set(templates.map((t) => t.slot_slug))
  }, [templates])

  const allTags = useMemo(() => {
    const tags = new Set<string>()
    for (const e of libraryEntries ?? []) {
      for (const t of (e.tags ?? [])) tags.add(t)
    }
    return Array.from(tags).sort()
  }, [libraryEntries])

  const filteredLibrary = useMemo(() => {
    if (!libraryEntries) return []
    return libraryEntries.filter((e) => {
      if (filterTag !== 'all' && !(e.tags ?? []).includes(filterTag)) return false
      if (search) {
        const q = search.toLowerCase()
        return e.slot_name.toLowerCase().includes(q) || (e.description ?? '').toLowerCase().includes(q)
      }
      return true
    })
  }, [libraryEntries, search, filterTag])

  async function handleAdd() {
    if (selected.size === 0) return
    const entries = (libraryEntries ?? []).filter((e) => selected.has(e.id))
    try {
      const result = await addFromLibrary.mutateAsync({
        entries,
        caseTypeId,
        tenantId,
        existingSlugs,
        currentCount: templates?.length ?? 0,
      })
      if (result.added === 0) {
        toast.info('All selected entries already exist on this case type.')
      } else {
        toast.success(`${result.added} document slot${result.added !== 1 ? 's' : ''} added`)
      }
      setLibraryOpen(false)
      setSelected(new Set())
      setSearch('')
    } catch {
      toast.error('Failed to add document slots')
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSelectAll() {
    const newOnes = filteredLibrary.filter((e) => !existingSlugs.has(e.slot_slug))
    setSelected(new Set(newOnes.map((e) => e.id)))
  }

  type SlotTemplate = NonNullable<typeof templates>[number]
  const grouped = useMemo(() => {
    const map = new Map<string, SlotTemplate[]>()
    if (!templates) return map
    for (const tmpl of templates) {
      const cat = tmpl.category || 'general'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(tmpl)
    }
    return map
  }, [templates])

  return (
    <div className="rounded-lg border bg-white">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50/50"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <span className="text-sm font-semibold text-slate-900">
            Document Slot Templates
          </span>
          <span className="text-xs text-slate-400 ml-2">
            {templates?.length ?? 0} {(templates?.length ?? 0) === 1 ? 'template' : 'templates'}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t">
          <div className="flex items-center gap-2 mb-3 pt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => { e.stopPropagation(); setLibraryOpen(true) }}
            >
              <FileBox className="mr-1.5 h-3.5 w-3.5" />
              Add from Library
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : !templates || templates.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-sm text-slate-400">
                No document slot templates yet. Use &ldquo;Add from Library&rdquo; above to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {Array.from(grouped.entries()).map(([category, items]) => (
                <div key={category}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    {category}
                  </p>
                  <div className="space-y-1">
                    {items.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center gap-3 rounded-lg border bg-white px-3 py-2"
                      >
                        <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-slate-900">
                              {t.slot_name}
                            </span>
                            {t.is_required && (
                              <Badge variant="secondary" className="text-[10px] text-red-400 bg-red-950/30 border-red-200">
                                Required
                              </Badge>
                            )}
                            {t.person_role_scope && (
                              <Badge variant="outline" className="text-[10px]">
                                {t.person_role_scope}
                              </Badge>
                            )}
                            {t.library_slot_id && (
                              <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-200">
                                library
                              </Badge>
                            )}
                          </div>
                          {t.description && (
                            <p className="text-xs text-slate-500 truncate mt-0.5">{t.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-xs text-slate-400 pt-1">
                Manage individual templates in Settings → Document Slot Templates.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Add from Library Dialog */}
      <Dialog open={libraryOpen} onOpenChange={(o) => { if (!o) { setLibraryOpen(false); setSelected(new Set()); setSearch('') } }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add from Document Library</DialogTitle>
            <DialogDescription>
              Select documents to add to this case type. Already-assigned entries are greyed out.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2 pt-1">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search library..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            <Select value={filterTag} onValueChange={setFilterTag}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue placeholder="All bundles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All bundles</SelectItem>
                {allTags.map((t) => (
                  <SelectItem key={t} value={t}>{BUNDLE_LABELS[t] ?? t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between px-0.5 py-1">
            <span className="text-xs text-slate-500">
              {selected.size} selected
            </span>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleSelectAll}>
              Select all visible
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 min-h-0 border rounded-md p-2">
            {filteredLibrary.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">
                {search || filterTag !== 'all' ? 'No entries match.' : 'Library is empty  -  seed it first.'}
              </p>
            ) : (
              filteredLibrary.map((entry) => {
                const alreadyAdded = existingSlugs.has(entry.slot_slug)
                const isSelected = selected.has(entry.id)
                return (
                  <label
                    key={entry.id}
                    className={`flex items-start gap-3 rounded px-2 py-2 cursor-pointer select-none transition-colors ${
                      alreadyAdded ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-50'
                    } ${isSelected ? 'bg-blue-950/30/60' : ''}`}
                  >
                    <Checkbox
                      checked={isSelected || alreadyAdded}
                      disabled={alreadyAdded}
                      onCheckedChange={() => !alreadyAdded && toggleSelect(entry.id)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium">{entry.slot_name}</span>
                        {entry.is_required && (
                          <Badge variant="secondary" className="text-[10px] text-red-400 bg-red-950/30 border-red-200">
                            Required
                          </Badge>
                        )}
                        {alreadyAdded && (
                          <Badge variant="outline" className="text-[10px] text-green-600 border-green-200">
                            added
                          </Badge>
                        )}
                      </div>
                      {entry.description && (
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{entry.description}</p>
                      )}
                    </div>
                  </label>
                )
              })
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => { setLibraryOpen(false); setSelected(new Set()); setSearch('') }}>
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={selected.size === 0 || addFromLibrary.isPending}
            >
              {addFromLibrary.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add {selected.size > 0 ? selected.size : ''} Slot{selected.size !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ==========================================================
// Stream IRCC Forms Section
// ==========================================================

function StreamFormsSection({
  caseTypeId,
  tenantId,
}: {
  caseTypeId: string
  tenantId: string
}) {
  const [expanded, setExpanded] = useState(true)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const { data: streamForms, isLoading } = useStreamForms(caseTypeId)
  const { data: allForms } = useIrccForms()
  const addMutation = useAddStreamForm()
  const removeMutation = useRemoveStreamForm()

  // Forms not yet assigned to this stream
  const availableForms = useMemo(() => {
    if (!allForms || !streamForms) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assignedIds = new Set((streamForms as any[]).map((sf: any) => sf.form_id))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (allForms as any[]).filter((f: any) => !assignedIds.has(f.id))
  }, [allForms, streamForms])

  const handleAdd = (formId: string) => {
    addMutation.mutate({
      tenantId,
      caseTypeId,
      formId,
      sortOrder: (streamForms?.length ?? 0),
      isRequired: true,
    })
    setAddDialogOpen(false)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleRemove = (streamForm: any) => {
    removeMutation.mutate({
      streamFormId: streamForm.id,
      caseTypeId,
    })
  }

  return (
    <div className="rounded-lg border bg-white">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50/50"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <span className="text-sm font-semibold text-slate-900">
            IRCC Forms
          </span>
          <span className="text-xs text-slate-400 ml-2">
            {streamForms?.length ?? 0} {(streamForms?.length ?? 0) === 1 ? 'form' : 'forms'}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t">
          {isLoading ? (
            <div className="space-y-2 pt-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : !streamForms || streamForms.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-slate-400">No IRCC forms assigned</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => setAddDialogOpen(true)}
                disabled={!allForms || allForms.length === 0}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Form
              </Button>
              {(!allForms || allForms.length === 0) && (
                <p className="text-xs text-slate-400 mt-2">
                  Upload forms in Settings &gt; IRCC Form Library first
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-1 pt-2">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(streamForms as any[]).map((sf: any) => (
                  <div
                    key={sf.id}
                    className="flex items-center gap-3 rounded-lg border bg-white px-3 py-2"
                  >
                    <FileStack className="h-4 w-4 shrink-0 text-rose-500" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-slate-900">
                          {sf.form?.form_code ?? 'Unknown Form'}
                        </span>
                        {sf.is_required && (
                          <Badge variant="secondary" className="text-[10px] text-red-400 bg-red-950/30 border-red-200">
                            Required
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {sf.form?.form_name ?? ''}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
                      onClick={() => handleRemove(sf)}
                      disabled={removeMutation.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => setAddDialogOpen(true)}
                disabled={availableForms.length === 0}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Form
              </Button>
            </>
          )}
        </div>
      )}

      {/* Add Form Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add IRCC Form</DialogTitle>
            <DialogDescription>
              Select an IRCC form to add to this immigration stream.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {availableForms.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">
                All forms have been assigned, or no forms are uploaded yet.
              </p>
            ) : (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              availableForms.map((f: any) => (
                <button
                  key={f.id}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
                  onClick={() => handleAdd(f.id)}
                  disabled={addMutation.isPending}
                >
                  <FileStack className="h-4 w-4 shrink-0 text-rose-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">{f.form_code}</p>
                    <p className="text-xs text-slate-500 truncate">{f.form_name}</p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {f.scan_status === 'scanned' ? `${f.field_count ?? 0} fields` : f.scan_status}
                  </Badge>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ==========================================================
// Detail Panel (right side  -  stages + checklist for selected type)
// ==========================================================

function DetailPanel({
  caseType,
  tenantId,
}: {
  caseType: ImmigrationCaseType
  tenantId: string
}) {
  const billingLabel = BILLING_TYPES.find((b) => b.value === caseType.default_billing_type)?.label ?? caseType.default_billing_type

  return (
    <div className="flex flex-col h-full">
      <div className="px-1 pb-4">
        <h2 className="text-lg font-semibold text-slate-900">{caseType.name}</h2>
        {caseType.description && (
          <p className="text-sm text-slate-500 mt-0.5">{caseType.description}</p>
        )}
        <div className="flex items-center gap-3 mt-2">
          <Badge variant="secondary" className="gap-1 text-xs">
            <DollarSign className="h-3 w-3" />
            {billingLabel}
          </Badge>
          {caseType.default_estimated_value != null && (
            <span className="text-xs text-slate-500">
              Est. ${caseType.default_estimated_value.toLocaleString()}
            </span>
          )}
        </div>
      </div>

      <Separator />

      <ScrollArea className="flex-1 pt-4">
        <div className="space-y-3 pr-2">
          <StagesSection caseTypeId={caseType.id} tenantId={tenantId} />
          <StreamFormsSection caseTypeId={caseType.id} tenantId={tenantId} />
          <DocumentSlotTemplatesSection caseTypeId={caseType.id} tenantId={tenantId} />
          <ChecklistSection caseTypeId={caseType.id} tenantId={tenantId} />
        </div>
      </ScrollArea>
    </div>
  )
}

// ==========================================================
// Case Type Card (left panel)
// ==========================================================

function CaseTypeCard({
  caseType,
  isSelected,
  stageCount,
  onClick,
  onEdit,
  onDelete,
}: {
  caseType: ImmigrationCaseType
  isSelected: boolean
  stageCount?: number
  onClick: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const billingLabel = BILLING_TYPES.find((b) => b.value === caseType.default_billing_type)?.label ?? caseType.default_billing_type

  return (
    <Card
      className={cn(
        'cursor-pointer p-4 transition-all hover:shadow-sm',
        isSelected
          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
          : 'hover:border-slate-300'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="truncate text-sm font-semibold text-slate-900">
            {caseType.name}
          </span>
          {caseType.description && (
            <p className="text-xs text-slate-500 truncate mt-0.5">{caseType.description}</p>
          )}
          <div className="mt-1.5 flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">
              {billingLabel}
            </Badge>
            {stageCount !== undefined && (
              <span className="text-xs text-slate-400">
                {stageCount} {stageCount === 1 ? 'stage' : 'stages'}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600"
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  )
}

// Wrapper that fetches stage count
function CaseTypeCardWithCount({
  caseType,
  isSelected,
  onClick,
  onEdit,
  onDelete,
}: {
  caseType: ImmigrationCaseType
  isSelected: boolean
  onClick: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { data: stages } = useCaseStages(caseType.id)
  return (
    <CaseTypeCard
      caseType={caseType}
      isSelected={isSelected}
      stageCount={stages?.length}
      onClick={onClick}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  )
}

// ==========================================================
// Main Page
// ==========================================================

export default function ImmigrationCaseTypesPage() {
  const { tenant, isLoading: tenantLoading } = useTenant()
  const tenantId = tenant?.id ?? ''

  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ImmigrationCaseType | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ImmigrationCaseType | null>(null)

  const { data: caseTypes, isLoading: ctLoading } = useAllCaseTypes(tenantId)

  // Only show active types in the list
  const activeCaseTypes = useMemo(
    () => (caseTypes ?? []).filter((ct) => ct.is_active),
    [caseTypes]
  )

  const selectedType = useMemo(
    () => activeCaseTypes.find((ct) => ct.id === selectedTypeId) ?? null,
    [activeCaseTypes, selectedTypeId]
  )

  const hasSelection = selectedTypeId && activeCaseTypes.some((ct) => ct.id === selectedTypeId)

  if (tenantLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-2 h-4 w-96" />
        </div>
        <div className="flex gap-6">
          <div className="w-2/5 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
          <div className="flex-1">
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Deprecation Banner */}
      <div className="rounded-lg border border-amber-200 bg-amber-950/30 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              Immigration Case Types are being replaced by Matter Types
            </p>
            <p className="text-sm text-amber-400 mt-1">
              IRCC form assignments and case pipeline configuration have moved to{' '}
              <a href="/settings/matter-types" className="font-medium underline hover:text-amber-900">
                Settings → Matter Types
              </a>
              . Existing case types here will continue to work for existing matters.
            </p>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Immigration Case Types</h1>
          <p className="mt-1 text-sm text-slate-500">
            Configure case types, pipeline stages, and document checklists
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Case Type
        </Button>
      </div>

      <Separator />

      {/* Main content: two panels */}
      <div className="flex gap-6" style={{ minHeight: '65vh' }}>
        {/* Left panel: case type list */}
        <div className="w-2/5 flex flex-col">
          {ctLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : activeCaseTypes.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
              <Settings2 className="h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-600">
                No case types configured yet
              </p>
              <p className="mt-1 text-sm text-slate-400">
                Create your first immigration case type to get started.
              </p>
              <Button
                size="sm"
                className="mt-4"
                onClick={() => setCreateDialogOpen(true)}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add Case Type
              </Button>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="space-y-2 pr-2">
                {activeCaseTypes.map((ct) => (
                  <CaseTypeCardWithCount
                    key={ct.id}
                    caseType={ct}
                    isSelected={selectedTypeId === ct.id}
                    onClick={() => setSelectedTypeId(ct.id)}
                    onEdit={() => setEditTarget(ct)}
                    onDelete={() => setDeleteTarget(ct)}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Right panel: stages + checklist */}
        <div className="flex-1 rounded-lg border bg-slate-50/50 p-5">
          {selectedType && hasSelection ? (
            <DetailPanel
              key={selectedType.id}
              caseType={selectedType}
              tenantId={tenantId}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Settings2 className="h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-600">
                No case type selected
              </p>
              <p className="mt-1 text-sm text-slate-400">
                Select a case type from the left to manage its stages and documents.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Create case type dialog */}
      <CaseTypeDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        tenantId={tenantId}
      />

      {/* Edit case type dialog */}
      {editTarget && (
        <CaseTypeDialog
          open={!!editTarget}
          onOpenChange={(open) => {
            if (!open) setEditTarget(null)
          }}
          tenantId={tenantId}
          caseType={editTarget}
        />
      )}

      {/* Delete case type dialog */}
      <DeleteCaseTypeDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        caseType={deleteTarget}
        tenantId={tenantId}
      />
    </div>
  )
}
