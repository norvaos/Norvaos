/**
 * POST /api/matters/[id]/ai-draft
 *
 * Norva Intelligence — AI-Paralegal Drafting Engine.
 *
 * Flow:
 * 1. Auth + tenant validation via authenticateRequest()
 * 2. Context-Infector gathers matter facts + wiki playbook
 * 3. Claude generates submission letter with source attribution
 * 4. Log interaction to ai_interactions table
 * 5. Return structured response
 */

import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import Anthropic from '@anthropic-ai/sdk'
import { buildDraftContext, buildSystemPrompt } from '@/lib/services/ai-drafting/context-builder'

const MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 4096

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: matterId } = await params

    // 1. Auth via Sentinel
    const auth = await authenticateRequest()
    const supabase = auth.supabase

    // 2. Parse request
    const body = await request.json()
    const { playbookId, draftType = 'submission_letter', customInstructions, snippetIds } = body as {
      playbookId?: string
      draftType?: string
      customInstructions?: string
      snippetIds?: string[]
    }

    // 3. Build context via Context-Infector (with snippet chain-of-custody)
    const context = await buildDraftContext(supabase, matterId, playbookId, snippetIds)

    // 4. Build prompts
    const systemPrompt = buildSystemPrompt(context)

    const userPrompt = `Draft a professional ${draftType.replace(/_/g, ' ')} for the matter "${context.matter.title}" (File #${context.matter.matterNumber || '[PENDING]'}).

${context.matter.caseType ? `This is a ${context.matter.caseType} case.` : ''}
${context.matter.practiceArea ? `Practice area: ${context.matter.practiceArea}.` : ''}

${customInstructions ? `Additional instructions from the lawyer:\n${customInstructions}\n` : ''}
The letter should be approximately 1,000 words, persuasive, and follow IRCC submission standards where applicable.

Remember: Use [MISSING DATA] for any missing fields. Never invent information.`

    // 5. Call Claude API
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({
        error: 'Norva Intelligence is not configured. Please set the ANTHROPIC_API_KEY environment variable.',
      }, { status: 503 })
    }

    const anthropic = new Anthropic({ apiKey })

    const startTime = Date.now()

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const durationMs = Date.now() - startTime

    // Extract text content
    const textContent = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    // Parse source attributions from the response
    const sourcesMatch = textContent.match(/```json:sources\n([\s\S]*?)```/)
    let sourceAttributions: Array<{ sentence: string; field: string; source: string }> = []
    if (sourcesMatch) {
      try {
        sourceAttributions = JSON.parse(sourcesMatch[1])
      } catch {
        // Attribution parsing failed — non-fatal
      }
    }

    // Extract just the letter (everything before the sources block)
    const letterContent = textContent.replace(/```json:sources[\s\S]*```/, '').trim()

    // 6. Log to ai_interactions (fire-and-forget)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase as any).from('ai_interactions').insert({
      tenant_id: auth.tenantId,
      user_id: auth.userId,
      interaction_type: 'draft_generation',
      entity_type: 'matter',
      entity_id: matterId,
      model: MODEL,
      input_text: userPrompt.slice(0, 2000),
      output_text: letterContent.slice(0, 5000),
      output_structured: {
        draft_type: draftType,
        playbook_id: playbookId ?? null,
        snippet_sources: context.snippetSources.length > 0 ? context.snippetSources : null,
        source_attributions: sourceAttributions,
        missing_fields: context.missingFields,
        word_count: letterContent.split(/\s+/).length,
      },
      tokens_input: response.usage.input_tokens,
      tokens_output: response.usage.output_tokens,
      duration_ms: durationMs,
      input_metadata: {
        matter_id: matterId,
        playbook_id: playbookId ?? null,
        custom_instructions: customInstructions ?? null,
        context_sources: context.sources.length,
      },
    }).then(() => {})

    // 7. Return structured response
    return NextResponse.json({
      success: true,
      draft: {
        content: letterContent,
        wordCount: letterContent.split(/\s+/).length,
        draftType,
        sourceAttributions,
        snippetSources: context.snippetSources,
        missingFields: context.missingFields,
        contextSources: context.sources,
      },
      usage: {
        model: MODEL,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        durationMs,
      },
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[Norva Intelligence] Draft error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate draft' },
      { status: 500 }
    )
  }
}
