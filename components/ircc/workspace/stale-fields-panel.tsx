'use client'

/**
 * StaleFieldsPanel — Lists all stale fields for a form instance
 *
 * Shows each stale field with its profile path, current value, and the
 * reason it was marked stale. Provides per-field "Re-confirm" and bulk
 * "Re-confirm All" actions that call useClearStaleFlags.
 */

import { useMemo } from 'react'
import {
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import {
  useInstanceAnswers,
  useClearStaleFlags,
} from '@/lib/queries/answer-engine'
import type { AnswerRecord } from '@/lib/ircc/types/answers'

// ── Props ─────────────────────────────────────────────────────────────────────

interface StaleFieldsPanelProps {
  instanceId: string
  onResolve?: (profilePath: string) => void
  onResolveAll?: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a profile_path for display (e.g. "personal.family_name" -> "Family Name") */
function formatProfilePath(path: string): string {
  const lastSegment = path.split('.').pop() ?? path
  return lastSegment
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Format an answer value for display */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(empty)'
  if (value === '') return '(empty)'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// ── Stale Field Row ──────────────────────────────────────────────────────────

function StaleFieldRow({
  profilePath,
  record,
  onReconfirm,
  isClearing,
}: {
  profilePath: string
  record: AnswerRecord
  onReconfirm: () => void
  isClearing: boolean
}) {
  return (
    <div className="flex items-start gap-2 py-2.5 px-3 border-b last:border-b-0 hover:bg-muted/30 transition-colors">
      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />

      <div className="flex-1 min-w-0">
        {/* Field path */}
        <p className="text-xs font-medium truncate" title={profilePath}>
          {formatProfilePath(profilePath)}
        </p>

        {/* Profile path */}
        <p className="text-[10px] text-muted-foreground font-mono truncate" title={profilePath}>
          {profilePath}
        </p>

        {/* Current value */}
        <div className="mt-1 flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Current:</span>
          <span className="text-[10px] font-medium truncate max-w-[200px]" title={formatValue(record.value)}>
            {formatValue(record.value)}
          </span>
        </div>

        {/* Stale reason */}
        {record.stale_reason && (
          <p className="text-[10px] text-amber-600 mt-0.5 leading-snug">
            {record.stale_reason}
          </p>
        )}
      </div>

      {/* Re-confirm button */}
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-[10px] px-2 shrink-0"
        onClick={onReconfirm}
        disabled={isClearing}
      >
        <RefreshCw className={cn('h-3 w-3 mr-1', isClearing && 'animate-spin')} />
        Re-confirm
      </Button>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function StaleFieldsPanel({
  instanceId,
  onResolve,
  onResolveAll,
}: StaleFieldsPanelProps) {
  const { data: answers, isLoading } = useInstanceAnswers(instanceId)
  const clearStale = useClearStaleFlags()

  // Extract stale fields from answers
  const staleFields = useMemo(() => {
    if (!answers) return []

    const fields: Array<{ profilePath: string; record: AnswerRecord }> = []
    for (const [path, record] of Object.entries(answers)) {
      if (record.stale) {
        fields.push({ profilePath: path, record })
      }
    }

    // Sort alphabetically by profile path for consistency
    return fields.sort((a, b) => a.profilePath.localeCompare(b.profilePath))
  }, [answers])

  const handleReconfirm = (profilePath: string) => {
    clearStale.mutate(
      { instanceId, profilePaths: [profilePath] },
      {
        onSuccess: () => {
          onResolve?.(profilePath)
        },
      }
    )
  }

  const handleReconfirmAll = () => {
    const allPaths = staleFields.map((f) => f.profilePath)
    if (allPaths.length === 0) return

    clearStale.mutate(
      { instanceId, profilePaths: allPaths },
      {
        onSuccess: () => {
          onResolveAll?.()
        },
      }
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <Card className="p-3 gap-0">
        <div className="animate-pulse space-y-2">
          <div className="h-3 bg-muted rounded w-32" />
          <div className="h-8 bg-muted rounded" />
          <div className="h-8 bg-muted rounded" />
        </div>
      </Card>
    )
  }

  // Empty state
  if (staleFields.length === 0) {
    return (
      <Card className="gap-0 py-0">
        <div className="px-3 py-4 text-center">
          <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
          <p className="text-xs font-medium text-muted-foreground">
            No stale fields
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            All field values are up to date
          </p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden gap-0 py-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-amber-50/50">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span className="text-xs font-semibold">Stale Fields</span>
          <Badge
            variant="outline"
            className="text-[10px] py-0 px-1.5 border-amber-300 text-amber-600 bg-amber-50"
          >
            {staleFields.length}
          </Badge>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[10px] px-2 border-amber-300 text-amber-700 hover:bg-amber-50"
          onClick={handleReconfirmAll}
          disabled={clearStale.isPending}
        >
          <RefreshCw
            className={cn(
              'h-3 w-3 mr-1',
              clearStale.isPending && 'animate-spin'
            )}
          />
          Re-confirm All
        </Button>
      </div>

      {/* Field list */}
      <ScrollArea className="max-h-[400px]">
        {staleFields.map(({ profilePath, record }) => (
          <StaleFieldRow
            key={profilePath}
            profilePath={profilePath}
            record={record}
            onReconfirm={() => handleReconfirm(profilePath)}
            isClearing={clearStale.isPending}
          />
        ))}
      </ScrollArea>
    </Card>
  )
}
