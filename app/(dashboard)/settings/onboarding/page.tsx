'use client'

import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface ChecklistItem {
  key: string
  label: string
  description: string
  type: 'auto' | 'manual'
  completed: boolean
  completed_at: string | null
  completed_by: string | null
  link: string
}

interface ChecklistResponse {
  checklist: ChecklistItem[]
  summary: {
    total: number
    completed: number
    percent: number
  }
}

export default function OnboardingChecklistPage() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const { data, isLoading, isError, refetch, isFetching } = useQuery<ChecklistResponse>({
    queryKey: ['onboarding', 'checklist'],
    queryFn: async () => {
      const res = await fetch('/api/onboarding/checklist')
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? 'Failed to load checklist')
      }
      return res.json()
    },
    staleTime: 30_000,
  })

  const completeItem = useMutation({
    mutationFn: async (itemKey: string) => {
      const res = await fetch(`/api/onboarding/checklist/${itemKey}/complete`, {
        method: 'POST',
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed to mark complete')
      return body
    },
    onSuccess: () => {
      toast.success('Checklist item marked as complete.')
      queryClient.invalidateQueries({ queryKey: ['onboarding', 'checklist'] })
    },
    onError: (err) => {
      toast.error('Could not mark item as complete.', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    },
  })

  const checklist = data?.checklist ?? []
  const summary = data?.summary

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Setup Checklist</h2>
          <p className="mt-1 text-sm text-slate-500">
            Track the essential steps to get your workspace fully set up.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          <span className="sr-only">Refresh</span>
        </Button>
      </div>

      {/* Progress summary */}
      {!isLoading && summary && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-slate-700">Overall progress</span>
            <Badge
              variant={summary.completed === summary.total ? 'default' : 'secondary'}
              className={cn(summary.completed === summary.total && 'bg-emerald-600 text-white')}
            >
              {summary.completed} of {summary.total} complete
            </Badge>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-2 rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${summary.percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Checklist items */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">Failed to load checklist.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            Try Again
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {checklist.map((item) => (
            <div key={item.key} className="flex items-start gap-4 px-4 py-4">
              {/* Status icon */}
              <div className="mt-0.5 shrink-0">
                {item.completed ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : (
                  <Circle className="h-5 w-5 text-slate-300" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'text-sm font-medium',
                      item.completed ? 'text-slate-900' : 'text-slate-700',
                    )}
                  >
                    {item.label}
                  </span>
                  {item.completed && (
                    <Badge
                      variant="outline"
                      className="text-xs text-emerald-700 border-emerald-200 bg-emerald-50"
                    >
                      Done
                    </Badge>
                  )}
                  {item.type === 'manual' && !item.completed && (
                    <Badge variant="outline" className="text-xs">
                      Manual
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{item.description}</p>
                {item.completed && item.completed_at && item.type === 'manual' && (
                  <p className="mt-1 text-xs text-slate-400">
                    Marked complete{' '}
                    {new Date(item.completed_at).toLocaleDateString('en-CA', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                )}
              </div>

              {/* Actions */}
              {!item.completed && (
                <div className="shrink-0 flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => router.push(item.link)}
                  >
                    Go
                    <ExternalLink className="ml-1.5 h-3 w-3" />
                  </Button>

                  {item.type === 'manual' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-8"
                      disabled={
                        completeItem.isPending && completeItem.variables === item.key
                      }
                      onClick={() => completeItem.mutate(item.key)}
                    >
                      {completeItem.isPending && completeItem.variables === item.key ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        'Mark complete'
                      )}
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {summary?.percent === 100 && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
          <p className="text-sm font-medium text-emerald-800">
            All items complete — your workspace is ready.
          </p>
        </div>
      )}
    </div>
  )
}
