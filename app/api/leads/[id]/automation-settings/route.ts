import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import {
  isAutomationEnabled,
  getEnabledChannels,
  resolveTemplate,
  getTriggerSettingsOverrides,
} from '@/lib/services/lead-template-engine'
import {
  LEAD_AUTOMATION_TRIGGERS,
  getAllTriggerKeys,
  getTriggersByCategory,
} from '@/lib/config/lead-automation-triggers'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/leads/[id]/automation-settings
 *
 * Returns resolved automation settings for a lead's workspace.
 * Includes per-trigger enable/disable status, resolved channels,
 * and template preview data.
 *
 * This endpoint surfaces the three-tier resolution (system default →
 * workspace settings → workspace template overrides) so the UI can
 * display what automations are active and how they're configured.
 *
 * Query params:
 *   ?triggerKey=consultation_reminder_24h  — filter to specific trigger
 *   ?category=reminder                     — filter by category
 *   ?includeTemplates=true                 — include resolved template previews
 */
async function handleGet(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await params
    const auth = await authenticateRequest()
    requirePermission(auth, 'leads', 'view')

    // Verify lead belongs to tenant
    const { data: lead, error: leadErr } = await auth.supabase
      .from('leads')
      .select('id, tenant_id, practice_area_id')
      .eq('id', leadId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (leadErr || !lead) {
      return NextResponse.json(
        { success: false, error: 'Lead not found or access denied' },
        { status: 404 }
      )
    }

    const url = new URL(request.url)
    const filterTriggerKey = url.searchParams.get('triggerKey')
    const filterCategory = url.searchParams.get('category')
    const includeTemplates = url.searchParams.get('includeTemplates') === 'true'

    // Determine which triggers to resolve
    let triggerKeys: string[]
    if (filterTriggerKey) {
      triggerKeys = LEAD_AUTOMATION_TRIGGERS[filterTriggerKey] ? [filterTriggerKey] : []
    } else if (filterCategory) {
      const grouped = getTriggersByCategory()
      triggerKeys = (grouped[filterCategory] ?? []).map((t) => t.triggerKey)
    } else {
      triggerKeys = getAllTriggerKeys()
    }

    // Resolve each trigger's settings
    const automationSettings = await Promise.all(
      triggerKeys.map(async (triggerKey) => {
        const triggerDef = LEAD_AUTOMATION_TRIGGERS[triggerKey]
        if (!triggerDef) return null

        const [enabled, channels, overrides] = await Promise.all([
          isAutomationEnabled(
            auth.supabase,
            auth.tenantId,
            triggerKey,
            lead.practice_area_id ?? undefined
          ),
          getEnabledChannels(auth.supabase, auth.tenantId, triggerKey),
          getTriggerSettingsOverrides(auth.supabase, auth.tenantId, triggerKey),
        ])

        const result: Record<string, unknown> = {
          triggerKey,
          label: triggerDef.label,
          description: triggerDef.description,
          category: triggerDef.category,
          isEnabled: enabled,
          isSystemControlled: triggerDef.isSystemControlled,
          enabledChannels: channels,
          supportedChannels: triggerDef.supportedChannels,
          availableMergeFields: triggerDef.availableMergeFields,
          settingsOverrides: overrides,
        }

        // Optionally resolve template previews (using sample merge field values)
        if (includeTemplates) {
          const templates: Record<string, unknown> = {}
          for (const ch of channels) {
            const template = await resolveTemplate(
              auth.supabase,
              auth.tenantId,
              triggerKey,
              ch,
              // Use empty context — templates will show {{merge.fields}} unresolved
              {}
            )
            if (template) {
              templates[ch] = {
                subject: template.subject,
                body: template.body,
                isWorkspaceOverride: template.isWorkspaceOverride,
              }
            }
          }
          result.templates = templates
        }

        return result
      })
    )

    return NextResponse.json({
      success: true,
      automationSettings: automationSettings.filter(Boolean),
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[leads/automation-settings] GET error:', err)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const GET = withTiming(handleGet, 'GET /api/leads/[id]/automation-settings')
