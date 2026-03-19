// ============================================================================
// POST /api/command/convert-and-retain
// "Open File" — Gated conversion: Lead → Matter + Kit Activation + Portal + Docs
// All conversion gates must pass before matter creation is allowed.
// ============================================================================

import { NextResponse } from 'next/server'
import { runConflictScan } from '@/lib/services/conflict-engine'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { activateWorkflowKit, activateImmigrationKit } from '@/lib/services/kit-activation'
import { sendDocumentRequest } from '@/lib/services/document-request-service'
import { evaluateConversionGates } from '@/lib/services/lead-conversion-gate'
import { getWorkspaceWorkflowConfig } from '@/lib/services/workspace-config-service'
import { withTiming } from '@/lib/middleware/request-timing'
import type { Json } from '@/lib/types/database'

async function handlePost(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'matters', 'create')
    const body = await request.json()

    const {
      leadId,
      title,
      practiceAreaId,
      matterTypeId,
      responsibleLawyerId,
      billingType,
      personScope,
      leadUpdatedAt,
    } = body

    if (!leadId || !title?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Lead ID and title are required' },
        { status: 400 }
      )
    }

    const { supabase, tenantId, userId } = auth

    // ── 0. Server-side permission check ─────────────────────────
    const { data: user } = await supabase
      .from('users')
      .select('role_id')
      .eq('id', userId)
      .eq('tenant_id', tenantId)
      .single()

    if (user?.role_id) {
      const { data: role } = await supabase
        .from('roles')
        .select('name, permissions')
        .eq('id', user.role_id)
        .single()

      if (role && role.name !== 'Admin') {
        const perms = role.permissions as Record<string, Record<string, boolean>> | null
        if (!perms?.matters?.create) {
          return NextResponse.json(
            { success: false, error: 'Insufficient permissions: matters:create required' },
            { status: 403 }
          )
        }
      }
    }

    // ── 1. Verify lead exists, is open, not already converted ─────
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('*')
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
      // Idempotency: return existing matter if already converted
      return NextResponse.json(
        {
          success: false,
          error: 'Lead is already converted',
          matterId: lead.converted_matter_id,
        },
        { status: 409 }
      )
    }

    // ── 1a. Pre-matter-open conflict scan ─────────────────────────
    // Re-run conflict scan every time a matter is about to be opened.
    // Uses admin client to bypass RLS — scan must always succeed.
    if (lead.contact_id) {
      try {
        const adminClient = createAdminClient()
        const scanResult = await runConflictScan(adminClient, {
          contactId: lead.contact_id,
          tenantId,
          triggeredBy: userId,
          triggerType: 'pre_matter_open',
        })

        const newStatus = scanResult.scan.status === 'completed'
          ? (scanResult.matches.length === 0
              ? 'auto_scan_complete'
              : (scanResult.scan.score ?? 0) >= 50
                ? 'review_required'
                : 'review_suggested')
          : 'auto_scan_complete'

        // Update lead conflict_status with fresh scan result
        await adminClient
          .from('leads')
          .update({ conflict_status: newStatus })
          .eq('id', leadId)

        // Block immediately for hard conflicts — don't wait for gate evaluation
        const hardBlockStatuses = ['review_required', 'conflict_confirmed', 'blocked']
        if (hardBlockStatuses.includes(newStatus)) {
          const conflictMessages: Record<string, string> = {
            review_required: `Conflict scan flagged ${scanResult.matches.length} potential conflict(s). A lawyer must review this contact before the matter can be opened.`,
            conflict_confirmed: 'A conflict of interest has been confirmed for this contact. Matter cannot be opened.',
            blocked: 'This matter is blocked due to a confirmed conflict of interest.',
          }
          return NextResponse.json(
            {
              success: false,
              error: conflictMessages[newStatus] ?? 'Conflict check failed.',
              conflictStatus: newStatus,
              conflictMatchCount: scanResult.matches.length,
              blockedReasons: [conflictMessages[newStatus] ?? 'Conflict check failed.'],
            },
            { status: 403 }
          )
        }
      } catch (err) {
        // Scan failed — treat as clear so conversion is never blocked by a scan error.
        // The failure is logged; a manual scan can be run from the contact profile.
        console.error('[convert-and-retain] Conflict scan failed, treating as clear:', err)
        await supabase
          .from('leads')
          .update({ conflict_status: 'auto_scan_complete' })
          .eq('id', leadId)
      }
    }

    // ── 1b. Stale-tab protection ──────────────────────────────────
    if (leadUpdatedAt && lead.updated_at) {
      const clientTime = new Date(leadUpdatedAt).getTime()
      const dbTime = new Date(lead.updated_at).getTime()
      if (clientTime < dbTime) {
        return NextResponse.json(
          {
            success: false,
            error: 'Lead has been modified by another user. Please refresh and try again.',
          },
          { status: 409 }
        )
      }
    }

    // ── 1c. Conversion gate enforcement ───────────────────────────
    const workflowConfig = await getWorkspaceWorkflowConfig(supabase, tenantId)
    const gateResult = await evaluateConversionGates(
      supabase,
      leadId,
      tenantId,
      workflowConfig
    )

    if (!gateResult.canConvert) {
      return NextResponse.json(
        {
          success: false,
          error: 'Conversion gates not satisfied',
          blockedReasons: gateResult.blockedReasons,
          gateResults: gateResult.gateResults,
        },
        { status: 403 }
      )
    }

    // ── 2. Resolve practice-area pipeline + win stage ──────────────
    //    On conversion, move the lead from the generic lead pipeline to the
    //    practice-area-specific pipeline and set it to the "Won" stage.
    let targetPipelineId: string | null = null
    let winStageId: string | null = null

    // Try practice-area-specific pipeline first
    const resolvedPracticeAreaId = practiceAreaId || lead.practice_area_id
    if (resolvedPracticeAreaId) {
      const { data: pa } = await supabase
        .from('practice_areas')
        .select('name')
        .eq('id', resolvedPracticeAreaId)
        .single()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const paData = pa as any
      if (paData?.name) {
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
          const { data: winStage } = await supabase
            .from('pipeline_stages')
            .select('id')
            .eq('pipeline_id', targetPipelineId!)
            .eq('is_win_stage', true)
            .limit(1)
            .maybeSingle()
          winStageId = winStage?.id ?? null
        }
      }
    }

    // Fallback: use current pipeline's win stage
    if (!targetPipelineId && lead.pipeline_id) {
      targetPipelineId = lead.pipeline_id
      const { data: winStage } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('pipeline_id', lead.pipeline_id)
        .eq('is_win_stage', true)
        .limit(1)
        .maybeSingle()
      winStageId = winStage?.id ?? null
    }

    // ── 3. Resolve matter type + case type ────────────────────────
    const caseTypeId: string | null = null
    if (matterTypeId) {
      const { data: mt } = await supabase
        .from('matter_types')
        .select('id')
        .eq('id', matterTypeId)
        .eq('tenant_id', tenantId)
        .single()

      if (!mt) {
        return NextResponse.json(
          { success: false, error: 'Matter type not found' },
          { status: 400 }
        )
      }
    }

    // ── 4. Create matter record ───────────────────────────────────
    const { data: matter, error: matterErr } = await supabase
      .from('matters')
      .insert({
        tenant_id: tenantId,
        title: title.trim(),
        practice_area_id: practiceAreaId || null,
        matter_type_id: matterTypeId || null,
        case_type_id: caseTypeId,
        responsible_lawyer_id: responsibleLawyerId || userId,
        billing_type: billingType || 'flat_fee',
        person_scope: personScope || 'single',
        estimated_value: lead.estimated_value ?? null,
        status: 'active',
        priority: 'medium',
        date_opened: new Date().toISOString().split('T')[0],
        created_by: userId,
      })
      .select()
      .single()

    if (matterErr || !matter) {
      console.error('[convert-and-retain] Failed to create matter:', matterErr)
      return NextResponse.json(
        { success: false, error: 'Failed to create matter record' },
        { status: 500 }
      )
    }

    // ── 5. Link contact as 'client' in matter_contacts ────────────
    if (lead.contact_id) {
      await supabase.from('matter_contacts').insert({
        tenant_id: tenantId,
        matter_id: matter.id,
        contact_id: lead.contact_id,
        role: 'client',
      })
    }

    // ── 6. Create matter_intake record ────────────────────────────
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
    }).then(() => {}) // ignore conflict

    // ── 7. Seed principal applicant from contact ──────────────────
    if (lead.contact_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('first_name, last_name, email_primary, phone_primary')
        .eq('id', lead.contact_id)
        .single()

      if (contact) {
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

    // ── 8. Create portal link (30-day token) ──────────────────────
    let portalLinkId: string | null = null
    if (lead.contact_id) {
      const token = crypto.randomUUID() + '-' + crypto.randomUUID()
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 30)

      const { data: portalLink } = await supabase
        .from('portal_links')
        .insert({
          tenant_id: tenantId,
          matter_id: matter.id,
          contact_id: lead.contact_id,
          token,
          expires_at: expiresAt.toISOString(),
          is_active: true,
          created_by: userId,
          metadata: {} as Json,
        })
        .select('id')
        .single()

      portalLinkId = portalLink?.id ?? null
    }

    // ── 9. Activate kit (workflow or immigration) ─────────────────
    try {
      if (matterTypeId && !caseTypeId) {
        await activateWorkflowKit({
          supabase,
          tenantId,
          matterId: matter.id,
          matterTypeId,
          userId,
        })
      }

      if (caseTypeId) {
        await activateImmigrationKit({
          supabase,
          tenantId,
          matterId: matter.id,
          caseTypeId,
          userId,
        })
      }
    } catch (err) {
      console.error('[convert-and-retain] Kit activation failed (non-fatal):', err)
    }

    // ── 10. Send document request if slots were generated ─────────
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
      console.error('[convert-and-retain] Document request failed (non-fatal):', err)
    }

    // ── 10b. Create invoice from retainer package ─────────────────
    const contactId = lead.contact_id
    const { data: retainerPkgForInvoice } = await supabase
      .from('lead_retainer_packages')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (retainerPkgForInvoice?.line_items) {
      const lineItems = (retainerPkgForInvoice.line_items as any[]) ?? []
      const govFees = (retainerPkgForInvoice.government_fees as any[]) ?? []
      const disbursementItems = (retainerPkgForInvoice.disbursements as any[]) ?? []

      // Create invoice
      const { data: invoice } = await supabase
        .from('invoices')
        .insert({
          tenant_id: tenantId,
          matter_id: matter.id,
          contact_id: contactId ?? null,
          invoice_number: `INV-${Date.now().toString(36).toUpperCase()}`,
          issue_date: new Date().toISOString().split('T')[0],
          due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
          subtotal: retainerPkgForInvoice.subtotal_cents ?? 0,
          tax_amount: retainerPkgForInvoice.tax_amount_cents ?? 0,
          total_amount: retainerPkgForInvoice.total_amount_cents ?? 0,
          amount_paid: retainerPkgForInvoice.payment_status === 'paid' ? (retainerPkgForInvoice.payment_amount ?? retainerPkgForInvoice.total_amount_cents ?? 0) : 0,
          status: retainerPkgForInvoice.payment_status === 'paid' ? 'paid' : 'draft',
          notes: retainerPkgForInvoice.payment_terms,
        })
        .select()
        .single()

      if (invoice) {
        // Create line items
        const allItems = [
          ...lineItems.map((li: any, i: number) => ({
            tenant_id: tenantId,
            invoice_id: invoice.id,
            description: li.description,
            quantity: li.quantity ?? 1,
            unit_price: Math.round((li.unitPrice ?? 0) * 100),
            amount: Math.round((li.quantity ?? 1) * (li.unitPrice ?? 0) * 100),
            sort_order: i,
          })),
          ...govFees.map((g: any, i: number) => ({
            tenant_id: tenantId,
            invoice_id: invoice.id,
            description: `[Govt Fee] ${g.description}`,
            quantity: 1,
            unit_price: Math.round((g.amount ?? 0) * 100),
            amount: Math.round((g.amount ?? 0) * 100),
            sort_order: lineItems.length + i,
          })),
          ...disbursementItems.map((d: any, i: number) => ({
            tenant_id: tenantId,
            invoice_id: invoice.id,
            description: `[Disbursement] ${d.description}`,
            quantity: 1,
            unit_price: Math.round((d.amount ?? 0) * 100),
            amount: Math.round((d.amount ?? 0) * 100),
            sort_order: lineItems.length + govFees.length + i,
          })),
        ]

        if (allItems.length > 0) {
          await supabase.from('invoice_line_items').insert(allItems)
        }
      }
    }

    // ── 10c. Link signing documents/requests to the new matter ───
    // Link signing documents to the new matter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('signing_documents')
      .update({ matter_id: matter.id })
      .eq('lead_id', leadId)
      .is('matter_id', null)

    // Link signing requests to the new matter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('signing_requests')
      .update({ matter_id: matter.id })
      .eq('lead_id', leadId)
      .is('matter_id', null)

    // ── 11. Mark lead as converted + move to practice area pipeline ─
    await supabase
      .from('leads')
      .update({
        status: 'converted',
        converted_matter_id: matter.id,
        converted_at: new Date().toISOString(),
        ...(targetPipelineId ? { pipeline_id: targetPipelineId } : {}),
        ...(winStageId ? { stage_id: winStageId, stage_entered_at: new Date().toISOString() } : {}),
      })
      .eq('id', leadId)

    // ── 12. Log audit trail ───────────────────────────────────────
    // Fetch retainer package info for audit metadata
    const { data: retainerPkg } = await supabase
      .from('lead_retainer_packages')
      .select('id, status, payment_status')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    await supabase.from('activities').insert({
      tenant_id: tenantId,
      matter_id: matter.id,
      activity_type: 'file_opened',
      title: 'File opened — matter created',
      description: `Lead converted and matter "${matter.title}" created with full kit activation.`,
      entity_type: 'matter',
      entity_id: matter.id,
      user_id: userId,
      metadata: {
        lead_id: leadId,
        matter_id: matter.id,
        matter_number: matter.matter_number,
        person_scope: personScope || 'single',
        portal_link_id: portalLinkId,
        matter_type_id: matterTypeId,
        practice_area_id: practiceAreaId,
        gate_results: gateResult.gateResults,
        retainer_package_id: retainerPkg?.id ?? null,
        payment_status: retainerPkg?.payment_status ?? null,
        conversion_steps_completed: [
          'matter_created',
          lead.contact_id ? 'contact_linked' : null,
          portalLinkId ? 'portal_link_created' : null,
        ].filter(Boolean),
      } as unknown as Json,
    })

    return NextResponse.json({
      success: true,
      matterId: matter.id,
      matterNumber: matter.matter_number,
    })
  } catch (err) {
    console.error('[convert-and-retain] Error:', err)

    // Check for auth errors
    if (err && typeof err === 'object' && 'statusCode' in err) {
      const authErr = err as { statusCode: number; message: string }
      return NextResponse.json(
        { success: false, error: authErr.message },
        { status: authErr.statusCode }
      )
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/command/convert-and-retain')
