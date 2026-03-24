import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermission } from '@/lib/services/require-role'
import { withTiming } from '@/lib/middleware/request-timing'
import {
  IMMIGRATION_SERVICE_PRESETS,
  GOVERNMENT_FEE_PRESETS,
  DISBURSEMENT_PRESETS,
} from '@/lib/utils/constants'

/**
 * POST /api/settings/retainer-presets/seed-defaults
 *
 * Idempotent operation: inserts default retainer presets for the current tenant.
 * Uses ON CONFLICT DO NOTHING to skip any presets that already exist.
 * Safe to call multiple times and for new tenants.
 *
 * Requires: settings:edit permission (Phase 7 Fix 1).
 */
async function handlePost() {
  try {
    const auth = await authenticateRequest()
    requirePermission(auth, 'settings', 'edit')

    const admin = createAdminClient()
    const tenantId = auth.tenantId

    // Build insert rows from all three preset categories
    const rows: {
      tenant_id: string
      category: string
      name: string
      amount: number
      currency: string
      sort_order: number
    }[] = []

    // Professional services — amounts are stored as whole dollars in constants, convert to cents
    IMMIGRATION_SERVICE_PRESETS.forEach((p, i) => {
      rows.push({
        tenant_id: tenantId,
        category: 'professional_services',
        name: p.description,
        amount: p.unitPrice * 100, // dollars → cents
        currency: 'CAD',
        sort_order: i,
      })
    })

    // Government fees — amounts are whole dollars
    GOVERNMENT_FEE_PRESETS.forEach((p, i) => {
      rows.push({
        tenant_id: tenantId,
        category: 'government_fees',
        name: p.description,
        amount: p.amount * 100, // dollars → cents
        currency: 'CAD',
        sort_order: i,
      })
    })

    // Disbursements — amounts are whole dollars
    DISBURSEMENT_PRESETS.forEach((p, i) => {
      rows.push({
        tenant_id: tenantId,
        category: 'disbursements',
        name: p.description,
        amount: p.amount * 100, // dollars → cents
        currency: 'CAD',
        sort_order: i,
      })
    })

    // Use upsert with ignoreDuplicates to make this idempotent.
    // The unique index on (tenant_id, category, lower(name)) WHERE is_active = TRUE
    // prevents duplicates. Supabase upsert with ignoreDuplicates skips conflicts.
    const { data, error } = await admin
      .from('retainer_presets')
      .upsert(rows, {
        onConflict: 'tenant_id,category,lower(name)',
        ignoreDuplicates: true,
      })
      .select('id')

    if (error) {
      // If the upsert approach fails due to partial index, fall back to individual inserts
      let inserted = 0
      for (const row of rows) {
        const { error: insertError } = await admin
          .from('retainer_presets')
          .insert(row)

        if (!insertError) {
          inserted++
        }
        // 23505 = unique violation → preset already exists, skip silently
      }

      // Audit log
      await admin.from('activities').insert({
        tenant_id: tenantId,
        activity_type: 'retainer_defaults_loaded',
        title: 'Default retainer presets loaded',
        description: `Inserted ${inserted} default preset(s)`,
        entity_type: 'retainer_preset',
        entity_id: tenantId,
        user_id: auth.userId,
        metadata: { count_inserted: inserted, tenant_id: tenantId },
      })

      return NextResponse.json({ success: true, count_inserted: inserted })
    }

    const countInserted = data?.length ?? 0

    // Audit log
    await admin.from('activities').insert({
      tenant_id: tenantId,
      activity_type: 'retainer_defaults_loaded',
      title: 'Default retainer presets loaded',
      description: `Inserted ${countInserted} default preset(s)`,
      entity_type: 'retainer_preset',
      entity_id: tenantId,
      user_id: auth.userId,
      metadata: { count_inserted: countInserted, tenant_id: tenantId },
    })

    return NextResponse.json({ success: true, count_inserted: countInserted })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('Seed defaults error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withTiming(handlePost, 'POST /api/settings/retainer-presets/seed-defaults')
