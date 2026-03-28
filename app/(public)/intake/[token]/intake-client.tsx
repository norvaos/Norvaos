'use client'

/**
 * IntakeClient  -  Client-facing branded intake form.
 *
 * Renders the questionnaire in a premium, firm-branded layout.
 * Includes: save/retry with draft indicator, per-form progress,
 * and Supabase Realtime presence for "client is typing" sync.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import {
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  AlertCircle,
  RefreshCw,
  Shield,
  ScanSearch,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { LanguageSelector } from '@/components/i18n/LanguageSelector'
import { useLocale } from '@/lib/i18n/use-locale'
import { useScanPrefill } from '@/lib/hooks/use-scan-prefill'
import { QuestionnaireRenderer } from '@/components/ircc/workspace/questionnaire-renderer'

// ── Types ────────────────────────────────────────────────────────────────────

interface FormInstance {
  id: string
  form_id: string
  form_code: string
  form_name: string
  status: string
  is_active: boolean
  completion_state: {
    total_relevant: number
    total_filled: number
    completion_pct: number
  } | null
  blocker_count: number
}

interface Branding {
  firmName: string
  logoUrl: string
  primaryColor: string
  welcomeMessage: string
  instructions: string
  lawyerName: string
  lawyerEmail: string
}

interface IntakeClientProps {
  token: string
  matterId: string
  matterTitle: string
  matterNumber: string
  tenantId: string
  contactId: string
  branding: Branding
  formInstances: FormInstance[]
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// ── Component ────────────────────────────────────────────────────────────────

export function IntakeClient({
  token,
  matterId,
  matterTitle,
  tenantId,
  contactId,
  branding,
  formInstances: initialInstances,
}: IntakeClientProps) {
  const { dir, t } = useLocale({ audience: 'client' })
  const [instances, setInstances] = useState(initialInstances)

  // ── Scan-to-Autofill: load prefill data from scanned documents ────────
  const { prefill: scanPrefill, fieldCount: scanFieldCount } = useScanPrefill({
    matterId,
    tenantId,
    enabled: !!matterId,
  })
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [retryPayload, setRetryPayload] = useState<{
    instanceId: string
    updates: Record<string, unknown>
  } | null>(null)
  const presenceChannelRef = useRef<ReturnType<
    ReturnType<typeof createClient>['channel']
  > | null>(null)

  // ── Supabase Realtime Presence ──────────────────────────────────────────
  // Join the intake presence channel so staff can see "client is typing"

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(`intake:${matterId}`, {
      config: { presence: { key: contactId } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        // Client doesn't need to react to presence sync
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_type: 'client',
            contact_id: contactId,
            online_at: new Date().toISOString(),
            last_field: null,
          })
        }
      })

    presenceChannelRef.current = channel

    return () => {
      channel.unsubscribe()
    }
  }, [matterId, contactId])

  // ── Presence update on field edit ───────────────────────────────────────

  const broadcastFieldEdit = useCallback(
    (fieldPath: string) => {
      const channel = presenceChannelRef.current
      if (channel) {
        channel.track({
          user_type: 'client',
          contact_id: contactId,
          online_at: new Date().toISOString(),
          last_field: fieldPath,
          typing: true,
        })
      }
    },
    [contactId],
  )

  // ── Save handler with retry ────────────────────────────────────────────

  const saveAnswers = useCallback(
    async (instanceId: string, updates: Record<string, unknown>) => {
      setSaveStatus('saving')
      setRetryPayload(null)

      try {
        const res = await fetch(
          `/api/portal/${token}/intake-forms/${instanceId}/save`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates }),
          },
        )

        if (!res.ok) {
          throw new Error(`Save failed: ${res.status}`)
        }

        const result = await res.json()

        // Update local completion state
        setInstances((prev) =>
          prev.map((inst) =>
            inst.id === instanceId
              ? {
                  ...inst,
                  completion_state: result.completion_state ?? inst.completion_state,
                  status: result.status ?? inst.status,
                }
              : inst,
          ),
        )

        setSaveStatus('saved')
        setLastSavedAt(new Date().toLocaleTimeString())

        // Reset to idle after 3 seconds
        setTimeout(() => setSaveStatus('idle'), 3000)
      } catch {
        setSaveStatus('error')
        setRetryPayload({ instanceId, updates })
      }
    },
    [token],
  )

  // ── Retry handler ──────────────────────────────────────────────────────

  const handleRetry = useCallback(() => {
    if (retryPayload) {
      saveAnswers(retryPayload.instanceId, retryPayload.updates)
    }
  }, [retryPayload, saveAnswers])

  // ── Overall progress ───────────────────────────────────────────────────

  const totalFields = instances.reduce(
    (sum, inst) => sum + (inst.completion_state?.total_relevant ?? 0),
    0,
  )
  const filledFields = instances.reduce(
    (sum, inst) => sum + (inst.completion_state?.total_filled ?? 0),
    0,
  )
  const overallPct = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50" data-intake-portal dir={dir}>
      {/* ── Header with firm branding ──────────────────────────────────── */}
      <header
        className="border-b bg-white shadow-sm"
        style={{ borderBottomColor: branding.primaryColor }}
      >
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoUrl}
                alt={branding.firmName}
                className="h-10 w-auto object-contain"
              />
            ) : (
              <div
                className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-lg"
                style={{ backgroundColor: branding.primaryColor }}
              >
                {branding.firmName.charAt(0)}
              </div>
            )}
            <div>
              <h1 className="text-lg font-semibold text-slate-900">
                {branding.firmName}
              </h1>
              <p className="text-xs text-slate-500">{t('intake.secure_intake')}</p>
            </div>
          </div>

          {/* Language selector + Save status */}
          <div className="flex items-center gap-2">
            <LanguageSelector compact />
            {saveStatus === 'saving' && (
              <Badge variant="secondary" className="gap-1.5 text-xs">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('intake.saving')}
              </Badge>
            )}
            {saveStatus === 'saved' && (
              <Badge
                variant="outline"
                className="gap-1.5 text-xs border-emerald-500/30 text-emerald-400 bg-emerald-950/30"
              >
                <CheckCircle2 className="h-3 w-3" />
                {lastSavedAt ? t('intake.draft_saved_at').replace('{{time}}', lastSavedAt) : t('intake.draft_saved')}
              </Badge>
            )}
            {saveStatus === 'error' && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRetry}
                className="gap-1.5 text-xs"
              >
                <RefreshCw className="h-3 w-3" />
                {t('intake.retry_save')}
              </Button>
            )}
            <Badge variant="outline" className="gap-1 text-xs">
              <Shield className="h-3 w-3 text-green-600" />
              {t('intake.encrypted')}
            </Badge>
          </div>
        </div>
      </header>

      {/* ── Welcome / Instructions ──────────────────────────────────────── */}
      <div className="mx-auto max-w-3xl px-4 py-6">
        {branding.welcomeMessage && (
          <div className="mb-4 rounded-lg border border-blue-500/20 bg-blue-950/30 p-4">
            <p className="text-sm text-blue-400">{branding.welcomeMessage}</p>
          </div>
        )}

        {branding.instructions && (
          <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-600">{branding.instructions}</p>
          </div>
        )}

        {/* ── Language Selector (Polyglot Bridge) ──────────────────────────── */}
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
          <LanguageSelector />
        </div>

        {/* ── Overall progress ───────────────────────────────────────────── */}
        <div className="mb-6 rounded-lg border bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">
              {t('intake.overall_progress')}
            </span>
            <span className="text-sm text-slate-500">
              {t('intake.fields_completed').replace('{{filled}}', String(filledFields)).replace('{{total}}', String(totalFields)).replace('{{pct}}', String(overallPct))}
            </span>
          </div>
          <Progress value={overallPct} className="h-2" />
        </div>

        {/* ── Form accordion ────────────────────────────────────────────── */}
        <Accordion type="single" collapsible defaultValue={instances[0]?.id}>
          {instances.map((inst) => {
            const cs = inst.completion_state
            const pct = cs?.completion_pct ?? 0
            const filled = cs?.total_filled ?? 0
            const total = cs?.total_relevant ?? 0
            const isComplete = pct >= 100 && inst.blocker_count === 0

            return (
              <AccordionItem key={inst.id} value={inst.id} className="border rounded-lg mb-3 bg-white overflow-hidden">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-3 w-full">
                    <div className={cn(
                      'h-8 w-8 rounded-full flex items-center justify-center shrink-0',
                      isComplete ? 'bg-emerald-950/40 text-green-600' : 'bg-slate-100 text-slate-400',
                    )}>
                      {isComplete ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <FileText className="h-4 w-4" />
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-slate-900">
                        {inst.form_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {t('intake.fields_status').replace('{{filled}}', String(filled)).replace('{{total}}', String(total))} · {t('intake.pct_complete').replace('{{pct}}', String(Math.round(pct)))}
                      </p>
                    </div>
                    {inst.blocker_count > 0 && (
                      <Badge variant="destructive" className="text-xs gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {inst.blocker_count} {t('intake.required').toLowerCase()}
                      </Badge>
                    )}
                    {isComplete && (
                      <Badge
                        variant="outline"
                        className="text-xs border-emerald-500/30 text-emerald-400 bg-emerald-950/30"
                      >
                        {t('intake.ready')}
                      </Badge>
                    )}
                    {!isComplete && pct > 0 && (
                      <Badge variant="secondary" className="text-xs gap-1">
                        <Clock className="h-3 w-3" />
                        {t('intake.in_progress')}
                      </Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="border-t pt-3">
                    {/* Scan-to-Autofill banner */}
                    {scanFieldCount > 0 && (
                      <div className="mb-3 rounded-lg border border-emerald-500/20 bg-emerald-950/30 p-3 flex items-start gap-2">
                        <ScanSearch className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs font-medium text-emerald-400">
                            {t('intake.scan_autofill').replace('{{count}}', String(scanFieldCount))}
                          </p>
                          <p className="text-[10px] text-emerald-600 mt-0.5">
                            {t('intake.scan_review')}
                          </p>
                        </div>
                      </div>
                    )}

                    <QuestionnaireRenderer
                      instanceId={inst.id}
                      formId={inst.form_id}
                      matterId={matterId}
                      tenantId={tenantId}
                      mode="client"
                      onAnswerChange={(profilePath, value) => {
                        broadcastFieldEdit(profilePath)
                        // Debounced save via the intake portal endpoint
                        saveAnswers(inst.id, { [profilePath]: value })
                      }}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>

        {/* ── Lawyer contact ────────────────────────────────────────────── */}
        {branding.lawyerName && (
          <div className="mt-6 rounded-lg border bg-white p-4">
            <p className="text-xs text-slate-500 mb-1">{t('intake.your_lawyer')}</p>
            <p className="text-sm font-medium text-slate-900">
              {branding.lawyerName}
            </p>
            {branding.lawyerEmail && (
              <a
                href={`mailto:${branding.lawyerEmail}`}
                className="text-xs text-blue-600 hover:underline"
              >
                {branding.lawyerEmail}
              </a>
            )}
          </div>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t bg-white mt-12">
        <div className="mx-auto max-w-3xl px-4 py-4 text-center">
          <p className="text-xs text-slate-400">
            {t('intake.powered_by')}
          </p>
        </div>
      </footer>
    </div>
  )
}
