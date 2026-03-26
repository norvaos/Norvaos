import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * POST /api/matters/[id]/create-jr-matter
 *
 * Creates a new Judicial Review matter linked to the source matter.
 * Auth: Lawyer or Admin only.
 *
 * Body: { matter_type_id?: string }
 *   - If omitted, searches matter_types for a name LIKE '%judicial%' or '%JR%'
 *
 * Returns: 201 with { matter_id: new_matter.id }
 */
async function handlePost(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sourceMatterId } = await params

    // 1. Authenticate + role check
    const auth = await authenticateRequest()
    const role = auth.role?.name
    if (!role || !['Lawyer', 'Admin'].includes(role)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Lawyer or Admin role required' },
        { status: 403 }
      )
    }

    // 2. Parse body
    const body = await request.json().catch(() => ({}))
    const { matter_type_id: bodyMatterTypeId } = body as { matter_type_id?: string }

    // Use admin client to bypass RLS  -  auth already verified above
    const admin = createAdminClient()

    // 3. Verify source matter belongs to tenant
    const { data: sourceMatter, error: matterErr } = await admin
      .from('matters')
      .select('id, tenant_id, title, practice_area_id, responsible_lawyer_id, originating_lawyer_id')
      .eq('id', sourceMatterId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (matterErr || !sourceMatter) {
      return NextResponse.json(
        { success: false, error: 'Matter not found or access denied' },
        { status: 404 }
      )
    }

    // 4. Resolve matter_type_id for Judicial Review
    let resolvedMatterTypeId: string | null = bodyMatterTypeId ?? null

    if (!resolvedMatterTypeId) {
      // Search for a matter type named like 'judicial review' or 'JR'
      const { data: jrTypes } = await admin
        .from('matter_types')
        .select('id, name')
        .eq('tenant_id', auth.tenantId)
        .ilike('name', '%judicial%')
        .limit(1)

      if (jrTypes && jrTypes.length > 0) {
        resolvedMatterTypeId = jrTypes[0].id
      } else {
        // Try 'JR' abbreviation
        const { data: jrTypesAlt } = await admin
          .from('matter_types')
          .select('id, name')
          .eq('tenant_id', auth.tenantId)
          .ilike('name', '%JR%')
          .limit(1)

        if (jrTypesAlt && jrTypesAlt.length > 0) {
          resolvedMatterTypeId = jrTypesAlt[0].id
        }
      }
    }

    // 5. Fetch principal applicant from source matter
    const { data: principalApplicant } = await admin
      .from('matter_people')
      .select('contact_id, first_name, last_name, email, phone')
      .eq('matter_id', sourceMatterId)
      .eq('person_role', 'principal_applicant')
      .eq('is_active', true)
      .maybeSingle()

    // 6. Create the JR matter via SECURITY DEFINER function
    // This replaces the previous createAdminClient() bypass  -  the function
    // validates role and source matter access internally, then inserts with
    // elevated privileges in a controlled way.
    const { data: newMatterJson, error: rpcErr } = await admin
      .rpc('create_judicial_review_matter', {
        p_source_matter_id: sourceMatterId,
        p_matter_type_id: resolvedMatterTypeId ?? undefined,
        p_auth_user_id: auth.authUserId,
      })

    if (rpcErr || !newMatterJson) {
      console.error('[create-jr-matter] RPC error:', rpcErr?.message)
      return NextResponse.json(
        { success: false, error: rpcErr?.message ?? 'Failed to create JR matter' },
        { status: 500 }
      )
    }

    const newMatter = { id: (newMatterJson as any).id as string }

    // 7. Create matter_intake for the new matter
    await admin.from('matter_intake').insert({
      tenant_id: auth.tenantId,
      matter_id: newMatter.id,
      intake_status: 'incomplete',
      jurisdiction: 'CA',
    })

    // 8. Carry forward principal applicant to new matter
    if (principalApplicant) {
      await admin.from('matter_people').insert({
        tenant_id: auth.tenantId,
        matter_id: newMatter.id,
        contact_id: principalApplicant.contact_id ?? null,
        person_role: 'principal_applicant',
        first_name: principalApplicant.first_name ?? '',
        last_name: principalApplicant.last_name ?? '',
        email: principalApplicant.email ?? null,
        phone: principalApplicant.phone ?? null,
      })
    }

    // 9. Update source matter: link jr_matter_id on ircc_correspondence (latest actioned refusal)
    await admin
      .from('ircc_correspondence')
      .update({ jr_matter_id: newMatter.id, updated_at: new Date().toISOString() } as any)
      .eq('matter_id', sourceMatterId)
      .eq('item_type', 'refusal')
      .eq('status', 'actioned')

    // 10. Log refusal_actions row (best-effort  -  needs correspondence_id)
    const { data: refusalCorr } = await admin
      .from('ircc_correspondence')
      .select('id')
      .eq('matter_id', sourceMatterId)
      .eq('item_type', 'refusal')
      .eq('status', 'actioned')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (refusalCorr?.id) {
      await admin.from('refusal_actions').insert({
        tenant_id: auth.tenantId,
        correspondence_id: refusalCorr.id,
        matter_id: sourceMatterId,
        action_type: 'jr_matter_created',
        performed_by: auth.userId,
        metadata: { jr_matter_id: newMatter.id },
      })
    }

    // 11. Log activity on source matter
    await admin.from('activities').insert({
      tenant_id: auth.tenantId,
      matter_id: sourceMatterId,
      activity_type: 'jr_matter_created',
      title: 'Judicial Review matter created',
      description: `JR matter created: ${newMatter.id}`,
      entity_type: 'matter',
      entity_id: sourceMatterId,
      user_id: auth.userId,
      metadata: { jr_matter_id: newMatter.id } as any,
    })

    return NextResponse.json({ matter_id: newMatter.id }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }
    console.error('[create-jr-matter] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/matters/[id]/create-jr-matter')
