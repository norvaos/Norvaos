import type { ActionDefinition } from '../types'
import { assertNoError } from '../db-assert'
import { logCallSchema, type LogCallInput } from '@/lib/schemas/workflow-actions'

interface LogCallResult {
  leadId: string
  activityCreated: boolean
  followUpTriggered: boolean
}

export const logCallAction: ActionDefinition<LogCallInput, LogCallResult> = {
  type: 'log_call',
  label: 'Log Call on Lead',
  inputSchema: logCallSchema,
  permission: { entity: 'leads', action: 'edit' },
  allowedSources: ['front_desk', 'command_centre', 'dashboard'],
  entityType: 'lead',
  getEntityId: (input) => input.leadId,

  async snapshotBefore({ input, supabase, tenantId }) {
    const { data } = await supabase
      .from('leads')
      .select('status, temperature, follow_up_count, last_contact_date')
      .eq('id', input.leadId)
      .eq('tenant_id', tenantId)
      .single()
    return data as Record<string, unknown> | null
  },

  async execute({ input, tenantId, userId, supabase }) {
    // 1. Verify lead
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id, contact_id, follow_up_count, assigned_to')
      .eq('id', input.leadId)
      .eq('tenant_id', tenantId)
      .single()

    if (leadErr || !lead) {
      throw new Error('Lead not found')
    }

    // 2. Update lead contact tracking
    const newFollowUpCount = input.outcome === 'no_answer'
      ? (lead.follow_up_count ?? 0) + 1
      : (lead.follow_up_count ?? 0)

    assertNoError(
      await supabase
        .from('leads')
        .update({
          follow_up_count: newFollowUpCount,
          last_contact_date: new Date().toISOString(),
        })
        .eq('id', input.leadId)
        .eq('tenant_id', tenantId),
      'log_call:update_lead'
    )

    // 3. If unreached 3+ times, create follow-up task (Rule #12: auto follow-up)
    let followUpTriggered = false
    if (input.outcome === 'no_answer' && newFollowUpCount >= 3) {
      // Check if task already exists (idempotent)
      const { data: existingTask } = await supabase
        .from('tasks')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('title', `Follow up: Lead unreached after ${newFollowUpCount} attempts`)
        .eq('created_via', 'automation')
        .limit(1)

      if (!existingTask || existingTask.length === 0) {
        const dueDate = new Date()
        dueDate.setDate(dueDate.getDate() + 1)

        assertNoError(
          await supabase.from('tasks').insert({
            tenant_id: tenantId,
            title: `Follow up: Lead unreached after ${newFollowUpCount} attempts`,
            description: `Lead has been called ${newFollowUpCount} times with no answer. Last attempt notes: ${input.notes}`,
            priority: 'high',
            due_date: dueDate.toISOString().split('T')[0],
            assigned_to: lead.assigned_to ?? userId,
            created_by: userId,
            created_via: 'automation',
            status: 'not_started',
          }),
          'log_call:create_follow_up_task'
        )
        followUpTriggered = true
      }
    }

    return {
      data: {
        leadId: input.leadId,
        activityCreated: true,
        followUpTriggered,
      },
      newState: {
        follow_up_count: newFollowUpCount,
        last_contact_date: new Date().toISOString(),
      },
      activity: {
        activityType: 'call_logged',
        title: `Call logged  -  ${input.direction} ${input.outcome}`,
        description: input.notes,
        metadata: {
          direction: input.direction,
          outcome: input.outcome,
          duration_minutes: input.durationMinutes,
          contact_phone: input.contactPhone,
          follow_up_triggered: followUpTriggered,
        },
        contactId: lead.contact_id,
      },
    }
  },

  getMatterId: () => null,
}
