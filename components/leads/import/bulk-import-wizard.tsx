'use client'

import { useState, useCallback } from 'react'
import { CheckCircle2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  useUploadImportCSV,
  useValidateImportBatch,
  useBatchStatus,
  useStagingRows,
  useBulkFixImport,
  useCommitImportBatch,
  useDiscardImportBatch,
} from '@/lib/queries/bulk-lead-import'
import { UploadStep } from './steps/upload-step'
import { MapColumnsStep } from './steps/map-columns-step'
import { ValidationProgressStep } from './steps/validation-progress-step'
import { SandboxReviewStep } from './steps/sandbox-review-step'

// ─── Types ───────────────────────────────────────────────────────────────────

type WizardStep = 'upload' | 'map' | 'validating' | 'review' | 'commit' | 'done'

interface BulkImportWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantId: string
}

// ─── Component ───────────────────────────────────────────────────────────────

export function BulkImportWizard({ open, onOpenChange, tenantId }: BulkImportWizardProps) {
  const [step, setStep] = useState<WizardStep>('upload')
  const [batchId, setBatchId] = useState<string | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<Record<string, string>[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [sourceTag, setSourceTag] = useState('')
  const [campaignTag, setCampaignTag] = useState('')

  // Mutations
  const uploadMutation = useUploadImportCSV()
  const validateMutation = useValidateImportBatch()
  const commitMutation = useCommitImportBatch()
  const discardMutation = useDiscardImportBatch()

  // Polling for validation progress
  const isPolling = step === 'validating' || step === 'commit'
  const { data: batchStatus } = useBatchStatus(batchId, isPolling)

  // Auto-advance from validating → review when gatekeeper finishes
  if (step === 'validating' && batchStatus?.status === 'ready') {
    setStep('review')
  }

  // Auto-advance from commit → done when committed
  if (step === 'commit' && batchStatus?.status === 'committed') {
    setStep('done')
  }

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleUploadComplete = useCallback((result: {
    batchId: string
    headers: string[]
    suggestedMapping: Record<string, string>
    preview: Record<string, string>[]
    totalRows: number
  }) => {
    setBatchId(result.batchId)
    setHeaders(result.headers)
    setMapping(result.suggestedMapping)
    setPreview(result.preview)
    setTotalRows(result.totalRows)
    setStep('map')
  }, [])

  const handleMappingConfirmed = useCallback(async (
    finalMapping: Record<string, string>,
    source: string,
    campaign: string
  ) => {
    if (!batchId) return
    setMapping(finalMapping)
    setSourceTag(source)
    setCampaignTag(campaign)
    setStep('validating')

    await validateMutation.mutateAsync({
      batchId,
      columnMapping: finalMapping,
      sourceTag: source || undefined,
      campaignTag: campaign || undefined,
    })
  }, [batchId, validateMutation])

  const handleCommit = useCallback(async (pipelineId: string, stageId: string, matterTypeId?: string) => {
    if (!batchId) return
    setStep('commit')
    await commitMutation.mutateAsync({
      batchId,
      pipelineId,
      stageId,
      defaultMatterTypeId: matterTypeId,
    })
  }, [batchId, commitMutation])

  const handleDiscard = useCallback(async () => {
    if (!batchId) return
    await discardMutation.mutateAsync(batchId)
    handleReset()
  }, [batchId, discardMutation])

  const handleReset = useCallback(() => {
    setStep('upload')
    setBatchId(null)
    setHeaders([])
    setMapping({})
    setPreview([])
    setTotalRows(0)
    setSourceTag('')
    setCampaignTag('')
  }, [])

  const handleClose = useCallback(() => {
    onOpenChange(false)
    // Reset after animation completes
    setTimeout(handleReset, 300)
  }, [onOpenChange, handleReset])

  // ── Step titles ──────────────────────────────────────────────────────────

  const stepConfig: Record<WizardStep, { title: string; description: string; num: number }> = {
    upload:     { title: 'Upload CSV',            description: 'Select a CSV file to import leads through the Norva Gatekeeper',  num: 1 },
    map:        { title: 'Map Columns',           description: 'Match your CSV columns to lead fields',                          num: 2 },
    validating: { title: 'Norva Gatekeeper',      description: 'Scanning for conflicts, validating data, and matching jurisdictions...', num: 3 },
    review:     { title: 'Review & Fix',          description: 'The Gatekeeper flagged items that need your attention',           num: 4 },
    commit:     { title: 'Importing',             description: 'Creating leads from approved rows...',                           num: 5 },
    done:       { title: 'Gatekeeper Complete',    description: 'Your leads have been imported successfully',                     num: 5 },
  }

  const currentStep = stepConfig[step]

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0">
        {/* Header with step indicator */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center gap-3 mb-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <div
                key={n}
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                  n < currentStep.num
                    ? 'bg-emerald-500 text-white'
                    : n === currentStep.num
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                }`}
              >
                {n < currentStep.num ? <CheckCircle2 className="h-4 w-4" /> : n}
              </div>
            ))}
          </div>
          <DialogTitle>{currentStep.title}</DialogTitle>
          <DialogDescription>{currentStep.description}</DialogDescription>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {step === 'upload' && (
            <UploadStep
              onUploadComplete={handleUploadComplete}
              uploadMutation={uploadMutation}
            />
          )}

          {step === 'map' && (
            <MapColumnsStep
              headers={headers}
              mapping={mapping}
              preview={preview}
              totalRows={totalRows}
              onConfirm={handleMappingConfirmed}
              onBack={() => setStep('upload')}
              isSubmitting={validateMutation.isPending}
            />
          )}

          {step === 'validating' && (
            <ValidationProgressStep batchStatus={batchStatus} />
          )}

          {step === 'review' && batchId && (
            <SandboxReviewStep
              batchId={batchId}
              batchStatus={batchStatus}
              onCommit={handleCommit}
              onDiscard={handleDiscard}
              tenantId={tenantId}
            />
          )}

          {step === 'commit' && (
            <ValidationProgressStep batchStatus={batchStatus} isCommitting />
          )}

          {step === 'done' && batchStatus && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="h-16 w-16 text-emerald-500 mb-4" />
              <h3 className="text-xl font-semibold mb-2">Import Complete</h3>
              <p className="text-sm text-muted-foreground mb-6">
                {batchStatus.gatekeeper_summary?.created ?? 0} leads created
                {(batchStatus.gatekeeper_summary?.skipped ?? 0) > 0 &&
                  `, ${batchStatus.gatekeeper_summary?.skipped} skipped`}
                {(batchStatus.gatekeeper_summary?.errors ?? 0) > 0 &&
                  `, ${batchStatus.gatekeeper_summary?.errors} errors`}
              </p>
              <Button onClick={handleClose}>Close</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
