/**
 * AI Orchestrator  -  "The Intelligence Matrix"
 *
 * Directive 036: Centralized AI gateway that routes to the right model
 * for the right task. No hardcoded API calls in UI components.
 *
 * Model Matrix:
 *  - Meeting Transcription:  OpenAI Whisper v3-turbo ($0.006/min)
 *  - Sovereign Summaries:    Gemini 1.5 Flash (near-zero cost, 1M+ context)
 *  - Sentinel OCR:           Gemini 1.5 Flash (native multimodal)
 *  - Document Drafting:      GPT-4o mini (high logic, 90% cheaper than GPT-4o)
 *  - Legal Drafting:         Claude Sonnet (existing  -  source attribution)
 *
 * Cost guardrails:
 *  - Per-tenant usage quota (configurable monthly cap)
 *  - Redis cache for OCR dedup (don't scan same passport twice)
 *  - All calls logged to ai_interactions with cost_cents
 */

import { log } from '@/lib/utils/logger'
import { createAdminClient } from '@/lib/supabase/admin'
import { getJson, setJson, cacheKey } from '@/lib/services/cache'
import type { Json } from '@/lib/types/database'

// ─── Model Registry ────────────────────────────────────────────────────────

export type AIModel =
  | 'whisper-v3-turbo'
  | 'gemini-1.5-flash'
  | 'gpt-4o-mini'
  | 'claude-sonnet'

export type AITask =
  | 'transcription'
  | 'sovereign_summary'
  | 'sentinel_ocr'
  | 'document_draft'
  | 'legal_draft'

/** Maps tasks to their optimal model. */
const TASK_MODEL_MAP: Record<AITask, AIModel> = {
  transcription: 'whisper-v3-turbo',
  sovereign_summary: 'gemini-1.5-flash',
  sentinel_ocr: 'gemini-1.5-flash',
  document_draft: 'gpt-4o-mini',
  legal_draft: 'claude-sonnet',
}

/** Cost per unit for billing estimates (in cents). */
const COST_RATES: Record<AIModel, { unit: string; costCentsPerUnit: number }> = {
  'whisper-v3-turbo': { unit: 'minute', costCentsPerUnit: 0.6 },        // $0.006/min
  'gemini-1.5-flash': { unit: '1M_tokens', costCentsPerUnit: 7.5 },     // $0.075/1M tokens
  'gpt-4o-mini': { unit: '1M_tokens', costCentsPerUnit: 15 },           // $0.15/1M input tokens
  'claude-sonnet': { unit: '1M_tokens', costCentsPerUnit: 300 },        // $3/1M input tokens
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface OrchestratorRequest {
  tenantId: string
  userId?: string
  task: AITask
  entityType?: string
  entityId?: string
  /** For transcription: audio file buffer */
  audioBuffer?: Buffer
  audioMimeType?: string
  audioDurationMinutes?: number
  /** For summaries/drafting: text input */
  inputText?: string
  /** For OCR: base64-encoded image or document */
  imageBase64?: string
  imageMimeType?: string
  /** Cache key suffix for OCR dedup (e.g. document SHA-256) */
  ocrCacheKey?: string
  /** Additional system instructions */
  systemPrompt?: string
  /** Custom user prompt */
  userPrompt?: string
  /** Max tokens for text generation */
  maxTokens?: number
}

export interface OrchestratorResponse {
  success: boolean
  model: AIModel
  task: AITask
  /** The generated text output */
  text: string
  /** Structured output (e.g. JSON from summarizer) */
  structured?: Record<string, unknown>
  /** Token usage */
  tokensInput?: number
  tokensOutput?: number
  /** Cost estimate in cents */
  costCents: number
  /** Processing time in ms */
  durationMs: number
  /** Whether result came from cache */
  cached: boolean
}

// ─── Quota Check ───────────────────────────────────────────────────────────

const DEFAULT_MONTHLY_QUOTA_CENTS = 5000 // $50 default cap

/**
 * Check if tenant has budget remaining for AI calls.
 * Returns remaining budget in cents, or throws if over quota.
 */
export async function checkQuota(tenantId: string): Promise<number> {
  const admin = createAdminClient()

  // Get tenant's configured quota
  const { data: tenant } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .single()

  const quota = (tenant?.settings as Record<string, unknown>)?.ai_monthly_quota_cents as number
    ?? DEFAULT_MONTHLY_QUOTA_CENTS

  // Sum this month's spend
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const { data: usage } = await admin
    .from('ai_interactions')
    .select('cost_cents')
    .eq('tenant_id', tenantId)
    .gte('created_at', startOfMonth.toISOString())

  const totalSpent = (usage ?? []).reduce(
    (sum, row) => sum + (row.cost_cents ?? 0),
    0
  )

  const remaining = quota - totalSpent
  if (remaining <= 0) {
    throw new QuotaExceededError(tenantId, quota, totalSpent)
  }

  return remaining
}

export class QuotaExceededError extends Error {
  constructor(
    public tenantId: string,
    public quotaCents: number,
    public spentCents: number,
  ) {
    super(
      `AI quota exceeded for tenant ${tenantId}: spent ${spentCents}¢ of ${quotaCents}¢ monthly limit`
    )
    this.name = 'QuotaExceededError'
  }
}

// ─── Cost Estimator ────────────────────────────────────────────────────────

export function estimateCost(
  model: AIModel,
  tokensInput?: number,
  tokensOutput?: number,
  audioDurationMinutes?: number,
): number {
  const rate = COST_RATES[model]

  if (model === 'whisper-v3-turbo') {
    return Math.ceil((audioDurationMinutes ?? 0) * rate.costCentsPerUnit)
  }

  // Token-based models: estimate cost from input + output tokens
  const totalTokens = (tokensInput ?? 0) + (tokensOutput ?? 0)
  return Math.ceil((totalTokens / 1_000_000) * rate.costCentsPerUnit)
}

// ─── OCR Cache Layer ───────────────────────────────────────────────────────

const OCR_CACHE_TTL = 60 * 60 * 24 * 30 // 30 days

/**
 * Check Redis for a cached OCR result. Prevents paying to scan the same
 * passport/document twice.
 */
export async function getCachedOCR(
  tenantId: string,
  docHash: string,
): Promise<string | null> {
  const key = cacheKey(tenantId, 'ocr', docHash)
  return getJson<string>(key)
}

export async function setCachedOCR(
  tenantId: string,
  docHash: string,
  result: string,
): Promise<void> {
  const key = cacheKey(tenantId, 'ocr', docHash)
  await setJson(key, result, OCR_CACHE_TTL)
}

// ─── Interaction Logger ────────────────────────────────────────────────────

async function logInteraction(
  req: OrchestratorRequest,
  res: OrchestratorResponse,
): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('ai_interactions').insert({
      tenant_id: req.tenantId,
      user_id: req.userId ?? null,
      interaction_type: req.task,
      entity_type: req.entityType ?? null,
      entity_id: req.entityId ?? null,
      model_used: res.model,
      input_text: (req.inputText ?? req.userPrompt ?? '').slice(0, 2000),
      output_text: res.text.slice(0, 5000),
      output_structured: (res.structured as Json) ?? null,
      tokens_input: res.tokensInput ?? null,
      tokens_output: res.tokensOutput ?? null,
      cost_cents: res.costCents,
      input_metadata: {
        task: req.task,
        cached: res.cached,
        duration_ms: res.durationMs,
        audio_duration_minutes: req.audioDurationMinutes ?? null,
      },
    })
  } catch (err) {
    // Logging must never break the request path
    log.error('Failed to log AI interaction', {
      tenant_id: req.tenantId,
      error_code: err instanceof Error ? err.message : 'unknown',
    })
  }
}

// ─── Model Adapters ────────────────────────────────────────────────────────

async function callWhisper(req: OrchestratorRequest): Promise<OrchestratorResponse> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured')
  if (!req.audioBuffer) throw new Error('audioBuffer required for transcription')

  const startTime = Date.now()

  const formData = new FormData()
  const blob = new Blob([new Uint8Array(req.audioBuffer)], { type: req.audioMimeType ?? 'audio/mp3' })
  formData.append('file', blob, `recording.${req.audioMimeType?.split('/')[1] ?? 'mp3'}`)
  formData.append('model', 'whisper-1')
  formData.append('language', 'en')
  formData.append('response_format', 'verbose_json')

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Whisper API error: ${response.status} ${err}`)
  }

  const result = await response.json() as {
    text: string
    duration?: number
    segments?: Array<{ start: number; end: number; text: string }>
  }

  const durationMs = Date.now() - startTime
  const audioDuration = req.audioDurationMinutes ?? (result.duration ? result.duration / 60 : 0)
  const costCents = estimateCost('whisper-v3-turbo', undefined, undefined, audioDuration)

  return {
    success: true,
    model: 'whisper-v3-turbo',
    task: 'transcription',
    text: result.text,
    structured: result.segments ? { segments: result.segments } : undefined,
    costCents,
    durationMs,
    cached: false,
  }
}

async function callGemini(req: OrchestratorRequest): Promise<OrchestratorResponse> {
  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY not configured')

  const startTime = Date.now()

  // Build parts array for multimodal request
  const parts: Array<Record<string, unknown>> = []

  // System instruction via system_instruction field
  const systemInstruction = req.systemPrompt ?? ''

  if (req.imageBase64 && req.imageMimeType) {
    parts.push({
      inline_data: {
        mime_type: req.imageMimeType,
        data: req.imageBase64,
      },
    })
  }

  parts.push({ text: req.userPrompt ?? req.inputText ?? '' })

  const body = {
    system_instruction: systemInstruction
      ? { parts: [{ text: systemInstruction }] }
      : undefined,
    contents: [{ parts }],
    generationConfig: {
      maxOutputTokens: req.maxTokens ?? 4096,
      temperature: 0.2,
    },
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Gemini API error: ${response.status} ${err}`)
  }

  const result = await response.json() as {
    candidates: Array<{
      content: { parts: Array<{ text: string }> }
    }>
    usageMetadata?: {
      promptTokenCount?: number
      candidatesTokenCount?: number
      totalTokenCount?: number
    }
  }

  const text = result.candidates?.[0]?.content?.parts
    ?.map((p) => p.text)
    .join('') ?? ''

  const tokensInput = result.usageMetadata?.promptTokenCount ?? 0
  const tokensOutput = result.usageMetadata?.candidatesTokenCount ?? 0
  const durationMs = Date.now() - startTime
  const costCents = estimateCost('gemini-1.5-flash', tokensInput, tokensOutput)

  // Try to parse structured JSON from response
  let structured: Record<string, unknown> | undefined
  try {
    const jsonMatch = text.match(/```json\n([\s\S]*?)```/)
    if (jsonMatch) {
      structured = JSON.parse(jsonMatch[1])
    } else if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
      structured = JSON.parse(text)
    }
  } catch {
    // Not JSON  -  that's fine
  }

  return {
    success: true,
    model: 'gemini-1.5-flash',
    task: req.task,
    text,
    structured,
    tokensInput,
    tokensOutput,
    costCents,
    durationMs,
    cached: false,
  }
}

async function callGPT4oMini(req: OrchestratorRequest): Promise<OrchestratorResponse> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured')

  const startTime = Date.now()

  const body = {
    model: 'gpt-4o-mini',
    messages: [
      ...(req.systemPrompt ? [{ role: 'system' as const, content: req.systemPrompt }] : []),
      { role: 'user' as const, content: req.userPrompt ?? req.inputText ?? '' },
    ],
    max_tokens: req.maxTokens ?? 4096,
    temperature: 0.3,
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`OpenAI API error: ${response.status} ${err}`)
  }

  const result = await response.json() as {
    choices: Array<{ message: { content: string } }>
    usage?: { prompt_tokens: number; completion_tokens: number }
  }

  const text = result.choices?.[0]?.message?.content ?? ''
  const tokensInput = result.usage?.prompt_tokens ?? 0
  const tokensOutput = result.usage?.completion_tokens ?? 0
  const durationMs = Date.now() - startTime
  const costCents = estimateCost('gpt-4o-mini', tokensInput, tokensOutput)

  return {
    success: true,
    model: 'gpt-4o-mini',
    task: req.task,
    text,
    tokensInput,
    tokensOutput,
    costCents,
    durationMs,
    cached: false,
  }
}

// ─── Main Orchestrator ─────────────────────────────────────────────────────

/**
 * Route an AI request to the optimal model based on task type.
 *
 * This is the single entry point for all AI calls in NorvaOS.
 * Handles: quota checks, OCR caching, model routing, cost tracking, logging.
 */
export async function orchestrate(req: OrchestratorRequest): Promise<OrchestratorResponse> {
  const model = TASK_MODEL_MAP[req.task]

  log.info('AI orchestrator: request', {
    tenant_id: req.tenantId,
    task: req.task,
    model,
  })

  // 1. Quota check
  await checkQuota(req.tenantId)

  // 2. OCR cache check
  if (req.task === 'sentinel_ocr' && req.ocrCacheKey) {
    const cached = await getCachedOCR(req.tenantId, req.ocrCacheKey)
    if (cached) {
      log.info('AI orchestrator: OCR cache hit', {
        tenant_id: req.tenantId,
        cache_key: req.ocrCacheKey,
      })

      const response: OrchestratorResponse = {
        success: true,
        model,
        task: req.task,
        text: cached,
        costCents: 0,
        durationMs: 0,
        cached: true,
      }

      // Log even cache hits for usage tracking
      await logInteraction(req, response)
      return response
    }
  }

  // 3. Route to the right model
  let response: OrchestratorResponse

  switch (model) {
    case 'whisper-v3-turbo':
      response = await callWhisper(req)
      break
    case 'gemini-1.5-flash':
      response = await callGemini(req)
      break
    case 'gpt-4o-mini':
      response = await callGPT4oMini(req)
      break
    case 'claude-sonnet':
      // Claude drafting uses the existing dedicated route
      throw new Error('Legal drafts should use the dedicated /api/matters/[id]/ai-draft route')
    default:
      throw new Error(`Unknown model: ${model}`)
  }

  // 4. Cache OCR results
  if (req.task === 'sentinel_ocr' && req.ocrCacheKey && response.success) {
    await setCachedOCR(req.tenantId, req.ocrCacheKey, response.text)
  }

  // 5. Log interaction (fire-and-forget)
  logInteraction(req, response).catch(() => {})

  log.info('AI orchestrator: complete', {
    tenant_id: req.tenantId,
    task: req.task,
    model,
    cost_cents: response.costCents.toString(),
    duration_ms: response.durationMs,
    cache_hit: response.cached,
  })

  return response
}

/**
 * Get the model assigned to a given task.
 * Useful for UI display and cost estimation.
 */
export function getModelForTask(task: AITask): AIModel {
  return TASK_MODEL_MAP[task]
}

/**
 * Get cost rate info for a model.
 */
export function getCostRate(model: AIModel) {
  return COST_RATES[model]
}
