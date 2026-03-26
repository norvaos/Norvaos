'use client'

import { type DocumentsZoneProps, type DocumentSlotSummary } from './types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Progress } from '@/components/ui/progress'
import {
  FileText,
  Upload,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FolderOpen,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Skeleton ───────────────────────────────────────────────────────────────

function DocumentsZoneSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading documents">
      {/* Stats bar skeleton — 6 blocks */}
      <div className="flex flex-wrap gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1 min-w-[48px]">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-5 w-8" />
            <Skeleton className="h-3 w-10" />
          </div>
        ))}
      </div>

      {/* Progress bar skeleton */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-2.5 flex-1 rounded-full" />
        <Skeleton className="h-3.5 w-10" />
      </div>

      {/* Pending cards skeleton — 4 cards */}
      <div className="flex gap-2 overflow-hidden pb-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[100px] w-[160px] shrink-0 rounded-lg" />
        ))}
      </div>

      {/* Mandatory split skeleton */}
      <Skeleton className="h-3.5 w-44" />
    </div>
  )
}

// ─── Empty State ────────────────────────────────────────────────────────────

function DocumentsZoneEmpty() {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-muted-foreground gap-2">
      <FolderOpen className="h-8 w-8 opacity-40" />
      <p className="text-sm font-medium">No document slots</p>
      <p className="text-xs opacity-60">
        Document slots will appear once a checklist is configured.
      </p>
    </div>
  )
}

// ─── Stat Column ────────────────────────────────────────────────────────────

function StatColumn({
  icon,
  value,
  label,
  colour,
}: {
  icon: React.ReactNode
  value: number
  label: string
  colour?: string
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-[48px]">
      <span className={cn('shrink-0', colour ?? 'text-muted-foreground')} aria-hidden="true">
        {icon}
      </span>
      <span
        className={cn(
          'text-sm font-semibold tabular-nums leading-tight',
          colour ?? 'text-muted-foreground'
        )}
      >
        {value}
      </span>
      <span className="text-[10px] text-muted-foreground leading-tight text-center">
        {label}
      </span>
    </div>
  )
}

// ─── Pending Slot Card ──────────────────────────────────────────────────────

function PendingSlotCard({
  slot,
  onUpload,
}: {
  slot: DocumentSlotSummary
  onUpload?: (slotId: string) => void
}) {
  return (
    <div className="flex flex-col justify-between w-[160px] shrink-0 rounded-lg border border-border bg-card p-2.5 gap-2">
      <div className="space-y-1">
        <p className="text-xs font-medium leading-snug line-clamp-2">
          {slot.slotName}
          {slot.isRequired && (
            <span className="text-red-500 ml-0.5" aria-label="required">
              *
            </span>
          )}
        </p>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
          {slot.category}
        </Badge>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-7 w-full text-xs gap-1"
        aria-label={`Upload ${slot.slotName}`}
        onClick={(e) => {
          e.stopPropagation()
          onUpload?.(slot.id)
        }}
      >
        <Upload className="h-3 w-3" />
        Upload
      </Button>
    </div>
  )
}

// ─── Completion Bar ─────────────────────────────────────────────────────────

function CompletionBar({ pct }: { pct: number }) {
  const colour =
    pct >= 80
      ? '[&>div]:bg-green-500 dark:[&>div]:bg-green-400'
      : pct >= 50
        ? '[&>div]:bg-amber-500 dark:[&>div]:bg-amber-400'
        : '[&>div]:bg-red-500 dark:[&>div]:bg-red-400'

  return (
    <div className="flex items-center gap-2">
      <Progress
        value={pct}
        className={cn('h-2.5 flex-1', colour)}
        aria-label={`Document completion: ${pct}%`}
      />
      <span
        className={cn(
          'text-xs font-semibold tabular-nums shrink-0',
          pct >= 80
            ? 'text-green-600 dark:text-green-400'
            : pct >= 50
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-red-600 dark:text-red-400'
        )}
      >
        {pct}%
      </span>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function DocumentsZone({
  data,
  isLoading,
  onDrillDown,
  onUpload,
}: DocumentsZoneProps) {
  if (isLoading) return <DocumentsZoneSkeleton />
  if (!data) return <DocumentsZoneEmpty />

  const {
    totalSlots,
    mandatorySlots,
    accepted,
    pendingReview,
    needsReUpload,
    rejected,
    empty,
    completionPct,
    pendingSlots,
  } = data

  const mandatoryCollected = pendingSlots
    ? totalSlots - empty - pendingSlots.filter((s) => s.isRequired && s.status !== 'accepted').length
    : accepted

  // Count mandatory accepted specifically
  const mandatoryAccepted = mandatorySlots - (
    pendingSlots?.filter((s) => s.isRequired).length ?? 0
  )

  return (
    <div
      role="region"
      aria-label="Documents overview"
      className="space-y-3 transition-all duration-300"
      onClick={onDrillDown}
      onKeyDown={(e) => {
        if (onDrillDown && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onDrillDown()
        }
      }}
      tabIndex={onDrillDown ? 0 : undefined}
      style={{ cursor: onDrillDown ? 'pointer' : undefined }}
    >
      {/* ── 1. Document Stats Bar ──────────────────────────────────────────── */}
      <TooltipProvider delayDuration={200}>
        <div className="flex flex-wrap gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <StatColumn
                  icon={<FileText className="h-3.5 w-3.5" />}
                  value={totalSlots}
                  label="Total"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Total document slots
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <StatColumn
                  icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                  value={accepted}
                  label="Accepted"
                  colour="text-green-600 dark:text-green-400"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Documents accepted
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <StatColumn
                  icon={<Clock className="h-3.5 w-3.5" />}
                  value={pendingReview}
                  label="Pending"
                  colour="text-amber-600 dark:text-amber-400"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Awaiting review
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <StatColumn
                  icon={<AlertTriangle className="h-3.5 w-3.5" />}
                  value={needsReUpload}
                  label="Re-upload"
                  colour="text-red-600 dark:text-red-400"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Needs re-upload
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <StatColumn
                  icon={<XCircle className="h-3.5 w-3.5" />}
                  value={rejected}
                  label="Rejected"
                  colour="text-red-600 dark:text-red-400"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Rejected documents
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <StatColumn
                  icon={<FolderOpen className="h-3.5 w-3.5" />}
                  value={empty}
                  label="Empty"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              No document uploaded
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

      {/* ── 2. Completion Bar ──────────────────────────────────────────────── */}
      <CompletionBar pct={completionPct} />

      {/* ── 3. Pending Documents Scroll ────────────────────────────────────── */}
      {pendingSlots.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {pendingSlots.map((slot) => (
            <PendingSlotCard key={slot.id} slot={slot} onUpload={onUpload} />
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 py-2">
          <CheckCircle2 className="h-4 w-4 text-green-500 dark:text-green-400 shrink-0" />
          <span className="text-xs font-medium text-green-600 dark:text-green-400">
            All documents received
          </span>
        </div>
      )}

      {/* ── 4. Mandatory vs Optional Split ─────────────────────────────────── */}
      <p className="text-[11px] text-muted-foreground">
        <span className="tabular-nums font-medium text-foreground">
          {mandatoryAccepted}
        </span>
        {' '}of{' '}
        <span className="tabular-nums font-medium text-foreground">
          {mandatorySlots}
        </span>
        {' '}mandatory collected
      </p>
    </div>
  )
}
