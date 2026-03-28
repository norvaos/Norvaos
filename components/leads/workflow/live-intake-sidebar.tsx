'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Mic,
  MicOff,
  Square,
  Pause,
  Play,
  Sparkles,
  Loader2,
  CheckCircle2,
  Brain,
  FileText,
  Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

// Web Speech API type declarations (not fully in TS DOM lib yet)
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition
    webkitSpeechRecognition: new () => SpeechRecognition
  }
  interface SpeechRecognition extends EventTarget {
    continuous: boolean
    interimResults: boolean
    lang: string
    start(): void
    stop(): void
    onresult: ((event: SpeechRecognitionEvent) => void) | null
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  }
  interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList
  }
  interface SpeechRecognitionErrorEvent extends Event {
    error: string
  }
  interface SpeechRecognitionResultList {
    readonly length: number
    [index: number]: SpeechRecognitionResult
  }
}

import {
  useIntakeSessions,
  useStartIntakeSession,
  useUpdateIntakeSession,
  useFinaliseIntakeSession,
} from '@/lib/queries/command-centre'
import type { Json } from '@/lib/types/database'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExtractedEntity {
  type: 'name' | 'date' | 'occupation' | 'location' | 'relationship' | 'status' | 'fact'
  value: string
  field?: string // maps to lead_metadata field key
  confidence: number
}

interface LiveIntakeSidebarProps {
  leadId: string
  tenantId: string
  userId: string
  onStreamRecommendation?: (stream: string, matterTypeId?: string) => void
  onEntitiesExtracted?: (entities: Record<string, unknown>) => void
}

// ─── Entity Extraction (client-side keyword matching) ────────────────────────
// This runs on transcript text to identify key facts. In production, this would
// call an AI endpoint for richer extraction. This provides immediate feedback.

const ENTITY_PATTERNS: Array<{
  pattern: RegExp
  type: ExtractedEntity['type']
  field: string
  label: string
}> = [
  { pattern: /married (?:in|on|since) (\d{4})/i, type: 'date', field: 'married_date', label: 'Marriage Year' },
  { pattern: /(?:works?|working|employed) (?:as|at) (?:a |an )?(.+?)(?:\.|,|$)/i, type: 'occupation', field: 'occupation', label: 'Occupation' },
  { pattern: /(?:born|birthday|DOB).*?(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})/i, type: 'date', field: 'date_of_birth', label: 'Date of Birth' },
  { pattern: /(?:lives?|living|resides?|residing) (?:in|at) (.+?)(?:\.|,|$)/i, type: 'location', field: 'city_of_residence', label: 'City' },
  { pattern: /(?:from|citizen of|nationality|passport from) (.+?)(?:\.|,|$)/i, type: 'location', field: 'nationality', label: 'Nationality' },
  { pattern: /(\d+) (?:children|kids|child)/i, type: 'fact', field: 'children_count', label: 'Children' },
  { pattern: /(?:spouse|husband|wife|partner)(?:'s)? name (?:is )?(.+?)(?:\.|,|$)/i, type: 'name', field: 'spouse_name', label: 'Spouse Name' },
  { pattern: /(?:employer|company|firm) (?:is |called )?(.+?)(?:\.|,|$)/i, type: 'fact', field: 'employer', label: 'Employer' },
  { pattern: /(?:work permit|study permit|visitor visa|PR|permanent residen|refugee|asylum|LMIA|spousal sponsorship|family class|express entry)/i, type: 'status', field: 'immigration_stream', label: 'Immigration Stream' },
]

// Stream recommendation patterns
const STREAM_PATTERNS: Array<{ pattern: RegExp; stream: string }> = [
  { pattern: /spousal sponsorship|sponsor my (?:spouse|husband|wife|partner)/i, stream: 'Spousal Sponsorship' },
  { pattern: /work permit|LMIA|employer/i, stream: 'Work Permit' },
  { pattern: /study permit|student visa|college|university/i, stream: 'Study Permit' },
  { pattern: /visitor visa|tourist visa|visit canada/i, stream: 'Visitor Visa' },
  { pattern: /permanent residen|PR application|express entry|CRS score/i, stream: 'Permanent Residence' },
  { pattern: /refugee|asylum|persecution|protection/i, stream: 'Refugee Protection' },
  { pattern: /family class|parent|grandparent sponsorship/i, stream: 'Family Class Sponsorship' },
  { pattern: /custody|divorce|separation|child support|spousal support/i, stream: 'Family Law' },
  { pattern: /real estate|property|closing|deed|title/i, stream: 'Real Estate' },
]

function extractEntities(text: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = []
  for (const { pattern, type, field, label } of ENTITY_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      entities.push({
        type,
        value: match[1] || match[0],
        field,
        confidence: 0.85,
      })
    }
  }
  return entities
}

function recommendStream(text: string): { stream: string; confidence: number } | null {
  for (const { pattern, stream } of STREAM_PATTERNS) {
    if (pattern.test(text)) {
      return { stream, confidence: 0.9 }
    }
  }
  return null
}

// ─── Component ───────────────────────────────────────────────────────────────

export function LiveIntakeSidebar({
  leadId,
  tenantId,
  userId,
  onStreamRecommendation,
  onEntitiesExtracted,
}: LiveIntakeSidebarProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [entities, setEntities] = useState<ExtractedEntity[]>([])
  const [streamRec, setStreamRec] = useState<{ stream: string; confidence: number } | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const transcriptRef = useRef('')

  // Queries & mutations
  const { data: sessions } = useIntakeSessions(leadId)
  const startSession = useStartIntakeSession()
  const updateSession = useUpdateIntakeSession()
  const finaliseSession = useFinaliseIntakeSession()

  const pastSessions = sessions?.filter((s) => s.status === 'finalised') ?? []

  // Timer
  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000)
    } else if (timerRef.current) {
      clearInterval(timerRef.current)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isRecording, isPaused])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  // Process transcript chunk  -  extract entities and recommend stream
  const processTranscript = useCallback((text: string) => {
    const newEntities = extractEntities(text)
    if (newEntities.length > 0) {
      setEntities((prev) => {
        const existingFields = new Set(prev.map((e) => e.field))
        const unique = newEntities.filter((e) => !existingFields.has(e.field))
        return [...prev, ...unique]
      })
    }

    const rec = recommendStream(text)
    if (rec && !streamRec) {
      setStreamRec(rec)
      onStreamRecommendation?.(rec.stream)
    }
  }, [streamRec, onStreamRecommendation])

  // Start recording
  const handleStart = useCallback(async () => {
    try {
      // Create DB session
      const session = await startSession.mutateAsync({ tenantId, leadId, userId })
      setActiveSessionId(session.id)

      // Set up Web Speech API for real-time transcription
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = 'en-CA'

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          let finalText = ''
          let interimText = ''

          for (let i = 0; i < event.results.length; i++) {
            const result = event.results[i]
            if (result.isFinal) {
              finalText += result[0].transcript + ' '
            } else {
              interimText += result[0].transcript
            }
          }

          if (finalText) {
            transcriptRef.current += finalText
            setTranscript(transcriptRef.current + interimText)
            processTranscript(transcriptRef.current)
          } else {
            setTranscript(transcriptRef.current + interimText)
          }
        }

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          console.warn('Speech recognition error:', event.error)
          if (event.error === 'no-speech') return // Ignore no-speech errors
        }

        recognition.start()
        recognitionRef.current = recognition
      }

      // Also capture audio via MediaRecorder (for potential Whisper fallback)
      // NOTE: Raw audio will be discarded after transcription per privacy policy
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
        mediaRecorderRef.current = recorder
        recorder.start()
      } catch {
        // Microphone access denied  -  rely on Web Speech API only
        console.warn('Microphone access denied  -  using Web Speech API only')
      }

      setIsRecording(true)
      setIsPaused(false)
      setElapsed(0)
    } catch (err) {
      console.error('Failed to start intake session:', err)
    }
  }, [leadId, tenantId, userId, startSession, processTranscript])

  // Pause / Resume
  const handlePauseResume = useCallback(() => {
    if (isPaused) {
      recognitionRef.current?.start()
      mediaRecorderRef.current?.resume()
      setIsPaused(false)
    } else {
      recognitionRef.current?.stop()
      mediaRecorderRef.current?.pause()
      setIsPaused(true)
    }
  }, [isPaused])

  // Stop and finalise
  const handleStop = useCallback(async () => {
    // Stop recording
    recognitionRef.current?.stop()
    recognitionRef.current = null

    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop()
      // Privacy-first: discard all audio tracks immediately
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop())
      mediaRecorderRef.current = null
    }

    setIsRecording(false)
    setIsPaused(false)

    if (!activeSessionId) return

    // Build entity map for lead_metadata
    const entityMap: Record<string, unknown> = {}
    for (const entity of entities) {
      if (entity.field) {
        entityMap[entity.field] = entity.value
      }
    }

    // Finalise session
    await finaliseSession.mutateAsync({
      sessionId: activeSessionId,
      leadId,
      extractedEntities: entityMap,
      summary: transcriptRef.current.trim(),
    })

    onEntitiesExtracted?.(entityMap)
    setActiveSessionId(null)
  }, [activeSessionId, entities, leadId, finaliseSession, onEntitiesExtracted])

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-violet-600" />
            <h3 className="text-sm font-semibold">Live Intake</h3>
          </div>
          {isRecording && (
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] font-mono',
                isPaused ? 'border-amber-500/30 text-amber-600' : 'border-red-500/30 text-red-600 animate-pulse'
              )}
            >
              {isPaused ? 'PAUSED' : 'REC'} {formatTime(elapsed)}
            </Badge>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Controls */}
          {!isRecording ? (
            <Button
              onClick={handleStart}
              disabled={startSession.isPending}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white"
              size="sm"
            >
              {startSession.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Mic className="mr-2 h-4 w-4" />
              )}
              Start Intake Session
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePauseResume}
                className="flex-1"
              >
                {isPaused ? (
                  <>
                    <Play className="mr-1 h-3.5 w-3.5" />
                    Resume
                  </>
                ) : (
                  <>
                    <Pause className="mr-1 h-3.5 w-3.5" />
                    Pause
                  </>
                )}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleStop}
                disabled={finaliseSession.isPending}
                className="flex-1"
              >
                {finaliseSession.isPending ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Square className="mr-1 h-3.5 w-3.5" />
                )}
                Stop &amp; Save
              </Button>
            </div>
          )}

          {/* Stream Recommendation */}
          {streamRec && (
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-violet-600" />
                <span className="text-xs font-semibold text-violet-700 uppercase tracking-wide">
                  Suggested Stream
                </span>
              </div>
              <button
                onClick={() => onStreamRecommendation?.(streamRec.stream)}
                className="text-sm font-medium text-violet-800 hover:underline"
              >
                {streamRec.stream}
              </button>
              <p className="text-[10px] text-violet-500 mt-0.5">
                {Math.round(streamRec.confidence * 100)}% confidence  -  Click to apply
              </p>
            </div>
          )}

          {/* Extracted Entities */}
          {entities.length > 0 && (
            <div>
              <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide mb-2">
                Extracted Facts
              </p>
              <div className="space-y-1.5">
                {entities.map((entity, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 rounded border border-emerald-500/20 bg-emerald-950/30 px-2.5 py-1.5"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-medium text-emerald-400 capitalize">
                        {entity.field?.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs text-emerald-600 ml-1.5">{entity.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live Transcript */}
          {(isRecording || transcript) && (
            <div>
              <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide mb-2">
                Transcript
              </p>
              <div className="rounded-lg border bg-muted/50 p-3 max-h-[300px] overflow-y-auto">
                <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">
                  {transcript || (
                    <span className="text-muted-foreground/70 italic">Listening...</span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Privacy Notice */}
          {isRecording && (
            <p className="text-[10px] text-muted-foreground text-center">
              <MicOff className="inline h-3 w-3 mr-1" />
              Audio is not stored. Only the transcript and extracted data are saved.
            </p>
          )}

          {/* Past Sessions */}
          {pastSessions.length > 0 && !isRecording && (
            <>
              <Separator />
              <div>
                <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide mb-2">
                  Past Sessions
                </p>
                <div className="space-y-2">
                  {pastSessions.map((session) => (
                    <div key={session.id} className="rounded-lg border p-2.5">
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium text-foreground/80">
                          {session.suggested_stream || 'Intake Session'}
                        </span>
                        <Clock className="h-3 w-3 text-muted-foreground ml-auto" />
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(session.started_at).toLocaleDateString('en-CA')}
                        </span>
                      </div>
                      {session.summary && (
                        <p className="text-[11px] text-muted-foreground line-clamp-2">{session.summary}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
