import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { convertLeadToMatter } from '@/lib/services/lead-conversion-executor'

/**
 * POST /api/retainer/retry-conversion
 *
 * Retries lead-to-matter conversion after the user has fixed missing fields
 * (practice area, matter type, assigned lawyer). This is called from the
 * "Convert to Matter" button that appears when auto-conversion failed during
 * retainer payment or paper-signing.
 *
 * Body (JSON):
 *   - leadId: string (required)
 *   - retainerPackageId: string (required)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'leads', 'edit')
    // All reads and writes use adminClient  -  user-scoped RLS must never block
    // a legitimate conversion triggered by an authenticated, authorised user.
    const adminForReads = createAdminClient()

    const body = await request.json()
    const { leadId, retainerPackageId } = body

    if (!leadId || !retainerPackageId) {
      return NextResponse.json(
        { error: 'leadId and retainerPackageId are required' },
        { status: 400 }
      )
    }

    // Verify lead belongs to this tenant (use adminClient so RLS never hides it)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead, error: leadErr } = await (adminForReads as any)
      .from('leads')
      .select('id, contact_id, matter_type_id, practice_area_id, responsible_lawyer_id, assigned_to, person_scope, status, converted_matter_id, pipeline_id')
      .eq('id', leadId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (leadErr || !lead) {
      return NextResponse.json({ error: 'Lead not found or access denied' }, { status: 404 })
    }

    if (lead.converted_matter_id) {
      // Already converted  -  return success
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: matter } = await (adminForReads as any)
        .from('matters')
        .select('matter_number')
        .eq('id', lead.converted_matter_id)
        .single()
      return NextResponse.json({
        success: true,
        matterId: lead.converted_matter_id,
        matterNumber: matter?.matter_number ?? null,
      })
    }

    // Verify retainer package  -  use adminClient so RLS on lead_retainer_packages
    // never causes a false 404 that silently aborts the conversion.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: retainerPkg } = await (adminForReads as any)
      .from('lead_retainer_packages')
      .select('id, status, payment_status, billing_type')
      .eq('id', retainerPackageId)
      .eq('lead_id', leadId)
      .single()

    if (!retainerPkg) {
      return NextResponse.json({ error: 'Retainer package not found' }, { status: 404 })
    }

    // Build matter title from contact name + matter type
    let matterTitle = 'New Matter'
    if (lead.contact_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: contact } = await (adminForReads as any)
        .from('contacts')
        .select('first_name, last_name')
        .eq('id', lead.contact_id)
        .single()
      if (contact) {
        const name = `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim()
        if (name) matterTitle = name
      }
    }
    if (lead.matter_type_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: mt } = await (adminForReads as any)
        .from('matter_types')
        .select('name')
        .eq('id', lead.matter_type_id)
        .single()
      if (mt?.name) {
        matterTitle = `${matterTitle}  -  ${mt.name}`
      }
    }

    // Execute conversion using admin client to bypass RLS on matters INSERT
    const adminClient = createAdminClient()
    const billingType = retainerPkg.billing_type || 'flat_fee'
    const conversionResult = await convertLeadToMatter({
      supabase: adminClient,
      leadId,
      tenantId: auth.tenantId,
      userId: auth.userId,
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: matter } = await (adminForReads as any)
        .from('matters')
        .select('matter_number')
        .eq('id', conversionResult.matterId)
        .single()

      return NextResponse.json({
        success: true,
        matterId: conversionResult.matterId,
        matterNumber: matter?.matter_number ?? null,
      })
    }

    // Conversion failed  -  return structured error with all blocked reasons
    const blockedReasons: string[] = conversionResult.gateResults
      ? conversionResult.gateResults.blockedReasons
      : conversionResult.error
        ? conversionResult.error.split('\n').filter(Boolean)
        : ['Matter could not be created. Check that Practice Area, Matter Type, Responsible Lawyer, Retainer Signed, and Payment Received are all complete on this lead.']

    return NextResponse.json({
      success: true, // The API call succeeded, but conversion didn't
      matterId: null,
      matterNumber: null,
      conversionError: blockedReasons.join('\n'),
      blockedReasons,
    })
  } catch (err) {
    console.error('[retry-conversion] Error:', err)

    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
