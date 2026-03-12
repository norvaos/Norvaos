/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Document Engine — Workflow Engine
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
  const { data: matter } = await supabase
    .from('matters')
    .select('practice_area, matter_type_id, jurisdiction_code')
    .eq('id', ctx.matterId)
    .single()

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

  for (const match of matchResult.data) {
    if (match.autoGenerate) {
      // Auto-generation will be called by the instance service
      // For Phase 1, we log it as a suggestion instead
      suggested++
    } else {
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

  // Match practice area (if specified)
  if (rule.practice_area && matter.practice_area !== rule.practice_area) {
    return false
  }

  // Match matter type (if specified)
  if (rule.matter_type_id && matter.matter_type_id !== rule.matter_type_id) {
    return false
  }

  // Match jurisdiction (if specified)
  if (rule.jurisdiction_code && matter.jurisdiction_code !== rule.jurisdiction_code) {
    return false
  }

  // Match document family (if specified — rule targets a specific family)
  // No additional check needed — rule.template_id already links to the family

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
