/**
 * Sovereign Intake Service — Directive 42.0
 *
 * Atomic operations for the compliance-first intake flow.
 * Creates contact + lead + logs conflict clearance in one flow.
 */

import { createClient } from '@/lib/supabase/client'
import { withContactPIIEncrypted, withLeadPIIEncrypted } from '@/lib/services/pii-dual-write'

interface CreateIntakeParams {
  tenantId: string
  userId: string
  firstName: string
  lastName: string
  emailPrimary?: string
  phonePrimary?: string
  source?: string
  conflictSearchedAt: string
  pipelineId?: string
  stageId?: string
  practiceAreaId?: string
}

interface IntakeResult {
  contactId: string
  leadId: string
}

/**
 * Creates a contact and lead in a single flow.
 * The contact is created with client_status = 'lead' and the lead
 * is linked to the contact with auto conflict scan.
 */
export async function createSovereignIntake(params: CreateIntakeParams): Promise<IntakeResult> {
  const supabase = createClient()

  // 1. Create the contact
  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .insert({
      tenant_id: params.tenantId,
      contact_type: 'individual',
      first_name: params.firstName,
      last_name: params.lastName,
      email_primary: params.emailPrimary || null,
      phone_primary: params.phonePrimary || null,
      source: params.source || 'sovereign_intake',
      client_status: 'lead',
      pipeline_stage: 'new_lead',
      milestone: 'lead_created',
      created_by: params.userId,
      ...withContactPIIEncrypted({
        first_name: params.firstName,
        last_name: params.lastName,
        email_primary: params.emailPrimary || null,
        phone_primary: params.phonePrimary || null,
      }),
    })
    .select('id')
    .single()

  if (contactError) throw new Error(`Failed to create contact: ${contactError.message}`)

  // 2. Find the default pipeline and first stage if not provided
  let pipelineId = params.pipelineId
  let stageId = params.stageId

  if (!pipelineId) {
    const { data: pipeline } = await supabase
      .from('pipelines')
      .select('id')
      .eq('tenant_id', params.tenantId)
      .eq('is_default', true)
      .limit(1)
      .maybeSingle()

    if (pipeline) {
      pipelineId = pipeline.id

      if (!stageId) {
        const { data: stage } = await supabase
          .from('pipeline_stages')
          .select('id')
          .eq('pipeline_id', pipelineId)
          .order('position', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (stage) stageId = stage.id
      }
    }
  }

  if (!pipelineId || !stageId) {
    throw new Error('No default pipeline or stage found. Configure a pipeline in Settings first.')
  }

  // 3. Create the lead
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .insert({
      tenant_id: params.tenantId,
      contact_id: contact.id,
      pipeline_id: pipelineId,
      stage_id: stageId,
      temperature: 'warm',
      source: params.source || 'sovereign_intake',
      practice_area_id: params.practiceAreaId || null,
      created_by: params.userId,
      ...withLeadPIIEncrypted({}),
    })
    .select('id')
    .single()

  if (leadError) throw new Error(`Failed to create lead: ${leadError.message}`)

  // 4. Trigger auto conflict scan in background (fire-and-forget)
  fetch(`/api/contacts/${contact.id}/conflict-scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      triggerType: 'auto_create',
      leadId: lead.id,
    }),
  }).catch(() => {
    // Non-blocking — scan failure doesn't prevent intake completion
    console.warn('[sovereign-intake] Auto conflict scan failed (non-blocking)')
  })

  return {
    contactId: contact.id,
    leadId: lead.id,
  }
}
