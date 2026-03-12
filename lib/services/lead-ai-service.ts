/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Lead AI Intake Service — Assistive Only
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * AI outputs are SUGGESTIONS. They do not determine final outcomes.
 * AI never directly determines: final qualification, closure decisions, or
 * matter conversion. All AI suggestions require explicit human acceptance.
 *
 * Human acceptance is logged in the activity log with actor_type: 'user'.
 * AI insight generation is logged with actor_type: 'ai'.
 *
 * Feature-flagged via workspace feature flags. Initially stubbed — returns
 * reasonable defaults. Interface designed for later provider integration.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/types/database'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AIInsight {
  practiceAreaSuggestion: string | null
  intakeSummary: string | null
  qualificationSuggestion: string | null
  missingDataFlags: string[]
  urgencyFlags: string[]
  nextActionSuggestion: string | null
  confidenceScores: Record<string, number>
  modelInfo: string
}

interface IntakeContext {
  contactName: string | null
  preferredContactMethod: string | null
  intakeNotes: string | null
  opposingParties: Array<{ name: string; relationship?: string }>
  urgencyLevel: string | null
  jurisdiction: string | null
  limitationRisk: boolean
  abuseSafety: boolean
  practiceArea: string | null
}

// ─── AI Service Interface ────────────────────────────────────────────────────

/**
 * Generate AI insights for a lead's intake.
 * Currently stubbed — returns reasonable defaults.
 * TODO: Integrate with Anthropic Claude API for real analysis.
 */
export async function generateIntakeInsights(
  supabase: SupabaseClient<Database>,
  leadId: string,
  tenantId: string
): Promise<AIInsight> {
  // Gather context from the lead and intake profile
  const ctx = await gatherIntakeContext(supabase, leadId)

  // Stubbed AI analysis
  const insight = produceStubInsight(ctx)

  // Persist the insight
  await supabase.from('lead_ai_insights').insert({
    tenant_id: tenantId,
    lead_id: leadId,
    practice_area_suggestion: insight.practiceAreaSuggestion,
    intake_summary: insight.intakeSummary,
    qualification_suggestion: insight.qualificationSuggestion,
    missing_data_flags: insight.missingDataFlags as unknown as Json,
    urgency_flags: insight.urgencyFlags as unknown as Json,
    next_action_suggestion: insight.nextActionSuggestion,
    confidence_scores: insight.confidenceScores as unknown as Json,
    model_info: insight.modelInfo,
  })

  // Log the AI action
  await supabase.from('activities').insert({
    tenant_id: tenantId,
    activity_type: 'ai_insight_generated',
    title: 'AI intake analysis generated',
    description: `Practice area suggestion: ${insight.practiceAreaSuggestion ?? 'none'}. Qualification suggestion: ${insight.qualificationSuggestion ?? 'none'}. Missing fields: ${insight.missingDataFlags.length}`,
    entity_type: 'lead',
    entity_id: leadId,
    user_id: 'system',
    metadata: {
      model_info: insight.modelInfo,
      confidence_scores: insight.confidenceScores,
      missing_data_count: insight.missingDataFlags.length,
      urgency_flag_count: insight.urgencyFlags.length,
    } as unknown as Json,
  })

  return insight
}

/**
 * Accept an AI suggestion. Records human acceptance in activity log.
 * The actual decision (qualification, practice area, etc.) must be
 * recorded separately in the appropriate source-of-truth table.
 */
export async function acceptAIInsight(
  supabase: SupabaseClient<Database>,
  insightId: string,
  tenantId: string,
  leadId: string,
  acceptedBy: string,
  notes?: string
): Promise<void> {
  // Update the insight record
  await supabase
    .from('lead_ai_insights')
    .update({
      accepted_by: acceptedBy,
      accepted_at: new Date().toISOString(),
      acceptance_notes: notes ?? null,
    })
    .eq('id', insightId)
    .eq('tenant_id', tenantId)

  // Log human acceptance
  await supabase.from('activities').insert({
    tenant_id: tenantId,
    activity_type: 'ai_insight_accepted',
    title: 'AI suggestion accepted',
    description: notes ?? 'User accepted AI intake analysis suggestions',
    entity_type: 'lead',
    entity_id: leadId,
    user_id: acceptedBy,
    metadata: {
      insight_id: insightId,
      actor_type: 'user', // Explicitly user, not AI
      acceptance_notes: notes,
    } as unknown as Json,
  })
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

async function gatherIntakeContext(
  supabase: SupabaseClient<Database>,
  leadId: string
): Promise<IntakeContext> {
  const { data: lead } = await supabase
    .from('leads')
    .select('contact_id, practice_area_id, notes')
    .eq('id', leadId)
    .single()

  let contactName: string | null = null
  if (lead?.contact_id) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('first_name, last_name')
      .eq('id', lead.contact_id)
      .single()
    if (contact) {
      contactName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || null
    }
  }

  const { data: profile } = await supabase
    .from('lead_intake_profiles')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle()

  return {
    contactName,
    preferredContactMethod: profile?.preferred_contact_method ?? null,
    intakeNotes: lead?.notes ?? null,
    opposingParties: (Array.isArray(profile?.opposing_party_names) ? profile.opposing_party_names : []) as IntakeContext['opposingParties'],
    urgencyLevel: profile?.urgency_level ?? null,
    jurisdiction: profile?.jurisdiction ?? null,
    limitationRisk: profile?.limitation_risk_flag ?? false,
    abuseSafety: profile?.abuse_safety_flag ?? false,
    practiceArea: null, // Will be resolved from practice_area_id if needed
  }
}

/**
 * Stubbed AI analysis. Returns reasonable defaults based on available context.
 * TODO: Replace with real AI provider call.
 */
function produceStubInsight(ctx: IntakeContext): AIInsight {
  const missingDataFlags: string[] = []
  if (!ctx.contactName) missingDataFlags.push('contact_name')
  if (!ctx.jurisdiction) missingDataFlags.push('jurisdiction')
  if (!ctx.preferredContactMethod) missingDataFlags.push('preferred_contact_method')
  if (ctx.opposingParties.length === 0) missingDataFlags.push('opposing_party_info')

  const urgencyFlags: string[] = []
  if (ctx.limitationRisk) urgencyFlags.push('limitation_period_approaching')
  if (ctx.abuseSafety) urgencyFlags.push('safety_concern_flagged')
  if (ctx.urgencyLevel === 'critical' || ctx.urgencyLevel === 'high') {
    urgencyFlags.push('high_urgency_reported')
  }

  return {
    practiceAreaSuggestion: ctx.practiceArea ?? null,
    intakeSummary: ctx.intakeNotes
      ? `Intake received${ctx.contactName ? ` from ${ctx.contactName}` : ''}.${ctx.jurisdiction ? ` Jurisdiction: ${ctx.jurisdiction}.` : ''}${missingDataFlags.length > 0 ? ` Missing: ${missingDataFlags.join(', ')}.` : ''}`
      : null,
    qualificationSuggestion: missingDataFlags.length > 2
      ? 'needs_lawyer_review'
      : urgencyFlags.length > 0
        ? 'qualified'
        : null,
    missingDataFlags,
    urgencyFlags,
    nextActionSuggestion: missingDataFlags.length > 0
      ? 'Collect missing intake data before proceeding'
      : 'Make first contact attempt',
    confidenceScores: {
      practice_area: 0.0, // Stubbed — no real AI analysis
      qualification: missingDataFlags.length > 2 ? 0.3 : 0.5,
    },
    modelInfo: 'stubbed',
  }
}
