/**
 * Ghost-Writer  -  AI email reply draft generator.
 *
 * For every inbound email associated with a matter, Ghost-Writer pre-generates
 * a professional response draft using the matter's context (client info,
 * immigration data, stage, etc.). The lawyer sees the draft before the thread
 * is even opened, ready to review → edit → send in one click.
 *
 * Uses the same Anthropic client and context-builder as Norva Intelligence.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import Anthropic from '@anthropic-ai/sdk'
import { buildDraftContext } from '@/lib/services/ai-drafting/context-builder'

const MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 1024

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GhostWriterInput {
  tenantId: string
  matterId: string
  threadId: string
  messageId?: string
  /** The inbound email subject */
  inboundSubject: string
  /** The inbound email body (plain text preferred) */
  inboundBody: string
  /** Sender name/email for context */
  fromAddress: string
  fromName?: string
}

export interface GhostWriterResult {
  success: boolean
  draftId: string | null
  draftBody: string | null
  error: string | null
  usage?: {
    inputTokens: number
    outputTokens: number
    durationMs: number
  }
}

// ─── System prompt ──────────────────────────────────────────────────────────

function buildGhostWriterSystemPrompt(lawyerName: string | null): string {
  return `You are a professional legal assistant drafting email reply suggestions for ${lawyerName ?? 'the lawyer'}.

RULES:
- Write a concise, professional reply to the inbound email.
- Keep the tone warm but formal  -  this is a law firm communicating with a client.
- Reference specific case details from the matter context when relevant.
- If the email asks about timelines, acknowledge the question but avoid making promises.
- If the email contains documents or attachments, acknowledge receipt.
- Never fabricate case facts, dates, or immigration status information.
- If you lack information to answer a question, write "[REVIEW NEEDED: ...]" so the lawyer knows to fill in.
- Keep the response under 200 words unless the complexity warrants more.
- Do NOT include a subject line  -  just the reply body.
- Start the reply with a greeting (e.g., "Dear [Name],") and end with a professional closing.
- Use Canadian English spelling (colour, organisation, etc.).`
}

// ─── Core ────────────────────────────────────────────────────────────────────

/**
 * Generate a Ghost-Writer draft for an inbound email.
 * Stores the result in `email_ghost_drafts` and returns the draft ID.
 */
export async function generateGhostDraft(
  supabase: SupabaseClient<Database>,
  input: GhostWriterInput
): Promise<GhostWriterResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { success: false, draftId: null, draftBody: null, error: 'ANTHROPIC_API_KEY not configured' }
  }

  // Create a placeholder row with status 'generating'
  const { data: placeholder, error: insertErr } = await supabase
    .from('email_ghost_drafts')
    .insert({
      tenant_id: input.tenantId,
      email_thread_id: input.threadId,
      email_message_id: input.messageId ?? null,
      matter_id: input.matterId,
      draft_body_text: '',
      status: 'generating',
    })
    .select('id')
    .single()

  if (insertErr || !placeholder) {
    return { success: false, draftId: null, draftBody: null, error: 'Failed to create draft placeholder' }
  }

  try {
    // Gather matter context
    const context = await buildDraftContext(supabase, input.matterId)

    const systemPrompt = buildGhostWriterSystemPrompt(context.matter.lawyerName)

    const senderLabel = input.fromName
      ? `${input.fromName} (${input.fromAddress})`
      : input.fromAddress

    const userPrompt = `An inbound email was received for matter "${context.matter.title}" (File #${context.matter.matterNumber || '[PENDING]'}).

From: ${senderLabel}
Subject: ${input.inboundSubject}

--- Email body ---
${input.inboundBody.slice(0, 3000)}
--- End of email ---

Matter context:
- Client: ${context.client.fullName}
- Status: ${context.matter.status}
- Practice area: ${context.matter.practiceArea ?? 'N/A'}
- Case type: ${context.matter.caseType ?? 'N/A'}
${context.immigrationProfile?.immigrationStatus ? `- Immigration status: ${context.immigrationProfile.immigrationStatus}` : ''}

Draft a professional reply to this email. The lawyer will review before sending.`

    const anthropic = new Anthropic({ apiKey })
    const startTime = Date.now()

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const durationMs = Date.now() - startTime

    const draftText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    // Update the placeholder with the generated draft
    await supabase
      .from('email_ghost_drafts')
      .update({
        draft_subject: `Re: ${input.inboundSubject}`,
        draft_body_text: draftText,
        model: MODEL,
        tokens_input: response.usage.input_tokens,
        tokens_output: response.usage.output_tokens,
        duration_ms: durationMs,
        status: 'generated',
        updated_at: new Date().toISOString(),
      })
      .eq('id', placeholder.id)

    // Log to ai_interactions (fire-and-forget)
    supabase.from('ai_interactions' as any).insert({
      tenant_id: input.tenantId,
      interaction_type: 'ghost_writer',
      entity_type: 'email_thread',
      entity_id: input.threadId,
      model: MODEL,
      input_text: userPrompt.slice(0, 2000),
      output_text: draftText.slice(0, 5000),
      tokens_input: response.usage.input_tokens,
      tokens_output: response.usage.output_tokens,
      duration_ms: durationMs,
      input_metadata: {
        matter_id: input.matterId,
        message_id: input.messageId ?? null,
        from_address: input.fromAddress,
      },
    }).then(() => {})

    return {
      success: true,
      draftId: placeholder.id,
      draftBody: draftText,
      error: null,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        durationMs,
      },
    }
  } catch (err) {
    // Mark the placeholder as failed
    await supabase
      .from('email_ghost_drafts')
      .update({ status: 'discarded', updated_at: new Date().toISOString() })
      .eq('id', placeholder.id)

    return {
      success: false,
      draftId: placeholder.id,
      draftBody: null,
      error: err instanceof Error ? err.message : 'Ghost-Writer generation failed',
    }
  }
}
