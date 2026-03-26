'use client'

/**
 * StaffReviewPanel  -  Internal staff review and override layer
 *
 * Module I of the IRCC Forms Engine. Provides staff with a comprehensive
 * review interface for client-submitted answers, including:
 *
 * - Full questionnaire via QuestionnaireRenderer in staff mode
 * - Review toolbar with instance status, approve/reject actions
 * - Side-by-side comparison: client value vs. staff override
 * - Trust conflict resolution (client_portal vs. verified canonical)
 * - Bulk verify/mark-as-reviewed actions
 * - Answer source provenance indicators per field
 */

import { useState, useMemo, useCallback } from 'react'
import {
  Shield,
  ShieldCheck,
  AlertTriangle,
  Check,
  X,
  CheckCircle2,
  ClipboardCheck,
  Send,
  Eye,
  Loader2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  useInstanceAnswers,
  useSaveAnswers,
  useVerifyAnswer,
} from '@/lib/queries/answer-engine'
import {
  useMatterFormInstances,
  useUpdateFormInstanceStatus,
} from '@/lib/queries/form-instances'
import { SOURCE_TRUST_LEVEL } from '@/lib/ircc/types/answers'
import type { AnswerMap, AnswerRecord, AnswerSource } from '@/lib/ircc/types/answers'
import type { MatterFormInstance } from '@/lib/types/form-instances'
import { QuestionnaireRenderer } from './questionnaire-renderer'
import { StaleFieldsPanel } from './stale-fields-panel'
import {
  TrustConflictResolver,
  type TrustConflict,
} from './trust-conflict-resolver'

// ── Props ─────────────────────────────────────────────────────────────────────

export interface StaffReviewPanelProps {
  instanceId: string
  formId: string
  matterId: string
  tenantId: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a profile_path for display */
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

/** Format an answer source for display */
function formatSource(source: AnswerSource | string): string {
  return source
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Map FormInstanceStatus to display badge styling */
function statusBadgeStyle(status: string): string {
  switch (status) {
    case 'pending':
      return 'border-zinc-300 text-zinc-600 bg-zinc-50'
    case 'in_progress':
      return 'border-blue-300 text-blue-700 bg-blue-50'
    case 'ready_for_review':
      return 'border-amber-300 text-amber-700 bg-amber-50'
    case 'approved':
      return 'border-green-300 text-green-700 bg-green-50'
    case 'rejected':
      return 'border-red-300 text-red-700 bg-red-50'
    case 'generated':
      return 'border-purple-300 text-purple-700 bg-purple-50'
    case 'submitted':
      return 'border-emerald-300 text-emerald-700 bg-emerald-50'
    default:
      return 'border-zinc-300 text-zinc-600 bg-zinc-50'
  }
}

/** Format status for display */
function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Source indicator badge styling */
function sourceBadgeStyle(source: AnswerSource): string {
  const trust = SOURCE_TRUST_LEVEL[source] ?? 0
  if (trust >= 6) return 'border-green-300 text-green-700 bg-green-50'
  if (trust >= 5) return 'border-blue-300 text-blue-700 bg-blue-50'
  if (trust >= 3) return 'border-purple-300 text-purple-700 bg-purple-50'
  return 'border-zinc-300 text-zinc-600 bg-zinc-50'
}

// ── Review Tabs ───────────────────────────────────────────────────────────────

type ReviewTab = 'questionnaire' | 'comparison' | 'stale'

// ── Answer Source Indicator ───────────────────────────────────────────────────

function SourceIndicator({ record }: { record: AnswerRecord }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Source badge */}
      <Badge
        variant="outline"
        className={cn('text-[9px] py-0 px-1 leading-3', sourceBadgeStyle(record.source))}
      >
        {formatSource(record.source)}
      </Badge>

      {/* Trust level */}
      <span className="text-[9px] text-muted-foreground">
        L{SOURCE_TRUST_LEVEL[record.source] ?? '?'}
      </span>

      {/* Verification status */}
      {record.verified && (
        <Badge
          variant="outline"
          className="text-[9px] py-0 px-1 leading-3 border-green-300 text-green-700 bg-green-50"
        >
          <ShieldCheck className="h-2 w-2 mr-0.5" />
          Verified
        </Badge>
      )}

      {/* Source origin */}
      {record.source_origin && (
        <span className="text-[9px] text-muted-foreground font-mono truncate max-w-[120px]" title={record.source_origin}>
          {record.source_origin}
        </span>
      )}
    </div>
  )
}

// ── Side-by-Side Comparison Row ───────────────────────────────────────────────

interface ComparisonRowProps {
  profilePath: string
  record: AnswerRecord
  staffOverride: unknown
  onStaffOverrideChange: (profilePath: string, value: string) => void
  onAccept: (profilePath: string) => void
  onOverride: (profilePath: string, value: unknown) => void
  isAccepting: boolean
  isOverriding: boolean
}

function ComparisonRow({
  profilePath,
  record,
  staffOverride,
  onStaffOverrideChange,
  onAccept,
  onOverride,
  isAccepting,
  isOverriding,
}: ComparisonRowProps) {
  return (
    <div className="border-b last:border-b-0 py-2.5 px-3 hover:bg-muted/20 transition-colors">
      {/* Field label + source indicator */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold truncate">
            {formatProfilePath(profilePath)}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono truncate" title={profilePath}>
            {profilePath}
          </span>
        </div>
        <SourceIndicator record={record} />
      </div>

      {/* Side-by-side: client value vs staff override */}
      <div className="grid grid-cols-2 gap-2">
        {/* Left: Client value (read-only) */}
        <div className="rounded border border-blue-200 bg-blue-50/20 p-2">
          <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide mb-1">
            Client Value
          </p>
          <p className="text-xs font-medium break-words">
            {formatValue(record.value)}
          </p>
        </div>

        {/* Right: Staff override (editable) */}
        <div className="rounded border border-zinc-200 bg-background p-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            Staff Override
          </p>
          <input
            type="text"
            value={staffOverride != null ? String(staffOverride) : ''}
            onChange={(e) => onStaffOverrideChange(profilePath, e.target.value)}
            placeholder="Enter override value..."
            className="w-full text-xs px-2 py-1 rounded border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-2">
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[10px] px-2 border-green-300 text-green-700 hover:bg-green-50"
          onClick={() => onAccept(profilePath)}
          disabled={isAccepting || record.verified}
        >
          {isAccepting ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <Check className="h-3 w-3 mr-1" />
          )}
          {record.verified ? 'Accepted' : 'Accept'}
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[10px] px-2 border-amber-300 text-amber-700 hover:bg-amber-50"
          onClick={() => onOverride(profilePath, staffOverride)}
          disabled={isOverriding || !staffOverride}
        >
          {isOverriding ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <Shield className="h-3 w-3 mr-1" />
          )}
          Override
        </Button>

        {record.verified && (
          <Badge
            variant="outline"
            className="text-[9px] py-0 px-1 border-green-300 text-green-700 bg-green-50 ml-auto"
          >
            <CheckCircle2 className="h-2 w-2 mr-0.5" />
            Verified
          </Badge>
        )}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function StaffReviewPanel({
  instanceId,
  formId,
  matterId,
  tenantId,
}: StaffReviewPanelProps) {
  // ── Data ──────────────────────────────────────────────────────────────────

  const { data: answers, isLoading: answersLoading } = useInstanceAnswers(instanceId)
  const { data: instances } = useMatterFormInstances(matterId)
  const saveAnswersMutation = useSaveAnswers()
  const verifyAnswerMutation = useVerifyAnswer()
  const updateStatusMutation = useUpdateFormInstanceStatus()

  // ── Local State ───────────────────────────────────────────────────────────

  const [activeTab, setActiveTab] = useState<ReviewTab>('questionnaire')
  const [staffOverrides, setStaffOverrides] = useState<Record<string, unknown>>({})
  const [rejectNotes, setRejectNotes] = useState('')
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)

  // ── Derived Data ──────────────────────────────────────────────────────────

  const answerMap = answers ?? ({} as AnswerMap)

  // Find current instance from the instances list
  const currentInstance = useMemo(() => {
    if (!instances) return null
    return instances.find((inst: MatterFormInstance) => inst.id === instanceId) ?? null
  }, [instances, instanceId])

  // Count stale fields
  const staleCount = useMemo(() => {
    let count = 0
    for (const record of Object.values(answerMap)) {
      if (record.stale) count++
    }
    return count
  }, [answerMap])

  // Count unverified fields
  const unverifiedCount = useMemo(() => {
    let count = 0
    for (const record of Object.values(answerMap)) {
      if (!record.verified) count++
    }
    return count
  }, [answerMap])

  // Count total fields
  const totalFields = Object.keys(answerMap).length

  // Count verified fields
  const verifiedCount = totalFields - unverifiedCount

  // Detect trust conflicts: fields where client_portal answer differs from
  // a verified canonical_prefill answer in the same map
  const trustConflicts = useMemo(() => {
    const conflicts: TrustConflict[] = []

    // Group answers by profilePath  -  look for paths that have both a
    // client_portal source and have been verified from a canonical source.
    // In practice, conflicts are detected when a client_portal value differs
    // from a canonical_prefill value that was previously verified.
    for (const [path, record] of Object.entries(answerMap)) {
      // Skip if no value
      if (record.value == null || record.value === '') continue

      // A conflict exists when:
      // - The answer source is client_portal
      // - The answer was previously verified (meaning staff/canonical had a different value)
      // - The verified status is false (verification was cleared due to client change)
      // We detect this by looking for client_portal answers that are unverified
      // and have stale_reason indicating a conflict
      if (
        record.source === 'client_portal' &&
        !record.verified &&
        record.stale &&
        record.stale_reason?.toLowerCase().includes('conflict')
      ) {
        conflicts.push({
          profilePath: path,
          label: formatProfilePath(path),
          clientValue: record.value,
          canonicalValue: null, // Would be populated from canonical data
          clientSource: record.source,
          canonicalSource: 'canonical_prefill',
        })
      }
    }

    return conflicts
  }, [answerMap])

  // Fields with no trust conflicts (for bulk verify)
  const uncontestedFields = useMemo(() => {
    const conflictPaths = new Set(trustConflicts.map((c) => c.profilePath))
    const fields: Array<{ profilePath: string; record: AnswerRecord }> = []

    for (const [path, record] of Object.entries(answerMap)) {
      if (!conflictPaths.has(path) && !record.verified && record.value != null && record.value !== '') {
        fields.push({ profilePath: path, record })
      }
    }

    return fields
  }, [answerMap, trustConflicts])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleStaffOverrideChange = useCallback((profilePath: string, value: string) => {
    setStaffOverrides((prev) => ({ ...prev, [profilePath]: value }))
  }, [])

  /** Accept a client value  -  verify the answer as-is */
  const handleAcceptField = useCallback(
    (profilePath: string) => {
      setActionInProgress(profilePath)
      verifyAnswerMutation.mutate(
        {
          instanceId,
          profilePath,
          verifiedBy: tenantId,
        },
        {
          onSettled: () => setActionInProgress(null),
        },
      )
    },
    [instanceId, tenantId, verifyAnswerMutation],
  )

  /** Override a field with the staff value */
  const handleOverrideField = useCallback(
    (profilePath: string, value: unknown) => {
      if (value == null || value === '') {
        toast.error('Enter a value before overriding.')
        return
      }
      setActionInProgress(profilePath)
      saveAnswersMutation.mutate(
        {
          instanceId,
          updates: { [profilePath]: value },
          source: 'staff_entry' as AnswerSource,
        },
        {
          onSuccess: () => {
            // Also verify the newly saved value
            verifyAnswerMutation.mutate({
              instanceId,
              profilePath,
              verifiedBy: tenantId,
            })
            // Clear the staff override
            setStaffOverrides((prev) => {
              const next = { ...prev }
              delete next[profilePath]
              return next
            })
          },
          onSettled: () => setActionInProgress(null),
        },
      )
    },
    [instanceId, tenantId, saveAnswersMutation, verifyAnswerMutation],
  )

  /** Approve all answers  -  verify every unverified field */
  const handleApproveAll = useCallback(async () => {
    setActionInProgress('approve-all')
    const unverifiedPaths = Object.entries(answerMap)
      .filter(([, record]) => !record.verified && record.value != null && record.value !== '')
      .map(([path]) => path)

    let completed = 0
    for (const path of unverifiedPaths) {
      try {
        await new Promise<void>((resolve, reject) => {
          verifyAnswerMutation.mutate(
            { instanceId, profilePath: path, verifiedBy: tenantId },
            { onSuccess: () => resolve(), onError: reject },
          )
        })
        completed++
      } catch {
        // Continue with remaining fields
      }
    }

    toast.success(`Verified ${completed} of ${unverifiedPaths.length} fields.`)
    setActionInProgress(null)
  }, [answerMap, instanceId, tenantId, verifyAnswerMutation])

  /** Verify all uncontested fields (no trust conflicts) */
  const handleVerifyAllUncontested = useCallback(async () => {
    setActionInProgress('verify-uncontested')
    let completed = 0

    for (const { profilePath } of uncontestedFields) {
      try {
        await new Promise<void>((resolve, reject) => {
          verifyAnswerMutation.mutate(
            { instanceId, profilePath, verifiedBy: tenantId },
            { onSuccess: () => resolve(), onError: reject },
          )
        })
        completed++
      } catch {
        // Continue
      }
    }

    toast.success(`Verified ${completed} uncontested fields.`)
    setActionInProgress(null)
  }, [uncontestedFields, instanceId, tenantId, verifyAnswerMutation])

  /** Reject the instance  -  update status and optionally add notes */
  const handleReject = useCallback(() => {
    setActionInProgress('reject')
    updateStatusMutation.mutate(
      {
        instanceId,
        matterId,
        status: 'rejected',
      },
      {
        onSuccess: () => {
          toast.success('Form instance rejected and sent back to client.')
          setShowRejectDialog(false)
          setRejectNotes('')
        },
        onSettled: () => setActionInProgress(null),
      },
    )
  }, [instanceId, matterId, updateStatusMutation])

  /** Mark as reviewed  -  update instance status to 'approved' */
  const handleMarkAsReviewed = useCallback(() => {
    setActionInProgress('mark-reviewed')
    updateStatusMutation.mutate(
      {
        instanceId,
        matterId,
        status: 'approved',
      },
      {
        onSuccess: () => {
          toast.success('Form instance marked as approved.')
        },
        onSettled: () => setActionInProgress(null),
      },
    )
  }, [instanceId, matterId, updateStatusMutation])

  /** Resolve a trust conflict */
  const handleConflictResolve = useCallback(
    (profilePath: string, chosenValue: unknown, source: string) => {
      saveAnswersMutation.mutate(
        {
          instanceId,
          updates: { [profilePath]: chosenValue },
          source: source as AnswerSource,
        },
        {
          onSuccess: () => {
            verifyAnswerMutation.mutate({
              instanceId,
              profilePath,
              verifiedBy: tenantId,
            })
          },
        },
      )
    },
    [instanceId, tenantId, saveAnswersMutation, verifyAnswerMutation],
  )

  /** Resolve all trust conflicts with one choice */
  const handleConflictResolveAll = useCallback(
    (choice: 'client' | 'canonical') => {
      for (const conflict of trustConflicts) {
        const value = choice === 'client' ? conflict.clientValue : conflict.canonicalValue
        const source = choice === 'client' ? conflict.clientSource : conflict.canonicalSource
        handleConflictResolve(conflict.profilePath, value, source)
      }
    },
    [trustConflicts, handleConflictResolve],
  )

  // ── Loading ───────────────────────────────────────────────────────────────

  if (answersLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Loading review data...</p>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Review Toolbar ──────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b bg-muted/20">
        {/* Top row: status + primary actions */}
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Staff Review
            </span>

            {/* Instance status badge */}
            {currentInstance && (
              <Badge
                variant="outline"
                className={cn('text-[10px] py-0 px-1.5', statusBadgeStyle(currentInstance.status))}
              >
                {formatStatus(currentInstance.status)}
              </Badge>
            )}

            {/* Stale count badge  -  clickable to navigate to stale tab */}
            {staleCount > 0 && (
              <button onClick={() => setActiveTab('stale')}>
                <Badge
                  variant="outline"
                  className="text-[10px] py-0 px-1.5 border-amber-300 text-amber-700 bg-amber-50 cursor-pointer hover:bg-amber-100 transition-colors"
                >
                  <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                  {staleCount} stale
                </Badge>
              </button>
            )}

            {/* Verification progress */}
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] py-0 px-1.5',
                verifiedCount === totalFields && totalFields > 0
                  ? 'border-green-300 text-green-700 bg-green-50'
                  : 'border-zinc-200 text-muted-foreground',
              )}
            >
              {verifiedCount}/{totalFields} verified
            </Badge>
          </div>

          {/* Primary action buttons */}
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[10px] px-2.5 border-green-300 text-green-700 hover:bg-green-50"
              onClick={handleApproveAll}
              disabled={actionInProgress !== null || unverifiedCount === 0}
            >
              {actionInProgress === 'approve-all' ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3 w-3 mr-1" />
              )}
              Approve All
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[10px] px-2.5 border-red-300 text-red-700 hover:bg-red-50"
              onClick={() => setShowRejectDialog(true)}
              disabled={actionInProgress !== null}
            >
              <X className="h-3 w-3 mr-1" />
              Reject
            </Button>
          </div>
        </div>

        {/* Trust conflicts alert (if any) */}
        {trustConflicts.length > 0 && (
          <div className="px-3 pb-2">
            <Alert className="border-amber-200 bg-amber-50/50 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              <AlertDescription className="text-[10px]">
                <span className="font-semibold">{trustConflicts.length} trust conflict{trustConflicts.length !== 1 ? 's' : ''}</span>
                {' '} -  client values differ from verified canonical values. Review in the Comparison tab.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Reject dialog (inline) */}
        {showRejectDialog && (
          <div className="px-3 pb-2">
            <Card className="gap-0 py-0 border-red-200">
              <div className="p-3">
                <p className="text-xs font-semibold text-red-700 mb-2">
                  Reject and send back to client
                </p>
                <textarea
                  value={rejectNotes}
                  onChange={(e) => setRejectNotes(e.target.value)}
                  placeholder="Add rejection notes for the client (optional)..."
                  className="w-full text-xs px-2 py-1.5 rounded border resize-none h-16 bg-background focus:outline-none focus:ring-1 focus:ring-red-300"
                />
                <div className="flex items-center gap-2 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] px-2.5 border-red-300 text-red-700 hover:bg-red-50"
                    onClick={handleReject}
                    disabled={actionInProgress === 'reject'}
                  >
                    {actionInProgress === 'reject' ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Send className="h-3 w-3 mr-1" />
                    )}
                    Confirm Rejection
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[10px] px-2.5"
                    onClick={() => setShowRejectDialog(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex items-center gap-0.5 px-3 pb-1">
          <button
            onClick={() => setActiveTab('questionnaire')}
            className={cn(
              'text-[10px] font-medium px-2.5 py-1 rounded-md transition-colors',
              activeTab === 'questionnaire'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted/50',
            )}
          >
            <Eye className="h-3 w-3 inline mr-1" />
            Questionnaire
          </button>
          <button
            onClick={() => setActiveTab('comparison')}
            className={cn(
              'text-[10px] font-medium px-2.5 py-1 rounded-md transition-colors',
              activeTab === 'comparison'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted/50',
            )}
          >
            <Shield className="h-3 w-3 inline mr-1" />
            Comparison
            {trustConflicts.length > 0 && (
              <span className="ml-1 text-[9px] bg-amber-200 text-amber-800 rounded-full px-1">
                {trustConflicts.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('stale')}
            className={cn(
              'text-[10px] font-medium px-2.5 py-1 rounded-md transition-colors',
              activeTab === 'stale'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted/50',
            )}
          >
            <AlertTriangle className="h-3 w-3 inline mr-1" />
            Stale
            {staleCount > 0 && (
              <span className="ml-1 text-[9px] bg-amber-200 text-amber-800 rounded-full px-1">
                {staleCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Tab Content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        {/* Questionnaire tab  -  full form renderer in staff mode */}
        {activeTab === 'questionnaire' && (
          <QuestionnaireRenderer
            instanceId={instanceId}
            formId={formId}
            matterId={matterId}
            tenantId={tenantId}
            mode="staff"
          />
        )}

        {/* Comparison tab  -  side-by-side review */}
        {activeTab === 'comparison' && (
          <ScrollArea className="h-full">
            <div className="p-3 space-y-3">
              {/* Trust conflict resolver section */}
              {trustConflicts.length > 0 && (
                <>
                  <TrustConflictResolver
                    instanceId={instanceId}
                    conflicts={trustConflicts}
                    onResolve={handleConflictResolve}
                    onResolveAll={handleConflictResolveAll}
                  />
                  <Separator />
                </>
              )}

              {/* Bulk actions bar */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">
                  Field-by-Field Review
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] px-2.5 border-green-300 text-green-700 hover:bg-green-50"
                    onClick={handleVerifyAllUncontested}
                    disabled={actionInProgress !== null || uncontestedFields.length === 0}
                  >
                    {actionInProgress === 'verify-uncontested' ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-3 w-3 mr-1" />
                    )}
                    Verify All Uncontested ({uncontestedFields.length})
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] px-2.5"
                    onClick={handleMarkAsReviewed}
                    disabled={actionInProgress !== null || currentInstance?.status === 'approved'}
                  >
                    {actionInProgress === 'mark-reviewed' ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <ClipboardCheck className="h-3 w-3 mr-1" />
                    )}
                    Mark as Reviewed
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Comparison rows for all answers */}
              {Object.keys(answerMap).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
                  <Eye className="h-8 w-8 opacity-20" />
                  <p className="text-sm font-medium">No answers to review</p>
                  <p className="text-xs opacity-60 text-center max-w-52">
                    No answers have been submitted for this form instance yet.
                  </p>
                </div>
              ) : (
                <Card className="overflow-hidden gap-0 py-0">
                  {Object.entries(answerMap)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([profilePath, record]) => (
                      <ComparisonRow
                        key={profilePath}
                        profilePath={profilePath}
                        record={record}
                        staffOverride={staffOverrides[profilePath] ?? ''}
                        onStaffOverrideChange={handleStaffOverrideChange}
                        onAccept={handleAcceptField}
                        onOverride={handleOverrideField}
                        isAccepting={actionInProgress === profilePath}
                        isOverriding={actionInProgress === profilePath}
                      />
                    ))}
                </Card>
              )}
            </div>
          </ScrollArea>
        )}

        {/* Stale tab  -  stale fields panel */}
        {activeTab === 'stale' && (
          <ScrollArea className="h-full">
            <div className="p-3">
              <StaleFieldsPanel instanceId={instanceId} />
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
