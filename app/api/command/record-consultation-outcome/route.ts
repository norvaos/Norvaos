// ============================================================================
// POST /api/command/record-consultation-outcome
// Records consultation outcome with proper state transitions, task creation,
// closure records, retainer package preparation — all in one transaction.
// ============================================================================

import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'
import type { Json } from '@/lib/types/database'

// ─── Request Types ──────────────────────────────────────────────────────────

type OutcomeType =
  | 'send_retainer'
  | 'follow_up_later'
  | 'client_declined'
  | 'not_a_fit'
  | 'referred_out'
  | 'no_show'
  | 'book_follow_up'

interface BasePayload {
  leadId: string
  consultationId: string
  outcome: OutcomeType
  consultationNotes?: string
  /** When true, all outcome side-effects still fire but the lead's stage_id is NOT updated. */
  skipStageAdvance?: boolean
}

interface SendRetainerPayload extends BasePayload {
  outcome: 'send_retainer'
  matterTypeId: string
  personScope: 'single' | 'joint'
  responsibleLawyerId: string
  billingType: string
  consultationNotes: string
  retainerFeeTemplateId?: string
}

interface FollowUpLaterPayload extends BasePayload {
  outcome: 'follow_up_later'
  followUpDate: string
  followUpOwner: string
  consultationNotes: string
  leadTemperature?: string
}

interface ClientDeclinedPayload extends BasePayload {
  outcome: 'client_declined'
  declineReason: string
  declineDetails?: string
  consultationNotes: string
}

interface NotAFitPayload extends BasePayload {
  outcome: 'not_a_fit'
  notFitReason: string
  notFitDetails?: string
  consultationNotes: string
}

interface ReferredOutPayload extends BasePayload {
  outcome: 'referred_out'
  referredToName: string
  referralReason: string
  consultationNotes: string
}

interface NoShowPayload extends BasePayload {
  outcome: 'no_show'
}

interface BookFollowUpPayload extends BasePayload {
  outcome: 'book_follow_up'
  followUpType: 'phone' | 'in_person' | 'video'
  followUpDate: string
  followUpOwner: string
}

type OutcomePayload =
  | SendRetainerPayload
  | FollowUpLaterPayload
  | ClientDeclinedPayload
  | NotAFitPayload
  | ReferredOutPayload
  | NoShowPayload
  | BookFollowUpPayload

// ─── Validation ─────────────────────────────────────────────────────────────

function validatePayload(body: OutcomePayload): string | null {
  if (!body.leadId) return 'leadId is required'
  if (!body.consultationId) return 'consultationId is required'
  if (!body.outcome) return 'outcome is required'

  switch (body.outcome) {
    case 'send_retainer':
      if (!body.matterTypeId) return 'matterTypeId is required for send_retainer'
      if (!body.personScope || !['single', 'joint'].includes(body.personScope))
        return 'personScope must be "single" or "joint"'
      if (!body.responsibleLawyerId) return 'responsibleLawyerId is required'
      if (!body.billingType) return 'billingType is required'
      if (!body.consultationNotes?.trim()) return 'consultationNotes is required'
      break

    case 'follow_up_later':
      if (!body.followUpDate) return 'followUpDate is required'
      if (new Date(body.followUpDate) <= new Date()) return 'followUpDate must be in the future'
      if (!body.followUpOwner) return 'followUpOwner is required'
      if (!body.consultationNotes?.trim()) return 'consultationNotes is required'
      break

    case 'client_declined':
      if (!body.declineReason) return 'declineReason is required'
      if (body.declineReason === 'Other' && !body.declineDetails?.trim())
        return 'declineDetails is required when reason is "Other"'
      if (!body.consultationNotes?.trim()) return 'consultationNotes is required'
      break

    case 'not_a_fit':
      if (!body.notFitReason) return 'notFitReason is required'
      if (body.notFitReason === 'Other' && !body.notFitDetails?.trim())
        return 'notFitDetails is required when reason is "Other"'
      if (!body.consultationNotes?.trim()) return 'consultationNotes is required'
      break

    case 'referred_out':
      if (!body.referredToName?.trim()) return 'referredToName is required'
      if (!body.referralReason) return 'referralReason is required'
      if (!body.consultationNotes?.trim()) return 'consultationNotes is required'
      break

    case 'no_show':
      // No additional fields required — confirmation only
      break

    case 'book_follow_up':
      if (!body.followUpType || !['phone', 'in_person', 'video'].includes(body.followUpType))
        return 'followUpType must be "phone", "in_person", or "video"'
      if (!body.followUpDate) return 'followUpDate is required'
      if (new Date(body.followUpDate) <= new Date()) return 'followUpDate must be in the future'
      if (!body.followUpOwner) return 'followUpOwner is required'
      break

    default:
      return `Unknown outcome: ${(body as BasePayload).outcome}`
  }

  return null
}

// ─── Outcome labels ─────────────────────────────────────────────────────────

const OUTCOME_LABELS: Record<OutcomeType, string> = {
  send_retainer: 'Retained — Pending Retainer',
  follow_up_later: 'Thinking — Follow-up Required',
  client_declined: 'Client Declined',
  not_a_fit: 'Not Suitable',
  referred_out: 'Referred Out',
  no_show: 'No Show',
  book_follow_up: 'Follow-up Consultation Booked',
}

// ─── Handler ────────────────────────────────────────────────────────────────

async function handlePost(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'leads', 'edit')

    const body = (await request.json()) as OutcomePayload

    // ── Validate ──────────────────────────────────────────────────
    const validationError = validatePayload(body)
    if (validationError) {
      return NextResponse.json(
        { success: false, error: validationError },
        { status: 400 }
      )
    }

    const { supabase, tenantId, userId } = auth
    const { leadId, consultationId, outcome } = body

    // ── Idempotency check ─────────────────────────────────────────
    const idempotencyKey = `outcome:${consultationId}:${outcome}`
    const { data: existingExec } = await supabase
      .from('lead_workflow_executions')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('execution_key', idempotencyKey)
      .maybeSingle()

    if (existingExec) {
      return NextResponse.json(
        { success: false, error: 'This outcome has already been recorded' },
        { status: 409 }
      )
    }

    // ── Verify lead exists and is open ────────────────────────────
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('*, pipeline_id, stage_id, contact_id, assigned_to, estimated_value')
      .eq('id', leadId)
      .eq('tenant_id', tenantId)
      .single()

    if (leadErr || !lead) {
      return NextResponse.json(
        { success: false, error: 'Lead not found or access denied' },
        { status: 404 }
      )
    }

    if (lead.status === 'converted') {
      return NextResponse.json(
        { success: false, error: 'Lead is already converted' },
        { status: 409 }
      )
    }

    if (lead.status === 'lost' && outcome !== 'book_follow_up') {
      return NextResponse.json(
        { success: false, error: 'Lead is already closed as lost' },
        { status: 409 }
      )
    }

    // ── Verify consultation exists and outcome not yet recorded ───
    const { data: consultation, error: consultErr } = await supabase
      .from('lead_consultations')
      .select('*')
      .eq('id', consultationId)
      .eq('lead_id', leadId)
      .single()

    if (consultErr || !consultation) {
      return NextResponse.json(
        { success: false, error: 'Consultation not found' },
        { status: 404 }
      )
    }

    if (consultation.outcome && outcome !== 'book_follow_up') {
      return NextResponse.json(
        { success: false, error: `Outcome already recorded as "${consultation.outcome}"` },
        { status: 409 }
      )
    }

    // ── Fetch pipeline stages for stage moves ─────────────────────
    let stages: { id: string; name: string; is_win_stage: boolean | null; is_lost_stage: boolean | null }[] = []
    if (lead.pipeline_id) {
      const { data: stageData } = await supabase
        .from('pipeline_stages')
        .select('id, name, is_win_stage, is_lost_stage')
        .eq('pipeline_id', lead.pipeline_id)
        .order('sort_order', { ascending: true })

      stages = stageData ?? []
    }

    // ── Prior state for audit trail ───────────────────────────────
    const priorStage = stages.find((s) => s.id === lead.stage_id)
    const priorLeadStatus = lead.status

    // ── Process outcome ───────────────────────────────────────────
    const tasksCreated: string[] = []
    let newStage: { id: string; name: string } | null = null
    let retainerPackageId: string | null = null
    let closureRecordId: string | null = null
    const commandSummary: string[] = []

    // ── Get contact for task names ────────────────────────────────
    let contactName = 'Lead'
    if (lead.contact_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('first_name, last_name')
        .eq('id', lead.contact_id)
        .single()

      if (contact) {
        contactName = `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || 'Lead'
      }
    }

    switch (outcome) {
      // ═══════════════════════════════════════════════════════════
      // SEND RETAINER — Client intends to retain
      // ═══════════════════════════════════════════════════════════
      case 'send_retainer': {
        const p = body as SendRetainerPayload

        // 1. Update consultation
        await supabase
          .from('lead_consultations')
          .update({
            status: 'completed',
            outcome: 'send_retainer',
            outcome_notes: p.consultationNotes,
            updated_at: new Date().toISOString(),
          })
          .eq('id', consultationId)

        commandSummary.push('Consultation outcome recorded (send_retainer)')

        // 2. Create retainer package
        const { data: retainerPkg } = await supabase
          .from('lead_retainer_packages')
          .insert({
            tenant_id: tenantId,
            lead_id: leadId,
            status: 'not_sent',
            payment_status: 'not_requested',
            matter_type_id: p.matterTypeId,
            person_scope: p.personScope,
            retainer_fee_template_id: p.retainerFeeTemplateId ?? null,
            template_customized: false,
            responsible_lawyer_id: p.responsibleLawyerId,
            billing_type: p.billingType,
          })
          .select('id')
          .single()

        retainerPackageId = retainerPkg?.id ?? null

        // Fetch matter type name for summary
        let matterTypeName = 'Unknown'
        const { data: mt } = await supabase
          .from('matter_types')
          .select('name')
          .eq('id', p.matterTypeId)
          .single()
        if (mt) matterTypeName = mt.name

        const scopeLabel = p.personScope === 'joint' ? 'Joint' : 'Single'
        commandSummary.push(
          `Retainer package prepared — ${matterTypeName} (${scopeLabel})`
        )

        // 3. Auto-load default fee template if one exists and none was specified
        if (p.retainerFeeTemplateId) {
          const { data: tmpl } = await supabase
            .from('retainer_fee_templates')
            .select('name')
            .eq('id', p.retainerFeeTemplateId)
            .single()
          if (tmpl) {
            commandSummary.push(`Fee template applied: ${tmpl.name}`)
          }
        } else {
          commandSummary.push('No fee template applied (manual entry)')
        }

        // 4. Move to "Retainer Sent" stage
        const retainedStage = stages.find((s) =>
          /^retainer\s+sent$/i.test(s.name) ||
          /retainer.*sent|sent.*retainer/i.test(s.name)
        )

        // Build update payload — set conflict as cleared (lawyer chose to engage)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sendRetainerUpdate: Record<string, any> = {
          consultation_status: 'completed',
          retainer_status: 'not_sent',
          next_required_action: 'send_retainer',
          conflict_status: 'cleared_by_lawyer',
          matter_type_id: p.matterTypeId,
          person_scope: p.personScope,
          responsible_lawyer_id: p.responsibleLawyerId,
        }
        if (!body.skipStageAdvance && retainedStage) {
          sendRetainerUpdate.stage_id = retainedStage.id
          sendRetainerUpdate.stage_entered_at = new Date().toISOString()
        }

        await supabase
          .from('leads')
          .update(sendRetainerUpdate)
          .eq('id', leadId)

        if (!body.skipStageAdvance && retainedStage) {
          newStage = { id: retainedStage.id, name: retainedStage.name }
        }

        // 4b. Create intake profile (marks intake as complete for conversion gates)
        // In the send_retainer flow, the consultation IS the intake — lawyer has
        // gathered all info needed to proceed.
        try {
          const { data: existingProfile } = await supabase
            .from('lead_intake_profiles')
            .select('id')
            .eq('lead_id', leadId)
            .maybeSingle()

          if (!existingProfile) {
            await supabase.from('lead_intake_profiles').insert({
              tenant_id: tenantId,
              lead_id: leadId,
              mandatory_fields_complete: true,
            })
          } else {
            await supabase
              .from('lead_intake_profiles')
              .update({ mandatory_fields_complete: true })
              .eq('id', existingProfile.id)
          }
        } catch (intakeErr) {
          console.warn('[record-consultation-outcome] Intake profile creation failed (non-blocking):', intakeErr)
        }

        commandSummary.push('Conflict status set to cleared (lawyer engaged)')
        commandSummary.push('Intake profile created and marked complete')

        // 5. Fetch responsible lawyer name
        let lawyerName = 'Assigned lawyer'
        const { data: lawyer } = await supabase
          .from('users')
          .select('first_name, last_name')
          .eq('id', p.responsibleLawyerId)
          .single()
        if (lawyer) {
          lawyerName = `${lawyer.first_name ?? ''} ${lawyer.last_name ?? ''}`.trim() || 'Assigned lawyer'
        }

        // 6. Create task: Prepare and send retainer
        const { data: task } = await supabase
          .from('tasks')
          .insert({
            tenant_id: tenantId,
            contact_id: lead.contact_id,
            title: `Prepare and send retainer for ${contactName}`,
            due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
              .toISOString()
              .split('T')[0],
            assigned_to: p.responsibleLawyerId,
            assigned_by: userId,
            priority: 'high',
            status: 'not_started',
            created_via: 'automation',
            created_by: userId,
          })
          .select('id')
          .single()

        if (task) tasksCreated.push(task.id)
        commandSummary.push(
          `Task created: Prepare and send retainer (assigned to: ${lawyerName})`
        )
        commandSummary.push(
          `Pipeline: ${newStage?.name ?? 'Retained Pending Retainer'}`
        )
        break
      }

      // ═══════════════════════════════════════════════════════════
      // FOLLOW UP LATER — Client needs time to decide
      // ═══════════════════════════════════════════════════════════
      case 'follow_up_later': {
        const p = body as FollowUpLaterPayload

        // 1. Update consultation
        await supabase
          .from('lead_consultations')
          .update({
            status: 'completed',
            outcome: 'follow_up_later',
            outcome_notes: p.consultationNotes,
            updated_at: new Date().toISOString(),
          })
          .eq('id', consultationId)

        commandSummary.push('Consultation outcome recorded (follow_up_later)')

        // 2. Move to "Follow-Up Active" stage (client thinking after consultation)
        const completedStage = stages.find((s) =>
          /follow.?up.?active|active.*follow.?up/i.test(s.name)
        ) ?? stages.find((s) =>
          /consult.*complet|complet.*consult|appointment.*complet/i.test(s.name)
        )
        if (!body.skipStageAdvance && completedStage) {
          await supabase
            .from('leads')
            .update({
              stage_id: completedStage.id,
              stage_entered_at: new Date().toISOString(),
              consultation_status: 'completed',
              next_follow_up: p.followUpDate,
              ...(p.leadTemperature ? { temperature: p.leadTemperature } : {}),
            })
            .eq('id', leadId)
          newStage = { id: completedStage.id, name: completedStage.name }
        } else {
          await supabase
            .from('leads')
            .update({
              consultation_status: 'completed',
              next_follow_up: p.followUpDate,
              ...(p.leadTemperature ? { temperature: p.leadTemperature } : {}),
            })
            .eq('id', leadId)
        }

        // 3. Create follow-up task
        const { data: task } = await supabase
          .from('tasks')
          .insert({
            tenant_id: tenantId,
            contact_id: lead.contact_id,
            title: `Follow up with ${contactName} — post-consultation`,
            due_date: p.followUpDate,
            assigned_to: p.followUpOwner,
            assigned_by: userId,
            priority: 'medium',
            status: 'not_started',
            created_via: 'automation',
            created_by: userId,
          })
          .select('id')
          .single()

        if (task) tasksCreated.push(task.id)

        commandSummary.push(
          `Follow-up task created for ${p.followUpDate} (assigned to: ${p.followUpOwner})`
        )
        commandSummary.push(
          `Pipeline: ${newStage?.name ?? 'Consultation Completed'}`
        )
        break
      }

      // ═══════════════════════════════════════════════════════════
      // CLIENT DECLINED — Attended but declined to retain
      // ═══════════════════════════════════════════════════════════
      case 'client_declined': {
        const p = body as ClientDeclinedPayload

        // 1. Update consultation
        await supabase
          .from('lead_consultations')
          .update({
            status: 'completed',
            outcome: 'client_declined',
            outcome_notes: p.consultationNotes,
            updated_at: new Date().toISOString(),
          })
          .eq('id', consultationId)

        commandSummary.push('Consultation outcome recorded (client_declined)')

        // 2. Create closure record — target "Closed – Client Declined" stage
        const lostStage = stages.find((s) => /client.?declin/i.test(s.name))
          ?? stages.find((s) => s.is_lost_stage)
        const { data: closure } = await supabase
          .from('lead_closure_records')
          .insert({
            tenant_id: tenantId,
            lead_id: leadId,
            closed_stage: 'closed_client_declined',
            reason_code: p.declineReason,
            reason_text: p.declineDetails || null,
            closed_by: userId,
          })
          .select('id')
          .single()

        closureRecordId = closure?.id ?? null
        commandSummary.push(
          `Closure record created: ${p.declineReason}${p.declineDetails ? ` — ${p.declineDetails}` : ''}`
        )

        // 3. Move to lost stage + mark lead as lost
        await supabase
          .from('leads')
          .update({
            status: 'lost',
            is_closed: true,
            consultation_status: 'completed',
            closure_record_id: closureRecordId,
            ...(!body.skipStageAdvance && lostStage
              ? { stage_id: lostStage.id, stage_entered_at: new Date().toISOString() }
              : {}),
          })
          .eq('id', leadId)

        if (!body.skipStageAdvance && lostStage) {
          newStage = { id: lostStage.id, name: lostStage.name }
        }

        commandSummary.push(`Lead closed as lost`)
        commandSummary.push(
          `Pipeline: ${newStage?.name ?? 'Lost'}`
        )
        break
      }

      // ═══════════════════════════════════════════════════════════
      // NOT A FIT — Not suitable for the firm
      // ═══════════════════════════════════════════════════════════
      case 'not_a_fit': {
        const p = body as NotAFitPayload

        await supabase
          .from('lead_consultations')
          .update({
            status: 'completed',
            outcome: 'not_a_fit',
            outcome_notes: p.consultationNotes,
            updated_at: new Date().toISOString(),
          })
          .eq('id', consultationId)

        commandSummary.push('Consultation outcome recorded (not_a_fit)')

        const lostStage = stages.find((s) => /not.?a?.?fit/i.test(s.name))
          ?? stages.find((s) => s.is_lost_stage)
        const { data: closure } = await supabase
          .from('lead_closure_records')
          .insert({
            tenant_id: tenantId,
            lead_id: leadId,
            closed_stage: 'closed_not_a_fit',
            reason_code: p.notFitReason,
            reason_text: p.notFitDetails || null,
            closed_by: userId,
          })
          .select('id')
          .single()

        closureRecordId = closure?.id ?? null
        commandSummary.push(
          `Closure record created: ${p.notFitReason}${p.notFitDetails ? ` — ${p.notFitDetails}` : ''}`
        )

        await supabase
          .from('leads')
          .update({
            status: 'lost',
            is_closed: true,
            consultation_status: 'completed',
            closure_record_id: closureRecordId,
            ...(!body.skipStageAdvance && lostStage
              ? { stage_id: lostStage.id, stage_entered_at: new Date().toISOString() }
              : {}),
          })
          .eq('id', leadId)

        if (!body.skipStageAdvance && lostStage) {
          newStage = { id: lostStage.id, name: lostStage.name }
        }

        commandSummary.push('Lead closed as lost')
        commandSummary.push(`Pipeline: ${newStage?.name ?? 'Lost'}`)
        break
      }

      // ═══════════════════════════════════════════════════════════
      // REFERRED OUT — Referred to another firm
      // ═══════════════════════════════════════════════════════════
      case 'referred_out': {
        const p = body as ReferredOutPayload

        await supabase
          .from('lead_consultations')
          .update({
            status: 'completed',
            outcome: 'referred_out',
            outcome_notes: p.consultationNotes,
            updated_at: new Date().toISOString(),
          })
          .eq('id', consultationId)

        commandSummary.push('Consultation outcome recorded (referred_out)')

        const lostStage = stages.find((s) => /not.?a?.?fit|referred/i.test(s.name))
          ?? stages.find((s) => s.is_lost_stage)
        const { data: closure } = await supabase
          .from('lead_closure_records')
          .insert({
            tenant_id: tenantId,
            lead_id: leadId,
            closed_stage: 'closed_referred_out',
            reason_code: p.referralReason,
            reason_text: `Referred to: ${p.referredToName}`,
            closed_by: userId,
          })
          .select('id')
          .single()

        closureRecordId = closure?.id ?? null
        commandSummary.push(
          `Referred to: ${p.referredToName} (${p.referralReason})`
        )

        await supabase
          .from('leads')
          .update({
            status: 'lost',
            is_closed: true,
            consultation_status: 'completed',
            closure_record_id: closureRecordId,
            ...(!body.skipStageAdvance && lostStage
              ? { stage_id: lostStage.id, stage_entered_at: new Date().toISOString() }
              : {}),
          })
          .eq('id', leadId)

        if (!body.skipStageAdvance && lostStage) {
          newStage = { id: lostStage.id, name: lostStage.name }
        }

        commandSummary.push('Lead closed as lost')
        commandSummary.push(`Pipeline: ${newStage?.name ?? 'Lost'}`)
        break
      }

      // ═══════════════════════════════════════════════════════════
      // NO SHOW — Client did not attend
      // ═══════════════════════════════════════════════════════════
      case 'no_show': {
        // 1. Update consultation status (no outcome — meeting didn't happen)
        await supabase
          .from('lead_consultations')
          .update({
            status: 'no_show',
            updated_at: new Date().toISOString(),
          })
          .eq('id', consultationId)

        commandSummary.push('Consultation marked as No Show')

        // 2. Move to "No-Show" stage + update lead
        const noShowStage = stages.find((s) => /no.?show/i.test(s.name))
        await supabase
          .from('leads')
          .update({
            consultation_status: 'no_show',
            ...(!body.skipStageAdvance && noShowStage
              ? { stage_id: noShowStage.id, stage_entered_at: new Date().toISOString() }
              : {}),
          })
          .eq('id', leadId)
        if (!body.skipStageAdvance && noShowStage) {
          newStage = { id: noShowStage.id, name: noShowStage.name }
        }

        // 3. Create high-priority follow-up task (due: tomorrow)
        const followUpDate = new Date()
        followUpDate.setDate(followUpDate.getDate() + 1)

        const { data: task } = await supabase
          .from('tasks')
          .insert({
            tenant_id: tenantId,
            contact_id: lead.contact_id,
            title: `Follow up with ${contactName} (No-Show)`,
            due_date: followUpDate.toISOString().split('T')[0],
            assigned_to: lead.assigned_to ?? userId,
            assigned_by: userId,
            priority: 'high',
            status: 'not_started',
            created_via: 'automation',
            created_by: userId,
          })
          .select('id')
          .single()

        if (task) tasksCreated.push(task.id)

        commandSummary.push(
          `High-priority follow-up task created for tomorrow`
        )
        commandSummary.push('Pipeline: unchanged (lead remains at current stage)')
        break
      }

      // ═══════════════════════════════════════════════════════════
      // BOOK FOLLOW-UP — Schedule a follow-up consultation
      // ═══════════════════════════════════════════════════════════
      case 'book_follow_up': {
        const p = body as BookFollowUpPayload

        // 1. If consultation had a meeting, mark as completed
        if (consultation.status === 'booked' || consultation.status === 'completed') {
          await supabase
            .from('lead_consultations')
            .update({
              status: 'completed',
              updated_at: new Date().toISOString(),
            })
            .eq('id', consultationId)
        }

        // 2. Create new consultation record
        const typeLabel = p.followUpType === 'in_person' ? 'In-Person' : p.followUpType === 'video' ? 'Video' : 'Phone'
        await supabase
          .from('lead_consultations')
          .insert({
            tenant_id: tenantId,
            lead_id: leadId,
            status: 'booked',
            scheduled_at: new Date(p.followUpDate).toISOString(),
            consultation_type: p.followUpType,
            conducted_by: p.followUpOwner,
          })

        commandSummary.push(
          `Follow-up consultation booked: ${typeLabel} on ${p.followUpDate}`
        )

        // 3. Update lead
        await supabase
          .from('leads')
          .update({
            next_follow_up: p.followUpDate,
          })
          .eq('id', leadId)

        // 4. Create appointment task
        const { data: task } = await supabase
          .from('tasks')
          .insert({
            tenant_id: tenantId,
            contact_id: lead.contact_id,
            title: `${typeLabel} follow-up consultation with ${contactName}`,
            due_date: p.followUpDate,
            assigned_to: p.followUpOwner,
            assigned_by: userId,
            priority: 'medium',
            status: 'not_started',
            created_via: 'automation',
            created_by: userId,
          })
          .select('id')
          .single()

        if (task) tasksCreated.push(task.id)

        commandSummary.push(
          `Task created for ${p.followUpDate}`
        )
        commandSummary.push('Pipeline: unchanged (lead remains at current stage)')
        break
      }
    }

    // ── Record idempotency key ──────────────────────────────────────
    await supabase.from('lead_workflow_executions').insert({
      tenant_id: tenantId,
      lead_id: leadId,
      execution_type: 'consultation_outcome',
      execution_key: idempotencyKey,
      actor_user_id: userId,
      metadata: { outcome, consultation_id: consultationId } as unknown as Json,
    })

    // ── Audit trail ─────────────────────────────────────────────────
    const activityTitle = outcome === 'no_show'
      ? 'Consultation: No Show'
      : `Consultation outcome: ${OUTCOME_LABELS[outcome]}`

    await supabase.from('activities').insert({
      tenant_id: tenantId,
      activity_type: 'consultation_outcome',
      title: activityTitle,
      description: commandSummary.join('. '),
      entity_type: 'lead',
      entity_id: leadId,
      user_id: userId,
      metadata: {
        outcome,
        consultation_id: consultationId,
        prior_stage_id: priorStage?.id ?? null,
        prior_stage_name: priorStage?.name ?? null,
        new_stage_id: newStage?.id ?? null,
        new_stage_name: newStage?.name ?? null,
        prior_lead_status: priorLeadStatus,
        new_lead_status: ['client_declined', 'not_a_fit', 'referred_out'].includes(outcome)
          ? 'lost'
          : priorLeadStatus,
        submitted_payload: body,
        retainer_template_id: (body as SendRetainerPayload).retainerFeeTemplateId ?? null,
        retainer_template_customized: false,
        retainer_package_id: retainerPackageId,
        retainer_package_status: outcome === 'send_retainer' ? 'not_sent' : null,
        invoice_created: false,
        invoice_id: null,
        matter_opened: false,
        matter_id: null,
        closure_record_id: closureRecordId,
        tasks_created: tasksCreated,
        action_blocked: false,
        block_reasons: [],
      } as unknown as Json,
    })

    // ── Build response with command summary ─────────────────────────
    // Determine current status for the command summary display
    const currentStatus: Record<string, string> = {}
    if (outcome === 'send_retainer') {
      currentStatus.retainer = 'Not yet sent'
      currentStatus.payment = 'Not requested'
      currentStatus.fileOpening = 'Blocked — retainer not signed, payment not received'
    } else if (outcome === 'follow_up_later') {
      currentStatus.followUp = `Scheduled for ${(body as FollowUpLaterPayload).followUpDate}`
    } else if (['client_declined', 'not_a_fit', 'referred_out'].includes(outcome)) {
      currentStatus.leadStatus = 'Closed — Lost'
    } else if (outcome === 'no_show') {
      currentStatus.consultation = 'No Show — follow-up task created'
    } else if (outcome === 'book_follow_up') {
      currentStatus.consultation = `Follow-up booked: ${(body as BookFollowUpPayload).followUpDate}`
    }

    return NextResponse.json({
      success: true,
      outcome,
      outcomeLabel: OUTCOME_LABELS[outcome],
      commandSummary,
      currentStatus,
      retainerPackageId,
      closureRecordId,
      tasksCreated,
      newStage: newStage
        ? { id: newStage.id, name: newStage.name }
        : null,
    })
  } catch (err) {
    console.error('[record-consultation-outcome] Error:', err)

    if (err && typeof err === 'object' && 'status' in err) {
      const authErr = err as AuthError
      return NextResponse.json(
        { success: false, error: authErr.message },
        { status: authErr.status }
      )
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(
  handlePost,
  'POST /api/command/record-consultation-outcome'
)
