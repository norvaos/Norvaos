'use client'

import { useState } from 'react'
import {
  FileText,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  AlertCircle,
  MoreHorizontal,
  Zap,
  Clock,
  CheckSquare,
  Mail,
  Bell,
} from 'lucide-react'
import { toast } from 'sonner'

import { useTenant } from '@/lib/hooks/use-tenant'
import { useUserRole } from '@/lib/hooks/use-user-role'
import { usePostSubmissionDocTypes } from '@/lib/queries/lifecycle'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { Label } from '@/components/ui/label'

// ─── Types ───────────────────────────────────────────────────────────────────

interface PostSubmissionDocType {
  id: string
  tenant_id: string
  name: string
  description: string | null
  trigger_type: string
  deadline_days: number | null
  task_template: string | null
  is_active: boolean
  sort_order: number
}

const TRIGGER_TYPES = [
  { value: 'stage_change', label: 'Stage Change', icon: Zap },
  { value: 'deadline', label: 'Deadline Reached', icon: Clock },
  { value: 'task_complete', label: 'Task Completed', icon: CheckSquare },
  { value: 'communication', label: 'Communication Received', icon: Mail },
]

function getTriggerIcon(type: string) {
  const trigger = TRIGGER_TYPES.find((t) => t.value === type)
  return trigger?.icon ?? Bell
}

function getTriggerLabel(type: string) {
  const trigger = TRIGGER_TYPES.find((t) => t.value === type)
  return trigger?.label ?? type
}

// ─── Edit Dialog ─────────────────────────────────────────────────────────────

function EditDocTypeDialog({
  open,
  onOpenChange,
  docType,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  docType: PostSubmissionDocType | null
  onSave: (data: Partial<PostSubmissionDocType>) => void
}) {
  const [name, setName] = useState(docType?.name ?? '')
  const [triggerType, setTriggerType] = useState(docType?.trigger_type ?? 'stage_change')
  const [deadlineDays, setDeadlineDays] = useState(String(docType?.deadline_days ?? ''))
  const [taskTemplate, setTaskTemplate] = useState(docType?.task_template ?? '')
  const [saving, setSaving] = useState(false)

  const isNew = !docType

  function handleSave() {
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }

    setSaving(true)
    onSave({
      name: name.trim(),
      trigger_type: triggerType,
      deadline_days: deadlineDays ? parseInt(deadlineDays, 10) : null,
      task_template: taskTemplate.trim() || null,
    })
    setSaving(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {isNew ? 'Add Document Type Rule' : 'Edit Document Type Rule'}
          </DialogTitle>
          <DialogDescription>
            Configure when and how post-submission documents are triggered.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Document Type Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Approval Letter"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="trigger">Trigger</Label>
            <Select value={triggerType} onValueChange={setTriggerType}>
              <SelectTrigger id="trigger">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deadline">Deadline Days</Label>
            <Input
              id="deadline"
              type="number"
              min="0"
              value={deadlineDays}
              onChange={(e) => setDeadlineDays(e.target.value)}
              placeholder="Number of days from trigger"
            />
            <p className="text-xs text-muted-foreground">
              How many days after the trigger before this document is due.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-template">Task Template Key</Label>
            <Input
              id="task-template"
              value={taskTemplate}
              onChange={(e) => setTaskTemplate(e.target.value)}
              placeholder="e.g. follow_up_approval"
            />
            <p className="text-xs text-muted-foreground">
              Optional task template to auto-create when this document type is triggered.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            {isNew ? 'Add Rule' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AutomationRulesSettingsPage() {
  const { tenant } = useTenant()
  const { role } = useUserRole()

  const { data: docTypes, isLoading } = usePostSubmissionDocTypes(tenant?.id ?? '')

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingDocType, setEditingDocType] = useState<PostSubmissionDocType | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  // Permission check
  const canView = role?.name === 'Admin' || role?.permissions?.settings?.view === true
  const canEdit = role?.name === 'Admin' || role?.permissions?.settings?.edit === true

  if (!canView) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <AlertCircle className="mx-auto size-10 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-medium">Access Denied</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You do not have permission to view automation rule settings.
          </p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-1 h-4 w-72" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    )
  }

  const typedDocTypes = (docTypes ?? []) as unknown as PostSubmissionDocType[]

  function handleSaveDocType(data: Partial<PostSubmissionDocType>) {
    // TODO: wire to create/update mutation
    if (editingDocType) {
      toast.success('Document type rule updated')
    } else {
      toast.success('Document type rule created')
    }
  }

  function handleToggleActive(id: string, currentActive: boolean) {
    // TODO: wire to mutation
    toast.info(currentActive ? 'Rule deactivated' : 'Rule activated')
  }

  function handleDelete() {
    if (!deleteTargetId) return
    // TODO: wire to mutation
    toast.success('Document type rule deleted')
    setDeleteDialogOpen(false)
    setDeleteTargetId(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Automation Rules</h1>
          <p className="mt-1 text-sm text-slate-500">
            Configure post-submission document types and their automation triggers.
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={() => {
              setEditingDocType(null)
              setEditDialogOpen(true)
            }}
          >
            <Plus className="mr-2 size-4" />
            Add Rule
          </Button>
        )}
      </div>

      {/* Rules List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Post-Submission Document Types</CardTitle>
          <CardDescription>
            Define document types that are triggered by stage changes, deadlines, tasks, or communications.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {typedDocTypes.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 p-8 text-center">
              <FileText className="mx-auto size-8 text-slate-300" />
              <p className="mt-2 text-sm font-medium text-slate-600">No automation rules configured</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add document type rules to automate post-submission workflows.
              </p>
              {canEdit && (
                <Button
                  className="mt-3"
                  size="sm"
                  onClick={() => {
                    setEditingDocType(null)
                    setEditDialogOpen(true)
                  }}
                >
                  <Plus className="mr-2 size-3.5" />
                  Add Rule
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {typedDocTypes.map((docType) => {
                const TriggerIcon = getTriggerIcon(docType.trigger_type)
                return (
                  <div
                    key={docType.id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                        <TriggerIcon className="size-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-900">{docType.name}</p>
                          {!docType.is_active && (
                            <Badge variant="secondary" className="text-xs">Inactive</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-muted-foreground">
                            Trigger: {getTriggerLabel(docType.trigger_type)}
                          </span>
                          {docType.deadline_days != null && (
                            <span className="text-xs text-muted-foreground">
                              Deadline: {docType.deadline_days} days
                            </span>
                          )}
                          {docType.task_template && (
                            <span className="text-xs text-muted-foreground">
                              Task: {docType.task_template}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {canEdit && (
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={docType.is_active}
                          onCheckedChange={() => handleToggleActive(docType.id, docType.is_active)}
                          aria-label="Toggle active"
                        />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setEditingDocType(docType)
                                setEditDialogOpen(true)
                              }}
                            >
                              <Pencil className="mr-2 size-3.5" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => {
                                setDeleteTargetId(docType.id)
                                setDeleteDialogOpen(true)
                              }}
                            >
                              <Trash2 className="mr-2 size-3.5" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <EditDocTypeDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        docType={editingDocType}
        onSave={handleSaveDocType}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Automation Rule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the document type rule and its associated triggers.
              Existing documents created by this rule will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
