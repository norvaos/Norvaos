'use client'

import { useState } from 'react'
import { useCanonicalConflicts, useResolveConflict } from '@/lib/queries/canonical-profiles'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils/formatters'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  X,
  Wrench,
} from 'lucide-react'

import type { CanonicalProfileConflictRow } from '@/lib/types/database'
import type { ConflictResolution } from '@/lib/services/canonical-profile'

// ── Props ───────────────────────────────────────────────────────────────────

interface ConflictResolutionPanelProps {
  profileId: string
  userId: string
}

// ── Component ───────────────────────────────────────────────────────────────

export function ConflictResolutionPanel({ profileId, userId }: ConflictResolutionPanelProps) {
  const { data: conflicts, isLoading } = useCanonicalConflicts(profileId)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (!conflicts || conflicts.length === 0) {
    return (
      <div className="rounded-md border border-emerald-500/30 bg-emerald-950/30 p-4 text-sm text-emerald-400 flex items-center gap-2">
        <Check className="h-4 w-4 shrink-0" />
        No pending conflicts. All profile data is consistent.
      </div>
    )
  }

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectAll = () => {
    if (selectedIds.size === conflicts.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(conflicts.map((c) => c.id)))
    }
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <h3 className="font-semibold text-sm">
            {conflicts.length} Pending Conflict{conflicts.length !== 1 ? 's' : ''}
          </h3>
        </div>
        {conflicts.length > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={selectAll}
            >
              {selectedIds.size === conflicts.length ? 'Deselect All' : 'Select All'}
            </Button>
            {selectedIds.size > 0 && (
              <BatchActions
                selectedIds={selectedIds}
                profileId={profileId}
                userId={userId}
                onComplete={() => setSelectedIds(new Set())}
              />
            )}
          </div>
        )}
      </div>

      {/* Conflict Cards */}
      <div className="space-y-2">
        {conflicts.map((conflict) => (
          <ConflictCard
            key={conflict.id}
            conflict={conflict}
            profileId={profileId}
            userId={userId}
            isSelected={selectedIds.has(conflict.id)}
            onToggleSelect={() => toggleSelection(conflict.id)}
            showCheckbox={conflicts.length > 1}
          />
        ))}
      </div>
    </div>
  )
}

// ── Conflict Card ───────────────────────────────────────────────────────────

interface ConflictCardProps {
  conflict: CanonicalProfileConflictRow
  profileId: string
  userId: string
  isSelected: boolean
  onToggleSelect: () => void
  showCheckbox: boolean
}

function ConflictCard({
  conflict,
  profileId,
  userId,
  isSelected,
  onToggleSelect,
  showCheckbox,
}: ConflictCardProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const resolveConflict = useResolveConflict()

  const handleResolve = (resolution: ConflictResolution) => {
    resolveConflict.mutate({
      conflictId: conflict.id,
      resolution,
      resolvedBy: userId,
      profileId,
    })
  }

  return (
    <div
      className={cn(
        'rounded-lg border bg-card transition-colors',
        isSelected && 'ring-2 ring-primary/20 border-primary/30',
      )}
    >
      {/* Card Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        {showCheckbox && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="h-4 w-4 rounded border-gray-300"
          />
        )}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 flex-1 text-left"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="font-medium text-sm">{formatFieldKey(conflict.field_key)}</span>
          <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400 bg-amber-950/30">
            Conflict
          </Badge>
        </button>
        <span className="text-xs text-muted-foreground">
          {formatDate(conflict.created_at)}
        </span>
      </div>

      {/* Expanded Comparison */}
      {isExpanded && (
        <div className="border-t px-4 py-3 space-y-3">
          {/* Side-by-side comparison */}
          <div className="grid grid-cols-2 gap-4">
            {/* Existing Value */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-blue-950/300" />
                <span className="text-xs font-medium text-muted-foreground">Current Value</span>
              </div>
              <div className="rounded-md border bg-blue-950/30/50 p-3">
                <p className="text-sm font-mono break-all">
                  {formatDisplayValue(conflict.existing_value)}
                </p>
              </div>
            </div>

            {/* New Value */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-amber-950/300" />
                <span className="text-xs font-medium text-muted-foreground">
                  New Value
                  <span className="ml-1 text-muted-foreground/70">
                    (from {formatSource(conflict.new_source)})
                  </span>
                </span>
              </div>
              <div className="rounded-md border bg-amber-950/30/50 p-3">
                <p className="text-sm font-mono break-all">
                  {formatDisplayValue(conflict.new_value)}
                </p>
              </div>
            </div>
          </div>

          {/* Resolution Actions */}
          <Separator />
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => handleResolve('keep_existing')}
              disabled={resolveConflict.isPending}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Keep Existing
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => handleResolve('manual')}
              disabled={resolveConflict.isPending}
            >
              <Wrench className="h-3.5 w-3.5 mr-1" />
              Manual
            </Button>
            <Button
              size="sm"
              className="text-xs"
              onClick={() => handleResolve('accept_new')}
              disabled={resolveConflict.isPending}
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              Accept New
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Batch Actions ───────────────────────────────────────────────────────────

interface BatchActionsProps {
  selectedIds: Set<string>
  profileId: string
  userId: string
  onComplete: () => void
}

function BatchActions({ selectedIds, profileId, userId, onComplete }: BatchActionsProps) {
  const resolveConflict = useResolveConflict()

  const handleBatchResolve = async (resolution: ConflictResolution) => {
    for (const conflictId of selectedIds) {
      resolveConflict.mutate({
        conflictId,
        resolution,
        resolvedBy: userId,
        profileId,
      })
    }
    onComplete()
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground mr-1">
        {selectedIds.size} selected:
      </span>
      <Button
        variant="outline"
        size="sm"
        className="text-xs h-7"
        onClick={() => handleBatchResolve('keep_existing')}
      >
        Keep All
      </Button>
      <Button
        size="sm"
        className="text-xs h-7"
        onClick={() => handleBatchResolve('accept_new')}
      >
        Accept All New
      </Button>
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatFieldKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatDisplayValue(value: unknown): string {
  if (value === null || value === undefined) return '(empty)'
  if (typeof value === 'string') return value || '(empty)'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value, null, 2)
}

function formatSource(source: string): string {
  const labels: Record<string, string> = {
    extraction: 'document extraction',
    client_portal: 'client portal',
    staff: 'staff entry',
    import: 'data import',
  }
  return labels[source] ?? source
}
