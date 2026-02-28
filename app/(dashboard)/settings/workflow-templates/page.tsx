'use client'

import { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Plus,
  Pencil,
  Trash2,
  GitBranch,
  Loader2,
  ListChecks,
  Zap,
  ArrowRight,
} from 'lucide-react'

import { useTenant } from '@/lib/hooks/use-tenant'
import { useEnabledPracticeAreas } from '@/lib/queries/practice-areas'
import {
  useMatterTypes,
  useMatterStagePipelines,
  useMatterStages,
  useWorkflowTemplates,
  useCreateWorkflowTemplate,
  useUpdateWorkflowTemplate,
  useDeleteWorkflowTemplate,
} from '@/lib/queries/matter-types'
import { useTaskTemplates } from '@/lib/queries/task-templates'
import { cn } from '@/lib/utils'
import type { Database } from '@/lib/types/database'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
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

type WorkflowTemplate = Database['public']['Tables']['workflow_templates']['Row']
type MatterType = Database['public']['Tables']['matter_types']['Row']
type MatterStage = Database['public']['Tables']['matter_stages']['Row']

// ─── Form Schema ────────────────────────────────────────────────────────────

const workflowSchema = z.object({
  name: z.string().min(1, 'Name is required').max(150),
  description: z.string().max(500).optional().or(z.literal('')),
  matter_type_id: z.string().min(1, 'Matter type is required'),
  stage_pipeline_id: z.string().optional().or(z.literal('')),
  trigger_stage_id: z.string().optional().or(z.literal('')),
  task_template_id: z.string().optional().or(z.literal('')),
  is_default: z.boolean(),
})

type WorkflowFormValues = z.infer<typeof workflowSchema>

// ─── Page ───────────────────────────────────────────────────────────────────

export default function WorkflowTemplatesPage() {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''
  const { data: practiceAreas, isLoading: loadingPA } = useEnabledPracticeAreas(tenantId || undefined)
  const { data: allMatterTypes, isLoading: loadingMT } = useMatterTypes(tenantId)
  const { data: workflows, isLoading: loadingWF } = useWorkflowTemplates(tenantId)
  const { data: taskTemplates } = useTaskTemplates(tenantId)

  const [practiceFilter, setPracticeFilter] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<WorkflowTemplate | null>(null)
  const [deleting, setDeleting] = useState<WorkflowTemplate | null>(null)

  // Filter matter types by selected practice area
  const filteredMatterTypes = useMemo(() => {
    if (!allMatterTypes) return []
    if (practiceFilter === 'all') return allMatterTypes
    return allMatterTypes.filter((mt) => mt.practice_area_id === practiceFilter)
  }, [allMatterTypes, practiceFilter])

  // Filter workflows by matter types in the selected practice area
  const filteredMatterTypeIds = useMemo(
    () => new Set(filteredMatterTypes.map((mt) => mt.id)),
    [filteredMatterTypes]
  )

  const filteredWorkflows = useMemo(() => {
    if (!workflows) return []
    if (practiceFilter === 'all') return workflows
    return workflows.filter((w) => filteredMatterTypeIds.has(w.matter_type_id))
  }, [workflows, practiceFilter, filteredMatterTypeIds])

  const isLoading = loadingPA || loadingMT || loadingWF

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Workflow Templates</h1>
          <p className="mt-1 text-sm text-slate-500">
            Bind task templates to stage transitions to auto-create tasks when matters advance.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
          size="sm"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add Workflow
        </Button>
      </div>

      {/* Practice Area Filter Tabs */}
      {practiceAreas && practiceAreas.length > 1 && (
        <Tabs value={practiceFilter} onValueChange={setPracticeFilter}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            {practiceAreas.map((pa) => (
              <TabsTrigger key={pa.id} value={pa.id}>
                <span
                  className="mr-1.5 inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: pa.color }}
                />
                {pa.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {/* List */}
      {isLoading ? (
        <WorkflowsSkeleton />
      ) : filteredWorkflows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <GitBranch className="h-10 w-10 text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-600">No workflow templates yet</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">
            Create a workflow template to auto-create tasks when a matter enters a specific stage.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-white divide-y">
          {filteredWorkflows.map((wf) => (
            <WorkflowRow
              key={wf.id}
              workflow={wf}
              matterTypes={allMatterTypes ?? []}
              taskTemplates={taskTemplates ?? []}
              onEdit={() => {
                setEditing(wf)
                setDialogOpen(true)
              }}
              onDelete={() => setDeleting(wf)}
            />
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <WorkflowDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
        editing={editing}
        tenantId={tenantId ?? ''}
        practiceAreas={practiceAreas ?? []}
        allMatterTypes={allMatterTypes ?? []}
        taskTemplates={taskTemplates ?? []}
      />

      {/* Delete Confirmation */}
      <DeleteWorkflowDialog
        workflow={deleting}
        onClose={() => setDeleting(null)}
        tenantId={tenantId ?? ''}
      />
    </div>
  )
}

// ─── Row Component ──────────────────────────────────────────────────────────

function WorkflowRow({
  workflow,
  matterTypes,
  taskTemplates,
  onEdit,
  onDelete,
}: {
  workflow: WorkflowTemplate
  matterTypes: MatterType[]
  taskTemplates: { id: string; name: string }[]
  onEdit: () => void
  onDelete: () => void
}) {
  const matterType = matterTypes.find((mt) => mt.id === workflow.matter_type_id)
  const taskTemplate = taskTemplates.find((tt) => tt.id === workflow.task_template_id)

  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-slate-50/50 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
          <Zap className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-slate-900 truncate">{workflow.name}</p>
            {workflow.is_default && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                Default
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {matterType && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                {matterType.name}
              </Badge>
            )}
            {workflow.trigger_stage_id && (
              <StageBadge
                stageId={workflow.trigger_stage_id}
                pipelineId={workflow.stage_pipeline_id}
              />
            )}
            {!workflow.trigger_stage_id && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal text-slate-400">
                On creation
              </Badge>
            )}
            {taskTemplate && (
              <>
                <ArrowRight className="h-3 w-3 text-slate-300" />
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal text-emerald-600 border-emerald-200 bg-emerald-50">
                  <ListChecks className="h-3 w-3 mr-0.5" />
                  {taskTemplate.name}
                </Badge>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0 ml-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5 text-slate-400" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5 text-slate-400" />
        </Button>
      </div>
    </div>
  )
}

// ─── Stage Badge (fetches stage name) ───────────────────────────────────────

function StageBadge({ stageId, pipelineId }: { stageId: string; pipelineId: string | null }) {
  const { data: stages } = useMatterStages(pipelineId)
  const stage = stages?.find((s: MatterStage) => s.id === stageId)

  if (!stage) {
    return (
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
        Stage trigger
      </Badge>
    )
  }

  return (
    <Badge
      variant="outline"
      className="text-[10px] px-1.5 py-0 font-normal"
      style={{
        borderColor: stage.color + '40',
        backgroundColor: stage.color + '10',
        color: stage.color,
      }}
    >
      <ArrowRight className="h-3 w-3 mr-0.5" />
      {stage.name}
    </Badge>
  )
}

// ─── Dialog ─────────────────────────────────────────────────────────────────

function WorkflowDialog({
  open,
  onOpenChange,
  editing,
  tenantId,
  practiceAreas,
  allMatterTypes,
  taskTemplates,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: WorkflowTemplate | null
  tenantId: string
  practiceAreas: { id: string; name: string; color: string }[]
  allMatterTypes: MatterType[]
  taskTemplates: { id: string; name: string }[]
}) {
  const createMutation = useCreateWorkflowTemplate()
  const updateMutation = useUpdateWorkflowTemplate()

  const form = useForm<WorkflowFormValues>({
    resolver: zodResolver(workflowSchema),
    defaultValues: {
      name: '',
      description: '',
      matter_type_id: '',
      stage_pipeline_id: '',
      trigger_stage_id: '',
      task_template_id: '',
      is_default: false,
    },
  })

  // Watch cascading fields
  const selectedMatterTypeId = form.watch('matter_type_id')
  const selectedPipelineId = form.watch('stage_pipeline_id')

  // Derive practice area from selected matter type
  const selectedMatterType = allMatterTypes.find((mt) => mt.id === selectedMatterTypeId)

  // Fetch pipelines for selected matter type
  const { data: pipelines } = useMatterStagePipelines(tenantId, selectedMatterTypeId || null)

  // Fetch stages for selected pipeline
  const { data: stages } = useMatterStages(selectedPipelineId || null)

  // Reset form when dialog opens
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && editing) {
      form.reset({
        name: editing.name,
        description: editing.description ?? '',
        matter_type_id: editing.matter_type_id,
        stage_pipeline_id: editing.stage_pipeline_id ?? '',
        trigger_stage_id: editing.trigger_stage_id ?? '',
        task_template_id: editing.task_template_id ?? '',
        is_default: editing.is_default,
      })
    } else if (nextOpen && !editing) {
      form.reset({
        name: '',
        description: '',
        matter_type_id: '',
        stage_pipeline_id: '',
        trigger_stage_id: '',
        task_template_id: '',
        is_default: false,
      })
    }
    onOpenChange(nextOpen)
  }

  const onSubmit = async (values: WorkflowFormValues) => {
    const clean = {
      name: values.name,
      description: values.description || null,
      matter_type_id: values.matter_type_id,
      stage_pipeline_id: values.stage_pipeline_id || null,
      trigger_stage_id: values.trigger_stage_id || null,
      task_template_id: values.task_template_id || null,
      is_default: values.is_default,
    }

    if (editing) {
      await updateMutation.mutateAsync({
        id: editing.id,
        tenantId,
        updates: clean,
      })
    } else {
      await createMutation.mutateAsync({
        ...clean,
        tenant_id: tenantId,
      })
    }

    onOpenChange(false)
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Workflow Template' : 'New Workflow Template'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Update the workflow template configuration.'
              : 'Create a rule that auto-creates tasks when a matter enters a stage.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Contract Review Tasks" {...field} />
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
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Matter Type */}
            <FormField
              control={form.control}
              name="matter_type_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Matter Type</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v)
                      // Reset cascading fields
                      form.setValue('stage_pipeline_id', '')
                      form.setValue('trigger_stage_id', '')
                    }}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select matter type..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {allMatterTypes.map((mt) => (
                        <SelectItem key={mt.id} value={mt.id}>
                          {mt.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Pipeline — shown when matter type selected */}
            {selectedMatterTypeId && pipelines && pipelines.length > 0 && (
              <FormField
                control={form.control}
                name="stage_pipeline_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pipeline</FormLabel>
                    <Select
                      value={field.value || '_none'}
                      onValueChange={(v) => {
                        const val = v === '_none' ? '' : v
                        field.onChange(val)
                        form.setValue('trigger_stage_id', '')
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select pipeline..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="_none">No pipeline (creation only)</SelectItem>
                        {pipelines.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                            {p.is_default && ' (Default)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Select a pipeline to enable stage-based triggering.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Trigger Stage — shown when pipeline selected */}
            {selectedPipelineId && stages && stages.length > 0 && (
              <FormField
                control={form.control}
                name="trigger_stage_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trigger Stage</FormLabel>
                    <Select
                      value={field.value || '_none'}
                      onValueChange={(v) => field.onChange(v === '_none' ? '' : v)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select stage..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="_none">No stage trigger (creation only)</SelectItem>
                        {stages.map((s: MatterStage) => (
                          <SelectItem key={s.id} value={s.id}>
                            <span className="flex items-center gap-2">
                              <span
                                className="inline-block h-2 w-2 rounded-full"
                                style={{ backgroundColor: s.color }}
                              />
                              {s.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Tasks will be auto-created when a matter enters this stage.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Task Template */}
            <FormField
              control={form.control}
              name="task_template_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Task Template</FormLabel>
                  <Select
                    value={field.value || '_none'}
                    onValueChange={(v) => field.onChange(v === '_none' ? '' : v)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select task template..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="_none">No task template</SelectItem>
                      {taskTemplates.map((tt) => (
                        <SelectItem key={tt.id} value={tt.id}>
                          {tt.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    The task template whose items will be created as tasks.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Is Default */}
            <FormField
              control={form.control}
              name="is_default"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <FormLabel className="text-sm font-medium">Default Workflow</FormLabel>
                    <FormDescription className="text-xs">
                      Apply automatically when creating matters of this type.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {editing ? 'Save Changes' : 'Create Workflow'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Delete Dialog ──────────────────────────────────────────────────────────

function DeleteWorkflowDialog({
  workflow,
  onClose,
  tenantId,
}: {
  workflow: WorkflowTemplate | null
  onClose: () => void
  tenantId: string
}) {
  const deleteMutation = useDeleteWorkflowTemplate()

  const handleDelete = async () => {
    if (!workflow) return
    await deleteMutation.mutateAsync({ id: workflow.id, tenantId })
    onClose()
  }

  return (
    <AlertDialog open={!!workflow} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Workflow Template</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to remove &ldquo;{workflow?.name}&rdquo;? This will stop
            auto-creating tasks for this stage transition. Existing tasks will not be affected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="bg-red-600 hover:bg-red-700"
          >
            {deleteMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ─── Skeleton ───────────────────────────────────────────────────────────────

function WorkflowsSkeleton() {
  return (
    <div className="rounded-lg border bg-white divide-y">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
          <div className="space-y-1.5 flex-1">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
      ))}
    </div>
  )
}
