'use client'

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * IRCC Forms Tab — Form Pack Generation & Management UI
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Single-page tab component for the matter detail page.
 *
 * Layout:
 *   - Pack selector + readiness meter
 *   - Missing fields list (collapsible)
 *   - Generate Drafts button
 *   - Drafts & versions list with approve/export/download controls
 *   - Adobe Reader notice
 *
 * Design rules:
 *   - XFA PDFs open in a new tab (Adobe Reader or compatible viewer required)
 *   - "View" opens in new tab; "Download" fetches blob to preserve filename
 *   - Approve button only visible to users with form_packs:approve
 *   - Export button only visible to users with form_packs:export
 */

import { useState, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  FileText,
  Download,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Shield,
  Info,
  Printer,
  Eye,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { RequirePermission } from '@/components/require-permission'
import { FormDiffWarning } from '@/components/ircc/form-diff-warning'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useFormPackVersions,
  usePackReadiness,
  useGenerateFormPack,
  useApproveFormPack,
  useExportFormPack,
  useLogFormAccess,
  useFormPackArtifactUrl,
} from '@/lib/queries/form-packs'
import { useAvailableFormsForMatter } from '@/lib/queries/ircc-forms'
import type { FormPackVersion, PackReadiness, FormPackValidationResult } from '@/lib/types/form-packs'

// ── Props ─────────────────────────────────────────────────────────────────────

interface IRCCFormsTabProps {
  matterId: string
  contactId: string | null
  tenantId: string
  caseTypeId?: string | null
}

// ── Main Component ────────────────────────────────────────────────────────────

export function IRCCFormsTab({ matterId, contactId, tenantId, caseTypeId }: IRCCFormsTabProps) {
  const [missingFieldsOpen, setMissingFieldsOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)

  // Fetch available forms for this matter's case type (DB-driven)
  // Filter out any forms with empty/null formCodes to avoid Radix SelectItem errors
  const { data: rawAvailableForms = [] } = useAvailableFormsForMatter(caseTypeId, tenantId)
  const availableForms = rawAvailableForms.filter((f) => f.formCode && f.formCode.length > 0)
  const [selectedPackType, setSelectedPackType] = useState<string>('')

  // Auto-select first available form when forms load
  useEffect(() => {
    if (!selectedPackType && availableForms.length > 0) {
      setSelectedPackType(availableForms[0].formCode)
    }
  }, [availableForms, selectedPackType])

  // Data queries
  const { data: readiness, isLoading: readinessLoading } = usePackReadiness(contactId, selectedPackType)
  const { data: versions, isLoading: versionsLoading } = useFormPackVersions(matterId)

  // Mutations
  const generateMutation = useGenerateFormPack()
  const approveMutation = useApproveFormPack()
  const exportMutation = useExportFormPack()
  const logAccessMutation = useLogFormAccess()
  const artifactUrlMutation = useFormPackArtifactUrl()

  // Filter versions by selected pack type
  const filteredVersions = versions?.filter((v) => v.pack_type === selectedPackType) ?? []

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleGenerate = useCallback(() => {
    generateMutation.mutate({ matterId, packType: selectedPackType })
  }, [generateMutation, matterId, selectedPackType])

  const handleApprove = useCallback(
    (versionId: string) => {
      approveMutation.mutate({ matterId, packVersionId: versionId })
    },
    [approveMutation, matterId],
  )

  const handleExport = useCallback(
    async (versionId: string) => {
      const result = await exportMutation.mutateAsync({ matterId, packVersionId: versionId })
      if (result?.data?.signedUrl) {
        // Trigger download
        const a = document.createElement('a')
        a.href = result.data.signedUrl
        a.download = result.data.fileName
        a.click()
      }
    },
    [exportMutation, matterId],
  )

  const handleDownloadArtifact = useCallback(
    async (storagePath: string, fileName: string, artifactId: string) => {
      logAccessMutation.mutate({ artifactId, matterId, accessType: 'download' })

      const signedUrl = await artifactUrlMutation.mutateAsync(storagePath)
      if (!signedUrl) return

      // Fetch through client so the browser saves with the correct filename.
      // Direct cross-origin <a download="..."> is ignored by browsers.
      try {
        const response = await fetch(signedUrl)
        const blob = await response.blob()
        const objectUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = objectUrl
        a.download = fileName
        a.click()
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
      } catch {
        // Fallback: open directly (filename won't be set, but file downloads)
        const a = document.createElement('a')
        a.href = signedUrl
        a.download = fileName
        a.click()
      }
    },
    [logAccessMutation, artifactUrlMutation, matterId],
  )

  const handleViewArtifact = useCallback(
    async (storagePath: string, _fileName: string, artifactId: string) => {
      logAccessMutation.mutate({ artifactId, matterId, accessType: 'view' })
      const signedUrl = await artifactUrlMutation.mutateAsync(storagePath)
      if (signedUrl) {
        window.open(signedUrl, '_blank')
      }
    },
    [logAccessMutation, artifactUrlMutation, matterId],
  )

  const handlePrint = useCallback(
    async (storagePath: string, _fileName: string, artifactId: string) => {
      logAccessMutation.mutate({ artifactId, matterId, accessType: 'print' })
      const signedUrl = await artifactUrlMutation.mutateAsync(storagePath)
      if (signedUrl) {
        window.open(signedUrl, '_blank')
      }
    },
    [logAccessMutation, artifactUrlMutation, matterId],
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Pack Selector + Readiness Meter ──────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Form Pack</label>
          <Select
            value={selectedPackType}
            onValueChange={(v) => setSelectedPackType(v)}
          >
            <SelectTrigger className="w-[340px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="w-[340px]">
              {availableForms.map(({ formCode, label }) => (
                <SelectItem key={formCode} value={formCode}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {readinessLoading ? (
          <Skeleton className="h-10 w-48" />
        ) : readiness ? (
          <ReadinessMeter readiness={readiness} />
        ) : (
          <div className="text-sm text-muted-foreground">
            {!contactId
              ? 'No primary contact assigned to this matter.'
              : 'Unable to compute readiness.'}
          </div>
        )}
      </div>

      {/* ── SENTINEL: Data Mismatch Warning ──────────────────────────────── */}
      <FormDiffWarning matterId={matterId} formCode={selectedPackType} />

      {/* ── Missing Fields (Collapsible) ─────────────────────────────────── */}
      {readiness && readiness.fields.missing.length > 0 && (
        <Collapsible open={missingFieldsOpen} onOpenChange={setMissingFieldsOpen}>
          <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4" />
                  {readiness.fields.missing.length} required field{readiness.fields.missing.length !== 1 ? 's' : ''} missing
                  {missingFieldsOpen ? (
                    <ChevronDown className="ml-auto h-4 w-4" />
                  ) : (
                    <ChevronRight className="ml-auto h-4 w-4" />
                  )}
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <div className="space-y-1">
                  {readiness.fields.missing.map((field) => (
                    <div
                      key={field.profile_path}
                      className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300"
                    >
                      <span className="font-mono text-xs text-muted-foreground">
                        {field.section}
                      </span>
                      <span className="text-muted-foreground">—</span>
                      <span>{field.label}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* ── Validation Errors (Blocking) ─────────────────────────────────── */}
      {readiness && readiness.validation.errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Cannot Generate</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc pl-4">
              {readiness.validation.errors.map((err, i) => (
                <li key={i} className="text-sm">
                  {err.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* ── Validation Warnings (Non-blocking) ──────────────────────────── */}
      {readiness && readiness.validation.warnings.length > 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Warnings</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc pl-4">
              {readiness.validation.warnings.map((warn, i) => (
                <li key={i} className="text-sm">
                  {warn.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* ── Generate Button ──────────────────────────────────────────────── */}
      <RequirePermission entity="form_packs" action="create" variant="inline">
        <Button
          onClick={handleGenerate}
          disabled={
            !readiness?.can_generate ||
            generateMutation.isPending ||
            readinessLoading
          }
          className="gap-2"
          size="lg"
        >
          {generateMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating Draft...
            </>
          ) : (
            <>
              <FileText className="h-4 w-4" />
              Generate {(availableForms.find((f) => f.formCode === selectedPackType)?.label ?? selectedPackType).split('—')[0].trim()} Draft
            </>
          )}
        </Button>
      </RequirePermission>

      {/* ── Versions List ────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground">
          Drafts & Versions
        </h3>

        {versionsLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : filteredVersions.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/40" />
              <p className="mt-4 text-sm text-muted-foreground">
                No form pack versions yet. Generate your first draft above.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredVersions.map((version) => (
              <VersionCard
                key={version.id}
                version={version}
                matterId={matterId}
                onApprove={handleApprove}
                onExport={handleExport}
                onDownload={handleDownloadArtifact}
                onView={handleViewArtifact}
                onPrint={handlePrint}
                isApproving={approveMutation.isPending}
                isExporting={exportMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Review Summary (Collapsible) ─────────────────────────────────── */}
      {filteredVersions.length > 0 && filteredVersions[0].input_snapshot && (
        <Collapsible open={reviewOpen} onOpenChange={setReviewOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <Shield className="h-4 w-4" />
                  Review Summary (Latest Draft)
                  {reviewOpen ? (
                    <ChevronDown className="ml-auto h-4 w-4" />
                  ) : (
                    <ChevronRight className="ml-auto h-4 w-4" />
                  )}
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <ReviewSummary snapshot={filteredVersions[0].input_snapshot} />
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* ── Adobe Reader Notice ──────────────────────────────────────────── */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs text-muted-foreground">
          For accurate rendering of IRCC forms, open downloaded PDFs in{' '}
          <strong>Adobe Acrobat Reader</strong>. Other PDF viewers may not
          display XFA form data correctly.
        </AlertDescription>
      </Alert>
    </div>
  )
}

// ── Readiness Meter ───────────────────────────────────────────────────────────

function ReadinessMeter({ readiness }: { readiness: PackReadiness }) {
  const { overall_pct, can_generate, fields } = readiness

  return (
    <div className="flex items-center gap-3">
      <div className="w-32">
        <Progress value={overall_pct} className="h-2" />
      </div>
      <span className="text-sm font-medium tabular-nums">
        {fields.filled}/{fields.total} fields
      </span>
      {can_generate ? (
        <Badge variant="default" className="bg-green-600 text-white">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Ready
        </Badge>
      ) : (
        <Badge variant="secondary">
          <Clock className="mr-1 h-3 w-3" />
          Incomplete
        </Badge>
      )}
    </div>
  )
}

// ── Version Card ──────────────────────────────────────────────────────────────

function VersionCard({
  version,
  matterId,
  onApprove,
  onExport,
  onDownload,
  onView,
  onPrint,
  isApproving,
  isExporting,
}: {
  version: FormPackVersion
  matterId: string
  onApprove: (versionId: string) => void
  onExport: (versionId: string) => void
  onDownload: (storagePath: string, fileName: string, artifactId: string) => void
  onView: (storagePath: string, fileName: string, artifactId: string) => void
  onPrint: (storagePath: string, fileName: string, artifactId: string) => void
  isApproving: boolean
  isExporting: boolean
}) {
  const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
    draft: { label: 'Draft', variant: 'secondary' },
    approved: { label: 'Approved', variant: 'default' },
    superseded: { label: 'Superseded', variant: 'outline' },
  }

  const config = statusConfig[version.status] ?? statusConfig.draft

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-4">
          {/* Left: Version info */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">
                v{version.version_number}
              </span>
              <Badge variant={config.variant}>
                {version.status === 'approved' && (
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                )}
                {config.label}
              </Badge>
            </div>
            {version.validation_result && (
              <ValidationStatusRow result={version.validation_result} />
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}
              {version.approved_at && (
                <span>
                  &middot; Approved {formatDistanceToNow(new Date(version.approved_at), { addSuffix: true })}
                </span>
              )}
            </div>
          </div>

          {/* Right: Action buttons */}
          <div className="flex items-center gap-2">
            {/* Download draft (always available) */}
            <ArtifactDownloadButton
              versionId={version.id}
              isFinal={false}
              onDownload={onDownload}
              onView={onView}
              onPrint={onPrint}
            />

            {/* Download final (if approved) */}
            {version.status === 'approved' && (
              <ArtifactDownloadButton
                versionId={version.id}
                isFinal={true}
                onDownload={onDownload}
                onView={onView}
                onPrint={onPrint}
              />
            )}

            {/* Approve button (draft only, requires permission) */}
            {version.status === 'draft' && (
              <RequirePermission entity="form_packs" action="approve" variant="inline">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => onApprove(version.id)}
                  disabled={isApproving}
                  className="gap-1"
                >
                  {isApproving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3" />
                  )}
                  Approve
                </Button>
              </RequirePermission>
            )}

            {/* Export button (approved only, requires permission) */}
            {version.status === 'approved' && (
              <RequirePermission entity="form_packs" action="export" variant="inline">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onExport(version.id)}
                  disabled={isExporting}
                  className="gap-1"
                >
                  {isExporting ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="h-3 w-3" />
                  )}
                  Export
                </Button>
              </RequirePermission>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Artifact Download Button ──────────────────────────────────────────────────

function ArtifactDownloadButton({
  versionId,
  isFinal,
  onDownload,
  onView,
  onPrint,
}: {
  versionId: string
  isFinal: boolean
  onDownload: (storagePath: string, fileName: string, artifactId: string) => void
  onView: (storagePath: string, fileName: string, artifactId: string) => void
  onPrint: (storagePath: string, fileName: string, artifactId: string) => void
}) {
  const { data: artifacts, isLoading } = useArtifactsForVersion(versionId, isFinal)
  const artifact = artifacts?.[0]

  if (isLoading || !artifact) return null

  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onDownload(artifact.storage_path, artifact.file_name, artifact.id)}
        className="gap-1 text-xs"
        title={`Download ${isFinal ? 'final' : 'draft'} PDF`}
      >
        <Download className="h-3 w-3" />
        {isFinal ? 'Final' : 'Draft'}
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => onView(artifact.storage_path, artifact.file_name, artifact.id)}
        className="h-7 w-7"
        title="View in new tab"
      >
        <Eye className="h-3 w-3" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => onPrint(artifact.storage_path, artifact.file_name, artifact.id)}
        className="h-7 w-7"
        title="Open in new tab for printing"
      >
        <Printer className="h-3 w-3" />
      </Button>
    </div>
  )
}

/**
 * Small hook to fetch artifacts filtered by is_final flag.
 * Separate from useFormPackArtifacts to allow filtering.
 */
function useArtifactsForVersion(versionId: string, isFinal: boolean) {
  return useQuery({
    queryKey: ['form-packs', 'artifacts', versionId, isFinal ? 'final' : 'draft'],
    queryFn: async () => {
      const supabase = (await import('@/lib/supabase/client')).createClient()
      const { data, error } = await supabase
        .from('form_pack_artifacts')
        .select('*')
        .eq('pack_version_id', versionId)
        .eq('is_final', isFinal)
        .order('created_at', { ascending: false })
        .limit(1)

      if (error) throw error
      return data ?? []
    },
    enabled: !!versionId,
  })
}

// useQuery imported at top via @tanstack/react-query (re-imported for local hook)

// ── Review Summary ────────────────────────────────────────────────────────────

function ReviewSummary({ snapshot }: { snapshot: Record<string, unknown> }) {
  const personal = snapshot.personal as Record<string, unknown> | undefined
  const passport = snapshot.passport as Record<string, unknown> | undefined
  const marital = snapshot.marital as Record<string, unknown> | undefined
  const family = snapshot.family as Record<string, unknown> | undefined

  const childCount = Array.isArray(family?.children) ? family.children.length : 0
  const siblingCount = Array.isArray(family?.siblings) ? family.siblings.length : 0

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {/* Personal */}
      <div className="space-y-1">
        <h4 className="text-xs font-semibold uppercase text-muted-foreground">Personal</h4>
        <ReviewRow label="Name" value={`${personal?.family_name ?? '—'}, ${personal?.given_name ?? '—'}`} />
        <ReviewRow label="DOB" value={personal?.date_of_birth as string} />
        <ReviewRow label="Citizenship" value={personal?.citizenship as string} />
        <ReviewRow label="Country of Birth" value={personal?.place_of_birth_country as string} />
      </div>

      {/* Passport */}
      <div className="space-y-1">
        <h4 className="text-xs font-semibold uppercase text-muted-foreground">Passport</h4>
        <ReviewRow label="Number" value={passport?.number as string} />
        <ReviewRow label="Expiry" value={passport?.expiry_date as string} />
      </div>

      {/* Family */}
      <div className="space-y-1">
        <h4 className="text-xs font-semibold uppercase text-muted-foreground">Family</h4>
        <ReviewRow
          label="Marital Status"
          value={marital?.status as string}
        />
        {marital?.spouse_family_name ? (
          <ReviewRow
            label="Spouse"
            value={`${String(marital.spouse_family_name)}, ${String(marital.spouse_given_name ?? '')}`}
          />
        ) : null}
        <ReviewRow label="Children" value={String(childCount)} />
        <ReviewRow label="Siblings" value={String(siblingCount)} />
        <ReviewRow
          label="Mother"
          value={family?.mother ? `${(family.mother as Record<string, unknown>).family_name ?? '—'}, ${(family.mother as Record<string, unknown>).given_name ?? '—'}` : '—'}
        />
        <ReviewRow
          label="Father"
          value={family?.father ? `${(family.father as Record<string, unknown>).family_name ?? '—'}, ${(family.father as Record<string, unknown>).given_name ?? '—'}` : '—'}
        />
      </div>
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: string | undefined | null }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value || '—'}</span>
    </div>
  )
}

// ── Validation Status Row ─────────────────────────────────────────────────────

function ValidationStatusRow({ result }: { result: FormPackValidationResult }) {
  const [errorsOpen, setErrorsOpen] = useState(false)

  const hardErrors = result.hard_errors ?? []
  const blockingCount = hardErrors.filter((e) => e.blocking).length
  const barcodeStatus = result.barcode_status

  return (
    <div className="space-y-1">
      {/* Counts row */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{result.filled_count} fields filled</span>
        {result.skipped_count > 0 && (
          <span className="text-amber-600">{result.skipped_count} skipped</span>
        )}
        {blockingCount > 0 && (
          <button
            onClick={() => setErrorsOpen((o) => !o)}
            className="flex items-center gap-1 text-destructive hover:underline"
          >
            <AlertTriangle className="h-3 w-3" />
            {blockingCount} error{blockingCount !== 1 ? 's' : ''}
            {errorsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        )}
        {barcodeStatus === 'embedded' && (
          <span className="text-green-600">Barcode ✓</span>
        )}
        {barcodeStatus === 'requires_adobe_reader' && (
          <span className="text-amber-600">Barcode (Adobe only)</span>
        )}
      </div>

      {/* Collapsible error list */}
      {errorsOpen && hardErrors.length > 0 && (
        <ul className="ml-1 space-y-0.5 border-l-2 border-destructive/30 pl-3">
          {hardErrors.map((err, i) => (
            <li key={i} className="text-xs text-destructive">
              {err.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

