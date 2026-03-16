import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTiming } from '@/lib/middleware/request-timing'

/**
 * GET /api/onboarding/checklist
 *
 * Returns the hybrid onboarding checklist for the authenticated tenant.
 *
 * 4 auto-detected items: computed live from DB signals — never stored.
 * 2 manual items: fetched from tenant_onboarding_checklist table.
 *
 * Auto-detection uses the admin client to read across tables without relying
 * on RLS; the tenant scope is always enforced by tenantId from session.
 */
async function handleGet() {
  try {
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    const { tenantId } = auth

    // Fetch all signals in parallel
    const [
      practiceAreasResult,
      usersResult,
      contactsResult,
      mattersResult,
      manualResult,
    ] = await Promise.all([
      // practice_areas_configured: ≥1 practice area is enabled
      admin
        .from('practice_areas')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('is_enabled', true),

      // team_member_added: ≥2 active users (owner + at least one more)
      admin
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('is_active', true),

      // first_contact_created: ≥1 active contact
      admin
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('is_active', true),

      // first_matter_created: ≥1 matter (any status except import_reverted)
      admin
        .from('matters')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .neq('status', 'import_reverted'),

      // Manual completions stored in tenant_onboarding_checklist
      admin
        .from('tenant_onboarding_checklist')
        .select('item_key, completed_at, completed_by')
        .eq('tenant_id', tenantId),
    ])

    const manualMap = new Map<string, { completed_at: string; completed_by: string | null }>()
    for (const row of manualResult.data ?? []) {
      manualMap.set(row.item_key, {
        completed_at: row.completed_at,
        completed_by: row.completed_by,
      })
    }

    const checklist = [
      // ── Auto-detected ──────────────────────────────────────────────────────
      {
        key: 'practice_areas_configured',
        label: 'Configure practice areas',
        description: 'Enable at least one practice area for your firm.',
        type: 'auto' as const,
        completed: (practiceAreasResult.count ?? 0) >= 1,
        completed_at: null,
        completed_by: null,
        link: '/settings/practice-areas',
      },
      {
        key: 'team_member_added',
        label: 'Add a team member',
        description: 'Invite at least one colleague to join your workspace.',
        type: 'auto' as const,
        completed: (usersResult.count ?? 0) >= 2,
        completed_at: null,
        completed_by: null,
        link: '/settings/users',
      },
      {
        key: 'first_contact_created',
        label: 'Create your first contact',
        description: 'Add a client or contact to get started.',
        type: 'auto' as const,
        completed: (contactsResult.count ?? 0) >= 1,
        completed_at: null,
        completed_by: null,
        link: '/contacts',
      },
      {
        key: 'first_matter_created',
        label: 'Open your first matter',
        description: 'Create your first legal matter.',
        type: 'auto' as const,
        completed: (mattersResult.count ?? 0) >= 1,
        completed_at: null,
        completed_by: null,
        link: '/matters',
      },
      // ── Manual ─────────────────────────────────────────────────────────────
      {
        key: 'billing_configured',
        label: 'Set up billing',
        description: 'Configure your billing settings and connect a payment method.',
        type: 'manual' as const,
        completed: manualMap.has('billing_configured'),
        completed_at: manualMap.get('billing_configured')?.completed_at ?? null,
        completed_by: manualMap.get('billing_configured')?.completed_by ?? null,
        link: '/settings/billing',
      },
      {
        key: 'firm_profile_reviewed',
        label: 'Review firm profile',
        description: 'Confirm your firm name, logo, and contact details are correct.',
        type: 'manual' as const,
        completed: manualMap.has('firm_profile_reviewed'),
        completed_at: manualMap.get('firm_profile_reviewed')?.completed_at ?? null,
        completed_by: manualMap.get('firm_profile_reviewed')?.completed_by ?? null,
        link: '/settings/firm',
      },
    ]

    const completedCount = checklist.filter((i) => i.completed).length

    return NextResponse.json({
      checklist,
      summary: {
        total: checklist.length,
        completed: completedCount,
        percent: Math.round((completedCount / checklist.length) * 100),
      },
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
  }
}

export const GET = withTiming(handleGet, 'GET /api/onboarding/checklist')
