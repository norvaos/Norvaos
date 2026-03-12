import type { ActionDefinition } from '../types'
import { assertNoError } from '../db-assert'
import { sendFollowUpSchema, type SendFollowUpInput } from '@/lib/schemas/workflow-actions'

interface SendFollowUpResult {
  leadId: string
  emailQueued: boolean
}

export const sendFollowUpAction: ActionDefinition<SendFollowUpInput, SendFollowUpResult> = {
  type: 'send_follow_up',
  label: 'Send Follow-Up to Lead',
  inputSchema: sendFollowUpSchema,
  permission: { entity: 'leads', action: 'edit' },
  allowedSources: ['front_desk', 'command_centre', 'dashboard'],
  entityType: 'lead',
  getEntityId: (input) => input.leadId,

  async snapshotBefore({ input, supabase, tenantId }) {
    const { data } = await supabase
      .from('leads')
      .select('status, temperature, follow_up_count')
      .eq('id', input.leadId)
      .eq('tenant_id', tenantId)
      .single()
    return data as Record<string, unknown> | null
  },

  async execute({ input, tenantId, userId, supabase }) {
    // 1. Verify lead and get contact info
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id, contact_id, follow_up_count')
      .eq('id', input.leadId)
      .eq('tenant_id', tenantId)
      .single()

    if (leadErr || !lead) {
      throw new Error('Lead not found')
    }

    // 2. Get contact email
    let recipientEmail: string | null = null
    if (lead.contact_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('email_primary')
        .eq('id', lead.contact_id)
        .single()
      recipientEmail = contact?.email_primary ?? null
    }

    // 3. Queue the follow-up (non-blocking email send handled after action completes)
    // For now, record the intent. Actual email dispatch is handled by notification engine.
    const followUpData = {
      method: input.method,
      template_id: input.templateId ?? null,
      custom_message: input.customMessage ?? null,
      subject: input.subject ?? null,
      recipient_email: recipientEmail,
    }

    // Update lead follow-up tracking
    assertNoError(
      await supabase
        .from('leads')
        .update({
          follow_up_count: (lead.follow_up_count ?? 0) + 1,
          last_contact_date: new Date().toISOString(),
        })
        .eq('id', input.leadId)
        .eq('tenant_id', tenantId),
      'send_follow_up:update_lead'
    )

    return {
      data: {
        leadId: input.leadId,
        emailQueued: !!recipientEmail,
      },
      newState: {
        follow_up_count: (lead.follow_up_count ?? 0) + 1,
        last_contact_date: new Date().toISOString(),
        follow_up_sent: followUpData,
      },
      activity: {
        activityType: 'follow_up_sent',
        title: `Follow-up ${input.method} sent`,
        description: input.customMessage ?? `Follow-up sent via ${input.method}`,
        metadata: followUpData,
        contactId: lead.contact_id,
      },
    }
  },

  getMatterId: () => null,
}
