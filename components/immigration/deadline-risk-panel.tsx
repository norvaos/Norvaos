'use client'

import { useState, useCallback, useMemo } from 'react'
import { useUser } from '@/lib/hooks/use-user'
import { useMatterDeadlines, useCreateDeadline, useCompleteDeadline } from '@/lib/queries/immigration'
import { DEADLINE_TYPES, PRIORITIES } from '@/lib/utils/constants'
import { formatDate } from '@/lib/utils/formatters'
import {
  calculateMatterRiskSummary,
  calculateDeadlineRiskScore,
  getRiskLevelConfig,
} from '@/lib/utils/deadline-risk-engine'
import { differenceInDays, isPast, isToday } from 'date-fns'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  Plus,
  Shield,
  X,
} from 'lucide-react'

import type { Database } from '@/lib/types/database'

type Deadline = Database['public']['Tables']['matter_deadlines']['Row']

interface DeadlineRiskPanelProps {
  matterId: string
  tenantId: string
}

function getDeadlineTypeConfig(type: string) {
  return DEADLINE_TYPES.find((dt) => dt.value === type) ?? { value: type, label: type, color: '#6b7280' }
}

function getUrgencyInfo(dueDate: string) {
  const due = new Date(dueDate)
  const today = new Date()
  const days = differenceInDays(due, today)

  if (isPast(due) && !isToday(due)) {
    return {
      label: `${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} overdue`,
      colorClass: 'text-red-600',
      bgClass: 'bg-red-50 border-red-200',
      level: 'overdue' as const,
    }
  }
  if (days <= 7) {
    return {
      label: days === 0 ? 'Due today' : `${days} day${days !== 1 ? 's' : ''} remaining`,
      colorClass: 'text-orange-600',
      bgClass: 'bg-orange-50 border-orange-200',
      level: 'at_risk' as const,
    }
  }
  if (days <= 30) {
    return {
      label: `${days} days remaining`,
      colorClass: 'text-amber-600',
      bgClass: 'bg-amber-50 border-amber-200',
      level: 'upcoming' as const,
    }
  }
  return {
    label: `${days} days remaining`,
    colorClass: 'text-slate-600',
    bgClass: 'bg-white border-slate-200',
    level: 'upcoming' as const,
  }
}

export function DeadlineRiskPanel({ matterId, tenantId }: DeadlineRiskPanelProps) {
  const { appUser } = useUser()
  const { data: deadlines, isLoading } = useMatterDeadlines(matterId)
  const createDeadline = useCreateDeadline()
  const completeDeadline = useCompleteDeadline()

  const [showAddForm, setShowAddForm] = useState(false)
  const [newDeadline, setNewDeadline] = useState({
    title: '',
    due_date: '',
    deadline_type: 'custom',
    priority: 'medium',
  })

  const handleCreate = useCallback(() => {
    if (!newDeadline.title || !newDeadline.due_date) return

    createDeadline.mutate(
      {
        tenant_id: tenantId,
        matter_id: matterId,
        title: newDeadline.title,
        due_date: newDeadline.due_date,
        deadline_type: newDeadline.deadline_type,
        priority: newDeadline.priority,
      },
      {
        onSuccess: () => {
          setNewDeadline({ title: '', due_date: '', deadline_type: 'custom', priority: 'medium' })
          setShowAddForm(false)
        },
      }
    )
  }, [createDeadline, matterId, tenantId, newDeadline])

  const handleComplete = useCallback(
    (deadlineId: string) => {
      completeDeadline.mutate({ id: deadlineId, userId: appUser?.id ?? '' })
    },
    [completeDeadline, appUser]
  )

  // Compute summary stats
  const summary = useMemo(() => {
    if (!deadlines) return { upcoming: 0, atRisk: 0, overdue: 0 }

    let upcoming = 0
    let atRisk = 0
    let overdue = 0

    for (const d of deadlines) {
      if (d.status === 'completed' || d.status === 'dismissed') continue
      const { level } = getUrgencyInfo(d.due_date)
      if (level === 'overdue') overdue++
      else if (level === 'at_risk') atRisk++
      else upcoming++
    }

    return { upcoming, atRisk, overdue }
  }, [deadlines])

  // Compute risk summary from the scoring engine
  const riskSummary = useMemo(() => {
    if (!deadlines) return null
    return calculateMatterRiskSummary(deadlines)
  }, [deadlines])

  // Sort deadlines: active first by due_date, then completed
  const sortedDeadlines = useMemo(() => {
    if (!deadlines) return []

    const active = deadlines
      .filter((d) => d.status !== 'completed' && d.status !== 'dismissed')
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())

    const done = deadlines
      .filter((d) => d.status === 'completed' || d.status === 'dismissed')
      .sort((a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime())

    return [...active, ...done]
  }, [deadlines])

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-3">
          <Skeleton className="h-16 flex-1" />
          <Skeleton className="h-16 flex-1" />
          <Skeleton className="h-16 flex-1" />
        </div>
        <Skeleton className="h-8 w-32" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Risk gauge */}
      {riskSummary && riskSummary.activeCount > 0 && (() => {
        const levelConfig = getRiskLevelConfig(riskSummary.overallLevel)
        return (
          <div className={cn('rounded-lg border p-3', levelConfig.bg, levelConfig.border)}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Shield className={cn('h-4 w-4', levelConfig.text)} />
                <span className={cn('text-sm font-semibold', levelConfig.text)}>
                  Risk Score: {riskSummary.overallScore}
                </span>
              </div>
              <Badge
                variant="outline"
                className={cn('text-xs', levelConfig.text, levelConfig.border)}
              >
                {levelConfig.label}
              </Badge>
            </div>
            <div className="h-2 w-full rounded-full bg-white/60">
              <div
                className={cn('h-full rounded-full transition-all', levelConfig.barColor)}
                style={{ width: `${riskSummary.overallScore}%` }}
              />
            </div>
            {riskSummary.criticalCount > 0 && (
              <p className="text-xs text-red-600 font-medium mt-1.5">
                {riskSummary.criticalCount} critical deadline{riskSummary.criticalCount !== 1 ? 's' : ''} require immediate attention
              </p>
            )}
          </div>
        )
      })()}

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-center">
          <p className="text-2xl font-bold text-blue-700">{summary.upcoming}</p>
          <p className="text-xs text-blue-600 font-medium">Upcoming</p>
        </div>
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-center">
          <p className="text-2xl font-bold text-orange-700">{summary.atRisk}</p>
          <p className="text-xs text-orange-600 font-medium">At Risk</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
          <p className="text-2xl font-bold text-red-700">{summary.overdue}</p>
          <p className="text-xs text-red-600 font-medium">Overdue</p>
        </div>
        {riskSummary && (() => {
          const cfg = getRiskLevelConfig(riskSummary.overallLevel)
          return (
            <div className={cn('rounded-lg border p-3 text-center', cfg.bg, cfg.border)}>
              <p className={cn('text-2xl font-bold', cfg.text)}>
                {riskSummary.overallScore}
              </p>
              <p className={cn('text-xs font-medium', cfg.text)}>Risk Score</p>
            </div>
          )
        })()}
      </div>

      {/* Add deadline button / form */}
      {showAddForm ? (
        <div className="rounded-lg border border-slate-200 p-4 space-y-3 bg-slate-50">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-slate-900">Add Deadline</h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAddForm(false)}
              className="h-7 w-7 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="deadline-title" className="text-xs">
                Title
              </Label>
              <Input
                id="deadline-title"
                value={newDeadline.title}
                onChange={(e) =>
                  setNewDeadline((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="e.g., Submit biometrics"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="deadline-due-date" className="text-xs">
                Due Date
              </Label>
              <Input
                id="deadline-due-date"
                type="date"
                value={newDeadline.due_date}
                onChange={(e) =>
                  setNewDeadline((prev) => ({ ...prev, due_date: e.target.value }))
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="deadline-type" className="text-xs">
                Type
              </Label>
              <Select
                value={newDeadline.deadline_type}
                onValueChange={(value) =>
                  setNewDeadline((prev) => ({ ...prev, deadline_type: value }))
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEADLINE_TYPES.map((dt) => (
                    <SelectItem key={dt.value} value={dt.value}>
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: dt.color }}
                        />
                        {dt.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="deadline-priority" className="text-xs">
                Priority
              </Label>
              <Select
                value={newDeadline.priority}
                onValueChange={(value) =>
                  setNewDeadline((prev) => ({ ...prev, priority: value }))
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: p.color }}
                        />
                        {p.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddForm(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={!newDeadline.title || !newDeadline.due_date || createDeadline.isPending}
            >
              {createDeadline.isPending ? 'Adding...' : 'Add Deadline'}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setShowAddForm(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add Deadline
        </Button>
      )}

      <Separator />

      {/* Deadlines list */}
      {sortedDeadlines.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <CalendarClock className="h-10 w-10 text-slate-300 mb-2" />
          <p className="text-sm text-slate-500">No deadlines yet</p>
          <p className="text-xs text-slate-400 mt-1">Add a deadline to start tracking due dates.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedDeadlines.map((deadline) => {
            const isComplete = deadline.status === 'completed' || deadline.status === 'dismissed'
            const typeConfig = getDeadlineTypeConfig(deadline.deadline_type)
            const urgency = !isComplete ? getUrgencyInfo(deadline.due_date) : null
            const dlRisk = !isComplete ? calculateDeadlineRiskScore(deadline) : null
            const dlRiskConfig = dlRisk ? getRiskLevelConfig(dlRisk.level) : null

            return (
              <div
                key={deadline.id}
                className={cn(
                  'rounded-lg border p-3 transition-colors',
                  isComplete
                    ? 'bg-slate-50 border-slate-200 opacity-60'
                    : urgency?.bgClass ?? 'bg-white border-slate-200'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={cn(
                          'text-sm font-medium',
                          isComplete ? 'text-slate-500 line-through' : 'text-slate-900'
                        )}
                      >
                        {deadline.title}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-xs py-0 px-1.5 border-0"
                        style={{
                          backgroundColor: `${typeConfig.color}20`,
                          color: typeConfig.color,
                        }}
                      >
                        {typeConfig.label}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-3 mt-1.5">
                      <div className="flex items-center gap-1 text-xs">
                        <Clock className="h-3 w-3 text-slate-400" />
                        <span className="text-slate-600">{formatDate(deadline.due_date)}</span>
                      </div>
                      {!isComplete && urgency && (
                        <span className={cn('text-xs font-medium', urgency.colorClass)}>
                          {urgency.level === 'overdue' && (
                            <AlertTriangle className="h-3 w-3 inline mr-0.5" />
                          )}
                          {urgency.label}
                        </span>
                      )}
                      {dlRisk && dlRiskConfig && (
                        <Badge
                          variant="outline"
                          className={cn('text-[10px] py-0 px-1.5', dlRiskConfig.text, dlRiskConfig.border)}
                        >
                          Risk: {dlRisk.score}
                        </Badge>
                      )}
                      {isComplete && (
                        <span className="text-xs text-green-600 flex items-center gap-0.5">
                          <CheckCircle2 className="h-3 w-3" />
                          Completed
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Complete button */}
                  {!isComplete && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs flex-shrink-0"
                      onClick={() => handleComplete(deadline.id)}
                      disabled={completeDeadline.isPending}
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Complete
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
