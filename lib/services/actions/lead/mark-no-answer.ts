import type { ActionDefinition } from '../types'
import { assertNoError } from '../db-assert'
import { markNoAnswerSchema, type MarkNoAnswerInput } from '@/lib/schemas/workflow-actions'

interface MarkNoAnswerResult {
  leadId: string
  attemptCount: number
  autoFollowUpTriggered: boolean
}

export const markNoAnswerAction: ActionDefinition<MarkNoAnswerInput, MarkNoAnswerResult> = {
  type: 'mark_no_answer',
  label: 'Mark Lead No Answer',
  inputSchema: markNoAnswerSchema,
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

    // 2. Increment attempt counter
    const newCount = (lead.follow_up_count ?? 0) + 1

    assertNoError(
      await supabase
        .from('leads')
        .update({
          follow_up_count: newCount,
          last_contact_date: new Date().toISOString(),
        })
        .eq('id', input.leadId)
        .eq('tenant_id', tenantId),
      'mark_no_answer:update_lead'
    )

    // 3. Auto follow-up after 3 attempts (Rule #12)
    let autoFollowUpTriggered = false
    if (newCount >= 3) {
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + 1)

      // Idempotent: check if auto follow-up task already exists
      const { data: existing } = await supabase
        .from('tasks')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('title', `Auto follow-up: Lead unreached (${newCount} attempts)`)
        .eq('created_via', 'automation')
        .limit(1)

      if (!existing || existing.length === 0) {
        assertNoError(
          await supabase.from('tasks').insert({
            tenant_id: tenantId,
            title: `Auto follow-up: Lead unreached (${newCount} attempts)`,
            description: input.notes
              ? `Notes: ${input.notes}`
              : `Lead has been called ${newCount} times with no answer. Automatic follow-up required.`,
            priority: newCount >= 5 ? 'urgent' : 'high',
            due_date: dueDate.toISOString().split('T')[0],
            assigned_to: lead.assigned_to ?? userId,
            created_by: userId,
            created_via: 'automation',
            status: 'not_started',
          }),
          'mark_no_answer:create_follow_up_task'
        )
        autoFollowUpTriggered = true
      }
    }

    return {
      data: {
        leadId: input.leadId,
        attemptCount: newCount,
        autoFollowUpTriggered,
      },
      newState: {
        follow_up_count: newCount,
        last_contact_date: new Date().toISOString(),
      },
      activity: {
        activityType: 'call_no_answer',
        title: `No answer — attempt #${newCount}`,
        description: input.notes ?? `Call attempt #${newCount} — no answer`,
        metadata: {
          attempt_count: newCount,
          auto_follow_up_triggered: autoFollowUpTriggered,
        },
        contactId: lead.contact_id,
      },
    }
  },

  getMatterId: () => null,
}
