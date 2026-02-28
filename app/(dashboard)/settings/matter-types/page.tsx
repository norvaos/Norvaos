'use client'

import { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
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
  useCreateMatterStage,
  useUpdateMatterStage,
  useDeleteMatterStage,
  useReorderMatterStages,
} from '@/lib/queries/matter-types'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { Database } from '@/lib/types/database'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

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
    defaultValues: stage
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
        },
  })

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
// Pipeline Card (expandable, with stage list)
// ==========================================================

function PipelineCardExpanded({
  pipeline,
  tenantId,
  onEdit,
}: {
  pipeline: MatterStagePipeline
  tenantId: string
  onEdit: (p: MatterStagePipeline) => void
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
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600"
          onClick={(e) => {
            e.stopPropagation()
            onEdit(pipeline)
          }}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
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
              />
            ))}
          </div>
        </ScrollArea>
      )}

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Matter Types</h1>
          <p className="mt-1 text-sm text-slate-500">
            Configure matter types, pipelines, and workflow stages
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Type
        </Button>
      </div>

      <Separator />

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
