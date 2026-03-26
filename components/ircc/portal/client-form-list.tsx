'use client'

/**
 * ClientFormList  -  Lists all form instances assigned to a client for a matter.
 *
 * Fetches form instances via useMatterFormInstances and displays each as a
 * clickable card with form name, status badge, and completion progress.
 * Used in the portal to let clients pick which form to fill out.
 */

import {
  CheckCircle2,
  FileText,
  Clock,
  AlertCircle,
  Loader2,
  ChevronRight,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { useMatterFormInstances } from '@/lib/queries/form-instances'
import { useCompletionState } from '@/lib/queries/answer-engine'
import type { MatterFormInstance } from '@/lib/types/form-instances'
import type { FormInstanceStatus } from '@/lib/types/form-instances'

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ClientFormListProps {
  matterId: string
  tenantId: string
  onSelectForm: (instanceId: string, formId: string) => void
}

// ── Status Config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  FormInstanceStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }
> = {
  pending: {
    label: 'Not Started',
    variant: 'outline',
    className: 'border-zinc-300 text-zinc-600 bg-zinc-50',
  },
  in_progress: {
    label: 'In Progress',
    variant: 'outline',
    className: 'border-blue-300 text-blue-700 bg-blue-50',
  },
  ready_for_review: {
    label: 'Submitted',
    variant: 'outline',
    className: 'border-amber-300 text-amber-700 bg-amber-50',
  },
  approved: {
    label: 'Approved',
    variant: 'outline',
    className: 'border-green-300 text-green-700 bg-green-50',
  },
  rejected: {
    label: 'Needs Revision',
    variant: 'outline',
    className: 'border-red-300 text-red-700 bg-red-50',
  },
  generated: {
    label: 'Generated',
    variant: 'outline',
    className: 'border-green-300 text-green-700 bg-green-50',
  },
  submitted: {
    label: 'Submitted',
    variant: 'outline',
    className: 'border-green-300 text-green-700 bg-green-50',
  },
}

// ── Form Instance Card ──────────────────────────────────────────────────────

function FormInstanceCard({
  instance,
  onSelect,
}: {
  instance: MatterFormInstance
  onSelect: () => void
}) {
  const { data: completionState } = useCompletionState(instance.id)

  const completionPct = completionState?.completion_pct ?? 0
  const isCompleted = instance.status === 'approved' || instance.status === 'ready_for_review'
  const statusConfig = STATUS_CONFIG[instance.status] ?? STATUS_CONFIG.pending

  const statusIcon = (() => {
    switch (instance.status) {
      case 'approved':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />
      case 'ready_for_review':
        return <Clock className="h-5 w-5 text-amber-600" />
      case 'rejected':
        return <AlertCircle className="h-5 w-5 text-red-500" />
      case 'in_progress':
        return <FileText className="h-5 w-5 text-blue-600" />
      default:
        return <FileText className="h-5 w-5 text-zinc-400" />
    }
  })()

  return (
    <Card
      className={cn(
        'group cursor-pointer transition-all hover:shadow-md hover:border-primary/30',
        isCompleted && 'bg-muted/20',
      )}
      onClick={onSelect}
    >
      <div className="p-4 flex items-center gap-4">
        {/* Status Icon */}
        <div className="shrink-0">
          {statusIcon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-foreground truncate">
              {instance.form_name}
            </h3>
            <Badge
              variant={statusConfig.variant}
              className={cn('text-[10px] py-0 px-1.5 leading-4 shrink-0', statusConfig.className)}
            >
              {statusConfig.label}
            </Badge>
          </div>

          {/* Progress bar for in-progress or pending forms */}
          {instance.status !== 'approved' && (
            <div className="flex items-center gap-2">
              <Progress
                value={completionPct}
                className={cn(
                  'h-1.5 flex-1',
                  completionPct >= 100
                    ? '[&>[data-slot=progress-indicator]]:bg-green-500'
                    : completionPct >= 60
                      ? '[&>[data-slot=progress-indicator]]:bg-amber-500'
                      : '[&>[data-slot=progress-indicator]]:bg-blue-500'
                )}
              />
              <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                {completionPct}%
              </span>
            </div>
          )}
        </div>

        {/* Chevron */}
        <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0" />
      </div>
    </Card>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ClientFormList({
  matterId,
  onSelectForm,
}: ClientFormListProps) {
  const { data: instances, isLoading, error } = useMatterFormInstances(matterId)

  // ── Loading ─────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Loading forms...</p>
      </div>
    )
  }

  // ── Error ───────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <AlertCircle className="h-6 w-6 text-red-400" />
        <p className="text-sm">Unable to load forms. Please try again later.</p>
      </div>
    )
  }

  // ── Empty ───────────────────────────────────────────────────────────────

  if (!instances || instances.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <FileText className="h-8 w-8 text-muted-foreground/40" />
        <div className="text-center space-y-1">
          <p className="text-sm font-medium">No forms assigned</p>
          <p className="text-xs text-muted-foreground/70">
            Your lawyer has not assigned any forms yet. Check back later.
          </p>
        </div>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          Your Forms
        </h2>
        <span className="text-xs text-muted-foreground">
          {instances.length} form{instances.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-2">
        {instances.map((instance) => (
          <FormInstanceCard
            key={instance.id}
            instance={instance}
            onSelect={() => onSelectForm(instance.id, instance.form_id)}
          />
        ))}
      </div>
    </div>
  )
}
