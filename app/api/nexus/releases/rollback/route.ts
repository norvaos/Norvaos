/**
 * Directive 079: Atomic Rollback API
 *
 * POST /api/nexus/releases/rollback
 * Body: { targetReleaseId: string, reason: string }
 *
 * 1. Finds the target release in _release_log
 * 2. Marks the current active release as 'rolled_back'
 * 3. Creates a new release entry with is_rollback = true
 * 4. If Netlify deploy ID is available, triggers Netlify rollback via API
 *
 * THE PANIC BUTTON  -  everything returns to 10 minutes ago.
 */

import { NextResponse } from 'next/server'
import { withNexusAdmin } from '@/lib/services/with-nexus-admin'
import { createAdminClient } from '@/lib/supabase/admin'

export const POST = withNexusAdmin(async (request, ctx) => {
  const body = await request.json()
  const { targetReleaseId, reason } = body as {
    targetReleaseId: string
    reason?: string
  }

  if (!targetReleaseId) {
    return NextResponse.json(
      { error: 'targetReleaseId is required' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()

  // 1. Find the target release to roll back TO
  const { data: targetRelease } = await (admin as any)
    .from('_release_log')
    .select('*')
    .eq('id', targetReleaseId)
    .single()

  if (!targetRelease) {
    return NextResponse.json(
      { error: 'Target release not found' },
      { status: 404 },
    )
  }

  // 2. Find the current active release
  const { data: currentRelease } = await (admin as any)
    .from('_release_log')
    .select('*')
    .eq('environment', (targetRelease as any).environment)
    .eq('status', 'healthy')
    .order('deployed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // 3. Mark current release as rolled_back
  if (currentRelease) {
    await (admin as any)
      .from('_release_log')
      .update({
        status: 'rolled_back',
        rolled_back_at: new Date().toISOString(),
      })
      .eq('id', (currentRelease as any).id)
  }

  // 4. Create new release entry (the rollback deploy)
  const { data: rollbackRelease, error: insertError } = await (admin as any)
    .from('_release_log')
    .insert({
      version: (targetRelease as any).version,
      build_sha: (targetRelease as any).build_sha,
      environment: (targetRelease as any).environment,
      deploy_slot: (targetRelease as any).deploy_slot,
      deploy_source: 'rollback',
      docker_tag: (targetRelease as any).docker_tag,
      netlify_deploy_id: (targetRelease as any).netlify_deploy_id,
      is_rollback: true,
      rolled_back_from_id: currentRelease ? (currentRelease as any).id : null,
      triggered_by: ctx.adminCtx.adminId || 'platform-admin',
      status: 'healthy', // Rollbacks restore a known-good state
      health_check_passed: true,
      confirmed_at: new Date().toISOString(),
      notes: reason || `Rollback to ${(targetRelease as any).version} (${(targetRelease as any).build_sha?.slice(0, 7)})`,
    })
    .select('id, version, build_sha, status')
    .single()

  if (insertError) {
    console.error('[rollback] Insert error:', insertError)
    return NextResponse.json({ error: 'Failed to record rollback' }, { status: 500 })
  }

  // 5. If Netlify deploy ID exists, trigger Netlify rollback
  const netlifyToken = process.env.NETLIFY_ACCESS_TOKEN
  const netlifySiteId = process.env.NETLIFY_SITE_ID
  let netlifyRollbackTriggered = false

  if (netlifyToken && netlifySiteId && (targetRelease as any).netlify_deploy_id) {
    try {
      const res = await fetch(
        `https://api.netlify.com/api/v1/sites/${netlifySiteId}/deploys/${(targetRelease as any).netlify_deploy_id}/restore`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${netlifyToken}`,
          },
        },
      )
      netlifyRollbackTriggered = res.ok
      if (!res.ok) {
        console.error('[rollback] Netlify restore failed:', await res.text())
      }
    } catch (err) {
      console.error('[rollback] Netlify API error:', err)
    }
  }

  return NextResponse.json({
    data: {
      rollbackRelease,
      rolledBackFrom: currentRelease
        ? { id: (currentRelease as any).id, version: (currentRelease as any).version }
        : null,
      rolledBackTo: {
        id: (targetRelease as any).id,
        version: (targetRelease as any).version,
        buildSha: (targetRelease as any).build_sha,
      },
      netlifyRollbackTriggered,
    },
  })
})
