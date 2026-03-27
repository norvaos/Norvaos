/**
 * Directive 079: Confirm Release Health
 *
 * POST /api/nexus/releases/confirm
 * Body: { releaseId: string }
 *
 * Called after health checks pass to mark a release as 'healthy'.
 * This is the final gate before a deploy is considered "live".
 */

import { NextResponse } from 'next/server'
import { withNexusAdmin } from '@/lib/services/with-nexus-admin'
import { createAdminClient } from '@/lib/supabase/admin'

export const POST = withNexusAdmin(async (request) => {
  const body = await request.json()
  const { releaseId } = body as { releaseId: string }

  if (!releaseId) {
    return NextResponse.json(
      { error: 'releaseId is required' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()

  const { data, error } = await (admin as any)
    .from('_release_log')
    .update({
      status: 'healthy',
      health_check_passed: true,
      health_check_at: new Date().toISOString(),
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', releaseId)
    .eq('status', 'deploying') // Only confirm releases in 'deploying' state
    .select('id, version, status')
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: 'Release not found or already confirmed' },
      { status: 404 },
    )
  }

  return NextResponse.json({ data })
})
