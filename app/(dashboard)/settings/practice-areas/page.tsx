'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Layers } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Database } from '@/lib/types/database'

type PracticeArea = Database['public']['Tables']['practice_areas']['Row']

// ─── Colour swatches ────────────────────────────────────────────────────────

const COLOUR_SWATCHES = [
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

// ─── Form schema ─────────────────────────────────────────────────────────────

const practiceAreaSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name cannot exceed 100 characters'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex colour'),
})

type PracticeAreaFormValues = z.infer<typeof practiceAreaSchema>

// ─── Data hooks ───────────────────────────────────────────────────────────────

function usePracticeAreas(tenantId: string) {
  return useQuery({
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
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PracticeAreasPage() {
  const { tenant } = useTenant()
  const tenantId = tenant?.id ?? ''
  const queryClient = useQueryClient()

  const { data: practiceAreas, isLoading } = usePracticeAreas(tenantId)

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<PracticeArea | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PracticeArea | null>(null)

  // ── Create mutation ────────────────────────────────────────────────────────
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practice_areas'] })
      setCreateDialogOpen(false)
      toast.success('Practice area created.')
    },
    onError: (err: Error) => {
      toast.error(
        err.message.includes('unique')
          ? 'A practice area with that name already exists.'
          : 'Failed to create practice area.'
      )
    },
  })

  // ── Update mutation ────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: PracticeAreaFormValues }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('practice_areas')
        .update(values)
        .eq('id', id)
        .eq('tenant_id', tenantId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practice_areas'] })
      setEditTarget(null)
      toast.success('Practice area updated.')
    },
    onError: (err: Error) => {
      toast.error(
        err.message.includes('unique')
          ? 'A practice area with that name already exists.'
          : 'Failed to update practice area.'
      )
    },
  })

  // ── Toggle is_enabled ──────────────────────────────────────────────────────
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
    onSuccess: (_, { is_enabled }) => {
      queryClient.invalidateQueries({ queryKey: ['practice_areas'] })
      toast.success(is_enabled ? 'Practice area enabled.' : 'Practice area disabled.')
    },
    onError: () => toast.error('Failed to update practice area status.'),
  })

  // ── Soft-delete mutation ───────────────────────────────────────────────────
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practice_areas'] })
      setDeleteTarget(null)
      toast.success('Practice area removed.')
    },
    onError: () => toast.error('Failed to remove practice area.'),
  })

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Practice Areas</h2>
          <p className="mt-1 text-sm text-slate-500">
            Manage which practice areas are active in your firm. Enabling an area makes it
            available in the global practice filter and matter creation form.
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" />
          Add Practice Area
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : !practiceAreas || practiceAreas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
          <Layers className="mx-auto mb-3 h-10 w-10 text-slate-400" />
          <h3 className="text-base font-medium text-slate-900">No practice areas yet</h3>
          <p className="mt-1 text-sm text-slate-500">Add your first practice area to get started.</p>
          <Button className="mt-4" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Practice Area
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {practiceAreas.map((pa) => (
            <PracticeAreaRow
              key={pa.id}
              practiceArea={pa}
              isToggling={toggleMutation.isPending && (toggleMutation.variables as { id: string } | undefined)?.id === pa.id}
              onToggle={(enabled) => toggleMutation.mutate({ id: pa.id, is_enabled: enabled })}
              onEdit={() => setEditTarget(pa)}
              onDelete={() => setDeleteTarget(pa)}
            />
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <PracticeAreaDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        title="Add Practice Area"
        description="Create a new practice area. You can add matter types, pipelines, and deadline templates after saving."
        onSubmit={(values) => createMutation.mutate(values)}
        isLoading={createMutation.isPending}
      />

      {/* Edit Dialog */}
      {editTarget && (
        <PracticeAreaDialog
          open={!!editTarget}
          onOpenChange={(open) => {
            if (!open) setEditTarget(null)
          }}
          title="Edit Practice Area"
          description="Update the name or colour for this practice area."
          initialValues={{ name: editTarget.name, color: editTarget.color ?? '' }}
          onSubmit={(values) => updateMutation.mutate({ id: editTarget.id, values })}
          isLoading={updateMutation.isPending}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove &ldquo;{deleteTarget?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will disable and hide the practice area from your workspace. Existing matters
              linked to it are unaffected. You can re-enable it at any time.
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

// ─── Row component ────────────────────────────────────────────────────────────

interface PracticeAreaRowProps {
  practiceArea: PracticeArea
  isToggling: boolean
  onToggle: (enabled: boolean) => void
  onEdit: () => void
  onDelete: () => void
}

function PracticeAreaRow({
  practiceArea: pa,
  isToggling,
  onToggle,
  onEdit,
  onDelete,
}: PracticeAreaRowProps) {
  const enabled = (pa as PracticeArea & { is_enabled?: boolean }).is_enabled ?? pa.is_active

  return (
    <div
      className={cn(
        'flex items-center gap-4 px-4 py-3 transition-colors hover:bg-slate-50',
        !enabled && 'opacity-60'
      )}
    >
      {/* Colour swatch */}
      <div
        className="h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: pa.color ?? undefined }}
        aria-hidden="true"
      />

      {/* Name + badge */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-900 truncate">{pa.name}</span>
          {!enabled && (
            <Badge variant="secondary" className="text-xs">Disabled</Badge>
          )}
        </div>
      </div>

      {/* Enabled toggle */}
      <div className="flex items-center gap-1.5">
        {enabled ? (
          <ToggleRight className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
        ) : (
          <ToggleLeft className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
        )}
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          disabled={isToggling}
          aria-label={`${enabled ? 'Disable' : 'Enable'} ${pa.name}`}
          className="data-[state=checked]:bg-emerald-600"
        />
      </div>

      {/* Edit / Delete */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onEdit}
          aria-label={`Edit ${pa.name}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={onDelete}
          aria-label={`Remove ${pa.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ─── Create / Edit dialog ─────────────────────────────────────────────────────

interface PracticeAreaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  initialValues?: PracticeAreaFormValues
  onSubmit: (values: PracticeAreaFormValues) => void
  isLoading: boolean
}

function PracticeAreaDialog({
  open,
  onOpenChange,
  title,
  description,
  initialValues,
  onSubmit,
  isLoading,
}: PracticeAreaDialogProps) {
  const form = useForm<PracticeAreaFormValues>({
    resolver: zodResolver(practiceAreaSchema),
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
                  <FormDescription>
                    Used for badges and the practice filter indicator.
                  </FormDescription>
                  <FormControl>
                    <div className="space-y-3">
                      {/* Colour swatches */}
                      <div className="flex flex-wrap gap-2">
                        {COLOUR_SWATCHES.map((colour) => (
                          <button
                            key={colour}
                            type="button"
                            className={cn(
                              'h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1',
                              field.value === colour
                                ? 'border-slate-900 scale-110'
                                : 'border-transparent'
                            )}
                            style={{ backgroundColor: colour }}
                            onClick={() => field.onChange(colour)}
                            aria-label={`Select colour ${colour}`}
                          />
                        ))}
                      </div>
                      {/* Custom hex input */}
                      <div className="flex items-center gap-2">
                        <div
                          className="h-7 w-7 shrink-0 rounded-full border"
                          style={{ backgroundColor: selectedColour }}
                        />
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
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
