/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Document Engine  -  Workflow Engine
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Evaluates workflow rules and triggers document generation or suggestions.
 * Called from stage advancement hooks, matter creation, lead conversion.
 *
 * Phase 1: Basic rule matching. Phase 2: Full workflow automation.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { DocumentWorkflowRuleRow } from '@/lib/types/database'
import { generateInstance } from './instance-service'
import { logInstanceEvent } from './audit-service'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ServiceResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

export interface WorkflowTriggerContext {
  tenantId: string
  matterId: string
  contactId?: string
  triggerType: string // 'matter_created' | 'stage_advanced' | 'lead_converted'
  triggerData?: Record<string, unknown>
}

export interface WorkflowMatch {
  rule: DocumentWorkflowRuleRow
  templateId: string
  autoGenerate: boolean
  autoSendForSignature: boolean
}

// ─── Evaluate Workflow Rules ─────────────────────────────────────────────────

export async function evaluateWorkflowRules(
  supabase: SupabaseClient<Database>,
  ctx: WorkflowTriggerContext
): Promise<ServiceResult<WorkflowMatch[]>> {
  // Fetch active rules matching trigger type
  const { data: rules, error } = await supabase
    .from('document_workflow_rules')
    .select('*')
    .eq('tenant_id', ctx.tenantId)
    .eq('trigger_type', ctx.triggerType)
    .eq('is_active', true)
    .eq('status', 'active')
    .order('created_at')

  if (error) {
    return { success: false, error: error.message }
  }

  if (!rules || rules.length === 0) {
    return { success: true, data: [] }
  }

  // Fetch matter data for rule matching
  const { data: matterRaw } = await (supabase as any)
    .from('matters')
    .select('practice_area_id, matter_type_id')
    .eq('id', ctx.matterId)
    .single()
  const matter = matterRaw as Record<string, unknown> | null

  const matches: WorkflowMatch[] = []

  for (const rule of rules) {
    if (matchesRule(rule as DocumentWorkflowRuleRow, matter, ctx)) {
      matches.push({
        rule: rule as DocumentWorkflowRuleRow,
        templateId: rule.template_id,
        autoGenerate: rule.auto_generate,
        autoSendForSignature: rule.auto_send_for_signature,
      })
    }
  }

  return { success: true, data: matches }
}

// ─── Process Trigger ─────────────────────────────────────────────────────────

export async function processDocumentWorkflowTrigger(
  supabase: SupabaseClient<Database>,
  ctx: WorkflowTriggerContext
): Promise<ServiceResult<{ matchedRules: number; generated: number; suggested: number }>> {
  const matchResult = await evaluateWorkflowRules(supabase, ctx)

  if (!matchResult.success || !matchResult.data) {
    return { success: false, error: matchResult.error }
  }

  let generated = 0
  let suggested = 0

  // ── REDLINE 5: Suppress all auto triggers for closed matters ───────────────
  const { data: matterForStatus } = await supabase
    .from('matters')
    .select('id, status')
    .eq('id', ctx.matterId)
    .single()

  if (matterForStatus && matterForStatus.status !== 'active') {
    // Closed matters: no auto-generation at all
    return {
      success: true,
      data: { matchedRules: matchResult.data.length, generated: 0, suggested: 0 },
    }
  }

  for (const match of matchResult.data) {
    // ── REDLINE 3: generation_tier enforcement ─────────────────────────────────
    // Fetch the template to check its generation_tier
    const { data: templateData } = await supabase
      .from('docgen_templates')
      .select('id, generation_tier')
      .eq('id', match.templateId)
      .single()

    const tier = templateData?.generation_tier ?? 'manual_only'

    // Check idempotency: skip if an active instance already exists for this matter+template
    const { data: existingInstances } = await supabase
      .from('document_instances')
      .select('id')
      .eq('matter_id', ctx.matterId)
      .eq('template_id', match.templateId)
      .eq('is_active', true)
      .in('status', ['draft', 'pending_review', 'approved', 'sent'])
      .limit(1)

    if (existingInstances && existingInstances.length > 0) {
      // Already has an active instance  -  skip to avoid duplicates
      suggested++
      continue
    }

    if (!match.autoGenerate || tier === 'manual_only') {
      // Manual-only: surface as suggestion, do not auto-generate
      suggested++
      continue
    }

    if (tier === 'auto_draft') {
      // Auto-draft: generate immediately in draft status
      const result = await generateInstance(supabase, {
        tenantId: ctx.tenantId,
        templateId: match.templateId,
        matterId: ctx.matterId,
        contactId: ctx.contactId,
        generationMode: 'workflow_trigger',
        generatedBy: match.rule.created_by ?? '',
      })
      if (result.success) {
        generated++
      } else {
        // Auto-generation failed  -  fall back to suggestion
        suggested++
      }
    } else if (tier === 'auto_draft_with_review') {
      // Auto-draft with review: generate then transition to pending_review
      const result = await generateInstance(supabase, {
        tenantId: ctx.tenantId,
        templateId: match.templateId,
        matterId: ctx.matterId,
        contactId: ctx.contactId,
        generationMode: 'workflow_trigger',
        generatedBy: match.rule.created_by ?? '',
      })
      if (result.success && result.data) {
        // Transition from draft → pending_review
        await supabase
          .from('document_instances')
          .update({ status: 'pending_review' } as never)
          .eq('id', result.data.id)

        await logInstanceEvent(supabase, {
          tenantId: ctx.tenantId,
          instanceId: result.data.id,
          eventType: 'status_changed',
          fromStatus: 'draft',
          toStatus: 'pending_review',
          eventPayload: { reason: 'Auto-generated with review required (generation_tier: auto_draft_with_review)' },
          performedBy: 'workflow_engine',
        })
        generated++
      } else {
        suggested++
      }
    } else {
      // Unknown tier  -  treat as suggestion
      suggested++
    }
  }

  return {
    success: true,
    data: {
      matchedRules: matchResult.data.length,
      generated,
      suggested,
    },
  }
}

// ─── Rule Matching ───────────────────────────────────────────────────────────

function matchesRule(
  rule: DocumentWorkflowRuleRow,
  matter: Record<string, unknown> | null,
  ctx: WorkflowTriggerContext
): boolean {
  if (!matter) return false

  // Match practice area (if specified on rule, compare to matter's practice_area_id)
  if (rule.practice_area && matter.practice_area_id !== rule.practice_area) {
    return false
  }

  // Match matter type (if specified)
  if (rule.matter_type_id && matter.matter_type_id !== rule.matter_type_id) {
    return false
  }

  // Match jurisdiction (if specified on rule  -  matters may not have this column)
  if (rule.jurisdiction_code && (matter as Record<string, unknown>).jurisdiction_code !== rule.jurisdiction_code) {
    return false
  }

  // Match document family (if specified  -  rule targets a specific family)
  // No additional check needed  -  rule.template_id already links to the family

  return true
}

// ─── Get Suggested Documents ─────────────────────────────────────────────────

export async function getSuggestedDocuments(
  supabase: SupabaseClient<Database>,
  params: { tenantId: string; matterId: string }
): Promise<ServiceResult<WorkflowMatch[]>> {
  return evaluateWorkflowRules(supabase, {
    tenantId: params.tenantId,
    matterId: params.matterId,
    triggerType: 'matter_created', // Check all creation-time rules
  })
}
