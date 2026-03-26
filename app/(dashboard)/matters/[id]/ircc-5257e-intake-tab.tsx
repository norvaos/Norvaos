'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  FileText,
  Play,
  CheckCircle2,
  Loader2,
  Download,
  RotateCcw,
  ClipboardList,
  AlertCircle,
  Pencil,
} from 'lucide-react'
import { toast } from 'sonner'

import { useUser } from '@/lib/hooks/use-user'
import {
  useIRCCMatterSession,
  useCreateIRCCSession,
  useCompleteIRCCSession,
  useIRCCClientProfile,
  useUpdateIRCCProfile,
} from '@/lib/queries/ircc'
import { IRCCQuestionnaire } from '@/components/ircc/ircc-questionnaire'
import { ProfileSummary } from '@/components/ircc/profile-summary'
import type { IRCCProfile } from '@/lib/types/ircc-profile'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// ── Constants ─────────────────────────────────────────────────────────────────

const IMM5257E_FORMS = ['IMM5257E'] as const

// ── Component ─────────────────────────────────────────────────────────────────

interface IRCC5257EIntakeTabProps {
  matterId: string
  contactId: string | null
  tenantId: string
}

export function IRCC5257EIntakeTab({ matterId, contactId, tenantId }: IRCC5257EIntakeTabProps) {
  const { appUser } = useUser()
  const userId = appUser?.id ?? ''

  // Fetch existing session for this matter
  const { data: session, isLoading: sessionLoading } = useIRCCMatterSession(matterId)

  // Fetch existing client profile
  const { data: existingProfile, isLoading: profileLoading } = useIRCCClientProfile(contactId ?? '')

  // Mutations
  const createSession = useCreateIRCCSession()
  const completeSession = useCompleteIRCCSession()
  const updateProfile = useUpdateIRCCProfile()

  const [showQuestionnaire, setShowQuestionnaire] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null)

  const isLoading = sessionLoading || profileLoading
  const isCompleted = session?.status === 'completed'
  const isInProgress = session?.status === 'in_progress'

  // Start a new questionnaire session
  const handleStartSession = useCallback(async () => {
    if (!contactId) {
      toast.error('This matter needs a primary contact before starting the IMM 5257E questionnaire.')
      return
    }

    try {
      await createSession.mutateAsync({
        tenant_id: tenantId,
        contact_id: contactId,
        matter_id: matterId,
        form_codes: [...IMM5257E_FORMS],
        status: 'in_progress',
        created_by: userId,
      })
      setShowQuestionnaire(true)
    } catch {
      // Error handled by mutation onError
    }
  }, [contactId, tenantId, matterId, userId, createSession])

  // Save progress (called on step navigation)
  const handleSave = useCallback(
    async (profile: Partial<IRCCProfile>) => {
      if (!contactId) return
      await updateProfile.mutateAsync({ contactId, profile, matterId, changedBy: userId })
    },
    [contactId, updateProfile, matterId, userId],
  )

  // Complete questionnaire
  const handleComplete = useCallback(
    async (profile: Partial<IRCCProfile>) => {
      if (!contactId || !session) return
      await updateProfile.mutateAsync({ contactId, profile, matterId, changedBy: userId })
      await completeSession.mutateAsync(session.id)
      setShowQuestionnaire(false)
    },
    [contactId, session, updateProfile, completeSession, userId],
  )

  // Restart questionnaire
  const handleRestart = useCallback(async () => {
    if (!contactId) return
    try {
      await createSession.mutateAsync({
        tenant_id: tenantId,
        contact_id: contactId,
        matter_id: matterId,
        form_codes: [...IMM5257E_FORMS],
        status: 'in_progress',
        created_by: userId,
      })
      setShowQuestionnaire(true)
    } catch {
      // Error handled by mutation onError
    }
  }, [contactId, tenantId, matterId, userId, createSession])

  // Generate and download PDF
  const handleGeneratePdf = useCallback(
    async (formCode: string) => {
      if (!contactId) {
        toast.error('No contact associated with this matter.')
        return
      }

      setGeneratingPdf(formCode)
      try {
        const response = await fetch('/api/ircc/generate-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactId, formCode }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => null)
          throw new Error(errorData?.error ?? `Failed to generate PDF (${response.status})`)
        }

        const disposition = response.headers.get('Content-Disposition')
        const filenameMatch = disposition?.match(/filename="?([^"]+)"?/)
        const filename = filenameMatch?.[1] ?? `${formCode}_form.pdf`

        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)

        toast.success(`${formCode} PDF downloaded successfully.`)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate PDF'
        toast.error(message)
      } finally {
        setGeneratingPdf(null)
      }
    },
    [contactId],
  )

  // ── Loading State ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading IMM 5257E intake data...</span>
      </div>
    )
  }

  // ── No Contact ───────────────────────────────────────────────────────────
  if (!contactId) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="mb-3 h-8 w-8 text-amber-400" />
          <h3 className="text-sm font-medium text-amber-700">No Primary Contact</h3>
          <p className="mt-1 max-w-md text-sm text-amber-600">
            Please assign a primary contact to this matter before starting the IMM 5257E questionnaire.
          </p>
        </CardContent>
      </Card>
    )
  }

  // ── Questionnaire Active ─────────────────────────────────────────────────
  if (showQuestionnaire || (isInProgress && !isCompleted)) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">IMM 5257E  -  Temporary Resident Visa</h3>
            <p className="text-sm text-muted-foreground">
              Collecting all required information for IMM 5257E application
            </p>
          </div>
          <Badge variant="secondary" className="gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            In Progress
          </Badge>
        </div>

        <IRCCQuestionnaire
          formCodes={[...IMM5257E_FORMS]}
          existingProfile={existingProfile ?? {}}
          onSave={handleSave}
          onComplete={handleComplete}
          matterId={matterId}
          canVerify
        />
      </div>
    )
  }

  // ── Completed State ──────────────────────────────────────────────────────
  if (isCompleted) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                IMM 5257E Questionnaire Completed
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setShowQuestionnaire(!showQuestionnaire)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {showQuestionnaire ? 'Close Editor' : 'Edit Answers'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={handleRestart}
                  disabled={createSession.isPending}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Re-collect
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Download PDF card */}
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">IMM 5257E</p>
                  <p className="text-xs text-muted-foreground">Application for Temporary Resident Visa</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1 text-green-600 border-green-200 bg-green-50">
                  <CheckCircle2 className="h-3 w-3" />
                  Ready
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => handleGeneratePdf('IMM5257E')}
                  disabled={generatingPdf === 'IMM5257E'}
                >
                  {generatingPdf === 'IMM5257E' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  Download PDF
                </Button>
              </div>
            </div>

            {session?.completed_at && (
              <p className="mt-4 text-xs text-muted-foreground">
                Completed on{' '}
                {new Date(session.completed_at).toLocaleDateString('en-CA', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Inline Profile Summary */}
        {!showQuestionnaire && existingProfile && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Submitted Information</h3>
              <p className="text-xs text-muted-foreground">
                Click any section to expand/collapse
              </p>
            </div>
            <ProfileSummary
              formCodes={[...IMM5257E_FORMS]}
              profile={existingProfile}
            />
          </div>
        )}

        {/* Step-by-step editor */}
        {showQuestionnaire && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Edit Collected Information</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowQuestionnaire(false)}
              >
                Close
              </Button>
            </div>
            <IRCCQuestionnaire
              formCodes={[...IMM5257E_FORMS]}
              existingProfile={existingProfile ?? {}}
              onSave={handleSave}
              onComplete={handleComplete}
            />
          </div>
        )}
      </div>
    )
  }

  // ── Start State (no session yet) ─────────────────────────────────────────
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 rounded-full bg-indigo-50 p-4">
          <ClipboardList className="h-8 w-8 text-indigo-500" />
        </div>
        <h3 className="text-lg font-semibold">IMM 5257E  -  Temporary Resident Visa</h3>
        <p className="mt-1 max-w-lg text-sm text-muted-foreground">
          Collect all required client information for the IMM 5257E application.
          Includes personal details, identity documents, language, contact info,
          visit details, education, employment, and background questions.
        </p>

        <div className="mt-6 space-y-3">
          <Badge variant="outline" className="gap-1.5">
            <FileText className="h-3 w-3" />
            IMM 5257E
          </Badge>

          <div>
            <Button
              className="mt-4 gap-2"
              onClick={handleStartSession}
              disabled={createSession.isPending}
            >
              {createSession.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Start IMM 5257E Questionnaire
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
