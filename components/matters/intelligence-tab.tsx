'use client'

/**
 * Norva Intelligence  -  Deep-Work Tab (Directive 13.1 + 17.1 + 17.2)
 *
 * Full-width three-column layout mounted as a dedicated ZoneD tab.
 *
 * Left Column:   Audit-Mirror score gauge + Drift-Sentry alert status
 * Center Column: Ghost-Writer text editor (generate + edit AI drafts)
 * Right Column:  Fact-Anchor sidebar (source quotes from Norva Ear sessions)
 *
 * Polyglot Extensions (Directive 17.0):
 *   17.1  -  Fact-Anchor sidebar shows original-language script for non-English
 *          sessions (Urdu, Mandarin, Arabic, etc.) with hover "Legal Mirror"
 *          English translation tooltips.
 *   17.2  -  Ghost-Writer editor respects dir="rtl" for the 4 RTL languages
 *          in the Global 15 (Arabic, Urdu, Farsi, Hebrew). Detects client
 *          language from Norva Ear sessions and adapts layout automatically.
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  Gauge,
  ShieldAlert,
  ShieldCheck,
  PenTool,
  Quote,
  Loader2,
  Copy,
  Download,
  CheckCircle,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  ExternalLink,
  Languages,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { NorvaWhisper } from '@/components/ui/norva-whisper'
import { useDriftBlockCheck, useAcknowledgeDrift } from '@/lib/queries/drift-blocker'
import { useCaseLawAlerts, useScanForDrifts } from '@/lib/queries/drift-sentry'
import { useRunAuditScan } from '@/lib/queries/audit-optimizer'
import type { AuditScanResponse } from '@/lib/queries/audit-optimizer'
import { FactAnchorTooltip, buildFactAnchors } from '@/components/ai/fact-anchor-tooltip'
import { isNorvaEarRTL, NORVA_EAR_LANGUAGES } from '@/lib/i18n/config'

// ── Types ────────────────────────────────────────────────────────────────────

interface IntelligenceTabPanelProps {
  matterId: string
  tenantId: string
}

interface DraftResponse {
  content: string
  wordCount: number
  draftType: string
  sourceAttributions: Array<{
    sentence: string
    field: string
    source: string
  }>
  missingFields: string[]
  contextSources: Array<{
    field: string
    value: string | null
    source: string
    table: string
    column: string
  }>
}

interface FactAnchor {
  fact: string
  sourceQuote: string
  /** Original-language snippet (non-English sessions)  -  Directive 17.1 */
  originalScript?: string
  /** ISO 639-1 source language code (e.g., 'ur', 'zh', 'ar') */
  sourceLanguage?: string
  category: string
  confidence: 'high' | 'medium' | 'low'
  sessionTitle: string
}

// ── Draft Type Options ───────────────────────────────────────────────────────

const DRAFT_TYPES = [
  { value: 'submission_letter', label: 'Submission Letter' },
  { value: 'cover_letter', label: 'Cover Letter' },
  { value: 'response_letter', label: 'Response to IRCC' },
  { value: 'statutory_declaration', label: 'Statutory Declaration' },
  { value: 'legal_memo', label: 'Internal Memo' },
] as const

// ── Audit Score Gauge ────────────────────────────────────────────────────────

function AuditScoreGauge({ score, grade }: { score: number; grade: string }) {
  const circumference = 2 * Math.PI * 40
  const offset = circumference - (score / 100) * circumference

  const gradeColour = grade === 'A' ? 'text-emerald-500' :
                      grade === 'B' ? 'text-blue-500' :
                      grade === 'C' ? 'text-amber-500' : 'text-red-500'

  const strokeColour = grade === 'A' ? 'stroke-emerald-500' :
                       grade === 'B' ? 'stroke-blue-500' :
                       grade === 'C' ? 'stroke-amber-500' : 'stroke-red-500'

  return (
    <div className="relative flex items-center justify-center">
      <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="none" className="stroke-muted" strokeWidth="8" />
        <circle
          cx="50" cy="50" r="40" fill="none"
          className={strokeColour}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('text-3xl font-bold', gradeColour)}>{grade}</span>
        <span className="text-[10px] text-muted-foreground">{score}/100</span>
      </div>
    </div>
  )
}

// ── Fact Anchor Badge ────────────────────────────────────────────────────────

function ConfidenceBadge({ level }: { level: string }) {
  if (level === 'high') return <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-emerald-500/30 text-emerald-400 dark:text-emerald-400">HIGH</Badge>
  if (level === 'medium') return <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-amber-500/30 text-amber-400 dark:text-amber-400">MED</Badge>
  return <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-muted-foreground text-muted-foreground">LOW</Badge>
}

// ── Main Component ───────────────────────────────────────────────────────────

export function IntelligenceTabPanel({ matterId, tenantId }: IntelligenceTabPanelProps) {
  // ── Drift-Sentry & Drift-Blocker ─────────────────────────────────────────
  const { data: driftStatus } = useDriftBlockCheck(matterId)
  const { data: caseLawAlerts = [] } = useCaseLawAlerts()
  const acknowledgeMutation = useAcknowledgeDrift(matterId)
  const scanMutation = useScanForDrifts()

  // ── Audit-Optimizer ───────────────────────────────────────────────────────
  const auditMutation = useRunAuditScan()
  const [auditResult, setAuditResult] = useState<AuditScanResponse | null>(null)

  // ── Ghost-Writer ──────────────────────────────────────────────────────────
  const [isGenerating, setIsGenerating] = useState(false)
  const [draft, setDraft] = useState<DraftResponse | null>(null)
  const [draftType, setDraftType] = useState<string>('submission_letter')
  const [customInstructions, setCustomInstructions] = useState('')
  const [draftError, setDraftError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // ── Fact Anchors (from Norva Ear) ─────────────────────────────────────────
  const [factAnchors, setFactAnchors] = useState<FactAnchor[]>([])

  // ── Directive 17.2: Client language for RTL-aware Ghost-Writer ──────────
  const [clientLanguage, setClientLanguage] = useState<string>('en')

  // ── HITL Verification Gate ────────────────────────────────────────────────
  const [hitlChecks, setHitlChecks] = useState({
    factAnchorsVerified: false,
    driftSentryReviewed: false,
    professionalResponsibility: false,
  })
  const isHitlComplete = hitlChecks.factAnchorsVerified &&
    hitlChecks.driftSentryReviewed &&
    hitlChecks.professionalResponsibility

  const resetHitl = useCallback(() => {
    setHitlChecks({
      factAnchorsVerified: false,
      driftSentryReviewed: false,
      professionalResponsibility: false,
    })
  }, [])

  // ── Load fact anchors from Norva Ear ──────────────────────────────────────
  useEffect(() => {
    if (!matterId) return
    let cancelled = false
    async function loadAnchors() {
      try {
        const res = await fetch(`/api/matters/${matterId}/norva-ear`)
        if (!res.ok) return
        const { sessions } = await res.json()
        if (cancelled) return

        const completedSessions = (sessions ?? []).filter(
          (s: { status: string }) => s.status === 'completed'
        )
        if (completedSessions.length > 0) {
          setFactAnchors(completedSessions.map((s: {
            id: string
            title: string | null
            source_language?: string
            transcript?: string
            transcript_english?: string
          }) => ({
            fact: `Session: ${s.title ?? 'Untitled'}`,
            sourceQuote: s.transcript_english || 'Facts extracted and ready for draft injection',
            originalScript: s.source_language && s.source_language !== 'en' ? s.transcript ?? undefined : undefined,
            sourceLanguage: s.source_language ?? undefined,
            category: 'consultation',
            confidence: 'high' as const,
            sessionTitle: s.title ?? 'Untitled',
          })))
        }
      } catch {
        // Non-critical  -  fact anchors are optional
      }
    }
    loadAnchors()
    return () => { cancelled = true }
  }, [matterId])

  // ── Directive 17.2: Detect client language for RTL awareness ────────────
  useEffect(() => {
    if (!matterId || !tenantId) return
    let cancelled = false
    async function detectClientLang() {
      try {
        // Check if any Norva Ear session for this matter was in a non-English language
        const res = await fetch(`/api/matters/${matterId}/norva-ear`)
        if (!res.ok) return
        const { sessions } = await res.json()
        if (cancelled) return
        const nonEnglish = (sessions ?? []).find(
          (s: { source_language?: string }) => s.source_language && s.source_language !== 'en'
        )
        if (nonEnglish?.source_language) {
          setClientLanguage(nonEnglish.source_language)
        }
      } catch {
        // Non-critical
      }
    }
    detectClientLang()
    return () => { cancelled = true }
  }, [matterId, tenantId])

  /** Whether the Ghost-Writer editor should use RTL layout */
  const isEditorRTL = useMemo(() => isNorvaEarRTL(clientLanguage), [clientLanguage])

  /** Display label for the detected client language */
  const clientLanguageLabel = useMemo(() => {
    const lang = NORVA_EAR_LANGUAGES.find(l => l.code === clientLanguage)
    return lang?.label ?? clientLanguage
  }, [clientLanguage])

  // ── Generate Draft ──────────────────────────────────────────────────────
  const generateDraft = useCallback(async () => {
    setIsGenerating(true)
    setDraftError(null)
    setDraft(null)
    resetHitl()

    try {
      const res = await fetch(`/api/matters/${matterId}/ai-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftType,
          customInstructions: customInstructions.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate draft')

      setDraft(data.draft)

      // Extract fact anchors from context sources
      if (data.draft?.contextSources) {
        const earSources = data.draft.contextSources.filter(
          (s: { table: string }) => s.table === 'norva_ear_sessions'
        )
        if (earSources.length > 0) {
          setFactAnchors(prev => [
            ...prev,
            ...earSources.map((s: { field: string; value: string | null; source: string }) => ({
              fact: s.field,
              sourceQuote: s.value ?? '',
              category: 'consultation',
              confidence: 'high' as const,
              sessionTitle: s.source,
            })),
          ])
        }
      }

      // Auto-run audit on generated content
      if (data.draft?.content) {
        const auditRes = await auditMutation.mutateAsync({
          matterId,
          documentText: data.draft.content,
          caseType: draftType,
        })
        setAuditResult(auditRes)
      }
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsGenerating(false)
    }
  }, [matterId, draftType, customInstructions, resetHitl, auditMutation])

  // ── Copy to clipboard ───────────────────────────────────────────────────
  const handleCopy = useCallback(() => {
    if (!draft?.content) return
    navigator.clipboard.writeText(draft.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [draft])

  // ── Drift status helpers ──────────────────────────────────────────────
  const isBlocked = driftStatus?.blocked ?? false
  const blockingAlerts = driftStatus?.blockingAlerts ?? []

  return (
    <div className="flex h-full overflow-hidden">
      {/* ════════════════════════════════════════════════════════════════════
          LEFT COLUMN  -  Audit-Mirror + Drift-Sentry
          ════════════════════════════════════════════════════════════════════ */}
      <div className="w-72 flex-none border-r overflow-y-auto p-4 space-y-4">
        {/* Audit-Mirror Score */}
        <Card>
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
              <Gauge className="h-3.5 w-3.5 text-indigo-500" />
              Audit-Mirror
              <NorvaWhisper title="Audit-Mirror" side="right">
                Live readability and compliance score from the Norva Audit-Optimizer.
                Grades: A (excellent) → D (needs work). Auto-scans each draft.
              </NorvaWhisper>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {auditResult ? (
              <div className="space-y-3">
                <div className="flex justify-center">
                  <AuditScoreGauge
                    score={auditResult.readabilityScore}
                    grade={auditResult.grade}
                  />
                </div>

                {/* Structure issues */}
                {auditResult.structureIssues.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Issues</p>
                    {auditResult.structureIssues.slice(0, 4).map((issue, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-[11px]">
                        {issue.severity === 'critical' ? (
                          <AlertTriangle className="h-3 w-3 text-red-500 mt-0.5 flex-none" />
                        ) : (
                          <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 flex-none" />
                        )}
                        <span className="text-muted-foreground leading-tight">{issue.description}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Recommendations */}
                {auditResult.recommendations.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Recommendations</p>
                    {auditResult.recommendations.slice(0, 3).map((rec, i) => (
                      <p key={i} className="text-[11px] text-muted-foreground leading-tight">
                        {rec.message}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center py-6 text-center">
                <Gauge className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-[11px] text-muted-foreground">
                  Generate a draft to see the live audit score.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Drift-Sentry Status */}
        <Card>
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
              {isBlocked ? (
                <ShieldAlert className="h-3.5 w-3.5 text-red-500" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              )}
              Drift-Sentry
              <NorvaWhisper title="Drift-Sentry" side="right">
                Monitors recent Federal Court rulings. If unacknowledged case law
                conflicts with your draft category, approval is blocked until reviewed.
              </NorvaWhisper>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {isBlocked ? (
              <div className="space-y-2">
                <Badge variant="destructive" className="text-[10px]">
                  {blockingAlerts.length} Blocking Alert{blockingAlerts.length !== 1 ? 's' : ''}
                </Badge>
                {blockingAlerts.map((alert) => (
                  <div key={alert.id} className="rounded-lg border border-red-500/20 dark:border-red-900 p-2.5 space-y-1.5">
                    <p className="text-[11px] font-medium leading-tight line-clamp-2">
                      {alert.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {alert.court} {alert.citation ? `· ${alert.citation}` : ''}
                    </p>
                    {alert.overlapKeywords && alert.overlapKeywords.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {alert.overlapKeywords.map((kw: string) => (
                          <span key={kw} className="rounded bg-red-950/40 dark:bg-red-950 px-1.5 py-0.5 text-[9px] text-red-400 dark:text-red-400">
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-6 text-[10px]"
                      onClick={() => acknowledgeMutation.mutate(alert.id)}
                      disabled={acknowledgeMutation.isPending}
                    >
                      {acknowledgeMutation.isPending ? 'Acknowledging...' : 'I have reviewed this'}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center py-4 text-center space-y-2">
                <ShieldCheck className="h-6 w-6 text-emerald-500" />
                <p className="text-[11px] text-muted-foreground">
                  No blocking case law detected.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] gap-1"
                  onClick={() => scanMutation.mutate({})}
                  disabled={scanMutation.isPending}
                >
                  {scanMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  Scan Now
                </Button>
              </div>
            )}

            {/* Recent case law alerts (non-blocking) */}
            {caseLawAlerts.length > 0 && !isBlocked && (
              <div className="mt-3 pt-3 border-t space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Recent Alerts ({caseLawAlerts.length})
                </p>
                {caseLawAlerts.slice(0, 3).map((alert) => (
                  <div key={alert.id} className="flex items-start gap-1.5 text-[11px]">
                    <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 flex-none" />
                    <span className="text-muted-foreground leading-tight line-clamp-2">
                      {alert.title}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          CENTER COLUMN  -  Ghost-Writer Editor
          ════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex-none border-b px-4 py-2.5 flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <PenTool className="h-4 w-4 text-violet-500" />
            <span className="text-xs font-semibold">Ghost-Writer</span>
            <NorvaWhisper title="Ghost-Writer" side="bottom">
              AI-powered drafting engine. Generates legal documents using matter context,
              Norva Ear transcripts, and playbook templates. Every fact is source-attributed.
            </NorvaWhisper>
          </div>

          {/* Directive 17.2: RTL language indicator */}
          {isEditorRTL && (
            <Badge variant="outline" className="text-[9px] h-5 px-2 gap-1 border-violet-300 text-violet-700 dark:text-violet-400">
              <Languages className="h-3 w-3" />
              RTL · {clientLanguageLabel}
            </Badge>
          )}

          <div className="flex-1" />

          {/* Draft type selector */}
          <select
            value={draftType}
            onChange={(e) => setDraftType(e.target.value)}
            className="h-7 rounded-md border bg-background px-2 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {DRAFT_TYPES.map((dt) => (
              <option key={dt.value} value={dt.value}>{dt.label}</option>
            ))}
          </select>

          <Button
            size="sm"
            className="h-7 text-[11px] gap-1"
            onClick={generateDraft}
            disabled={isGenerating || isBlocked}
          >
            {isGenerating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            {isGenerating ? 'Drafting...' : 'Generate'}
          </Button>
        </div>

        {/* Custom instructions */}
        <div className="flex-none border-b px-4 py-2">
          <textarea
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            dir={isEditorRTL ? 'rtl' : 'ltr'}
            placeholder="Optional: add specific instructions for this draft (e.g., 'emphasise spousal ties', 'address procedural fairness')..."
            className={cn(
              'w-full resize-none rounded-md border bg-muted/30 px-3 py-2 text-[11px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring',
              isEditorRTL && 'text-right'
            )}
            rows={2}
          />
        </div>

        {/* Draft content area */}
        <div className="flex-1 overflow-y-auto p-4">
          {isGenerating && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 className="h-8 w-8 text-violet-500 animate-spin" />
              <p className="text-sm text-muted-foreground">Ghost-Writer is drafting...</p>
              <p className="text-[11px] text-muted-foreground/60">
                Gathering matter context, Norva Ear facts, and playbook templates.
              </p>
            </div>
          )}

          {draftError && (
            <div className="rounded-lg border border-red-500/20 dark:border-red-900 bg-red-950/30 dark:bg-red-950/30 p-4">
              <div className="flex items-center gap-2 text-red-400 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" />
                <p className="text-sm font-medium">Draft generation failed</p>
              </div>
              <p className="mt-1 text-xs text-red-600 dark:text-red-400/80">{draftError}</p>
            </div>
          )}

          {!isGenerating && !draft && !draftError && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <PenTool className="h-12 w-12 text-muted-foreground/20" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Norva Intelligence Workspace
                </p>
                <p className="text-[11px] text-muted-foreground/60 mt-1 max-w-sm">
                  Select a draft type and click Generate. The Ghost-Writer will pull context
                  from the matter, Norva Ear sessions, and your firm&apos;s playbooks.
                </p>
              </div>
            </div>
          )}

          {draft && (
            <div className="space-y-4">
              {/* Draft header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    {DRAFT_TYPES.find(d => d.value === draft.draftType)?.label ?? draft.draftType}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {draft.wordCount} words
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy}>
                    {copied ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Missing/Expired fields warning  -  scroll target for Compliance Alert Badge */}
              {draft.missingFields.length > 0 && (
                <div data-section="compliance-expiry" className="rounded-lg border border-amber-500/20 dark:border-amber-900 bg-amber-950/30 dark:bg-amber-950/30 p-3">
                  <p className="text-[11px] font-medium text-amber-400 dark:text-amber-400">
                    Missing fields ({draft.missingFields.length})
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {draft.missingFields.map((f) => (
                      <Badge key={f} variant="outline" className="text-[9px] border-amber-500/30 text-amber-400 dark:text-amber-400">
                        {f}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Draft body  -  Directive 8.1: Fact-Anchor Tooltips + 17.2: RTL-Aware */}
              <div dir={isEditorRTL ? 'rtl' : 'ltr'}>
                {draft.sourceAttributions.length > 0 ? (
                  <FactAnchorTooltip
                    content={draft.content}
                    attributions={buildFactAnchors(draft.sourceAttributions, draft.contextSources)}
                    className={cn(
                      'prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed',
                      isEditorRTL && 'text-right'
                    )}
                  />
                ) : (
                  <div className={cn(
                    'prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed whitespace-pre-wrap',
                    isEditorRTL && 'text-right'
                  )}>
                    {draft.content}
                  </div>
                )}
              </div>

              {/* HITL Verification Gate */}
              <div className="border-t pt-4 space-y-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  Lawyer Verification Gate
                  <NorvaWhisper title="HITL Verification" side="right">
                    Human-in-the-loop checkpoint. All three boxes must be checked
                    before this draft can be approved for client delivery.
                  </NorvaWhisper>
                </p>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hitlChecks.factAnchorsVerified}
                    onChange={(e) => setHitlChecks(prev => ({ ...prev, factAnchorsVerified: e.target.checked }))}
                    className="mt-0.5 rounded border-muted-foreground"
                  />
                  <span className="text-[11px] text-muted-foreground leading-tight">
                    I have verified the Fact-Anchors and source attributions are accurate.
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hitlChecks.driftSentryReviewed}
                    onChange={(e) => setHitlChecks(prev => ({ ...prev, driftSentryReviewed: e.target.checked }))}
                    className="mt-0.5 rounded border-muted-foreground"
                  />
                  <span className="text-[11px] text-muted-foreground leading-tight">
                    I have reviewed the Drift-Sentry status and no unacknowledged rulings affect this draft.
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hitlChecks.professionalResponsibility}
                    onChange={(e) => setHitlChecks(prev => ({ ...prev, professionalResponsibility: e.target.checked }))}
                    className="mt-0.5 rounded border-muted-foreground"
                  />
                  <span className="text-[11px] text-muted-foreground leading-tight">
                    I confirm this draft meets my professional responsibility standards and is ready for delivery.
                  </span>
                </label>

                <Button
                  className="w-full h-8 text-xs gap-1.5"
                  disabled={!isHitlComplete || isBlocked}
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  Approve Draft
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          RIGHT COLUMN  -  Fact-Anchor Sidebar
          ════════════════════════════════════════════════════════════════════ */}
      <div className="w-72 flex-none border-l overflow-y-auto p-4 space-y-4">
        <div className="flex items-center gap-1.5">
          <Quote className="h-3.5 w-3.5 text-teal-500" />
          <span className="text-xs font-semibold">Fact-Anchors</span>
          <NorvaWhisper title="Fact-Anchor Sidebar" side="left">
            Source quotes extracted from Norva Ear consultation recordings.
            Every fact in the Ghost-Writer draft is anchored to a verifiable source.
          </NorvaWhisper>
        </div>

        {factAnchors.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center">
            <Quote className="h-8 w-8 text-muted-foreground/20 mb-2" />
            <p className="text-[11px] text-muted-foreground">
              No Norva Ear sessions found for this matter.
            </p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              Record a consultation to populate fact anchors.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {factAnchors.map((anchor, i) => {
              const anchorIsRTL = anchor.sourceLanguage ? isNorvaEarRTL(anchor.sourceLanguage) : false
              const langInfo = anchor.sourceLanguage
                ? NORVA_EAR_LANGUAGES.find(l => l.code === anchor.sourceLanguage)
                : null

              return (
                <Card key={i} className="overflow-hidden">
                  <CardContent className="p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium text-teal-700 dark:text-teal-400">
                        {anchor.sessionTitle}
                      </span>
                      <div className="flex items-center gap-1">
                        {langInfo && anchor.sourceLanguage !== 'en' && (
                          <Badge variant="outline" className="text-[8px] h-3.5 px-1 gap-0.5 border-teal-300 text-teal-600 dark:text-teal-400">
                            <Languages className="h-2.5 w-2.5" />
                            {langInfo.label.split(' / ')[0]}
                          </Badge>
                        )}
                        <ConfidenceBadge level={anchor.confidence} />
                      </div>
                    </div>
                    <p className="text-[11px] font-medium leading-tight">{anchor.fact}</p>

                    {/* Directive 17.1: Original-script snippet with hover translation */}
                    {anchor.originalScript && anchor.sourceLanguage !== 'en' ? (
                      <div className="group/polyglot relative">
                        {/* Original script (always visible) */}
                        <div
                          dir={anchorIsRTL ? 'rtl' : 'ltr'}
                          className={cn(
                            'rounded-md border border-teal-200 dark:border-teal-900 bg-teal-50/50 dark:bg-teal-950/20 p-2',
                            anchorIsRTL && 'text-right'
                          )}
                        >
                          <p className="text-[9px] text-teal-600 dark:text-teal-400 font-medium mb-0.5 flex items-center gap-1">
                            <Languages className="h-2.5 w-2.5" />
                            Original ({langInfo?.label.split(' / ')[1] ?? anchor.sourceLanguage})
                          </p>
                          <p className={cn(
                            'text-[11px] leading-snug',
                            anchorIsRTL ? 'font-normal' : 'italic'
                          )}>
                            {anchor.originalScript.length > 120
                              ? `${anchor.originalScript.slice(0, 120)}…`
                              : anchor.originalScript}
                          </p>
                        </div>

                        {/* English "Legal Mirror" translation (on hover) */}
                        <div className="invisible group-hover/polyglot:visible absolute z-40 left-0 right-0 top-full mt-1 rounded-md border bg-card shadow-lg p-2 animate-in fade-in-0 zoom-in-95 duration-150">
                          <p className="text-[9px] text-primary font-semibold uppercase tracking-wider mb-0.5">
                            Legal Mirror  -  English Translation
                          </p>
                          <p className="text-[10px] text-muted-foreground leading-snug italic">
                            &ldquo;{anchor.sourceQuote}&rdquo;
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-muted-foreground leading-tight italic">
                        &ldquo;{anchor.sourceQuote}&rdquo;
                      </p>
                    )}

                    <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                      {anchor.category}
                    </Badge>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {/* Context sources from last draft */}
        {draft?.contextSources && draft.contextSources.length > 0 && (
          <div className="border-t pt-3 space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Context Sources ({draft.contextSources.length})
            </p>
            {draft.contextSources.map((src, i) => (
              <div key={i} className="text-[10px] text-muted-foreground flex items-start gap-1.5">
                <ExternalLink className="h-3 w-3 mt-0.5 flex-none" />
                <span className="leading-tight">
                  <span className="font-medium">{src.field}</span>
                  <span className="text-muted-foreground/60">  -  {src.source}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
