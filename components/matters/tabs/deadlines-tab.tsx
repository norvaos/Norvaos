'use client'

import { useState } from 'react'
import { differenceInDays } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardAction } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { TenantDateInput } from '@/components/ui/tenant-date-input'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2, Calendar, AlertTriangle, Check } from 'lucide-react'
import { formatDate } from '@/lib/utils/formatters'
import { toast } from 'sonner'
import { HelperTip } from '@/components/ui/helper-tip'
import {
  useMatterDeadlines,
  useDeadlineTypes,
  useCreateMatterDeadline,
  useToggleMatterDeadline,
  useDeleteMatterDeadline,
} from '@/lib/queries/matter-types'
import type { Database } from '@/lib/types/database'

type MatterDeadlineRow = Database['public']['Tables']['matter_deadlines']['Row']
type DeadlineTypeRow = Database['public']['Tables']['deadline_types']['Row']

export function DeadlinesTab({
  matterId,
  tenantId,
  practiceAreaId,
}: {
  matterId: string
  tenantId: string
  practiceAreaId: string | null
}) {
  const [showForm, setShowForm] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newTypeId, setNewTypeId] = useState<string>('')
  const [newDescription, setNewDescription] = useState('')

  const { data: deadlines, isLoading } = useMatterDeadlines(tenantId, matterId)
  const { data: deadlineTypes } = useDeadlineTypes(tenantId, practiceAreaId)
  const createDeadline = useCreateMatterDeadline()
  const toggleDeadline = useToggleMatterDeadline()
  const deleteDeadline = useDeleteMatterDeadline()

  const selectedType = deadlineTypes?.find((dt) => dt.id === newTypeId)

  function handleAdd() {
    if (!newDate) return
    createDeadline.mutate(
      {
        tenantId,
        matterId,
        deadlineTypeId: newTypeId && newTypeId !== '__none__' ? newTypeId : null,
        deadlineType: selectedType?.name ?? 'General',
        deadlineDate: newDate,
        description: newDescription || null,
        title: selectedType?.name ?? 'Deadline',
      },
      {
        onSuccess: () => {
          setShowForm(false)
          setNewDate('')
          setNewTypeId('')
          setNewDescription('')
          toast.success('Deadline secured', {
            description: 'Automation reminders are now active.',
          })
        },
      }
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-md" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            Key Deadlines
            <HelperTip contentKey="matter.deadlines" />
          </CardTitle>
          <CardAction>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowForm((v) => !v)}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add Deadline
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add form */}
          {showForm && (
            <div className="rounded-lg border bg-slate-50 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Deadline Type
                  </label>
                  <Select value={newTypeId} onValueChange={setNewTypeId}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Select type (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__"> -  None  - </SelectItem>
                      {deadlineTypes?.map((dt) => (
                        <SelectItem key={dt.id} value={dt.id}>
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2 w-2 rounded-full shrink-0"
                              style={{ backgroundColor: dt.color }}
                            />
                            {dt.name}
                            {dt.is_hard && (
                              <Badge variant="destructive" className="text-[10px] py-0 px-1">HARD</Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Date *
                  </label>
                  <TenantDateInput
                    value={newDate}
                    onChange={(iso) => setNewDate(iso)}
                    className="h-9 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Notes (optional)
                </label>
                <Input
                  placeholder="e.g. Closing at 3pm"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="sticky bottom-0 flex items-center gap-2 bg-slate-50 py-1">
                <Button
                  size="sm"
                  className="bg-primary text-primary-foreground"
                  onClick={handleAdd}
                  disabled={!newDate || createDeadline.isPending}
                >
                  {createDeadline.isPending ? 'Saving\u2026' : 'Save'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowForm(false)
                    setNewDate('')
                    setNewTypeId('')
                    setNewDescription('')
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* List */}
          {!deadlines || deadlines.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Calendar className="size-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-foreground">No deadlines set</p>
              <p className="mt-1 text-xs text-muted-foreground max-w-[280px]">
                Click the &quot;+&quot; button above to add a milestone, or use a Study Permit template to auto-populate IRCC deadlines.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {deadlines.map((dl: MatterDeadlineRow) => {
                const isComplete = dl.status === 'completed' || dl.status === 'dismissed'
                let daysLeft = 0
                try {
                  daysLeft = dl.due_date ? differenceInDays(new Date(dl.due_date), new Date()) : 0
                } catch {
                  daysLeft = 0
                }
                const isOverdue = daysLeft < 0 && !isComplete
                const isDueToday = daysLeft === 0 && !isComplete
                const isRed = (isOverdue || isDueToday) && !isComplete
                const isAmber = daysLeft >= 1 && daysLeft <= 14 && !isComplete
                const isGreen = daysLeft >= 15 && !isComplete

                // Human-readable relative label
                const relativeLabel = daysLeft < 0
                  ? `(${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? 's' : ''} overdue)`
                  : daysLeft === 0
                    ? '(Today)'
                    : daysLeft === 1
                      ? '(Tomorrow)'
                      : `(In ${daysLeft} day${daysLeft !== 1 ? 's' : ''})`

                // Amber countdown text
                const countdownLabel = daysLeft === 0
                  ? 'Due today'
                  : daysLeft === 1
                    ? 'Tomorrow'
                    : `Due in ${daysLeft} days`

                return (
                  <div
                    key={dl.id}
                    className={cn(
                      'group flex items-start gap-3 py-3 px-3 rounded-md transition-colors',
                      isComplete && 'opacity-50',
                      isRed && 'bg-red-50 border-l-4 border-l-red-500',
                      isAmber && 'bg-amber-50/50 border-l-4 border-l-amber-400',
                      isGreen && 'border-l-4 border-l-emerald-300',
                    )}
                  >
                    <Checkbox
                      checked={isComplete}
                      onCheckedChange={(checked) =>
                        toggleDeadline.mutate({
                          id: dl.id,
                          tenantId,
                          matterId,
                          isCompleted: !!checked,
                        })
                      }
                      className="mt-0.5 shrink-0"
                      aria-label={`Mark deadline ${dl.title} as ${isComplete ? 'incomplete' : 'complete'}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isRed && (
                          <AlertTriangle className="size-3.5 text-red-500 shrink-0" />
                        )}
                        <span
                          className={cn(
                            'text-sm',
                            isRed && 'font-bold',
                            !isRed && 'font-medium',
                            isComplete && 'line-through text-muted-foreground'
                          )}
                        >
                          {dl.title}
                        </span>
                        {isOverdue && (
                          <Badge variant="destructive" className="text-xs">Overdue</Badge>
                        )}
                        {isDueToday && (
                          <Badge variant="destructive" className="text-xs">Due today</Badge>
                        )}
                        {isAmber && (
                          <Badge variant="outline" className="text-xs border-amber-400 text-amber-600 bg-amber-50">
                            {countdownLabel}
                          </Badge>
                        )}
                        {/* Automation sync badge for active deadlines */}
                        {!isComplete && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                            <Check className="size-3" />
                            Reminders active
                          </span>
                        )}
                      </div>
                      {dl.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{dl.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {formatDate(dl.due_date)}
                        <span className="text-xs text-muted-foreground ml-1">{relativeLabel}</span>
                      </p>
                    </div>
                    {/* Hover action: Create follow-up task */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-xs h-7"
                      onClick={() => {/* open task creation with deadline context */}}
                    >
                      <Plus className="size-3 mr-1" />
                      Create task
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        deleteDeadline.mutate({ id: dl.id, tenantId, matterId })
                      }
                      aria-label="Delete deadline"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
