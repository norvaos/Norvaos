'use client'

import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { useCreateTask } from '@/lib/queries/tasks'
import type { TaskFormValues } from '@/lib/schemas/task'
import { TaskForm } from '@/components/tasks/task-form'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface TaskCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  matterId?: string
  contactId?: string
}

export function TaskCreateDialog({ open, onOpenChange, matterId, contactId }: TaskCreateDialogProps) {
  const { tenant } = useTenant()
  const { appUser } = useUser()
  const createTask = useCreateTask()

  async function handleSubmit(values: TaskFormValues) {
    if (!tenant || !appUser) return

    await createTask.mutateAsync({
      tenant_id: tenant.id,
      title: values.title,
      description: values.description ?? undefined,
      matter_id: values.matter_id ?? undefined,
      contact_id: values.contact_id ?? undefined,
      assigned_to: values.assigned_to ?? undefined,
      due_date: values.due_date ?? undefined,
      due_time: values.due_time ?? undefined,
      start_date: values.start_date ?? undefined,
      priority: values.priority,
      estimated_minutes: values.estimated_minutes ?? undefined,
      follow_up_days: values.follow_up_days ?? undefined,
      task_type: values.task_type,
      category: values.category,
      is_billable: values.is_billable ?? undefined,
      visibility: values.visibility,
      reminder_date: values.reminder_date ?? undefined,
      status: 'not_started',
      created_via: 'manual',
      assigned_by: appUser.id,
      created_by: appUser.id,
    })

    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
          <DialogDescription>
            Add a new task to your workflow.
          </DialogDescription>
        </DialogHeader>
        <TaskForm
          mode="create"
          onSubmit={handleSubmit}
          isLoading={createTask.isPending}
          matterId={matterId}
          contactId={contactId}
        />
      </DialogContent>
    </Dialog>
  )
}
