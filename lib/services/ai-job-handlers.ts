/**
 * AI Background Job Handlers (Directive 036  -  "The Breeze")
 *
 * These handlers process AI tasks asynchronously via the job queue.
 * Pattern:
 *   User uploads doc → enqueueJob('ai_ocr_scan', ...) → Worker picks up → Gemini scans
 *   User records meeting → enqueueJob('ai_transcribe', ...) → Whisper → Gemini → Dashboard update
 *
 * The UI remains fast ("The Breeze") because heavy AI lifting happens here.
 */

import { orchestrate } from '@/lib/services/ai-orchestrator'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/utils/logger'
import { appendJobLog } from '@/lib/services/job-queue'
import type { Json } from '@/lib/types/database'
import { createHash } from 'crypto'

// ─── Job Type Registry ─────────────────────────────────────────────────────

export const AI_JOB_TYPES = [
  'ai_transcribe',
  'ai_summarize',
  'ai_ocr_scan',
  'ai_document_draft',
] as const

export type AIJobType = (typeof AI_JOB_TYPES)[number]

// ─── Transcription Job ─────────────────────────────────────────────────────

interface TranscribePayload {
  documentId: string
  matterId?: string
  storagePath: string
  mimeType: string
}

/**
 * Sovereign Summarizer system prompt for meeting transcripts.
 */
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

export async function handleTranscribeJob(
  jobId: string,
  tenantId: string,
  payload: TranscribePayload,
): Promise<Json> {
  const admin = createAdminClient()

  await appendJobLog(jobId, 'info', 'Downloading audio file from storage')

  // 1. Download audio from Supabase storage
  const { data: fileData, error: dlError } = await admin.storage
    .from('documents')
    .download(payload.storagePath)

  if (dlError || !fileData) {
    throw new Error(`Failed to download audio: ${dlError?.message ?? 'no data'}`)
  }

  const audioBuffer = Buffer.from(await fileData.arrayBuffer())

  await appendJobLog(jobId, 'info', `Audio downloaded: ${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB`)

  // 2. Transcribe via Whisper
  const transcription = await orchestrate({
    tenantId,
    task: 'transcription',
    entityType: 'matter',
    entityId: payload.matterId,
    audioBuffer,
    audioMimeType: payload.mimeType,
  })

  await appendJobLog(jobId, 'info', `Transcription complete: ${transcription.text.length} chars`)

  // 3. Sovereign Summary via Gemini
  let summary = null
  if (transcription.text.length > 50) {
    const summaryResult = await orchestrate({
      tenantId,
      task: 'sovereign_summary',
      entityType: 'matter',
      entityId: payload.matterId,
      inputText: transcription.text,
      systemPrompt: SOVEREIGN_SUMMARIZER_PROMPT,
      userPrompt: `Analyse this meeting transcript:\n\n${transcription.text}`,
      maxTokens: 2048,
    })

    summary = summaryResult.structured ?? null
    await appendJobLog(jobId, 'info', 'Sovereign summary generated')
  }

  // 4. Store transcript on the document record
  await admin
    .from('documents')
    .update({
      extracted_text: transcription.text,
      ai_metadata: {
        transcript_segments: transcription.structured?.segments ?? null,
        sovereign_summary: summary,
        transcribed_at: new Date().toISOString(),
        transcription_model: transcription.model,
        cost_cents: transcription.costCents,
      },
    } as Record<string, unknown>)
    .eq('id', payload.documentId)
    .eq('tenant_id', tenantId)

  // 5. Create tasks from action items (if summary has them and matter exists)
  if (summary && payload.matterId && Array.isArray((summary as Record<string, unknown>).action_items)) {
    const actionItems = (summary as Record<string, unknown>).action_items as Array<{
      task: string
      assignee: string
      deadline: string | null
    }>

    for (const item of actionItems.slice(0, 10)) {
      await admin.from('tasks').insert({
        tenant_id: tenantId,
        matter_id: payload.matterId,
        title: item.task,
        description: `Auto-generated from meeting transcript (${new Date().toLocaleDateString('en-CA')})`,
        due_date: item.deadline ?? null,
        status: 'open',
        priority: 'medium',
        created_via: 'ai_transcript',
      } as any)
    }

    await appendJobLog(jobId, 'info', `Created ${Math.min(actionItems.length, 10)} tasks from action items`)
  }

  return {
    transcript_length: transcription.text.length,
    summary_generated: !!summary,
    total_cost_cents: transcription.costCents,
  }
}

// ─── OCR Scan Job ──────────────────────────────────────────────────────────

interface OCRScanPayload {
  documentId: string
  matterId?: string
  storagePath: string
  mimeType: string
}

export async function handleOCRScanJob(
  jobId: string,
  tenantId: string,
  payload: OCRScanPayload,
): Promise<Json> {
  const admin = createAdminClient()

  await appendJobLog(jobId, 'info', 'Downloading document for OCR')

  // 1. Download document
  const { data: fileData, error: dlError } = await admin.storage
    .from('documents')
    .download(payload.storagePath)

  if (dlError || !fileData) {
    throw new Error(`Failed to download document: ${dlError?.message ?? 'no data'}`)
  }

  const buffer = Buffer.from(await fileData.arrayBuffer())
  const imageBase64 = buffer.toString('base64')

  // 2. Generate cache key from document hash (SHA-256)
  const docHash = createHash('sha256').update(buffer).digest('hex')

  // 3. OCR via Gemini (with Redis cache dedup)
  const result = await orchestrate({
    tenantId,
    task: 'sentinel_ocr',
    entityType: 'document',
    entityId: payload.documentId,
    imageBase64,
    imageMimeType: payload.mimeType,
    ocrCacheKey: docHash,
    systemPrompt: `You are a document OCR specialist for Canadian immigration law. Extract all text from this document. Identify the document type (passport, visa, work permit, IRCC correspondence, etc.). Return JSON: { "document_type": "...", "extracted_text": "...", "fields": { ... } }`,
    userPrompt: 'Extract all text and structured fields from this document.',
    maxTokens: 4096,
  })

  await appendJobLog(jobId, 'info', `OCR complete (cached: ${result.cached})`)

  // 4. Update document record
  await admin
    .from('documents')
    .update({
      extracted_text: result.text,
      ai_metadata: {
        ocr_result: result.structured ?? null,
        ocr_model: result.model,
        ocr_cached: result.cached,
        ocr_cost_cents: result.costCents,
        scanned_at: new Date().toISOString(),
        document_hash: docHash,
      },
    } as Record<string, unknown>)
    .eq('id', payload.documentId)
    .eq('tenant_id', tenantId)

  return {
    cached: result.cached,
    cost_cents: result.costCents,
    document_hash: docHash,
  }
}

// ─── Job Router ────────────────────────────────────────────────────────────

/**
 * Route an AI job to the correct handler.
 * Called by the job worker when processing jobs with ai_* types.
 */
export async function routeAIJob(
  jobId: string,
  jobType: string,
  tenantId: string,
  payload: Json,
): Promise<Json> {
  switch (jobType) {
    case 'ai_transcribe':
      return handleTranscribeJob(jobId, tenantId, payload as unknown as TranscribePayload)
    case 'ai_ocr_scan':
      return handleOCRScanJob(jobId, tenantId, payload as unknown as OCRScanPayload)
    default:
      throw new Error(`Unknown AI job type: ${jobType}`)
  }
}
