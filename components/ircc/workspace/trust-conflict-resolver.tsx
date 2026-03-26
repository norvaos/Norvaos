'use client'

/**
 * TrustConflictResolver  -  Resolves trust-level conflicts between
 * client-submitted and canonical (verified) answer values.
 *
 * Shows each conflict as a side-by-side card, allowing staff to
 * choose which value to keep on a per-field or bulk basis.
 */

import { useState, useCallback } from 'react'
import {
  Shield,
  ShieldCheck,
  AlertTriangle,
  Check,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

// ── Props ─────────────────────────────────────────────────────────────────────

export interface TrustConflict {
  profilePath: string
  label: string
  clientValue: unknown
  canonicalValue: unknown
  clientSource: string
  canonicalSource: string
}

export interface TrustConflictResolverProps {
  instanceId: string
  conflicts: TrustConflict[]
  onResolve: (profilePath: string, chosenValue: unknown, source: string) => void
  onResolveAll: (choice: 'client' | 'canonical') => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a value for display */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(empty)'
  if (value === '') return '(empty)'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** Format a source label for display */
function formatSource(source: string): string {
  return source
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Format a profile_path for display */
function formatProfilePath(path: string): string {
  const lastSegment = path.split('.').pop() ?? path
  return lastSegment
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// ── Conflict Card ─────────────────────────────────────────────────────────────

interface ConflictCardProps {
  conflict: TrustConflict
  isResolved: boolean
  resolvedChoice: 'client' | 'canonical' | null
  onChooseClient: () => void
  onChooseCanonical: () => void
}

function ConflictCard({
  conflict,
  isResolved,
  resolvedChoice,
  onChooseClient,
  onChooseCanonical,
}: ConflictCardProps) {
  return (
    <Card
      className={cn(
        'overflow-hidden gap-0 py-0 transition-all',
        isResolved && 'opacity-70',
      )}
    >
      {/* Card header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <span className="text-xs font-semibold truncate">
            {conflict.label || formatProfilePath(conflict.profilePath)}
          </span>
        </div>

        {isResolved && (
          <Badge
            variant="outline"
            className="text-[10px] py-0 px-1.5 border-green-300 text-green-700 bg-green-50 shrink-0"
          >
            <Check className="h-2.5 w-2.5 mr-0.5" />
            Resolved
          </Badge>
        )}
      </div>

      {/* Profile path */}
      <div className="px-3 pt-1.5">
        <p className="text-[10px] text-muted-foreground font-mono truncate">
          {conflict.profilePath}
        </p>
      </div>

      {/* Side-by-side comparison */}
      <div className="grid grid-cols-2 gap-2 p-3">
        {/* Client value */}
        <div
          className={cn(
            'rounded-lg border-2 p-2.5 transition-colors',
            resolvedChoice === 'client'
              ? 'border-blue-500 bg-blue-50/50'
              : 'border-blue-200 bg-blue-50/20',
          )}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <Shield className="h-3 w-3 text-blue-500" />
            <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide">
              Client Value
            </span>
          </div>
          <p className="text-xs font-medium break-words">
            {formatValue(conflict.clientValue)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Source: {formatSource(conflict.clientSource)}
          </p>
          {!isResolved && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[10px] px-2 mt-2 w-full border-blue-300 text-blue-700 hover:bg-blue-100"
              onClick={onChooseClient}
            >
              <Check className="h-3 w-3 mr-1" />
              Use Client Value
            </Button>
          )}
        </div>

        {/* Canonical value */}
        <div
          className={cn(
            'rounded-lg border-2 p-2.5 transition-colors',
            resolvedChoice === 'canonical'
              ? 'border-green-500 bg-green-50/50'
              : 'border-green-200 bg-green-50/20',
          )}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <ShieldCheck className="h-3 w-3 text-green-500" />
            <span className="text-[10px] font-semibold text-green-700 uppercase tracking-wide">
              Canonical Value
            </span>
          </div>
          <p className="text-xs font-medium break-words">
            {formatValue(conflict.canonicalValue)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Source: {formatSource(conflict.canonicalSource)}
          </p>
          {!isResolved && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[10px] px-2 mt-2 w-full border-green-300 text-green-700 hover:bg-green-100"
              onClick={onChooseCanonical}
            >
              <Check className="h-3 w-3 mr-1" />
              Use Canonical Value
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function TrustConflictResolver({
  instanceId,
  conflicts,
  onResolve,
  onResolveAll,
}: TrustConflictResolverProps) {
  // Track which conflicts have been resolved and which choice was made
  const [resolved, setResolved] = useState<
    Record<string, 'client' | 'canonical'>
  >({})

  const unresolvedCount = conflicts.length - Object.keys(resolved).length

  const handleChooseClient = useCallback(
    (conflict: TrustConflict) => {
      setResolved((prev) => ({ ...prev, [conflict.profilePath]: 'client' }))
      onResolve(conflict.profilePath, conflict.clientValue, conflict.clientSource)
    },
    [onResolve],
  )

  const handleChooseCanonical = useCallback(
    (conflict: TrustConflict) => {
      setResolved((prev) => ({ ...prev, [conflict.profilePath]: 'canonical' }))
      onResolve(conflict.profilePath, conflict.canonicalValue, conflict.canonicalSource)
    },
    [onResolve],
  )

  const handleAcceptAllClient = useCallback(() => {
    const newResolved: Record<string, 'client' | 'canonical'> = {}
    for (const conflict of conflicts) {
      newResolved[conflict.profilePath] = 'client'
    }
    setResolved(newResolved)
    onResolveAll('client')
  }, [conflicts, onResolveAll])

  const handleAcceptAllCanonical = useCallback(() => {
    const newResolved: Record<string, 'client' | 'canonical'> = {}
    for (const conflict of conflicts) {
      newResolved[conflict.profilePath] = 'canonical'
    }
    setResolved(newResolved)
    onResolveAll('canonical')
  }, [conflicts, onResolveAll])

  if (conflicts.length === 0) return null

  return (
    <div className="space-y-3">
      {/* Header alert */}
      <Alert className="border-amber-200 bg-amber-50/50">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <AlertDescription className="text-xs">
          <span className="font-semibold">{conflicts.length} trust conflict{conflicts.length !== 1 ? 's' : ''}</span>
          {' '}detected  -  client-submitted values differ from verified canonical values.
          {unresolvedCount > 0 && (
            <span className="text-amber-700 font-medium">
              {' '}{unresolvedCount} unresolved.
            </span>
          )}
        </AlertDescription>
      </Alert>

      {/* Bulk action buttons */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[10px] px-2.5 border-blue-300 text-blue-700 hover:bg-blue-50"
          onClick={handleAcceptAllClient}
          disabled={unresolvedCount === 0}
        >
          <Shield className="h-3 w-3 mr-1" />
          Accept All Client
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[10px] px-2.5 border-green-300 text-green-700 hover:bg-green-50"
          onClick={handleAcceptAllCanonical}
          disabled={unresolvedCount === 0}
        >
          <ShieldCheck className="h-3 w-3 mr-1" />
          Accept All Canonical
        </Button>

        {unresolvedCount === 0 && (
          <Badge
            variant="outline"
            className="text-[10px] py-0 px-1.5 border-green-300 text-green-700 bg-green-50 ml-auto"
          >
            All conflicts resolved
          </Badge>
        )}
      </div>

      <Separator />

      {/* Conflict cards */}
      <ScrollArea className="max-h-[500px]">
        <div className="space-y-2">
          {conflicts.map((conflict) => (
            <ConflictCard
              key={conflict.profilePath}
              conflict={conflict}
              isResolved={conflict.profilePath in resolved}
              resolvedChoice={resolved[conflict.profilePath] ?? null}
              onChooseClient={() => handleChooseClient(conflict)}
              onChooseCanonical={() => handleChooseCanonical(conflict)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
