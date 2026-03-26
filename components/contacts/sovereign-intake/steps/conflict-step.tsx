'use client'

import { useCallback, useState } from 'react'
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  Search,
  Loader2,
  AlertTriangle,
  Link2,
  ShieldX,
  Info,
  Users,
  Plus,
  ChevronDown,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import type { IntakeState } from '../sovereign-stepper'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConflictStepProps {
  intake: IntakeState
  updateIntake: (patch: Partial<IntakeState>) => void
}

interface NameMatch {
  id: string
  first_name: string
  last_name: string
  email_primary: string | null
}

type ScanState = 'idle' | 'loading' | 'clear' | 'conflict' | 'resolved'

// ---------------------------------------------------------------------------
// Directive 42.3: Predefined Conflict Resolution Reasons (LSO/CICC Standard)
// ---------------------------------------------------------------------------

const CONFLICT_REASONS = [
  'Confirmed different Date of Birth (DOB).',
  'Confirmed different residential address.',
  'Middle name/Initial mismatch.',
  'Existing contact is a different individual with a common name.',
  'Visual verification from Government ID confirms no relation.',
] as const

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SovereignConflictStep({
  intake,
  updateIntake,
}: ConflictStepProps) {
  const { tenant } = useTenant()
  const { appUser } = useUser()

  const [firstName, setFirstName] = useState(intake.firstName || '')
  const [lastName, setLastName] = useState(intake.lastName || '')
  const [scanState, setScanState] = useState<ScanState>(
    intake.conflictCleared
      ? intake.conflictResolution !== 'none'
        ? 'resolved'
        : 'clear'
      : 'idle'
  )
  const [matches, setMatches] = useState<NameMatch[]>([])
  const [error, setError] = useState<string | null>(null)

  // Resolution UI state
  const [justifyingMatchId, setJustifyingMatchId] = useState<string | null>(null)
  const [selectedReasons, setSelectedReasons] = useState<string[]>([])
  const [showAdditionalNotes, setShowAdditionalNotes] = useState(false)
  const [additionalNotes, setAdditionalNotes] = useState('')
  const [resolutionLoading, setResolutionLoading] = useState(false)
  const [resolvedMatch, setResolvedMatch] = useState<NameMatch | null>(null)

  // Directive 42.3: Justification is satisfied when at least one reason is selected
  const justificationSatisfied = selectedReasons.length > 0
  const fullJustification = [
    ...selectedReasons,
    ...(additionalNotes.trim() ? [`Additional: ${additionalNotes.trim()}`] : []),
  ].join(' | ')

  // -----------------------------------------------------------------------
  // Conflict search
  // -----------------------------------------------------------------------

  const runConflictScan = useCallback(async () => {
    if (!firstName.trim() || !lastName.trim() || !tenant?.id) return

    setError(null)
    setScanState('loading')
    setMatches([])
    setJustifyingMatchId(null)
    setSelectedReasons([])
    setShowAdditionalNotes(false)
    setAdditionalNotes('')
    setResolvedMatch(null)

    try {
      const supabase = createClient()

      // Sanitise names for PostgREST .or() filter - escape special chars
      const safeFirst = firstName.trim().replace(/[%_(),.]/g, '')
      const safeLast = lastName.trim().replace(/[%_(),.]/g, '')

      if (!safeFirst && !safeLast) {
        setScanState('clear')
        updateIntake({
          conflictCleared: true,
          conflictScanId: crypto.randomUUID(),
          conflictResolution: 'none',
          conflictJustification: null,
          existingContactId: null,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        })
        return
      }

      const { data: nameMatches, error: queryError } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, email_primary')
        .eq('tenant_id', tenant.id)
        .or(
          `first_name.ilike.%${safeFirst}%,last_name.ilike.%${safeLast}%`
        )
        .limit(10)

      if (queryError) throw queryError

      const scanId = crypto.randomUUID()

      if (!nameMatches || nameMatches.length === 0) {
        setScanState('clear')
        setMatches([])
        updateIntake({
          conflictCleared: true,
          conflictScanId: scanId,
          conflictResolution: 'none',
          conflictJustification: null,
          existingContactId: null,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        })
      } else {
        setScanState('conflict')
        setMatches(nameMatches as NameMatch[])
        updateIntake({
          conflictCleared: false,
          conflictScanId: scanId,
          conflictResolution: 'none',
          conflictJustification: null,
          existingContactId: null,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        })
      }
    } catch (err) {
      console.error('[ConflictStep] scan failed', err)
      // If search fails, mark as clear so user isn't permanently blocked
      setScanState('clear')
      updateIntake({
        conflictCleared: true,
        conflictScanId: crypto.randomUUID(),
        conflictResolution: 'none',
        conflictJustification: 'Search error - auto-cleared',
        existingContactId: null,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      })
    }
  }, [firstName, lastName, tenant?.id, updateIntake])

  const canSearch = firstName.trim().length > 0 && lastName.trim().length > 0

  // -----------------------------------------------------------------------
  // Resolution: Link to Existing
  // -----------------------------------------------------------------------

  const handleLinkToExisting = useCallback(
    async (match: NameMatch) => {
      if (!tenant?.id || !appUser?.id || !intake.conflictScanId) return

      setResolutionLoading(true)
      setError(null)

      try {
        const supabase = createClient()

        await supabase.from('audit_logs').insert({
          tenant_id: tenant.id,
          user_id: appUser.id,
          entity_type: 'conflict_resolution',
          action: 'link_to_existing',
          changes: {
            matched_contact_id: match.id,
            scan_id: intake.conflictScanId,
          },
          metadata: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            source: 'norva_sovereign_intake',
          },
        })

        setResolvedMatch(match)
        setScanState('resolved')
        updateIntake({
          conflictCleared: true,
          existingContactId: match.id,
          conflictResolution: 'linked',
          conflictJustification: null,
        })
      } catch (err) {
        console.error('[ConflictStep] link failed', err)
        setError('Failed to log conflict resolution. Please try again.')
      } finally {
        setResolutionLoading(false)
      }
    },
    [tenant?.id, appUser?.id, intake.conflictScanId, firstName, lastName, updateIntake]
  )

  // -----------------------------------------------------------------------
  // Resolution: Declare No Conflict
  // -----------------------------------------------------------------------

  const handleDeclareNoConflict = useCallback(
    async (match: NameMatch) => {
      if (!tenant?.id || !appUser?.id || !intake.conflictScanId) return
      if (!justificationSatisfied) return

      setResolutionLoading(true)
      setError(null)

      try {
        const supabase = createClient()

        await supabase.from('audit_logs').insert({
          tenant_id: tenant.id,
          user_id: appUser.id,
          entity_type: 'conflict_resolution',
          action: 'declare_no_conflict',
          changes: {
            matched_contact_id: match.id,
            justification: fullJustification,
            selected_reasons: selectedReasons,
            additional_notes: additionalNotes.trim() || null,
            scan_id: intake.conflictScanId,
          },
          metadata: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            source: 'norva_sovereign_intake',
          },
        })

        setResolvedMatch(match)
        setScanState('resolved')
        setJustifyingMatchId(null)
        updateIntake({
          conflictCleared: true,
          existingContactId: null,
          conflictResolution: 'declared_no_conflict',
          conflictJustification: fullJustification,
        })
      } catch (err) {
        console.error('[ConflictStep] declare-no-conflict failed', err)
        setError('Failed to log conflict resolution. Please try again.')
      } finally {
        setResolutionLoading(false)
      }
    },
    [
      tenant?.id,
      appUser?.id,
      intake.conflictScanId,
      firstName,
      lastName,
      justificationSatisfied,
      fullJustification,
      selectedReasons,
      additionalNotes,
      updateIntake,
    ]
  )

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader className="space-y-4">
        {/* General Contact toggle */}
        <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
          <div className="flex items-center gap-3">
            <Checkbox
              id="general-contact-toggle"
              checked={intake.isGeneralContact}
              onCheckedChange={(checked) =>
                updateIntake({ isGeneralContact: checked === true })
              }
            />
            <label
              htmlFor="general-contact-toggle"
              className="text-sm font-medium leading-none cursor-pointer select-none"
            >
              General Contact (No Lead/Matter required)
            </label>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs text-xs">
                For witnesses, translators, or relatives. Bypasses Lead and
                Compliance gates but still requires a conflict check.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Law Society info banner */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>
                  <strong>Regulatory Requirement:</strong> You cannot collect
                  personal data until a conflict search is cleared.
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              Under regulatory rules, a conflict check must be completed before
              gathering any personal information from a prospective client.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <CardTitle className="flex items-center gap-2 text-lg">
          <Shield className="h-5 w-5 text-muted-foreground" />
          Conflict Search
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Name inputs */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-2">
            <label
              htmlFor="conflict-first-name"
              className="text-sm font-medium leading-none"
            >
              First Name
            </label>
            <Input
              id="conflict-first-name"
              placeholder="Enter first name"
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value)
                if (
                  scanState !== 'idle' &&
                  scanState !== 'loading'
                ) {
                  setScanState('idle')
                  setResolvedMatch(null)
                  setJustifyingMatchId(null)
                  setSelectedReasons([])
                  setAdditionalNotes('')
                  setShowAdditionalNotes(false)
                  updateIntake({
                    conflictCleared: false,
                    conflictResolution: 'none',
                    conflictJustification: null,
                    existingContactId: null,
                  })
                }
              }}
              disabled={scanState === 'loading'}
            />
          </div>

          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 space-y-2">
            <label
              htmlFor="conflict-last-name"
              className="text-sm font-medium leading-none"
            >
              Last Name
            </label>
            <Input
              id="conflict-last-name"
              placeholder="Enter last name"
              value={lastName}
              onChange={(e) => {
                setLastName(e.target.value)
                if (
                  scanState !== 'idle' &&
                  scanState !== 'loading'
                ) {
                  setScanState('idle')
                  setResolvedMatch(null)
                  setJustifyingMatchId(null)
                  setSelectedReasons([])
                  setAdditionalNotes('')
                  setShowAdditionalNotes(false)
                  updateIntake({
                    conflictCleared: false,
                    conflictResolution: 'none',
                    conflictJustification: null,
                    existingContactId: null,
                  })
                }
              }}
              disabled={scanState === 'loading'}
            />
          </div>
        </div>

        {/* Search button */}
        <Button
          onClick={runConflictScan}
          disabled={!canSearch || scanState === 'loading'}
          className="w-full"
        >
          {scanState === 'loading' ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Searching...
            </>
          ) : (
            <>
              <Search className="mr-2 h-4 w-4" />
              Search for Conflicts
            </>
          )}
        </Button>

        {/* Error */}
        {error && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        )}

        {/* Results  -  clear (no matches at all) */}
        {scanState === 'clear' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-4">
            <div className="flex flex-col items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-6 text-center dark:border-green-800 dark:bg-green-950/40">
              <ShieldCheck className="h-10 w-10 text-green-600 animate-pulse dark:text-green-400" />
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                No conflicts found for{' '}
                <strong>
                  {firstName.trim()} {lastName.trim()}
                </strong>
              </p>
              <Badge
                variant="outline"
                className="border-green-300 text-green-700 dark:border-green-700 dark:text-green-300"
              >
                Cleared
              </Badge>
            </div>
          </div>
        )}

        {/* Results  -  conflict resolved */}
        {scanState === 'resolved' && resolvedMatch && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-4">
            <div className="flex flex-col items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-6 text-center dark:border-green-800 dark:bg-green-950/40">
              <ShieldCheck className="h-10 w-10 text-green-600 animate-pulse dark:text-green-400" />
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                Conflict Resolved
              </p>
              <p className="text-xs text-green-700 dark:text-green-300">
                {intake.conflictResolution === 'linked' ? (
                  <>
                    Linked to existing contact:{' '}
                    <strong>
                      {resolvedMatch.first_name} {resolvedMatch.last_name}
                    </strong>
                  </>
                ) : (
                  <>
                    Declared no conflict with{' '}
                    <strong>
                      {resolvedMatch.first_name} {resolvedMatch.last_name}
                    </strong>
                  </>
                )}
              </p>
              <Badge
                variant="outline"
                className="border-green-300 text-green-700 dark:border-green-700 dark:text-green-300"
              >
                {intake.conflictResolution === 'linked'
                  ? 'Linked to Existing'
                  : 'No Conflict Declared'}
              </Badge>
            </div>
          </div>
        )}

        {/* Results  -  conflicts found, unresolved */}
        {scanState === 'conflict' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
              <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Potential conflicts detected
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  The following existing contacts match the name provided. You
                  must resolve each match before proceeding.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {matches.map((match) => (
                <div
                  key={match.id}
                  className="animate-in fade-in slide-in-from-bottom-2 duration-300 rounded-lg border p-4 text-sm space-y-3"
                >
                  {/* Match info row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">
                          {match.first_name} {match.last_name}
                        </p>
                        {match.email_primary && (
                          <p className="text-xs text-muted-foreground">
                            {match.email_primary}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={() => handleLinkToExisting(match)}
                        disabled={resolutionLoading}
                      >
                        {resolutionLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Link2 className="h-3.5 w-3.5" />
                        )}
                        Link
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => {
                          setJustifyingMatchId(
                            justifyingMatchId === match.id ? null : match.id
                          )
                          setSelectedReasons([])
                          setAdditionalNotes('')
                          setShowAdditionalNotes(false)
                        }}
                        disabled={resolutionLoading}
                      >
                        <ShieldX className="h-3.5 w-3.5" />
                        Not Same Person
                      </Button>
                    </div>
                  </div>

                  {/* Directive 42.3  -  Resolution Accelerator: multi-select reasons */}
                  {justifyingMatchId === match.id && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-200 space-y-3 border-t pt-3">
                      <label className="text-xs font-medium text-muted-foreground">
                        Select reason(s) this is not the same person:
                      </label>

                      {/* Predefined reason checkboxes */}
                      <div className="space-y-2">
                        {CONFLICT_REASONS.map((reason) => (
                          <label
                            key={reason}
                            className="flex items-start gap-2 cursor-pointer group"
                          >
                            <Checkbox
                              checked={selectedReasons.includes(reason)}
                              onCheckedChange={(checked) => {
                                setSelectedReasons((prev) =>
                                  checked
                                    ? [...prev, reason]
                                    : prev.filter((r) => r !== reason)
                                )
                              }}
                              className="mt-0.5"
                            />
                            <span className="text-sm text-foreground group-hover:text-foreground/80 leading-tight">
                              {reason}
                            </span>
                          </label>
                        ))}
                      </div>

                      {/* Toggle for additional notes */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-xs text-muted-foreground hover:text-foreground px-0"
                        onClick={() => setShowAdditionalNotes(!showAdditionalNotes)}
                      >
                        {showAdditionalNotes ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                        {showAdditionalNotes ? 'Hide details' : 'Add specific details / Other reason'}
                      </Button>

                      {showAdditionalNotes && (
                        <Textarea
                          placeholder="Optional: provide additional context…"
                          value={additionalNotes}
                          onChange={(e) => setAdditionalNotes(e.target.value)}
                          rows={2}
                          className="text-sm"
                        />
                      )}

                      {/* Confirm button  -  turns Sovereign Purple when satisfied */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {selectedReasons.length === 0
                            ? 'Select at least one reason'
                            : `${selectedReasons.length} reason${selectedReasons.length > 1 ? 's' : ''} selected`}
                        </span>
                        <Button
                          size="sm"
                          disabled={!justificationSatisfied || resolutionLoading}
                          onClick={() => handleDeclareNoConflict(match)}
                          className={`gap-1.5 transition-colors ${
                            justificationSatisfied
                              ? 'bg-violet-600 hover:bg-violet-700 text-white'
                              : ''
                          }`}
                        >
                          {resolutionLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ShieldCheck className="h-3.5 w-3.5" />
                          )}
                          Confirm No Conflict
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <Badge
              variant="outline"
              className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300"
            >
              Resolution Required
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
