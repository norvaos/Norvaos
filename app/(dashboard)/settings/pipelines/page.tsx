'use client'

import { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema'
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
  Trophy,
  XCircle,
  Clock,
} from 'lucide-react'

import { useTenant } from '@/lib/hooks/use-tenant'
import {
  usePipelines,
  usePipelineStages,
  useCreatePipeline,
  useCreateStage,
  useUpdateStage,
  useReorderStages,
  useDeleteStage,
} from '@/lib/queries/pipelines'
import {
  pipelineSchema,
  stageSchema,
  type PipelineFormValues,
  type StageFormValues,
} from '@/lib/schemas/pipeline'
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
import { Skeleton } from '@/components/ui/skeleton'

type Pipeline = Database['public']['Tables']['pipelines']['Row']
type PipelineStage = Database['public']['Tables']['pipeline_stages']['Row']

// ---------- Practice Areas hook ----------

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
      return data
    },
    enabled: !!tenantId,
  })
}

// ---------- Color presets for stages ----------

const STAGE_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#3b82f6', // blue
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
  '#f97316', // orange
  '#64748b', // slate
]

// ==========================================================
// Sortable Stage Row
// ==========================================================

function SortableStageRow({
  stage,
  onEdit,
  onDelete,
}: {
  stage: PipelineStage
  onEdit: (stage: PipelineStage) => void
  onDelete: (stage: PipelineStage) => void
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
          {stage.is_win_stage && (
            <Badge variant="secondary" className="gap-1 text-[10px] text-emerald-700 bg-emerald-50 border-emerald-200">
              <Trophy className="h-3 w-3" />
              Win
            </Badge>
          )}
          {stage.is_lost_stage && (
            <Badge variant="secondary" className="gap-1 text-[10px] text-red-700 bg-red-50 border-red-200">
              <XCircle className="h-3 w-3" />
              Lost
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-xs text-slate-500">
            {stage.win_probability ?? 0}% probability
          </span>
          {stage.rotting_days && (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Clock className="h-3 w-3" />
              {stage.rotting_days}d rotting
            </span>
          )}
        </div>
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
// Create Pipeline Dialog
// ==========================================================

function CreatePipelineDialog({
  open,
  onOpenChange,
  tenantId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantId: string
}) {
  const createPipeline = useCreatePipeline()
  const { data: practiceAreas } = usePracticeAreas(tenantId)

  const form = useForm<PipelineFormValues>({
    resolver: standardSchemaResolver(pipelineSchema) as any,
    defaultValues: {
      name: '',
      pipeline_type: 'lead',
      practice_area: null,
      is_default: false,
    },
  })

  function onSubmit(values: PipelineFormValues) {
    createPipeline.mutate(
      { tenant_id: tenantId, ...values },
      {
        onSuccess: () => {
          onOpenChange(false)
          form.reset()
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Pipeline</DialogTitle>
          <DialogDescription>
            Add a new pipeline to organize your workflow.
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
                    <Input placeholder="e.g. Default Lead Pipeline" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="pipeline_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="matter">Matter</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="practice_area"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Practice Area (optional)</FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
                    value={field.value ?? '__none__'}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select practice area" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {practiceAreas?.map((pa) => (
                        <SelectItem key={pa.id} value={pa.name}>
                          {pa.name}
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
              name="is_default"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <FormLabel className="text-sm font-medium">Default Pipeline</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      New items will use this pipeline by default
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
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
              <Button type="submit" disabled={createPipeline.isPending}>
                {createPipeline.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create Pipeline
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// ==========================================================
// Stage Form Dialog (Create + Edit)
// ==========================================================

function StageFormDialog({
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
  stage?: PipelineStage | null
  existingStagesCount: number
}) {
  const createStage = useCreateStage()
  const updateStage = useUpdateStage()
  const isEditing = !!stage

  const form = useForm<StageFormValues>({
    resolver: standardSchemaResolver(stageSchema) as any,
    defaultValues: stage
      ? {
          name: stage.name,
          color: stage.color ?? '#6366f1',
          description: stage.description ?? undefined,
          win_probability: stage.win_probability ?? 0,
          rotting_days: stage.rotting_days ?? undefined,
          is_win_stage: stage.is_win_stage ?? false,
          is_lost_stage: stage.is_lost_stage ?? false,
          required_fields: (stage.required_fields as string[] | null) ?? [],
        }
      : {
          name: '',
          color: '#6366f1',
          description: undefined,
          win_probability: 0,
          rotting_days: undefined,
          is_win_stage: false,
          is_lost_stage: false,
          required_fields: [],
        },
  })

  function onSubmit(values: StageFormValues) {
    if (isEditing && stage) {
      updateStage.mutate(
        { id: stage.id, pipelineId, ...values },
        {
          onSuccess: () => {
            onOpenChange(false)
          },
        }
      )
    } else {
      createStage.mutate(
        {
          pipeline_id: pipelineId,
          tenant_id: tenantId,
          sort_order: existingStagesCount + 1,
          ...values,
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

  const isPending = createStage.isPending || updateStage.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Stage' : 'Add Stage'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update stage settings.'
              : 'Add a new stage to this pipeline.'}
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
                    <Input placeholder="e.g. Qualified" {...field} />
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
                  <FormLabel>Color</FormLabel>
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
              name="win_probability"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Win Probability (%)</FormLabel>
                  <FormControl>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={field.value ?? 0}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                        className="flex-1 accent-primary"
                      />
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        className="w-20"
                        value={field.value ?? 0}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="rotting_days"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rotting Days (optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      placeholder="Days before item is considered stale"
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

            <div className="flex gap-4">
              <FormField
                control={form.control}
                name="is_win_stage"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked)
                          if (checked) form.setValue('is_lost_stage', false)
                        }}
                      />
                    </FormControl>
                    <FormLabel className="text-sm">Win Stage</FormLabel>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_lost_stage"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked)
                          if (checked) form.setValue('is_win_stage', false)
                        }}
                      />
                    </FormControl>
                    <FormLabel className="text-sm">Lost Stage</FormLabel>
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
// Delete Stage Confirmation Dialog
// ==========================================================

function DeleteStageDialog({
  open,
  onOpenChange,
  stage,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  stage: PipelineStage | null
}) {
  const deleteStage = useDeleteStage()

  function handleDelete() {
    if (!stage) return
    deleteStage.mutate(
      { id: stage.id, pipelineId: stage.pipeline_id },
      {
        onSuccess: () => onOpenChange(false),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete Stage</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &ldquo;{stage?.name}&rdquo;? Leads
            or matters currently in this stage may be affected.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteStage.isPending}
          >
            {deleteStage.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Delete Stage
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==========================================================
// Stage List Panel (right panel)
// ==========================================================

function StageListPanel({
  pipeline,
  tenantId,
}: {
  pipeline: Pipeline
  tenantId: string
}) {
  const { data: stages, isLoading } = usePipelineStages(pipeline.id)
  const reorderStages = useReorderStages()

  const [stageFormOpen, setStageFormOpen] = useState(false)
  const [editingStage, setEditingStage] = useState<PipelineStage | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PipelineStage | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const stageIds = useMemo(
    () => (stages ?? []).map((s) => s.id),
    [stages]
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !stages) return

    const oldIndex = stages.findIndex((s) => s.id === active.id)
    const newIndex = stages.findIndex((s) => s.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(stages, oldIndex, newIndex)
    const updates = reordered.map((s, i) => ({
      id: s.id,
      sort_order: i + 1,
    }))

    reorderStages.mutate({ pipelineId: pipeline.id, stages: updates })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-1 pb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {pipeline.name}
          </h2>
          <p className="text-sm text-slate-500">
            Manage stages for this pipeline
          </p>
        </div>
        <Button size="sm" onClick={() => { setEditingStage(null); setStageFormOpen(true) }}>
          <Plus className="mr-1 h-4 w-4" />
          Add Stage
        </Button>
      </div>

      <Separator />

      {isLoading ? (
        <div className="space-y-2 pt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : !stages || stages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
          <Settings2 className="h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-600">
            No stages yet
          </p>
          <p className="mt-1 text-sm text-slate-400">
            This pipeline has no stages yet. Add your first stage.
          </p>
          <Button
            size="sm"
            className="mt-4"
            onClick={() => { setEditingStage(null); setStageFormOpen(true) }}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add Stage
          </Button>
        </div>
      ) : (
        <ScrollArea className="flex-1 pt-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={stageIds}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2 pr-2">
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
        </ScrollArea>
      )}

      <StageFormDialog
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
  )
}

// ==========================================================
// Pipeline Card
// ==========================================================

function PipelineCard({
  pipeline,
  isSelected,
  stageCount,
  onClick,
}: {
  pipeline: Pipeline
  isSelected: boolean
  stageCount?: number
  onClick: () => void
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
            <span className="truncate text-sm font-semibold text-slate-900">
              {pipeline.name}
            </span>
            {pipeline.is_default && (
              <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <Badge
              variant="secondary"
              className={cn(
                'text-[10px]',
                pipeline.pipeline_type === 'lead'
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-purple-50 text-purple-700 border-purple-200'
              )}
            >
              {pipeline.pipeline_type === 'lead' ? 'Lead' : 'Matter'}
            </Badge>
            {pipeline.practice_area && (
              <span className="truncate text-xs text-slate-500">
                {pipeline.practice_area}
              </span>
            )}
          </div>
        </div>
        {stageCount !== undefined && (
          <span className="shrink-0 text-xs text-slate-400">
            {stageCount} {stageCount === 1 ? 'stage' : 'stages'}
          </span>
        )}
      </div>
    </Card>
  )
}

// ==========================================================
// Main Page
// ==========================================================

export default function PipelinesPage() {
  const { tenant, isLoading: tenantLoading } = useTenant()
  const tenantId = tenant?.id ?? ''

  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(
    null
  )
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  const filterType = typeFilter === 'all' ? undefined : typeFilter
  const { data: pipelines, isLoading: pipelinesLoading } = usePipelines(
    tenantId,
    filterType
  )

  // Stage counts for each pipeline
  const selectedPipeline = useMemo(
    () => pipelines?.find((p) => p.id === selectedPipelineId) ?? null,
    [pipelines, selectedPipelineId]
  )

  // Auto-select first pipeline if current selection is lost
  const effectivePipelines = pipelines ?? []
  const hasSelection =
    selectedPipelineId &&
    effectivePipelines.some((p) => p.id === selectedPipelineId)

  // If filter changes and selected pipeline is no longer visible, clear selection
  useMemo(() => {
    if (selectedPipelineId && effectivePipelines.length > 0 && !hasSelection) {
      // Selection was lost due to filter change — do nothing, let user re-select
    }
  }, [selectedPipelineId, effectivePipelines, hasSelection])

  if (tenantLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-2 h-4 w-96" />
        </div>
        <div className="flex gap-6">
          <div className="w-2/5 space-y-3">
            <Skeleton className="h-9 w-48" />
            {Array.from({ length: 3 }).map((_, i) => (
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
          <h1 className="text-2xl font-semibold text-slate-900">
            Pipeline Management
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Configure lead and matter pipelines with custom stages
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Pipeline
        </Button>
      </div>

      <Separator />

      {/* Main content: two panels */}
      <div className="flex gap-6" style={{ minHeight: '65vh' }}>
        {/* Left panel: pipeline list */}
        <div className="w-2/5 flex flex-col">
          <Tabs value={typeFilter} onValueChange={setTypeFilter} className="mb-4">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="lead">Lead</TabsTrigger>
              <TabsTrigger value="matter">Matter</TabsTrigger>
            </TabsList>
          </Tabs>

          {pipelinesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : effectivePipelines.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
              <Settings2 className="h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-600">
                No pipelines configured yet
              </p>
              <p className="mt-1 text-sm text-slate-400">
                Create your first pipeline to get started.
              </p>
              <Button
                size="sm"
                className="mt-4"
                onClick={() => setCreateDialogOpen(true)}
              >
                <Plus className="mr-1 h-4 w-4" />
                Create Pipeline
              </Button>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="space-y-2 pr-2">
                {effectivePipelines.map((pipeline) => (
                  <PipelineCardWithCount
                    key={pipeline.id}
                    pipeline={pipeline}
                    isSelected={selectedPipelineId === pipeline.id}
                    onClick={() => setSelectedPipelineId(pipeline.id)}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Right panel: stages */}
        <div className="flex-1 rounded-lg border bg-slate-50/50 p-5">
          {selectedPipeline ? (
            <StageListPanel
              key={selectedPipeline.id}
              pipeline={selectedPipeline}
              tenantId={tenantId}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Settings2 className="h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-600">
                No pipeline selected
              </p>
              <p className="mt-1 text-sm text-slate-400">
                Select a pipeline from the left to manage its stages.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Create pipeline dialog */}
      <CreatePipelineDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        tenantId={tenantId}
      />
    </div>
  )
}

// ==========================================================
// Pipeline Card with stage count (queries stages per pipeline)
// ==========================================================

function PipelineCardWithCount({
  pipeline,
  isSelected,
  onClick,
}: {
  pipeline: Pipeline
  isSelected: boolean
  onClick: () => void
}) {
  const { data: stages } = usePipelineStages(pipeline.id)
  return (
    <PipelineCard
      pipeline={pipeline}
      isSelected={isSelected}
      stageCount={stages?.length}
      onClick={onClick}
    />
  )
}
