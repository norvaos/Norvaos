'use client'

import { useState } from 'react'
import { differenceInDays } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardAction } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2, Calendar, AlertTriangle } from 'lucide-react'
import { formatDate } from '@/lib/utils/formatters'
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
                      <SelectItem value="__none__">— None —</SelectItem>
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
                  <Input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
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
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
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
            <div className="py-8 text-center">
              <Calendar className="mx-auto mb-2 h-8 w-8 text-slate-300" />
              <p className="text-sm text-muted-foreground">No deadlines added yet.</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Add key deadlines to track important dates for this matter.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {deadlines.map((dl: MatterDeadlineRow) => {
                const today = new Date().toISOString().split('T')[0]
                const isComplete = dl.status === 'completed' || dl.status === 'dismissed'
                let daysLeft = 0
                try {
                  daysLeft = dl.due_date ? differenceInDays(new Date(dl.due_date), new Date()) : 0
                } catch {
                  daysLeft = 0
                }
                const isOverdue = dl.due_date && dl.due_date < today && !isComplete
                const isUrgent = daysLeft >= 0 && daysLeft <= 3 && !isComplete
                const isWarning = daysLeft > 3 && daysLeft <= 7 && !isComplete

                return (
                  <div
                    key={dl.id}
                    className={cn(
                      'flex items-start gap-3 py-3',
                      isComplete && 'opacity-50'
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
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'text-sm font-medium',
                            isComplete && 'line-through text-muted-foreground'
                          )}
                        >
                          {dl.title}
                        </span>
                        {isOverdue && (
                          <Badge variant="destructive" className="text-xs">Overdue</Badge>
                        )}
                        {isUrgent && !isOverdue && (
                          <Badge variant="destructive" className="text-xs">{daysLeft}d</Badge>
                        )}
                        {isWarning && (
                          <Badge variant="outline" className="text-xs border-orange-400 text-orange-600 bg-orange-50">
                            {daysLeft}d
                          </Badge>
                        )}
                      </div>
                      {dl.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{dl.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {formatDate(dl.due_date)}
                      </p>
                    </div>
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
