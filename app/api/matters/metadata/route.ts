import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { withTiming } from '@/lib/middleware/request-timing'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/matters/metadata
 *
 * Unified endpoint that returns all dropdown data needed by the MatterForm
 * in a single request: practice areas, matter types, case types, fee templates,
 * staff members, and pipeline stages.
 *
 * Replaces 5+ individual TanStack Query fetches on the client with 1 call.
 */
async function handleGet() {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    const tid = auth.tenantId

    // Fire all queries in parallel
    const [
      practiceAreasRes,
      matterTypesRes,
      feeTemplatesRes,
      staffRes,
      pipelinesRes,
    ] = await Promise.all([
      admin
        .from('practice_areas')
        .select('id, name, color, is_enabled')
        .eq('tenant_id', tid)
        .eq('is_enabled', true)
        .order('name'),

      admin
        .from('matter_types')
        .select('id, name, practice_area_id, enforcement_enabled, has_ircc_forms, color, icon, program_category_key')
        .eq('tenant_id', tid)
        .eq('is_active', true)
        .order('sort_order'),

      admin
        .from('retainer_fee_templates')
        .select('id, name, billing_type, practice_area_id, matter_type_id, professional_fees, government_fees, disbursements, hst_applicable')
        .eq('tenant_id', tid)
        .eq('is_active', true)
        .order('name'),

      admin
        .from('users')
        .select('id, first_name, last_name, email, role_id')
        .eq('tenant_id', tid)
        .eq('is_active', true)
        .order('first_name'),

      admin
        .from('matter_stage_pipelines')
        .select('id, name, matter_type_id, is_default, matter_stages(id, name, sort_order, color, icon)')
        .eq('tenant_id', tid)
        .eq('is_active', true)
        .order('name'),
    ])

    return NextResponse.json({
      practice_areas: practiceAreasRes.data ?? [],
      matter_types: matterTypesRes.data ?? [],
      fee_templates: feeTemplatesRes.data ?? [],
      staff: staffRes.data ?? [],
      pipelines: pipelinesRes.data ?? [],
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Matter metadata error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/matters/metadata')
