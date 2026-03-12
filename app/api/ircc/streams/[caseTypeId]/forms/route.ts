import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'

interface RouteParams {
  params: Promise<{ caseTypeId: string }>
}

/**
 * GET /api/ircc/streams/[caseTypeId]/forms
 *
 * Get all forms assigned to a case type (immigration stream),
 * ordered by sort_order. Includes full form details.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'form_packs', 'view')
    const { caseTypeId } = await params
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = createAdminClient()

    // Verify the case type belongs to this tenant
    const { data: caseType } = await supabase
      .from('immigration_case_types')
      .select('id')
      .eq('id', caseTypeId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (!caseType) {
      return NextResponse.json({ error: 'Case type not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('ircc_stream_forms')
      .select('*, form:ircc_forms(*)')
      .eq('case_type_id', caseTypeId)
      .order('sort_order', { ascending: true })

    if (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 500 })
    }

    return NextResponse.json({ stream_forms: data ?? [] })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('[ircc-streams/forms] GET Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}

/**
 * POST /api/ircc/streams/[caseTypeId]/forms
 *
 * Add a form to a case type stream.
 *
 * Body: { form_id: string, sort_order?: number, is_required?: boolean }
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'form_packs', 'create')
    const { caseTypeId } = await params
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = createAdminClient()

    const body = await request.json()
    const { form_id, sort_order, is_required } = body as {
      form_id?: string
      sort_order?: number
      is_required?: boolean
    }

    if (!form_id) {
      return NextResponse.json({ error: 'form_id is required' }, { status: 400 })
    }

    // Verify case type belongs to tenant
    const { data: caseType } = await supabase
      .from('immigration_case_types')
      .select('id')
      .eq('id', caseTypeId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (!caseType) {
      return NextResponse.json({ error: 'Case type not found' }, { status: 404 })
    }

    // Verify form belongs to tenant
    const { data: form } = await supabase
      .from('ircc_forms')
      .select('id')
      .eq('id', form_id)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (!form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 })
    }

    // Insert stream-form assignment
    const { data: streamForm, error } = await supabase
      .from('ircc_stream_forms')
      .insert({
        tenant_id: auth.tenantId,
        case_type_id: caseTypeId,
        form_id,
        sort_order: sort_order ?? 0,
        is_required: is_required ?? true,
      })
      .select('*, form:ircc_forms(*)')
      .single()

    if (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((error as any).code === '23505') {
        return NextResponse.json(
          { error: 'This form is already assigned to this stream' },
          { status: 409 },
        )
      }
      return NextResponse.json({ error: (error as Error).message }, { status: 500 })
    }

    return NextResponse.json({ stream_form: streamForm }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('[ircc-streams/forms] POST Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}

/**
 * DELETE /api/ircc/streams/[caseTypeId]/forms
 *
 * Remove a form from a case type stream.
 *
 * Body: { stream_form_id: string }
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'form_packs', 'edit')
    const { caseTypeId } = await params
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = createAdminClient()

    const body = await request.json()
    const { stream_form_id } = body as { stream_form_id?: string }

    if (!stream_form_id) {
      return NextResponse.json({ error: 'stream_form_id is required' }, { status: 400 })
    }

    // Verify ownership via tenant
    const { data: existing } = await supabase
      .from('ircc_stream_forms')
      .select('id')
      .eq('id', stream_form_id)
      .eq('case_type_id', caseTypeId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Stream form assignment not found' }, { status: 404 })
    }

    const { error } = await supabase
      .from('ircc_stream_forms')
      .delete()
      .eq('id', stream_form_id)

    if (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('[ircc-streams/forms] DELETE Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
