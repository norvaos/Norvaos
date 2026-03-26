import { NextResponse } from 'next/server'
import { authenticateRequest, AuthError } from '@/lib/services/auth'
import { withTiming } from '@/lib/middleware/request-timing'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/admin/form-generation-jobs/stuck
 *
 * Returns stuck (pending or processing) form generation jobs older than 5 minutes
 * for the current tenant. Admin-only.
 *
 * Auth: Admin role required.
 * Scope: tenant-scoped (auth.tenantId + RLS).
 *
 * Returns: { jobs: [{ id, matter_id, form_template_id, status, retry_count,
 *                     created_at, processing_started_at, error_message }] }
 *
 * Sprint 6, Week 3  -  2026-03-17
 */
async function handleGet(_request: Request) {
  try {
    // 1. Auth + Admin-only role check
    const auth = await authenticateRequest()
    const admin = createAdminClient()
    const role = auth.role?.name

    if (role !== 'Admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Admin role required' },
        { status: 403 }
      )
    }

    // 2. Query stuck jobs (pending or processing) older than 5 minutes, scoped to tenant
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: jobs, error: queryErr } = await (admin as any)
      .from('form_generation_log')
      .select(
        'id, matter_id, form_template_id, status, retry_count, created_at, processing_started_at, error_message'
      )
      .eq('tenant_id', auth.tenantId)
      .in('status', ['pending', 'processing'])
      .lt('created_at', fiveMinutesAgo)
      .order('created_at', { ascending: true })

    if (queryErr) {
      console.error('[admin/form-generation-jobs/stuck] Query error:', queryErr.message)
      return NextResponse.json(
        { success: false, error: 'Failed to query stuck jobs' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { jobs: jobs ?? [] },
      { status: 200 }
    )
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }
    console.error('[admin/form-generation-jobs/stuck] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const GET = withTiming(handleGet, 'GET /api/admin/form-generation-jobs/stuck')
