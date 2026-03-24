// ============================================================================
// POST /api/command/record-retainer-payment
// Records retainer payment receipt. Supports partial payments (cumulative).
// On full payment: auto-advances to fully_retained and auto-converts lead
// to a matter (assigns matter number, activates kit, creates invoice, etc.).
// ============================================================================

import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { recalculateLeadSummary } from '@/lib/services/lead-summary-recalculator'
import { advanceLeadStage } from '@/lib/services/lead-stage-engine'
import { convertLeadToMatter } from '@/lib/services/lead-conversion-executor'
import { requirePermission } from '@/lib/services/require-role'
import type { Json } from '@/lib/types/database'

// ── Request Type ───────────────────────────────────────────────────────────

interface RecordPaymentBody {
  leadId: string
  retainerPackageId: string
  /** Amount in cents */
  amount: number
  paymentMethod: string
  reference?: string
}

// ── Handler ────────────────────────────────────────────────────────────────

async function handlePost(request: Request) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'leads', 'edit')
    const { supabase, tenantId, userId } = auth
    const admin = createAdminClient()

    const body = (await request.json()) as RecordPaymentBody
    const { leadId, retainerPackageId, amount, paymentMethod, reference } = body

    // ── Validate required params ──────────────────────────────────
    if (!leadId || !retainerPackageId || !amount || !paymentMethod) {
      return NextResponse.json(
        { success: false, error: 'leadId, retainerPackageId, amount, and paymentMethod are required' },
        { status: 400 },
      )
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'amount must be a positive number (in cents)' },
        { status: 400 },
      )
    }

    // ── Verify retainer package exists and belongs to this tenant ─
    const { data: retainerPkg, error: pkgErr } = await supabase
      .from('lead_retainer_packages')
      .select('id, lead_id, status, payment_status, payment_amount, total_amount_cents, line_items, government_fees, disbursements, subtotal_cents, tax_amount_cents, payment_terms')
      .eq('id', retainerPackageId)
      .eq('tenant_id', tenantId)
      .single()

    if (pkgErr || !retainerPkg) {
      return NextResponse.json(
        { success: false, error: 'Retainer package not found' },
        { status: 404 },
      )
    }

    if (retainerPkg.lead_id !== leadId) {
      return NextResponse.json(
        { success: false, error: 'Retainer package does not belong to the specified lead' },
        { status: 400 },
      )
    }

    // ── Calculate cumulative payment (partial payment support) ─────
    const previouslyPaid = Number(retainerPkg.payment_amount ?? 0)
    const totalPaid = previouslyPaid + amount
    const totalOwed = Number(retainerPkg.total_amount_cents ?? 0)
    const isFullyPaid = totalOwed > 0 ? totalPaid >= totalOwed : true
    const balance = Math.max(totalOwed - totalPaid, 0)

    // ── Update retainer package with payment details ──────────────
    const now = new Date().toISOString()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatePayload: Record<string, any> = {
      payment_status: isFullyPaid ? 'paid' : 'partial',
      payment_amount: totalPaid,
      payment_method: paymentMethod,
      payment_received_at: now,
      updated_at: now,
    }

    // Any payment received on a signed/sent retainer → advance to fully_retained
    // (the firm has accepted funds — conversion will be triggered)
    if (retainerPkg.status === 'signed' || retainerPkg.status === 'sent') {
      updatePayload.status = 'fully_retained'
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin
      .from('lead_retainer_packages') as any)
      .update(updatePayload)
      .eq('id', retainerPackageId)
      .eq('tenant_id', tenantId)

    // ── Recalculate lead summary ──────────────────────────────────
    await recalculateLeadSummary(admin, leadId, tenantId)

    // ── Best-effort stage advance to retained_active_matter ───────
    try {
      await advanceLeadStage({
        supabase: admin,
        leadId,
        tenantId,
        targetStage: 'retained_active_matter',
        actorUserId: userId,
        actorType: 'system',
        reason: 'Retainer payment recorded',
      })
    } catch (stageErr) {
      // Non-blocking: stage advance failure should not fail the payment recording
      console.warn('[record-retainer-payment] Stage advance failed (non-blocking):', stageErr)
    }

    // ── Activity log ──────────────────────────────────────────────
    const amountFormatted = `$${(amount / 100).toFixed(2)}`
    const totalPaidFormatted = `$${(totalPaid / 100).toFixed(2)}`
    const balanceFormatted = `$${(balance / 100).toFixed(2)}`

    await admin.from('activities').insert({
      tenant_id: tenantId,
      activity_type: 'retainer_payment_recorded',
      title: `Payment recorded: ${amountFormatted}${!isFullyPaid ? ` (balance: ${balanceFormatted})` : ' — paid in full'}`,
      description: [
        `Payment: ${amountFormatted} via ${paymentMethod}`,
        reference ? `Reference: ${reference}` : null,
        `Total paid: ${totalPaidFormatted}`,
        !isFullyPaid ? `Balance remaining: ${balanceFormatted}` : null,
        isFullyPaid && retainerPkg.status === 'signed' ? 'Status advanced to fully_retained' : null,
      ].filter(Boolean).join('. '),
      entity_type: 'lead',
      entity_id: leadId,
      user_id: userId,
      metadata: {
        retainer_package_id: retainerPackageId,
        amount,
        total_paid: totalPaid,
        total_owed: totalOwed,
        balance,
        payment_method: paymentMethod,
        reference: reference ?? null,
        previous_status: retainerPkg.status,
        new_status: updatePayload.status ?? retainerPkg.status,
        previous_payment_status: retainerPkg.payment_status,
        new_payment_status: isFullyPaid ? 'paid' : 'partial',
        is_fully_paid: isFullyPaid,
      } as unknown as Json,
    })

    // ── Auto-convert lead to matter on any payment ─────────────────
    // Conversion triggers as soon as any payment is received (partial or full).
    // The firm has accepted funds — the lead becomes a matter.
    let matterId: string | null = null
    let matterNumber: string | null = null
    let conversionError: string | null = null

    {
      try {
        // Fetch lead + contact data for matter creation
        const { data: lead } = await supabase
          .from('leads')
          .select('id, contact_id, matter_type_id, practice_area_id, responsible_lawyer_id, assigned_to, person_scope, status, converted_matter_id')
          .eq('id', leadId)
          .single()

        if (lead && lead.status !== 'converted' && !lead.converted_matter_id) {
          // Build matter title from contact name + matter type
          let matterTitle = 'New Matter'
          if (lead.contact_id) {
            const { data: contact } = await supabase
              .from('contacts')
              .select('first_name, last_name')
              .eq('id', lead.contact_id)
              .single()
            if (contact) {
              const name = `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim()
              if (name) matterTitle = name
            }
          }

          // Append matter type name to title
          if (lead.matter_type_id) {
            const { data: mt } = await supabase
              .from('matter_types')
              .select('name')
              .eq('id', lead.matter_type_id)
              .single()
            if (mt?.name) {
              matterTitle = `${matterTitle} — ${mt.name}`
            }
          }

          // Get billing type from retainer package
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const billingType = (retainerPkg as any).billing_type || 'flat_fee'

          // Execute conversion using admin client to bypass RLS on matters INSERT.
          // Skip conflict_cleared and intake_complete gates — the user has
          // already gone through consultation + retainer flow and explicitly
          // recorded payment. These gates should have been satisfied during
          // the consultation outcome step.
          const conversionResult = await convertLeadToMatter({
            supabase: admin,
            leadId,
            tenantId,
            userId,
            matterData: {
              title: matterTitle,
              matterTypeId: lead.matter_type_id || undefined,
              practiceAreaId: lead.practice_area_id || undefined,
              responsibleLawyerId: lead.responsible_lawyer_id || lead.assigned_to || undefined,
              billingType,
            },
            gateOverrides: {
              conflict_cleared: false,
              intake_complete: false,
            },
          })

          if (conversionResult.success && conversionResult.matterId) {
            matterId = conversionResult.matterId

            // Fetch matter number (auto-generated by DB trigger)
            const { data: matter } = await admin
              .from('matters')
              .select('matter_number')
              .eq('id', matterId)
              .single()
            matterNumber = matter?.matter_number ?? null
            // All post-conversion setup (matter_contacts, intake, portal link,
            // kit activation, invoice, signing docs, document migration, OneDrive)
            // is handled inside convertLeadToMatter() executor.
          } else if (!conversionResult.success) {
            const reasons: string[] = conversionResult.gateResults
              ? conversionResult.gateResults.blockedReasons
              : conversionResult.error
                ? conversionResult.error.split('\n').filter(Boolean)
                : ['Matter could not be created automatically. Check that Practice Area, Matter Type, and Responsible Lawyer are set on this lead.']
            conversionError = reasons.join('\n')
            console.warn('[record-retainer-payment] Auto-conversion blocked:', conversionError)
          }
        }
      } catch (convErr) {
        // Non-blocking: conversion failure should not fail the payment recording
        conversionError = convErr instanceof Error ? convErr.message : 'Conversion failed'
        console.warn('[record-retainer-payment] Auto-conversion failed (non-blocking):', convErr)
      }
    }

    return NextResponse.json({
      success: true,
      matterId,
      matterNumber,
      conversionError: conversionError ?? undefined,
      paymentStatus: isFullyPaid ? 'paid' : 'partial',
      totalPaid,
      totalOwed,
      balance,
    })
  } catch (err) {
    console.error('[record-retainer-payment] Error:', err)

    if (err instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.status },
      )
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    )
  }
}

export const POST = handlePost
