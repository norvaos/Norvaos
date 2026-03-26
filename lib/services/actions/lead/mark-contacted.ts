import type { ActionDefinition } from '../types'
import { assertNoError } from '../db-assert'
import { markContactedSchema, type MarkContactedInput } from '@/lib/schemas/workflow-actions'

interface MarkContactedResult {
  leadId: string
  stageAdvanced: boolean
  newTemperature: string
}

export const markContactedAction: ActionDefinition<MarkContactedInput, MarkContactedResult> = {
  type: 'mark_contacted',
  label: 'Mark Lead as Contacted',
  inputSchema: markContactedSchema,
  permission: { entity: 'leads', action: 'edit' },
  allowedSources: ['front_desk', 'command_centre', 'dashboard'],
  entityType: 'lead',
  getEntityId: (input) => input.leadId,

  async snapshotBefore({ input, supabase, tenantId }) {
    const { data } = await supabase
      .from('leads')
      .select('status, temperature, stage_id, follow_up_count, next_follow_up')
      .eq('id', input.leadId)
      .eq('tenant_id', tenantId)
      .single()
    return data as Record<string, unknown> | null
  },

  async execute({ input, tenantId, userId, supabase }) {
    // 1. Verify lead exists and belongs to tenant
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id, pipeline_id, stage_id, temperature, follow_up_count, contact_id')
      .eq('id', input.leadId)
      .eq('tenant_id', tenantId)
      .single()

    if (leadErr || !lead) {
      throw new Error('Lead not found')
    }

    // 2. Determine new temperature based on outcome
    const newTemp = input.outcome === 'connected' ? 'warm' : lead.temperature

    // 3. Update lead
    const updates: Record<string, unknown> = {
      temperature: newTemp,
      follow_up_count: (lead.follow_up_count ?? 0) + 1,
      last_contact_date: new Date().toISOString(),
    }

    if (input.nextFollowUp) {
      updates.next_follow_up = input.nextFollowUp
    }

    assertNoError(
      await supabase
        .from('leads')
        .update(updates)
        .eq('id', input.leadId)
        .eq('tenant_id', tenantId),
      'mark_contacted:update_lead'
    )

    // 4. Fetch updated lead for new_state snapshot
    const { data: updatedLead } = await supabase
      .from('leads')
      .select('status, temperature, stage_id, follow_up_count, next_follow_up')
      .eq('id', input.leadId)
      .single()

    return {
      data: {
        leadId: input.leadId,
        stageAdvanced: false,
        newTemperature: newTemp ?? 'cold',
      },
      newState: updatedLead as Record<string, unknown> | null,
      activity: {
        activityType: 'lead_contacted',
        title: `Lead contacted  -  ${input.outcome}`,
        description: input.callNotes,
        metadata: {
          outcome: input.outcome,
          direction: 'outbound',
          notes: input.callNotes,
        },
        contactId: lead.contact_id,
      },
    }
  },

  automationTrigger: 'stage_change',
  getMatterId: () => null, // Leads don't have matter IDs

  notificationEvent: 'lead_contacted',
  buildNotification: () => null, // No notification for mark contacted
}
