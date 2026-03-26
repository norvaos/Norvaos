/**
 * POST /api/ai/transcribe
 *
 * Transcription Pipeline (Directive 036):
 * 1. Receive audio file (.mp3 / .wav) from Matter Workspace
 * 2. Send to Whisper v3-turbo for transcription
 * 3. Pipe transcript to Sovereign Summarizer (Gemini 1.5 Flash)
 * 4. Return transcript + structured summary
 *
 * The heavy lifting runs server-side. For large files, the caller can
 * use the job queue (enqueueJob with job_type 'ai_transcribe') for
 * background processing.
 */

import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { orchestrate, QuotaExceededError } from '@/lib/services/ai-orchestrator'

const SOVEREIGN_SUMMARIZER_PROMPT = `You are a Senior Canadian Immigration Clerk. Analyse this meeting transcript.

Extract the following in strict JSON format:
{
  "key_dates": [{ "date": "YYYY-MM-DD", "description": "..." }],
  "missing_documents": [{ "document": "...", "urgency": "high|medium|low" }],
  "zero_day_gaps": [{ "gap": "...", "risk_level": "critical|warning|info" }],
  "action_items": [{ "task": "...", "assignee": "lawyer|client|paralegal", "deadline": "YYYY-MM-DD or null" }],
  "client_sentiment": "positive|neutral|concerned|distressed",
  "summary": "2-3 sentence executive summary of the meeting"
}

Rules:
- Extract ONLY what is explicitly stated. Never invent information.
- Use Canadian English spelling (colour, organisation, defence).
- For dates mentioned as relative ("next Tuesday"), note them as "[RELATIVE: next Tuesday]".
- Flag any potential IRCC compliance issues.`

export async function POST(request: Request) {
  try {
    // 1. Auth
    const auth = await authenticateRequest()

    // 2. Parse multipart form data
    const formData = await request.formData()
    const audioFile = formData.get('audio') as File | null
    const matterId = formData.get('matterId') as string | null
    const skipSummary = formData.get('skipSummary') === 'true'

    if (!audioFile) {
      return NextResponse.json(
        { error: 'Audio file required. Send as multipart form with field name "audio".' },
        { status: 400 },
      )
    }

    // Validate file type
    const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/mp4', 'audio/m4a']
    if (!validTypes.some((t) => audioFile.type.startsWith(t.split('/')[0]))) {
      return NextResponse.json(
        { error: `Unsupported audio format: ${audioFile.type}. Supported: mp3, wav, webm, m4a.` },
        { status: 400 },
      )
    }

    // Size guard: 25MB max (Whisper limit)
    if (audioFile.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Audio file exceeds 25MB limit.' },
        { status: 400 },
      )
    }

    // 3. Transcribe via Whisper
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer())
    const estimatedMinutes = audioFile.size / (128_000 / 8 * 60) // rough estimate from bitrate

    const transcription = await orchestrate({
      tenantId: auth.tenantId,
      userId: auth.userId,
      task: 'transcription',
      entityType: matterId ? 'matter' : undefined,
      entityId: matterId ?? undefined,
      audioBuffer,
      audioMimeType: audioFile.type,
      audioDurationMinutes: estimatedMinutes,
    })

    if (!transcription.success) {
      return NextResponse.json(
        { error: 'Transcription failed.' },
        { status: 500 },
      )
    }

    // 4. Sovereign Summarizer (unless skipped)
    let summary = null

    if (!skipSummary && transcription.text.length > 50) {
      const summaryResult = await orchestrate({
        tenantId: auth.tenantId,
        userId: auth.userId,
        task: 'sovereign_summary',
        entityType: matterId ? 'matter' : undefined,
        entityId: matterId ?? undefined,
        inputText: transcription.text,
        systemPrompt: SOVEREIGN_SUMMARIZER_PROMPT,
        userPrompt: `Analyse this meeting transcript:\n\n${transcription.text}`,
        maxTokens: 2048,
      })

      if (summaryResult.success) {
        summary = summaryResult.structured ?? { raw: summaryResult.text }
      }
    }

    // 5. Return results
    return NextResponse.json({
      success: true,
      transcript: {
        text: transcription.text,
        segments: transcription.structured?.segments ?? null,
        durationMinutes: estimatedMinutes,
      },
      summary,
      usage: {
        transcription: {
          model: transcription.model,
          costCents: transcription.costCents,
          durationMs: transcription.durationMs,
        },
        summary: summary
          ? {
              model: 'gemini-1.5-flash',
              costCents: 0, // Near-zero
              durationMs: 0,
            }
          : null,
      },
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }
    if (err instanceof QuotaExceededError) {
      return NextResponse.json(
        { error: 'Monthly AI usage quota exceeded. Contact your administrator.' },
        { status: 429 },
      )
    }
    console.error('[AI Transcribe] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Transcription failed' },
      { status: 500 },
    )
  }
}
