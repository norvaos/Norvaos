import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'
import type { IrccFormFieldUpdate } from '@/lib/types/ircc-forms'

interface RouteParams {
  params: Promise<{ formId: string }>
}

/**
 * GET /api/ircc/forms/[formId]/fields
 *
 * Get all fields for a form, ordered by sort_order.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'form_packs', 'view')
    const { formId } = await params
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = createAdminClient()

    // Verify tenant ownership
    const { data: form } = await supabase
      .from('ircc_forms')
      .select('id')
      .eq('id', formId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (!form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 })
    }

    const { data: fields, error } = await supabase
      .from('ircc_form_fields')
      .select('*')
      .eq('form_id', formId)
      .order('sort_order', { ascending: true })

    if (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 500 })
    }

    return NextResponse.json({ fields: fields ?? [] })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('[ircc-forms/fields] GET Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}

/**
 * PATCH /api/ircc/forms/[formId]/fields
 *
 * Bulk update field mappings.
 *
 * Body: { updates: [{ fieldId: string, updates: IrccFormFieldUpdate }] }
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'form_packs', 'edit')
    const { formId } = await params
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = createAdminClient()

    // Verify tenant ownership
    const { data: form } = await supabase
      .from('ircc_forms')
      .select('id')
      .eq('id', formId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (!form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 })
    }

    const body = await request.json()
    const { updates } = body as {
      updates: Array<{ fieldId: string; updates: IrccFormFieldUpdate }>
    }

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { error: 'updates array is required' },
        { status: 400 },
      )
    }

    // Apply updates one by one (Supabase doesn't have native bulk update)
    const errors: string[] = []
    let successCount = 0

    for (const item of updates) {
      const updatePayload = {
        ...item.updates,
        // Auto-set is_mapped when profile_path is provided
        is_mapped: item.updates.profile_path ? true : (item.updates.is_mapped ?? false),
      }

      const { error } = await supabase
        .from('ircc_form_fields')
        .update(updatePayload)
        .eq('id', item.fieldId)
        .eq('form_id', formId)

      if (error) {
        errors.push(`Field ${item.fieldId}: ${(error as Error).message}`)
      } else {
        successCount++
      }
    }

    // Bump mapping_version on the form
    await supabase
      .from('ircc_forms')
      .update({
        mapping_version: `v${Date.now()}`,
      })
      .eq('id', formId)

    return NextResponse.json({
      success: errors.length === 0,
      updated: successCount,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('[ircc-forms/fields] PATCH Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
