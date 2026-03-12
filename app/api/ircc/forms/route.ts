import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { requirePermission } from '@/lib/services/require-role'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/ircc/forms
 *
 * List all IRCC forms for the current tenant.
 * Returns forms with field/section counts.
 */
export async function GET() {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'form_packs', 'view')
    const tenantId = auth.tenantId
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = createAdminClient()

    // Fetch forms
    const { data: forms, error } = await supabase
      .from('ircc_forms')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 500 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formIds = (forms as any[]).map((f: any) => f.id)

    if (formIds.length === 0) {
      return NextResponse.json({ forms: [] })
    }

    const { data: fieldCounts } = await supabase
      .from('ircc_form_fields')
      .select('form_id')
      .in('form_id', formIds)

    const { data: mappedCounts } = await supabase
      .from('ircc_form_fields')
      .select('form_id')
      .in('form_id', formIds)
      .eq('is_mapped', true)

    const { data: sectionCounts } = await supabase
      .from('ircc_form_sections')
      .select('form_id')
      .in('form_id', formIds)

    // Build count maps
    const fieldCountMap: Record<string, number> = {}
    const mappedCountMap: Record<string, number> = {}
    const sectionCountMap: Record<string, number> = {}

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (fieldCounts ?? []) as any[]) {
      fieldCountMap[row.form_id] = (fieldCountMap[row.form_id] ?? 0) + 1
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (mappedCounts ?? []) as any[]) {
      mappedCountMap[row.form_id] = (mappedCountMap[row.form_id] ?? 0) + 1
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (sectionCounts ?? []) as any[]) {
      sectionCountMap[row.form_id] = (sectionCountMap[row.form_id] ?? 0) + 1
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched = (forms as any[]).map((form: any) => ({
      ...form,
      field_count: fieldCountMap[form.id] ?? 0,
      mapped_field_count: mappedCountMap[form.id] ?? 0,
      section_count: sectionCountMap[form.id] ?? 0,
    }))

    return NextResponse.json({ forms: enriched })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('[ircc-forms] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
