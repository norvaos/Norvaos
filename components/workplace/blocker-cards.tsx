'use client'

/**
 * BlockerCards  -  Shows blocking items preventing matter progress.
 *
 * Cards for: missing required documents, unresolved canonical profile conflicts,
 * incomplete questionnaire sections, pending verifications, overdue tasks.
 */

import {
  FileX2,
  AlertTriangle,
  ClipboardList,
  ShieldAlert,
  Clock,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ImmigrationReadinessData } from '@/lib/queries/immigration-readiness'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BlockerCardsProps {
  readinessData?: ImmigrationReadinessData | null
  overdueTasks?: Array<{ id: string; title: string; due_date: string | null }>
  conflictCount?: number
  onNavigateToSection?: (section: string) => void
}

interface BlockerItem {
  key: string
  icon: React.ElementType
  label: string
  count: number
  severity: 'critical' | 'warning' | 'info'
  description: string
  onClick?: () => void
}

// ── Component ──────────────────────────────────────────────────────────────────

export function BlockerCards({
  readinessData,
  overdueTasks = [],
  conflictCount = 0,
  onNavigateToSection,
}: BlockerCardsProps) {
  const blockers: BlockerItem[] = []

  // Missing required documents
  const missingDocs = readinessData?.documents
    ? readinessData.documents.totalSlots - readinessData.documents.accepted - (readinessData.documents.pendingReview ?? 0)
    : 0
  if (missingDocs > 0) {
    blockers.push({
      key: 'missing-docs',
      icon: FileX2,
      label: 'Missing Documents',
      count: missingDocs,
      severity: 'critical',
      description: `${missingDocs} required document${missingDocs !== 1 ? 's' : ''} not yet uploaded or accepted.`,
      onClick: () => onNavigateToSection?.('documents'),
    })
  }

  // Unresolved canonical profile conflicts
  if (conflictCount > 0) {
    blockers.push({
      key: 'conflicts',
      icon: AlertTriangle,
      label: 'Profile Conflicts',
      count: conflictCount,
      severity: 'critical',
      description: `${conflictCount} conflicting value${conflictCount !== 1 ? 's' : ''} require resolution.`,
      onClick: () => onNavigateToSection?.('people'),
    })
  }

  // Incomplete questionnaire sections
  const questionnairePct = readinessData?.questionnaire?.completionPct ?? 100
  if (questionnairePct < 100) {
    const missingFields = readinessData?.readinessMatrix?.allBlockers
      ?.filter((b) => b.type === 'question').length ?? 0
    if (missingFields > 0) {
      blockers.push({
        key: 'questionnaire',
        icon: ClipboardList,
        label: 'Incomplete Questionnaire',
        count: missingFields,
        severity: 'warning',
        description: `${missingFields} required field${missingFields !== 1 ? 's' : ''} incomplete.`,
        onClick: () => onNavigateToSection?.('questionnaire'),
      })
    }
  }

  // Pending verifications (documents pending review)
  const pendingReview = readinessData?.documents?.pendingReview ?? 0
  if (pendingReview > 0) {
    blockers.push({
      key: 'pending-review',
      icon: ShieldAlert,
      label: 'Pending Verification',
      count: pendingReview,
      severity: 'warning',
      description: `${pendingReview} document${pendingReview !== 1 ? 's' : ''} awaiting lawyer review.`,
      onClick: () => onNavigateToSection?.('documents'),
    })
  }

  // Overdue tasks
  if (overdueTasks.length > 0) {
    blockers.push({
      key: 'overdue-tasks',
      icon: Clock,
      label: 'Overdue Tasks',
      count: overdueTasks.length,
      severity: 'warning',
      description: `${overdueTasks.length} task${overdueTasks.length !== 1 ? 's' : ''} past due date.`,
      onClick: () => onNavigateToSection?.('tasks'),
    })
  }

  if (blockers.length === 0) return null

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Blockers
      </h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {blockers.map((blocker) => {
          const Icon = blocker.icon
          return (
            <Card
              key={blocker.key}
              className={cn(
                'cursor-pointer transition-colors hover:bg-accent/50',
                blocker.severity === 'critical'
                  ? 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20'
                  : 'border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20'
              )}
              onClick={blocker.onClick}
            >
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'mt-0.5 shrink-0',
                      blocker.severity === 'critical'
                        ? 'text-red-500'
                        : 'text-amber-500'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{blocker.label}</span>
                      <Badge
                        variant={blocker.severity === 'critical' ? 'destructive' : 'outline'}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {blocker.count}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {blocker.description}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
