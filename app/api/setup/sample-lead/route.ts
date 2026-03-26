import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDefaultPipelineAndStage } from '@/lib/services/pipeline-resolver'

/**
 * POST /api/setup/sample-lead
 *
 * Creates a sample contact + lead for the onboarding "Aha!" moment.
 * Only creates if no leads exist yet for this tenant.
 */
export async function POST() {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    const { tenantId, userId } = auth

    // Skip if tenant already has leads
    const { count } = await admin
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)

    if ((count ?? 0) > 0) {
      return NextResponse.json({ success: true, skipped: true })
    }

    // 1. Create a sample contact
    const { data: contact, error: contactErr } = await admin
      .from('contacts')
      .insert({
        tenant_id: tenantId,
        first_name: 'Jane',
        last_name: 'Doe',
        email_primary: 'jane.doe@example.com',
        phone_primary: '+1 (416) 555-0123',
        contact_type: 'individual',
        province_state: 'ON',
        city: 'Toronto',
        country: 'Canada',
        source: 'onboarding_sample',
        created_by: userId,
      })
      .select('id')
      .single()

    if (contactErr || !contact) {
      console.error('[sample-lead] Contact creation failed:', contactErr)
      return NextResponse.json({ success: false, error: 'Contact creation failed' }, { status: 500 })
    }

    // 2. Resolve default pipeline + first stage
    const pipeline = await resolveDefaultPipelineAndStage(admin, tenantId)

    if (!pipeline.pipelineId || !pipeline.stageId) {
      return NextResponse.json({ success: false, error: 'No pipeline found' }, { status: 500 })
    }

    // 3. Create the sample lead
    const { data: lead, error: leadErr } = await admin
      .from('leads')
      .insert({
        tenant_id: tenantId,
        contact_id: contact.id,
        pipeline_id: pipeline.pipelineId,
        stage_id: pipeline.stageId,
        temperature: 'warm',
        source: 'referral',
        source_detail: 'Onboarding Sample  -  Test Case',
        notes: 'This is a sample lead created during onboarding. Use it to explore NorvaOS features like ID scanning, conflict checks, and the Command Centre.',
        status: 'open',
        created_by: userId,
      })
      .select('id')
      .single()

    if (leadErr || !lead) {
      console.error('[sample-lead] Lead creation failed:', leadErr)
      return NextResponse.json({ success: false, error: 'Lead creation failed' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      contactId: contact.id,
      leadId: lead.id,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[sample-lead] Error:', err)
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
