'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
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
  Settings,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

import { useUser } from '@/lib/hooks/use-user'
import {
  useIRCCMatterSession,
  useCreateIRCCSession,
  useCompleteIRCCSession,
  useIRCCClientProfile,
  useUpdateIRCCProfile,
  useDBQuestionnaire,
} from '@/lib/queries/ircc'
import { IRCCQuestionnaire } from '@/components/ircc/ircc-questionnaire'
import { ProfileSummary } from '@/components/ircc/profile-summary'
import type { IRCCProfile } from '@/lib/types/ircc-profile'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// ═══════════════════════════════════════════════════════════════════════════════
// IRCC Intake Tab — Single Source of Truth
// ═══════════════════════════════════════════════════════════════════════════════
//
// All forms and questions come from ONE place:
//   Settings → Matter Type → ircc_stream_forms → ircc_form_fields
//
// The IRCC form templates (ircc_forms + ircc_form_fields) are reusable across
// matters. When a questionnaire is started, the form template's questions are
// displayed here. Client responses are stored in the matter's questionnaire
// session and the contact's immigration_data profile.
//
// No hardcoded form registries. No fallback form codes. If the matter type
// doesn't have forms configured, the user is directed to Settings.
// ═══════════════════════════════════════════════════════════════════════════════

interface IRCCIntakeTabProps {
  matterId: string
  contactId: string | null
  tenantId: string
  matterTypeId?: string | null
  /** When set, the questionnaire navigates to the section/field matching this profile_path */
  initialProfilePath?: string | null
  /** Called to open the Contacts sheet so a primary contact can be assigned */
  onOpenContactsSheet?: () => void
}

export function IRCCIntakeTab({ matterId, contactId, tenantId, matterTypeId, initialProfilePath, onOpenContactsSheet }: IRCCIntakeTabProps) {
  const { appUser } = useUser()
  const userId = appUser?.id ?? ''

  // Fetch existing session for this matter
  const { data: session, isLoading: sessionLoading } = useIRCCMatterSession(matterId)

  // Fetch existing client profile
  const { data: existingProfile, isLoading: profileLoading } = useIRCCClientProfile(contactId ?? '')

  // ── DB-Driven Questionnaire (single source of truth) ─────────────────────
  // Settings → Matter Type → ircc_stream_forms → ircc_form_fields → questions
  const { data: dbQuestionnaire, isLoading: dbQuestionnaireLoading } = useDBQuestionnaire(
    matterTypeId ?? null,
    existingProfile ?? {},
  )

  // Form codes come from the DB questionnaire (the configured forms)
  const formCodes = dbQuestionnaire?.form_codes ?? []
  const hasFormsConfigured = formCodes.length > 0 && dbQuestionnaire !== null

  // Mutations
  const createSession = useCreateIRCCSession()
  const completeSession = useCompleteIRCCSession()
  const updateProfile = useUpdateIRCCProfile()

  const [showQuestionnaire, setShowQuestionnaire] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null)

  // Auto-open questionnaire when navigating to a specific field.
  // If no session exists yet, also auto-start one so saves work immediately.
  useEffect(() => {
    if (!initialProfilePath || !contactId || isLoading) return
    if (!session && !createSession.isPending && hasFormsConfigured) {
      // No session yet — start one automatically so the user can save answers
      createSession.mutateAsync({
        tenant_id: tenantId,
        contact_id: contactId,
        matter_id: matterId,
        form_codes: [...formCodes],
        status: 'in_progress',
        created_by: userId,
      }).catch(() => {/* error handled by mutation onError */})
    }
    setShowQuestionnaire(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProfilePath])

  const isLoading = sessionLoading || profileLoading || dbQuestionnaireLoading
  const isCompleted = session?.status === 'completed'
  const isInProgress = session?.status === 'in_progress'

  // Start a new questionnaire session
  const handleStartSession = useCallback(async () => {
    if (!contactId) {
      toast.error('This matter needs a primary contact before starting the IRCC questionnaire.')
      return
    }

    try {
      await createSession.mutateAsync({
        tenant_id: tenantId,
        contact_id: contactId,
        matter_id: matterId,
        form_codes: [...formCodes],
        status: 'in_progress',
        created_by: userId,
      })
      setShowQuestionnaire(true)
    } catch {
      // Error handled by mutation onError
    }
  }, [contactId, tenantId, matterId, userId, createSession, formCodes])

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
      // Save the final profile data
      await updateProfile.mutateAsync({ contactId, profile, matterId, changedBy: userId })
      // Mark session as complete
      await completeSession.mutateAsync(session.id)
      setShowQuestionnaire(false)
    },
    [contactId, session, updateProfile, completeSession, matterId, userId],
  )

  // Restart questionnaire (new session)
  const handleRestart = useCallback(async () => {
    if (!contactId) return
    try {
      await createSession.mutateAsync({
        tenant_id: tenantId,
        contact_id: contactId,
        matter_id: matterId,
        form_codes: [...formCodes],
        status: 'in_progress',
        created_by: userId,
      })
      setShowQuestionnaire(true)
    } catch {
      // Error handled by mutation onError
    }
  }, [contactId, tenantId, matterId, userId, createSession, formCodes])

  // Generate and download a PDF for a specific form
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

        // Get filename from Content-Disposition header if available
        const disposition = response.headers.get('Content-Disposition')
        const filenameMatch = disposition?.match(/filename="?([^"]+)"?/)
        const filename = filenameMatch?.[1] ?? `${formCode}_form.pdf`

        // Create blob and trigger download
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
        <span className="ml-2 text-sm text-muted-foreground">Loading IRCC intake data...</span>
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
            Please assign a primary contact to this matter before starting the IRCC questionnaire.
          </p>
          {onOpenContactsSheet ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-4 gap-2"
              onClick={onOpenContactsSheet}
            >
              Open Contacts
            </Button>
          ) : (
            <p className="mt-2 text-xs text-amber-500">Go to the Contacts tab to add one.</p>
          )}
        </CardContent>
      </Card>
    )
  }

  // ── No Forms Configured ────────────────────────────────────────────────
  if (!hasFormsConfigured) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-4 rounded-full bg-amber-50 p-4">
            <Settings className="h-8 w-8 text-amber-500" />
          </div>
          <h3 className="text-lg font-semibold">No IRCC Forms Configured</h3>
          <p className="mt-1 max-w-lg text-sm text-muted-foreground">
            This matter type does not have any IRCC forms linked yet.
            Go to <strong>Settings &rarr; Matter Types</strong> and assign the relevant IRCC forms
            (e.g. IMM 5257, IMM 5707, IMM 5484) to this matter type.
          </p>
          <p className="mt-2 max-w-lg text-xs text-muted-foreground">
            Forms and questions are configured once per matter type and reused across all matters of the same type.
          </p>
          <Link href="/settings" className="mt-4">
            <Button variant="outline" className="gap-2">
              <Settings className="h-4 w-4" />
              Go to Settings
            </Button>
          </Link>
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
            <h3 className="text-base font-semibold">IRCC Client Questionnaire</h3>
            <p className="text-sm text-muted-foreground">
              Collecting information for {formCodes.join(' + ')}
            </p>
          </div>
          <Badge variant="secondary" className="gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            In Progress
          </Badge>
        </div>

        <IRCCQuestionnaire
          formCodes={[...formCodes]}
          existingProfile={existingProfile ?? {}}
          onSave={handleSave}
          onComplete={handleComplete}
          initialProfilePath={initialProfilePath}
          prebuiltQuestionnaire={dbQuestionnaire ?? undefined}
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
        {/* Header + Actions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                IRCC Questionnaire Completed
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
            {/* Download PDF cards */}
            <div className="grid gap-4 sm:grid-cols-2">
              {formCodes.map((code) => (
                <div
                  key={code}
                  className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{code}</p>
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
                      onClick={() => handleGeneratePdf(code)}
                      disabled={generatingPdf === code}
                    >
                      {generatingPdf === code ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      Download PDF
                    </Button>
                  </div>
                </div>
              ))}
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

        {/* Inline Profile Summary — always visible when completed */}
        {!showQuestionnaire && existingProfile && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Submitted Information</h3>
              <p className="text-xs text-muted-foreground">
                Click any section to expand/collapse
              </p>
            </div>
            <ProfileSummary
              formCodes={[...formCodes]}
              profile={existingProfile}
              prebuiltQuestionnaire={dbQuestionnaire ?? undefined}
            />
          </div>
        )}

        {/* Step-by-step editor for editing answers */}
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
              formCodes={[...formCodes]}
              existingProfile={existingProfile ?? {}}
              onSave={handleSave}
              onComplete={handleComplete}
              initialProfilePath={initialProfilePath}
              prebuiltQuestionnaire={dbQuestionnaire ?? undefined}
              matterId={matterId}
              canVerify
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
        <div className="mb-4 rounded-full bg-blue-50 p-4">
          <ClipboardList className="h-8 w-8 text-blue-500" />
        </div>
        <h3 className="text-lg font-semibold">IRCC Smart Intake</h3>
        <p className="mt-1 max-w-lg text-sm text-muted-foreground">
          Collect all required client information for the immigration application.
          Questions are pulled from {formCodes.join(' + ')} — no duplicates.
        </p>

        <div className="mt-6 space-y-3">
          <div className="flex flex-wrap items-center justify-center gap-2">
            {formCodes.map((code) => (
              <Badge key={code} variant="outline" className="gap-1.5">
                <FileText className="h-3 w-3" />
                {code}
              </Badge>
            ))}
          </div>

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
            Start Questionnaire
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
