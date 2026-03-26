import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type Json = Database['public']['Tables']['activities']['Insert']['metadata']

// ─── Types ──────────────────────────────────────────────────────────────────

interface OutcomeData {
  issue_date?: string
  validity_date?: string
  expiry_date?: string
  refusal_grounds?: string
  refusal_category?: string
  hearing_date?: string
  hearing_location?: string
  notes?: string
  [key: string]: unknown
}

interface RecordOutcomeResult {
  success: boolean
  error?: string
  outcomeEventId?: string
}

interface NextStepResult {
  success: boolean
  error?: string
  newMatterId?: string
}

type NextAction = 'reconsideration' | 'judicial_review' | 'appeal' | 'fresh_application' | 'no_action'

// ─── Record Outcome Event ───────────────────────────────────────────────────

/**
 * Record a matter outcome event (approval, refusal, biometric, etc.).
 * Handles type-specific logic:
 *   - approval: creates contact_status_records with expiry, schedules reminders
 *   - refusal: sets next_action options
 *   - biometric: creates deadline
 */
export async function recordOutcomeEvent(
  supabase: SupabaseClient<Database>,
  matterId: string,
  eventType: string,
  outcomeData: OutcomeData,
  createdBy: string
): Promise<RecordOutcomeResult> {
  // 1. Fetch matter context
  const { data: matter, error: matterErr } = await supabase
    .from('matters')
    .select('id, tenant_id, title')
    .eq('id', matterId)
    .single()

  if (matterErr || !matter) {
    return { success: false, error: 'Matter not found' }
  }

  const tenantId = matter.tenant_id

  // 2. Insert outcome event
  const { data: event, error: eventErr } = await supabase
    .from('matter_outcome_events')
    .insert({
      tenant_id: tenantId,
      matter_id: matterId,
      event_type: eventType,
      outcome_data: outcomeData as unknown as Database['public']['Tables']['matter_outcome_events']['Insert']['outcome_data'],
      created_by: createdBy,
    })
    .select('id')
    .single()

  if (eventErr || !event) {
    return { success: false, error: `Failed to record outcome: ${eventErr?.message}` }
  }

  // 3. Type-specific logic
  try {
    switch (eventType) {
      case 'approval': {
        await handleApproval(supabase, tenantId, matterId, outcomeData, createdBy)
        break
      }
      case 'refusal': {
        // Refusal is recorded  -  next_action is set later via initiateRefusalNextStep
        break
      }
      case 'biometric': {
        await handleBiometric(supabase, tenantId, matterId, outcomeData, createdBy)
        break
      }
      case 'medical': {
        await handleMedical(supabase, tenantId, matterId, outcomeData, createdBy)
        break
      }
      case 'passport_request': {
        await handlePassportRequest(supabase, tenantId, matterId, outcomeData, createdBy)
        break
      }
    }
  } catch {
    // Type-specific logic failure is non-blocking for the core event record
  }

  // 4. Log activity
  await supabase.from('activities').insert({
    tenant_id: tenantId,
    matter_id: matterId,
    activity_type: 'outcome_recorded',
    title: `Outcome recorded: ${eventType}`,
    description: `${eventType} event recorded for matter "${matter.title}"`,
    entity_type: 'matter',
    entity_id: matterId,
    user_id: createdBy,
    metadata: {
      event_type: eventType,
      outcome_event_id: event.id,
      outcome_data: outcomeData,
    } as Json,
  })

  return { success: true, outcomeEventId: event.id }
}

// ─── Initiate Refusal Next Step ─────────────────────────────────────────────

/**
 * After a refusal, initiate the next step: reconsideration, JR, appeal, or fresh app.
 * Creates a new matter with data carried forward from the canonical profile snapshot.
 * Links the new matter to the original via next_matter_id.
 */
export async function initiateRefusalNextStep(
  supabase: SupabaseClient<Database>,
  matterId: string,
  nextAction: NextAction,
  createdBy: string
): Promise<NextStepResult> {
  if (nextAction === 'no_action') {
    // Update the most recent refusal event
    const { data: refusalEvent } = await supabase
      .from('matter_outcome_events')
      .select('id')
      .eq('matter_id', matterId)
      .eq('event_type', 'refusal')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (refusalEvent) {
      await supabase
        .from('matter_outcome_events')
        .update({ next_action: 'no_action' })
        .eq('id', refusalEvent.id)
    }

    return { success: true }
  }

  // 1. Fetch original matter
  const { data: originalMatter, error: matterErr } = await supabase
    .from('matters')
    .select('*')
    .eq('id', matterId)
    .single()

  if (matterErr || !originalMatter) {
    return { success: false, error: 'Original matter not found' }
  }

  const tenantId = originalMatter.tenant_id

  // 2. Determine the new matter title based on next action
  const actionLabels: Record<string, string> = {
    reconsideration: 'Reconsideration',
    judicial_review: 'Judicial Review',
    appeal: 'Appeal',
    fresh_application: 'Fresh Application',
  }

  const newTitle = `${originalMatter.title}  -  ${actionLabels[nextAction]}`

  // 3. Create new matter (carry forward key fields)
  const { data: newMatter, error: newMatterErr } = await supabase
    .from('matters')
    .insert({
      tenant_id: tenantId,
      title: newTitle,
      status: 'active',
      priority: originalMatter.priority ?? 'medium',
      practice_area_id: originalMatter.practice_area_id,
      matter_type_id: originalMatter.matter_type_id,
      responsible_lawyer_id: originalMatter.responsible_lawyer_id,
      originating_lawyer_id: originalMatter.originating_lawyer_id,
      date_opened: new Date().toISOString().split('T')[0],
      billing_type: originalMatter.billing_type,
    })
    .select('id')
    .single()

  if (newMatterErr || !newMatter) {
    return { success: false, error: `Failed to create new matter: ${newMatterErr?.message}` }
  }

  // 4. Link matter contacts from original
  const { data: contacts } = await supabase
    .from('matter_contacts')
    .select('contact_id, role')
    .eq('matter_id', matterId)

  if (contacts && contacts.length > 0) {
    const contactInserts = contacts.map((c) => ({
      tenant_id: tenantId,
      matter_id: newMatter.id,
      contact_id: c.contact_id,
      role: c.role,
    }))

    await supabase.from('matter_contacts').insert(contactInserts)
  }

  // 5. Copy canonical profile snapshot from original matter to new matter
  const { data: snapshots } = await supabase
    .from('canonical_profile_snapshots')
    .select('*')
    .eq('matter_id', matterId)

  if (snapshots && snapshots.length > 0) {
    const snapshotInserts = snapshots.map((s) => ({
      profile_id: s.profile_id,
      matter_id: newMatter.id,
      snapshot_data: s.snapshot_data,
      snapshot_reason: `carried_forward_from_${nextAction}`,
      created_by: createdBy,
    }))

    await supabase.from('canonical_profile_snapshots').insert(snapshotInserts)
  }

  // 6. Update the refusal event with next_action and next_matter_id
  const { data: refusalEvent } = await supabase
    .from('matter_outcome_events')
    .select('id')
    .eq('matter_id', matterId)
    .eq('event_type', 'refusal')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (refusalEvent) {
    await supabase
      .from('matter_outcome_events')
      .update({
        next_action: nextAction,
        next_matter_id: newMatter.id,
      })
      .eq('id', refusalEvent.id)
  }

  // 7. Log activity on both matters
  const activityBase = {
    tenant_id: tenantId,
    activity_type: 'next_step_initiated',
    entity_type: 'matter' as const,
    user_id: createdBy,
  }

  await supabase.from('activities').insert([
    {
      ...activityBase,
      matter_id: matterId,
      entity_id: matterId,
      title: `Next step initiated: ${actionLabels[nextAction]}`,
      description: `New matter created for ${actionLabels[nextAction]}: "${newTitle}"`,
      metadata: {
        next_action: nextAction,
        new_matter_id: newMatter.id,
      } as Json,
    },
    {
      ...activityBase,
      matter_id: newMatter.id,
      entity_id: newMatter.id,
      title: `Created from ${actionLabels[nextAction]}`,
      description: `This matter was created as a ${actionLabels[nextAction]} of "${originalMatter.title}"`,
      metadata: {
        next_action: nextAction,
        original_matter_id: matterId,
      } as Json,
    },
  ])

  return { success: true, newMatterId: newMatter.id }
}

// ─── Record Approval Expiry ─────────────────────────────────────────────────

/**
 * Creates a contact_status_records entry and activates expiry reminders.
 */
export async function recordApprovalExpiry(
  supabase: SupabaseClient<Database>,
  matterId: string,
  contactId: string,
  statusType: string,
  issueDate: string,
  expiryDate: string,
  documentReference?: string
): Promise<{ success: boolean; error?: string; statusRecordId?: string }> {
  // Fetch matter for tenant context
  const { data: matter } = await supabase
    .from('matters')
    .select('tenant_id')
    .eq('id', matterId)
    .single()

  if (!matter) {
    return { success: false, error: 'Matter not found' }
  }

  const tenantId = matter.tenant_id

  // Create status record
  const { data: record, error: recordErr } = await supabase
    .from('contact_status_records')
    .insert({
      tenant_id: tenantId,
      contact_id: contactId,
      status_type: statusType,
      issue_date: issueDate,
      expiry_date: expiryDate,
      document_reference: documentReference ?? '',
      matter_id: matterId,
    })
    .select('id')
    .single()

  if (recordErr || !record) {
    return { success: false, error: `Failed to create status record: ${recordErr?.message}` }
  }

  // Ensure expiry reminder rules are seeded for this tenant
  await supabase.rpc('seed_expiry_reminder_rules', { p_tenant_id: tenantId })

  return { success: true, statusRecordId: record.id }
}

// ─── Type-Specific Handlers ─────────────────────────────────────────────────

async function handleApproval(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  matterId: string,
  outcomeData: OutcomeData,
  userId: string
): Promise<void> {
  // If approval has expiry data, create contact_status_records
  if (outcomeData.expiry_date) {
    // Find primary contact
    const { data: primaryContact } = await supabase
      .from('matter_contacts')
      .select('contact_id')
      .eq('matter_id', matterId)
      .eq('role', 'client')
      .limit(1)
      .maybeSingle()

    if (primaryContact?.contact_id) {
      // Determine status type from matter type
      const { data: immRecord } = await supabase
        .from('matter_immigration')
        .select('case_type_id')
        .eq('matter_id', matterId)
        .maybeSingle()

      const statusType = determineStatusType(immRecord?.case_type_id)

      await recordApprovalExpiry(
        supabase,
        matterId,
        primaryContact.contact_id,
        statusType,
        outcomeData.issue_date ?? new Date().toISOString().split('T')[0],
        outcomeData.expiry_date
      )
    }
  }

  // Create approval-specific task
  await supabase.from('tasks').insert({
    tenant_id: tenantId,
    matter_id: matterId,
    title: 'Process approval  -  update client and close matter',
    description: 'Review approval details, notify the client, and update the matter status.',
    priority: 'high',
    due_date: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
    created_by: userId,
    created_via: 'automation',
    status: 'not_started',
  })
}

async function handleBiometric(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  matterId: string,
  outcomeData: OutcomeData,
  userId: string
): Promise<void> {
  const deadlineDays = 30
  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + deadlineDays)

  await supabase.from('matter_deadlines').insert({
    tenant_id: tenantId,
    matter_id: matterId,
    deadline_type: 'biometric',
    title: 'Biometric Appointment Deadline',
    due_date: dueDate.toISOString().split('T')[0],
    status: 'upcoming',
    priority: 'high',
    auto_generated: true,
    source_field: 'lifecycle:biometric',
  })

  await supabase.from('tasks').insert({
    tenant_id: tenantId,
    matter_id: matterId,
    title: 'Schedule biometric appointment',
    description: 'Client must complete biometrics within 30 days of instruction letter.',
    priority: 'high',
    due_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    created_by: userId,
    created_via: 'automation',
    status: 'not_started',
  })
}

async function handleMedical(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  matterId: string,
  _outcomeData: OutcomeData,
  userId: string
): Promise<void> {
  const deadlineDays = 60
  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + deadlineDays)

  await supabase.from('matter_deadlines').insert({
    tenant_id: tenantId,
    matter_id: matterId,
    deadline_type: 'medical',
    title: 'Medical Examination Deadline',
    due_date: dueDate.toISOString().split('T')[0],
    status: 'upcoming',
    priority: 'high',
    auto_generated: true,
    source_field: 'lifecycle:medical',
  })

  await supabase.from('tasks').insert({
    tenant_id: tenantId,
    matter_id: matterId,
    title: 'Schedule medical examination',
    description: 'Client must complete the medical examination with a designated panel physician.',
    priority: 'high',
    due_date: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    created_by: userId,
    created_via: 'automation',
    status: 'not_started',
  })
}

async function handlePassportRequest(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  matterId: string,
  _outcomeData: OutcomeData,
  userId: string
): Promise<void> {
  const deadlineDays = 30
  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + deadlineDays)

  await supabase.from('matter_deadlines').insert({
    tenant_id: tenantId,
    matter_id: matterId,
    deadline_type: 'passport_request',
    title: 'Passport Submission Deadline',
    due_date: dueDate.toISOString().split('T')[0],
    status: 'upcoming',
    priority: 'high',
    auto_generated: true,
    source_field: 'lifecycle:passport_request',
  })

  await supabase.from('tasks').insert({
    tenant_id: tenantId,
    matter_id: matterId,
    title: 'Submit passport for visa stamping',
    description: 'Client must submit their passport as requested. Coordinate with IRCC office.',
    priority: 'high',
    due_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    created_by: userId,
    created_via: 'automation',
    status: 'not_started',
  })
}

/**
 * Determine the status type from case type context.
 * Falls back to 'visa' if we cannot determine.
 */
function determineStatusType(caseTypeId?: string | null): string {
  // In a real implementation, this would look up the case type to determine
  // the permit/status type. For now, use a sensible default.
  if (!caseTypeId) return 'visa'
  return 'visa'
}
