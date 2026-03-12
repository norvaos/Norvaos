import { NextResponse } from 'next/server'
import { validateKioskToken } from '@/lib/services/kiosk-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/utils/logger'
import type { Json } from '@/lib/types/database'
import { checkKioskRateLimit } from '@/lib/middleware/kiosk-limiter'
import { withTiming } from '@/lib/middleware/request-timing'
import { executeAction } from '@/lib/services/action-executor'
import { completeCheckInAction } from '@/lib/services/actions/checkin/complete-checkin'

/**
 * POST /api/kiosk/[token]/complete
 *
 * Complete the kiosk check-in process.
 *
 * Phase 7 Fix 4: Routes through the Action Executor so we get:
 *   - Atomic triple-write (workflow_actions + audit_logs + activities)
 *   - Idempotency protection (5-second dedup window)
 *   - Orphan detection if audit trail fails
 *
 * Rule #5: Triple-write via execute_action_atomic().
 * Rule #15: Idempotency key prevents double-submit.
 * Rule #16: Realtime is additive — durable activity + notification.
 *
 * Enhanced: Accepts `answers` from dynamic questions, returns `returningInfo`
 * with staff name/avatar for returning clients/leads. Also notifies the
 * responsible lawyer if different from the appointment owner.
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params

    // Rate limit: 30 req/min per token+IP
    const rateLimitResponse = checkKioskRateLimit(request, token)
    if (rateLimitResponse) return rateLimitResponse

    // 1. Validate kiosk token
    const result = await validateKioskToken(token)
    if (result.error) return result.error
    const { link } = result

    const tenantId = link!.tenant_id
    const admin = createAdminClient()

    // 2. Parse body
    const body = await request.json()
    const {
      sessionId,
      appointmentId,
      guestName,
      dataSafetyAcknowledged,
      answers,
      locale,
    } = body as {
      sessionId: string | null
      appointmentId: string | null
      guestName: string
      dataSafetyAcknowledged: boolean
      answers?: Record<string, unknown>
      locale?: string
    }

    // 3. Handle walk-in: if no sessionId, create session first
    //    (Action executor needs a sessionId to operate on)
    let finalSessionId = sessionId

    if (!finalSessionId) {
      const { data: newSession, error: createErr } = await admin
        .from('check_in_sessions')
        .insert({
          tenant_id: tenantId,
          kiosk_token: token,
          status: 'started',
          current_step: 'walk_in',
          data_safety_acknowledged: dataSafetyAcknowledged,
          metadata: {
            guest_name: guestName,
            is_walk_in: !appointmentId,
            appointment_id: appointmentId,
            answers: answers ?? undefined,
            locale: locale ?? 'en',
          } as unknown as Json,
        })
        .select('id')
        .single()

      if (createErr) {
        log.error('[kiosk-complete] Session creation error', {
          error_message: createErr.message,
        })
        return NextResponse.json({ error: 'Failed to complete check-in' }, { status: 500 })
      }

      finalSessionId = newSession.id
    } else if (answers && Object.keys(answers).length > 0) {
      // Update existing session with answers
      const { data: existing } = await admin
        .from('check_in_sessions')
        .select('metadata')
        .eq('id', finalSessionId)
        .single()

      const existingMeta = (existing?.metadata ?? {}) as Record<string, unknown>
      await admin
        .from('check_in_sessions')
        .update({
          metadata: { ...existingMeta, answers, locale: locale ?? 'en' } as unknown as Json,
        })
        .eq('id', finalSessionId)
    }

    // 3b. Walk-in contact matching: try to link the session to an existing contact
    //     by email or phone from the walk-in form (stored in answers as _walkin_email / _walkin_phone)
    if (!appointmentId && answers) {
      try {
        const walkinEmail = (answers._walkin_email as string)?.trim() || null
        const walkinPhone = (answers._walkin_phone as string)?.trim() || null

        let matchedContactId: string | null = null

        if (walkinEmail) {
          const { data: byEmail } = await admin
            .from('contacts')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('email_primary', walkinEmail)
            .eq('is_archived', false)
            .limit(1)
            .maybeSingle()
          if (byEmail) matchedContactId = byEmail.id
        }

        if (!matchedContactId && walkinPhone) {
          const { data: byPhone } = await admin
            .from('contacts')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('phone_primary', walkinPhone)
            .eq('is_archived', false)
            .limit(1)
            .maybeSingle()
          if (byPhone) matchedContactId = byPhone.id
        }

        if (matchedContactId) {
          await admin
            .from('check_in_sessions')
            .update({ contact_id: matchedContactId })
            .eq('id', finalSessionId!)

          log.info('[kiosk-complete] Walk-in matched to existing contact', {
            contact_id: matchedContactId,
            session_id: finalSessionId,
            matched_by: walkinEmail ? 'email' : 'phone',
          })
        }
      } catch (matchErr) {
        // Non-blocking — contact matching failure should NOT break check-in
        log.error('[kiosk-complete] Contact matching failed (non-blocking)', {
          error_message: matchErr instanceof Error ? matchErr.message : 'Unknown',
          session_id: finalSessionId,
        })
      }
    }

    // 4. Generate idempotency key: prevents double-submit within 5s window
    const idempotencyKey = `complete_check_in:${finalSessionId}:${Math.floor(Date.now() / 5000)}`

    // 5. Execute through the Action Executor (atomic triple-write)
     
    const actionResult = await executeAction({
      definition: completeCheckInAction as any,
      rawInput: {
        sessionId: finalSessionId,
        dataSafetyAcknowledged: dataSafetyAcknowledged ?? true,
      },
      tenantId,
      userId: null, // Kiosk — no user session
      supabase: admin,
      source: 'kiosk',
      idempotencyKey,
    })

    if (!actionResult.success) {
      log.error('[kiosk-complete] Action execution failed', {
        error: actionResult.error,
        session_id: finalSessionId,
        tenant_id: tenantId,
      })
      return NextResponse.json({ error: actionResult.error ?? 'Failed to complete check-in' }, { status: 500 })
    }

    // 5a. Link kiosk ID scan to documents table (non-blocking, post-commit)
    //     If the session has an uploaded ID scan, create a documents record so it
    //     appears in the staff-facing Pre-Retainer Inbox.
    try {
      const { data: sessionForIdScan } = await admin
        .from('check_in_sessions')
        .select('id_scan_path, id_scan_uploaded_at, contact_id, metadata')
        .eq('id', finalSessionId!)
        .single()

      if (sessionForIdScan?.id_scan_path) {
        const idMeta = (sessionForIdScan.metadata ?? {}) as Record<string, unknown>
        const fileType = (idMeta.id_scan_file_type as string) ?? 'image/jpeg'
        const fileSize = (idMeta.id_scan_file_size as number) ?? null
        const ext = sessionForIdScan.id_scan_path.split('.').pop() ?? 'jpg'

        // Check if a document for this scan already exists (idempotency)
        const { data: existingDoc } = await admin
          .from('documents')
          .select('id')
          .eq('storage_path', sessionForIdScan.id_scan_path)
          .eq('tenant_id', tenantId)
          .limit(1)
          .maybeSingle()

        if (!existingDoc) {
          await admin.from('documents').insert({
            tenant_id: tenantId,
            contact_id: sessionForIdScan.contact_id ?? null,
            file_name: `Kiosk ID Scan.${ext}`,
            file_type: fileType,
            file_size: fileSize,
            storage_path: sessionForIdScan.id_scan_path,
            storage_bucket: 'id-scans',
            category: 'identification',
            document_type: 'id_scan',
            description: `ID scan uploaded via kiosk check-in on ${new Date().toISOString().split('T')[0]}`,
          })

          log.info('[kiosk-complete] Linked ID scan to documents table', {
            session_id: finalSessionId,
            id_scan_path: sessionForIdScan.id_scan_path,
            contact_id: sessionForIdScan.contact_id,
          })
        }
      }
    } catch (docErr) {
      // Non-blocking — document linkage failure should NOT break check-in
      log.error('[kiosk-complete] ID scan document linkage failed (non-blocking)', {
        error_message: docErr instanceof Error ? docErr.message : 'Unknown',
        session_id: finalSessionId,
      })
    }

    // 5b. Create lead for checked-in contact (non-blocking, post-commit)
    //     Walk-ins and appointment contacts without an active lead get a new lead
    //     in the default pipeline so they appear in the pipeline board.
    let createdLeadId: string | null = null
    try {
      const { data: sessionData } = await admin
        .from('check_in_sessions')
        .select('contact_id')
        .eq('id', finalSessionId!)
        .single()

      const contactId = sessionData?.contact_id

      if (contactId) {
        // Check if contact already has an active lead
        const { data: existingLead } = await admin
          .from('leads')
          .select('id')
          .eq('contact_id', contactId)
          .eq('tenant_id', tenantId)
          .in('status', ['open', 'new', 'contacted', 'qualified', 'pitched'])
          .limit(1)
          .maybeSingle()

        if (!existingLead) {
          const { resolveDefaultPipelineAndStage } = await import('@/lib/services/pipeline-resolver')
          const { pipelineId, stageId } = await resolveDefaultPipelineAndStage(admin, tenantId)

          const { data: newLead } = await admin
            .from('leads')
            .insert({
              tenant_id: tenantId,
              contact_id: contactId,
              pipeline_id: pipelineId,
              stage_id: stageId,
              temperature: 'warm',
              status: 'open',
              source: 'kiosk',
              notes: appointmentId
                ? `Created from kiosk check-in (appointment)`
                : `Created from kiosk walk-in check-in`,
            })
            .select('id')
            .single()

          createdLeadId = newLead?.id ?? null

          log.info('[kiosk-complete] Lead created for checked-in contact', {
            contact_id: contactId,
            lead_id: createdLeadId,
            tenant_id: tenantId,
            session_id: finalSessionId,
          })
        } else {
          log.info('[kiosk-complete] Contact already has active lead, skipping creation', {
            contact_id: contactId,
            existing_lead_id: existingLead.id,
            tenant_id: tenantId,
          })
        }
      }
    } catch (leadErr) {
      // Non-blocking — lead creation failure should NOT break check-in
      log.error('[kiosk-complete] Lead creation failed (non-blocking)', {
        error_message: leadErr instanceof Error ? leadErr.message : 'Unknown',
        session_id: finalSessionId,
        tenant_id: tenantId,
      })
    }

    // 5c. Link ID scan document to the lead (non-blocking)
    //     Now that we have the lead (created or existing), link the ID scan document
    try {
      const { data: sessionForLead } = await admin
        .from('check_in_sessions')
        .select('id_scan_path, contact_id')
        .eq('id', finalSessionId!)
        .single()

      if (sessionForLead?.id_scan_path && sessionForLead?.contact_id) {
        // Find the lead for this contact
        const { data: activeLead } = await admin
          .from('leads')
          .select('id')
          .eq('contact_id', sessionForLead.contact_id)
          .eq('tenant_id', tenantId)
          .in('status', ['open', 'new', 'contacted', 'qualified', 'pitched'])
          .limit(1)
          .maybeSingle()

        if (activeLead) {
          // Update the document with the lead_id
          await admin
            .from('documents')
            .update({ lead_id: activeLead.id, contact_id: sessionForLead.contact_id })
            .eq('storage_path', sessionForLead.id_scan_path)
            .eq('tenant_id', tenantId)
        }
      }
    } catch {
      // Non-blocking — document-lead linkage failure doesn't break check-in
    }

    // 6. Query returning client/lead info + dispatch notifications
    //    Rule #8 safe: this data is only returned AFTER check-in completes
    let returningInfo: { type: string; staffName: string; staffAvatarUrl: string | null } | null = null
    const notifyUserIds: string[] = []

    if (appointmentId) {
      try {
        // Get appointment with contact info
        const { data: appointment } = await admin
          .from('appointments')
          .select('user_id, contact_id')
          .eq('id', appointmentId)
          .eq('tenant_id', tenantId)
          .single()

        if (appointment) {
          // Track the appointment owner for notification
          if (appointment.user_id) {
            notifyUserIds.push(appointment.user_id)
          }

          let staffResolved = false

          // Path 1: Contact has a responsible_lawyer_id → returning client
          if (appointment.contact_id) {
            const { data: contact } = await admin
              .from('contacts')
              .select('responsible_lawyer_id')
              .eq('id', appointment.contact_id)
              .single()

            if (contact?.responsible_lawyer_id) {
              const { data: lawyer } = await admin
                .from('users')
                .select('id, first_name, last_name, avatar_url')
                .eq('id', contact.responsible_lawyer_id)
                .single()

              if (lawyer) {
                returningInfo = {
                  type: 'client',
                  staffName: [lawyer.first_name, lawyer.last_name].filter(Boolean).join(' '),
                  staffAvatarUrl: lawyer.avatar_url,
                }
                staffResolved = true

                // Also notify the responsible lawyer if different from appointment owner
                if (lawyer.id !== appointment.user_id && !notifyUserIds.includes(lawyer.id)) {
                  notifyUserIds.push(lawyer.id)
                }
              }
            }

            // Path 2: Check if contact is a lead with assigned_to
            if (!staffResolved && appointment.contact_id) {
              const { data: lead } = await admin
                .from('leads')
                .select('assigned_to')
                .eq('contact_id', appointment.contact_id)
                .limit(1)
                .maybeSingle()

              if (lead?.assigned_to) {
                const { data: assignee } = await admin
                  .from('users')
                  .select('id, first_name, last_name, avatar_url')
                  .eq('id', lead.assigned_to)
                  .single()

                if (assignee) {
                  returningInfo = {
                    type: 'lead',
                    staffName: [assignee.first_name, assignee.last_name].filter(Boolean).join(' '),
                    staffAvatarUrl: assignee.avatar_url,
                  }
                  staffResolved = true

                  if (assignee.id !== appointment.user_id && !notifyUserIds.includes(assignee.id)) {
                    notifyUserIds.push(assignee.id)
                  }
                }
              }
            }
          }

          // Path 3: Fallback to appointment owner
          if (!staffResolved && appointment.user_id) {
            const { data: owner } = await admin
              .from('users')
              .select('first_name, last_name, avatar_url')
              .eq('id', appointment.user_id)
              .single()

            if (owner) {
              returningInfo = {
                type: 'appointment',
                staffName: [owner.first_name, owner.last_name].filter(Boolean).join(' '),
                staffAvatarUrl: owner.avatar_url,
              }
            }
          }
        }
      } catch {
        // Non-blocking — returning info failure doesn't break check-in
      }
    }

    // 7. Dispatch notifications to all relevant staff (non-blocking, post-commit)
    //    Rule #16: The durable activity record was created by the atomic triple-write.
    //    This notification dispatch is additive — failure does not affect check-in.
    if (notifyUserIds.length > 0) {
      try {
        const { dispatchNotification } = await import('@/lib/services/notification-engine')
        dispatchNotification(admin, {
          tenantId,
          eventType: 'client_checked_in',
          recipientUserIds: notifyUserIds,
          title: `${guestName} has checked in`,
          message: appointmentId
            ? `Your client ${guestName} has checked in via the lobby kiosk for their appointment.`
            : `Walk-in client ${guestName} has checked in via the lobby kiosk.`,
          entityType: 'check_in_session',
          entityId: finalSessionId ?? undefined,
          priority: 'high',
          metadata: {
            session_id: finalSessionId,
            appointment_id: appointmentId,
          },
        }).catch((err: unknown) => {
          log.error('[kiosk-complete] Notification dispatch error', {
            error_message: err instanceof Error ? err.message : 'Unknown',
          })
        })
      } catch {
        // Non-blocking — notification failure doesn't break check-in
      }
    }

    log.info('[kiosk-complete] Check-in completed via action executor', {
      session_id: finalSessionId,
      tenant_id: tenantId,
      guest_name: guestName,
      has_appointment: !!appointmentId,
      action_id: actionResult.actionId,
      returning_type: returningInfo?.type ?? 'none',
      notify_count: notifyUserIds.length,
      created_lead_id: createdLeadId,
    })

    return NextResponse.json({
      success: true,
      sessionId: finalSessionId,
      actionId: actionResult.actionId,
      returningInfo,
    })
  } catch (error) {
    log.error('[kiosk-complete] Unexpected error', {
      error_message: error instanceof Error ? error.message : 'Unknown',
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withTiming(handlePost, 'POST /api/kiosk/[token]/complete')
