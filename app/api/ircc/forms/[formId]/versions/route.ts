import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'

interface RouteParams {
  params: Promise<{ formId: string }>
}

/**
 * GET /api/ircc/forms/[formId]/versions
 *
 * Returns the version history for a specific IRCC form.
 * Each version represents an archived snapshot of the form
 * before it was replaced by a newer PDF upload.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'form_packs', 'view')
    const { formId } = await params

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = createAdminClient()

    // 1. Verify form exists and belongs to tenant
    const { data: form, error: formError } = await supabase
      .from('ircc_forms')
      .select('id, form_code, current_version')
      .eq('id', formId)
      .eq('tenant_id', auth.tenantId)
      .single()

    if (formError || !form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 })
    }

    // 2. Fetch all archived versions
    const { data: versions, error: versionsError } = await supabase
      .from('ircc_form_versions')
      .select('*')
      .eq('form_id', formId)
      .order('version_number', { ascending: false })

    if (versionsError) {
      return NextResponse.json(
        { error: `Failed to fetch versions: ${(versionsError as Error).message}` },
        { status: 500 },
      )
    }

    return NextResponse.json({
      formId: form.id,
      formCode: form.form_code,
      currentVersion: form.current_version ?? 1,
      versions: versions ?? [],
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('[ircc-forms/versions] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
