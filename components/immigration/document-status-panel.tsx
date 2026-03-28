'use client'

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Document Status Panel (Read-Only)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Replaces the old editable DocumentChecklistPanel. Derives its data entirely
 * from document_slots  -  no manual checklist editing, no inline status changes.
 *
 * Displays a completion progress bar and a grouped table of document statuses.
 */

import { useMemo } from 'react'
import { useDocumentSlots } from '@/lib/queries/document-slots'
import type { DocumentSlot } from '@/lib/queries/document-slots'
import { cn } from '@/lib/utils'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Info,
  RotateCcw,
  XCircle,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

type SlotStatus = 'empty' | 'pending_review' | 'accepted' | 'needs_re_upload' | 'rejected'

interface DocumentStatusPanelProps {
  matterId: string
  tenantId?: string
}

// ─── Status Config (mirrors document-slot-panel.tsx) ─────────────────────────

const STATUS_CONFIG: Record<SlotStatus, {
  label: string
  variant: 'default' | 'secondary' | 'outline' | 'destructive'
  icon: typeof Check
  className: string
}> = {
  empty: {
    label: 'Empty',
    variant: 'outline',
    icon: AlertCircle,
    className: 'border-amber-500/30 text-amber-400 bg-amber-950/30',
  },
  pending_review: {
    label: 'Pending Review',
    variant: 'outline',
    icon: Clock,
    className: 'border-blue-500/30 text-blue-400 bg-blue-950/30',
  },
  accepted: {
    label: 'Accepted',
    variant: 'outline',
    icon: CheckCircle2,
    className: 'border-emerald-500/30 text-emerald-400 bg-emerald-950/30',
  },
  needs_re_upload: {
    label: 'Needs Re-upload',
    variant: 'default',
    icon: RotateCcw,
    className: 'bg-orange-500 text-white border-orange-500',
  },
  rejected: {
    label: 'Rejected',
    variant: 'destructive',
    icon: XCircle,
    className: 'bg-red-500 text-white border-red-500',
  },
}

function StatusBadge({ status }: { status: SlotStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.empty
  const Icon = config.icon
  return (
    <Badge variant={config.variant} className={config.className}>
      <Icon className="mr-1 h-3 w-3" />
      {config.label}
    </Badge>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCategory(category: string): string {
  return category
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatPersonRole(role: string | null): string {
  if (!role) return ''
  return role
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function DocumentStatusPanel({ matterId }: DocumentStatusPanelProps) {
  const { data: slots, isLoading } = useDocumentSlots(matterId)

  // Group slots by category
  const grouped = useMemo(() => {
    if (!slots || slots.length === 0) return new Map<string, typeof slots>()
    const map = new Map<string, typeof slots>()
    for (const slot of slots) {
      const cat = slot.category || 'uncategorized'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(slot)
    }
    return map
  }, [slots])

  // Compute progress stats
  const stats = useMemo(() => {
    if (!slots || slots.length === 0) {
      return { total: 0, required: 0, accepted: 0, progressPct: 0 }
    }
    const required = slots.filter((s) => s.is_required)
    const accepted = required.filter((s) => s.status === 'accepted')
    const progressPct = required.length > 0
      ? Math.round((accepted.length / required.length) * 100)
      : 100
    return {
      total: slots.length,
      required: required.length,
      accepted: accepted.length,
      progressPct,
    }
  }, [slots])

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (!slots || slots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <FileText className="h-8 w-8 text-slate-300" />
        <p className="mt-2 text-sm text-slate-500">No document slots configured</p>
        <p className="text-xs text-slate-400">
          Document slots are created when a matter type is assigned.
        </p>
      </div>
    )
  }

  const progressColor =
    stats.progressPct >= 80
      ? '[&_[data-slot=progress-indicator]]:bg-emerald-950/300'
      : stats.progressPct >= 50
        ? '[&_[data-slot=progress-indicator]]:bg-amber-950/300'
        : '[&_[data-slot=progress-indicator]]:bg-red-500'

  return (
    <div className="space-y-4">
      {/* Progress header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700">
            {stats.accepted} / {stats.required} required documents accepted
          </span>
          <span className={cn(
            'font-bold tabular-nums text-xs',
            stats.progressPct >= 80 ? 'text-green-600' :
              stats.progressPct >= 50 ? 'text-amber-600' : 'text-red-600',
          )}>
            {stats.progressPct}%
          </span>
        </div>
        <Progress value={stats.progressPct} className={cn('h-2', progressColor)} />
      </div>

      {/* Grouped document table */}
      {Array.from(grouped.entries()).map(([category, categorySlots]) => {
        if (!categorySlots || categorySlots.length === 0) return null
        return (
        <div key={category} className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 px-1">
            {formatCategory(category)}
          </h4>
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50/60">
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Document</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 hidden sm:table-cell">Person</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 w-16">Required</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {categorySlots.map((slot) => (
                  <tr key={slot.id} className="hover:bg-slate-50/50">
                    <td className="px-3 py-2">
                      <span className="font-medium text-slate-800 text-xs">{slot.slot_name}</span>
                      {slot.description && (
                        <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{slot.description}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500 hidden sm:table-cell">
                      {formatPersonRole(slot.person_role)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {slot.is_required ? (
                        <span className="text-xs font-medium text-red-600">Yes</span>
                      ) : (
                        <span className="text-xs text-slate-400">No</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <StatusBadge status={slot.status as SlotStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        )
      })}

      {/* Footer hint */}
      <div className="flex items-center gap-1.5 px-1 text-[11px] text-slate-400">
        <Info className="h-3 w-3 shrink-0" />
        <span>Manage documents in the Documents tab. This view is read-only.</span>
      </div>
    </div>
  )
}
