'use client'

/**
 * GenerationBlockerPanel  -  Shows all blockers preventing form pack generation
 *
 * Fetches generation readiness via useGenerationReadiness and displays blockers
 * grouped by type: missing required, validation errors, stale fields, trust
 * conflicts, and composite rule failures. Includes a "Generate Draft" button
 * that is disabled until all blockers are resolved.
 */

import { useMemo } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileWarning,
  RefreshCw,
  ChevronRight,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import {
  useGenerationReadiness,
  validationKeys,
} from '@/lib/queries/validation-engine'
import type { ValidationIssue } from '@/lib/ircc/validation-rules-engine'

// ── Props ─────────────────────────────────────────────────────────────────────

interface GenerationBlockerPanelProps {
  instanceId: string
  formId: string
  matterId: string
  onFieldClick?: (profilePath: string) => void
}

// ── Blocker Groups ────────────────────────────────────────────────────────────

interface BlockerGroup {
  key: string
  label: string
  issues: ValidationIssue[]
}

function groupBlockers(blockers: ValidationIssue[]): BlockerGroup[] {
  const missingRequired: ValidationIssue[] = []
  const validationErrors: ValidationIssue[] = []
  const staleFields: ValidationIssue[] = []
  const trustConflicts: ValidationIssue[] = []
  const compositeFailures: ValidationIssue[] = []

  for (const issue of blockers) {
    switch (issue.code) {
      case 'missing_required':
      case 'required_condition_unmet':
        missingRequired.push(issue)
        break
      case 'stale_answer':
        staleFields.push(issue)
        break
      case 'unresolved_conflict':
        trustConflicts.push(issue)
        break
      case 'composite_rule_failed':
        compositeFailures.push(issue)
        break
      default:
        // min_length, max_length, pattern_mismatch, invalid_enum
        validationErrors.push(issue)
        break
    }
  }

  const groups: BlockerGroup[] = []
  if (missingRequired.length > 0)
    groups.push({ key: 'missing', label: 'Missing Required Fields', issues: missingRequired })
  if (validationErrors.length > 0)
    groups.push({ key: 'errors', label: 'Validation Errors', issues: validationErrors })
  if (staleFields.length > 0)
    groups.push({ key: 'stale', label: 'Stale Fields', issues: staleFields })
  if (trustConflicts.length > 0)
    groups.push({ key: 'conflicts', label: 'Trust Conflicts', issues: trustConflicts })
  if (compositeFailures.length > 0)
    groups.push({ key: 'composite', label: 'Composite Rule Failures', issues: compositeFailures })

  return groups
}

// ── Blocker Row ───────────────────────────────────────────────────────────────

function BlockerRow({
  issue,
  onClick,
}: {
  issue: ValidationIssue
  onClick?: () => void
}) {
  return (
    <button
      className={cn(
        'flex items-start gap-2 w-full py-1.5 px-2 rounded-md text-left transition-colors',
        onClick ? 'hover:bg-muted/60 cursor-pointer' : 'cursor-default'
      )}
      onClick={onClick}
      disabled={!onClick}
    >
      <XCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">
          {issue.label}
        </p>
        <p className="text-[11px] text-muted-foreground line-clamp-2">
          {issue.message}
        </p>
        {issue.rule_key && (
          <Badge
            variant="outline"
            className="mt-0.5 text-[10px] py-0 px-1.5 border-slate-300 text-slate-500"
          >
            {issue.rule_key}
          </Badge>
        )}
      </div>
      {onClick && (
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      )}
    </button>
  )
}

// ── Group Icon ────────────────────────────────────────────────────────────────

function groupIcon(key: string) {
  switch (key) {
    case 'missing':
      return <FileWarning className="h-4 w-4 text-red-500" />
    case 'errors':
      return <XCircle className="h-4 w-4 text-red-500" />
    case 'stale':
      return <AlertTriangle className="h-4 w-4 text-amber-500" />
    case 'conflicts':
      return <AlertTriangle className="h-4 w-4 text-orange-500" />
    case 'composite':
      return <FileWarning className="h-4 w-4 text-purple-500" />
    default:
      return <XCircle className="h-4 w-4 text-red-500" />
  }
}

// ── Main Component ───────────────────────────────────────────────────────────

export function GenerationBlockerPanel({
  instanceId,
  formId,
  matterId,
  onFieldClick,
}: GenerationBlockerPanelProps) {
  const queryClient = useQueryClient()

  const {
    data: readiness,
    isLoading,
    isFetching,
  } = useGenerationReadiness(instanceId)

  const blockerGroups = useMemo(() => {
    if (!readiness) return []
    return groupBlockers(readiness.blockers)
  }, [readiness])

  const totalBlockers = readiness?.blockers.length ?? 0
  const canGenerate = readiness?.ready ?? false
  const fieldsValid =
    readiness?.validation.summary
      ? (readiness.validation.issues.length -
          readiness.validation.summary.total_issues +
          readiness.validation.issues.length) -
        readiness.validation.summary.total_issues
      : 0
  // Derive valid / total from validation summary
  const totalFields =
    readiness?.validation.summary
      ? readiness.validation.issues.length + (readiness.validation.is_valid ? 0 : 0)
      : 0

  const handleRefresh = () => {
    queryClient.invalidateQueries({
      queryKey: validationKeys.generationReadiness(instanceId),
    })
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="animate-pulse space-y-3">
            <div className="h-5 bg-muted rounded w-40" />
            <div className="h-2 bg-muted rounded-full w-full" />
            <div className="h-4 bg-muted rounded w-32" />
            <div className="h-4 bg-muted rounded w-48" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!readiness) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">
            Unable to check generation readiness.
          </p>
        </CardContent>
      </Card>
    )
  }

  // Compute progress bar values
  const validationSummary = readiness.validation.summary
  const totalIssueCount = validationSummary.total_issues
  const blockingCount = validationSummary.blocking

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            {canGenerate ? (
              <CheckCircle2 className="h-4.5 w-4.5 text-green-600" />
            ) : (
              <AlertTriangle className="h-4.5 w-4.5 text-red-500" />
            )}
            Generation Readiness
          </CardTitle>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleRefresh}
            disabled={isFetching}
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')}
            />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {/* Overall Status Badge */}
        {canGenerate ? (
          <Alert className="border-emerald-500/20 bg-emerald-950/30">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-emerald-400 text-xs font-medium">
              Ready to Generate  -  all requirements met.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="border-red-500/20 bg-red-950/30">
            <XCircle className="h-4 w-4 text-red-500" />
            <AlertDescription className="text-red-400 text-xs font-medium">
              {totalBlockers} {totalBlockers === 1 ? 'Blocker' : 'Blockers'} preventing generation.
            </AlertDescription>
          </Alert>
        )}

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              Validation Progress
            </span>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {totalIssueCount === 0 ? 'All clear' : `${blockingCount} blocking / ${totalIssueCount} total issues`}
            </span>
          </div>
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                canGenerate
                  ? 'bg-emerald-950/300'
                  : blockingCount > 0
                    ? 'bg-red-950/300'
                    : 'bg-amber-950/300'
              )}
              style={{
                width: canGenerate
                  ? '100%'
                  : totalIssueCount > 0
                    ? `${Math.max(5, Math.round(((totalIssueCount - blockingCount) / Math.max(totalIssueCount, 1)) * 100))}%`
                    : '100%',
              }}
            />
          </div>

          {/* Summary counts */}
          <div className="flex items-center gap-3 flex-wrap">
            {validationSummary.missing_required > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] py-0 px-1.5 border-red-500/30 text-red-600 bg-red-950/30"
              >
                {validationSummary.missing_required} missing
              </Badge>
            )}
            {validationSummary.stale > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] py-0 px-1.5 border-amber-500/30 text-amber-600 bg-amber-950/30"
              >
                {validationSummary.stale} stale
              </Badge>
            )}
            {validationSummary.pattern_errors > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] py-0 px-1.5 border-orange-500/30 text-orange-600 bg-orange-950/30"
              >
                {validationSummary.pattern_errors} format errors
              </Badge>
            )}
            {validationSummary.composite_failures > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] py-0 px-1.5 border-purple-500/30 text-purple-600 bg-purple-950/30"
              >
                {validationSummary.composite_failures} rule failures
              </Badge>
            )}
            {readiness.unresolved_conflicts.length > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] py-0 px-1.5 border-orange-500/30 text-orange-600 bg-orange-950/30"
              >
                {readiness.unresolved_conflicts.length} conflicts
              </Badge>
            )}
          </div>
        </div>

        {/* Blocker Groups */}
        {blockerGroups.length > 0 && (
          <ScrollArea className="max-h-[400px]">
            <Accordion type="multiple" defaultValue={blockerGroups.map((g) => g.key)}>
              {blockerGroups.map((group) => (
                <AccordionItem key={group.key} value={group.key}>
                  <AccordionTrigger className="py-2 px-1 text-xs hover:no-underline">
                    <div className="flex items-center gap-2">
                      {groupIcon(group.key)}
                      <span className="font-medium">{group.label}</span>
                      <Badge
                        variant="secondary"
                        className="text-[10px] py-0 px-1.5 ml-1"
                      >
                        {group.issues.length}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-2">
                    <div className="space-y-0.5">
                      {group.issues.map((issue, idx) => (
                        <BlockerRow
                          key={`${issue.profile_path}-${issue.code}-${idx}`}
                          issue={issue}
                          onClick={
                            onFieldClick && issue.profile_path
                              ? () => onFieldClick(issue.profile_path)
                              : undefined
                          }
                        />
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </ScrollArea>
        )}

        {/* Generate Draft Button */}
        <Button
          className="w-full"
          disabled={!canGenerate}
          size="sm"
        >
          {canGenerate ? 'Generate Draft' : 'Resolve Blockers to Generate'}
        </Button>
      </CardContent>
    </Card>
  )
}
