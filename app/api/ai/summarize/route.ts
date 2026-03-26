/**
 * POST /api/ai/summarize
 *
 * Sovereign Summarizer (Directive 036):
 * Uses Gemini 1.5 Flash with its massive 1M+ token context window
 * to summarise long legal notes, transcripts, and case files.
 *
 * Input: { text, matterId?, promptOverride? }
 * Output: Structured JSON with key dates, missing docs, action items
 */

import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { orchestrate, QuotaExceededError } from '@/lib/services/ai-orchestrator'

const DEFAULT_SYSTEM_PROMPT = `You are a Senior Canadian Immigration Clerk. Analyse the provided text.

Extract the following in strict JSON format:
{
  "key_dates": [{ "date": "YYYY-MM-DD", "description": "..." }],
  "missing_documents": [{ "document": "...", "urgency": "high|medium|low" }],
  "zero_day_gaps": [{ "gap": "...", "risk_level": "critical|warning|info" }],
  "action_items": [{ "task": "...", "assignee": "lawyer|client|paralegal", "deadline": "YYYY-MM-DD or null" }],
  "client_sentiment": "positive|neutral|concerned|distressed",
  "summary": "2-3 sentence executive summary",
  "ircc_flags": [{ "issue": "...", "regulation": "..." }]
}

Rules:
- Extract ONLY what is explicitly stated. Never invent information.
- Use Canadian English spelling.
- For relative dates, note as "[RELATIVE: ...]".`

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest()

    const body = await request.json()
    const { text, matterId, promptOverride } = body as {
      text: string
      matterId?: string
      promptOverride?: string
    }

    if (!text || text.trim().length < 10) {
      return NextResponse.json(
        { error: 'Text input required (minimum 10 characters).' },
        { status: 400 },
      )
    }

    const result = await orchestrate({
      tenantId: auth.tenantId,
      userId: auth.userId,
      task: 'sovereign_summary',
      entityType: matterId ? 'matter' : undefined,
      entityId: matterId ?? undefined,
      inputText: text,
      systemPrompt: promptOverride ?? DEFAULT_SYSTEM_PROMPT,
      userPrompt: `Analyse the following:\n\n${text}`,
      maxTokens: 4096,
    })

    return NextResponse.json({
      success: true,
      summary: result.structured ?? { raw: result.text },
      rawText: result.text,
      usage: {
        model: result.model,
        tokensInput: result.tokensInput,
        tokensOutput: result.tokensOutput,
        costCents: result.costCents,
        durationMs: result.durationMs,
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
    console.error('[Sovereign Summarizer] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Summary generation failed' },
      { status: 500 },
    )
  }
}
