import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import type { IrccFormUpdate } from '@/lib/types/ircc-forms'

interface RouteParams {
  params: Promise<{ formId: string }>
}

/**
 * GET /api/ircc/forms/[formId]
 *
 * Get a single IRCC form with its fields, sections, and array maps.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'form_packs', 'view')
    const { formId } = await params
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = createAdminClient()

    // Fetch form
    const { data: form, error: formError } = await supabase
      .from('ircc_forms')
      .select('*')
      .eq('id', formId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (formError || !form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 })
    }

    // Fetch related data in parallel
    const [fieldsResult, sectionsResult, arrayMapsResult] = await Promise.all([
      supabase
        .from('ircc_form_fields')
        .select('*')
        .eq('form_id', formId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('ircc_form_sections')
        .select('*')
        .eq('form_id', formId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('ircc_form_array_maps')
        .select('*')
        .eq('form_id', formId),
    ])

    return NextResponse.json({
      form,
      fields: fieldsResult.data ?? [],
      sections: sectionsResult.data ?? [],
      array_maps: arrayMapsResult.data ?? [],
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('[ircc-forms/[formId]] GET Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}

/**
 * PATCH /api/ircc/forms/[formId]
 *
 * Update form metadata (name, description, active status, etc.)
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'form_packs', 'edit')
    const { formId } = await params
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = createAdminClient()

    const body = (await request.json()) as IrccFormUpdate

    // Verify ownership
    const { data: existing } = await supabase
      .from('ircc_forms')
      .select('id')
      .eq('id', formId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 })
    }

    const { data: updated, error } = await supabase
      .from('ircc_forms')
      .update(body)
      .eq('id', formId)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 500 })
    }

    return NextResponse.json({ form: updated })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('[ircc-forms/[formId]] PATCH Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}

/**
 * DELETE /api/ircc/forms/[formId]
 *
 * Delete a form and all its fields/sections/array maps (via CASCADE).
 * Also removes the template from Supabase Storage.
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'form_packs', 'edit')
    const { formId } = await params
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = createAdminClient()

    // Get form to find storage path
    const { data: form } = await supabase
      .from('ircc_forms')
      .select('id, storage_path')
      .eq('id', formId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (!form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 })
    }

    // Delete storage file (non-blocking — don't fail if storage delete fails)
    if (form.storage_path) {
      await supabase.storage
        .from('documents')
        .remove([form.storage_path])
        .catch((err: Error) => {
          console.warn('[ircc-forms/delete] Storage cleanup failed:', err.message)
        })
    }

    // Delete form record (cascades to fields, sections, array_maps, stream_forms)
    const { error } = await supabase
      .from('ircc_forms')
      .delete()
      .eq('id', formId)

    if (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('[ircc-forms/[formId]] DELETE Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
