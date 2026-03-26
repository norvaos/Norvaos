/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Lead Template Engine  -  Three-Tier Template Resolution + Merge Fields
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Resolves automation message templates using a three-tier hierarchy:
 *   1. System defaults (from LEAD_AUTOMATION_TRIGGERS registry  -  always present)
 *   2. Workspace template overrides (from lead_message_templates  -  optional)
 *   3. Merge field substitution (from TemplateContext  -  applied to resolved template)
 *
 * Also provides automation enable/disable checks with practice-area scoping.
 *
 * Template resolution happens BEFORE calling logCommunicationEvent()  - 
 * the communication engine receives already-resolved subject/body strings.
 * This keeps concerns separated: templates here, workflow there.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import {
  LEAD_AUTOMATION_TRIGGERS,
  isSystemControlledTrigger,
  getSystemDefaultTemplate,
} from '@/lib/config/lead-automation-triggers'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ResolvedTemplate {
  /** Resolved subject (null for channels that don't use subjects, e.g., sms, in_app) */
  subject: string | null
  /** Resolved body text with merge fields substituted */
  body: string
  /** Channel this template was resolved for */
  channel: string
  /** Trigger key this template belongs to */
  triggerKey: string
  /** Whether the template came from a workspace override (true) or system default (false) */
  isWorkspaceOverride: boolean
}

export interface TemplateContext {
  contact?: { name?: string; email?: string; phone?: string }
  lead?: { id?: string; stage?: string; practiceArea?: string }
  consultation?: { date?: string; time?: string; type?: string; lawyer?: string }
  followup?: { step?: number; totalSteps?: number; daysSince?: number }
  closure?: { reason?: string; stage?: string; idleDays?: number }
  retainer?: { fee?: string | number; type?: string; sentDate?: string }
  firm?: { name?: string }
  custom?: Record<string, string | number>
}

// ─── Template Resolution ─────────────────────────────────────────────────────

/**
 * Resolve a template for a given trigger and channel.
 *
 * Resolution order:
 * 1. Check lead_message_templates for workspace override (tenant_id + trigger_key + channel)
 * 2. Fall back to system default from LEAD_AUTOMATION_TRIGGERS registry
 * 3. Substitute merge fields using provided context
 *
 * Returns null if no template is available (trigger or channel not found).
 */
export async function resolveTemplate(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  triggerKey: string,
  channel: string,
  context: TemplateContext
): Promise<ResolvedTemplate | null> {
  // 1. Try workspace override
  const { data: workspaceTemplate } = await supabase
    .from('lead_message_templates')
    .select('subject, body')
    .eq('tenant_id', tenantId)
    .eq('trigger_key', triggerKey)
    .eq('channel', channel)
    .eq('is_active', true)
    .maybeSingle()

  if (workspaceTemplate) {
    return {
      subject: workspaceTemplate.subject
        ? substituteMergeFields(workspaceTemplate.subject, context)
        : null,
      body: substituteMergeFields(workspaceTemplate.body, context),
      channel,
      triggerKey,
      isWorkspaceOverride: true,
    }
  }

  // 2. Fall back to system default
  const systemDefault = getSystemDefaultTemplate(triggerKey, channel)
  if (!systemDefault) {
    return null
  }

  return {
    subject: systemDefault.subject
      ? substituteMergeFields(systemDefault.subject, context)
      : null,
    body: substituteMergeFields(systemDefault.body, context),
    channel,
    triggerKey,
    isWorkspaceOverride: false,
  }
}

/**
 * Resolve templates for all enabled channels for a trigger.
 * Returns an array of resolved templates, one per enabled channel.
 */
export async function resolveTemplatesForAllChannels(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  triggerKey: string,
  context: TemplateContext
): Promise<ResolvedTemplate[]> {
  const channels = await getEnabledChannels(supabase, tenantId, triggerKey)
  const results: ResolvedTemplate[] = []

  for (const channel of channels) {
    const template = await resolveTemplate(supabase, tenantId, triggerKey, channel, context)
    if (template) {
      results.push(template)
    }
  }

  return results
}

// ─── Merge Field Substitution ────────────────────────────────────────────────

/**
 * Merge field regex: matches {{path.field}} patterns.
 * Supports nested paths like {{contact.name}}, {{consultation.date}}.
 */
const MERGE_FIELD_REGEX = /\{\{([a-zA-Z_][a-zA-Z0-9_.]*)\}\}/g

/**
 * Substitute merge fields in a template string.
 *
 * Uses {{path.field}} syntax (e.g., {{contact.name}}, {{consultation.date}}).
 * Unresolved fields are left as-is (not removed)  -  visible in logs for debugging.
 *
 * @param template - Template string with {{merge.field}} placeholders
 * @param context - Data context for field resolution
 * @returns Template with resolved merge fields
 */
export function substituteMergeFields(
  template: string,
  context: TemplateContext
): string {
  // Flatten context into a dot-notation lookup map
  const flatMap = flattenContext(context)

  return template.replace(MERGE_FIELD_REGEX, (match, fieldPath: string) => {
    const value = flatMap[fieldPath]
    if (value !== undefined && value !== null) {
      return String(value)
    }
    // Leave unresolved fields as-is for debugging visibility
    return match
  })
}

/**
 * Flatten a TemplateContext object into a dot-notation lookup map.
 *
 * Example:
 *   { contact: { name: 'Jane' }, lead: { stage: 'new' } }
 *   → { 'contact.name': 'Jane', 'lead.stage': 'new' }
 */
function flattenContext(
  context: TemplateContext
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {}

  for (const [topKey, topValue] of Object.entries(context)) {
    if (topValue && typeof topValue === 'object') {
      for (const [nestedKey, nestedValue] of Object.entries(topValue)) {
        if (nestedValue !== undefined && nestedValue !== null) {
          result[`${topKey}.${nestedKey}`] = nestedValue as string | number | boolean
        }
      }
    }
  }

  return result
}

// ─── Automation Enable/Disable Checks ────────────────────────────────────────

/**
 * Check if an automation trigger is enabled for a workspace.
 *
 * Resolution:
 * 1. System-controlled triggers → always enabled (cannot be disabled)
 * 2. Check lead_automation_settings for workspace override
 * 3. Fall back to trigger's isEnabledByDefault from registry
 *
 * Optionally filters by practice area if the trigger has practice_area_ids set
 * in the workspace settings.
 */
export async function isAutomationEnabled(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  triggerKey: string,
  practiceAreaId?: string
): Promise<boolean> {
  // System-controlled triggers cannot be disabled
  if (isSystemControlledTrigger(triggerKey)) {
    return true
  }

  // Check workspace override
  const { data: setting } = await supabase
    .from('lead_automation_settings')
    .select('is_enabled, practice_area_ids')
    .eq('tenant_id', tenantId)
    .eq('trigger_key', triggerKey)
    .maybeSingle()

  if (!setting) {
    // No workspace override  -  use registry default
    const trigger = LEAD_AUTOMATION_TRIGGERS[triggerKey]
    return trigger?.isEnabledByDefault ?? false
  }

  // If disabled, return false regardless of practice area
  if (!setting.is_enabled) {
    return false
  }

  // If practice area scoping is set, check if the lead's practice area matches
  if (practiceAreaId && setting.practice_area_ids) {
    const scopedAreas = Array.isArray(setting.practice_area_ids)
      ? (setting.practice_area_ids as string[])
      : []
    if (scopedAreas.length > 0 && !scopedAreas.includes(practiceAreaId)) {
      return false
    }
  }

  return true
}

/**
 * Get all enabled channels for a trigger in a workspace.
 *
 * Resolution:
 * 1. Check lead_automation_settings.enabled_channels (if non-empty array)
 * 2. Fall back to trigger's supportedChannels from registry
 */
export async function getEnabledChannels(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  triggerKey: string
): Promise<string[]> {
  // Check workspace override
  const { data: setting } = await supabase
    .from('lead_automation_settings')
    .select('enabled_channels')
    .eq('tenant_id', tenantId)
    .eq('trigger_key', triggerKey)
    .maybeSingle()

  if (setting?.enabled_channels) {
    const channels = Array.isArray(setting.enabled_channels)
      ? (setting.enabled_channels as string[])
      : []
    if (channels.length > 0) {
      return channels
    }
  }

  // Fall back to trigger's default supported channels
  const trigger = LEAD_AUTOMATION_TRIGGERS[triggerKey]
  return trigger?.supportedChannels ?? []
}

/**
 * Get trigger-specific settings overrides for a workspace.
 * Returns the raw JSONB overrides object, or empty object if none set.
 */
export async function getTriggerSettingsOverrides(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  triggerKey: string
): Promise<Record<string, unknown>> {
  const { data: setting } = await supabase
    .from('lead_automation_settings')
    .select('settings_overrides')
    .eq('tenant_id', tenantId)
    .eq('trigger_key', triggerKey)
    .maybeSingle()

  if (setting?.settings_overrides && typeof setting.settings_overrides === 'object' && !Array.isArray(setting.settings_overrides)) {
    return setting.settings_overrides as Record<string, unknown>
  }

  return {}
}

// ─── Template Context Builders ───────────────────────────────────────────────

/**
 * Build a base template context with firm and lead info.
 * Call site should add trigger-specific fields (consultation, followup, etc.).
 */
export async function buildBaseTemplateContext(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  leadId: string
): Promise<TemplateContext> {
  // Fetch firm name
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name')
    .eq('id', tenantId)
    .single()

  // Fetch lead + contact info
  const { data: lead } = await supabase
    .from('leads')
    .select('contact_id, current_stage, practice_area_id')
    .eq('id', leadId)
    .single()

  let contactName: string | undefined
  let contactEmail: string | undefined
  if (lead?.contact_id) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('first_name, last_name, email_primary')
      .eq('id', lead.contact_id)
      .single()
    if (contact) {
      contactName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || undefined
      contactEmail = contact.email_primary ?? undefined
    }
  }

  return {
    firm: { name: tenant?.name ?? '' },
    contact: {
      name: contactName,
      email: contactEmail,
    },
    lead: {
      id: leadId,
      stage: lead?.current_stage ?? undefined,
    },
  }
}
