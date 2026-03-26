'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { timeEntrySchema, type TimeEntryFormValues } from '@/lib/schemas/time-entry'
import { useCreateTimeEntry, useUpdateTimeEntry, type TimeEntry } from '@/lib/queries/invoicing'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TenantDateInput } from '@/components/ui/tenant-date-input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface TimeEntryFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editEntry?: TimeEntry | null
}

export function TimeEntryForm({ open, onOpenChange, editEntry }: TimeEntryFormProps) {
  const { tenant } = useTenant()
  const { appUser } = useUser()
  const tenantId = tenant?.id ?? ''

  const createTimeEntry = useCreateTimeEntry()
  const updateTimeEntry = useUpdateTimeEntry()

  // Fetch active matters for dropdown
  const { data: matters } = useQuery({
    queryKey: ['matters', tenantId, 'active-list'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('matters')
        .select('id, title, matter_number')
        .eq('tenant_id', tenantId)
        .in('status', ['active', 'intake'])
        .order('title')
        .limit(200)
      if (error) throw error
      return data
    },
    enabled: !!tenantId && open,
    staleTime: 3 * 60 * 1000,
  })

  const form = useForm<TimeEntryFormValues>({
    resolver: zodResolver(timeEntrySchema),
    defaultValues: {
      matterId: editEntry?.matter_id ?? '',
      description: editEntry?.description ?? '',
      durationMinutes: editEntry?.duration_minutes ?? 0,
      entryDate: editEntry?.entry_date ?? new Date().toISOString().split('T')[0],
      hourlyRate: editEntry?.hourly_rate ?? null,
      isBillable: editEntry?.is_billable ?? true,
    },
  })

  const onSubmit = (values: TimeEntryFormValues) => {
    if (!tenantId || !appUser) return

    if (editEntry) {
      updateTimeEntry.mutate(
        {
          id: editEntry.id,
          matter_id: values.matterId,
          description: values.description,
          duration_minutes: values.durationMinutes,
          entry_date: values.entryDate,
          hourly_rate: values.hourlyRate ?? null,
          is_billable: values.isBillable,
        },
        { onSuccess: () => onOpenChange(false) }
      )
    } else {
      createTimeEntry.mutate(
        {
          tenant_id: tenantId,
          matter_id: values.matterId,
          user_id: appUser.id,
          description: values.description,
          duration_minutes: values.durationMinutes,
          entry_date: values.entryDate,
          hourly_rate: values.hourlyRate ?? null,
          is_billable: values.isBillable,
        },
        { onSuccess: () => onOpenChange(false) }
      )
    }
  }

  const isPending = createTimeEntry.isPending || updateTimeEntry.isPending

  // Convert minutes to h:mm display
  const durationMinutes = form.watch('durationMinutes')
  const hours = Math.floor(durationMinutes / 60)
  const mins = durationMinutes % 60

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editEntry ? 'Edit Time Entry' : 'Log Time'}</DialogTitle>
          <DialogDescription>
            {editEntry ? 'Update this time entry.' : 'Record time spent on a matter.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Matter select */}
          <div className="space-y-1.5">
            <Label>Matter</Label>
            <Select
              value={form.watch('matterId')}
              onValueChange={(v) => form.setValue('matterId', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a matter" />
              </SelectTrigger>
              <SelectContent>
                {(matters ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.matter_number ? `${m.matter_number}  -  ` : ''}{m.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.matterId && (
              <p className="text-xs text-destructive">{form.formState.errors.matterId.message}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input {...form.register('description')} placeholder="What did you work on?" />
            {form.formState.errors.description && (
              <p className="text-xs text-destructive">{form.formState.errors.description.message}</p>
            )}
          </div>

          {/* Duration + Date row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Duration (minutes)</Label>
              <Input
                type="number"
                min={1}
                {...form.register('durationMinutes', { valueAsNumber: true })}
              />
              {durationMinutes > 0 && (
                <p className="text-xs text-muted-foreground">
                  {hours}h {mins}m
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <TenantDateInput value={form.watch('entryDate')} onChange={(iso) => form.setValue('entryDate', iso)} />
            </div>
          </div>

          {/* Hourly rate */}
          <div className="space-y-1.5">
            <Label>Hourly Rate (optional)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="e.g. 250.00"
              {...form.register('hourlyRate', { valueAsNumber: true })}
            />
          </div>

          {/* Billable toggle */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="is_billable"
              checked={form.watch('isBillable')}
              onCheckedChange={(checked) => form.setValue('isBillable', !!checked)}
            />
            <Label htmlFor="is_billable" className="text-sm font-normal">
              Billable
            </Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving...' : editEntry ? 'Update' : 'Log Time'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
