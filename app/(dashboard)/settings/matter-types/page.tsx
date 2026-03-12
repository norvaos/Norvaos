'use client'

import { useState, useMemo, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
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
  Star,
  Loader2,
  Settings2,
  ChevronDown,
  ChevronRight,
  Clock,
  AlertTriangle,
  XCircle,
  FileBox,
  FileText,
  Check,
  LayoutList,
  Eye,
  EyeOff,
  Search,
  ToggleLeft,
  ToggleRight,
  Layers,
  MoreHorizontal,
  HelpCircle,
  Save,
  X,
} from 'lucide-react'

import { useTenant } from '@/lib/hooks/use-tenant'
import {
  useMatterTypes,
  useCreateMatterType,
  useUpdateMatterType,
  useMatterStagePipelines,
  useMatterStages,
  useCreateMatterStagePipeline,
  useUpdateMatterStagePipeline,
  useDeleteMatterStagePipeline,
  useCreateMatterStage,
  useUpdateMatterStage,
  useDeleteMatterStage,
  useReorderMatterStages,
  useMatterTypeIntakeSchema,
  useUpdateMatterTypeIntakeSchema,
  type IntakeQuestion,
} from '@/lib/queries/matter-types'
import {
  useIrccForms,
  useStreamFormsByMatterType,
  useMatterTypeSectionConfig,
  useBulkUpsertSectionConfig,
  useUpdateSectionFieldConfig,
} from '@/lib/queries/ircc-forms'
import { getSectionFields } from '@/lib/config/section-field-registry'
import type { CustomFieldDef, FieldVisibility } from '@/lib/types/ircc-forms'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useDocumentSlotTemplatesByMatterType } from '@/lib/queries/document-slot-templates'
import { useActiveLibraryEntries, useAddLibraryToMatterType } from '@/lib/queries/tenant-document-library'
import { cn } from '@/lib/utils'
import type { Database } from '@/lib/types/database'
import { UnifiedFormsQuestionsSection } from '@/components/ircc/unified-forms-questions-section'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

type MatterType = Database['public']['Tables']['matter_types']['Row']
type MatterStagePipeline = Database['public']['Tables']['matter_stage_pipelines']['Row']
type MatterStage = Database['public']['Tables']['matter_stages']['Row']
type PracticeArea = Database['public']['Tables']['practice_areas']['Row']

// ---------- Inline practice areas hook ----------

function usePracticeAreas(tenantId: string) {
  return useQuery({
    queryKey: ['practice-areas', tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('practice_areas')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data as PracticeArea[]
    },
    enabled: !!tenantId,
  })
}

// ---------- Practice area colour swatches ----------

const PRACTICE_AREA_COLOURS = [
  '#6366f1',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
  '#f97316',
  '#14b8a6',
  '#6b7280',
]

// ---------- Practice area form schema ----------

const practiceAreaFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name cannot exceed 100 characters'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex colour'),
})
type PracticeAreaFormValues = z.infer<typeof practiceAreaFormSchema>

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

// ---------- Zod schemas ----------

const matterTypeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(150),
  practice_area_id: z.string().min(1, 'Practice area is required'),
  description: z.string().max(500).optional().or(z.literal('')),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex colour'),
})
type MatterTypeFormValues = z.infer<typeof matterTypeSchema>

const pipelineFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(150),
  description: z.string().max(500).optional().or(z.literal('')),
  is_default: z.boolean(),
})
type PipelineFormValues = z.infer<typeof pipelineFormSchema>

const stageFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(150),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  description: z.string().max(500).optional().or(z.literal('')),
  is_terminal: z.boolean(),
  auto_close_matter: z.boolean(),
  sla_days: z.number().int().positive().nullable().optional(),
})
type StageFormValues = z.infer<typeof stageFormSchema>

// ==========================================================
// Sortable Stage Row
// ==========================================================

function SortableStageRow({
  stage,
  onEdit,
  onDelete,
}: {
  stage: MatterStage
  onEdit: (stage: MatterStage) => void
  onDelete: (stage: MatterStage) => void
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
            <Badge variant="secondary" className="gap-1 text-[10px] text-orange-700 bg-orange-50 border-orange-200">
              <AlertTriangle className="h-3 w-3" />
              Terminal
            </Badge>
          )}
          {stage.auto_close_matter && (
            <Badge variant="secondary" className="gap-1 text-[10px] text-red-700 bg-red-50 border-red-200">
              <XCircle className="h-3 w-3" />
              Auto-close
            </Badge>
          )}
        </div>
        {stage.sla_days && (
          <div className="flex items-center gap-1 mt-0.5">
            <Clock className="h-3 w-3 text-slate-400" />
            <span className="text-xs text-slate-500">
              {stage.sla_days}d SLA
            </span>
          </div>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(stage)}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => onDelete(stage)}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// ==========================================================
// Matter Type Dialog (Create + Edit)
// ==========================================================

function MatterTypeDialog({
  open,
  onOpenChange,
  tenantId,
  practiceAreas,
  matterType,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantId: string
  practiceAreas: PracticeArea[]
  matterType?: MatterType | null
}) {
  const createMutation = useCreateMatterType()
  const updateMutation = useUpdateMatterType()
  const isEditing = !!matterType

  const form = useForm<MatterTypeFormValues>({
    resolver: zodResolver(matterTypeSchema),
    defaultValues: matterType
      ? {
          name: matterType.name,
          practice_area_id: matterType.practice_area_id,
          description: matterType.description ?? '',
          color: matterType.color ?? '#6366f1',
        }
      : {
          name: '',
          practice_area_id: '',
          description: '',
          color: '#6366f1',
        },
  })

  function onSubmit(values: MatterTypeFormValues) {
    if (isEditing && matterType) {
      updateMutation.mutate(
        {
          id: matterType.id,
          tenantId,
          updates: {
            name: values.name,
            description: values.description || null,
            color: values.color,
          },
        },
        { onSuccess: () => onOpenChange(false) }
      )
    } else {
      createMutation.mutate(
        {
          tenantId,
          practiceAreaId: values.practice_area_id,
          name: values.name,
          description: values.description || null,
          color: values.color,
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
          <DialogTitle>{isEditing ? 'Edit Matter Type' : 'Create Matter Type'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the matter type details.'
              : 'Add a new matter type to organise your cases.'}
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
                    <Input placeholder="e.g. Work Permit" {...field} />
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
                  <FormLabel>Practice Area</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={isEditing}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select practice area" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {practiceAreas.map((pa) => (
                        <SelectItem key={pa.id} value={pa.id}>
                          <div className="flex items-center gap-2">
                            <div
                              className="h-3 w-3 rounded-full"
                              style={{ backgroundColor: pa.color ?? '#6366f1' }}
                            />
                            {pa.name}
                          </div>
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
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief description of this matter type..."
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
// Delete Matter Type Dialog
// ==========================================================

function DeleteMatterTypeDialog({
  open,
  onOpenChange,
  matterType,
  tenantId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  matterType: MatterType | null
  tenantId: string
}) {
  const updateMutation = useUpdateMatterType()

  function handleDelete() {
    if (!matterType) return
    updateMutation.mutate(
      { id: matterType.id, tenantId, updates: { is_active: false } },
      { onSuccess: () => onOpenChange(false) }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete Matter Type</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &ldquo;{matterType?.name}&rdquo;?
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
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==========================================================
// Pipeline Dialog (Create + Edit)
// ==========================================================

function PipelineDialog({
  open,
  onOpenChange,
  tenantId,
  matterTypeId,
  pipeline,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantId: string
  matterTypeId: string
  pipeline?: MatterStagePipeline | null
}) {
  const createMutation = useCreateMatterStagePipeline()
  const updateMutation = useUpdateMatterStagePipeline()
  const isEditing = !!pipeline

  const form = useForm<PipelineFormValues>({
    resolver: zodResolver(pipelineFormSchema),
    defaultValues: pipeline
      ? {
          name: pipeline.name,
          description: pipeline.description ?? '',
          is_default: pipeline.is_default,
        }
      : {
          name: '',
          description: '',
          is_default: false,
        },
  })

  function onSubmit(values: PipelineFormValues) {
    if (isEditing && pipeline) {
      updateMutation.mutate(
        {
          id: pipeline.id,
          tenantId,
          matterTypeId,
          updates: {
            name: values.name,
            description: values.description || null,
            is_default: values.is_default,
          },
        },
        { onSuccess: () => onOpenChange(false) }
      )
    } else {
      createMutation.mutate(
        {
          tenantId,
          matterTypeId,
          name: values.name,
          description: values.description || null,
          isDefault: values.is_default,
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
          <DialogTitle>{isEditing ? 'Edit Pipeline' : 'Add Pipeline'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the pipeline details.'
              : 'Add a new stage pipeline for this matter type.'}
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
                    <Input placeholder="e.g. Standard Pipeline" {...field} />
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
                      placeholder="Brief description..."
                      rows={2}
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
              name="is_default"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <FormLabel className="text-sm font-medium">Default Pipeline</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      New matters of this type will use this pipeline
                    </p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? 'Save Changes' : 'Add Pipeline'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// ==========================================================
// Stage Dialog (Create + Edit)
// ==========================================================

function MatterStageDialog({
  open,
  onOpenChange,
  tenantId,
  pipelineId,
  stage,
  existingStagesCount,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantId: string
  pipelineId: string
  stage?: MatterStage | null
  existingStagesCount: number
}) {
  const createMutation = useCreateMatterStage()
  const updateMutation = useUpdateMatterStage()
  const isEditing = !!stage

  const form = useForm<StageFormValues>({
    resolver: zodResolver(stageFormSchema),
    defaultValues: {
      name: '',
      color: '#6366f1',
      description: '',
      is_terminal: false,
      auto_close_matter: false,
      sla_days: null,
    },
  })

  // Reset form with current stage values whenever the dialog opens or the target stage changes
  useEffect(() => {
    if (!open) return
    form.reset(
      stage
        ? {
            name: stage.name,
            color: stage.color ?? '#6366f1',
            description: stage.description ?? '',
            is_terminal: stage.is_terminal,
            auto_close_matter: stage.auto_close_matter,
            sla_days: stage.sla_days ?? null,
          }
        : {
            name: '',
            color: '#6366f1',
            description: '',
            is_terminal: false,
            auto_close_matter: false,
            sla_days: null,
          }
    )
  }, [open, stage?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function onSubmit(values: StageFormValues) {
    if (isEditing && stage) {
      updateMutation.mutate(
        {
          id: stage.id,
          pipelineId,
          updates: {
            name: values.name,
            color: values.color,
            description: values.description || null,
            is_terminal: values.is_terminal,
            auto_close_matter: values.auto_close_matter,
            sla_days: values.sla_days ?? null,
          },
        },
        { onSuccess: () => onOpenChange(false) }
      )
    } else {
      createMutation.mutate(
        {
          tenantId,
          pipelineId,
          name: values.name,
          color: values.color,
          description: values.description || null,
          sortOrder: existingStagesCount + 1,
          isTerminal: values.is_terminal,
          autoCloseMatter: values.auto_close_matter,
          slaDays: values.sla_days ?? null,
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
            {isEditing ? 'Update stage settings.' : 'Add a new stage to this pipeline.'}
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
                    <Input placeholder="e.g. Intake" {...field} />
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
              name="sla_days"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>SLA Days (optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      placeholder="Target days in this stage"
                      value={field.value ?? ''}
                      onChange={(e) =>
                        field.onChange(e.target.value ? Number(e.target.value) : null)
                      }
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
                name="auto_close_matter"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="text-sm">Auto-close Matter</FormLabel>
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
  stage: MatterStage | null
}) {
  const deleteMutation = useDeleteMatterStage()

  function handleDelete() {
    if (!stage) return
    deleteMutation.mutate(
      { id: stage.id, pipelineId: stage.pipeline_id },
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
// Delete Pipeline Dialog
// ==========================================================

function DeletePipelineDialog({
  open,
  onOpenChange,
  pipeline,
  matterTypeId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pipeline: MatterStagePipeline | null
  matterTypeId: string
}) {
  const deleteMutation = useDeleteMatterStagePipeline()

  function handleDelete() {
    if (!pipeline) return
    deleteMutation.mutate(
      { id: pipeline.id, matterTypeId },
      { onSuccess: () => onOpenChange(false) }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete Pipeline</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &ldquo;{pipeline?.name}&rdquo;? All stages within
            this pipeline will also be deleted. This cannot be undone.
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
            Delete Pipeline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==========================================================
// Pipeline Card (expandable, with stage list)
// ==========================================================

function PipelineCardExpanded({
  pipeline,
  tenantId,
  onEdit,
  onDelete,
}: {
  pipeline: MatterStagePipeline
  tenantId: string
  onEdit: (p: MatterStagePipeline) => void
  onDelete: (p: MatterStagePipeline) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const { data: stages, isLoading: stagesLoading } = useMatterStages(pipeline.id)
  const reorderStages = useReorderMatterStages()

  const [stageFormOpen, setStageFormOpen] = useState(false)
  const [editingStage, setEditingStage] = useState<MatterStage | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MatterStage | null>(null)

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
    reorderStages.mutate({ pipelineId: pipeline.id, stages: updates })
  }

  return (
    <div className="rounded-lg border bg-white">
      {/* Pipeline header */}
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
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900 truncate">
              {pipeline.name}
            </span>
            {pipeline.is_default && (
              <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
            )}
            <span className="text-xs text-slate-400">
              {stages?.length ?? 0} {(stages?.length ?? 0) === 1 ? 'stage' : 'stages'}
            </span>
          </div>
          {pipeline.description && (
            <p className="text-xs text-slate-500 truncate mt-0.5">{pipeline.description}</p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(pipeline)}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete(pipeline)}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Expanded stage list */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t">
          {stagesLoading ? (
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

          <MatterStageDialog
            open={stageFormOpen}
            onOpenChange={(open) => {
              setStageFormOpen(open)
              if (!open) setEditingStage(null)
            }}
            tenantId={tenantId}
            pipelineId={pipeline.id}
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
// Document Slot Section (add from shared library)
// ==========================================================

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

function DocumentSlotSection({
  matterTypeId,
  tenantId,
}: {
  matterTypeId: string
  tenantId: string
}) {
  const [expanded, setExpanded] = useState(true)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [filterTag, setFilterTag] = useState('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const { data: templates, isLoading } = useDocumentSlotTemplatesByMatterType(matterTypeId)
  const { data: libraryEntries } = useActiveLibraryEntries(tenantId)
  const addFromLibrary = useAddLibraryToMatterType()

  const existingSlugs = useMemo(() => {
    if (!templates) return new Set<string>()
    return new Set(templates.map((t) => t.slot_slug))
  }, [templates])

  const allTags = useMemo(() => {
    const tags = new Set<string>()
    for (const e of libraryEntries ?? []) {
      for (const t of e.tags) tags.add(t)
    }
    return Array.from(tags).sort()
  }, [libraryEntries])

  const filteredLibrary = useMemo(() => {
    if (!libraryEntries) return []
    return libraryEntries.filter((e) => {
      if (filterTag !== 'all' && !e.tags.includes(filterTag)) return false
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
        matterTypeId,
        tenantId,
        existingSlugs,
        currentCount: templates?.length ?? 0,
      })
      if (result.added === 0) {
        toast.info('All selected entries already exist on this matter type.')
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
                              <Badge variant="secondary" className="text-[10px] text-red-700 bg-red-50 border-red-200">
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
              Select documents to add to this matter type. Already-assigned entries are greyed out.
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
                {search || filterTag !== 'all' ? 'No entries match.' : 'Library is empty — seed it first.'}
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
                    } ${isSelected ? 'bg-blue-50/60' : ''}`}
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
                          <Badge variant="secondary" className="text-[10px] text-red-700 bg-red-50 border-red-200">
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
// Available Sections for Case Details Tab
// ==========================================================

const AVAILABLE_SECTIONS = [
  { key: 'processing_info', label: 'Processing Information', source: 'Core Data' },
  { key: 'people_dependents', label: 'People & Dependents', source: 'Core Data' },
  { key: 'risk_assessment', label: 'Risk Assessment', source: 'Core Data' },
  { key: 'visa_details', label: 'Visa & Immigration Status', source: 'Immigration' },
  { key: 'application_dates', label: 'Application Dates', source: 'Immigration' },
  { key: 'language_education', label: 'Language & Education', source: 'Immigration' },
  { key: 'employment_work', label: 'Employment & Work', source: 'Immigration' },
  { key: 'family_sponsorship', label: 'Family & Sponsorship', source: 'Immigration' },
  { key: 'case_insights', label: 'Case Insights & Readiness', source: 'Immigration' },
  { key: 'document_checklist', label: 'Document Status', source: 'Immigration' },
  { key: 'ircc_questionnaire', label: 'IRCC Application Questionnaire', source: 'IRCC Intake' },
  { key: 'ircc_forms_generation', label: 'IRCC Form Generation & Download', source: 'IRCC Forms' },
] as const


// ==========================================================
// Section Config (controls what sections show in Case Details tab)
// ==========================================================

// ── Field-Level Row (inside an expanded section) ──────────────────────────

function FieldToggleRow({
  fieldKey,
  label,
  isVisible,
  isCustom,
  onToggle,
  onEdit,
  onDelete,
  disabled,
}: {
  fieldKey: string
  label: string
  isVisible: boolean
  isCustom?: boolean
  onToggle: () => void
  onEdit?: () => void
  onDelete?: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50/50 px-2.5 py-1.5">
      <div className="min-w-0 flex-1 flex items-center gap-1.5">
        <span className={cn(
          "text-xs",
          isVisible ? "text-slate-700" : "text-slate-400"
        )}>
          {label}
        </span>
        {isCustom && (
          <Badge variant="outline" className="text-[9px] shrink-0 border-violet-300 text-violet-600 bg-violet-50">
            Custom
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-1">
        {isCustom && onEdit && (
          <button
            type="button"
            className="h-5 w-5 p-0 flex items-center justify-center rounded text-slate-300 hover:text-violet-500 hover:bg-violet-50 transition-colors"
            onClick={onEdit}
            disabled={disabled}
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
        {isCustom && onDelete && (
          <button
            type="button"
            className="h-5 w-5 p-0 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
            onClick={onDelete}
            disabled={disabled}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
        <button
          type="button"
          className={cn(
            "h-5 w-5 p-0 flex items-center justify-center rounded transition-colors",
            isVisible
              ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
              : "text-slate-300 hover:text-slate-500 hover:bg-slate-100"
          )}
          onClick={onToggle}
          disabled={disabled}
        >
          {isVisible ? (
            <Eye className="h-3 w-3" />
          ) : (
            <EyeOff className="h-3 w-3" />
          )}
        </button>
      </div>
    </div>
  )
}

// ── Add Custom Field Inline Form ──────────────────────────────────────────

// ── Select Options Builder (shared between Add & Edit) ────────────────────

function SelectOptionsBuilder({
  options,
  onChange,
}: {
  options: { label: string; value: string }[]
  onChange: (options: { label: string; value: string }[]) => void
}) {
  const addOption = () => {
    onChange([...options, { label: '', value: '' }])
  }

  const updateOption = (idx: number, label: string) => {
    const updated = options.map((opt, i) =>
      i === idx
        ? { label, value: label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_') }
        : opt
    )
    onChange(updated)
  }

  const removeOption = (idx: number) => {
    onChange(options.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        Dropdown Options
      </span>
      {options.map((opt, idx) => (
        <div key={idx} className="flex items-center gap-1.5">
          <Input
            placeholder={`Option ${idx + 1}`}
            value={opt.label}
            onChange={(e) => updateOption(idx, e.target.value)}
            className="h-6 text-xs flex-1"
            autoFocus={idx === options.length - 1 && !opt.label}
          />
          <button
            type="button"
            className="h-5 w-5 p-0 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
            onClick={() => removeOption(idx)}
          >
            <XCircle className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="flex items-center gap-1 text-[10px] text-violet-600 hover:text-violet-700 font-medium px-1 py-0.5 rounded hover:bg-violet-50 transition-colors"
        onClick={addOption}
      >
        <Plus className="h-2.5 w-2.5" />
        Add Option
      </button>
    </div>
  )
}

// ── Add Custom Field Inline Form ──────────────────────────────────────────

function AddCustomFieldForm({
  onAdd,
  disabled,
}: {
  onAdd: (field: CustomFieldDef) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [fieldType, setFieldType] = useState<CustomFieldDef['type']>('text')
  const [required, setRequired] = useState(false)
  const [selectOptions, setSelectOptions] = useState<{ label: string; value: string }[]>([
    { label: '', value: '' },
    { label: '', value: '' },
  ])

  const validOptions = selectOptions.filter((o) => o.label.trim())
  const canSubmit =
    label.trim() &&
    (fieldType !== 'select' || validOptions.length >= 2)

  const handleSubmit = () => {
    if (!canSubmit) return
    const key = `custom_${label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')}`
    const field: CustomFieldDef = { key, label: label.trim(), type: fieldType, required }
    if (fieldType === 'select') {
      field.options = validOptions
    }
    onAdd(field)
    setLabel('')
    setFieldType('text')
    setRequired(false)
    setSelectOptions([{ label: '', value: '' }, { label: '', value: '' }])
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        className="flex items-center gap-1.5 text-[11px] text-violet-600 hover:text-violet-700 font-medium px-2 py-1 rounded hover:bg-violet-50 transition-colors"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        <Plus className="h-3 w-3" />
        Add Custom Field
      </button>
    )
  }

  return (
    <div className="rounded-md border border-violet-200 bg-violet-50/50 p-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Field label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="h-7 text-xs flex-1"
          autoFocus
        />
        <Select value={fieldType} onValueChange={(v) => setFieldType(v as CustomFieldDef['type'])}>
          <SelectTrigger className="h-7 text-xs w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">Text</SelectItem>
            <SelectItem value="number">Number</SelectItem>
            <SelectItem value="date">Date</SelectItem>
            <SelectItem value="checkbox">Checkbox</SelectItem>
            <SelectItem value="select">Select</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Select options builder */}
      {fieldType === 'select' && (
        <SelectOptionsBuilder options={selectOptions} onChange={setSelectOptions} />
      )}

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            className="rounded border-slate-300"
          />
          Required
        </label>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] px-2"
            onClick={() => {
              setOpen(false)
              setLabel('')
              setFieldType('text')
              setRequired(false)
              setSelectOptions([{ label: '', value: '' }, { label: '', value: '' }])
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-6 text-[11px] px-2"
            onClick={handleSubmit}
            disabled={!canSubmit || disabled}
          >
            Add
          </Button>
        </div>
      </div>
      {fieldType === 'select' && validOptions.length < 2 && (
        <p className="text-[10px] text-amber-600">At least 2 options required for select fields</p>
      )}
    </div>
  )
}

// ── Edit Custom Field Dialog ──────────────────────────────────────────────

function EditCustomFieldDialog({
  field,
  open,
  onOpenChange,
  onSave,
  disabled,
}: {
  field: CustomFieldDef
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (updated: CustomFieldDef) => void
  disabled?: boolean
}) {
  const [label, setLabel] = useState(field.label)
  const [fieldType, setFieldType] = useState<CustomFieldDef['type']>(field.type)
  const [required, setRequired] = useState(field.required)
  const [selectOptions, setSelectOptions] = useState<{ label: string; value: string }[]>(
    field.options?.length ? field.options : [{ label: '', value: '' }, { label: '', value: '' }]
  )

  const validOptions = selectOptions.filter((o) => o.label.trim())
  const canSave =
    label.trim() &&
    (fieldType !== 'select' || validOptions.length >= 2)

  const handleSave = () => {
    if (!canSave) return
    const updated: CustomFieldDef = {
      key: field.key, // keep original key
      label: label.trim(),
      type: fieldType,
      required,
    }
    if (fieldType === 'select') {
      updated.options = validOptions
    }
    onSave(updated)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-violet-600" />
            Edit Custom Field
          </DialogTitle>
          <DialogDescription>
            Modify the field definition. Changes apply to all matters using this matter type.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Label */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-500 font-medium">Label</label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="h-9 text-sm"
              autoFocus
            />
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-500 font-medium">Field Type</label>
            <Select value={fieldType} onValueChange={(v) => setFieldType(v as CustomFieldDef['type'])}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="checkbox">Checkbox</SelectItem>
                <SelectItem value="select">Select (Dropdown)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Select options */}
          {fieldType === 'select' && (
            <div className="space-y-1.5">
              <SelectOptionsBuilder options={selectOptions} onChange={setSelectOptions} />
              {validOptions.length < 2 && (
                <p className="text-[10px] text-amber-600">At least 2 options required</p>
              )}
            </div>
          )}

          {/* Required */}
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="rounded border-slate-300"
            />
            Required field
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!canSave || disabled}
            className="bg-violet-600 hover:bg-violet-700"
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Section Config Section ────────────────────────────────────────────────

// ── Sortable Section Row ──────────────────────────────────────────────────

function SortableSectionRow({
  section,
  registryFields,
  isFieldsExpanded,
  onToggle,
  onToggleFields,
  onFieldToggle,
  onAddCustomField,
  onEditCustomField,
  onDeleteCustomField,
  onReorderCustomFields,
  editingField,
  onEditFieldChange,
  bulkPending,
  fieldPending,
}: {
  section: {
    key: string
    label: string
    source: string
    isEnabled: boolean
    sortOrder: number
    configId: string | null
    fieldConfig: Record<string, FieldVisibility>
    customFields: CustomFieldDef[]
  }
  registryFields: { key: string; label: string }[]
  isFieldsExpanded: boolean
  onToggle: () => void
  onToggleFields: () => void
  onFieldToggle: (fieldKey: string) => void
  onAddCustomField: (field: CustomFieldDef) => void
  onEditCustomField: (field: CustomFieldDef) => void
  onDeleteCustomField: (fieldKey: string) => void
  onReorderCustomFields: (fields: CustomFieldDef[]) => void
  editingField: CustomFieldDef | null
  onEditFieldChange: (field: CustomFieldDef | null) => void
  bulkPending: boolean
  fieldPending: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `section-${section.key}` })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const hasFields = registryFields.length > 0

  // DnD sensors for custom fields (nested)
  const fieldSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleFieldDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = section.customFields.findIndex((f) => `cf-${section.key}-${f.key}` === active.id)
    const newIndex = section.customFields.findIndex((f) => `cf-${section.key}-${f.key}` === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(section.customFields, oldIndex, newIndex)
    onReorderCustomFields(reordered)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-lg border bg-white overflow-hidden',
        isDragging && 'shadow-lg ring-2 ring-violet-200 opacity-90 z-50'
      )}
    >
      {/* Section header row */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Drag handle */}
        <button
          type="button"
          className="cursor-grab touch-none text-slate-300 hover:text-slate-500 shrink-0"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        {/* Expand chevron */}
        {hasFields && section.isEnabled ? (
          <button
            type="button"
            className="h-5 w-5 p-0 flex items-center justify-center rounded hover:bg-slate-100 transition-colors shrink-0"
            onClick={onToggleFields}
          >
            {isFieldsExpanded ? (
              <ChevronDown className="h-3 w-3 text-slate-400" />
            ) : (
              <ChevronRight className="h-3 w-3 text-slate-400" />
            )}
          </button>
        ) : (
          <LayoutList className="h-4 w-4 shrink-0 text-slate-400" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn(
              'text-sm font-medium',
              section.isEnabled ? 'text-slate-900' : 'text-slate-400'
            )}>
              {section.label}
            </span>
            <Badge variant="outline" className="text-[10px] shrink-0">
              {section.source}
            </Badge>
            {section.customFields.length > 0 && (
              <Badge variant="outline" className="text-[9px] shrink-0 border-violet-300 text-violet-600 bg-violet-50">
                +{section.customFields.length} custom
              </Badge>
            )}
          </div>
        </div>
        <button
          type="button"
          className={cn(
            'h-7 w-7 p-0 flex items-center justify-center rounded-md transition-colors',
            section.isEnabled
              ? 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
              : 'text-slate-300 hover:text-slate-500 hover:bg-slate-50'
          )}
          onClick={onToggle}
          disabled={bulkPending}
        >
          {section.isEnabled ? (
            <Eye className="h-4 w-4" />
          ) : (
            <EyeOff className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Field-level toggles (expanded) */}
      {isFieldsExpanded && section.isEnabled && hasFields && (
        <div className="border-t px-3 py-2 bg-slate-50/30 space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
            Field Visibility
          </span>
          <div className="grid grid-cols-1 gap-1">
            {/* Standard fields from registry */}
            {registryFields.map((field) => (
              <FieldToggleRow
                key={field.key}
                fieldKey={field.key}
                label={field.label}
                isVisible={section.fieldConfig[field.key]?.visible !== false}
                onToggle={() => onFieldToggle(field.key)}
                disabled={fieldPending}
              />
            ))}

            {/* Custom fields with DnD reorder */}
            {section.customFields.length > 0 && (
              <>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mt-2 mb-1">
                  Custom Fields
                </span>
                <DndContext
                  sensors={fieldSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleFieldDragEnd}
                >
                  <SortableContext
                    items={section.customFields.map((f) => `cf-${section.key}-${f.key}`)}
                    strategy={verticalListSortingStrategy}
                  >
                    {section.customFields.map((cf) => (
                      <SortableCustomFieldRow
                        key={cf.key}
                        sectionKey={section.key}
                        field={cf}
                        onEdit={() => onEditFieldChange(cf)}
                        onDelete={() => onDeleteCustomField(cf.key)}
                        disabled={fieldPending}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </>
            )}
          </div>

          {/* Add custom field */}
          <div className="pt-1">
            <AddCustomFieldForm
              onAdd={onAddCustomField}
              disabled={fieldPending}
            />
          </div>
        </div>
      )}

      {/* Edit dialog */}
      {editingField && (
        <EditCustomFieldDialog
          field={editingField}
          open={!!editingField}
          onOpenChange={(open) => { if (!open) onEditFieldChange(null) }}
          onSave={onEditCustomField}
          disabled={fieldPending}
        />
      )}
    </div>
  )
}

// ── Sortable Custom Field Row ─────────────────────────────────────────────

function SortableCustomFieldRow({
  sectionKey,
  field,
  onEdit,
  onDelete,
  disabled,
}: {
  sectionKey: string
  field: CustomFieldDef
  onEdit: () => void
  onDelete: () => void
  disabled?: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `cf-${sectionKey}-${field.key}` })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const typeLabel = field.type === 'select'
    ? `Select (${field.options?.length ?? 0})`
    : field.type.charAt(0).toUpperCase() + field.type.slice(1)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50/50 px-2.5 py-1.5',
        isDragging && 'shadow-md ring-1 ring-violet-200 opacity-90 z-50'
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-slate-300 hover:text-slate-500 shrink-0"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3 w-3" />
      </button>
      <div className="min-w-0 flex-1 flex items-center gap-1.5">
        <span className="text-xs text-slate-700">{field.label}</span>
        <Badge variant="outline" className="text-[9px] shrink-0 border-violet-300 text-violet-600 bg-violet-50">
          Custom
        </Badge>
        <Badge variant="outline" className="text-[9px] shrink-0 text-slate-400">
          {typeLabel}
        </Badge>
        {field.required && (
          <span className="text-[9px] text-red-400 font-medium">*</span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="h-5 w-5 p-0 flex items-center justify-center rounded text-slate-300 hover:text-violet-500 hover:bg-violet-50 transition-colors"
          onClick={onEdit}
          disabled={disabled}
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          type="button"
          className="h-5 w-5 p-0 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
          onClick={onDelete}
          disabled={disabled}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

// ── Section Config Section ────────────────────────────────────────────────

function SectionConfigSection({
  matterTypeId,
  tenantId,
}: {
  matterTypeId: string
  tenantId: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set())
  const [editingField, setEditingField] = useState<{ sectionKey: string; field: CustomFieldDef } | null>(null)
  const { data: sectionConfig, isLoading } = useMatterTypeSectionConfig(matterTypeId)
  const bulkUpsert = useBulkUpsertSectionConfig()
  const updateFieldConfig = useUpdateSectionFieldConfig()

  // DnD sensors for sections
  const sectionSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Merge AVAILABLE_SECTIONS with DB config
  const mergedSections = useMemo(() => {
    const configMap = new Map(
      (sectionConfig ?? []).map((c) => [c.section_key, c])
    )

    return AVAILABLE_SECTIONS.map((s, idx) => {
      const existing = configMap.get(s.key)
      return {
        key: s.key,
        label: s.label,
        source: s.source,
        isEnabled: existing?.is_enabled ?? true,
        sortOrder: existing?.sort_order ?? idx,
        configId: existing?.id ?? null,
        fieldConfig: (existing?.field_config ?? {}) as Record<string, FieldVisibility>,
        customFields: (existing?.custom_fields ?? []) as CustomFieldDef[],
      }
    }).sort((a, b) => a.sortOrder - b.sortOrder)
  }, [sectionConfig])

  const enabledCount = mergedSections.filter((s) => s.isEnabled).length

  const handleToggle = (sectionKey: string) => {
    const updated = mergedSections.map((s) => ({
      sectionKey: s.key,
      sectionLabel: s.label,
      isEnabled: s.key === sectionKey ? !s.isEnabled : s.isEnabled,
      sortOrder: s.sortOrder,
    }))

    bulkUpsert.mutate({
      tenantId,
      matterTypeId,
      sections: updated,
    })
  }

  const toggleFieldExpand = (sectionKey: string) => {
    setExpandedFields((prev) => {
      const next = new Set(prev)
      if (next.has(sectionKey)) next.delete(sectionKey)
      else next.add(sectionKey)
      return next
    })
  }

  const handleFieldToggle = (section: typeof mergedSections[number], fieldKey: string) => {
    if (!section.configId) {
      toast.error('Save section config first by toggling the section on/off')
      return
    }

    const updatedFieldConfig = { ...section.fieldConfig }
    const current = updatedFieldConfig[fieldKey]?.visible ?? true
    updatedFieldConfig[fieldKey] = { visible: !current }

    updateFieldConfig.mutate({
      sectionConfigId: section.configId,
      matterTypeId,
      fieldConfig: updatedFieldConfig,
    })
  }

  const handleAddCustomField = (section: typeof mergedSections[number], field: CustomFieldDef) => {
    if (!section.configId) {
      toast.error('Save section config first by toggling the section on/off')
      return
    }

    const updatedCustomFields = [...section.customFields, field]
    updateFieldConfig.mutate({
      sectionConfigId: section.configId,
      matterTypeId,
      customFields: updatedCustomFields,
    })
  }

  const handleEditCustomField = (section: typeof mergedSections[number], updated: CustomFieldDef) => {
    if (!section.configId) return
    const updatedCustomFields = section.customFields.map((f) =>
      f.key === updated.key ? updated : f
    )
    updateFieldConfig.mutate({
      sectionConfigId: section.configId,
      matterTypeId,
      customFields: updatedCustomFields,
    })
  }

  const handleDeleteCustomField = (section: typeof mergedSections[number], fieldKey: string) => {
    if (!section.configId) return
    const updatedCustomFields = section.customFields.filter((f) => f.key !== fieldKey)
    updateFieldConfig.mutate({
      sectionConfigId: section.configId,
      matterTypeId,
      customFields: updatedCustomFields,
    })
  }

  const handleReorderCustomFields = (section: typeof mergedSections[number], fields: CustomFieldDef[]) => {
    if (!section.configId) return
    updateFieldConfig.mutate({
      sectionConfigId: section.configId,
      matterTypeId,
      customFields: fields,
    })
  }

  // Section DnD reorder
  const handleSectionDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = mergedSections.findIndex((s) => `section-${s.key}` === active.id)
    const newIndex = mergedSections.findIndex((s) => `section-${s.key}` === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(mergedSections, oldIndex, newIndex)
    const updated = reordered.map((s, idx) => ({
      sectionKey: s.key,
      sectionLabel: s.label,
      isEnabled: s.isEnabled,
      sortOrder: idx,
    }))

    bulkUpsert.mutate({
      tenantId,
      matterTypeId,
      sections: updated,
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
            Case Details Sections
          </span>
          <span className="text-xs text-slate-400 ml-2">
            {enabledCount} of {AVAILABLE_SECTIONS.length} enabled
          </span>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t">
          {isLoading ? (
            <div className="space-y-2 pt-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="space-y-1 pt-2">
              <DndContext
                sensors={sectionSensors}
                collisionDetection={closestCenter}
                onDragEnd={handleSectionDragEnd}
              >
                <SortableContext
                  items={mergedSections.map((s) => `section-${s.key}`)}
                  strategy={verticalListSortingStrategy}
                >
                  {mergedSections.map((section) => {
                    const registryFields = getSectionFields(section.key)
                    const isFieldsExpanded = expandedFields.has(section.key)
                    const currentEditField =
                      editingField?.sectionKey === section.key ? editingField.field : null

                    return (
                      <SortableSectionRow
                        key={section.key}
                        section={section}
                        registryFields={registryFields}
                        isFieldsExpanded={isFieldsExpanded}
                        onToggle={() => handleToggle(section.key)}
                        onToggleFields={() => toggleFieldExpand(section.key)}
                        onFieldToggle={(fieldKey) => handleFieldToggle(section, fieldKey)}
                        onAddCustomField={(field) => handleAddCustomField(section, field)}
                        onEditCustomField={(updated) => handleEditCustomField(section, updated)}
                        onDeleteCustomField={(fieldKey) => handleDeleteCustomField(section, fieldKey)}
                        onReorderCustomFields={(fields) => handleReorderCustomFields(section, fields)}
                        editingField={currentEditField}
                        onEditFieldChange={(field) =>
                          setEditingField(field ? { sectionKey: section.key, field } : null)
                        }
                        bulkPending={bulkUpsert.isPending}
                        fieldPending={updateFieldConfig.isPending}
                      />
                    )
                  })}
                </SortableContext>
              </DndContext>
              <p className="text-xs text-slate-400 pt-2">
                Drag sections to reorder. Toggle sections on/off to control what appears in the Case Details tab.
                Expand a section to configure field visibility, add custom fields, and reorder them.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ==========================================================
// Pipeline Section (right panel for selected matter type)
// ==========================================================

function PipelineSection({
  matterType,
  tenantId,
}: {
  matterType: MatterType
  tenantId: string
}) {
  const { data: pipelines, isLoading } = useMatterStagePipelines(tenantId, matterType.id)

  const [pipelineDialogOpen, setPipelineDialogOpen] = useState(false)
  const [editingPipeline, setEditingPipeline] = useState<MatterStagePipeline | null>(null)
  const [deletePipelineTarget, setDeletePipelineTarget] = useState<MatterStagePipeline | null>(null)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-1 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div
              className="h-4 w-4 rounded-full"
              style={{ backgroundColor: matterType.color ?? '#6366f1' }}
            />
            <h2 className="text-lg font-semibold text-slate-900">{matterType.name}</h2>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage pipelines and stages for this matter type
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditingPipeline(null)
            setPipelineDialogOpen(true)
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add Pipeline
        </Button>
      </div>

      <Separator />

      {isLoading ? (
        <div className="space-y-3 pt-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : !pipelines || pipelines.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
          <Settings2 className="h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-600">No pipelines yet</p>
          <p className="mt-1 text-sm text-slate-400">
            Add a pipeline to define the workflow stages for this matter type.
          </p>
          <Button
            size="sm"
            className="mt-4"
            onClick={() => {
              setEditingPipeline(null)
              setPipelineDialogOpen(true)
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add Pipeline
          </Button>
        </div>
      ) : (
        <ScrollArea className="flex-1 pt-4">
          <div className="space-y-3 pr-2">
            {pipelines.map((pipeline) => (
              <PipelineCardExpanded
                key={pipeline.id}
                pipeline={pipeline}
                tenantId={tenantId}
                onEdit={(p) => {
                  setEditingPipeline(p)
                  setPipelineDialogOpen(true)
                }}
                onDelete={(p) => setDeletePipelineTarget(p)}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Document Slot Templates */}
      <div className="mt-4">
        <DocumentSlotSection matterTypeId={matterType.id} tenantId={tenantId} />
      </div>

      {/* IRCC Forms & Questions (Unified) */}
      <div className="mt-3">
        <UnifiedFormsQuestionsSection matterTypeId={matterType.id} tenantId={tenantId} />
      </div>

      {/* Case Details Section Config */}
      <div className="mt-3">
        <SectionConfigSection matterTypeId={matterType.id} tenantId={tenantId} />
      </div>

      {/* Intake Questions */}
      <div className="mt-3">
        <IntakeQuestionsSection matterTypeId={matterType.id} />
      </div>

      <PipelineDialog
        open={pipelineDialogOpen}
        onOpenChange={(open) => {
          setPipelineDialogOpen(open)
          if (!open) setEditingPipeline(null)
        }}
        tenantId={tenantId}
        matterTypeId={matterType.id}
        pipeline={editingPipeline}
      />

      <DeletePipelineDialog
        open={!!deletePipelineTarget}
        onOpenChange={(open) => {
          if (!open) setDeletePipelineTarget(null)
        }}
        pipeline={deletePipelineTarget}
        matterTypeId={matterType.id}
      />
    </div>
  )
}

// ==========================================================
// Matter Type Card (left panel)
// ==========================================================

function MatterTypeCardItem({
  matterType,
  practiceArea,
  isSelected,
  pipelineCount,
  onClick,
  onEdit,
  onDelete,
}: {
  matterType: MatterType
  practiceArea?: PracticeArea | null
  isSelected: boolean
  pipelineCount?: number
  onClick: () => void
  onEdit: () => void
  onDelete: () => void
}) {
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
          <div className="flex items-center gap-2">
            <div
              className="h-3.5 w-3.5 shrink-0 rounded-full"
              style={{ backgroundColor: matterType.color ?? '#6366f1' }}
            />
            <span className="truncate text-sm font-semibold text-slate-900">
              {matterType.name}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2 pl-5">
            {practiceArea && (
              <Badge
                variant="secondary"
                className="text-[10px]"
                style={{
                  backgroundColor: `${practiceArea.color ?? '#6366f1'}15`,
                  color: practiceArea.color ?? '#6366f1',
                  borderColor: `${practiceArea.color ?? '#6366f1'}30`,
                }}
              >
                {practiceArea.name}
              </Badge>
            )}
            {pipelineCount !== undefined && (
              <span className="text-xs text-slate-400">
                {pipelineCount} {pipelineCount === 1 ? 'pipeline' : 'pipelines'}
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

// Pipeline count wrapper
function MatterTypeCardWithCount({
  matterType,
  practiceArea,
  isSelected,
  tenantId,
  onClick,
  onEdit,
  onDelete,
}: {
  matterType: MatterType
  practiceArea?: PracticeArea | null
  isSelected: boolean
  tenantId: string
  onClick: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { data: pipelines } = useMatterStagePipelines(tenantId, matterType.id)
  return (
    <MatterTypeCardItem
      matterType={matterType}
      practiceArea={practiceArea}
      isSelected={isSelected}
      pipelineCount={pipelines?.length}
      onClick={onClick}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  )
}

// ==========================================================
// Main Page
// ==========================================================

// ==========================================================
// Practice Areas Section (embedded)
// ==========================================================

function PracticeAreaFormDialog({
  open,
  onOpenChange,
  title,
  description,
  initialValues,
  onSubmit,
  isLoading,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  initialValues?: PracticeAreaFormValues
  onSubmit: (values: PracticeAreaFormValues) => void
  isLoading: boolean
}) {
  const form = useForm<PracticeAreaFormValues>({
    resolver: zodResolver(practiceAreaFormSchema),
    defaultValues: initialValues ?? { name: '', color: '#6366f1' },
  })

  const selectedColour = form.watch('color')

  function handleOpenChange(open: boolean) {
    if (!open) form.reset(initialValues ?? { name: '', color: '#6366f1' })
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
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
                    <Input placeholder="e.g. Immigration" autoFocus {...field} />
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
                  <FormDescription>Used for badges and the practice filter indicator.</FormDescription>
                  <FormControl>
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {PRACTICE_AREA_COLOURS.map((colour) => (
                          <button
                            key={colour}
                            type="button"
                            className={cn(
                              'h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1',
                              field.value === colour ? 'border-slate-900 scale-110' : 'border-transparent'
                            )}
                            style={{ backgroundColor: colour }}
                            onClick={() => field.onChange(colour)}
                            aria-label={`Select colour ${colour}`}
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 shrink-0 rounded-full border" style={{ backgroundColor: selectedColour }} />
                        <Input
                          placeholder="#6366f1"
                          value={field.value}
                          onChange={field.onChange}
                          className="h-8 font-mono text-xs"
                          maxLength={7}
                        />
                      </div>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isLoading}>{isLoading ? 'Saving…' : 'Save'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

function PracticeAreasSection({ tenantId, onPracticeAreasChange }: { tenantId: string; onPracticeAreasChange?: () => void }) {
  const queryClient = useQueryClient()
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<PracticeArea | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PracticeArea | null>(null)

  const { data: practiceAreas, isLoading } = useQuery({
    queryKey: ['practice_areas', 'all', tenantId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('practice_areas')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name')
      if (error) throw error
      return data as PracticeArea[]
    },
    enabled: !!tenantId,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['practice_areas'] })
    queryClient.invalidateQueries({ queryKey: ['practice-areas'] })
    onPracticeAreasChange?.()
  }

  const createMutation = useMutation({
    mutationFn: async (values: PracticeAreaFormValues) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('practice_areas')
        .insert({ tenant_id: tenantId, ...values, is_active: true, is_enabled: true })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => { invalidate(); setCreateDialogOpen(false); toast.success('Practice area created.') },
    onError: (err: Error) => {
      toast.error(err.message.includes('unique') ? 'A practice area with that name already exists.' : 'Failed to create practice area.')
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: PracticeAreaFormValues }) => {
      const supabase = createClient()
      const { error } = await supabase.from('practice_areas').update(values).eq('id', id).eq('tenant_id', tenantId)
      if (error) throw error
    },
    onSuccess: () => { invalidate(); setEditTarget(null); toast.success('Practice area updated.') },
    onError: (err: Error) => {
      toast.error(err.message.includes('unique') ? 'A practice area with that name already exists.' : 'Failed to update practice area.')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_enabled }: { id: string; is_enabled: boolean }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('practice_areas')
        .update({ is_enabled, is_active: is_enabled })
        .eq('id', id)
        .eq('tenant_id', tenantId)
      if (error) throw error
    },
    onSuccess: (_, { is_enabled }) => { invalidate(); toast.success(is_enabled ? 'Practice area enabled.' : 'Practice area disabled.') },
    onError: () => toast.error('Failed to update practice area status.'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('practice_areas')
        .update({ is_active: false, is_enabled: false })
        .eq('id', id)
        .eq('tenant_id', tenantId)
      if (error) throw error
    },
    onSuccess: () => { invalidate(); setDeleteTarget(null); toast.success('Practice area removed.') },
    onError: () => toast.error('Failed to remove practice area.'),
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Practice Areas</h2>
          <p className="text-sm text-slate-500">
            Manage which areas of law your firm handles. Enabling an area makes it available in the global filter and matter creation form.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateDialogOpen(true)} className="shrink-0">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Area
        </Button>
      </div>

      {isLoading ? (
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 w-28 rounded-full" />)}
        </div>
      ) : !practiceAreas || practiceAreas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 py-6 text-center">
          <Layers className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">No practice areas yet. Add your first one to get started.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {practiceAreas.map((pa) => {
            const enabled = (pa as PracticeArea & { is_enabled?: boolean }).is_enabled ?? pa.is_active
            const isToggling = toggleMutation.isPending && (toggleMutation.variables as { id: string } | undefined)?.id === pa.id
            return (
              <div key={pa.id} className={cn('flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50', !enabled && 'opacity-60')}>
                <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: pa.color }} />
                <span className="flex-1 text-sm font-medium text-slate-900">{pa.name}</span>
                {!enabled && <Badge variant="secondary" className="text-xs">Disabled</Badge>}
                <div className="flex items-center gap-1.5">
                  {enabled ? (
                    <ToggleRight className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <ToggleLeft className="h-3.5 w-3.5 text-slate-400" />
                  )}
                  <Switch
                    checked={enabled}
                    onCheckedChange={(val) => toggleMutation.mutate({ id: pa.id, is_enabled: val })}
                    disabled={isToggling}
                    className="data-[state=checked]:bg-emerald-600"
                    aria-label={`${enabled ? 'Disable' : 'Enable'} ${pa.name}`}
                  />
                </div>
                <div className="flex items-center gap-0.5">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditTarget(pa)} aria-label={`Edit ${pa.name}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(pa)} aria-label={`Remove ${pa.name}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <PracticeAreaFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        title="Add Practice Area"
        description="Create a new practice area. You can add matter types after saving."
        onSubmit={(values) => createMutation.mutate(values)}
        isLoading={createMutation.isPending}
      />

      {editTarget && (
        <PracticeAreaFormDialog
          open={!!editTarget}
          onOpenChange={(open) => { if (!open) setEditTarget(null) }}
          title="Edit Practice Area"
          description="Update the name or colour for this practice area."
          initialValues={{ name: editTarget.name, color: editTarget.color }}
          onSubmit={(values) => updateMutation.mutate({ id: editTarget.id, values })}
          isLoading={updateMutation.isPending}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove &ldquo;{deleteTarget?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will disable and hide the practice area. Existing matters linked to it are unaffected. You can re-enable it at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ==========================================================
// Main page
// ==========================================================

export default function MatterTypesPage() {
  const { tenant, isLoading: tenantLoading } = useTenant()
  const tenantId = tenant?.id ?? ''

  const [practiceAreaFilter, setPracticeAreaFilter] = useState<string>('all')
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null)

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<MatterType | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MatterType | null>(null)

  const { data: practiceAreas, isLoading: paLoading } = usePracticeAreas(tenantId)
  const practiceAreaId = practiceAreaFilter === 'all' ? undefined : practiceAreaFilter
  const { data: matterTypes, isLoading: mtLoading } = useMatterTypes(tenantId, practiceAreaId)

  const paMap = useMemo(
    () => new Map(practiceAreas?.map((pa) => [pa.id, pa]) ?? []),
    [practiceAreas]
  )

  const selectedType = useMemo(
    () => matterTypes?.find((mt) => mt.id === selectedTypeId) ?? null,
    [matterTypes, selectedTypeId]
  )

  // Clear selection if type no longer in filtered list
  const hasSelection = selectedTypeId && matterTypes?.some((mt) => mt.id === selectedTypeId)

  const isLoading = tenantLoading || paLoading

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-2 h-4 w-96" />
        </div>
        <div className="flex gap-6">
          <div className="w-2/5 space-y-3">
            <Skeleton className="h-9 w-48" />
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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Practice Areas & Matter Types</h1>
        <p className="mt-1 text-sm text-slate-500">
          Configure your firm&apos;s practice areas, matter types, pipelines, and workflow stages
        </p>
      </div>

      <PracticeAreasSection tenantId={tenantId} />

      <Separator />

      {/* Matter types sub-header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Matter Types</h2>
          <p className="text-sm text-slate-500">Define types within each practice area and configure their pipelines and stages.</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Type
        </Button>
      </div>

      {/* Main content: two panels */}
      <div className="flex gap-6" style={{ minHeight: '65vh' }}>
        {/* Left panel: matter type list */}
        <div className="w-2/5 flex flex-col">
          {/* Practice area filter tabs */}
          {practiceAreas && practiceAreas.length > 0 && (
            <Tabs value={practiceAreaFilter} onValueChange={setPracticeAreaFilter} className="mb-4">
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                {practiceAreas.map((pa) => (
                  <TabsTrigger key={pa.id} value={pa.id}>
                    {pa.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          {mtLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : !matterTypes || matterTypes.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
              <Settings2 className="h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-600">
                No matter types configured yet
              </p>
              <p className="mt-1 text-sm text-slate-400">
                Create your first matter type to get started.
              </p>
              <Button
                size="sm"
                className="mt-4"
                onClick={() => setCreateDialogOpen(true)}
              >
                <Plus className="mr-1 h-4 w-4" />
                Create Type
              </Button>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="space-y-2 pr-2">
                {matterTypes.map((mt) => (
                  <MatterTypeCardWithCount
                    key={mt.id}
                    matterType={mt}
                    practiceArea={paMap.get(mt.practice_area_id)}
                    isSelected={selectedTypeId === mt.id}
                    tenantId={tenantId}
                    onClick={() => setSelectedTypeId(mt.id)}
                    onEdit={() => setEditTarget(mt)}
                    onDelete={() => setDeleteTarget(mt)}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Right panel: pipeline + stages */}
        <div className="flex-1 rounded-lg border bg-slate-50/50 p-5">
          {selectedType && hasSelection ? (
            <PipelineSection
              key={selectedType.id}
              matterType={selectedType}
              tenantId={tenantId}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Settings2 className="h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-600">
                No matter type selected
              </p>
              <p className="mt-1 text-sm text-slate-400">
                Select a matter type from the left to manage its pipelines and stages.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit matter type dialog */}
      <MatterTypeDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        tenantId={tenantId}
        practiceAreas={practiceAreas ?? []}
      />

      {editTarget && (
        <MatterTypeDialog
          open={!!editTarget}
          onOpenChange={(open) => {
            if (!open) setEditTarget(null)
          }}
          tenantId={tenantId}
          practiceAreas={practiceAreas ?? []}
          matterType={editTarget}
        />
      )}

      {/* Delete matter type dialog */}
      <DeleteMatterTypeDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        matterType={deleteTarget}
        tenantId={tenantId}
      />
    </div>
  )
}

// ==========================================================
// Intake Questions Builder
// ==========================================================

const QUESTION_TYPE_LABELS: Record<IntakeQuestion['type'], string> = {
  text: 'Short Text',
  select: 'Dropdown (Select)',
  date: 'Date',
  boolean: 'Yes / No',
}

const QUESTION_TEMPLATES: IntakeQuestion[] = [
  { key: 'marital_status', label: 'Marital Status', type: 'select', required: true, options: ['Single', 'Married', 'Common-Law', 'Divorced', 'Widowed', 'Separated'] },
  { key: 'has_children', label: 'Do you have children?', type: 'boolean', required: true },
  { key: 'language_test_taken', label: 'Language test taken?', type: 'boolean', required: false },
  { key: 'language_test_type', label: 'Language test type', type: 'select', required: false, options: ['IELTS', 'CELPIP', 'TEF Canada', 'TCF Canada'], show_if: { question_key: 'language_test_taken', equals: 'true' } },
  { key: 'prior_refusal', label: 'Prior visa refusal?', type: 'boolean', required: true },
  { key: 'prior_refusal_details', label: 'Refusal details', type: 'text', required: false, show_if: { question_key: 'prior_refusal', equals: 'true' } },
]

function IntakeQuestionsSection({ matterTypeId }: { matterTypeId: string }) {
  const { data: schema = [], isLoading } = useMatterTypeIntakeSchema(matterTypeId)
  const updateSchema = useUpdateMatterTypeIntakeSchema()
  const [questions, setQuestions] = useState<IntakeQuestion[]>([])
  const [dirty, setDirty] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [collapsed, setCollapsed] = useState(true)

  // Sync loaded schema into local state
  useEffect(() => {
    setQuestions(schema)
    setDirty(false)
  }, [schema])

  function handleAddBlank() {
    const newQ: IntakeQuestion = { key: `question_${Date.now()}`, label: '', type: 'text', required: false }
    const next = [...questions, newQ]
    setQuestions(next)
    setEditingIdx(next.length - 1)
    setDirty(true)
  }

  function handleAddTemplate(tpl: IntakeQuestion) {
    if (questions.some((q) => q.key === tpl.key)) {
      toast.error(`Question key "${tpl.key}" already exists`)
      return
    }
    const next = [...questions, { ...tpl }]
    setQuestions(next)
    setDirty(true)
  }

  function handleRemove(idx: number) {
    const next = questions.filter((_, i) => i !== idx)
    setQuestions(next)
    if (editingIdx === idx) setEditingIdx(null)
    setDirty(true)
  }

  function handleUpdate(idx: number, patch: Partial<IntakeQuestion>) {
    const next = questions.map((q, i) => i === idx ? { ...q, ...patch } : q)
    setQuestions(next)
    setDirty(true)
  }

  function handleMoveUp(idx: number) {
    if (idx === 0) return
    const next = [...questions]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    setQuestions(next)
    setDirty(true)
  }

  function handleMoveDown(idx: number) {
    if (idx === questions.length - 1) return
    const next = [...questions]
    ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
    setQuestions(next)
    setDirty(true)
  }

  function handleSave() {
    // Validate: all questions need a key and label
    const invalid = questions.filter((q) => !q.key.trim() || !q.label.trim())
    if (invalid.length > 0) {
      toast.error('All questions need a key and label')
      return
    }
    // Validate: unique keys
    const keys = questions.map((q) => q.key)
    if (new Set(keys).size !== keys.length) {
      toast.error('Question keys must be unique')
      return
    }
    updateSchema.mutate({ matterTypeId, schema: questions }, {
      onSuccess: () => setDirty(false),
    })
  }

  return (
    <Card className="border rounded-lg">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/40 transition-colors rounded-lg"
        onClick={() => setCollapsed((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Intake Questions</span>
          <Badge variant="outline" className="text-[10px]">{questions.length} question{questions.length !== 1 ? 's' : ''}</Badge>
        </div>
        {collapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {!collapsed && (
        <div className="border-t px-4 pb-4 space-y-3">
          <p className="text-xs text-muted-foreground pt-3">
            Define questions asked from staff (and client on first portal login) specific to this matter type. Answers are cross-referenced with IRCC form data to surface risk flags.
          </p>

          {/* Template library */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Add from templates:</p>
            <div className="flex flex-wrap gap-1.5">
              {QUESTION_TEMPLATES.map((tpl) => (
                <Button
                  key={tpl.key}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-[11px] px-2"
                  onClick={() => handleAddTemplate(tpl)}
                >
                  + {tpl.label}
                </Button>
              ))}
            </div>
          </div>

          {isLoading && <Skeleton className="h-12 w-full" />}

          {/* Questions list */}
          <div className="space-y-2">
            {questions.map((q, idx) => (
              <div key={idx} className={cn('border rounded-md p-3 space-y-2 text-sm', editingIdx === idx && 'border-primary/50 bg-primary/5')}>
                <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-0.5">
                    <button type="button" onClick={() => handleMoveUp(idx)} className="h-3 text-muted-foreground hover:text-foreground" disabled={idx === 0}>▲</button>
                    <button type="button" onClick={() => handleMoveDown(idx)} className="h-3 text-muted-foreground hover:text-foreground" disabled={idx === questions.length - 1}>▼</button>
                  </div>
                  <div className="flex-1 min-w-0">
                    {editingIdx === idx ? (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-muted-foreground">Label *</label>
                          <Input
                            value={q.label}
                            onChange={(e) => handleUpdate(idx, { label: e.target.value })}
                            className="h-7 text-xs"
                            placeholder="Question label"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">Key * (unique, no spaces)</label>
                          <Input
                            value={q.key}
                            onChange={(e) => handleUpdate(idx, { key: e.target.value.replace(/\s/g, '_').toLowerCase() })}
                            className="h-7 text-xs font-mono"
                            placeholder="question_key"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">Type</label>
                          <Select value={q.type} onValueChange={(v) => handleUpdate(idx, { type: v as IntakeQuestion['type'] })}>
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(QUESTION_TYPE_LABELS).map(([val, lbl]) => (
                                <SelectItem key={val} value={val} className="text-xs">{lbl}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-end gap-2">
                          <label className="text-[10px] text-muted-foreground flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={q.required}
                              onChange={(e) => handleUpdate(idx, { required: e.target.checked })}
                              className="h-3.5 w-3.5"
                            />
                            Required
                          </label>
                        </div>
                        {q.type === 'select' && (
                          <div className="col-span-2">
                            <label className="text-[10px] text-muted-foreground">Options (one per line)</label>
                            <Textarea
                              value={(q.options ?? []).join('\n')}
                              onChange={(e) => handleUpdate(idx, { options: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
                              className="text-xs min-h-[60px]"
                              placeholder="Option 1&#10;Option 2&#10;Option 3"
                            />
                          </div>
                        )}
                        <div className="col-span-2">
                          <label className="text-[10px] text-muted-foreground">Show only if (optional)</label>
                          <div className="flex gap-1.5">
                            <Input
                              value={q.show_if?.question_key ?? ''}
                              onChange={(e) => handleUpdate(idx, { show_if: e.target.value ? { question_key: e.target.value, equals: q.show_if?.equals ?? '' } : undefined })}
                              className="h-7 text-xs font-mono flex-1"
                              placeholder="question_key"
                            />
                            <span className="text-xs self-center text-muted-foreground">=</span>
                            <Input
                              value={q.show_if?.equals ?? ''}
                              onChange={(e) => handleUpdate(idx, { show_if: q.show_if ? { ...q.show_if, equals: e.target.value } : undefined })}
                              className="h-7 text-xs flex-1"
                              placeholder="value"
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-xs">{q.label || <span className="text-muted-foreground italic">Untitled</span>}</span>
                        <Badge variant="outline" className="text-[10px] py-0">{QUESTION_TYPE_LABELS[q.type]}</Badge>
                        {q.required && <Badge variant="outline" className="text-[10px] py-0 border-amber-300 text-amber-700 bg-amber-50">Required</Badge>}
                        {q.show_if && <span className="text-[10px] text-muted-foreground">if {q.show_if.question_key}={q.show_if.equals}</span>}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => setEditingIdx(editingIdx === idx ? null : idx)}
                    >
                      {editingIdx === idx ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                      onClick={() => handleRemove(idx)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={handleAddBlank}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Question
            </Button>
            {dirty && (
              <Button
                type="button"
                size="sm"
                className="h-7 text-xs"
                onClick={handleSave}
                disabled={updateSchema.isPending}
              >
                {updateSchema.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                Save Questions
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
