'use client'

/**
 * ClientQuestionnaire  -  Client-facing questionnaire wrapper for the portal.
 *
 * Wraps QuestionnaireRenderer in client mode with additional UX:
 * - Welcome header with form name and optional message
 * - Instructions callout
 * - Compact progress indicator
 * - Save & Continue Later / Submit for Review actions
 * - Read-only mode after submission with success state
 * - Mobile-responsive single-column layout
 */

import { useState, useCallback } from 'react'
import {
  CheckCircle2,
  Save,
  Send,
  ArrowLeft,
  Mail,
  FileText,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useCompletionState } from '@/lib/queries/answer-engine'
import { useUpdateFormInstanceStatus } from '@/lib/queries/form-instances'
import { QuestionnaireRenderer } from '@/components/ircc/workspace/questionnaire-renderer'
import { InstanceProgress } from '@/components/ircc/workspace/instance-progress'

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ClientQuestionnaireProps {
  instanceId: string
  formId: string
  matterId: string
  tenantId: string
  formName: string
  welcomeMessage?: string
  instructions?: string
  lawyerName?: string
  lawyerEmail?: string
  onBack?: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ClientQuestionnaire({
  instanceId,
  formId,
  matterId,
  tenantId,
  formName,
  welcomeMessage,
  instructions,
  lawyerName,
  lawyerEmail,
  onBack,
}: ClientQuestionnaireProps) {
  const [submitted, setSubmitted] = useState(false)

  // ── Data ──────────────────────────────────────────────────────────────────

  const { data: completionState } = useCompletionState(instanceId)
  const updateStatus = useUpdateFormInstanceStatus()

  const completionPct = completionState?.completion_pct ?? 0
  const isComplete = completionPct >= 100

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSave = useCallback(() => {
    toast.success('Your progress has been saved. You can return anytime to continue.')
  }, [])

  const handleSubmit = useCallback(() => {
    updateStatus.mutate(
      {
        instanceId,
        matterId,
        status: 'ready_for_review',
      },
      {
        onSuccess: () => {
          setSubmitted(true)
          toast.success('Your answers have been submitted for review.')
        },
      },
    )
  }, [instanceId, matterId, updateStatus])

  // ── Submitted Success State ───────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-6 px-6 text-center space-y-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-green-600" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg font-semibold text-foreground">
                Your answers have been submitted
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Thank you for completing the <span className="font-medium">{formName}</span>.
                Your lawyer will review your answers and follow up if anything else is needed.
              </p>
            </div>

            {(lawyerName || lawyerEmail) && (
              <div className="pt-2 border-t space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Your Lawyer
                </p>
                {lawyerName && (
                  <p className="text-sm font-medium text-foreground">{lawyerName}</p>
                )}
                {lawyerEmail && (
                  <a
                    href={`mailto:${lawyerEmail}`}
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    {lawyerEmail}
                  </a>
                )}
              </div>
            )}

            {onBack && (
              <div className="pt-2">
                <Button variant="outline" size="sm" onClick={onBack}>
                  <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                  Back to Forms
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Main Questionnaire View ───────────────────────────────────────────────

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6 space-y-6 sm:px-6">
      {/* Back button */}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Forms
        </button>
      )}

      {/* Welcome Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary shrink-0" />
          <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
            {formName}
          </h1>
        </div>

        {welcomeMessage && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {welcomeMessage}
          </p>
        )}
      </div>

      {/* Instructions Callout */}
      {instructions && (
        <Alert>
          <AlertDescription className="text-sm leading-relaxed whitespace-pre-line">
            {instructions}
          </AlertDescription>
        </Alert>
      )}

      {/* Progress Bar (compact) */}
      <Card className="p-4">
        <InstanceProgress
          instanceId={instanceId}
          formId={formId}
          compact
        />
      </Card>

      {/* Questionnaire Renderer */}
      <Card className="overflow-hidden">
        <QuestionnaireRenderer
          instanceId={instanceId}
          formId={formId}
          matterId={matterId}
          tenantId={tenantId}
          mode="client"
          readOnly={false}
        />
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <Button
          variant="outline"
          onClick={handleSave}
          className="w-full sm:w-auto"
        >
          <Save className="h-4 w-4 mr-1.5" />
          Save & Continue Later
        </Button>

        <Button
          onClick={handleSubmit}
          disabled={!isComplete || updateStatus.isPending}
          className={cn(
            'w-full sm:w-auto',
            isComplete
              ? 'bg-green-600 hover:bg-green-700'
              : '',
          )}
        >
          {updateStatus.isPending ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Send className="h-4 w-4 mr-1.5" />
          )}
          Submit for Review
        </Button>
      </div>

      {/* Completion hint */}
      {!isComplete && (
        <p className="text-xs text-muted-foreground text-center">
          Please complete all required fields before submitting.
          Your progress is {completionPct}% complete.
        </p>
      )}
    </div>
  )
}
