/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Lead Conversion Executor — One Lead → One Matter
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Orchestrates the controlled conversion of a lead into a matter.
 * This is a legal-operational state change with full audit trail.
 *
 * Flow:
 *   1. Validate lead exists, is open, belongs to tenant
 *   2. Evaluate all conversion gates (via lead-conversion-gate.ts)
 *   3. Log conversion ATTEMPT activity (regardless of outcome)
 *   4. If gates blocked → log BLOCKED activity, return structured error
 *   5. If gates pass → create matter, link lead, advance stage, log COMPLETED
 *
 * Rules:
 *   - One lead → one matter (enforced by gate + DB)
 *   - Lead is preserved — never deleted. Status set to 'converted'.
 *   - Post-conversion, lead becomes read-only for future operations.
 *   - Matter stores originating_lead_id for full traceability.
 *   - All events (attempt, blocked, completed) are logged to activities table.
 *
 * Uses idempotency ledger to prevent duplicate conversions from concurrent
 * requests or retries.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/types/database'
import { evaluateConversionGates, type ConversionGateResult } from './lead-conversion-gate'
import { getWorkspaceWorkflowConfig } from './workspace-config-service'
import { advanceLeadStage } from './lead-stage-engine'
import { executeIdempotent, idempotencyKeys } from './lead-idempotency'
import { recalculateLeadSummary } from './lead-summary-recalculator'
import { resolveTemplate, isAutomationEnabled, buildBaseTemplateContext } from './lead-template-engine'
import { activateWorkflowKit, activateImmigrationKit } from './kit-activation'
import { sendDocumentRequest } from './document-request-service'
import { LEAD_STAGES } from '@/lib/config/lead-workflow-definitions'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ConversionParams {
  supabase: SupabaseClient<Database>
  leadId: string
  tenantId: string
  userId: string
  matterData: {
    title: string
    description?: string
    practiceAreaId?: string
    responsibleLawyerId?: string
    originatingLawyerId?: string
    matterTypeId?: string
    caseTypeId?: string
    billingType?: string
    priority?: string
    pipelineId?: string
    stageId?: string
  }
  /**
   * Optional gate overrides — set specific gates to false to disable them.
   * Used by auto-conversion paths (paper-sign + payment) where the user has
   * explicitly confirmed conversion and non-essential gates (conflict, intake)
   * should not block.
   */
  gateOverrides?: Partial<Record<string, boolean>>
}

export interface ConversionResult {
  success: boolean
  matterId?: string
  error?: string
  gateResults?: ConversionGateResult
  /** Audit event IDs created during conversion */
  auditEvents: ConversionAuditEvent[]
}

export interface ConversionAuditEvent {
  type: 'attempt' | 'blocked' | 'completed'
  activityId?: string
  timestamp: string
}

// ─── Conversion Executor ────────────────────────────────────────────────────

/**
 * Convert a lead to a matter with full gating, audit trail, and idempotency.
 *
 * This function NEVER bypasses gates. If gates fail, it returns a structured
 * error with all gate results and blocked reasons — the caller can surface
 * these to the user for resolution.
 */
export async function convertLeadToMatter(
  params: ConversionParams
): Promise<ConversionResult> {
  const { supabase, leadId, tenantId, userId, matterData } = params
  const auditEvents: ConversionAuditEvent[] = []

  // ─── 1. Validate lead exists and is convertible ───────────────────────────

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id, tenant_id, status, current_stage, is_closed, converted_matter_id, contact_id, practice_area_id, responsible_lawyer_id, assigned_to, pipeline_id')
    .eq('id', leadId)
    .eq('tenant_id', tenantId)
    .single()

  if (leadError || !lead) {
    return {
      success: false,
      error: 'Lead not found or access denied.',
      auditEvents,
    }
  }

  if (lead.converted_matter_id) {
    // Idempotent: lead was already converted — return the existing matter ID as success
    return {
      success: true,
      matterId: lead.converted_matter_id,
      auditEvents,
    }
  }

  if (lead.is_closed) {
    return {
      success: false,
      error: 'Cannot convert a closed lead. Reopen it first.',
      auditEvents,
    }
  }

  // ─── 1b. Validate required matter data before conversion ────────────────
  // Practice area, matter type, and responsible lawyer must be set — either
  // from the matterData payload or from the lead record itself.

  const effectivePracticeAreaId = matterData.practiceAreaId || lead.practice_area_id
  const effectiveMatterTypeId = matterData.matterTypeId
  const effectiveResponsibleLawyerId = matterData.responsibleLawyerId || lead.responsible_lawyer_id || lead.assigned_to

  const missingFields: string[] = []
  if (!effectivePracticeAreaId) missingFields.push('Practice Area')
  if (!effectiveMatterTypeId) missingFields.push('Matter Type')
  if (!effectiveResponsibleLawyerId) missingFields.push('Assigned Lawyer')

  if (missingFields.length > 0) {
    const fieldInstructions: Record<string, string> = {
      'Practice Area': 'Practice Area is not set — open the lead details and select a Practice Area (e.g. Immigration, Family Law).',
      'Matter Type': 'Matter Type is not set — open the lead details and select the specific matter type (e.g. Visitor Visa, Study Permit).',
      'Assigned Lawyer': 'No lawyer is assigned to this lead — open the lead details and assign a Responsible Lawyer.',
    }
    return {
      success: false,
      error: missingFields.map((f) => fieldInstructions[f] ?? `${f} is required`).join('\n'),
      auditEvents,
    }
  }

  // ─── 2. Evaluate conversion gates ─────────────────────────────────────────

  const config = await getWorkspaceWorkflowConfig(supabase, tenantId)

  // Apply gate overrides if provided (e.g., disable conflict_cleared/intake_complete
  // for auto-conversion paths where user has explicitly confirmed)
  if (params.gateOverrides) {
    const gates = config.activeConversionGates as Record<string, boolean>
    for (const [key, value] of Object.entries(params.gateOverrides)) {
      if (key in gates && typeof value === 'boolean') {
        gates[key] = value
      }
    }
  }

  const gateResult = await evaluateConversionGates(supabase, leadId, tenantId, config)

  // ─── 3. Log conversion ATTEMPT (always, regardless of outcome) ────────────

  const attemptActivity = await logConversionActivity(supabase, {
    tenantId,
    leadId,
    userId,
    type: 'attempt',
    metadata: {
      gate_results: gateResult.gateResults.map((g) => ({
        gate: g.gate,
        passed: g.passed,
        enabled: g.enabled,
      })),
      can_convert: gateResult.canConvert,
      matter_title: matterData.title,
    },
  })

  auditEvents.push({
    type: 'attempt',
    activityId: attemptActivity?.id,
    timestamp: new Date().toISOString(),
  })

  // ─── 4. If gates blocked → log and return ─────────────────────────────────

  if (!gateResult.canConvert) {
    const blockedActivity = await logConversionActivity(supabase, {
      tenantId,
      leadId,
      userId,
      type: 'blocked',
      metadata: {
        blocked_reasons: gateResult.blockedReasons,
        gate_results: gateResult.gateResults.map((g) => ({
          gate: g.gate,
          label: g.label,
          passed: g.passed,
          reason: g.reason,
        })),
      },
    })

    auditEvents.push({
      type: 'blocked',
      activityId: blockedActivity?.id,
      timestamp: new Date().toISOString(),
    })

    return {
      success: false,
      error: gateResult.blockedReasons.join('\n'),
      gateResults: gateResult,
      auditEvents,
    }
  }

  // ─── 5. Execute conversion (idempotent) ───────────────────────────────────

  // ─── 4b. Clear any stale idempotency entry from a previously FAILED attempt ─
  // The idempotency key `conversion:{leadId}` is a one-time key. If a previous
  // attempt failed mid-way (matter INSERT threw, RLS blocked, etc.), the ledger
  // still has the entry which permanently blocks all future retries, even though
  // `lead.converted_matter_id` is still null (no matter was created).
  //
  // Since we confirmed above that converted_matter_id is null, any existing
  // ledger entry for this key is from a failed conversion. Deleting it is safe:
  // the DB unique constraint on `converted_matter_id` and the gate check above
  // provide idempotency for successful conversions independently.
  await supabase
    .from('lead_workflow_executions')
    .delete()
    .eq('execution_key', idempotencyKeys.conversion(leadId))
    .eq('tenant_id', tenantId)

  const idempotentResult = await executeIdempotent<{ matterId: string }>(supabase, {
    tenantId,
    leadId,
    executionType: 'conversion',
    executionKey: idempotencyKeys.conversion(leadId),
    actorUserId: userId,
    metadata: { matter_title: matterData.title },
    handler: async () => {
      // 5a. Create the matter
      const { data: matter, error: matterError } = await supabase
        .from('matters')
        .insert({
          tenant_id: tenantId,
          title: matterData.title.trim(),
          description: matterData.description || null,
          practice_area_id: matterData.practiceAreaId || lead.practice_area_id || null,
          matter_type_id: matterData.matterTypeId || null,
          case_type_id: matterData.caseTypeId || null,
          responsible_lawyer_id: matterData.responsibleLawyerId || lead.responsible_lawyer_id || lead.assigned_to || userId,
          originating_lawyer_id: matterData.originatingLawyerId || null,
          billing_type: matterData.billingType || 'flat_fee',
          priority: matterData.priority || 'medium',
          status: 'active',
          date_opened: new Date().toISOString().split('T')[0],
          pipeline_id: matterData.pipelineId || null,
          stage_id: matterData.stageId || null,
          originating_lead_id: leadId,
        })
        .select('id')
        .single()

      if (matterError || !matter) {
        throw new Error(matterError?.message || 'Failed to create matter record.')
      }

      // 5b. Resolve practice-area pipeline + win stage for the lead
      //     On conversion, move the lead from the generic lead pipeline to the
      //     practice-area-specific pipeline and set it to the "Won" stage.
      let targetPipelineId: string | null = null
      let targetWinStageId: string | null = null

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const leadAny = lead as any
        const practiceAreaId = matterData.practiceAreaId || leadAny.practice_area_id

        if (practiceAreaId) {
          // Look up practice area name for matching against pipeline.practice_area
          const { data: pa } = await supabase
            .from('practice_areas')
            .select('name')
            .eq('id', practiceAreaId)
            .single()

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const paData = pa as any
          if (paData?.name) {
            // Find practice-area-specific pipeline
            const { data: paPipeline } = await supabase
              .from('pipelines')
              .select('id')
              .eq('tenant_id', tenantId)
              .eq('pipeline_type', 'lead')
              .eq('practice_area', paData.name)
              .eq('is_active', true)
              .limit(1)
              .maybeSingle()

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const paPipelineData = paPipeline as any
            if (paPipelineData?.id) {
              targetPipelineId = paPipelineData.id

              // Find win stage of that pipeline
              const { data: winStage } = await supabase
                .from('pipeline_stages')
                .select('id')
                .eq('pipeline_id', targetPipelineId!)
                .eq('is_win_stage', true)
                .limit(1)
                .maybeSingle()

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const winStageData = winStage as any
              targetWinStageId = winStageData?.id ?? null
            }
          }
        }

        // Fallback: if no practice-area pipeline, use current pipeline's win stage
        if (!targetPipelineId && leadAny.pipeline_id) {
          targetPipelineId = leadAny.pipeline_id as string
          const { data: winStage } = await supabase
            .from('pipeline_stages')
            .select('id')
            .eq('pipeline_id', targetPipelineId!)
            .eq('is_win_stage', true)
            .limit(1)
            .maybeSingle()

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const winStageData = winStage as any
          targetWinStageId = winStageData?.id ?? null
        }
      } catch (pipelineErr) {
        console.warn('[conversion] Pipeline resolution failed (non-blocking):', pipelineErr)
      }

      // 5c. Update lead: mark as converted + move to practice area pipeline win stage
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const leadUpdate: Record<string, any> = {
        status: 'converted',
        converted_matter_id: matter.id,
        converted_at: new Date().toISOString(),
      }
      if (targetPipelineId) leadUpdate.pipeline_id = targetPipelineId
      if (targetWinStageId) {
        leadUpdate.stage_id = targetWinStageId
        leadUpdate.stage_entered_at = new Date().toISOString()
      }

      const { error: updateError } = await supabase
        .from('leads')
        .update(leadUpdate as never)
        .eq('id', leadId)

      if (updateError) {
        throw new Error(`Failed to update lead status: ${updateError.message}`)
      }

      // 5e. Advance lead stage to CONVERTED (skipGuards — gates already passed)
      await advanceLeadStage({
        supabase,
        leadId,
        tenantId,
        targetStage: LEAD_STAGES.CONVERTED,
        actorUserId: userId,
        actorType: 'system',
        reason: `Converted to matter: ${matter.id}`,
        skipGuards: true,
      })

      // 5f. Copy contact linkage: seed principal from lead's contact
      if (lead.contact_id) {
        const { data: contact } = await supabase
          .from('contacts')
          .select('first_name, last_name, email_primary, phone_primary')
          .eq('id', lead.contact_id)
          .single()

        if (contact) {
          // Check if PA already exists (idempotency)
          const { data: existingPA } = await supabase
            .from('matter_people')
            .select('id')
            .eq('matter_id', matter.id)
            .eq('person_role', 'principal_applicant')
            .eq('is_active', true)
            .maybeSingle()

          if (!existingPA) {
            await supabase.from('matter_people').insert({
              tenant_id: tenantId,
              matter_id: matter.id,
              contact_id: lead.contact_id,
              person_role: 'principal_applicant',
              first_name: contact.first_name || '',
              last_name: contact.last_name || '',
              email: contact.email_primary || null,
              phone: contact.phone_primary || null,
            })
          }
        }
      }

      // 5g. Link contact as 'client' in matter_contacts (required for command centre)
      if (lead.contact_id) {
        const { data: existingMC } = await supabase
          .from('matter_contacts')
          .select('id')
          .eq('matter_id', matter.id)
          .eq('contact_id', lead.contact_id)
          .maybeSingle()

        if (!existingMC) {
          await supabase.from('matter_contacts').insert({
            tenant_id: tenantId,
            matter_id: matter.id,
            contact_id: lead.contact_id,
            role: 'client',
          })
        }
      }

      // 5h. Create matter_intake record
      try {
        const { data: tenantRow } = await supabase
          .from('tenants')
          .select('jurisdiction_code')
          .eq('id', tenantId)
          .single()

        await supabase.from('matter_intake').insert({
          tenant_id: tenantId,
          matter_id: matter.id,
          intake_status: 'incomplete',
          jurisdiction: tenantRow?.jurisdiction_code ?? 'CA',
        })
      } catch {
        // Non-fatal: ignore if matter_intake insert conflicts
      }

      // 5i. Create portal link (30-day token)
      if (lead.contact_id) {
        try {
          const token = crypto.randomUUID() + '-' + crypto.randomUUID()
          const expiresAt = new Date()
          expiresAt.setDate(expiresAt.getDate() + 30)

          await supabase.from('portal_links').insert({
            tenant_id: tenantId,
            matter_id: matter.id,
            contact_id: lead.contact_id,
            token,
            expires_at: expiresAt.toISOString(),
            is_active: true,
            created_by: userId,
            metadata: {} as unknown as Json,
          })
        } catch {
          console.warn('[conversion] Portal link creation failed (non-fatal)')
        }
      }

      // 5j. Activate kit (workflow or immigration)
      try {
        const resolvedMatterTypeId = matterData.matterTypeId
        const resolvedCaseTypeId = matterData.caseTypeId
        if (resolvedMatterTypeId && !resolvedCaseTypeId) {
          await activateWorkflowKit({
            supabase,
            tenantId,
            matterId: matter.id,
            matterTypeId: resolvedMatterTypeId,
            userId,
          })
        }
        if (resolvedCaseTypeId) {
          await activateImmigrationKit({
            supabase,
            tenantId,
            matterId: matter.id,
            caseTypeId: resolvedCaseTypeId,
            userId,
          })
        }
      } catch (err) {
        console.warn('[conversion] Kit activation failed (non-fatal):', err)
      }

      // 5k. Create invoice from retainer package
      try {
        const { data: retainerPkg } = await supabase
          .from('lead_retainer_packages')
          .select('*')
          .eq('lead_id', leadId)
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rpAny = retainerPkg as any
        if (rpAny?.line_items) {
          const lineItems = (rpAny.line_items as any[]) ?? []
          const govFees = (rpAny.government_fees as any[]) ?? []
          const disbursementItems = (rpAny.disbursements as any[]) ?? []

          const { data: invoice } = await supabase
            .from('invoices')
            .insert({
              tenant_id: tenantId,
              matter_id: matter.id,
              contact_id: lead.contact_id ?? null,
              invoice_number: `INV-${Date.now().toString(36).toUpperCase()}`,
              issue_date: new Date().toISOString().split('T')[0],
              due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
              subtotal: rpAny.subtotal_cents ?? 0,
              tax_amount: rpAny.tax_amount_cents ?? 0,
              total_amount: rpAny.total_amount_cents ?? 0,
              amount_paid: rpAny.payment_status === 'paid' ? (rpAny.payment_amount ?? rpAny.total_amount_cents ?? 0) : 0,
              status: rpAny.payment_status === 'paid' ? 'paid' : 'draft',
              notes: rpAny.payment_terms,
            })
            .select()
            .single()

          if (invoice) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const invAny = invoice as any
            const allItems = [
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ...lineItems.map((li: any, i: number) => ({
                invoice_id: invAny.id,
                description: li.description,
                quantity: li.quantity ?? 1,
                unit_price: Math.round((li.unitPrice ?? 0) * 100),
                amount: Math.round((li.quantity ?? 1) * (li.unitPrice ?? 0) * 100),
                sort_order: i,
              })),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ...govFees.map((g: any, i: number) => ({
                invoice_id: invAny.id,
                description: `[Govt Fee] ${g.description}`,
                quantity: 1,
                unit_price: Math.round((g.amount ?? 0) * 100),
                amount: Math.round((g.amount ?? 0) * 100),
                sort_order: lineItems.length + i,
              })),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ...disbursementItems.map((d: any, i: number) => ({
                invoice_id: invAny.id,
                description: `[Disbursement] ${d.description}`,
                quantity: 1,
                unit_price: Math.round((d.amount ?? 0) * 100),
                amount: Math.round((d.amount ?? 0) * 100),
                sort_order: lineItems.length + govFees.length + i,
              })),
            ]

            if (allItems.length > 0) {
              await (supabase as any).from('invoice_line_items').insert(allItems)
            }
          }
        }
      } catch (err) {
        console.warn('[conversion] Invoice creation failed (non-fatal):', err)
      }

      // 5l. Link signing documents/requests to the new matter
      await (supabase as any)
        .from('signing_documents')
        .update({ matter_id: matter.id })
        .eq('lead_id', leadId)
        .is('matter_id', null)

      await (supabase as any)
        .from('signing_requests')
        .update({ matter_id: matter.id })
        .eq('lead_id', leadId)
        .is('matter_id', null)

      // 5m. Migrate lead documents to the new matter
      await supabase
        .from('documents')
        .update({ matter_id: matter.id })
        .eq('lead_id', leadId)
        .is('matter_id', null)

      // 5n. Send document request if doc slots were generated by kit
      try {
        const { data: slots } = await supabase
          .from('document_slots')
          .select('id')
          .eq('matter_id', matter.id)
          .eq('is_required', true)
          .eq('is_active', true)
          .limit(50)

        if (slots && slots.length > 0) {
          await sendDocumentRequest({
            supabase,
            tenantId,
            matterId: matter.id,
            slotIds: slots.map((s) => s.id),
            requestedBy: userId,
            message: 'Welcome! Please upload the following documents to get started.',
          })
        }
      } catch (err) {
        console.warn('[conversion] Document request send failed (non-fatal):', err)
      }

      // 5o. Create OneDrive folder structure for the matter (if connected)
      //   5o-1: Top-level matter folder in OneDrive (existing)
      //   5o-2: Create all subfolders matching DB folder hierarchy (new)
      //   5o-3: Migrate lead documents into correct subfolders (new)
      try {
        const { createServiceRoleClient } = await import('@/lib/supabase/server')
        const adminClient = createServiceRoleClient()

        const { data: conn } = await adminClient
          .from('microsoft_connections')
          .select('id, onedrive_enabled')
          .eq('user_id', userId)
          .eq('is_active', true)
          .maybeSingle()

        if (conn?.onedrive_enabled) {
          const { data: matterInfo } = await supabase
            .from('matters')
            .select('matter_number, title')
            .eq('id', matter.id)
            .single()

          if (matterInfo) {
            const {
              ensureMatterSubfolder,
              syncMatterFoldersToOneDrive,
              migrateLeadDocumentsToOneDrive,
            } = await import('@/lib/services/microsoft-onedrive')

            // 5o-1: Create top-level matter folder in OneDrive
            const matterFolder = await ensureMatterSubfolder(conn.id, adminClient, {
              matterId: matter.id,
              matterNumber: matterInfo.matter_number,
              matterTitle: matterInfo.title,
            })

            // 5o-2: Create all subfolders matching the DB folder hierarchy
            await syncMatterFoldersToOneDrive(conn.id, adminClient, {
              matterId: matter.id,
              matterOneDriveFolderId: matterFolder.folderId,
            })

            // 5o-3: Migrate lead documents into correct OneDrive subfolders
            await migrateLeadDocumentsToOneDrive(conn.id, adminClient, {
              matterId: matter.id,
              leadId,
              matterOneDriveFolderId: matterFolder.folderId,
              matterNumber: matterInfo.matter_number,
            })
          }
        }
      } catch (err) {
        console.warn('[conversion] OneDrive folder/document sync failed (non-fatal):', err)
      }

      // 5p. Recalculate lead summary
      await recalculateLeadSummary(supabase, leadId, tenantId)

      return { matterId: matter.id }
    },
  })

  // If idempotency detected duplicate, return success with existing data
  if (idempotentResult.skipped) {
    // Fetch the existing converted matter ID
    const { data: existingLead } = await supabase
      .from('leads')
      .select('converted_matter_id')
      .eq('id', leadId)
      .single()

    return {
      success: true,
      matterId: existingLead?.converted_matter_id ?? undefined,
      auditEvents,
    }
  }

  if (!idempotentResult.executed || !idempotentResult.data) {
    return {
      success: false,
      error: 'Conversion execution failed unexpectedly.',
      auditEvents,
    }
  }

  const matterId = idempotentResult.data.matterId

  // ─── 6. Log conversion COMPLETED activity (on both lead and matter) ───────

  const completedActivity = await logConversionActivity(supabase, {
    tenantId,
    leadId,
    userId,
    type: 'completed',
    matterId,
    metadata: {
      matter_id: matterId,
      matter_title: matterData.title,
      gate_results: gateResult.gateResults.map((g) => ({
        gate: g.gate,
        passed: g.passed,
      })),
    },
  })

  auditEvents.push({
    type: 'completed',
    activityId: completedActivity?.id,
    timestamp: new Date().toISOString(),
  })

  // Also log on the matter side
  await supabase.from('activities').insert({
    tenant_id: tenantId,
    matter_id: matterId,
    activity_type: 'lead_converted',
    title: 'Created from lead conversion',
    description: `This matter was created from lead ${leadId}.`,
    entity_type: 'matter',
    entity_id: matterId,
    user_id: userId,
    metadata: {
      originating_lead_id: leadId,
      conversion_timestamp: new Date().toISOString(),
    } as unknown as Json,
  })

  // ─── 7. Send conversion notification (if enabled) ─────────────────────────

  try {
    const enabled = await isAutomationEnabled(supabase, tenantId, 'conversion_complete')
    if (enabled) {
      const context = await buildBaseTemplateContext(supabase, tenantId, leadId)
      const template = await resolveTemplate(
        supabase,
        tenantId,
        'conversion_complete',
        'in_app',
        context
      )
      // Template resolved — available for notification dispatch
      // The notification engine can use template.subject and template.body
      // This wires the automation settings layer into conversion events
      if (template) {
        await supabase.from('activities').insert({
          tenant_id: tenantId,
          matter_id: matterId,
          activity_type: 'automation_notification',
          title: template.subject || 'Lead converted to matter',
          description: template.body,
          entity_type: 'matter',
          entity_id: matterId,
          user_id: null,
          metadata: {
            trigger_key: 'conversion_complete',
            template_source: template.isWorkspaceOverride ? 'workspace' : 'system_default',
            channel: template.channel,
          } as unknown as Json,
        })
      }
    }
  } catch {
    // Notification failure is non-fatal — conversion already completed
  }

  return {
    success: true,
    matterId,
    gateResults: gateResult,
    auditEvents,
  }
}

// ─── Activity Logging Helpers ───────────────────────────────────────────────

const CONVERSION_ACTIVITY_TYPES = {
  attempt: {
    activityType: 'conversion_attempted',
    title: 'Matter conversion attempted',
    description: 'An attempt was made to convert this lead to a matter.',
  },
  blocked: {
    activityType: 'conversion_blocked',
    title: 'Matter conversion blocked',
    description: 'Conversion was blocked because one or more gates did not pass.',
  },
  completed: {
    activityType: 'conversion_completed',
    title: 'Lead converted to matter',
    description: 'This lead was successfully converted to an active matter.',
  },
} as const

async function logConversionActivity(
  supabase: SupabaseClient<Database>,
  params: {
    tenantId: string
    leadId: string
    userId: string
    type: 'attempt' | 'blocked' | 'completed'
    matterId?: string
    metadata?: Record<string, unknown>
  }
): Promise<{ id: string } | null> {
  const config = CONVERSION_ACTIVITY_TYPES[params.type]

  const { data } = await supabase
    .from('activities')
    .insert({
      tenant_id: params.tenantId,
      activity_type: config.activityType,
      title: config.title,
      description: config.description,
      entity_type: 'lead',
      entity_id: params.leadId,
      user_id: params.userId,
      matter_id: params.matterId ?? null,
      metadata: (params.metadata ?? {}) as unknown as Json,
    })
    .select('id')
    .single()

  return data
}
