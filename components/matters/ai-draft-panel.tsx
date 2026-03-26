'use client'

/**
 * Norva Intelligence  -  Command Centre HUD (Glass-Morphism)
 *
 * Three-section floating panel:
 *   Section 1  -  Audit Score: live Audit-Optimizer/IRCC readability meter
 *   Section 2  -  Fact-Anchors: scrolling list of verified Norva Ear quotes
 *   Section 3  -  Ghost-Draft: real-time AI drafting window
 *
 * Includes:
 *   - Critical Drift Overlay (1.5)  -  blocks "Approve Draft" when Drift Sentry
 *     detects unacknowledged Federal Court rulings in the draft's category
 *   - Success-Reverb suggestions (1.6)  -  Gold Standard Template prompts
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useTenant } from '@/lib/hooks/use-tenant'
import { useUser } from '@/lib/hooks/use-user'
import { useWikiPlaybooks } from '@/lib/queries/wiki'
import { useDriftBlockCheck, useAcknowledgeDrift } from '@/lib/queries/drift-blocker'
import { useGoldStandardSuggestions } from '@/lib/queries/success-reverb'
import { useNorvaEarSessions } from '@/lib/queries/norva-ear'
import { resolveForLawyerView, buildDualLanguageField, getFirmDisplayLanguage } from '@/lib/services/translation-bridge'
import { cn } from '@/lib/utils'
import {
  Sparkles,
  BookOpen,
  Copy,
  Download,
  AlertTriangle,
  CheckCircle,
  X,
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Scale,
  Gauge,
  Quote,
  PenTool,
  Trophy,
  ExternalLink,
  Radio,
  UserCheck,
} from 'lucide-react'
import { FactAnchorTooltip, buildFactAnchors } from '@/components/ai/fact-anchor-tooltip'

// ── Types ────────────────────────────────────────────────────────────────────

interface SourceAttribution {
  sentence: string
  field: string
  source: string
}

interface ContextSource {
  field: string
  value: string | null
  source: string
  table: string
  column: string
}

interface DraftResponse {
  content: string
  wordCount: number
  draftType: string
  sourceAttributions: SourceAttribution[]
  missingFields: string[]
  contextSources: ContextSource[]
}

interface AiDraftPanelProps {
  matterId: string
  matterTitle: string | null
  /** Mount context  -  'overview' renders compact summary, 'intelligence' renders full three-column deep-work view */
  mountContext?: 'overview' | 'intelligence' | 'modal'
}

// ── Norva Whisper Tooltip ────────────────────────────────────────────────────

function NorvaWhisper({ text }: { text: string }) {
  return (
    <div className="group relative inline-block">
      <div className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-white/20 text-white/80 text-[9px] font-bold cursor-help">
        ?
      </div>
      <div className="invisible group-hover:visible absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-lg bg-slate-900 p-3 text-xs text-slate-200 shadow-xl">
        <div className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider mb-1">Norva Whisper</div>
        {text}
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-slate-900" />
      </div>
    </div>
  )
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

  const gradeColour = grade === 'A' ? 'text-emerald-400' :
                      grade === 'B' ? 'text-blue-400' :
                      grade === 'C' ? 'text-amber-400' : 'text-red-400'

  const strokeColour = grade === 'A' ? 'stroke-emerald-400' :
                       grade === 'B' ? 'stroke-blue-400' :
                       grade === 'C' ? 'stroke-amber-400' : 'stroke-red-400'

  return (
    <div className="relative flex items-center justify-center">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
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
        <span className={cn('text-2xl font-bold', gradeColour)}>{grade}</span>
        <span className="text-[10px] text-white/60">{score}/100</span>
      </div>
    </div>
  )
}

// ── Fact Anchor Badge ────────────────────────────────────────────────────────

function FactAnchorBadge({ confidence }: { confidence: string }) {
  if (confidence === 'high') return <span className="rounded-full bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 text-[9px] font-semibold">HIGH</span>
  if (confidence === 'medium') return <span className="rounded-full bg-amber-500/20 text-amber-300 px-1.5 py-0.5 text-[9px] font-semibold">MED</span>
  return <span className="rounded-full bg-slate-500/20 text-slate-400 px-1.5 py-0.5 text-[9px] font-semibold">LOW</span>
}

// ── Fact Anchor Card (with Urdu-English source toggle) ───────────────────────

function FactAnchorCard({ anchor }: {
  anchor: {
    fact: string
    sourceQuote: string
    category: string
    confidence: string
    sessionTitle: string
    originalText?: string
    sourceLanguage?: string
  }
}) {
  const [showSource, setShowSource] = useState(false)
  const hasOriginal = !!anchor.originalText && anchor.sourceLanguage && anchor.sourceLanguage !== 'en'

  // Language label map
  const langLabels: Record<string, string> = {
    ur: 'اردو (Urdu)',
    pa: 'ਪੰਜਾਬੀ (Punjabi)',
    ar: 'العربية (Arabic)',
    hi: 'हिन्दी (Hindi)',
    fa: 'فارسی (Farsi)',
    zh: '中文 (Mandarin)',
    fr: 'Français (French)',
    es: 'Español (Spanish)',
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 hover:bg-white/[0.08] transition-colors">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold text-violet-300 uppercase tracking-wider">
          {anchor.category}
        </span>
        <div className="flex items-center gap-1.5">
          {hasOriginal && (
            <button
              type="button"
              onClick={() => setShowSource(!showSource)}
              className={cn(
                'flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium transition-colors',
                showSource
                  ? 'bg-violet-500/30 text-violet-200'
                  : 'bg-white/5 text-white/40 hover:text-white/60 hover:bg-white/10',
              )}
              title={showSource ? 'Hide original script' : 'View original script'}
            >
              <Eye className="h-2.5 w-2.5" />
              Source
            </button>
          )}
          <FactAnchorBadge confidence={anchor.confidence} />
        </div>
      </div>

      {/* English translation */}
      <p className="text-xs text-white/80 font-medium">{anchor.fact}</p>

      {/* Original script (Urdu Nastaliq / other)  -  revealed on toggle */}
      {showSource && anchor.originalText && (
        <div
          className="mt-2 rounded-lg border border-violet-500/20 bg-violet-500/5 p-2"
          style={{
            // Directive 36.1: CSS containment isolates Nastaliq paint from
            // AuraHeader compositor layer  -  eliminates stutter when header
            // cycles at 500ms while Draft panel renders Hindi/Punjabi/Urdu.
            contain: 'content',
          }}
        >
          <div className="flex items-center gap-1 mb-1">
            <span className="text-[9px] font-semibold text-violet-400">
              {langLabels[anchor.sourceLanguage ?? ''] ?? anchor.sourceLanguage}
            </span>
          </div>
          <p
            className="text-sm text-white/70 leading-relaxed break-words line-clamp-4"
            dir={['ur', 'ar', 'fa'].includes(anchor.sourceLanguage ?? '') ? 'rtl' : 'ltr'}
            style={{
              fontFamily: ['ur', 'ar', 'fa'].includes(anchor.sourceLanguage ?? '')
                ? '"Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", "Nafees Nastaleeq", serif'
                : 'inherit',
              lineHeight: ['ur', 'ar', 'fa'].includes(anchor.sourceLanguage ?? '') ? 2.0 : undefined,
            }}
          >
            {anchor.originalText}
          </p>
        </div>
      )}

      {anchor.sourceQuote && (
        <p className="text-[10px] text-white/40 mt-1 italic line-clamp-2">
          &ldquo;{anchor.sourceQuote}&rdquo;
        </p>
      )}
      <p className="text-[9px] text-white/25 mt-1">
        Source: {anchor.sessionTitle}
        {hasOriginal && !showSource && (
          <span className="ml-1 text-violet-400/50">
             -  translated from {langLabels[anchor.sourceLanguage ?? ''] ?? anchor.sourceLanguage}
          </span>
        )}
      </p>
    </div>
  )
}

// ── Critical Drift Overlay ───────────────────────────────────────────────────

function CriticalDriftOverlay({
  alerts,
  severity,
  onAcknowledge,
  isAcknowledging,
}: {
  alerts: Array<{
    id: string
    title: string
    court: string
    citation: string | null
    overlapKeywords: string[]
    decisionDate: string | null
  }>
  severity: 'critical' | 'high' | 'moderate'
  onAcknowledge: (alertId: string) => void
  isAcknowledging: boolean
}) {
  const borderColour = severity === 'critical' ? 'border-red-500/60' :
                       severity === 'high' ? 'border-orange-500/60' : 'border-amber-500/60'

  const bgColour = severity === 'critical' ? 'bg-red-950/80' :
                   severity === 'high' ? 'bg-orange-950/80' : 'bg-amber-950/80'

  const iconColour = severity === 'critical' ? 'text-red-400' :
                     severity === 'high' ? 'text-orange-400' : 'text-amber-400'

  return (
    <div className={cn(
      'absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl backdrop-blur-md border-2',
      borderColour, bgColour,
    )}>
      <ShieldAlert className={cn('h-12 w-12 mb-3', iconColour)} />
      <h3 className="text-sm font-bold text-white mb-1">
        Jurisdictional Drift Detected
      </h3>
      <p className="text-xs text-white/70 text-center max-w-xs mb-4">
        New case law developments require your review before this draft can be approved.
      </p>

      <div className="w-full max-w-sm space-y-2 px-4 max-h-48 overflow-y-auto">
        {alerts.map((alert) => (
          <div key={alert.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="text-xs font-semibold text-white line-clamp-2">{alert.title}</p>
            <p className="text-[10px] text-white/50 mt-0.5">
              {alert.court} {alert.citation ? `· ${alert.citation}` : ''}
              {alert.decisionDate ? ` · ${alert.decisionDate}` : ''}
            </p>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {alert.overlapKeywords.map((kw) => (
                <span key={kw} className="rounded bg-red-500/20 px-1.5 py-0.5 text-[9px] text-red-300">
                  {kw}
                </span>
              ))}
            </div>
            <button
              onClick={() => onAcknowledge(alert.id)}
              disabled={isAcknowledging}
              className="mt-2 w-full rounded-lg bg-white/10 px-3 py-1.5 text-[10px] font-semibold text-white hover:bg-white/20 transition-colors disabled:opacity-50"
            >
              {isAcknowledging ? 'Acknowledging...' : 'I have reviewed the new case law and adjusted my strategy'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function AiDraftPanel({ matterId, matterTitle, mountContext = 'modal' }: AiDraftPanelProps) {
  const { tenant } = useTenant()
  const { fullName: lawyerName } = useUser()
  const tenantId = tenant?.id ?? ''
  const firmLanguage = getFirmDisplayLanguage(null, null)

  // Playbook selection
  const { data: playbooks = [] } = useWikiPlaybooks({
    tenantId,
    status: 'published',
  })

  // Drift-Blocker (1.5)  -  poll every 30s when panel is open for live Policy-Pulse
  const { data: driftStatus, dataUpdatedAt: driftUpdatedAt } = useDriftBlockCheck(matterId)
  const acknowledgeMutation = useAcknowledgeDrift(matterId)

  // Success-Reverb (1.6)  -  Gold Standard suggestions
  const { data: goldSuggestions = [] } = useGoldStandardSuggestions(matterId)

  // Norva Ear sessions  -  Fact-to-Draft pipeline (Directive 21.0)
  const { data: earSessions = [] } = useNorvaEarSessions(matterId)

  // State
  const [isOpen, setIsOpen] = useState(mountContext !== 'modal')
  const [isGenerating, setIsGenerating] = useState(false)
  const [draft, setDraft] = useState<DraftResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedPlaybook, setSelectedPlaybook] = useState<string>('')
  const [draftType, setDraftType] = useState<string>('submission_letter')
  const [customInstructions, setCustomInstructions] = useState('')
  const [showSources, setShowSources] = useState(false)
  const [hoveredSource, setHoveredSource] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<'audit' | 'anchors' | 'draft'>('draft')
  const [auditScore, setAuditScore] = useState<{ score: number; grade: string } | null>(null)
  const [factAnchors, setFactAnchors] = useState<Array<{
    fact: string
    sourceQuote: string
    category: string
    confidence: string
    sessionTitle: string
    originalText?: string
    sourceLanguage?: string
  }>>([])
  const [showGoldSuggestion, setShowGoldSuggestion] = useState(true)

  // ── HITL Verification Gate (Directive 21.0 §2) ───────────────────────
  const [hitlChecks, setHitlChecks] = useState({
    factAnchorsVerified: false,
    driftSentryReviewed: false,
    professionalResponsibility: false,
  })
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false)
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null)
  const draftContentRef = useRef<HTMLDivElement>(null)

  const isHitlComplete = hitlChecks.factAnchorsVerified
    && hitlChecks.driftSentryReviewed
    && hitlChecks.professionalResponsibility
    && hasScrolledToBottom

  // Reset HITL checks when a new draft is generated
  const resetHitl = useCallback(() => {
    setHitlChecks({
      factAnchorsVerified: false,
      driftSentryReviewed: false,
      professionalResponsibility: false,
    })
    setHasScrolledToBottom(false)
    setVerifiedAt(null)
  }, [])

  // Scroll-gate: track when lawyer scrolls to bottom of draft content
  useEffect(() => {
    const el = draftContentRef.current
    if (!el || !draft) return
    function onScroll() {
      if (!el) return
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
      if (atBottom) setHasScrolledToBottom(true)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    // Check immediately in case content fits without scroll
    if (el.scrollHeight <= el.clientHeight + 40) setHasScrolledToBottom(true)
    return () => el.removeEventListener('scroll', onScroll)
  }, [draft])

  // Stamp "Verified by [Lawyer]" when HITL completes
  useEffect(() => {
    if (isHitlComplete && !verifiedAt) {
      setVerifiedAt(new Date().toISOString())
    }
  }, [isHitlComplete, verifiedAt])

  // ── Policy-Pulse: live drift flash during drafting (Directive 21.0 §3) ──
  const [policyPulseFlash, setPolicyPulseFlash] = useState(false)
  const prevDriftUpdated = useRef(driftUpdatedAt)

  useEffect(() => {
    // If drift data updated AND we have a draft open, flash the pulse
    if (driftUpdatedAt && driftUpdatedAt !== prevDriftUpdated.current && draft) {
      const hadAlertsBefore = prevDriftUpdated.current !== undefined
      prevDriftUpdated.current = driftUpdatedAt
      if (hadAlertsBefore && driftStatus?.blocked) {
        setPolicyPulseFlash(true)
        // Auto-clear flash after 5s
        const t = setTimeout(() => setPolicyPulseFlash(false), 5000)
        return () => clearTimeout(t)
      }
    }
  }, [driftUpdatedAt, draft, driftStatus?.blocked])

  // ── Fact-to-Draft pipeline: build anchors from Norva Ear sessions ────
  useEffect(() => {
    if (!earSessions || earSessions.length === 0) return
    const completedSessions = earSessions.filter(s => s.status === 'completed')
    if (completedSessions.length === 0) return

    // Build fact anchors from session data  -  fetch detailed transcripts
    let cancelled = false
    async function loadDetailedAnchors() {
      try {
        const res = await fetch(`/api/matters/${matterId}/norva-ear`)
        if (!res.ok) return
        const { sessions } = await res.json()
        if (cancelled) return

        const anchors: typeof factAnchors = []
        for (const s of sessions) {
          if (s.status !== 'completed') continue

          // Build Neural Mirror field for each session
          const dlField = buildDualLanguageField(
            s.transcript ?? null,
            s.transcript_english ?? null,
            s.source_language ?? null,
          )
          const resolved = resolveForLawyerView(dlField, firmLanguage)

          // If there are extracted facts, expand them as individual anchors
          if (s.extracted_facts && Array.isArray(s.extracted_facts)) {
            for (const fact of s.extracted_facts) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const f = fact as any
              // Per-fact anchoring: use fact-level translation + original, NOT session-level
              const factTranslation = f.translation ?? f.text ?? (typeof fact === 'string' ? fact : String(fact))
              const factOriginal = f.original ?? undefined
              const factLang = f.language ?? dlField.sourceLanguage
              const factCategory = f.category ?? 'consultation'
              const factConfidence = typeof f.confidence === 'number'
                ? (f.confidence >= 0.95 ? 'high' : f.confidence >= 0.8 ? 'medium' : 'low')
                : 'high'

              anchors.push({
                fact: factTranslation,
                sourceQuote: factOriginal ?? resolved.displayText?.slice(0, 200) ?? '',
                category: factCategory,
                confidence: factConfidence,
                sessionTitle: s.title ?? 'Untitled',
                // Neural Mirror: per-fact original in source script (not session transcript)
                originalText: factOriginal && factLang !== 'en' ? factOriginal : undefined,
                sourceLanguage: factLang !== 'en' ? factLang : undefined,
              })
            }
          } else {
            // Session-level anchor
            anchors.push({
              fact: `Session: ${s.title ?? 'Untitled'}`,
              sourceQuote: resolved.displayText?.slice(0, 200) ?? 'Facts extracted and ready for draft injection',
              category: 'consultation',
              confidence: 'high',
              sessionTitle: s.title ?? 'Untitled',
              originalText: resolved.isTranslated ? resolved.originalText : undefined,
              sourceLanguage: resolved.isTranslated ? dlField.sourceLanguage : undefined,
            })
          }
        }
        if (!cancelled) setFactAnchors(anchors)
      } catch {
        // Non-critical
      }
    }
    loadDetailedAnchors()
    return () => { cancelled = true }
  }, [earSessions, matterId, firmLanguage])

  // ── Generate Draft ─────────────────────────────────────────────────────

  const generateDraft = useCallback(async () => {
    setIsGenerating(true)
    setError(null)
    setDraft(null)
    setActiveSection('draft')
    resetHitl()

    try {
      const res = await fetch(`/api/matters/${matterId}/ai-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playbookId: selectedPlaybook || undefined,
          draftType,
          customInstructions: customInstructions.trim() || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate draft')
      }

      setDraft(data.draft)

      // Extract fact anchors from the response if available
      if (data.draft?.contextSources) {
        const earSources = data.draft.contextSources.filter(
          (s: ContextSource) => s.table === 'norva_ear_sessions'
        )
        if (earSources.length > 0) {
          setFactAnchors(earSources.map((s: ContextSource) => ({
            fact: s.field,
            sourceQuote: s.value ?? '',
            category: 'ear',
            confidence: 'high',
            sessionTitle: 'Norva Ear',
          })))
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setIsGenerating(false)
    }
  }, [matterId, selectedPlaybook, draftType, customInstructions, resetHitl])

  // ── Copy / Download ──────────────────────────────────────────────────

  const copyDraft = useCallback(async () => {
    if (!draft) return
    await navigator.clipboard.writeText(draft.content)
  }, [draft])

  const downloadDraft = useCallback(() => {
    if (!draft) return
    const blob = new Blob([draft.content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(matterTitle ?? 'draft').replace(/[^a-z0-9]/gi, '_')}_draft.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [draft, matterTitle])

  // ── Render highlighted content ─────────────────────────────────────────

  const renderHighlightedContent = useCallback((content: string, attributions: SourceAttribution[]) => {
    let highlighted = content.replace(
      /\[MISSING DATA\]/g,
      '<mark class="bg-amber-500/20 text-amber-300 px-1 rounded font-medium cursor-help" title="Data not found in client records">[MISSING DATA]</mark>'
    )

    if (showSources && attributions.length > 0) {
      for (const attr of attributions) {
        const escapedSentence = attr.sentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const regex = new RegExp(`(${escapedSentence.slice(0, 60)})`, 'g')
        highlighted = highlighted.replace(
          regex,
          `<span class="bg-blue-500/10 border-b border-blue-400/50 cursor-pointer" data-field="${attr.field}" data-source="${attr.source}">$1</span>`
        )
      }
    }

    return highlighted
  }, [showSources])

  // Is draft approval blocked by drift?
  const isDriftBlocked = driftStatus?.blocked === true && driftStatus.blockingAlerts.length > 0

  // ── Context-aware layout detection (Directive 21.0  -  Intelligence Mount) ──
  const isInline = mountContext === 'overview' || mountContext === 'intelligence'

  // ── Floating Button (collapsed state  -  only in modal mode) ──────────────

  if (!isOpen && !isInline) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          'fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-2xl transition-all hover:scale-105 active:scale-95',
          'bg-gradient-to-r from-violet-600/90 to-blue-600/90 backdrop-blur-xl',
          'border border-white/20',
          isDriftBlocked && 'ring-2 ring-red-500/60 ring-offset-2 ring-offset-transparent',
        )}
      >
        <Sparkles className="h-4 w-4" />
        Draft with Norva Intelligence
        {isDriftBlocked && (
          <span className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
        )}
      </button>
    )
  }

  // ── Overview mode: compact summary card ─────────────────────────────────
  if (mountContext === 'overview') {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/95 backdrop-blur-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-violet-900/50 to-blue-900/50 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-400" />
            <span className="text-xs font-bold text-white">Norva Intelligence</span>
          </div>
          {isDriftBlocked && (
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-red-300">
              <Radio className="h-3 w-3" />
              Drift Alert
            </span>
          )}
        </div>
        <div className="p-4 space-y-3">
          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-white/5 p-2.5 text-center">
              <p className="text-lg font-bold text-white">{factAnchors.length}</p>
              <p className="text-[9px] text-white/40">Fact Anchors</p>
            </div>
            <div className="rounded-lg bg-white/5 p-2.5 text-center">
              <p className="text-lg font-bold text-white">{auditScore?.score ?? ' - '}</p>
              <p className="text-[9px] text-white/40">Audit Score</p>
            </div>
            <div className={cn('rounded-lg p-2.5 text-center', isDriftBlocked ? 'bg-red-950/30' : 'bg-white/5')}>
              <p className={cn('text-lg font-bold', isDriftBlocked ? 'text-red-400' : 'text-emerald-400')}>
                {isDriftBlocked ? driftStatus!.blockingAlerts.length : '0'}
              </p>
              <p className="text-[9px] text-white/40">Drift Alerts</p>
            </div>
          </div>
          {/* Quick draft button */}
          <button
            onClick={() => setIsOpen(true)}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-violet-500/20 hover:shadow-xl transition-all"
          >
            <PenTool className="h-3.5 w-3.5" />
            Open Intelligence Panel
          </button>
        </div>
      </div>
    )
  }

  // ── Glass-Morphism HUD (Intelligence / Modal mode) ──────────────────────

  const hudContent = (
    <div className={cn(
      'w-full rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-white/10 bg-slate-900/95 backdrop-blur-xl',
      isInline ? 'max-h-[calc(100vh-8rem)]' : 'max-w-5xl max-h-[92vh] mx-4',
    )}>

        {/* ── Header  -  Glass bar ─────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-violet-900/50 to-blue-900/50 px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 text-white shadow-lg shadow-violet-500/30">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Norva Intelligence Command Centre
                <NorvaWhisper text="Three-section HUD: Audit Score shows IRCC readability, Fact-Anchors lists verified client quotes from Norva Ear, and Ghost-Draft is the real-time drafting window. All data is source-attributed." />
              </h2>
              <p className="text-[10px] text-white/40">{matterTitle ?? matterId}</p>
            </div>
          </div>

          {/* Section tabs */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveSection('audit')}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-semibold transition-all',
                activeSection === 'audit'
                  ? 'bg-white/15 text-white'
                  : 'text-white/50 hover:text-white/70 hover:bg-white/5',
              )}
            >
              <Gauge className="h-3 w-3" />
              Audit Score
            </button>
            <button
              onClick={() => setActiveSection('anchors')}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-semibold transition-all',
                activeSection === 'anchors'
                  ? 'bg-white/15 text-white'
                  : 'text-white/50 hover:text-white/70 hover:bg-white/5',
              )}
            >
              <Quote className="h-3 w-3" />
              Fact-Anchors
              {factAnchors.length > 0 && (
                <span className="rounded-full bg-emerald-500/20 text-emerald-300 px-1.5 text-[9px]">
                  {factAnchors.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveSection('draft')}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-semibold transition-all',
                activeSection === 'draft'
                  ? 'bg-white/15 text-white'
                  : 'text-white/50 hover:text-white/70 hover:bg-white/5',
              )}
            >
              <PenTool className="h-3 w-3" />
              Ghost-Draft
            </button>
          </div>

          <button
            onClick={() => setIsOpen(false)}
            className="rounded-lg p-2 text-white/40 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Success-Reverb Gold Standard Suggestion ────────────────── */}
        {goldSuggestions.length > 0 && showGoldSuggestion && (
          <div className="flex items-center gap-3 border-b border-white/5 bg-emerald-950/30 px-6 py-2">
            <Trophy className="h-4 w-4 text-amber-400 shrink-0" />
            <p className="text-[11px] text-emerald-200 flex-1">
              <span className="font-semibold text-amber-300">Winner&apos;s Circle: </span>
              {goldSuggestions[0].message}
            </p>
            <button
              onClick={() => setShowGoldSuggestion(false)}
              className="text-white/30 hover:text-white/60 transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* ── Content Area ───────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto relative">
          {/* Critical Drift Overlay (1.5) */}
          {isDriftBlocked && activeSection === 'draft' && draft && (
            <CriticalDriftOverlay
              alerts={driftStatus!.blockingAlerts}
              severity={driftStatus!.severity as 'critical' | 'high' | 'moderate'}
              onAcknowledge={(alertId) => acknowledgeMutation.mutate(alertId)}
              isAcknowledging={acknowledgeMutation.isPending}
            />
          )}

          {/* ── Section 1: Audit Score ──────────────────────────────── */}
          {activeSection === 'audit' && (
            <div className="p-6 space-y-5">
              <div className="flex items-start gap-6">
                {/* Gauge */}
                <div className="flex flex-col items-center gap-2">
                  <AuditScoreGauge
                    score={auditScore?.score ?? 0}
                    grade={auditScore?.grade ?? ' - '}
                  />
                  <p className="text-[10px] text-white/40 text-center">
                    IRCC Readability
                  </p>
                </div>

                {/* Status */}
                <div className="flex-1 space-y-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <h3 className="text-xs font-semibold text-white/80 mb-2 flex items-center gap-1.5">
                      <Gauge className="h-3.5 w-3.5 text-violet-400" />
                      Regulator-Mirror Audit Status
                    </h3>
                    {auditScore ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-white/60">Score</span>
                          <span className="text-sm font-bold text-white">{auditScore.score}/100</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all duration-1000',
                              auditScore.score >= 80 ? 'bg-emerald-400' :
                              auditScore.score >= 60 ? 'bg-blue-400' :
                              auditScore.score >= 40 ? 'bg-amber-400' : 'bg-red-400',
                            )}
                            style={{ width: `${auditScore.score}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-white/40">
                        Run an Audit-Optimizer scan on your submission document to see the live audit score here.
                        The score updates in real-time as you edit.
                      </p>
                    )}
                  </div>

                  {/* Drift Status Card */}
                  <div className={cn(
                    'rounded-xl border p-4',
                    isDriftBlocked
                      ? 'border-red-500/30 bg-red-950/20'
                      : 'border-white/10 bg-white/5',
                  )}>
                    <h3 className="text-xs font-semibold text-white/80 mb-2 flex items-center gap-1.5">
                      <ShieldAlert className={cn('h-3.5 w-3.5', isDriftBlocked ? 'text-red-400' : 'text-emerald-400')} />
                      Drift Sentry Status
                    </h3>
                    {isDriftBlocked ? (
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-red-300">
                          {driftStatus!.blockingAlerts.length} unacknowledged alert(s) detected.
                          Draft approval is blocked until reviewed.
                        </p>
                        {driftStatus!.blockingAlerts.map(a => (
                          <div key={a.id} className="text-[10px] text-red-200/60 flex items-center gap-1.5">
                            <ChevronRight className="h-3 w-3 shrink-0" />
                            {a.title}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-emerald-300/70">
                        No jurisdictional drifts detected. Draft approval is clear.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Section 2: Fact-Anchors ─────────────────────────────── */}
          {activeSection === 'anchors' && (
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-white/80 flex items-center gap-1.5">
                  <Quote className="h-3.5 w-3.5 text-violet-400" />
                  Verified Client Quotes (Norva Ear)
                  <NorvaWhisper text="These facts were extracted from real consultation recordings via Norva Ear. They are injected into the Ghost-Draft to ground the narrative in the client's authentic voice." />
                </h3>
                <span className="text-[10px] text-white/40">
                  {factAnchors.length} anchor(s) loaded
                </span>
              </div>

              {factAnchors.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
                  <Quote className="h-8 w-8 text-white/20 mx-auto mb-2" />
                  <p className="text-xs text-white/40">No Norva Ear sessions found for this matter.</p>
                  <p className="text-[10px] text-white/30 mt-1">
                    Record a consultation using the Norva Ear panel to populate fact anchors.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                  {factAnchors.map((anchor, i) => (
                    <FactAnchorCard key={i} anchor={anchor} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Section 3: Ghost-Draft ──────────────────────────────── */}
          {activeSection === 'draft' && (
            <>
              {!draft ? (
                /* ── Configuration Form ─────────────────────────────── */
                <div className="p-6 space-y-5">
                  {/* Matter context */}
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="h-4 w-4 text-white/30" />
                      <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Matter Context</span>
                    </div>
                    <p className="text-sm font-semibold text-white/90">{matterTitle}</p>
                    <p className="text-[10px] text-white/30">ID: {matterId}</p>
                  </div>

                  {/* Draft Type */}
                  <div>
                    <label className="block text-[10px] font-semibold text-white/60 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                      Document Type
                      <NorvaWhisper text="Choose what kind of document to draft. The AI adapts its tone and structure based on the document type." />
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {DRAFT_TYPES.map((dt) => (
                        <button
                          key={dt.value}
                          onClick={() => setDraftType(dt.value)}
                          className={cn(
                            'rounded-xl border px-3 py-2.5 text-xs font-medium transition-all text-left',
                            draftType === dt.value
                              ? 'border-violet-400/50 bg-violet-500/10 text-violet-300'
                              : 'border-white/10 bg-white/5 text-white/50 hover:border-white/20 hover:text-white/70',
                          )}
                        >
                          {dt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Playbook Selector */}
                  <div>
                    <label className="block text-[10px] font-semibold text-white/60 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                      <BookOpen className="h-3 w-3" />
                      Style Guide (Wiki Playbook)
                      <NorvaWhisper text="Select a playbook to use as the style guide. The AI will follow the firm's specific strategy and formatting from this playbook." />
                    </label>
                    <div className="relative">
                      <select
                        value={selectedPlaybook}
                        onChange={(e) => setSelectedPlaybook(e.target.value)}
                        className="w-full appearance-none rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 pr-10 text-sm text-white/80 focus:border-violet-400/50 focus:outline-none focus:ring-1 focus:ring-violet-400/20"
                      >
                        <option value="">No playbook (general style)</option>
                        {playbooks.map((pb) => (
                          <option key={pb.id} value={pb.id}>
                            {pb.title} {pb.tags.length > 0 ? `(${pb.tags.slice(0, 2).join(', ')})` : ''}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 pointer-events-none" />
                    </div>
                  </div>

                  {/* Custom Instructions */}
                  <div>
                    <label className="block text-[10px] font-semibold text-white/60 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                      Additional Instructions
                      <NorvaWhisper text="Add specific instructions for this draft. For example: 'Emphasise the applicant's work experience' or 'Include a section on humanitarian and compassionate grounds.'" />
                    </label>
                    <textarea
                      value={customInstructions}
                      onChange={(e) => setCustomInstructions(e.target.value)}
                      placeholder="e.g. 'Focus on the spousal relationship timeline' or 'Include H&C arguments'"
                      rows={3}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/80 placeholder:text-white/20 focus:border-violet-400/50 focus:outline-none focus:ring-1 focus:ring-violet-400/20 resize-none"
                    />
                  </div>

                  {/* Error */}
                  {error && (
                    <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-4 flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-red-300">Generation Failed</p>
                        <p className="text-xs text-red-400/70 mt-1">{error}</p>
                      </div>
                    </div>
                  )}

                  {/* Generate Button */}
                  <button
                    onClick={generateDraft}
                    disabled={isGenerating}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 hover:shadow-xl hover:shadow-violet-500/30 transition-all disabled:opacity-60 active:scale-[0.98]"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Norva Intelligence is drafting...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Generate Draft
                      </>
                    )}
                  </button>
                </div>
              ) : (
                /* ── Draft Result ─────────────────────────────────────── */
                <div className="p-6 space-y-4">
                  {/* ── Policy-Pulse Flash (Directive 21.0 §3) ────────── */}
                  {policyPulseFlash && (
                    <div className="flex items-center gap-3 rounded-xl border-2 border-red-500/60 bg-red-950/40 px-4 py-3 animate-pulse">
                      <Radio className="h-5 w-5 text-red-400 shrink-0" />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-red-300">Drift Alert  -  Policy Change Detected</p>
                        <p className="text-[10px] text-red-400/70">
                          A regulation has changed while you were drafting. Re-scan your text before finalising.
                        </p>
                      </div>
                      <button
                        onClick={() => { setPolicyPulseFlash(false); setActiveSection('audit') }}
                        className="rounded-lg bg-red-500/20 px-3 py-1.5 text-[10px] font-semibold text-red-200 hover:bg-red-500/30 transition-colors shrink-0"
                      >
                        Review
                      </button>
                    </div>
                  )}

                  {/* Stats Bar */}
                  <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-950/20 px-4 py-3">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5 text-xs text-emerald-300">
                        <CheckCircle className="h-4 w-4" />
                        <span className="font-semibold">{draft.wordCount} words</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-white/40">
                        <Eye className="h-3.5 w-3.5" />
                        {draft.sourceAttributions.length} attributed sources
                      </div>
                      {draft.missingFields.length > 0 && (
                        <div className="flex items-center gap-1.5 text-xs text-amber-400">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {draft.missingFields.length} missing fields
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowSources(!showSources)}
                        className={cn(
                          'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                          showSources
                            ? 'bg-blue-500/20 text-blue-300'
                            : 'bg-white/5 text-white/50 hover:bg-white/10',
                        )}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Sources
                      </button>
                      <button
                        onClick={copyDraft}
                        disabled={!isHitlComplete}
                        title={!isHitlComplete ? 'Complete the HITL Verification Gate below before copying' : 'Copy draft to clipboard'}
                        className={cn(
                          'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                          isHitlComplete
                            ? 'bg-white/5 text-white/50 hover:bg-white/10'
                            : 'bg-white/5 text-white/20 cursor-not-allowed',
                        )}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={downloadDraft}
                        disabled={!isHitlComplete}
                        title={!isHitlComplete ? 'Complete the HITL Verification Gate below before downloading' : 'Download draft as file'}
                        className={cn(
                          'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                          isHitlComplete
                            ? 'bg-white/5 text-white/50 hover:bg-white/10'
                            : 'bg-white/5 text-white/20 cursor-not-allowed',
                        )}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Missing Fields Warning */}
                  {draft.missingFields.length > 0 && (
                    <div className="rounded-xl border border-amber-500/20 bg-amber-950/20 p-3">
                      <p className="text-xs font-semibold text-amber-300 mb-1 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Missing Data Fields ({draft.missingFields.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {draft.missingFields.map((f) => (
                          <span key={f} className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400 font-mono">
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Draft Content  -  scroll-gated container for HITL (Directive 21.0 §2) */}
                  <div
                    ref={draftContentRef}
                    className="max-h-[50vh] overflow-y-auto rounded-xl border border-white/10"
                  >
                    {showSources && draft.sourceAttributions.length > 0 ? (
                      <div className="bg-white/[0.03] p-6">
                        <FactAnchorTooltip
                          content={draft.content}
                          attributions={buildFactAnchors(draft.sourceAttributions, draft.contextSources)}
                          className="prose prose-sm prose-invert max-w-none"
                        />
                      </div>
                    ) : (
                      <div
                        className="prose prose-sm prose-invert max-w-none bg-white/[0.03] p-6"
                        dangerouslySetInnerHTML={{
                          __html: renderHighlightedContent(
                            draft.content
                              .replace(/</g, '&lt;')
                              .replace(/>/g, '&gt;')
                              .replace(/\n\n/g, '</p><p>')
                              .replace(/\n/g, '<br/>')
                              .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                              .replace(/^### (.+)$/gm, '<h3>$1</h3>')
                              .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'),
                            draft.sourceAttributions,
                          ),
                        }}
                        onMouseOver={(e) => {
                          const target = e.target as HTMLElement
                          const field = target.getAttribute('data-field')
                          if (field) setHoveredSource(field)
                        }}
                        onMouseOut={() => setHoveredSource(null)}
                      />
                    )}

                    {/* Scroll indicator at bottom */}
                    {!hasScrolledToBottom && (
                      <div className="sticky bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-slate-900 to-transparent py-3 text-[10px] text-amber-400/80">
                        <ChevronDown className="h-3 w-3 animate-bounce" />
                        Scroll to continue
                      </div>
                    )}
                  </div>

                  {/* Source Attribution Panel (legacy list view) */}
                  {showSources && (
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <h4 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <Eye className="h-3.5 w-3.5" />
                        Source Attribution ({draft.sourceAttributions.length})
                      </h4>
                      <div className="space-y-1.5 max-h-48 overflow-auto">
                        {draft.sourceAttributions.map((attr, i) => (
                          <div
                            key={i}
                            className={cn(
                              'rounded-lg border bg-white/[0.03] p-2.5 text-xs transition-colors',
                              hoveredSource === attr.field ? 'border-blue-400/50 bg-blue-500/10' : 'border-white/10',
                            )}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-mono text-blue-300">
                                {attr.field}
                              </span>
                              <span className="text-white/20">&rarr;</span>
                              <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-white/50">
                                {attr.source}
                              </span>
                            </div>
                            <p className="text-white/30 line-clamp-1 italic">&ldquo;{attr.sentence}&rdquo;</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── HITL Verification Gate (Directive 21.0 §2) ─────── */}
                  <div className={cn(
                    'rounded-xl border p-4 space-y-3 transition-colors',
                    isHitlComplete
                      ? 'border-emerald-500/30 bg-emerald-950/20'
                      : 'border-amber-500/30 bg-amber-950/10',
                  )}>
                    <div className="flex items-center gap-2 mb-1">
                      {isHitlComplete ? (
                        <ShieldCheck className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Scale className="h-4 w-4 text-amber-400" />
                      )}
                      <h4 className="text-xs font-bold text-white/90 uppercase tracking-wider">
                        Human-in-the-Loop Verification
                      </h4>
                      <NorvaWhisper text="Before any AI-generated draft can be finalised, the supervising lawyer must scroll through the entire text and complete all verification steps. This ensures compliance with the 2026 Meaningful Human Control requirements and professional competence rules (e.g. Rule 3.1)." />
                    </div>
                    <p className="text-[10px] text-white/40 -mt-1 mb-2">
                      Scroll through the entire draft and complete all checks before finalisation.
                    </p>

                    {/* Scroll-gate indicator */}
                    <div className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-xs transition-colors',
                      hasScrolledToBottom
                        ? 'bg-emerald-500/10 text-emerald-300'
                        : 'bg-white/5 text-white/40',
                    )}>
                      {hasScrolledToBottom ? (
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-amber-400 shrink-0 animate-bounce" />
                      )}
                      <span>
                        {hasScrolledToBottom
                          ? 'Full draft reviewed  -  scroll gate passed'
                          : 'Scroll to the bottom of the draft to continue'}
                      </span>
                    </div>

                    {/* Check 1: Fact-Anchors */}
                    <label className={cn('flex items-start gap-3 cursor-pointer group', !hasScrolledToBottom && 'opacity-40 pointer-events-none')}>
                      <input
                        type="checkbox"
                        checked={hitlChecks.factAnchorsVerified}
                        onChange={(e) => setHitlChecks(prev => ({ ...prev, factAnchorsVerified: e.target.checked }))}
                        disabled={!hasScrolledToBottom}
                        className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500/30 focus:ring-offset-0 accent-emerald-500"
                      />
                      <span className={cn(
                        'text-xs leading-relaxed transition-colors',
                        hitlChecks.factAnchorsVerified ? 'text-emerald-300' : 'text-white/60 group-hover:text-white/80',
                      )}>
                        I have verified all Fact-Anchors against the Norva Ear transcript.
                      </span>
                    </label>

                    {/* Check 2: Drift Sentry */}
                    <label className={cn('flex items-start gap-3 cursor-pointer group', !hasScrolledToBottom && 'opacity-40 pointer-events-none')}>
                      <input
                        type="checkbox"
                        checked={hitlChecks.driftSentryReviewed}
                        onChange={(e) => setHitlChecks(prev => ({ ...prev, driftSentryReviewed: e.target.checked }))}
                        disabled={!hasScrolledToBottom}
                        className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500/30 focus:ring-offset-0 accent-emerald-500"
                      />
                      <span className={cn(
                        'text-xs leading-relaxed transition-colors',
                        hitlChecks.driftSentryReviewed ? 'text-emerald-300' : 'text-white/60 group-hover:text-white/80',
                      )}>
                        I have cross-referenced the Drift Sentry alerts with the final draft.
                      </span>
                    </label>

                    {/* Check 3: Professional Responsibility */}
                    <label className={cn('flex items-start gap-3 cursor-pointer group', !hasScrolledToBottom && 'opacity-40 pointer-events-none')}>
                      <input
                        type="checkbox"
                        checked={hitlChecks.professionalResponsibility}
                        onChange={(e) => setHitlChecks(prev => ({ ...prev, professionalResponsibility: e.target.checked }))}
                        disabled={!hasScrolledToBottom}
                        className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500/30 focus:ring-offset-0 accent-emerald-500"
                      />
                      <span className={cn(
                        'text-xs leading-relaxed transition-colors',
                        hitlChecks.professionalResponsibility ? 'text-emerald-300' : 'text-white/60 group-hover:text-white/80',
                      )}>
                        I take professional responsibility for this submission (Professional Conduct Rule Compliance).
                      </span>
                    </label>

                    {/* Verified by [Lawyer Name] stamp */}
                    {isHitlComplete && (
                      <div className="flex items-center gap-2 pt-2 border-t border-emerald-500/20">
                        <UserCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                        <div>
                          <span className="text-[11px] text-emerald-300 font-semibold">
                            Verified by {lawyerName || 'Supervising Lawyer'}
                          </span>
                          <span className="text-[10px] text-emerald-400/60 ml-2">
                            {verifiedAt ? new Date(verifiedAt).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Regenerate / Finalise */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setDraft(null)}
                      className="flex-1 rounded-xl border border-violet-400/30 px-4 py-2.5 text-sm font-medium text-violet-300 hover:bg-violet-500/10 transition-colors"
                    >
                      Adjust Settings
                    </button>
                    <button
                      onClick={generateDraft}
                      disabled={isGenerating}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 hover:shadow-xl transition-all disabled:opacity-60"
                    >
                      {isGenerating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      Regenerate
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    )

  // Wrap in modal overlay for modal mode, return inline for intelligence mode
  if (isInline) return hudContent

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      {hudContent}
    </div>
  )
}
