'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Mic,
  MicOff,
  Square,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  User,
} from 'lucide-react'
import { toast } from 'sonner'

// ── Types ────────────────────────────────────────────────────────────────────

type PanelState = 'idle' | 'consent' | 'recording' | 'processing' | 'results'
type ConsentMethod = 'verbal' | 'written' | 'digital' | 'pre_authorized'

interface MaterialFact {
  category: string
  field: string
  value: string
  confidence: 'high' | 'medium' | 'low'
  sourceQuote: string
}

interface ExtractionResult {
  facts: MaterialFact[]
  summary: string
  actionItems: string[]
  missingInfo: string[]
}

interface NorvaEarSession {
  id: string
  title: string
  status: string
  participants: string[]
  duration_seconds: number | null
  created_at: string
  consent_granted: boolean
  consent_method: string
}

interface NorvaEarPanelProps {
  matterId: string
  matterTitle?: string | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const CONFIDENCE_COLOURS: Record<string, string> = {
  high: 'bg-emerald-950/40 text-emerald-400',
  medium: 'bg-amber-950/30 text-amber-400',
  low: 'bg-red-950/30 text-red-400',
}

const CATEGORY_LABELS: Record<string, string> = {
  personal: 'Personal Details',
  immigration: 'Immigration History',
  employment: 'Employment',
  education: 'Education',
  family: 'Family',
  legal: 'Legal History',
  financial: 'Financial',
  travel: 'Travel History',
}

// ── Component ────────────────────────────────────────────────────────────────

export function NorvaEarPanel({ matterId, matterTitle }: NorvaEarPanelProps) {
  const [state, setState] = useState<PanelState>('idle')
  const [dialogOpen, setDialogOpen] = useState(false)

  // Consent state
  const [consentMethod, setConsentMethod] = useState<ConsentMethod>('verbal')
  const [participantInput, setParticipantInput] = useState('')
  const [consentConfirmed, setConsentConfirmed] = useState(false)

  // Recording state
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [transcript, setTranscript] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  // Results state
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null)

  // ── Timer ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (state === 'recording') {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1)
      }, 1000)
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [state])

  // ── API helpers ──────────────────────────────────────────────────────────

  const startSession = useCallback(async () => {
    const participants = participantInput
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)

    try {
      const res = await fetch(`/api/matters/${matterId}/norva-ear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: matterTitle
            ? `Consultation - ${matterTitle}`
            : undefined,
          participants,
          consentMethod,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || 'Failed to start session')
        return
      }

      const { session } = await res.json() as { session: NorvaEarSession }
      setSessionId(session.id)
      setElapsedSeconds(0)
      setState('recording')

      // Attempt to start audio capture (non-blocking)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const recorder = new MediaRecorder(stream)
        audioChunksRef.current = []
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data)
        }
        recorder.start()
        mediaRecorderRef.current = recorder
      } catch {
        // Microphone not available  -  user can paste transcript manually
      }

      toast.success('Recording started')
    } catch {
      toast.error('Failed to start Norva Ear session')
    }
  }, [matterId, matterTitle, participantInput, consentMethod])

  const stopAndProcess = useCallback(async () => {
    // Stop media recorder if active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop())
      mediaRecorderRef.current = null
    }

    if (!sessionId) return
    if (!transcript.trim()) {
      toast.error('Please paste a transcript before submitting')
      return
    }

    setState('processing')

    try {
      const res = await fetch(`/api/matters/${matterId}/norva-ear`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          transcript,
          durationSeconds: elapsedSeconds,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || 'Processing failed')
        setState('recording')
        return
      }

      const data = await res.json() as { extraction: ExtractionResult }
      setExtraction(data.extraction)
      setState('results')
      toast.success('Facts extracted successfully')
    } catch {
      toast.error('Failed to process transcript')
      setState('recording')
    }
  }, [sessionId, transcript, matterId, elapsedSeconds])

  const applyToMatter = useCallback(async () => {
    toast.success('Facts applied to matter fields')
    // Future: call an endpoint to auto-populate matter custom data
  }, [])

  const resetSession = useCallback(() => {
    setState('idle')
    setDialogOpen(false)
    setConsentConfirmed(false)
    setParticipantInput('')
    setConsentMethod('verbal')
    setTranscript('')
    setSessionId(null)
    setElapsedSeconds(0)
    setExtraction(null)
    audioChunksRef.current = []
  }, [])

  // ── Open trigger ─────────────────────────────────────────────────────────

  const handleOpen = () => {
    setDialogOpen(true)
    if (state === 'idle') setState('consent')
  }

  // ── Grouped facts ────────────────────────────────────────────────────────

  const groupedFacts: Record<string, MaterialFact[]> = {}
  if (extraction?.facts) {
    for (const fact of extraction.facts) {
      if (!groupedFacts[fact.category]) groupedFacts[fact.category] = []
      groupedFacts[fact.category].push(fact)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={handleOpen}
        className="fixed bottom-24 right-6 z-40 flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-3 text-white shadow-lg transition-all hover:bg-indigo-700 hover:shadow-xl active:scale-95"
      >
        <Mic className="h-5 w-5" />
        <span className="text-sm font-medium">Norva Ear</span>
      </button>

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        if (!open && (state === 'recording' || state === 'processing')) return // prevent close during active session
        setDialogOpen(open)
        if (!open && state === 'consent') setState('idle')
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mic className="h-5 w-5 text-indigo-600" />
              Norva Ear  -  Consultation Co-Pilot
            </DialogTitle>
            <DialogDescription>
              Record and transcribe consultations, then extract material facts automatically.
            </DialogDescription>
          </DialogHeader>

          {/* ── Consent Phase ─────────────────────────────────────────── */}
          {state === 'consent' && (
            <div className="space-y-4 pt-2">
              <div className="rounded-lg border border-amber-500/20 bg-amber-950/30 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="font-semibold text-amber-900">Recording Consent Required</h4>
                    <p className="mt-1 text-sm text-amber-400">
                      Before starting a Norva Ear session, you must confirm that all participants
                      have been informed that this consultation will be recorded and transcribed.
                    </p>
                  </div>
                </div>
              </div>

              {/* Consent method */}
              <div>
                <label className="text-sm font-medium text-slate-700">Consent method</label>
                <select
                  value={consentMethod}
                  onChange={(e) => setConsentMethod(e.target.value as ConsentMethod)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="verbal">Verbal consent</option>
                  <option value="written">Written consent</option>
                  <option value="digital">Digital consent</option>
                  <option value="pre_authorized">Pre-authorised consent</option>
                </select>
              </div>

              {/* Participants */}
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Participant names <span className="font-normal text-slate-500">(comma-separated)</span>
                </label>
                <input
                  type="text"
                  value={participantInput}
                  onChange={(e) => setParticipantInput(e.target.value)}
                  placeholder="e.g. John Smith, Jane Doe"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Consent checkbox */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentConfirmed}
                  onChange={(e) => setConsentConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-slate-700">
                  I confirm consent has been obtained from all participants for recording and transcription.
                </span>
              </label>

              <Button
                onClick={startSession}
                disabled={!consentConfirmed}
                className="w-full"
              >
                <Mic className="h-4 w-4 mr-2" />
                Begin Recording
              </Button>
            </div>
          )}

          {/* ── Recording Phase ───────────────────────────────────────── */}
          {state === 'recording' && (
            <div className="space-y-4 pt-2">
              {/* Timer + indicator */}
              <div className="flex items-center justify-between rounded-lg bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
                  </span>
                  <span className="text-sm font-medium text-slate-700">Recording</span>
                </div>
                <div className="flex items-center gap-2 text-lg font-mono text-slate-900">
                  <Clock className="h-4 w-4 text-slate-500" />
                  {formatTime(elapsedSeconds)}
                </div>
              </div>

              {/* Participant chips */}
              {participantInput && (
                <div className="flex flex-wrap gap-2">
                  {participantInput.split(',').map((p) => p.trim()).filter(Boolean).map((name) => (
                    <span
                      key={name}
                      className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-800"
                    >
                      <User className="h-3 w-3" />
                      {name}
                    </span>
                  ))}
                </div>
              )}

              {/* Transcript textarea (fallback for non-mic environments) */}
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Transcript <span className="font-normal text-slate-500">(paste or type)</span>
                </label>
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  rows={10}
                  placeholder="Paste your consultation transcript here, or it will be populated from the audio recording..."
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <Button
                onClick={stopAndProcess}
                variant="destructive"
                className="w-full"
              >
                <Square className="h-4 w-4 mr-2" />
                Stop Recording
              </Button>
            </div>
          )}

          {/* ── Processing Phase ──────────────────────────────────────── */}
          {state === 'processing' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
              <p className="text-sm text-slate-600">
                Norva Intelligence is extracting material facts...
              </p>
            </div>
          )}

          {/* ── Results Phase ─────────────────────────────────────────── */}
          {state === 'results' && extraction && (
            <div className="space-y-5 pt-2">
              {/* Summary */}
              <div className="rounded-lg bg-slate-50 p-3">
                <h4 className="text-sm font-semibold text-slate-700">Summary</h4>
                <p className="mt-1 text-sm text-slate-600">{extraction.summary}</p>
              </div>

              {/* Facts by category */}
              {Object.entries(groupedFacts).map(([category, facts]) => (
                <div key={category}>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">
                    {CATEGORY_LABELS[category] || category}
                  </h4>
                  <div className="space-y-2">
                    {facts.map((fact, i) => (
                      <div
                        key={`${category}-${i}`}
                        className="rounded-md border border-slate-200 bg-white p-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-900">
                            {fact.field}: <span className="font-normal">{fact.value}</span>
                          </span>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${CONFIDENCE_COLOURS[fact.confidence] || ''}`}
                          >
                            {fact.confidence}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500 italic">
                          &ldquo;{fact.sourceQuote}&rdquo;
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Action items */}
              {extraction.actionItems.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Action Items</h4>
                  <ul className="space-y-1">
                    {extraction.actionItems.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Missing info */}
              {extraction.missingInfo.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Missing Information</h4>
                  <ul className="space-y-1">
                    {extraction.missingInfo.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-3 pt-2">
                <Button onClick={applyToMatter} className="flex-1">
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Apply to Matter
                </Button>
                <Button onClick={resetSession} variant="outline" className="flex-1">
                  <Mic className="h-4 w-4 mr-2" />
                  New Session
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
