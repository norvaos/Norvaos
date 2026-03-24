'use client'

import { useState } from 'react'
import {
  Bell,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  AlertCircle,
  MoreHorizontal,
  Clock,
  Mail,
  CheckSquare,
} from 'lucide-react'
import { toast } from 'sonner'

import { useTenant } from '@/lib/hooks/use-tenant'
import { useUserRole } from '@/lib/hooks/use-user-role'
import { useExpiryReminders } from '@/lib/queries/lifecycle'

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
import { HelperTip } from '@/components/ui/helper-tip'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExpiryReminderRule {
  id: string
  tenant_id: string
  name: string
  offset_days: number
  reminder_type: 'email' | 'task' | 'notification'
  description: string | null
  is_active: boolean
}

const REMINDER_TYPES = [
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'task', label: 'Create Task', icon: CheckSquare },
  { value: 'notification', label: 'In-App Notification', icon: Bell },
]

function getReminderTypeLabel(type: string) {
  return REMINDER_TYPES.find((t) => t.value === type)?.label ?? type
}

function getReminderTypeIcon(type: string) {
  return REMINDER_TYPES.find((t) => t.value === type)?.icon ?? Bell
}

// ─── Edit Dialog ─────────────────────────────────────────────────────────────

function EditReminderDialog({
  open,
  onOpenChange,
  rule,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rule: ExpiryReminderRule | null
  onSave: (data: Partial<ExpiryReminderRule>) => void
}) {
  const [name, setName] = useState(rule?.name ?? '')
  const [offsetDays, setOffsetDays] = useState(String(rule?.offset_days ?? 30))
  const [reminderType, setReminderType] = useState<string>(rule?.reminder_type ?? 'email')
  const [description, setDescription] = useState(rule?.description ?? '')
  const [saving, setSaving] = useState(false)

  const isNew = !rule

  function handleSave() {
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }
    const days = parseInt(offsetDays, 10)
    if (isNaN(days) || days < 1) {
      toast.error('Offset days must be at least 1')
      return
    }

    setSaving(true)
    onSave({
      name: name.trim(),
      offset_days: days,
      reminder_type: reminderType as ExpiryReminderRule['reminder_type'],
      description: description.trim() || null,
    })
    setSaving(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {isNew ? 'Add Reminder Rule' : 'Edit Reminder Rule'}
          </DialogTitle>
          <DialogDescription>
            Configure when reminders are sent before document or status expiry dates.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Rule Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 30-day expiry warning"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="offset">Days Before Expiry</Label>
            <Input
              id="offset"
              type="number"
              min="1"
              value={offsetDays}
              onChange={(e) => setOffsetDays(e.target.value)}
              placeholder="30"
            />
            <p className="text-xs text-muted-foreground">
              How many days before the expiry date to send the reminder.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Reminder Type</Label>
            <Select value={reminderType} onValueChange={setReminderType}>
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REMINDER_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description of this rule"
            />
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

export default function ExpiryRemindersSettingsPage() {
  const { tenant } = useTenant()
  const { role } = useUserRole()

  // Fetch existing expiry reminders (showing those within 365 days for the list)
  const { data: expiringRecords, isLoading } = useExpiryReminders(tenant?.id ?? '', 365)

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<ExpiryReminderRule | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  // Local state for reminder rules (these would come from a dedicated table in production)
  const [rules, setRules] = useState<ExpiryReminderRule[]>([
    {
      id: 'default-90',
      tenant_id: tenant?.id ?? '',
      name: '90-day expiry warning',
      offset_days: 90,
      reminder_type: 'email',
      description: 'Send email notification 90 days before expiry',
      is_active: true,
    },
    {
      id: 'default-30',
      tenant_id: tenant?.id ?? '',
      name: '30-day expiry warning',
      offset_days: 30,
      reminder_type: 'notification',
      description: 'In-app notification 30 days before expiry',
      is_active: true,
    },
    {
      id: 'default-7',
      tenant_id: tenant?.id ?? '',
      name: '7-day urgent reminder',
      offset_days: 7,
      reminder_type: 'task',
      description: 'Create follow-up task 7 days before expiry',
      is_active: true,
    },
  ])

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
            You do not have permission to view expiry reminder settings.
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

  function handleSaveRule(data: Partial<ExpiryReminderRule>) {
    if (editingRule) {
      setRules((prev) =>
        prev.map((r) => (r.id === editingRule.id ? { ...r, ...data } : r))
      )
      toast.success('Reminder rule updated')
    } else {
      const newRule: ExpiryReminderRule = {
        id: `rule-${Date.now()}`,
        tenant_id: tenant?.id ?? '',
        name: data.name ?? '',
        offset_days: data.offset_days ?? 30,
        reminder_type: data.reminder_type ?? 'email',
        description: data.description ?? null,
        is_active: true,
      }
      setRules((prev) => [...prev, newRule])
      toast.success('Reminder rule created')
    }
  }

  function handleDeleteRule() {
    if (!deleteTargetId) return
    setRules((prev) => prev.filter((r) => r.id !== deleteTargetId))
    toast.success('Reminder rule deleted')
    setDeleteDialogOpen(false)
    setDeleteTargetId(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">Expiry Reminders</h1>
            <HelperTip contentKey="settings.expiry_rules" />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Configure reminder timing rules for document and status expiry dates.
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={() => {
              setEditingRule(null)
              setEditDialogOpen(true)
            }}
          >
            <Plus className="mr-2 size-4" />
            Add Rule
          </Button>
        )}
      </div>

      {/* Reminder Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Reminder Rules</CardTitle>
          <CardDescription>
            Define when reminders should be sent relative to expiry dates. Each rule can trigger
            an email, an in-app notification, or a task creation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 p-8 text-center">
              <Clock className="mx-auto size-8 text-slate-300" />
              <p className="mt-2 text-sm font-medium text-slate-600">No reminder rules configured</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add rules to automatically notify your team before documents or statuses expire.
              </p>
              {canEdit && (
                <Button
                  className="mt-3"
                  size="sm"
                  onClick={() => {
                    setEditingRule(null)
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
              {rules
                .sort((a, b) => b.offset_days - a.offset_days)
                .map((rule) => {
                  const TypeIcon = getReminderTypeIcon(rule.reminder_type)
                  return (
                    <div
                      key={rule.id}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                          <TypeIcon className="size-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-slate-900">{rule.name}</p>
                            {!rule.is_active && (
                              <Badge variant="secondary" className="text-xs">Inactive</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-muted-foreground">
                              {rule.offset_days} days before expiry
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Type: {getReminderTypeLabel(rule.reminder_type)}
                            </span>
                          </div>
                          {rule.description && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{rule.description}</p>
                          )}
                        </div>
                      </div>

                      {canEdit && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setEditingRule(rule)
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
                                setDeleteTargetId(rule.id)
                                setDeleteDialogOpen(true)
                              }}
                            >
                              <Trash2 className="mr-2 size-3.5" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  )
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upcoming Expiries Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Upcoming Expiries</CardTitle>
          <CardDescription>
            Contact status records expiring within the next year. Reminders are sent based on the rules above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!expiringRecords || expiringRecords.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming expiries found.</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {expiringRecords.length} contact status{expiringRecords.length === 1 ? '' : ' records'} expiring
              within the next 365 days.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <EditReminderDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        rule={editingRule}
        onSave={handleSaveRule}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Reminder Rule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the reminder rule. Existing reminders already sent will not be recalled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRule}
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
