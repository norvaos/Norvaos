'use client'

/**
 * ReuseSummaryPanel  -  Shows reuse summary and review gates for cross-form
 * and cross-matter data import.
 *
 * Features:
 * 1. "Pre-fill from Other Forms" button  -  triggers cross-form prefill
 * 2. "Import from Client Profile" button  -  triggers canonical import
 * 3. Shows last prefill timestamp and source
 * 4. Lists fields that were imported with their source
 * 5. Highlights semi_stable fields needing review (amber)
 * 6. Shows conflict count if any trust conflicts occurred
 */

import { useState, useCallback } from 'react'
import {
  ArrowRightLeft,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Loader2,
  FileText,
  Shield,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { CrossFormReuseResult } from '@/lib/ircc/cross-form-reuse'
import type { CrossMatterImportResult } from '@/lib/ircc/cross-matter-reuse'

// ── Props ─────────────────────────────────────────────────────────────────────

interface ReuseSummaryPanelProps {
  instanceId: string
  matterId: string
  contactId: string
  tenantId: string
  onPrefillFromSiblings: () => Promise<CrossFormReuseResult>
  onImportFromCanonical: () => Promise<CrossMatterImportResult>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a profile_path for display (e.g. "personal.family_name" -> "Family Name") */
function formatProfilePath(path: string): string {
  const lastSegment = path.split('.').pop() ?? path
  return lastSegment
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Format a value for display */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(empty)'
  if (value === '') return '(empty)'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** Format a timestamp for display */
function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-CA', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

// ── Category badge colours ────────────────────────────────────────────────────

function CategoryBadge({ category }: { category: string }) {
  switch (category) {
    case 'stable':
      return (
        <Badge
          variant="outline"
          className="text-[10px] py-0 px-1.5 border-emerald-500/30 text-emerald-400 bg-emerald-950/30"
        >
          Stable
        </Badge>
      )
    case 'semi_stable':
      return (
        <Badge
          variant="outline"
          className="text-[10px] py-0 px-1.5 border-amber-500/30 text-amber-400 bg-amber-950/30"
        >
          Needs Review
        </Badge>
      )
    case 'matter_specific':
      return (
        <Badge
          variant="outline"
          className="text-[10px] py-0 px-1.5 border-slate-300 text-slate-600 bg-slate-50"
        >
          Matter-Specific
        </Badge>
      )
    default:
      return null
  }
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ReuseSummaryPanel({
  instanceId,
  matterId,
  contactId,
  tenantId,
  onPrefillFromSiblings,
  onImportFromCanonical,
}: ReuseSummaryPanelProps) {
  // Cross-form state
  const [crossFormResult, setCrossFormResult] = useState<CrossFormReuseResult | null>(null)
  const [crossFormLoading, setCrossFormLoading] = useState(false)
  const [crossFormError, setCrossFormError] = useState<string | null>(null)
  const [crossFormTimestamp, setCrossFormTimestamp] = useState<string | null>(null)

  // Cross-matter state
  const [crossMatterResult, setCrossMatterResult] = useState<CrossMatterImportResult | null>(null)
  const [crossMatterLoading, setCrossMatterLoading] = useState(false)
  const [crossMatterError, setCrossMatterError] = useState<string | null>(null)
  const [crossMatterTimestamp, setCrossMatterTimestamp] = useState<string | null>(null)

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handlePrefillFromSiblings = useCallback(async () => {
    setCrossFormLoading(true)
    setCrossFormError(null)
    try {
      const result = await onPrefillFromSiblings()
      setCrossFormResult(result)
      setCrossFormTimestamp(new Date().toISOString())
    } catch (err) {
      setCrossFormError(
        err instanceof Error ? err.message : 'Failed to pre-fill from sibling forms',
      )
    } finally {
      setCrossFormLoading(false)
    }
  }, [onPrefillFromSiblings])

  const handleImportFromCanonical = useCallback(async () => {
    setCrossMatterLoading(true)
    setCrossMatterError(null)
    try {
      const result = await onImportFromCanonical()
      setCrossMatterResult(result)
      setCrossMatterTimestamp(new Date().toISOString())
    } catch (err) {
      setCrossMatterError(
        err instanceof Error ? err.message : 'Failed to import from client profile',
      )
    } finally {
      setCrossMatterLoading(false)
    }
  }, [onImportFromCanonical])

  // ── Derived counts ────────────────────────────────────────────────────────

  const totalConflicts = crossFormResult?.conflicts.length ?? 0
  const reviewCount = crossMatterResult?.fieldsNeedingReview.filter(
    (f) => f.category === 'semi_stable',
  ).length ?? 0

  return (
    <Card className="overflow-hidden gap-0 py-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
        <Copy className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-semibold">Data Reuse</span>
        {totalConflicts > 0 && (
          <Badge
            variant="outline"
            className="text-[10px] py-0 px-1.5 border-red-500/30 text-red-600 bg-red-950/30"
          >
            {totalConflicts} conflict{totalConflicts !== 1 ? 's' : ''}
          </Badge>
        )}
        {reviewCount > 0 && (
          <Badge
            variant="outline"
            className="text-[10px] py-0 px-1.5 border-amber-500/30 text-amber-600 bg-amber-950/30"
          >
            {reviewCount} to review
          </Badge>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 px-3 py-2.5 border-b">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs flex-1"
          onClick={handlePrefillFromSiblings}
          disabled={crossFormLoading}
        >
          {crossFormLoading ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5" />
          )}
          Pre-fill from Other Forms
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs flex-1"
          onClick={handleImportFromCanonical}
          disabled={crossMatterLoading}
        >
          {crossMatterLoading ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <UserCheck className="h-3.5 w-3.5 mr-1.5" />
          )}
          Import from Client Profile
        </Button>
      </div>

      {/* Error alerts */}
      {crossFormError && (
        <div className="px-3 pt-2">
          <Alert variant="destructive" className="py-2">
            <AlertDescription className="text-xs">{crossFormError}</AlertDescription>
          </Alert>
        </div>
      )}
      {crossMatterError && (
        <div className="px-3 pt-2">
          <Alert variant="destructive" className="py-2">
            <AlertDescription className="text-xs">{crossMatterError}</AlertDescription>
          </Alert>
        </div>
      )}

      {/* Cross-form results */}
      {crossFormResult && (
        <div className="border-b">
          <div className="flex items-center justify-between px-3 py-2 bg-blue-950/50">
            <div className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-blue-600" />
              <span className="text-[11px] font-medium text-blue-400">Cross-Form Prefill</span>
            </div>
            {crossFormTimestamp && (
              <span className="text-[10px] text-muted-foreground">
                {formatTimestamp(crossFormTimestamp)}
              </span>
            )}
          </div>

          {/* Summary counts */}
          <div className="flex gap-3 px-3 py-2 text-[10px]">
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              <span className="text-muted-foreground">
                {crossFormResult.fieldsReused} reused
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">
                {crossFormResult.fieldsSkipped} skipped
              </span>
            </div>
            {crossFormResult.conflicts.length > 0 && (
              <div className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-red-500" />
                <span className="text-red-600">
                  {crossFormResult.conflicts.length} conflict{crossFormResult.conflicts.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>

          {/* Conflict details */}
          {crossFormResult.conflicts.length > 0 && (
            <ScrollArea className="max-h-[120px]">
              {crossFormResult.conflicts.map((conflict) => (
                <div
                  key={conflict.profilePath}
                  className="flex items-start gap-2 py-1.5 px-3 border-t hover:bg-muted/30"
                >
                  <Shield className="h-3 w-3 text-red-500 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium truncate">
                      {formatProfilePath(conflict.profilePath)}
                    </p>
                    <p className="text-[10px] text-red-600 leading-snug">
                      {conflict.reason}
                    </p>
                  </div>
                </div>
              ))}
            </ScrollArea>
          )}

          {/* Reused field details */}
          {crossFormResult.details.length > 0 && (
            <ScrollArea className="max-h-[180px]">
              {crossFormResult.details.map((detail) => (
                <div
                  key={detail.profilePath}
                  className="flex items-start gap-2 py-1.5 px-3 border-t hover:bg-muted/30"
                >
                  <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-medium truncate">
                      {formatProfilePath(detail.profilePath)}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">
                      {formatValue(detail.value)}
                    </p>
                  </div>
                </div>
              ))}
            </ScrollArea>
          )}

          {/* Empty state for cross-form */}
          {crossFormResult.fieldsReused === 0 && crossFormResult.conflicts.length === 0 && (
            <div className="px-3 py-3 text-center border-t">
              <p className="text-[10px] text-muted-foreground">
                No matching fields found in sibling forms
              </p>
            </div>
          )}
        </div>
      )}

      {/* Cross-matter results */}
      {crossMatterResult && (
        <div>
          <div className="flex items-center justify-between px-3 py-2 bg-purple-950/50 border-b">
            <div className="flex items-center gap-1.5">
              <UserCheck className="h-3.5 w-3.5 text-purple-600" />
              <span className="text-[11px] font-medium text-purple-400">
                Client Profile Import
              </span>
            </div>
            {crossMatterTimestamp && (
              <span className="text-[10px] text-muted-foreground">
                {formatTimestamp(crossMatterTimestamp)}
              </span>
            )}
          </div>

          {/* Summary counts */}
          <div className="flex gap-3 px-3 py-2 text-[10px] border-b">
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              <span className="text-muted-foreground">
                {crossMatterResult.fieldsImported} imported
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">
                {crossMatterResult.fieldsSkipped} skipped
              </span>
            </div>
            {reviewCount > 0 && (
              <div className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-amber-500" />
                <span className="text-amber-600">
                  {reviewCount} need{reviewCount !== 1 ? '' : 's'} review
                </span>
              </div>
            )}
          </div>

          {/* Fields needing review */}
          {crossMatterResult.fieldsNeedingReview.length > 0 && (
            <ScrollArea className="max-h-[240px]">
              {crossMatterResult.fieldsNeedingReview.map((field) => (
                <div
                  key={field.profilePath}
                  className={`flex items-start gap-2 py-2 px-3 border-b last:border-b-0 hover:bg-muted/30 ${
                    field.category === 'semi_stable' ? 'bg-amber-950/30' : ''
                  }`}
                >
                  {field.category === 'semi_stable' ? (
                    <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                  ) : (
                    <Shield className="h-3 w-3 text-slate-400 shrink-0 mt-0.5" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[10px] font-medium truncate">
                        {formatProfilePath(field.profilePath)}
                      </p>
                      <CategoryBadge category={field.category} />
                    </div>
                    <p className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
                      {formatValue(field.canonicalValue)}
                    </p>
                    {field.category === 'semi_stable' && (
                      <p className="text-[10px] text-amber-600 mt-0.5">
                        Imported  -  please confirm this value is still current
                      </p>
                    )}
                    {field.category === 'matter_specific' && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Skipped  -  enter manually for this matter
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </ScrollArea>
          )}

          {/* Empty state for cross-matter */}
          {crossMatterResult.fieldsImported === 0 &&
            crossMatterResult.fieldsNeedingReview.length === 0 && (
              <div className="px-3 py-3 text-center">
                <p className="text-[10px] text-muted-foreground">
                  No canonical profile data found for this contact
                </p>
              </div>
            )}
        </div>
      )}

      {/* Initial empty state (no results yet) */}
      {!crossFormResult && !crossMatterResult && !crossFormError && !crossMatterError && (
        <div className="px-3 py-4 text-center">
          <Copy className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">
            Use the buttons above to import data from other forms or the client profile
          </p>
        </div>
      )}
    </Card>
  )
}
