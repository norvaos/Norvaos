import type { ActionDefinition } from '../types'
import { assertOk } from '../db-assert'
import { frontDeskCreateIntakeSchema, type FrontDeskCreateIntakeInput } from '@/lib/schemas/workflow-actions'
import { resolveDefaultPipelineAndStage } from '@/lib/services/pipeline-resolver'

interface FrontDeskCreateIntakeResult {
  contactId: string
  leadId: string | null
  appointmentRequested: boolean
  existingContact: boolean
}

export const frontDeskCreateIntakeAction: ActionDefinition<FrontDeskCreateIntakeInput, FrontDeskCreateIntakeResult> = {
  type: 'front_desk_create_intake',
  label: 'Create Intake (Front Desk)',
  inputSchema: frontDeskCreateIntakeSchema,
  permission: { entity: 'contacts', action: 'create' },
  allowedSources: ['front_desk'],
  entityType: 'contact',
  getEntityId: () => 'new', // Contact doesn't exist yet

  async execute({ input, tenantId, userId, supabase }) {
    if (!userId) throw new Error('User authentication required')

    // 0. Deduplication check — prevent creating duplicate contacts
    const phone = input.phone.trim()
    const email = input.email?.trim() || null
    let existingContactId: string | null = null

    // Check by phone first (primary identifier)
    const { data: byPhone } = await supabase
      .from('contacts')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('phone_primary', phone)
      .eq('is_archived', false)
      .limit(1)
      .maybeSingle()

    if (byPhone) {
      existingContactId = byPhone.id
    } else if (email) {
      // Check by email if no phone match
      const { data: byEmail } = await supabase
        .from('contacts')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('email_primary', email)
        .eq('is_archived', false)
        .limit(1)
        .maybeSingle()

      if (byEmail) {
        existingContactId = byEmail.id
      }
    }

    // 1. Create contact or use existing
    let contactId: string
    const isExisting = !!existingContactId

    if (existingContactId) {
      // Use existing contact — update fields if provided
      contactId = existingContactId
      await supabase
        .from('contacts')
        .update({
          first_name: input.firstName,
          last_name: input.lastName,
          ...(email ? { email_primary: email } : {}),
          custom_fields: {
            language: input.language ?? null,
            preferred_contact_method: input.preferredContactMethod ?? null,
          },
        })
        .eq('id', existingContactId)
    } else {
      const contact = assertOk(
        await supabase
          .from('contacts')
          .insert({
            tenant_id: tenantId,
            first_name: input.firstName,
            last_name: input.lastName,
            phone_primary: phone,
            email_primary: email,
            source: input.source ?? 'front_desk',
            created_by: userId,
            custom_fields: {
              language: input.language ?? null,
              preferred_contact_method: input.preferredContactMethod ?? null,
            },
          })
          .select('id')
          .single(),
        'front_desk_create_intake:create_contact'
      )
      contactId = contact!.id
    }

    let leadId: string | null = null

    // 2. If entityType is 'lead', create a lead linked to the contact
    if (input.entityType === 'lead') {
      // Check if this contact already has an open lead (avoid duplicate leads too)
      const { data: existingLead } = await supabase
        .from('leads')
        .select('id')
        .eq('contact_id', contactId)
        .eq('tenant_id', tenantId)
        .eq('status', 'open')
        .limit(1)
        .maybeSingle()

      if (existingLead) {
        // Use the existing open lead
        leadId = existingLead.id
      } else {
        // Resolve default pipeline + first stage for this tenant (shared utility)
        const { pipelineId, stageId } = await resolveDefaultPipelineAndStage(supabase, tenantId)

        const temperatureMap: Record<string, string> = {
          high: 'hot',
          medium: 'warm',
          low: 'cold',
        }

        const lead = assertOk(
          await supabase
            .from('leads')
            .insert({
              tenant_id: tenantId,
              contact_id: contactId,
              pipeline_id: pipelineId,
              stage_id: stageId,
              practice_area_id: input.practiceAreaId ?? null,
              temperature: temperatureMap[input.urgency] ?? 'warm',
              status: 'open',
              source: input.source ?? 'front_desk',
              notes: input.reason,
              created_by: userId,
            })
            .select('id')
            .single(),
          'front_desk_create_intake:create_lead'
        )
        leadId = lead!.id
      }
    }

    const entityLabel = input.entityType === 'lead' ? 'lead' : 'contact'
    const actionVerb = isExisting ? 'updated' : 'created'

    return {
      data: {
        contactId,
        leadId,
        appointmentRequested: input.appointmentRequested,
        existingContact: isExisting,
      },
      newState: {
        contact_id: contactId,
        lead_id: leadId,
        entity_type: input.entityType,
        appointment_requested: input.appointmentRequested,
        existing_contact: isExisting,
      },
      activity: {
        activityType: 'intake_created',
        title: `${isExisting ? 'Existing' : 'New'} ${entityLabel} ${actionVerb} via front desk`,
        description: input.reason,
        metadata: {
          contact_id: contactId,
          lead_id: leadId,
          entity_type: input.entityType,
          first_name: input.firstName,
          last_name: input.lastName,
          practice_area_id: input.practiceAreaId,
          urgency: input.urgency,
          appointment_requested: input.appointmentRequested,
          source: input.source ?? 'front_desk',
          existing_contact: isExisting,
        },
        contactId,
      },
    }
  },

  notificationEvent: 'front_desk_intake_created',
  buildNotification: (_ctx, result) => {
    const label = result.leadId ? 'lead' : 'contact'
    return {
      recipientUserIds: [], // Dispatched to supervisors via notification routing
      title: `New ${label} intake created at front desk`,
      message: `Contact ${result.contactId} created via front desk intake.`,
      priority: 'normal',
    }
  },
}
