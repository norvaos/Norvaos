'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Pencil, Trash2, Clock, Loader2 } from 'lucide-react'

import { useTenant } from '@/lib/hooks/use-tenant'
import {
  useDeadlineTypes,
  useCreateDeadlineType,
  useUpdateDeadlineType,
  useDeleteDeadlineType,
  useMatterTypes,
} from '@/lib/queries/matter-types'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { Database } from '@/lib/types/database'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import { toast } from 'sonner'

// ── Types ────────────────────────────────────────────────────────────────────

type DeadlineType = Database['public']['Tables']['deadline_types']['Row']
type PracticeArea = Database['public']['Tables']['practice_areas']['Row']
type MatterType = Database['public']['Tables']['matter_types']['Row']

// ── Constants ────────────────────────────────────────────────────────────────

const COLOUR_SWATCHES = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899',
  '#14b8a6', '#6b7280',
]

// ── Zod Schema ───────────────────────────────────────────────────────────────

const deadlineTypeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(150, 'Name cannot exceed 150 characters'),
  description: z.string().max(500).optional().or(z.literal('')),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex colour'),
  practice_area_id: z.string().optional().or(z.literal('')),
  matter_type_id: z.string().optional().or(z.literal('')),
  is_hard: z.boolean(),
  default_days_offset: z.union([z.number().int().positive(), z.nan()]).nullable().optional(),
})

type DeadlineTypeFormValues = z.infer<typeof deadlineTypeSchema>

// ── Inline Practice Areas Hook ───────────────────────────────────────────────

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

// ── DeadlineTypeRow ──────────────────────────────────────────────────────────

function DeadlineTypeRow({
  dt,
  practiceArea,
  matterType,
  onEdit,
  onDelete,
}: {
  dt: DeadlineType
  practiceArea: PracticeArea | undefined
  matterType: MatterType | undefined
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-slate-50">
      {/* Colour dot */}
      <div
        className="h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: dt.color }}
      />

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-slate-900">
            {dt.name}
          </span>
          <Badge
            variant={dt.is_hard ? 'destructive' : 'secondary'}
            className="text-[10px] px-1.5 py-0"
          >
            {dt.is_hard ? 'Hard' : 'Soft'}
          </Badge>
          {dt.default_days_offset != null && (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Clock className="h-3 w-3" />
              {dt.default_days_offset}d
            </span>
          )}
        </div>
        {dt.description && (
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {dt.description}
          </p>
        )}
        <div className="mt-1 flex items-center gap-1.5">
          {practiceArea ? (
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0"
              style={{
                backgroundColor: `${practiceArea.color ?? ''}15`,
                color: practiceArea.color ?? undefined,
                borderColor: `${practiceArea.color ?? ''}30`,
              }}
            >
              {practiceArea.name}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              Global
            </Badge>
          )}
          {matterType && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {matterType.name}
            </Badge>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ── DeadlineTypeDialog (Create / Edit) ───────────────────────────────────────

function DeadlineTypeDialog({
  open,
  onOpenChange,
  tenantId,
  practiceAreas,
  allMatterTypes,
  deadlineType,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantId: string
  practiceAreas: PracticeArea[]
  allMatterTypes: MatterType[]
  deadlineType?: DeadlineType | null
}) {
  const createMutation = useCreateDeadlineType()
  const updateMutation = useUpdateDeadlineType()
  const isEditing = !!deadlineType

  const form = useForm<DeadlineTypeFormValues>({
    resolver: zodResolver(deadlineTypeSchema),
    defaultValues: {
      name: '',
      description: '',
      color: '#ef4444',
      practice_area_id: '',
      matter_type_id: '',
      is_hard: false,
      default_days_offset: null,
    },
  })

  // Reset form values when dialog opens or deadlineType changes
  useEffect(() => {
    if (open) {
      if (deadlineType) {
        form.reset({
          name: deadlineType.name,
          description: deadlineType.description ?? '',
          color: deadlineType.color,
          practice_area_id: deadlineType.practice_area_id ?? '',
          matter_type_id: deadlineType.matter_type_id ?? '',
          is_hard: deadlineType.is_hard,
          default_days_offset: deadlineType.default_days_offset ?? null,
        })
      } else {
        form.reset({
          name: '',
          description: '',
          color: '#ef4444',
          practice_area_id: '',
          matter_type_id: '',
          is_hard: false,
          default_days_offset: null,
        })
      }
    }
  }, [open, deadlineType, form])

  const watchedPracticeAreaId = form.watch('practice_area_id')

  // Filter matter types by selected practice area
  const filteredMatterTypes = useMemo(
    () =>
      watchedPracticeAreaId
        ? allMatterTypes.filter((mt) => mt.practice_area_id === watchedPracticeAreaId)
        : [],
    [allMatterTypes, watchedPracticeAreaId]
  )

  // Clear matter_type_id when practice_area_id changes to empty
  useEffect(() => {
    if (!watchedPracticeAreaId) {
      form.setValue('matter_type_id', '')
    }
  }, [watchedPracticeAreaId, form])

  const isPending = createMutation.isPending || updateMutation.isPending

  function onSubmit(values: DeadlineTypeFormValues) {
    const daysOffset =
      values.default_days_offset != null && !isNaN(values.default_days_offset)
        ? values.default_days_offset
        : null

    if (isEditing && deadlineType) {
      updateMutation.mutate(
        {
          id: deadlineType.id,
          tenantId,
          updates: {
            name: values.name,
            description: values.description || null,
            color: values.color,
            practice_area_id: values.practice_area_id || null,
            matter_type_id: values.matter_type_id || null,
            is_hard: values.is_hard,
            default_days_offset: daysOffset,
          },
        },
        { onSuccess: () => onOpenChange(false) }
      )
    } else {
      createMutation.mutate(
        {
          tenantId,
          name: values.name,
          description: values.description || null,
          color: values.color,
          practiceAreaId: values.practice_area_id || null,
          matterTypeId: values.matter_type_id || null,
          isHard: values.is_hard,
          defaultDaysOffset: daysOffset,
        },
        {
          onSuccess: () => {
            onOpenChange(false)
            toast.success('Deadline type created')
          },
          onError: (err: Error) => {
            toast.error(
              err.message.includes('unique')
                ? 'A deadline type with that name already exists.'
                : 'Failed to create deadline type.'
            )
          },
        }
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Deadline Type' : 'Create Deadline Type'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the deadline type settings.'
              : 'Add a new deadline type to categorise matter deadlines.'}
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
                    <Input placeholder="e.g., Closing Date" {...field} />
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
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Colour */}
            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Colour</FormLabel>
                  <div className="flex flex-wrap gap-2">
                    {COLOUR_SWATCHES.map((c) => (
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

            {/* Practice Area */}
            <FormField
              control={form.control}
              name="practice_area_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Practice Area</FormLabel>
                  <Select
                    value={field.value || '_global'}
                    onValueChange={(v) => field.onChange(v === '_global' ? '' : v)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Global (all practice areas)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="_global">
                        Global (all practice areas)
                      </SelectItem>
                      {practiceAreas.map((pa) => (
                        <SelectItem key={pa.id} value={pa.id}>
                          {pa.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Leave as Global to make this type available across all practice areas.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Matter Type (conditional) */}
            {watchedPracticeAreaId && filteredMatterTypes.length > 0 && (
              <FormField
                control={form.control}
                name="matter_type_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Matter Type (optional)</FormLabel>
                    <Select
                      value={field.value || '_none'}
                      onValueChange={(v) => field.onChange(v === '_none' ? '' : v)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="All matter types" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="_none">
                          All matter types
                        </SelectItem>
                        {filteredMatterTypes.map((mt) => (
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
            )}

            {/* Is Hard + Default Days row */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="is_hard"
                render={({ field }) => (
                  <FormItem className="flex flex-col gap-2 rounded-lg border p-3">
                    <FormLabel className="text-sm">Hard Deadline</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <span className="text-xs text-muted-foreground">
                        {field.value ? 'Critical' : 'Flexible'}
                      </span>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="default_days_offset"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Days Offset</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        placeholder="e.g., 30"
                        value={field.value ?? ''}
                        onChange={(e) => {
                          const val = e.target.value
                          field.onChange(val === '' ? null : parseInt(val, 10))
                        }}
                      />
                    </FormControl>
                    <FormDescription className="text-[11px]">
                      Auto-set due date (days from creation)
                    </FormDescription>
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
                {isEditing ? 'Save Changes' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// ── Loading Skeleton ─────────────────────────────────────────────────────────

function DeadlineTypesSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-40" />
      </div>
      <Skeleton className="h-10 w-72" />
      <div className="divide-y rounded-lg border">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="h-3 w-3 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 w-8" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function DeadlineTypesPage() {
  const { tenant, isLoading: tenantLoading } = useTenant()
  const tenantId = tenant?.id ?? ''

  // Filters
  const [practiceAreaFilter, setPracticeAreaFilter] = useState<string>('all')

  // Dialogs
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<DeadlineType | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeadlineType | null>(null)

  // Data
  const { data: practiceAreas, isLoading: paLoading } = usePracticeAreas(tenantId)
  const practiceAreaId = practiceAreaFilter === 'all' ? undefined : practiceAreaFilter
  const { data: deadlineTypes, isLoading: dtLoading } = useDeadlineTypes(tenantId, practiceAreaId)
  const { data: allMatterTypes } = useMatterTypes(tenantId)
  const deleteMutation = useDeleteDeadlineType()

  // Lookup maps
  const paMap = useMemo(
    () => new Map(practiceAreas?.map((pa) => [pa.id, pa]) ?? []),
    [practiceAreas]
  )
  const mtMap = useMemo(
    () => new Map(allMatterTypes?.map((mt) => [mt.id, mt]) ?? []),
    [allMatterTypes]
  )

  const isLoading = tenantLoading || paLoading || dtLoading

  if (isLoading) {
    return (
      <div className="max-w-3xl space-y-6">
        <DeadlineTypesSkeleton />
      </div>
    )
  }

  const items = deadlineTypes ?? []

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">Deadline Types</h2>
          <p className="mt-1 text-sm text-slate-500">
            Manage deadline categories used across your matters. Hard deadlines
            are critical and cannot be missed.
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Deadline Type
        </Button>
      </div>

      {/* Practice Area Tabs */}
      {practiceAreas && practiceAreas.length > 0 && (
        <Tabs
          value={practiceAreaFilter}
          onValueChange={setPracticeAreaFilter}
        >
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

      {/* List */}
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
          <Clock className="mx-auto mb-3 h-10 w-10 text-slate-400" />
          <h3 className="text-base font-medium text-slate-900">
            No deadline types yet
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Add your first deadline type to categorise deadlines on your matters.
          </p>
          <Button className="mt-4" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Deadline Type
          </Button>
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {items.map((dt) => (
            <DeadlineTypeRow
              key={dt.id}
              dt={dt}
              practiceArea={dt.practice_area_id ? paMap.get(dt.practice_area_id) : undefined}
              matterType={dt.matter_type_id ? mtMap.get(dt.matter_type_id) : undefined}
              onEdit={() => setEditTarget(dt)}
              onDelete={() => setDeleteTarget(dt)}
            />
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <DeadlineTypeDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        tenantId={tenantId}
        practiceAreas={practiceAreas ?? []}
        allMatterTypes={allMatterTypes ?? []}
      />

      {/* Edit Dialog */}
      <DeadlineTypeDialog
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null)
        }}
        tenantId={tenantId}
        practiceAreas={practiceAreas ?? []}
        allMatterTypes={allMatterTypes ?? []}
        deadlineType={editTarget}
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
            <AlertDialogTitle>
              Remove &ldquo;{deleteTarget?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will hide the deadline type from your workspace. Existing
              deadlines using this type are not affected. You can re-enable it at
              any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deleteTarget &&
                deleteMutation.mutate(
                  { id: deleteTarget.id, tenantId },
                  { onSuccess: () => setDeleteTarget(null) }
                )
              }
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
